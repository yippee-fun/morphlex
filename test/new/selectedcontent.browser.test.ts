import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// Browsers with customizable selects fill a select's `selectedcontent` with a copy of the selected option.
const fillsSelectedContent =
	typeof (globalThis as { HTMLSelectedContentElement?: unknown }).HTMLSelectedContentElement === "function"

function mount(html: string): HTMLElement {
	const host = document.createElement("form")
	host.innerHTML = html
	document.body.append(host)
	return host
}

function select(options: string, attributes = ""): string {
	return `<select name="s"${attributes}><button><selectedcontent></selectedcontent></button>${options}</select>`
}

const fruits = `<option value="a">Apple</option><option value="b">Banana</option>`

test.runIf(fillsSelectedContent)("selectedcontent keeps showing the option the user picked, with preserveChanges", () => {
	const host = mount(select(fruits))
	const live = host.querySelector("select")!
	live.value = "b"

	morph(host, `<form>${select(fruits)}</form>`, { preserveChanges: true })

	expect(live.value).toBe("b")
	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("Banana")
	host.remove()
})

test.runIf(fillsSelectedContent)("selectedcontent shows the option the markup selects once the user's pick is reset", () => {
	const host = mount(select(fruits))
	const live = host.querySelector("select")!
	live.value = "b"

	morph(host, `<form>${select(fruits)}</form>`)

	expect(live.value).toBe("a")
	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("Apple")
	host.remove()
})

test.runIf(fillsSelectedContent)("selectedcontent shows the new content of the selected option", () => {
	for (const preserveChanges of [false, true]) {
		const host = mount(select(fruits))

		morph(host, `<form>${select(`<option value="a"><b>Avocado</b></option><option value="b">Banana</option>`)}</form>`, {
			preserveChanges,
		})

		expect(host.querySelector("selectedcontent")!.innerHTML).toBe("<b>Avocado</b>")
		host.remove()
	}
})

test.runIf(fillsSelectedContent)("selectedcontent shows the new content of the option the user picked", () => {
	const host = mount(select(fruits))
	host.querySelector("select")!.value = "b"

	morph(host, `<form>${select(`<option value="a">Apple</option><option value="b">Blueberry</option>`)}</form>`, {
		preserveChanges: true,
	})

	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("Blueberry")
	host.remove()
})

test.runIf(fillsSelectedContent)("a morph inside a select refreshes its selectedcontent", () => {
	const host = mount(select(fruits))
	const option = host.querySelector("option")!

	morph(option, `<option value="a">Apricot</option>`)

	expect(host.querySelector("option")).toBe(option)
	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("Apricot")

	morphInner(host.querySelector("button")!, `<button><selectedcontent></selectedcontent></button>`)

	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("Apricot")
	host.remove()
})

test.runIf(fillsSelectedContent)("every selectedcontent in a select is refreshed", () => {
	const html = `<select name="s"><button><selectedcontent></selectedcontent></button><div><selectedcontent></selectedcontent></div>${fruits}</select>`
	const host = mount(html)
	host.querySelector("select")!.value = "b"

	morph(host, `<form>${html}</form>`, { preserveChanges: true })

	expect([...host.querySelectorAll("selectedcontent")].map((element) => element.innerHTML)).toEqual(["Banana", "Banana"])
	host.remove()
})

test.runIf(fillsSelectedContent)("a selectedcontent that already shows the selected option is left alone", () => {
	const host = mount(select(fruits))
	const selectedContent = host.querySelector("selectedcontent")!
	const text = selectedContent.firstChild
	const records: Array<MutationRecord> = []
	const observer = new MutationObserver((mutations) => records.push(...mutations))
	observer.observe(host, { childList: true, subtree: true, characterData: true })

	morph(host, `<form>${select(fruits)}<p>new</p></form>`)

	records.push(...observer.takeRecords())
	observer.disconnect()
	expect(host.querySelector("selectedcontent")).toBe(selectedContent)
	expect(selectedContent.firstChild).toBe(text)
	expect(
		records.every((record) => !selectedContent.contains(record.target) && record.target !== selectedContent.parentNode),
	).toBe(true)
	host.remove()
})

test("a selectedcontent in a multiple select is morphed like other markup", () => {
	const host = mount(select(fruits, " multiple"))
	const selectedContent = host.querySelector("selectedcontent")!
	selectedContent.textContent = "none"

	morph(host, `<form>${select(fruits, " multiple")}</form>`)

	expect(host.querySelector("selectedcontent")).toBe(selectedContent)
	expect(selectedContent.innerHTML).toBe("")
	host.remove()
})

test.skipIf(fillsSelectedContent)("where the browser doesn't fill selectedcontent, it's morphed like other markup", () => {
	const host = mount(`<div><selectedcontent>old</selectedcontent></div>`)

	morph(host, `<form><div><selectedcontent>new</selectedcontent></div></form>`)

	expect(host.querySelector("selectedcontent")!.innerHTML).toBe("new")
	host.remove()
})

test.runIf(fillsSelectedContent)("a selectedcontent the morph is told to leave alone isn't refreshed", () => {
	for (const callback of ["beforeNodeVisited", "beforeChildrenVisited"] as const) {
		const host = mount(select(fruits))
		const selectedContent = host.querySelector("selectedcontent")!

		morph(host, `<form>${select(`<option value="a">Apricot</option><option value="b">Banana</option>`)}</form>`, {
			[callback]: (node: Node) => node !== selectedContent,
		})

		expect(host.querySelector("option")!.textContent).toBe("Apricot")
		expect(selectedContent.innerHTML).toBe("Apple")
		host.remove()
	}
})

test("an SVG element named selectedcontent in a select is morphed like other markup", () => {
	const host = mount(select(fruits))
	const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
	svg.append(document.createElementNS("http://www.w3.org/2000/svg", "selectedcontent"))
	svg.firstChild!.textContent = "old"
	host.querySelector("button")!.append(svg)
	const target = host.cloneNode(true) as HTMLElement
	target.querySelector("svg")!.firstChild!.textContent = "new"

	morph(host, target)

	expect(host.querySelector("svg")!.firstChild!.textContent).toBe("new")
	host.remove()
})
