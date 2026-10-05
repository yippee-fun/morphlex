import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host.firstElementChild as HTMLElement
}

function morphCountingMutations(from: Element, html: string): number {
	const template = document.createElement("template")
	template.innerHTML = html
	const observer = new MutationObserver(() => {})
	observer.observe(from, { subtree: true, childList: true, attributes: true })
	morph(from, template.content.firstElementChild!)
	const count = observer.takeRecords().length
	observer.disconnect()
	from.parentElement!.remove()
	return count
}

test("changing one of two identical siblings doesn't swap them", () => {
	const from = mount(`<div><p></p><ul></ul><p></p></div>`)
	const [first, , last] = from.children

	expect(morphCountingMutations(from, `<div><p class="x"></p><ul></ul><p></p></div>`)).toBe(1)
	expect(from.children[0]).toBe(first)
	expect(from.children[2]).toBe(last)
	expect(first!.className).toBe("x")
})

test("changing many of many identical siblings leaves them all in place", () => {
	const from = mount(`<ul>${"<li>a</li>".repeat(50)}</ul>`)
	const items = [...from.children]

	const html = `<ul>${Array.from({ length: 50 }, (_, i) => (i % 2 ? `<li class="x">a</li>` : "<li>a</li>")).join("")}</ul>`
	expect(morphCountingMutations(from, html)).toBe(25)
	expect([...from.children]).toEqual(items)
})

test("identical siblings keep their targets when putting them in order would move more nodes", () => {
	const from = mount(`<div><p></p><i></i><p></p><i></i></div>`)
	const [p1, i1, p2, i2] = from.children

	// Given in order, the first p would take the changed target and both i elements would move.
	expect(morphCountingMutations(from, `<div><i></i><p class="x"></p><i></i><p></p></div>`)).toBe(3)
	expect([...from.children]).toEqual([i1, p2, i2, p1])
	expect(p2!.className).toBe("x")
})

test("changing elements in two sets of identical siblings doesn't swap either set", () => {
	const from = mount(`<div><p></p><ul></ul><p></p><b></b><ol></ol><b></b></div>`)
	const children = [...from.children]

	expect(morphCountingMutations(from, `<div><p class="x"></p><ul></ul><p></p><b class="x"></b><ol></ol><b></b></div>`)).toBe(2)
	expect([...from.children]).toEqual(children)
})

test("identical siblings keep their targets when putting them in order would move text between them", () => {
	const from = mount(`<div><span></span>A<span></span>B</div>`)
	const [first, last] = from.children

	// Given in order, both text nodes would move rather than one span.
	expect(morphCountingMutations(from, `<div>A<span class="x"></span>B<span></span></div>`)).toBe(3)
	expect(from.children[0]).toBe(last)
	expect(from.children[1]).toBe(first)
})

test("identical siblings keep their targets when putting them in order would only move other elements", () => {
	const from = mount(`<div><p></p><p></p><i>2</i> <b>3</b></div>`)
	const [first, last] = from.children

	// Either way two elements move, but in order the whitespace would be replaced too.
	expect(morphCountingMutations(from, `<div><p class="x"></p><b>3</b><i>2</i> <p></p></div>`)).toBe(5)
	expect(from.children[0]).toBe(last)
	expect(from.children[3]).toBe(first)
})
