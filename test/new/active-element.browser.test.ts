import { describe, expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

describe("active element preservation", () => {
	test("applies focused input attribute updates immediately", () => {
		const input = dom('<input type="text" value="hello world">') as HTMLInputElement
		document.body.appendChild(input)

		input.focus()
		input.setSelectionRange(2, 5)

		const next = dom('<input type="text" value="server value" class="new">') as HTMLInputElement

		morph(input, next, { preserveChanges: false })

		expect(document.activeElement).toBe(input)
		expect(input.value).toBe("server value")
		expect(input.getAttribute("value")).toBe("server value")
		expect(input.className).toBe("new")

		input.remove()
	})

	test("does not defer focused descendant updates until blur", () => {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = '<input id="name" value="hello" class="old"><button id="next">next</button>'
		document.body.appendChild(wrapper)

		const input = wrapper.querySelector("#name") as HTMLInputElement
		const nextButton = wrapper.querySelector("#next") as HTMLButtonElement

		input.value = "user typed"
		input.focus()

		const targetWrapper = document.createElement("div")
		targetWrapper.innerHTML = '<input id="name" value="server" class="new"><button id="next">next</button>'

		morph(wrapper, targetWrapper, { preserveChanges: false })

		expect(input.value).toBe("server")
		expect(input.defaultValue).toBe("server")
		expect(input.className).toBe("new")

		nextButton.focus()

		expect(input.value).toBe("server")
		expect(input.defaultValue).toBe("server")
		expect(input.getAttribute("value")).toBe("server")
		expect(input.className).toBe("new")

		wrapper.remove()
	})

	test("replaces active contenteditable element", () => {
		const parent = document.createElement("div")
		const from = document.createElement("div")
		from.contentEditable = "true"
		from.textContent = "user text"
		parent.appendChild(from)
		document.body.appendChild(parent)

		from.focus()

		const to = document.createElement("p")
		to.textContent = "server text"

		morph(from, to)

		expect(parent.firstElementChild).toBe(to)
		expect(to.textContent).toBe("server text")

		parent.remove()
	})

	test("updates focused input when preserveChanges is disabled", () => {
		const input = dom('<input type="text" value="hello world">') as HTMLInputElement
		document.body.appendChild(input)

		input.focus()

		const next = dom('<input type="text" value="server value">') as HTMLInputElement

		morph(input, next, { preserveChanges: false })

		expect(input.value).toBe("server value")

		input.remove()
	})

	test("allows moving active element while reordering", () => {
		const from = document.createElement("div")
		from.innerHTML = '<input id="active"><p id="sibling">A</p>'
		document.body.appendChild(from)

		const active = from.querySelector("#active") as HTMLInputElement
		active.focus()

		const to = document.createElement("div")
		to.innerHTML = '<p id="sibling">A</p><input id="active">'

		morph(from, to)

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

		morph(from, to, { preserveChanges: false })

		expect(host.firstElementChild?.tagName).toBe("SECTION")
		expect((host.querySelector("#active") as HTMLInputElement).value).toBe("server")

		host.remove()
	})
})
