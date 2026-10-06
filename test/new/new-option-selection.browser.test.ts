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

function option(text: string): HTMLOptionElement {
	const option = document.createElement("option")
	option.textContent = text
	return option
}

function keepsWrappersInSelects(): boolean {
	return parse(`<select><div><option>x</option></div></select>`).firstElementChild?.localName === "div"
}

test("a new option with a selected attribute is selected, like any option that gains the attribute", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(`<select id="s"><option id="a">a</option><option id="b">b</option></select>`)
		const select = host.querySelector("select")!
		select.value = "b"

		morph(
			select,
			parse(`<select id="s"><option selected>n</option><option id="a">a</option><option id="b">b</option></select>`),
			{ preserveChanges },
		)

		expect(host.querySelector("select")).toBe(select)
		expect(select.value).toBe("n")
		host.remove()
	}
})

test("preserveChanges keeps the user's choice when new options come from a node list", () => {
	const host = mount(`<select id="s"><!--x--><option>a</option><option>b</option></select>`)
	const select = host.querySelector("select")!
	select.value = "b"

	const nodes = parse(`<select><!--x--><option>n</option></select>`).childNodes
	morph(select.firstChild!, nodes, { preserveChanges: true })

	expect(select.options[0]!.textContent).toBe("n")
	expect(select.value).toBe("b")
	host.remove()
})

test.skipIf(!keepsWrappersInSelects())("preserveChanges keeps the user's choice when a wrapper brings new options", () => {
	const host = mount(`<select id="s"><option>a</option><option>b</option></select>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(select, parse(`<select id="s"><div><option>n</option></div><option>a</option><option>b</option></select>`), {
		preserveChanges: true,
	})

	expect(select.options.length).toBe(3)
	expect(select.value).toBe("b")
	host.remove()
})

test("a live option passed as the target keeps its selection", () => {
	const host = mount(`<select id="s"><!--x--><option>a</option><option>b</option></select>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(select.firstChild!, select.options[1]!, { preserveChanges: true })

	expect(select.options[0]!.textContent).toBe("b")
	expect(select.value).toBe("b")
	host.remove()
})

test("a select inside a new node keeps its own selection", () => {
	const host = mount(`<select id="s"><option>a</option></select>`)
	const select = host.querySelector("select")!

	const target = document.createElement("select")
	target.id = "s"
	const wrapper = target.appendChild(document.createElement("div"))
	const inner = wrapper.appendChild(document.createElement("select"))
	inner.append(option("x"), option("y"))
	wrapper.append(option("n"))
	target.append(option("a"))

	morph(select, target, { preserveChanges: true })

	const innerSelect = select.querySelector("select")!
	expect(innerSelect.value).toBe("x")
	expect(select.value).toBe("a")
	host.remove()
})

test("new options nested in wrappers inside a select are inserted", () => {
	const host = mount(`<select id="s"><option>a</option></select>`)
	const select = host.querySelector("select")!

	const target = document.createElement("select")
	target.id = "s"
	const wrapper = target.appendChild(document.createElement("div"))
	wrapper.appendChild(document.createElement("select")).append(option("x"))
	wrapper.appendChild(document.createElement("div")).append(option("n"))
	target.append(option("a"))
	const html = target.innerHTML

	morph(select, target, { preserveChanges: true })

	expect(select.innerHTML).toBe(html)
	host.remove()
})

test("preserveChanges keeps the user's choice when new options come from a parsed document", () => {
	const host = mount(`<select id="s"><option id="a">a</option><option id="b">b</option></select>`)
	const select = host.querySelector("select")!
	select.value = "b"

	const parsed = new DOMParser().parseFromString(
		`<select id="s"><option>n</option><option id="a">a</option><option id="b">b</option></select>`,
		"text/html",
	)
	morph(select, parsed.querySelector("select")!, { preserveChanges: true })

	expect(select.options[0]!.textContent).toBe("n")
	expect(select.value).toBe("b")
	host.remove()
})

test("a new select inside a select keeps its own selection", () => {
	const host = mount(`<div></div>`)
	const select = host.appendChild(document.createElement("select"))
	select.id = "s"
	select.appendChild(document.createElement("div")).id = "w"

	const target = document.createElement("select")
	target.id = "s"
	const wrapper = target.appendChild(document.createElement("div"))
	wrapper.id = "w"
	const inner = wrapper.appendChild(document.createElement("select"))
	inner.append(option("x"), option("y"))

	morph(select, target, { preserveChanges: true })

	const innerSelect = select.querySelector("select")!
	expect(innerSelect.value).toBe("x")
	expect(innerSelect.options[0]!.selected).toBe(true)
	host.remove()
})

test("a live option passed as the target is moved", () => {
	const host = mount(`<select id="s"><!--x--><option>a</option><option>b</option></select>`)
	const select = host.querySelector("select")!
	const b = select.options[1]!

	morph(select.firstChild!, b, { preserveChanges: true })

	expect(select.options[0]).toBe(b)
	expect(select.options.length).toBe(2)
	host.remove()
})
