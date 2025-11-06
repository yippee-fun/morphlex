import { morph } from "./src/morphlex.js"
import { JSDOM } from "jsdom"

const dom = new JSDOM()
global.document = dom.window.document
global.Element = dom.window.Element
global.HTMLInputElement = dom.window.HTMLInputElement
global.DOMParser = dom.window.DOMParser
global.Node = dom.window.Node

function domEl(html) {
	const tmp = document.createElement("div")
	tmp.innerHTML = html.trim()
	return tmp.firstChild
}

const a = domEl(`<div>
	<input type="text" value="wrong">
	<input type="checkbox" value="right">
</div>`)

const b = domEl(`<div>
	<input type="checkbox" value="new">
</div>`)

const textInput = a.children[0]
const checkboxInput = a.children[1]

console.log("Before morph:")
console.log("textInput:", textInput.outerHTML)
console.log("checkboxInput:", checkboxInput.outerHTML)

morph(a, b)

console.log("\nAfter morph:")
console.log("a.children.length:", a.children.length)
console.log("a.children[0]:", a.children[0].outerHTML)
console.log("a.children[0] === textInput:", a.children[0] === textInput)
console.log("a.children[0] === checkboxInput:", a.children[0] === checkboxInput)
