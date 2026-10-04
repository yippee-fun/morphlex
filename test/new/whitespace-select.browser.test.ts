import { afterEach, expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// happy-dom doesn't match `:checked` on options, so these only run in real browsers.

afterEach(() => {
	document.body.replaceChildren()
})

const STYLE = `.g { white-space: normal } .s:has(.b:checked) .g { white-space: pre }`

// Option B holds whitespace between two spans, which is only kept while B is selected. It sits in a span
// because Firefox keeps options themselves at `white-space: nowrap`.
function options(order: "ab" | "ba", gap: string): Array<HTMLOptionElement> {
	const a = document.createElement("option")
	a.className = "a"
	a.textContent = "A"
	const b = document.createElement("option")
	b.className = "b"
	const g = document.createElement("span")
	g.className = "g"
	g.append(document.createElement("b"), document.createTextNode(gap), document.createElement("b"))
	b.append(g)
	return order === "ab" ? [a, b] : [b, a]
}

function mount(element: Element): void {
	const style = document.createElement("style")
	style.textContent = STYLE
	document.body.append(style, element)
}

test("whitespace in a select is judged after the select is synced", () => {
	const from = document.createElement("select")
	from.className = "s"
	from.append(...options("ab", "  "))
	mount(from)
	const to = document.createElement("select")
	to.className = "s"
	to.append(...options("ba", " "))

	morph(from, to)

	expect(from.selectedOptions[0]!.className).toBe("b")
	expect(from.querySelector(".g")!.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace inside a select is judged after the enclosing select is synced, before the root's callbacks", () => {
	const select = document.createElement("select")
	select.className = "s"
	const from = document.createElement("optgroup")
	from.append(...options("ab", "  "))
	select.append(from)
	mount(select)
	const to = document.createElement("optgroup")
	to.append(...options("ba", " "))

	const seen: Array<string | null> = []
	morphInner(from, to, {
		afterChildrenVisited: (node) => {
			if (node === from) seen.push(select.selectedOptions[0]!.className, select.querySelector(".g")!.childNodes[1]!.nodeValue)
		},
	})

	expect(seen).toEqual(["b", " "])
	expect(select.selectedOptions[0]!.className).toBe("b")
	expect(select.querySelector(".g")!.childNodes[1]!.nodeValue).toBe(" ")
})
