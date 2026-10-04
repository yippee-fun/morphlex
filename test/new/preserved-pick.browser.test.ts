import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"
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

test("a wrapped select with the user's pick isn't paired with another wrapped select that has the same options", () => {
	const options = `<option value="a">a</option><option value="b">b</option>`
	const from = form(`<div><select name="x">${options}</select></div>`)
	from.querySelector("select")!.value = "b"

	morph(
		from,
		form(`<div><select name="y">${options}</select></div><div class="new"><select name="x">${options}</select></div>`),
		{
			preserveChanges: true,
		},
	)

	expect(new FormData(from).get("x")).toBe("b")
	expect(new FormData(from).get("y")).toBe("a")
})

test("a checkbox without a value keeps the user's tick when the target spells out its value", () => {
	const from = form(`<input type="checkbox" name="t" value="a"><input type="checkbox" name="t">`)
	const on = from.querySelector<HTMLInputElement>("input:not([value])")!
	on.checked = true

	morph(
		from,
		form(
			`<input type="checkbox" name="t" value="c"><input type="checkbox" name="t" value="a"><input type="checkbox" name="t" value="on">`,
		),
		{
			preserveChanges: true,
		},
	)

	expect(new FormData(from).getAll("t")).toEqual(["on"])
	expect(from.querySelector('[value="on"]')).toBe(on)
})

test("a radio whose name and value contain spaces keeps its own pick", () => {
	const from = form(`<input type="radio" name="a b" value="c"><input type="radio" name="a" value="b c">`)
	check(from, "b c")

	morph(
		from,
		form(`<input type="radio" name="a b" value="c" class="new"><input type="radio" name="a" value="b c" class="new">`),
		{
			preserveChanges: true,
		},
	)

	expect(new FormData(from).get("a")).toBe("b c")
	expect(new FormData(from).get("a b")).toBe(null)
})

test("a form with the user's tick isn't paired with another form holding the same choice", () => {
	const checkbox = `<input type="checkbox" name="t" value="x">`
	const from = dom(`<div><form action="/a">${checkbox}</form></div>`)
	const input = from.querySelector("input")!
	input.checked = true

	morph(from, dom(`<div><form action="/b">${checkbox}</form><form action="/a">${checkbox}<p>New</p></form></div>`), {
		preserveChanges: true,
	})

	expect(from.querySelector('[action="/a"] input')).toBe(input)
	expect(input.checked).toBe(true)
	expect(from.querySelector<HTMLInputElement>('[action="/b"] input')!.checked).toBe(false)
})

test("a label with the user's tick doesn't take a new label's target that has an id", () => {
	const checkbox = `<input type="checkbox" name="t" value="a">`
	const from = form(`<label>${checkbox}</label>`)
	const input = check(from, "a")

	morph(from, form(`<label id="new">${checkbox}</label><label class="changed">${checkbox}</label>`), { preserveChanges: true })

	expect(from.querySelector(".changed input")).toBe(input)
	expect(input.checked).toBe(true)
	expect(from.querySelector<HTMLInputElement>("#new input")!.checked).toBe(false)
})

test("a wrapper with several of the user's ticks takes the target holding all of them", () => {
	const a = `<input type="checkbox" name="t" value="a">`
	const b = `<input type="checkbox" name="t" value="b">`
	const from = form(`<div>${a}${b}</div>`)
	check(from, "a")
	check(from, "b")

	morph(from, form(`<div>${a}</div><div class="changed">${a}${b}</div>`), { preserveChanges: true })

	expect(Array.from(from.querySelectorAll<HTMLInputElement>(".changed input"), (input) => input.checked)).toEqual([true, true])
	expect(from.querySelector<HTMLInputElement>("div:not(.changed) input")!.checked).toBe(false)
})

test("a nested morph from a callback doesn't make the outer morph forget the user's pick", () => {
	const from = form(`<input type="radio" name="g" value="a"><input type="radio" name="g" value="b">`)
	const b = check(from, "b")
	let nested = false

	morph(
		from,
		form(
			`<input type="radio" name="g" value="c"><input type="radio" name="g" value="a"><input type="radio" name="g" value="b" class="new">`,
		),
		{
			preserveChanges: true,
			beforeChildrenVisited(element) {
				if (element === from && !nested) {
					nested = true
					morph(from, from.cloneNode(true) as Element, { preserveChanges: true })
				}
				return true
			},
		},
	)

	expect(nested).toBe(true)
	expect(new FormData(from).get("g")).toBe("b")
	expect(from.querySelector('[value="b"]')).toBe(b)
})

test("a wrapper with two identical ticked checkboxes takes the target holding both", () => {
	const checkbox = `<input type="checkbox" name="t" value="a">`
	const from = form(`<div>${checkbox}${checkbox}</div>`)
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(from, form(`<div>${checkbox}</div><div class="changed">${checkbox}${checkbox}</div>`), { preserveChanges: true })

	expect(Array.from(from.querySelectorAll<HTMLInputElement>(".changed input"), (input) => input.checked)).toEqual([true, true])
	expect(from.querySelector<HTMLInputElement>("div:not(.changed) input")!.checked).toBe(false)
})

test("labelled checkboxes for different forms keep their ticks when the labels swap", () => {
	const checkbox = (owner: string) => `<input type="checkbox" name="t" value="a" form="${owner}">`
	const host = dom(
		`<div><form id="x"></form><form id="y"></form><div><label>${checkbox("x")}</label><label>${checkbox("y")}</label></div></div>`,
	)
	document.body.append(host)
	const from = host.lastElementChild!
	const [x, y] = Array.from(from.querySelectorAll("input"))
	x!.checked = true
	y!.checked = true

	morph(from, dom(`<div><label>${checkbox("y")}<b>Y</b></label><label>${checkbox("x")}<b>X</b></label></div>`), {
		preserveChanges: true,
	})

	expect(from.querySelector('[form="x"]')).toBe(x)
	expect(from.querySelector('[form="y"]')).toBe(y)
	expect([x!.checked, y!.checked]).toEqual([true, true])
	host.remove()
})

test("a wrapper holding more of the user's ticks gets the target holding them all, even when it comes second", () => {
	const a = `<input type="checkbox" name="t" value="a">`
	const b = `<input type="checkbox" name="t" value="b">`
	const from = form(`<div>${a}</div><div>${a}${b}</div>`)
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(from, form(`<div class="changed">${a}${b}</div><div class="changed">${a}</div>`), { preserveChanges: true })

	expect(new FormData(from).getAll("t")).toEqual(["a", "b", "a"])
})

test("a label with the user's tick skips targets of another kind", () => {
	const checkbox = `<input type="checkbox" name="t" value="a">`
	const from = form(`<label>${checkbox}</label>`)
	const input = check(from, "a")

	morph(from, form(`<span>${checkbox}</span><label class="changed">${checkbox}</label>`), { preserveChanges: true })

	expect(from.querySelector(".changed input")).toBe(input)
	expect(input.checked).toBe(true)
})

test("a form with the user's ticks keeps them when another form holding all of them is prepended", () => {
	const x = `<input type="checkbox" name="t" value="x">`
	const y = `<input type="checkbox" name="t" value="y">`
	const from = dom(`<div><form action="/a">${x}${y}</form></div>`)
	const live = from.firstElementChild
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(from, dom(`<div><form action="/b">${x}${y}</form><form action="/a">${x}</form></div>`), { preserveChanges: true })

	expect(from.querySelector('[action="/a"]')).toBe(live)
	expect(new FormData(from.querySelector<HTMLFormElement>('[action="/a"]')!).getAll("t")).toEqual(["x"])
	expect(new FormData(from.querySelector<HTMLFormElement>('[action="/b"]')!).getAll("t")).toEqual([])
})

test("a label with the user's tick keeps it when the label gains an id", () => {
	const checkbox = `<input type="checkbox" name="t" value="a">`
	const from = form(`<label>${checkbox}</label>`)
	const input = check(from, "a")

	morph(from, form(`<label id="new">${checkbox}</label>`), { preserveChanges: true })

	expect(from.querySelector("#new input")).toBe(input)
	expect(input.checked).toBe(true)
})

test("wrappers with the user's ticks share out the targets so each keeps all of them", () => {
	const box = (value: string) => `<input type="checkbox" name="t" value="${value}">`
	const from = form(`<div>${box("a")}${box("b")}</div><div>${box("a")}${box("c")}</div>`)
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(
		from,
		form(`<div class="changed">${box("a")}${box("b")}${box("c")}</div><div class="changed">${box("a")}${box("b")}</div>`),
		{ preserveChanges: true },
	)

	expect(new FormData(from).getAll("t")).toEqual(["a", "c", "a", "b"])
})

test("morphing inside a select keeps the user's pick when its option changes", () => {
	const select = dom(
		`<select name="s"><optgroup><option value="a">a</option><option value="b">b</option></optgroup></select>`,
	) as HTMLSelectElement
	select.value = "b"

	morphInner(
		select.firstElementChild!,
		`<optgroup><option value="c">c</option><option value="a">a</option><option value="b">B!</option></optgroup>`,
		{
			preserveChanges: true,
		},
	)

	expect(select.value).toBe("b")
	expect(select.selectedOptions[0]!.text).toBe("B!")
})

test("a wrapper with the user's tick takes the smallest target holding it", () => {
	const box = (value: string) => `<input type="checkbox" name="t" value="${value}">`
	const from = form(`<div>${box("a")}</div>`)
	const input = check(from, "a")

	morph(from, form(`<div class="changed">${box("a")}</div><div class="changed">${box("a")}${box("b")}</div>`), {
		preserveChanges: true,
	})

	expect(from.firstElementChild!.firstElementChild).toBe(input)
	expect(new FormData(from).getAll("t")).toEqual(["a"])
})

test("equal-sized wrappers with the user's ticks each find a target holding all of them", () => {
	const box = (value: string) => `<input type="checkbox" name="t" value="${value}">`
	const from = form(`<div>${box("a")}${box("b")}</div><div>${box("a")}${box("c")}</div>`)
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(
		from,
		form(
			`<div class="changed">${box("a")}${box("b")}${box("c")}</div><div class="changed">${box("a")}${box("b")}${box("d")}</div>`,
		),
		{ preserveChanges: true },
	)

	expect(new FormData(from).getAll("t")).toEqual(["a", "c", "a", "b"])
})

test("a customized label with the user's tick only takes a target with the same is", () => {
	const checkbox = (value: string) => `<input type="checkbox" name="t" value="${value}">`
	const from = form(`<label is="x-a">${checkbox("a")}</label>`)
	const input = check(from, "a")

	morph(from, form(`<label is="x-a" data-new>${checkbox("a")}${checkbox("b")}</label><label is="x-b">${checkbox("a")}</label>`), {
		preserveChanges: true,
	})

	expect(from.querySelector('[is="x-a"] input')).toBe(input)
	expect(input.checked).toBe(true)
})

test("when two labels with the user's tick want one target, the first keeps it", () => {
	const checkbox = `<input type="checkbox" name="t" value="a">`
	const from = form(`<label>${checkbox}</label><label>${checkbox}</label>`)
	const [first] = Array.from(from.querySelectorAll("input"))
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(from, form(`<label class="changed">${checkbox}</label>`), { preserveChanges: true })

	expect(from.querySelector("input")).toBe(first)
	expect(new FormData(from).getAll("t")).toEqual(["a"])
})

test("a changed checkbox is morphed into a clobbered target with another value", () => {
	const from = form(`<input type="checkbox" name="t" value="a">`)
	const input = check(from, "a")

	morph(from, form(`<input type="checkbox" name="t" value="b" morphlex-clobber>`), { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("b")
	expect(input.checked).toBe(false)
})
