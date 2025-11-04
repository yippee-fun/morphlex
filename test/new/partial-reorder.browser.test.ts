import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom, observeMutations } from "./utils"

test("partial reorder at the befinning", () => {
	const from = dom(`
		<ul>
			<li>1</li>
			<li>2</li>
			<li>3</li>
			<li>4</li>
			<li>5</li>
			<li>6</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>2</li>
			<li>1</li>
			<li>3</li>
			<li>4</li>
			<li>5</li>
			<li>6</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)

	expect(mutations.elementsRemoved).toBe(1)
	expect(mutations.elementsAdded).toBe(1)
})

test("partial reorder at the end", () => {
	const from = dom(`
		<ul>
			<li>1</li>
			<li>2</li>
			<li>3</li>
			<li>4</li>
			<li>5</li>
			<li>6</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>1</li>
			<li>2</li>
			<li>3</li>
			<li>4</li>
			<li>6</li>
			<li>5</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)

	expect(mutations.elementsRemoved).toBe(1)
	expect(mutations.elementsAdded).toBe(1)
})

test("partial reorder in the middle", () => {
	const from = dom(`
		<ul>
			<li>1</li>
			<li>2</li>
			<li>3</li>
			<li>4</li>
			<li>5</li>
			<li>6</li>
		</ul>
	`)

	const to = dom(`
		<ul>
			<li>1</li>
			<li>2</li>
			<li>4</li>
			<li>3</li>
			<li>5</li>
			<li>6</li>
		</ul>
	`)

	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)

	expect(mutations.elementsRemoved).toBe(1)
	expect(mutations.elementsAdded).toBe(1)
})
