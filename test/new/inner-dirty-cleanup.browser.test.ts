import { expect, test } from "vitest"
import { morphInner } from "../../src/morphlex"

test("morphInner on a textarea cleans up morphlex-dirty attribute from the root", () => {
	// Root is a textarea whose live value differs from its defaultValue, so
	// flagDirtyInputs sets the morphlex-dirty attribute on the textarea itself.
	const from = document.createElement("textarea")
	from.defaultValue = "default"
	from.value = "edited"

	const to = document.createElement("textarea")
	to.defaultValue = "new default"

	morphInner(from, to)

	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphInner on a dirty input cleans up morphlex-dirty attribute from the root", () => {
	const from = document.createElement("input")
	from.type = "text"
	from.defaultValue = "default"
	from.value = "edited"

	const to = document.createElement("input")
	to.type = "text"
	to.defaultValue = "default"

	morphInner(from, to)

	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})
