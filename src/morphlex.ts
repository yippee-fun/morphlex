const SUPPORTS_MOVE_BEFORE = "moveBefore" in Element.prototype
const ELEMENT_NODE_TYPE = 1
const TEXT_NODE_TYPE = 3
const TREE_WALKER_SHOW_ELEMENT = 1

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

/**
 * Configuration options for morphing operations.
 */
export interface Options {
	/**
	 * When `true`, preserves modified form inputs during morphing.
	 * This prevents user-entered data from being overwritten.
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
 */
export function morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode> | string, options: Options = {}): void {
	if (typeof to === "string") to = parseFragment(to).childNodes

	if (isParentNode(from)) flagDirtyInputs(from as Element)
	new Morph(options).morph(from, to)
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
		flagDirtyInputs(from as Element)
		new Morph(options).visitChildNodes(from as Element, to as Element)
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

function flagDirtyInputs(node: Element): void {
	if (isInputElement(node)) {
		if (node.value !== node.defaultValue || node.checked !== node.defaultChecked) {
			node.setAttribute("morphlex-dirty", "")
		}
	} else if (isOptionElement(node)) {
		if (node.selected !== node.defaultSelected) {
			node.setAttribute("morphlex-dirty", "")
		}
	} else if (node.localName === "textarea") {
		const textarea = node as HTMLTextAreaElement
		if (textarea.value !== textarea.defaultValue) {
			textarea.setAttribute("morphlex-dirty", "")
		}
	}

	for (const input of node.querySelectorAll("input")) {
		if (input.value !== input.defaultValue || input.checked !== input.defaultChecked) {
			input.setAttribute("morphlex-dirty", "")
		}
	}

	for (const element of node.querySelectorAll("option")) {
		if (element.selected !== element.defaultSelected) {
			element.setAttribute("morphlex-dirty", "")
		}
	}

	for (const element of node.querySelectorAll("textarea")) {
		if (element.value !== element.defaultValue) {
			element.setAttribute("morphlex-dirty", "")
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
	return parser.parseFromString(string.trim(), "text/html")
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

	constructor(options: Options = {}) {
		this.#options = options
	}

	morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode>): void {
		if (isParentNode(from)) {
			this.#mapIdSets(from)
		}

		if (to instanceof NodeList) {
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
			const newNodes = [...to]
			const insertionPoint = from.nextSibling
			const parent = from.parentNode
			this.#morphOneToOne(from, newNodes.shift()!)

			if (!parent) {
				for (let i = 0; i < newNodes.length; i++) {
					this.#options.beforeNodeAdded?.(document, newNodes[i]!, from)
				}
				return
			}

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
		if (from.isEqualNode(to)) return

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

		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(from, to)
		}

		if ("textarea" === from.localName && "textarea" === to.localName) {
			this.#visitTextArea(from as HTMLTextAreaElement, to as HTMLTextAreaElement)
		} else if (from.hasChildNodes() || to.hasChildNodes()) {
			this.visitChildNodes(from, to)
		}

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
		for (const { name, value } of to.attributes) {
			if (name === "value") {
				if (isInputElement(from) && from.value !== value) {
					if (!this.#options.preserveChanges) {
						from.value = value
					}
				}
			}

			if (name === "selected") {
				if (isOptionElement(from) && !from.selected) {
					if (!this.#options.preserveChanges) {
						from.selected = true
					}
				}
			}

			if (name === "checked") {
				if (isInputElement(from) && !from.checked) {
					if (!this.#options.preserveChanges) {
						from.checked = true
					}
				}
			}

			const oldValue = from.getAttribute(name)

			if (oldValue !== value && (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true)) {
				from.setAttribute(name, value)
				this.#options.afterAttributeUpdated?.(from, name, oldValue)
			}
		}

		// Second pass: remove excess attributes
		for (const { name, value } of [...from.attributes]) {
			if (!to.hasAttribute(name)) {
				if (name === "selected") {
					if (isOptionElement(from) && from.selected) {
						if (!this.#options.preserveChanges) {
							from.selected = false
						}
					}
				}

				if (name === "checked") {
					if (isInputElement(from) && from.checked) {
						if (!this.#options.preserveChanges) {
							from.checked = false
						}
					}
				}

				if (this.#options.beforeAttributeUpdated?.(from, name, null) ?? true) {
					from.removeAttribute(name)
					this.#options.afterAttributeUpdated?.(from, name, value)
				}
			}
		}
	}

	#visitTextArea(from: HTMLTextAreaElement, to: HTMLTextAreaElement): void {
		const newTextContent = to.textContent || ""
		const isModified = from.value !== from.defaultValue

		// Update text content (which updates defaultValue)
		if (from.textContent !== newTextContent) {
			from.textContent = newTextContent
		}

		if (this.#options.preserveChanges && isModified) return

		from.value = from.defaultValue
	}

	visitChildNodes(from: Element, to: Element): void {
		if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) return
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

		for (let i = 0; i < fromChildNodes.length; i++) {
			const candidate = fromChildNodes[i]!
			const nodeType = candidate.nodeType
			candidateNodeTypeMap[i] = nodeType

			if (nodeType === ELEMENT_NODE_TYPE) {
				const candidateElement = candidate as Element
				candidateLocalNameMap[i] = candidateElement.localName
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
				unmatchedElementActive[i] = 1
				unmatchedElementIndices.push(i)
			} else if (isWhitespaceTextNode(node)) {
				continue
			} else {
				unmatchedNodeActive[i] = 1
				unmatchedNodeIndices.push(i)
			}
		}

		// Match elements by isEqualNode
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!

			const localName = localNameMap[unmatchedIndex]
			const element = toChildNodes[unmatchedIndex] as Element

			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue
				if (localName !== candidateLocalNameMap[candidateIndex]) continue
				const candidate = fromChildNodes[candidateIndex] as Element

				if (candidate.isEqualNode(element)) {
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

					if (localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex]) {
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

				if (localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex]) {
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

				if (localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex]) {
					const candidateIdSet = this.#idSetMap.get(candidate)
					if (candidateIdSet) {
						for (let i = 0; i < idArray.length; i++) {
							const arrayId = idArray[i]!
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

			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue
				const candidate = fromChildNodes[candidateIndex] as Element

				if (
					localNameMap[unmatchedIndex] === candidateLocalNameMap[candidateIndex] &&
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
		for (let i = 0; i < unmatchedElementIndices.length; i++) {
			const unmatchedIndex = unmatchedElementIndices[i]!
			if (!unmatchedElementActive[unmatchedIndex]) continue

			const element = toChildNodes[unmatchedIndex] as Element

			if (!canSoftMatchByTagName(element, this.#idArrayMap.has(element))) continue

			const localName = localNameMap[unmatchedIndex]

			for (let c = 0; c < candidateElementIndices.length; c++) {
				const candidateIndex = candidateElementIndices[c]!
				if (!candidateElementActive[candidateIndex]) continue

				const candidate = fromChildNodes[candidateIndex] as Element

				if (!canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate))) continue

				const candidateLocalName = candidateLocalNameMap[candidateIndex]

				if (localName === candidateLocalName) {
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
					// this.#morphMatchingElements(match as Element, node as Element)
					this.#morphMatchingElements(match as Element, node as Element)
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

		this.#options.afterChildrenVisited?.(from)
	}

	#replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = node.parentNode

		if (!parent) {
			this.#options.beforeNodeAdded?.(document, newNode, node)
			return
		}

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
	const root = node as Node
	const ownerDocument = root.ownerDocument!

	const walker = ownerDocument.createTreeWalker(root, TREE_WALKER_SHOW_ELEMENT)
	let current = walker.nextNode()

	while (current) {
		const element = current as Element
		if (element.id !== "") callback(element)
		current = walker.nextNode()
	}
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
		const code = value.charCodeAt(i)
		if (code === 32 || code === 9 || code === 10 || code === 13 || code === 12) continue
		if (code <= 127) return false
		return value.trim() === ""
	}

	return true
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

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option"
}

function isParentNode(node: Node): node is ParentNode {
	return !!IS_PARENT_NODE_TYPE[node.nodeType]
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
