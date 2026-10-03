import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

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

function countMutations(host: HTMLElement, html: string, preserveChanges = false): number {
	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true, childList: true, characterData: true })
	morph(host.firstElementChild!, parse(html), { preserveChanges })
	const count = observer.takeRecords().length
	observer.disconnect()
	return count
}

test("an untouched select without a selected option keeps its node and focus", () => {
	const host = mount(`<form><p>old</p><select><option>a</option><option>b</option></select></form>`)
	const select = host.querySelector("select")!
	select.focus()

	morph(host.firstElementChild!, parse(`<form><p>new</p><select><option>a</option><option>b</option></select></form>`))

	expect(host.querySelector("select")).toBe(select)
	expect(document.activeElement).toBe(select)
	host.remove()
})

test("morphing an untouched select to identical markup makes no mutations", () => {
	const html = `<div><select id="s"><option>a</option><option>b</option></select></div>`
	const host = mount(html)

	expect(countMutations(host, html)).toBe(0)
	expect(countMutations(host, html, true)).toBe(0)
	host.remove()
})

test("a drop-down whose first options are disabled is untouched", () => {
	const html = `<div><select id="s"><option disabled>a</option><optgroup disabled><option>b</option></optgroup><optgroup><option>c</option></optgroup></select></div>`
	const host = mount(html)
	expect(host.querySelector("select")!.value).toBe("c")

	expect(countMutations(host, html)).toBe(0)
	host.remove()
})

test("a select with two selected attributes is untouched", () => {
	const html = `<div><select id="s"><option selected>a</option><option selected>b</option></select></div>`
	const host = mount(html)

	expect(countMutations(host, html)).toBe(0)
	host.remove()
})

test("a list box select is untouched", () => {
	const html = `<div><select id="l" size="3"><option>a</option><option>b</option></select></div>`
	const host = mount(html)

	expect(countMutations(host, html)).toBe(0)
	host.remove()
})

// happy-dom doesn't implement `defaultSelected`.
test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))("a multiple select is untouched", () => {
	const html = `<div><select id="m" multiple><option>a</option><option selected>b</option></select></div>`
	const host = mount(html)

	expect(countMutations(host, html)).toBe(0)
	host.remove()
})

test("preserveChanges keeps the user's choices in a multiple select", () => {
	const host = mount(`<div><select id="m" multiple><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.options[1]!.selected = true

	morph(
		host.firstElementChild!,
		parse(`<div><select id="m" multiple><option>a</option><option>b</option><option>c</option></select></div>`),
		{
			preserveChanges: true,
		},
	)

	expect(select.options[1]!.selected).toBe(true)
	host.remove()
})

test("preserveChanges keeps the user's choice of a drop-down option", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><option>a</option><option>b</option><option>c</option></select></div>`),
		{
			preserveChanges: true,
		},
	)

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("b")
	host.remove()
})

test("preserveChanges keeps the user's choice of the first option in a list box", () => {
	const host = mount(`<div><select id="s" size="3"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "a"

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s" size="3"><option>a</option><option>b</option><option>c</option></select></div>`),
		{
			preserveChanges: true,
		},
	)

	expect(select.value).toBe("a")
	host.remove()
})

test("an untouched option is clean when it is the root of the morph", () => {
	const host = mount(`<select><option>a</option><option>b</option></select>`)
	const option = host.querySelector("option")!

	morph(option, parse(`<option>a2</option>`))

	expect(host.querySelector("option")).toBe(option)
	expect(option.textContent).toBe("a2")
	host.remove()
})

test("an untouched drop-down shows the markup's default after options are added before its selection", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(`<div><select><option id="c">c</option></select></div>`)

		morph(
			host.firstElementChild!,
			parse(`<div><select><option>a</option><option>b</option><option id="c">c</option></select></div>`),
			{ preserveChanges },
		)

		expect(host.querySelector("select")!.value).toBe("a")
		host.remove()
	}
})

test("preserveChanges keeps the user's choice when options are added before it", () => {
	const host = mount(`<div><select id="s"><option>x</option><option id="c">c</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "c"

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><option>a</option><option>b</option><option>x</option><option id="c">c</option></select></div>`),
		{ preserveChanges: true },
	)

	expect(select.value).toBe("c")
	host.remove()
})

test("adding options to a multiple select doesn't select any", () => {
	const host = mount(`<div><select multiple><option id="c">c</option></select></div>`)

	morph(
		host.firstElementChild!,
		parse(`<div><select multiple><option>a</option><option>b</option><option id="c">c</option></select></div>`),
	)

	expect(host.querySelector("select")!.selectedOptions).toHaveLength(0)
	host.remove()
})
