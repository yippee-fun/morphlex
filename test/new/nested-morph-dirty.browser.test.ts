import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function typedForm() {
	const host = document.createElement("div")
	host.innerHTML = `<form><input id="i" value="a"><input name="n" value="b"></form>`
	const form = host.firstElementChild!
	const [byId, byName] = form.querySelectorAll("input")
	byId!.value = "typed"
	byName!.value = "typed"
	return { form, byId: byId!, byName: byName! }
}

function nestedPreservingMorph(form: Element) {
	return (node: Node) => {
		if (node === form) {
			morphInner(form, `<form><input id="i" value="a"><input name="n" value="b"></form>`, { preserveChanges: true })
		}
		return true
	}
}

test("the outer morph resets inputs after a nested preserving morph clears their flags", () => {
	const { form, byId, byName } = typedForm()

	morph(form, `<form><input id="i" value="a"><input name="n" value="b"></form>`, {
		beforeNodeVisited: nestedPreservingMorph(form),
	})

	expect(byId.value).toBe("a")
	expect(byName.value).toBe("b")
})

test("a clobbered form is reset after a nested preserving morph clears the flags", () => {
	const { form, byId, byName } = typedForm()

	morph(form, `<form morphlex-clobber><input id="i" value="a"><input name="n" value="b"></form>`, {
		preserveChanges: true,
		beforeNodeVisited: nestedPreservingMorph(form),
	})

	expect(byId.value).toBe("a")
	expect(byName.value).toBe("b")
})

test("the outer morph resets an input whose flag a nested morph cleared before the parent was visited", () => {
	const host = document.createElement("div")
	host.innerHTML = `<div><p><input value="a"></p></div>`
	const root = host.firstElementChild!
	const paragraph = root.firstElementChild!
	const input = paragraph.querySelector("input")!
	input.value = "typed"

	morph(root, `<div><p><input value="a"></p></div>`, {
		beforeChildrenVisited(node) {
			if (node === root) morphInner(paragraph, `<p><input value="a"></p>`, { preserveChanges: true })
			return true
		},
	})

	expect(input.value).toBe("a")
})

test("the outer morph resets an input that a nested morph moved into a new wrapper", () => {
	const host = document.createElement("div")
	host.innerHTML = `<form><input id="i" value="a"></form>`
	const form = host.firstElementChild!
	const input = form.querySelector("input")!
	input.value = "typed"

	morph(form, `<form><div><input id="i" value="a"></div></form>`, {
		beforeNodeVisited(node) {
			if (node === form) morphInner(form, `<form><div><input id="i" value="a"></div></form>`, { preserveChanges: true })
			return true
		},
	})

	expect(form.querySelector("div > input")).toBe(input)
	expect(input.value).toBe("a")
})

test("the outer morph resets an input that a nested morph was rooted at", () => {
	const host = document.createElement("div")
	host.innerHTML = `<form><input id="i" value="a"></form>`
	const form = host.firstElementChild!
	const input = form.querySelector("input")!
	input.value = "typed"

	morph(form, `<form><input id="i" value="a"></form>`, {
		beforeChildrenVisited(node) {
			if (node === form) morph(input, `<input id="i" value="a">`, { preserveChanges: true })
			return true
		},
	})

	expect(input.value).toBe("a")
})

test("a nested morph doesn't put back a flag that no running morph set", () => {
	const host = document.createElement("div")
	host.innerHTML = `<div><p></p></div><section><input id="s" morphlex-dirty value="a"></section>`
	const root = host.firstElementChild!
	const section = host.lastElementChild!

	morph(root, `<div><p>new</p></div>`, {
		beforeNodeVisited(node) {
			if (node === root) morphInner(section, `<section><input id="s" value="a"></section>`)
			return true
		},
	})

	expect(section.querySelector("input")!.hasAttribute("morphlex-dirty")).toBe(false)
})

test("the outer morph resets an input after a morph from a callback while flagging cleared its flag", () => {
	let nested = false
	class FlagWatcher extends HTMLInputElement {
		static observedAttributes = ["morphlex-dirty"]
		attributeChangedCallback() {
			if (nested) return
			nested = true
			const typed = this.form!.querySelector<HTMLInputElement>("#a")!
			morph(typed, `<input id="a" value="a">`, { preserveChanges: true })
		}
	}
	customElements.define("x-flag-watcher", FlagWatcher, { extends: "input" })
	const host = document.createElement("div")
	host.innerHTML = `<form><input id="a" value="a"><input is="x-flag-watcher" id="b" value="b"></form>`
	const form = host.firstElementChild!
	const [typed, watcher] = form.querySelectorAll("input")
	typed!.value = "typed"
	watcher!.value = "typed"

	morph(form, `<form><input id="a" value="a"><input is="x-flag-watcher" id="b" value="b"></form>`)

	expect(typed!.value).toBe("a")
	expect(watcher!.value).toBe("b")
})

test("a nested morph leaves the flags it didn't clear as they are", () => {
	const host = document.createElement("div")
	host.innerHTML = `<form><input id="i" value="a"><p></p></form>`
	const form = host.firstElementChild!
	const input = form.querySelector("input")!
	const paragraph = form.querySelector("p")!
	input.value = "typed"
	const changes: Array<string | null> = []
	const observer = new MutationObserver((records) => changes.push(...records.map((record) => record.attributeName)))
	observer.observe(input, { attributes: true })

	morph(form, `<form><input id="i" value="a"><p></p></form>`, {
		beforeNodeVisited(node) {
			if (node === form) morphInner(paragraph, `<p>new</p>`)
			return true
		},
	})

	expect(observer.takeRecords().length + changes.length).toBe(2)
	observer.disconnect()
	expect(input.value).toBe("a")
})
