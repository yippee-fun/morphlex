import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

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
