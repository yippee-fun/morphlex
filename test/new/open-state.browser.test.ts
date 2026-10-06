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

test("a namespaced open attribute on a dialog is synced like any other", () => {
	for (const preserveChanges of [true, false]) {
		const from = mount(`<div><dialog>Dialog</dialog></div>`)
		const dialog = from.querySelector("dialog")!
		const to = dom(`<div><dialog>Dialog</dialog></div>`)
		to.querySelector("dialog")!.setAttributeNS("urn:x", "open", "")

		morph(from, to, { preserveChanges })
		expect(dialog.getAttributeNS("urn:x", "open")).toBe("")

		morph(from, `<div><dialog>Dialog</dialog></div>`, { preserveChanges })
		expect(dialog.hasAttributeNS("urn:x", "open")).toBe(false)
		from.remove()
	}
})

test("preserveChanges still updates the value of an existing open attribute", () => {
	const from = mount(`<div><details open="client"><summary>Summary</summary>Body</details></div>`)
	const details = from.querySelector("details")!

	morph(from, `<div><details open="server"><summary>Summary</summary>Body</details></div>`, { preserveChanges: true })

	expect(details.getAttribute("open")).toBe("server")
	from.remove()
})

test("preserveChanges keeps the details the user opened in its place among identical ones", () => {
	const from = mount(`<div><details><summary>More</summary></details><details><summary>More</summary></details></div>`)
	const [first, second] = from.querySelectorAll("details")
	first!.open = true

	morph(from, `<div><details><summary>More</summary></details><details><summary>More</summary></details></div>`, {
		preserveChanges: true,
	})

	expect([...from.querySelectorAll("details")]).toEqual([first, second])
	expect([first!.open, second!.open]).toEqual([true, false])
	from.remove()
})

test("preserveChanges keeps the details the user closed in its place among identical ones", () => {
	const from = mount(`<div><details open><summary>More</summary></details><details open><summary>More</summary></details></div>`)
	const [first, second] = from.querySelectorAll("details")
	first!.open = false

	morph(from, `<div><details open><summary>More</summary></details><details open><summary>More</summary></details></div>`, {
		preserveChanges: true,
	})

	expect([...from.querySelectorAll("details")]).toEqual([first, second])
	expect([first!.open, second!.open]).toEqual([false, true])
	from.remove()
})

test("preserveChanges keeps the details the user opened when an item is added before it", () => {
	const from = mount(`<div><details><summary>q1</summary></details></div>`)
	const details = from.querySelector("details")!
	details.open = true

	morph(from, `<div><details><summary>q0</summary></details><details><summary>q1</summary></details></div>`, {
		preserveChanges: true,
	})

	const [added, kept] = from.querySelectorAll("details")
	expect(kept).toBe(details)
	expect([added!.open, kept!.open]).toEqual([false, true])
	from.remove()
})

test("preserveChanges keeps the details the user closed when an item is added before it", () => {
	const from = mount(`<div><details open><summary>q1</summary></details></div>`)
	const details = from.querySelector("details")!
	details.open = false

	morph(from, `<div><details open><summary>q0</summary></details><details open><summary>q1</summary></details></div>`, {
		preserveChanges: true,
	})

	const [added, kept] = from.querySelectorAll("details")
	expect(kept).toBe(details)
	expect([added!.open, kept!.open]).toEqual([true, false])
	from.remove()
})

test("preserveChanges keeps the dialog the user opened in its place among identical ones", () => {
	const from = mount(`<div><dialog>Dialog</dialog><dialog>Dialog</dialog></div>`)
	const [first, second] = from.querySelectorAll("dialog")
	first!.show()

	morph(from, `<div><dialog>Dialog</dialog><dialog>Dialog</dialog></div>`, { preserveChanges: true })

	expect([...from.querySelectorAll("dialog")]).toEqual([first, second])
	expect([first!.open, second!.open]).toEqual([true, false])
	first!.close()
	from.remove()
})
