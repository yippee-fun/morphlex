import { expect, test } from "vitest"
import { morphInner } from "../../src/morphlex"

function shadowRoot(html: string): ShadowRoot {
	const host = document.createElement("div")
	document.body.append(host)
	const root = host.attachShadow({ mode: "open" })
	root.innerHTML = html
	return root
}

function fragment(html: string): DocumentFragment {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content
}

test("morphInner morphs a shadow root to a string of its content", () => {
	const root = shadowRoot(`<p>old</p>`)
	const p = root.firstElementChild

	morphInner(root, `<p>new</p><span>added</span>`)

	expect(root.innerHTML).toBe(`<p>new</p><span>added</span>`)
	expect(root.firstElementChild).toBe(p)
	root.host.remove()
})

test("morphInner morphs a shadow root to the children of a fragment", () => {
	const root = shadowRoot(`<p>old</p>`)
	const p = root.firstElementChild

	morphInner(root, fragment(`<p>new</p>`))

	expect(root.innerHTML).toBe(`<p>new</p>`)
	expect(root.firstElementChild).toBe(p)
	root.host.remove()
})

test("morphInner morphs a shadow root to the children of another shadow root", () => {
	const root = shadowRoot(`<p>old</p>`)
	const p = root.firstElementChild
	const target = shadowRoot(`<p>new</p>`)

	morphInner(root, target)

	expect(root.innerHTML).toBe(`<p>new</p>`)
	expect(root.firstElementChild).toBe(p)
	root.host.remove()
	target.host.remove()
})

test("morphInner moves elements with ids inside a shadow root", () => {
	const root = shadowRoot(`<div><input id="a"></div><section></section>`)
	const input = root.getElementById("a")

	morphInner(root, `<div></div><section><input id="a"></section>`)

	expect(root.innerHTML).toBe(`<div></div><section><input id="a"></section>`)
	expect(root.getElementById("a")).toBe(input)
	root.host.remove()
})

test("morphInner keeps what the user typed inside a shadow root with preserveChanges", () => {
	const root = shadowRoot(`<input name="q" value="a">`)
	const input = root.firstElementChild as HTMLInputElement
	input.value = "typed"

	morphInner(root, `<input name="q" value="b">`, { preserveChanges: true })

	expect(root.firstElementChild).toBe(input)
	expect(input.value).toBe("typed")
	expect(input.getAttribute("value")).toBe("b")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
	root.host.remove()
})

test("morphInner resets what the user typed inside a shadow root without preserveChanges", () => {
	const root = shadowRoot(`<input name="q" value="a">`)
	const input = root.firstElementChild as HTMLInputElement
	input.value = "typed"

	morphInner(root, `<input name="q" value="b">`)

	expect(root.firstElementChild).toBe(input)
	expect(input.value).toBe("b")
	root.host.remove()
})

test("morphInner keeps focus inside a shadow root", () => {
	const root = shadowRoot(`<input id="a"><p>1</p>`)
	const input = root.getElementById("a") as HTMLInputElement
	input.focus()

	morphInner(root, `<p>1</p><input id="a">`)

	expect(root.getElementById("a")).toBe(input)
	expect(root.activeElement).toBe(input)
	root.host.remove()
})

test("morphInner calls the root's callbacks for a shadow root", () => {
	const root = shadowRoot(`<p>old</p>`)
	const visited: Array<Node> = []

	morphInner(root, `<p>new</p>`, { afterChildrenVisited: (node) => visited.push(node) })

	expect(visited).toContain(root)
	root.host.remove()
})

test("morphInner refuses an element as the target of a shadow root", () => {
	const root = shadowRoot(`<p>old</p>`)

	expect(() => morphInner(root, document.createElement("div"))).toThrow(
		"[Morphlex] You can only do an inner morph of a shadow root with a fragment or a string.",
	)
	root.host.remove()
})

test("morphInner leaves a shadow root alone when its children's visit is vetoed", () => {
	const root = shadowRoot(`<p>old</p>`)
	const p = root.firstElementChild
	const visited: Array<Node> = []

	morphInner(root, `<p>new</p>`, {
		beforeChildrenVisited: (node) => node !== root,
		afterChildrenVisited: (node) => visited.push(node),
	})

	expect(root.innerHTML).toBe(`<p>old</p>`)
	expect(root.firstElementChild).toBe(p)
	expect(visited).toEqual([])
	root.host.remove()
})

test("morphInner opens the first open details of a group inside a shadow root", () => {
	const root = shadowRoot(`<details name="a"><summary>1</summary></details><details name="a"><summary>2</summary></details>`)

	morphInner(root, `<details name="a"><summary>1</summary></details><details name="a" open><summary>2</summary></details>`)

	expect(root.innerHTML).toBe(
		`<details name="a"><summary>1</summary></details><details name="a" open=""><summary>2</summary></details>`,
	)
	root.host.remove()
})
