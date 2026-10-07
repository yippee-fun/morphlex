import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host.firstElementChild as HTMLElement
}

test("typed input keeps its same-name target when a changed input of another type comes first", () => {
	const form = mount(`<form><input name="u" type="search"><input value="1" type="text" name="u"></form>`)
	const [search, text] = form.querySelectorAll("input")
	search!.value = "s"
	text!.value = "typed"

	morph(form, `<form><input name="u" type="text" class="x" value="1"></form>`, { preserveChanges: true })

	expect(form.children.length).toBe(1)
	expect(form.children[0]).toBe(text)
	expect(text!.value).toBe("typed")
	expect(text!.className).toBe("x")
	form.parentElement!.remove()
})

test("typed input keeps its same-name target when a changed input of another type comes later", () => {
	const form = mount(`<form><input name="u" type="text"><input type="search" name="u"></form>`)
	const [text, search] = form.querySelectorAll("input")
	text!.value = "t"
	search!.value = "typed"

	morph(form, `<form><input name="u" type="search" class="x"></form>`, { preserveChanges: true })

	expect(form.children.length).toBe(1)
	expect(form.children[0]).toBe(search)
	expect(search!.value).toBe("typed")
	form.parentElement!.remove()
})

test("each changed input keeps the same-name target of its own type", () => {
	const form = mount(`<form><input name="u" type="search"><input type="text" name="u"></form>`)
	const [search, text] = form.querySelectorAll("input")
	search!.value = "s"
	text!.value = "t"

	morph(form, `<form><input name="u" type="text" class="x"><input name="u" type="search" class="y"></form>`, {
		preserveChanges: true,
	})

	expect([...form.children]).toEqual([text, search])
	expect(text!.value).toBe("t")
	expect(search!.value).toBe("s")
	form.parentElement!.remove()
})

test("untouched input keeps its same-name target when an input of another type comes first", () => {
	const form = mount(`<form><input name="u" type="search"><input type="text" name="u"></form>`)
	const text = form.querySelectorAll("input")[1]!

	morph(form, `<form><input name="u" type="text" class="x"></form>`)

	expect(form.children.length).toBe(1)
	expect(form.children[0]).toBe(text)
	expect(text.className).toBe("x")
	form.parentElement!.remove()
})

test("vetoing the target keeps the only same-name input of another type", () => {
	const form = mount(`<form><input name="u" type="search"></form>`)
	const search = form.children[0]

	morph(form, `<form><input name="u" type="text"></form>`, { beforeNodeAdded: () => false })

	expect([...form.children]).toEqual([search])
	form.parentElement!.remove()
})

test("vetoing the target keeps a changed same-name input of another type", () => {
	const form = mount(`<form><input name="u" type="search"></form>`)
	const search = form.children[0] as HTMLInputElement
	search.value = "typed"

	morph(form, `<form><input name="u" type="text" class="x"></form>`, {
		preserveChanges: true,
		beforeNodeAdded: () => false,
	})

	expect([...form.children]).toEqual([search])
	expect(search.value).toBe("typed")
	form.parentElement!.remove()
})
