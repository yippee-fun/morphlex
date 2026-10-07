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

test("many links keep their nodes when their order and text change", () => {
	const from = parse(
		`<div>${range(40)
			.map((i) => `<a href="/${i}">old ${i}</a>`)
			.join("")}</div>`,
	)
	const links = Array.from(from.children)

	const order = range(40).reverse()
	morph(from, parse(`<div><a href="/new">new</a>${order.map((i) => `<a href="/${i}">new ${i}</a>`).join("")}</div>`))

	expect(from.children[0]!.getAttribute("href")).toBe("/new")
	expect(links.includes(from.children[0]!)).toBe(false)
	order.forEach((i, position) => {
		expect(from.children[position + 1]).toBe(links[i])
		expect(from.children[position + 1]!.textContent).toBe(`new ${i}`)
	})
})

test("many images sharing a name with one sibling and a src with another take the first in order", () => {
	const from = parse(
		`<div>${range(40)
			.map((i) => `<img name="n${i}" src="/${i}.png" alt="old">`)
			.join("")}</div>`,
	)
	const images = Array.from(from.children)

	morph(
		from,
		parse(
			`<div>${range(40)
				.map((i) => `<img name="n${i}" src="/${39 - i}.png" alt="new">`)
				.join("")}</div>`,
		),
	)

	range(40).forEach((i) => {
		expect(from.children[i]).toBe(images[i])
		expect(from.children[i]!.getAttribute("src")).toBe(`/${39 - i}.png`)
	})
})

test("many inputs changing type keep their order", () => {
	const from = parse(
		`<form>${range(40)
			.map((i) => `<input name="f${i}" title="old">`)
			.join("")}</form>`,
	)

	morph(
		from,
		parse(
			`<form>${range(40)
				.map((i) => `<input type="checkbox" name="f${i}">`)
				.join("")}</form>`,
		),
	)

	range(40).forEach((i) => {
		const input = from.children[i] as HTMLInputElement
		expect(input.type).toBe("checkbox")
		expect(input.name).toBe(`f${i}`)
	})
})

test("many ticked checkboxes give way to new ones when every value changes", () => {
	const from = parse(
		`<form>${range(40)
			.map((i) => `<input type="checkbox" name="ids" value="a${i}">`)
			.join("")}</form>`,
	)
	document.body.append(from)
	for (const input of from.querySelectorAll("input")) input.checked = true

	morph(
		from,
		parse(
			`<form>${range(40)
				.map((i) => `<input type="checkbox" name="ids" value="b${i}">`)
				.join("")}</form>`,
		),
		{ preserveChanges: true },
	)

	const values = Array.from(from.querySelectorAll("input"), (input) => [input.value, input.checked])
	expect(values).toEqual(range(40).map((i) => [`b${i}`, false]))
	from.remove()
})
