import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number
type Kind = "radio" | "checkbox" | "select" | "multiple"

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_CHOICE_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_CHOICE_SEED_START set to it and MORPHLEX_FUZZ_CHOICE_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_CHOICE_SEED_START", 0xc401)
const KINDS: Array<Kind> = ["radio", "checkbox", "select", "multiple"]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz keeps each choice the user made with its value when items are added, removed or moved", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const scenario = createScenario(seed)
		const from = parse(scenario.from)
		document.body.append(from)

		try {
			scenario.interact(from)
			const before = new FormData(from).getAll("g")
			morph(from, parse(scenario.to), { preserveChanges: true })
			const message = `seed ${seed}\n${scenario.from}\n${scenario.to}`
			expect(new FormData(from).getAll("d"), message).toEqual(scenario.decoy)
			const expected = scenario.expect(before as Array<string>)
			if (expected !== undefined) expect(new FormData(from).getAll("g"), message).toEqual(expected)
		} finally {
			from.remove()
		}
	}
})

function createScenario(seed: number) {
	const random = createRandom(seed)
	const kind = KINDS[Math.floor(random() * KINDS.length)]!
	const fromValues = Array.from({ length: randomInt(random, 2, 5) }, (_, i) => `v${i}`)
	const wrapped = new Set(fromValues.filter(() => random() < 0.3))
	const defaults = new Set(fromValues.filter(() => random() < (kind === "radio" || kind === "select" ? 0.2 : 0.4)))
	if (kind === "radio" || kind === "select") keepLast(defaults)

	const toValues = fromValues.filter(() => random() > 0.25)
	const added: Array<string> = []
	for (let i = randomInt(random, 0, 2); i > 0; i--) {
		const value = `n${i}`
		added.push(value)
		toValues.splice(randomInt(random, 0, toValues.length), 0, value)
		if (random() < 0.3) wrapped.add(value)
	}
	if (random() < 0.3) shuffle(random, toValues)
	// Only checkboxes may add a checked item: adding a checked radio or selected option takes over the user's pick.
	const addedDefaults = new Set(kind === "checkbox" ? added.filter(() => random() < 0.4) : [])
	const classed = new Set(toValues.filter(() => random() < 0.3))

	const toggles = fromValues.filter(() => random() < 0.5)
	// Picking the default again marks it as changed in the browser, which morphlex can't see, so pick another.
	// A drop-down with no selected option shows its first one.
	const implicit = kind === "select" && defaults.size === 0 ? fromValues[0] : undefined
	const pickable = fromValues.filter((value) => !defaults.has(value) && value !== implicit)
	const pick = pickable[randomInt(random, 0, pickable.length - 1)]!

	// An untouched group with the same values and another name, which the target may add or move before the user's group.
	const decoy = random() < 0.4
	const decoyFirst = random() < 0.5
	const decoyAdded = random() < 0.5
	// Both groups may sit in anonymous wrappers, and the target may change the user's one.
	const boxed = random() < 0.5
	const boxChanged = random() < 0.5

	const group = (
		name: string,
		values: Array<string>,
		isDefault: (value: string) => boolean,
		hasClass: (value: string) => boolean,
	) => {
		const items = values.map((value) => item(kind, name, value, isDefault(value), hasClass(value), wrapped.has(value)))
		if (kind === "select" || kind === "multiple") {
			return `<select name="${name}"${kind === "multiple" ? " multiple" : ""}>${items.join("")}</select>`
		}
		return name === "g" || boxed ? items.join("") : `<fieldset>${items.join("")}</fieldset>`
	}
	const box = (html: string, changed: boolean) => (boxed ? `<div${changed ? ' class="changed"' : ""}>${html}</div>` : html)

	const render = (
		values: Array<string>,
		isDefault: (value: string) => boolean,
		hasClass: (value: string) => boolean,
		isTarget: boolean,
	) => {
		const groups = [box(group("g", values, isDefault, hasClass), isTarget && boxChanged)]
		if (decoy && (isTarget || !decoyAdded)) {
			const decoyGroup = box(
				group(
					"d",
					fromValues,
					() => false,
					() => false,
				),
				false,
			)
			if (isTarget && decoyFirst) groups.unshift(decoyGroup)
			else groups.push(decoyGroup)
		}
		return `<form>${groups.join("")}</form>`
	}

	return {
		kind,
		decoy: decoy ? (kind === "select" ? [fromValues[0]!] : []) : [],
		from: render(
			fromValues,
			(value) => defaults.has(value),
			() => false,
			false,
		),
		to: render(
			toValues,
			(value) => defaults.has(value) || addedDefaults.has(value),
			(value) => classed.has(value),
			true,
		),
		interact(form: HTMLFormElement) {
			if (kind === "radio") {
				form.querySelector<HTMLInputElement>(`input[name="g"][value="${pick}"]`)!.checked = true
			} else if (kind === "checkbox") {
				for (const value of toggles) {
					const input = form.querySelector<HTMLInputElement>(`input[name="g"][value="${value}"]`)!
					input.checked = !input.checked
				}
			} else if (kind === "select") {
				form.querySelector<HTMLSelectElement>('select[name="g"]')!.value = pick
			} else {
				for (const value of toggles) {
					const option = form.querySelector<HTMLOptionElement>(`select[name="g"] option[value="${value}"]`)!
					option.selected = !option.selected
				}
			}
		},
		expect(before: Array<string>): Array<string> | undefined {
			if (kind === "radio" || kind === "select") {
				if (toValues.includes(pick)) return [pick]
				// When the user's pick is gone, a drop-down falls back to what the browser picks.
				return kind === "radio" ? [] : undefined
			}
			return toValues.filter((value) => (fromValues.includes(value) ? before.includes(value) : addedDefaults.has(value)))
		},
	}
}

function item(kind: Kind, name: string, value: string, isDefault: boolean, hasClass: boolean, wrapped: boolean): string {
	const attributes = `value="${value}"${isDefault ? (kind === "radio" || kind === "checkbox" ? " checked" : " selected") : ""}${hasClass ? ' class="changed"' : ""}`
	if (kind === "select" || kind === "multiple") return `<option ${attributes}>${value}</option>`
	const input = `<input type="${kind}" name="${name}" ${attributes}>`
	return wrapped ? `<label>${input}<b>${value}</b></label>` : input
}

function parse(html: string): HTMLFormElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLFormElement
}

function keepLast(values: Set<string>): void {
	const last = Array.from(values).pop()
	values.clear()
	if (last) values.add(last)
}

function shuffle<T>(random: Random, values: Array<T>): void {
	for (let i = values.length - 1; i > 0; i--) {
		const j = randomInt(random, 0, i)
		;[values[i], values[j]] = [values[j]!, values[i]!]
	}
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
