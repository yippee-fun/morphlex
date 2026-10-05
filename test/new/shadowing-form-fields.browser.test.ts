import { expect, test } from "vitest"
import { morph, morphDocument, morphInner } from "../../src/morphlex"

// Every member a form has, from its own prototype down to Object's. A form field with one of these names shadows it,
// so `form.remove` is the field named "remove".
function formMemberNames(): Array<string> {
	const names = new Set<string>()
	for (let prototype: object | null = HTMLFormElement.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
		for (const name of Object.getOwnPropertyNames(prototype)) names.add(name)
	}
	return [...names]
}

function documentMemberNames(): Array<string> {
	const names = new Set<string>()
	for (let prototype: object | null = Document.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
		for (const name of Object.getOwnPropertyNames(prototype)) names.add(name)
	}
	return [...names]
}

function shadowingFields(): string {
	return formMemberNames()
		.map((name) => `<input name="${name}">`)
		.join("")
}

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

function serialize(html: string): string {
	const template = document.createElement("template")
	template.innerHTML = html
	const host = document.createElement("div")
	host.append(template.content)
	return host.innerHTML
}

test("a form whose field is named remove can be removed", () => {
	const host = mount(`<div><form><input name="remove"></form></div>`)

	morph(host.firstElementChild!, `<div></div>`)

	expect(host.innerHTML).toBe(`<div></div>`)
	host.remove()
})

test("a form whose field is named attributes gets its attributes updated", () => {
	const host = mount(`<form class="a"><input name="attributes"></form>`)

	morph(host.firstElementChild!, `<form class="b"><input name="attributes"></form>`)

	expect(host.innerHTML).toBe(`<form class="b"><input name="attributes"></form>`)
	host.remove()
})

test("a form with a field for each of its members is morphed like any other element", () => {
	const fields = shadowingFields()
	const host = mount(`<section><form class="a" id="f">${fields}<p>one</p></form><span>gone</span></section>`)
	const to = `<section><form class="b" id="f" action="/x">${fields}<p>two</p><em>new</em></form></section>`

	morph(host.firstElementChild!, to)

	expect(host.innerHTML).toBe(serialize(to))
	host.remove()
})

test("a form with a field for each of its members is added, replaced and removed", () => {
	const fields = shadowingFields()
	const host = mount(`<section><form class="a">${fields}</form><p>keep</p></section>`)

	const added = `<section><p>keep</p><form class="new">${fields}</form></section>`
	morph(host.firstElementChild!, added)
	expect(host.innerHTML).toBe(serialize(added))

	const replaced = `<section><p>keep</p><div class="new">${fields}</div></section>`
	morph(host.firstElementChild!, replaced)
	expect(host.innerHTML).toBe(serialize(replaced))

	const back = `<section><form>${fields}</form><p>keep</p></section>`
	morph(host.firstElementChild!, back)
	expect(host.innerHTML).toBe(serialize(back))

	const removed = `<section><p>keep</p></section>`
	morph(host.firstElementChild!, removed)
	expect(host.innerHTML).toBe(serialize(removed))
	host.remove()
})

test("a form with a field for each of its members that's unchanged is left alone", () => {
	const fields = shadowingFields()
	const html = `<section><form class="a" id="f">${fields}</form></section>`
	const host = mount(html)
	const form = host.querySelector("form")
	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true, childList: true, characterData: true })

	morph(host.firstElementChild!, html)

	expect(observer.takeRecords()).toHaveLength(0)
	observer.disconnect()
	expect(host.querySelector("form")).toBe(form)
	host.remove()
})

test("forms with a field for each of their members move by id across parents", () => {
	const fields = shadowingFields()
	const host = mount(
		`<section><div id="a"><form id="one">${fields}<input id="x" value="x"></form></div>` +
			`<div id="b"><form id="two">${fields}</form></div></section>`,
	)
	const one = host.querySelector("#one")
	const two = host.querySelector("#two")
	const x = host.querySelector("#x")
	const to =
		`<section><div id="b"><form id="one" class="moved">${fields}</form></div>` +
		`<div id="a"><form id="two">${fields}<input id="x" value="x"></form></div></section>`

	morph(host.firstElementChild!, to)

	expect(host.innerHTML).toBe(serialize(to))
	expect(host.querySelector("#one")).toBe(one)
	expect(host.querySelector("#two")).toBe(two)
	expect(host.querySelector("#x")).toBe(x)
	host.remove()
})

test("radios naming a form with a field for each of its members stay checked when the form moves", () => {
	const fields = shadowingFields()
	const host = mount(
		`<section><div><form id="f">${fields}</form></div><p>moving</p></section>` +
			`<input type="radio" name="r" form="f" checked><input type="radio" name="r" form="f">`,
	)
	const radio = host.querySelector<HTMLInputElement>('input[type="radio"]')!

	morph(host.firstElementChild!, `<section><p>moving</p><div><form id="f" class="b">${fields}</form></div></section>`)

	expect(radio.checked).toBe(true)
	expect(host.querySelector("form.b")).not.toBeNull()
	host.remove()
})

test("the user's changes inside a form with a field for each of its members are kept", () => {
	const fields = shadowingFields()
	const host = mount(
		`<section><form>${fields}<input name="typed"><input type="checkbox" name="pick" value="a"><input type="checkbox" name="pick" value="b"></form></section>`,
	)
	const text = host.querySelector<HTMLInputElement>('input[name="typed"]')!
	const b = host.querySelector<HTMLInputElement>('input[value="b"]')!
	text.value = "typed"
	b.checked = true

	morph(
		host.firstElementChild!,
		`<section><form class="b">${fields}<input name="typed"><input type="checkbox" name="pick" value="new"><input type="checkbox" name="pick" value="a"><input type="checkbox" name="pick" value="b"></form></section>`,
		{ preserveChanges: true },
	)

	expect(host.querySelector<HTMLInputElement>('input[name="typed"]')).toBe(text)
	expect(text.value).toBe("typed")
	expect(host.querySelector<HTMLInputElement>('input[value="b"]')).toBe(b)
	expect(b.checked).toBe(true)
	expect(host.querySelector("form.b")).not.toBeNull()
	expect(host.querySelector("[morphlex-dirty]")).toBeNull()
	host.remove()
})

test("labels holding the user's choice inside forms with a field for each of their members keep it", () => {
	const fields = shadowingFields()
	const form = (value: string) => `<form>${fields}<input type="radio" name="r" value="${value}"></form>`
	const host = mount(`<section>${form("a")}${form("b")}</section>`)
	const b = host.querySelector<HTMLInputElement>('input[value="b"]')!
	b.checked = true

	morph(host.firstElementChild!, `<section>${form("new")}${form("a")}${form("b")}</section>`, { preserveChanges: true })

	expect(host.querySelector<HTMLInputElement>('input[value="b"]')).toBe(b)
	expect(b.checked).toBe(true)
	host.remove()
})

test("the user's changes inside a form with a field for each of its members are reset without preserveChanges", () => {
	const fields = shadowingFields()
	const html = `<section><form>${fields}<input name="typed"><input type="checkbox" name="pick"></form></section>`
	const host = mount(html)
	const text = host.querySelector<HTMLInputElement>('input[name="typed"]')!
	const checkbox = host.querySelector<HTMLInputElement>('input[name="pick"]')!
	text.value = "typed"
	checkbox.checked = true

	morph(host.firstElementChild!, html)

	expect(text.value).toBe("")
	expect(checkbox.checked).toBe(false)
	host.remove()
})

test("a form with a field for each of its members can be the root of a morph", () => {
	const fields = shadowingFields()
	const host = mount(`<form class="a">${fields}<p>one</p></form>`)
	const form = host.firstElementChild!

	morph(form, `<form class="b">${fields}<p>two</p></form>`)
	expect(host.firstElementChild).toBe(form)
	expect(host.innerHTML).toBe(serialize(`<form class="b">${fields}<p>two</p></form>`))

	morphInner(form, `<form>${fields}<p>three</p></form>`)
	expect(host.innerHTML).toBe(serialize(`<form class="b">${fields}<p>three</p></form>`))

	morph(form, `<div>${fields}</div>`)
	expect(host.innerHTML).toBe(serialize(`<div>${fields}</div>`))
	host.remove()
})

test("a details item in a form with a field for each of its members stays open", () => {
	const fields = shadowingFields()
	const host = mount(
		`<section><form>${fields}<details name="g" open><summary>a</summary></details><details name="g"><summary>b</summary></details></form></section>`,
	)

	morph(
		host.firstElementChild!,
		`<section><form>${fields}<details name="g"><summary>a</summary></details><details name="g" open><summary>b</summary></details></form></section>`,
	)

	const [a, b] = host.querySelectorAll("details")
	expect(a!.open).toBe(false)
	expect(b!.open).toBe(true)
	host.remove()
})

test("a document with an image named after each of its members is morphed", () => {
	const images = documentMemberNames()
		.map((name) => `<img name="${name}">`)
		.join("")
	const fields = shadowingFields()
	const parser = new DOMParser()
	const from = parser.parseFromString(
		`<html><body>${images}<form id="f">${fields}</form><select><option>a</option></select><input type="range"></body></html>`,
		"text/html",
	)

	morphDocument(
		from,
		`<html><body>${images}<p>new</p><form id="f" class="b">${fields}</form><select><option>a</option><option>b</option></select><input type="range" max="10"></body></html>`,
	)

	const body = Document.prototype.querySelector.call(from, "body")!
	expect(body.querySelector("p")!.textContent).toBe("new")
	expect(body.querySelector("form.b")).not.toBeNull()
	expect(body.querySelectorAll("option")).toHaveLength(2)
})
