import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function dom(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

test("clobber inside template content is kept for when the template is used", () => {
	const from = dom(`<div><template><input></template></div>`)

	morph(from, dom(`<div><template><input morphlex-clobber></template></div>`), { preserveChanges: true })

	const template = from.querySelector("template")!
	expect(template.content.querySelector("input")!.hasAttribute("morphlex-clobber")).toBe(true)
})

test("clobber inside template content doesn't discard changes outside the template", () => {
	const from = dom(`<div><input name="q"><template><input name="q"></template></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, dom(`<div><input name="q"><template><input name="q" morphlex-clobber></template></div>`), {
		preserveChanges: true,
	})

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("typed")
})

test("clobber from template content applies when the content is the target", () => {
	const from = dom(`<form><input name="q"></form>`)
	const input = from.querySelector("input")!
	input.value = "typed"
	const source = dom(`<div><template><form><input name="q" morphlex-clobber></form></template></div>`)
	const template = source.querySelector("template")!

	morph(from, template.content.cloneNode(true).firstChild!, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("")
	expect(from.querySelector("[morphlex-clobber]")).toBeNull()
	expect(template.content.querySelector("[morphlex-clobber]")).not.toBeNull()
})
