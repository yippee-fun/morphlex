import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

test("a ticked checkbox naming its form keeps its tick when the morph is rooted inside the form", () => {
	const host = mount(`<form id="f"><div><input type="checkbox" name="c" value="1" form="f"></div></form>`)
	const div = host.querySelector("div")!
	const box = div.querySelector("input")!
	box.checked = true

	morph(div, `<div><input type="checkbox" name="c" value="1" form="f" class="x"></div>`, { preserveChanges: true })

	expect(div.querySelector("input")).toBe(box)
	expect(box.checked).toBe(true)
	expect(box.className).toBe("x")
	host.remove()
})

test("a ticked checkbox naming its form keeps its tick when the form is inner-morphed", () => {
	const host = mount(`<form id="f"><input type="checkbox" name="c" value="1" form="f"></form>`)
	const form = host.querySelector("form")!
	const box = form.querySelector("input")!
	box.checked = true

	morphInner(form, `<form><input type="checkbox" name="c" value="1" form="f" class="x"></form>`, { preserveChanges: true })

	expect(form.querySelector("input")).toBe(box)
	expect(box.checked).toBe(true)
	expect(box.className).toBe("x")
	host.remove()
})

test("a ticked label naming its form keeps its tick when a label is inserted before it inside the form", () => {
	const host = mount(`<form id="f"><div><label><input type="checkbox" name="c" value="2" form="f"> Two</label></div></form>`)
	const div = host.querySelector("div")!
	const box = div.querySelector("input")!
	box.checked = true

	morph(
		div,
		`<div><label><input type="checkbox" name="c" value="1" form="f"> One</label><label><input type="checkbox" name="c" value="2" form="f"> Two</label></div>`,
		{ preserveChanges: true },
	)

	const boxes = div.querySelectorAll("input")
	expect(boxes[1]).toBe(box)
	expect(boxes[0]!.checked).toBe(false)
	expect(box.checked).toBe(true)
	host.remove()
})

test("a picked option in a select naming its form keeps its pick when the morph is rooted inside the form", () => {
	const host = mount(
		`<form id="f"><div><select name="s" form="f" multiple><option value="1">1</option><option value="2">2</option></select></div></form>`,
	)
	const div = host.querySelector("div")!
	const select = div.querySelector("select")!
	const option = select.options[1]!
	option.selected = true

	morph(
		div,
		`<div><select name="s" form="f" multiple><option value="0">0</option><option value="1">1</option><option value="2">2</option></select></div>`,
		{ preserveChanges: true },
	)

	expect(div.querySelector("select")).toBe(select)
	expect(select.options[2]).toBe(option)
	expect(option.selected).toBe(true)
	host.remove()
})

test("a ticked checkbox naming its form keeps its tick when the form is morphed", () => {
	const host = mount(`<form id="f"><input type="checkbox" name="c" value="1" form="f"></form>`)
	const form = host.querySelector("form")!
	const box = form.querySelector("input")!
	box.checked = true

	morph(form, `<form id="f"><input type="checkbox" name="c" value="1" form="f" class="x"></form>`, { preserveChanges: true })

	expect(form.querySelector("input")).toBe(box)
	expect(box.checked).toBe(true)
	host.remove()
})

test("a ticked checkbox naming another form isn't matched to a target naming the form it's in", () => {
	const host = mount(`<form id="g"></form><form id="f"><div><input type="checkbox" name="c" value="1" form="g"></div></form>`)
	const div = host.querySelector("div")!
	const box = div.querySelector("input")!
	box.checked = true

	morph(div, `<div><input type="checkbox" name="c" value="1" form="f"></div>`, { preserveChanges: true })

	expect(div.querySelector("input")).not.toBe(box)
	host.remove()
})

test("a picked option keeps its pick when its select is inner-morphed into one with another name and form", () => {
	const host = mount(
		`<form id="f"><select name="s" multiple><option value="1">1</option><option value="2">2</option></select></form>`,
	)
	const select = host.querySelector("select")!
	const option = select.options[1]!
	option.selected = true

	morphInner(
		select,
		`<select name="t" form="g" multiple><option value="0">0</option><option value="1">1</option><option value="2">2</option></select>`,
		{
			preserveChanges: true,
		},
	)

	expect(select.options[2]).toBe(option)
	expect(option.selected).toBe(true)
	host.remove()
})
