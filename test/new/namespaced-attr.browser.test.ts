import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphing preserves namespaced SVG attributes", () => {
	const SVG_NS = "http://www.w3.org/2000/svg"
	const XLINK_NS = "http://www.w3.org/1999/xlink"

	const fromSvg = document.createElementNS(SVG_NS, "svg")
	const fromUse = document.createElementNS(SVG_NS, "use")
	fromUse.setAttributeNS(XLINK_NS, "xlink:href", "#old")
	fromSvg.appendChild(fromUse)

	const toSvg = document.createElementNS(SVG_NS, "svg")
	const toUse = document.createElementNS(SVG_NS, "use")
	toUse.setAttributeNS(XLINK_NS, "xlink:href", "#new")
	toSvg.appendChild(toUse)

	morph(fromSvg, toSvg)

	const use = fromSvg.firstElementChild!
	// The attribute should remain in the xlink namespace with the new value.
	expect(use.getAttributeNS(XLINK_NS, "href")).toBe("#new")
	// And there should be only one attribute (no duplicate in the null namespace).
	expect(use.attributes.length).toBe(1)
	expect(use.attributes[0]!.namespaceURI).toBe(XLINK_NS)
})
