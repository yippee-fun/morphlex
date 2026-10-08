import { expect, onTestFinished, test } from "vitest"
import { morph } from "../../src/morphlex"

// Firefox keeps whether the user changed a radio for its whole group, and a radio picks that up when it joins one.
// Moving a form briefly drops the radios naming it into the group of radios without a form, so a pick there must
// not stop them following their `checked` attribute.

function mount(html: string): HTMLElement {
	const host = document.createElement("section")
	host.innerHTML = html
	document.body.append(host)
	onTestFinished(() => host.remove())
	return host
}

test("a radio naming a moved form follows its markup after the user picks a radio without a form", () => {
	const host = mount(
		`<input id="p" type="radio" name="a"><form id="f"></form><i></i><i></i><input id="q" type="radio" name="a" form="f">`,
	)
	host.querySelector<HTMLInputElement>("#p")!.checked = true

	morph(
		host,
		`<section><input id="p" type="radio" name="a"><i></i><i></i><form id="f"></form><input id="q" type="radio" name="a" form="f" checked></section>`,
		{ preserveChanges: true },
	)

	expect(host.querySelector<HTMLInputElement>("#p")!.checked).toBe(true)
	expect(host.querySelector<HTMLInputElement>("#q")!.checked).toBe(true)
})

test("a radio inside a moved element naming a form in it follows its markup after the user picks a radio without a form", () => {
	const host = mount(
		`<input id="p" type="radio" name="a"><div id="d"><form id="f"></form><input id="q" type="radio" name="a" form="f"></div><i></i><i></i>`,
	)
	host.querySelector<HTMLInputElement>("#p")!.checked = true

	morph(
		host,
		`<section><input id="p" type="radio" name="a"><i></i><i></i><div id="d"><form id="f"></form><input id="q" type="radio" name="a" form="f" checked></div></section>`,
		{ preserveChanges: true },
	)

	expect(host.querySelector<HTMLInputElement>("#p")!.checked).toBe(true)
	expect(host.querySelector<HTMLInputElement>("#q")!.checked).toBe(true)
})

test("a checked radio naming a moved form follows its markup after the user picks a radio without a form", () => {
	const host = mount(
		`<input id="p" type="radio" name="a"><form id="f"></form><i></i><i></i><input id="q" type="radio" name="a" form="f" checked>`,
	)
	host.querySelector<HTMLInputElement>("#p")!.checked = true

	morph(
		host,
		`<section><input id="p" type="radio" name="a"><i></i><i></i><form id="f"></form><input id="q" type="radio" name="a" form="f"></section>`,
		{ preserveChanges: true },
	)

	expect(host.querySelector<HTMLInputElement>("#p")!.checked).toBe(true)
	expect(host.querySelector<HTMLInputElement>("#q")!.checked).toBe(false)
})
