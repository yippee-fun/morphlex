import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

function removedNodes(target: Node, run: () => void): Array<Node> {
	const observer = new MutationObserver(() => {})
	observer.observe(target, { childList: true, subtree: true })
	run()
	const removed = observer.takeRecords().flatMap((record) => [...record.removedNodes])
	observer.disconnect()
	return removed
}

const SUPPORTS_MOVE_BEFORE = "moveBefore" in Element.prototype

// `moveBefore` keeps focus, so there the focused item moves like any other. Without it, the focused item stays put
// and its siblings move around it, even when that moves more of them.
test("a focused item that the target moves to the end moves alone with moveBefore, and otherwise stays put", () => {
	const host = mount(`<ul><li id="a"><input id="ia" value="hello"></li><li id="b">b</li><li id="c">c</li></ul>`)
	const ul = host.firstElementChild!
	const [item, b, c] = [...ul.children]
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(2, 3)

	const removed = removedNodes(ul, () =>
		morph(ul, `<ul><li id="b">b</li><li id="c">c</li><li id="a"><input id="ia" value="hello"></li></ul>`),
	)

	expect(removed).toEqual(SUPPORTS_MOVE_BEFORE ? [item] : [b, c])
	expect([...ul.children]).toEqual([b, c, item])
	expect(host.querySelector("input")).toBe(input)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([2, 3])

	host.remove()
})

test("a focused item that the target moves to the front of a long list moves alone with moveBefore", () => {
	const items = Array.from({ length: 50 }, (_, i) => `<li id="i${i}">${i}</li>`).join("")
	const focused = `<li id="f"><input id="x" value="hello"></li>`
	const host = mount(`<ul>${items}${focused}</ul>`)
	const ul = host.firstElementChild!
	const siblings = [...ul.children]
	const item = siblings.pop()!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(2, 3)

	const removed = removedNodes(ul, () => morph(ul, `<ul>${focused}${items}</ul>`))

	expect(removed).toEqual(SUPPORTS_MOVE_BEFORE ? [item] : siblings)
	expect(ul.innerHTML).toBe(`${focused}${items}`)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([2, 3])

	host.remove()
})

test("a focused item nested two levels down stays put at each level without moveBefore, and keeps focus either way", () => {
	const host = mount(
		`<div id="x">x</div><section id="s"><p id="p1">1</p><p id="p2"><textarea id="t">hello</textarea></p></section>`,
	)
	const section = host.querySelector("#s")!
	const paragraph = host.querySelector("#p2")!
	const textarea = host.querySelector("textarea")!
	textarea.focus()
	textarea.setSelectionRange(1, 4, "backward")

	const removed = removedNodes(host, () =>
		morphInner(
			host,
			`<div><section id="s"><p id="p2"><textarea id="t">hello</textarea></p><p id="p1">1</p></section><div id="x">x</div></div>`,
		),
	)

	// Each level swaps two nodes, so one moves at each level either way.
	expect(removed).toHaveLength(2)
	if (!SUPPORTS_MOVE_BEFORE) {
		expect(removed).not.toContain(section)
		expect(removed).not.toContain(paragraph)
	}
	expect(host.innerHTML).toBe(
		`<section id="s"><p id="p2"><textarea id="t">hello</textarea></p><p id="p1">1</p></section><div id="x">x</div>`,
	)
	expect(document.activeElement).toBe(textarea)
	expect([textarea.selectionStart, textarea.selectionEnd, textarea.selectionDirection]).toEqual([1, 4, "backward"])

	host.remove()
})

test("a focused input that moves to another parent keeps focus and its selection", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 3, "backward")

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`)

	expect(input.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([1, 3, "backward"])

	host.remove()
})

test("a focused input that moves keeps the caret as the user typed it", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.value = "hello world"
	input.setSelectionRange(11, 11)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`, {
		preserveChanges: true,
	})

	expect(document.activeElement).toBe(input)
	expect(input.value).toBe("hello world")
	expect([input.selectionStart, input.selectionEnd]).toEqual([11, 11])

	host.remove()
})

test("a focused input whose value the morph resets keeps focus", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 2)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="goodbye"></div></div>`)

	expect(input.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(input)
	expect(input.value).toBe("goodbye")

	host.remove()
})

test("a focused input without a selection API keeps focus when it moves", () => {
	const host = mount(`<div id="s1"><input id="x" type="number" value="5"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" type="number" value="5"></div></div>`)

	expect(input.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(input)

	host.remove()
})

test("a focused contenteditable that moves keeps focus and the caret inside it", () => {
	const host = mount(`<div id="s1"><div id="x" contenteditable="true">hello</div></div><div id="s2"></div>`)
	const editor = host.querySelector<HTMLElement>("#x")!
	const text = editor.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 1, text, 4)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><div id="x" contenteditable="true">hello</div></div></div>`)

	const selection = getSelection()!
	expect(editor.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(editor)
	expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([text, 1, text, 4])

	host.remove()
})

test("a moved contenteditable whose text the morph shortens doesn't get a selection past its end", () => {
	const host = mount(`<div id="s1"><div id="x" contenteditable="true">hello</div></div><div id="s2"></div>`)
	const editor = host.querySelector<HTMLElement>("#x")!
	const text = editor.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 4, text, 5)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><div id="x" contenteditable="true">hi</div></div></div>`)

	expect(document.activeElement).toBe(editor)
	expect(editor.textContent).toBe("hi")

	host.remove()
})

test("focus that a callback gives to another element stays there", () => {
	const host = mount(`<button id="other">other</button><div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	const other = host.querySelector("button")!
	input.focus()

	morphInner(
		host,
		`<div><button id="other">other</button><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`,
		{
			afterNodeVisited: (_from, to) => {
				if (to instanceof Element && to.id === "s1") other.focus()
			},
		},
	)

	expect(document.activeElement).toBe(other)

	host.remove()
})

test("a focused element the morph removes stays removed", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()

	morphInner(host, `<div><div id="s1"></div><div id="s2"></div></div>`)

	expect(input.isConnected).toBe(false)
	expect(document.activeElement).not.toBe(input)

	host.remove()
})

test("the root's after callbacks see focus restored", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 3)
	let seen: Array<unknown> = []

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`, {
		afterChildrenVisited: (node) => {
			if (node === host) seen = [document.activeElement, input.selectionStart, input.selectionEnd]
		},
	})

	expect(seen).toEqual([input, 1, 3])

	host.remove()
})

test("a focused element in a shadow root keeps focus when it moves", () => {
	const outer = document.createElement("div")
	document.body.append(outer)
	const shadow = outer.attachShadow({ mode: "open" })
	shadow.innerHTML = `<div><div id="s1"><input id="x" value="hello"></div><div id="s2"></div></div>`
	const root = shadow.firstElementChild!
	const input = shadow.querySelector("input")!
	input.focus()
	input.setSelectionRange(2, 4)

	morphInner(root, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`)

	expect(input.parentElement!.id).toBe("s2")
	expect(shadow.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4])

	outer.remove()
})

test("a focused contenteditable with the caret between its children keeps it when it moves", () => {
	const host = mount(`<div id="s1"><div id="x" contenteditable="true"><b>a</b><i>b</i></div></div><div id="s2"></div>`)
	const editor = host.querySelector<HTMLElement>("#x")!
	editor.focus()
	getSelection()!.collapse(editor, 1)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><div id="x" contenteditable="true"><b>a</b><i>b</i></div></div></div>`)

	const selection = getSelection()!
	expect(document.activeElement).toBe(editor)
	expect([selection.anchorNode, selection.anchorOffset]).toEqual([editor, 1])

	host.remove()
})

test("a moved contenteditable that loses the children around the caret doesn't get it back", () => {
	const host = mount(`<div id="s1"><div id="x" contenteditable="true"><b>a</b><i>b</i></div></div><div id="s2"></div>`)
	const editor = host.querySelector<HTMLElement>("#x")!
	editor.focus()
	getSelection()!.collapse(editor, 2)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><div id="x" contenteditable="true"></div></div></div>`)

	expect(document.activeElement).toBe(editor)
	expect(editor.childNodes.length).toBe(0)

	host.remove()
})

test("a focused element that can't take focus once it moves isn't forced to", () => {
	const host = mount(`<div id="s1"><div id="x" tabindex="0">x</div></div><div id="s2"></div>`)
	const element = host.querySelector<HTMLElement>("#x")!
	element.focus()

	morphInner(host, `<div><div id="s1" class="emptied"></div><div id="s2"><div id="x">x</div></div></div>`, {
		beforeNodeVisited: (from) => {
			if (from instanceof Element && from.id === "s1") element.removeAttribute("tabindex")
			return true
		},
	})

	expect(element.parentElement!.id).toBe("s2")

	host.remove()
})

test("a morph in a parsed document without a body, where the root is active, has no selection to keep", () => {
	const parse = (svg: string) =>
		new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, "image/svg+xml")
	const live = parse(`<g id="a"></g><g id="b"></g>`)
	const target = parse(`<g id="b"></g><g id="a"></g>`)

	morph(live.documentElement, target.documentElement)

	expect([...live.documentElement.children].map((child) => child.id)).toEqual(["b", "a"])
})

test("a focused input that a callback gives a type without a selection keeps focus when it moves", () => {
	const host = mount(`<div id="s1"><input id="x" value="5"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(0, 1)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="5" class="moved"></div></div>`, {
		afterNodeVisited: (from) => {
			if (from === input) input.type = "number"
		},
	})

	expect(input.parentElement!.id).toBe("s2")
	expect(input.type).toBe("number")
	expect(document.activeElement).toBe(input)

	host.remove()
})

test("an input focused inside a shadow root keeps focus and its selection when its host moves", () => {
	const host = mount(`<div id="s1"><div id="h"></div></div><div id="s2"></div>`)
	const shadowHost = host.querySelector("#h")!
	const shadow = shadowHost.attachShadow({ mode: "open" })
	shadow.innerHTML = `<input value="hello">`
	const input = shadow.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><div id="h"></div></div></div>`)

	expect(shadowHost.parentElement!.id).toBe("s2")
	expect(shadow.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])

	host.remove()
})

test("a focused input inside a live target that replaces the root's child keeps focus", () => {
	const host = mount(`<section><div><input value="hello"></div></section>`)
	const section = host.firstElementChild!
	const wrapper = section.firstElementChild!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morph(section, wrapper)

	expect(host.firstElementChild).toBe(wrapper)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])

	host.remove()
})

test("a focused input that a callback moves into a sibling keeps focus when that sibling moves", () => {
	const host = mount(`<ul><li id="a"><input value="hello"></li><li id="b">b</li><li id="c">c</li></ul>`)
	const ul = host.firstElementChild!
	const a = host.querySelector("#a")!
	const c = host.querySelector("#c")!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morph(ul, `<ul><li id="a" class="first"><input value="hello"></li><li id="c">c</li><li id="b">b</li></ul>`, {
		afterNodeVisited: (from) => {
			if (from === a) {
				c.append(input)
				input.focus()
				input.setSelectionRange(1, 4)
			}
		},
		// Keep the input where the callback put it.
		beforeChildrenVisited: (parent) => parent !== c,
	})

	expect(input.parentElement).toBe(c)
	expect([...ul.children].map((child) => child.id)).toEqual(["a", "c", "b"])
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])

	host.remove()
})

test("a focused input that a callback takes out of the document isn't focused again", () => {
	const host = mount(`<ul><li id="a"><input value="hello"></li><li id="b">b</li><li id="c">c</li></ul>`)
	const ul = host.firstElementChild!
	const a = host.querySelector("#a")!
	const input = host.querySelector("input")!
	const fragment = document.createDocumentFragment()
	input.focus()

	morph(ul, `<ul><li id="a" class="first"><input value="hello"></li><li id="c">c</li><li id="b">b</li></ul>`, {
		afterNodeVisited: (from) => {
			if (from === a) fragment.append(input)
		},
	})

	expect([...ul.children].map((child) => child.id)).toEqual(["a", "c", "b"])
	expect(input.parentNode).toBe(fragment)
	expect(document.activeElement).not.toBe(input)

	host.remove()
})

test("a focused input outside the morph is left alone", () => {
	const host = mount(`<input value="hello"><ul><li id="a">a</li><li id="b">b</li></ul>`)
	const ul = host.querySelector("ul")!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morph(ul, `<ul><li id="b">b</li><li id="a">a</li></ul>`)

	expect([...ul.children].map((child) => child.id)).toEqual(["b", "a"])
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])

	host.remove()
})

test("a caret that a callback sets after the move stays where the callback put it", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello" class="moved"></div></div>`, {
		afterNodeVisited: (from) => {
			if (from === input) input.setSelectionRange(5, 5)
		},
	})

	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5])

	host.remove()
})

test("the caret in a child of a focused contenteditable stays there when the child moves", () => {
	const host = mount(`<div id="e" contenteditable="true"><p id="a">hello</p><div id="w"></div></div>`)
	const editor = host.querySelector<HTMLElement>("#e")!
	const paragraph = host.querySelector("#a")!
	const text = paragraph.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 1, text, 3)

	morph(editor, `<div id="e" contenteditable="true"><div id="w"><p id="a">hello</p></div></div>`)

	const selection = getSelection()!
	expect(paragraph.parentElement!.id).toBe("w")
	expect(document.activeElement).toBe(editor)
	expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([text, 1, text, 3])

	host.remove()
})

test("focus that a callback sends to a focusable body stays there", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	document.body.tabIndex = -1
	input.focus()

	morphInner(host, `<div><div id="s1" class="emptied"></div><div id="s2"><input id="x" value="hello"></div></div>`, {
		afterNodeVisited: (from) => {
			if (from instanceof Element && from.id === "s1") document.body.focus()
		},
	})

	expect(input.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(document.body)

	document.body.removeAttribute("tabindex")
	host.remove()
})

test("a selection that ends in a child of a focused contenteditable stays when only that child moves", () => {
	const host = mount(`<div id="e" contenteditable="true"><p id="a">hello</p><p id="b">world</p><div id="w"></div></div>`)
	const editor = host.querySelector<HTMLElement>("#e")!
	const first = host.querySelector("#a")!.firstChild!
	const second = host.querySelector("#b")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(first, 1, second, 3)

	morph(editor, `<div id="e" contenteditable="true"><p id="a">hello</p><div id="w"><p id="b">world</p></div></div>`)

	const selection = getSelection()!
	expect(second.parentElement!.parentElement!.id).toBe("w")
	expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([
		first,
		1,
		second,
		3,
	])

	host.remove()
})

test("the caret in a child that moves out of a focused contenteditable stays in the editor, so typing still lands there", () => {
	const host = mount(`<div id="e" contenteditable="true">hello <b id="m">bold</b></div><div id="o"></div>`)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = host.querySelector("#m")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 2, text, 2)

	morphInner(host, `<div><div id="e" contenteditable="true">hello </div><div id="o"><b id="m">bold</b></div></div>`)

	const selection = getSelection()!
	expect(text.parentElement!.parentElement!.id).toBe("o")
	expect(document.activeElement).toBe(editor)
	expect(editor.contains(selection.anchorNode)).toBe(true)
	expect(editor.contains(selection.focusNode)).toBe(true)

	document.execCommand("insertText", false, "Z")
	expect(editor.textContent).toContain("Z")
	expect(text.textContent).toBe("bold")

	host.remove()
})

test("a selection with one end in a child that moves out of a focused contenteditable stays in the editor", () => {
	const host = mount(`<div id="e" contenteditable="true">hello <b id="m">bold</b></div><div id="o"></div>`)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = host.querySelector("#m")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(editor.firstChild!, 1, text, 2)

	morphInner(host, `<div><div id="e" contenteditable="true">hello </div><div id="o"><b id="m">bold</b></div></div>`)

	const selection = getSelection()!
	expect(text.parentElement!.parentElement!.id).toBe("o")
	expect(document.activeElement).toBe(editor)
	expect(editor.contains(selection.anchorNode)).toBe(true)
	expect(editor.contains(selection.focusNode)).toBe(true)

	host.remove()
})

test("the caret in a child that moves from a focused contenteditable into another one stays in the focused one", () => {
	const host = mount(
		`<div id="e" contenteditable="true">hello <b id="m">bold</b></div><div id="f" contenteditable="true">other</div>`,
	)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = host.querySelector("#m")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 2, text, 2)

	morphInner(
		host,
		`<div><div id="e" contenteditable="true">hello </div><div id="f" contenteditable="true">other<b id="m">bold</b></div></div>`,
	)

	const selection = getSelection()!
	expect(text.parentElement!.parentElement!.id).toBe("f")
	expect(document.activeElement).toBe(editor)
	expect(editor.contains(selection.anchorNode)).toBe(true)
	expect(editor.contains(selection.focusNode)).toBe(true)

	host.remove()
})

test("the caret in a child of a focused contenteditable that moves into a details stays there", () => {
	const host = mount(`<div id="e" contenteditable="true"><div id="a">hello<details></details></div></div>`)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = host.querySelector("#a")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 1, text, 3)

	morph(editor, `<div id="e" contenteditable="true"><details><div id="a">hello</div></details></div>`)

	const selection = getSelection()!
	expect(text.parentElement!.parentElement!.localName).toBe("details")
	expect(document.activeElement).toBe(editor)
	expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([text, 1, text, 3])

	host.remove()
})

test("a focused input that a live target's own id match takes out keeps focus", () => {
	const host = mount(`<section><div><input id="x" value="hello"></div></section>`)
	const section = host.firstElementChild!
	const wrapper = section.firstElementChild!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 4)

	morph(section, wrapper)

	expect(host.firstElementChild).toBe(wrapper)
	expect(host.querySelector("input")).toBe(input)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])

	host.remove()
})

// The textarea moves into an accordion item that's closed while the morph moves it in, and opened when it settles.
const intoAccordion = {
	from: `<div id="root"><label id="i0"><span id="i1"><textarea id="i2" class="b"></textarea><details class="a" name="h" open=""></details><button id="i3"></button></span></label><section id="i4"></section><button></button></div>`,
	to: `<div id="root"><details class="a" name="h" open=""><label id="i0"><span id="i1"><textarea id="i2" class="b"></textarea><button></button><button id="i3"></button></span></label></details><section id="i4"></section></div>`,
}

test("a focused textarea that moves into an item the morph opens later is focused once it's open", () => {
	const host = mount(intoAccordion.from)
	const textarea = host.querySelector("textarea")!
	textarea.focus()

	morph(host.firstElementChild!, intoAccordion.to)

	expect(host.querySelector("textarea")).toBe(textarea)
	expect(document.activeElement).toBe(textarea)

	host.remove()
})

// Move fuzzer seed 37599778253, in WebKit: inserting the open item closes the one still inside the editor, which
// closes the new one instead, so the editor can't take focus back until the morph settles and reopens it.
test("the caret in a focused contenteditable that moves into an item the morph opens later stays inside it when its text goes", () => {
	const host = mount(
		`<div><details id="e" contenteditable="true"><details name="h" open></details><b id="m">bold</b></details></div>`,
	)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = host.querySelector("#m")!.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 2, text, 2)

	morphInner(
		host.firstElementChild!,
		`<div><details name="h" open><details id="e" contenteditable="true"></details></details></div>`,
	)

	const selection = getSelection()!
	expect(host.querySelector("#e")).toBe(editor)
	expect(document.activeElement).toBe(editor)
	expect(editor.contains(selection.anchorNode)).toBe(true)
	expect(editor.contains(selection.focusNode)).toBe(true)

	host.remove()
})

test("focus that a callback sends to a focusable body stays there, even when the moved element couldn't take it back yet", () => {
	const host = mount(intoAccordion.from)
	const textarea = host.querySelector("textarea")!
	const span = host.querySelector("#i1")!
	document.body.tabIndex = -1
	textarea.focus()

	morph(host.firstElementChild!, intoAccordion.to, {
		afterNodeVisited: (from) => {
			if (from === span) document.body.focus()
		},
	})

	expect(document.activeElement).toBe(document.body)

	document.body.removeAttribute("tabindex")
	host.remove()
})

test("the caret in an editable body stays in a child that moves", () => {
	const host = mount(`<div id="s1"><p id="a">hello</p></div><div id="s2"></div>`)
	const text = host.querySelector("#a")!.firstChild!
	document.body.contentEditable = "true"
	document.body.focus()
	getSelection()!.setBaseAndExtent(text, 1, text, 3)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><p id="a">hello</p></div></div>`)

	const selection = getSelection()!
	expect(text.parentElement!.parentElement!.id).toBe("s2")
	expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset]).toEqual([text, 1, text, 3])

	document.body.removeAttribute("contenteditable")
	host.remove()
})

// Move fuzzer seed 37609181584, in WebKit: the editor can't take focus back until the morph settles, and moving the
// section around it afterwards, without `moveBefore`, takes the live ranges following the caret out of the editor.
test("the caret in a focused contenteditable that can't take focus back until the morph settles stays in its text when an element around it moves", () => {
	const host = mount(
		`<details id="a" name="h" open><section id="s"><b id="b"></b></section><section id="t"><details id="e" name="h" contenteditable="true">x y123</details></section></details>`,
	)
	const editor = host.querySelector<HTMLElement>("#e")!
	const text = editor.firstChild!
	editor.focus()
	getSelection()!.setBaseAndExtent(text, 5, text, 5)

	const template = document.createElement("template")
	template.innerHTML = `<b id="b"></b><details id="a" name="h" open><section id="s"></section><section id="t"><label><details id="e" name="h" contenteditable="true">x y</details></label></section></details>`
	morph(host.firstElementChild!, template.content.childNodes)

	const selection = getSelection()!
	expect(host.querySelector("#e")).toBe(editor)
	expect(document.activeElement).toBe(editor)
	expect(selection.anchorNode).toBe(text)
	expect(selection.isCollapsed).toBe(true)

	host.remove()
})

test("a focused contenteditable whose text a custom element's callback shortens as it moves into an item the morph opens later doesn't stop the morph", () => {
	class Shorten extends HTMLElement {
		connectedCallback() {
			if (this.hasAttribute("armed")) (this.firstChild as Text).data = "b"
		}
		connectedMoveCallback() {
			this.connectedCallback()
		}
	}
	if (!customElements.get("x-shorten")) customElements.define("x-shorten", Shorten)
	const host = mount(
		`<div><details id="e" contenteditable="true"><details name="h" open></details><x-shorten id="s">bold</x-shorten></details></div>`,
	)
	const editor = host.querySelector<HTMLElement>("#e")!
	const shorten = host.querySelector("#s")!
	editor.focus()
	getSelection()!.setBaseAndExtent(shorten.firstChild!, 3, shorten.firstChild!, 3)
	shorten.setAttribute("armed", "")

	morphInner(
		host.firstElementChild!,
		`<div><details name="h" open><details id="e" contenteditable="true"><x-shorten id="s" armed>b</x-shorten></details></details></div>`,
	)

	expect(host.querySelector("#e")).toBe(editor)
	expect(shorten.textContent).toBe("b")
	expect(document.activeElement).toBe(editor)

	host.remove()
})

test("a focused input that a custom element's callback retypes during the move doesn't stop the morph", () => {
	class Retype extends HTMLElement {
		connectedCallback() {
			if (this.hasAttribute("armed")) this.querySelector("input")!.type = "number"
		}
		connectedMoveCallback() {
			this.connectedCallback()
		}
	}
	if (!customElements.get("x-retype")) customElements.define("x-retype", Retype)
	const host = mount(`<div id="s1"><x-retype id="r"><input id="x" value="5"></x-retype></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(0, 1)
	host.querySelector("#r")!.setAttribute("armed", "")
	let settled = false

	morphInner(
		host,
		`<div><div id="s1"></div><div id="s2"><x-retype id="r" armed><input id="x" value="5" type="number"></x-retype></div></div>`,
		{
			afterChildrenVisited: (node) => {
				if (node === host) settled = true
			},
		},
	)

	expect(input.parentElement!.parentElement!.id).toBe("s2")
	expect(input.type).toBe("number")
	expect(settled).toBe(true)

	host.remove()
})

test("focus that a custom element's callback gives another element during the move stays there", () => {
	class TakeFocus extends HTMLElement {
		connectedCallback() {
			if (this.hasAttribute("armed")) document.querySelector<HTMLElement>("#other")!.focus()
		}
		connectedMoveCallback() {
			this.connectedCallback()
		}
	}
	if (!customElements.get("x-take-focus")) customElements.define("x-take-focus", TakeFocus)
	const host = mount(
		`<button id="other">other</button><div id="s1"><x-take-focus id="t"><input id="x" value="hello"></x-take-focus></div><div id="s2"></div>`,
	)
	const input = host.querySelector("input")!
	const other = host.querySelector("#other")!
	input.focus()
	host.querySelector("#t")!.setAttribute("armed", "")

	morphInner(
		host,
		`<div><button id="other">other</button><div id="s1"></div><div id="s2"><x-take-focus id="t" armed><input id="x" value="hello"></x-take-focus></div></div>`,
	)

	expect(input.parentElement!.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(other)

	host.remove()
})

test("focus that a focus handler sends elsewhere when the moved input gets it back stays there", () => {
	const host = mount(`<button id="other">other</button><div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	const other = host.querySelector<HTMLElement>("#other")!
	input.focus()
	input.addEventListener("focus", () => other.focus(), { once: true })

	morphInner(
		host,
		`<div><button id="other">other</button><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`,
	)

	expect(input.parentElement!.id).toBe("s2")
	// Browsers with moveBefore keep focus on the input, so they never focus it again.
	expect(document.activeElement).toBe("moveBefore" in Element.prototype ? input : other)

	host.remove()
})

test("a focused custom element whose own focus method throws keeps focus when it moves", () => {
	class OwnFocus extends HTMLElement {
		override focus(): void {
			throw new Error("not this one")
		}
	}
	if (!customElements.get("x-own-focus")) customElements.define("x-own-focus", OwnFocus)
	const host = mount(`<div id="s1"><x-own-focus id="x" tabindex="0">x</x-own-focus></div><div id="s2"></div>`)
	const element = host.querySelector<HTMLElement>("#x")!
	HTMLElement.prototype.focus.call(element)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><x-own-focus id="x" tabindex="0">x</x-own-focus></div></div>`)

	expect(element.parentElement!.id).toBe("s2")
	expect(document.activeElement).toBe(element)

	host.remove()
})

test("focus that a custom element's callback gives a focusable body during the move stays there", () => {
	class FocusBody extends HTMLElement {
		connectedCallback() {
			if (this.hasAttribute("armed")) document.body.focus()
		}
		connectedMoveCallback() {
			this.connectedCallback()
		}
	}
	if (!customElements.get("x-focus-body")) customElements.define("x-focus-body", FocusBody)
	const host = mount(`<div id="s1"><x-focus-body id="t"><input id="x" value="hello"></x-focus-body></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	document.body.tabIndex = -1
	input.focus()
	host.querySelector("#t")!.setAttribute("armed", "")

	try {
		morphInner(
			host,
			`<div><div id="s1"></div><div id="s2"><x-focus-body id="t" armed><input id="x" value="hello"></x-focus-body></div></div>`,
		)

		expect(input.parentElement!.parentElement!.id).toBe("s2")
		expect(document.activeElement).toBe(document.body)
	} finally {
		document.body.removeAttribute("tabindex")
		host.remove()
	}
})

test("a focused live target from another document leaves no listener behind there", () => {
	const frame = document.createElement("iframe")
	document.body.append(frame)
	const frameDocument = frame.contentDocument!
	frameDocument.body.innerHTML = `<div><input id="x" value="hello"></div><input id="other">`
	const wrapper = frameDocument.body.firstElementChild!
	frameDocument.querySelector<HTMLInputElement>("#x")!.focus()
	const host = mount(`<section><p>old</p></section>`)
	const errors: Array<unknown> = []
	const onError = (event: ErrorEvent) => errors.push(event.error)
	frame.contentWindow!.addEventListener("error", onError)

	try {
		morph(host.firstElementChild!.firstElementChild!, wrapper)
		frameDocument.querySelector<HTMLInputElement>("#other")!.focus()

		expect(host.querySelector("#x")).not.toBeNull()
		expect(errors).toEqual([])
	} finally {
		frame.remove()
		host.remove()
	}
})

test("focus that a focus handler sends to a focusable body when the moved input gets it back stays there", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	document.body.tabIndex = -1
	input.focus()
	input.addEventListener("focus", () => document.body.focus(), { once: true })

	try {
		morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello"></div></div>`)

		expect(input.parentElement!.id).toBe("s2")
		// Browsers with moveBefore keep focus on the input, so they never focus it again.
		expect(document.activeElement).toBe("moveBefore" in Element.prototype ? input : document.body)
	} finally {
		document.body.removeAttribute("tabindex")
		host.remove()
	}
})

test("focus that a custom element's callback gives a focusable body while a live target arrives from another document stays there", () => {
	// Firefox can hold back the focus events of a focus change between frames, and then the morph can't tell the
	// callback's focus from focus the move lost.
	let focusEvents = false
	class FocusBodyOnArrival extends HTMLElement {
		connectedCallback() {
			const noteFocusEvent = () => (focusEvents = true)
			document.addEventListener("focusin", noteFocusEvent, true)
			document.body.focus()
			document.removeEventListener("focusin", noteFocusEvent, true)
		}
	}
	if (!customElements.get("x-focus-body-on-arrival")) customElements.define("x-focus-body-on-arrival", FocusBodyOnArrival)
	const frame = document.createElement("iframe")
	document.body.append(frame)
	const frameDocument = frame.contentDocument!
	frameDocument.body.innerHTML = `<div><x-focus-body-on-arrival><input id="x" value="hello"></x-focus-body-on-arrival></div>`
	const wrapper = frameDocument.body.firstElementChild!
	frame.focus()
	frameDocument.querySelector<HTMLInputElement>("#x")!.focus()
	const host = mount(`<section><p>old</p></section>`)
	document.body.tabIndex = -1

	try {
		morph(host.firstElementChild!.firstElementChild!, wrapper)

		expect(host.querySelector("#x")).not.toBeNull()
		expect(document.activeElement).toBe(focusEvents ? document.body : host.querySelector("#x"))
	} finally {
		document.body.removeAttribute("tabindex")
		frame.remove()
		host.remove()
	}
})

test("a focused element in a document without a body keeps focus when it moves", () => {
	const frame = document.createElement("iframe")
	document.body.append(frame)
	const frameDocument = frame.contentDocument!
	const svg = (markup: string) =>
		new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml").documentElement
	const root = frameDocument.importNode(svg(`<g id="s1"><rect id="x" tabindex="0"/></g><g id="s2"/>`), true)
	frameDocument.documentElement.remove()
	frameDocument.append(root)
	const rect = frameDocument.getElementById("x") as unknown as SVGElement
	frame.focus()
	rect.focus()

	try {
		morphInner(root, frameDocument.importNode(svg(`<g id="s1"/><g id="s2"><rect id="x" tabindex="0"/></g>`), true))

		expect((rect.parentNode as Element).id).toBe("s2")
		expect(frameDocument.activeElement).toBe(rect)
	} finally {
		frame.remove()
	}
})

test("focus that a custom element drops when a live target holding it is inserted is put back", () => {
	class BlurOnMove extends HTMLElement {
		connectedMoveCallback() {
			;(document.activeElement as HTMLElement | null)?.blur()
		}
	}
	if (!customElements.get("x-blur-on-move")) customElements.define("x-blur-on-move", BlurOnMove)
	const host = mount(`<div></div><div><x-blur-on-move><input value="hello"></x-blur-on-move></div>`)
	const [from, to] = host.children
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 3)

	morph(from!, to!)

	expect(from!.querySelector("input")).toBe(input)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])

	host.remove()
})
