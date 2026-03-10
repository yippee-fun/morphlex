import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("root option elements are marked dirty before morphing when selection changed", () => {
	const from = document.createElement("option")
	from.textContent = "before"
	from.selected = true

	const to = document.createElement("option")
	to.textContent = "after"

	morph(from, to)

	expect(from.textContent).toBe("after")
	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})

test("unchanged root option selection does not get marked dirty", () => {
	const from = document.createElement("option")
	from.defaultSelected = true
	from.selected = true
	from.textContent = "before"

	const to = document.createElement("option")
	to.defaultSelected = true
	to.selected = true
	to.textContent = "after"

	morph(from, to)

	expect(from.textContent).toBe("after")
	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})

test("unchanged descendant option selection does not get marked dirty", () => {
	const from = document.createElement("select")
	const option = document.createElement("option")
	option.defaultSelected = true
	option.selected = true
	option.textContent = "before"
	from.append(option)

	const to = document.createElement("select")
	const next = document.createElement("option")
	next.defaultSelected = true
	next.selected = true
	next.textContent = "after"
	to.append(next)

	morph(from, to)

	expect(from.firstElementChild?.textContent).toBe("after")
	expect(from.firstElementChild?.hasAttribute("morphlex-dirty")).toBe(false)
})
