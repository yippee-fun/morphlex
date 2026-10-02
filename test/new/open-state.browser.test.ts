import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

function mount(html: string): HTMLElement {
	const element = dom(html)
	document.body.append(element)
	return element
}

test("preserveChanges keeps a details element the user opened", () => {
	const from = mount(`<div><details><summary>Summary</summary>Body</details></div>`)
	const details = from.querySelector("details")!
	details.open = true

	morph(from, `<div><details><summary>Summary</summary>Body</details></div>`, { preserveChanges: true })

	expect(details.open).toBe(true)
	from.remove()
})

test("preserveChanges keeps a details element the user closed", () => {
	const from = mount(`<div><details open><summary>Summary</summary>Body</details></div>`)
	const details = from.querySelector("details")!
	details.open = false

	morph(from, `<div><details open><summary>Summary</summary>Body</details></div>`, { preserveChanges: true })

	expect(details.open).toBe(false)
	from.remove()
})

test("details follows the markup without preserveChanges", () => {
	const from = mount(`<div><details><summary>Summary</summary>Body</details></div>`)
	const details = from.querySelector("details")!
	details.open = true

	morph(from, `<div><details><summary>Summary</summary>Body</details></div>`)
	expect(details.open).toBe(false)

	morph(from, `<div><details open><summary>Summary</summary>Body</details></div>`)
	expect(details.open).toBe(true)
	from.remove()
})

test("preserveChanges keeps a modal dialog open", () => {
	const from = mount(`<div><dialog>Dialog</dialog></div>`)
	const dialog = from.querySelector("dialog")!
	dialog.showModal()

	morph(from, `<div><dialog>Dialog</dialog></div>`, { preserveChanges: true })

	expect(dialog.open).toBe(true)
	dialog.close()
	from.remove()
})

test("removing open from a modal dialog closes it properly", async () => {
	const from = mount(`<div><dialog>Dialog</dialog></div>`)
	const dialog = from.querySelector("dialog")!
	dialog.showModal()
	const closed = new Promise((resolve) => dialog.addEventListener("close", resolve, { once: true }))
	const updated: Array<[string, string | null]> = []

	morph(from, `<div><dialog>Dialog</dialog></div>`, {
		afterAttributeUpdated: (_element, name, previousValue) => updated.push([name, previousValue]),
	})

	expect(dialog.open).toBe(false)
	expect(dialog.matches(":modal")).toBe(false)
	expect(updated).toEqual([["open", ""]])
	await closed
	from.remove()
})

test("a vetoed open removal leaves the modal dialog open", () => {
	const from = mount(`<div><dialog>Dialog</dialog></div>`)
	const dialog = from.querySelector("dialog")!
	dialog.showModal()

	morph(from, `<div><dialog>Dialog</dialog></div>`, {
		beforeAttributeUpdated: (_element, name) => name !== "open",
	})

	expect(dialog.open).toBe(true)
	dialog.close()
	from.remove()
})

test("adding open to a closed dialog shows it", () => {
	const from = mount(`<div><dialog>Dialog</dialog></div>`)
	const dialog = from.querySelector("dialog")!

	morph(from, `<div><dialog open>Dialog</dialog></div>`, { preserveChanges: false })

	expect(dialog.open).toBe(true)
	from.remove()
})

test("preserveChanges still syncs open on other elements", () => {
	const from = mount(`<div><div open></div><span></span></div>`)

	morph(from, `<div><div></div><span open></span></div>`, { preserveChanges: true })

	expect(from.outerHTML).toBe(`<div><div></div><span open=""></span></div>`)
	from.remove()
})
