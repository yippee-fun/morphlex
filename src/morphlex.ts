const SUPPORTS_MOVE_BEFORE = typeof Element !== "undefined" && "moveBefore" in Element.prototype
const ELEMENT_NODE_TYPE = 1
const TEXT_NODE_TYPE = 3
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const CLOBBER_ATTRIBUTE = "morphlex-clobber"
const DETACHED_NODE_ERROR = "[Morphlex] Cannot replace a detached node. It needs a parent."

const IS_PARENT_NODE_TYPE = [
	0, //  0: (unused)
	1, //  1: Element
	0, //  2: Attribute (deprecated)
	0, //  3: Text
	0, //  4: CDATASection (deprecated)
	0, //  5: EntityReference (deprecated)
	0, //  6: Entity (deprecated)
	0, //  7: ProcessingInstruction
	0, //  8: Comment
	1, //  9: Document
	0, // 10: DocumentType
	1, // 11: DocumentFragment
	0, // 12: Notation (deprecated)
]

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
type CandidateIdBucket = number | Array<number>
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

	const clobbered = takeClobbered(to)
	const select = selectOf(from)
	const selection = select && markupSelectionOf(select)
	const flagged = isParentNode(from) ? flagDirtyInputs(from as Element) : null
	// A root select's options are keyed by the live select, even if the target renames it and the rename is vetoed.
	const enclosingSelect =
		from.nodeType === ELEMENT_NODE_TYPE && isSelectElement(from as Element) ? (from as HTMLSelectElement) : select
	try {
		const morpher = new Morph(options, clobbered, flagged, enclosingSelect)
		morpher.morph(from, to)
		if (select) morpher.syncEnclosingSelect(select, selection!)
	} finally {
		if (flagged) clearDirtyFlags(flagged)
	}
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
		const select = selectOf(fromElement)
		const selection = select && markupSelectionOf(select)
		const flagged = flagDirtyInputs(fromElement)
		// The target's options belong to the live select, whatever the target select is called.
		const enclosingSelect = isSelectElement(fromElement) ? fromElement : select
		try {
			const morpher = new Morph(options, clobbered, flagged, enclosingSelect)
			morpher.morphChildren(fromElement, toElement)
			if (select) morpher.syncEnclosingSelect(select, selection!)
		} finally {
			clearDirtyFlags(flagged)
		}
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
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

		for (const descendant of element.querySelectorAll(`[${CLOBBER_ATTRIBUTE}], [morphlex-dirty]`)) {
			if (stripMarkerAttributes(descendant)) (clobbered ??= new Set()).add(descendant)
		}
	}

	return clobbered
}

// Returns whether the element had `morphlex-clobber`.
function stripMarkerAttributes(element: Element): boolean {
	if (element.hasAttribute("morphlex-dirty")) element.removeAttribute("morphlex-dirty")
	if (!element.hasAttribute(CLOBBER_ATTRIBUTE)) return false
	element.removeAttribute(CLOBBER_ATTRIBUTE)
	return true
}

function flagDirtyInputs(node: Element): Array<Element> {
	const flagged: Array<Element> = []
	const defaultOptions: DefaultOptionMap = new Map()
	let optionSelects: Map<Element, HTMLSelectElement> | null = null

	if (isInputElement(node)) {
		if (isDirtyInput(node)) {
			node.setAttribute("morphlex-dirty", "")
			flagged.push(node)
		}
	} else if (isOptionElement(node)) {
		optionSelects = optionSelectsOf(node)
		if (isDirtyOption(node, optionSelects.get(node), defaultOptions)) {
			node.setAttribute("morphlex-dirty", "")
			flagged.push(node)
		}
	} else if (isTextAreaElement(node)) {
		if (node.value !== node.defaultValue) {
			node.setAttribute("morphlex-dirty", "")
			flagged.push(node)
		}
	}

	// The selectors also match elements with these names in other namespaces, like SVG.
	for (const input of node.querySelectorAll("input")) {
		if (isInputElement(input) && isDirtyInput(input)) {
			input.setAttribute("morphlex-dirty", "")
			flagged.push(input)
		}
	}

	for (const element of node.querySelectorAll("option")) {
		if (!isOptionElement(element)) continue
		optionSelects ??= optionSelectsOf(node)
		if (isDirtyOption(element, optionSelects.get(element), defaultOptions)) {
			element.setAttribute("morphlex-dirty", "")
			flagged.push(element)
		}
	}

	for (const element of node.querySelectorAll("textarea")) {
		if (isTextAreaElement(element) && element.value !== element.defaultValue) {
			element.setAttribute("morphlex-dirty", "")
			flagged.push(element)
		}
	}

	return flagged
}

// Checkboxes and radios report a `.value` of "on" when they have no `value` attribute,
// while `defaultValue` is "", so only their checkedness tells us if the user changed them.
function isDirtyInput(input: HTMLInputElement): boolean {
	if (input.type === "checkbox" || input.type === "radio") {
		return input.checked !== input.defaultChecked
	}

	return input.value !== input.defaultValue
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
function defaultOptionOf(select: HTMLSelectElement): HTMLOptionElement | null {
	const options = select.options
	let firstEnabled: HTMLOptionElement | null = null

	for (let i = options.length - 1; i >= 0; i--) {
		const option = options[i]!
		if (option.hasAttribute("selected")) return option
		if (!isDisabledOption(option)) firstEnabled = option
	}

	return displaySizeOf(select) > 1 ? null : firstEnabled
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
	const options = select.options
	for (let i = 0; i < options.length; i++) optionSelects.set(options[i]!, select)
}

// The options the markup selects, to tell whether a morph inside the select changed them.
function markupSelectionOf(select: HTMLSelectElement): Array<HTMLOptionElement | null> {
	if (!select.multiple) return [defaultOptionOf(select)]
	return Array.from(select.options).filter((option) => option.hasAttribute("selected"))
}

function clearDirtyFlags(elements: Array<Element>): void {
	for (let i = 0; i < elements.length; i++) {
		const element = elements[i]!
		if (element.hasAttribute("morphlex-dirty")) {
			element.removeAttribute("morphlex-dirty")
		}
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

// Moving a form briefly frees the radios outside it that it owns through a `form` attribute, and a
// checked one then unchecks the rest of its new group. So they move unchecked, to be checked again
// straight after. Returns the radios it unchecked.
function uncheckOutsideRadios(element: Element): Array<HTMLInputElement> {
	const outside: Array<HTMLInputElement> = []
	const forms = isFormElement(element) ? [element] : element.getElementsByTagName("form")
	for (let i = 0; i < forms.length; i++) {
		const form = forms[i]!
		if (!isFormElement(form)) continue
		const controls = form.elements
		for (let j = 0; j < controls.length; j++) {
			const control = controls[j]!
			if (isCheckedRadio(control) && !element.contains(control)) {
				control.checked = false
				outside.push(control)
			}
		}
	}
	return outside
}

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

class Morph {
	readonly #idArrayMap: IdArrayMap = new WeakMap()
	readonly #idSetMap: IdSetMap = new WeakMap()
	readonly #options: Options
	readonly #clobbered: Set<Element> | null
	#vetoedControls: Set<Element> | null = null
	// Nodes whose visit or children's visit was vetoed.
	#vetoedNodes: Array<Node> | null = null
	// Radios whose checkedness the morph reset or whose radio group a move changed. Their groups are
	// synced to the markup when the morph settles, because moves complete out of document order.
	#radiosToSync: Set<HTMLInputElement> | null = null
	// Checked radios that moved unchecked, so they couldn't uncheck the rest of a group they joined.
	#radiosUncheckedForMove: Set<HTMLInputElement> | null = null
	// The morph's own nodes are inside this node, between these two siblings when there are any.
	#scope: Node | null = null
	#scopeStart: Node | null = null
	#scopeEnd: Node | null = null
	// Selects synced to their markup, synced again when the morph settles, after options have moved or gone.
	#syncedSelects: Set<HTMLSelectElement> | null = null
	// Live elements by id, and how often each id appears in the target. An element whose id appears
	// once in each tree is moved to wherever the target puts that id, even under another parent.
	readonly #liveElementsById: Map<string, Element | null> = new Map()
	readonly #targetIdCounts: Map<string, number> = new Map()
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
	// Pending moves and removals are settled when the root's children have been visited, or when
	// the root is replaced, so the root's own callbacks see the finished DOM.
	#root: Node | null = null
	#preserveChanges: boolean
	// Only a target with a checked input can add a checked radio, so other morphs skip looking for one.
	#targetChecksInputs = false
	// Elements flagged `morphlex-dirty` and their ancestors. These can't equal their targets, so they're compared without the flag.
	readonly #dirtyElements: Set<Element> | null = null
	// The flagged elements themselves. A nested morph from a callback can clear their flags, so they're kept here.
	readonly #flagged: Set<Element> = new Set()
	// The select around a morph inside a select, which the target's options don't have.
	readonly #enclosingSelect: HTMLSelectElement | null
	// The live select each target select is morphed into, so the target's options are keyed by the live select,
	// whose attributes a veto can keep.
	readonly #liveSelects: Map<Element, HTMLSelectElement> = new Map()
	readonly #targetChoices: Map<Element, { counts: Map<string, number>; size: number }> = new Map()

	constructor(
		options: Options = {},
		clobbered: Set<Element> | null = null,
		flagged: Array<Element> | null = null,
		enclosingSelect: HTMLSelectElement | null = null,
	) {
		this.#options = options
		this.#enclosingSelect = enclosingSelect
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
			this.#mapIdArraysForEach(to)
			this.#morphOneToMany(from, to)
		} else {
			if (isParentNode(to)) {
				this.#mapIdArrays(to)
			}
			this.#morphOneToOne(from, to)
		}

		this.#finish()
	}

	morphChildren(from: Element, to: Element): void {
		this.#root = from
		this.#scope = from
		this.#mapIdSets(from)
		this.#mapIdArrays(to, false)
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
				if (this.#liveElementsById.has(element.id)) this.#removeNodeNow(element)
			}
			this.#unplacedElements = null
		}

		const deferred = this.#deferredRemovals
		if (deferred) {
			for (let i = 0; i < deferred.length; i++) {
				const node = deferred[i]!
				node.remove()
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
		if (preserveChanges && this.#clobbered?.has(to)) this.#preserveChanges = false

		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(from, to)
		}

		if (isTextAreaElement(from) && isTextAreaElement(to)) {
			this.#visitTextArea(from, to)
		} else if (from.hasChildNodes() || to.hasChildNodes() || isTemplateElement(from)) {
			this.visitChildNodes(from, to)
		}

		this.#preserveChanges = preserveChanges
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
		if (from.hasAttribute("morphlex-dirty")) {
			from.removeAttribute("morphlex-dirty")
		}

		// First pass: update/add attributes from reference (iterate forwards)
		const toAttributes = to.attributes
		for (let i = 0; i < toAttributes.length; i++) {
			const attribute = toAttributes[i]!
			const { name, localName, value, namespaceURI } = attribute
			// Adding `open` would open it, but changing the value of an existing one is fine.
			if (name === "open" && namespaceURI === null && this.#preserveChanges && hasOpenState(from) && !from.hasAttribute("open")) {
				continue
			}
			const oldValue = from.getAttributeNS(namespaceURI, localName)

			if (oldValue === value) continue
			if (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true) {
				// Go through `Attr` nodes, because `setAttribute` rejects names the parser accepts, like `@click`.
				// Look the attribute up after the callback, which may have removed or replaced it.
				const existing = from.getAttributeNodeNS(namespaceURI, localName)
				if (existing) {
					existing.value = value
				} else {
					from.setAttributeNodeNS(attribute.cloneNode() as Attr)
				}
				this.#options.afterAttributeUpdated?.(from, name, oldValue)
			} else {
				this.#noteVetoedAttribute(from, name)
			}
		}

		// Second pass: remove excess attributes. Check for any first, to avoid copying the attribute list.
		if (hasExcessAttributes(from, to)) {
			for (const { name, localName, value, namespaceURI } of Array.from(from.attributes)) {
				if (!to.hasAttributeNS(namespaceURI, localName)) {
					if (name === "open" && namespaceURI === null && this.#preserveChanges && hasOpenState(from)) continue

					if (this.#options.beforeAttributeUpdated?.(from, name, null) ?? true) {
						// Removing `open` from a modal dialog leaves it stuck in the top layer, so close it properly.
						if (name === "open" && namespaceURI === null && isDialogElement(from)) {
							from.close()
						} else {
							from.removeAttributeNS(namespaceURI, localName)
						}
						this.#options.afterAttributeUpdated?.(from, name, value)
					} else {
						this.#noteVetoedAttribute(from, name)
					}
				}
			}
		}

		if (!this.#preserveChanges) {
			this.#resetFormProperties(from, to)
		}
	}

	// Reset user changes to match the target markup. Skip any property whose
	// attribute update was vetoed, since the attributes then still differ.
	#resetFormProperties(from: Element, to: Element): void {
		if (isInputElement(from)) {
			const checked = to.hasAttribute("checked")
			if (from.checked !== checked && from.hasAttribute("checked") === checked) {
				from.checked = checked
				if (from.type === "radio") (this.#radiosToSync ??= new Set()).add(from)
			} else if (checked && from.type === "radio") {
				// Adding `checked` checks the radio, which unchecks the others in its group, even later ones.
				;(this.#radiosToSync ??= new Set()).add(from)
			}

			// Checkbox and radio values aren't user-editable, and assigning them writes the value attribute.
			const type = from.type
			const value = to.getAttribute("value")
			if (
				type !== "file" &&
				type !== "checkbox" &&
				type !== "radio" &&
				from.value !== (value ?? "") &&
				from.getAttribute("value") === value
			) {
				from.value = value ?? ""
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
		if (from.value !== from.defaultValue) {
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

		const parent = from

		const fromChildNodes = nodeListToArray(from.childNodes)
		const toChildNodes = nodeListToArray(to.childNodes)

		const candidateNodeIndices: Array<number> = []
		const candidateElementIndices: Array<number> = []
		const candidateElementWithIdIndices: Array<number> = []
		const candidateElementIndicesById: Map<string, CandidateIdBucket> = new Map()
		const unmatchedNodeIndices: Array<number> = []
		const unmatchedElementIndices: Array<number> = []
		const whitespaceNodeIndices: Array<number> = []

		const candidateNodeActive = new Uint8Array(fromChildNodes.length)
		const candidateElementActive = new Uint8Array(fromChildNodes.length)
		const candidateElementWithIdActive = new Uint8Array(fromChildNodes.length)
		const unmatchedNodeActive = new Uint8Array(toChildNodes.length)
		const unmatchedElementActive = new Uint8Array(toChildNodes.length)

		const matches: Array<number> = []
		const op: Array<Operation> = []
		const nodeTypeMap: Array<number> = []
		const candidateNodeTypeMap: Array<number> = []
		const localNameMap: Array<string> = []
		const candidateLocalNameMap: Array<string> = []
		const namespaceURIMap: Array<string | null> = []
		const candidateNamespaceURIMap: Array<string | null> = []

		for (let i = 0; i < fromChildNodes.length; i++) {
			const candidate = fromChildNodes[i]!
			const nodeType = candidate.nodeType
			candidateNodeTypeMap[i] = nodeType

			if (nodeType === ELEMENT_NODE_TYPE) {
				const candidateElement = candidate as Element
				candidateLocalNameMap[i] = candidateElement.localName
				candidateNamespaceURIMap[i] = candidateElement.namespaceURI
				const candidateId = candidateElement.id
				if (candidateId !== "") {
					candidateElementWithIdActive[i] = 1
					candidateElementWithIdIndices.push(i)

					const existingBucket = candidateElementIndicesById.get(candidateId)
					if (existingBucket === undefined) {
						candidateElementIndicesById.set(candidateId, i)
					} else if (Array.isArray(existingBucket)) {
						existingBucket.push(i)
					} else {
						candidateElementIndicesById.set(candidateId, [existingBucket, i])
					}
				} else {
					candidateElementActive[i] = 1
					candidateElementIndices.push(i)
				}
			} else if (isWhitespaceTextNode(candidate)) {
				whitespaceNodeIndices.push(i)
			} else {
				candidateNodeActive[i] = 1
				candidateNodeIndices.push(i)
			}
		}

		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const nodeType = node.nodeType
			nodeTypeMap[i] = nodeType

			if (nodeType === ELEMENT_NODE_TYPE) {
				const element = node as Element
				localNameMap[i] = element.localName
				namespaceURIMap[i] = element.namespaceURI
				unmatchedElementActive[i] = 1
				unmatchedElementIndices.push(i)
			} else if (isWhitespaceTextNode(node)) {
				continue
			} else {
				unmatchedNodeActive[i] = 1
				unmatchedNodeIndices.push(i)
			}
		}

		// Match elements by isEqualNode. Equal nodes have equal text content, so with many siblings,
		// bucket the candidates by it rather than comparing every pair.
		const candidatesByText =
			candidateElementIndices.length * unmatchedElementIndices.length > 1024
				? bucketByTextContent(fromChildNodes, candidateElementIndices)
				: null

		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!

			const localName = localNameMap[unmatchedIndex]
			const element = toChildNodes[unmatchedIndex] as Element
			let candidates = candidateElementIndices
			if (candidatesByText) {
				const bucket = candidatesByText.get(element.textContent!)
				if (bucket === undefined) continue
				candidates = bucket
			}

			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (!candidateElementActive[candidateIndex]) continue
				if (localName !== candidateLocalNameMap[candidateIndex]) continue
				if (namespaceURIMap[unmatchedIndex] !== candidateNamespaceURIMap[candidateIndex]) continue
				const candidate = fromChildNodes[candidateIndex] as Element

				if (isEqualNode(candidate, element)) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.EqualNode
					candidateElementActive[candidateIndex] = 0
					unmatchedElementActive[unmatchedIndex] = 0
					break
				}
			}
		}

		// Match elements that only differ by the user's changes, so a changed control keeps its own target.
		// Such elements share their shape, so the candidates are bucketed by it rather than comparing every pair.
		const dirtyElements = this.#dirtyElements
		if (dirtyElements) {
			const candidatesByShape: Map<string, Array<number>> = new Map()
			const firstActive: Map<Array<number>, number> = new Map()
			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				const candidate = fromChildNodes[candidateIndex] as Element
				if (!candidateElementActive[candidateIndex] || !dirtyElements.has(candidate)) continue
				const shape = shapeOf(candidate)
				const bucket = candidatesByShape.get(shape)
				if (bucket) bucket.push(candidateIndex)
				else candidatesByShape.set(shape, [candidateIndex])
			}

			for (let i = 0; candidatesByShape.size && i < unmatchedElementIndices.length; i++) {
				const unmatchedIndex = unmatchedElementIndices[i]!
				if (!unmatchedElementActive[unmatchedIndex]) continue
				const element = toChildNodes[unmatchedIndex] as Element
				const candidates = candidatesByShape.get(shapeOf(element))
				if (!candidates) continue

				// Skip the bucket's candidates that are already taken, so identical siblings don't rescan them.
				let c = firstActive.get(candidates) ?? 0
				while (c < candidates.length && !candidateElementActive[candidates[c]!]) c++
				firstActive.set(candidates, c)
				for (; c < candidates.length; c++) {
					const candidateIndex = candidates[c]!
					if (!candidateElementActive[candidateIndex]) continue
					const candidate = fromChildNodes[candidateIndex] as Element

					if (isEqualExceptDirty(candidate, element, dirtyElements)) {
						matches[unmatchedIndex] = candidateIndex
						op[unmatchedIndex] = Operation.SameElement
						candidateElementActive[candidateIndex] = 0
						unmatchedElementActive[unmatchedIndex] = 0
						break
					}
				}
			}
		}

		// Match by exact id
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (!unmatchedElementActive[unmatchedIndex]) continue

			const element = toChildNodes[unmatchedIndex] as Element
			const id = element.id

			if (id === "") continue

			const candidateBucket = candidateElementIndicesById.get(id)
			if (candidateBucket === undefined) continue

			if (Array.isArray(candidateBucket)) {
				for (let c = 0; c < candidateBucket.length; c++) {
					const candidateIndex = candidateBucket[c]!
					if (!candidateElementWithIdActive[candidateIndex]) continue

					if (
						localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex] &&
						namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex]
					) {
						matches[unmatchedIndex] = candidateIndex
						op[unmatchedIndex] = Operation.SameElement
						candidateElementWithIdActive[candidateIndex] = 0
						unmatchedElementActive[unmatchedIndex] = 0
						break
					}
				}
			} else {
				const candidateIndex = candidateBucket
				if (!candidateElementWithIdActive[candidateIndex]) continue

				if (
					localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex] &&
					namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex]
				) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.SameElement
					candidateElementWithIdActive[candidateIndex] = 0
					unmatchedElementActive[unmatchedIndex] = 0
				}
			}
		}

		// A target whose live element is elsewhere is left for #addNode to claim, so no other candidate takes its id.
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (unmatchedElementActive[unmatchedIndex] && this.#canClaim(toChildNodes[unmatchedIndex] as Element, parent)) {
				unmatchedElementActive[unmatchedIndex] = 0
			}
		}

		// Match by idArray (to) against idSet (from)
		// Elements with idSets may not have IDs themselves, so we check candidateElements
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (!unmatchedElementActive[unmatchedIndex]) continue

			const element = toChildNodes[unmatchedIndex] as Element
			const idArray = this.#idArrayMap.get(element)

			if (!idArray) continue

			candidateLoop: for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue

				const candidate = fromChildNodes[candidateIndex] as Element

				if (
					localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex] &&
					namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex]
				) {
					const candidateIdSet = this.#idSetMap.get(candidate)
					if (candidateIdSet) {
						for (let a = 0; a < idArray.length; a++) {
							const arrayId = idArray[a]!
							if (candidateIdSet.has(arrayId)) {
								matches[unmatchedIndex] = candidateIndex
								op[unmatchedIndex] = Operation.SameElement
								candidateElementActive[candidateIndex] = 0
								unmatchedElementActive[unmatchedIndex] = 0
								break candidateLoop
							}
						}
					}
				}
			}
		}

		// Under preserveChanges, match a checkbox, radio or option the user changed to a target with the same
		// choice, and a wrapper without its own identity holding some to a target holding one of the same choices,
		// so other elements can't take their targets and the user's choices keep their values. A wrapper tries targets
		// without their own identity first, so a new label with an id can't take its place, but can still take its own
		// target when it gains an id. Then targets with the same attributes apart from class and style, so a form doesn't
		// take another form's target for holding the same choice, and then targets holding all of its choices.
		if (this.#preserveChanges && dirtyElements) {
			// Candidates holding more choices go first, so one holding fewer can't take the only target holding them all.
			const choiceCandidates: Array<[number, Array<string>, Array<string>]> = []
			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue
				const candidate = fromChildNodes[candidateIndex] as Element
				const dirtyChoices = this.#dirtyChoicesOf(candidate)
				if (
					dirtyChoices &&
					(this.#holdsOwnChoices(candidate) || canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate)))
				) {
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
					const choices = choicesOf(k)
					if (localNameMap[target] !== candidateLocalNameMap[candidateIndex]) return false
					if (namespaceURIMap[target] !== candidateNamespaceURIMap[candidateIndex]) return false
					const candidate = fromChildNodes[candidateIndex] as Element
					const element = toChildNodes[target] as Element
					return (
						hasSameIs(candidate, element) &&
						(this.#holdsOwnChoices(candidate) || identified !== canSoftMatchByTagName(element, this.#idArrayMap.has(element))) &&
						this.#holdsChoices(choices, element, allChoices) &&
						(!sameAttributes || hasSameAttributes(candidate, element, STYLING_ATTRIBUTES))
					)
				}

				// The targets in the order candidates try them, smallest first when a candidate needs all of its choices.
				const targets = unmatchedElementIndices.filter((i) => unmatchedElementActive[i])
				if (allChoices) {
					targets.sort(
						(a, b) =>
							this.#targetChoicesOf(toChildNodes[a] as Element).size - this.#targetChoicesOf(toChildNodes[b] as Element).size,
					)
				}

				// Pair as many candidates with targets as possible, so one taking a target can't leave another without any.
				const owners: Map<number, number> = new Map()
				// Search breadth first for a chain of candidates, each taking the next one's target, that ends at a free
				// target, and shift the targets along it.
				const assign = (start: number): void => {
					const reachedFrom: Map<number, number> = new Map()
					const ownedTarget: Map<number, number> = new Map()
					const queue = [start]
					// Each target is only reached once, so later candidates in the queue skip the ones already reached.
					let unreached = targets
					for (let q = 0; q < queue.length; q++) {
						const k = queue[q]!
						const stillUnreached: Array<number> = []
						for (const target of unreached) {
							if (!takes(k, target)) {
								stillUnreached.push(target)
								continue
							}
							reachedFrom.set(target, k)
							const owner = owners.get(target)
							if (owner !== undefined) {
								ownedTarget.set(owner, target)
								queue.push(owner)
								continue
							}
							for (let next: number | undefined = target; next !== undefined;) {
								const taker = reachedFrom.get(next)!
								owners.set(next, taker)
								next = ownedTarget.get(taker)
							}
							return
						}
						unreached = stillUnreached
					}
				}

				// A candidate can only take a target holding one of its choices, so index the targets by the choices
				// they hold, in the order candidates try them. Each list skips its taken prefix once.
				const holders: Map<string, Array<number>> = new Map()
				for (const target of targets) {
					const element = toChildNodes[target] as Element
					for (const choice of this.#targetChoicesOf(element).counts.keys()) {
						const key = indexKey(element, choice, sameAttributes)
						const list = holders.get(key)
						if (list) list.push(target)
						else holders.set(key, [target])
					}
				}
				const position: Map<number, number> = new Map(targets.map((target, t) => [target, t]))
				// Candidates alike in everything `takes` checks pass and fail the same targets, so they share where
				// each list's untried targets start. A target in a list holds one of the candidate's choices, so when one
				// choice is enough, their choices don't matter.
				const firstFree: Map<string, Map<Array<number>, number>> = new Map()

				// Give each candidate a free target first, so augmenting paths are only searched for the rest.
				const unassigned: Array<number> = []
				for (let k = 0; k < choiceCandidates.length; k++) {
					if (!candidateElementActive[choiceCandidates[k]![0]] || !choicesOf(k).length) continue
					// Walk the lists for the candidate's choices together, in target order. A target holding all of them is
					// in every list, so then only the shortest is walked.
					const candidate = fromChildNodes[choiceCandidates[k]![0]] as Element
					const likeness = JSON.stringify([
						candidate.namespaceURI,
						candidate.localName,
						candidate.getAttribute("is"),
						this.#holdsOwnChoices(candidate),
						allChoices && [...choicesOf(k)].sort(),
						sameAttributes && indexKey(candidate, "", true),
					])
					let untried = firstFree.get(likeness)
					if (!untried) firstFree.set(likeness, (untried = new Map()))
					let lists: Array<Array<number>> = []
					for (const choice of new Set(choicesOf(k))) {
						const list = holders.get(indexKey(candidate, choice, sameAttributes))
						if (list) lists.push(list)
						else if (allChoices) {
							lists = []
							break
						}
					}
					// A target the candidate can take is in its lists, so without any it has none.
					if (!lists.length) continue
					if (allChoices) lists = [lists.reduce((a, b) => (b.length < a.length ? b : a))]
					const heads: Array<number> = []
					for (const list of lists) {
						let head = untried.get(list) ?? 0
						while (head < list.length && owners.has(list[head]!)) head++
						heads.push(head)
					}
					let assigned = false
					while (!assigned) {
						let next: number | undefined
						for (let l = 0; l < lists.length; l++) {
							const target = lists[l]![heads[l]!]
							if (target !== undefined && (next === undefined || position.get(target)! < position.get(next)!)) next = target
						}
						if (next === undefined) break
						for (let l = 0; l < lists.length; l++) if (lists[l]![heads[l]!] === next) heads[l] = heads[l]! + 1
						if (owners.has(next) || !takes(k, next)) continue
						owners.set(next, k)
						assigned = true
					}
					// Every target before each head was taken or failed, for this candidate and those alike.
					for (let l = 0; l < lists.length; l++) untried.set(lists[l]!, heads[l]!)
					if (!assigned) unassigned.push(k)
				}
				for (const k of unassigned) {
					if (owners.size === targets.length) break
					assign(k)
				}

				for (const [target, k] of owners) {
					const candidateIndex = choiceCandidates[k]![0]
					matches[target] = candidateIndex
					op[target] = Operation.SameElement
					candidateElementActive[candidateIndex] = 0
					unmatchedElementActive[target] = 0
				}
			}
		}

		// Match by heuristics
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (!unmatchedElementActive[unmatchedIndex]) continue

			const element = toChildNodes[unmatchedIndex] as Element

			const name = element.getAttribute("name")
			const href = element.getAttribute("href")
			const src = element.getAttribute("src")
			if (!name && !href && !src) continue

			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue
				const candidate = fromChildNodes[candidateIndex] as Element

				if (
					localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex] &&
					namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex] &&
					((name && name === candidate.getAttribute("name")) ||
						(href && href === candidate.getAttribute("href")) ||
						(src && src === candidate.getAttribute("src"))) &&
					!this.#holdsOtherChoice(candidate, element)
				) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.SameElement
					candidateElementActive[candidateIndex] = 0
					unmatchedElementActive[unmatchedIndex] = 0
					break
				}
			}
		}

		// Match by tagName (only for elements without distinguishing attributes)
		let firstActiveCandidate = 0
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (!unmatchedElementActive[unmatchedIndex]) continue

			const element = toChildNodes[unmatchedIndex] as Element

			if (!canSoftMatchByTagName(element, this.#idArrayMap.has(element))) continue

			const localName = localNameMap[unmatchedIndex]

			while (
				firstActiveCandidate < candidateElementIndices.length &&
				!candidateElementActive[candidateElementIndices[firstActiveCandidate]!]
			) {
				firstActiveCandidate++
			}

			for (let c = firstActiveCandidate; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue

				const candidate = fromChildNodes[candidateIndex] as Element

				if (!canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate))) continue

				const candidateLocalName = candidateLocalNameMap[candidateIndex]

				if (
					localName === candidateLocalName &&
					namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex] &&
					!this.#holdsOtherChoice(candidate, element)
				) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.SameElement
					candidateElementActive[candidateIndex] = 0
					unmatchedElementActive[unmatchedIndex] = 0
					break
				}
			}
		}

		// Match nodes by isEqualNode (skip whitespace-only text nodes)
		for (let i = 0; i < unmatchedNodeIndices.length; i++) {
			const unmatchedIndex = unmatchedNodeIndices[i]!

			const node = toChildNodes[unmatchedIndex]!
			for (let c = 0; c < candidateNodeIndices.length; c++) {
				const candidateIndex = candidateNodeIndices[c]!
				if (!candidateNodeActive[candidateIndex]) continue

				const candidate = fromChildNodes[candidateIndex]!
				if (candidate.isEqualNode(node)) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.EqualNode
					candidateNodeActive[candidateIndex] = 0
					unmatchedNodeActive[unmatchedIndex] = 0
					break
				}
			}
		}

		// Match by nodeType
		for (let i = 0; i < unmatchedNodeIndices.length; i++) {
			const unmatchedIndex = unmatchedNodeIndices[i]!
			if (!unmatchedNodeActive[unmatchedIndex]) continue

			const nodeType = nodeTypeMap[unmatchedIndex]

			for (let c = 0; c < candidateNodeIndices.length; c++) {
				const candidateIndex = candidateNodeIndices[c]!
				if (!candidateNodeActive[candidateIndex]) continue

				if (nodeType === candidateNodeTypeMap[candidateIndex]) {
					matches[unmatchedIndex] = candidateIndex
					op[unmatchedIndex] = Operation.SameNode
					candidateNodeActive[candidateIndex] = 0
					unmatchedNodeActive[unmatchedIndex] = 0
					break
				}
			}
		}

		// Remove any unmatched candidates first, before calculating LIS and repositioning
		for (let i = 0; i < candidateNodeIndices.length; i++) {
			const candidateIndex = candidateNodeIndices[i]!
			if (candidateNodeActive[candidateIndex]) this.#removeNode(fromChildNodes[candidateIndex]!)
		}

		for (let i = 0; i < candidateElementIndices.length; i++) {
			const candidateIndex = candidateElementIndices[i]!
			if (candidateElementActive[candidateIndex]) this.#removeNode(fromChildNodes[candidateIndex]!)
		}

		for (let i = 0; i < candidateElementWithIdIndices.length; i++) {
			const candidateIndex = candidateElementWithIdIndices[i]!
			if (candidateElementWithIdActive[candidateIndex]) this.#removeNode(fromChildNodes[candidateIndex]!)
		}

		// Find LIS - these nodes don't need to move
		// matches already contains the fromChildNodes indices, so we can use it directly
		const lisIndices = longestIncreasingSubsequence(matches)

		const shouldNotMove: Array<boolean> = new Array(fromChildNodes.length)
		for (let i = 0; i < lisIndices.length; i++) {
			shouldNotMove[matches[lisIndices[i]!]!] = true
		}

		// Whitespace stays in place for now, so target whitespace can reuse whatever is at the insertion point.
		const liveWhitespace: Set<ChildNode> | null = whitespaceNodeIndices.length ? new Set() : null
		for (let i = 0; i < whitespaceNodeIndices.length; i++) {
			liveWhitespace!.add(fromChildNodes[whitespaceNodeIndices[i]!]!)
		}

		let insertionPoint: ChildNode | null = parent.firstChild
		const placed: Array<ChildNode> = []
		for (let i = 0; i < toChildNodes.length; i++) {
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

			const node = toChildNodes[i]!
			const matchInd = matches[i]
			if (insertionPoint && liveWhitespace?.has(insertionPoint) && isWhitespaceTextNode(node)) {
				const whitespace: ChildNode = insertionPoint
				liveWhitespace.delete(whitespace)
				placed.push(whitespace)
				insertionPoint = whitespace.nextSibling
				this.#morphOneToOne(whitespace, node)
			} else if (matchInd !== undefined) {
				const match = fromChildNodes[matchInd]!
				const operation = op[i]!

				if (!shouldNotMove[matchInd]) {
					const outsideRadios = isElement(match) ? uncheckOutsideRadios(match) : null
					moveBefore(parent, match, insertionPoint)
					if (outsideRadios) for (const radio of outsideRadios) radio.checked = true
				}
				// Read this before the morph, which can replace the match.
				insertionPoint = match.nextSibling

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
				if (added === node) insertionPoint = node.nextSibling
			}
		}

		if (liveWhitespace) {
			for (const whitespace of liveWhitespace) {
				if (whitespace.parentNode === parent) this.#removeNode(whitespace)
			}
		}

		this.#settleIfRoot(from)
		if (isSelectElement(from)) this.#syncDefaultSelection(from)

		this.#options.afterChildrenVisited?.(from)
	}

	// A morph inside a select never visits the select, so sync it afterwards if the morph
	// changed what the markup selects. A vetoed morph changes nothing, so it leaves it alone.
	syncEnclosingSelect(select: HTMLSelectElement, selection: Array<HTMLOptionElement | null>): void {
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
	#uncheckRadiosForMove(element: Element, parent: ParentNode): Array<HTMLInputElement> {
		const outside = uncheckOutsideRadios(element)

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

	// How often each choice appears in the target, and how many choices it holds.
	#targetChoicesOf(element: Element): { counts: Map<string, number>; size: number } {
		let targetChoices = this.#targetChoices.get(element)
		if (!targetChoices) {
			const choices: Array<string> = []
			for (const control of [element, ...element.querySelectorAll("input, option")]) {
				const choice = this.#choiceOf(control)
				if (choice !== null && !this.#isClobberedWithin(control, element)) choices.push(choice)
			}
			targetChoices = { counts: countChoices(choices), size: choices.length }
			this.#targetChoices.set(element, targetChoices)
		}
		return targetChoices
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

	// An option is keyed by the enclosing select, or else the nearest one around it, unless it's in a datalist the
	// select doesn't own.
	#choiceOf(element: Element): string | null {
		if (!isOptionElement(element)) return choiceOf(element, null)
		let select = this.#enclosingSelect
		for (let parent = element.parentElement; parent; parent = parent.parentElement) {
			if (isSelectElement(parent)) {
				select ??= parent
				break
			}
			if (parent.localName === "datalist" && parent.namespaceURI === HTML_NAMESPACE) return null
		}
		return choiceOf(element, (select && this.#liveSelects.get(select)) ?? select)
	}

	// The choices of the checkboxes, radios and options the user changed in this element, or null when there are none.
	// The picked ones leave out options and radios the user moved away from, which can be matched once those can't.
	#dirtyChoicesOf(element: Element): { choices: Array<string>; picked: Array<string> } | null {
		if (!this.#dirtyElements?.has(element)) return null
		const choices: Array<string> = []
		const picked: Array<string> = []
		for (const control of [element, ...element.querySelectorAll("input, option")]) {
			const choice = this.#flagged.has(control) ? this.#choiceOf(control) : null
			if (choice === null) continue
			choices.push(choice)
			if (control === element || !isLeftChoice(control)) picked.push(choice)
		}
		return choices.length ? { choices, picked } : null
	}

	// A vetoed `selected` or `checked` update leaves the selection alone, like other vetoed form attributes.
	#noteVetoedAttribute(element: Element, name: string): void {
		if ((name === "selected" && isOptionElement(element)) || (name === "checked" && isInputElement(element))) {
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

		clearImplicitSelection(node, parent)
		this.#placeMovableDescendants(node, parent)
		parent.insertBefore(node, insertionPoint)
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
		this.#preserveChanges = preserveChanges

		if (!inCycle && this.#liveElementsById.get(target.id) === live && !live.contains(parent)) {
			this.#liveElementsById.delete(target.id)
			const outsideRadios = this.#uncheckRadiosForMove(live, parent)
			moveInto(parent, live, placeholder)
			placeholder.remove()
			for (const radio of outsideRadios) radio.checked = true
			if (!this.#preserveChanges) this.#noteRadioGroups(live)
			this.#morphOneToOne(live, target)
		} else {
			this.#insertNewNode(parent, target, placeholder, approved)
			placeholder.remove()
		}

		this.#preserveChanges = saved
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

	#removeNode(node: ChildNode): void {
		// A movable element stays put for now, since the target may place it under another parent.
		if (isElement(node) && this.#movableElement(node.id) === node) {
			;(this.#unplacedElements ??= []).push(node)
			return
		}

		if (this.#options.beforeNodeRemoved?.(node) ?? true) this.#removeApprovedNode(node)
	}

	#removeNodeNow(node: ChildNode): void {
		if (this.#options.beforeNodeRemoved?.(node) ?? true) {
			node.remove()
			this.#options.afterNodeRemoved?.(node)
		}
	}

	#removeApprovedNode(node: ChildNode): void {
		if (this.#holdsMovableElement(node)) {
			;(this.#deferredRemovals ??= []).push(node)
		} else {
			node.remove()
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

		// An inner morph leaves the target's own element out of the result, so its id doesn't count.
		const targetIdCounts = this.#targetIdCounts
		if (countRoot && isElement(node) && node.id !== "") targetIdCounts.set(node.id, (targetIdCounts.get(node.id) ?? 0) + 1)

		forEachDescendantElementWithId(node, (element) => {
			const id = element.id
			targetIdCounts.set(id, (targetIdCounts.get(id) ?? 0) + 1)

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
// value and form. An option's select is passed in, since a target's option is keyed by the live select.
function choiceOf(element: Element, select: HTMLSelectElement | null): string | null {
	if (isOptionElement(element)) {
		return JSON.stringify([
			select?.getAttribute("name") ?? "",
			select && formOf(select),
			select && (select.hasAttribute("multiple") ? 2 : displaySizeOf(select) > 1 ? 1 : 0),
			element.value,
		])
	}
	if (isInputElement(element) && (element.type === "checkbox" || element.type === "radio")) {
		return JSON.stringify([element.type, element.name, element.value, formOf(element)])
	}
	return null
}

// The control's `form` attribute, or null when it names the form the control is already in.
function formOf(control: Element): string | null {
	const form = control.getAttribute("form")
	return form && form === control.closest("form")?.id ? null : form
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
		if (namespaceURI !== null || (name !== "morphlex-dirty" && !ignored.includes(name))) {
			attributes.push([namespaceURI, localName, value])
		}
	}
	return JSON.stringify(attributes.sort((a, b) => (`${a[0]} ${a[1]}` < `${b[0]} ${b[1]}` ? -1 : 1)))
}

// Whether the elements have the same attributes, ignoring `morphlex-dirty` and any `ignored` names.
function hasSameAttributes(from: Element, to: Element, ignored: ReadonlyArray<string> = []): boolean {
	let count = 0
	const attributes = to.attributes
	for (let i = 0; i < attributes.length; i++) {
		const { namespaceURI, name, localName, value } = attributes[i]!
		if (namespaceURI === null && ignored.includes(name)) continue
		if (from.getAttributeNS(namespaceURI, localName) !== value) return false
		count++
	}
	for (const { namespaceURI, name } of from.attributes) {
		if (namespaceURI !== null || (name !== "morphlex-dirty" && !ignored.includes(name))) count--
	}
	return count === 0
}

// An option the user deselected or moved a select away from, or a radio they moved their group away from. What holds
// it is matched by the picked one first, though the option or radio itself still keeps its own target.
function isLeftChoice(element: Element): boolean {
	if (isOptionElement(element)) return !element.selected
	return isInputElement(element) && element.type === "radio" && !element.checked
}

// What elements equal apart from `morphlex-dirty` have in common: their name, attributes and text.
function shapeOf(element: Element): string {
	const attributes: Array<string> = []
	for (const { namespaceURI, localName, value } of element.attributes) {
		if (namespaceURI !== null || localName !== "morphlex-dirty") attributes.push(JSON.stringify([namespaceURI, localName, value]))
	}
	return JSON.stringify([element.namespaceURI, element.prefix, element.localName, attributes.sort(), element.textContent])
}

// Like `isEqualNode`, but ignores the `morphlex-dirty` flag on the elements in `dirtyElements`.
function isEqualExceptDirty(from: Element, to: Element, dirtyElements: Set<Element>): boolean {
	if (!dirtyElements.has(from)) return isEqualNode(from, to)
	if (from.localName !== to.localName || from.namespaceURI !== to.namespaceURI) return false

	if (!hasSameAttributes(from, to)) return false

	const fromChildNodes = from.childNodes
	const toChildNodes = to.childNodes
	if (fromChildNodes.length !== toChildNodes.length) return false
	for (let i = 0; i < fromChildNodes.length; i++) {
		const fromChild = fromChildNodes[i]!
		const toChild = toChildNodes[i]!
		if (fromChild.nodeType === ELEMENT_NODE_TYPE && toChild.nodeType === ELEMENT_NODE_TYPE) {
			if (!isEqualExceptDirty(fromChild as Element, toChild as Element, dirtyElements)) return false
		} else if (!isEqualNode(fromChild, toChild)) return false
	}

	return true
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

// The `open` attribute on these elements is the live state the user toggles, not a default.
function hasOpenState(element: Element): boolean {
	return isDialogElement(element) || (element.localName === "details" && element.namespaceURI === HTML_NAMESPACE)
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

function isParentNode(node: Node): node is ParentNode {
	return !!IS_PARENT_NODE_TYPE[node.nodeType]
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
