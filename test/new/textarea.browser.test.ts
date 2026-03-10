import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("preserveChanges keeps a modified textarea value", () => {
	const from = document.createElement("textarea")
	from.defaultValue = "before"
	from.value = "user edit"

	const to = document.createElement("textarea")
	to.textContent = "after"

	morph(from, to, { preserveChanges: true })

	expect(from.defaultValue).toBe("after")
	expect(from.value).toBe("user edit")
})

test("textarea morph handles an empty target value", () => {
	const from = document.createElement("textarea")
	from.defaultValue = "before"
	from.value = "before"

	const to = document.createElement("textarea")

	morph(from, to)

	expect(from.defaultValue).toBe("")
	expect(from.value).toBe("")
})

test("textarea morph skips rewriting identical text content", () => {
	const from = document.createElement("textarea")
	from.defaultValue = "same"
	from.value = "same"
	from.setAttribute("data-from", "1")

	const to = document.createElement("textarea")
	to.textContent = "same"
	to.setAttribute("data-to", "1")

	morph(from, to)

	expect(from.defaultValue).toBe("same")
	expect(from.value).toBe("same")
	expect(from.getAttribute("data-to")).toBe("1")
})
