import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// Without `moveBefore`, a move takes a modal dialog out of the top layer, and it stays open but stops being modal.
test("a modal dialog that the morph moves into a new wrapper stays modal", () => {
	const host = mount(`<div><dialog id="d">x</dialog></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()

	morph(host.firstElementChild!, `<div><section><dialog id="d">x</dialog></section></div>`, { preserveChanges: true })

	expect(host.querySelector("section > dialog")).toBe(dialog)
	expect(dialog.open).toBe(true)
	expect(dialog.matches(":modal")).toBe(true)

	dialog.close()
	host.remove()
})

test("a modal dialog whose wrapper the morph moves to another parent stays modal and keeps focus", () => {
	const host = mount(`<div><div id="a"><span id="w"><dialog><input value="hello"></dialog></span></div><div id="b"></div></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()
	const input = host.querySelector("input")!
	input.setSelectionRange(1, 3)

	morph(
		host.firstElementChild!,
		`<div><div id="a"></div><div id="b"><span id="w"><dialog open><input value="hello"></dialog></span></div></div>`,
	)

	expect(host.querySelector("#b dialog")).toBe(dialog)
	expect(dialog.matches(":modal")).toBe(true)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])

	dialog.close()
	host.remove()
})

test("a modal dialog that the morph moves leaves focus on the body when nothing was focused", () => {
	const host = mount(`<div><dialog id="d"><input></dialog></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()
	;(document.activeElement as HTMLElement).blur()

	morph(host.firstElementChild!, `<div><section><dialog id="d" open><input></dialog></section></div>`)

	expect(dialog.matches(":modal")).toBe(true)
	expect(document.activeElement).toBe(document.body)

	dialog.close()
	host.remove()
})

test("a modal dialog that the morph moves and the target closes ends up closed", () => {
	const host = mount(`<div><dialog id="d">x</dialog></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()

	morph(host.firstElementChild!, `<div><section><dialog id="d">x</dialog></section></div>`)

	expect(host.querySelector("section > dialog")).toBe(dialog)
	expect(dialog.open).toBe(false)
	expect(dialog.matches(":modal")).toBe(false)

	host.remove()
})

test("a dialog shown without being modal that the morph moves stays open and isn't made modal", () => {
	const host = mount(`<div><dialog id="d">x</dialog></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.show()

	morph(host.firstElementChild!, `<div><section><dialog id="d">x</dialog></section></div>`, { preserveChanges: true })

	expect(host.querySelector("section > dialog")).toBe(dialog)
	expect(dialog.open).toBe(true)
	expect(dialog.matches(":modal")).toBe(false)

	dialog.close()
	host.remove()
})

test("an item holding a modal dialog keeps it modal when the target reorders the list", () => {
	const host = mount(`<ul><li id="a"><dialog>x</dialog></li><li id="b">b</li><li id="c">c</li></ul>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()

	morph(host.firstElementChild!, `<ul><li id="b">b</li><li id="c">c</li><li id="a"><dialog open>x</dialog></li></ul>`)

	expect(host.querySelector("li:last-child > dialog")).toBe(dialog)
	expect(dialog.matches(":modal")).toBe(true)

	dialog.close()
	host.remove()
})

test("a modal dialog that morphInner moves into a new wrapper stays modal", () => {
	const host = mount(`<div><dialog id="d">x</dialog></div>`)
	const dialog = host.querySelector("dialog")!
	dialog.showModal()

	morphInner(host.firstElementChild!, `<div><section><dialog id="d" open>x</dialog></section></div>`)

	expect(host.querySelector("section > dialog")).toBe(dialog)
	expect(dialog.matches(":modal")).toBe(true)

	dialog.close()
	host.remove()
})

// Without `moveBefore`, a move also hides an open popover.
test("an open popover that the morph moves into a new wrapper stays open", () => {
	const host = mount(`<div><div id="p" popover="manual">x</div></div>`)
	const popover = host.querySelector<HTMLElement>("[popover]")!
	popover.showPopover()

	morph(host.firstElementChild!, `<div><section><div id="p" popover="manual">x</div></section></div>`)

	expect(host.querySelector("section > [popover]")).toBe(popover)
	expect(popover.matches(":popover-open")).toBe(true)

	popover.hidePopover()
	host.remove()
})

test("an open auto popover and the popover nested in it stay open when the morph moves them", () => {
	const host = mount(`<div><div id="p" popover>x<div id="q" popover>y</div></div></div>`)
	const [outer, inner] = host.querySelectorAll<HTMLElement>("[popover]")
	outer!.showPopover()
	inner!.showPopover()

	morph(host.firstElementChild!, `<div><section><div id="p" popover>x<div id="q" popover>y</div></div></section></div>`)

	expect(host.querySelector("section > #p")).toBe(outer)
	expect(outer!.matches(":popover-open")).toBe(true)
	expect(inner!.matches(":popover-open")).toBe(true)

	outer!.hidePopover()
	host.remove()
})

// Inserting a live target moves it without `moveBefore` in every browser.
test("a modal dialog in a live target that the morph inserts stays modal and keeps focus", () => {
	const host = mount(`<div></div><div><dialog><input value="hello"></dialog></div>`)
	const [from, to] = host.children
	const dialog = host.querySelector("dialog")!
	dialog.showModal()
	const input = host.querySelector("input")!
	input.setSelectionRange(1, 3)

	morph(from!, to!)

	expect(from!.querySelector("dialog")).toBe(dialog)
	expect(dialog.matches(":modal")).toBe(true)
	expect(document.activeElement).toBe(input)
	expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])

	dialog.close()
	host.remove()
})

test("open popovers in a live target that the morph inserts stay open, and focus outside it stays put", () => {
	const host = mount(
		`<input id="outside"><div></div><div><div popover="manual"><input autofocus></div><dialog popover="manual">x</dialog></div>`,
	)
	const [, from, to] = host.children
	const popovers = [...host.querySelectorAll<HTMLElement>("[popover]")]
	for (const popover of popovers) popover.showPopover()
	const outside = host.querySelector<HTMLInputElement>("#outside")!
	outside.focus()

	morph(from!, to!)

	expect([...from!.querySelectorAll("[popover]")]).toEqual(popovers)
	expect(popovers.map((popover) => popover.matches(":popover-open"))).toEqual([true, true])
	expect(document.activeElement).toBe(outside)

	for (const popover of popovers) popover.hidePopover()
	host.remove()
})

test("focus inside a shadow root outside a live target stays put when the morph shows the target's popover again", () => {
	const host = mount(`<div></div><div><div popover="manual"><input autofocus></div></div><span></span>`)
	const [from, to, shadowHost] = host.children
	const shadowInput = document.createElement("input")
	shadowHost!.attachShadow({ mode: "open" }).append(shadowInput)
	const popover = host.querySelector<HTMLElement>("[popover]")!
	popover.showPopover()
	shadowInput.focus()

	morph(from!, to!)

	expect(popover.matches(":popover-open")).toBe(true)
	expect(document.activeElement).toBe(shadowHost)
	expect(shadowHost!.shadowRoot!.activeElement).toBe(shadowInput)

	popover.hidePopover()
	host.remove()
})

test("focus that a handler sends elsewhere when the morph shows a live target's popover again stays there", () => {
	const host = mount(`<input id="a"><input id="b"><div></div><div><div popover="manual"><input autofocus></div></div>`)
	const [a, b, from, to] = host.children as unknown as Array<HTMLElement>
	const popover = host.querySelector<HTMLElement>("[popover]")!
	popover.showPopover()
	a!.focus()
	popover.querySelector("input")!.addEventListener("focus", () => b!.focus())

	morph(from!, to!)

	expect(popover.matches(":popover-open")).toBe(true)
	expect(document.activeElement).toBe(b)

	popover.hidePopover()
	host.remove()
})

test("a modal dialog in a live target that the morph inserts keeps the value of its open attribute", () => {
	const host = mount(`<div></div><div><dialog>x</dialog></div>`)
	const [from, to] = host.children
	const dialog = host.querySelector("dialog")!
	dialog.showModal()
	dialog.setAttribute("open", "yes")

	morph(from!, to!)

	expect(dialog.matches(":modal")).toBe(true)
	expect(dialog.getAttribute("open")).toBe("yes")

	dialog.close()
	host.remove()
})

test("a form shown as a popover stays open when a live target holding it is inserted, though a field shadows showPopover", () => {
	const host = mount(`<div></div><div><form popover="manual"><input name="showPopover"></form></div>`)
	const [from, to] = host.children
	const form = host.querySelector("form")!
	HTMLElement.prototype.showPopover.call(form)

	morph(from!, to!)

	expect(form.matches(":popover-open")).toBe(true)

	HTMLElement.prototype.hidePopover.call(form)
	host.remove()
})

test("an open popover in a live target that the morph inserts stays open while nothing is focused", () => {
	const host = mount(`<div></div><div><div popover="manual">x</div></div>`)
	const [from, to] = host.children
	const popover = host.querySelector<HTMLElement>("[popover]")!
	popover.showPopover()
	;(document.activeElement as HTMLElement).blur()

	morph(from!, to!)

	expect(from!.firstElementChild).toBe(popover)
	expect(popover.matches(":popover-open")).toBe(true)
	expect(document.activeElement).toBe(document.body)

	popover.hidePopover()
	host.remove()
})

test("a custom element that removes, shows or changes the top layer when a live target is inserted keeps its changes", () => {
	let armed = false
	customElements.define(
		"top-layer-meddler",
		class extends HTMLElement {
			connectedCallback() {
				if (!armed) return
				const parent = this.parentElement!
				parent.querySelector("#gone")!.remove()
				const shown = parent.querySelector<HTMLDialogElement>("#shown")!
				shown.close()
				shown.showModal()
				parent.querySelector("#plain")!.removeAttribute("popover")
			}
		},
	)
	const host = mount(
		`<div></div><div><section><dialog id="gone">a</dialog><dialog id="shown">b</dialog><div id="plain" popover="manual">c</div><top-layer-meddler></top-layer-meddler></section></div>`,
	)
	const [from, to] = host.children
	const [gone, shown] = host.querySelectorAll("dialog")
	gone!.showModal()
	shown!.showModal()
	host.querySelector<HTMLElement>("#plain")!.showPopover()
	armed = true

	morph(from!, to!)

	expect(gone!.isConnected).toBe(false)
	expect(gone!.matches(":modal")).toBe(false)
	expect(shown!.matches(":modal")).toBe(true)
	expect(from!.querySelector("#plain")!.matches(":popover-open")).toBe(false)

	shown!.close()
	host.remove()
})
