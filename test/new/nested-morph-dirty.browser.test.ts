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
