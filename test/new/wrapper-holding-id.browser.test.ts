import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("a wrapper losing its id'd descendant is still morphed in place", () => {
	const from = dom(`<main><div class="a"><span id="a"></span></div></main>`)
	const to = dom(`<main><div class="b"><span></span></div></main>`)
	const div = from.firstElementChild

	const expected = to.outerHTML

	morph(from, to)

	expect(from.firstElementChild).toBe(div)
	expect(from.outerHTML).toBe(expected)
})

test("a wrapper gaining an id'd descendant is still morphed in place", () => {
	const from = dom(`<main><div><input></div></main>`)
	const to = dom(`<main><div><input><p id="error">Invalid</p></div></main>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	const expected = to.outerHTML

	morph(from, to, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	expect(from.outerHTML).toBe(expected)
})

test("a wrapper whose id'd descendant changes id is still morphed in place", () => {
	const from = dom(`<main><div><span id="a"></span><input></div></main>`)
	const to = dom(`<main><div><span id="b"></span><input></div></main>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	const expected = to.outerHTML

	morph(from, to, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	expect(from.outerHTML).toBe(expected)
})

test("an id'd descendant still moves out of a wrapper that's morphed in place", () => {
	const from = dom(`<main><div><span id="a"></span><input></div><p></p></main>`)
	const to = dom(`<main><div><input></div><p><span id="a"></span></p></main>`)
	const div = from.firstElementChild
	const span = from.querySelector("#a")
	const input = from.querySelector("input")!
	input.value = "typed"

	const expected = to.outerHTML

	morph(from, to, { preserveChanges: true })

	expect(from.firstElementChild).toBe(div)
	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
	expect(from.querySelector("#a")).toBe(span)
	expect(from.outerHTML).toBe(expected)
})

test("wrappers still pair by the ids they hold before pairing by position", () => {
	const from = dom(`<main><div><span id="a"></span></div><div><span id="b"></span></div></main>`)
	const to = dom(`<main><div><span id="b"></span></div><div><span id="a"></span></div></main>`)
	const a = from.querySelector("#a")
	const b = from.querySelector("#b")

	const expected = to.outerHTML

	morph(from, to)

	expect(from.querySelector("#a")).toBe(a)
	expect(from.querySelector("#b")).toBe(b)
	expect(from.outerHTML).toBe(expected)
})
