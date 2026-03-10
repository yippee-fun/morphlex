import { expect, test } from "vitest"
import { morph, morphDocument } from "../../src/morphlex"
import { dom } from "./utils"

test("descendant ids let container elements match by id set overlap", () => {
	const from = dom(`
		<div>
			<section>
				<span id="shared">before</span>
			</section>
		</div>
	`)

	const to = dom(`
		<div>
			<section>
				<em id="shared">after</em>
			</section>
		</div>
	`)

	const originalSection = from.firstElementChild

	morph(from, to)

	expect(from.firstElementChild).toBe(originalSection)
	expect(from.querySelector("#shared")?.textContent).toBe("after")
	expect(from.querySelector("em#shared")).toBeTruthy()
})

test("document roots also collect descendant ids for matching", () => {
	const parser = new DOMParser()
	const from = parser.parseFromString(
		`<html><body><main><section><span id="shared">before</span></section></main></body></html>`,
		"text/html",
	)

	morphDocument(
		from,
		`<html><body><main><section><em id="shared">after</em></section></main></body></html>`,
	)

	expect(from.querySelector("main section em#shared")?.textContent).toBe("after")
})

test("exact id matching ignores candidates with a different tag name", () => {
	const from = dom(`<div><span id="shared">before</span></div>`)
	const to = dom(`<div><em id="shared">after</em></div>`)

	morph(from, to)

	expect(from.firstElementChild?.nodeName).toBe("EM")
	expect(from.firstElementChild?.textContent).toBe("after")
})

test("id-array matching skips candidates without descendant id sets", () => {
	const from = dom(`
		<div>
			<section>
				<span>before</span>
			</section>
		</div>
	`)

	const to = dom(`
		<div>
			<section>
				<em id="shared">after</em>
			</section>
		</div>
	`)

	morph(from, to)

	expect(from.querySelector("section em#shared")?.textContent).toBe("after")
})

test("duplicate target ids skip an already-consumed single candidate bucket", () => {
	const from = dom(`<div><span id="shared">before</span></div>`)
	const to = dom(`<div><span id="shared">first</span><span id="shared">second</span></div>`)

	morph(from, to)

	expect(from.children).toHaveLength(2)
	expect(from.children[0]?.textContent).toBe("first")
	expect(from.children[1]?.textContent).toBe("second")
})

test("duplicate candidate id buckets ignore entries with the wrong tag name", () => {
	const from = dom(`<div><span id="shared"></span><strong id="shared"></strong></div>`)
	const to = dom(`<div><strong id="shared">after</strong></div>`)

	morph(from, to)

	expect(from.children).toHaveLength(1)
	expect(from.firstElementChild?.nodeName).toBe("STRONG")
	expect(from.firstElementChild?.textContent).toBe("after")
})
