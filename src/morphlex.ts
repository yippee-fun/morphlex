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
	const dirtySelect = select !== null && isDirtySelect(select)
	const selection = select && markupSelectionOf(select)
	const flagged = isParentNode(from) ? flagDirtyInputs(from as Element) : null
	try {
		const morpher = new Morph(options, clobbered, flagged && dirtySelectsOf(from as Element, flagged))
		morpher.morph(from, to)
		if (select) morpher.syncEnclosingSelect(select, selection!, dirtySelect)
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
		const dirtySelect = select !== null && isDirtySelect(select)
		const selection = select && markupSelectionOf(select)
		const flagged = flagDirtyInputs(fromElement)
		const morpher = new Morph(options, clobbered, dirtySelectsOf(fromElement, flagged))
		morpher.visitChildNodes(fromElement, toElement)
		if (select) morpher.syncEnclosingSelect(select, selection!, dirtySelect)
		clearDirtyFlags(flagged)
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
	} else if (node.localName === "textarea") {
		const textarea = node as HTMLTextAreaElement
		if (textarea.value !== textarea.defaultValue) {
			textarea.setAttribute("morphlex-dirty", "")
			flagged.push(textarea)
		}
	}

	for (const input of node.querySelectorAll("input")) {
		if (isDirtyInput(input)) {
			input.setAttribute("morphlex-dirty", "")
			flagged.push(input)
		}
	}

	for (const element of node.querySelectorAll("option")) {
		if (element.namespaceURI !== HTML_NAMESPACE) continue
		optionSelects ??= optionSelectsOf(node)
		if (isDirtyOption(element, optionSelects.get(element), defaultOptions)) {
			element.setAttribute("morphlex-dirty", "")
			flagged.push(element)
		}
	}

	for (const element of node.querySelectorAll("textarea")) {
		if (element.value !== element.defaultValue) {
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

function isDirtySelect(select: HTMLSelectElement): boolean {
	const defaultOptions: DefaultOptionMap = new Map()
	const options = select.options
	for (let i = 0; i < options.length; i++) {
		if (isDirtyOption(options[i]!, select, defaultOptions)) return true
	}
	return false
}

// The options the markup selects, to tell whether a morph inside the select changed them.
function markupSelectionOf(select: HTMLSelectElement): Array<HTMLOptionElement | null> {
	if (!select.multiple) return [defaultOptionOf(select)]
	return Array.from(select.options).filter((option) => option.hasAttribute("selected"))
}

// The selects the user changed, found before morphing moves their options around. Find them from
// the top down, because in happy-dom an option's parent isn't the same object as its select.
function dirtySelectsOf(node: Element, flagged: Array<Element>): Set<Element> | null {
	if (!flagged.some(isOptionElement)) return null

	const selects = new Set<Element>()
	if (isSelectElement(node) && hasDirtyOption(node)) selects.add(node)

	for (const select of node.querySelectorAll("select")) {
		if (isSelectElement(select) && hasDirtyOption(select)) selects.add(select)
	}

	return selects
}

function hasDirtyOption(select: HTMLSelectElement): boolean {
	const options = select.options
	for (let i = 0; i < options.length; i++) {
		if (options[i]!.hasAttribute("morphlex-dirty")) return true
	}
	return false
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

class Morph {
	readonly #idArrayMap: IdArrayMap = new WeakMap()
	readonly #idSetMap: IdSetMap = new WeakMap()
	readonly #options: Options
	readonly #clobbered: Set<Element> | null
	readonly #dirtySelects: Set<Element> | null
	#vetoedOptions: Set<Element> | null = null
	#preserveChanges: boolean

	constructor(options: Options = {}, clobbered: Set<Element> | null = null, dirtySelects: Set<Element> | null = null) {
		this.#options = options
		this.#clobbered = clobbered
		this.#dirtySelects = dirtySelects
		this.#preserveChanges = options.preserveChanges ?? false
	}

	morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode>): void {
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

			const newNodes = [...to]
			const insertionPoint = from.nextSibling
			this.#morphOneToOne(from, newNodes.shift()!)

			for (let i = 0; i < newNodes.length; i++) {
				const newNode = newNodes[i]!
				if (this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true) {
					parent.insertBefore(newNode, insertionPoint)
					this.#options.afterNodeAdded?.(newNode)
				}
			}
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
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) return

		// Discard user changes inside a `morphlex-clobber` element, as if `preserveChanges` were off.
		const preserveChanges = this.#preserveChanges
		if (preserveChanges && this.#clobbered?.has(to)) this.#preserveChanges = false

		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(from, to)
		}

		if ("textarea" === from.localName && "textarea" === to.localName) {
			this.#visitTextArea(from as HTMLTextAreaElement, to as HTMLTextAreaElement)
		} else if (from.hasChildNodes() || to.hasChildNodes() || isTemplateElement(from)) {
			this.visitChildNodes(from, to)
		}

		this.#preserveChanges = preserveChanges
		this.#options.afterNodeVisited?.(from, to)
	}

	#morphNonMatchingElements(from: Element, to: Element): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) return

		this.#replaceNode(from, to)

		this.#options.afterNodeVisited?.(from, to)
	}

	#morphOtherNode(from: ChildNode, to: ChildNode): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) return

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
			const { name, localName, value, namespaceURI } = toAttributes[i]!
			// Adding `open` would open it, but changing the value of an existing one is fine.
			if (name === "open" && namespaceURI === null && this.#preserveChanges && hasOpenState(from) && !from.hasAttribute("open")) {
				continue
			}
			const oldValue = from.getAttributeNS(namespaceURI, localName)

			if (oldValue === value) continue
			if (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true) {
				if (namespaceURI) {
					from.setAttributeNS(namespaceURI, name, value)
				} else {
					from.setAttribute(name, value)
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
		if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) return

		if (isTemplateElement(from) && isTemplateElement(to)) {
			this.#visitTemplateContent(from, to)
			this.#options.afterChildrenVisited?.(from)
			return
		}

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
						(src && src === candidate.getAttribute("src")))
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

				if (localName === candidateLocalName && namespaceURIMap[unmatchedIndex] === candidateNamespaceURIMap[candidateIndex]) {
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

		for (let i = 0; i < whitespaceNodeIndices.length; i++) {
			this.#removeNode(fromChildNodes[whitespaceNodeIndices[i]!]!)
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

		let insertionPoint: ChildNode | null = parent.firstChild
		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const matchInd = matches[i]
			if (matchInd !== undefined) {
				const match = fromChildNodes[matchInd]!
				const operation = op[i]!

				if (!shouldNotMove[matchInd]) {
					moveBefore(parent, match, insertionPoint)
				}

				if (operation === Operation.EqualNode) {
				} else if (operation === Operation.SameElement) {
					// Elements matched by id skip the isEqualNode pass, so check here before visiting them.
					if (!isEqualNode(match, node)) this.#morphMatchingElements(match as Element, node as Element)
				} else {
					this.#morphOneToOne(match, node)
				}

				insertionPoint = match.nextSibling
			} else {
				if (this.#options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true) {
					parent.insertBefore(node, insertionPoint)
					this.#options.afterNodeAdded?.(node)
					insertionPoint = node.nextSibling
				}
			}
		}

		if (isSelectElement(from)) this.#syncDefaultSelection(from)

		this.#options.afterChildrenVisited?.(from)
	}

	// A morph inside a select never visits the select, so sync it afterwards if the morph
	// changed what the markup selects. A vetoed morph changes nothing, so it leaves it alone.
	syncEnclosingSelect(select: HTMLSelectElement, selection: Array<HTMLOptionElement | null>, dirty: boolean): void {
		if (this.#preserveChanges && dirty) return

		const newSelection = markupSelectionOf(select)
		if (newSelection.length === selection.length && newSelection.every((option, i) => option === selection[i])) return

		this.#syncDefaultSelection(select)
	}

	// The browser keeps its selection when options are added or moved, or when the select changes
	// between a drop-down and a list box, so an untouched select can end up showing something
	// other than its markup. Select what the markup selects.
	#syncDefaultSelection(select: HTMLSelectElement): void {
		if (this.#preserveChanges && this.#dirtySelects?.has(select)) return

		const options = select.options
		const vetoed = this.#vetoedOptions
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
	}

	// A vetoed `selected` update leaves the selection alone, like other vetoed form attributes.
	#noteVetoedAttribute(element: Element, name: string): void {
		if (name === "selected" && isOptionElement(element)) (this.#vetoedOptions ??= new Set()).add(element)
	}

	// Template content is replaced wholesale rather than morphed, so no node callbacks fire inside it.
	#visitTemplateContent(from: HTMLTemplateElement, to: HTMLTemplateElement): void {
		if (isEqualNode(from.content, to.content)) return
		from.content.replaceChildren(to.content)
	}

	#replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = node.parentNode
		if (!parent) throw new Error(DETACHED_NODE_ERROR)

		const insertionPoint = node
		// Check if both removal and addition are allowed before starting the replacement
		if (
			(this.#options.beforeNodeRemoved?.(node) ?? true) &&
			(this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true)
		) {
			parent.insertBefore(newNode, insertionPoint)
			this.#options.afterNodeAdded?.(newNode)
			node.remove()
			this.#options.afterNodeRemoved?.(node)
		}
	}

	#removeNode(node: ChildNode): void {
		if (this.#options.beforeNodeRemoved?.(node) ?? true) {
			node.remove()
			this.#options.afterNodeRemoved?.(node)
		}
	}

	#mapIdArraysForEach(nodeList: NodeList): void {
		for (const childNode of nodeList) {
			if (isParentNode(childNode)) {
				this.#mapIdArrays(childNode)
			}
		}
	}

	// For each node with an ID, push that ID into the IdArray on the IdArrayMap, for each of its parent elements.
	#mapIdArrays(node: ParentNode): void {
		const idArrayMap = this.#idArrayMap

		forEachDescendantElementWithId(node, (element) => {
			const id = element.id

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

		forEachDescendantElementWithId(node, (element) => {
			const id = element.id

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

function isInputElement(element: Element): element is HTMLInputElement {
	return element.localName === "input"
}

function canMorphElementInPlace(from: Element, to: Element): boolean {
	if (from.localName !== to.localName) return false
	if (from.namespaceURI !== to.namespaceURI) return false
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

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option"
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
