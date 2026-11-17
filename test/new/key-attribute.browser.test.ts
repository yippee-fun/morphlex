import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("keyAttribute matches and reorders siblings by a custom key", () => {
	const from = dom(`<ul><li data-key="a">old a</li><li data-key="b">old b</li></ul>`)
	const a = from.children[0]
	const b = from.children[1]

	morph(from, `<ul><li data-key="b">new b</li><li data-key="a">new a</li></ul>`, { keyAttribute: "data-key" })

	expect([...from.children]).toEqual([b, a])
	expect(from.innerHTML).toBe(`<li data-key="b">new b</li><li data-key="a">new a</li>`)
})

test("keyAttribute replaces id as a form control's identity", () => {
	const from = dom(`<form><input id="old" data-key="field" name="q" value="old"></form>`)
	const input = from.firstElementChild!

	morph(from, `<form><input id="new" data-key="field" name="q" value="new"></form>`, { keyAttribute: "data-key" })

	expect(from.firstElementChild).toBe(input)
	expect(from.innerHTML).toBe(`<input id="new" data-key="field" name="q" value="new">`)
})

test("elements with different custom keys don't match through the same id", () => {
	const from = dom(`<form><input id="field" data-key="old" name="q"></form>`)
	const input = from.firstElementChild

	morph(from, `<form><input id="field" data-key="new" name="q"></form>`, { keyAttribute: "data-key" })

	expect(from.firstElementChild).not.toBe(input)
	expect(from.innerHTML).toBe(`<input id="field" data-key="new" name="q">`)
})

test("a custom-keyed element moves across parents and keeps its state", () => {
	const from = dom(`<div><section><input data-key="field" value="server"></section><aside></aside></div>`)
	document.body.append(from)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, `<div><section></section><aside><input data-key="field" value="server"></aside></div>`, {
		keyAttribute: "data-key",
		preserveChanges: true,
	})

	expect(from.querySelector("input")).toBe(input)
	expect(input.parentElement!.localName).toBe("aside")
	expect(input.value).toBe("typed")
	from.remove()
})

test("duplicate custom keys don't move elements across parents", () => {
	const from = dom(`<div><section><input data-key="field"></section><b data-key="field"></b><aside></aside></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><section></section><b data-key="field"></b><aside><input data-key="field"></aside></div>`, {
		keyAttribute: "data-key",
	})

	expect(from.querySelector("input")).not.toBe(input)
	expect(from.innerHTML).toBe(`<section></section><b data-key="field"></b><aside><input data-key="field"></aside>`)
})

test("an absent or empty key attribute leaves an element unkeyed", () => {
	const from = dom(
		`<form><input id="old" data-key="1" name="q"><input id="keep" name="r"><input id="empty" data-key="" name="s"></form>`,
	)
	const keyed = from.children[0]
	const absent = from.children[1]
	const empty = from.children[2]

	morph(
		from,
		`<form><input id="new" data-key="1" name="q"><input id="changed" name="r"><input id="also-changed" data-key="" name="s"></form>`,
		{ keyAttribute: "data-key" },
	)

	expect(from.children[0]).toBe(keyed)
	expect(from.children[1]).toBe(absent)
	expect(from.children[2]).toBe(empty)
	expect([...from.children].map((element) => element.id)).toEqual(["new", "changed", "also-changed"])
})

test("keyAttribute is safe when a form field shadows getAttribute", () => {
	const from = dom(
		`<main><section><form data-key="form"><input name="getAttribute" value="kept"></form></section><aside></aside></main>`,
	)
	const form = from.querySelector("form")!

	morph(
		from,
		`<main><section></section><aside><form data-key="form" class="moved"><input name="getAttribute" value="kept"></form></aside></main>`,
		{ keyAttribute: "data-key" },
	)

	expect(from.querySelector("aside form")).toBe(form)
	expect(form.className).toBe("moved")
})

test("keyAttribute is escaped when selecting keyed descendants", () => {
	const from = dom(`<main><section><p data:key="item">old</p></section><aside></aside></main>`)
	const item = from.querySelector("p")!

	morph(from, `<main><section></section><aside><p data:key="item">new</p></aside></main>`, {
		keyAttribute: "data:key",
	})

	expect(from.querySelector("aside p")).toBe(item)
	expect(item.textContent).toBe("new")
})

test("the default id key does not require CSS.escape", () => {
	const escape = CSS.escape
	CSS.escape = () => {
		throw new Error("CSS.escape was called")
	}

	try {
		const from = dom(`<main><section><p id="item">old</p></section><aside></aside></main>`)
		const item = from.querySelector("p")!

		morph(from, `<main><section></section><aside><p id="item">new</p></aside></main>`)

		expect(from.querySelector("aside p")).toBe(item)
		expect(item.textContent).toBe("new")
	} finally {
		CSS.escape = escape
	}
})

test("keyAttribute cannot be empty", () => {
	const from = dom(`<p>old</p>`)

	expect(() => morph(from, `<p>new</p>`, { keyAttribute: "" })).toThrowError("keyAttribute must not be empty")
})
