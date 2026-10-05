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

test("a focused item that the target moves to the end stays put while its siblings move", () => {
	const host = mount(`<ul><li id="a"><input id="ia" value="hello"></li><li id="b">b</li><li id="c">c</li></ul>`)
	const ul = host.firstElementChild!
	const item = host.querySelector("#a")!
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(2, 3)

	const removed = removedNodes(ul, () =>
		morph(ul, `<ul><li id="b">b</li><li id="c">c</li><li id="a"><input id="ia" value="hello"></li></ul>`),
	)

	expect(removed).not.toContain(item)
	expect([...ul.children].map((child) => child.id)).toEqual(["b", "c", "a"])
	expect(host.querySelector("input")).toBe(input)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([2, 3])

	host.remove()
})

test("a focused item nested two levels down stays put at each level", () => {
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

	expect(removed).not.toContain(section)
	expect(removed).not.toContain(paragraph)
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

test("a focused input whose value the morph resets doesn't get its old selection back", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 2)
	const selections: Array<Array<unknown>> = []
	input.setSelectionRange = (...args) => selections.push(args)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="goodbye"></div></div>`)

	expect(document.activeElement).toBe(input)
	expect(input.value).toBe("goodbye")
	expect(selections).toEqual([])

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

test("a focused input that the morph moves and disables isn't focused again", () => {
	const host = mount(`<div id="s1"><input id="x" value="hello"></div><div id="s2"></div>`)
	const input = host.querySelector("input")!
	input.focus()
	input.setSelectionRange(1, 3)

	morphInner(host, `<div><div id="s1"></div><div id="s2"><input id="x" value="hello" disabled></div></div>`)

	expect(input.parentElement!.id).toBe("s2")
	// Firefox's moveBefore keeps focus on the input, and it stays focused once disabled.
	if (!("moveBefore" in Element.prototype)) expect(document.activeElement).not.toBe(input)

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
