import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

test("duplicate candidate ids are bucketed without breaking matching", () => {
	const from = dom(`
		<div>
			<section id="dup">first</section>
			<section id="dup">second</section>
			<section id="dup">third</section>
		</div>
	`)

	const to = dom(`
		<div>
			<section id="dup">third</section>
		</div>
	`)

	morph(from, to)

	expect(from.children).toHaveLength(1)
	expect(from.children[0]?.id).toBe("dup")
	expect(from.children[0]?.textContent).toBe("third")
})
