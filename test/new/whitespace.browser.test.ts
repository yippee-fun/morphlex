import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("whitespace is removed when target has no whitespace", () => {
	const from = dom(`<div><span>A</span> <span>B</span> <span>C</span></div>`)
	const to = dom(`<div><span>A</span><span>B</span><span>C</span></div>`)

	// Verify initial state
	expect(from.childNodes.length).toBe(5) // SPAN, TEXT, SPAN, TEXT, SPAN
	expect(to.childNodes.length).toBe(3) // SPAN, SPAN, SPAN

	morph(from, to)

	// After morph, from should have no whitespace like to
	expect(from.childNodes.length).toBe(3)
	expect(from.childNodes[0]?.nodeName).toBe("SPAN")
	expect(from.childNodes[1]?.nodeName).toBe("SPAN")
	expect(from.childNodes[2]?.nodeName).toBe("SPAN")
})

test("whitespace is added when target has whitespace", () => {
	const from = dom(`<div><span>A</span><span>B</span><span>C</span></div>`)
	const to = dom(`<div><span>A</span> <span>B</span> <span>C</span></div>`)

	// Verify initial state
	expect(from.childNodes.length).toBe(3) // SPAN, SPAN, SPAN
	expect(to.childNodes.length).toBe(5) // SPAN, TEXT, SPAN, TEXT, SPAN

	morph(from, to)

	// After morph, from should have whitespace like to
	expect(from.childNodes.length).toBe(5)
	expect(from.childNodes[0]?.nodeName).toBe("SPAN")
	expect(from.childNodes[1]?.nodeType).toBe(3) // TEXT_NODE
	expect(from.childNodes[1]?.textContent).toBe(" ")
	expect(from.childNodes[2]?.nodeName).toBe("SPAN")
	expect(from.childNodes[3]?.nodeType).toBe(3) // TEXT_NODE
	expect(from.childNodes[3]?.textContent).toBe(" ")
	expect(from.childNodes[4]?.nodeName).toBe("SPAN")
})

test("whitespace is reused when both have whitespace", () => {
	const from = dom(`<div><span>A</span> <span>B</span> <span>C</span></div>`)
	const to = dom(`<div><span>A</span> <span>B</span> <span>C</span></div>`)

	// Verify initial state
	expect(from.childNodes.length).toBe(5)
	expect(to.childNodes.length).toBe(5)

	// Capture the original text nodes from 'from'
	const originalTextNode1 = from.childNodes[1]
	const originalTextNode2 = from.childNodes[3]

	morph(from, to)

	// After morph, structure should be the same
	expect(from.childNodes.length).toBe(5)
	expect(from.childNodes[0]?.nodeName).toBe("SPAN")
	expect(from.childNodes[1]?.nodeType).toBe(3)
	expect(from.childNodes[2]?.nodeName).toBe("SPAN")
	expect(from.childNodes[3]?.nodeType).toBe(3)
	expect(from.childNodes[4]?.nodeName).toBe("SPAN")

	// The original text nodes should be reused
	expect(from.childNodes[1]).toBe(originalTextNode1)
	expect(from.childNodes[3]).toBe(originalTextNode2)
})

test("empty text nodes are treated as whitespace and removed", () => {
	const from = document.createElement("div")
	from.append(document.createTextNode(""), document.createElement("span"))

	const to = dom(`<div><span></span></div>`)

	morph(from, to)

	expect(from.childNodes).toHaveLength(1)
	expect(from.firstChild?.nodeName).toBe("SPAN")
})

test("&nbsp; text nodes are removed when target has no text between elements", () => {
	const from = dom(`<div><span>A</span>&nbsp;<span>B</span></div>`)
	const to = dom(`<div><span>A</span><span>B</span></div>`)

	morph(from, to)

	expect(from.childNodes).toHaveLength(2)
	expect(from.textContent).toBe("AB")
})

test("unchanged whitespace is kept when a sibling changes", () => {
	const from = dom(`<div>\n<span>1</span>\n<span>2</span>\n</div>`)
	const whitespace = Array.from(from.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)
	const added: Array<Node> = []
	const removed: Array<Node> = []

	morph(from, dom(`<div>\n<span>1</span>\n<span>3</span>\n</div>`), {
		afterNodeAdded: (node) => void added.push(node),
		afterNodeRemoved: (node) => void removed.push(node),
	})

	expect(added).toEqual([])
	expect(removed).toEqual([])
	expect(from.outerHTML).toBe(`<div>\n<span>1</span>\n<span>3</span>\n</div>`)
	expect(Array.from(from.childNodes).filter((node) => node.nodeType === Node.TEXT_NODE)).toEqual(whitespace)
})

test("whitespace that changes is updated in place", () => {
	const from = dom(`<div><span>1</span>\n<span>2</span></div>`)
	const whitespace = from.childNodes[1]

	morph(from, dom(`<div><span>1</span>\n\t<span>3</span></div>`))

	expect(from.outerHTML).toBe(`<div><span>1</span>\n\t<span>3</span></div>`)
	expect(from.childNodes[1]).toBe(whitespace)
})

test("a vetoed visit keeps whitespace that changes", () => {
	const from = dom(`<div><span>1</span>\n<span>2</span></div>`)

	morph(from, dom(`<div><span>1</span>\n\t<span>3</span></div>`), {
		beforeNodeVisited: (node) => !(node.nodeType === Node.TEXT_NODE && node.parentNode === from),
	})

	expect(from.outerHTML).toBe(`<div><span>1</span>\n<span>3</span></div>`)
})

test("removing an element removes only it and one whitespace node", () => {
	const from = dom(`<div>\n<a></a>\n<b></b>\n</div>`)
	const added: Array<Node> = []
	const removed: Array<string> = []

	morph(from, dom(`<div>\n<b></b>\n</div>`), {
		afterNodeAdded: (node) => void added.push(node),
		afterNodeRemoved: (node) => void removed.push(node.nodeName),
	})

	expect(from.outerHTML).toBe(`<div>\n<b></b>\n</div>`)
	expect(added).toEqual([])
	expect(removed.sort()).toEqual(["#text", "A"])
})

test("reordered elements keep their whitespace in the right places", () => {
	const from = dom(`<div>\n<a id="a"></a>\n<b id="b"></b>\n</div>`)

	morph(from, dom(`<div>\n<b id="b"></b>\n<a id="a"></a>\n</div>`))

	expect(from.outerHTML).toBe(`<div>\n<b id="b"></b>\n<a id="a"></a>\n</div>`)
})

test("whitespace a callback already removed isn't removed again", () => {
	const from = dom(`<div><p>1</p> </div>`)
	const removed: Array<Node> = []

	morph(from, dom(`<div><p>2</p></div>`), {
		afterNodeVisited: (node) => {
			if (node.nodeName === "P") node.nextSibling?.remove()
		},
		afterNodeRemoved: (node) => void removed.push(node),
	})

	expect(from.outerHTML).toBe(`<div><p>2</p></div>`)
	expect(removed).toEqual([])
})
