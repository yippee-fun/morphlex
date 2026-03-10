import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("detached replacements only expose beforeNodeAdded as a signal", () => {
	const from = document.createElement("div")
	const to = document.createElement("span")
	const events: string[] = []

	morph(from, to, {
		beforeNodeAdded: (parent, node, insertionPoint) => {
			expect(parent).toBe(document)
			expect(node).toBe(to)
			expect(insertionPoint).toBe(from)
			events.push("before:add")
			return true
		},
		afterNodeAdded: () => {
			events.push("after:add")
		},
		beforeNodeRemoved: () => {
			events.push("before:remove")
			return true
		},
		afterNodeRemoved: () => {
			events.push("after:remove")
		},
	})

	expect(events).toEqual(["before:add"])
	expect(from.parentNode).toBe(null)
	expect(to.parentNode).toBe(null)
})

test("detached one-to-many morphs only expose beforeNodeAdded signals for extra nodes", () => {
	const from = document.createTextNode("before")
	const events: string[] = []

	morph(from, "after<!--second--><em>third</em>", {
		beforeNodeAdded: (parent, node, insertionPoint) => {
			expect(parent).toBe(document)
			expect(insertionPoint).toBe(from)
			events.push(`before:${node.nodeName}`)
			return true
		},
		afterNodeAdded: (node) => {
			events.push(`after:${node.nodeName}`)
		},
	})

	expect(from.nodeValue).toBe("after")
	expect(events).toEqual(["before:#comment", "before:EM"])
})

test("attached replacements do not remove when beforeNodeAdded rejects the new node", () => {
	const parent = document.createElement("div")
	const from = document.createElement("div")
	const to = document.createElement("span")
	const events: string[] = []
	parent.append(from)

	morph(from, to, {
		beforeNodeRemoved: () => {
			events.push("before:remove")
			return true
		},
		beforeNodeAdded: () => {
			events.push("before:add")
			return false
		},
		afterNodeAdded: () => {
			events.push("after:add")
		},
		afterNodeRemoved: () => {
			events.push("after:remove")
		},
	})

	expect(parent.firstChild).toBe(from)
	expect(events).toEqual(["before:remove", "before:add"])
})
