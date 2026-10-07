import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function dom(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

test("vetoed option visits keep the select's selection", () => {
	const from = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
	from.value = "b"

	morph(from, `<select><option value="a">A2</option><option value="b">B2</option></select>`, {
		beforeNodeVisited: (node) => node.nodeName !== "OPTION",
	})

	expect(from.options[0]!.textContent).toBe("A")
	expect(from.value).toBe("b")
})

test("a vetoed option keeps the selection even when other options are visited", () => {
	const from = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
	from.value = "b"

	morph(from, `<select><option value="a">A2</option><option value="b">B2</option></select>`, {
		beforeNodeVisited: (node) => !(node.nodeName === "OPTION" && (node as HTMLOptionElement).value === "b"),
	})

	expect(from.options[0]!.textContent).toBe("A2")
	expect(from.value).toBe("b")
})

test("vetoed optgroup children keep a multiple select's selection", () => {
	const from = dom(
		`<select multiple><optgroup label="g"><option value="a">A</option><option value="b">B</option></optgroup></select>`,
	) as HTMLSelectElement
	from.value = "b"

	morph(
		from,
		`<select multiple><optgroup label="g"><option value="a">A2</option><option value="b">B2</option></optgroup></select>`,
		{ beforeChildrenVisited: (node) => node.nodeName !== "OPTGROUP" },
	)

	expect(from.options[0]!.textContent).toBe("A")
	expect(from.value).toBe("b")
})

test("a vetoed optgroup visit keeps a drop-down's selection", () => {
	const from = dom(
		`<select><optgroup label="g"><option value="a">A</option><option value="b">B</option></optgroup></select>`,
	) as HTMLSelectElement
	from.value = "b"

	morph(from, `<select><optgroup label="g"><option value="a">A2</option><option value="b">B2</option></optgroup></select>`, {
		beforeNodeVisited: (node) => node.nodeName !== "OPTGROUP",
	})

	expect(from.value).toBe("b")
})

test("options outside a vetoed optgroup get the markup's selection", () => {
	const from = dom(
		`<select><option value="a">A</option><optgroup label="g"><option value="b">B</option></optgroup><option value="c">C</option></select>`,
	) as HTMLSelectElement
	from.value = "c"

	morph(
		from,
		`<select><option value="a">A</option><optgroup label="g"><option value="b">B2</option></optgroup><option value="c">C2</option></select>`,
		{ beforeNodeVisited: (node) => node.nodeName !== "OPTGROUP" },
	)

	expect(from.options[2]!.textContent).toBe("C2")
	expect(from.value).toBe("a")
})

test("a vetoed option keeps the selection an earlier option's new selected attribute took from it", () => {
	const from = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

	morph(from, `<select><option value="a" selected>A</option><option value="b">B</option></select>`, {
		beforeNodeVisited: (node) => !(node.nodeName === "OPTION" && (node as HTMLOptionElement).value === "b"),
	})

	expect(from.options[0]!.hasAttribute("selected")).toBe(true)
	expect(from.options[1]!.hasAttribute("selected")).toBe(true)
	expect(from.value).toBe("b")
})
