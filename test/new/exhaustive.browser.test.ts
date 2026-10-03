import { test } from "vitest"
import { morph } from "../../src/morphlex"

// Every small tree over a fixed set of nodes, morphed into every other one. Small cases are
// where matching rules interact most, and this covers all of them instead of a random sample.

const LEAVES = [
	"a",
	"<!--c-->",
	"<p></p>",
	'<p id="x"></p>',
	'<i id="y"></i>',
	'<input id="x">',
	"<input>",
	'<input type="checkbox" checked>',
]
const WRAPPERS = ["div", 'div id="x"', 'div id="z"', "span"]

test("every small tree morphs into every other one, and a second morph changes nothing", () => {
	const trees = createTrees()
	const failures: Array<string> = []

	for (const from of trees) {
		for (const to of trees) {
			const failure = check(from, to)
			if (failure) failures.push(failure)
		}
	}

	if (failures.length > 0) {
		failures.sort((a, b) => a.length - b.length)
		throw new Error(`${failures.length} of ${trees.length ** 2} pairs failed. Smallest:\n${failures[0]}`)
	}
})

// Up to two leaves, optionally inside one wrapper, optionally after a leading text node.
function createTrees(): Array<string> {
	const flat = [""]
	for (const first of LEAVES) {
		flat.push(first)
		for (const second of LEAVES) flat.push(first + second)
	}

	const trees = [...flat]
	for (const wrapper of WRAPPERS) {
		const tag = wrapper.split(" ")[0]
		for (const inner of flat) trees.push(`<${wrapper}>${inner}</${tag}>`)
		for (const inner of flat.slice(1, LEAVES.length + 1)) trees.push(`a<${wrapper}>${inner}</${tag}>`)
	}

	return trees
}

function check(from: string, to: string): string | null {
	const host = document.createElement("div")
	host.append(parse(from))
	document.body.append(host)

	try {
		morph(host.firstChild!, parse(to))
		if (!host.firstChild!.isEqualNode(parse(to))) {
			return `${from}  ->  ${to}\nreceived: ${(host.firstChild as Element).innerHTML}`
		}

		const observer = new MutationObserver(() => {})
		observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
		morph(host.firstChild!, parse(to))
		if (observer.takeRecords().length > 0) return `${from}  ->  ${to}\nthe second morph made mutations`

		return null
	} catch (error) {
		return `${from}  ->  ${to}\nthrew ${String(error)}`
	} finally {
		host.remove()
	}
}

function parse(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = `<div>${html}</div>`
	return template.content.firstChild as HTMLElement
}
