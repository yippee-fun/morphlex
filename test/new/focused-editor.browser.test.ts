import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

test("preserveChanges keeps what the user typed into a focused contenteditable, and morphs the rest", () => {
	const host = mount(`<div contenteditable="true">Hello</div><p>1</p>`)
	const editor = host.querySelector("div")!
	editor.focus()
	editor.textContent = "Hello there"

	morphInner(host, `<div><div contenteditable="true" class="new">Hello</div><p>2</p></div>`, { preserveChanges: true })

	expect(host.querySelector("div")).toBe(editor)
	expect(editor.textContent).toBe("Hello there")
	expect(editor.className).toBe("new")
	expect(host.querySelector("p")!.textContent).toBe("2")
	expect(document.activeElement).toBe(editor)

	host.remove()
})

test("preserveChanges keeps the children of a focused contenteditable that's the morph's root", () => {
	const host = mount(`<div contenteditable="true"><b>Hello</b></div>`)
	const editor = host.querySelector("div")!
	editor.focus()
	editor.firstChild!.textContent = "Hello there"

	morph(editor, `<div contenteditable="true"><i>Server</i></div>`, { preserveChanges: true })
	expect(editor.innerHTML).toBe("<b>Hello there</b>")

	morphInner(editor, `<div><i>Server</i></div>`, { preserveChanges: true })
	expect(editor.innerHTML).toBe("<b>Hello there</b>")

	host.remove()
})

test("an element in a focused contenteditable stays there under preserveChanges, even when the target moves it", () => {
	const host = mount(`<div contenteditable="true"><span id="a">typed</span></div><section></section>`)
	const editor = host.querySelector("div")!
	const span = host.querySelector("span")!
	editor.focus()

	morphInner(host, `<div><div contenteditable="true"></div><section><span id="a">server</span></section></div>`, {
		preserveChanges: true,
	})

	expect(span.parentNode).toBe(editor)
	expect(span.textContent).toBe("typed")
	expect(host.querySelector("section")!.innerHTML).toBe(`<span id="a">server</span>`)

	host.remove()
})

test("a focused contenteditable follows the markup without preserveChanges", () => {
	const host = mount(`<div contenteditable="true">Hello</div>`)
	const editor = host.querySelector("div")!
	editor.focus()
	editor.textContent = "Hello there"

	morphInner(host, `<div><div contenteditable="true">Server</div></div>`)

	expect(editor.textContent).toBe("Server")

	host.remove()
})

test("a contenteditable without focus follows the markup under preserveChanges", () => {
	const host = mount(`<div contenteditable="true">Hello</div><input>`)
	const editor = host.querySelector("div")!
	editor.textContent = "Hello there"
	host.querySelector("input")!.focus()

	morphInner(host, `<div><div contenteditable="true">Server</div><input></div>`, { preserveChanges: true })

	expect(editor.textContent).toBe("Server")

	host.remove()
})

test("a focused element that isn't editable follows the markup under preserveChanges", () => {
	const host = mount(`<div tabindex="0">Hello</div>`)
	const element = host.querySelector("div")!
	element.focus()

	morphInner(host, `<div><div tabindex="0">Server</div></div>`, { preserveChanges: true })

	expect(element.textContent).toBe("Server")

	host.remove()
})

test("preserveChanges keeps what the user typed in an element of a focused contenteditable that's the morph's root", () => {
	const host = mount(`<div contenteditable="true"><p>Hello</p></div>`)
	const editor = host.querySelector("div")!
	const paragraph = editor.querySelector("p")!
	editor.focus()
	paragraph.textContent = "Hello there"

	morph(paragraph, `<p class="new">Server</p>`, { preserveChanges: true })

	expect(editor.firstChild).toBe(paragraph)
	expect(paragraph.textContent).toBe("Hello there")
	expect(paragraph.className).toBe("new")

	host.remove()
})

test("a focused contenteditable that the target makes read-only keeps what the user typed under preserveChanges", () => {
	const host = mount(`<div contenteditable="true">Hello</div>`)
	const editor = host.querySelector("div")!
	editor.focus()
	editor.textContent = "Hello there"

	morphInner(host, `<div><div>Server</div></div>`, { preserveChanges: true })

	expect(editor.hasAttribute("contenteditable")).toBe(false)
	expect(editor.textContent).toBe("Hello there")

	host.remove()
})

test("a focused element that the target makes editable follows the markup under preserveChanges", () => {
	const host = mount(`<div tabindex="0">Hello</div>`)
	const element = host.querySelector("div")!
	element.focus()

	morphInner(host, `<div><div tabindex="0" contenteditable="true">Server</div></div>`, { preserveChanges: true })

	expect(element.textContent).toBe("Server")

	host.remove()
})
