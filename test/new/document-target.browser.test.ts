import { expect, test } from "vitest"
import { morphDocument } from "../../src/morphlex"

test("morphDocument accepts an already-parsed target document", () => {
	const parser = new DOMParser()
	const from = parser.parseFromString(`<html><body><p>before</p></body></html>`, "text/html")
	const to = parser.parseFromString(`<html><body><p>after</p></body></html>`, "text/html")

	morphDocument(from, to)

	expect(from.body.innerHTML).toBe("<p>after</p>")
})
