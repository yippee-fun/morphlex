import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("typed text stays in its row when an earlier identical row has morphlex-clobber", () => {
	const host = document.createElement("div")
	host.innerHTML = `<form><div><input class="q"><p>x</p></div><div><input class="q"></div><div><input class="q"><p>x</p></div><p>old</p><div><input class="q"><p>x</p></div><div><input class="q"><p>x</p></div></form>`
	document.body.append(host)
	const form = host.firstElementChild as HTMLFormElement
	const inputs = [...form.querySelectorAll("input")]
	inputs[2]!.value = "typed 2"
	inputs[4]!.value = "typed 4"

	morph(
		form,
		`<form><div morphlex-clobber class="changed"><input class="q"><p>x</p></div><div class="changed"><input class="q"></div><div class="changed"><input class="q"><p>x</p></div><div><input class="q"><p>x</p></div><div><input class="q"><p>x</p></div></form>`,
		{ preserveChanges: true },
	)

	const after = [...form.querySelectorAll("input")]
	expect(after.map((input) => input.value)).toEqual(["", "", "typed 2", "", "typed 4"])
	expect(after[2]).toBe(inputs[2])
	expect(after[4]).toBe(inputs[4])
	host.remove()
})

test("typed rows of two kinds keep their order when untouched rows of both kinds go", () => {
	const host = document.createElement("div")
	host.innerHTML = `<form><div><input class="q"></div>\n<div><input class="q"></div>\n<input name="t[]">\n<div><input class="q"></div>\n<input name="t[]">\n<p>old</p>\n<input name="t[]"></form>`
	document.body.append(host)
	const form = host.firstElementChild as HTMLFormElement
	const inputs = [...form.querySelectorAll("input")]
	inputs[1]!.value = "typed 1"
	inputs[4]!.value = "typed 4"

	morph(
		form,
		`<form><div class="changed"><input class="q"></div>\n<input name="t[]" class="changed">\n<div><input class="q"></div>\n<p>new</p>\n<input name="t[]" class="changed"></form>`,
		{ preserveChanges: true },
	)

	const typed = [...form.querySelectorAll("input")].filter((input) => input.value)
	expect(typed).toEqual([inputs[1], inputs[4]])
	host.remove()
})
