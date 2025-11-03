import { test, expect } from "vitest"
import { morph } from "../src/morphlex"

function parseHTML(html: string): HTMLElement {
	const tmp = document.createElement("div")
	tmp.innerHTML = html.trim()
	return tmp.firstChild as HTMLElement
}

test("morphing a modified input value with preserveModified enabled", () => {
	const a = parseHTML(`<input type="text" value="a">`) as HTMLInputElement
	const b = parseHTML(`<input type="text" value="b">`) as HTMLInputElement

	a.value = "new"
	morph(a, b, { preserveModified: true })

	expect(a.outerHTML).toBe(`<input type="text" value="b">`)
	expect(a.value).toBe("new")
})

test("morphing a modified input value preserveModified disabled", () => {
	const a = parseHTML(`<input type="text" value="a">`) as HTMLInputElement
	const b = parseHTML(`<input type="text" value="b">`) as HTMLInputElement

	a.value = "new"
	morph(a, b, { preserveModified: false })

	expect(a.outerHTML).toBe(`<input type="text" value="b">`)
	expect(a.value).toBe("b")
})

test("morphing an unmodified input value with preserveModified enabled", () => {
	const a = parseHTML(`<input type="text" value="a">`) as HTMLInputElement
	const b = parseHTML(`<input type="text" value="b">`) as HTMLInputElement

	morph(a, b, { preserveModified: true })

	expect(a.outerHTML).toBe(`<input type="text" value="b">`)
	expect(a.value).toBe("b")
})
