import { test, vi } from "vitest"
import { morph, morphInner, type Options } from "../../src/morphlex"

// Random trees where every id is unique, morphed into a copy whose elements have been moved
// across parents, wrapped, unwrapped and replaced. Each test checks one property over every
// seed, sometimes with random callback vetoes, and reports the smallest failure.

type Random = () => number

type TreeNode = TextNode | CommentNode | ElementNode
type TextNode = { kind: "text"; value: string }
type CommentNode = { kind: "comment"; value: string }
type ElementNode = { kind: "element"; tag: string; attributes: Array<[string, string]>; children: Array<TreeNode> }

type Shape = "one" | "list" | "inner"
type Case = { seed: number; fromHtml: string; toHtml: string; shape: Shape }
type Root = { tag: string; id: string | null }

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_MOVE_SEEDS", 300)
// CI starts at a different seed on each run, so repeated runs try new cases. A failure reports its
// seed, which reruns with MORPHLEX_FUZZ_MOVE_SEED_START set to it and MORPHLEX_FUZZ_MOVE_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_MOVE_SEED_START", 0x3a00)
const SEEDS = Array.from({ length: SEED_COUNT }, (_, index) => SEED_START + index)
// Each test runs every seed, so its time limit grows with the seed count.
vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 100) })

const CONTAINERS = ["div", "span", "section", "b", "label", "form", "details"] as const
const LEAVES = ["input", "textarea", "button", "img", "select"] as const
const VOID_TAGS = ["input", "img"]
const INPUT_TYPES = ["text", "checkbox", "radio", "hidden", "range", "color"]
const TEXTS = ["hello", "x y", "123", " "]
const IS_VALUES = ["x-a", "x-b"]

test("the result matches the target, and every element that can move keeps its node", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const expected = movableElements(host, scenario)
		const redefined = redefinedElements(host, scenario)

		run(host, scenario)

		const target = closeLaterAccordionItems(parse(scenario.toHtml))
		if (scenario.shape === "one" ? !isSameTree(host.firstChild!, target) : !isSameChildren(host.firstChild!, target)) {
			fail(host, "result differs from target")
		}
		for (const [id, element] of expected) {
			if (host.querySelector(`[id="${id}"]`) !== element) fail(host, `#${id} was recreated`)
		}
		for (const element of redefined) {
			if (host.contains(element)) fail(host, `#${element.id} kept its node although its \`is\` changed`)
		}
	})
})

test("every select and checkable input shows what the target markup says", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)

		// A checked radio outside the morph, in the group of a form inside it. Only the markup can uncheck it.
		const formId = sharedFormId(host, scenario)
		const outside = formId ? `<input type="radio" name="r" form="${formId}" checked data-move-fuzz>` : ""
		host.insertAdjacentHTML("beforebegin", outside)
		const radio = host.previousElementSibling as HTMLInputElement | null

		run(host, scenario)

		// A separate document, so its radios don't join the live radio groups.
		const expected = document.implementation.createHTMLDocument("")
		expected.body.innerHTML = scenario.toHtml
		const actual = `${radio ? checkednessOf(radio) : ""} ${stateOf(host.firstChild as Element)}`
		const wanted = `${formId ? outsideCheckedness(expected, formId) : ""} ${stateOf(expected.body.firstChild as Element)}`
		if (actual !== wanted) fail(host, `controls show ${actual}, but the target says ${wanted}`)
	})
})

test("preserveChanges keeps what the user typed into every control that moves, unless it's clobbered", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const expected = movableElements(host, scenario)
		const random = createRandom(scenario.seed ^ 0x5bd1e995)

		// Some target elements discard user changes inside them.
		const target = parse(scenario.toHtml)
		for (const element of target.querySelectorAll("*")) {
			if (random() < 0.15) element.setAttribute("morphlex-clobber", "")
		}

		const typed = new Map<Element, string>()
		for (const element of expected.values()) {
			if (!isTextControl(element)) continue
			element.value = `typed-${scenario.seed}`
			const to = target.querySelector(`[id="${element.id}"]`)!
			const clobbered = to.closest("[morphlex-clobber]") !== null
			typed.set(element, clobbered ? (to as HTMLInputElement).defaultValue : element.value)
		}

		run(host, scenario, { preserveChanges: true }, target)

		for (const [element, value] of typed) {
			if ((element as HTMLInputElement).value !== value)
				fail(host, `#${element.id} shows "${(element as HTMLInputElement).value}", not "${value}"`)
		}
	})
})

// Option wrappers with ids nest differently in each tree, inside an element that moves to another parent.
test("a select inside a moving element shows what its markup says, while its option wrappers move", () => {
	let failures = 0
	let smallest: string | null = null

	for (const seed of SEEDS) {
		const random = createRandom(seed)
		const fromHtml = `<div><section><div id="m">${createNestedSelect(random)}</div></section><aside></aside></div>`
		const toHtml = `<div><section></section><aside><div id="m">${createNestedSelect(random)}</div></aside></div>`
		const host = mount(fromHtml)

		morph(host.firstChild as ChildNode, toHtml)

		const expected = document.implementation.createHTMLDocument("")
		expected.body.innerHTML = toHtml
		const actual = selectionOf(host.querySelector("select")!)
		const wanted = selectionOf(expected.querySelector("select")!)
		host.remove()
		if (actual !== wanted) {
			failures++
			const report = `seed ${seed}: the select shows ${actual}, but its markup says ${wanted}\nfrom: ${fromHtml}\nto:   ${toHtml}`
			if (smallest === null || report.length < smallest.length) smallest = report
		}
	}

	if (smallest !== null) throw new Error(`${failures} of ${SEEDS.length} seeds failed. Smallest failure:\n${smallest}`)
})

test("callbacks see a consistent DOM, and vetoes are respected", () => {
	check((scenario, fail) => {
		const host = mount(scenario.fromHtml)
		const random = createRandom(scenario.seed ^ 0x2545f491)
		const root: Node = host.firstChild!
		const live = [...host.querySelectorAll("*")]

		const vetoVisit = new Set(live.filter(() => random() < 0.1))
		const vetoChildren = new Set(live.filter(() => random() < 0.1))
		const vetoRemoval = new Set(live.filter(() => random() < 0.1))
		const vetoAdded = random() < 0.3
		// With every addition vetoed, nothing can replace the root.
		const vetoAllAdded = vetoAdded && random() < 0.3

		// A vetoed node keeps its own subtree exactly.
		const snapshots = new Map<Element, { html: string; nodes: Array<Node> }>()
		for (const element of [...vetoVisit, ...vetoChildren]) {
			snapshots.set(element, { html: element.innerHTML, nodes: descendants(element) })
		}

		// Only the root's callbacks are promised the final DOM, with what each control shows.
		const view = () => `${host.innerHTML.replaceAll(' morphlex-dirty=""', "")} ${stateOf(host)}`

		const visited = new Set<Node>()
		const offered = new Set<Node>()
		const childrenChecked = new Set<Node>()
		const removed: Array<Node> = []
		const removedDescendants: Array<Node> = []
		const rootViews: Array<string> = []

		run(host, scenario, {
			beforeNodeVisited: (from) => {
				if (visited.has(from) && from !== root) fail(host, "a node was visited twice")
				visited.add(from)
				return !vetoVisit.has(from as Element)
			},
			afterNodeVisited: (from) => {
				if (from === root) rootViews.push(view())
			},
			beforeChildrenVisited: (parent) => {
				childrenChecked.add(parent)
				return !vetoChildren.has(parent as Element)
			},
			afterChildrenVisited: (parent) => {
				if (parent === root) rootViews.push(view())
			},
			beforeNodeAdded: (_parent, node) => {
				if (offered.has(node)) fail(host, "beforeNodeAdded was asked twice for a node")
				offered.add(node)
				return !(vetoAllAdded || (vetoAdded && isElement(node) && node.id !== "" && random() < 0.3))
			},
			afterNodeAdded: (node) => {
				if (!host.contains(node)) fail(host, "afterNodeAdded for a detached node")
			},
			beforeNodeRemoved: (node) => !vetoRemoval.has(node as Element),
			afterNodeRemoved: (node) => {
				removed.push(node)
				if (isElement(node)) removedDescendants.push(...descendants(node))
				if (host.contains(node)) fail(host, "afterNodeRemoved for a node still attached")
			},
		})

		// A dirty control whose visit was vetoed still has its sentinel until the morph returns.
		const final = view()
		if (rootViews.some((rootView) => rootView !== final)) fail(host, "the root's callbacks saw an unsettled DOM")
		if (host.innerHTML.includes("<!---->")) fail(host, "a placeholder was left behind")
		if (vetoAllAdded && scenario.shape === "one" && !host.contains(root))
			fail(host, "the root was replaced although every addition was vetoed")
		for (const node of removed) {
			if (host.contains(node)) fail(host, "a removed node came back")
		}
		for (const node of removedDescendants) {
			if (host.contains(node)) fail(host, "a node was still inside a node reported as removed")
		}
		for (const element of vetoRemoval) {
			if (removed.includes(element)) fail(host, `a vetoed removal went ahead`)
		}
		for (const [element, snapshot] of snapshots) {
			if (!vetoRan(element, vetoVisit, visited, vetoChildren, childrenChecked)) continue
			if (!host.contains(element)) fail(host, `a vetoed element was removed: ${describe(element)}`)
			const nodes = descendants(element)
			const same = nodes.length === snapshot.nodes.length && nodes.every((node, index) => node === snapshot.nodes[index])
			if (!same || element.innerHTML !== snapshot.html) fail(host, `a vetoed subtree changed: ${describe(element)}`)
		}
	})
})

// Only a node whose own veto actually ran is protected. A vetoed node that was never reached
// (its ancestor was replaced or removed, or it was replaced itself) has nothing to protect.
function vetoRan(
	element: Element,
	vetoVisit: Set<Element>,
	visited: Set<Node>,
	vetoChildren: Set<Element>,
	childrenChecked: Set<Node>,
): boolean {
	return (vetoVisit.has(element) && visited.has(element)) || (vetoChildren.has(element) && childrenChecked.has(element))
}

function run(host: HTMLElement, scenario: Case, options: Options = {}, target = parse(scenario.toHtml)): void {
	const root = host.firstChild as Element
	if (scenario.shape === "inner") {
		morphInner(root, target, options)
	} else if (scenario.shape === "list") {
		// Morph the root's first child into the target's children, as a node list.
		const first = root.firstChild
		if (!first) return morphInner(root, target, options)
		const rest = [...root.childNodes].slice(1)
		for (const node of rest) node.remove()
		morph(first, target.childNodes, options)
	} else {
		morph(root, target, options)
	}
}

// Live elements whose id appears exactly once on each side, that morphlex should move rather
// than recreate: same tag (and input type), not an option, not the root, not into a select,
// and not into a place inside themselves.
function movableElements(host: HTMLElement, scenario: Case): Map<string, Element> {
	const target = parse(scenario.toHtml)
	const root = host.firstChild as Element
	const result = new Map<string, Element>()

	const keeps = (element: Element): boolean => {
		if (scenario.shape === "list" && (element === root.firstChild || !root.firstChild?.contains(element))) return false
		const id = element.id
		if (!id) return false
		const matches = target.querySelectorAll(`[id="${id}"]`)
		if (matches.length !== 1 || root.querySelectorAll(`[id="${id}"]`).length !== 1 || root.id === id) return false
		// A root that can morph in place stays, and takes the id of its target.
		if (scenario.shape === "one" && target.id === id) return false
		if (scenario.shape === "list" && target.firstChild instanceof Element && target.firstChild.id === id) return false

		const to = matches[0]!
		if (to.localName !== element.localName) return false
		if (element instanceof HTMLInputElement && element.type !== (to as HTMLInputElement).type) return false
		if (element.getAttribute("is") !== to.getAttribute("is")) return false
		// An element in a select only stays when it stays in the same select, and that select stays too.
		const select = element.parentElement!.closest("select")
		const toSelect = to.parentElement?.closest("select")
		if (select || toSelect) {
			if (element.localName === "option" || !select || toSelect?.id !== select.id || !keeps(select)) return false
		}
		return !isInsideOwnDescendant(element, to, target) && !wrapsOwnAncestor(element, to)
	}

	// The element is recreated rather than moved out of a movable ancestor that the target puts inside it,
	// when that ancestor can be morphed into its target. An ancestor holding options may not move, so its
	// descendants aren't checked.
	const morphRoot = scenario.shape === "list" ? root.firstChild : root
	const wrapsOwnAncestor = (element: Element, to: Element): boolean => {
		for (let ancestor = element.parentElement; ancestor && ancestor !== morphRoot; ancestor = ancestor.parentElement) {
			const id = ancestor.id
			if (!id || ancestor.localName === "option" || ancestor.localName === "optgroup") continue
			if (root.querySelectorAll(`[id="${id}"]`).length !== 1 || target.querySelectorAll(`[id="${id}"]`).length !== 1) continue
			const match = to.querySelector(`[id="${id}"]`)
			if (!match) continue
			if (ancestor.querySelector("option")) return true
			if (match.localName !== ancestor.localName || match.getAttribute("is") !== ancestor.getAttribute("is")) continue
			return true
		}
		return false
	}

	for (const element of root.querySelectorAll("[id]")) {
		if (keeps(element)) result.set(element.id, element)
	}

	return result
}

// The id of a form that the morph keeps, outside any other form on both sides, so a radio
// outside the morph stays in its radio group.
function sharedFormId(host: HTMLElement, scenario: Case): string | null {
	const target = parse(scenario.toHtml)
	const root = host.firstChild as Element
	const keeps = (side: Element, id: string) => {
		const matches = side.querySelectorAll(`[id="${id}"]`)
		const form = matches[0]
		return (
			matches.length === 1 && form!.localName === "form" && !form!.parentElement!.closest("form") && !form!.querySelector("form")
		)
	}
	const scope = scenario.shape === "list" ? root.firstChild : root
	if (!scope || !isElement(scope)) return null
	const forms = [...scope.querySelectorAll("form[id]")].filter(
		(form) => form.id !== root.id && form.id !== target.id && keeps(root, form.id) && keeps(target, form.id),
	)
	return forms[0]?.id ?? null
}

// The radio outside the morph stays checked unless the markup checks another radio in its group.
function outsideCheckedness(expected: Document, formId: string): string {
	const form = expected.getElementById(formId) as HTMLFormElement
	const group = [...form.elements].filter((element) => element instanceof HTMLInputElement && element.type === "radio")
	return group.some((radio) => (radio as HTMLInputElement).name === "r" && radio.hasAttribute("checked")) ? "-" : "x"
}

// Live elements whose \`is\` differs from that of the target element with their id. A customized
// built-in's definition is fixed when it's created, so these must be recreated.
// A node list morph's root is morphed into the first target node instead, so it's left out.
function redefinedElements(host: HTMLElement, scenario: Case): Array<Element> {
	const target = parse(scenario.toHtml)
	const listRoot = scenario.shape === "list" ? host.firstChild!.firstChild : null
	return [...host.querySelectorAll("[id]")].filter((element) => {
		if (element === listRoot) return false
		const to = target.id === element.id ? target : target.querySelector(`[id="${element.id}"]`)
		return to !== null && to.localName === element.localName && to.getAttribute("is") !== element.getAttribute("is")
	})
}

// Whether the target puts the element inside something that is currently inside it.
function isInsideOwnDescendant(element: Element, to: Element, target: Element): boolean {
	for (let ancestor = to.parentElement; ancestor && ancestor !== target; ancestor = ancestor.parentElement) {
		if (ancestor.id && element.querySelector(`[id="${ancestor.id}"]`)) return true
	}
	return false
}

function check(property: (scenario: Case, fail: (host: HTMLElement, reason: string) => void) => void): void {
	let smallest: string | null = null
	let failures = 0

	for (const seed of SEEDS) {
		const scenario = createCase(seed)
		let failed = false

		const fail = (host: HTMLElement, reason: string) => {
			if (failed) return
			failed = true
			failures++

			const report = `seed ${seed} (${scenario.shape}): ${reason}\nfrom:     ${scenario.fromHtml}\nto:       ${scenario.toHtml}\nreceived: ${host.innerHTML}`
			if (smallest === null || report.length < smallest.length) smallest = report
		}

		try {
			property(scenario, fail)
		} catch (error) {
			failures++
			const report = `seed ${seed} (${scenario.shape}) threw ${String(error)}\nfrom: ${scenario.fromHtml}\nto:   ${scenario.toHtml}`
			if (smallest === null || report.length < smallest.length) smallest = report
		} finally {
			for (const host of document.querySelectorAll("[data-move-fuzz]")) host.remove()
		}
	}

	if (smallest !== null) {
		throw new Error(`${failures} of ${SEEDS.length} seeds failed. Smallest failure:\n${smallest}`)
	}
}

function createCase(seed: number): Case {
	const random = createRandom(seed)
	const ids = { next: 0 }
	// Some cases focus on selects, with options in nested wrappers that move around inside them.
	// Others focus on forms of radios, which move between radio groups.
	const focus = random()
	const selects = focus < 0.25
	const forms = focus > 0.8
	const from = Array.from({ length: randomInt(random, 1, 4) }, () => {
		if (selects && random() < 0.6) return createSelect(random, ids)
		if (forms && random() < 0.7) return createForm(random, ids)
		return createNode(random, 3, ids)
	})

	let to = from.map((node) => clone(node))
	for (let count = randomInt(random, 1, 5); count > 0; count--) {
		const top: ElementNode = { kind: "element", tag: "root", attributes: [], children: to }
		to =
			(selects && random() < 0.7 && mutateSelect(random, top, ids)) ||
			(forms && random() < 0.4 && moveRadio(random, top)) ||
			(random() < 0.15 && wrapInDescendant(random, top)) ||
			mutate(random, to, ids)
	}

	// Sometimes change the `is` of a button with an id, which can't be changed in place.
	const buttons = elementsOf({ kind: "element", tag: "root", attributes: [], children: to }).filter(
		(element) => element.tag === "button" && element.attributes.some(([name]) => name === "id"),
	)
	if (buttons.length > 0 && random() < 0.3) {
		const button = pick(random, buttons)
		const is = button.attributes.find(([name]) => name === "is")?.[1]
		button.attributes = button.attributes.filter(([name]) => name !== "is")
		button.attributes.push(["is", is === IS_VALUES[0] ? IS_VALUES[1]! : IS_VALUES[0]!])
	}

	const shape: Shape = pick(random, ["one", "one", "list", "inner"])
	const fromRoot: Root = { tag: "div", id: "root" }
	// The target's root sometimes changes tag, or takes the id of an element inside it. An inner morph needs the same tag.
	const toRoot: Root = { tag: shape !== "inner" && random() < 0.15 ? pick(random, ["section", "span"]) : "div", id: "root" }
	const roll = random()
	if (roll < 0.1) toRoot.id = null
	else if (roll < 0.25) toRoot.id = pick(random, ["root", ...idsOf(to)])
	const fromHtml = parse(toHtml(fromRoot, from)).outerHTML
	const target = parse(toHtml(toRoot, to))

	// Sometimes the target is an element from inside the root, which then replaces it.
	const inner = shape === "one" && random() < 0.1 ? [...target.querySelectorAll("[id]")] : []
	if (inner.length > 0) return { seed, shape, fromHtml, toHtml: pick(random, inner).outerHTML }

	return { seed, shape, fromHtml, toHtml: target.outerHTML }
}

function createNode(random: Random, depth: number, ids: { next: number }): TreeNode {
	const roll = random()
	if (roll < 0.15) return { kind: "text", value: pick(random, TEXTS) }
	if (roll < 0.2) return { kind: "comment", value: "c" }

	const leaf = depth === 0 || random() < 0.35
	const tag = leaf ? pick(random, LEAVES) : pick(random, CONTAINERS)
	const attributes: Array<[string, string]> = []
	if (random() < 0.7) attributes.push(["id", `i${ids.next++}`])
	if (tag === "input") {
		const type = pick(random, INPUT_TYPES)
		attributes.push(["type", type])
		if (type === "radio") attributes.push(["name", pick(random, ["r", "s"])])
		if ((type === "radio" || type === "checkbox") && random() < 0.4) attributes.push(["checked", ""])
	}
	if (random() < 0.3) attributes.push(["class", pick(random, ["a", "b"])])
	if (tag === "button" && random() < 0.4) attributes.push(["is", pick(random, IS_VALUES)])
	if (tag === "details") {
		if (random() < 0.6) attributes.push(["name", pick(random, ["g", "h"])])
		if (random() < 0.5) attributes.push(["open", ""])
	}

	const children: Array<TreeNode> = []
	if (tag === "select") {
		children.push(...createOptionChildren(random, ids, 1))
	} else if (!leaf) {
		for (let count = randomInt(random, 0, 3); count > 0; count--) children.push(createNode(random, depth - 1, ids))
	}

	return { kind: "element", tag, attributes, children }
}

function createForm(random: Random, ids: { next: number }): ElementNode {
	const inputs = Array.from({ length: randomInt(random, 1, 3) }, (): ElementNode => {
		const attributes: Array<[string, string]> = [
			["id", `i${ids.next++}`],
			["type", random() < 0.8 ? "radio" : "checkbox"],
			["name", random() < 0.8 ? "r" : "s"],
		]
		if (random() < 0.5) attributes.push(["checked", ""])
		return { kind: "element", tag: "input", attributes, children: [] }
	})
	return { kind: "element", tag: "form", attributes: random() < 0.5 ? [["id", `i${ids.next++}`]] : [], children: inputs }
}

function createSelect(random: Random, ids: { next: number }): ElementNode {
	const attributes: Array<[string, string]> = random() < 0.5 ? [["id", `i${ids.next++}`]] : []
	return { kind: "element", tag: "select", attributes, children: createOptionChildren(random, ids, 2) }
}

// A select whose options sit in wrappers with fixed ids, each nested in the select or in an earlier wrapper.
function createNestedSelect(random: Random): string {
	const options: Record<string, string> = { p: "a", q: "b", r: "", t: "c" }
	const children: Record<string, Array<string>> = { select: [], p: [], q: [], r: [], t: [] }
	const order = Object.keys(options).sort(() => random() - 0.5)
	for (let i = 0; i < order.length; i++) {
		const parent = i === 0 || random() < 0.5 ? "select" : order[randomInt(random, 0, i - 1)]!
		children[parent]!.push(order[i]!)
	}
	const render = (id: string): string =>
		`<div id="${id}">${options[id] ? `<option>${options[id]}</option>` : ""}${children[id]!.map(render).join("")}</div>`
	return `<select>${children["select"]!.map(render).join("")}</select>`
}

// Options, and wrappers holding options, as a customizable select allows.
function createOptionChildren(random: Random, ids: { next: number }, depth: number): Array<TreeNode> {
	return Array.from({ length: randomInt(random, 1, 3) }, (): TreeNode => {
		if (depth === 0 || random() < 0.7) return createOption(random, ids)
		const attributes: Array<[string, string]> = random() < 0.7 ? [["id", `i${ids.next++}`]] : []
		return { kind: "element", tag: "div", attributes, children: createOptionChildren(random, ids, depth - 1) }
	})
}

function createOption(random: Random, ids: { next: number }): ElementNode {
	const attributes: Array<[string, string]> = [["id", `i${ids.next++}`]]
	if (random() < 0.25) attributes.push(["selected", ""])
	return { kind: "element", tag: "option", attributes, children: [{ kind: "text", value: `o${ids.next}` }] }
}

// One structural change: move a subtree to another parent, wrap or unwrap a node, change a
// container's tag or id, remove a node, add a node or change a class.
function mutate(random: Random, nodes: Array<TreeNode>, ids: { next: number }): Array<TreeNode> {
	const top: ElementNode = { kind: "element", tag: "root", attributes: [], children: nodes }
	const places = containersOf(top)
	const operation = randomInt(random, 0, 8)

	if (operation === 8) return mutateSelect(random, top, ids) ?? nodes

	const [parent, index] = pickChild(random, places)
	if (!parent) return nodes
	const node = parent.children[index]!

	if (operation <= 2) {
		// Move a subtree to a random container that isn't inside it.
		parent.children.splice(index, 1)
		const destinations = containersOf(top).filter((place) => !(node.kind === "element" && containsNode(node, place)))
		const destination = pick(random, destinations)
		destination.children.splice(randomInt(random, 0, destination.children.length), 0, node)
	} else if (operation === 3) {
		const wrapper: ElementNode = {
			kind: "element",
			tag: pick(random, CONTAINERS),
			attributes: random() < 0.5 ? [["id", `i${ids.next++}`]] : [],
			children: [node],
		}
		parent.children[index] = wrapper
	} else if (operation === 4 && node.kind === "element" && node.tag !== "select") {
		parent.children.splice(index, 1, ...node.children)
	} else if (operation === 5 && node.kind === "element" && node.tag !== "select") {
		if (random() < 0.5) node.tag = pick(random, CONTAINERS)
		node.attributes = node.attributes.filter(([name]) => name !== "id")
		if (random() < 0.5) node.attributes.push(["id", `i${ids.next++}`])
	} else if (operation === 6) {
		if (random() < 0.5) parent.children.splice(index, 1)
		else parent.children.splice(index, 0, createNode(random, 2, ids))
	} else if (node.kind === "element" && isCheckable(node) && random() < 0.5) {
		toggleAttribute(node, "checked")
	} else if (node.kind === "element" && node.tag === "details" && random() < 0.7) {
		// Opening an item closes the rest of its group, and so does giving an open item a name.
		if (random() < 0.5) {
			toggleAttribute(node, "open")
		} else {
			node.attributes = node.attributes.filter(([name]) => name !== "name")
			if (random() < 0.7) node.attributes.push(["name", pick(random, ["g", "h"])])
		}
	} else if (node.kind === "element" && node.tag === "button" && random() < 0.5) {
		node.attributes = node.attributes.filter(([name]) => name !== "is")
		if (random() < 0.7) node.attributes.push(["is", pick(random, IS_VALUES)])
	} else if (node.kind === "element") {
		node.attributes = node.attributes.filter(([name]) => name !== "class")
		node.attributes.push(["class", pick(random, ["a", "b", "c"])])
	}

	return top.children
}

// Move an option or option wrapper within or between selects, or toggle an option's selected attribute.
function mutateSelect(random: Random, top: ElementNode, ids: { next: number }): Array<TreeNode> | null {
	const selects = elementsOf(top).filter((element) => element.tag === "select")
	if (selects.length === 0) return null

	const select = pick(random, selects)
	const [parent, index] = pickChild(random, optionPlacesOf(select))
	if (!parent) return null
	const node = parent.children[index] as ElementNode

	if (node.tag === "option" && random() < 0.3) {
		toggleAttribute(node, "selected")
		return top.children
	}

	if (random() < 0.2) {
		parent.children[index] = { kind: "element", tag: "div", attributes: [["id", `i${ids.next++}`]], children: [node] }
		return top.children
	}

	parent.children.splice(index, 1)
	const destinations = optionPlacesOf(pick(random, selects)).filter((place) => !containsNode(node, place))
	const into = pick(random, destinations)
	into.children.splice(randomInt(random, 0, into.children.length), 0, node)
	return top.children
}

// Move a radio into another form, sometimes changing whether the markup checks it.
function moveRadio(random: Random, top: ElementNode): Array<TreeNode> | null {
	const forms = elementsOf(top).filter((element) => element.tag === "form")
	const [form, index] = pickChild(random, forms)
	if (!form || forms.length < 2) return null
	const node = form.children[index]!
	if (node.kind !== "element" || !isCheckable(node)) return null

	form.children.splice(index, 1)
	const into = pick(
		random,
		forms.filter((other) => other !== form),
	)
	into.children.splice(randomInt(random, 0, into.children.length), 0, node)
	if (random() < 0.5) toggleAttribute(node, "checked")
	return top.children
}

// Swap a container with a container inside it, so the inner one ends up wrapping the outer one.
function wrapInDescendant(random: Random, top: ElementNode): Array<TreeNode> | null {
	const pairs = containersOf(top).flatMap((outer) =>
		outer === top ? [] : containersOf(outer).flatMap((inner) => (inner === outer ? [] : [[outer, inner] as const])),
	)
	if (pairs.length === 0) return null
	const [outer, inner] = pick(random, pairs)

	const innerParent = containersOf(outer).find((place) => place.children.includes(inner))!
	innerParent.children.splice(innerParent.children.indexOf(inner), 1)
	const outerParent = containersOf(top).find((place) => place.children.includes(outer))!
	outerParent.children[outerParent.children.indexOf(outer)] = inner
	inner.children.splice(randomInt(random, 0, inner.children.length), 0, outer)
	return top.children
}

// A select and the wrappers inside it, which can hold options and other wrappers.
function optionPlacesOf(select: ElementNode): Array<ElementNode> {
	return elementsOf(select).filter((element) => element === select || element.tag === "div")
}

function elementsOf(node: ElementNode): Array<ElementNode> {
	const result: Array<ElementNode> = [node]
	for (const child of node.children) if (child.kind === "element") result.push(...elementsOf(child))
	return result
}

function idsOf(nodes: Array<TreeNode>): Array<string> {
	const top: ElementNode = { kind: "element", tag: "root", attributes: [], children: nodes }
	return elementsOf(top).flatMap((element) => element.attributes.filter(([name]) => name === "id").map(([, value]) => value))
}

function containersOf(node: ElementNode): Array<ElementNode> {
	if (node.tag === "select" || VOID_TAGS.includes(node.tag) || (LEAVES as ReadonlyArray<string>).includes(node.tag)) return []
	const result: Array<ElementNode> = [node]
	for (const child of node.children) if (child.kind === "element") result.push(...containersOf(child))
	return result
}

function pickChild(random: Random, places: Array<ElementNode>): [ElementNode | null, number] {
	const parents = places.filter((place) => place.children.length > 0)
	if (parents.length === 0) return [null, 0]
	const parent = pick(random, parents)
	return [parent, randomInt(random, 0, parent.children.length - 1)]
}

function containsNode(node: ElementNode, other: ElementNode): boolean {
	if (node === other) return true
	return node.children.some((child) => child.kind === "element" && containsNode(child, other))
}

function clone(node: TreeNode): TreeNode {
	if (node.kind !== "element") return { ...node }
	return {
		...node,
		attributes: node.attributes.map(([name, value]): [string, string] => [name, value]),
		children: node.children.map(clone),
	}
}

function toHtml(root: Root, nodes: Array<TreeNode>): string {
	const id = root.id === null ? "" : ` id="${root.id}"`
	return `<${root.tag}${id}>${nodes.map(serialize).join("")}</${root.tag}>`
}

function serialize(node: TreeNode): string {
	if (node.kind === "text") return node.value
	if (node.kind === "comment") return `<!--${node.value}-->`

	const attributes = node.attributes.map(([name, value]) => ` ${name}="${value}"`).join("")
	if (VOID_TAGS.includes(node.tag)) return `<${node.tag}${attributes}>`
	return `<${node.tag}${attributes}>${node.children.map(serialize).join("")}</${node.tag}>`
}

function parse(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstChild as HTMLElement
}

// WebKit lets a parsed template keep several open items in one accordion. In a document only the
// first stays open, as Chromium's parser does, so close the later ones to get what the morph shows.
function closeLaterAccordionItems<T extends Element>(root: T): T {
	const open = new Set<string>()
	const items = [...root.querySelectorAll(`details[open]:not([name=""])[name]`)]
	if (root.matches(`details[open]:not([name=""])[name]`)) items.unshift(root)
	for (const details of items) {
		const name = details.getAttribute("name")!
		if (open.has(name)) details.removeAttribute("open")
		else open.add(name)
	}
	return root
}

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.setAttribute("data-move-fuzz", "")
	host.append(parse(html))
	document.body.append(host)
	return host
}

function isSameTree(a: Node, b: Node): boolean {
	if (!a.isEqualNode(b)) return false
	for (let index = 0; index < a.childNodes.length; index++) {
		if (!isSameTree(a.childNodes[index]!, b.childNodes[index]!)) return false
	}
	return true
}

function isSameChildren(a: Node, b: Node): boolean {
	if (a.childNodes.length !== b.childNodes.length) return false
	for (let index = 0; index < a.childNodes.length; index++) {
		if (!isSameTree(a.childNodes[index]!, b.childNodes[index]!)) return false
	}
	return true
}

function isCheckable(node: ElementNode): boolean {
	return (
		node.tag === "input" &&
		node.attributes.some(([name, value]) => name === "type" && (value === "radio" || value === "checkbox"))
	)
}

function toggleAttribute(node: ElementNode, attribute: string): void {
	const has = node.attributes.some(([name]) => name === attribute)
	node.attributes = has ? node.attributes.filter(([name]) => name !== attribute) : [...node.attributes, [attribute, ""]]
}

// Each select's selection and each checkbox or radio's checkedness, in document order.
function stateOf(root: Element): string {
	return [...root.querySelectorAll("select, input")]
		.map((control) =>
			control.localName === "select" ? selectionOf(control as HTMLSelectElement) : checkednessOf(control as HTMLInputElement),
		)
		.join(" ")
}

function checkednessOf(input: HTMLInputElement): string {
	return input.checked ? "x" : "-"
}

function selectionOf(select: HTMLSelectElement): string {
	return [...select.options].map((option) => (option.selected ? "1" : "0")).join("")
}

function descendants(element: Element): Array<Node> {
	const nodes: Array<Node> = []
	const walker = document.createTreeWalker(element)
	while (walker.nextNode()) nodes.push(walker.currentNode)
	return nodes
}

function describe(element: Element): string {
	return element.id ? `#${element.id}` : element.localName
}

function isElement(node: Node): node is Element {
	return node.nodeType === Node.ELEMENT_NODE
}

function isTextControl(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
	if (element instanceof HTMLTextAreaElement) return true
	return element instanceof HTMLInputElement && element.type === "text"
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
