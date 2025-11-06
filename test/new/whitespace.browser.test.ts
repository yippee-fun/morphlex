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
