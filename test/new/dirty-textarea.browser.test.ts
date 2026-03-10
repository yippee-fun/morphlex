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
