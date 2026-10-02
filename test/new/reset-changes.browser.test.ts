import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function dom(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

test("typed value is reset when neither side has a value attribute", () => {
	const from = dom(`<div><input type="text" name="q"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><input type="text" name="q"></div>`))

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("")
	expect(input.hasAttribute("value")).toBe(false)
})

test("checked checkbox is reset when neither side has a checked attribute", () => {
	const from = dom(`<div><input type="checkbox" name="x"></div>`)
	const input = from.querySelector("input")!
	input.checked = true

	morph(from, dom(`<div><input type="checkbox" name="x"></div>`))

	expect(from.querySelector("input")).toBe(input)
	expect(input.checked).toBe(false)
	expect(input.hasAttribute("value")).toBe(false)
	expect(input.value).toBe("on")
})

test("unchecked checkbox is reset when both sides have a checked attribute", () => {
	const from = dom(`<div><input type="checkbox" name="x" checked></div>`)
	const input = from.querySelector("input")!
	input.checked = false

	morph(from, dom(`<div><input type="checkbox" name="x" checked></div>`))

	expect(input.checked).toBe(true)
})

test("option selection is reset when neither side has a selected attribute", () => {
	const from = dom(`<select><option>a</option><option>b</option></select>`) as HTMLSelectElement
	from.selectedIndex = 1

	morph(from, dom(`<select><option>a</option><option>b</option></select>`))

	expect(from.selectedIndex).toBe(0)
})

test("user changes survive when preserveChanges is true", () => {
	const from = dom(
		`<form><input type="text" name="q"><input type="checkbox" name="x"><select><option>a</option><option>b</option></select></form>`,
	)
	const text = from.querySelector<HTMLInputElement>("input[type=text]")!
	const checkbox = from.querySelector<HTMLInputElement>("input[type=checkbox]")!
	const select = from.querySelector("select")!
	text.value = "typed"
	checkbox.checked = true
	select.selectedIndex = 1

	morph(
		from,
		dom(
			`<form><input type="text" name="q"><input type="checkbox" name="x"><select><option>a</option><option>b</option></select></form>`,
		),
		{ preserveChanges: true },
	)

	expect(text.value).toBe("typed")
	expect(checkbox.checked).toBe(true)
	expect(select.selectedIndex).toBe(1)
})

test("vetoed value attribute keeps the typed value", () => {
	const from = dom(`<input type="text" value="a">`) as HTMLInputElement
	from.value = "typed"

	morph(from, dom(`<input type="text" value="b">`), {
		beforeAttributeUpdated: (_element, name) => name !== "value",
	})

	expect(from.getAttribute("value")).toBe("a")
	expect(from.value).not.toBe("a")
})

test("vetoed checked and selected attributes are not reset", () => {
	const from = dom(`<div><input type="checkbox" checked><select><option>a</option><option selected>b</option></select></div>`)
	const checkbox = from.querySelector("input")!
	const select = from.querySelector("select")!
	checkbox.checked = false
	select.selectedIndex = 0

	morph(from, dom(`<div><input type="checkbox"><select><option>a</option><option>b</option></select></div>`), {
		beforeAttributeUpdated: (_element, name) => name !== "checked" && name !== "selected",
	})

	expect(checkbox.hasAttribute("checked")).toBe(true)
	expect(checkbox.checked).toBe(false)
	expect(select.selectedIndex).toBe(0)
})

test("hidden input value is left alone", () => {
	const from = dom(`<div><input type="hidden" name="h"></div>`)
	const input = from.querySelector("input")!

	morph(from, dom(`<div><input type="hidden" name="h" class="x"></div>`))

	expect(input.hasAttribute("value")).toBe(false)
	expect(input.value).toBe("")
})

test("reset checkbox follows later markup when preserving changes", () => {
	const from = dom(`<div><input type="checkbox" name="x" value="1"></div>`)
	const input = from.querySelector("input")!
	input.checked = true

	morph(from, dom(`<div><input type="checkbox" name="x" value="1"></div>`))
	morph(from, dom(`<div><input type="checkbox" name="x" value="1" checked></div>`), { preserveChanges: true })

	expect(input.checked).toBe(true)
})

test("reset text input follows later markup when preserving changes", () => {
	const from = dom(`<div><input type="text" name="q"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><input type="text" name="q"></div>`))
	morph(from, dom(`<div><input type="text" name="q" value="new"></div>`), { preserveChanges: true })

	expect(input.value).toBe("new")
})

test("reset option follows later markup when preserving changes", () => {
	const from = dom(`<select><option>a</option><option>b</option></select>`) as HTMLSelectElement
	from.selectedIndex = 1

	morph(from, dom(`<select><option>a</option><option>b</option></select>`))
	morph(from, dom(`<select><option>a</option><option selected>b</option></select>`), { preserveChanges: true })

	expect(from.selectedIndex).toBe(1)
})

test("untouched root option is not flagged dirty", () => {
	const from = dom(`<option>a</option>`) as HTMLOptionElement

	morph(from, dom(`<option>b</option>`))

	expect(from.textContent).toBe("b")
	expect(from.selected).toBe(false)
})
