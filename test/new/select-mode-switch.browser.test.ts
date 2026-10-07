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

test("a multiple select the user deselected shows the markup's option when it becomes a drop-down", () => {
	const host = mount(
		`<form><select name="t" multiple><option value="2" selected>2</option><option value="3">3</option></select></form>`,
	)
	const select = host.querySelector("select")!
	select.options[0]!.selected = false

	morph(
		host.firstElementChild!,
		parse(`<form><select name="t"><option value="3">3</option><option value="2">2</option></select></form>`),
		{ preserveChanges: true },
	)

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("3")
	host.remove()
})

test("an untouched list box without a selection shows the markup's option when it becomes a drop-down", () => {
	const host = mount(`<form><select name="t" size="3"><option>a</option><option>b</option></select></form>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<form><select name="t"><option>b</option><option>a</option></select></form>`), {
		preserveChanges: true,
	})

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("b")
	host.remove()
})

test("a multiple select the user deselected stays without a selection when it stays multiple", () => {
	const host = mount(`<form><select name="t" multiple><option selected>a</option><option>b</option></select></form>`)
	const select = host.querySelector("select")!
	select.options[0]!.selected = false

	morph(
		host.firstElementChild!,
		parse(`<form><select name="t" multiple size="4"><option>b</option><option selected>a</option></select></form>`),
		{ preserveChanges: true },
	)

	expect(select.selectedOptions.length).toBe(0)
	host.remove()
})

test("a drop-down the user emptied stays empty when it stays a drop-down", () => {
	const host = mount(`<form><select name="t"><option>a</option><option>b</option></select></form>`)
	const select = host.querySelector("select")!
	select.selectedIndex = -1

	morph(host.firstElementChild!, parse(`<form class="x"><select name="t"><option>a</option><option>b</option></select></form>`), {
		preserveChanges: true,
	})

	expect(select.selectedIndex).toBe(-1)
	host.remove()
})
