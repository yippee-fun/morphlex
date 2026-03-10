import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

test("beforeNodeVisited can skip non-element updates without firing afterNodeVisited", () => {
	const from = document.createElement("div")
	from.textContent = "before"

	const to = document.createElement("div")
	to.textContent = "after"

	const events: string[] = []

	morph(from, to, {
		beforeNodeVisited: (fromNode) => {
			if (fromNode.nodeType !== Node.TEXT_NODE) return true
			events.push("before")
			return false
		},
		afterNodeVisited: () => {
			events.push("after")
		},
	})

	expect(from.textContent).toBe("before")
	expect(events).toEqual(["before", "after"])
})

test("non-element replacement still reports afterNodeVisited when replacement occurs", () => {
	const parent = document.createElement("div")
	const from = document.createTextNode("before")
	const to = document.createElement("span")
	let visited = false
	parent.append(from)

	morph(from, to, {
		afterNodeVisited: () => {
			visited = true
		},
	})

	expect(parent.firstChild).toBe(to)
	expect(visited).toBe(true)
})

test("beforeChildrenVisited can skip child morphing", () => {
	const from = document.createElement("div")
	from.innerHTML = "<span>before</span>"

	const to = document.createElement("div")
	to.innerHTML = "<span>after</span>"

	morphInner(from, to, {
		beforeChildrenVisited: () => false,
	})

	expect(from.innerHTML).toBe("<span>before</span>")
})

test("beforeNodeVisited can skip replacing non-matching elements", () => {
	const parent = document.createElement("div")
	const from = document.createElement("span")
	from.textContent = "before"
	parent.append(from)

	const to = document.createElement("em")
	to.textContent = "after"

	morph(from, to, {
		beforeNodeVisited: () => false,
	})

	expect(parent.firstChild).toBe(from)
	expect(parent.firstChild?.nodeName).toBe("SPAN")
})

test("morph is a fast no-op when both nodes are the same object", () => {
	const node = document.createElement("div")
	node.textContent = "same"

	morph(node, node)

	expect(node.textContent).toBe("same")
})
