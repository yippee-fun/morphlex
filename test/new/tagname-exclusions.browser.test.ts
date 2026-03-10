import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("elements with unmatched id are not matched by tag name", () => {
	const a = dom(`<div><p id="a">old</p></div>`)
	const b = dom(`<div><p id="b">new</p></div>`)

	const original = a.children[0]!

	morph(a, b)

	// The <p> has an id that didn't match any candidate, so it should be
	// inserted as new rather than morphed into the existing <p>
	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.id).toBe("b")
	expect(a.children[0]!.textContent).toBe("new")
})

test("elements with unmatched name attribute are not matched by tag name", () => {
	const a = dom(`<div><a name="old-anchor">old</a></div>`)
	const b = dom(`<div><a name="new-anchor">new</a></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.getAttribute("name")).toBe("new-anchor")
})

test("elements with unmatched href attribute are not matched by tag name", () => {
	const a = dom(`<div><a href="/old">old</a></div>`)
	const b = dom(`<div><a href="/new">new</a></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.getAttribute("href")).toBe("/new")
})

test("elements with unmatched src attribute are not matched by tag name", () => {
	const a = dom(`<div><img src="/old.png"></div>`)
	const b = dom(`<div><img src="/new.png"></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.getAttribute("src")).toBe("/new.png")
})

test("input elements are not matched by tag name", () => {
	const a = dom(`<div><input type="text" class="old"></div>`)
	const b = dom(`<div><input type="text" class="new"></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.className).toBe("new")
})

test("textarea elements are not matched by tag name", () => {
	const a = dom(`<div><textarea class="old">old</textarea></div>`)
	const b = dom(`<div><textarea class="new">new</textarea></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.className).toBe("new")
})

test("select elements are not matched by tag name", () => {
	const a = dom(`<div><select class="old"><option>A</option></select></div>`)
	const b = dom(`<div><select class="new"><option>B</option></select></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.className).toBe("new")
})

test("from-side candidates with distinguishing attributes are not matched by tag name", () => {
	// A bare <p> in the "to" tree should not match a <p name="x"> in the "from" tree
	const a = dom(`<div><p name="x">old</p></div>`)
	const b = dom(`<div><p>new</p></div>`)

	const original = a.children[0]!

	morph(a, b)

	expect(a.children[0]).not.toBe(original)
	expect(a.children[0]!.textContent).toBe("new")
})

test("from-side input candidates are not matched by tag name", () => {
	// A bare <span> should not be blocked, but an <input> candidate should be skipped
	const a = dom(`<div><input type="text" class="old"><span class="old">old</span></div>`)
	const b = dom(`<div><span class="new">new</span></div>`)

	const span = a.children[1]!

	morph(a, b)

	// The span should be reused via tag name matching
	expect(a.children[0]).toBe(span)
	expect(a.children[0]!.textContent).toBe("new")
})

test("elements with descendant IDs are not matched by tag name", () => {
	const a = dom(`<div><ul><li id="a">A</li></ul></div>`)
	const b = dom(`<div><ul><li id="b">B</li></ul></div>`)

	const originalUl = a.children[0]!

	morph(a, b)

	// The <ul> has descendant IDs that didn't overlap, so it should not
	// be reused via tag name matching
	expect(a.children[0]).not.toBe(originalUl)
})

test("plain elements without distinguishing attributes still match by tag name", () => {
	const a = dom(`<div><p class="old">old</p></div>`)
	const b = dom(`<div><p class="new">new</p></div>`)

	const original = a.children[0]!

	morph(a, b)

	// No id, no name/href/src, not a form control, no descendant IDs
	// — should still match by tag name and be reused
	expect(a.children[0]).toBe(original)
	expect(a.children[0]!.className).toBe("new")
	expect(a.children[0]!.textContent).toBe("new")
})

test("input elements with matching name attributes are still reused", () => {
	const a = dom(`<form><input name="email" type="text" value="old"></form>`)
	const b = dom(`<form><input name="email" type="text" value="new"></form>`)

	const original = a.children[0]!

	morph(a, b)

	// Input has a name attribute that matches — should be reused via heuristic matching
	expect(a.children[0]).toBe(original)
})

test("input elements with matching id are still reused", () => {
	const a = dom(`<form><input id="email" type="text" value="old"></form>`)
	const b = dom(`<form><input id="email" type="text" value="new"></form>`)

	const original = a.children[0]!

	morph(a, b)

	// Input has an id that matches — should be reused via id matching
	expect(a.children[0]).toBe(original)
})

test.skipIf(!("attachInternals" in HTMLElement.prototype))(
	"form-associated custom elements in the from-side are not matched by tag name",
	() => {
		class MyControl extends HTMLElement {
			static formAssociated = true
			constructor() {
				super()
				this.attachInternals()
			}
		}
		if (!customElements.get("my-control")) {
			customElements.define("my-control", MyControl)
		}

		const a = document.createElement("div")
		const control = document.createElement("my-control")
		control.setAttribute("class", "old")
		a.appendChild(control)

		const b = dom(`<div><my-control class="new"></my-control></div>`)

		morph(a, b)

		// The from-side custom element is form-associated, so it should not
		// be matched by tag name — it should be replaced
		expect(a.children[0]).not.toBe(control)
		expect(a.children[0]!.className).toBe("new")
	},
)

test.skipIf(!("attachInternals" in HTMLElement.prototype))(
	"non-form-associated custom elements are still matched by tag name",
	() => {
		class MyWidget extends HTMLElement {}
		if (!customElements.get("my-widget")) {
			customElements.define("my-widget", MyWidget)
		}

		const a = document.createElement("div")
		const widget = document.createElement("my-widget")
		widget.setAttribute("class", "old")
		a.appendChild(widget)

		const b = dom(`<div><my-widget class="new"></my-widget></div>`)

		morph(a, b)

		// Non-form-associated custom element — should still match by tag name
		expect(a.children[0]).toBe(widget)
		expect(a.children[0]!.className).toBe("new")
	},
)
