import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("preserveChanges keeps a textarea value the user changed back to the original", () => {
	const from = document.createElement("textarea")
	from.defaultValue = "before"
	from.value = "user edit"
	from.value = "before"

	const to = document.createElement("textarea")
	to.textContent = "after"

	morph(from, to, { preserveChanges: true })

	expect(from.defaultValue).toBe("after")
	expect(from.value).toBe("before")
})

test("preserveChanges updates the value of a textarea the user never changed", () => {
	const from = document.createElement("textarea")
	from.textContent = "before"

	const to = document.createElement("textarea")
	to.textContent = "after"

	morph(from, to, { preserveChanges: true })

	expect(from.defaultValue).toBe("after")
	expect(from.value).toBe("after")
})

test("a textarea morphed without preserveChanges still follows markup with preserveChanges", () => {
	const from = document.createElement("textarea")
	from.textContent = "first"

	const second = document.createElement("textarea")
	second.textContent = "second"

	morph(from, second)

	const third = document.createElement("textarea")
	third.textContent = "third"

	morph(from, third, { preserveChanges: true })

	expect(from.defaultValue).toBe("third")
	expect(from.value).toBe("third")
})
