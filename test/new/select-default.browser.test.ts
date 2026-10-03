import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

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
	const host = mount(`<div><select><option id="c">c</option></select></div>`)

	morph(
		host.firstElementChild!,
		parse(`<div><select><option>a</option><option>b</option><option id="c">c</option></select></div>`),
	)

	expect(host.querySelector("select")!.value).toBe("a")
	host.remove()
})

test("preserveChanges leaves the browser's selection when options are added before it", () => {
	const host = mount(`<div><select id="s"><option id="c">c</option></select></div>`)
	const select = host.querySelector("select")!

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><option>a</option><option>b</option><option id="c">c</option></select></div>`),
		{ preserveChanges: true },
	)

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("c")
	host.remove()
})

test("preserveChanges keeps the user's choice of the default option when options are added before it", () => {
	const host = mount(`<div><select id="s"><option id="a">a</option><option id="b">b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"
	select.value = "a"

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><option>x</option><option id="a">a</option><option id="b">b</option></select></div>`),
		{ preserveChanges: true },
	)

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
	host.remove()
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

// happy-dom doesn't implement list boxes, so it always selects an option.
test.skipIf(!("size" in HTMLSelectElement.prototype))("an untouched drop-down that becomes a list box selects nothing", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<div><select id="s" size="3"><option>a</option><option>b</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.selectedIndex).toBe(-1)
	host.remove()
})

test("an untouched list box that becomes a drop-down selects its first option", () => {
	const host = mount(`<div><select id="s" size="3"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<div><select id="s"><option>a</option><option>b</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
	host.remove()
})

test("an untouched drop-down that becomes a multiple select selects nothing", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<div><select id="s" multiple><option>a</option><option>b</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.selectedOptions).toHaveLength(0)
	host.remove()
})

test("an untouched multiple select that becomes a drop-down selects its first option", () => {
	const host = mount(`<div><select id="s" multiple><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<div><select id="s"><option>a</option><option>b</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
	host.remove()
})

test("an untouched drop-down shows the last selected option after its options are reordered", () => {
	const host = mount(`<div><select id="s"><option id="a" selected>a</option><option id="b" selected>b</option></select></div>`)
	const select = host.querySelector("select")!
	expect(select.value).toBe("b")

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><option id="b" selected>b</option><option id="a" selected>a</option></select></div>`),
	)

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
	host.remove()
})

test("an untouched drop-down shows its new first option after its options are reordered", () => {
	const host = mount(`<div><select id="s"><option id="a">a</option><option id="b">b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(host.firstElementChild!, parse(`<div><select id="s"><option id="b">b</option><option id="a">a</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("b")
	host.remove()
})

test("an untouched drop-down skips an option nested in a disabled optgroup", () => {
	const html = `<div><select id="s"><optgroup disabled><span><option>a</option></span></optgroup><option>b</option></select></div>`
	const host = document.createElement("div")
	host.append(parse(html))
	document.body.append(host)
	const select = host.querySelector("select")!
	const nested = select.querySelector("span")
	// Only customizable selects keep the span; elsewhere the option ends up directly in the optgroup.
	if (nested) select.querySelector("optgroup")!.append(nested)

	morph(host.firstElementChild!, parse(html))

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("b")
	host.remove()
})

test("a vetoed selected update leaves the selection alone", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(`<div><select id="s"><option>a</option><option selected>b</option></select></div>`)
		const select = host.querySelector("select")!

		morph(host.firstElementChild!, parse(`<div><select id="s"><option>a</option><option>b</option></select></div>`), {
			preserveChanges,
			beforeAttributeUpdated: (_element, name) => name !== "selected",
		})

		expect(host.querySelector("select")).toBe(select)
		expect(select.options[1]!.hasAttribute("selected")).toBe(true)
		expect(select.value).toBe("b")
		host.remove()
	}
})

// happy-dom doesn't implement `defaultSelected`.
test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))(
	"an option in an SVG select is compared with its own default",
	() => {
		const host = mount(`<div><svg></svg></div>`)
		const select = document.createElementNS("http://www.w3.org/2000/svg", "select")
		const option = document.createElement("option")
		option.textContent = "a"
		select.append(option)
		host.querySelector("svg")!.append(select)

		morph(host.firstElementChild!, host.firstElementChild!.cloneNode(true) as Element)

		expect(host.querySelector("option")).toBe(option)
		expect(option.selected).toBe(false)
		host.remove()
	},
)

test("resetting a drop-down shows the markup's first option", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(host.firstElementChild!, parse(`<div><select id="s"><option>a</option><option>b</option></select></div>`))

	expect(host.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
	host.remove()
})

// happy-dom doesn't implement list boxes and parses `size` differently.
test.skipIf(!("size" in HTMLSelectElement.prototype))(
	"a drop-down whose size starts with a non-breaking space is untouched",
	() => {
		const html = `<div><select id="s" size="\u00a02"><option>a</option><option>b</option></select></div>`
		const host = mount(html)
		expect(host.querySelector("select")!.value).toBe("a")

		expect(countMutations(host, html)).toBe(0)
		host.remove()
	},
)

test("a list box whose size has leading whitespace and a plus sign is untouched", () => {
	const html = `<div><select id="s" size=" +3"><option>a</option><option>b</option></select></div>`
	const host = mount(html)

	expect(countMutations(host, html)).toBe(0)
	host.remove()
})
test("an SVG element named option inside a select is untouched", () => {
	const host = mount(`<div><select id="s"><option>a</option></select></div>`)
	host.querySelector("select")!.append(document.createElementNS("http://www.w3.org/2000/svg", "option"))
	const html = host.innerHTML

	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true, childList: true })
	morph(host.firstElementChild!, host.firstElementChild!.cloneNode(true) as Element)

	expect(observer.takeRecords()).toHaveLength(0)
	expect(host.innerHTML).toBe(html)
	observer.disconnect()
	host.remove()
})

test("an inner morph of an optgroup shows the select's new first option", () => {
	const host = mount(`<div><select id="s"><optgroup id="g"><option id="a">a</option></optgroup></select></div>`)
	const select = host.querySelector("select")!

	morphInner(host.querySelector("optgroup")!, `<optgroup id="g"><option>x</option><option id="a">a</option></optgroup>`)

	expect(select.value).toBe("x")
	host.remove()
})

test("preserveChanges keeps the user's choice when morphing an option inside the select", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(select.options[0]!, parse(`<option>a2</option>`), { preserveChanges: true })

	expect(select.value).toBe("b")
	expect(select.options[0]!.textContent).toBe("a2")
	host.remove()
})

test("a vetoed morph of an option leaves the user's choice alone", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morph(select.options[0]!, parse(`<option>a2</option>`), { beforeNodeVisited: () => false })

	expect(select.value).toBe("b")
	host.remove()
})

test("a vetoed inner morph of an optgroup leaves the user's choice alone", () => {
	const host = mount(`<div><select id="s"><optgroup id="g"><option>a</option><option>b</option></optgroup></select></div>`)
	const select = host.querySelector("select")!
	select.value = "b"

	morphInner(host.querySelector("optgroup")!, `<optgroup id="g"><option>x</option></optgroup>`, {
		beforeChildrenVisited: () => false,
	})

	expect(select.value).toBe("b")
	host.remove()
})
test("morphing an option in a multiple select applies its selected attribute", () => {
	const host = mount(`<div><select id="m" multiple><option>a</option><option selected>b</option></select></div>`)
	const select = host.querySelector("select")!

	morph(select.options[0]!, parse(`<option selected>a</option>`))

	expect([...select.selectedOptions].map((option) => option.value)).toEqual(["a", "b"])
	host.remove()
})

test("an SVG select next to an untouched select is untouched", () => {
	const host = mount(`<div><select id="s"><option>a</option><option>b</option></select></div>`)
	host.firstElementChild!.append(document.createElementNS("http://www.w3.org/2000/svg", "select"))
	const html = host.innerHTML

	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true, childList: true })
	morph(host.firstElementChild!, host.firstElementChild!.cloneNode(true) as Element)

	expect(observer.takeRecords()).toHaveLength(0)
	expect(host.innerHTML).toBe(html)
	observer.disconnect()
	host.remove()
})

// happy-dom doesn't implement `defaultSelected`.
test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))(
	"an untouched select with options nested in a datalist or optgroup is untouched",
	() => {
		for (const wrapper of ["datalist", "optgroup"]) {
			const host = mount(`<div><select id="s"><optgroup><option>a</option></optgroup><option>b</option></select></div>`)
			const select = host.querySelector("select")!
			const nested = document.createElement(wrapper)
			nested.innerHTML = `<option selected>c</option>`
			host.querySelector("optgroup")!.append(nested)
			const value = select.value
			const html = host.innerHTML

			const observer = new MutationObserver(() => {})
			observer.observe(host, { subtree: true, attributes: true, childList: true })
			morph(host.firstElementChild!, host.firstElementChild!.cloneNode(true) as Element)

			expect(observer.takeRecords()).toHaveLength(0)
			expect(host.innerHTML).toBe(html)
			expect(select.value).toBe(value)
			observer.disconnect()
			host.remove()
		}
	},
)

test("an option inside an SVG optgroup in a disabled optgroup is disabled", () => {
	const host = mount(`<div><select id="s"><optgroup disabled></optgroup><option>b</option></select></div>`)
	const select = host.querySelector("select")!
	const foreign = document.createElementNS("http://www.w3.org/2000/svg", "optgroup")
	const option = document.createElement("option")
	option.textContent = "a"
	foreign.append(option)
	host.querySelector("optgroup")!.append(foreign)
	const html = host.innerHTML

	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, attributes: true, childList: true })
	morph(host.firstElementChild!, host.firstElementChild!.cloneNode(true) as Element)

	expect(observer.takeRecords()).toHaveLength(0)
	expect(host.innerHTML).toBe(html)
	expect(select.value).toBe("b")
	observer.disconnect()
	host.remove()
})

test("a new option that comes out of its parsed select selected doesn't take the user's choice", () => {
	for (const wrapper of ["", "optgroup"]) {
		const host = mount(`<div><select id="s"><option id="a">a</option><option id="b">b</option></select></div>`)
		const select = host.querySelector("select")!
		select.value = "b"
		const x = wrapper ? `<${wrapper}><option>x</option></${wrapper}>` : `<option>x</option>`
		const target = parse(`<div><select id="s">${x}<option id="a">a</option><option id="b">b</option></select></div>`)
		target.querySelector("option")!.selected = true

		morph(host.firstElementChild!, target, { preserveChanges: true })

		expect(select.options).toHaveLength(3)
		expect(select.value).toBe("b")
		expect(select.options[0]!.hasAttribute("selected")).toBe(false)
		host.remove()
	}
})
