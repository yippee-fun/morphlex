import { expect, test } from "vitest"
import { morph, morphInner, type Options } from "../../src/morphlex"

// The example from the README’s “Scripts” section, around any morph.
function runningScripts(morphWith: (options: Options) => void) {
	const scripts: Element[] = []

	morphWith({
		afterNodeAdded(node) {
			if (!(node instanceof Element)) return
			scripts.push(...(node.matches("script") ? [node] : node.querySelectorAll("script")))
		},
	})

	scripts.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

	for (const inert of scripts) {
		const script = document.createElement("script")
		for (const { name, value } of inert.attributes) script.setAttribute(name, value)
		script.nonce = (inert as HTMLScriptElement).nonce
		script.async = inert.hasAttribute("async")
		script.textContent = inert.textContent
		inert.replaceWith(script)
	}
}

function morphInnerRunningScripts(container: Element, html: string) {
	runningScripts((options) => morphInner(container, html, options))
}

function setup() {
	const ran: string[] = []
	Object.assign(window, { ran })
	const container = document.createElement("div")
	container.innerHTML = `<p>Old</p>`
	document.body.append(container)
	return { ran, container }
}

test("scripts in a string target don’t run", () => {
	const { ran, container } = setup()

	morphInner(
		container,
		`<div><p>New</p><script>ran.push("top")</script><section><script>ran.push("nested")</script></section></div>`,
	)

	expect(container.querySelectorAll("script")).toHaveLength(2)
	expect(ran).toEqual([])
	container.remove()
})

test("the README example runs the scripts in new content", () => {
	const { ran, container } = setup()

	morphInnerRunningScripts(
		container,
		`<div><p>New</p><script data-kind="top">ran.push("top")</script><section><script>ran.push("nested")</script></section></div>`,
	)

	expect(ran).toEqual(["top", "nested"])
	expect(container.innerHTML).toBe(
		`<p>New</p><script data-kind="top">ran.push("top")</script><section><script>ran.push("nested")</script></section>`,
	)
	container.remove()
})

test("the README example runs scripts once the morph is done", () => {
	const { ran, container } = setup()

	morphInnerRunningScripts(
		container,
		`<div><script>ran.push(document.getElementById("later").textContent)</script><p id="later">Later</p></div>`,
	)

	expect(ran).toEqual(["Later"])
	container.remove()
})

test("the README example keeps the nonce and runs scripts in order", () => {
	const { container } = setup()

	morphInnerRunningScripts(
		container,
		`<div><script nonce="abc">ran.push("nonce")</script><script async src="data:,"></script></div>`,
	)

	const [first, second] = [...container.querySelectorAll("script")] as [HTMLScriptElement, HTMLScriptElement]
	expect(first.nonce).toBe("abc")
	expect(first.async).toBe(false)
	expect(second.async).toBe(true)
	container.remove()
})

test("the README example runs scripts in document order", () => {
	const { ran, container } = setup()

	runningScripts((options) =>
		morph(container.firstChild!, `<script>ran.push("first")</script><script>ran.push("second")</script>`, options),
	)

	expect(ran).toEqual(["first", "second"])
	container.remove()
})
