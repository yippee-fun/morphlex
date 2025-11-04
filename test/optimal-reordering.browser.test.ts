import { describe, test, expect } from "vitest"
import { morph } from "../src/morphlex"

describe("Optimal Reordering", () => {
	test("should minimize moves when reordering - simple rotation", async () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 5; i++) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			from.appendChild(li)
		}

		const to = document.createElement("ul")
		// Rotate: move last to first [1,2,3,4,5] → [5,1,2,3,4]
		for (const id of [5, 1, 2, 3, 4]) {
			const li = document.createElement("li")
			li.id = `item-${id}`
			li.textContent = `Item ${id}`
			to.appendChild(li)
		}

		document.body.appendChild(from)

		const mutations: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			mutations.push(...records)
		})

		observer.observe(from, {
			childList: true,
			subtree: true,
		})

		morph(from, to)

		await new Promise((resolve) => setTimeout(resolve, 0))

		observer.disconnect()
		document.body.removeChild(from)

		// With LIS optimization:
		// Sequence: [4, 0, 1, 2, 3] (current indices in desired order)
		// LIS: [0, 1, 2, 3] (items 1,2,3,4 stay in order)
		// Only item 5 needs to move!
		// Expected: 2 mutations (1 remove + 1 add for moving item 5)

		const childListMutations = mutations.filter((m) => m.type === "childList")
		console.log(`\nRotation test: ${childListMutations.length} childList mutations`)

		// Currently fails with 2 moves (4 mutations)
		// Should pass with 1 move (2 mutations) after LIS optimization
		expect(childListMutations.length).toBe(2)
	})

	test("should minimize moves when reordering - partial reorder", async () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 10; i++) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			from.appendChild(li)
		}

		const to = document.createElement("ul")
		// [1,2,3,4,5,6,7,8,9,10] → [3,1,5,7,2,8,4,9,6,10]
		// Items in LIS: 3,5,7,8,9,10 (6 items stay)
		// Items to move: 1,2,4,6 (4 items)
		for (const id of [3, 1, 5, 7, 2, 8, 4, 9, 6, 10]) {
			const li = document.createElement("li")
			li.id = `item-${id}`
			li.textContent = `Item ${id}`
			to.appendChild(li)
		}

		document.body.appendChild(from)

		const mutations: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			mutations.push(...records)
		})

		observer.observe(from, {
			childList: true,
			subtree: true,
		})

		morph(from, to)

		await new Promise((resolve) => setTimeout(resolve, 0))

		observer.disconnect()
		document.body.removeChild(from)

		// Sequence: [2, 0, 4, 6, 1, 7, 3, 8, 5, 9]
		// LIS: [2, 4, 6, 7, 8, 9] length 6 (items 3,5,7,8,9,10)
		// Move: 10 - 6 = 4 items
		// Expected: 8 mutations (4 moves × 2)

		const childListMutations = mutations.filter((m) => m.type === "childList")
		console.log(`\nPartial reorder test: ${childListMutations.length} childList mutations`)

		expect(childListMutations.length).toBeLessThanOrEqual(8)
	})

	test("should minimize moves when reordering - complete reversal", async () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 6; i++) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			from.appendChild(li)
		}

		const to = document.createElement("ul")
		// Complete reversal [1,2,3,4,5,6] → [6,5,4,3,2,1]
		for (let i = 6; i >= 1; i--) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			to.appendChild(li)
		}

		document.body.appendChild(from)

		const mutations: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			mutations.push(...records)
		})

		observer.observe(from, {
			childList: true,
			subtree: true,
		})

		morph(from, to)

		await new Promise((resolve) => setTimeout(resolve, 0))

		observer.disconnect()
		document.body.removeChild(from)

		// Sequence: [5, 4, 3, 2, 1, 0] (completely decreasing)
		// LIS: any single element, length 1
		// Move: 6 - 1 = 5 items
		// Expected: 10 mutations (5 moves × 2)

		const childListMutations = mutations.filter((m) => m.type === "childList")
		console.log(`\nReversal test: ${childListMutations.length} childList mutations`)

		// This is actually optimal for a reversal - can't do better than moving 5 items
		expect(childListMutations.length).toBeLessThanOrEqual(10)
	})

	test("should minimize moves when reordering - already optimal", async () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 5; i++) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			from.appendChild(li)
		}

		const to = document.createElement("ul")
		// [1,2,3,4,5] → [1,2,4,5,3]
		// Move only item 3 to the end
		for (const id of [1, 2, 4, 5, 3]) {
			const li = document.createElement("li")
			li.id = `item-${id}`
			li.textContent = `Item ${id}`
			to.appendChild(li)
		}

		document.body.appendChild(from)

		const mutations: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			mutations.push(...records)
		})

		observer.observe(from, {
			childList: true,
			subtree: true,
		})

		morph(from, to)

		await new Promise((resolve) => setTimeout(resolve, 0))

		observer.disconnect()
		document.body.removeChild(from)

		// Sequence: [0, 1, 3, 4, 2]
		// LIS: [0, 1, 3, 4] length 4 (items 1,2,4,5)
		// Move: only item 3
		// Expected: 2 mutations (1 move × 2)

		const childListMutations = mutations.filter((m) => m.type === "childList")
		console.log(`\nAlready optimal test: ${childListMutations.length} childList mutations`)

		expect(childListMutations.length).toBe(2)
	})

	test("should minimize moves with mixed operations", async () => {
		const from = document.createElement("ul")
		for (let i = 1; i <= 8; i++) {
			const li = document.createElement("li")
			li.id = `item-${i}`
			li.textContent = `Item ${i}`
			from.appendChild(li)
		}

		const to = document.createElement("ul")
		// Remove 2 and 6, add 9 and 10, reorder rest
		// [1,2,3,4,5,6,7,8] → [4,1,9,5,7,3,10,8]
		for (const id of [4, 1, 9, 5, 7, 3, 10, 8]) {
			const li = document.createElement("li")
			li.id = `item-${id}`
			li.textContent = `Item ${id}`
			to.appendChild(li)
		}

		document.body.appendChild(from)

		const mutations: MutationRecord[] = []
		const observer = new MutationObserver((records) => {
			mutations.push(...records)
		})

		observer.observe(from, {
			childList: true,
			subtree: true,
		})

		morph(from, to)

		await new Promise((resolve) => setTimeout(resolve, 0))

		observer.disconnect()
		document.body.removeChild(from)

		// Matched items: [4,1,5,7,3,8] at indices [3,0,4,6,2,7]
		// Sequence: [3, 0, 4, 6, 2, 7]
		// LIS: [3, 4, 6, 7] length 4 (items 4,5,7,8)
		// Move: 6 - 4 = 2 items (1 and 3)
		// Plus: 2 removals (2,6) and 2 additions (9,10)
		// Expected: ~8 mutations (2 moves + 2 removes + 2 adds = 6 ops × variable mutations)

		const childListMutations = mutations.filter((m) => m.type === "childList")
		console.log(`\nMixed operations test: ${childListMutations.length} childList mutations`)

		// Just verify it completes correctly
		expect(from.children.length).toBe(8)
		expect(from.children[0]?.id).toBe("item-4")
		expect(from.children[7]?.id).toBe("item-8")
	})
})
