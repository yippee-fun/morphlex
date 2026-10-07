import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function parse(html: string): Element {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild!
}

function range(length: number): Array<number> {
	return Array.from({ length }, (_, i) => i)
}

test("many empty siblings whose attributes all change keep their nodes in order", () => {
	const from = parse(
		`<div>${range(40)
			.map((i) => `<i class="a${i % 3}" data-x="${i}"></i>`)
			.join("")}</div>`,
	)
	const icons = Array.from(from.children)

	const to = `<div>${range(40)
		.map((i) => `<i class="a${(i + 1) % 3}" data-x="${i}" title="t"></i>`)
		.join("")}</div>`
	morph(from, parse(to))

	expect(Array.from(from.children)).toEqual(icons)
	expect(from.outerHTML).toBe(to)
})

test("many empty siblings that differ in markup still take the equal ones", () => {
	const from = parse(
		`<div>${range(40)
			.map((i) => `<i data-x="${i}"></i>`)
			.join("")}</div>`,
	)
	const icons = Array.from(from.children)

	const order = range(40).reverse()
	morph(from, parse(`<div><b></b>${order.map((i) => `<i data-x="${i}"></i>`).join("")}</div>`))

	expect(from.children[0]!.localName).toBe("b")
	order.forEach((i, position) => expect(from.children[position + 1]).toBe(icons[i]))
})

test("many identical siblings keep their nodes when one changes", () => {
	const from = parse(`<ul>${"<li>x</li>".repeat(40)}</ul>`)
	const items = Array.from(from.children)

	morph(
		from,
		parse(
			`<ul>${range(40)
				.map((i) => (i === 20 ? `<li class="on">x</li>` : "<li>x</li>"))
				.join("")}</ul>`,
		),
	)

	expect(Array.from(from.children)).toEqual(items)
	expect(items[20]!.className).toBe("on")
})
