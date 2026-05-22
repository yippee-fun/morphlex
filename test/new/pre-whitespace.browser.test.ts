import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("morphing preserves whitespace inside <pre>", () => {
	const from = document.createElement("div")
	from.innerHTML = `<pre>  line1\n  line2  </pre>`

	const to = document.createElement("div")
	to.innerHTML = `<pre>  line1\n  line2  </pre>`

	morph(from, to)

	expect(from.firstElementChild!.textContent).toBe("  line1\n  line2  ")
})

test("morphing preserves whitespace inside <pre> across changes", () => {
	const from = document.createElement("div")
	from.innerHTML = `<pre>old content</pre>`

	const to = document.createElement("div")
	to.innerHTML = `<pre>  line1\n  line2  </pre>`

	morph(from, to)

	expect(from.firstElementChild!.textContent).toBe("  line1\n  line2  ")
})

test("morphing preserves a pre containing only whitespace", () => {
	const from = document.createElement("div")
	const pre = document.createElement("pre")
	pre.appendChild(document.createTextNode("   \n"))
	from.appendChild(pre)

	const to = document.createElement("div")
	const toPre = document.createElement("pre")
	toPre.appendChild(document.createTextNode("   \n"))
	to.appendChild(toPre)

	morph(from, to)

	expect(from.firstElementChild!.textContent).toBe("   \n")
})

test("morphing preserves a pre containing only whitespace when content differs", () => {
	const from = document.createElement("div")
	const pre = document.createElement("pre")
	pre.appendChild(document.createTextNode("old content"))
	from.appendChild(pre)

	const to = document.createElement("div")
	const toPre = document.createElement("pre")
	toPre.appendChild(document.createTextNode("   \n"))
	to.appendChild(toPre)

	morph(from, to)

	expect(from.firstElementChild!.textContent).toBe("   \n")
})

test("morphing preserves whitespace inside <textarea>", () => {
	// textareas are handled specially anyway, but let's verify
	const from = document.createElement("div")
	from.innerHTML = `<textarea>  line1\n  line2  </textarea>`

	const to = document.createElement("div")
	to.innerHTML = `<textarea>  line1\n  line2  </textarea>`

	morph(from, to)

	const textarea = from.firstElementChild as HTMLTextAreaElement
	expect(textarea.defaultValue).toBe("  line1\n  line2  ")
})
