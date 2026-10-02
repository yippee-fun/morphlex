import { test, expect } from "vitest"
import { morph, morphDocument, morphInner } from "../../src/morphlex"
import { dom } from "./utils"

test("morph keeps leading and trailing &nbsp; from string targets", () => {
	const parent = document.createElement("div")
	const from = dom(`<p>old</p>`)
	parent.append(from)

	morph(from, `&nbsp;<b>x</b>&nbsp;`)

	expect(parent.innerHTML).toBe("&nbsp;<b>x</b>&nbsp;")
})

test("morphInner keeps leading and trailing &nbsp; from string targets", () => {
	const from = dom(`<div><b>x</b></div>`)

	morphInner(from, `<div>&nbsp;<b>x</b>&nbsp;</div>`)

	expect(from.innerHTML).toBe("&nbsp;<b>x</b>&nbsp;")
})

test("morph still trims ASCII whitespace at the edges of string targets", () => {
	const parent = document.createElement("div")
	const from = dom(`<p>old</p>`)
	parent.append(from)

	morph(from, ` \t\n<b>x</b>\r\n\f `)

	expect(parent.innerHTML).toBe("<b>x</b>")
})

test("morphDocument keeps a trailing non-breaking space in string targets", () => {
	const from = document.implementation.createHTMLDocument()
	from.body.innerHTML = "<p>old</p>"

	morphDocument(from, "<p>new</p>\u00A0")

	expect(from.body.innerHTML).toBe("<p>new</p>&nbsp;")
})

test("&nbsp; between elements is morphed as text", () => {
	const from = dom(`<div><span>A</span>&nbsp;<span>B</span></div>`)
	const nbsp = from.childNodes[1]

	morph(from, `<div><span>A</span>&nbsp;<span>C</span></div>`)

	expect(from.innerHTML).toBe("<span>A</span>&nbsp;<span>C</span>")
	expect(from.childNodes[1]).toBe(nbsp)
})
