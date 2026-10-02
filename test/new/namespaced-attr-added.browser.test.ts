import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

const SVG_NS = "http://www.w3.org/2000/svg"
const XLINK_NS = "http://www.w3.org/1999/xlink"

test("morphing adds a missing namespaced attribute in its namespace", () => {
	const fromSvg = document.createElementNS(SVG_NS, "svg")
	fromSvg.appendChild(document.createElementNS(SVG_NS, "use"))

	const toSvg = document.createElementNS(SVG_NS, "svg")
	const toUse = document.createElementNS(SVG_NS, "use")
	toUse.setAttributeNS(XLINK_NS, "xlink:href", "#foo")
	toSvg.appendChild(toUse)

	morph(fromSvg, toSvg)

	const use = fromSvg.firstElementChild!
	expect(use.getAttributeNS(XLINK_NS, "href")).toBe("#foo")
	expect(use.attributes.length).toBe(1)
	expect(use.attributes[0]!.namespaceURI).toBe(XLINK_NS)
})

test("morphing removes a namespaced attribute missing from the target", () => {
	const fromSvg = document.createElementNS(SVG_NS, "svg")
	const fromUse = document.createElementNS(SVG_NS, "use")
	fromUse.setAttributeNS(XLINK_NS, "xlink:href", "#foo")
	fromSvg.appendChild(fromUse)

	const toSvg = document.createElementNS(SVG_NS, "svg")
	toSvg.appendChild(document.createElementNS(SVG_NS, "use"))

	morph(fromSvg, toSvg)

	const use = fromSvg.firstElementChild!
	expect(use.hasAttributeNS(XLINK_NS, "href")).toBe(false)
	expect(use.attributes.length).toBe(0)
})

test("morphing replaces a null-namespace attribute with the namespaced one from the target", () => {
	const fromSvg = document.createElementNS(SVG_NS, "svg")
	const fromUse = document.createElementNS(SVG_NS, "use")
	fromUse.setAttribute("xlink:href", "#foo")
	fromSvg.appendChild(fromUse)

	const toSvg = document.createElementNS(SVG_NS, "svg")
	const toUse = document.createElementNS(SVG_NS, "use")
	toUse.setAttributeNS(XLINK_NS, "xlink:href", "#foo")
	toSvg.appendChild(toUse)

	morph(fromSvg, toSvg)

	const use = fromSvg.firstElementChild!
	expect(use.getAttributeNS(XLINK_NS, "href")).toBe("#foo")
	expect(use.attributes.length).toBe(1)
	expect(use.attributes[0]!.namespaceURI).toBe(XLINK_NS)
})

test("morphing a null-namespace attribute to a new namespaced value leaves no duplicate", () => {
	const fromSvg = document.createElementNS(SVG_NS, "svg")
	const fromUse = document.createElementNS(SVG_NS, "use")
	fromUse.setAttribute("xlink:href", "#old")
	fromSvg.appendChild(fromUse)

	const toSvg = document.createElementNS(SVG_NS, "svg")
	const toUse = document.createElementNS(SVG_NS, "use")
	toUse.setAttributeNS(XLINK_NS, "xlink:href", "#new")
	toSvg.appendChild(toUse)

	morph(fromSvg, toSvg)

	const use = fromSvg.firstElementChild!
	expect(use.getAttributeNS(XLINK_NS, "href")).toBe("#new")
	expect(use.attributes.length).toBe(1)
	expect(use.attributes[0]!.namespaceURI).toBe(XLINK_NS)
})
