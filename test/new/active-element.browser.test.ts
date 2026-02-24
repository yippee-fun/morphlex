import { describe, expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

describe("active element preservation", () => {
	test("preserves focus and caret when preserveActiveElement is enabled", () => {
		const input = document.createElement("input")
		input.type = "text"
		input.value = "hello world"
		document.body.appendChild(input)

		input.focus()
		input.setSelectionRange(2, 5)

		const next = document.createElement("input")
		next.type = "text"
		next.value = "server value"

		morph(input, next, { preserveActiveElement: true, preserveChanges: false })

		expect(document.activeElement).toBe(input)
		expect(input.value).toBe("hello world")
		expect(input.selectionStart).toBe(2)
		expect(input.selectionEnd).toBe(5)

		input.remove()
	})

	test("updates focused input when preserveActiveElement is disabled", () => {
		const input = dom('<input type="text" value="hello world">') as HTMLInputElement
		document.body.appendChild(input)

		input.focus()

		const next = dom('<input type="text" value="server value">') as HTMLInputElement

		morph(input, next, { preserveActiveElement: false, preserveChanges: false })

		expect(input.value).toBe("server value")

		input.remove()
	})

	test("preserves active contenteditable element", () => {
		const from = document.createElement("div")
		from.contentEditable = "true"
		from.textContent = "user text"
		document.body.appendChild(from)

		from.focus()

		const to = document.createElement("div")
		to.contentEditable = "true"
		to.textContent = "server text"

		morph(from, to, { preserveActiveElement: true })

		expect(document.activeElement).toBe(from)
		expect(from.textContent).toBe("user text")

		from.remove()
	})

	test("does not move active element while reordering", () => {
		const from = document.createElement("div")
		from.innerHTML = '<input id="active"><p id="sibling">A</p>'
		document.body.appendChild(from)

		const active = from.querySelector("#active") as HTMLInputElement
		active.focus()

		const to = document.createElement("div")
		to.innerHTML = '<p id="sibling">A</p><input id="active">'

		morph(from, to, { preserveActiveElement: true })

		expect(from.querySelector("#active")).toBe(active)
		expect(document.activeElement).toBe(active)

		from.remove()
	})
})
