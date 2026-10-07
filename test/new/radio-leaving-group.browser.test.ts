import { expect, onTestFinished, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// A radio the morph checks while it's still in the group it then leaves must not uncheck that group for good.

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	onTestFinished(() => host.remove())
	return host
}

function checked(host: Element, id: string): boolean {
	return host.querySelector<HTMLInputElement>(`#${id}`)!.checked
}

test("a radio checked before its name changes leaves its old group's radio checked", () => {
	const host = mount(`<input type="radio" id="x" name="a"><input type="radio" id="y" name="a" checked>`)

	morphInner(host, `<div><input checked type="radio" id="x" name="b"><input type="radio" id="y" name="a" checked></div>`)

	expect(checked(host, "x")).toBe(true)
	expect(checked(host, "y")).toBe(true)
})

test("a radio reset to checked before a form id change moves it leaves its old group's radio checked", () => {
	const host = mount(
		`<input type="radio" id="x" name="b" form="f3" checked><input type="radio" id="y" name="b" checked><form id="f2"></form>`,
	)
	expect(checked(host, "x")).toBe(false)

	morphInner(
		host,
		`<div><input type="radio" id="x" name="b" form="f3" checked><input type="radio" id="y" name="b" checked><form id="f3"></form></div>`,
	)

	expect(checked(host, "x")).toBe(true)
	expect(checked(host, "y")).toBe(true)
})

test("a new radio added before the form it names leaves its old group's radio checked", () => {
	const host = mount(`<input type="radio" id="y" name="b" checked><div id="root"></div>`)

	morph(
		host.querySelector("#root")!,
		`<div id="root"><input type="radio" id="x" name="b" form="f1" checked><form id="f1"></form></div>`,
	)

	expect(checked(host, "x")).toBe(true)
	expect(checked(host, "y")).toBe(true)
})
