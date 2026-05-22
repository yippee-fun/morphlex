import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphing a file input with a non-empty value attribute doesn't throw", () => {
	const parent = document.createElement("div")
	const from = document.createElement("input")
	from.type = "file"
	from.id = "a"
	parent.appendChild(from)

	const to = document.createElement("input")
	to.type = "file"
	to.id = "a"
	to.setAttribute("value", "ignored.txt")

	expect(() => morph(from, to)).not.toThrow()
})
