import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("removing multiple attributes clears them all", () => {
	const from = document.createElement("div")
	from.setAttribute("data-one", "1")
	from.setAttribute("data-two", "2")
	from.setAttribute("data-three", "3")

	const to = document.createElement("div")

	morph(from, to)

	expect(from.attributes).toHaveLength(0)
	expect(from.hasAttribute("data-one")).toBe(false)
	expect(from.hasAttribute("data-two")).toBe(false)
	expect(from.hasAttribute("data-three")).toBe(false)
})
