import { expect, test } from "vitest"
import { morphInner } from "../../src/morphlex"

function editedTextArea(): HTMLTextAreaElement {
	const textarea = document.createElement("textarea")
	textarea.textContent = "old"
	textarea.value = "typed"
	document.body.append(textarea)
	return textarea
}

test("morphInner resets an edited textarea root to the target's text", () => {
	const textarea = editedTextArea()

	morphInner(textarea, "<textarea>new</textarea>")

	expect(textarea.defaultValue).toBe("new")
	expect(textarea.value).toBe("new")
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
	textarea.remove()
})

test("morphInner resets an edited textarea root whose text is unchanged", () => {
	const textarea = editedTextArea()

	morphInner(textarea, "<textarea>old</textarea>")

	expect(textarea.value).toBe("old")
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
	textarea.remove()
})

test("morphInner resets an edited textarea root before its afterChildrenVisited", () => {
	const textarea = editedTextArea()
	let valueAfterChildren: string | undefined

	morphInner(textarea, "<textarea>new</textarea>", {
		afterChildrenVisited: (node) => {
			if (node === textarea) valueAfterChildren = textarea.value
		},
	})

	expect(valueAfterChildren).toBe("new")
	textarea.remove()
})

test("morphInner keeps an edited textarea root's value with preserveChanges", () => {
	const textarea = editedTextArea()

	morphInner(textarea, "<textarea>new</textarea>", { preserveChanges: true })

	expect(textarea.defaultValue).toBe("new")
	expect(textarea.value).toBe("typed")
	textarea.remove()
})

test("morphInner resets an edited textarea root inside morphlex-clobber with preserveChanges", () => {
	const textarea = editedTextArea()

	morphInner(textarea, "<textarea morphlex-clobber>new</textarea>", { preserveChanges: true })

	expect(textarea.value).toBe("new")
	textarea.remove()
})

test("morphInner leaves an edited textarea root alone when beforeChildrenVisited vetoes", () => {
	const textarea = editedTextArea()

	morphInner(textarea, "<textarea>new</textarea>", { beforeChildrenVisited: () => false })

	expect(textarea.defaultValue).toBe("old")
	expect(textarea.value).toBe("typed")
	textarea.remove()
})

test("morphInner leaves an untouched textarea root's value following its text", () => {
	const textarea = document.createElement("textarea")
	textarea.textContent = "old"
	document.body.append(textarea)

	morphInner(textarea, "<textarea>new</textarea>")
	textarea.textContent = "later"

	expect(textarea.value).toBe("later")
	textarea.remove()
})
