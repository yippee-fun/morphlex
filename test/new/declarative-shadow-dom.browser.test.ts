import { expect, test } from "vitest"
import { morph, morphDocument, morphInner } from "../../src/morphlex"

const host = `<div id="host"><template shadowrootmode="open"><b>shadow</b></template><i>light</i></div>`

async function loadFrame(html: string): Promise<HTMLIFrameElement> {
	const iframe = document.createElement("iframe")
	iframe.srcdoc = html
	document.body.append(iframe)
	await new Promise((resolve) => iframe.addEventListener("load", resolve, { once: true }))
	return iframe
}

test("morphDocument with the page's own HTML leaves a declarative shadow host alone", async () => {
	const html = `<!doctype html><html><head></head><body>${host}</body></html>`
	const iframe = await loadFrame(html)
	const element = iframe.contentDocument!.getElementById("host")!
	const shadowRoot = element.shadowRoot!
	const added: Array<string> = []

	morphDocument(iframe.contentDocument!, html, { beforeNodeAdded: (_parent, node) => (added.push(node.nodeName), true) })

	expect(added).toEqual([])
	expect(element.innerHTML).toBe("<i>light</i>")
	expect(element.shadowRoot).toBe(shadowRoot)
	expect(shadowRoot.innerHTML).toBe("<b>shadow</b>")
	iframe.remove()
})

test("morphDocument gives a new host from the string its shadow root", async () => {
	const iframe = await loadFrame(`<!doctype html><html><head></head><body><p>a</p></body></html>`)

	morphDocument(iframe.contentDocument!, `<!doctype html><html><head></head><body><p>a</p>${host}</body></html>`)

	const element = iframe.contentDocument!.getElementById("host")!
	expect(element.innerHTML).toBe("<i>light</i>")
	expect(element.shadowRoot!.innerHTML).toBe("<b>shadow</b>")
	iframe.remove()
})

test("morph with a string gives a new host its shadow root", () => {
	const div = document.createElement("div")
	document.body.append(div)

	morph(div, `<div>${host}</div>`)

	const element = div.querySelector("#host")!
	expect(element.innerHTML).toBe("<i>light</i>")
	expect(element.shadowRoot!.mode).toBe("open")
	expect(element.shadowRoot!.innerHTML).toBe("<b>shadow</b>")
	div.remove()
})

test("morph with a string leaves an existing host's shadow root and light DOM alone", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.setHTMLUnsafe(host)
	const shadowRoot = div.querySelector("#host")!.shadowRoot!

	morph(div, `<div>${host.replace("light", "changed")}</div>`)

	const element = div.querySelector("#host")!
	expect(element.innerHTML).toBe("<i>changed</i>")
	expect(element.shadowRoot).toBe(shadowRoot)
	expect(shadowRoot.innerHTML).toBe("<b>shadow</b>")
	div.remove()
})

test("morph with a string rooted at a host leaves its shadow root alone", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.setHTMLUnsafe(host)
	const element = div.firstElementChild!
	const shadowRoot = element.shadowRoot!

	morph(element, host)

	expect(div.firstElementChild).toBe(element)
	expect(element.innerHTML).toBe("<i>light</i>")
	expect(element.shadowRoot).toBe(shadowRoot)
	div.remove()
})

test("morphInner with a string leaves an existing host's light DOM alone", () => {
	const div = document.createElement("div")
	document.body.append(div)
	div.setHTMLUnsafe(host)
	const element = div.firstElementChild!

	morphInner(element, host)

	expect(element.innerHTML).toBe("<i>light</i>")
	expect(element.shadowRoot!.innerHTML).toBe("<b>shadow</b>")
	div.remove()
})

test("a declarative shadow root inside a template from a string stays a template", () => {
	const div = document.createElement("div")
	document.body.append(div)

	morph(div, `<div><template>${host}</template></div>`)

	const element = div.querySelector("template")!.content.querySelector("#host")!
	expect(element.shadowRoot!.innerHTML).toBe("<b>shadow</b>")
	expect(element.innerHTML).toBe("<i>light</i>")
	div.remove()
})
