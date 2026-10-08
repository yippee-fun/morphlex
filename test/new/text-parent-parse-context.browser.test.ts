import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

// Each of these parents holds its innerHTML as text, so tags stay as written.
const TEXT_PARENTS = ["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext"]
const STRINGS = [`<p>Hello</p>`, `a &amp; b`, `<b>x</b> &lt; y`, `</${"script"}>`, ``]

function expectParsedAsParentInnerHTML(name: string, string: string): void {
	const parent = document.createElement(name)
	parent.textContent = "old"
	const probe = document.createElement(name)
	probe.innerHTML = string

	morph(parent.firstChild!, string)

	expect(parent.innerHTML, `${name}: ${string}`).toBe(probe.innerHTML)
	expect(parent.children.length, `${name}: ${string}`).toBe(0)
}

test("a string target for a text node in a raw text or RCDATA parent is parsed as the parent's innerHTML would", () => {
	for (const name of TEXT_PARENTS) {
		for (const string of STRINGS) expectParsedAsParentInnerHTML(name, string)
	}
})

test("script text keeps literal tags and character references", () => {
	const script = document.createElement("script")
	script.textContent = "old"

	morph(script.firstChild!, `const html = "<p>Hello</p> &amp;";`)

	expect(script.textContent).toBe(`const html = "<p>Hello</p> &amp;";`)
	expect(script.childNodes.length).toBe(1)
})

test("textarea text is parsed as text, decoding character references", () => {
	const textarea = document.createElement("textarea")
	textarea.textContent = "old"

	morph(textarea.firstChild!, "<b>Hello</b> &amp;")

	expect(textarea.value).toBe("<b>Hello</b> &")
	expect(textarea.children.length).toBe(0)
})

test("a text node in a script in the page keeps literal tags", () => {
	const div = document.createElement("div")
	div.innerHTML = `<script type="text/plain">old</script>`
	document.body.append(div)
	const script = div.firstElementChild!

	morph(script.firstChild!, `<img src="x" onerror="window.__parsed = true">`)

	expect(script.textContent).toBe(`<img src="x" onerror="window.__parsed = true">`)
	expect(div.querySelector("img")).toBeNull()
	div.remove()
})

test("a text node in an ordinary parent still parses tags", () => {
	const p = document.createElement("p")
	p.textContent = "old"

	morph(p.firstChild!, `<b>Hello</b>`)

	expect(p.innerHTML).toBe(`<b>Hello</b>`)
})
