/*
 * These tests were inspired by morphdom.
 * Here's their license:
 *
 * The MIT License (MIT)
 *
 * Copyright (c) Patrick Steele-Idem <pnidem@gmail.com> (psteeleidem.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { morph } from "../src/morphlex"

describe("Morphdom-style fixture tests", () => {
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

	describe("simple morphing", () => {
		it("should add new element before existing element", () => {
			const from = parseHTML("<div><b>bold</b></div>")
			const to = parseHTML("<div><i>italics</i><b>bold</b></div>")

			morph(from, to)

			expect(from.innerHTML).toBe("<i>italics</i><b>bold</b>")
		})

		it("should handle equal elements", () => {
			const from = parseHTML("<div>test</div>")
			const to = parseHTML("<div>test</div>")

			morph(from, to)

			expect(from.innerHTML).toBe("test")
		})

		it("should shorten list of children", () => {
			const from = parseHTML("<div><span>1</span><span>2</span><span>3</span></div>")
			const to = parseHTML("<div><span>1</span></div>")

			morph(from, to)

			expect(from.children.length).toBe(1)
			expect(from.innerHTML).toBe("<span>1</span>")
		})

		it("should lengthen list of children", () => {
			const from = parseHTML("<div><span>1</span></div>")
			const to = parseHTML("<div><span>1</span><span>2</span><span>3</span></div>")

			morph(from, to)

			expect(from.children.length).toBe(3)
			expect(from.innerHTML).toBe("<span>1</span><span>2</span><span>3</span>")
		})

		it("should reverse children", () => {
			const from = parseHTML("<div><span>a</span><span>b</span><span>c</span></div>")
			const to = parseHTML("<div><span>c</span><span>b</span><span>a</span></div>")

			morph(from, to)

			expect(from.innerHTML).toBe("<span>c</span><span>b</span><span>a</span>")
		})
	})

	describe("attribute handling", () => {
		it("should handle empty string attribute values", () => {
			const from = parseHTML('<div class="foo"></div>')
			const to = parseHTML('<div class=""></div>')

			morph(from, to)

			expect(from.getAttribute("class")).toBe("")
		})
	})

	describe("input elements", () => {
		it("should morph input element", () => {
			const from = parseHTML('<input type="text" value="Hello">')
			const to = parseHTML('<input type="text" value="World">')

			morph(from, to)

			// Input values are no longer updated by morphlex
			expect((from as HTMLInputElement).value).toBe("Hello")
		})

		it("should add disabled attribute to input", () => {
			const from = parseHTML('<input type="text" value="Hello World">')
			const to = parseHTML('<input type="text" value="Hello World" disabled>')

			morph(from, to)

			expect((from as HTMLInputElement).disabled).toBe(true)
		})

		it("should remove disabled attribute from input", () => {
			const from = parseHTML('<input type="text" value="Hello World" disabled>')
			const to = parseHTML('<input type="text" value="Hello World">')

			morph(from, to)

			expect((from as HTMLInputElement).disabled).toBe(false)
		})
	})

	describe("select elements", () => {
		it("should handle select element with selected option", () => {
			const from = parseHTML(`
				<select>
					<option value="1">One</option>
					<option value="2" selected>Two</option>
					<option value="3">Three</option>
				</select>
			`)
			const to = parseHTML(`
				<select>
					<option value="1" selected>One</option>
					<option value="2">Two</option>
					<option value="3">Three</option>
				</select>
			`)

			morph(from, to)

			// Selected attribute is removed but not added - select defaults to first option
			const select = from as HTMLSelectElement
			expect(select.value).toBe("1")
			expect(select.options[0].selected).toBe(true)
			expect(select.options[1].selected).toBe(false)
		})

		it("should handle select element with default selection", () => {
			const from = parseHTML(`
				<select>
					<option value="1">One</option>
					<option value="2">Two</option>
					<option value="3">Three</option>
				</select>
			`)
			const to = parseHTML(`
				<select>
					<option value="1">One</option>
					<option value="2" selected>Two</option>
					<option value="3">Three</option>
				</select>
			`)

			morph(from, to)

			// Selected options are no longer updated by morphlex
			const select = from as HTMLSelectElement
			expect(select.value).toBe("1")
			expect(select.options[1].selected).toBe(false)
		})
	})

	describe("id-based morphing", () => {
		it("should handle nested elements with IDs", () => {
			const from = parseHTML(`
				<div>
					<div id="a">A</div>
					<div id="b">B</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="b">B Updated</div>
					<div id="a">A Updated</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")

			morph(from, to)

			// Elements with IDs should be preserved
			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
			expect(from.querySelector("#a")?.textContent).toBe("A Updated")
			expect(from.querySelector("#b")?.textContent).toBe("B Updated")
		})

		it("should handle reversing elements with IDs", () => {
			const from = parseHTML(`
				<div>
					<div id="a">a</div>
					<div id="b">b</div>
					<div id="c">c</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="c">c</div>
					<div id="b">b</div>
					<div id="a">a</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")
			const cEl = from.querySelector("#c")

			morph(from, to)

			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
			expect(from.querySelector("#c")).toBe(cEl)
		})

		it("should handle prepending element with ID", () => {
			const from = parseHTML(`
				<div>
					<div id="a">a</div>
					<div id="b">b</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="c">c</div>
					<div id="a">a</div>
					<div id="b">b</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")

			morph(from, to)

			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
			expect(from.children.length).toBe(3)
			expect(from.children[0].id).toBe("c")
		})

		it("should handle changing tag name with ID preservation", () => {
			const from = parseHTML(`
				<div>
					<div id="a">A</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<span id="a">A</span>
				</div>
			`)

			morph(from, to)

			expect(from.querySelector("#a")?.tagName).toBe("SPAN")
		})
	})

	describe("tag name changes", () => {
		it("should change tag name", () => {
			const from = parseHTML("<div><b>Hello</b></div>")
			const to = parseHTML("<div><i>Hello</i></div>")

			morph(from, to)

			expect(from.innerHTML).toBe("<i>Hello</i>")
		})

		it("should change tag name with IDs", () => {
			const from = parseHTML(`
				<div>
					<div id="a">A</div>
					<div id="b">B</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<span id="a">A</span>
					<span id="b">B</span>
				</div>
			`)

			morph(from, to)

			expect(from.querySelector("#a")?.tagName).toBe("SPAN")
			expect(from.querySelector("#b")?.tagName).toBe("SPAN")
		})
	})

	describe("SVG elements", () => {
		it("should handle SVG elements", () => {
			const from = parseHTML(`
				<svg>
					<circle cx="50" cy="50" r="40"></circle>
				</svg>
			`)
			const to = parseHTML(`
				<svg>
					<circle cx="50" cy="50" r="40"></circle>
					<rect x="10" y="10" width="30" height="30"></rect>
				</svg>
			`)

			morph(from, to)

			expect(from.children.length).toBe(2)
			expect(from.children[0].tagName.toLowerCase()).toBe("circle")
			expect(from.children[1].tagName.toLowerCase()).toBe("rect")
		})

		it("should append new SVG elements", () => {
			const from = parseHTML('<svg><circle cx="10" cy="10" r="5"></circle></svg>')
			const to = parseHTML(`
				<svg>
					<circle cx="10" cy="10" r="5"></circle>
					<circle cx="20" cy="20" r="5"></circle>
				</svg>
			`)

			morph(from, to)

			expect(from.children.length).toBe(2)
		})
	})

	describe("data table tests", () => {
		it("should handle complex data table morphing", () => {
			const from = parseHTML(`
				<table>
					<tbody>
						<tr><td>A</td><td>B</td></tr>
						<tr><td>C</td><td>D</td></tr>
					</tbody>
				</table>
			`)
			const to = parseHTML(`
				<table>
					<tbody>
						<tr><td>A</td><td>B</td><td>E</td></tr>
						<tr><td>C</td><td>D</td><td>F</td></tr>
					</tbody>
				</table>
			`)

			morph(from, to)

			const rows = from.querySelectorAll("tr")
			expect(rows.length).toBe(2)
			expect(rows[0].children.length).toBe(3)
			expect(rows[0].children[2].textContent).toBe("E")
			expect(rows[1].children[2].textContent).toBe("F")
		})

		it("should handle data table with row modifications", () => {
			const from = parseHTML(`
				<table>
					<tbody>
						<tr><td>1</td></tr>
						<tr><td>2</td></tr>
						<tr><td>3</td></tr>
					</tbody>
				</table>
			`)
			const to = parseHTML(`
				<table>
					<tbody>
						<tr><td>1</td></tr>
						<tr><td>2 Updated</td></tr>
						<tr><td>3</td></tr>
						<tr><td>4</td></tr>
					</tbody>
				</table>
			`)

			morph(from, to)

			const rows = from.querySelectorAll("tr")
			expect(rows.length).toBe(4)
			expect(rows[1].textContent).toBe("2 Updated")
			expect(rows[3].textContent).toBe("4")
		})
	})

	describe("nested id scenarios", () => {
		it("should handle deeply nested IDs - scenario 2", () => {
			const from = parseHTML(`
				<div>
					<div id="outer">
						<div id="a">A</div>
						<div id="b">B</div>
					</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="outer">
						<div id="b">B</div>
						<div id="a">A</div>
					</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")

			morph(from, to)

			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
		})

		it("should handle deeply nested IDs - scenario 3", () => {
			const from = parseHTML(`
				<div>
					<div id="outer">
						<div>
							<div id="a">A</div>
							<div id="b">B</div>
						</div>
					</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="outer">
						<div>
							<div id="b">B</div>
							<div id="a">A</div>
						</div>
					</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")

			morph(from, to)

			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
		})

		it("should handle deeply nested IDs - scenario 4", () => {
			const from = parseHTML(`
				<div>
					<div id="outer">
						<div id="inner">
							<div id="a">A</div>
							<div id="b">B</div>
						</div>
					</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="outer">
						<div id="inner">
							<div id="b">B</div>
							<div id="a">A</div>
						</div>
					</div>
				</div>
			`)

			const aEl = from.querySelector("#a")
			const bEl = from.querySelector("#b")

			morph(from, to)

			expect(from.querySelector("#a")).toBe(aEl)
			expect(from.querySelector("#b")).toBe(bEl)
		})

		it("should handle deeply nested IDs - scenario 5", () => {
			const from = parseHTML(`
				<div>
					<div id="a">
						<div id="b">B</div>
					</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="a">A</div>
					<div id="b">B</div>
				</div>
			`)

			morph(from, to)

			expect(from.querySelector("#a")?.textContent?.trim()).toBe("A")
			expect(from.querySelector("#b")?.textContent).toBe("B")
		})

		it("should handle deeply nested IDs - scenario 6", () => {
			const from = parseHTML(`
				<div>
					<div id="a">A</div>
					<div id="b">B</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="a">
						<div id="b">B</div>
					</div>
				</div>
			`)

			morph(from, to)

			expect(from.querySelector("#a #b")?.textContent).toBe("B")
		})

		it("should handle deeply nested IDs - scenario 7", () => {
			const from = parseHTML(`
				<div>
					<div id="a">
						<div id="b">
							<div id="c">C</div>
						</div>
					</div>
				</div>
			`)
			const to = parseHTML(`
				<div>
					<div id="a">A</div>
					<div id="b">B</div>
					<div id="c">C</div>
				</div>
			`)

			morph(from, to)

			expect(from.children.length).toBe(3)
			expect(from.querySelector("#a")?.textContent?.trim()).toBe("A")
			expect(from.querySelector("#b")?.textContent?.trim()).toBe("B")
			expect(from.querySelector("#c")?.textContent).toBe("C")
		})
	})

	describe("large document morphing", () => {
		it("should handle large DOM trees efficiently", () => {
			let fromHTML = "<div>"
			let toHTML = "<div>"

			for (let i = 0; i < 100; i++) {
				fromHTML += `<div id="item-${i}">Item ${i}</div>`
				toHTML += `<div id="item-${i}">Item ${i} Updated</div>`
			}

			fromHTML += "</div>"
			toHTML += "</div>"

			const from = parseHTML(fromHTML)
			const to = parseHTML(toHTML)

			const originalElements = Array.from(from.children).map((el) => el)

			morph(from, to)

			// All elements should be preserved
			expect(from.children.length).toBe(100)
			for (let i = 0; i < 100; i++) {
				expect(from.children[i]).toBe(originalElements[i])
				expect(from.children[i].textContent).toBe(`Item ${i} Updated`)
			}
		})
	})
})
