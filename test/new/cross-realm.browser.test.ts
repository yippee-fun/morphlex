import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"

test("morphs to a NodeList from another realm", () => {
	const iframe = document.createElement("iframe")
	document.body.appendChild(iframe)

	try {
		const iframeDocument = iframe.contentDocument!
		const template = iframeDocument.createElement("template")
		template.innerHTML = "<span>First</span><span>Second</span>"

		const parent = document.createElement("div")
		const child = document.createElement("span")
		child.textContent = "Original"
		parent.appendChild(child)

		morph(child, template.content.childNodes)

		expect(parent.innerHTML).toBe("<span>First</span><span>Second</span>")
	} finally {
		iframe.remove()
	}
})
