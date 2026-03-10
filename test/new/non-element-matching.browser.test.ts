import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("direct morphs update root text nodes", () => {
	const from = document.createTextNode("before")
	const to = document.createTextNode("after")

	morph(from, to)

	expect(from.nodeValue).toBe("after")
})

test("equal non-element nodes are skipped by the nodeType fallback pass", () => {
	const from = document.createElement("div")
	const comment = document.createComment("same")
	from.append(comment)

	const to = document.createElement("div")
	to.append(document.createComment("same"))

	morph(from, to)

	expect(from.firstChild).toBe(comment)
	expect(from.firstChild?.nodeValue).toBe("same")
})

test("same-type non-element nodes fall back to morphing by nodeType", () => {
	const from = document.createElement("div")
	const comment = document.createComment("before")
	from.append(comment)

	const to = document.createElement("div")
	to.append(document.createComment("after"))

	morph(from, to)

	expect(from.firstChild).toBe(comment)
	expect(from.firstChild?.nodeValue).toBe("after")
})

test("nodeType fallback skips mismatched non-element candidates before finding a match", () => {
	const from = document.createElement("div")
	const comment = document.createComment("comment")
	const text = document.createTextNode("before")
	from.append(comment, text)

	const to = document.createElement("div")
	to.append(document.createTextNode("after"))

	morph(from, to)

	expect(from.childNodes).toHaveLength(1)
	expect(from.firstChild).toBe(text)
	expect(from.textContent).toBe("after")
})

test("direct morphs from detached elements to non-parent targets remain a no-op", () => {
	const from = document.createElement("div")
	from.textContent = "before"

	morph(from, document.createTextNode("after"))

	expect(from.textContent).toBe("before")
})
