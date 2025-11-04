import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom, observeMutations } from "./utils"

test("remove item from the end of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
			<li>Item 3</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsRemoved).toBe(1)
})

test("remove item from the beginning of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
			<li>Item 3</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>Item 2</li>
			<li>Item 3</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsRemoved).toBe(1)
})

test("remove item from the middle of a list", () => {
	const from = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 2</li>
			<li>Item 3</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>Item 1</li>
			<li>Item 3</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.elementsRemoved).toBe(1)
})
