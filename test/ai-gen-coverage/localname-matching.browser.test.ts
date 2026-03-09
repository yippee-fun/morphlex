import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "../new/utils"

test("morphing inputs without distinguishing attributes are replaced, not reused by localName", () => {
	// Inputs are excluded from the tag-name matching pass
	const a = dom(`<div><input type="text"><input type="text"></div>`) as HTMLElement
	const b = dom(`<div><input type="text" placeholder="first"><input type="text" placeholder="second"></div>`) as HTMLElement

	const firstInput = a.children[0] as HTMLInputElement
	const secondInput = a.children[1] as HTMLInputElement

	morph(a, b)

	// Inputs should be replaced, not reused
	expect(a.children[0]).not.toBe(firstInput)
	expect(a.children[1]).not.toBe(secondInput)
	expect((a.children[0] as HTMLInputElement).placeholder).toBe("first")
	expect((a.children[1] as HTMLInputElement).placeholder).toBe("second")
})

test("morphing inputs with type mismatch skips candidate", () => {
	// Line 562-564: when types don't match, continue to next candidate
	const a = dom(`<div><input type="text"><input type="number"></div>`) as HTMLElement
	const b = dom(`<div><input type="number"><input type="text"></div>`) as HTMLElement

	morph(a, b)

	const inputs = Array.from(a.children) as HTMLInputElement[]
	expect(inputs[0].type).toBe("number")
	expect(inputs[1].type).toBe("text")
})

test("morphing textarea with modified value preserves change when matched by name", () => {
	// Line 190: textarea dirty flag — textareas need a name attribute to match via heuristics
	const a = dom(`<div><textarea name="content">original</textarea></div>`) as HTMLElement
	const b = dom(`<div><textarea name="content">new</textarea></div>`) as HTMLElement

	const textarea = a.firstElementChild as HTMLTextAreaElement
	textarea.value = "user input"

	morph(a, b, { preserveChanges: true })

	// User's input should be preserved
	expect(textarea.value).toBe("user input")
	expect(textarea.textContent).toBe("new")
})

test("morphing buttons by localName", () => {
	// Another test for lines 566-568 with different element types
	const a = dom(`<div><button>A</button><button>B</button></div>`) as HTMLElement
	const b = dom(`<div><button>X</button><button>Y</button></div>`) as HTMLElement

	const first = a.children[0]
	const second = a.children[1]

	morph(a, b)

	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
	expect(first.textContent).toBe("X")
	expect(second.textContent).toBe("Y")
})

test("morphing spans by localName forces lines 566-568", () => {
	// Explicit test for lines 566-568: non-input elements matching by localName
	// Elements must NOT be equal by isEqualNode, so give them different initial content
	const a = dom(`<div><span>a</span><span>b</span><span>c</span></div>`) as HTMLElement
	const b = dom(`<div><span data-id="1">x</span><span data-id="2">y</span><span data-id="3">z</span></div>`) as HTMLElement

	const first = a.children[0]
	const second = a.children[1]
	const third = a.children[2]

	morph(a, b)

	// Lines 566-568: localName matches, not inputs, so matches[i] = candidate, delete, break
	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
	expect(a.children[2]).toBe(third)
})

test("morphing divs by localName", () => {
	// Another explicit test for lines 566-568
	// Elements must NOT be equal by isEqualNode
	const a = dom(`<section><div>content1</div><div>content2</div></section>`) as HTMLElement
	const b = dom(`<section><div title="a">new1</div><div title="b">new2</div></section>`) as HTMLElement

	const first = a.children[0]
	const second = a.children[1]

	morph(a, b)

	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
})

test("morphing elements with same tag but different attributes by localName", () => {
	// Forcing lines 566-568: elements that don't match by isEqualNode, id, idSet, or heuristics
	const a = dom(`<ul><li data-a="1">A</li><li data-a="2">B</li><li data-a="3">C</li></ul>`) as HTMLElement
	const b = dom(`<ul><li data-b="x">X</li><li data-b="y">Y</li><li data-b="z">Z</li></ul>`) as HTMLElement

	const first = a.children[0]
	const second = a.children[1]
	const third = a.children[2]

	morph(a, b)

	// Should match by localName (li) and reuse elements
	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
	expect(a.children[2]).toBe(third)
	expect(first.textContent).toBe("X")
	expect(second.textContent).toBe("Y")
	expect(third.textContent).toBe("Z")
})

test("morphing p elements by localName", () => {
	// Yet another test for lines 566-568 with paragraph elements
	const a = dom(`<article><p class="old">First</p><p class="old">Second</p></article>`) as HTMLElement
	const b = dom(`<article><p class="new">Changed1</p><p class="new">Changed2</p></article>`) as HTMLElement

	const first = a.children[0]
	const second = a.children[1]

	morph(a, b)

	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
	expect(first.textContent).toBe("Changed1")
	expect(second.textContent).toBe("Changed2")
})
