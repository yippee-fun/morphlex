import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { morph, morphInner } from "../src/morphlex"

describe("Morphlex Browser Tests", () => {
	let container: HTMLElement

	beforeEach(() => {
		container = document.createElement("div")
		container.id = "test-container"
		document.body.appendChild(container)
	})

	afterEach(() => {
		if (container && container.parentNode) {
			container.parentNode.removeChild(container)
		}
	})

	describe("Browser-specific DOM interactions", () => {
		it("should handle real browser events after morphing", async () => {
			const original = document.createElement("button")
			original.textContent = "Click me"
			let clicked = false

			original.addEventListener("click", () => {
				clicked = true
			})

			container.appendChild(original)

			// Morph with new text but preserve the element
			const reference = document.createElement("button")
			reference.textContent = "Updated button"

			morph(original, reference)

			// Verify the button text changed
			expect(original.textContent).toBe("Updated button")

			// Click the button in the real browser
			original.click()

			// Event listener should still work
			expect(clicked).toBe(true)
		})

		it("should handle CSS transitions in real browser", async () => {
			const original = document.createElement("div")
			original.style.cssText = "width: 100px; transition: width 0.1s;"
			container.appendChild(original)

			// Force browser to compute styles
			const computedStyle = getComputedStyle(original)
			expect(computedStyle.width).toBe("100px")

			// Morph with new styles
			const reference = document.createElement("div")
			reference.style.cssText = "width: 200px; transition: width 0.1s;"

			morph(original, reference)

			// Verify styles were updated
			expect(original.style.width).toBe("200px")
		})

		it("should handle focus state correctly", () => {
			const original = document.createElement("input")
			original.type = "text"
			original.value = "initial"
			container.appendChild(original)

			// Focus the input
			original.focus()
			expect(document.activeElement).toBe(original)

			// Morph with new attributes
			const reference = document.createElement("input")
			reference.type = "text"
			reference.value = "updated"
			reference.placeholder = "Enter text"

			morph(original, reference)

			// Focus should be preserved on the same element
			expect(document.activeElement).toBe(original)
			expect(original.value).toBe("updated")
			expect(original.placeholder).toBe("Enter text")
		})

		it("should handle complex nested structures", () => {
			container.innerHTML = `
				<div class="parent">
					<h1>Title</h1>
					<ul>
						<li>Item 1</li>
						<li>Item 2</li>
						<li>Item 3</li>
					</ul>
				</div>
			`

			const original = container.firstElementChild as HTMLElement
			const originalH1 = original.querySelector("h1")

			const referenceHTML = `
				<div class="parent modified">
					<h1>Updated Title</h1>
					<ul>
						<li>Item 1 - Modified</li>
						<li>Item 2</li>
						<li>New Item 3</li>
						<li>Item 4</li>
					</ul>
				</div>
			`

			morph(original, referenceHTML)

			// Check the structure is updated
			expect(original.className).toBe("parent modified")
			expect(originalH1?.textContent).toBe("Updated Title")

			const newItems = Array.from(original.querySelectorAll("li"))
			expect(newItems.length).toBe(4)
			expect(newItems[0].textContent).toBe("Item 1 - Modified")
			expect(newItems[3].textContent).toBe("Item 4")
		})

		it("should handle SVG elements in real browser", () => {
			const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
			svg.setAttribute("width", "100")
			svg.setAttribute("height", "100")

			const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
			circle.setAttribute("cx", "50")
			circle.setAttribute("cy", "50")
			circle.setAttribute("r", "40")
			circle.setAttribute("fill", "red")

			svg.appendChild(circle)
			container.appendChild(svg)

			const referenceSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg")
			referenceSVG.setAttribute("width", "200")
			referenceSVG.setAttribute("height", "200")

			const referenceCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
			referenceCircle.setAttribute("cx", "100")
			referenceCircle.setAttribute("cy", "100")
			referenceCircle.setAttribute("r", "80")
			referenceCircle.setAttribute("fill", "blue")

			referenceSVG.appendChild(referenceCircle)

			morph(svg, referenceSVG)

			expect(svg.getAttribute("width")).toBe("200")
			expect(svg.getAttribute("height")).toBe("200")

			const morphedCircle = svg.querySelector("circle")
			expect(morphedCircle?.getAttribute("cx")).toBe("100")
			expect(morphedCircle?.getAttribute("cy")).toBe("100")
			expect(morphedCircle?.getAttribute("r")).toBe("80")
			expect(morphedCircle?.getAttribute("fill")).toBe("blue")
		})

		it("should handle form inputs and maintain state", () => {
			const form = document.createElement("form")
			form.innerHTML = `
				<input type="text" name="username" value="john">
				<input type="checkbox" name="remember" checked>
				<select name="country">
					<option value="us">United States</option>
					<option value="uk" selected>United Kingdom</option>
				</select>
			`
			container.appendChild(form)

			const textInput = form.querySelector('input[name="username"]') as HTMLInputElement
			const checkbox = form.querySelector('input[name="remember"]') as HTMLInputElement
			const select = form.querySelector('select[name="country"]') as HTMLSelectElement

			// Modify the values in the browser
			textInput.value = "jane"
			checkbox.checked = false
			select.value = "us"

			// Create reference with different structure but same form fields
			const referenceForm = document.createElement("form")
			referenceForm.className = "updated-form"
			referenceForm.innerHTML = `
				<div class="form-group">
					<input type="text" name="username" value="john" placeholder="Username">
				</div>
				<div class="form-group">
					<input type="checkbox" name="remember" checked>
					<label>Remember me</label>
				</div>
				<div class="form-group">
					<select name="country" class="country-select">
						<option value="us">United States</option>
						<option value="uk" selected>United Kingdom</option>
						<option value="ca">Canada</option>
					</select>
				</div>
			`

			morph(form, referenceForm)

			// Form should have new structure
			expect(form.className).toBe("updated-form")
			expect(form.querySelectorAll(".form-group").length).toBe(3)

			// The form elements should be the same instances (preserved)
			const newTextInput = form.querySelector('input[name="username"]') as HTMLInputElement
			const newCheckbox = form.querySelector('input[name="remember"]') as HTMLInputElement
			const newSelect = form.querySelector('select[name="country"]') as HTMLSelectElement

			// Values from reference should be applied (morph doesn't preserve user modifications by default)
			expect(newTextInput.value).toBe("john")
			expect(newCheckbox.checked).toBe(true)
			expect(newSelect.value).toBe("uk")

			// New attributes should be applied
			expect(newTextInput.placeholder).toBe("Username")
			expect(newSelect.className).toBe("country-select")
		})

		it("should handle morphInner with browser content", () => {
			const testContainer = document.createElement("div")
			testContainer.innerHTML = `
				<p>Old paragraph</p>
				<button>Old button</button>
			`
			document.body.appendChild(testContainer)

			const referenceContainer = document.createElement("div")
			referenceContainer.innerHTML = `
				<h2>New heading</h2>
				<p>New paragraph</p>
				<button>New button</button>
				<span>New span</span>
			`

			morphInner(testContainer, referenceContainer)

			expect(testContainer.children.length).toBe(4)
			expect(testContainer.querySelector("h2")?.textContent).toBe("New heading")
			expect(testContainer.querySelector("p")?.textContent).toBe("New paragraph")
			expect(testContainer.querySelector("button")?.textContent).toBe("New button")
			expect(testContainer.querySelector("span")?.textContent).toBe("New span")

			testContainer.remove()
		})

		it("should handle custom elements if supported", () => {
			// Skip if custom elements are not supported
			if (!window.customElements) {
				return
			}

			// Define a simple custom element
			class TestElement extends HTMLElement {
				connectedCallback() {
					this.innerHTML = "<span>Custom content</span>"
				}
			}

			// Register it if not already registered
			if (!customElements.get("test-element")) {
				customElements.define("test-element", TestElement)
			}

			const original = document.createElement("div")
			original.innerHTML = `<test-element id="custom"></test-element>`
			container.appendChild(original)

			// Wait for custom element to be upgraded
			const customEl = original.querySelector("#custom")
			expect(customEl).toBeTruthy()

			const reference = document.createElement("div")
			reference.innerHTML = `<test-element id="custom" data-updated="true"></test-element>`

			morph(original, reference)

			const morphedCustom = original.querySelector("#custom") as HTMLElement
			expect(morphedCustom).toBeTruthy()
			expect(morphedCustom.getAttribute("data-updated")).toBe("true")
		})

		it("should handle real browser viewport and scroll position", () => {
			// Create a scrollable container
			const scrollContainer = document.createElement("div")
			scrollContainer.style.cssText = "height: 200px; overflow-y: scroll; position: relative;"
			scrollContainer.innerHTML = `
				<div style="height: 500px;">
					<p id="p1">Paragraph 1</p>
					<p id="p2" style="margin-top: 200px;">Paragraph 2</p>
					<p id="p3" style="margin-top: 200px;">Paragraph 3</p>
				</div>
			`
			container.appendChild(scrollContainer)

			// Scroll to middle
			scrollContainer.scrollTop = 100
			const initialScrollTop = scrollContainer.scrollTop

			// Morph with new content
			const referenceContainer = document.createElement("div")
			referenceContainer.style.cssText = "height: 200px; overflow-y: scroll; position: relative;"
			referenceContainer.innerHTML = `
				<div style="height: 500px;">
					<p id="p1" class="updated">Updated Paragraph 1</p>
					<p id="p2" style="margin-top: 200px;">Updated Paragraph 2</p>
					<p id="p3" style="margin-top: 200px;">Updated Paragraph 3</p>
					<p id="p4" style="margin-top: 200px;">New Paragraph 4</p>
				</div>
			`

			morph(scrollContainer, referenceContainer)

			// Scroll position should be preserved
			expect(scrollContainer.scrollTop).toBe(initialScrollTop)

			// Content should be updated
			const p1 = scrollContainer.querySelector("#p1")
			expect(p1?.className).toBe("updated")
			expect(p1?.textContent).toBe("Updated Paragraph 1")

			const p4 = scrollContainer.querySelector("#p4")
			expect(p4).toBeTruthy()
			expect(p4?.textContent).toBe("New Paragraph 4")
		})
	})
})
