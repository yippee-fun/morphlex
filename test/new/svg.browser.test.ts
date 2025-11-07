import { describe, expect, test, beforeEach, afterEach } from "vitest"
import { morph, morphInner } from "../../src/morphlex"
import { observeMutations } from "./utils"

describe("SVG morphing", () => {
	let container: HTMLElement

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		document.body.removeChild(container)
	})

	function svg(html: string): SVGElement {
		const tmp = document.createElement("div")
		tmp.innerHTML = html.trim()
		return tmp.firstChild as SVGElement
	}

	test("should morph SVG attributes", () => {
		const from = svg('<svg width="100" height="100" viewBox="0 0 100 100"></svg>')
		container.appendChild(from)

		const to = svg('<svg width="200" height="200" viewBox="0 0 200 200"></svg>')

		morph(from, to)

		expect(from.getAttribute("width")).toBe("200")
		expect(from.getAttribute("height")).toBe("200")
		expect(from.getAttribute("viewBox")).toBe("0 0 200 200")
	})

	test("should add new SVG children", () => {
		const from = svg('<svg><circle cx="50" cy="50" r="40"></circle></svg>')
		container.appendChild(from)

		const to = svg(`
			<svg>
				<circle cx="50" cy="50" r="40"></circle>
				<rect x="10" y="10" width="30" height="30"></rect>
			</svg>
		`)

		const mutations = observeMutations(from, () => morph(from, to))

		expect(from.children.length).toBe(2)
		expect(from.children[0].tagName).toBe("circle")
		expect(from.children[1].tagName).toBe("rect")
		expect(from.children[1].getAttribute("x")).toBe("10")
		expect(from.children[1].getAttribute("y")).toBe("10")
		expect(mutations.elementsAdded).toBe(1)
	})

	test("should remove SVG children", () => {
		const from = svg(`
			<svg>
				<circle cx="25" cy="25" r="20"></circle>
				<circle cx="75" cy="75" r="20"></circle>
			</svg>
		`)
		container.appendChild(from)

		const to = svg('<svg><circle cx="25" cy="25" r="20"></circle></svg>')

		const mutations = observeMutations(from, () => morph(from, to))

		expect(from.children.length).toBe(1)
		expect(from.children[0].getAttribute("cx")).toBe("25")
		expect(mutations.elementsRemoved).toBe(1)
	})

	test("should morph SVG paths", () => {
		const from = svg('<svg><path d="M 10 10 L 90 90" stroke="black"></path></svg>')
		container.appendChild(from)

		const to = svg('<svg><path d="M 10 10 C 20 20, 40 20, 50 10" stroke="red" stroke-width="2"></path></svg>')

		const mutations = observeMutations(from, () => morph(from, to))

		const morphedPath = from.querySelector("path")
		expect(morphedPath?.getAttribute("d")).toBe("M 10 10 C 20 20, 40 20, 50 10")
		expect(morphedPath?.getAttribute("stroke")).toBe("red")
		expect(morphedPath?.getAttribute("stroke-width")).toBe("2")
		expect(mutations.attributeChanges).toBeGreaterThan(0)
	})

	test("should morph nested SVG groups", () => {
		const from = svg(`
			<svg>
				<g transform="translate(10, 10)">
					<circle r="5"></circle>
				</g>
			</svg>
		`)
		container.appendChild(from)

		const to = svg(`
			<svg>
				<g transform="translate(20, 20) rotate(45)">
					<circle r="5"></circle>
					<circle r="10"></circle>
				</g>
			</svg>
		`)

		const mutations = observeMutations(from, () => morph(from, to))

		const morphedG = from.querySelector("g")
		expect(morphedG?.getAttribute("transform")).toBe("translate(20, 20) rotate(45)")
		expect(morphedG?.children.length).toBe(2)
		expect(morphedG?.children[1].getAttribute("r")).toBe("10")
		expect(mutations.elementsAdded).toBe(1)
	})

	test("should morph SVG text elements", () => {
		const from = svg('<svg><text x="10" y="20">Hello</text></svg>')
		container.appendChild(from)

		const to = svg('<svg><text x="30" y="40" font-size="20">World</text></svg>')

		morph(from, to)

		const morphedText = from.querySelector("text")
		expect(morphedText?.getAttribute("x")).toBe("30")
		expect(morphedText?.getAttribute("y")).toBe("40")
		expect(morphedText?.getAttribute("font-size")).toBe("20")
		expect(morphedText?.textContent).toBe("World")
	})

	test("should reorder SVG elements with IDs", () => {
		const from = svg(`
			<svg>
				<circle id="circle-1" cx="25"></circle>
				<circle id="circle-2" cx="50"></circle>
				<circle id="circle-3" cx="75"></circle>
			</svg>
		`)
		container.appendChild(from)

		const to = svg(`
			<svg>
				<circle id="circle-3" cx="75"></circle>
				<circle id="circle-1" cx="25"></circle>
				<circle id="circle-2" cx="50"></circle>
			</svg>
		`)

		morph(from, to)

		expect(from.children[0].id).toBe("circle-3")
		expect(from.children[1].id).toBe("circle-1")
		expect(from.children[2].id).toBe("circle-2")
	})

	test("should morph SVG polygons and polylines", () => {
		const from = svg('<svg><polygon points="10,10 20,10 15,20"></polygon></svg>')
		container.appendChild(from)

		const to = svg('<svg><polyline points="10,10 20,20 30,10 40,20" fill="none" stroke="blue"></polyline></svg>')

		morph(from, to)

		expect(from.children[0].tagName).toBe("polyline")
		expect(from.children[0].getAttribute("points")).toBe("10,10 20,20 30,10 40,20")
		expect(from.children[0].getAttribute("stroke")).toBe("blue")
	})

	test("should morph SVG with multiple shape types", () => {
		const from = svg(`
			<svg>
				<rect x="0"></rect>
				<ellipse cx="50"></ellipse>
			</svg>
		`)
		container.appendChild(from)

		const to = svg(`
			<svg>
				<circle cx="25"></circle>
				<line x1="0" y1="0" x2="100" y2="100"></line>
				<rect x="10"></rect>
			</svg>
		`)

		morph(from, to)

		expect(from.children.length).toBe(3)
		expect(from.children[0].tagName).toBe("circle")
		expect(from.children[1].tagName).toBe("line")
		expect(from.children[2].tagName).toBe("rect")
	})

	test("should preserve SVG namespace when creating new elements", () => {
		const from = svg("<svg></svg>")
		container.appendChild(from)

		const to = svg('<svg><circle r="50"></circle></svg>')

		morph(from, to)

		const morphedCircle = from.children[0]
		expect(morphedCircle.namespaceURI).toBe("http://www.w3.org/2000/svg")
		expect(morphedCircle.tagName).toBe("circle")
	})

	test("should morph SVG defs and use elements", () => {
		const from = svg(`
			<svg>
				<defs>
					<circle id="myCircle" r="10"></circle>
				</defs>
			</svg>
		`)
		container.appendChild(from)

		const to = svg(`
			<svg>
				<defs>
					<circle id="myCircle" r="20"></circle>
				</defs>
				<use href="#myCircle"></use>
			</svg>
		`)

		const mutations = observeMutations(from, () => morph(from, to))

		expect(from.children.length).toBe(2)
		expect(from.children[0].tagName).toBe("defs")
		expect(from.children[1].tagName).toBe("use")
		const defsCircle = from.children[0].children[0]
		expect(defsCircle.getAttribute("r")).toBe("20")
		expect(mutations.elementsAdded).toBe(1)
	})

	test("should morph SVG with class attributes", () => {
		const from = svg('<svg><circle class="small red"></circle></svg>')
		container.appendChild(from)

		const to = svg('<svg><circle class="large blue"></circle></svg>')

		morph(from, to)

		const morphedCircle = from.querySelector("circle")
		expect(morphedCircle?.getAttribute("class")).toBe("large blue")
	})

	test("should morph inner content of SVG element", () => {
		const from = svg('<svg><circle r="10"></circle></svg>')
		container.appendChild(from)

		const to = svg('<svg><rect width="20" height="20"></rect></svg>')

		morphInner(from, to)

		expect(from.children.length).toBe(1)
		expect(from.children[0].tagName).toBe("rect")
		expect(from.children[0].getAttribute("width")).toBe("20")
	})
})
