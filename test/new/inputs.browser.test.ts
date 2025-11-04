import { test, expect, describe } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

describe("text input", () => {
	test("morphing a modified value with preserveModified enabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		a.value = "c"
		morph(a, b, { preserveModified: true })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("c")
	})

	test("morphing a modified value preserveModified disabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		a.value = "c"
		morph(a, b, { preserveModified: false })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("b")
	})

	test("morphing an unmodified value with preserveModified enabled", () => {
		const a = dom(`<input type="text" value="a">`) as HTMLInputElement
		const b = dom(`<input type="text" value="b">`) as HTMLInputElement

		morph(a, b, { preserveModified: true })

		expect(a.outerHTML).toBe(`<input type="text" value="b">`)
		expect(a.value).toBe("b")
	})
})

describe("checkbox", () => {
	test("morphing a modified checkbox checked with preserveModified enabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		a.checked = true
		morph(a, b, { preserveModified: true })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing a modified checkbox checked with preserveModified disabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		a.checked = true
		morph(a, b, { preserveModified: false })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing an unmodified checkbox with preserveModified enabled", () => {
		const a = dom(`<input type="checkbox">`) as HTMLInputElement
		const b = dom(`<input type="checkbox" checked>`) as HTMLInputElement

		morph(a, b, { preserveModified: true })

		expect(a.hasAttribute("checked")).toBe(true)
		expect(a.checked).toBe(true)
	})

	test("morphing a modified checkbox unchecked with preserveModified enabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		a.checked = false
		morph(a, b, { preserveModified: true })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})

	test("morphing a modified checkbox unchecked with preserveModified disabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		a.checked = false
		morph(a, b, { preserveModified: false })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})
})

describe("select", () => {
	test("morphing a modified select option with preserveModified enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		a.value = "b"
		morph(a, b, { preserveModified: true })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing a modified select option with preserveModified disabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		a.value = "b"
		morph(a, b, { preserveModified: false })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing an unmodified select option with preserveModified enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		morph(a, b, { preserveModified: true })

		expect(a.options[1].hasAttribute("selected")).toBe(true)
		expect(a.value).toBe("b")
		expect(a.options[1].selected).toBe(true)
	})

	test("morphing a modified select option back to default with preserveModified enabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

		a.value = "a"
		morph(a, b, { preserveModified: true })

		expect(a.options[1].hasAttribute("selected")).toBe(false)
		expect(a.value).toBe("a")
		expect(a.options[0].selected).toBe(true)
	})

	test("morphing a modified select option back to default with preserveModified disabled", () => {
		const a = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

		a.value = "a"
		morph(a, b, { preserveModified: false })

		expect(a.options[1].hasAttribute("selected")).toBe(false)
		expect(a.value).toBe("a")
		expect(a.options[0].selected).toBe(true)
	})
})

describe("textarea", () => {
	test("morphing a modified textarea value with preserveModified enabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		a.value = "c"
		morph(a, b, { preserveModified: true })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("c")
	})

	test("morphing a modified textarea value with preserveModified disabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		a.value = "c"
		morph(a, b, { preserveModified: false })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("b")
	})

	test("morphing an unmodified textarea value with preserveModified enabled", () => {
		const a = dom(`<textarea>a</textarea>`) as HTMLTextAreaElement
		const b = dom(`<textarea>b</textarea>`) as HTMLTextAreaElement

		morph(a, b, { preserveModified: true })

		expect(a.textContent).toBe("b")
		expect(a.value).toBe("b")
	})
})
