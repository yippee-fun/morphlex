import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// Defines a custom element that moves itself into `portal` whenever it connects somewhere else, while `enabled` says so.
function defineTeleport(portal: HTMLElement, enabled: () => boolean): string {
	const name = `x-teleport-${Math.random().toString(36).slice(2)}`
	customElements.define(
		name,
		class extends HTMLElement {
			connectedCallback(): void {
				if (enabled() && this.parentNode !== portal) portal.append(this)
			}
		},
	)
	return name
}

test("siblings after a new element that moves itself when connected keep their order", () => {
	const portal = mount("")
	const name = defineTeleport(portal, () => true)
	const host = mount(`<div><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><${name}></${name}><span>new</span><p id="a"></p></div>`)

	expect(host.innerHTML).toBe(`<div><span>new</span><p id="a"></p></div>`)
	expect(portal.innerHTML).toBe(`<${name}></${name}>`)
	host.remove()
	portal.remove()
})

test("siblings after a new node that afterNodeAdded removes keep their order", () => {
	const host = mount(`<div><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><i></i><span>new</span><p id="a"></p></div>`, {
		afterNodeAdded: (node) => {
			if (node.nodeName === "I") (node as Element).remove()
		},
	})

	expect(host.innerHTML).toBe(`<div><span>new</span><p id="a"></p></div>`)
	host.remove()
})

test("siblings after a new node that afterNodeAdded moves to another parent keep their order", () => {
	const elsewhere = mount(`<b></b>`)
	const host = mount(`<div><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><i></i><span>new</span><p id="a"></p></div>`, {
		afterNodeAdded: (node) => {
			if (node.nodeName === "I") elsewhere.prepend(node)
		},
	})

	expect(host.innerHTML).toBe(`<div><span>new</span><p id="a"></p></div>`)
	expect(elsewhere.innerHTML).toBe(`<i></i><b></b>`)
	host.remove()
	elsewhere.remove()
})

test("siblings after a reordered element that moves itself when connected keep their order", () => {
	const portal = mount("")
	let enabled = false
	const name = defineTeleport(portal, () => enabled)
	const host = mount(`<div><span>a</span><span>b</span><${name}></${name}></div>`)
	enabled = true

	morph(host.firstElementChild!, `<div><${name}></${name}><em>new</em><span>a</span><span>b</span></div>`)

	expect(host.innerHTML).toBe(`<div><em>new</em><span>a</span><span>b</span></div>`)
	expect(portal.innerHTML).toBe(`<${name}></${name}>`)
	host.remove()
	portal.remove()
})

test("a new node can remove the sibling after it when it's added", () => {
	const host = mount(`<div><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><i></i><span>new</span><p id="a"></p></div>`, {
		afterNodeAdded: (node) => {
			if (node.nodeName === "I") host.querySelector("p")!.remove()
		},
	})

	expect(host.innerHTML).toBe(`<div><i></i><span>new</span></div>`)
	host.remove()
})

test("a new node that moves itself and removes the node it was added before keeps the rest in order", () => {
	const elsewhere = mount("")
	const host = mount(`<div><b></b><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><b></b><i></i><span>new</span><em>new</em><p id="a"></p></div>`, {
		afterNodeAdded: (node) => {
			if (node.nodeName !== "I") return
			elsewhere.append(node)
			host.querySelector("p")!.remove()
		},
	})

	expect(host.innerHTML).toBe(`<div><b></b><span>new</span><em>new</em></div>`)
	expect(elsewhere.innerHTML).toBe(`<i></i>`)
	host.remove()
	elsewhere.remove()
})

test("a new first node that moves itself and removes the node it was added before keeps the rest in order", () => {
	const elsewhere = mount("")
	const host = mount(`<div><p id="a"></p></div>`)

	morph(host.firstElementChild!, `<div><i></i><span>new</span><em>new</em><p id="a"></p></div>`, {
		afterNodeAdded: (node) => {
			if (node.nodeName !== "I") return
			elsewhere.append(node)
			host.querySelector("p")!.remove()
		},
	})

	expect(host.innerHTML).toBe(`<div><span>new</span><em>new</em></div>`)
	expect(elsewhere.innerHTML).toBe(`<i></i>`)
	host.remove()
	elsewhere.remove()
})
