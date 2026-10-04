import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphing a typed textarea into the same markup resets its value", () => {
	const textarea = document.createElement("textarea")
	textarea.textContent = "markup"
	textarea.value = "typed"

	const to = document.createElement("textarea")
	to.textContent = "markup"

	morph(textarea, to)

	expect(textarea.value).toBe("markup")
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphing a typed textarea into the same markup keeps its value with preserveChanges", () => {
	const textarea = document.createElement("textarea")
	textarea.textContent = "markup"
	textarea.value = "typed"

	const to = document.createElement("textarea")
	to.textContent = "markup"

	morph(textarea, to, { preserveChanges: true })

	expect(textarea.value).toBe("typed")
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphing a typed textarea inside a parent into the same markup resets its value", () => {
	const from = document.createElement("div")
	from.innerHTML = `<textarea name="note">markup</textarea>`
	const textarea = from.firstElementChild as HTMLTextAreaElement
	textarea.value = "typed"

	const to = document.createElement("div")
	to.innerHTML = `<textarea name="note">markup</textarea>`

	morph(from, to)

	expect(from.firstElementChild).toBe(textarea)
	expect(textarea.value).toBe("markup")
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
})

test("an untouched textarea inside a parent is not visited when the markup is the same", () => {
	const from = document.createElement("div")
	from.innerHTML = `<textarea name="note">markup</textarea>`

	const to = document.createElement("div")
	to.innerHTML = `<textarea name="note">markup</textarea>`

	const visited: Array<Node> = []
	morph(from, to, {
		beforeNodeVisited: (node) => {
			visited.push(node)
			return true
		},
	})

	expect(visited).toEqual([])
})

test("the dirty marker never reaches attribute callbacks", () => {
	const from = document.createElement("div")
	from.innerHTML = `<input name="a" value="markup"><textarea name="b">markup</textarea>`
	const input = from.querySelector("input")!
	const textarea = from.querySelector("textarea")!
	input.value = "typed"
	textarea.value = "typed"

	const to = document.createElement("div")
	to.innerHTML = `<input name="a" value="markup" class="x"><textarea name="b" class="x">markup</textarea>`

	const names: Array<string> = []
	morph(from, to, {
		beforeAttributeUpdated: (_element, name) => {
			names.push(name)
			return true
		},
		afterAttributeUpdated: (_element, name) => {
			names.push(name)
		},
	})

	expect(names).toEqual(["class", "class", "class", "class"])
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
	expect(textarea.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphing a picked option into the same markup resets the pick", () => {
	const select = document.createElement("select")
	select.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`
	const option = select.options[1]!
	option.selected = true

	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"

	morph(option, to)

	expect(select.value).toBe("a")
	expect(option.hasAttribute("morphlex-dirty")).toBe(false)
})

test("morphing a picked option into the same markup keeps the pick with preserveChanges", () => {
	const select = document.createElement("select")
	select.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`
	const option = select.options[1]!
	option.selected = true

	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"

	morph(option, to, { preserveChanges: true })

	expect(select.value).toBe("b")
	expect(option.hasAttribute("morphlex-dirty")).toBe(false)
})

test("an untouched root textarea is not visited when the markup is the same", () => {
	const textarea = document.createElement("textarea")
	textarea.textContent = "markup"

	const to = document.createElement("textarea")
	to.textContent = "markup"

	const visited: Array<Node> = []
	morph(textarea, to, {
		beforeNodeVisited: (node) => {
			visited.push(node)
			return true
		},
	})

	expect(visited).toEqual([])
})

test("an untouched root option is not visited when the markup is the same", () => {
	const select = document.createElement("select")
	select.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`

	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"

	const visited: Array<Node> = []
	morph(select.options[1]!, to, {
		beforeNodeVisited: (node) => {
			visited.push(node)
			return true
		},
	})

	expect(visited).toEqual([])
})
