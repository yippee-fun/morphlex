import { expect, test, vi } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

type Random = () => number

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_SELECT_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_SELECT_SEED_START set to it and MORPHLEX_FUZZ_SELECT_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_SELECT_SEED_START", 0x5100)

type Kind = "select" | "inner-select" | "optgroup" | "inner-optgroup" | "option" | "option-list"
const KINDS: ReadonlyArray<Kind> = ["select", "inner-select", "optgroup", "inner-optgroup", "option", "option-list"]

// Browsers with customizable selects fill a drop-down's `selectedcontent` with a copy of the selected option.
const fillsSelectedContent =
	typeof (globalThis as { HTMLSelectedContentElement?: unknown }).HTMLSelectedContentElement === "function"
const BUTTON = `<button><selectedcontent></selectedcontent></button>`

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz of morphs rooted at or inside a select shows what its markup selects, and the selected option", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const random = createRandom(seed)
		// Buttons and preserveChanges are drawn from their own sequence, so each seed's selects stay as they were.
		const extra = createRandom(seed + 0x40000000)
		const kind = pick(random, KINDS)
		const rooted = kind.includes("optgroup")
			? group(random, ` id="root"`)
			: kind.includes("option")
				? `<option id="root">r</option>`
				: null
		const from = `<select${selectAttributes(random)}>${button(extra)}${children(random, rooted)}</select>`
		const host = document.createElement("div")
		host.innerHTML = from
		document.body.append(host)

		try {
			const select = host.querySelector("select")!
			// The user only picks options when the morph is rooted at the select, since a morph inside it only resets the
			// selection when it changes it.
			if (kind.includes("select")) {
				for (let picks = randomInt(random, 0, 2); picks > 0 && select.options.length > 0; picks--) {
					const option = select.options[randomInt(random, 0, select.options.length - 1)]!
					option.selected = select.multiple ? !option.selected : true
				}
			}

			// With preserveChanges the user's picks stay, so only what the select shows is checked.
			const preserveChanges = kind.includes("select") && extra() < 0.3
			const root = host.querySelector("#root") ?? select
			let picked: string | null = null
			let to: string
			if (kind === "select" || kind === "inner-select") {
				const attributes = random() < 0.6 ? from.match(/^<select([^>]*)>/)![1]! : selectAttributes(random)
				to = `<select${attributes}>${button(extra)}${children(random, null)}</select>`
				const target = parse(to).firstElementChild!
				if (kind === "select") {
					// The root's after callbacks see the finished DOM, so what its afterChildrenVisited selects stands.
					const pickAt = extra() < 0.3 ? extra() : null
					morph(root, target, {
						preserveChanges,
						afterChildrenVisited: (parent) => {
							if (pickAt === null || parent !== root || select.options.length === 0) return
							select.options[Math.floor(pickAt * select.options.length)]!.selected = true
							picked = selection(select)
						},
					})
				} else morphInner(root, target, { preserveChanges })
			} else if (kind === "optgroup" || kind === "inner-optgroup") {
				to = `<select>${group(random, random() < 0.7 ? ` id="root"` : "")}</select>`
				const target = parse(to).firstElementChild!.firstElementChild!
				if (kind === "optgroup") morph(root, target)
				else morphInner(root, target)
			} else {
				const count = kind === "option" ? 1 : randomInt(random, 1, 3)
				to = `<select>${Array.from({ length: count }, () => option(random)).join("")}</select>`
				const target = parse(to).firstElementChild!
				if (kind === "option") morph(root, target.firstChild!)
				else morph(root, target.childNodes)
			}

			const live = host.querySelector("select")!
			const message = `seed ${seed} ${kind}\n${from}\n${to}\n${live.outerHTML}`
			if (picked !== null) expect(selection(live), message).toBe(picked)
			else if (!preserveChanges) expect(markupSelections(live), message).toContain(selection(live))
			if (fillsSelectedContent && !live.multiple) {
				const shown = live.options[live.selectedIndex]?.innerHTML ?? ""
				for (const selectedContent of live.querySelectorAll("selectedcontent")) {
					expect(selectedContent.innerHTML, message).toBe(shown)
				}
			}
		} finally {
			host.remove()
		}
	}
})

function button(random: Random): string {
	return random() < 0.5 ? BUTTON : ""
}

function option(random: Random): string {
	const value = random() < 0.7 ? ` value="${pick(random, ["1", "2", "3"])}"` : ""
	const selected = random() < 0.3 ? " selected" : ""
	const disabled = random() < 0.1 ? " disabled" : ""
	const id = random() < 0.15 ? ` id="${pick(random, ["o1", "o2"])}"` : ""
	return `<option${id}${value}${selected}${disabled}>${pick(random, ["a", "b"])}</option>`
}

function group(random: Random, id: string): string {
	let options = ""
	for (let count = randomInt(random, 0, 3); count > 0; count--) options += option(random)
	return `<optgroup${id} label="${pick(random, ["g", "h"])}">${options}</optgroup>`
}

// Options and optgroups, with the root of the morph among them.
function children(random: Random, rooted: string | null): string {
	const items: Array<string> = []
	for (let count = randomInt(random, 0, 4); count > 0; count--) items.push(random() < 0.25 ? group(random, "") : option(random))
	if (rooted !== null) items.splice(randomInt(random, 0, items.length), 0, rooted)
	return items.join(random() < 0.3 ? "\n " : "")
}

function selectAttributes(random: Random): string {
	let attributes = ` name="${pick(random, ["s", "t"])}"`
	if (random() < 0.35) attributes += " multiple"
	else if (random() < 0.2) attributes += ` size="${pick(random, ["2", "4"])}"`
	return attributes
}

function selection(select: HTMLSelectElement): string {
	return [...select.options].map((option) => (option.selected ? 1 : 0)).join("")
}

// What parsing the markup selects, and what a form reset selects. They differ in WebKit, which parses a drop-down whose
// options are all disabled with the first one selected, and skips an option in an optgroup when parsing.
function markupSelections(select: HTMLSelectElement): Array<string> {
	const parsed = new DOMParser().parseFromString(select.outerHTML, "text/html").querySelector("select")!
	const form = document.createElement("form")
	form.append(select.cloneNode(true))
	form.reset()
	return [selection(parsed), selection(form.querySelector("select")!)]
}

function parse(html: string): DocumentFragment {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content
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
