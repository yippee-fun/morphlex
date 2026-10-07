import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_TEXT_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_TEXT_SEED_START set to it and MORPHLEX_FUZZ_TEXT_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_TEXT_SEED_START", 0x7e01)

// Rows that are identical until the user types in them. The target changes a row by adding a class to `changed`, and
// can replace a removed row with `renamed`, which has the row's outline but can't take its place.
const ROWS: Array<{ html: string; changed: string; renamed?: string }> = [
	{ html: `<input name="t[]">`, changed: `<input name="t[]" class="changed">`, renamed: `<input name="r[]">` },
	{
		html: `<textarea name="a[]"></textarea>`,
		changed: `<textarea name="a[]" class="changed"></textarea>`,
		renamed: `<textarea name="r[]"></textarea>`,
	},
	{ html: `<div><input class="q"></div>`, changed: `<div class="changed"><input class="q"></div>` },
	{ html: `<label><input class="q"></label>`, changed: `<label class="changed"><input class="q"></label>` },
	{ html: `<div><input class="q"><p>x</p></div>`, changed: `<div class="changed"><input class="q"><p>x</p></div>` },
]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz keeps typed text in its own box when identical rows change or go around it", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const scenario = createScenario(seed)
		const from = parse(scenario.from)
		document.body.append(from)

		try {
			const controls = [...from.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
			scenario.typed.forEach((text, i) => {
				if (text) controls[i]!.value = text
			})

			morph(from, parse(scenario.to), { preserveChanges: true })

			const message = `seed ${seed}\n${scenario.from}\n${scenario.to}\ntyped ${JSON.stringify(scenario.typed)}`
			const after = [...from.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")]
			if (scenario.removed.includes(true)) {
				// Identical untouched rows are interchangeable, so any of them can go, but every typed box stays, in order.
				const typed = controls.filter((control) => control.value)
				expect(
					after.filter((control) => control.value),
					message,
				).toEqual(typed)
				expect(after.length, message).toBe(
					controls.length - scenario.removed.filter(Boolean).length + scenario.renamed.filter(Boolean).length,
				)
			} else {
				expect(
					after.map((control) => control.value),
					message,
				).toEqual(scenario.typed)
				for (let i = 0; i < controls.length; i++) {
					if (scenario.typed[i]) expect(after[i], message).toBe(controls[i])
				}
			}
			expect(from.outerHTML, message).toBe(parse(scenario.to.replaceAll(" morphlex-clobber", "")).outerHTML)
		} finally {
			from.remove()
		}
	}
})

// A list of rows of one or two kinds, some holding typed text, and a target giving some rows a class, removing or
// clobbering some untouched rows, renaming some removed ones, and adding or removing paragraphs between them. Every typed row stays, so each typed
// text has one box it belongs in.
function createScenario(seed: number) {
	const random = createRandom(seed)
	const kinds = [pick(random, ROWS), pick(random, ROWS)]
	const rows = Array.from({ length: randomInt(random, 2, 6) }, () => pick(random, kinds))
	const typed = rows.map((_, i) => (random() < 0.5 ? `typed ${i}` : ""))
	const changed = rows.map(() => random() < 0.3)
	const removed = typed.map((text) => !text && random() < 0.3)
	const clobbered = typed.map((text) => !text && random() < 0.15)
	const renamed = rows.map((row, i) => removed[i]! && row.renamed !== undefined && random() < 0.5)
	const join = random() < 0.5 ? "\n" : ""

	const render = (isTarget: boolean) => {
		const nodes: Array<string> = []
		rows.forEach((row, i) => {
			if (random() < 0.2) nodes.push(`<p>${isTarget ? "new" : "old"}</p>`)
			if (!isTarget) nodes.push(row.html)
			else if (renamed[i]) nodes.push(row.renamed!)
			else if (!removed[i]) nodes.push(clobber(changed[i] ? row.changed : row.html, clobbered[i]!))
		})
		return `<form>${nodes.join(join)}</form>`
	}

	return { from: render(false), to: render(true), typed, removed, renamed }
}

// Adds `morphlex-clobber` to a row's first element.
function clobber(html: string, clobbered: boolean): string {
	return clobbered ? html.replace(/^<(\w+)/, "<$1 morphlex-clobber") : html
}

function parse(html: string): HTMLFormElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLFormElement
}

function pick<T>(random: Random, values: ReadonlyArray<T>): T {
	return values[Math.floor(random() * values.length)]!
}

function randomInt(random: Random, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
}

function createRandom(seed: number): Random {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

function readPositiveIntEnv(name: string, fallback: number): number {
	const value = globalThis.process?.env?.[name] ?? import.meta.env[`VITE_${name}`]
	const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
