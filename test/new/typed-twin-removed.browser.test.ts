import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host.firstElementChild as HTMLElement
}

test("a typed input stays when its untouched twin is removed", () => {
	const form = mount(`<form><input name="n[]"><input name="n[]"></form>`)
	const [typed] = form.querySelectorAll("input")
	typed!.value = "typed"

	morph(form, `<form><input name="n[]"></form>`, { preserveChanges: true })

	const inputs = form.querySelectorAll("input")
	expect(inputs).toHaveLength(1)
	expect(inputs[0]).toBe(typed)
	expect(typed!.value).toBe("typed")
	form.parentElement!.remove()
})

test("a typed textarea stays when its untouched twin is removed", () => {
	const form = mount(`<form><textarea></textarea><textarea></textarea></form>`)
	const [, typed] = form.querySelectorAll("textarea")
	typed!.value = "typed"

	morph(form, `<form><textarea></textarea></form>`, { preserveChanges: true })

	const textareas = form.querySelectorAll("textarea")
	expect(textareas).toHaveLength(1)
	expect(textareas[0]).toBe(typed)
	expect(typed!.value).toBe("typed")
	form.parentElement!.remove()
})

test("a typed input takes its own target when its untouched twin's target discards changes", () => {
	const form = mount(`<form><input class="q"><input class="q"></form>`)
	const [typed, untouched] = form.querySelectorAll("input")
	typed!.value = "typed"

	morph(form, `<form><input class="q"><input class="q" morphlex-clobber></form>`, { preserveChanges: true })

	const inputs = form.querySelectorAll("input")
	expect(inputs[0]).toBe(typed)
	expect(inputs[1]).toBe(untouched)
	expect(typed!.value).toBe("typed")
	form.parentElement!.remove()
})

test("without preserving changes, the typed input is kept and reset rather than replaced", () => {
	const form = mount(`<form><input name="n[]"><input name="n[]"></form>`)
	const [typed] = form.querySelectorAll("input")
	typed!.value = "typed"

	morph(form, `<form><input name="n[]"></form>`)

	const inputs = form.querySelectorAll("input")
	expect(inputs).toHaveLength(1)
	expect(inputs[0]).toBe(typed)
	expect(typed!.value).toBe("")
	form.parentElement!.remove()
})

test("the untouched twin that goes is the one that keeps typed rows of two kinds in order", () => {
	const form = mount(
		`<form><p>old</p><label><input></label><label><input></label><input name="t"><label><input></label><p>old</p><input name="t"><label><input></label></form>`,
	)
	const inputs = [...form.querySelectorAll("input")]
	const typed = [inputs[1]!, inputs[2]!, inputs[3]!]
	typed.forEach((input, i) => (input.value = `typed ${i}`))

	morph(
		form,
		`<form><p>new</p><p>new</p><label class="changed"><input></label><input name="t"><label><input></label><input name="t"><label><input></label></form>`,
		{ preserveChanges: true },
	)

	const after = [...form.querySelectorAll("input")]
	expect(after).toHaveLength(5)
	expect(after.filter((input) => input.value)).toEqual(typed)
	expect(after.slice(0, 3)).toEqual(typed)
	form.parentElement!.remove()
})

test("a typed twin keeps its place when the target discarding changes comes first", () => {
	const form = mount(`<form><input name="t"><input name="t"><input name="t"><input name="t"><input name="t"></form>`)
	const inputs = [...form.querySelectorAll("input")]
	inputs[2]!.value = "a"
	inputs[3]!.value = "b"

	morph(
		form,
		`<form><input name="t"><p>new</p><input name="t" class="changed" morphlex-clobber><input name="t"><input name="t"><p>new</p><input name="t"></form>`,
		{ preserveChanges: true },
	)

	expect([...form.querySelectorAll("input")].map((input) => input.value)).toEqual(["", "", "a", "b", ""])
	form.parentElement!.remove()
})

test("a typed input before its untouched twins keeps a target that doesn't discard changes", () => {
	const form = mount(`<form><input name="t"><input name="t"><input name="t"></form>`)
	const inputs = [...form.querySelectorAll("input")]
	inputs[2]!.value = "typed"

	morph(form, `<form><input name="t"><input name="t" morphlex-clobber></form>`, { preserveChanges: true })

	const after = [...form.querySelectorAll("input")]
	expect(after).toHaveLength(2)
	expect(after[0]).toBe(inputs[2])
	expect(after[1]).toBe(inputs[1])
	expect(inputs[2]!.value).toBe("typed")
	form.parentElement!.remove()
})

test("a typed input isn't given a target with another name", () => {
	const form = mount(`<form><input name="a"><input name="b"></form>`)
	const [typed, untouched] = form.querySelectorAll("input")
	typed!.value = "typed"

	morph(form, `<form><input name="b" class="x"><input name="z"></form>`, { preserveChanges: true })

	const after = form.querySelectorAll("input")
	expect(after[0]).toBe(untouched)
	expect(after[1]).not.toBe(typed)
	expect(after[1]!.value).toBe("")
	form.parentElement!.remove()
})

test("removing many of many identical inputs keeps the typed ones", () => {
	const form = mount(`<form>${"<input><p>x</p>".repeat(1500)}</form>`)
	const inputs = [...form.querySelectorAll("input")]
	inputs[10]!.value = "first"
	inputs[1200]!.value = "second"

	morph(form, `<form>${"<input><p>x</p>".repeat(700)}</form>`, { preserveChanges: true })

	const after = [...form.querySelectorAll("input")]
	expect(after).toHaveLength(700)
	expect(after.filter((input) => input.value)).toEqual([inputs[10], inputs[1200]])
	form.parentElement!.remove()
})
