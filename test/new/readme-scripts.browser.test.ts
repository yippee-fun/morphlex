import { expect, test } from "vitest"
import { morphInner } from "../../src/morphlex"

// The example from the README’s “Scripts” section.
function runScripts(node: Node) {
	if (!(node instanceof Element)) return
	const scripts = node.matches("script") ? [node] : node.querySelectorAll("script")
	for (const inert of scripts) {
		const script = document.createElement("script")
		for (const { name, value } of inert.attributes) script.setAttribute(name, value)
		script.nonce = inert.nonce
		script.async = inert.hasAttribute("async")
		script.textContent = inert.textContent
		inert.replaceWith(script)
	}
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

test("afterNodeAdded can run the scripts in new content", () => {
	const { ran, container } = setup()

	morphInner(
		container,
		`<div><p>New</p><script data-kind="top">ran.push("top")</script><section><script>ran.push("nested")</script></section></div>`,
		{ afterNodeAdded: runScripts },
	)

	expect(ran).toEqual(["top", "nested"])
	expect(container.innerHTML).toBe(
		`<p>New</p><script data-kind="top">ran.push("top")</script><section><script>ran.push("nested")</script></section>`,
	)
	container.remove()
})

test("the copies keep the nonce and run in order", () => {
	const { container } = setup()

	morphInner(container, `<div><script nonce="abc">ran.push("nonce")</script><script async src="data:,"></script></div>`, {
		afterNodeAdded: runScripts,
	})

	const [first, second] = [...container.querySelectorAll("script")] as [HTMLScriptElement, HTMLScriptElement]
	expect(first.nonce).toBe("abc")
	expect(first.async).toBe(false)
	expect(second.async).toBe(true)
	container.remove()
})
