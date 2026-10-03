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

test("an input that moves out to a later parent keeps its node and typed text", () => {
	const host = mount(`<div><p id="c"><input id="d"></p></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, parse(`<div><p id="c"></p><input id="d"></div>`), { preserveChanges: true })

	expect(host.innerHTML).toBe(`<div><p id="c"></p><input id="d"></div>`)
	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("an input that moves into an earlier parent keeps its node and typed text", () => {
	const host = mount(`<div><section id="a"></section><section id="b"><input id="d"></section></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, parse(`<div><section id="a"><input id="d"></section><section id="b"></section></div>`), {
		preserveChanges: true,
	})

	expect(host.innerHTML).toBe(`<div><section id="a"><input id="d"></section><section id="b"></section></div>`)
	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("a textarea that moves into a new wrapper keeps its node and typed text", () => {
	const host = mount(`<div><textarea id="t"></textarea></div>`)
	const textarea = host.querySelector("textarea")!
	textarea.value = "typed"

	morph(host.firstElementChild!, parse(`<div><label>Notes <textarea id="t"></textarea></label></div>`), {
		preserveChanges: true,
	})

	expect(host.innerHTML).toBe(`<div><label>Notes <textarea id="t"></textarea></label></div>`)
	expect(host.querySelector("textarea")).toBe(textarea)
	expect(textarea.value).toBe("typed")
	host.remove()
})

test("an input keeps its node when its parent is replaced", () => {
	for (const html of [`<div><section><input id="d"></section></div>`, `<div><p id="b"><input id="d"></p></div>`]) {
		const host = mount(`<div><p id="a"><input id="d"></p></div>`)
		const input = host.querySelector("input")!
		input.value = "typed"

		morph(host.firstElementChild!, parse(html), { preserveChanges: true })

		expect(host.innerHTML).toBe(html)
		expect(host.querySelector("input")).toBe(input)
		expect(input.value).toBe("typed")
		host.remove()
	}
})

test("a moved element is morphed to its target", () => {
	const host = mount(`<div><p id="c"><input id="d" class="old" value="a"></p></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, parse(`<div><p id="c"></p><input id="d" class="new" value="b"></div>`))

	expect(host.querySelector("input")).toBe(input)
	expect(input.className).toBe("new")
	expect(input.value).toBe("b")
	host.remove()
})

test("morphInner moves elements across parents too", () => {
	const host = mount(`<div><p id="c"><input id="d"></p></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morphInner(host.firstElementChild!, `<div><p id="c"></p><input id="d"></div>`, { preserveChanges: true })

	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("removal callbacks fire for the removed parent but not for the moved element", () => {
	const host = mount(`<div><p><input id="d"></p></div>`)
	const input = host.querySelector("input")!
	const p = host.querySelector("p")!
	const removed: Array<Node> = []
	const asked: Array<Node> = []

	morph(host.firstElementChild!, parse(`<div><input id="d"></div>`), {
		beforeNodeRemoved: (node) => {
			asked.push(node)
			return true
		},
		afterNodeRemoved: (node) => removed.push(node),
	})

	expect(host.querySelector("input")).toBe(input)
	expect(asked).toEqual([p])
	expect(removed).toEqual([p])
	host.remove()
})

test("an element whose target can't take it is removed and recreated", () => {
	const host = mount(`<div><p id="c"><input id="d" type="text"></p></div>`)
	const input = host.querySelector("input")!
	const removed: Array<Node> = []

	morph(host.firstElementChild!, parse(`<div><p id="c"></p><input id="d" type="checkbox"></div>`), {
		afterNodeRemoved: (node) => removed.push(node),
	})

	expect(host.innerHTML).toBe(`<div><p id="c"></p><input id="d" type="checkbox"></div>`)
	expect(host.querySelector("input")).not.toBe(input)
	expect(removed).toEqual([input])
	host.remove()
})

test("an element whose removal is vetoed stays where it was", () => {
	const host = mount(`<div><p id="c"><input id="d"></p></div>`)
	const input = host.querySelector("input")!

	morph(host.firstElementChild!, parse(`<div><p id="c"></p><span id="d"></span></div>`), {
		beforeNodeRemoved: () => false,
	})

	expect(host.innerHTML).toBe(`<div><p id="c"><input id="d"></p><span id="d"></span></div>`)
	expect(host.querySelector("input")).toBe(input)
	host.remove()
})

test("elements with duplicate ids aren't moved across parents", () => {
	for (const [from, to] of [
		[`<div><p id="c"><input id="d"></p><b id="d"></b></div>`, `<div><p id="c"></p><input id="d"></div>`],
		[`<div><p id="c"><input id="d"></p></div>`, `<div><p id="c"></p><input id="d"><input id="d"></div>`],
	]) {
		const host = mount(from!)
		const input = host.querySelector("input")!

		morph(host.firstElementChild!, parse(to!))

		expect(host.innerHTML).toBe(to)
		expect(host.querySelector("input")).not.toBe(input)
		host.remove()
	}
})

test("the root of a morph isn't moved into its own descendant", () => {
	const host = mount(`<div id="x"><span></span></div>`)
	const root = host.firstElementChild!
	const to = `<div id="y"><span><div id="x"></div></span></div>`

	morph(root, parse(to))

	expect(host.innerHTML).toBe(to)
	expect(host.firstElementChild).toBe(root)
	host.remove()
})

test("an element can move into a new node that replaced it", () => {
	const host = mount(`<div><section id="s"><span id="p"></span></section></div>`)
	const section = host.querySelector("section")!
	const to = `<div><span id="p"><section id="s"></section></span></div>`

	morph(host.firstElementChild!, parse(to))

	expect(host.innerHTML).toBe(to)
	expect(host.querySelector("section")).toBe(section)
	host.remove()
})

test("a moved element inside a clobbered wrapper discards the user's changes", () => {
	const host = mount(`<div><input id="d" value="a"></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, parse(`<div><form morphlex-clobber><p><input id="d" value="a"></p></form></div>`), {
		preserveChanges: true,
	})

	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("a")
	host.remove()
})

test("a moved element inside an untouched new wrapper keeps the user's changes", () => {
	const host = mount(`<div><input id="d" value="a"></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, parse(`<div><form><p><input id="d" value="a"></p></form></div>`), {
		preserveChanges: true,
	})

	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test.skipIf(!("moveBefore" in Element.prototype))("a focused input that moves across parents keeps focus", () => {
	const host = mount(`<div><p id="c"><input id="d"></p></div>`)
	const input = host.querySelector("input")!
	input.focus()

	morph(host.firstElementChild!, parse(`<div><p id="c"></p><input id="d"></div>`), { preserveChanges: true })

	expect(host.querySelector("input")).toBe(input)
	expect(document.activeElement).toBe(input)
	host.remove()
})

test("the root of a morph isn't moved, but elements inside it are", () => {
	const host = mount(`<section id="s"><input id="d"></section>`)
	const section = host.firstElementChild!
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(section, parse(`<span><section id="s"><input id="d"></section></span>`), { preserveChanges: true })

	expect(host.innerHTML).toBe(`<span><section id="s"><input id="d"></section></span>`)
	expect(host.querySelector("section")).not.toBe(section)
	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("options and optgroups with ids don't move to another select", () => {
	for (const [from, to] of [
		[
			`<div><select id="a"><option id="o">x</option></select><select id="b"></select></div>`,
			`<div><select id="a"></select><select id="b"><option id="o">x</option></select></div>`,
		],
		[
			`<div><select id="a"><optgroup id="o"><option>x</option></optgroup></select><select id="b"></select></div>`,
			`<div><select id="a"></select><select id="b"><optgroup id="o"><option>x</option></optgroup></select></div>`,
		],
	]) {
		const host = mount(from!)
		const moved = host.querySelector("#o")!

		morph(host.firstElementChild!, parse(to!))

		expect(host.innerHTML).toBe(to)
		expect(host.querySelector("#o")).not.toBe(moved)
		expect(host.querySelector<HTMLSelectElement>("#b")!.value).toBe("x")
		host.remove()
	}
})
