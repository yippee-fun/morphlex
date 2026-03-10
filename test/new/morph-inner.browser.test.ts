import { expect, test } from "vitest"
import { morphInner } from "../../src/morphlex"

test("morphInner accepts a matching element string", () => {
	const from = document.createElement("div")
	from.innerHTML = "<span>before</span>"

	morphInner(from, `<div><span>after</span><em>extra</em></div>`)

	expect(from.innerHTML).toBe("<span>after</span><em>extra</em>")
})

test("morphInner rejects strings that are not a single element", () => {
	const from = document.createElement("div")

	expect(() => morphInner(from, `text only`)).toThrow("[Morphlex] The string was not a valid HTML element.")
	expect(() => morphInner(from, `<div></div><div></div>`)).toThrow("[Morphlex] The string was not a valid HTML element.")
})

test("morphInner rejects mismatched element names", () => {
	const from = document.createElement("div")
	const to = document.createElement("span")

	expect(() => morphInner(from, to)).toThrow("[Morphlex] You can only do an inner morph with matching elements.")
})
