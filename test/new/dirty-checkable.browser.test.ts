import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

function observeMutations(node: Node): () => Array<MutationRecord> {
	const observer = new MutationObserver(() => {})
	observer.observe(node, { subtree: true, attributes: true, childList: true })
	return () => {
		const records = observer.takeRecords()
		observer.disconnect()
		return records
	}
}

test("untouched checkbox without a value attribute is not mutated", () => {
	const from = dom(`<div><input type="checkbox"></div>`)
	const input = from.querySelector("input")!
	const mutations = observeMutations(from)

	morph(from, dom(`<div><input type="checkbox"></div>`))

	expect(mutations()).toEqual([])
	expect(from.querySelector("input")).toBe(input)
})

test("untouched radio without a value attribute is not mutated", () => {
	const from = dom(`<div><input type="radio"></div>`)
	const input = from.querySelector("input")!
	const mutations = observeMutations(from)

	morph(from, dom(`<div><input type="radio"></div>`))

	expect(mutations()).toEqual([])
	expect(from.querySelector("input")).toBe(input)
})

test("untouched root checkbox without a value attribute is not mutated", () => {
	const parent = document.createElement("div")
	const from = dom(`<input type="checkbox">`)
	parent.append(from)
	const mutations = observeMutations(parent)

	morph(from, dom(`<input type="checkbox">`))

	expect(mutations()).toEqual([])
	expect(parent.firstElementChild).toBe(from)
})

test("focused checkbox without a value attribute keeps focus", () => {
	const from = dom(`<div><label>Accept <input type="checkbox"></label></div>`)
	document.body.append(from)
	const input = from.querySelector("input")!
	input.focus()

	morph(from, dom(`<div><label>Accept <input type="checkbox"></label></div>`))

	const active = document.activeElement
	from.remove()
	expect(active).toBe(input)
})

test("user-checked checkbox without a value attribute is preserved", () => {
	const from = dom(`<div><input type="checkbox" name="accept"></div>`)
	const input = from.querySelector("input")!
	input.checked = true

	morph(from, dom(`<div><input type="checkbox" name="accept"></div>`), { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.checked).toBe(true)
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})

test("user-checked root checkbox is preserved", () => {
	const from = dom(`<input type="checkbox" name="accept">`) as HTMLInputElement
	from.checked = true

	morph(from, dom(`<input type="checkbox" name="accept">`), { preserveChanges: true })

	expect(from.checked).toBe(true)
	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})

test("typed text input is still treated as dirty", () => {
	const from = dom(`<div><input type="text" name="title" value="before"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><input type="text" name="title" value="before"></div>`), { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})
