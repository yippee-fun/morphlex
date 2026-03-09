import { describe, expect, test, vi } from "vitest"
import { morph, morphDocument } from "../../src/morphlex"
import { dom } from "./utils"

describe("coverage regressions", () => {
	test("morphDocument accepts a Document target", () => {
		const parser = new DOMParser()
		const from = parser.parseFromString("<html><body><main>old</main></body></html>", "text/html")
		const to = parser.parseFromString("<html><body><main>new</main></body></html>", "text/html")

		morphDocument(from, to)

		expect(from.querySelector("main")?.textContent).toBe("new")
	})

	test("morph accepts non-parent nodes", () => {
		const from = document.createTextNode("old")
		const to = document.createTextNode("new")

		morph(from, to)

		expect(from.data).toBe("new")
	})

	test("detached replacements do not add nodes without a real parent", () => {
		const from = document.createTextNode("old")
		const to = document.createComment("new")
		const afterNodeAdded = vi.fn()
		const afterNodeRemoved = vi.fn()

		expect(() => {
			morph(from, to, { afterNodeAdded, afterNodeRemoved })
		}).not.toThrow()

		expect(afterNodeAdded).not.toHaveBeenCalled()
		expect(afterNodeRemoved).not.toHaveBeenCalled()
		expect(from.data).toBe("old")
	})

	test("detached one-to-many morphs skip extra additions without a parent", () => {
		const from = document.createTextNode("old")
		const afterNodeAdded = vi.fn()

		expect(() => {
			morph(from, "new<!--extra-->", { afterNodeAdded })
		}).not.toThrow()

		expect(from.data).toBe("new")
		expect(afterNodeAdded).not.toHaveBeenCalled()
	})

	test("morph bails out when given the same node", () => {
		const node = dom(`<div><span>same</span></div>`)
		const beforeNodeVisited = vi.fn()

		morph(node, node, { beforeNodeVisited })

		expect(beforeNodeVisited).not.toHaveBeenCalled()
		expect(node.outerHTML).toBe(`<div><span>same</span></div>`)
	})

	test("flags a dirty root option before morphing", () => {
		const from = document.createElement("option")
		from.value = "a"
		from.textContent = "A"
		from.selected = true
		const setAttribute = vi.spyOn(from, "setAttribute")

		const to = document.createElement("option")
		to.value = "a"
		to.textContent = "A"

		morph(from, to, { preserveChanges: true })

		expect(setAttribute).toHaveBeenCalledWith("morphlex-dirty", "")
	})

	test("does not flag clean options as dirty", () => {
		const from = document.createElement("option")
		from.value = "a"
		from.textContent = "A"
		from.defaultSelected = true
		from.selected = true
		const setAttribute = vi.spyOn(from, "setAttribute")

		const to = document.createElement("option")
		to.value = "a"
		to.textContent = "A"
		to.defaultSelected = true
		to.selected = true

		morph(from, to, { preserveChanges: true })

		expect(setAttribute).not.toHaveBeenCalledWith("morphlex-dirty", "")
	})

	test("does not flag clean descendant options as dirty", () => {
		const from = document.createElement("select")
		const option = document.createElement("option")
		option.value = "a"
		option.textContent = "A"
		option.defaultSelected = true
		option.selected = true
		from.appendChild(option)

		const setAttribute = vi.spyOn(option, "setAttribute")
		const to = from.cloneNode(true) as HTMLSelectElement

		morph(from, to, { preserveChanges: true })

		expect(setAttribute).not.toHaveBeenCalledWith("morphlex-dirty", "")
	})

	test("beforeNodeVisited can cancel replacing a non-matching element", () => {
		const from = document.createElement("div")
		from.textContent = "old"
		const to = document.createElement("span")
		to.textContent = "new"

		morph(from, to, {
			beforeNodeVisited: () => false,
		})

		expect(from.localName).toBe("div")
		expect(from.textContent).toBe("old")
	})

	test("beforeNodeVisited can cancel morphing other node types", () => {
		const from = document.createTextNode("old")
		const to = document.createComment("new")

		morph(from, to, {
			beforeNodeVisited: () => false,
		})

		expect(from.nodeType).toBe(Node.TEXT_NODE)
		expect(from.data).toBe("old")
	})

	test("beforeNodeVisited can cancel morphing non-element children", () => {
		const from = document.createElement("div")
		from.appendChild(document.createTextNode("old"))

		const to = document.createElement("div")
		to.appendChild(document.createTextNode("new"))

		let childVisited = false
		morph(from, to, {
			beforeNodeVisited: (current) => {
				if (current.nodeType !== Node.ELEMENT_NODE) {
					childVisited = true
					return false
				}
				return true
			},
		})

		expect(childVisited).toBe(true)
		expect(from.textContent).toBe("old")
	})

	test("beforeChildrenVisited can cancel child morphing", () => {
		const from = dom(`<div><span>old</span></div>`)
		const to = dom(`<div><span>new</span><strong>extra</strong></div>`)

		morph(from, to, {
			beforeChildrenVisited: () => false,
		})

		expect(from.innerHTML).toBe(`<span>old</span>`)
	})

	test("morph handles empty textarea content", () => {
		const from = document.createElement("textarea")
		from.setAttribute("data-state", "old")
		const to = document.createElement("textarea")
		to.setAttribute("data-state", "new")

		morph(from, to)

		expect(from.value).toBe("")
		expect(from.textContent).toBe("")
		expect(from.getAttribute("data-state")).toBe("new")
	})

	test("reorders three duplicate ids", () => {
		const from = dom(`
			<div>
				<span id="x">one</span>
				<span id="x">two</span>
				<span id="x">three</span>
			</div>
		`)
		const to = dom(`
			<div>
				<span id="x">three</span>
				<span id="x">two</span>
				<span id="x">one</span>
			</div>
		`)

		morph(from, to)

		expect(Array.from(from.children, (child) => child.textContent)).toEqual(["three", "two", "one"])
	})

	test("falls through duplicate id candidates until the local name matches", () => {
		const from = dom(`
			<div>
				<span id="x">span</span>
				<div id="x">div</div>
			</div>
		`)
		const to = dom(`
			<div>
				<div id="x">updated</div>
			</div>
		`)

		morph(from, to)

		expect(from.children).toHaveLength(1)
		expect(from.firstElementChild?.tagName).toBe("DIV")
		expect(from.firstElementChild?.textContent).toBe("updated")
	})

	test("adds a second duplicate id when the only exact match is already used", () => {
		const from = dom(`<div><span id="x">one</span></div>`)
		const to = dom(`<div><span id="x">one</span><span id="x">two</span></div>`)

		morph(from, to)

		expect(Array.from(from.children, (child) => child.textContent)).toEqual(["one", "two"])
	})

	test("matches nested ids after skipping inactive and id-less candidates", () => {
		const from = dom(`
			<div>
				<section><em>equal</em></section>
				<section><em>plain</em></section>
				<section><span id="token">old</span></section>
			</div>
		`)
		const to = dom(`
			<div>
				<section><em>equal</em></section>
				<section><span id="token">new</span></section>
			</div>
		`)

		morph(from, to)

		expect(from.children).toHaveLength(2)
		expect(from.children[1]?.querySelector("#token")?.textContent).toBe("new")
	})

	test("matches non-element nodes by node type after skipping mismatches", () => {
		const from = document.createElement("div")
		from.append(document.createComment("old"), document.createTextNode("old"))

		const to = document.createElement("div")
		to.appendChild(document.createTextNode("new"))

		morph(from, to)

		expect(from.childNodes).toHaveLength(1)
		expect(from.textContent).toBe("new")
	})

	test("removes empty text nodes as whitespace", () => {
		const from = document.createElement("div")
		from.appendChild(document.createTextNode(""))

		const to = document.createElement("div")

		morph(from, to)

		expect(from.childNodes).toHaveLength(0)
	})

	test("handles a child list with no reusable matches", () => {
		const from = document.createElement("div")
		from.append(document.createElement("span"), document.createComment("old"))

		const to = document.createElement("div")
		to.append(document.createElement("section"), document.createTextNode("new"))

		morph(from, to)

		expect(from.innerHTML).toBe(`<section></section>new`)
	})

	test("handles a child list with no matches at all", () => {
		const from = dom(`<div><input name="from" value="old"></div>`)
		const to = dom(`<div><textarea name="to">new</textarea></div>`)

		morph(from, to)

		expect(from.innerHTML).toBe(`<textarea name="to">new</textarea>`)
	})

	test("uses document as the fallback parent for detached replacements", () => {
		const from = document.createElement("div")
		const to = document.createElement("span")
		let parent: ParentNode | null = null

		morph(from, to, {
			beforeNodeAdded: (nextParent) => {
				parent = nextParent
				return false
			},
		})

		expect(parent).toBe(document)
		expect(from.localName).toBe("div")
	})

	test("uses document as the fallback parent when adding extra detached nodes", () => {
		const from = document.createElement("div")
		let parent: ParentNode | null = null

		morph(from, "<span>first</span><span>second</span>", {
			beforeNodeVisited: () => false,
			beforeNodeAdded: (nextParent) => {
				parent = nextParent
				return false
			},
		})

		expect(parent).toBe(document)
		expect(from.localName).toBe("div")
	})
})
