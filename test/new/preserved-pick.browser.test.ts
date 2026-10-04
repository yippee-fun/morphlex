import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

function form(html: string): HTMLFormElement {
	return dom(`<form>${html}</form>`) as HTMLFormElement
}

function check(root: Element, value: string): HTMLInputElement {
	const input = root.querySelector<HTMLInputElement>(`[value="${value}"]`)!
	input.checked = !input.checked
	return input
}

test("prepending a radio keeps the user's pick", () => {
	const from = form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`)
	const b = check(from, "b")

	morph(
		from,
		form(`<input type="radio" name="g" value="c"><input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`),
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("g")).toBe("b")
	expect(from.querySelector('[value="b"]')).toBe(b)
})

test("prepending a checkbox keeps the user's ticks", () => {
	const from = form(`<input type="checkbox" name="t" value="a"><input type="checkbox" name="t" value="b">`)
	check(from, "b")

	morph(
		from,
		form(
			`<input type="checkbox" name="t" value="c"><input type="checkbox" name="t" value="a"><input type="checkbox" name="t" value="b">`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).getAll("t")).toEqual(["b"])
})

test("prepending a checkbox keeps a box the user unticked", () => {
	const from = form(`<input type="checkbox" name="t" value="a"><input type="checkbox" name="t" value="b" checked>`)
	check(from, "b")

	morph(
		from,
		form(
			`<input type="checkbox" name="t" value="c" checked><input type="checkbox" name="t" value="a"><input type="checkbox" name="t" value="b" checked>`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).getAll("t")).toEqual(["c"])
})

test("prepending an option keeps the user's pick", () => {
	const from = dom(`<select name="s"><option value="a">a</option><option value="b">b</option></select>`) as HTMLSelectElement
	from.value = "b"

	morph(
		from,
		dom(`<select name="s"><option value="c">c</option><option value="a">a</option><option value="b">b</option></select>`),
		{ preserveChanges: true },
	)

	expect(from.value).toBe("b")
})

test("prepending a labelled radio keeps the user's pick", () => {
	const from = form(
		`<label><input type="radio" name="g" value="a"><b>A</b></label><label><input type="radio" name="g" value="b"><b>B</b></label>`,
	)
	check(from, "b")

	morph(
		from,
		form(
			`<label><input type="radio" name="g" value="c"><b>C</b></label><label><input type="radio" name="g" value="a"><b>A</b></label><label><input type="radio" name="g" value="b"><b>B</b></label>`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("g")).toBe("b")
})

test("prepending a radio keeps the user's pick when its markup also changes", () => {
	const from = form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`)
	const b = check(from, "b")

	morph(
		from,
		form(
			`<input type="radio" name="g" value="c"><input type="radio" name="g" value="a"><input type="radio" name="g" value="b" class="new">`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("g")).toBe("b")
	expect(from.querySelector('[value="b"]')).toBe(b)
	expect(b.className).toBe("new")
})

test("prepending an option keeps the user's pick when its text also changes", () => {
	const from = dom(`<select name="s"><option value="a">a</option><option value="b">b</option></select>`) as HTMLSelectElement
	from.value = "b"

	morph(
		from,
		dom(`<select name="s"><option value="c">c</option><option value="a">a</option><option value="b">B!</option></select>`),
		{ preserveChanges: true },
	)

	expect(from.value).toBe("b")
	expect(from.selectedOptions[0]!.text).toBe("B!")
})

test("removing the radio the user picked doesn't pass the pick to another value", () => {
	const from = form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`)
	check(from, "b")

	morph(from, form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="c">`), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe(null)
})

test("without preserveChanges, prepending a radio resets the user's pick", () => {
	const from = form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`)
	const b = check(from, "b")

	morph(
		from,
		form(
			`<input type="radio" name="g" value="c"><input type="radio" name="g" value="a" checked><input type="radio" name="g" value="b">`,
		),
	)

	expect(new FormData(from).get("g")).toBe("a")
	expect(from.querySelector('[value="b"]')).toBe(b)
})

test("a radio whose value changes is still morphed in place", () => {
	const from = form(`<input type="radio" name="g" value="a">`)
	const radio = from.firstElementChild

	morph(from, form(`<input type="radio" name="g" value="b">`), { preserveChanges: true })

	expect(from.firstElementChild).toBe(radio)
	expect(from.querySelector("input")!.value).toBe("b")
})

test("a changed control isn't paired with a target that puts another element in its place", () => {
	const from = dom(`<div><p><input type="checkbox" name="x"></p></div>`)
	from.querySelector("input")!.checked = true

	morph(from, dom(`<div><p><select name="x"></select></p><p><input type="checkbox" name="x"></p></div>`), {
		preserveChanges: true,
	})

	expect(from.querySelector("select")).not.toBe(null)
	expect(from.querySelector("input")!.checked).toBe(true)
})

test("a changed control's parent isn't paired with an element of the same name in another namespace", () => {
	const from = dom(`<div><p><input type="checkbox" name="x"></p></div>`)
	from.querySelector("input")!.checked = true
	const target = document.createElementNS("http://www.w3.org/2000/svg", "p")
	target.append(dom(`<input type="checkbox" name="x">`))
	const to = document.createElement("div")
	to.append(target)

	morph(from, to, { preserveChanges: true })

	expect(from.firstElementChild!.namespaceURI).toBe("http://www.w3.org/2000/svg")
})

test("labelled checkboxes keep the user's ticks when one is prepended and the labels change", () => {
	const from = form(
		`<label><input type="checkbox" name="t" value="a"><b>A</b></label><label><input type="checkbox" name="t" value="b" checked><b>B</b></label>`,
	)
	check(from, "a")
	check(from, "b")

	morph(
		from,
		form(
			`<label class="new"><input type="checkbox" name="t" value="c"><b>C</b></label><label class="new"><input type="checkbox" name="t" value="a"><b>A</b></label><label class="new"><input type="checkbox" name="t" value="b" checked><b>B</b></label>`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).getAll("t")).toEqual(["a"])
})

test("a select with the user's pick isn't paired with another select that has the same options", () => {
	const options = `<option value="a">a</option><option value="b">b</option>`
	const from = form(`<select name="x">${options}</select>`)
	from.querySelector("select")!.value = "b"

	morph(from, form(`<select name="y">${options}</select><select name="x">${options}</select>`), { preserveChanges: true })

	expect(new FormData(from).get("x")).toBe("b")
	expect(new FormData(from).get("y")).toBe("a")
})
