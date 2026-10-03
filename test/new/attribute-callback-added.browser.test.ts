import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("an attribute added by a callback during the update pass is still removed", () => {
	const from = dom(`<div a="old"></div>`)
	const to = dom(`<div a="new"></div>`)
	const removed: Array<string> = []

	morph(from, to, {
		afterAttributeUpdated: (element, name, previousValue) => {
			if (name === "a") element.setAttribute("b", "")
			if (name === "b") removed.push(`${name}:${previousValue}`)
		},
	})

	expect(from.outerHTML).toBe(`<div a="new"></div>`)
	expect(removed).toEqual(["b:"])
})
