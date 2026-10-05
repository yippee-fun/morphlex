const SUPPORTS_MOVE_BEFORE = typeof Element !== "undefined" && "moveBefore" in Element.prototype
const ELEMENT_NODE_TYPE = 1
const TEXT_NODE_TYPE = 3
const DOCUMENT_NODE_TYPE = 9
const DOCUMENT_FRAGMENT_NODE_TYPE = 11
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const CLOBBER_ATTRIBUTE = "morphlex-clobber"
const DIRTY_ATTRIBUTE = "morphlex-dirty"
const DETACHED_NODE_ERROR = "[Morphlex] Cannot replace a detached node. It needs a parent."

// The passes matching wrappers by choice, as [targets with their own identity, same attributes, all choices,
// only the choices the user picked], from strictest to loosest.
const CHOICE_PASSES = [
	[false, true, true, true],
	[false, true, true, false],
	[false, true, false, true],
	[false, true, false, false],
	[false, false, true, true],
	[false, false, true, false],
	[false, false, false, true],
	[false, false, false, false],
	[true, true, true, true],
	[true, true, true, false],
	[true, true, false, true],
	[true, true, false, false],
	[true, false, true, true],
	[true, false, true, false],
	[true, false, false, true],
	[true, false, false, false],
] as const

const STYLING_ATTRIBUTES = ["class", "style"]

const Operation = {
	EqualNode: 0,
	SameElement: 1,
	SameNode: 2,
} as const

type Operation = (typeof Operation)[keyof typeof Operation]

type IdSetMap = WeakMap<Node, Set<string>>
type IdArrayMap = WeakMap<Node, Array<string>>
type DefaultOptionMap = Map<HTMLSelectElement, HTMLOptionElement | null>

/**
 * Configuration options for morphing operations.
 */
export interface Options {
	/**
	 * When `true`, preserves modified form inputs during morphing.
	 * This prevents user-entered data from being overwritten.
	 * It also leaves the `open` state of `<details>` and `<dialog>` elements alone.
	 * Add a `morphlex-clobber` attribute to an element in the new markup to discard
	 * these changes inside that element for one morph.
	 * @default false
	 */
	preserveChanges?: boolean

	/**
	 * Called before a node is visited during morphing.
	 * @param fromNode The existing node in the DOM
	 * @param toNode The new node to morph to
	 * @returns `false` to skip morphing this node, `true` to continue
	 */
	beforeNodeVisited?: (fromNode: Node, toNode: Node) => boolean

	/**
	 * Called after a node has been visited and morphed.
	 * @param fromNode The morphed node in the DOM
	 * @param toNode The source node that was morphed from
	 */
	afterNodeVisited?: (fromNode: Node, toNode: Node) => void

	/**
	 * Called before a new node is added to the DOM.
	 * @param parent The parent node where the child will be added
	 * @param node The node to be added
	 * @param insertionPoint The node before which the new node will be inserted, or `null` to append
	 * @returns `false` to prevent adding the node, `true` to continue
	 */
	beforeNodeAdded?: (parent: ParentNode, node: Node, insertionPoint: ChildNode | null) => boolean

	/**
	 * Called after a node has been added to the DOM.
	 * @param node The node that was added
	 */
	afterNodeAdded?: (node: Node) => void

	/**
	 * Called before a node is removed from the DOM.
	 * @param node The node to be removed
	 * @returns `false` to prevent removal, `true` to continue
	 */
	beforeNodeRemoved?: (node: Node) => boolean

	/**
	 * Called after a node has been removed from the DOM.
	 * @param node The node that was removed
	 */
	afterNodeRemoved?: (node: Node) => void

	/**
	 * Called before an attribute is updated on an element.
	 * @param element The element whose attribute will be updated
	 * @param attributeName The name of the attribute
	 * @param newValue The new value for the attribute, or `null` if being removed
	 * @returns `false` to prevent the update, `true` to continue
	 */
	beforeAttributeUpdated?: (element: Element, attributeName: string, newValue: string | null) => boolean

	/**
	 * Called after an attribute has been updated on an element.
	 * @param element The element whose attribute was updated
	 * @param attributeName The name of the attribute
	 * @param previousValue The previous value of the attribute, or `null` if it didn't exist
	 */
	afterAttributeUpdated?: (element: Element, attributeName: string, previousValue: string | null) => void

	/**
	 * Called before an element's children are visited during morphing.
	 * @param parent The parent node whose children will be visited
	 * @returns `false` to skip visiting children, `true` to continue
	 */
	beforeChildrenVisited?: (parent: ParentNode) => boolean

	/**
	 * Called after an element's children have been visited and morphed.
	 * @param parent The parent node whose children were visited
	 */
	afterChildrenVisited?: (parent: ParentNode) => void
}

type NodeWithMoveBefore = ParentNode & {
	moveBefore: (node: ChildNode, before: ChildNode | null) => void
}

/**
 * Morph one document to another. If the `to` document is a string, it will be parsed with a DOMParser.
 *
 * @param from The source document to morph from.
 * @param to The target document or string to morph to.
 * @param options Optional configuration for the morphing behavior.
 * @example
 * ```ts
 * morphDocument(document, "<html>...</html>", { preserveChanges: true })
 * ```
 *
 * @remarks
 * **Security:** When `to` is a string, it is parsed as HTML and nodes from the parsed
 * tree are inserted into the live document. Inline event handler attributes (e.g.
 * `onclick`) and resource-loading attributes (e.g. `src`, `href`) take effect once
 * the nodes are adopted. Do not pass untrusted HTML; sanitize it first.
 */
export function morphDocument(from: Document, to: Document | string, options?: Options): void {
	if (typeof to === "string") to = parseDocument(to)
	morph(from.documentElement, to.documentElement, options)
}

/**
 * Morph one `ChildNode` to another. If the `to` node is a string, it will be parsed with a `<template>` element.
 *
 * @param from The source node to morph from.
 * @param to The target node, node list or string to morph to.
 * @example
 * ```ts
 * morph(originalDom, newDom)
 * ```
 *
 * @remarks
 * **Security:** When `to` is a string, it is parsed as HTML and nodes from the parsed
 * tree are inserted into the live document. Inline event handler attributes (e.g.
 * `onclick`) and resource-loading attributes (e.g. `src`, `href`) take effect once
 * the nodes are adopted. Do not pass untrusted HTML; sanitize it first.
 */
export function morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode> | string, options: Options = {}): void {
	if (typeof to === "string") to = parseFragment(to).childNodes

	run(from, takeClobbered(to), options, (morpher) => morpher.morph(from, to))
}

/**
 * Morph the inner content of one ChildNode to the inner content of another.
 * If the `to` node is a string, it will be parsed with a `<template>` element.
 *
 * @param from The source node to morph from.
 * @param to The target node, node list or string to morph to.
 * @example
 * ```ts
 * morphInner(originalDom, newDom)
 * ```
 *
 * @remarks
 * **Security:** When `to` is a string, it is parsed as HTML and nodes from the parsed
 * tree are inserted into the live document. Inline event handler attributes (e.g.
 * `onclick`) and resource-loading attributes (e.g. `src`, `href`) take effect once
 * the nodes are adopted. Do not pass untrusted HTML; sanitize it first.
 */
export function morphInner(from: ChildNode, to: ChildNode | string, options: Options = {}): void {
	if (typeof to === "string") {
		const fragment = parseFragment(to)

		if (fragment.firstChild && fragment.childNodes.length === 1 && fragment.firstChild.nodeType === ELEMENT_NODE_TYPE) {
			to = fragment.firstChild
		} else {
			throw new Error("[Morphlex] The string was not a valid HTML element.")
		}
	}

	if (
		from.nodeType === ELEMENT_NODE_TYPE &&
		to.nodeType === ELEMENT_NODE_TYPE &&
		(from as Element).localName === (to as Element).localName &&
		(from as Element).namespaceURI === (to as Element).namespaceURI
	) {
		const fromElement = from as Element
		const toElement = to as Element
		const clobbered = takeClobbered(toElement)
		if (clobbered?.has(toElement)) options = { ...options, preserveChanges: false }
		run(fromElement, clobbered, options, (morpher) => morpher.morphChildren(fromElement, toElement))
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

// Flag the controls the user changed, note the select around the root and what its markup selects, and
// run the morph. A root select's options are keyed by the live select, even if the target renames it and the
// rename is vetoed.
function run(from: ChildNode, clobbered: Set<Element> | null, options: Options, morph: (morpher: Morph) => void): void {
	const select = selectOf(from)
	const flagged = isElement(from) ? flagDirtyInputs(from) : null
	const keySelect = isElement(from) && isSelectElement(from) ? from : select
	try {
		const morpher = new Morph(options, clobbered, flagged, keySelect)
		if (select) morpher.setEnclosingSelect(select, markupSelectionOf(select))
		morph(morpher)
	} finally {
		if (flagged) clearDirtyFlags(flagged)
	}
}

// Remove `morphlex-clobber` from the target so it never reaches the live DOM,
// and return the elements that had it so the morph can discard user changes inside them.
// Also remove `morphlex-dirty` from the target, so a dirty element can never look equal to it.
function takeClobbered(to: ChildNode | NodeListOf<ChildNode>): Set<Element> | null {
	let clobbered: Set<Element> | null = null
	const nodes = isNodeList(to) ? to : [to]

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!
		if (node.nodeType !== ELEMENT_NODE_TYPE) continue

		const element = node as Element
		if (stripMarkerAttributes(element)) (clobbered ??= new Set()).add(element)

		for (const descendant of element.querySelectorAll(`[${CLOBBER_ATTRIBUTE}], [${DIRTY_ATTRIBUTE}]`)) {
			if (stripMarkerAttributes(descendant)) (clobbered ??= new Set()).add(descendant)
		}
	}

	return clobbered
}

// Returns whether the element had `morphlex-clobber`.
function stripMarkerAttributes(element: Element): boolean {
	element.removeAttribute(DIRTY_ATTRIBUTE)
	if (!element.hasAttribute(CLOBBER_ATTRIBUTE)) return false
	element.removeAttribute(CLOBBER_ATTRIBUTE)
	return true
}

function flagDirtyInputs(node: Element): Array<Element> {
	const flagged: Array<Element> = []
	const defaultOptions: DefaultOptionMap = new Map()
	let optionSelects: Map<Element, HTMLSelectElement> | null = null

	// The selector also matches elements with these names in other namespaces, like SVG.
	for (const element of [node, ...node.querySelectorAll("input, option, textarea")]) {
		let dirty = false
		if (isInputElement(element)) {
			dirty = isDirtyInput(element)
		} else if (isOptionElement(element)) {
			optionSelects ??= optionSelectsOf(node)
			dirty = isDirtyOption(element, optionSelects.get(element), defaultOptions)
		} else if (isTextAreaElement(element)) {
			dirty = isDirtyTextArea(element)
		}
		if (dirty) flagDirty(element, flagged)
	}

	return flagged
}

function flagDirty(element: Element, flagged: Array<Element>): void {
	// Stryker disable next-line StringLiteral: only the marker's presence matters, never its value.
	element.setAttribute(DIRTY_ATTRIBUTE, "")
	flagged.push(element)
}

// Checkboxes and radios report a `.value` of "on" when they have no `value` attribute,
// while `defaultValue` is "", so only their checkedness tells us if the user changed them.
function isDirtyInput(input: HTMLInputElement): boolean {
	if (input.type === "checkbox" || input.type === "radio") {
		return input.checked !== input.defaultChecked
	}

	return input.value !== input.defaultValue && hasDirtyValue(input)
}

let probeDocument: Document | null = null

// A clone keeps an input's value and dirty value flag. Cloning into a document without
// custom elements keeps a customized built-in from upgrading.
function probeClone(input: HTMLInputElement): HTMLInputElement {
	probeDocument ??= input.ownerDocument.implementation.createHTMLDocument("")
	return probeDocument.importNode(input) as HTMLInputElement
}

// The browser sanitizes `.value` for many input types, so it can differ from the `value`
// attribute when the user changed nothing: a range with no value reads "50", and email
// inputs trim spaces. Only the browser knows if the user changed it. A clone keeps that
// dirty flag, and while it's unset a text input's value follows its `value` attribute.
// A file input ignores its `value` attribute and has a value only once the user picks a file.
function hasDirtyValue(input: HTMLInputElement): boolean {
	if (input.type === "file") return input.value !== ""
	const clone = probeClone(input)
	clone.type = "text"
	const probe = clone.value === "a" ? "b" : "a"
	clone.defaultValue = probe
	return clone.value !== probe
}

// The attributes besides `type` and `value` that the browser sanitizes an input's value with.
const SANITIZING_ATTRIBUTES = ["min", "max", "step", "multiple"]

// An untouched input can still differ from its target, because the browser sanitizes its value
// as attributes change: a range that gains `max="10"` clamps 50 to 10, while the parsed target
// shows 5. Setting the `value` attribute again sanitizes it afresh, without marking it as changed
// the way assigning `.value` would. Try it on a clone first, so it only happens when it helps.
// Returns whether it dealt with the input, so assigning `.value` isn't needed. An untouched input
// whose sanitizing attribute update was vetoed is left alone on purpose.
function resanitizeValue(input: HTMLInputElement, target: Element, value: string | null, shown: string): boolean {
	/* v8 ignore start -- happy-dom doesn't sanitize values, so an untouched input always matches its target there */
	if (hasDirtyValue(input)) return false
	if (SANITIZING_ATTRIBUTES.some((name) => input.getAttribute(name) !== target.getAttribute(name))) return true
	const clone = probeClone(input)
	setValueAttribute(clone, value)
	if (clone.value !== shown) return false
	setValueAttribute(input, value)
	return true
}

function setValueAttribute(input: HTMLInputElement, value: string | null): void {
	if (value === null) {
		input.setAttribute("value", "")
		input.removeAttribute("value")
	} else {
		input.setAttribute("value", value)
	}
}
/* v8 ignore stop */

// The browser turns carriage returns into line feeds in a textarea's `.value`.
function isDirtyTextArea(textarea: HTMLTextAreaElement): boolean {
	return textarea.value !== textarea.defaultValue.replace(/\r\n?/g, "\n")
}

// A single select shows one option as selected even when no option has a `selected`
// attribute, so compare each option with what the browser selects from the markup alone.
function isDirtyOption(
	option: HTMLOptionElement,
	select: HTMLSelectElement | undefined,
	defaultOptions: DefaultOptionMap,
): boolean {
	if (!select || select.multiple) return option.selected !== option.defaultSelected

	let defaultOption = defaultOptions.get(select)
	if (defaultOption === undefined) {
		defaultOption = defaultOptionOf(select)
		defaultOptions.set(select, defaultOption)
	}

	return option.selected !== (option === defaultOption)
}

// The last option with a `selected` attribute wins. Without one, a drop-down
// (display size 1) selects its first enabled option and a list box selects nothing.
// When every option is disabled, some browsers select the first one anyway.
function defaultOptionOf(select: HTMLSelectElement): HTMLOptionElement | null {
	const options = select.options
	let firstEnabled: HTMLOptionElement | null = null

	for (let i = options.length - 1; i >= 0; i--) {
		const option = options[i]!
		if (option.hasAttribute("selected")) return option
		if (!isDisabledOption(option)) firstEnabled = option
	}

	if (displaySizeOf(select) > 1) return null
	/* v8 ignore next -- only WebKit selects a disabled option */
	return firstEnabled ?? (selectsDisabledOption(select.ownerDocument) ? (options[0] ?? null) : null)
}

let disabledOptionSelected: boolean | undefined

function selectsDisabledOption(document: Document): boolean {
	if (disabledOptionSelected === undefined) {
		const select = document.createElement("select")
		const option = document.createElement("option")
		option.disabled = true
		select.append(option)
		disabledOptionSelected = select.selectedIndex === 0
	}
	return disabledOptionSelected
}

// HTML integer parsing skips only ASCII whitespace, where `parseInt` skips any whitespace.
function displaySizeOf(select: HTMLSelectElement): number {
	const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(select.getAttribute("size") ?? "")
	return match ? Number(match[1]) : 1
}

function isDisabledOption(option: HTMLOptionElement): boolean {
	if (option.disabled) return true

	for (let parent = option.parentElement!; !isSelectElement(parent); parent = parent.parentElement!) {
		if (parent.localName === "optgroup" && parent.namespaceURI === HTML_NAMESPACE) {
			return (parent as HTMLOptGroupElement).disabled
		}
	}

	return false
}

// The parser selects the first option of a drop-down that has no `selected` option, so a new
// option can arrive selected and take the selection from the option the user chose. New options
// going into a select lose that implicit selection. The node leaves its parsed select
// first, where clearing an option would just select it again. Live nodes passed as the target
// keep their state, and so does a new select, whose options are its own.
function clearImplicitSelection(node: ChildNode, parent: ParentNode): void {
	if (node.nodeType !== ELEMENT_NODE_TYPE || parent.nodeType !== ELEMENT_NODE_TYPE) return
	if (node.isConnected && node.ownerDocument === parent.ownerDocument) return
	if (!isSelectElement(parent as Element) && !selectOf(parent)) return

	const element = node as Element
	if (isSelectElement(element)) return

	let selected: Array<HTMLOptionElement> | null = null
	if (isOptionElement(element)) {
		if (isImplicitlySelected(element)) selected = [element]
	} else {
		forEachNewOption(element, (option) => {
			if (isImplicitlySelected(option)) (selected ??= []).push(option)
		})
	}
	if (!selected) return

	element.remove()
	for (const option of selected as Array<HTMLOptionElement>) option.selected = false
}

function isImplicitlySelected(option: HTMLOptionElement): boolean {
	return option.selected && !option.hasAttribute("selected")
}

// Options inside an element, other than those of a select inside it, which keep their selection.
function forEachNewOption(element: Element, callback: (option: HTMLOptionElement) => void): void {
	for (let child = element.firstElementChild; child; child = child.nextElementSibling) {
		if (isOptionElement(child)) callback(child)
		else if (!isSelectElement(child)) forEachNewOption(child, callback)
	}
}

// Options belong to their select, so an element holding options only moves within its select.
// Customizable selects allow options inside other elements.
function movesOptionsBetweenSelects(live: Element, select: HTMLSelectElement | null): boolean {
	if (isSelectElement(live) || !live.querySelector("option")) return false
	return selectOf(live) !== select
}

// The select a child of the live `parent` belongs to.
function selectAt(parent: ParentNode): HTMLSelectElement | null {
	return isElement(parent) && isSelectElement(parent) ? parent : selectOf(parent)
}

// Customizable selects allow options nested inside other elements, so look past the parent.
function selectOf(node: Node): HTMLSelectElement | null {
	for (let parent = node.parentElement; parent; parent = parent.parentElement) {
		if (isSelectElement(parent)) return parent
	}

	return null
}

// The select each option belongs to, taken from the browser's own option lists. These leave
// out options the select doesn't own, such as those inside a datalist or a nested optgroup.
function optionSelectsOf(node: Element): Map<Element, HTMLSelectElement> {
	const optionSelects = new Map<Element, HTMLSelectElement>()
	const enclosing = selectOf(node)
	if (enclosing) addOptionSelects(optionSelects, enclosing)
	if (isSelectElement(node)) addOptionSelects(optionSelects, node)

	for (const select of node.querySelectorAll("select")) {
		if (isSelectElement(select)) addOptionSelects(optionSelects, select)
	}

	return optionSelects
}

function addOptionSelects(optionSelects: Map<Element, HTMLSelectElement>, select: HTMLSelectElement): void {
	for (const option of select.options) optionSelects.set(option, select)
}

// The options the markup selects, to tell whether a morph inside the select changed them.
function markupSelectionOf(select: HTMLSelectElement): Array<HTMLOptionElement | null> {
	if (!select.multiple) return [defaultOptionOf(select)]
	return Array.from(select.options).filter((option) => option.hasAttribute("selected"))
}

function clearDirtyFlags(elements: Array<Element>): void {
	for (let i = 0; i < elements.length; i++) {
		elements[i]!.removeAttribute(DIRTY_ATTRIBUTE)
	}
}

function parseFragment(string: string): DocumentFragment {
	const template = document.createElement("template")
	template.innerHTML = string
	trimFragmentEdgeWhitespace(template.content)

	return template.content
}

function parseDocument(string: string): Document {
	const parser = new DOMParser()
	return parser.parseFromString(trimAsciiWhitespace(string), "text/html")
}

/* v8 ignore start -- reorder fast paths are environment-sensitive */
function moveBefore(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (node === insertionPoint) return
	if (node.parentNode === parent) {
		if (node.nextSibling === insertionPoint) return
		if (SUPPORTS_MOVE_BEFORE) {
			;(parent as NodeWithMoveBefore).moveBefore(node, insertionPoint)
			return
		}
	}
	parent.insertBefore(node, insertionPoint)
}
/* v8 ignore stop */

// Radios that a change to a form unchecked by removing their `checked` attribute, with its value, so
// they're checked again the same way and keep following the markup.
const uncheckedByAttribute = new WeakMap<HTMLInputElement, string>()

/* v8 ignore start -- moveBefore keeps focus and other state, but only some browsers have it */
function moveInto(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (SUPPORTS_MOVE_BEFORE && node.isConnected && (parent as Node).isConnected) {
		try {
			;(parent as NodeWithMoveBefore).moveBefore(node, insertionPoint)
			return
		} catch {
			// Fall back to insertBefore, for example when the nodes are in different documents.
		}
	}
	parent.insertBefore(node, insertionPoint)
}
/* v8 ignore stop */

interface PendingMove {
	live: Element
	target: Element
	placeholder: Comment
	preserveChanges: boolean
	// A replacement asks `beforeNodeAdded` before it claims, so its target isn't asked again.
	approved: boolean
	// The live select the target ends up in.
	select: HTMLSelectElement | null
}

// The children of a live element and of its target while they're matched. Each live child is a candidate
// in one of the lists until a target takes it, and each target child is unmatched until it takes one. Whitespace
// is only ever matched with whitespace, so it's kept apart.
class Siblings {
	readonly from: Array<ChildNode>
	readonly to: Array<ChildNode>
	readonly candidateNodes: Array<number> = []
	readonly candidateElements: Array<number> = []
	readonly candidateElementsById: Map<string, Array<number>> = new Map()
	readonly whitespace: Array<number> = []
	readonly unmatchedNodes: Array<number> = []
	readonly unmatchedElements: Array<number> = []
	readonly candidateActive: Uint8Array
	readonly unmatchedActive: Uint8Array
	// The candidate each target took, and how the pair is morphed.
	readonly matches: Array<number> = []
	readonly op: Array<Operation> = []
	// The candidates holding the user's changes, by shape, once they've been matched.
	dirtyCandidatesByShape: Map<string, Array<number>> | null = null
	readonly #fromLocalNames: Array<string> = []
	readonly #fromNamespaces: Array<string | null> = []
	readonly #toLocalNames: Array<string> = []
	readonly #toNamespaces: Array<string | null> = []

	constructor(from: Element, to: Element) {
		this.from = nodeListToArray(from.childNodes)
		this.to = nodeListToArray(to.childNodes)
		this.candidateActive = new Uint8Array(this.from.length)
		this.unmatchedActive = new Uint8Array(this.to.length)

		for (let i = 0; i < this.from.length; i++) {
			const candidate = this.from[i]!
			if (isElement(candidate)) {
				this.candidateActive[i] = 1
				this.#fromLocalNames[i] = candidate.localName
				this.#fromNamespaces[i] = candidate.namespaceURI
				const id = candidate.id
				if (id === "") {
					this.candidateElements.push(i)
				} else {
					const bucket = this.candidateElementsById.get(id)
					if (bucket) bucket.push(i)
					else this.candidateElementsById.set(id, [i])
				}
			} else if (isWhitespaceTextNode(candidate)) {
				this.whitespace.push(i)
			} else {
				this.candidateActive[i] = 1
				this.candidateNodes.push(i)
			}
		}

		for (let i = 0; i < this.to.length; i++) {
			const node = this.to[i]!
			if (isElement(node)) {
				this.unmatchedActive[i] = 1
				this.#toLocalNames[i] = node.localName
				this.#toNamespaces[i] = node.namespaceURI
				this.unmatchedElements.push(i)
			} else if (!isWhitespaceTextNode(node)) {
				this.unmatchedActive[i] = 1
				this.unmatchedNodes.push(i)
			}
		}
	}

	// Whether the target and candidate elements have the same name and namespace.
	sameKind(target: number, candidate: number): boolean {
		return (
			this.#toLocalNames[target] === this.#fromLocalNames[candidate] &&
			this.#toNamespaces[target] === this.#fromNamespaces[candidate]
		)
	}

	take(target: number, candidate: number, op: Operation): void {
		this.matches[target] = candidate
		this.op[target] = op
		this.candidateActive[candidate] = 0
		this.unmatchedActive[target] = 0
	}
}

// A candidate for matching by choice: its index, the choices it holds, and the ones the user picked.
type ChoiceCandidate = [number, Array<string>, Array<string>]

// One pass pairing candidates with the targets they can take, as a bipartite matching, so one candidate
// taking a target never leaves another without one it could have had. Each candidate first takes the first
// free target in its lists, and paths are only searched for the rest, breadth first and without recursion,
// through the listed targets only, reaching each target once.
class ChoiceMatching {
	// The candidate owning each target.
	readonly owners: Map<number, number> = new Map()
	readonly #targets: Array<number>
	readonly #position: Map<number, number>
	readonly #takes: (k: number, target: number) => boolean
	readonly #listsOf: (k: number) => Array<Array<number>>
	readonly #likenessOf: (k: number) => string
	readonly #lists: Array<Array<Array<number>>> = []
	readonly #likenesses: Array<string> = []
	readonly #listIds: Map<Array<number>, number> = new Map()
	// Alike candidates share where each list's untried targets start.
	readonly #firstFree: Map<string, Map<Array<number>, number>> = new Map()
	// Until a search succeeds, the targets a failed search reached can't lead to a free target, and a
	// candidate alike to one whose search failed, with the same lists, fails too.
	readonly #deadTargets: Set<number> = new Set()
	readonly #failedSearches: Set<string> = new Set()
	readonly #unassigned: Array<number> = []

	constructor(
		targets: Array<number>,
		takes: (k: number, target: number) => boolean,
		listsOf: (k: number) => Array<Array<number>>,
		likenessOf: (k: number) => string,
	) {
		this.#targets = targets
		this.#position = new Map(targets.map((target, t) => [target, t]))
		this.#takes = takes
		this.#listsOf = listsOf
		this.#likenessOf = likenessOf
	}

	#listsFor(k: number): Array<Array<number>> {
		let lists = this.#lists[k]
		if (!lists) {
			lists = this.#lists[k] = this.#listsOf(k)
			for (const list of lists) if (!this.#listIds.has(list)) this.#listIds.set(list, this.#listIds.size)
		}
		return lists
	}

	#likeness(k: number): string {
		return (this.#likenesses[k] ??= this.#likenessOf(k))
	}

	// Give the candidate the first free target it can take, walking its lists together in target order.
	// Those it passes were taken or failed, for it and the candidates alike, so they're not tried again.
	assignFree(k: number): void {
		// A target the candidate can take is in its lists, so without any it has none.
		const lists = this.#listsFor(k)
		if (!lists.length) return
		const likeness = this.#likeness(k)
		let untried = this.#firstFree.get(likeness)
		if (!untried) this.#firstFree.set(likeness, (untried = new Map()))
		const heads: Array<number> = []
		for (const list of lists) {
			let head = untried.get(list) ?? 0
			while (head < list.length && this.owners.has(list[head]!)) head++
			heads.push(head)
		}
		let assigned = false
		while (!assigned) {
			let next: number | undefined
			for (let l = 0; l < lists.length; l++) {
				const target = lists[l]![heads[l]!]
				if (target !== undefined && (next === undefined || this.#position.get(target)! < this.#position.get(next)!)) {
					next = target
				}
			}
			if (next === undefined) break
			for (let l = 0; l < lists.length; l++) if (lists[l]![heads[l]!] === next) heads[l] = heads[l]! + 1
			if (this.owners.has(next) || !this.#takes(k, next)) continue
			this.owners.set(next, k)
			assigned = true
		}
		for (let l = 0; l < lists.length; l++) untried.set(lists[l]!, heads[l]!)
		if (!assigned) this.#unassigned.push(k)
	}

	// Search a path for each candidate still without a target, while there are free targets.
	assignRest(): void {
		for (const k of this.#unassigned) {
			if (this.owners.size === this.#targets.length) break
			this.#assign(k)
		}
	}

	// Search breadth first for a chain of candidates, each taking the next one's target, that ends at a free
	// target, and shift the targets along it.
	#assign(start: number): void {
		const search = `${this.#likeness(start)} ${this.#listsFor(start)
			.map((list) => this.#listIds.get(list)!)
			.join(" ")}`
		if (this.#failedSearches.has(search)) return
		const reachedFrom: Map<number, number> = new Map()
		const ownedTarget: Map<number, number> = new Map()
		// Alike candidates reach the same targets in a list, so each list is walked once for them.
		const walked: Set<string> = new Set()
		const queue = [start]
		for (let q = 0; q < queue.length; q++) {
			const k = queue[q]!
			for (const list of this.#listsFor(k)) {
				const walk = `${this.#likeness(k)} ${this.#listIds.get(list)!}`
				if (walked.has(walk)) continue
				walked.add(walk)
				for (const target of list) {
					if (reachedFrom.has(target) || this.#deadTargets.has(target) || !this.#takes(k, target)) continue
					reachedFrom.set(target, k)
					const owner = this.owners.get(target)
					if (owner !== undefined) {
						ownedTarget.set(owner, target)
						queue.push(owner)
						continue
					}
					for (let next: number | undefined = target; next !== undefined;) {
						const taker = reachedFrom.get(next)!
						this.owners.set(next, taker)
						next = ownedTarget.get(taker)
					}
					this.#deadTargets.clear()
					this.#failedSearches.clear()
					return
				}
			}
		}
		for (const target of reachedFrom.keys()) this.#deadTargets.add(target)
		this.#failedSearches.add(search)
	}
}

class Morph {
	readonly #options: Options
	#preserveChanges: boolean
	// Pending moves and removals are settled when the root's children have been visited, or when
	// the root is replaced, so the root's own callbacks see the finished DOM.
	#root: Node | null = null
	// The morph's own nodes are inside this node, between these two siblings when there are any.
	#scope: Node | null = null
	#scopeStart: Node | null = null
	#scopeEnd: Node | null = null
	// The target's root nodes, which bound the search for an option's select.
	readonly #targetRoots: Set<Node> = new Set()
	// Nodes whose visit or children's visit was vetoed, and controls with a vetoed attribute update.
	#vetoedNodes: Array<Node> | null = null
	#vetoedControls: Set<Element> | null = null

	// Discarding user changes: the `morphlex-clobber` elements, them and their ancestors, and the live node whose
	// subtree discards user changes while the rest of the morph preserves them.
	readonly #clobbered: Set<Element> | null
	#clobberedHolders: Set<Element> | null = null
	#clobberedScope: Node | null = null

	// Keeping user changes: elements flagged `morphlex-dirty` and their ancestors, which can't equal their
	// targets, so they're compared without the flag. The flagged elements themselves are kept too, since a nested
	// morph from a callback can clear their flags.
	readonly #dirtyElements: Set<Element> | null = null
	readonly #flagged: Set<Element> = new Set()
	readonly #targetChoices: Map<Element, { counts: Map<string, number>; size: number }> = new Map()
	// The select keying the target's options in a morph rooted at or inside a select, which the target's options
	// don't have.
	readonly #keySelect: HTMLSelectElement | null
	// The live select each target select is morphed into, so the target's options are keyed by the live select,
	// whose attributes a veto can keep.
	readonly #liveSelects: Map<Element, HTMLSelectElement> = new Map()

	// Moving elements across parents: live elements by id, and how often each id appears in the target. An element
	// whose id appears once in each tree is moved to wherever the target puts that id, even under another parent.
	readonly #idArrayMap: IdArrayMap = new WeakMap()
	readonly #idSetMap: IdSetMap = new WeakMap()
	readonly #liveElementsById: Map<string, Element | null> = new Map()
	readonly #targetIdCounts: Map<string, number> = new Map()
	readonly #targetElementsById: Map<string, Element> = new Map()
	// Movable elements left where they were, to be removed at the end unless they moved.
	#unplacedElements: Array<Element> | null = null
	// Approved removals put off until the end, because the node holds an element that may move out.
	#deferredRemovals: Array<ChildNode> | null = null
	// Moves wait for the morph to settle, because a later veto can still pin the element where it is.
	#pendingMoves: Array<PendingMove> | null = null
	readonly #claimedElements: Map<Element, PendingMove> = new Map()
	readonly #movesInProgress: Set<PendingMove> = new Set()
	// The latest pending move whose target holds each id.
	readonly #movesByTargetId: Map<string, PendingMove> = new Map()

	// Selects synced to their markup, synced again when the morph settles, after options have moved or gone.
	#syncedSelects: Set<HTMLSelectElement> | null = null
	// The select around a morph rooted inside it, and what its markup selected before the morph.
	#enclosingSelect: [HTMLSelectElement, Array<HTMLOptionElement | null>] | null = null

	// Radios whose checkedness the morph reset or whose radio group a move changed. Their groups are
	// synced to the markup when the morph settles, because moves complete out of document order.
	#radiosToSync: Set<HTMLInputElement> | null = null
	// Checked radios that moved unchecked, so they couldn't uncheck the rest of a group they joined.
	#radiosUncheckedForMove: Set<HTMLInputElement> | null = null
	// Radios unchecked by a radio checked again straight after changing form, and that radio. They're
	// checked again when the morph settles if that radio has left their group by then.
	#displacedRadios: Map<HTMLInputElement, HTMLInputElement> | null = null
	// Only a target with a checked input can add a checked radio, so other morphs skip looking for one.
	#targetChecksInputs = false

	// Items of exclusive accordions (`details` with a name) the morph wants open, with their `open` value.
	// Inserting an open item, or giving one a name, closes it while another in its group is open, so the
	// noted items are opened again when the morph settles.
	#openDetails: Map<Element, string> | null = null
	// Only a target with an open `details` can add one, so other morphs skip looking for one.
	#targetOpensDetails = false

	constructor(
		options: Options = {},
		clobbered: Set<Element> | null = null,
		flagged: Array<Element> | null = null,
		keySelect: HTMLSelectElement | null = null,
	) {
		this.#options = options
		this.#keySelect = keySelect
		this.#clobbered = clobbered
		this.#preserveChanges = options.preserveChanges ?? false
		if (flagged?.length) {
			const dirtyElements = new Set<Element>()
			for (const element of flagged) {
				this.#flagged.add(element)
				for (let node: Element | null = element; node && !dirtyElements.has(node); node = node.parentElement) {
					dirtyElements.add(node)
				}
			}
			this.#dirtyElements = dirtyElements
		}
	}

	morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode>): void {
		this.#root = from
		// A detached root has no siblings, so it's its own scope.
		this.#scope = from.parentNode ?? from
		this.#scopeStart = from.previousSibling
		this.#scopeEnd = from.nextSibling
		if (isParentNode(from)) {
			this.#mapIdSets(from)
		}

		if (isNodeList(to)) {
			for (const node of to) this.#targetRoots.add(node)
			this.#mapIdArraysForEach(to)
			if (this.#targetOpensDetails) closeLaterOpenDetails(to)
			this.#morphOneToMany(from, to)
		} else {
			this.#targetRoots.add(to)
			if (isParentNode(to)) {
				this.#mapIdArrays(to)
			}
			if (this.#targetOpensDetails) closeLaterOpenDetails([to])
			this.#morphOneToOne(from, to)
		}

		this.#finish()
	}

	morphChildren(from: Element, to: Element): void {
		this.#root = from
		this.#scope = from
		this.#targetRoots.add(to)
		this.#mapIdSets(from)
		this.#mapIdArrays(to, false)
		if (this.#targetOpensDetails) closeLaterOpenDetails(to.children)
		this.visitChildNodes(from, to)
		this.#finish()
	}

	#settleIfRoot(node: Node): void {
		if (node === this.#root) this.#finish()
	}

	#finish(): void {
		this.#completeMoves()

		const unplaced = this.#unplacedElements
		if (unplaced) {
			for (let i = 0; i < unplaced.length; i++) {
				const element = unplaced[i]!
				if (this.#liveElementsById.has(element.id)) this.#removeNode(element, true)
			}
			this.#unplacedElements = null
		}

		const deferred = this.#deferredRemovals
		if (deferred) {
			for (let i = 0; i < deferred.length; i++) {
				const node = deferred[i]!
				this.#removeChild(node)
				this.#options.afterNodeRemoved?.(node)
			}
			this.#deferredRemovals = null
		}

		// Option wrappers can move or go after a select was synced, which keeps the old selection, so sync it again.
		const selects = this.#syncedSelects
		if (selects) {
			const preserveChanges = this.#preserveChanges
			this.#preserveChanges = false
			for (const select of selects) this.#syncDefaultSelection(select)
			this.#preserveChanges = preserveChanges
			this.#syncedSelects = null
		}

		const displaced = this.#displacedRadios
		if (displaced) {
			this.#displacedRadios = null
			this.#restoreDisplacedRadios(displaced)
		}

		const unchecked = this.#radiosUncheckedForMove
		if (unchecked) {
			this.#radiosUncheckedForMove = null
			const groups: RadioGroups = new Map()
			for (const radio of unchecked) {
				if (radio.checked || !(radio.hasAttribute("checked") || this.#isVetoed(radio))) continue
				// Checking it would uncheck the rest of its new group, where a checked radio that's vetoed stays checked.
				if (radioGroupOf(radio, groups).some((member) => member.checked && this.#isVetoed(member))) continue
				radio.checked = true
			}
		}

		const radios = this.#radiosToSync
		if (radios) {
			this.#radiosToSync = null
			this.#syncRadioGroups(radios)
		}

		const openDetails = this.#openDetails
		if (openDetails) {
			this.#openDetails = null
			this.#reopenDetails(openDetails)
		}

		this.#syncEnclosingSelect()
	}

	// Open each item the morph wants open but the browser closed, in document order, so the first one wins
	// as when parsing. An item stays closed while another in its group is open, since opening it would
	// close that one, which is either wanted open too, outside the morph, vetoed or kept open by the user.
	#reopenDetails(openDetails: Map<Element, string>): void {
		const closed: Array<Element> = []
		for (const details of openDetails.keys()) {
			if (!details.hasAttributeNS(null, "open") && this.#inScope(details)) closed.push(details)
		}
		closed.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

		for (const details of closed) {
			if (openDetailsInGroup(details).length === 0) details.setAttributeNS(null, "open", openDetails.get(details)!)
		}
	}

	// Completing a move morphs the element, which can claim more elements, so keep going until none are left.
	#completeMoves(): void {
		for (let moves = this.#pendingMoves; moves; moves = this.#pendingMoves) {
			this.#pendingMoves = null
			for (let i = 0; i < moves.length; i++) this.#completeMove(moves[i]!)
		}
	}

	#morphOneToMany(from: ChildNode, to: NodeListOf<ChildNode>): void {
		const length = to.length

		if (length === 0) {
			this.#removeNode(from)
		} else if (length === 1) {
			this.#morphOneToOne(from, to[0]!)
		} else {
			const parent = from.parentNode
			if (!parent) throw new Error(DETACHED_NODE_ERROR)

			// Add the other nodes first, so moves into them are settled when the first node's morph finishes.
			const newNodes = [...to]
			const first = newNodes.shift()!
			const insertionPoint = from.nextSibling
			for (let i = 0; i < newNodes.length; i++) {
				this.#addNode(parent, newNodes[i]!, insertionPoint)
			}

			this.#morphOneToOne(from, first)
		}
	}

	#morphOneToOne(from: ChildNode, to: ChildNode): void {
		// Fast path: if nodes are exactly the same object, skip morphing
		if (from === to) return
		if (isEqualNode(from, to)) return

		if (from.nodeType === ELEMENT_NODE_TYPE && to.nodeType === ELEMENT_NODE_TYPE) {
			if (canMorphElementInPlace(from as Element, to as Element)) {
				this.#morphMatchingElements(from as Element, to as Element)
			} else {
				this.#morphNonMatchingElements(from as Element, to as Element)
			}
		} else {
			this.#morphOtherNode(from, to)
		}
	}

	#morphMatchingElements(from: Element, to: Element): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
			this.#pinSubtree(from)
			return
		}

		// Discard user changes inside a `morphlex-clobber` element, as if `preserveChanges` were off.
		const preserveChanges = this.#preserveChanges
		const clobberedScope = this.#clobberedScope
		if (preserveChanges && this.#clobbered?.has(to)) {
			this.#preserveChanges = false
			this.#clobberedScope = from
		}

		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(from, to)
		}

		if (isTextAreaElement(from) && isTextAreaElement(to)) {
			this.#visitTextArea(from, to)
		} else if (from.hasChildNodes() || to.hasChildNodes() || isTemplateElement(from)) {
			this.visitChildNodes(from, to)
		}
		// A root without children to visit settles here, so its afterNodeVisited sees the finished DOM.
		this.#settleIfRoot(from)

		this.#preserveChanges = preserveChanges
		this.#clobberedScope = clobberedScope
		this.#options.afterNodeVisited?.(from, to)
	}

	#morphNonMatchingElements(from: Element, to: Element): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
			this.#pinSubtree(from)
			return
		}

		this.#replaceNode(from, to)

		this.#options.afterNodeVisited?.(from, to)
	}

	#morphOtherNode(from: ChildNode, to: ChildNode): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
			this.#pinSubtree(from)
			return
		}

		const fromValue = from.nodeValue
		const toValue = to.nodeValue

		if (from.nodeType === to.nodeType && fromValue !== null && toValue !== null) {
			from.nodeValue = toValue
		} else {
			this.#replaceNode(from, to)
		}

		this.#options.afterNodeVisited?.(from, to)
	}

	#visitAttributes(from: Element, to: Element): void {
		from.removeAttribute(DIRTY_ATTRIBUTE)

		const details = isDetailsElement(from)
		const open = details ? from.getAttributeNS(null, "open") : null
		// The user toggles `open` on these elements, so with `preserveChanges` it's neither added nor removed.
		const keepsOpen = this.#preserveChanges && hasOpenState(from)

		// First pass: update/add attributes from reference (iterate forwards)
		const toAttributes = to.attributes
		for (let i = 0; i < toAttributes.length; i++) {
			const attribute = toAttributes[i]!
			const { name, localName, value, namespaceURI } = attribute
			// Adding `open` would open it, but changing the value of an existing one is fine.
			if (keepsOpen && name === "open" && namespaceURI === null && !from.hasAttributeNS(null, "open")) continue
			const oldValue = from.getAttributeNS(namespaceURI, localName)

			if (oldValue === value) continue
			if (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true) {
				// Go through `Attr` nodes, because `setAttribute` rejects names the parser accepts, like `@click`.
				// Look the attribute up after the callback, which may have removed or replaced it.
				const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, value)
				const existing = from.getAttributeNodeNS(namespaceURI, localName)
				if (existing) {
					existing.value = value
				} else if (details && name === "open" && namespaceURI === null) {
					this.#openDetailsItem(from, value)
				} else {
					from.setAttributeNodeNS(attribute.cloneNode() as Attr)
				}
				this.#checkRadios(radios)
				this.#options.afterAttributeUpdated?.(from, name, oldValue)
			} else {
				this.#noteVetoedAttribute(from, name, namespaceURI)
			}
		}

		// Second pass: remove excess attributes. Check for any first, to avoid copying the attribute list.
		if (hasExcessAttributes(from, to)) {
			for (const { name, localName, value, namespaceURI } of Array.from(from.attributes)) {
				if (!to.hasAttributeNS(namespaceURI, localName)) {
					if (keepsOpen && name === "open" && namespaceURI === null) continue

					if (this.#options.beforeAttributeUpdated?.(from, name, null) ?? true) {
						// Removing `open` from a modal dialog leaves it stuck in the top layer, so close it properly.
						if (name === "open" && namespaceURI === null && isDialogElement(from)) {
							from.close()
						} else {
							const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, null)
							from.removeAttributeNS(namespaceURI, localName)
							this.#checkRadios(radios)
							// The markup unchecks it, so it doesn't get back a check another radio took from it.
							if (name === "checked") this.#displacedRadios?.delete(from as HTMLInputElement)
						}
						this.#options.afterAttributeUpdated?.(from, name, value)
					} else {
						this.#noteVetoedAttribute(from, name, namespaceURI)
					}
				}
			}
		}

		if (details) this.#noteIntendedOpen(from, to, open)

		if (!this.#preserveChanges) {
			this.#resetFormProperties(from, to)
		}
	}

	// Note the `open` value the morph means an accordion item to have, whatever the browser does to it:
	// the target's, unless the update was vetoed, or `preserveChanges` keeps the item open or closed.
	#noteIntendedOpen(details: Element, to: Element, open: string | null): void {
		const vetoed = this.#vetoedControls?.has(details) ?? false
		let intended = to.getAttributeNS(null, "open")
		if (vetoed) intended = open
		else if (this.#preserveChanges) intended = open === null ? null : (intended ?? open)

		if (intended === null) return

		;(this.#openDetails ??= new Map()).set(details, intended)
	}

	// Opening an accordion item closes the open one in its group, which may be vetoed, kept by the user,
	// or wanted open by the target, since the morph may not have reached it yet. So the item opens outside
	// its group, and rejoining the group closes it instead. It's opened again when the morph settles, if
	// nothing else in its group is open by then.
	#openDetailsItem(details: Element, value: string): void {
		const name = details.getAttributeNS(null, "name")
		if (name && openDetailsInGroup(details).length > 0) {
			details.setAttributeNS(null, "name", "")
			details.setAttributeNS(null, "open", value)
			details.setAttributeNS(null, "name", name)
		} else {
			details.setAttributeNS(null, "open", value)
		}
	}

	// Note the open accordion items in a new node, since the browser closes them on insertion while
	// another item in their group is open.
	#noteAddedDetails(element: Element): void {
		const openDetails = (this.#openDetails ??= new Map())
		const open = isDetailsElement(element) ? element.getAttributeNS(null, "open") : null
		if (open !== null) openDetails.set(element, open)
		const items = element.getElementsByTagName("details")
		for (let i = 0; i < items.length; i++) {
			const item = items[i]!
			const value = item.getAttributeNS(null, "open")
			if (value !== null && isDetailsElement(item)) openDetails.set(item, value)
		}
	}

	// Reset user changes to match the target markup. Skip any property whose
	// attribute update was vetoed, since the attributes then still differ.
	#resetFormProperties(from: Element, to: Element): void {
		if (isInputElement(from)) {
			const checked = to.hasAttribute("checked")
			// The markup decides, so it doesn't get back a check another radio took from it.
			if (from.hasAttribute("checked") === checked) this.#displacedRadios?.delete(from)
			if (from.checked !== checked && from.hasAttribute("checked") === checked) {
				from.checked = checked
				if (from.type === "radio") (this.#radiosToSync ??= new Set()).add(from)
			} else if (checked && from.type === "radio") {
				// Adding `checked` checks the radio, which unchecks the others in its group, even later ones.
				;(this.#radiosToSync ??= new Set()).add(from)
			}

			// Checkbox and radio values aren't user-editable, and assigning them writes the value attribute.
			// The browser sanitizes both values, so compare with what the target's markup shows.
			const type = from.type
			const value = to.getAttribute("value")
			const target = to as HTMLInputElement
			if (
				type !== "file" &&
				type !== "checkbox" &&
				type !== "radio" &&
				type === target.type &&
				from.getAttribute("value") === value
			) {
				const shown = isDirtyInput(target) ? (value ?? "") : target.value
				if (from.value !== shown && !resanitizeValue(from, to, value, shown)) from.value = shown
			}
		} else if (isOptionElement(from)) {
			const selected = to.hasAttribute("selected")
			if (from.selected !== selected && from.hasAttribute("selected") === selected) {
				from.selected = selected
			}
		}
	}

	#visitTextArea(from: HTMLTextAreaElement, to: HTMLTextAreaElement): void {
		const newTextContent = to.textContent || ""

		// Update text content (which updates defaultValue). The browser keeps `.value` in sync
		// with it until the textarea's value is dirty, so it decides whether the user changed it.
		if (from.textContent !== newTextContent) {
			from.textContent = newTextContent
		}

		if (this.#preserveChanges) return

		// Assigning `.value` marks it dirty, so only do it when it has actually diverged.
		if (isDirtyTextArea(from)) {
			from.value = from.defaultValue
		}
	}

	visitChildNodes(from: Element, to: Element): void {
		if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) {
			this.#pinSubtree(from)
			this.#settleIfRoot(from)
			return
		}

		if (isTemplateElement(from) && isTemplateElement(to)) {
			this.#visitTemplateContent(from, to)
			this.#settleIfRoot(from)
			this.#options.afterChildrenVisited?.(from)
			return
		}

		if (isSelectElement(from) && isSelectElement(to)) this.#liveSelects.set(to, from)

		// Each pass pairs the targets still without a candidate with the candidates still free, from the surest
		// pairing to the loosest, and the remaining candidates are removed before the targets are placed.
		const siblings = new Siblings(from, to)
		this.#matchEqualElements(siblings)
		this.#matchDirtyElements(siblings)
		this.#matchElementsById(siblings)
		this.#leaveClaimedTargets(siblings, from)
		this.#matchElementsByIdSets(siblings)
		if (this.#preserveChanges && this.#dirtyElements) {
			this.#matchElementsByChoices(siblings)
			this.#takeEqualTargetsForChoices(siblings)
		}
		this.#matchElementsByAttributes(siblings)
		this.#matchElementsByKind(siblings)
		this.#matchEqualNodes(siblings)
		this.#matchNodesByType(siblings)
		this.#orderIdenticalCandidates(siblings)
		for (let i = 0; i < siblings.from.length; i++) {
			if (siblings.candidateActive[i]) this.#removeNode(siblings.from[i]!)
		}
		this.#placeChildren(from, siblings)

		this.#settleIfRoot(from)
		if (isSelectElement(from)) this.#syncDefaultSelection(from)

		this.#options.afterChildrenVisited?.(from)
	}

	// Match elements by isEqualNode. Equal nodes have equal text content, so with many siblings,
	// bucket the candidates by it rather than comparing every pair. An element holding the user's changes can't
	// equal its target, so it's left for the pass after this one.
	#matchEqualElements(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive } = siblings
		const dirtyElements = this.#dirtyElements
		const candidatesByText =
			candidateElements.length * unmatchedElements.length > 1024 ? bucketByTextContent(from, candidateElements) : null

		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			const element = to[target] as Element
			let candidates = candidateElements
			if (candidatesByText) {
				const bucket = candidatesByText.get(element.textContent!)
				if (bucket === undefined) continue
				candidates = bucket
			}

			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue
				const candidate = from[candidateIndex] as Element
				if (dirtyElements?.has(candidate)) continue

				if (isEqualNode(candidate, element)) {
					siblings.take(target, candidateIndex, Operation.EqualNode)
					break
				}
			}
		}
	}

	// Match elements that only differ by the user's changes, so a changed control keeps its own target.
	// Such elements share their shape, so the candidates are bucketed by it rather than comparing every pair.
	#matchDirtyElements(siblings: Siblings): void {
		const dirtyElements = this.#dirtyElements
		if (!dirtyElements) return
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings

		const candidatesByShape: Map<string, Array<number>> = (siblings.dirtyCandidatesByShape = new Map())
		for (let c = 0; c < candidateElements.length; c++) {
			const candidateIndex = candidateElements[c]!
			const candidate = from[candidateIndex] as Element
			if (!candidateActive[candidateIndex] || !dirtyElements.has(candidate)) continue
			const shape = shapeOf(candidate)
			const bucket = candidatesByShape.get(shape)
			if (bucket) bucket.push(candidateIndex)
			else candidatesByShape.set(shape, [candidateIndex])
		}

		const firstActive: Map<Array<number>, number> = new Map()
		for (let i = 0; candidatesByShape.size && i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue
			const element = to[target] as Element
			const candidates = candidatesByShape.get(shapeOf(element))
			// A target discarding user changes can't keep them, so it's left for the passes that rank it last.
			if (!candidates || this.#holdsClobbered(element)) continue

			// Elements with the same shape are equal apart from `morphlex-dirty`, so the target takes the bucket's first
			// candidate that isn't taken yet.
			let c = firstActive.get(candidates) ?? 0
			while (c < candidates.length && !candidateActive[candidates[c]!]) c++
			firstActive.set(candidates, c)
			const candidateIndex = candidates[c]
			if (candidateIndex !== undefined) siblings.take(target, candidateIndex, Operation.SameElement)
		}
	}

	// Match by exact id.
	#matchElementsById(siblings: Siblings): void {
		const { to, candidateElementsById, unmatchedElements, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const id = (to[target] as Element).id
			if (id === "") continue

			const candidates = candidateElementsById.get(id)
			if (candidates === undefined) continue

			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (candidateActive[candidateIndex] && siblings.sameKind(target, candidateIndex)) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// A target whose live element is elsewhere is left for #addNode to claim, so no other candidate takes its id.
	#leaveClaimedTargets(siblings: Siblings, parent: Element): void {
		const { to, unmatchedElements, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (unmatchedActive[target] && this.#canClaim(to[target] as Element, parent)) unmatchedActive[target] = 0
		}
	}

	// Match a target by the ids inside it against the ids inside each candidate, since elements holding ids
	// may not have ids themselves.
	#matchElementsByIdSets(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const idArray = this.#idArrayMap.get(to[target]!)
			if (!idArray) continue

			candidateLoop: for (let c = 0; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue

				const candidateIdSet = this.#idSetMap.get(from[candidateIndex]!)
				if (!candidateIdSet) continue
				for (let a = 0; a < idArray.length; a++) {
					if (candidateIdSet.has(idArray[a]!)) {
						siblings.take(target, candidateIndex, Operation.SameElement)
						break candidateLoop
					}
				}
			}
		}
	}

	// Under preserveChanges, match a checkbox, radio or option the user changed to a target with the same
	// choice, and a wrapper without its own identity holding some to a target holding one of the same choices,
	// so other elements can't take their targets and the user's choices keep their values. A wrapper tries targets
	// without their own identity first, so a new label with an id can't take its place, but can still take its own
	// target when it gains an id. A changed control, or a select, tries targets without an id first in the same way.
	// Then targets with the same attributes apart from class and style, so a form doesn't
	// take another form's target for holding the same choice, and then targets holding all of its choices.
	#matchElementsByChoices(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings

		// Candidates holding more choices go first, so one holding fewer can't take the only target holding them all.
		const choiceCandidates: Array<ChoiceCandidate> = []
		for (let c = 0; c < candidateElements.length; c++) {
			const candidateIndex = candidateElements[c]!
			if (!candidateActive[candidateIndex]) continue
			const candidate = from[candidateIndex] as Element
			const dirtyChoices = this.#dirtyChoicesOf(candidate)
			if (dirtyChoices && (this.#holdsOwnChoices(candidate) || canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate)))) {
				choiceCandidates.push([candidateIndex, dirtyChoices.choices, dirtyChoices.picked])
			}
		}
		choiceCandidates.sort((a, b) => b[1].length - a[1].length)

		// Passes needing the same attributes index targets by their attributes too, so candidates skip the others.
		const attributeKeys: Map<Element, string> = new Map()
		const indexKey = (element: Element, choice: string, sameAttributes: boolean): string => {
			if (!sameAttributes) return choice
			let key = attributeKeys.get(element)
			if (key === undefined) attributeKeys.set(element, (key = attributesKeyOf(element, STYLING_ATTRIBUTES)))
			return `${key}\n${choice}`
		}

		for (const [identified, sameAttributes, allChoices, pickedOnly] of CHOICE_PASSES) {
			// The choices each candidate is matched by in this pass.
			const choicesOf = (k: number): Array<string> => choiceCandidates[k]![pickedOnly ? 2 : 1]

			// Whether the candidate can take the target in this pass.
			const takes = (k: number, target: number): boolean => {
				const candidateIndex = choiceCandidates[k]![0]
				if (!siblings.sameKind(target, candidateIndex)) return false
				const candidate = from[candidateIndex] as Element
				const element = to[target] as Element
				return (
					hasSameIs(candidate, element) &&
					identified ===
						(this.#holdsOwnChoices(candidate)
							? this.#idArrayMap.has(element)
							: !canSoftMatchByTagName(element, this.#idArrayMap.has(element))) &&
					this.#holdsChoices(choicesOf(k), element, allChoices)
				)
			}

			// The targets in the order candidates try them, smallest first when a candidate needs all of its choices.
			const targets = unmatchedElements.filter((i) => unmatchedActive[i])
			if (allChoices) {
				targets.sort((a, b) => this.#targetChoicesOf(to[a] as Element).size - this.#targetChoicesOf(to[b] as Element).size)
			}

			// A candidate can only take a target holding one of its choices, so index the targets by the choices
			// they hold, in the order candidates try them.
			const holders: Map<string, Array<number>> = new Map()
			for (const target of targets) {
				const element = to[target] as Element
				for (const choice of this.#targetChoicesOf(element).counts.keys()) {
					const key = indexKey(element, choice, sameAttributes)
					const list = holders.get(key)
					if (list) list.push(target)
					else holders.set(key, [target])
				}
			}

			// The lists holding the targets the candidate can take. A target holding all of its choices is in every
			// list, so then only the shortest is needed.
			const listsOf = (k: number): Array<Array<number>> => {
				const candidate = from[choiceCandidates[k]![0]] as Element
				let candidateLists: Array<Array<number>> = []
				for (const choice of new Set(choicesOf(k))) {
					const list = holders.get(indexKey(candidate, choice, sameAttributes))
					if (list) candidateLists.push(list)
					else if (allChoices) return []
				}
				if (allChoices && candidateLists.length) {
					candidateLists = [candidateLists.reduce((a, b) => (b.length < a.length ? b : a))]
				}
				return candidateLists
			}

			// Candidates alike in everything `takes` checks pass and fail the same targets. A target in a list holds
			// one of the candidate's choices, so when one choice is enough, their choices don't matter.
			const likenessOf = (k: number): string => {
				const candidate = from[choiceCandidates[k]![0]] as Element
				return JSON.stringify([
					candidate.namespaceURI,
					candidate.localName,
					candidate.getAttribute("is"),
					this.#holdsOwnChoices(candidate),
					allChoices && [...choicesOf(k)].sort(),
					sameAttributes && indexKey(candidate, "", true),
				])
			}

			const matching = new ChoiceMatching(targets, takes, listsOf, likenessOf)
			for (let k = 0; k < choiceCandidates.length; k++) {
				if (candidateActive[choiceCandidates[k]![0]] && choicesOf(k).length) matching.assignFree(k)
			}
			matching.assignRest()

			for (const [target, k] of matching.owners) siblings.take(target, choiceCandidates[k]![0], Operation.SameElement)
		}
	}

	// An element holding the user's choices that's still without a target takes one that an identical
	// untouched sibling took, so the untouched sibling goes rather than the user's choices.
	#takeEqualTargetsForChoices(siblings: Siblings): void {
		const { from, to, unmatchedElements, candidateActive, matches, op } = siblings
		let equalTargets: Map<string, Array<number>> | null = null
		const firstEqual: Map<Array<number>, number> = new Map()
		for (const [shape, candidates] of siblings.dirtyCandidatesByShape!) {
			for (const candidateIndex of candidates) {
				if (!candidateActive[candidateIndex]) continue
				if (!this.#dirtyChoicesOf(from[candidateIndex] as Element)) continue
				if (!equalTargets) {
					equalTargets = new Map()
					for (const target of unmatchedElements) {
						if (op[target] !== Operation.EqualNode) continue
						const element = to[target] as Element
						if (this.#holdsClobbered(element)) continue
						const targetShape = shapeOf(element)
						const list = equalTargets.get(targetShape)
						if (list) list.push(target)
						else equalTargets.set(targetShape, [target])
					}
				}
				const list = equalTargets.get(shape)
				if (!list) continue
				// Each target is taken once, so the list skips its taken prefix.
				const t = firstEqual.get(list) ?? 0
				const target = list[t]
				if (target === undefined) continue
				firstEqual.set(list, t + 1)
				candidateActive[matches[target]!] = 1
				siblings.take(target, candidateIndex, Operation.SameElement)
			}
		}
	}

	// Match by a shared `name`, `href` or `src`.
	#matchElementsByAttributes(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const element = to[target] as Element
			const name = element.getAttribute("name")
			const href = element.getAttribute("href")
			const src = element.getAttribute("src")
			if (!name && !href && !src) continue

			for (let c = 0; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue
				const candidate = from[candidateIndex] as Element

				if (
					((name && name === candidate.getAttribute("name")) ||
						(href && href === candidate.getAttribute("href")) ||
						(src && src === candidate.getAttribute("src"))) &&
					!this.#holdsOtherChoice(candidate, element)
				) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// Match elements of the same kind, only for elements without distinguishing attributes.
	#matchElementsByKind(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		let firstActiveCandidate = 0
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const element = to[target] as Element
			if (!canSoftMatchByTagName(element, this.#idArrayMap.has(element))) continue

			while (firstActiveCandidate < candidateElements.length && !candidateActive[candidateElements[firstActiveCandidate]!]) {
				firstActiveCandidate++
			}

			for (let c = firstActiveCandidate; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c]!
				if (!candidateActive[candidateIndex]) continue

				const candidate = from[candidateIndex] as Element
				if (!canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate))) continue

				if (siblings.sameKind(target, candidateIndex) && !this.#holdsOtherChoice(candidate, element)) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// The isEqualNode pass gives a target the first equal candidate, which can be the identical sibling of a
	// changed element's live node, and the changed target then takes the sibling's place, so the two swap.
	// Identical candidates are interchangeable, so give each set of them to its targets in order instead, when that
	// leaves more nodes in place. This runs after the other nodes are matched, since they count too.
	// An element holding the user's changes isn't equal to anything, so it trades with the untouched siblings of
	// its shape that took equal targets instead.
	#orderIdenticalCandidates(siblings: Siblings): void {
		const { from, to, unmatchedElements, matches, op } = siblings
		const dirtyElements = this.#dirtyElements

		if (dirtyElements) {
			// The changed elements, and the untouched candidates that took an equal target, unless the target discards
			// the user's changes, so no changed element trades into it.
			const candidates: Array<number> = []
			const changed: Array<number> = []
			const targetOf: Array<number> = []
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i]!
				const candidate = matches[target]
				if (candidate === undefined || this.#holdsClobbered(to[target] as Element)) continue
				if (dirtyElements.has(from[candidate] as Element)) changed.push(candidate)
				else if (op[target] !== Operation.EqualNode) continue
				candidates.push(candidate)
				targetOf[candidate] = target
			}
			if (changed.length && candidates.length > changed.length) {
				// A shape spans the whole subtree, so it's only worked out for candidates with a changed element's name
				// and text, and they're bucketed by it rather than compared pair by pair.
				const keyOf = (index: number): string => `${(from[index] as Element).localName} ${from[index]!.textContent}`
				const changedKeys = new Set(changed.map(keyOf))
				const shapes: Array<string> = []
				const candidatesByShape: Map<string, Array<number>> = new Map()
				for (const candidate of candidates) {
					if (!changedKeys.has(keyOf(candidate))) continue
					const shape = (shapes[candidate] = shapeOf(from[candidate]!))
					const bucket = candidatesByShape.get(shape)
					if (bucket) bucket.push(candidate)
					else candidatesByShape.set(shape, [candidate])
				}
				const ordered = matches.slice()
				// Keep the order the passes chose if ordering leaves fewer nodes in place. Unlike untouched siblings, on a
				// tie the changed element keeps its position, so the user's text stays in its box.
				if (
					orderSets(ordered, changed, targetOf, (candidate) => candidatesByShape.get(shapes[candidate]!)!) &&
					longestIncreasingSubsequence(ordered).length >= longestIncreasingSubsequence(matches).length
				) {
					for (let i = 0; i < unmatchedElements.length; i++) {
						const target = unmatchedElements[i]!
						const candidate = (matches[target] = ordered[target]!)
						// Equal targets skip the morph, which a changed element needs.
						if (candidate !== undefined && dirtyElements.has(from[candidate] as Element)) op[target] = Operation.SameElement
					}
				}
			}
		}

		// The untouched candidates that can trade targets, the ones taken by a target they didn't equal, and the
		// target of each.
		const candidates: Array<number> = []
		const changed: Array<number> = []
		const targetOf: Array<number> = []
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			const candidate = matches[target]
			if (candidate === undefined || dirtyElements?.has(from[candidate] as Element)) continue
			candidates.push(candidate)
			targetOf[candidate] = target
			if (op[target] !== Operation.EqualNode) changed.push(candidate)
		}
		if (changed.length) {
			// Equal nodes have equal text content, so with many siblings, compare within its bucket.
			const candidatesByText = changed.length * candidates.length > 1024 ? bucketByTextContent(from, candidates) : null
			const identicalTo = (candidate: number): Array<number> =>
				(candidatesByText ? candidatesByText.get(from[candidate]!.textContent!)! : candidates).filter(
					(other) => other === candidate || isEqualNode(from[other]!, from[candidate]!),
				)
			// Ordering a set can cross other matches, so keep the order the passes chose unless ordering leaves more
			// nodes in place. On a tie, it's other nodes that move, and whitespace is reused around the nodes that stay.
			const ordered = matches.slice()
			if (
				orderSets(ordered, changed, targetOf, identicalTo) &&
				longestIncreasingSubsequence(ordered).length > longestIncreasingSubsequence(matches).length
			) {
				for (let target = 0; target < ordered.length; target++) matches[target] = ordered[target]!
			}
		}
	}

	// Match the other nodes by isEqualNode.
	#matchEqualNodes(siblings: Siblings): void {
		const { from, to, candidateNodes, unmatchedNodes, candidateActive } = siblings
		for (let i = 0; i < unmatchedNodes.length; i++) {
			const target = unmatchedNodes[i]!
			const node = to[target]!
			for (let c = 0; c < candidateNodes.length; c++) {
				const candidateIndex = candidateNodes[c]!
				if (candidateActive[candidateIndex] && from[candidateIndex]!.isEqualNode(node)) {
					siblings.take(target, candidateIndex, Operation.EqualNode)
					break
				}
			}
		}
	}

	// Match the other nodes by node type.
	#matchNodesByType(siblings: Siblings): void {
		const { from, to, candidateNodes, unmatchedNodes, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedNodes.length; i++) {
			const target = unmatchedNodes[i]!
			if (!unmatchedActive[target]) continue

			const nodeType = to[target]!.nodeType
			for (let c = 0; c < candidateNodes.length; c++) {
				const candidateIndex = candidateNodes[c]!
				if (candidateActive[candidateIndex] && nodeType === from[candidateIndex]!.nodeType) {
					siblings.take(target, candidateIndex, Operation.SameNode)
					break
				}
			}
		}
	}

	// Put the target's children in order, moving the matched candidates that aren't already in order, morphing
	// each into its target and adding the targets nothing matched.
	#placeChildren(parent: Element, siblings: Siblings): void {
		const { from, to, matches, op } = siblings

		// The nodes in the longest increasing subsequence of matches don't need to move.
		const lisIndices = longestIncreasingSubsequence(matches)
		const shouldNotMove: Array<boolean> = new Array(from.length)
		for (let i = 0; i < lisIndices.length; i++) {
			shouldNotMove[matches[lisIndices[i]!]!] = true
		}

		// Whitespace stays in place for now, so target whitespace can reuse whatever is at the insertion point.
		const liveWhitespace: Set<ChildNode> | null = siblings.whitespace.length ? new Set() : null
		for (let i = 0; i < siblings.whitespace.length; i++) {
			liveWhitespace!.add(from[siblings.whitespace[i]!]!)
		}

		let insertionPoint: ChildNode | null = parent.firstChild
		const placed: Array<ChildNode> = []
		for (let i = 0; i < to.length; i++) {
			// A callback can remove the insertion point, such as the whitespace after the node it visits.
			// Then carry on after the last node placed that's still here.
			if (insertionPoint && insertionPoint.parentNode !== parent) {
				insertionPoint = parent.firstChild
				for (let index = placed.length - 1; index >= 0; index--) {
					if (placed[index]!.parentNode === parent) {
						insertionPoint = placed[index]!.nextSibling
						break
					}
				}
			}

			const node = to[i]!
			const matchInd = matches[i]
			if (insertionPoint && liveWhitespace?.has(insertionPoint) && isWhitespaceTextNode(node)) {
				const whitespace: ChildNode = insertionPoint
				liveWhitespace.delete(whitespace)
				placed.push(whitespace)
				insertionPoint = whitespace.nextSibling
				this.#morphOneToOne(whitespace, node)
			} else if (matchInd !== undefined) {
				const match = from[matchInd]!
				const operation = op[i]!

				if (!shouldNotMove[matchInd]) {
					const outsideRadios = this.#uncheckRadiosNamingFormsIn(match, match.getRootNode())
					moveBefore(parent, match, insertionPoint)
					this.#checkRadios(outsideRadios)
				}
				// Read this before the morph, which can replace the match. A match that moved itself
				// elsewhere when it reconnected leaves the insertion point where it was.
				if (match.parentNode === parent) insertionPoint = match.nextSibling

				if (operation === Operation.EqualNode) {
				} else if (operation === Operation.SameElement) {
					// Elements matched by id skip the isEqualNode pass, so check here before visiting them.
					if (isEqualNode(match, node)) {
					} else if (hasSameIs(match as Element, node as Element)) {
						this.#morphMatchingElements(match as Element, node as Element)
					} else {
						this.#morphNonMatchingElements(match as Element, node as Element)
					}
				} else {
					this.#morphOneToOne(match, node)
				}
				// A replaced match leaves the target in its place.
				placed.push(match.parentNode === parent ? match : node)
			} else {
				const added = this.#addNode(parent, node, insertionPoint)
				if (added) placed.push(added)
				// A new node can move or remove itself when it's added, and then the insertion point stays.
				if (added === node && node.parentNode === parent) insertionPoint = node.nextSibling
			}
		}

		if (liveWhitespace) {
			for (const whitespace of liveWhitespace) {
				if (whitespace.parentNode === parent) this.#removeNode(whitespace)
			}
		}
	}

	// A morph inside a select never visits the select, so sync it when the morph settles if the morph
	// changed what the markup selects. A vetoed morph changes nothing, so it leaves it alone.
	setEnclosingSelect(select: HTMLSelectElement, selection: Array<HTMLOptionElement | null>): void {
		this.#enclosingSelect = [select, selection]
	}

	#syncEnclosingSelect(): void {
		const enclosing = this.#enclosingSelect
		if (!enclosing) return
		this.#enclosingSelect = null

		const [select, selection] = enclosing
		if (this.#preserveChanges) return

		const newSelection = markupSelectionOf(select)
		if (newSelection.length === selection.length && newSelection.every((option, i) => option === selection[i])) return

		this.#syncDefaultSelection(select)
	}

	// The browser keeps its selection when options are added or moved, or when the select changes
	// between a drop-down and a list box, so an untouched select can end up showing something
	// other than its markup. Select what the markup selects. Under `preserveChanges` the browser's
	// selection stands, because a user who picked the default option again looks untouched.
	#syncDefaultSelection(select: HTMLSelectElement): void {
		if (this.#preserveChanges) return

		const options = select.options
		const vetoed = this.#vetoedControls
		if (vetoed) {
			for (let i = 0; i < options.length; i++) {
				if (vetoed.has(options[i]!)) return
			}
		}

		const defaultOption = select.multiple ? null : defaultOptionOf(select)

		for (let i = 0; i < options.length; i++) {
			const option = options[i]!
			const selected = select.multiple ? option.hasAttribute("selected") : option === defaultOption
			if (option.selected !== selected) option.selected = selected
		}

		;(this.#syncedSelects ??= new Set()).add(select)
	}

	// A checked radio that's added unchecks the rest of its group, even radios the markup checks later on.
	// It can arrive unchecked too, when the form it adds takes over the group of a checked radio outside.
	// The morph never removes a node it added, so noting the radio is enough.
	#noteAddedRadios(element: Element): void {
		const inputs = isInputElement(element) ? [element] : element.getElementsByTagName("input")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (input.type === "radio" && (input.checked || input.hasAttribute("checked")))
				(this.#radiosToSync ??= new Set()).add(input)
		}
	}

	// A radio that moved can uncheck the rest of its group, so note the whole group now, in case the
	// morph then removes the radio.
	#noteRadioGroups(element: Element): void {
		const inputs = isInputElement(element) ? [element] : element.querySelectorAll("input")
		const groups: RadioGroups = new Map()
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (input.type === "radio") {
				const radios = (this.#radiosToSync ??= new Set())
				for (const member of radioGroupOf(input, groups)) radios.add(member)
			}
		}
	}

	// Moving an element can change the form of radios inside it, and briefly of radios outside it
	// whose form is inside it, and a checked radio that changes form unchecks the rest of its new
	// group. So checked radios outside the element move unchecked and are checked again straight
	// after. Without `preserveChanges`, checked radios inside it that change form move unchecked too,
	// and are checked again when the morph settles if the markup or a veto keeps them checked.
	// Returns the radios outside.
	#uncheckRadiosForMove(element: Element, parent: ParentNode): Array<HTMLInputElement> | null {
		const outside = this.#uncheckRadiosNamingFormsIn(element, element.getRootNode())

		if (!this.#preserveChanges) {
			const inputs = isInputElement(element) ? [element] : element.querySelectorAll("input")
			for (let i = 0; i < inputs.length; i++) {
				const input = inputs[i]!
				if (isCheckedRadio(input) && input.form !== formAfterMove(input, element, parent)) {
					input.checked = false
					;(this.#radiosUncheckedForMove ??= new Set()).add(input)
				}
			}
		}

		return outside
	}

	// A radio with a `form` attribute changes form when a form with that id is added, moved or removed,
	// or when either attribute changes, and a checked one then unchecks the rest of its new group. Firefox
	// and Safari can briefly put it in the group of radios without a form on the way, where it unchecks a
	// radio it never joins. So these radios change form unchecked, and are checked again straight after,
	// which unchecks the rest of their new group as the change itself would. Returns the radios it unchecked,
	// which are only those outside the node unless `inside` is set.
	#uncheckRadiosNamingFormsIn(node: Node, root: Node, inside = false): Array<HTMLInputElement> | null {
		if (!isElement(node)) return null
		let ids: Set<string> | null = null
		const forms = isFormElement(node) ? [node] : node.getElementsByTagName("form")
		for (let i = 0; i < forms.length; i++) {
			const form = forms[i]!
			if (form.id !== "" && isFormElement(form)) (ids ??= new Set()).add(form.id)
		}
		return ids && this.#uncheckRadiosNaming(ids, root, inside ? null : node)
	}

	#uncheckRadiosNaming(ids: ReadonlySet<string>, root: Node, except: Node | null): Array<HTMLInputElement> | null {
		let unchecked: Array<HTMLInputElement> | null = null
		// Only checked inputs matter, which keeps this short on pages with many radios.
		const inputs = (root as ParentNode).querySelectorAll("input[form]:checked")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (isCheckedRadio(input) && ids.has(input.getAttribute("form")!) && !except?.contains(input)) {
				this.#uncheckRadio(input)
				;(unchecked ??= []).push(input)
			}
		}
		return unchecked
	}

	// Changing a radio's `form` attribute or a form's id changes the form of radios, like moving a form,
	// and changing a radio's name changes its group too.
	#uncheckRadiosForAttribute(element: Element, name: string, value: string | null): Array<HTMLInputElement> | null {
		if ((name === "form" || name === "name") && isCheckedRadio(element)) {
			this.#uncheckRadio(element)
			return [element]
		}
		if (name === "id" && isFormElement(element)) {
			const ids = new Set(value === null || value === "" ? [element.id] : [element.id, value])
			return this.#uncheckRadiosNaming(ids, element.getRootNode(), null)
		}
		return null
	}

	// Setting `.checked` stops a radio from following its `checked` attribute. So a radio that's checked
	// again straight after, and still follows the attribute, is unchecked by removing the attribute.
	#uncheckRadio(radio: HTMLInputElement): void {
		const value = this.#defersRadio(radio) ? null : radio.getAttribute("checked")
		if (value !== null) {
			radio.removeAttribute("checked")
			if (!radio.checked) {
				uncheckedByAttribute.set(radio, value)
				return
			}
			radio.setAttribute("checked", value)
		}
		radio.checked = false
	}

	// Radios that changed form unchecked are checked again. Without `preserveChanges`, the morph's own
	// radios wait until it settles, and are checked only if the markup or a veto keeps them checked, so
	// one the markup unchecks doesn't uncheck the rest of its new group first.
	#checkRadios(radios: Array<HTMLInputElement> | null, immediate = false): void {
		if (!radios) return
		const groups: RadioGroups = new Map()
		for (let i = 0; i < radios.length; i++) {
			const radio = radios[i]!
			if (!immediate && this.#defersRadio(radio) && !uncheckedByAttribute.has(radio)) {
				;(this.#radiosUncheckedForMove ??= new Set()).add(radio)
				continue
			}

			// A radio outside the morph that joins a group with a checked radio inside it leaves that one
			// checked, as when the page is parsed with the radio from the markup coming later.
			const group = radioGroupOf(radio, groups)
			const checkedInMorph = this.#inScope(radio) ? undefined : group.find((member) => member.checked && this.#inScope(member))
			const checked = group.filter((member) => member.checked)

			const value = uncheckedByAttribute.get(radio)
			if (value !== undefined) {
				uncheckedByAttribute.delete(radio)
				radio.setAttribute("checked", value)
				/* v8 ignore next -- Firefox can stop a radio following the attribute while it changes form */
				if (!radio.checked) radio.checked = true
			} else {
				radio.checked = true
			}
			if (checkedInMorph) {
				checkedInMorph.checked = true
				// The radio can still join another group later in the morph, and then gets its check back.
				;(this.#displacedRadios ??= new Map()).set(radio, checkedInMorph)
			}

			for (let j = 0; j < checked.length; j++) {
				const member = checked[j]!
				if (!member.checked) (this.#displacedRadios ??= new Map()).set(member, radio)
			}
		}
	}

	// A radio that passed through a group on its way elsewhere, say when the morph removes a form and
	// then the radio, or changes a form's id and then the radio's `form` attribute or name, unchecked a
	// radio it doesn't end up with, or one it no longer keeps unchecked. That one is checked again, unless
	// another radio in its group is checked.
	#restoreDisplacedRadios(displaced: Map<HTMLInputElement, HTMLInputElement>): void {
		const groups: RadioGroups = new Map()
		for (const [member, radio] of displaced) {
			const group = radioGroupOf(member, groups)
			if (radio.checked && group.includes(radio)) continue
			/* v8 ignore next -- happy-dom puts radios with and without a form in one group, so tests can't get here */
			if (group.some((other) => other.checked)) continue
			// Adding the attribute back checks a radio that follows it, and keeps it following it.
			const value = member.getAttribute("checked")
			if (value !== null) {
				member.removeAttribute("checked")
				member.setAttribute("checked", value)
			}
			/* v8 ignore next -- happy-dom doesn't check a radio again when its checked attribute is set */
			if (!member.checked) member.checked = true
		}
	}

	// Whether a radio that changed form waits until the morph settles to be checked again: one that
	// the morph discards user changes for, which is the whole morph, or inside a `morphlex-clobber` element.
	#defersRadio(radio: HTMLInputElement): boolean {
		if (this.#preserveChanges) return false
		const scope = this.#clobberedScope
		return scope ? scope.contains(radio) : this.#inScope(radio)
	}

	#removeChild(node: ChildNode): void {
		const radios = this.#uncheckRadiosNamingFormsIn(node, node.getRootNode())
		node.remove()
		this.#checkRadios(radios)
	}

	// Check each radio the markup checks, in document order, so the last one wins as when parsing.
	// Radios outside the morph stay as they are, and so does a group with a radio in a vetoed subtree
	// or with a vetoed `checked` update.
	#syncRadioGroups(radios: Set<HTMLInputElement>): void {
		const done = new Set<HTMLInputElement>()
		const groups: RadioGroups = new Map()
		for (const radio of radios) {
			if (done.has(radio)) continue

			// Checking one radio unchecks the others, so a group with a vetoed radio is left as it is.
			const group = radioGroupOf(radio, groups).filter((member) => this.#inScope(member))
			for (const member of group) done.add(member)
			if (group.some((member) => this.#isVetoed(member))) continue

			// Checking each radio in turn would uncheck the one before, so check only the last.
			let last: HTMLInputElement | null = null
			for (const member of group) if (member.hasAttribute("checked")) last = member
			for (const member of group) {
				const checked = member === last
				if (member.checked !== checked) member.checked = checked
			}
		}
	}

	#inScope(node: Node): boolean {
		if (!this.#scope!.contains(node)) return false

		const start = this.#scopeStart
		const end = this.#scopeEnd
		if (start && (start.contains(node) || !(start.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING))) return false
		if (end && (end.contains(node) || !(end.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING))) return false
		return true
	}

	#isVetoed(control: Element): boolean {
		if (this.#vetoedControls?.has(control)) return true
		const nodes = this.#vetoedNodes
		if (nodes) {
			for (let i = 0; i < nodes.length; i++) {
				if (nodes[i]!.contains(control)) return true
			}
		}
		return false
	}

	// A changed control, or a select holding changed options, is matched by its choices even though it has a name.
	#holdsOwnChoices(candidate: Element): boolean {
		return this.#flagged.has(candidate) || isSelectElement(candidate)
	}

	// A checkbox, radio or option the user changed holds their choice of its value, so under
	// preserveChanges it must not be matched to a target with another value, unless the target
	// discards user changes with `morphlex-clobber`.
	#holdsOtherChoice(candidate: Element, element: Element): boolean {
		return (
			this.#preserveChanges &&
			this.#flagged.has(candidate) &&
			!this.#clobbered?.has(element) &&
			this.#choiceOf(candidate) !== this.#choiceOf(element)
		)
	}

	// Whether the target holds all of the choices, or with `all` false, any of them.
	#holdsChoices(choices: Array<string>, element: Element, all: boolean): boolean {
		const targetChoices = this.#targetChoicesOf(element).counts
		if (!all) return choices.some((choice) => targetChoices.has(choice))
		for (const [choice, count] of countChoices(choices)) if ((targetChoices.get(choice) ?? 0) < count) return false
		return true
	}

	// How often each choice appears in the target, and how many choices it holds. A control with a movable id
	// keeps its live element wherever it goes, so it isn't a choice the target can keep for a wrapper. Each choice
	// is keyed with the path down to its control too, which the live control's path has to match to be kept.
	#targetChoicesOf(element: Element): { counts: Map<string, number>; size: number } {
		let targetChoices = this.#targetChoices.get(element)
		if (!targetChoices) {
			const choices: Array<string> = []
			for (const control of [element, ...element.querySelectorAll("input, option")]) {
				if (this.#isClobberedWithin(control, element) || this.#movesWithin(control, element)) continue
				const choice = this.#choiceOf(control)
				if (choice !== null) choices.push(pathTo(control, element) + choice)
			}
			targetChoices = { counts: countChoices(choices), size: choices.length }
			this.#targetChoices.set(element, targetChoices)
		}
		return targetChoices
	}

	// Whether the control, or an element between it and the wrapper, has an id pairing a live element with a target
	// it can be morphed into, so the control moves with that element, wherever the wrapper goes.
	#movesWithin(control: Element, wrapper: Element): boolean {
		for (let node: Element = control; node !== wrapper; node = node.parentElement!) {
			const live = this.#movableElement(node.id)
			const target = live && this.#targetElementsById.get(node.id)
			if (target && canMorphElementInPlace(live, target)) return true
		}
		return false
	}

	// Whether the target is, or holds, a `morphlex-clobber` element.
	#holdsClobbered(element: Element): boolean {
		const clobbered = this.#clobbered
		if (!clobbered) return false
		if (!this.#clobberedHolders) {
			this.#clobberedHolders = new Set()
			for (const node of clobbered) {
				for (let holder: Element | null = node; holder && !this.#clobberedHolders.has(holder); holder = holder.parentElement) {
					this.#clobberedHolders.add(holder)
				}
			}
		}
		return this.#clobberedHolders.has(element)
	}

	// Whether the control is in a `morphlex-clobber` element inside the target, or is one, so it can't keep a choice.
	#isClobberedWithin(control: Element, element: Element): boolean {
		const clobbered = this.#clobbered
		if (!clobbered) return false
		for (let node: Element | null = control; node; node = node === element ? null : node.parentElement) {
			if (clobbered.has(node)) return true
		}
		return false
	}

	// An option is keyed by the nearest select around it up to the morph's root, or else the select around the
	// morph, unless it's in a datalist the select doesn't own. A target can still be in another select past its root.
	#choiceOf(element: Element): string | null {
		if (!isOptionElement(element)) return choiceOf(element, null)
		let select: HTMLSelectElement | null = null
		for (
			let node: Element = element, parent = node.parentElement;
			parent && node !== this.#root && !this.#targetRoots.has(node);
			node = parent, parent = parent.parentElement
		) {
			if (parent.localName === "datalist" && parent.namespaceURI === HTML_NAMESPACE) return null
			if (isSelectElement(parent)) {
				select = parent
				break
			}
		}
		select ??= this.#keySelect
		return choiceOf(element, (select && this.#liveSelects.get(select)) ?? select)
	}

	// The choices of the checkboxes, radios and options the user changed in this element, or null when there are none.
	// A control with a movable id goes to its own target, so the element doesn't need a target for it.
	// The picked ones leave out options and radios the user moved away from, which can be matched once those can't.
	#dirtyChoicesOf(element: Element): { choices: Array<string>; picked: Array<string> } | null {
		if (!this.#dirtyElements?.has(element)) return null
		const choices: Array<string> = []
		const picked: Array<string> = []
		for (const control of [element, ...element.querySelectorAll("input, option")]) {
			const choice = this.#flagged.has(control) && !this.#movesWithin(control, element) ? this.#choiceOf(control) : null
			if (choice === null) continue
			const key = pathTo(control, element) + choice
			choices.push(key)
			if (control === element || !isLeftChoice(control)) picked.push(key)
		}
		return choices.length ? { choices, picked } : null
	}

	// A vetoed `selected` or `checked` update leaves the selection alone, like other vetoed form attributes,
	// and a vetoed `open` update leaves an accordion item as it was.
	#noteVetoedAttribute(element: Element, name: string, namespaceURI: string | null): void {
		// Only the attributes in no namespace are the control's state.
		if (namespaceURI !== null) return
		if (
			(name === "selected" && isOptionElement(element)) ||
			(name === "checked" && isInputElement(element)) ||
			(name === "open" && isDetailsElement(element))
		) {
			;(this.#vetoedControls ??= new Set()).add(element)
		}
	}

	// Template content is replaced wholesale rather than morphed, so no node callbacks fire inside it.
	#visitTemplateContent(from: HTMLTemplateElement, to: HTMLTemplateElement): void {
		if (isEqualNode(from.content, to.content)) return
		from.content.replaceChildren(to.content)
	}

	// Add a new node, or claim the live element with its id. Returns the new node or the claim's
	// placeholder, or null when the new node wasn't inserted.
	#addNode(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): ChildNode | null {
		const placeholder = isElement(node) ? this.#claimMovableElement(node, parent) : null
		if (placeholder) {
			parent.insertBefore(placeholder, insertionPoint)
			return placeholder
		}

		return this.#insertNewNode(parent, node, insertionPoint) ? node : null
	}

	#insertNewNode(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null, approved = false): boolean {
		if (!approved && !(this.#options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true)) return false

		// A live target takes its forms away from the radios where it is, in its own document or shadow root
		// and inside it, including forms that live elements claim out of it next. Those inside it are
		// checked again straight away, since they're the target's own state, not markup the morph resets.
		const sourceRadios = node.isConnected ? this.#uncheckRadiosNamingFormsIn(node, node.getRootNode(), true) : null
		clearImplicitSelection(node, parent)
		this.#placeMovableDescendants(node, parent)
		if (this.#targetOpensDetails && isElement(node)) this.#noteAddedDetails(node)
		const radios = this.#uncheckRadiosNamingFormsIn(node, (parent as Node).getRootNode())
		parent.insertBefore(node, insertionPoint)
		this.#checkRadios(radios)
		this.#checkRadios(sourceRadios, true)
		if (this.#targetChecksInputs && !this.#preserveChanges && isElement(node)) this.#noteAddedRadios(node)
		this.#options.afterNodeAdded?.(node)
		return true
	}

	// Put the live element where its placeholder is and morph it into the target, unless a veto
	// pinned it in the meantime. Then the target is added as a new node instead.
	#completeMove(move: PendingMove): void {
		const { live, target, placeholder, preserveChanges, approved } = move
		// A move completes once, even when another move completed it first.
		if (!this.#claimedElements.has(live) || this.#movesInProgress.has(move)) return

		// An element doesn't move out of an ancestor whose visit can still be vetoed: one that's claimed,
		// or one that a pending move will reach. Those moves complete first. A move that's already waiting
		// on this one is a cycle, which this move breaks by adding its target as a new node instead.
		this.#movesInProgress.add(move)
		let inCycle = false
		for (let ancestor = live.parentElement; ancestor && !inCycle;) {
			const first = this.#claimedElements.get(ancestor) ?? this.#moveReaching(ancestor)
			if (!first) {
				ancestor = ancestor.parentElement
			} else if (this.#movesInProgress.has(first)) {
				inCycle = true
			} else {
				this.#completeMove(first)
				ancestor = live.parentElement
			}
		}
		this.#movesInProgress.delete(move)
		this.#claimedElements.delete(live)

		// A custom element's `connectedCallback` can replace its children, placeholder included.
		const parent = placeholder.parentNode
		if (!parent) return

		const saved = this.#preserveChanges
		const savedScope = this.#clobberedScope
		this.#preserveChanges = preserveChanges
		if (!preserveChanges && this.#options.preserveChanges) this.#clobberedScope = live

		if (!inCycle && this.#liveElementsById.get(target.id) === live && !live.contains(parent)) {
			this.#liveElementsById.delete(target.id)
			const outsideRadios = this.#uncheckRadiosForMove(live, parent)
			moveInto(parent, live, placeholder)
			placeholder.remove()
			this.#checkRadios(outsideRadios)
			if (!this.#preserveChanges) this.#noteRadioGroups(live)
			this.#morphOneToOne(live, target)
		} else {
			this.#insertNewNode(parent, target, placeholder, approved)
			placeholder.remove()
		}

		this.#preserveChanges = saved
		this.#clobberedScope = savedScope
	}

	#replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = node.parentNode
		if (!parent) throw new Error(DETACHED_NODE_ERROR)

		const insertionPoint = node
		// Check if both removal and addition are allowed before starting the replacement. A replacement
		// that moves a live element here asks too, so either veto keeps the node.
		if (
			(this.#options.beforeNodeRemoved?.(node) ?? true) &&
			(this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true)
		) {
			// The replacement can be a live element from elsewhere, even one inside the node it replaces.
			const placeholder = isElement(newNode) ? this.#claimMovableElement(newNode, parent, undefined, true) : null
			if (placeholder) {
				parent.insertBefore(placeholder, insertionPoint)
			} else {
				this.#insertNewNode(parent, newNode, insertionPoint, true)
			}
			this.#removeApprovedNode(node)
		}

		this.#settleIfRoot(node)
	}

	// A movable element stays put for now, since the target may place it under another parent, until the morph settles.
	#removeNode(node: ChildNode, settled = false): void {
		if (!settled && isElement(node) && this.#movableElement(node.id) === node) {
			;(this.#unplacedElements ??= []).push(node)
			return
		}

		if (this.#options.beforeNodeRemoved?.(node) ?? true) this.#removeApprovedNode(node, settled)
	}

	#removeApprovedNode(node: ChildNode, settled = false): void {
		if (!settled && this.#holdsMovableElement(node)) {
			;(this.#deferredRemovals ??= []).push(node)
		} else {
			this.#removeChild(node)
			this.#options.afterNodeRemoved?.(node)
		}
	}

	// A vetoed visit leaves the node's subtree alone, so nothing inside it moves elsewhere.
	#pinSubtree(node: Node): void {
		;(this.#vetoedNodes ??= []).push(node)
		const ids = this.#idSetMap.get(node)
		if (!ids) return

		for (const id of ids) {
			// An element that has already moved isn't in the map any more, so it stays where it is.
			const live = this.#liveElementsById.get(id)
			if (live && live !== node) this.#liveElementsById.set(id, null)
		}
	}

	#movableElement(id: string): Element | null {
		if (id === "" || this.#targetIdCounts.get(id) !== 1) return null

		// Options and optgroups don't move, because an option's selection belongs to its select.
		const live = this.#liveElementsById.get(id)
		if (!live || isOptionElement(live) || isOptgroupElement(live)) return null
		return live
	}

	#holdsMovableElement(node: ChildNode): boolean {
		const ids = this.#idSetMap.get(node)
		if (!ids) return false

		for (const id of ids) {
			const live = this.#movableElement(id)
			if (live && live !== node && node.contains(live)) return true
		}
		return false
	}

	// Whether the live element with the target's id can be morphed into the target where the target goes.
	// `select` is the live select the target ends up in, since a new node's targets are still in their
	// parsed select. It's found from `parent` when not given.
	#canClaim(target: Element, parent: ParentNode, select: HTMLSelectElement | null = selectAt(parent)): boolean {
		const live = this.#movableElement(target.id)
		// Claiming takes the target out of its parent, so an element holding options is only claimed where it can move.
		return (
			live !== null &&
			canMorphElementInPlace(live, target) &&
			!live.contains(parent) &&
			!this.#wrapsMovableAncestor(live, target, select) &&
			!movesOptionsBetweenSelects(live, select)
		)
	}

	// Whether the target puts a movable ancestor of the live element inside the element, where that
	// ancestor can be morphed into its own target. Moving the element out would come before that
	// ancestor's visit, so a veto there couldn't keep it.
	#wrapsMovableAncestor(live: Element, target: Element, select: HTMLSelectElement | null): boolean {
		const ids = this.#idArrayMap.get(target)
		if (!ids) return false

		for (let ancestor = live.parentElement; ancestor; ancestor = ancestor.parentElement) {
			const id = ancestor.id
			if (id !== "" && this.#movableElement(id) === ancestor && ids.includes(id) && canMoveInto(ancestor, target, select))
				return true
		}
		return false
	}

	// Claim the live element with the target's id, if it can be. Returns a placeholder for the target's
	// place, where the move completes when the morph settles.
	#claimMovableElement(
		target: Element,
		parent: ParentNode,
		select: HTMLSelectElement | null = selectAt(parent),
		approved = false,
	): Comment | null {
		if (!this.#canClaim(target, parent, select)) return null
		const live = this.#liveElementsById.get(target.id)!

		const placeholder = live.ownerDocument.createComment("")
		const preserveChanges = this.#preserveChanges && !this.#clobbered?.has(target)
		const move = { live, target, placeholder, preserveChanges, approved, select }
		;(this.#pendingMoves ??= []).push(move)
		this.#claimedElements.set(live, move)
		const ids = this.#idArrayMap.get(target)
		if (ids) for (const id of ids) this.#movesByTargetId.set(id, move)
		return placeholder
	}

	// The pending move whose target holds the target of this live element, if it's still to be placed there.
	#moveReaching(element: Element): PendingMove | undefined {
		if (this.#movableElement(element.id) !== element) return undefined
		const move = this.#movesByTargetId.get(element.id)
		return move && this.#claimedElements.has(move.live) && canMoveInto(element, move.target, move.select) ? move : undefined
	}

	// A new node can hold targets for live elements elsewhere. Claim each live element, leaving a
	// placeholder for its target. This runs before the new node is attached, so discarded targets
	// never connect.
	// `parent` is the live parent the node goes into.
	#placeMovableDescendants(node: ChildNode, parent: ParentNode): void {
		if (!isElement(node)) return

		const ids = this.#idArrayMap.get(node)
		if (!ids?.some((id) => id !== node.id && this.#movableElement(id))) return

		this.#placeMovableChildren(node, selectAt(parent))
	}

	// Swap the targets under `parent` that claim a live element for placeholders. Inside a
	// `morphlex-clobber` element, the moves discard user changes as if `preserveChanges` were off.
	#placeMovableChildren(parent: Element, outerSelect: HTMLSelectElement | null): void {
		const preserveChanges = this.#preserveChanges
		if (preserveChanges && this.#clobbered?.has(parent)) this.#preserveChanges = false
		/* v8 ignore next -- happy-dom gives a select's children another parent, so it never gets here with a select */
		const select = isSelectElement(parent) ? parent : outerSelect

		let target = parent.firstElementChild
		while (target) {
			const next = target.nextElementSibling

			if (this.#idArrayMap.has(target)) {
				const placeholder = this.#claimMovableElement(target, parent, select)
				if (placeholder) {
					parent.replaceChild(placeholder, target)
				} else {
					this.#placeMovableChildren(target, select)
				}
			}

			target = next
		}

		this.#preserveChanges = preserveChanges
	}

	#mapIdArraysForEach(nodeList: NodeList): void {
		for (const childNode of nodeList) {
			if (isParentNode(childNode)) {
				this.#mapIdArrays(childNode)
			}
		}
	}

	// For each node with an ID, push that ID into the IdArray on the IdArrayMap, for each of its parent elements.
	#mapIdArrays(node: ParentNode, countRoot = true): void {
		const idArrayMap = this.#idArrayMap

		if (!this.#targetChecksInputs) {
			this.#targetChecksInputs =
				isElement(node) && isInputElement(node) ? node.hasAttribute("checked") : node.querySelector("input[checked]") !== null
		}
		if (!this.#targetOpensDetails) {
			this.#targetOpensDetails =
				(isElement(node) && isDetailsElement(node) && node.hasAttributeNS(null, "open")) ||
				node.querySelector("details[open]") !== null
		}

		// An inner morph leaves the target's own element out of the result, so its id doesn't count.
		const targetIdCounts = this.#targetIdCounts
		if (countRoot && isElement(node) && node.id !== "") targetIdCounts.set(node.id, (targetIdCounts.get(node.id) ?? 0) + 1)

		forEachDescendantElementWithId(node, (element) => {
			const id = element.id
			targetIdCounts.set(id, (targetIdCounts.get(id) ?? 0) + 1)
			this.#targetElementsById.set(id, element)

			let currentElement: Element | null = element

			while (currentElement) {
				const idArray = idArrayMap.get(currentElement)
				if (idArray) {
					idArray.push(id)
				} else {
					idArrayMap.set(currentElement, [id])
				}
				if (currentElement === node) break
				currentElement = currentElement.parentElement
			}
		})
	}

	// For each node with an ID, add that ID into the IdSet on the IdSetMap, for each of its parent elements.
	#mapIdSets(node: ParentNode): void {
		const idSetMap = this.#idSetMap

		// The root's id counts towards uniqueness, but the root itself never moves.
		const liveElementsById = this.#liveElementsById
		if (isElement(node) && node.id !== "") liveElementsById.set(node.id, null)

		forEachDescendantElementWithId(node, (element) => {
			const id = element.id
			liveElementsById.set(id, liveElementsById.has(id) ? null : element)

			let currentElement: Element | null = element

			while (currentElement) {
				const idSet = idSetMap.get(currentElement)
				if (idSet) {
					idSet.add(id)
				} else {
					idSetMap.set(currentElement, new Set([id]))
				}
				if (currentElement === node) break
				currentElement = currentElement.parentElement
			}
		})
	}
}

// Whether the live element can be morphed into the element with its id inside `target`, which holds one,
// and moved there. `select` is the live select that `target` ends up in. A select inside `target` is a new one.
function canMoveInto(live: Element, target: Element, select: HTMLSelectElement | null): boolean {
	const element = Array.from(target.querySelectorAll("[id]")).find((element) => element.id === live.id)!
	const innerSelect = selectOf(element)
	return (
		canMorphElementInPlace(live, element) &&
		!movesOptionsBetweenSelects(live, innerSelect && target.contains(innerSelect) ? innerSelect : select)
	)
}

function forEachDescendantElementWithId(node: ParentNode, callback: (element: Element) => void): void {
	for (const element of node.querySelectorAll("[id]")) {
		if (element.id !== "") callback(element)
	}
}

function hasExcessAttributes(from: Element, to: Element): boolean {
	const attributes = from.attributes
	for (let i = 0; i < attributes.length; i++) {
		const { localName, namespaceURI } = attributes[i]!
		if (!to.hasAttributeNS(namespaceURI, localName)) return true
	}
	return false
}

// Give each changed candidate's set of interchangeable candidates, from `identicalTo`, to their targets in order in
// `matches`. Returns whether any target changed hands.
function orderSets(
	matches: Array<number>,
	changed: Array<number>,
	targetOf: Array<number>,
	identicalTo: (candidate: number) => Array<number>,
): boolean {
	const grouped: Set<number> = new Set()
	let reordered = false
	for (let i = 0; i < changed.length; i++) {
		const candidate = changed[i]!
		if (grouped.has(candidate)) continue
		const identical = identicalTo(candidate)
		if (identical.length < 2) continue

		identical.sort((a, b) => a - b)
		const targets = identical.map((other) => targetOf[other]!).sort((a, b) => a - b)
		for (let t = 0; t < identical.length; t++) {
			grouped.add(identical[t]!)
			if (matches[targets[t]!] !== identical[t]) {
				matches[targets[t]!] = identical[t]!
				reordered = true
			}
		}
	}
	return reordered
}

function bucketByTextContent(nodes: Array<ChildNode>, indices: Array<number>): Map<string, Array<number>> {
	const buckets: Map<string, Array<number>> = new Map()
	for (let i = 0; i < indices.length; i++) {
		const index = indices[i]!
		const text = nodes[index]!.textContent!
		const bucket = buckets.get(text)
		if (bucket) bucket.push(index)
		else buckets.set(text, [index])
	}
	return buckets
}

function nodeListToArray(nodeList: NodeListOf<ChildNode>): Array<ChildNode>
function nodeListToArray(nodeList: NodeList): Array<ChildNode>
function nodeListToArray(nodeList: NodeList): Array<ChildNode> {
	const length = nodeList.length
	const array = new Array<ChildNode>(length)
	for (let i = 0; i < length; i++) {
		array[i] = nodeList[i] as ChildNode
	}
	return array
}

function isWhitespaceTextNode(node: Node): boolean {
	if (node.nodeType !== TEXT_NODE_TYPE) return false

	const value = node.nodeValue
	if (!value) return true

	for (let i = 0; i < value.length; i++) {
		if (!isAsciiWhitespace(value.charCodeAt(i))) return false
	}

	return true
}

// HTML's ASCII whitespace: tab, LF, FF, CR and space. Unlike `String.prototype.trim`, this excludes
// characters such as U+00A0 (`&nbsp;`), which are meaningful content.
function isAsciiWhitespace(code: number): boolean {
	return code === 32 || code === 9 || code === 10 || code === 13 || code === 12
}

function trimAsciiWhitespace(string: string): string {
	let start = 0
	let end = string.length

	while (start < end && isAsciiWhitespace(string.charCodeAt(start))) start++
	while (end > start && isAsciiWhitespace(string.charCodeAt(end - 1))) end--

	return string.slice(start, end)
}

function trimFragmentEdgeWhitespace(fragment: DocumentFragment): void {
	let hasElementChild = false

	for (let current = fragment.firstChild; current; current = current.nextSibling) {
		if (current.nodeType === ELEMENT_NODE_TYPE) {
			hasElementChild = true
			break
		}
	}

	if (!hasElementChild) return

	while (fragment.firstChild && isWhitespaceTextNode(fragment.firstChild)) {
		fragment.firstChild.remove()
	}

	while (fragment.lastChild && isWhitespaceTextNode(fragment.lastChild)) {
		fragment.lastChild.remove()
	}
}

// What choosing this element means: an option's value in its select, or a checkbox or radio's type, name,
// value and form, along with its `is`, since a control with another `is` is recreated. An option's select is passed in, since a target's option is keyed by the live select.
function choiceOf(element: Element, select: HTMLSelectElement | null): string | null {
	if (isOptionElement(element)) {
		return JSON.stringify([
			select?.getAttribute("name") ?? "",
			select && formOf(select),
			select && (select.hasAttribute("multiple") ? 2 : displaySizeOf(select) > 1 ? 1 : 0),
			element.value,
			element.getAttribute("is"),
		])
	}
	if (isInputElement(element) && (element.type === "checkbox" || element.type === "radio")) {
		return JSON.stringify([element.type, element.name, element.value, formOf(element), element.getAttribute("is")])
	}
	return null
}

// The control's `form` attribute, or null when it names the form the control is already in.
function formOf(control: Element): string | null {
	const form = control.getAttribute("form")
	return form && form === control.closest("form")?.id ? null : form
}

// The namespaces, names and `is` of the elements between the wrapper and the control. The wrapper's morph only keeps a
// control whose path matches, since an element with another name or `is` is replaced along with what it holds.
function pathTo(control: Element, wrapper: Element): string {
	const path: Array<[string | null, string, string | null]> = []
	for (let node = control; node !== wrapper;) {
		node = node.parentElement!
		if (node !== wrapper) path.push([node.namespaceURI, node.localName, node.getAttribute("is")])
	}
	return JSON.stringify(path)
}

// How often each choice appears.
function countChoices(choices: Array<string>): Map<string, number> {
	const counts = new Map<string, number>()
	for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1)
	return counts
}

// A key for the element's attributes, equal for elements with the same attributes ignoring `morphlex-dirty` and any `ignored` names.
function attributesKeyOf(element: Element, ignored: ReadonlyArray<string>): string {
	const attributes: Array<[string | null, string, string]> = []
	for (const { namespaceURI, name, localName, value } of element.attributes) {
		if (namespaceURI !== null || (name !== DIRTY_ATTRIBUTE && !ignored.includes(name))) {
			attributes.push([namespaceURI, localName, value])
		}
	}
	return JSON.stringify(attributes.sort((a, b) => (`${a[0]} ${a[1]}` < `${b[0]} ${b[1]}` ? -1 : 1)))
}

// An option the user deselected or moved a select away from, or a radio they moved their group away from. What holds
// it is matched by the picked one first, though the option or radio itself still keeps its own target.
function isLeftChoice(element: Element): boolean {
	if (isOptionElement(element)) return !element.selected
	return isInputElement(element) && element.type === "radio" && !element.checked
}

// A key that's the same for nodes that are equal apart from `morphlex-dirty`, as `isEqualNode` compares them,
// template content included.
function shapeOf(node: Node): string {
	if (!isElement(node)) return JSON.stringify([node.nodeType, node.nodeName, node.nodeValue])
	const attributes: Array<string> = []
	for (const { namespaceURI, localName, value } of node.attributes) {
		if (namespaceURI !== null || localName !== DIRTY_ATTRIBUTE) attributes.push(JSON.stringify([namespaceURI, localName, value]))
	}
	let children = ""
	for (const child of node.childNodes) children += shapeOf(child)
	if (isTemplateElement(node)) {
		children += "<#content"
		for (const child of node.content.childNodes) children += shapeOf(child)
		children += ">"
	}
	return `<${JSON.stringify([node.namespaceURI, node.prefix, node.localName, attributes.sort()])}${children}>`
}

// `isEqualNode` ignores template content, so templates need comparing separately.
function isEqualNode(from: Node, to: Node): boolean {
	if (!from.isEqualNode(to)) return false
	if (!isParentNode(from)) return true

	if (
		isTemplateElement(from as Element) &&
		!isEqualNode((from as HTMLTemplateElement).content, (to as HTMLTemplateElement).content)
	) {
		return false
	}

	const fromTemplates = (from as ParentNode).querySelectorAll("template")
	if (fromTemplates.length === 0) return true

	// The trees are equal, so their templates line up one-to-one.
	const toTemplates = (to as ParentNode).querySelectorAll("template")
	for (let i = 0; i < fromTemplates.length; i++) {
		const fromTemplate = fromTemplates[i]!
		if (!isTemplateElement(fromTemplate)) continue
		if (!isEqualNode(fromTemplate.content, (toTemplates[i] as HTMLTemplateElement).content)) return false
	}

	return true
}

function isTemplateElement(element: Element): element is HTMLTemplateElement {
	return element.localName === "template" && element.namespaceURI === HTML_NAMESPACE
}

// The radios in the same group as this one, in document order: same name and form owner, in the same tree.
// Groups are found per form, or per tree for radios without one, and kept in `groups` so each is
// only searched once.
type RadioGroups = Map<Node, Map<string, Array<HTMLInputElement>>>

function radioGroupOf(radio: HTMLInputElement, groups: RadioGroups): Array<HTMLInputElement> {
	if (radio.name === "") return [radio]

	const form = radio.form
	const owner = form ?? radio.getRootNode()
	let byName = groups.get(owner)
	if (!byName) {
		byName = new Map()
		groups.set(owner, byName)
		const inputs = form ? form.elements : (owner as ParentNode).querySelectorAll("input")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i] as Element
			if (isInputElement(input) && input.type === "radio" && input.form === form) {
				const group = byName.get(input.name)
				if (group) group.push(input)
				else byName.set(input.name, [input])
			}
		}
	}
	// happy-dom can leave a radio out of its own form's controls.
	return byName.get(radio.name) ?? []
}

// The form a control inside `element` belongs to once `element` moves into `parent`.
function formAfterMove(control: HTMLInputElement, element: Element, parent: ParentNode): HTMLFormElement | null {
	if (control.hasAttribute("form")) return control.form
	const form = closestForm(control.parentNode)
	return form && element.contains(form) ? form : closestForm(parent)
}

// The node itself or its nearest ancestor that is a form.
function closestForm(node: Node | null): HTMLFormElement | null {
	for (; node; node = node.parentNode) {
		if (isFormElement(node as Element)) return node as HTMLFormElement
	}
	return null
}

function isFormElement(element: Element): element is HTMLFormElement {
	return element.localName === "form" && element.namespaceURI === HTML_NAMESPACE
}

function isCheckedRadio(element: Element): element is HTMLInputElement {
	return isInputElement(element) && element.type === "radio" && element.checked
}

function isInputElement(element: Element): element is HTMLInputElement {
	return element.localName === "input" && element.namespaceURI === HTML_NAMESPACE
}

function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
	return element.localName === "textarea" && element.namespaceURI === HTML_NAMESPACE
}

// A customized built-in's definition is fixed when it's created, so changing `is` needs a new element.
function hasSameIs(from: Element, to: Element): boolean {
	return from.getAttribute("is") === to.getAttribute("is")
}

function canMorphElementInPlace(from: Element, to: Element): boolean {
	if (from.localName !== to.localName) return false
	if (from.namespaceURI !== to.namespaceURI) return false
	if (!hasSameIs(from, to)) return false
	if (isFormControl(from) && isFormControl(to)) {
		const fromId = from.id
		const toId = to.id

		if ((fromId !== "" || toId !== "") && fromId !== toId) {
			return false
		}
	}

	if (isInputElement(from) && isInputElement(to)) {
		return from.type === to.type
	}

	return true
}

function canSoftMatchByTagName(element: Element, hasDescendantIdMarker: boolean): boolean {
	return !hasStableSoftMatchIdentity(element, hasDescendantIdMarker)
}

function hasStableSoftMatchIdentity(element: Element, hasDescendantIdMarker: boolean): boolean {
	return element.id !== "" || isFormControl(element) || hasDescendantIdMarker || hasMatchKeyAttribute(element)
}

function hasMatchKeyAttribute(element: Element): boolean {
	return element.hasAttribute("name") || element.hasAttribute("href") || element.hasAttribute("src")
}

function isFormControl(element: Element): boolean {
	if (element.namespaceURI !== HTML_NAMESPACE) return false

	const localName = element.localName
	return (
		localName === "input" ||
		localName === "textarea" ||
		localName === "select" ||
		(localName.includes("-") && (element.constructor as unknown as Record<string, unknown>)["formAssociated"] === true)
	)
}

function isDialogElement(element: Element): element is HTMLDialogElement {
	return element.localName === "dialog" && element.namespaceURI === HTML_NAMESPACE
}

function isDetailsElement(element: Element): element is HTMLDetailsElement {
	return element.localName === "details" && element.namespaceURI === HTML_NAMESPACE
}

// The `open` attribute on these elements is the live state the user toggles, not a default.
function hasOpenState(element: Element): boolean {
	return isDialogElement(element) || isDetailsElement(element)
}

// The other open items in the same exclusive accordion as this one: same name, in the same tree.
function openDetailsInGroup(details: Element): Array<Element> {
	const name = details.getAttributeNS(null, "name")
	if (!name) return []

	// A document finds elements by name without looking through the rest, so only other roots are searched.
	const root = details.getRootNode()
	const candidates = isDocument(root)
		? root.getElementsByName(name)
		: (root as ParentNode).querySelectorAll("details[open][name]")
	return [...candidates].filter(
		(other) =>
			other !== details &&
			other.getAttributeNS(null, "name") === name &&
			other.hasAttributeNS(null, "open") &&
			isDetailsElement(other),
	)
}

// A document keeps only the first open item of an accordion, but WebKit's parser keeps them all, so
// close the later ones in the target.
function closeLaterOpenDetails(nodes: ArrayLike<Node>): void {
	const names = new Set<string>()
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!
		if (!isElement(node)) continue

		const items = [...node.querySelectorAll("details[open]")]
		if (node.matches("details[open]")) items.unshift(node)
		for (const item of items) {
			const name = item.getAttributeNS(null, "name")
			if (!name || !isDetailsElement(item)) continue
			if (names.has(name)) item.removeAttributeNS(null, "open")
			else names.add(name)
		}
	}
}

function isSelectElement(element: Element): element is HTMLSelectElement {
	return element.localName === "select" && element.namespaceURI === HTML_NAMESPACE
}

function isOptgroupElement(element: Element): boolean {
	return element.localName === "optgroup" && element.namespaceURI === HTML_NAMESPACE
}

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option" && element.namespaceURI === HTML_NAMESPACE
}

function isElement(node: Node): node is Element {
	return node.nodeType === ELEMENT_NODE_TYPE
}

function isDocument(node: Node): node is Document {
	return node.nodeType === DOCUMENT_NODE_TYPE
}

function isParentNode(node: Node): node is ParentNode {
	const type = node.nodeType
	return type === ELEMENT_NODE_TYPE || type === DOCUMENT_NODE_TYPE || type === DOCUMENT_FRAGMENT_NODE_TYPE
}

function isNodeList(value: ChildNode | NodeListOf<ChildNode>): value is NodeListOf<ChildNode> {
	return Object.prototype.toString.call(value) === "[object NodeList]"
}

// Find longest increasing subsequence to minimize moves during reordering
// Returns the indices in the sequence that form the LIS
function longestIncreasingSubsequence(sequence: Array<number | undefined>): Array<number> {
	const n = sequence.length
	if (n === 0) return []

	const smallestEnding = new Array<number>(n)
	const indices = new Array<number>(n)
	const prev = new Int32Array(n)
	prev.fill(-1)

	let lisLength = 0

	for (let i = 0; i < n; i++) {
		const val = sequence[i]
		if (val === undefined) continue

		let left = 0
		let right = lisLength

		while (left < right) {
			const mid = Math.floor((left + right) / 2)
			if (smallestEnding[mid]! < val) left = mid + 1
			else right = mid
		}

		prev[i] = left > 0 ? indices[left - 1]! : -1

		smallestEnding[left] = val
		indices[left] = i
		if (left === lisLength) lisLength++
	}

	const result = new Array<number>(lisLength)
	let curr = indices[lisLength - 1]!

	for (let i = lisLength - 1; i >= 0; i--) {
		result[i] = curr
		curr = prev[curr]!
	}

	return result
}
