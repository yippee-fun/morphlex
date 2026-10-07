import { expect, test } from "vitest"
import { morph, morphDocument, morphInner } from "../../src/morphlex"

function trackMutations(): { log: Array<string>; options: Parameters<typeof morph>[2] } {
	const log: Array<string> = []
	return {
		log,
		options: {
			beforeNodeAdded: (_parent, node) => (log.push(`+${node.nodeName}`), true),
			beforeNodeRemoved: (node) => (log.push(`-${node.nodeName}`), true),
		},
	}
}

test("morph with a string keeps a noscript's content as text", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.innerHTML = `<noscript><img src="data:,x"></noscript>`

	const { log, options } = trackMutations()
	morph(div, `<div>${div.innerHTML}</div>`, options)

	expect(log).toEqual([])
	expect(div.querySelector("img")).toBeNull()
	expect(div.querySelector("noscript")!.childNodes.length).toBe(1)
	expect(div.querySelector("noscript")!.firstChild!.nodeType).toBe(Node.TEXT_NODE)
	div.remove()
})

test("morphInner with a string keeps a noscript's content as text", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.innerHTML = `<p>a</p><noscript><img src="data:,x"></noscript>`

	const { log, options } = trackMutations()
	morphInner(div, `<div><p>b</p><noscript><img src="data:,x"></noscript></div>`, options)

	expect(log).toEqual([])
	expect(div.innerHTML).toBe(`<p>b</p><noscript><img src="data:,x"></noscript>`)
	expect(div.querySelector("img")).toBeNull()
	div.remove()
})

test("a new noscript from a string is inserted with its content as text", () => {
	const div = document.createElement("div")
	document.body.append(div)

	morph(div, `<div><noscript><img src="data:,x"><p>no js</p></noscript></div>`)

	const noscript = div.querySelector("noscript")!
	expect(noscript.childNodes.length).toBe(1)
	expect(noscript.textContent).toBe(`<img src="data:,x"><p>no js</p>`)
	expect(div.querySelector("img")).toBeNull()
	div.remove()
})

test("a changed noscript from a string updates its text", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.innerHTML = `<noscript><img src="data:,a"></noscript>`
	const text = div.querySelector("noscript")!.firstChild

	morph(div, `<div><noscript><img src="data:,b"></noscript></div>`)

	expect(div.querySelector("noscript")!.firstChild).toBe(text)
	expect(text!.textContent).toBe(`<img src="data:,b">`)
	expect(div.querySelector("img")).toBeNull()
	div.remove()
})

test("a noscript in SVG from a string keeps its elements", () => {
	const div = document.createElement("div")
	document.body.append(div)

	morph(div, `<div><svg><noscript><circle></circle></noscript></svg></div>`)

	expect(div.querySelector("circle")).not.toBeNull()
	div.remove()
})

test("morphDocument with a string keeps a noscript's content as text", async () => {
	const iframe = document.createElement("iframe")
	const markup = `<html><head><noscript><link rel="stylesheet" href="data:text/css,"></noscript></head><body><noscript><img src="data:,x"></noscript></body></html>`
	const loaded = new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }))
	iframe.srcdoc = markup
	document.body.append(iframe)
	await loaded
	const from = iframe.contentDocument!

	const { log, options } = trackMutations()
	morphDocument(from, markup, options)

	expect(log).toEqual([])
	expect(from.querySelector("link")).toBeNull()
	expect(from.querySelector("img")).toBeNull()
	iframe.remove()
})
