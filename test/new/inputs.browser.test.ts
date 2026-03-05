import { test, expect, describe } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

describe("text input", () => {
	test("morphing a modified value with preserveChanges enabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		a.value = "c"
		morph(a, b, { preserveChanges: true })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("c")
	})

	test("morphing a modified value preserveChanges disabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		a.value = "c"
		morph(a, b, { preserveChanges: false })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("b")
	})

	test("morphing an unmodified value with preserveChanges enabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		morph(a, b, { preserveChanges: true })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("b")
	})

	test("morphing a modified value across multiple preserveChanges morphs updates defaultValue", () => {
		const input = dom(`<input type="text" value="a">`) as HTMLInputElement
		const firstTarget = dom(`<input type="text" value="b">`) as HTMLInputElement
		const secondTarget = dom(`<input type="text" value="c">`) as HTMLInputElement

		input.value = "user one"
		morph(input, firstTarget, { preserveChanges: true })

		expect(input.value).toBe("user one")
		expect(input.defaultValue).toBe("b")
		expect(input.getAttribute("value")).toBe("b")

		input.value = "user two"
		morph(input, secondTarget, { preserveChanges: true })

		expect(input.value).toBe("user two")
		expect(input.defaultValue).toBe("c")
		expect(input.getAttribute("value")).toBe("c")
	})

	test("morphing sibling inputs keeps modified value but updates the correct defaultValue", () => {
		const from = dom(`<div><input type="text" name="n" value="a"><input type="text" name="n" value="a"></div>`) as HTMLElement
		const to = dom(`<div><input type="text" name="n" value="b"><input type="text" name="n" value="a"></div>`) as HTMLElement

		const first = from.children[0] as HTMLInputElement
		const second = from.children[1] as HTMLInputElement

		first.value = "user typed"
		morph(from, to, { preserveChanges: true })

		expect(first.value).toBe("user typed")
		expect(first.defaultValue).toBe("b")
		expect(first.getAttribute("value")).toBe("b")
		expect(second.value).toBe("a")
		expect(second.defaultValue).toBe("a")
		expect(second.getAttribute("value")).toBe("a")
	})

	test("morphing updates default while dirty and keeps value dirty", () => {
		const input = dom(`<input type="text" value="a">`) as HTMLInputElement

		input.value = "b"
		expect(input.value).toBe("b")
		expect(input.defaultValue).toBe("a")

		morph(input, dom(`<input type="text" value="c">`), { preserveChanges: true })
		expect(input.value).toBe("b")
		expect(input.defaultValue).toBe("c")

		input.value = "c"
		expect(input.value).toBe("c")
		expect(input.defaultValue).toBe("c")

		morph(input, dom(`<input type="text" value="d">`), { preserveChanges: true })
		expect(input.value).toBe("c")
		expect(input.defaultValue).toBe("d")
	})
})

describe("checkbox", () => {
	test("morphing a modified checkbox checked with preserveChanges enabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		a.checked = true
		morph(a, b, { preserveChanges: true })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing a modified checkbox checked with preserveChanges disabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		a.checked = true
		morph(a, b, { preserveChanges: false })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing an unmodified checkbox with preserveChanges enabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		morph(a, b, { preserveChanges: true })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing an unmodified checkbox checked with preserveChanges enabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		morph(a, b, { preserveChanges: true })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})

	test("morphing a modified checkbox unchecked with preserveChanges enabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		a.checked = false
		morph(a, b, { preserveChanges: true })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})

	test("morphing a modified checkbox unchecked with preserveChanges disabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		a.checked = false
		morph(a, b, { preserveChanges: false })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})
})

describe("select", () => {
	test("morphing a modified select option with preserveChanges enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		a.value = "b"
		morph(a, b, { preserveChanges: true })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing a modified select option with preserveChanges disabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		a.value = "b"
		morph(a, b, { preserveChanges: false })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing an unmodified select option with preserveChanges enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		morph(a, b, { preserveChanges: true })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing a modified select option back to default with preserveChanges enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

		a.value = "a"
		morph(a, b, { preserveChanges: true })

		expect(a.options[1].hasAttribute("selected")).toBe(false)
		expect(a.value).toBe("a")
		expect(a.options[0].selected).toBe(true)
	})

	test("morphing a modified select option back to default with preserveChanges disabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

		a.value = "a"
		morph(a, b, { preserveChanges: false })

		expect(a.options[1].hasAttribute("selected")).toBe(false)
		expect(a.value).toBe("a")
		expect(a.options[0].selected).toBe(true)
	})

	test("morphing a select option with no value", () => {
		const a = dom(
			`
				<select>
					<option></option>
					<option></option>
				</select>
			`,
		)

		const b = dom(
			`
				<select>
					<option value="1">A</option>
					<option value="2">B</option>
				</select>
			`,
		)

		morph(a, b)

		expect(a.outerHTML).toBe(
			`
				<select>
					<option value="1">A</option>
					<option value="2">B</option>
				</select>
			`.trim(),
		)
	})
})

describe("textarea", () => {
	test("morphing a modified textarea value with preserveChanges enabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		a.value = "c"
		morph(a, b, { preserveChanges: true })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("c")
	})

	test("morphing a modified textarea value with preserveChanges disabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		a.value = "c"
		morph(a, b, { preserveChanges: false })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("b")
	})

	test("morphing an unmodified textarea value with preserveChanges enabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		morph(a, b, { preserveChanges: true })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("b")
	})
})
