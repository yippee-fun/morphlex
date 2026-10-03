import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

const SVG = "http://www.w3.org/2000/svg"

function svgWith(...children: Array<Node>): SVGSVGElement {
	const svg = document.createElementNS(SVG, "svg") as SVGSVGElement
	svg.append(...children)
	return svg
}

function countMutations(target: Node, callback: () => void): number {
	const observer = new MutationObserver(() => {})
	observer.observe(target, { subtree: true, attributes: true, childList: true, characterData: true })
	callback()
	const count = observer.takeRecords().length
	observer.disconnect()
	return count
}

test("svg elements named input, option and textarea are morphed like any other element", () => {
	const build = (text: string) => {
		const input = document.createElementNS(SVG, "input")
		input.id = "d"
		const option = document.createElementNS(SVG, "option")
		const textarea = document.createElementNS(SVG, "textarea")
		textarea.append(document.createElementNS(SVG, "g"), text)
		return svgWith(input, option, textarea)
	}
	const host = document.createElement("div")
	host.append(build("before"))
	document.body.append(host)

	morph(host.firstElementChild!, build("after"))

	const textarea = host.querySelector("textarea")!
	expect(textarea.namespaceURI).toBe(SVG)
	expect(textarea.childNodes).toHaveLength(2)
	expect(textarea.firstElementChild!.localName).toBe("g")
	expect(textarea.textContent).toBe("after")

	const input = host.querySelector("input")!
	expect("value" in input).toBe(false)
	expect("checked" in input).toBe(false)

	expect(countMutations(host, () => morph(host.firstElementChild!, build("after")))).toBe(0)
	host.remove()
})

test("an svg element named input is not treated as a form control when it is the root of the morph", () => {
	const build = (title: string) => {
		const input = document.createElementNS(SVG, "input")
		input.setAttribute("title", title)
		return input
	}
	const host = document.createElement("div")
	const svg = svgWith(build("before"))
	host.append(svg)
	document.body.append(host)

	morph(svg.firstElementChild!, build("after"))
	expect(svg.firstElementChild!.getAttribute("title")).toBe("after")

	expect(countMutations(host, () => morph(svg.firstElementChild!, build("after")))).toBe(0)
	host.remove()
})

test("svg elements named input with different ids can morph in place", () => {
	const build = (id: string) => {
		const input = document.createElementNS(SVG, "input")
		input.id = id
		return input
	}
	const host = document.createElement("div")
	const svg = svgWith(build("a"))
	host.append(svg)
	document.body.append(host)
	const original = svg.firstElementChild

	morph(original!, build("b"))

	expect(svg.firstElementChild).toBe(original)
	expect(original!.id).toBe("b")
	host.remove()
})
