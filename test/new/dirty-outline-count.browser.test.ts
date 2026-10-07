import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host.firstElementChild as HTMLElement
}

test("typed input stays when the other target with its outline has another name", () => {
	const root = mount(`<div><input name="a"><input name="a"></div>`)
	const typed = root.children[1] as HTMLInputElement
	typed.value = "typed"

	morph(root, `<div><input name="a" class="x"><input name="b"></div>`, { preserveChanges: true })

	expect(root.children[0]).toBe(typed)
	expect(typed.value).toBe("typed")
	expect(typed.className).toBe("x")
	root.parentElement!.remove()
})

test("typed input stays when a target with another name comes first", () => {
	const root = mount(`<div><input name="a"><input name="a"></div>`)
	const typed = root.children[1] as HTMLInputElement
	typed.value = "typed"

	morph(root, `<div><input name="b"><input name="a" class="x"></div>`, { preserveChanges: true })

	expect(root.children[1]).toBe(typed)
	expect(typed.value).toBe("typed")
	root.parentElement!.remove()
})

test("typed textarea stays when the other target with its outline has another name", () => {
	const root = mount(`<div><textarea name="a"></textarea><textarea name="a"></textarea></div>`)
	const typed = root.children[1] as HTMLTextAreaElement
	typed.value = "typed"

	morph(root, `<div><textarea name="a" class="x"></textarea><textarea name="b"></textarea></div>`, {
		preserveChanges: true,
	})

	expect(root.children[0]).toBe(typed)
	expect(typed.value).toBe("typed")
	root.parentElement!.remove()
})

test("typed inputs keep their order when every target with their outline can be taken", () => {
	const root = mount(`<div><input name="a"><input name="a"><input name="a"></div>`)
	const [first, second, third] = root.querySelectorAll("input")
	second!.value = "typed"

	morph(root, `<div><input name="a" class="x"><input name="a" class="x"><input name="a" class="x"><input name="b"></div>`, {
		preserveChanges: true,
	})

	const inputs = root.querySelectorAll("input")
	expect(inputs[0]).toBe(first)
	expect(inputs[1]).toBe(second)
	expect(inputs[2]).toBe(third)
	expect(second!.value).toBe("typed")
	root.parentElement!.remove()
})

test("typed input stays when two targets can only be taken by the same other input", () => {
	const root = mount(`<div><input name="a"><input name="a"><input name="b"></div>`)
	const typed = root.children[1] as HTMLInputElement
	typed.value = "typed"

	morph(root, `<div><input name="b" class="x"><input name="b" class="y"><input name="a" class="z"></div>`, {
		preserveChanges: true,
	})

	expect(root.children[2]).toBe(typed)
	expect(typed.value).toBe("typed")
	root.parentElement!.remove()
})
