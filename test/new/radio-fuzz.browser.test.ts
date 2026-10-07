import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number
type Input = { id: string; type: string; name: string; checked: boolean; form: boolean; formId: string }

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_RADIO_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_RADIO_SEED_START set to it and MORPHLEX_FUZZ_RADIO_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_RADIO_SEED_START", 0x4ad1)

// Inputs matched by id can change type, name and checkedness, so a radio can join or leave a group.
const TYPES = ["radio", "radio", "checkbox", "text"]
const NAMES = ["g", "h", ""]
const IDS = ["a", "b", "c", "d"]
// A `form` attribute names a form that may only be in one tree, so changing or adding the form moves the radio to another group.
const FORM_IDS = ["", "", "", "f1", "f2"]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz leaves radios outside the morph checked unless the morph checks a radio in their group", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const scenario = createScenario(seed)
		const host = document.createElement("div")
		host.innerHTML = scenario.from
		const expectedHost = document.createElement("div")
		document.body.append(host, expectedHost)

		try {
			const outside = [...host.querySelectorAll<HTMLInputElement>(":scope > input")]
			const before = outside.map((radio) => radio.checked)
			const root = host.querySelector("#root")!
			morph(root, scenario.to, { preserveChanges: scenario.preserveChanges })

			const message = `seed ${seed}\n${scenario.from}\n${scenario.to}\npreserveChanges ${scenario.preserveChanges}`
			// Without preserveChanges, each control in the morph is as its markup says, with the last radio the markup checks
			// in each group checked. (With it, a radio that another radio unchecked may be one the user unchecked.)
			if (!scenario.preserveChanges) {
				// Radios only form groups in a document or shadow root, so parse the target in one, apart from the radios outside.
				const shadow = expectedHost.attachShadow({ mode: "open" })
				shadow.innerHTML = scenario.to
				// The parser checks a radio in the group it's in at that point, before a later form takes it to another group,
				// so check them again in their final groups, where the last one wins.
				for (const input of shadow.querySelectorAll<HTMLInputElement>("input[checked]")) input.checked = true
				expect(checkedIds(root), message).toEqual(checkedIds(shadow))
			}

			const inside = [...root.querySelectorAll("input")]
			// The parser can already have unchecked one, for a later radio in its group, and the morph never checks it.
			outside.forEach((radio, i) => {
				const taken = inside.some(
					(input) => input.type === "radio" && input.name === radio.name && input.form === null && input.checked,
				)
				expect(radio.checked, `${message}\noutside radio ${radio.name}`).toBe(before[i] && !taken)
			})
		} finally {
			host.remove()
			expectedHost.remove()
		}
	}
})

// A list of inputs, some in forms, between two checked radios outside the morph, and a target that keeps, drops,
// reorders and adds inputs by id, changing their type, name, checkedness and `form` attribute. Each side can end
// with an empty form with an id, which the target can change.
function createScenario(seed: number) {
	const random = createRandom(seed)
	const from = shuffle(random, IDS).slice(0, randomInt(random, 1, IDS.length))
	const to = shuffle(random, IDS).slice(0, randomInt(random, 1, IDS.length))
	const outside = (name: string) => `<input type="radio" name="${name}" checked>`

	return {
		preserveChanges: random() < 0.5,
		from: `${outside("g")}<div id="root">${from.map((id) => serialize(createInput(random, id))).join("")}${createForm(random)}</div>${outside("h")}`,
		to: `<div id="root">${to.map((id) => serialize(createInput(random, id))).join("")}${createForm(random)}</div>`,
	}
}

function createInput(random: Random, id: string): Input {
	return {
		id,
		type: pick(random, TYPES),
		name: pick(random, NAMES),
		checked: random() < 0.5,
		form: random() < 0.2,
		formId: pick(random, FORM_IDS),
	}
}

function createForm(random: Random): string {
	const id = pick(random, FORM_IDS)
	return id ? `<form id="${id}"></form>` : ""
}

function serialize({ id, type, name, checked, form, formId }: Input): string {
	const attributes = `${name ? ` name="${name}"` : ""}${formId ? ` form="${formId}"` : ""}${checked ? " checked" : ""}`
	const input = `<input id="${id}" type="${type}"${attributes}>`
	return form ? `<form>${input}</form>` : input
}

function checkedIds(root: ParentNode): Array<string> {
	return [...root.querySelectorAll("input")].filter((input) => input.checked).map((input) => input.id)
}

function shuffle<T>(random: Random, items: ReadonlyArray<T>): Array<T> {
	const copy = [...items]
	for (let index = copy.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(random() * (index + 1))
		;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
	}
	return copy
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
