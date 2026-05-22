import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphing a dirty input to itself cleans up morphlex-dirty", () => {
	const input = document.createElement("input")
	input.type = "text"
	input.defaultValue = "default"
	input.value = "edited"

	morph(input, input)

	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})
