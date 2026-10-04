import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("preserveChanges still adds other attributes to a closed details", () => {
	const from = document.createElement("details")
	const to = document.createElement("details")
	to.className = "x"

	morph(from, to, { preserveChanges: true })

	expect(from.className).toBe("x")
	expect(from.open).toBe(false)
})

test("preserveChanges still removes other attributes from a details", () => {
	const from = document.createElement("details")
	from.className = "x"
	const to = document.createElement("details")

	morph(from, to, { preserveChanges: true })

	expect(from.hasAttribute("class")).toBe(false)
})

// happy-dom can't read a parsed attribute whose name has a colon by its local name.
function readsColonAttributes(): boolean {
	const element = document.createElement("div")
	element.innerHTML = `<p foo:bar="1"></p>`
	return element.firstElementChild!.getAttributeNS(null, "foo:bar") === "1"
}

test.skipIf(!readsColonAttributes())("an attribute with a colon in its name and no namespace is updated", () => {
	const from = document.createElement("div")
	from.innerHTML = `<p foo:bar="1"></p>`
	const to = document.createElement("div")
	to.innerHTML = `<p foo:bar="2"></p>`

	morph(from, to)

	expect(from.firstElementChild!.getAttribute("foo:bar")).toBe("2")
})

test("removing another attribute from an open dialog leaves it open", () => {
	const from = document.createElement("dialog")
	from.className = "x"
	from.setAttribute("open", "")
	const to = document.createElement("dialog")
	to.setAttribute("open", "")

	morph(from, to)

	expect(from.hasAttribute("class")).toBe(false)
	expect(from.open).toBe(true)
})

test("removing a namespaced attribute called open from a dialog removes just that attribute", () => {
	const from = document.createElement("dialog")
	from.setAttribute("open", "")
	from.setAttributeNS("urn:x", "open", "")
	const to = document.createElement("dialog")
	to.setAttribute("open", "")

	morph(from, to)

	expect(from.hasAttributeNS("urn:x", "open")).toBe(false)
	expect(from.open).toBe(true)
})

test("a vetoed selected attribute keeps the select on the markup's old choice", () => {
	const from = document.createElement("div")
	from.innerHTML = `<select id="s"><option value="a" selected>A</option><option value="b">B</option></select>`
	const select = from.querySelector("select")!
	const to = document.createElement("div")
	to.innerHTML = `<select id="s"><option value="a">A</option><option value="b" selected>B</option></select>`

	morph(from, to, {
		beforeAttributeUpdated: (_element, name) => name !== "selected",
	})

	expect(from.querySelector("select")).toBe(select)
	expect(select.value).toBe("a")
})

test("a file input with a value attribute in the markup morphs without touching its value", () => {
	const from = document.createElement("div")
	from.innerHTML = `<input type="file" name="f">`
	const to = document.createElement("div")
	to.innerHTML = `<input type="file" name="f" value="x">`

	expect(() => morph(from, to)).not.toThrow()
	expect((from.firstElementChild as HTMLInputElement).value).toBe("")
})

test("an option the user deselected in a multiple select is selected again when the markup selects it", () => {
	const from = document.createElement("div")
	from.innerHTML = `<select id="s" multiple><option value="a" selected>A</option><option value="b">B</option></select>`
	const select = from.querySelector("select")!
	select.options[0]!.selected = false
	const to = document.createElement("div")
	to.innerHTML = `<select id="s" multiple><option value="a" selected>A</option><option value="b">B</option></select>`

	morph(from, to)

	expect(select.options[0]!.selected).toBe(true)
	expect(select.options[1]!.selected).toBe(false)
})

test("morphing an element that isn't a form control adds no selected property", () => {
	const from = document.createElement("p")
	from.className = "a"
	const to = document.createElement("p")
	to.className = "b"

	morph(from, to)

	expect(Object.hasOwn(from, "selected")).toBe(false)
	expect(Object.hasOwn(from, "checked")).toBe(false)
})

test("morphing a textarea whose text is unchanged keeps its text node", () => {
	const from = document.createElement("textarea")
	from.className = "a"
	from.textContent = "text"
	const text = from.firstChild
	const to = document.createElement("textarea")
	to.className = "b"
	to.textContent = "text"

	morph(from, to)

	expect(from.firstChild).toBe(text)
	expect(from.className).toBe("b")
})

test("morphing an option inside a multiple select applies the markup's new selection to the select", () => {
	const select = document.createElement("select")
	select.multiple = true
	select.innerHTML = `<option value="a">A</option><option value="b">B</option>`
	select.options[0]!.selected = true
	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"
	to.setAttribute("selected", "")

	morph(select.options[1]!, to)

	expect(select.options[0]!.selected).toBe(false)
	expect(select.options[1]!.selected).toBe(true)
})

test("morphing an option the markup selects brings back the selection the user moved away", () => {
	const select = document.createElement("select")
	select.innerHTML = `<option value="a">A</option><option value="b" selected>B</option>`
	select.value = "a"
	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"
	to.setAttribute("selected", "")

	morph(select.options[1]!, to)

	expect(select.value).toBe("b")
})

test("morphing an option that adds to a multiple select's markup selection applies the whole selection", () => {
	const select = document.createElement("select")
	select.multiple = true
	select.innerHTML = `<option value="a" selected>A</option><option value="b">B</option>`
	select.options[0]!.selected = false
	const to = document.createElement("option")
	to.value = "b"
	to.textContent = "B"
	to.setAttribute("selected", "")

	morph(select.options[1]!, to)

	expect(select.options[0]!.selected).toBe(true)
	expect(select.options[1]!.selected).toBe(true)
})
