import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

const DETACHED_NODE_ERROR = "[Morphlex] Cannot replace a detached node. It needs a parent."

function recordCallbacks(events: string[]) {
	return {
		beforeNodeAdded: () => {
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
	}
}

test("morphing a detached element to a different tag throws", () => {
	const from = document.createElement("div")
	const to = document.createElement("span")
	const events: string[] = []

	expect(() => morph(from, to, recordCallbacks(events))).toThrow(DETACHED_NODE_ERROR)

	expect(events).toEqual([])
	expect(from.parentNode).toBe(null)
	expect(to.parentNode).toBe(null)
})

test("morphing a detached element to a text node throws", () => {
	const from = document.createElement("div")
	from.textContent = "before"

	expect(() => morph(from, document.createTextNode("after"))).toThrow(DETACHED_NODE_ERROR)

	expect(from.textContent).toBe("before")
})

test("morphing a detached node to many nodes throws before changing anything", () => {
	const from = document.createTextNode("before")
	const events: string[] = []

	expect(() => morph(from, "after<!--second--><em>third</em>", recordCallbacks(events))).toThrow(DETACHED_NODE_ERROR)

	expect(events).toEqual([])
	expect(from.nodeValue).toBe("before")
})

test("morphing a detached element to a different tag cleans up dirty flags", () => {
	const from = document.createElement("div")
	const input = document.createElement("input")
	from.append(input)
	input.value = "typed"

	expect(() => morph(from, document.createElement("span"))).toThrow(DETACHED_NODE_ERROR)

	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
	expect(input.value).toBe("typed")
})

test("morphing a detached element to the same tag still works", () => {
	const from = document.createElement("div")
	from.textContent = "before"

	morph(from, "<div class='after'>after</div>")

	expect(from.className).toBe("after")
	expect(from.textContent).toBe("after")
})
