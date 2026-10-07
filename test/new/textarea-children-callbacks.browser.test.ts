import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

function liveDiv(html: string): HTMLDivElement {
	const div = document.createElement("div")
	div.innerHTML = html
	document.body.append(div)
	return div
}

test("beforeChildrenVisited is asked for a textarea and its veto keeps the text", () => {
	const div = liveDiv(`<textarea name="t">a</textarea><section>a</section>`)
	const textarea = div.querySelector("textarea")!
	const asked: Array<string> = []

	morph(div, `<div><textarea name="t">b</textarea><section>b</section></div>`, {
		beforeChildrenVisited: (parent) => (asked.push((parent as Element).localName), parent === div),
	})

	expect(asked).toEqual(["div", "textarea", "section"])
	expect(div.innerHTML).toBe(`<textarea name="t">a</textarea><section>a</section>`)
	expect(textarea.value).toBe("a")
	div.remove()
})

test("a vetoed textarea keeps the user's text without preserveChanges", () => {
	const div = liveDiv(`<textarea name="t">a</textarea>`)
	const textarea = div.querySelector("textarea")!
	textarea.value = "typed"

	morph(div, `<div><textarea name="t">b</textarea></div>`, {
		beforeChildrenVisited: (parent) => parent !== textarea,
	})

	expect(textarea.defaultValue).toBe("a")
	expect(textarea.value).toBe("typed")
	div.remove()
})

test("afterChildrenVisited sees a textarea's new text and reset value", () => {
	const div = liveDiv(`<textarea name="t">a</textarea>`)
	const textarea = div.querySelector("textarea")!
	textarea.value = "typed"
	const seen: Array<string> = []

	morph(div, `<div><textarea name="t">b</textarea></div>`, {
		afterChildrenVisited: (parent) => {
			if (parent === textarea) seen.push(`${textarea.defaultValue}/${textarea.value}`)
		},
	})

	expect(seen).toEqual(["b/b"])
	div.remove()
})

test("removing a textarea's text asks beforeNodeRemoved, and its veto keeps the text", () => {
	const div = liveDiv(`<textarea name="t">a</textarea>`)
	const textarea = div.querySelector("textarea")!
	const removed: Array<string | null> = []

	morph(div, `<div><textarea name="t"></textarea></div>`, {
		beforeNodeRemoved: (node) => (removed.push(node.textContent), false),
	})

	expect(removed).toEqual(["a"])
	expect(textarea.value).toBe("a")
	div.remove()
})

test("adding a textarea's text asks beforeNodeAdded", () => {
	const div = liveDiv(`<textarea name="t"></textarea>`)
	const textarea = div.querySelector("textarea")!
	const added: Array<string | null> = []

	morph(div, `<div><textarea name="t">b</textarea></div>`, {
		beforeNodeAdded: (_parent, node) => (added.push(node.textContent), true),
	})

	expect(added).toEqual(["b"])
	expect(textarea.value).toBe("b")
	div.remove()
})

test("an edited empty textarea is still reset to its empty target", () => {
	const div = liveDiv(`<textarea name="t"></textarea>`)
	const textarea = div.querySelector("textarea")!
	textarea.value = "typed"

	morph(div, `<div><textarea name="t"></textarea></div>`)

	expect(textarea.value).toBe("")
	div.remove()
})

test("an edited empty textarea keeps the user's text with preserveChanges", () => {
	const div = liveDiv(`<textarea name="t"></textarea>`)
	const textarea = div.querySelector("textarea")!
	textarea.value = "typed"

	morph(div, `<div><textarea name="t"></textarea></div>`, { preserveChanges: true })

	expect(textarea.value).toBe("typed")
	div.remove()
})
