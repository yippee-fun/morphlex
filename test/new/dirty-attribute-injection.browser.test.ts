import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphlex-dirty attribute in `to` does not leak into `from`", () => {
	const from = document.createElement("div")
	from.id = "x"

	// Hostile/buggy input includes morphlex-dirty on the target.
	const to = document.createElement("div")
	to.id = "x"
	to.setAttribute("morphlex-dirty", "")

	morph(from, to)

	expect(from.hasAttribute("morphlex-dirty")).toBe(false)
})

function editedInputMorph(rowId: string): HTMLInputElement {
	const from = document.createElement("div")
	from.className = "a"
	from.innerHTML = `<p${rowId}><input id="q" value="server"></p>`
	document.body.append(from)
	const input = from.querySelector("input")!
	input.value = "typed"

	const to = document.createElement("div")
	to.className = "b"
	to.innerHTML = `<p${rowId}><input id="q" value="server" morphlex-dirty></p>`

	morph(from, to)
	from.remove()
	return input
}

test("morphlex-dirty in `to` does not stop an edited input inside an id-matched element from being reset", () => {
	const input = editedInputMorph(' id="row"')

	expect(input.value).toBe("server")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphlex-dirty in `to` does not stop an edited input inside an unkeyed element from being reset", () => {
	const input = editedInputMorph("")

	expect(input.value).toBe("server")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})
