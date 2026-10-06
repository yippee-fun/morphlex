import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host.firstElementChild as HTMLElement
}

test("typed text stays in its input when an identical input is added after it", () => {
	const form = mount(`<form><input class="q"><input class="q"></form>`)
	const [first, second] = form.querySelectorAll("input")
	first!.value = "typed"

	morph(form, `<form class="x"><input class="q"><input class="q"><input class="q"></form>`, { preserveChanges: true })

	const inputs = form.querySelectorAll("input")
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(first!.value).toBe("typed")
	form.parentElement!.remove()
})

test("typed text stays in its textarea when an identical textarea is added after it", () => {
	const form = mount(`<form><textarea></textarea><textarea></textarea></form>`)
	const [first, second] = form.querySelectorAll("textarea")
	first!.value = "typed"

	morph(form, `<form class="x"><textarea></textarea><textarea></textarea><textarea></textarea></form>`, {
		preserveChanges: true,
	})

	const textareas = form.querySelectorAll("textarea")
	expect(textareas[0]).toBe(first)
	expect(textareas[1]).toBe(second)
	expect(first!.value).toBe("typed")
	form.parentElement!.remove()
})

test("a checked checkbox stays in place when an identical checkbox is added after it", () => {
	const form = mount(`<form><input type="checkbox"><input type="checkbox"></form>`)
	const [first, second] = form.querySelectorAll("input")
	first!.checked = true

	morph(form, `<form class="x"><input type="checkbox"><input type="checkbox"><input type="checkbox"></form>`, {
		preserveChanges: true,
	})

	const inputs = form.querySelectorAll("input")
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(first!.checked).toBe(true)
	expect(second!.checked).toBe(false)
	form.parentElement!.remove()
})

test("a focused input keeps its position when its typed text is reset", () => {
	const form = mount(`<form><input class="q"><input class="q"></form>`)
	const [first, second] = form.querySelectorAll("input")
	first!.focus()
	first!.value = "typed"

	morph(form, `<form class="x"><input class="q"><input class="q"><input class="q"></form>`)

	const inputs = form.querySelectorAll("input")
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(first!.value).toBe("")
	expect(document.activeElement).toBe(first)
	form.parentElement!.remove()
})

test("typed text doesn't trade places into a target that discards it", () => {
	const form = mount(`<form><label><input name="a"></label><label><input name="a"></label></form>`)
	const [first, second] = form.querySelectorAll("input")
	first!.value = "typed"

	morph(form, `<form><label><input name="a" morphlex-clobber></label><label class="y"><input name="a"></label></form>`, {
		preserveChanges: true,
	})

	const inputsAfter = form.querySelectorAll("input")
	expect(inputsAfter).toHaveLength(2)
	expect(inputsAfter[0]).toBe(second)
	expect(inputsAfter[1]).toBe(first)
	expect(first!.value).toBe("typed")
	form.parentElement!.remove()
})

test("typed text stays in place among many identical inputs", () => {
	const form = mount(`<form>${"<input>".repeat(600)}</form>`)
	const inputs = [...form.querySelectorAll("input")]
	inputs[3]!.value = "typed"
	inputs[400]!.value = "also typed"

	morph(form, `<form class="x">${"<input>".repeat(601)}</form>`, { preserveChanges: true })

	expect([...form.querySelectorAll("input")].slice(0, 600)).toEqual(inputs)
	expect(inputs[3]!.value).toBe("typed")
	expect(inputs[400]!.value).toBe("also typed")
	form.parentElement!.remove()
})

test("typed text stays in place among many pairs of identical inputs", () => {
	const pairs = Array.from({ length: 300 }, (_, i) => `<input name="a${i}"><input name="a${i}">`).join("")
	const form = mount(`<form>${pairs}</form>`)
	const inputs = [...form.querySelectorAll("input")]
	for (let i = 0; i < 300; i++) inputs[2 * i + 1]!.value = `typed ${i}`

	morph(form, `<form class="x">${pairs}</form>`, { preserveChanges: true })

	expect([...form.querySelectorAll("input")]).toEqual(inputs)
	for (let i = 0; i < 300; i++) expect(inputs[2 * i + 1]!.value).toBe(`typed ${i}`)
	form.parentElement!.remove()
})

test("typed text stays in its input when an element is added between it and an identical input", () => {
	const form = mount(`<form><input class="q"><input class="q"><p></p></form>`)
	const [first, second] = form.querySelectorAll("input")
	first!.value = "typed"

	morph(form, `<form><input class="q"><p></p><input class="q"></form>`, { preserveChanges: true })

	const inputsAfter = form.querySelectorAll("input")
	expect(inputsAfter).toHaveLength(2)
	expect(inputsAfter[0]).toBe(first)
	expect(inputsAfter[1]).toBe(second)
	expect(first!.value).toBe("typed")
	form.parentElement!.remove()
})

test("a changed element doesn't trade places into a target that discards its changes", () => {
	const form = mount(`<form><label><input name="a"></label><label><input name="a"></label><label><input name="a"></label></form>`)
	const [first, second, third] = form.querySelectorAll("input")
	first!.value = "first"
	second!.value = "second"

	morph(
		form,
		`<form><label class="c"><input name="a" morphlex-clobber></label><label><input name="a"></label><label><input name="a"></label></form>`,
		{ preserveChanges: true },
	)

	expect(first!.value).toBe("first")
	const inputsAfter = form.querySelectorAll("input")
	expect(inputsAfter).toHaveLength(3)
	expect(inputsAfter[0]).toBe(second)
	expect(inputsAfter[1]).toBe(first)
	expect(inputsAfter[2]).toBe(third)
	form.parentElement!.remove()
})

test("selects matched by the user's picks keep their targets when an identical select is ordered", () => {
	const options = `<option>a</option><option>b</option><option>c</option>`
	const form = mount(`<form><select>${options}</select><select>${options}</select><select>${options}</select></form>`)
	const [first, second, third] = form.querySelectorAll("select")
	first!.value = "b"
	second!.value = "c"

	morph(form, `<form><select><option>c</option></select><select><option>b</option></select><select>${options}</select></form>`, {
		preserveChanges: true,
	})

	expect([first!.value, second!.value]).toEqual(["b", "c"])
	const selectsAfter = form.querySelectorAll("select")
	expect(selectsAfter).toHaveLength(3)
	expect(selectsAfter[0]).toBe(second)
	expect(selectsAfter[1]).toBe(first)
	expect(selectsAfter[2]).toBe(third)
	form.parentElement!.remove()
})

test("identical forms with a field named textContent are ordered by their text", () => {
	const html = `<form><input name="textContent"></form>`
	const root = mount(`<div>${html.repeat(50)}</div>`)
	const forms = [...root.children]

	morph(
		root,
		`<div>${Array.from({ length: 50 }, (_, i) => (i % 2 ? `<form class="x"><input name="textContent"></form>` : html)).join("")}</div>`,
	)

	expect([...root.children]).toEqual(forms)
	root.parentElement!.remove()
})

test("typed text keeps its box when an untouched identical input before it changes", () => {
	const form = mount(`<form><input name="n[]"><input name="n[]"><input name="n[]"></form>`)
	const [first, second, third] = form.querySelectorAll("input")
	second!.value = "second"
	third!.value = "third"

	morph(form, `<form><input name="n[]" class="error"><input name="n[]"><input name="n[]"></form>`, { preserveChanges: true })

	const inputs = [...form.querySelectorAll("input")]
	expect(inputs.map((input) => input.value)).toEqual(["", "second", "third"])
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(inputs[2]).toBe(third)
	expect(first!.className).toBe("error")
	form.parentElement!.remove()
})

test("typed text keeps its box among identical wrappers when the first wrapper changes", () => {
	const row = `<div><input class="q"></div>`
	const form = mount(`<form>${row.repeat(3)}</form>`)
	const [first, second, third] = form.querySelectorAll("input")
	second!.value = "second"
	third!.value = "third"

	morph(form, `<form><div class="error"><input class="q"></div>${row.repeat(2)}</form>`, { preserveChanges: true })

	const inputs = [...form.querySelectorAll("input")]
	expect(inputs.map((input) => input.value)).toEqual(["", "second", "third"])
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(inputs[2]).toBe(third)
	expect(form.firstElementChild!.className).toBe("error")
	form.parentElement!.remove()
})
