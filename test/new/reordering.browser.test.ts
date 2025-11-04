import { describe, test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom, observeMutations } from "./utils"

describe("Optimal Reordering", () => {
	test("should minimize moves when reordering - simple rotation", () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 5; i++) {
			from.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		const to = document.createElement("ul")
		for (const id of [5, 1, 2, 3, 4]) {
			to.appendChild(dom(`<li id="item-${id}">Item ${id}</li>`))
		}

		document.body.appendChild(from)

		const mutations = observeMutations(from, () => {
			morph(from, to)
		})

		document.body.removeChild(from)

		expect(mutations.childListChanges).toBe(2)
	})

	test("should minimize moves when reordering - partial reorder", () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 10; i++) {
			from.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		const to = document.createElement("ul")
		for (const id of [3, 1, 5, 7, 2, 8, 4, 9, 6, 10]) {
			to.appendChild(dom(`<li id="item-${id}">Item ${id}</li>`))
		}

		document.body.appendChild(from)

		const mutations = observeMutations(from, () => {
			morph(from, to)
		})

		document.body.removeChild(from)

		expect(mutations.childListChanges).toBe(8)
	})

	test("should minimize moves when reordering - complete reversal", () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 6; i++) {
			from.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		const to = document.createElement("ul")
		for (let i = 6; i >= 1; i--) {
			to.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		document.body.appendChild(from)

		const mutations = observeMutations(from, () => {
			morph(from, to)
		})

		document.body.removeChild(from)

		expect(mutations.childListChanges).toBe(10)
	})

	test("should minimize moves when reordering - already optimal", () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 5; i++) {
			from.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		const to = document.createElement("ul")
		for (const id of [1, 2, 4, 5, 3]) {
			to.appendChild(dom(`<li id="item-${id}">Item ${id}</li>`))
		}

		document.body.appendChild(from)

		const mutations = observeMutations(from, () => {
			morph(from, to)
		})

		document.body.removeChild(from)

		expect(mutations.childListChanges).toBe(2)
	})

	test("should minimize moves with mixed operations", () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 8; i++) {
			from.appendChild(dom(`<li id="item-${i}">Item ${i}</li>`))
		}

		const to = document.createElement("ul")
		for (const id of [4, 1, 9, 5, 7, 3, 10, 8]) {
			to.appendChild(dom(`<li id="item-${id}">Item ${id}</li>`))
		}

		document.body.appendChild(from)

		observeMutations(from, () => {
			morph(from, to)
		})

		document.body.removeChild(from)

		expect(from.children.length).toBe(8)
		expect(from.children[0]?.id).toBe("item-4")
		expect(from.children[7]?.id).toBe("item-8")
	})
})
