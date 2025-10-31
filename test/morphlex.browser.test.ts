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

		it("should handle table elements properly", () => {
			const table = document.createElement("table")
			table.innerHTML = `
				<thead>
					<tr><th>Name</th><th>Age</th></tr>
				</thead>
				<tbody>
					<tr id="row1"><td>Alice</td><td>30</td></tr>
					<tr id="row2"><td>Bob</td><td>25</td></tr>
				</tbody>
			`
			container.appendChild(table)

			const row1 = table.querySelector("#row1")
			const row2 = table.querySelector("#row2")

			const referenceTable = document.createElement("table")
			referenceTable.className = "updated"
			referenceTable.innerHTML = `
				<thead>
					<tr><th>Name</th><th>Age</th><th>City</th></tr>
				</thead>
				<tbody>
					<tr id="row1"><td>Alice</td><td>31</td><td>NYC</td></tr>
					<tr id="row2"><td>Bob</td><td>25</td><td>LA</td></tr>
					<tr id="row3"><td>Charlie</td><td>35</td><td>SF</td></tr>
				</tbody>
			`

			morph(table, referenceTable)

			expect(table.className).toBe("updated")
			expect(table.querySelector("#row1")).toBe(row1)
			expect(table.querySelector("#row2")).toBe(row2)
			expect(table.querySelectorAll("tbody tr").length).toBe(3)
			expect(table.querySelectorAll("thead th").length).toBe(3)
		})

		it("should handle iframe elements", () => {
			const div = document.createElement("div")
			div.innerHTML = '<iframe id="frame1" src="about:blank"></iframe>'
			container.appendChild(div)

			const frame1 = div.querySelector("#frame1")

			const referenceDiv = document.createElement("div")
			referenceDiv.innerHTML = '<iframe id="frame1" src="about:blank" title="Updated"></iframe>'

			morph(div, referenceDiv)

			const updatedFrame = div.querySelector("#frame1") as HTMLIFrameElement
			expect(updatedFrame).toBe(frame1)
			expect(updatedFrame.title).toBe("Updated")
		})

		it("should handle canvas elements", () => {
			const div = document.createElement("div")
			const canvas = document.createElement("canvas")
			canvas.id = "canvas1"
			canvas.width = 100
			canvas.height = 100
			div.appendChild(canvas)
			container.appendChild(div)

			const ctx = canvas.getContext("2d")
			if (ctx) {
				ctx.fillStyle = "red"
				ctx.fillRect(0, 0, 50, 50)
			}

			const referenceDiv = document.createElement("div")
			const referenceCanvas = document.createElement("canvas")
			referenceCanvas.id = "canvas1"
			referenceCanvas.width = 200
			referenceCanvas.height = 200
			referenceDiv.appendChild(referenceCanvas)

			morph(div, referenceDiv)

			const updatedCanvas = div.querySelector("#canvas1") as HTMLCanvasElement
			expect(updatedCanvas).toBe(canvas)
			expect(updatedCanvas.width).toBe(200)
			expect(updatedCanvas.height).toBe(200)
		})

		it("should handle video and audio elements", () => {
			const div = document.createElement("div")
			div.innerHTML = `
				<video id="vid1" width="320" height="240" controls>
					<source src="movie.mp4" type="video/mp4">
				</video>
				<audio id="aud1" controls>
					<source src="audio.mp3" type="audio/mpeg">
				</audio>
			`
			container.appendChild(div)

			const video = div.querySelector("#vid1")
			const audio = div.querySelector("#aud1")

			const referenceDiv = document.createElement("div")
			referenceDiv.innerHTML = `
				<video id="vid1" width="640" height="480" controls autoplay>
					<source src="movie.mp4" type="video/mp4">
				</video>
				<audio id="aud1" controls loop>
					<source src="audio.mp3" type="audio/mpeg">
				</audio>
			`

			morph(div, referenceDiv)

			const updatedVideo = div.querySelector("#vid1") as HTMLVideoElement
			const updatedAudio = div.querySelector("#aud1") as HTMLAudioElement

			expect(updatedVideo).toBe(video)
			expect(updatedAudio).toBe(audio)
			expect(updatedVideo.getAttribute("width")).toBe("640")
			expect(updatedVideo.hasAttribute("autoplay")).toBe(true)
			expect(updatedAudio.hasAttribute("loop")).toBe(true)
		})

		it("should handle data attributes", () => {
			const div = document.createElement("div")
			div.setAttribute("data-user-id", "123")
			div.setAttribute("data-role", "admin")
			div.textContent = "User panel"
			container.appendChild(div)

			const referenceDiv = document.createElement("div")
			referenceDiv.setAttribute("data-user-id", "456")
			referenceDiv.setAttribute("data-role", "user")
			referenceDiv.setAttribute("data-active", "true")
			referenceDiv.textContent = "User panel"

			morph(div, referenceDiv)

			expect(div.getAttribute("data-user-id")).toBe("456")
			expect(div.getAttribute("data-role")).toBe("user")
			expect(div.getAttribute("data-active")).toBe("true")
			expect(div.dataset.userId).toBe("456")
			expect(div.dataset.role).toBe("user")
			expect(div.dataset.active).toBe("true")
		})

		it("should handle aria attributes", () => {
			const button = document.createElement("button")
			button.setAttribute("aria-label", "Close")
			button.setAttribute("aria-expanded", "false")
			button.textContent = "X"
			container.appendChild(button)

			const referenceButton = document.createElement("button")
			referenceButton.setAttribute("aria-label", "Open")
			referenceButton.setAttribute("aria-expanded", "true")
			referenceButton.setAttribute("aria-controls", "menu")
			referenceButton.textContent = "☰"

			morph(button, referenceButton)

			expect(button.getAttribute("aria-label")).toBe("Open")
			expect(button.getAttribute("aria-expanded")).toBe("true")
			expect(button.getAttribute("aria-controls")).toBe("menu")
			expect(button.textContent).toBe("☰")
		})

		it("should handle style object changes", () => {
			const div = document.createElement("div")
			div.style.color = "red"
			div.style.fontSize = "16px"
			div.style.padding = "10px"
			container.appendChild(div)

			const referenceDiv = document.createElement("div")
			referenceDiv.style.color = "blue"
			referenceDiv.style.fontSize = "20px"
			referenceDiv.style.margin = "5px"

			morph(div, referenceDiv)

			expect(div.style.color).toBe("blue")
			expect(div.style.fontSize).toBe("20px")
			expect(div.style.margin).toBe("5px")
		})

		it("should handle class list manipulation", () => {
			const div = document.createElement("div")
			div.className = "class1 class2 class3"
			container.appendChild(div)

			expect(div.classList.contains("class1")).toBe(true)
			expect(div.classList.contains("class2")).toBe(true)

			const referenceDiv = document.createElement("div")
			referenceDiv.className = "class2 class4 class5"

			morph(div, referenceDiv)

			expect(div.classList.contains("class1")).toBe(false)
			expect(div.classList.contains("class2")).toBe(true)
			expect(div.classList.contains("class3")).toBe(false)
			expect(div.classList.contains("class4")).toBe(true)
			expect(div.classList.contains("class5")).toBe(true)
		})

		it("should handle boolean attributes correctly", () => {
			const button = document.createElement("button")
			button.disabled = true
			button.textContent = "Submit"
			container.appendChild(button)

			const referenceButton = document.createElement("button")
			referenceButton.textContent = "Submit"
			// disabled is not set, so it should be removed

			morph(button, referenceButton)

			expect(button.disabled).toBe(false)
			expect(button.hasAttribute("disabled")).toBe(false)

			// Now add it back
			const referenceButton2 = document.createElement("button")
			referenceButton2.disabled = true
			referenceButton2.textContent = "Submit"

			morph(button, referenceButton2)

			expect(button.disabled).toBe(true)
		})

		it("should handle readonly and required attributes on inputs", () => {
			const input = document.createElement("input")
			input.type = "text"
			input.required = true
			container.appendChild(input)

			const referenceInput = document.createElement("input")
			referenceInput.type = "text"
			referenceInput.readOnly = true

			morph(input, referenceInput)

			expect(input.required).toBe(false)
			expect(input.readOnly).toBe(true)
		})

		it("should handle multiple select options", () => {
			const select = document.createElement("select")
			select.multiple = true
			select.innerHTML = `
				<option value="1" selected>Option 1</option>
				<option value="2" selected>Option 2</option>
				<option value="3">Option 3</option>
			`
			container.appendChild(select)

			expect(select.selectedOptions.length).toBe(2)

			const referenceSelect = document.createElement("select")
			referenceSelect.multiple = true
			referenceSelect.innerHTML = `
				<option value="1">Option 1</option>
				<option value="2" selected>Option 2</option>
				<option value="3" selected>Option 3</option>
			`

			morph(select, referenceSelect)

			expect(select.selectedOptions.length).toBe(2)
			expect(select.selectedOptions[0].value).toBe("2")
			expect(select.selectedOptions[1].value).toBe("3")
		})

		it("should handle script tags safely", () => {
			const div = document.createElement("div")
			div.innerHTML = '<div id="content">Content</div>'
			container.appendChild(div)

			const referenceDiv = document.createElement("div")
			referenceDiv.innerHTML = '<div id="content">Updated</div><script>console.log("test")</script>'

			morph(div, referenceDiv)

			expect(div.querySelector("#content")?.textContent).toBe("Updated")
			expect(div.querySelector("script")).toBeTruthy()
		})

		it("should handle deep nesting with many levels", () => {
			const createNested = (depth: number, id: string): string => {
				if (depth === 0) return `<span id="${id}">Leaf ${id}</span>`
				return `<div id="level-${depth}"><div>${createNested(depth - 1, id)}</div></div>`
			}

			const div = document.createElement("div")
			div.innerHTML = createNested(10, "original")
			container.appendChild(div)

			const leaf = div.querySelector("#original")

			const referenceDiv = document.createElement("div")
			referenceDiv.innerHTML = createNested(10, "original")
			referenceDiv.querySelector("#original")!.textContent = "Leaf updated"

			morph(div, referenceDiv)

			expect(div.querySelector("#original")).toBe(leaf)
			expect(div.querySelector("#original")?.textContent).toBe("Leaf updated")
		})

		it("should handle text nodes with special characters", () => {
			const div = document.createElement("div")
			div.textContent = 'Hello <World> & "Friends"'
			container.appendChild(div)

			const referenceDiv = document.createElement("div")
			referenceDiv.textContent = "Goodbye <Universe> & 'Enemies'"

			morph(div, referenceDiv)

			expect(div.textContent).toBe("Goodbye <Universe> & 'Enemies'")
		})

		it("should handle whitespace preservation", () => {
			const pre = document.createElement("pre")
			pre.textContent = "Line 1\n  Line 2\n    Line 3"
			container.appendChild(pre)

			const referencePre = document.createElement("pre")
			referencePre.textContent = "Line 1\n    Line 2\n      Line 3\nLine 4"

			morph(pre, referencePre)

			expect(pre.textContent).toBe("Line 1\n    Line 2\n      Line 3\nLine 4")
		})

		it("should handle radio button groups", () => {
			const form = document.createElement("form")
			form.innerHTML = `
				<input type="radio" name="choice" value="a" id="radio-a" checked>
				<input type="radio" name="choice" value="b" id="radio-b">
				<input type="radio" name="choice" value="c" id="radio-c">
			`
			container.appendChild(form)

			const radioA = form.querySelector("#radio-a") as HTMLInputElement
			expect(radioA.checked).toBe(true)

			const referenceForm = document.createElement("form")
			referenceForm.innerHTML = `
				<input type="radio" name="choice" value="a" id="radio-a">
				<input type="radio" name="choice" value="b" id="radio-b" checked>
				<input type="radio" name="choice" value="c" id="radio-c">
			`

			morph(form, referenceForm)

			const radioB = form.querySelector("#radio-b") as HTMLInputElement
			expect(radioA.checked).toBe(false)
			expect(radioB.checked).toBe(true)
		})

		it("should handle contenteditable elements", () => {
			const div = document.createElement("div")
			div.contentEditable = "true"
			div.textContent = "Editable content"
			container.appendChild(div)

			// User types something
			div.textContent = "User modified content"

			const referenceDiv = document.createElement("div")
			referenceDiv.contentEditable = "true"
			referenceDiv.textContent = "Server content"

			morph(div, referenceDiv)

			// Content should be updated from server
			expect(div.textContent).toBe("Server content")
			expect(div.contentEditable).toBe("true")
		})

		it("should handle elements with shadow DOM", () => {
			const host = document.createElement("div")
			host.id = "shadow-host"

			// Attach shadow root
			const shadowRoot = host.attachShadow({ mode: "open" })
			shadowRoot.innerHTML = "<p>Shadow content</p>"

			container.appendChild(host)

			const referenceHost = document.createElement("div")
			referenceHost.id = "shadow-host"
			referenceHost.setAttribute("data-version", "2")

			morph(host, referenceHost)

			// Shadow root should be preserved
			expect(host.shadowRoot).toBe(shadowRoot)
			expect(host.shadowRoot?.innerHTML).toBe("<p>Shadow content</p>")
			expect(host.getAttribute("data-version")).toBe("2")
		})

		it("should handle large attribute sets", () => {
			const div = document.createElement("div")
			for (let i = 0; i < 50; i++) {
				div.setAttribute(`data-attr-${i}`, `value-${i}`)
			}
			container.appendChild(div)

			const referenceDiv = document.createElement("div")
			for (let i = 0; i < 50; i++) {
				referenceDiv.setAttribute(`data-attr-${i}`, `updated-${i}`)
			}
			referenceDiv.setAttribute("data-attr-50", "new-value")

			morph(div, referenceDiv)

			for (let i = 0; i < 50; i++) {
				expect(div.getAttribute(`data-attr-${i}`)).toBe(`updated-${i}`)
			}
			expect(div.getAttribute("data-attr-50")).toBe("new-value")
		})

		it("should handle progress and meter elements", () => {
			const div = document.createElement("div")
			div.innerHTML = `
				<progress id="prog" value="30" max="100"></progress>
				<meter id="met" value="0.6" min="0" max="1"></meter>
			`
			container.appendChild(div)

			const progress = div.querySelector("#prog") as HTMLProgressElement
			const meter = div.querySelector("#met") as HTMLMeterElement

			const referenceDiv = document.createElement("div")
			referenceDiv.innerHTML = `
				<progress id="prog" value="70" max="100"></progress>
				<meter id="met" value="0.8" min="0" max="1" high="0.9" low="0.3"></meter>
			`

			morph(div, referenceDiv)

			expect(progress.value).toBe(70)
			expect(meter.value).toBe(0.8)
			expect(meter.high).toBe(0.9)
			expect(meter.low).toBe(0.3)
		})

		it("should handle details and summary elements", () => {
			const details = document.createElement("details")
			details.open = true
			details.innerHTML = `
				<summary>Click to expand</summary>
				<p>Hidden content</p>
			`
			container.appendChild(details)

			const referenceDetails = document.createElement("details")
			referenceDetails.innerHTML = `
				<summary>Click to collapse</summary>
				<p>Visible content</p>
			`

			morph(details, referenceDetails)

			expect(details.open).toBe(false)
			expect(details.querySelector("summary")?.textContent).toBe("Click to collapse")
			expect(details.querySelector("p")?.textContent).toBe("Visible content")
		})

		it("should preserve element references across morphs", () => {
			const button = document.createElement("button")
			button.id = "my-btn"
			button.textContent = "Click"
			container.appendChild(button)

			const buttonRef = button
			let clickCount = 0

			button.addEventListener("click", () => {
				clickCount++
			})

			// Morph multiple times
			for (let i = 1; i <= 5; i++) {
				const reference = document.createElement("button")
				reference.id = "my-btn"
				reference.textContent = `Click ${i}`
				reference.setAttribute("data-version", i.toString())

				morph(button, reference)

				expect(button).toBe(buttonRef)
				expect(button.textContent).toBe(`Click ${i}`)
				expect(button.getAttribute("data-version")).toBe(i.toString())
			}

			button.click()
			expect(clickCount).toBe(1)
		})
	})
})
