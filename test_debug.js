import { morph } from "./src/morphlex.js"

function dom(html) {
	const tmp = document.createElement("div")
	tmp.innerHTML = html.trim()
	return tmp.firstChild
}

const from = dom(`
	<ul>
		<li>Item 1</li>
		<li>Item 2</li>
		<li>Item 3</li>
	</ul>
`)

const to = dom(`
	<ul>
		<li>Item 2</li>
		<li>Item 3</li>
	</ul>
`)

console.log("From before:", from.outerHTML)
console.log("To:", to.outerHTML)

const observer = new MutationObserver((records) => {
	console.log("Mutations:", records.length)
	records.forEach((r, i) => {
		console.log(`  ${i}: type=${r.type}`)
		if (r.type === "childList") {
			console.log(`    added: ${r.addedNodes.length}, removed: ${r.removedNodes.length}`)
			r.removedNodes.forEach(n => console.log(`      removed: ${n.nodeName} ${n.textContent?.trim()}`))
		}
	})
})

observer.observe(from, { childList: true, subtree: true })

morph(from, to)

const pending = observer.takeRecords()
console.log("Pending mutations:", pending.length)
pending.forEach((r, i) => {
	console.log(`  ${i}: type=${r.type}`)
	if (r.type === "childList") {
		console.log(`    added: ${r.addedNodes.length}, removed: ${r.removedNodes.length}`)
		r.removedNodes.forEach(n => console.log(`      removed: ${n.nodeName} ${n.textContent?.trim()}`))
	}
})

observer.disconnect()

console.log("From after:", from.outerHTML)
