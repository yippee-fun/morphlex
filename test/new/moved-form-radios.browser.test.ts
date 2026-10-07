import { expect, onTestFinished, test } from "vitest"
import { morph } from "../../src/morphlex"

// Chromium and Firefox briefly reset the form of a radio with a `form` attribute while an ancestor of it moves.
// A checked one then joins another group for that moment and unchecks the radio there.

function mount(html: string): HTMLElement {
	const host = document.createElement("section")
	host.innerHTML = html
	document.body.append(host)
	onTestFinished(() => host.remove())
	return host
}

function checked(host: Element, selector: string): boolean {
	return host.querySelector<HTMLInputElement>(selector)!.checked
}

test("moving a form holding a checked radio of another form keeps the user's pick in the moved form", () => {
	const host = mount(
		`<form id="f1"><input type="radio" name="b" value="1" id="c0"><input type="radio" name="b" value="2" checked form="f2"></form><form id="f2"></form><p></p>`,
	)
	host.querySelector<HTMLInputElement>("#c0")!.checked = true

	morph(
		host,
		`<section><form id="f2"></form><p></p><form id="f1"><input type="radio" name="b" value="1" id="c0"><input type="radio" name="b" value="2" checked form="f2"></form></section>`,
		{ preserveChanges: true },
	)

	expect(checked(host, "#c0")).toBe(true)
	expect(checked(host, "input[value='2']")).toBe(true)
})

test("moving a form holding a checked radio of a missing form keeps the user's pick in the moved form", () => {
	const form = `<form id="f1"><input type="radio" class="x" value="1" name="a"><input id="c0" value="3" checked name="a" type="radio" form="missing"></form>`
	const host = mount(`<select id="c1" name="u"><option>3</option></select>${form}`)
	host.querySelector<HTMLInputElement>("input.x")!.checked = true

	morph(host, `<section>${form}<select id="c1" name="u"><option>3</option></select></section>`, { preserveChanges: true })

	expect(checked(host, "input.x")).toBe(true)
	expect(checked(host, "#c0")).toBe(true)
})

test("moving a form holding a radio the user checked that names the form keeps a formless radio checked", () => {
	const html = `<input type="radio" name="a" value="3" checked id="c0"><p></p>`
	const form = `<form id="f1"><input type="radio" name="a" value="1" form="f1" id="c2"></form>`

	for (const preserveChanges of [false, true]) {
		const host = mount(`${html}${form}`)
		host.querySelector<HTMLInputElement>("#c2")!.checked = true

		morph(host, `<section>${form}${html}</section>`, { preserveChanges })

		expect(checked(host, "#c0")).toBe(true)
		expect(checked(host, "#c2")).toBe(preserveChanges)
	}
})

test("moving a form holding a checked radio that names the form keeps an untouched formless radio checked", () => {
	const form = `<form id="f1"><input form="f1" name="a" value="3" type="radio" checked></form>`
	const radio = `<input type="radio" checked name="a" value="1">`
	const host = mount(`<input name="u" type="email">${form}${radio}`)
	host.querySelector<HTMLInputElement>("input[type=email]")!.value = "typed"

	morph(host, `<section>${form}<input name="u" type="email">${radio}</section>`, { preserveChanges: true })

	expect(checked(host, "input[value='1']")).toBe(true)
	expect(checked(host, "input[value='3']")).toBe(true)
})

test("moving a form holding a radio the user checked that names the form keeps a radio of a missing form checked", () => {
	const radio = `<input id="c0" type="radio" name="a" form="missing" checked>`
	const form = `<form id="f1"><input type="radio" name="a" value="1" form="f1" id="c2"></form>`
	const host = mount(`${radio}<p></p>${form}`)
	host.querySelector<HTMLInputElement>("#c2")!.checked = true

	morph(host, `<section>${form}${radio}<p></p></section>`)

	expect(checked(host, "#c0")).toBe(true)
	expect(checked(host, "#c2")).toBe(false)
})

test("removing a form holding a radio the user checked that names the form keeps a formless radio checked", () => {
	const html = `<input type="radio" name="b" checked id="c1">`
	const host = mount(`${html}<form id="f1"><input type="radio" name="b" form="f1" id="r6"></form>`)
	host.querySelector<HTMLInputElement>("#r6")!.checked = true

	morph(host, `<section>${html}</section>`)

	expect(checked(host, "#c1")).toBe(true)
})

test("moving a form holding a radio the user checked that names a missing form keeps the form's radio checked", () => {
	const form = `<form><input id="c2" name="a" type="radio" checked value="2"><input id="c4" name="a" type="radio" form="missing" value="3"></form>`
	const checkbox = `<input id="c3" type="checkbox" checked>`
	const host = mount(`${checkbox}${form}`)
	host.querySelector<HTMLInputElement>("#c4")!.checked = true

	morph(host, `<section>${form}${checkbox}</section>`)

	expect(checked(host, "#c2")).toBe(true)
	expect(checked(host, "#c4")).toBe(false)
})
