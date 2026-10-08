import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("dirty descendant textareas are flagged before morphing", () => {
	const from = document.createElement("div")
	const textarea = document.createElement("textarea")
	textarea.defaultValue = "before"
	textarea.value = "user edit"
	from.append(textarea)

	const to = document.createElement("div")
	const next = document.createElement("textarea")
	next.textContent = "after"
	to.append(next)

	morph(from, to)

	expect(from.firstElementChild?.nodeName).toBe("TEXTAREA")
	expect((from.firstElementChild as HTMLTextAreaElement).defaultValue).toBe("after")
	expect(from.firstElementChild?.hasAttribute("morphlex-dirty")).toBe(false)
})

test("a typed textarea with default text keeps its text when the target has one textarea of its name", () => {
	const host = document.createElement("div")
	host.innerHTML = `<div><textarea form="missing" name="t"></textarea><textarea name="t">l1\nl2</textarea></div>`
	document.body.append(host)
	const typed = host.querySelectorAll("textarea")[1]!
	typed.value = "typed"

	const template = document.createElement("template")
	template.innerHTML = `<div><textarea name="t" form="missing" class="x"></textarea></div>`
	morph(host.firstElementChild!, template.content.firstElementChild!, { preserveChanges: true })

	expect(host.querySelectorAll("textarea").length).toBe(1)
	expect(host.querySelector("textarea")).toBe(typed)
	expect(typed.value).toBe("typed")
	host.remove()
})
