import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function dom(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

function veto(attribute: string) {
	return { beforeAttributeUpdated: (_element: Element, name: string) => name !== attribute }
}

test("vetoed value change leaves the value alone", () => {
	const from = dom(`<input type="text" value="a">`) as HTMLInputElement

	morph(from, dom(`<input type="text" value="b">`), veto("value"))

	expect(from.getAttribute("value")).toBe("a")
	expect(from.value).toBe("a")
})

test("vetoed value addition leaves the value alone", () => {
	const from = dom(`<input type="text">`) as HTMLInputElement

	morph(from, dom(`<input type="text" value="b">`), veto("value"))

	expect(from.hasAttribute("value")).toBe(false)
	expect(from.value).toBe("")
})

test("vetoed checked addition leaves the checkbox unchecked", () => {
	const from = dom(`<input type="checkbox">`) as HTMLInputElement

	morph(from, dom(`<input type="checkbox" checked>`), veto("checked"))

	expect(from.hasAttribute("checked")).toBe(false)
	expect(from.checked).toBe(false)
})

test("vetoed checked removal leaves the checkbox checked", () => {
	const from = dom(`<input type="checkbox" checked>`) as HTMLInputElement

	morph(from, dom(`<input type="checkbox">`), veto("checked"))

	expect(from.hasAttribute("checked")).toBe(true)
	expect(from.checked).toBe(true)
})

test("vetoed selected addition leaves the option unselected", () => {
	const from = dom(`<select><option>a</option><option>b</option></select>`) as HTMLSelectElement

	morph(from, dom(`<select><option>a</option><option selected>b</option></select>`), veto("selected"))

	expect(from.options[1]!.hasAttribute("selected")).toBe(false)
	expect(from.selectedIndex).toBe(0)
})

test("vetoed selected removal leaves the option selected", () => {
	const from = dom(`<select><option>a</option><option selected>b</option></select>`) as HTMLSelectElement

	morph(from, dom(`<select><option>a</option><option>b</option></select>`), veto("selected"))

	expect(from.options[1]!.hasAttribute("selected")).toBe(true)
	expect(from.selectedIndex).toBe(1)
})
