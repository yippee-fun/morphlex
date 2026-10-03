import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom, observeMutations } from "./utils"

function list(ids: Array<number>): HTMLElement {
	return dom(`<ul>${ids.map((id) => `<li id="item-${id}"><span>Item ${id}</span> <button>x</button></li>`).join("")}</ul>`)
}

test("removing a row from an id-keyed list leaves the other rows untouched", () => {
	const from = list([1, 2, 3, 4, 5])
	const to = list([1, 2, 4, 5])
	const expected = to.outerHTML

	const mutations = observeMutations(from, () => {
		morph(from, to)
	})

	expect(from.outerHTML).toBe(expected)
	expect(mutations.count).toBe(1)
	expect(mutations.elementsRemoved).toBe(1)
})

test("identical id-matched elements are not visited", () => {
	const from = list([1, 2, 3])
	const to = list([3, 1, 2])
	const visited: Array<string> = []

	morph(from, to, {
		beforeNodeVisited: (fromNode) => {
			if (fromNode instanceof Element && fromNode.localName === "li") visited.push(fromNode.id)
			return true
		},
	})

	expect(visited).toEqual([])
	expect(from.outerHTML).toBe(list([3, 1, 2]).outerHTML)
})

test("id-matched elements that differ are still morphed", () => {
	const from = list([1, 2])
	const to = dom(
		`<ul><li id="item-1"><span>Item 1</span> <button>x</button></li><li id="item-2" class="new"><span>Changed</span> <button>x</button></li></ul>`,
	)
	const expected = to.outerHTML
	const second = from.children[1]

	morph(from, to)

	expect(from.outerHTML).toBe(expected)
	expect(from.children[1]).toBe(second)
})

test("id-matched elements holding user edits are still morphed", () => {
	const from = dom(`<div><p id="row"><input name="q" value="server"></p></div>`)
	document.body.append(from)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><p id="row"><input name="q" value="server"></p></div>`))

	expect(input.value).toBe("server")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
	from.remove()
})
