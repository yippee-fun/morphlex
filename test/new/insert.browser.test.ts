import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom, observeMutations } from "./utils"

test("insert item at the end of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
			<li>New Item</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsAdded).toBe(1)
})

test("insert item at the beginning of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>New Item</li>
			<li>Item 1</li>
			<li>Item 2</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsAdded).toBe(1)
})

test("insert item in the middle of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>Item 1</li>
			<li>New Item</li>
			<li>Item 2</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsAdded).toBe(1)
})
