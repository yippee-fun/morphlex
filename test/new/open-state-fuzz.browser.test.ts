import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_OPEN_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_OPEN_SEED_START set to it and MORPHLEX_FUZZ_OPEN_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_OPEN_SEED_START", 0x0be1)

// Rows holding one `details` or `dialog`, identical until the user opens or closes it. `$` is the row's text, and the
// target changes a row by adding a class to its first element.
const ROWS: ReadonlyArray<string> = [
	`<details><summary>$</summary>body</details>`,
	`<details open><summary>$</summary>body</details>`,
	`<dialog>$</dialog>`,
	`<dialog open>$</dialog>`,
	`<div><details><summary>$</summary></details></div>`,
	`<div><p>$</p><dialog open>x</dialog></div>`,
]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz keeps the open state the user chose on its own details or dialog", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const scenario = createScenario(seed)
		const from = parse(scenario.from)
		document.body.append(from)

		try {
			const items = [...from.querySelectorAll<HTMLDetailsElement | HTMLDialogElement>("details, dialog")]
			scenario.toggled.forEach((toggled, i) => {
				if (toggled) toggle(items[i]!)
			})
			const states = items.map((item) => item.open)
			// After the user's toggles, a row can be identical to an untouched one, which is then just as much its own.
			const rows = [...from.children].filter((row) => row.localName !== "p")
			const hasTwin = (i: number) => rows.some((row, j) => j !== i && !scenario.toggled[j] && row.isEqualNode(rows[i]!))

			morph(from, parse(scenario.to), { preserveChanges: true })

			const message = `seed ${seed}\n${scenario.from}\n${scenario.to}\ntoggled ${JSON.stringify(scenario.toggled)}`
			const after = [...from.querySelectorAll<HTMLDetailsElement | HTMLDialogElement>("details, dialog")]
			// A kept item keeps its own state, which preserveChanges never changes, and a new item has its markup's, unless
			// it reuses the item of a removed row, which keeps that one's state.
			const target = parse(scenario.to)
			const reuses = scenario.removed.includes(true)
			const expected = scenario.sources.map((source, i) => {
				if (source !== null) return states[source]!
				return reuses ? after[i]!.open : target.querySelectorAll("details, dialog")[i]!.hasAttribute("open")
			})
			expect(
				after.map((item) => item.open),
				message,
			).toEqual(expected)
			// Untouched items are interchangeable with their identical twins, but each item the user toggled stays.
			scenario.sources.forEach((source, i) => {
				if (source !== null && scenario.toggled[source] && !hasTwin(source)) expect(after[i], message).toBe(items[source])
			})
			expect(withoutOpen(from), message).toBe(withoutOpen(target))
		} finally {
			for (const dialog of from.querySelectorAll("dialog")) dialog.close()
			from.remove()
		}
	}
})

// A list of rows of one or two kinds with one of two texts, some opened or closed by the user, and a target giving
// some rows a class, removing some untouched rows, adding new rows before others, and adding or removing paragraphs.
// `sources` gives, for each item in the target, the live item it keeps, or null for a new one.
function createScenario(seed: number) {
	const random = createRandom(seed)
	const kinds = [pick(random, ROWS), pick(random, ROWS)]
	const rows = Array.from({ length: randomInt(random, 2, 6) }, () => pick(random, kinds).replace("$", pick(random, ["a", "b"])))
	const toggled = rows.map(() => random() < 0.4)
	const changed = rows.map(() => random() < 0.3)
	// Which of two rows differing only in their open state the user toggled can't be told, so only a row without such a
	// twin goes.
	const closed = rows.map((row) => row.replace(" open", ""))
	const removed = toggled.map(
		(toggled, i) => !toggled && closed.indexOf(closed[i]!) === closed.lastIndexOf(closed[i]!) && random() < 0.3,
	)
	const added = rows.map(() => (random() < 0.25 ? pick(random, kinds).replace("$", "new") : null))
	const join = random() < 0.5 ? "\n" : ""

	const sources: Array<number | null> = []
	const render = (isTarget: boolean) => {
		const nodes: Array<string> = []
		rows.forEach((row, i) => {
			if (random() < 0.2) nodes.push(`<p>${isTarget ? "new" : "old"}</p>`)
			if (!isTarget) {
				nodes.push(row)
				return
			}
			if (added[i]) {
				nodes.push(added[i]!)
				sources.push(null)
			}
			if (!removed[i]) {
				nodes.push(changed[i] ? row.replace(/^<(\w+)/, `<$1 class="changed"`) : row)
				sources.push(i)
			}
		})
		return `<section>${nodes.join(join)}</section>`
	}

	return { from: render(false), to: render(true), toggled, removed, sources }
}

function toggle(item: HTMLDetailsElement | HTMLDialogElement): void {
	if (item instanceof HTMLDetailsElement) item.open = !item.open
	else if (item.open) item.close()
	else item.show()
}

// The markup with the open state left out, which preserveChanges keeps as the user left it.
function withoutOpen(element: Element): string {
	const clone = element.cloneNode(true) as Element
	for (const item of clone.querySelectorAll("[open]")) item.removeAttribute("open")
	return clone.outerHTML
}

function parse(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
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
