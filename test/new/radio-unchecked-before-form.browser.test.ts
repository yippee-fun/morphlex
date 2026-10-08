import { expect, onTestFinished, test } from "vitest"
import { morph } from "../../src/morphlex"

// A radio the markup checks can be unchecked by a radio the morph checks in its group, and then leave that
// group for the form its `form` attribute names, where the markup still checks it.

function mount(html: string): Element {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	onTestFinished(() => host.remove())
	return host.querySelector("#root")!
}

function checkedIds(root: Element): Array<string> {
	return Array.from(root.querySelectorAll("input"))
		.filter((input) => input.checked)
		.map((input) => input.id)
}

test("a radio unchecked by a new radio is checked again when a new form takes it to another group", () => {
	const root = mount(`<div id="root"><input id="b" type="radio" name="g" form="f" checked></div>`)

	morph(
		root,
		`<div id="root"><input id="a" type="radio" name="g" checked><input id="b" type="radio" name="g" form="f" checked><form id="f"></form></div>`,
	)

	expect(checkedIds(root)).toEqual(["a", "b"])
})

test("a radio unchecked by an input becoming a radio is checked again when a new form takes it to another group", () => {
	const root = mount(
		`<div id="root"><input id="b" type="radio" name="g" form="f" checked><input id="a" type="checkbox" name="g" checked></div>`,
	)

	morph(
		root,
		`<div id="root"><input id="a" type="radio" name="g" checked><input id="b" type="radio" name="g" form="f" checked><form id="f"></form></div>`,
	)

	expect(checkedIds(root)).toEqual(["a", "b"])
})

test("a radio unchecked by a new radio is checked again when a form's new id takes it to another group", () => {
	const root = mount(`<div id="root"><input id="b" type="radio" name="g" form="f" checked><form id="e"></form></div>`)

	morph(
		root,
		`<div id="root"><input id="a" type="radio" name="g" checked><input id="b" type="radio" name="g" form="f" checked><form id="f"></form></div>`,
	)

	expect(checkedIds(root)).toEqual(["a", "b"])
})
