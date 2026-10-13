import { expect, test } from "vitest"
import { userEvent } from "vitest/browser"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// Types at the end of the element, then moves focus away, as clicking a save button would.
async function typeInto(element: HTMLElement, text: string): Promise<void> {
	element.focus()
	// Browsers differ in where a caret after the last element types, so it goes at the end of the last text.
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	let last: Text | null = null
	while (walker.nextNode()) last = walker.currentNode as Text
	getSelection()!.collapse(last, last!.length)
	await userEvent.keyboard(text)
	;((element.getRootNode() as Document | ShadowRoot).activeElement as HTMLElement).blur()
	expect(element.contains(document.activeElement)).toBe(false)
}

test("preserveChanges keeps what the user typed into a contenteditable after it loses focus, and morphs the rest", async () => {
	const host = mount(`<div contenteditable="true">Hello</div><p>1</p>`)
	const editor = host.querySelector("div")!
	await typeInto(editor, " there")

	morphInner(host, `<div><div contenteditable="true" class="new">Hello</div><p>2</p></div>`, { preserveChanges: true })

	expect(host.querySelector("div")).toBe(editor)
	expect(editor.textContent).toBe("Hello there")
	expect(editor.className).toBe("new")
	expect(host.querySelector("p")!.textContent).toBe("2")

	host.remove()
})

test("an edited contenteditable keeps what the user typed when the morph starts inside it", async () => {
	const host = mount(`<div contenteditable="true"><p>Hello</p></div>`)
	const editor = host.querySelector("div")!
	const paragraph = editor.querySelector("p")!
	await typeInto(paragraph, " there")

	morph(paragraph, `<p class="new">Server</p>`, { preserveChanges: true })

	expect(editor.firstChild).toBe(paragraph)
	expect(paragraph.textContent).toBe("Hello there")
	expect(paragraph.className).toBe("new")

	host.remove()
})

test("an edited contenteditable follows the markup without preserveChanges", async () => {
	const host = mount(`<div contenteditable="true">Hello</div>`)
	const editor = host.querySelector("div")!
	await typeInto(editor, " there")

	morphInner(host, `<div><div contenteditable="true">Server</div></div>`)

	expect(editor.textContent).toBe("Server")

	host.remove()
})

test("a morphlex-clobber element in an edited contenteditable follows the markup", async () => {
	const host = mount(`<div contenteditable="true"><p>Hello</p><b>1</b></div>`)
	const editor = host.querySelector("div")!
	await typeInto(editor, " more")

	morphInner(host, `<div><div contenteditable="true"><p morphlex-clobber>Server</p><b>1</b></div></div>`, {
		preserveChanges: true,
	})

	expect(editor.innerHTML).toBe("<p>Server</p><b>1 more</b>")

	host.remove()
})

test("an edited contenteditable in a shadow root keeps what the user typed under preserveChanges", async () => {
	const host = mount(``)
	const root = host.attachShadow({ mode: "open" })
	root.innerHTML = `<div contenteditable="true">Hello</div>`
	const editor = root.querySelector("div")!
	await typeInto(editor, " there")

	morphInner(root, `<div contenteditable="true">Server</div>`, { preserveChanges: true })

	expect(root.querySelector("div")).toBe(editor)
	expect(editor.textContent).toBe("Hello there")

	host.remove()
})

test("an untouched contenteditable next to an edited one follows the markup under preserveChanges", async () => {
	const host = mount(`<div contenteditable="true">A</div><div contenteditable="true">B</div>`)
	const [first, second] = host.querySelectorAll("div")
	await typeInto(first!, "!")

	morphInner(host, `<div><div contenteditable="true">A</div><div contenteditable="true">C</div></div>`, {
		preserveChanges: true,
	})

	expect(host.innerHTML).toBe(`<div contenteditable="true">A!</div><div contenteditable="true">C</div>`)
	expect(host.firstChild).toBe(first)
	expect(host.lastChild).toBe(second)

	host.remove()
})

test("an input event dispatched by script doesn't count as an edit under preserveChanges", () => {
	const host = mount(`<div contenteditable="true">Hello</div>`)
	const editor = host.querySelector("div")!
	editor.textContent = "Script"
	editor.dispatchEvent(new InputEvent("input", { bubbles: true }))

	morphInner(host, `<div><div contenteditable="true">Server</div></div>`, { preserveChanges: true })

	expect(editor.textContent).toBe("Server")

	host.remove()
})

test("an SVG element is morphed under preserveChanges after the user edited a contenteditable", async () => {
	const host = mount(`<div contenteditable="true">Hello</div><svg><circle r="1"></circle></svg>`)
	await typeInto(host.querySelector("div")!, "!")

	morphInner(host, `<div><div contenteditable="true">Hello</div><svg><circle r="2"></circle></svg></div>`, {
		preserveChanges: true,
	})

	expect(host.querySelector("circle")!.getAttribute("r")).toBe("2")

	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
	svg.innerHTML = `<g><circle r="1"></circle></g>`
	morphInner(svg, `<svg><g><circle r="2"></circle></g></svg>`, { preserveChanges: true })
	expect(svg.querySelector("circle")!.getAttribute("r")).toBe("2")
	expect(host.querySelector("div")!.textContent).toBe("Hello!")

	host.remove()
})

test("an edited contenteditable keeps what the user typed when the morph starts at an SVG element inside it", async () => {
	const host = mount(`<div contenteditable="true">Hello<svg><text>Label</text></svg></div>`)
	const editor = host.querySelector("div")!
	const text = editor.querySelector("text")!
	await typeInto(editor, "!")
	text.textContent = "Edited"

	morph(text, `<text>Server</text>`, { preserveChanges: true })
	morphInner(text, `<text>Server</text>`, { preserveChanges: true })

	expect(text.textContent).toBe("Edited")

	host.remove()
})

test("an edited contenteditable that the target makes read-only keeps what the user typed under preserveChanges", async () => {
	const host = mount(`<div contenteditable="true">Hello</div>`)
	const editor = host.querySelector("div")!
	await typeInto(editor, " there")

	morphInner(host, `<div><div>Server</div></div>`, { preserveChanges: true })

	expect(editor.hasAttribute("contenteditable")).toBe(false)
	expect(editor.textContent).toBe("Hello there")

	host.remove()
})
