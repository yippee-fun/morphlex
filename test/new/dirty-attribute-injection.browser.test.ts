import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphlex-dirty attribute in `to` does not leak into `from`", () => {
	const from = document.createElement("div")
	from.id = "x"

	// Hostile/buggy input includes morphlex-dirty on the target.
	const to = document.createElement("div")
	to.id = "x"
	to.setAttribute("morphlex-dirty", "")

	morph(from, to)

	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})
