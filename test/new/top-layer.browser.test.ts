import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// Inserting a node takes it out of the top layer, so a modal dialog stops being modal and a popover closes.
// Safari has no `moveBefore`, so it still loses them.
const supportsMoveBefore = "moveBefore" in Element.prototype

test.skipIf(!supportsMoveBefore)("a modal dialog in a live target that the morph inserts stays modal and keeps focus", () => {
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

test.skipIf(!supportsMoveBefore)("an open popover in a live target that the morph inserts stays open", () => {
	const host = mount(`<div></div><div><div popover="manual">x</div></div>`)
	const [from, to] = host.children
	const popover = host.querySelector<HTMLElement>("[popover]")!
	popover.showPopover()

	morph(from!, to!)

	expect(from!.querySelector("[popover]")).toBe(popover)
	expect(popover.matches(":popover-open")).toBe(true)

	popover.hidePopover()
	host.remove()
})
