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

test("an element moves into a later node of a node list", () => {
	const host = mount(`<div><div><input id="d"></div></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	const template = document.createElement("template")
	template.innerHTML = `<div></div><input id="d">`
	morph(host.firstElementChild!.firstElementChild!, template.content.childNodes, { preserveChanges: true })

	expect(host.innerHTML).toBe(`<div><div></div><input id="d"></div>`)
	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("an element sharing its id with the morph root isn't moved", () => {
	const host = mount(`<div id="x"><p><input id="x"></p></div>`)
	const input = host.querySelector("input")!

	morph(host.firstElementChild!, parse(`<div id="x"><input id="x"></div>`))

	expect(host.innerHTML).toBe(`<div id="x"><input id="x"></div>`)
	expect(host.querySelector("input")).not.toBe(input)
	host.remove()
})

test("the root's callbacks see the finished DOM after a move", () => {
	const host = mount(`<div><p><input id="d"></p></div>`)
	const root = host.firstElementChild!
	const p = host.querySelector("p")!
	const log: Array<string> = []

	morph(root, parse(`<div><input id="d"></div>`), {
		afterNodeRemoved: (node) => log.push(`removed ${(node as Element).localName}`),
		afterChildrenVisited: (node) => node === root && log.push(`children ${root.innerHTML}`),
		afterNodeVisited: (node) => node === root && log.push("visited"),
	})

	expect(log).toEqual(["removed p", `children <input id="d">`, "visited"])
	expect(p.isConnected).toBe(false)
	host.remove()
})

test("elements inside a subtree whose visit is vetoed don't move", () => {
	for (const options of [
		{ beforeChildrenVisited: (node: ParentNode) => (node as Element).id !== "s" },
		{ beforeNodeVisited: (node: Node) => (node as Element).id !== "s" },
	]) {
		const host = mount(`<div><section id="s"><input id="x"></section><aside id="a"></aside></div>`)
		const input = host.querySelector("input")!

		morph(host.firstElementChild!, parse(`<div><section id="s"></section><aside id="a"><input id="x"></aside></div>`), options)

		expect(input.parentElement).toBe(host.querySelector("section"))
		expect(host.querySelector("aside")!.innerHTML).toBe(`<input id="x">`)
		host.remove()
	}
})

test("an element can be recreated while another moves in the same morph", () => {
	const host = mount(`<div><input id="d" type="text"><p><input id="e"></p></div>`)
	const e = host.querySelector("#e")!

	morph(host.firstElementChild!, parse(`<div><input id="d" type="checkbox"><input id="e"></div>`))

	expect(host.innerHTML).toBe(`<div><input id="d" type="checkbox"><input id="e"></div>`)
	expect(host.querySelector("#e")).toBe(e)
	host.remove()
})

test("an element doesn't move into an earlier sibling out of a subtree whose visit is vetoed later", () => {
	for (const options of [
		{ beforeChildrenVisited: (node: ParentNode) => (node as Element).id !== "s" },
		{ beforeNodeVisited: (node: Node) => (node as Element).id !== "s" },
	]) {
		const host = mount(`<div><aside id="a"></aside><section id="s"><input id="x"></section></div>`)
		const input = host.querySelector("input")!

		morph(host.firstElementChild!, parse(`<div><aside id="a"><input id="x"></aside><section id="s"></section></div>`), options)

		expect(input.parentElement).toBe(host.querySelector("section"))
		expect(host.querySelector("aside")!.innerHTML).toBe(`<input id="x">`)
		host.remove()
	}
})

test("a pinned element's target nested in a new node is still added", () => {
	const host = mount(`<div><section id="s"><input id="x"></section></div>`)
	const input = host.querySelector("input")!

	morph(host.firstElementChild!, parse(`<div><aside><p><input id="x"></p></aside><section id="s"></section></div>`), {
		beforeChildrenVisited: (node) => (node as Element).id !== "s",
	})

	expect(input.parentElement).toBe(host.querySelector("section"))
	expect(host.querySelector("aside")!.innerHTML).toBe(`<p><input id="x"></p>`)
	host.remove()
})

test("an element holding options doesn't move into or out of a select", () => {
	function wrapper(): HTMLElement {
		const div = document.createElement("div")
		div.id = "w"
		for (const text of ["x", "y"]) div.appendChild(document.createElement("option")).textContent = text
		return div
	}

	function select(id: string, ...children: Array<Node>): HTMLSelectElement {
		const select = document.createElement("select")
		select.id = id
		select.append(...children)
		return select
	}

	for (const [from, to] of [
		[
			[select("a", wrapper()), select("b")],
			[select("a"), select("b", wrapper())],
		],
		[[wrapper(), select("b")], [select("b", wrapper())]],
	]) {
		const host = mount(`<div></div>`)
		host.firstElementChild!.append(...from!)
		const live = host.querySelector("#w")!
		const target = document.createElement("div")
		target.append(...to!)

		morph(host.firstElementChild!, target)

		expect(host.querySelector("#w")).not.toBe(live)
		expect(host.querySelector("#b #w")).not.toBe(null)
		host.remove()
	}
})

test("the root's callbacks see the finished DOM when the root's children are vetoed", () => {
	const host = mount(`<div><input id="x"></div>`)
	const root = host.firstElementChild!
	const input = host.querySelector("input")!
	const seen: Array<string> = []

	const template = document.createElement("template")
	template.innerHTML = `<div></div><aside><input id="x"></aside>`
	morph(root, template.content.childNodes, {
		beforeChildrenVisited: (node) => node !== root,
		afterNodeVisited: (node) => node === root && seen.push(host.innerHTML),
	})

	expect(seen).toEqual([`<div><input id="x"></div><aside><input id="x"></aside>`])
	expect(input.parentElement).toBe(root)
	host.remove()
})

test("a discarded target in a new node never connects", () => {
	const connected: Array<Element> = []
	const name = `x-probe-${Math.random().toString(36).slice(2)}`
	customElements.define(
		name,
		class extends HTMLElement {
			connectedCallback(): void {
				connected.push(this)
			}
		},
	)

	const host = mount(`<div><${name} id="p"></${name}></div>`)
	const live = host.querySelector(name)!
	connected.length = 0

	morph(host.firstElementChild!, parse(`<div><section><${name} id="p"></${name}></section></div>`))

	expect(host.querySelector(name)).toBe(live)
	expect(connected.every((element) => element === live)).toBe(true)
	host.remove()
})

test("a move survives a custom element that replaces its children when it connects", () => {
	const name = `x-wipe-${Math.random().toString(36).slice(2)}`
	customElements.define(
		name,
		class extends HTMLElement {
			connectedCallback(): void {
				this.replaceChildren()
			}
		},
	)

	const host = mount(`<div><p><input id="d"></p></div>`)

	morph(host.firstElementChild!, parse(`<div><${name}><input id="d"></${name}></div>`))

	expect(host.innerHTML).toBe(`<div><${name}></${name}></div>`)
	host.remove()
})

test("an element holding options moves within its select", () => {
	function select(...children: Array<Node>): HTMLSelectElement {
		const select = document.createElement("select")
		select.id = "s"
		select.append(...children)
		return select
	}

	function div(id: string, ...children: Array<Node>): HTMLDivElement {
		const div = document.createElement("div")
		div.id = id
		div.append(...children)
		return div
	}

	function wrapper(): HTMLDivElement {
		const option = document.createElement("option")
		option.textContent = "x"
		return div("w", option)
	}

	const host = mount(`<div></div>`)
	host.firstElementChild!.append(select(div("a", wrapper()), div("b")))
	const live = host.querySelector("#w")!
	const target = document.createElement("div")
	target.append(select(div("a"), div("b", wrapper())))

	morph(host.firstElementChild!, target)

	expect(host.querySelector("#b #w")).toBe(live)
	host.remove()
})

test("an element waits for a claimed ancestor whose visit can still be vetoed", () => {
	const host = mount(`<div><main><section id="s"><input id="x"></section></main></div>`)
	const section = host.querySelector("section")!
	const input = host.querySelector("input")!

	morph(host.firstElementChild!, parse(`<div><aside><input id="x"></aside><footer><section id="s"></section></footer></div>`), {
		beforeNodeVisited: (node) => (node as Element).id !== "s",
	})

	expect(host.querySelector("footer section")).toBe(section)
	expect(input.parentElement).toBe(section)
	expect(host.querySelector("aside")!.innerHTML).toBe(`<input id="x">`)
	host.remove()
})

test("the root's callbacks see the finished DOM when the root's replacement is vetoed", () => {
	for (const options of [
		{ beforeNodeRemoved: () => false },
		{ beforeNodeAdded: (_parent: ParentNode, node: Node) => node.nodeName !== "DIV" },
	]) {
		const host = mount(`<section><input id="x"></section>`)
		const root = host.firstElementChild!
		const seen: Array<string> = []

		const template = document.createElement("template")
		template.innerHTML = `<div></div><aside><input id="x"></aside>`
		morph(root, template.content.childNodes, {
			...options,
			afterNodeVisited: (node) => node === root && seen.push(host.innerHTML),
		})

		expect(seen).toEqual([host.innerHTML])
		expect(host.innerHTML).not.toContain("<!---->")
		host.remove()
	}
})

test("an input inside the root moves out to replace it", () => {
	const host = mount(`<div><input id="d"></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(host.firstElementChild!, `<input id="d">`, { preserveChanges: true })

	expect(host.innerHTML).toBe(`<input id="d">`)
	expect(host.firstElementChild).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test("a parent of a moving input doesn't take the input's id", () => {
	const host = mount(`<div><span><span id="d"><input></span></span><b id="e"></b></div>`)
	const span = host.querySelector("#d")!
	const outer = host.querySelector("span")!

	morphInner(host.firstElementChild!, `<div><b id="e"></b><span id="d"><input></span></div>`)

	expect(host.innerHTML).toBe(`<div><b id="e"></b><span id="d"><input></span></div>`)
	expect(host.querySelector("#d")).toBe(span)
	expect(outer.isConnected).toBe(false)
	host.remove()
})

test("morphInner ignores the id on the target's own element", () => {
	const host = mount(`<div><span><input id="d"></span></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morphInner(host.firstElementChild!, `<div id="d"><b><input id="d"></b></div>`, { preserveChanges: true })

	expect(host.innerHTML).toBe(`<div><b><input id="d"></b></div>`)
	expect(host.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	host.remove()
})

test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))(
	"a new select keeps the selection of its own markup when wrappers of its options had ids",
	() => {
		function select(): HTMLSelectElement {
			const select = document.createElement("select")
			for (const id of ["a", "b"]) {
				const div = document.createElement("div")
				div.id = id
				const option = document.createElement("option")
				option.textContent = id
				div.append(option)
				select.append(div)
			}
			return select
		}

		const host = mount(`<div></div>`)
		host.firstElementChild!.append(select())
		const target = document.createElement("div")
		const section = document.createElement("section")
		section.append(select())
		target.append(section)

		morph(host.firstElementChild!, target)

		expect(host.querySelector("select")!.selectedIndex).toBe(0)
		host.remove()
	},
)

test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))(
	"a select shows its markup's default after an option wrapper moves within it",
	() => {
		function el(tag: string, id: string, ...children: Array<Node | string>): Element {
			const element = document.createElement(tag)
			if (id) element.id = id
			element.append(...children)
			return element
		}

		const host = mount(`<div></div>`)
		host.firstElementChild!.append(
			el("select", "s", el("div", "a", el("div", "w", el("option", "x", "x"))), el("option", "y", "y")),
		)
		const target = el(
			"div",
			"",
			el("select", "s", el("div", "a"), el("option", "y", "y"), el("div", "w", el("option", "x", "x"))),
		)

		morph(host.firstElementChild!, target)

		expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("y")
		host.remove()
	},
)

test.skipIf(!("defaultSelected" in HTMLOptionElement.prototype))(
	"a select shows its markup's default after an unplaced option wrapper is removed",
	() => {
		function el(tag: string, id: string, ...children: Array<Node | string>): Element {
			const element = document.createElement(tag)
			if (id) element.id = id
			element.append(...children)
			return element
		}

		function options(): Array<Element> {
			const selected = el("option", "", "y")
			selected.setAttribute("selected", "")
			return [el("option", "", "x"), selected]
		}

		const host = mount(`<div></div>`)
		host.firstElementChild!.append(el("select", "", el("div", "w", ...options())))
		const target = el("div", "", el("select", "", el("div", "n", el("div", "w", ...options()))))

		morph(host.firstElementChild!, target)

		expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("y")
		host.remove()
	},
)
