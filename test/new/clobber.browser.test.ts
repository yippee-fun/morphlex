import { expect, test } from "vitest"
import { morph, morphDocument, morphInner } from "../../src/morphlex"

function dom(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

test("clobber on a form discards user changes to every field inside it", () => {
	const from = dom(
		`<form><input type="text" name="q"><input type="checkbox" name="x"><select name="s"><option>a</option><option>b</option></select><textarea name="t"></textarea></form>`,
	)
	const text = from.querySelector<HTMLInputElement>("input[type=text]")!
	const checkbox = from.querySelector<HTMLInputElement>("input[type=checkbox]")!
	const select = from.querySelector("select")!
	const textarea = from.querySelector("textarea")!
	text.value = "typed"
	checkbox.checked = true
	select.selectedIndex = 1
	textarea.value = "typed"

	morph(
		from,
		dom(
			`<form morphlex-clobber><input type="text" name="q"><input type="checkbox" name="x"><select name="s"><option>a</option><option>b</option></select><textarea name="t"></textarea></form>`,
		),
		{ preserveChanges: true },
	)

	expect(from.querySelector("input[type=text]")).toBe(text)
	expect(from.querySelector("select")).toBe(select)
	expect(from.querySelector("textarea")).toBe(textarea)
	expect(text.value).toBe("")
	expect(checkbox.checked).toBe(false)
	expect(select.selectedIndex).toBe(0)
	expect(textarea.value).toBe("")
	expect(from.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber on a field applies the new value from the markup", () => {
	const from = dom(`<div><input type="text" name="q" value="old"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><input type="text" name="q" value="new" morphlex-clobber></div>`), { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("new")
	expect(input.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber only affects the marked element and its descendants", () => {
	const from = dom(`<div><input name="a"><input name="b"></div>`)
	const [a, b] = from.querySelectorAll("input")
	a!.value = "typed a"
	b!.value = "typed b"

	morph(from, dom(`<div><input name="a" morphlex-clobber><input name="b"></div>`), { preserveChanges: true })

	expect(a!.value).toBe("")
	expect(b!.value).toBe("typed b")
	expect(a!.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber applies once and later morphs preserve changes again", () => {
	const from = dom(`<form><input name="q"></form>`)
	const input = from.querySelector("input")!
	input.value = "first"

	morph(from, dom(`<form morphlex-clobber><input name="q"></form>`), { preserveChanges: true })
	expect(input.value).toBe("")

	input.value = "second"
	morph(from, dom(`<form><input name="q"></form>`), { preserveChanges: true })
	expect(input.value).toBe("second")
})

test("clobber discards a user toggled details open state", () => {
	const from = dom(`<div><details><summary>s</summary></details></div>`)
	const details = from.querySelector("details")!
	details.open = true

	morph(from, dom(`<div><details morphlex-clobber><summary>s</summary></details></div>`), { preserveChanges: true })

	expect(details.open).toBe(false)
	expect(details.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber is removed from newly inserted elements", () => {
	const from = dom(`<div><p>a</p></div>`)

	morph(from, dom(`<div><p>a</p><form morphlex-clobber><input morphlex-clobber></form></div>`), { preserveChanges: true })

	expect(from.querySelector("form")).not.toBeNull()
	expect(from.querySelector("[morphlex-clobber]")).toBeNull()
})

test("clobber is removed from a replaced element", () => {
	const parent = dom(`<div><span>a</span></div>`)
	const from = parent.firstElementChild!

	morph(from, `<form morphlex-clobber><input></form>`, { preserveChanges: true })

	expect(parent.querySelector("form")).not.toBeNull()
	expect(parent.querySelector("[morphlex-clobber]")).toBeNull()
})

test("clobber works across several target nodes", () => {
	const parent = dom(`<div><input name="a"></div>`)
	const input = parent.querySelector("input")!
	input.value = "typed"

	morph(input, `<input name="a" morphlex-clobber><input name="b" morphlex-clobber>`, { preserveChanges: true })

	expect(parent.querySelector("input")).toBe(input)
	expect(input.value).toBe("")
	expect(parent.querySelectorAll("input")).toHaveLength(2)
	expect(parent.querySelector("[morphlex-clobber]")).toBeNull()
})

test("clobber is stripped even when preserveChanges is off", () => {
	const from = dom(`<div><input name="q"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div morphlex-clobber><input name="q"></div>`))

	expect(input.value).toBe("")
	expect(from.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber on the morphInner target applies to all its children", () => {
	const from = dom(`<form><input name="q"></form>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morphInner(from, `<form morphlex-clobber><input name="q"></form>`, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("")
	expect(from.hasAttribute("morphlex-clobber")).toBe(false)
})

test("clobber on a morphInner descendant only applies to that descendant", () => {
	const from = dom(`<div><input name="a"><input name="b"></div>`)
	const [a, b] = from.querySelectorAll("input")
	a!.value = "typed a"
	b!.value = "typed b"

	morphInner(from, `<div><input name="a" morphlex-clobber><input name="b"></div>`, { preserveChanges: true })

	expect(a!.value).toBe("")
	expect(b!.value).toBe("typed b")
	expect(from.querySelector("[morphlex-clobber]")).toBeNull()
})

test("clobber works with morphDocument", () => {
	const from = document.implementation.createHTMLDocument()
	from.body.innerHTML = `<form><input name="q"></form>`
	const input = from.querySelector("input")!
	input.value = "typed"

	morphDocument(from, `<html><head></head><body><form morphlex-clobber><input name="q"></form></body></html>`, {
		preserveChanges: true,
	})

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("")
	expect(from.querySelector("[morphlex-clobber]")).toBeNull()
})
