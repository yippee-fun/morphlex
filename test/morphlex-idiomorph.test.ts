/*
 * These tests were inspired by idiomorph.
 * Here's their license:
 *
 * Zero-Clause BSD
 * =============
 *
 * Permission to use, copy, modify, and/or distribute this software for
 * any purpose with or without fee is hereby granted.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL
 * WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE
 * FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY
 * DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
 * AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
 * OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { morph, morphInner } from "../src/morphlex"

describe("Idiomorph-style tests", () => {
	let container: HTMLElement

	beforeEach(() => {
		container = document.createElement("div")
		document.body.appendChild(container)
	})

	afterEach(() => {
		if (container && container.parentNode) {
			container.parentNode.removeChild(container)
		}
	})

	function parseHTML(html: string): HTMLElement {
		const tmp = document.createElement("div")
		tmp.innerHTML = html.trim()
		return tmp.firstChild as HTMLElement
	}

	describe("basic morphing with different content types", () => {
		it("should morph with single node", () => {
			const initial = parseHTML("<button>Foo</button>")
			container.appendChild(initial)

			const final = document.createElement("button")
			final.textContent = "Bar"

			morph(initial, final)

			expect(initial.textContent).toBe("Bar")
		})

		it("should morph with string", () => {
			const initial = parseHTML("<button>Foo</button>")
			container.appendChild(initial)

			morph(initial, "<button>Bar</button>")

			expect(initial.textContent).toBe("Bar")
		})
	})

	describe("morphInner functionality", () => {
		it("should morph innerHTML with string", () => {
			const div = parseHTML("<div><span>Old</span></div>")
			container.appendChild(div)

			morphInner(div, "<div><span>New</span></div>")

			expect(div.innerHTML).toBe("<span>New</span>")
		})

		it("should morph innerHTML with element", () => {
			const div = parseHTML("<div><span>Old</span></div>")
			container.appendChild(div)

			const newDiv = document.createElement("div")
			const newSpan = document.createElement("span")
			newSpan.textContent = "New"
			newDiv.appendChild(newSpan)

			morphInner(div, newDiv)

			expect(div.innerHTML).toBe("<span>New</span>")
		})

		it("should clear children when morphing to empty", () => {
			const div = parseHTML("<div><span>Old</span></div>")
			container.appendChild(div)

			morphInner(div, "<div></div>")

			expect(div.innerHTML).toBe("")
		})

		it("should add multiple children", () => {
			const div = parseHTML("<div></div>")
			container.appendChild(div)

			morphInner(div, "<div><i>A</i><b>B</b></div>")

			expect(div.innerHTML).toBe("<i>A</i><b>B</b>")
		})
	})

	describe("special elements", () => {
		it("should handle numeric IDs", () => {
			const initial = parseHTML('<div id="123">Old</div>')
			const final = parseHTML('<div id="123">New</div>')

			morph(initial, final)

			expect(initial.textContent).toBe("New")
		})
	})

	describe("complex scenarios", () => {
		it("should not build ID in new content parent into persistent id set", () => {
			const initial = parseHTML('<div id="a"><div id="b">B</div></div>')
			container.appendChild(initial)

			const finalSrc = parseHTML('<div id="b">B Updated</div>')

			morph(initial, finalSrc)

			expect(initial.textContent).toBe("B Updated")
		})

		it("should handle soft match abortion on two future soft matches", () => {
			const initial = parseHTML(`
				<div>
					<span>A</span>
					<span>B</span>
					<span>C</span>
				</div>
			`)
			container.appendChild(initial)

			const final = parseHTML(`
				<div>
					<span>X</span>
					<span>B</span>
					<span>C</span>
				</div>
			`)

			morph(initial, final)

			expect(initial.children[0].textContent).toBe("X")
			expect(initial.children[1].textContent).toBe("B")
			expect(initial.children[2].textContent).toBe("C")
		})
	})

	describe("edge cases", () => {
		it("should preserve elements during complex morphing", () => {
			const parent = parseHTML(`
				<div>
					<div id="outer">
						<div id="inner">
							<span id="a">A</span>
							<span id="b">B</span>
							<span id="c">C</span>
						</div>
					</div>
				</div>
			`)
			container.appendChild(parent)

			const aEl = parent.querySelector("#a")
			const bEl = parent.querySelector("#b")
			const cEl = parent.querySelector("#c")

			const final = parseHTML(`
				<div>
					<div id="outer">
						<div id="inner">
							<span id="c">C Modified</span>
							<span id="a">A Modified</span>
							<span id="b">B Modified</span>
						</div>
					</div>
				</div>
			`)

			morph(parent, final)

			// Elements should be preserved
			expect(parent.querySelector("#a")).toBe(aEl)
			expect(parent.querySelector("#b")).toBe(bEl)
			expect(parent.querySelector("#c")).toBe(cEl)

			// Content should be updated
			expect(aEl?.textContent).toBe("A Modified")
			expect(bEl?.textContent).toBe("B Modified")
			expect(cEl?.textContent).toBe("C Modified")
		})

		it("should handle deeply nested structure changes", () => {
			const parent = parseHTML(`
				<div>
					<section id="sec1">
						<article id="art1">
							<p id="p1">Paragraph 1</p>
							<p id="p2">Paragraph 2</p>
						</article>
					</section>
				</div>
			`)
			container.appendChild(parent)

			const final = parseHTML(`
				<div>
					<section id="sec1">
						<article id="art1">
							<p id="p2">Paragraph 2 Updated</p>
							<p id="p1">Paragraph 1 Updated</p>
						</article>
					</section>
				</div>
			`)

			morph(parent, final)

			expect(parent.querySelector("#p1")?.textContent).toBe("Paragraph 1 Updated")
			expect(parent.querySelector("#p2")?.textContent).toBe("Paragraph 2 Updated")
		})

		it("should handle attribute changes on nested elements", () => {
			const parent = parseHTML(`
				<div>
					<button id="btn1" class="old">Click</button>
				</div>
			`)
			container.appendChild(parent)

			const final = parseHTML(`
				<div>
					<button id="btn1" class="new" disabled>Click</button>
				</div>
			`)

			morph(parent, final)

			const button = parent.querySelector("#btn1") as HTMLButtonElement
			expect(button.className).toBe("new")
			expect(button.disabled).toBe(true)
		})

		it("should handle mixed content morphing", () => {
			const parent = parseHTML(`
				<div>
					Text node
					<span>Span</span>
					More text
				</div>
			`)
			container.appendChild(parent)

			const final = parseHTML(`
				<div>
					Updated text
					<span>Updated span</span>
					Final text
				</div>
			`)

			morph(parent, final)

			expect(parent.textContent?.replace(/\s+/g, " ").trim()).toBe("Updated text Updated span Final text")
		})
	})

	describe("id preservation", () => {
		it("should preserve elements with matching IDs across different positions", () => {
			const parent = parseHTML(`
				<ul>
					<li id="item-1">Item 1</li>
					<li id="item-2">Item 2</li>
					<li id="item-3">Item 3</li>
				</ul>
			`)
			container.appendChild(parent)

			const item1 = parent.querySelector("#item-1")
			const item2 = parent.querySelector("#item-2")
			const item3 = parent.querySelector("#item-3")

			const final = parseHTML(`
				<ul>
					<li id="item-3">Item 3</li>
					<li id="item-1">Item 1</li>
					<li id="item-2">Item 2</li>
				</ul>
			`)

			morph(parent, final)

			expect(parent.querySelector("#item-1")).toBe(item1)
			expect(parent.querySelector("#item-2")).toBe(item2)
			expect(parent.querySelector("#item-3")).toBe(item3)
		})

		it("should handle ID changes correctly", () => {
			const parent = parseHTML(`
				<div>
					<span id="old-id">Content</span>
				</div>
			`)
			container.appendChild(parent)

			const final = parseHTML(`
				<div>
					<span id="new-id">Content</span>
				</div>
			`)

			morph(parent, final)

			expect(parent.querySelector("#old-id")).toBeNull()
			expect(parent.querySelector("#new-id")).toBeTruthy()
			expect(parent.querySelector("#new-id")?.textContent).toBe("Content")
		})
	})

	describe("performance scenarios", () => {
		it("should handle large lists efficiently", () => {
			let fromHTML = "<ul>"
			for (let i = 0; i < 50; i++) {
				fromHTML += `<li id="item-${i}">Item ${i}</li>`
			}
			fromHTML += "</ul>"

			let toHTML = "<ul>"
			for (let i = 0; i < 50; i++) {
				toHTML += `<li id="item-${i}">Item ${i} Updated</li>`
			}
			toHTML += "</ul>"

			const from = parseHTML(fromHTML)
			const to = parseHTML(toHTML)
			container.appendChild(from)

			const originalElements = Array.from(from.children).map((el) => el)

			morph(from, to)

			// All elements should be preserved
			expect(from.children.length).toBe(50)
			for (let i = 0; i < 50; i++) {
				expect(from.children[i]).toBe(originalElements[i])
				expect(from.children[i].textContent).toBe(`Item ${i} Updated`)
			}
		})

		it("should handle reordering large lists", () => {
			let fromHTML = "<ul>"
			for (let i = 0; i < 20; i++) {
				fromHTML += `<li id="item-${i}">Item ${i}</li>`
			}
			fromHTML += "</ul>"

			let toHTML = "<ul>"
			for (let i = 19; i >= 0; i--) {
				toHTML += `<li id="item-${i}">Item ${i}</li>`
			}
			toHTML += "</ul>"

			const from = parseHTML(fromHTML)
			const to = parseHTML(toHTML)
			container.appendChild(from)

			const elementMap = new Map()
			for (let i = 0; i < 20; i++) {
				elementMap.set(`item-${i}`, from.querySelector(`#item-${i}`))
			}

			morph(from, to)

			// All elements should be preserved
			for (let i = 0; i < 20; i++) {
				expect(from.querySelector(`#item-${i}`)).toBe(elementMap.get(`item-${i}`))
			}
		})
	})
})
