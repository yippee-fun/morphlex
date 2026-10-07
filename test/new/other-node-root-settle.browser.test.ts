import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function parseChildren(html: string): NodeListOf<ChildNode> {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstChild!.childNodes
}

test("a text root settles before its afterNodeVisited", () => {
	const select = document.createElement("select")
	select.innerHTML = ` <option value="a">A</option><option value="b">B</option>`
	document.body.append(select)
	const text = select.firstChild!
	let seen: string | undefined

	morph(text, parseChildren(`<select>  <option value="z">Z</option></select>`), {
		afterNodeVisited: (from) => {
			if (from === text) seen = select.value
		},
	})

	expect(select.value).toBe("z")
	expect(seen).toBe("z")
	select.remove()
})

test("a comment root settles before its afterNodeVisited", () => {
	const select = document.createElement("select")
	select.innerHTML = `<!--a--><option value="a">A</option><option value="b">B</option>`
	document.body.append(select)
	const comment = select.firstChild!
	let seen: string | undefined

	morph(comment, parseChildren(`<select><!--b--><option value="z">Z</option></select>`), {
		afterNodeVisited: (from) => {
			if (from === comment) seen = select.value
		},
	})

	expect(comment.nodeValue).toBe("b")
	expect(select.value).toBe("z")
	expect(seen).toBe("z")
	select.remove()
})
