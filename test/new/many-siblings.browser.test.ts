import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("an unchanged sibling keeps its node in a long list where everything else changed", () => {
	const items = Array.from({ length: 40 }, (_, i) => `<li data-version="1">Item ${i}</li>`)
	const from = dom(`<ul>${items.join("")}</ul>`)
	const last = from.lastElementChild

	const changed = Array.from({ length: 39 }, (_, i) => `<li data-version="2">Item ${i}</li>`)
	const to = dom(`<ul><li data-version="1">Item 39</li>${changed.join("")}<li>New</li></ul>`)
	const expected = to.outerHTML

	morph(from, to)

	expect(from.outerHTML).toBe(expected)
	expect(from.firstElementChild).toBe(last)
})

test("siblings with the same text are told apart by isEqualNode in a long list", () => {
	const items = Array.from({ length: 40 }, (_, i) => `<li>Item ${i}</li>`)
	const from = dom(`<ul><li class="a">Same</li><li class="b">Same</li>${items.join("")}</ul>`)
	const b = from.children[1]

	const changed = Array.from({ length: 40 }, (_, i) => `<li>Item ${i}!</li>`)
	const to = dom(`<ul><li class="b">Same</li>${changed.join("")}</ul>`)
	const expected = to.outerHTML

	morph(from, to)

	expect(from.outerHTML).toBe(expected)
	expect(from.firstElementChild).toBe(b)
})
