import { afterEach, expect, test } from "vitest"
import { morph } from "../../src/morphlex"

afterEach(() => {
	document.body.replaceChildren()
})

// Browsers without default styles (like happy-dom) report an empty `white-space`, so the parent sets it.
function attached(html: string): HTMLElement {
	const container = document.createElement("div")
	container.innerHTML = html
	document.body.append(container)
	return container.firstElementChild as HTMLElement
}

function textMutations(node: Node, callback: () => void): Array<MutationRecord> {
	const observer = new MutationObserver(() => {})
	observer.observe(node, { subtree: true, characterData: true, childList: true })
	callback()
	const records = observer.takeRecords()
	observer.disconnect()
	return records
}

test("reindented whitespace between elements is left alone", () => {
	const from = attached(`<div style="white-space: normal">\n\t\t<span>A</span>\n\t\t<span>B</span>\n\t</div>`)
	const whitespace = Array.from(from.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)

	const records = textMutations(from, () => {
		morph(from, `<div style="white-space: normal">\n  <span>A</span>\n  <span>B</span>\n</div>`)
	})

	expect(records).toHaveLength(0)
	expect(Array.from(from.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)).toEqual(whitespace)
	expect(whitespace.map((node) => node.nodeValue)).toEqual(["\n\t\t", "\n\t\t", "\n\t"])
})

test("spaces and tabs are interchangeable", () => {
	const from = attached(`<p style="white-space: nowrap"><b>A</b> <b>B</b></p>`)

	morph(from, `<p style="white-space: nowrap"><b>A</b>\t \t<b>B</b></p>`)

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace with a line break is updated to whitespace without one", () => {
	const from = attached(`<p style="white-space: normal"><b>A</b>\n<b>B</b></p>`)

	morph(from, `<p style="white-space: normal"><b>A</b> <b>B</b></p>`)

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
})

test("a carriage return counts as a line break", () => {
	const from = attached(`<p style="white-space: normal"><b>A</b> <b>B</b></p>`)
	const to = document.createElement("p")
	to.setAttribute("style", "white-space: normal")
	to.append(document.createElement("b"), document.createTextNode("\r"), document.createElement("b"))
	to.firstChild!.textContent = "A"
	to.lastChild!.textContent = "B"

	morph(from, to)

	expect(from.childNodes[1]!.nodeValue).toBe("\r")
})

test("an empty text node isn't interchangeable with whitespace", () => {
	const from = attached(`<p style="white-space: normal"><b>A</b> <b>B</b></p>`)
	const to = document.createElement("p")
	to.setAttribute("style", "white-space: normal")
	to.append(document.createElement("b"), document.createTextNode(""), document.createElement("b"))
	to.firstChild!.textContent = "A"
	to.lastChild!.textContent = "B"

	morph(from, to)

	expect(from.childNodes[1]!.nodeValue).toBe("")
})

test("whitespace is updated where it's preserved", () => {
	for (const whiteSpace of ["pre", "pre-wrap", "pre-line", "break-spaces"]) {
		const from = attached(`<div style="white-space: ${whiteSpace}"><b>A</b>\n\t<b>B</b></div>`)

		morph(from, `<div style="white-space: ${whiteSpace}"><b>A</b>\n<b>B</b></div>`)

		expect(from.childNodes[1]!.nodeValue).toBe("\n")
	}
})

test("whitespace in a pre is updated", () => {
	const from = attached(`<pre><b>A</b>  <b>B</b></pre>`)

	morph(from, `<pre><b>A</b> <b>B</b></pre>`)

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace is judged by the parent's new style", () => {
	const from = attached(`<div style="white-space: normal"><b>A</b>  <b>B</b></div>`)

	morph(from, `<div style="white-space: pre"><b>A</b> <b>B</b></div>`)

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace in a detached parent is updated", () => {
	const from = document.createElement("div")
	from.innerHTML = `<p style="white-space: normal"><b>A</b>  <b>B</b></p>`

	morph(from, `<div><p style="white-space: normal"><b>A</b> <b>B</b></p></div>`)

	expect(from.firstChild!.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace in a document without a window is updated", () => {
	const doc = document.implementation.createHTMLDocument()
	doc.body.innerHTML = `<p style="white-space: normal"><b>A</b>  <b>B</b></p>`
	const from = doc.body.firstElementChild!

	morph(from, `<p style="white-space: normal"><b>A</b> <b>B</b></p>`)

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace whose parent isn't an element is updated", () => {
	const host = attached(`<div></div>`)
	const shadow = host.attachShadow({ mode: "open" })
	shadow.append(document.createTextNode("  "))

	morph(shadow.firstChild!, " ")

	expect(shadow.firstChild!.nodeValue).toBe(" ")
})

test("left alone whitespace isn't visited", () => {
	const from = attached(`<div style="white-space: normal"><b>A</b>  <b>B</b></div>`)
	const visited: Array<Node> = []

	morph(from, `<div style="white-space: normal"><b>A</b> <b>B</b></div>`, {
		beforeNodeVisited: (node) => {
			visited.push(node)
			return true
		},
	})

	expect(visited.some((node) => node.nodeType === Node.TEXT_NODE)).toBe(false)
	expect(from.childNodes[1]!.nodeValue).toBe("  ")
})

test("whitespace becoming text is updated", () => {
	const from = attached(`<p style="white-space: normal"><b>A</b>  <b>B</b></p>`)

	morph(from, `<p style="white-space: normal"><b>A</b> and <b>B</b></p>`)

	expect(from.textContent).toBe("A and B")
})

test("whitespace is judged by the parent's style once the morph has finished", () => {
	const style = document.createElement("style")
	style.textContent = `.box { white-space: normal } .box:has(.marker) { white-space: pre }`
	document.body.append(style)
	const from = attached(`<div class="box"><b>A</b>  <b>B</b></div>`)
	const visited: Array<Node> = []

	morph(from, `<div class="box"><b>A</b> <b>B</b><i class="marker"></i></div>`, {
		beforeNodeVisited: (node) => {
			visited.push(node)
			return true
		},
	})

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
	expect(visited).toContain(from.childNodes[1])
})

test("whitespace is judged by the parent's style after radios are synced", () => {
	const style = document.createElement("style")
	style.textContent = `.box { white-space: normal } .box:has(input:checked) { white-space: pre }`
	document.body.append(style)
	const from = attached(
		`<div><form id="f1"><span id="s"><input type="radio" name="r" checked></span></form><form id="f2"><div class="box" id="box"><b>A</b>  <b>B</b></div></form></div>`,
	)

	morph(
		from,
		`<div><form id="f1"></form><form id="f2"><div class="box" id="box"><b>A</b> <b>B</b><span id="s"><input type="radio" name="r" checked></span></div></form></div>`,
	)

	const box = from.querySelector(".box")!
	expect((box.querySelector("input") as HTMLInputElement).checked).toBe(true)
	expect(box.childNodes[1]!.nodeValue).toBe(" ")
})

test("whitespace a callback removed after it was placed stays removed", () => {
	const from = attached(`<div style="white-space: pre"><b>A</b>  <b>B</b>  <b>C</b></div>`)
	const second = from.childNodes[3]!

	morph(from, `<div style="white-space: pre"><b>A</b> <b>B</b> <b>C</b></div>`, {
		beforeNodeVisited: (node) => {
			if (node === from.childNodes[1]) second.remove()
			return true
		},
	})

	expect(from.childNodes[1]!.nodeValue).toBe(" ")
	expect(second.nodeValue).toBe("  ")
	expect(from.childNodes).toHaveLength(4)
})

test("slotted whitespace is judged by its slot's style", () => {
	const host = attached(`<div style="white-space: normal"><b>A</b>  <b>B</b></div>`)
	const shadow = host.attachShadow({ mode: "open" })
	shadow.innerHTML = `<slot style="white-space: pre"></slot>`
	// happy-dom doesn't implement `assignedSlot`, so give it the slot the browser would.
	Object.defineProperty(host.childNodes[1]!, "assignedSlot", { value: shadow.firstChild })

	morph(host, `<div style="white-space: normal"><b>A</b> <b>B</b></div>`)

	expect(host.childNodes[1]!.nodeValue).toBe(" ")
})
