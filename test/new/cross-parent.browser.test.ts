import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// Customizable selects count options inside other elements. Other browsers don't.
function supportsOptionWrappers(): boolean {
	const select = document.createElement("select")
	const div = document.createElement("div")
	div.append(document.createElement("option"))
	select.append(div)
	return select.options.length === 1
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

test("a vetoed element keeps a descendant that the target wraps around it", () => {
	for (const veto of ["beforeNodeVisited", "beforeChildrenVisited"]) {
		const host = mount(`<div><section id="a"><span id="b"><i>x</i></span></section></div>`)
		const a = host.querySelector("#a")!
		const b = host.querySelector("#b")!

		morph(host.firstElementChild!, parse(`<div><span id="b"><section id="a"><i>y</i></section></span></div>`), {
			[veto]: (node: Node) => node !== a,
		})

		expect(b.parentElement).toBe(a)
		expect(a.innerHTML).toBe(`<span id="b"><i>x</i></span>`)
		host.remove()
	}
})

test("a vetoed element keeps a descendant when another move is what reaches it", () => {
	for (const veto of ["beforeNodeVisited", "beforeChildrenVisited"]) {
		const host = mount(`<div><div id="w"><section id="a"><b id="b">x</b></section></div><div><span id="c"></span></div></div>`)
		const a = host.querySelector("#a")!
		const b = host.querySelector("#b")!

		morph(host.firstElementChild!, parse(`<div><b id="b">x</b><span id="c"><section id="a"></section></span></div>`), {
			[veto]: (node: Node) => node !== a,
		})

		expect(b.parentElement).toBe(a)
		expect(a.innerHTML).toBe(`<b id="b">x</b>`)
		host.remove()
	}
})

test("an element wrapped in its own descendant keeps its node, and the descendant is recreated", () => {
	const host = mount(`<div><section id="a"><span id="b"><input id="c"></span></section></div>`)
	const a = host.querySelector("#a")!
	const b = host.querySelector("#b")!
	const c = host.querySelector("#c")!

	morph(host.firstElementChild!, parse(`<div><span id="b"><section id="a"></section><input id="c"></span></div>`))

	expect(host.innerHTML).toBe(`<div><span id="b"><section id="a"></section><input id="c"></span></div>`)
	expect(host.querySelector("#a")).toBe(a)
	expect(host.querySelector("#b")).not.toBe(b)
	expect(host.querySelector("#c")).toBe(c)
	host.remove()
})

test("an element of the same tag as the ancestor it wraps is recreated, and the ancestor keeps its node", () => {
	const host = mount(`<div><div id="a"><div id="b"></div></div></div>`)
	const a = host.querySelector("#a")!
	const b = host.querySelector("#b")!

	morph(host.firstElementChild!, parse(`<div><div id="b"><div id="a"></div></div></div>`))

	expect(host.innerHTML).toBe(`<div><div id="b"><div id="a"></div></div></div>`)
	expect(host.querySelector("#a")).toBe(a)
	expect(host.querySelector("#b")).not.toBe(b)
	host.remove()
})

test("an element keeps its node when the ancestor it wraps can't move", () => {
	const host = mount(`<div><section id="a"><div id="b"></div></section></div>`)
	const b = host.querySelector("#b")!

	morph(host.firstElementChild!, parse(`<div><div id="b"><article id="a"></article></div></div>`))

	expect(host.innerHTML).toBe(`<div><div id="b"><article id="a"></article></div></div>`)
	expect(host.querySelector("#b")).toBe(b)
	host.remove()
})

test("vetoed elements keep their descendants when moves wait on each other in a cycle", () => {
	const from = `<div><section id="a"><span id="b"></span></section><article id="c"><i id="d"></i></article></div>`
	const to = `<div><span id="b"><article id="c"></article></span><i id="d"><section id="a"></section></i></div>`
	for (const [vetoed, child] of [
		["a", "b"],
		["c", "d"],
	]) {
		for (const veto of ["beforeNodeVisited", "beforeChildrenVisited"]) {
			const host = mount(from)
			const element = host.querySelector(`#${vetoed}`)!
			const descendant = host.querySelector(`#${child}`)!

			morph(host.firstElementChild!, parse(to), { [veto]: (node: Node) => node !== element })

			expect(descendant.parentElement).toBe(element)
			host.remove()
		}
	}

	const host = mount(from)
	morph(host.firstElementChild!, parse(to))
	expect(host.innerHTML).toBe(to)
	host.remove()
})

test("a move doesn't wait on an ancestor whose id appears twice in the target", () => {
	const host = mount(`<div><section id="x"><b id="b"></b></section><article id="y"><i id="d"></i></article></div>`)
	const b = host.querySelector("#b")!
	const d = host.querySelector("#d")!

	const to = `<div><b id="b"><article id="y"></article></b><i id="d"><section id="x"></section></i><p id="x"></p><p id="y"></p></div>`
	morph(host.firstElementChild!, parse(to))

	expect(host.innerHTML).toBe(to)
	expect(host.querySelector("#b")).toBe(b)
	expect(host.querySelector("#d")).toBe(d)
	host.remove()
})

test.skipIf(!supportsOptionWrappers())(
	"an element keeps its node when the ancestor it wraps holds options for another select",
	() => {
		const host = mount(
			`<div><select id="s"><div id="a"><option>x</option><div id="b"></div></div></select><select id="t"></select></div>`,
		)
		const b = host.querySelector("#b")!

		const to = `<div><select id="s"></select><select id="t"><div id="b"><div id="a"><option>x</option></div></div></select></div>`
		morph(host.firstElementChild!, parse(to))

		expect(host.querySelector("#b")).toBe(b)
		expect(b.querySelector("#a > option")).not.toBe(null)
		host.remove()
	},
)

test("an element wrapped in its own descendant moves into a select inside it", () => {
	const host = mount(`<div><div id="a"><span id="b"></span></div></div>`)
	const a = host.querySelector("#a")!

	morph(host.firstElementChild!, parse(`<div><span id="b"><select><div id="a"></div></select></span></div>`))

	expect(host.querySelector("#a")).toBe(a)
	expect(host.querySelector("#b")!.contains(a)).toBe(true)
	host.remove()
})

test("a recreated form checks the radio its markup checks over one outside it", () => {
	const host = mount(`<div><span id="a"><form id="f"><input type="radio" name="r" checked></form></span></div>`)
	host.insertAdjacentHTML("beforebegin", `<input type="radio" name="r" form="f" checked>`)
	const outside = host.previousElementSibling as HTMLInputElement

	morph(
		host.firstElementChild!,
		parse(`<div><form id="f"><span id="a"></span><input type="radio" name="r" checked></form></div>`),
	)

	expect(host.querySelector("input")!.checked).toBe(true)
	expect(outside.checked).toBe(false)
	outside.remove()
	host.remove()
})

test("an added radio shows the checked state its markup says, even when it arrives unchecked", () => {
	const host = mount(`<div><input type="radio" name="r" class="a" checked></div>`)
	const target = parse(`<div><input type="radio" name="r" class="a"><input type="radio" name="r" checked></div>`)
	const added = target.lastElementChild as HTMLInputElement
	added.checked = false

	morph(host.firstElementChild!, target)

	expect(added.checked).toBe(true)
	expect(host.querySelector("input")!.checked).toBe(false)
	host.remove()
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

test("vetoing the addition keeps a root that an input inside it would replace", () => {
	const host = mount(`<div><input id="d"></div>`)
	const root = host.firstElementChild!
	const input = host.querySelector("input")!
	const added: Array<string> = []

	morph(root, `<input id="d">`, {
		beforeNodeAdded: (_parent, node) => {
			added.push(node.nodeName)
			return false
		},
	})

	expect(added).toEqual(["INPUT"])
	expect(host.firstElementChild).toBe(root)
	expect(root.firstElementChild).toBe(input)
	host.remove()
})

test("a replacement whose element is pinned by another move is added without asking again", () => {
	const host = mount(`<div id="r"><section id="a"><p id="x">x</p></section></div>`)
	const section = host.querySelector("section")!
	const template = document.createElement("template")
	template.innerHTML = `<p id="x">x</p><section id="a"></section>`
	const offered: Array<Node> = []

	morph(host.firstElementChild!, template.content.childNodes, {
		beforeNodeAdded: (_parent, node) => {
			offered.push(node)
			return offered.filter((offeredNode) => offeredNode === node).length === 1
		},
		beforeNodeVisited: (node) => node !== section,
	})

	expect(host.innerHTML).toBe(`<p id="x">x</p><section id="a"><p id="x">x</p></section>`)
	expect(host.lastElementChild).toBe(section)
	expect(new Set(offered).size).toBe(offered.length)
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

test.skipIf(!supportsOptionWrappers())(
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

test.skipIf(!supportsOptionWrappers())("a select shows its markup's default after an option wrapper moves within it", () => {
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
	const target = el("div", "", el("select", "s", el("div", "a"), el("option", "y", "y"), el("div", "w", el("option", "x", "x"))))

	morph(host.firstElementChild!, target)

	expect(host.querySelector<HTMLSelectElement>("select")!.value).toBe("y")
	host.remove()
})

test.skipIf(!supportsOptionWrappers())("a select shows its markup's default after an unplaced option wrapper is removed", () => {
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
})

test("a checked radio that moves into another form leaves that form's checked radio checked", () => {
	const host = mount(
		`<div><form id="a"><input id="x" type="radio" name="r" checked></form><form id="b"><input id="y" type="radio" name="r" checked></form></div>`,
	)
	const x = host.querySelector<HTMLInputElement>("#x")!
	const y = host.querySelector<HTMLInputElement>("#y")!

	morph(
		host.firstElementChild!,
		parse(
			`<div><form id="a"></form><form id="b"><input id="x" type="radio" name="r"><input id="y" type="radio" name="r" checked></form></div>`,
		),
	)

	expect(host.querySelector("#x")).toBe(x)
	expect(x.checked).toBe(false)
	expect(y.checked).toBe(true)
	host.remove()
})

test("a radio that moves out of a form keeps the checkedness its markup gives it", () => {
	const host = mount(
		`<div><form id="f"><input id="x" type="radio" name="r" checked><input id="y" type="radio" name="r" checked></form></div>`,
	)
	const x = host.querySelector<HTMLInputElement>("#x")!
	const y = host.querySelector<HTMLInputElement>("#y")!

	morph(
		host.firstElementChild!,
		parse(
			`<div><input id="y" type="radio" name="r" checked><form id="f"><input id="x" type="radio" name="r" checked></form></div>`,
		),
	)

	expect(x.checked).toBe(true)
	expect(y.checked).toBe(true)
	host.remove()
})

test("an element moves into a new wrapper inside a moving element", () => {
	const host = mount(`<div><section id="s"><input id="x"></section></div>`)
	const section = host.querySelector("#s")!
	const input = host.querySelector("#x")!

	morph(host.firstElementChild!, parse(`<div><footer><section id="s"><label><input id="x"></label></section></footer></div>`))

	expect(host.innerHTML).toBe(`<div><footer><section id="s"><label><input id="x"></label></section></footer></div>`)
	expect(host.querySelector("#s")).toBe(section)
	expect(host.querySelector("#x")).toBe(input)
	host.remove()
})

test("an element moves from one moving element into another", () => {
	const host = mount(`<div><label><form id="a"></form><form id="b"><button id="x"></button></form></label></div>`)
	const button = host.querySelector("#x")!

	morph(host.firstElementChild!, parse(`<div><form id="a"><button id="x"></button></form><form id="b"></form></div>`))

	expect(host.innerHTML).toBe(`<div><form id="a"><button id="x"></button></form><form id="b"></form></div>`)
	expect(host.querySelector("#x")).toBe(button)
	host.remove()
})

test("an element moves out of a moving element without being removed with its old parent", () => {
	const host = mount(`<div><section id="s"><p><input id="x"></p></section><aside id="a"></aside></div>`)
	const input = host.querySelector("#x")!
	const seen: Array<string> = []

	morph(
		host.firstElementChild!,
		parse(`<div><footer><section id="s"></section></footer><main><aside id="a"><input id="x"></aside></main></div>`),
		{
			afterNodeRemoved: (node) => node.contains(input) && seen.push("removed with the input inside"),
		},
	)

	expect(host.innerHTML).toBe(
		`<div><footer><section id="s"></section></footer><main><aside id="a"><input id="x"></aside></main></div>`,
	)
	expect(host.querySelector("#x")).toBe(input)
	expect(seen).toEqual([])
	host.remove()
})

test("an element left in a moving element moves when a later target takes it", () => {
	const host = mount(`<div><section id="s"><input id="x"></section><aside id="a"></aside></div>`)
	const input = host.querySelector("#x")!
	const seen: Array<string> = []

	morph(
		host.firstElementChild!,
		parse(`<div><footer><section id="s"></section></footer><main><aside id="a"><b><input id="x"></b></aside></main></div>`),
		{
			afterNodeRemoved: (node) => node.contains(input) && seen.push("removed with the input inside"),
		},
	)

	expect(host.innerHTML).toBe(
		`<div><footer><section id="s"></section></footer><main><aside id="a"><b><input id="x"></b></aside></main></div>`,
	)
	expect(host.querySelector("#x")).toBe(input)
	expect(seen).toEqual([])
	host.remove()
})

test("an element claimed before its moving ancestor moves out once the ancestor has moved", () => {
	const host = mount(`<div><section id="s"><input id="x"></section></div>`)
	const section = host.querySelector("#s")!
	const input = host.querySelector("#x")!

	morph(host.firstElementChild!, parse(`<div><aside><input id="x"></aside><footer><section id="s"></section></footer></div>`))

	expect(host.innerHTML).toBe(`<div><aside><input id="x"></aside><footer><section id="s"></section></footer></div>`)
	expect(host.querySelector("#s")).toBe(section)
	expect(host.querySelector("#x")).toBe(input)
	host.remove()
})

test("an element left in a moving element can move deeper inside it", () => {
	const host = mount(`<div><section id="s"><input id="x"><span id="t"></span></section></div>`)
	const input = host.querySelector("#x")!

	morph(
		host.firstElementChild!,
		parse(`<div><footer><section id="s"><span id="t"><input id="x"></span></section></footer></div>`),
	)

	expect(host.innerHTML).toBe(`<div><footer><section id="s"><span id="t"><input id="x"></span></section></footer></div>`)
	expect(host.querySelector("#x")).toBe(input)
	host.remove()
})

test("an element left in a moving element that nothing takes is removed", () => {
	const host = mount(`<div><section id="s"><input id="x"></section></div>`)

	morph(
		host.firstElementChild!,
		parse(`<div><footer><section id="s"></section></footer><aside><textarea id="x"></textarea></aside></div>`),
	)

	expect(host.innerHTML).toBe(`<div><footer><section id="s"></section></footer><aside><textarea id="x"></textarea></aside></div>`)
	host.remove()
})

test.skipIf(!supportsOptionWrappers())("an option wrapper stays when a new element inside its select wraps it", () => {
	const host = mount(`<div><select id="s"><div id="w"><option>a</option></div></select></div>`)
	const wrapper = host.querySelector("#w")

	morph(
		host.firstElementChild!,
		parse(`<div><select id="s"><section><div id="w"><option>a</option></div></section></select></div>`),
	)

	expect(host.querySelector("#w")).toBe(wrapper)
	expect(host.innerHTML).toBe(`<div><select id="s"><section><div id="w"><option>a</option></div></section></select></div>`)
	host.remove()
})

test.skipIf(!supportsOptionWrappers())("an element moves into a new select", () => {
	const host = mount(`<div><div id="w"></div></div>`)
	const wrapper = host.querySelector("#w")
	const select = document.createElement("select")
	const div = document.createElement("div")
	div.id = "w"
	select.append(div)
	const target = document.createElement("div")
	target.append(select)

	morph(host.firstElementChild!, target)

	expect(host.querySelector("#w")).toBe(wrapper)
	expect(host.innerHTML).toBe(`<div><select><div id="w"></div></select></div>`)
	host.remove()
})

test("an element whose `is` changes is recreated where it is, before the nodes that follow it", () => {
	const host = mount(`<div><button id="b" is="x-a"></button><p>1</p></div>`)
	const button = host.querySelector("#b")!

	morph(host.firstElementChild!, `<div><button id="b" is="x-b"></button><span>2</span><p>1</p></div>`)

	expect(host.innerHTML).toBe(`<div><button id="b" is="x-b"></button><span>2</span><p>1</p></div>`)
	expect(host.querySelector("#b")).not.toBe(button)
	host.remove()
})

test("an element whose `is` changes isn't moved across parents", () => {
	const host = mount(`<div><section><button id="b" is="x-a"></button></section><aside></aside></div>`)
	const button = host.querySelector("#b")!

	morph(host.firstElementChild!, `<div><section></section><aside><button id="b" is="x-b"></button></aside></div>`)

	expect(host.innerHTML).toBe(`<div><section></section><aside><button id="b" is="x-b"></button></aside></div>`)
	expect(host.querySelector("#b")).not.toBe(button)
	host.remove()
})

test.skipIf(!supportsOptionWrappers())(
	"a select inside a moved element shows its markup's default after its option wrappers move",
	() => {
		const host = mount(
			`<div><section><div id="m"><select><div id="x"><div id="w"><option>a</option></div></div><option>b</option></select></div></section><aside></aside></div>`,
		)

		morph(
			host.firstElementChild!,
			`<div><section></section><aside><div id="m"><select><div id="x"></div><option>b</option><div id="y"><div id="w"><option>a</option></div></div></select></div></aside></div>`,
		)

		expect(host.querySelector("select")!.value).toBe("b")
		host.remove()
	},
)

test("an element that moves to another parent stays when its visit is vetoed", () => {
	const host = mount(`<div><p id="p"><b id="b">x</b></p><p id="q"></p></div>`)
	const b = host.querySelector("b")!

	morph(host.firstElementChild!, parse(`<div><p id="p"></p><p id="q"><b id="b">y</b></p></div>`), {
		beforeNodeVisited: (node) => node !== b,
	})

	expect(host.innerHTML).toBe(`<div><p id="p"></p><p id="q"><b id="b">x</b></p></div>`)
	expect(host.querySelector("b")).toBe(b)
	host.remove()
})

test("an element that moves to another parent stays when its children are vetoed", () => {
	const host = mount(`<div><p id="p"><b id="b" class="old">x</b></p><p id="q"></p></div>`)
	const b = host.querySelector("b")!

	morph(host.firstElementChild!, parse(`<div><p id="p"></p><p id="q"><b id="b" class="new">y</b></p></div>`), {
		beforeChildrenVisited: (node) => node !== b,
	})

	expect(host.innerHTML).toBe(`<div><p id="p"></p><p id="q"><b id="b" class="new">x</b></p></div>`)
	expect(host.querySelector("b")).toBe(b)
	host.remove()
})

test("an element that moves out of a replaced parent stays when its visit is vetoed", () => {
	const host = mount(`<div><p id="p"><b id="b">x</b></p></div>`)
	const b = host.querySelector("b")!

	morph(host.firstElementChild!, parse(`<div><p id="q"><b id="b">y</b></p></div>`), {
		beforeNodeVisited: (node) => node !== b,
	})

	expect(host.innerHTML).toBe(`<div><p id="q"><b id="b">x</b></p></div>`)
	expect(host.querySelector("b")).toBe(b)
	host.remove()
})

test("an element inside a vetoed element that moved stays inside it", () => {
	const host = mount(`<div><p id="p"><b id="b"><i id="i">x</i></b></p><p id="q"></p><p id="r"></p></div>`)
	const b = host.querySelector("b")!
	const i = host.querySelector("i")!

	morph(host.firstElementChild!, parse(`<div><p id="p"></p><p id="q"><b id="b"></b></p><p id="r"><i id="i">y</i></p></div>`), {
		beforeNodeVisited: (node) => node !== b,
	})

	expect(host.innerHTML).toBe(`<div><p id="p"></p><p id="q"><b id="b"><i id="i">x</i></b></p><p id="r"><i id="i">y</i></p></div>`)
	expect(host.querySelector("b")).toBe(b)
	expect(b.firstChild).toBe(i)
	host.remove()
})
