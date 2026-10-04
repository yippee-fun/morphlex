import { test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// Random trees of mixed elements, text and comments, morphed into a mutated or unrelated
// tree. Each test checks one property over every seed and reports the smallest failure.

type Random = () => number

type TreeNode = TextNode | CommentNode | ElementNode
type TextNode = { kind: "text"; value: string }
type CommentNode = { kind: "comment"; value: string }
type ElementNode = { kind: "element"; tag: string; attributes: Array<[string, string]>; children: Array<TreeNode> }

type Case = { seed: number; fromHtml: string; toHtml: string }

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_TREE_SEEDS", 150)
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => 0x7e00 + index)

const TAGS = [
	"div",
	"span",
	"p",
	"ul",
	"li",
	"section",
	"button",
	"a",
	"b",
	"input",
	"textarea",
	"select",
	"option",
	"details",
	"summary",
	"template",
	"svg",
	"label",
	"form",
	"img",
] as const
const SVG_TAGS = ["g", "circle", "text", "title", "a", "rect"] as const
const VOID_TAGS = ["input", "img"]
const IDS = ["a", "b", "c", "d", "e", "f"]
const ATTRIBUTES = [
	"class",
	"data-x",
	"title",
	"name",
	"href",
	"value",
	"type",
	"checked",
	"selected",
	"open",
	"disabled",
	"@click",
	":class",
	"x-on:click.prevent",
	"xlink:href",
]
const INPUT_TYPES = ["text", "checkbox", "radio", "hidden"]
const ATTRIBUTE_VALUES = ["", "1", "2", "on"]
const TEXTS = ["", " ", "\n  ", "hello", "world", " ", "x y", "123"]

test("the result matches the target", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		morph(host.firstChild!, parse(scenario.toHtml))
		if (!isSameTree(host.firstChild!, parse(scenario.toHtml))) fail(host)
	})
})

test("morphing again to the same target makes no mutations", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		morph(host.firstChild!, parse(scenario.toHtml))

		const observer = new MutationObserver(() => {})
		observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
		morph(host.firstChild!, parse(scenario.toHtml))
		if (observer.takeRecords().length > 0) fail(host)
		observer.disconnect()
	})
})

test("preserveChanges without any user changes matches the target, apart from open state", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		morph(host.firstChild!, parse(scenario.toHtml), { preserveChanges: true })
		if (!isSameTree(withoutOpen(host.firstChild!), withoutOpen(parse(scenario.toHtml)))) fail(host)
	})
})

test("callbacks that allow every change don't change the result", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const problems: Array<string> = []

		morph(host.firstChild!, parse(scenario.toHtml), {
			beforeNodeVisited: () => true,
			afterNodeVisited: () => {},
			beforeNodeAdded: () => true,
			afterNodeAdded: (node) => {
				if (!host.contains(node)) problems.push("afterNodeAdded")
			},
			beforeNodeRemoved: () => true,
			afterNodeRemoved: (node) => {
				if (host.contains(node)) problems.push("afterNodeRemoved")
			},
			beforeAttributeUpdated: () => true,
			afterAttributeUpdated: (element) => {
				if (!host.contains(element)) problems.push("afterAttributeUpdated")
			},
			beforeChildrenVisited: () => true,
			afterChildrenVisited: () => {},
		})

		if (problems.length > 0 || !isSameTree(host.firstChild!, parse(scenario.toHtml))) fail(host)
	})
})

test("morphInner with a string matches the target", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		morphInner(host.firstChild!, scenario.toHtml)
		if (!isSameTree(host.firstChild!, parse(scenario.toHtml))) fail(host)
	})
})

test("preserveChanges keeps every user change on a control it keeps", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const changes = changeControls(host, scenario.seed)

		morph(host.firstChild!, parse(scenario.toHtml), { preserveChanges: true })

		for (const change of changes) {
			if (isKept(host, change) && readChange(change.control) !== change.value) fail(host)
		}
	})
})

test("morphing without preserveChanges resets every user change on a control it keeps", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const changes = changeControls(host, scenario.seed)

		morph(host.firstChild!, parse(scenario.toHtml))

		for (const change of changes) {
			if (isKept(host, change) && readChange(change.control) !== readDefault(change.control)) fail(host)
		}
	})
})

test("adding a node at the end makes only that one mutation", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const target = parse(scenario.fromHtml)
		target.append(document.createElement("hr"))

		if (countMutations(host, () => morph(host.firstChild!, target)) !== 1) fail(host)
	})
})

test("removing the last node makes only that one mutation", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const target = parse(scenario.fromHtml)
		if (!target.lastChild) return
		target.lastChild.remove()

		if (countMutations(host, () => morph(host.firstChild!, target)) !== 1) fail(host)
	})
})

test("changing one attribute makes only that one mutation", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const target = parse(scenario.fromHtml)
		// Unnamed form controls, and elements with an empty name, href or src, are replaced when they
		// differ. And a changed element with an identical sibling swaps places with it. So leave them
		// and their descendants alone.
		const replaced = "input, textarea, select, [name=''], [href=''], [src='']"
		const elements = [target, ...target.querySelectorAll("*")].filter(
			(element) => !element.closest(replaced) && !hasEqualSiblingUpTo(element, target),
		)
		elements[scenario.seed % elements.length]!.setAttribute("data-changed", "")

		if (countMutations(host, () => morph(host.firstChild!, target)) !== 1) fail(host)
	})
})

test("nodes that move themselves out when they connect leave the rest in target order", () => {
	check((scenario, fail) => {
		const random = createRandom(scenario.seed ^ 0x2545f491)
		const host = mount(scenario.fromHtml)
		withTeleports(random, host.firstChild as HTMLElement, 0.15)
		const to = withTeleports(random, parse(scenario.toHtml), 0.3)

		teleporting = true
		try {
			morph(host.firstChild!, to)
		} finally {
			teleporting = false
			portal.replaceChildren()
		}

		if (!isSameTree(withoutTeleports(host.firstChild!), withoutTeleports(parse(scenario.toHtml)))) fail(host)
	})
})

test("afterNodeAdded can move the new node away, remove the node after it and append another, and the rest stays in target order", () => {
	check((scenario, fail) => {
		const random = createRandom(scenario.seed ^ 0x68e31da4)
		const host = mount(scenario.fromHtml)
		const to = parse(scenario.toHtml)
		let order = 0
		for (const element of [to, ...to.querySelectorAll("*")]) element.setAttribute("data-order", String(order++))

		morph(host.firstChild!, to, {
			afterNodeAdded: (node) => {
				if (random() < 0.3) node.nextSibling?.remove()
				if (random() < 0.2) node.parentNode?.append(document.createElement("u"))
				if (random() < 0.3) portal.append(node)
			},
		})
		portal.replaceChildren()

		for (const element of [host, ...host.querySelectorAll("*")]) {
			let previous = -1
			for (const child of element.children) {
				// Elements the callback added have no order.
				if (!child.hasAttribute("data-order")) continue
				const current = Number(child.getAttribute("data-order"))
				if (current <= previous) fail(host)
				previous = current
			}
		}
	})
})

let teleporting = false
const portal = document.createElement("div")
customElements.define(
	"x-tree-fuzz-teleport",
	class extends HTMLElement {
		connectedCallback(): void {
			if (teleporting && this.parentNode !== portal) portal.append(this)
		}
	},
)

// Adds elements that move themselves out of the tree whenever they connect during a morph.
function withTeleports(random: Random, root: HTMLElement, chance: number): HTMLElement {
	for (const element of [root, ...root.querySelectorAll("*")]) {
		if (element.closest("template, svg, select, textarea") || VOID_TAGS.includes(element.localName)) continue
		if (random() >= chance) continue
		const index = randomInt(random, 0, element.childNodes.length)
		element.insertBefore(document.createElement("x-tree-fuzz-teleport"), element.childNodes[index] ?? null)
	}
	return root
}

function withoutTeleports(node: Node): Node {
	const clone = node.cloneNode(true) as Element
	for (const teleport of clone.querySelectorAll("x-tree-fuzz-teleport")) teleport.remove()
	clone.normalize()
	return clone
}

function check(property: (scenario: Case, fail: (host: HTMLElement) => void) => void): void {
	let smallest: string | null = null
	let failures = 0

	for (const seed of SEEDS) {
		const scenario = createCase(seed)
		let failed = false

		const fail = (host: HTMLElement) => {
			if (failed) return
			failed = true
			failures++

			const report = `seed ${seed}\nfrom:     ${scenario.fromHtml}\nto:       ${scenario.toHtml}\nreceived: ${(host.firstChild as Element).outerHTML}`
			if (smallest === null || report.length < smallest.length) smallest = report
		}

		try {
			property(scenario, fail)
		} catch (error) {
			failures++
			const report = `seed ${seed} threw ${String(error)}\nfrom: ${scenario.fromHtml}\nto:   ${scenario.toHtml}`
			if (smallest === null || report.length < smallest.length) smallest = report
		} finally {
			for (const host of document.querySelectorAll("[data-tree-fuzz]")) host.remove()
		}
	}

	if (smallest !== null) {
		throw new Error(`${failures} of ${SEEDS.length} seeds failed. Smallest failure:\n${smallest}`)
	}
}

function createCase(seed: number): Case {
	const random = createRandom(seed)
	const from = Array.from({ length: randomInt(random, 1, 5) }, () => createNode(random, 3, false))

	const to =
		random() < 0.15
			? Array.from({ length: randomInt(random, 1, 5) }, () => createNode(random, 3, false))
			: from.map((node) => mutateNode(random, node, 3))

	if (random() < 0.3) to.splice(randomInt(random, 0, to.length), 0, createNode(random, 2, false))

	// Serialize through the parser, so the HTML round-trips exactly.
	return { seed, fromHtml: parse(toHtml(from)).outerHTML, toHtml: parse(toHtml(to)).outerHTML }
}

function createNode(random: Random, depth: number, inSvg: boolean): TreeNode {
	const roll = random()
	if (roll < 0.2) return { kind: "text", value: pick(random, TEXTS) }
	if (roll < 0.25) return { kind: "comment", value: pick(random, TEXTS) }

	const tag = inSvg ? pick(random, SVG_TAGS) : pick(random, TAGS)
	const attributes: Array<[string, string]> = []
	if (random() < 0.45) attributes.push(["id", pick(random, IDS)])

	for (let count = randomInt(random, 0, 2); count > 0; count--) {
		const name = pick(random, ATTRIBUTES)
		if (attributes.some(([existing]) => existing === name)) continue
		attributes.push([name, name === "type" ? pick(random, INPUT_TYPES) : pick(random, ATTRIBUTE_VALUES)])
	}

	const children: Array<TreeNode> = []
	if (depth > 0 && !VOID_TAGS.includes(tag)) {
		for (let count = randomInt(random, 0, 4); count > 0; count--) {
			children.push(createNode(random, depth - 1, inSvg || tag === "svg"))
		}
	}

	return { kind: "element", tag, attributes, children }
}

function mutateNode(random: Random, node: TreeNode, depth: number): TreeNode {
	if (node.kind !== "element") {
		if (random() < 0.3) return { kind: "text", value: pick(random, TEXTS) }
		if (random() < 0.3) return { ...node, value: pick(random, TEXTS) }
		return node
	}

	const isSvg = node.tag === "svg" || (SVG_TAGS as ReadonlyArray<string>).includes(node.tag)
	const tag = random() < 0.08 && !isSvg ? pick(random, TAGS) : node.tag
	let attributes = node.attributes.map(([name, value]): [string, string] => [name, value])

	if (random() < 0.3) {
		const operation = randomInt(random, 0, 2)
		if (operation === 0 && attributes.length > 0) {
			attributes.splice(randomInt(random, 0, attributes.length - 1), 1)
		} else if (operation === 1) {
			const name = random() < 0.4 ? "id" : pick(random, ATTRIBUTES)
			attributes = attributes.filter(([existing]) => existing !== name)
			attributes.push([name, name === "id" ? pick(random, IDS) : pick(random, ["", "1", "3"])])
		} else if (attributes.length > 0) {
			attributes[randomInt(random, 0, attributes.length - 1)]![1] = pick(random, ["", "9", "z"])
		}
	}

	let children = node.children.map((child) => (random() < 0.7 ? mutateNode(random, child, depth - 1) : child))
	if (random() < 0.3) children = shuffle(random, children)
	if (random() < 0.2 && children.length > 0) children.splice(randomInt(random, 0, children.length - 1), 1)
	if (random() < 0.2 && depth > 0) {
		children.splice(randomInt(random, 0, children.length), 0, createNode(random, depth - 1, isSvg))
	}

	return { kind: "element", tag, attributes, children }
}

type Change = { control: HTMLInputElement | HTMLTextAreaElement; type: string; value: string | boolean }

function changeControls(host: HTMLElement, seed: number): Array<Change> {
	const random = createRandom(seed ^ 0x5bd1e995)
	const changes: Array<Change> = []

	for (const control of host.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
		if (random() < 0.5) continue

		if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
			control.checked = !control.checked
		} else if (control instanceof HTMLTextAreaElement || control.type !== "hidden") {
			control.value = `typed-${seed}`
		} else {
			continue
		}

		changes.push({ control, type: control.type, value: readChange(control) })
	}

	return changes
}

// A control whose type changed (which morphlex allows for id-matched inputs) has a different kind of state.
function isKept(host: HTMLElement, change: Change): boolean {
	return host.contains(change.control) && change.control.type === change.type
}

function readChange(control: HTMLInputElement | HTMLTextAreaElement): string | boolean {
	if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
		return control.checked
	}
	return control.value
}

function readDefault(control: HTMLInputElement | HTMLTextAreaElement): string | boolean {
	if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
		return control.defaultChecked
	}
	return control.defaultValue
}

function toHtml(nodes: Array<TreeNode>): string {
	return `<div id="root">${nodes.map(serialize).join("")}</div>`
}

function serialize(node: TreeNode): string {
	if (node.kind === "text") return escape(node.value)
	if (node.kind === "comment") return `<!--${node.value}-->`

	const attributes = node.attributes.map(([name, value]) => ` ${name}="${escape(value)}"`).join("")
	if (VOID_TAGS.includes(node.tag)) return `<${node.tag}${attributes}>`
	return `<${node.tag}${attributes}>${node.children.map(serialize).join("")}</${node.tag}>`
}

function escape(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")
}

function parse(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstChild as HTMLElement
}

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.setAttribute("data-tree-fuzz", "")
	host.append(parse(html))
	document.body.append(host)
	return host
}

function hasEqualSiblingUpTo(element: Element, root: Element): boolean {
	for (let node: Element = element; node !== root; node = node.parentElement!) {
		for (const sibling of node.parentElement!.children) {
			if (sibling !== node && sibling.isEqualNode(node)) return true
		}
	}
	return false
}

// Counts the mutations a morph makes, apart from the `morphlex-dirty` sentinel.
function countMutations(host: HTMLElement, morph: () => void): number {
	const observer = new MutationObserver(() => {})
	observer.observe(host, { subtree: true, childList: true, attributes: true, characterData: true })
	morph()
	const records = observer.takeRecords().filter((record) => record.attributeName !== "morphlex-dirty")
	observer.disconnect()
	return records.length
}

// Like `isEqualNode`, but also compares template contents.
function isSameTree(a: Node, b: Node): boolean {
	if (!a.isEqualNode(b)) return false
	if (a instanceof HTMLTemplateElement && !isSameTree(a.content, (b as HTMLTemplateElement).content)) return false

	for (let index = 0; index < a.childNodes.length; index++) {
		if (!isSameTree(a.childNodes[index]!, b.childNodes[index]!)) return false
	}

	return true
}

function withoutOpen(node: Node): Node {
	const clone = node.cloneNode(true) as Element
	for (const details of clone.querySelectorAll("details[open]")) details.removeAttribute("open")
	return clone
}

function shuffle<T>(random: Random, items: Array<T>): Array<T> {
	const copy = [...items]
	for (let index = copy.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(random() * (index + 1))
		;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
	}
	return copy
}

function pick<T>(random: Random, values: ReadonlyArray<T>): T {
	return values[Math.floor(random() * values.length)]!
}

function randomInt(random: Random, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
}

function createRandom(seed: number): Random {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

function readPositiveIntEnv(name: string, fallback: number): number {
	const value = globalThis.process?.env?.[name] ?? import.meta.env[`VITE_${name}`]
	const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
