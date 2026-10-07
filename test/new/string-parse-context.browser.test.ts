import { test, expect } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML"
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"

function createDocument(body: string): Document {
	const doc = document.implementation.createHTMLDocument()
	doc.body.innerHTML = body
	return doc
}

test("morphing a body to a string keeps the body", () => {
	const doc = createDocument(`<p>a</p>`)
	const body = doc.body

	morph(body, `<body class="x"><p>b</p></body>`)

	expect(doc.body).toBe(body)
	expect(doc.documentElement.outerHTML).toBe(`<html><head></head><body class="x"><p>b</p></body></html>`)
})

test("morphing a body to a string without a body tag keeps the body", () => {
	const doc = createDocument(`<p>a</p>`)
	const body = doc.body

	morph(body, `<p>b</p>`)

	expect(doc.body).toBe(body)
	expect(body.outerHTML).toBe(`<body><p>b</p></body>`)
})

test("morphing a head to a string keeps the head", () => {
	const doc = createDocument(``)
	doc.head.innerHTML = `<title>a</title>`
	const head = doc.head
	const title = doc.title

	morph(head, `<head><title>b</title></head>`)

	expect(doc.head).toBe(head)
	expect(title).toBe("a")
	expect(head.outerHTML).toBe(`<head><title>b</title></head>`)
})

test("a named image in the string doesn't stand in for the head", () => {
	const doc = createDocument(``)
	const head = doc.head

	morph(head, `<head><title>b</title></head><body><img name="head"></body>`)

	expect(doc.head).toBe(head)
	expect(head.outerHTML).toBe(`<head><title>b</title></head>`)
})

test("morphing an html element to a string keeps the html element", () => {
	const doc = createDocument(`<p>a</p>`)
	const html = doc.documentElement
	const body = doc.body

	morph(html, `<html lang="en"><head><title>b</title></head><body><p>b</p></body></html>`)

	expect(doc.documentElement).toBe(html)
	expect(doc.body).toBe(body)
	expect(html.outerHTML).toBe(`<html lang="en"><head><title>b</title></head><body><p>b</p></body></html>`)
})

test("an inner morph of a body to a string", () => {
	const doc = createDocument(`<p>a</p>`)
	const body = doc.body

	morphInner(body, `<body><p>b</p></body>`)

	expect(doc.body).toBe(body)
	expect(body.outerHTML).toBe(`<body><p>b</p></body>`)
})

test("an inner morph of a head to a string", () => {
	const doc = createDocument(``)
	const head = doc.head

	morphInner(head, `<head><title>b</title></head>`)

	expect(head.outerHTML).toBe(`<head><title>b</title></head>`)
})

test("morphing an SVG element to a string parses it as SVG", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><circle r="1"></circle></svg>`
	const circle = div.querySelector("circle")!

	morph(circle, `<circle r="5"></circle>`)

	const svg = div.querySelector("svg")!
	expect(svg.firstElementChild).toBe(circle)
	expect(circle.namespaceURI).toBe(SVG_NAMESPACE)
	expect(circle.getAttribute("r")).toBe("5")
})

test("morphing an SVG element to a string parses its children as SVG", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><g><circle r="1"></circle></g></svg>`
	const g = div.querySelector("g")!

	morph(g, `<g><rect width="1"></rect><linearGradient id="a"></linearGradient></g>`)

	expect(div.querySelector("svg")!.firstElementChild).toBe(g)
	const [rect, gradient] = Array.from(g.children)
	expect(rect!.namespaceURI).toBe(SVG_NAMESPACE)
	expect(gradient!.namespaceURI).toBe(SVG_NAMESPACE)
	expect(gradient!.localName).toBe("linearGradient")
})

test("an inner morph of an SVG element to a string parses it as SVG", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><g><circle r="1"></circle></g></svg>`
	const g = div.querySelector("g")!

	morphInner(g, `<g><rect width="1"></rect></g>`)

	expect(g.firstElementChild!.namespaceURI).toBe(SVG_NAMESPACE)
	expect(g.innerHTML).toBe(`<rect width="1"></rect>`)
})

test("morphing an element in a foreignObject to a string parses it as HTML", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><foreignObject><p>a</p></foreignObject></svg>`
	const p = div.querySelector("p")!

	morph(p, `<p>b</p>`)

	expect(div.querySelector("foreignObject")!.firstElementChild).toBe(p)
	expect(p.namespaceURI).toBe(HTML_NAMESPACE)
	expect(p.textContent).toBe("b")
})

test("morphing a foreignObject to a string parses its content as HTML", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><foreignObject><p>a</p></foreignObject></svg>`
	const foreignObject = div.querySelector("foreignObject")!

	morph(foreignObject, `<foreignObject><p>b</p></foreignObject>`)

	expect(div.querySelector("svg")!.firstElementChild).toBe(foreignObject)
	expect(foreignObject.firstElementChild!.namespaceURI).toBe(HTML_NAMESPACE)
	expect(foreignObject.textContent).toBe("b")
})

test("morphing a MathML element to a string parses it as MathML", () => {
	const div = document.createElement("div")
	div.innerHTML = `<math><mi>x</mi></math>`
	const mi = div.querySelector("mi")!

	morph(mi, `<mi>y</mi>`)

	expect(div.querySelector("math")!.firstElementChild).toBe(mi)
	expect(mi.namespaceURI).toBe(MATHML_NAMESPACE)
	expect(mi.textContent).toBe("y")
})

test("morphing a detached SVG element to a string parses it as SVG", () => {
	const circle = document.createElementNS(SVG_NAMESPACE, "circle")
	circle.setAttribute("r", "1")

	morph(circle, `<circle r="5"></circle>`)

	expect(circle.getAttribute("r")).toBe("5")
})

test("morphing a detached MathML element to a string parses it as MathML", () => {
	const mi = document.createElementNS(MATHML_NAMESPACE, "mi")
	mi.textContent = "x"

	morph(mi, `<mi>y</mi>`)

	expect(mi.textContent).toBe("y")
})

test("morphing an svg in HTML to a string still parses it in a template", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><circle r="1"></circle></svg>`
	const svg = div.querySelector("svg")!

	morph(svg, `<svg><circle r="5"></circle></svg>`)

	expect(div.firstElementChild).toBe(svg)
	expect(svg.firstElementChild!.namespaceURI).toBe(SVG_NAMESPACE)
	expect(svg.innerHTML).toBe(`<circle r="5"></circle>`)
})

test("morphing a text node in SVG to a string", () => {
	const div = document.createElement("div")
	div.innerHTML = `<svg><text>a</text></svg>`
	const text = div.querySelector("text")!.firstChild!

	morph(text, `b`)

	expect(div.querySelector("text")!.textContent).toBe("b")
})

test("morphing a body to a frameset string replaces it with the frameset", () => {
	const doc = createDocument(`<p>a</p>`)

	morph(doc.body, `<frameset></frameset>`)

	expect(doc.documentElement.outerHTML).toBe(`<html><head></head><frameset></frameset></html>`)
})

test("morphing a text node in a root without a parent to a string", () => {
	const text = document.createTextNode("a")

	morph(text, `b`)

	expect(text.textContent).toBe("b")
})

test("morphing an element in an HTML annotation-xml to a string parses it as HTML", () => {
	const div = document.createElement("div")
	div.innerHTML = `<math><annotation-xml encoding="text/html"><section>a</section></annotation-xml></math>`
	const section = div.querySelector("section")!

	morph(section, `<section>b</section>`)

	expect(div.querySelector("annotation-xml")!.firstElementChild).toBe(section)
	expect(section.namespaceURI).toBe(HTML_NAMESPACE)
	expect(section.textContent).toBe("b")
})
