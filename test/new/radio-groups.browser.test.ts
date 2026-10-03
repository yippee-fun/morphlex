import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// Radio groups are synced to the markup when a morph resets a radio or moves one. happy-dom doesn't
// group radios, so each test sets every radio's checkedness itself and checks the whole group.

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
