import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// Radio groups are synced to the markup when a morph resets a radio or moves one. Each test sets
// every radio's checkedness itself and checks the whole group.

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

function parse(html: string): Element {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild!
}

function radio(host: Element, id: string): HTMLInputElement {
	return host.querySelector<HTMLInputElement>(`#${id}`)!
}

function checkedIds(host: Element): string {
	return [...host.querySelectorAll<HTMLInputElement>("input")]
		.filter((input) => input.checked)
		.map((input) => input.id)
		.join(" ")
}

test("resetting a radio checks the last radio its form's markup checks", () => {
	const html = `<div><form><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"><input id="c" type="radio" name="r" checked></form></div>`
	const host = mount(html)
	radio(host, "a").checked = false
	radio(host, "c").checked = false
	radio(host, "b").checked = true

	morph(host.firstElementChild!, parse(html))

	expect(checkedIds(host)).toBe("c")
	host.remove()
})

test("resetting a radio outside a form syncs its group in the document", () => {
	const html = `<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`
	const host = mount(html)
	radio(host, "a").checked = false
	radio(host, "b").checked = true

	morph(host.firstElementChild!, parse(html))

	expect(checkedIds(host)).toBe("a")
	host.remove()
})

test("a radio without a name is its own group", () => {
	const html = `<div><input id="a" type="radio" checked><input id="b" type="radio"></div>`
	const host = mount(html)
	radio(host, "a").checked = false
	radio(host, "b").checked = true

	morph(host.firstElementChild!, parse(html))

	expect(checkedIds(host)).toBe("a")
	host.remove()
})

test("radios outside the morph keep their checkedness", () => {
	const host = mount(
		`<p><input id="before" type="radio" name="r"></p><input id="first" type="radio" name="r"><div><input id="a" type="radio" name="r" checked></div><input id="last" type="radio" name="r"><p><input id="after" type="radio" name="r"></p>`,
	)
	for (const id of ["before", "first", "last", "after"]) radio(host, id).checked = true
	radio(host, "a").checked = false

	morph(host.querySelector("div")!, parse(`<div><input id="a" type="radio" name="r" checked></div>`))

	expect(radio(host, "a").checked).toBe(true)
	expect(radio(host, "before").hasAttribute("checked")).toBe(false)
	host.remove()
})

test("an inner morph syncs only the radios inside the element", () => {
	const host = mount(`<input id="outside" type="radio" name="r" checked><div><input id="a" type="radio" name="r" checked></div>`)
	radio(host, "a").checked = false
	radio(host, "outside").checked = true

	morphInner(host.querySelector("div")!, `<div><input id="a" type="radio" name="r" checked></div>`)

	expect(radio(host, "a").checked).toBe(true)
	host.remove()
})

test("a detached root syncs its own radios", () => {
	const root = parse(`<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`)
	;(root.querySelector("#a") as HTMLInputElement).checked = false
	;(root.querySelector("#b") as HTMLInputElement).checked = true

	morph(root, parse(`<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`))

	expect(checkedIds(root)).toBe("a")
})

test("a radio whose checked update is vetoed keeps its checkedness", () => {
	const host = mount(`<div><input id="a" type="radio" name="r"><input id="b" type="radio" name="r"></div>`)
	radio(host, "a").checked = true
	radio(host, "b").checked = false

	morph(
		host.firstElementChild!,
		parse(`<div><input id="a" type="radio" name="r"><input id="b" type="radio" name="r" checked></div>`),
		{
			beforeAttributeUpdated: (element, name) => !(element.id === "b" && name === "checked"),
		},
	)

	expect(radio(host, "a").checked).toBe(false)
	expect(radio(host, "b").checked).toBe(false)
	host.remove()
})

test("a radio in a vetoed subtree keeps its checkedness", () => {
	const html = `<div><span><input id="a" type="radio" name="r" checked></span><input id="b" type="radio" name="r"></div>`
	const host = mount(html)
	radio(host, "a").checked = false
	radio(host, "b").checked = true

	morph(host.firstElementChild!, parse(html.replace("<span>", `<span class="x">`)), {
		beforeNodeVisited: (node) => node.nodeName !== "SPAN",
	})

	expect(radio(host, "a").checked).toBe(false)
	expect(radio(host, "b").checked).toBe(false)
	host.remove()
})

test("radios inside a moved element are synced to their new group", () => {
	const host = mount(
		`<div><form id="f"><span id="s"><input id="a" type="radio" name="r"><input id="t" type="text"></span></form><form id="g"><input id="b" type="radio" name="r" checked></form></div>`,
	)
	radio(host, "a").checked = true
	radio(host, "b").checked = true

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="f"></form><form id="g"><input id="b" type="radio" name="r" checked><span id="s"><input id="a" type="radio" name="r"><input id="t" type="text"></span></form></div>`,
		),
	)

	expect(checkedIds(host)).toBe("b")
	host.remove()
})

test("a radio moved under preserveChanges keeps what the user chose", () => {
	const host = mount(`<div><form id="f"><input id="a" type="radio" name="r"></form><form id="g"></form></div>`)
	radio(host, "a").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><form id="f"></form><form id="g"><input id="a" type="radio" name="r"></form></div>`),
		{
			preserveChanges: true,
		},
	)

	expect(radio(host, "a").checked).toBe(true)
	host.remove()
})

test("a checked radio that moves in and is then removed leaves its new group as the markup says", () => {
	const host = mount(`<div><form><span id="s"><input id="a" type="radio" name="r" checked></span></form></div>`)

	morph(host.firstElementChild!, parse(`<div><span id="s"></span><b><input id="b" type="radio" name="r" checked></b></div>`))

	expect(host.innerHTML).toBe(`<div><span id="s"></span><b><input id="b" type="radio" name="r" checked=""></b></div>`)
	expect(checkedIds(host)).toBe("b")
	host.remove()
})

test("radios added by a node list morph end up as the markup checks them", () => {
	const host = mount(`<div><img></div>`)
	const template = document.createElement("template")
	template.innerHTML = `<input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r" checked><p>text</p>`

	morph(host.querySelector("img")!, template.content.childNodes)

	expect(radio(host, "b").checked).toBe(true)
	host.remove()
})

test("checking an earlier radio in the markup leaves the last one the markup checks checked", () => {
	const host = mount(`<div><input id="a" type="radio" name="r"><input id="b" type="radio" name="r" checked></div>`)

	morph(
		host.firstElementChild!,
		parse(`<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r" checked></div>`),
	)

	expect(radio(host, "b").checked).toBe(true)
	host.remove()
})

test("adding a checked radio before the last one the markup checks leaves that one checked", () => {
	const host = mount(`<div><p></p><p class="a"><input id="b" type="radio" name="r" checked></p></div>`)

	morph(
		host.firstElementChild!,
		parse(
			`<div><p><input id="a" type="radio" name="r" checked></p><p class="b"><input id="b" type="radio" name="r" checked></p></div>`,
		),
	)

	expect(radio(host, "b").checked).toBe(true)
	host.remove()
})

test("a group with a vetoed radio isn't synced", () => {
	const host = mount(`<div><p></p><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`)
	radio(host, "a").checked = false
	radio(host, "b").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><p class="x"></p><input id="a" type="radio" name="r"><input id="b" type="radio" name="r"></div>`),
		{
			beforeAttributeUpdated: (element, name) => !(element.id === "a" && name === "checked"),
			beforeNodeVisited: (node) => node.nodeName !== "P",
		},
	)

	expect(radio(host, "a").checked).toBe(false)
	expect(radio(host, "b").checked).toBe(false)
	host.remove()
})

test("a clobbered target that claims its element moves it with preserveChanges off", () => {
	const host = mount(
		`<div><form id="f"><span id="s"><input id="a" type="radio" name="r" checked></span></form><form id="g"><input id="b" type="radio" name="r" checked></form></div>`,
	)
	radio(host, "a").checked = true
	radio(host, "b").checked = true

	const target = parse(
		`<div><form id="f"></form><form id="g"><span id="s" morphlex-clobber><input id="a" type="radio" name="r" checked></span><input id="b" type="radio" name="r" checked></form></div>`,
	)
	morph(host.firstElementChild!, target, { preserveChanges: true })

	expect(radio(host, "b").checked).toBe(true)
	host.remove()
})

test("a vetoed subtree without radios doesn't stop a group from syncing", () => {
	const host = mount(`<div><p></p><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`)
	radio(host, "a").checked = false
	radio(host, "b").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><p class="x"></p><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r"></div>`),
		{
			beforeNodeVisited: (node) => node.nodeName !== "P",
		},
	)

	expect(radio(host, "a").checked).toBe(true)
	expect(radio(host, "b").checked).toBe(false)
	host.remove()
})

test("a checked radio moving into a form leaves a radio outside the morph checked", () => {
	const host = mount(
		`<div><form id="f"></form><form id="g"><input id="x" type="radio" name="r" checked></form></div><input id="y" type="radio" name="r" form="f">`,
	)
	radio(host, "y").checked = true

	morph(host.firstElementChild!, parse(`<div><form id="f"><input id="x" type="radio" name="r"></form><form id="g"></form></div>`))

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("a radio outside the morph stays checked when its form moves", () => {
	const host = mount(
		`<div><input id="a" type="radio" name="r" checked><span id="s"><form id="f"></form></span></div><input id="y" type="radio" name="r" form="f">`,
	)
	radio(host, "y").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><b><span id="s"><form id="f"></form></span></b><input id="a" type="radio" name="r" checked></div>`),
	)

	expect(checkedIds(host)).toBe("a y")
	host.remove()
})

test("a moved radio whose visit is vetoed stays checked", () => {
	const host = mount(
		`<div><form id="f"></form><form id="g"><span id="s"><input id="x" type="radio" name="r"></span></form></div>`,
	)
	radio(host, "x").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><form id="f"><span id="s"><input id="x" type="radio" name="r"></span></form><form id="g"></form></div>`),
		{
			beforeNodeVisited: (node) => (node as Element).id !== "x",
		},
	)

	expect(radio(host, "x").checked).toBe(true)
	host.remove()
})

test("a moved radio stays unchecked rather than uncheck a vetoed radio in its new group", () => {
	const host = mount(
		`<div><form id="f"><span id="s"><input id="m" type="radio" name="r" checked></span></form><form id="g"><input id="v" type="radio" name="r" checked></form></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="f"></form><form id="g"><input id="v" type="radio" name="r" class="a" checked><span id="s"><input id="m" type="radio" name="r" checked></span></form></div>`,
		),
		{
			beforeNodeVisited: (node) => (node as Element).id !== "v",
		},
	)

	expect(radio(host, "v").checked).toBe(true)
	host.remove()
})

test("a vetoed radio moving into a group with a checked vetoed radio leaves that one checked", () => {
	const host = mount(
		`<div><form id="f"><span id="s"><input id="m" type="radio" name="r" checked></span></form><form id="g"><input id="v" type="radio" name="r" checked></form></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="f"></form><form id="g"><input id="v" type="radio" name="r" class="a" checked><span id="s"><input id="m" type="radio" name="r" class="a" checked></span></form></div>`,
		),
		{
			beforeNodeVisited: (node) => (node as Element).id !== "v" && (node as Element).id !== "m",
		},
	)

	expect(radio(host, "v").checked).toBe(true)
	expect(radio(host, "m").checked).toBe(false)
	host.remove()
})

test("a moved radio the markup checks stays checked when its group isn't synced", () => {
	const host = mount(
		`<div><form id="f"><input id="m" type="radio" name="r"></form><form id="g"><span id="s"><input id="x" type="radio" name="r" checked></span></form></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="f"><input id="m" type="radio" name="r" class="a"><span id="s"><input id="x" type="radio" name="r" checked></span></form><form id="g"></form></div>`,
		),
		{
			beforeNodeVisited: (node) => (node as Element).id !== "m",
		},
	)

	expect(checkedIds(host)).toBe("x")
	host.remove()
})

test("a radio outside the morph whose form moves stays checked", () => {
	const host = mount(`<div><span id="s"><form id="f"><input id="a" type="radio" name="q"></form></span><b></b></div>`)
	host.insertAdjacentHTML("beforeend", `<input id="y" type="radio" name="q" form="f">`)
	radio(host, "y").checked = true

	morph(
		host.firstElementChild!,
		parse(`<div><b><span id="s"><form id="f"><input id="a" type="radio" name="q"></form></span></b></div>`),
	)

	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("a radio outside the morph stays checked when its form is reordered", () => {
	const host = mount(`<div><p id="p"></p><form id="f"><input id="a" type="radio" name="r"></form></div>`)
	host.insertAdjacentHTML("beforeend", `<input id="y" type="radio" name="r" form="f" checked>`)

	morph(host.firstElementChild!, parse(`<div><form id="f"><input id="a" type="radio" name="r"></form><p id="p"></p></div>`))

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("reordering a form that owns a checked radio outside the morph leaves other groups alone", () => {
	const host = mount(`<div><p id="p"></p><form id="f"></form><input id="a" type="radio" name="r" checked></div>`)
	host.insertAdjacentHTML("beforeend", `<input id="y" type="radio" name="r" form="f" checked>`)

	morph(
		host.firstElementChild!,
		parse(`<div><form id="f"></form><p id="p"></p><input id="a" type="radio" name="r" checked></div>`),
	)

	expect(radio(host, "a").checked).toBe(true)
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("a checked radio that keeps its form when it moves stays checked", () => {
	const host = mount(
		`<div><form id="f"><span id="s"><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="q" form="f" checked></span></form><form id="g"><b id="t"></b></form></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="f"><b><span id="s"><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="q" form="f" checked></span></b></form><form id="g"></form></div>`,
		),
	)

	expect(checkedIds(host)).toBe("a b")
	host.remove()
})

test("a checked radio moving with its form stays checked", () => {
	const host = mount(`<div><span id="s"><form><input id="a" type="radio" name="r" checked></form></span><b></b></div>`)

	morph(
		host.firstElementChild!,
		parse(`<div><b><span id="s"><form><input id="a" type="radio" name="r" checked></form></span></b></div>`),
	)

	expect(radio(host, "a").checked).toBe(true)
	host.remove()
})

test("moving an element with a form in another namespace leaves it alone", () => {
	const host = mount(`<div><span id="s"><svg><form></form></svg></span><b></b></div>`)

	morph(host.firstElementChild!, parse(`<div><b><span id="s"><svg><form></form></svg></span></b></div>`))

	expect(host.innerHTML).toBe(`<div><b><span id="s"><svg><form></form></svg></span></b></div>`)
	host.remove()
})

test("an element moving to the top of a fragment leaves its radios as the markup checks them", () => {
	const fragment = document.createDocumentFragment()
	const div = document.createElement("div")
	div.innerHTML = `<form><input id="a" type="radio" name="r" checked></form>`
	fragment.append(div)
	const input = div.querySelector("input")!
	const template = document.createElement("template")
	template.innerHTML = `<div></div><input id="a" type="radio" name="r" checked>`

	morph(div, template.content.childNodes)

	expect(fragment.lastChild).toBe(input)
	expect(input.checked).toBe(true)
})

// Firefox and Safari can briefly put a radio that changes form in the group of radios without a form.
// A checked one then unchecks a checked radio there, even though it never belongs to that group.

test("adding a form with the id an outside radio names leaves other groups alone", () => {
	const host = mount(`<div><input id="a" type="radio" name="r" checked><span id="s"><form id="f"></form></span></div>`)
	host.insertAdjacentHTML("afterbegin", `<input id="y" type="radio" name="r" form="f">`)
	radio(host, "y").checked = true

	morph(
		host.querySelector("div")!,
		parse(`<div><input id="a" type="radio" name="r" checked><form id="f"><span id="s"></span></form></div>`),
	)

	expect(checkedIds(host)).toBe("y a")
	host.remove()
})

test("adding a form after one with the same id leaves other groups alone", () => {
	const host = mount(`<div><input id="a" type="radio" name="r" checked><span id="s"><form id="f"></form></span><b></b></div>`)
	host.insertAdjacentHTML("afterbegin", `<input id="y" type="radio" name="r" form="f">`)
	radio(host, "y").checked = true

	morph(
		host.querySelector("div")!,
		parse(`<div><input id="a" type="radio" name="r" checked><b></b><form id="f"><span id="s"></span></form></div>`),
	)

	expect(checkedIds(host)).toBe("y a")
	host.remove()
})

test("removing a form with the id an outside radio names checks it in its new group", () => {
	const host = mount(
		`<div><form id="f"></form></div><input id="a" type="radio" name="r"><input id="y" type="radio" name="r" form="f">`,
	)
	radio(host, "a").checked = true
	radio(host, "y").checked = true

	morph(host.firstElementChild!, parse(`<div></div>`))

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("changing a checked radio's form leaves other groups alone", () => {
	const host = mount(
		`<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r" form="f" checked><form id="f"></form><form id="g"></form></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><input id="a" type="radio" name="r" checked><input id="b" type="radio" name="r" form="g" checked><form id="f"></form><form id="g"></form></div>`,
		),
	)

	expect(checkedIds(host)).toBe("a b")
	host.remove()
})

test("changing a form's id leaves other groups alone", () => {
	const host = mount(
		`<form id="g"></form><form id="f"></form><input id="a" type="radio" name="r"><input id="y" type="radio" name="r" form="f">`,
	)
	radio(host, "a").checked = true
	radio(host, "y").checked = true

	morph(host.querySelector("#g")!, parse(`<form id="f"></form>`))

	expect(checkedIds(host)).toBe("a y")
	host.remove()
})

for (const preserveChanges of [false, true]) {
	test(`a checked radio moving to another form leaves other groups alone, with preserveChanges ${preserveChanges}`, () => {
		const host = mount(
			`<div><form id="f"><b id="x"><input id="b" type="radio" name="r" checked></b></form><form id="g"></form></div><input id="a" type="radio" name="r">`,
		)
		radio(host, "a").checked = true

		morph(
			host.firstElementChild!,
			parse(`<div><form id="f"></form><form id="g"><b id="x"><input id="b" type="radio" name="r" checked></b></form></div>`),
			{ preserveChanges },
		)

		expect(checkedIds(host)).toBe("b a")
		host.remove()
	})
}

test("a checked radio whose form attribute changes or goes stays checked", () => {
	const host = mount(`<form id="f"></form><form id="g"></form><div><input id="b" type="radio" name="r" form="f" checked></div>`)
	const div = host.querySelector("div")!

	morph(div, parse(`<div><input id="b" type="radio" name="r" form="g" checked></div>`))
	expect(radio(host, "b").form).toBe(host.querySelector("#g"))
	expect(radio(host, "b").checked).toBe(true)

	morph(div, parse(`<div><input id="b" type="radio" name="r" checked></div>`))
	expect(radio(host, "b").form).toBe(null)
	expect(radio(host, "b").checked).toBe(true)
	host.remove()
})

test("a checked radio naming a form whose id changes or goes stays checked", () => {
	const host = mount(
		`<form id="m"><input id="i" type="radio" name="p" form="m" checked></form><input id="y" type="radio" name="r" form="m"><input id="z" type="radio" name="q" form="o" checked>`,
	)
	radio(host, "y").checked = true
	const form = host.querySelector("form")!

	morph(form, parse(`<form id="n"><input id="i" type="radio" name="p" form="m" checked></form>`))
	expect(form.id).toBe("n")
	expect(checkedIds(host)).toBe("i y z")

	form.id = "m"
	morph(form, parse(`<form><input id="i" type="radio" name="p" form="m" checked></form>`))
	expect(form.hasAttribute("id")).toBe(false)
	expect(radio(host, "y").checked).toBe(true)

	form.id = "m"
	morph(form, parse(`<form id=""><input id="i" type="radio" name="p" form="m" checked></form>`))
	expect(form.id).toBe("")
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("a checked radio whose form changes and whose markup unchecks it leaves its new group alone", () => {
	const host = mount(
		`<form id="f"></form><form id="g"></form><input id="y" type="radio" name="r" form="g"><div><input id="b" type="radio" name="r" form="f"></div>`,
	)
	radio(host, "y").checked = true
	radio(host, "b").checked = true

	morph(host.querySelector("div")!, parse(`<div><input id="b" type="radio" name="r" form="g"></div>`))

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("a radio inside a form whose id changes leaves the group it joins alone", () => {
	const host = mount(`<form id="f"><input id="b" type="radio" name="r" form="f"></form><input id="a" type="radio" name="r">`)
	radio(host, "b").checked = true
	radio(host, "a").checked = true

	morph(host.querySelector("form")!, parse(`<form id="g"><input id="b" type="radio" name="r" form="f"></form>`))

	expect(checkedIds(host)).toBe("a")
	host.remove()
})

test("a radio naming a removed form by an id with quotes and newlines leaves its new group alone", () => {
	const id = `a"b\\c\nd\re\ff`
	const host = mount(`<div><form></form><input id="b" type="radio" name="r"></div><input id="a" type="radio" name="r">`)
	const form = host.querySelector("form")!
	form.id = id
	radio(host, "b").setAttribute("form", id)
	radio(host, "b").checked = true
	radio(host, "a").checked = true

	const target = parse(`<div><input id="b" type="radio" name="r"></div>`)
	target.querySelector("input")!.setAttribute("form", id)
	morph(host.querySelector("div")!, target)

	expect(checkedIds(host)).toBe("a")
	host.remove()
})

test("a form whose id has quotes and newlines is morphed", () => {
	const host = mount(`<div><form></form></div>`)
	host.querySelector("form")!.id = `a"b\\c\nd\re\ff`

	morph(host.querySelector("div")!, parse(`<div><form id="g"></form></div>`))

	expect(host.innerHTML).toBe(`<div><form id="g"></form></div>`)
	host.remove()
})

test("with preserveChanges, a radio the user hasn't touched follows its markup when its form and checked change together", () => {
	const host = mount(`<form id="f"></form><form id="g"></form><div><input id="b" type="radio" name="r" form="f" checked></div>`)

	morph(host.querySelector("div")!, parse(`<div><input id="b" type="radio" name="r" form="g"></div>`), { preserveChanges: true })

	expect(radio(host, "b").checked).toBe(false)
	host.remove()
})

test("with preserveChanges, a radio outside the morph that the user hasn't touched follows its markup after its form moves", () => {
	const host = mount(
		`<div><span id="s"><form id="f"></form></span><b></b></div><input id="y" type="radio" name="r" form="f" checked>`,
	)

	morph(host.firstElementChild!, parse(`<div><b><span id="s"><form id="f"></form></span></b></div>`), { preserveChanges: true })
	radio(host, "y").removeAttribute("checked")

	expect(radio(host, "y").checked).toBe(false)
	host.remove()
})

test("a radio the user checked keeps its check when it changes form", () => {
	const host = mount(`<form id="f"></form><form id="g"></form><div><input id="b" type="radio" name="r" form="f" checked></div>`)
	radio(host, "b").checked = true

	morph(host.querySelector("div")!, parse(`<div><input id="b" type="radio" name="r" form="g" checked></div>`), {
		preserveChanges: true,
	})

	expect(radio(host, "b").checked).toBe(true)
	expect(radio(host, "b").getAttribute("form")).toBe("g")
	host.remove()
})

test("with preserveChanges, a radio the user checked outside a clobbered element keeps its check when a form inside it changes id", () => {
	const host = mount(`<div><input id="y" type="radio" name="r" form="f"><section id="s"><form id="f"></form></section></div>`)
	radio(host, "y").checked = true

	const target = parse(`<div><input id="y" type="radio" name="r" form="f"><section id="s"><form id="g"></form></section></div>`)
	target.querySelector("section")!.setAttribute("morphlex-clobber", "")
	morph(host.firstElementChild!, target, { preserveChanges: true })

	expect(host.querySelector("form")!.id).toBe("g")
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("with preserveChanges, a radio the user checked outside a clobbered element keeps its check when a form moves into it", () => {
	const host = mount(`<div><input id="y" type="radio" name="r" form="f"><b><form id="f"></form></b><section></section></div>`)
	radio(host, "y").checked = true

	const target = parse(`<div><input id="y" type="radio" name="r" form="f"><b></b><section><form id="f"></form></section></div>`)
	target.querySelector("section")!.setAttribute("morphlex-clobber", "")
	morph(host.firstElementChild!, target, { preserveChanges: true })

	expect(host.querySelector("section form")).not.toBe(null)
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("a radio outside the morph keeps the value of its checked attribute when its form moves", () => {
	const host = mount(
		`<div><span id="s"><form id="f"></form></span><b></b></div><input id="y" type="radio" name="r" form="f" checked="checked">`,
	)

	morph(host.firstElementChild!, parse(`<div><b><span id="s"><form id="f"></form></span></b></div>`))

	expect(radio(host, "y").getAttribute("checked")).toBe("checked")
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

// Found by the move fuzzer in Firefox: the target wraps a form around its own ancestor, so a new form
// with the same id is added while the old one is still there.
test("a form recreated around its own ancestor leaves the group of radios without a form alone", () => {
	const host = mount(
		`<div><div><b id="i0"><input id="i1" type="radio" name="r"><form id="i2"><input id="i3" type="text"></form></b></div><input id="i8" type="radio" name="r" checked></div>`,
	)
	host.insertAdjacentHTML("afterbegin", `<input id="y" type="radio" name="r" form="i2" checked>`)

	morph(
		host.querySelector("div")!,
		parse(
			`<div><div><form id="i2"><input id="i3" type="text"><span id="i10"><b id="i0"></b></span></form></div><input id="i8" type="radio" name="r" checked></div>`,
		),
	)

	expect(checkedIds(host)).toBe("y i8")
	host.remove()
})

// Found by the move fuzzer in Firefox, which can stop a radio following its `checked` attribute while its form moves.
const movingForms: Array<[string, string]> = [
	[
		`<div><section><input id="i0" type="radio" name="s" checked><form id="f"><textarea></textarea></form></section><form id="i5"><input id="i3" type="radio" name="r" checked><input id="i4" type="radio" name="r" checked></form></div>`,
		`<div><input id="i4" type="radio" name="r" checked><form id="f"><textarea></textarea><section><input id="i0" type="radio" name="s" checked></section></form><form id="i5"><input id="i3" type="radio" name="r" checked></form></div>`,
	],
	[
		`<div><form><input id="i0" type="radio" name="r" checked><input id="i2" type="radio" name="r" checked></form><form id="f"></form></div>`,
		`<div><span id="i4"><input id="i2" type="radio" name="r" checked><form><input id="i0" type="radio" name="r" checked></form></span><b><form id="f"></form></b></div>`,
	],
]
for (const [from, to] of movingForms) {
	test(`a radio outside the morph stays checked when its form moves: ${to}`, () => {
		const host = mount(from)
		host.insertAdjacentHTML("afterbegin", `<input id="y" type="radio" name="r" form="f" checked>`)

		morph(host.querySelector("div")!, parse(to))

		expect(radio(host, "y").checked).toBe(true)
		expect(radio(host, "y").getAttribute("checked")).toBe("")
		host.remove()
	})
}

test("a radio outside the morph gives way to the radio the markup checks in the group it joins", () => {
	const host = mount(
		`<div><section id="s"><form id="f"><textarea id="t"></textarea></form></section><form><input id="i8" type="radio" name="r" checked></form></div>`,
	)
	host.insertAdjacentHTML("afterbegin", `<input id="y" type="radio" name="r" form="f" checked>`)

	morphInner(
		host.querySelector("div")!,
		parse(
			`<div><form id="f"><textarea id="t"></textarea><section id="s"></section><input id="i8" type="radio" name="r" checked></form><form></form></div>`,
		),
	)

	expect(radio(host, "i8").checked).toBe(true)
	host.remove()
})

test("removing a form and a checked radio naming it leaves the group it would join alone", () => {
	const lives = [
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"></div>`,
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked></div>`,
		`<div><p><form id="f"></form></p><p><input id="y" type="radio" name="r" form="f"></p></div>`,
	]
	for (const preserveChanges of [true, false]) {
		for (const live of lives) {
			const host = mount(`${live}<input id="a" type="radio" name="r">`)
			radio(host, "a").checked = true
			radio(host, "y").checked = true

			morph(host.firstElementChild!, parse(`<div></div>`), { preserveChanges })

			expect(checkedIds(host)).toBe("a")
			host.remove()
		}
	}
})

test("a radio unchecked by a radio that changes form and is then removed is checked again", () => {
	for (const outside of [`<input id="a" type="radio" name="r" checked>`, `<input id="a" type="radio" name="r">`]) {
		const host = mount(`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"></div>`)
		radio(host, "y").checked = true
		const container = document.createElement("p")
		container.innerHTML = outside
		radio(container, "a").checked = true
		host.append(container)

		morph(host.firstElementChild!, parse(`<div></div>`), { preserveChanges: true })

		expect(checkedIds(host)).toBe("a")
		host.remove()
	}
})

test("a radio unchecked by a radio that changes form and is then removed stays unchecked when another radio took its group", () => {
	const host = mount(
		`<div><form id="f"></form><form id="g"></form><input id="y" type="radio" name="r" form="f"><input id="z" type="radio" name="r" form="g"></div>`,
	)
	host.insertAdjacentHTML("beforeend", `<input id="a" type="radio" name="r">`)
	for (const id of ["y", "z", "a"]) radio(host, id).checked = true

	morph(host.firstElementChild!, parse(`<div><input id="z" type="radio" name="r" form="g"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("z")
	host.remove()
})

test("a form and the radio naming it changing id together leave the group without a form alone", () => {
	for (const preserveChanges of [true, false]) {
		const host = mount(
			`<div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked></div><input id="a" type="radio" name="r">`,
		)
		radio(host, "y").checked = true
		radio(host, "a").checked = true

		morph(
			host.firstElementChild!,
			parse(`<div><form id="g"></form><input id="y" type="radio" name="r" form="g" checked></div>`),
			{
				preserveChanges,
			},
		)

		expect(checkedIds(host)).toBe("y a")
		host.remove()
	}
})

test("a form moving in from another root leaves the radios it leaves behind checked", () => {
	const shadowHost = mount(``)
	const shadow = shadowHost.attachShadow({ mode: "open" })
	shadow.innerHTML = `<div id="source"><form id="f"></form></div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked><input id="a" type="radio" name="r" checked>`
	const host = mount(`<div></div>`)

	morphInner(host.firstElementChild!, shadow.getElementById("source")!)

	expect(shadow.getElementById("y")).toHaveProperty("checked", true)
	expect(shadow.getElementById("a")).toHaveProperty("checked", true)
	host.remove()
	shadowHost.remove()
})

test("a radio that loses its form and then its name gives back the group it passed through", () => {
	const host = mount(
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"></div><input id="a" type="radio" name="r">`,
	)
	radio(host, "y").checked = true
	radio(host, "a").checked = true

	morph(host.firstElementChild!, parse(`<div><input id="y" type="radio" name="s" form="f"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("y a")
	host.remove()
})

test("a radio checked by its markup gets the group back from a radio that passed through it", () => {
	const host = mount(
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"></div><input id="a" type="radio" name="r" checked>`,
	)
	radio(host, "y").checked = true

	morph(host.firstElementChild!, parse(`<div><input id="y" type="radio" name="s" form="f"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("y a")
	expect(radio(host, "a").defaultChecked).toBe(true)
	host.remove()
})

test("a root radio whose form changes is checked again before its afterNodeVisited", () => {
	const host = mount(`<form id="f"></form><form id="g"></form><input id="y" type="radio" name="r" form="f">`)
	radio(host, "y").checked = true
	let checkedWhenVisited: boolean | null = null

	morph(radio(host, "y"), parse(`<input id="y" type="radio" name="r" form="g" checked>`), {
		beforeAttributeUpdated: (_element, name) => name !== "checked",
		afterNodeVisited: (node) => {
			checkedWhenVisited = (node as HTMLInputElement).checked
		},
	})

	expect(checkedWhenVisited).toBe(true)
	expect(radio(host, "y").checked).toBe(true)
	host.remove()
})

test("a radio that loses its form and stays keeps the group it joined", () => {
	const host = mount(`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"></div>`)
	radio(host, "y").checked = true
	const container = document.createElement("p")
	container.innerHTML = `<input id="a" type="radio" name="r">`
	radio(container, "a").checked = true
	host.append(container)

	morph(host.firstElementChild!, parse(`<div><input id="y" type="radio" name="r" form="f"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("a radio that leaves its form and loses its check gives the group back to the radio it passed", () => {
	const host = mount(
		`<form id="f"></form><div><input id="y" type="radio" name="r" form="f" checked></div><input id="a" type="radio" name="r" checked>`,
	)

	morph(host.querySelector("div")!, parse(`<div><input id="y" type="radio" name="r"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("a")
	host.remove()
})

test("a radio the markup unchecks stays unchecked after a radio passed through its group", () => {
	const host = mount(
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked><input id="b" type="radio" name="r" checked></div>`,
	)

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="g"></form><input id="y" type="radio" name="r" form="g" checked><input id="b" type="radio" name="r"></div>`,
		),
		{ preserveChanges: true },
	)

	expect(checkedIds(host)).toBe("y")
	host.remove()
})

test("a form claimed out of a live target from another root leaves the radios there checked", () => {
	const shadowHost = mount(``)
	const shadow = shadowHost.attachShadow({ mode: "open" })
	shadow.innerHTML = `<div id="source"><section><form id="f"></form></section></div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked><input id="a" type="radio" name="r" checked>`
	const host = mount(`<div><form id="f"></form></div>`)

	morphInner(host.firstElementChild!, shadow.getElementById("source")!)

	expect(shadow.getElementById("y")).toHaveProperty("checked", true)
	expect(shadow.getElementById("a")).toHaveProperty("checked", true)
	host.remove()
	shadowHost.remove()
})

test("a radio inside a live target keeps its check when a live element claims the form it names", () => {
	const shadowHost = mount(``)
	const shadow = shadowHost.attachShadow({ mode: "open" })
	shadow.innerHTML = `<div id="source"><section><form id="f"></form><input id="y" type="radio" name="r" form="f" checked></section></div><input id="a" type="radio" name="r" checked>`
	const y = shadow.getElementById("y") as HTMLInputElement
	const host = mount(`<div><form id="f"></form></div>`)

	morphInner(host.firstElementChild!, shadow.getElementById("source")!)

	expect(y.checked).toBe(true)
	expect(shadow.getElementById("a")).toHaveProperty("checked", true)
	host.remove()
	shadowHost.remove()
})

test("a clobbered radio that a passing radio unchecked follows its markup", () => {
	const host = mount(
		`<div><form id="f"></form><input id="y" type="radio" name="r" form="f"><section><input id="b" type="radio" name="r"></section></div>`,
	)
	radio(host, "y").checked = true
	radio(host, "b").checked = true
	const b = radio(host, "b")

	morph(host.firstElementChild!, parse(`<div><section morphlex-clobber><input id="b" type="radio" name="r"></section></div>`), {
		preserveChanges: true,
	})

	expect(radio(host, "b")).toBe(b)
	expect(checkedIds(host)).toBe("")
	host.remove()
})

test("a live form from another document leaves the radios there checked", () => {
	const source = document.implementation.createHTMLDocument("")
	source.body.innerHTML = `<div id="source"><form id="f"></form></div><form id="f"></form><input id="y" type="radio" name="r" form="f" checked><input id="a" type="radio" name="r" checked>`
	const host = mount(`<div></div>`)

	morphInner(host.firstElementChild!, source.getElementById("source")!)

	expect(source.getElementById("y")).toHaveProperty("checked", true)
	expect(source.getElementById("a")).toHaveProperty("checked", true)
	expect(host.querySelector("form")).not.toBeNull()
	host.remove()
})

test("a radio whose name and form change together leaves the group it passes through alone", () => {
	for (const preserveChanges of [true, false]) {
		const host = mount(
			`<form id="f"></form><form id="g"></form><input id="a" type="radio" name="s" form="f" checked><div><input id="y" type="radio" name="r" form="f" checked></div>`,
		)

		morph(host.querySelector("div")!, parse(`<div><input id="y" type="radio" name="s" form="g" checked></div>`), {
			preserveChanges,
		})

		expect(checkedIds(host)).toBe("a y")
		host.remove()
	}
})

test("a checked checkbox that becomes an unchecked radio leaves a radio outside the morph checked", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(
			`<input id="outside" type="radio" name="g" checked><div><input id="inside" type="checkbox" name="g" checked></div>`,
		)

		morph(host.querySelector("div")!, parse(`<div><input id="inside" type="radio" name="g"></div>`), { preserveChanges })

		expect(checkedIds(host)).toBe("outside")
		host.remove()
	}
})

test("a checked checkbox that becomes a checked radio takes the group from a radio outside the morph", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(
			`<input id="outside" type="radio" name="g" checked><div><input id="inside" type="checkbox" name="g" checked></div>`,
		)

		morph(host.querySelector("div")!, parse(`<div><input id="inside" type="radio" name="g" checked></div>`), {
			preserveChanges,
		})

		expect(checkedIds(host)).toBe("inside")
		host.remove()
	}
})

test("a text input with a checked attribute that becomes an unchecked radio leaves a radio outside the morph checked", () => {
	const host = mount(`<input id="outside" type="radio" name="g" checked><div><input id="inside" name="g" checked></div>`)

	morph(host.querySelector("div")!, parse(`<div><input id="inside" type="radio" name="g"></div>`))

	expect(checkedIds(host)).toBe("outside")
	host.remove()
})

test("with preserveChanges, a checked radio that leaves its form and is unchecked gives the group back to a radio outside the morph", () => {
	const host = mount(
		`<input id="outside" type="radio" name="g" checked><div><form><input id="inside" type="radio" name="g" checked></form></div>`,
	)

	morph(host.querySelector("div")!, parse(`<div><input id="inside" type="radio" name="g"></div>`), { preserveChanges: true })

	expect(checkedIds(host)).toBe("outside")
	host.remove()
})

test("a radio checked before it leaves the group of a radio outside the morph gives that one its check back", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(`<input id="outside" type="radio" name="g" checked><div><input id="inside" type="radio" name="g"></div>`)

		morph(host.querySelector("div")!, parse(`<div><input id="inside" type="radio" checked></div>`), { preserveChanges })

		expect(checkedIds(host)).toBe("outside inside")
		host.remove()
	}
})

test("a checked radio whose type changes only in case keeps its checked attribute", () => {
	const host = mount(`<div><input id="inside" type="radio" name="g" checked></div>`)
	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true })

	morph(host.firstElementChild!, parse(`<div><input id="inside" type="RADIO" name="g" checked></div>`), { preserveChanges: true })

	expect(observer.takeRecords().map((record) => record.attributeName)).toEqual(["type"])
	expect(checkedIds(host)).toBe("inside")
	observer.disconnect()
	host.remove()
})
