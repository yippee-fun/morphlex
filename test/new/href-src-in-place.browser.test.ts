import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { observeMutations } from "./utils"

function morphChildren(fromHTML: string, toHTML: string) {
	const from = document.createElement("div")
	from.innerHTML = fromHTML
	const before = Array.from(from.childNodes)
	const to = document.createElement("div")
	to.innerHTML = toHTML
	const expected = to.innerHTML

	const mutations = observeMutations(from, () => morph(from, to))

	expect(from.innerHTML).toBe(expected)
	return {
		original: Array.from(from.childNodes, (node) => before.indexOf(node)),
		added: mutations.nodesAdded,
		removed: mutations.nodesRemoved,
	}
}

test.each([
	[`<a href="/old">old</a>`, `<a href="/new">new</a>`],
	[`<img src="/old.png">`, `<img src="/new.png">`],
	[`<iframe src="about:blank#old"></iframe>`, `<iframe src="about:blank#new"></iframe>`],
	[`<a href="/x">old</a>`, `<a href="">new</a>`],
	[`<a href="/x">old</a>`, `<a>new</a>`],
	[`<a>old</a>`, `<a href="/x">new</a>`],
	[`<link rel="stylesheet" href="data:text/css,p{}">`, `<link rel="stylesheet" href="data:text/css,p{ }">`],
])("an element whose href or src changes is morphed in place: %s to %s", (fromHTML, toHTML) => {
	expect(morphChildren(fromHTML, toHTML)).toEqual({ original: [0], added: 0, removed: 0 })
})

test("an element keeps the one sharing its href before others take it by position", () => {
	expect(morphChildren(`<a href="/a">a</a><a href="/b">b</a>`, `<a href="/b">b</a><a href="/c">c</a>`)).toEqual({
		original: [1, 0],
		added: 1,
		removed: 1,
	})
})

test("a focused link keeps focus when its href changes", () => {
	const from = document.createElement("div")
	from.innerHTML = `<a href="/old">Link</a>`
	document.body.append(from)
	const link = from.firstElementChild as HTMLAnchorElement
	link.focus()

	const to = document.createElement("div")
	to.innerHTML = `<a href="/new">Link</a>`
	morph(from, to)

	expect(from.firstElementChild).toBe(link)
	expect(link.getAttribute("href")).toBe("/new")
	expect(document.activeElement).toBe(link)
	from.remove()
})

test("an element with a name still isn't matched by tag", () => {
	expect(morphChildren(`<a name="old">old</a>`, `<a name="new">new</a>`)).toEqual({ original: [-1], added: 1, removed: 1 })
})

test("an element with a name and an href still isn't matched by tag", () => {
	expect(morphChildren(`<a name="n" href="/old">old</a>`, `<a name="n2" href="/new">new</a>`)).toEqual({
		original: [-1],
		added: 1,
		removed: 1,
	})
})

test("a form control with a changed src is still replaced", () => {
	expect(morphChildren(`<input type="image" src="/old.png">`, `<input type="image" src="/new.png">`)).toEqual({
		original: [-1],
		added: 1,
		removed: 1,
	})
})
