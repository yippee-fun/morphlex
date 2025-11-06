import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "../new/utils"

test("morphing inputs by localName with same types matches correctly", () => {
	// This test ensures lines 566-568 are covered (the non-continue path)
	// Inputs without id or name attributes fall through to localName matching
	const a = dom(`<form><input type="email" class="first"><input type="email" class="second"></form>`) as HTMLElement
	const b = dom(`<form><input type="email" placeholder="a"><input type="email" placeholder="b"></form>`) as HTMLElement

	const first = a.children[0] as HTMLInputElement
	const second = a.children[1] as HTMLInputElement

	morph(a, b)

	// Same type inputs should be reused via localName matching
	expect(a.children[0]).toBe(first)
	expect(a.children[1]).toBe(second)
	expect((a.children[0] as HTMLInputElement).placeholder).toBe("a")
	expect((a.children[1] as HTMLInputElement).placeholder).toBe("b")
})

test("morphing inputs with different types by localName skips mismatched types", () => {
	// This test specifically targets lines 562-564 in morphlex.ts (the continue path)
	// We need inputs without IDs or name attributes, so they fall through to localName matching
	const a = dom(
		`<div><input type="text" class="a"><input type="checkbox" class="b"><input type="text" class="c"></div>`,
	) as HTMLElement
	const b = dom(
		`<div><input type="checkbox" class="x"><input type="text" class="y"><input type="text" class="z"></div>`,
	) as HTMLElement

	morph(a, b)

	// The first input (text) can't match the first target (checkbox) due to type mismatch (line 563-564)
	// So different elements should be created/replaced
	const inputs = Array.from(a.children) as HTMLInputElement[]

	expect(inputs[0].type).toBe("checkbox")
	expect(inputs[0].className).toBe("x")
	expect(inputs[1].type).toBe("text")
	expect(inputs[1].className).toBe("y")
	expect(inputs[2].type).toBe("text")
	expect(inputs[2].className).toBe("z")
})

test("morphing option with selected attribute removed when matches default", () => {
	// This test targets line 418 in morphlex.ts
	const a = dom(
		`<select multiple><option value="a" selected>A</option><option value="b" selected>B</option><option value="c">C</option></select>`,
	) as HTMLSelectElement
	const b = dom(
		`<select multiple><option value="a">A</option><option value="b" selected>B</option><option value="c">C</option></select>`,
	) as HTMLSelectElement

	// First option has selected attribute, so selected === defaultSelected (both true)
	const firstOption = a.options[0]
	expect(firstOption.selected).toBe(true)

	morph(a, b, { preserveChanges: true })

	// Line 418: since selected === defaultSelected, we set selected = false
	expect(a.options[0].selected).toBe(false)
	expect(a.options[0].hasAttribute("selected")).toBe(false)
})

test("morphing option with selected attribute removed with preserveChanges false", () => {
	// This test targets line 418 with preserveChanges: false branch
	const a = dom(`<select><option value="a" selected>A</option><option value="b">B</option></select>`) as HTMLSelectElement
	const b = dom(`<select><option value="a">A</option><option value="b">B</option></select>`) as HTMLSelectElement

	// First option has selected attribute
	expect(a.options[0].selected).toBe(true)

	morph(a, b, { preserveChanges: false })

	// Line 418: with preserveChanges false, we set selected = false
	expect(a.options[0].hasAttribute("selected")).toBe(false)
})
