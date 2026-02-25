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

	test("applies queued active element updates on blur without changing input value", () => {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = '<input id="name" value="hello" class="old"><button id="next">next</button>'
		document.body.appendChild(wrapper)

		const input = wrapper.querySelector("#name") as HTMLInputElement
		const nextButton = wrapper.querySelector("#next") as HTMLButtonElement

		input.value = "user typed"
		input.focus()

		const targetWrapper = document.createElement("div")
		targetWrapper.innerHTML = '<input id="name" value="server" class="new"><button id="next">next</button>'

		morph(wrapper, targetWrapper, { preserveActiveElement: true, preserveChanges: false })

		expect(input.value).toBe("user typed")
		expect(input.defaultValue).toBe("hello")
		expect(input.className).toBe("old")

		nextButton.focus()

		expect(input.value).toBe("user typed")
		expect(input.defaultValue).toBe("server")
		expect(input.getAttribute("value")).toBe("server")
		expect(input.className).toBe("new")

		wrapper.remove()
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

	test("allows moving active element while reordering", () => {
		const from = document.createElement("div")
		from.innerHTML = '<input id="active"><p id="sibling">A</p>'
		document.body.appendChild(from)

		const active = from.querySelector("#active") as HTMLInputElement
		active.focus()

		const to = document.createElement("div")
		to.innerHTML = '<p id="sibling">A</p><input id="active">'

		morph(from, to, { preserveActiveElement: true })

		expect(from.querySelector("#active")).toBe(active)
		expect(from.firstElementChild?.id).toBe("sibling")
		expect(from.lastElementChild?.id).toBe("active")
		expect(document.activeElement).toBe(active)

		from.remove()
	})

	test("allows replacing an ancestor that contains the active element", () => {
		const host = document.createElement("div")
		const from = document.createElement("div")
		from.innerHTML = '<input id="active" value="hello"><span>old</span>'
		host.appendChild(from)
		document.body.appendChild(host)

		const active = from.querySelector("#active") as HTMLInputElement
		active.focus()

		const to = document.createElement("section")
		to.innerHTML = '<input id="active" value="server"><span>new</span>'

		morph(from, to, { preserveActiveElement: true, preserveChanges: false })

		expect(host.firstElementChild?.tagName).toBe("SECTION")
		expect((host.querySelector("#active") as HTMLInputElement).value).toBe("server")

		host.remove()
	})
})
