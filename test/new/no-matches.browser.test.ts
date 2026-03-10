import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("completely unmatched children are removed and inserted", () => {
	const from = document.createElement("div")
	from.appendChild(document.createComment("old"))

	const to = document.createElement("div")
	to.appendChild(document.createElement("span"))

	morph(from, to)

	expect(from.childNodes).toHaveLength(1)
	expect(from.firstChild?.nodeName).toBe("SPAN")
})
