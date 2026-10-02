import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"
import { dom } from "./utils"

test("morphing a template replaces its content", () => {
	const from = dom(`<template><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template><p>b</p></template>`) as HTMLTemplateElement

	morph(from, to)

	expect(from.innerHTML).toBe("<p>b</p>")
})

test("morphing a template updates both attributes and content", () => {
	const from = dom(`<template id="t" class="x"><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template id="t" class="y"><p>b</p></template>`) as HTMLTemplateElement

	morph(from, to)

	expect(from.className).toBe("y")
	expect(from.innerHTML).toBe("<p>b</p>")
})

test("morphing updates a template nested in an otherwise equal element", () => {
	const from = dom(`<div><template><p>a</p></template></div>`)
	const to = dom(`<div><template><p>b</p></template></div>`)

	morph(from, to)

	expect(from.querySelector("template")!.innerHTML).toBe("<p>b</p>")
})

test("morphing updates a template nested in an equal sibling during child matching", () => {
	const from = dom(`<div><section><template><p>a</p></template></section><span>x</span></div>`)
	const to = dom(`<div><span>x</span><section><template><p>b</p></template></section></div>`)
	const section = from.querySelector("section")

	morph(from, to)

	expect(from.querySelector("section")).toBe(section)
	expect(from.querySelector("template")!.innerHTML).toBe("<p>b</p>")
})

test("morphing updates a template nested inside another template", () => {
	const from = dom(`<template><template><p>a</p></template></template>`) as HTMLTemplateElement
	const to = dom(`<template><template><p>b</p></template></template>`) as HTMLTemplateElement

	morph(from, to)

	expect(from.innerHTML).toBe("<template><p>b</p></template>")
})

test("morphing leaves an unchanged template's content alone", () => {
	const from = dom(`<div><template><p>a</p></template></div>`)
	const to = dom(`<div><template><p>a</p></template></div>`)
	const paragraph = from.querySelector("template")!.content.firstChild

	morph(from, to)

	expect(from.querySelector("template")!.content.firstChild).toBe(paragraph)
})

test("morphing a template can empty its content", () => {
	const from = dom(`<template><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template></template>`) as HTMLTemplateElement

	morph(from, to)

	expect(from.innerHTML).toBe("")
})

test("morphInner on a template replaces its content", () => {
	const from = dom(`<template><p>a</p></template>`) as HTMLTemplateElement

	morphInner(from, `<template><p>b</p></template>`)

	expect(from.innerHTML).toBe("<p>b</p>")
})

test("beforeChildrenVisited can stop a template's content from changing", () => {
	const from = dom(`<template><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template><p>b</p></template>`) as HTMLTemplateElement

	morph(from, to, { beforeChildrenVisited: () => false })

	expect(from.innerHTML).toBe("<p>a</p>")
})

test("an svg element named template is morphed through its children", () => {
	const from = dom(`<svg><template><text>a</text></template></svg>`)
	const to = dom(`<svg><template><text>b</text></template></svg>`)

	morph(from, to)

	expect(from.querySelector("text")!.textContent).toBe("b")
})

test("an equal tree containing an svg element named template stays untouched", () => {
	const from = dom(`<div><svg><template><text>a</text></template></svg></div>`)
	const to = dom(`<div><svg><template><text>a</text></template></svg></div>`)
	const text = from.querySelector("text")

	morph(from, to)

	expect(from.querySelector("text")).toBe(text)
})

test("afterChildrenVisited fires after a template's content is replaced", () => {
	const from = dom(`<template><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template><p>b</p></template>`) as HTMLTemplateElement
	const visited: Array<string> = []

	morph(from, to, { afterChildrenVisited: (parent) => visited.push((parent as Element).innerHTML) })

	expect(visited).toEqual(["<p>b</p>"])
})

test("morphing a template with unchanged content keeps the content nodes", () => {
	const from = dom(`<template class="x"><p>a</p></template>`) as HTMLTemplateElement
	const to = dom(`<template class="y"><p>a</p></template>`) as HTMLTemplateElement
	const paragraph = from.content.firstChild

	morph(from, to)

	expect(from.className).toBe("y")
	expect(from.content.firstChild).toBe(paragraph)
})

test("morphing equal text nodes leaves them alone", () => {
	const from = document.createTextNode("a")
	const to = document.createTextNode("a")
	let visited = false

	morph(from, to, { beforeNodeVisited: () => (visited = true) })

	expect(visited).toBe(false)
})
