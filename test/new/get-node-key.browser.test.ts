import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

const byDataKey = (node: Element): string | null => node.getAttribute("data-key")

test("getNodeKey matches and reorders siblings by a custom key", () => {
	const from = dom(`<ul><li data-key="a">old a</li><li data-key="b">old b</li></ul>`)
	const a = from.children[0]
	const b = from.children[1]

	morph(from, `<ul><li data-key="b">new b</li><li data-key="a">new a</li></ul>`, { getNodeKey: byDataKey })

	expect([...from.children]).toEqual([b, a])
	expect(from.innerHTML).toBe(`<li data-key="b">new b</li><li data-key="a">new a</li>`)
})

test("getNodeKey replaces id as a form control's identity", () => {
	const from = dom(`<form><input id="old" data-key="field" name="q" value="old"></form>`)
	const input = from.firstElementChild!

	morph(from, `<form><input id="new" data-key="field" name="q" value="new"></form>`, { getNodeKey: byDataKey })

	expect(from.firstElementChild).toBe(input)
	expect(from.innerHTML).toBe(`<input id="new" data-key="field" name="q" value="new">`)
})

test("elements with different custom keys don't match through the same id", () => {
	const from = dom(`<form><input id="field" data-key="old" name="q"></form>`)
	const input = from.firstElementChild

	morph(from, `<form><input id="field" data-key="new" name="q"></form>`, { getNodeKey: byDataKey })

	expect(from.firstElementChild).not.toBe(input)
	expect(from.innerHTML).toBe(`<input id="field" data-key="new" name="q">`)
})

test("a custom-keyed element moves across parents and keeps its state", () => {
	const from = dom(`<div><section><input data-key="field" value="server"></section><aside></aside></div>`)
	document.body.append(from)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, `<div><section></section><aside><input data-key="field" value="server"></aside></div>`, {
		getNodeKey: byDataKey,
		preserveChanges: true,
	})

	expect(from.querySelector("input")).toBe(input)
	expect(input.parentElement!.localName).toBe("aside")
	expect(input.value).toBe("typed")
	from.remove()
})

test("duplicate custom keys don't move elements across parents", () => {
	const from = dom(`<div><section><input data-key="field"></section><b data-key="field"></b><aside></aside></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><section></section><b data-key="field"></b><aside><input data-key="field"></aside></div>`, {
		getNodeKey: byDataKey,
	})

	expect(from.querySelector("input")).not.toBe(input)
	expect(from.innerHTML).toBe(`<section></section><b data-key="field"></b><aside><input data-key="field"></aside>`)
})

test("getNodeKey accepts non-string truthy keys and treats falsy keys as unkeyed", () => {
	const from = dom(`<form><input id="old" data-key="1" name="q"><input id="keep" name="r"></form>`)
	const keyed = from.children[0]
	const unkeyed = from.children[1]

	morph(from, `<form><input id="new" data-key="1" name="q"><input id="changed" name="r"></form>`, {
		getNodeKey: (node) => Number(node.getAttribute("data-key")),
	})

	expect(from.children[0]).toBe(keyed)
	expect(from.children[1]).toBe(unkeyed)
	expect([...from.children].map((element) => element.id)).toEqual(["new", "changed"])
})
