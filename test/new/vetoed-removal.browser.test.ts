import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("new nodes go after the nodes whose removal was vetoed", () => {
	const from = dom(`<ul><li>a</li><li>b</li></ul>`)

	morph(from, dom(`<ul><li id="c">c</li></ul>`), { beforeNodeRemoved: () => false })

	expect(from.outerHTML).toBe(`<ul><li>a</li><li>b</li><li id="c">c</li></ul>`)
})

test("the nodes whose removal was vetoed keep the whitespace between them", () => {
	const from = dom(`<ul>\n<li>a</li>\n<li>b</li>\n</ul>`)

	morph(from, dom(`<ul>\n<li id="c">c</li>\n</ul>`), { beforeNodeRemoved: () => false })

	expect(from.outerHTML).toBe(`<ul>\n<li>a</li>\n<li>b</li><li id="c">c</li>\n</ul>`)
})

test("a new node goes after a node whose removal was vetoed, in front of the next node that stays", () => {
	const from = dom(`<ul><li id="x">x</li><li>a</li><li id="y">y</li></ul>`)
	const x = from.querySelector("#x")
	const y = from.querySelector("#y")

	morph(from, dom(`<ul><li id="x">x</li><li id="c">c</li><li id="y">y</li></ul>`), {
		beforeNodeRemoved: () => false,
	})

	expect(from.outerHTML).toBe(`<ul><li id="x">x</li><li>a</li><li id="c">c</li><li id="y">y</li></ul>`)
	expect(from.querySelector("#x")).toBe(x)
	expect(from.querySelector("#y")).toBe(y)
})

test("a moved node goes after a node whose removal was vetoed", () => {
	const from = dom(`<ul><li>a</li><li id="y">y</li><li id="z">z</li><li id="x">x</li></ul>`)
	const x = from.querySelector("#x")

	morph(from, dom(`<ul><li id="x">x</li><li id="y">y</li><li id="z">z</li></ul>`), {
		beforeNodeRemoved: () => false,
	})

	expect(from.outerHTML).toBe(`<ul><li>a</li><li id="x">x</li><li id="y">y</li><li id="z">z</li></ul>`)
	expect(from.querySelector("#x")).toBe(x)
})

test("a new node goes after a node whose removal was vetoed, though the node in front of it moves away", () => {
	const from = dom(`<ul><li id="p">p</li><li>a</li><li id="q">q</li><li id="r">r</li></ul>`)

	morph(from, dom(`<ul><li id="c">c</li><li id="q">q</li><li id="r">r</li><li id="p">p</li></ul>`), {
		beforeNodeRemoved: () => false,
	})

	expect(from.outerHTML).toBe(`<ul><li>a</li><li id="c">c</li><li id="q">q</li><li id="r">r</li><li id="p">p</li></ul>`)
})

test("new nodes go after a movable element whose removal is vetoed when the morph settles", () => {
	const from = dom(`<ul><li id="a">a</li></ul>`)

	morph(from, dom(`<ul><li>c</li></ul>`), { beforeNodeRemoved: () => false })

	expect(from.outerHTML).toBe(`<ul><li id="a">a</li><li>c</li></ul>`)
})

test("the whitespace in front of a vetoed node after the last target stays", () => {
	const from = dom(`<div><span></span> <b></b></div>`)

	morph(from, dom(`<div><span></span></div>`), { beforeNodeRemoved: (node) => node.nodeName === "#text" })

	expect(from.outerHTML).toBe(`<div><span></span> <b></b></div>`)
})
