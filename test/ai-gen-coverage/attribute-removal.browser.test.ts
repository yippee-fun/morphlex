import { test, expect, describe } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "../new/utils"

describe("attribute removal edge cases", () => {
	test("removing selected attribute from option with multiple options selected", () => {
		const a = dom(`<select multiple><option value="a" selected>A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select multiple><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement

		morph(a, b, { preserveChanges: true })

		// Line 417-418: when selected === defaultSelected, we set selected = false
		expect(a.options[0].hasAttribute("selected")).toBe(false)
		expect(a.options[0].selected).toBe(false)
	})

	test("removing selected attribute preserves user selection when it differs from default", () => {
		const a = dom(`<select><option value="a">A</option><option value="b" selected>B</option></select>`) as HTMLSelectElement
		const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

		// User changes selection - now selected !== defaultSelected
		a.options[0].selected = true

		morph(a, b, { preserveChanges: true })

		// Should preserve the user's selection
		expect(a.options[1].hasAttribute("selected")).toBe(false)
		expect(a.options[0].selected).toBe(true)
	})

	test("removing checked attribute from checkbox when preserveChanges disabled", () => {
		const a = dom(`<input type="checkbox" checked>`) as HTMLInputElement
		const b = dom(`<input type="checkbox">`) as HTMLInputElement

		a.checked = false

		morph(a, b, { preserveChanges: false })

		expect(a.hasAttribute("checked")).toBe(false)
		expect(a.checked).toBe(false)
	})
})
