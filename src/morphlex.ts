const PARENT_NODE_TYPES = new Set([1, 9, 11])
const SUPPORTS_MOVE_BEFORE = "moveBefore" in Element.prototype

type IdSet = Set<string>
type IdMap = WeakMap<Node, IdSet>

declare const brand: unique symbol
type Branded<T, B extends string> = T & { [brand]: B }

type PairOfNodes<N extends Node> = [N, N]
type PairOfMatchingElements<E extends Element> = Branded<PairOfNodes<E>, "MatchingElementPair">

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

	if (isParentNode(from)) flagDirtyInputs(from)

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

		if (fragment.firstChild && fragment.childNodes.length === 1 && isElement(fragment.firstChild)) {
			to = fragment.firstChild
		} else {
			throw new Error("[Morphlex] The string was not a valid HTML element.")
		}
	}

	const pair: PairOfNodes<Node> = [from, to]
	if (isElementPair(pair) && isMatchingElementPair(pair)) {
		if (isParentNode(from)) flagDirtyInputs(from)
		new Morph(options).visitChildNodes(pair)
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

function flagDirtyInputs(node: ParentNode): void {
	for (const input of node.querySelectorAll("input")) {
		if (!input.name) continue

		if (input.value !== input.defaultValue) {
			input.setAttribute("morphlex-dirty", "")
		}

		if (input.checked !== input.defaultChecked) {
			input.setAttribute("morphlex-dirty", "")
		}
	}

	for (const element of node.querySelectorAll("option")) {
		if (!element.value) continue

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
	template.innerHTML = string.trim()

	return template.content
}

function parseDocument(string: string): Document {
	const parser = new DOMParser()
	return parser.parseFromString(string.trim(), "text/html")
}

function moveBefore(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (node === insertionPoint) return
	if (node.parentNode === parent) {
		if (node.nextSibling === insertionPoint) return
		if (supportsMoveBefore(parent)) {
			parent.moveBefore(node, insertionPoint)
			return
		}
	}

	parent.insertBefore(node, insertionPoint)
}

class Morph {
	readonly #idMap: IdMap = new WeakMap()
	readonly #options: Options

	constructor(options: Options = {}) {
		this.#options = options
	}

	// Find longest increasing subsequence to minimize moves during reordering
	// Returns the indices in the sequence that form the LIS
	#longestIncreasingSubsequence(sequence: Array<number>): Array<number> {
		const n = sequence.length
		if (n === 0) return []

		// smallestEnding[i] = smallest ending value of any increasing subsequence of length i+1
		const smallestEnding: Array<number> = []
		// indices[i] = index in sequence where smallestEnding[i] occurs
		const indices: Array<number> = []
		// prev[i] = previous index in the LIS ending at sequence[i]
		const prev: Array<number> = Array.from({ length: n }, () => -1)

		// Build the LIS by processing each value
		for (let i = 0; i < n; i++) {
			const val = sequence[i]!
			if (val === -1) continue // Skip new nodes (not in original sequence)

			// Binary search: find where this value fits in smallestEnding
			let left = 0
			let right = smallestEnding.length

			while (left < right) {
				const mid = Math.floor((left + right) / 2)
				if (smallestEnding[mid]! < val) left = mid + 1
				else right = mid
			}

			// Link this element to the previous one in the subsequence
			if (left > 0) prev[i] = indices[left - 1]!

			// Either extend the sequence or update an existing position
			if (left === smallestEnding.length) {
				// Extend: this value is larger than all previous endings
				smallestEnding.push(val)
				indices.push(i)
			} else {
				// Update: found a better (smaller) ending for this length
				smallestEnding[left] = val
				indices[left] = i
			}
		}

		// Reconstruct the actual indices that form the LIS
		const result: Array<number> = []
		if (indices.length === 0) return result

		// Walk backwards through prev links to build the LIS
		let curr: number | undefined = indices[indices.length - 1]
		while (curr !== undefined && curr !== -1) {
			result.unshift(curr)
			curr = prev[curr]
		}

		return result
	}

	morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode>): void {
		if (isParentNode(from)) {
			this.#mapIdSets(from)
		}

		if (to instanceof NodeList) {
			this.#mapIdSetsForEach(to)
			this.#morphOneToMany(from, to)
		} else if (isParentNode(to)) {
			this.#mapIdSets(to)
			this.#morphOneToOne(from, to)
		}
	}

	#morphOneToMany(from: ChildNode, to: NodeListOf<ChildNode>): void {
		const length = to.length

		if (length === 0) {
			this.#removeNode(from)
		} else if (length === 1) {
			this.#morphOneToOne(from, to[0]!)
		} else if (length > 1) {
			const newNodes = Array.from(to)
			this.#morphOneToOne(from, newNodes.shift()!)
			const insertionPoint = from.nextSibling
			const parent = from.parentNode || document

			for (const newNode of newNodes) {
				if (this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true) {
					moveBefore(parent, newNode, insertionPoint)
					this.#options.afterNodeAdded?.(newNode)
				}
			}
		}
	}

	#morphOneToOne(from: ChildNode, to: ChildNode): void {
		// Fast path: if nodes are exactly the same object, skip morphing
		if (from === to) return
		if (from.isEqualNode?.(to)) return

		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) return

		const pair: PairOfNodes<ChildNode> = [from, to]

		if (isElementPair(pair)) {
			if (isMatchingElementPair(pair)) {
				this.#morphMatchingElements(pair)
			} else {
				this.#morphNonMatchingElements(pair)
			}
		} else {
			this.#morphOtherNode(pair)
		}

		this.#options.afterNodeVisited?.(from, to)
	}

	#morphMatchingElements(pair: PairOfMatchingElements<Element>): void {
		const [from, to] = pair

		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(pair)
		}

		if (isTextAreaElement(from) && isTextAreaElement(to)) {
			this.#visitTextArea(pair as PairOfMatchingElements<HTMLTextAreaElement>)
		} else if (from.hasChildNodes() || to.hasChildNodes()) {
			this.visitChildNodes(pair)
		}
	}

	#morphNonMatchingElements([from, to]: PairOfNodes<Element>): void {
		this.#replaceNode(from, to)
	}

	#morphOtherNode([from, to]: PairOfNodes<ChildNode>): void {
		if (from.nodeType === to.nodeType && from.nodeValue !== null && to.nodeValue !== null) {
			from.nodeValue = to.nodeValue
		} else {
			this.#replaceNode(from, to)
		}
	}

	#visitAttributes([from, to]: PairOfMatchingElements<Element>): void {
		if (from.hasAttribute("morphlex-dirty")) {
			from.removeAttribute("morphlex-dirty")
		}

		// First pass: update/add attributes from reference (iterate forwards)
		for (const { name, value } of to.attributes) {
			if (name === "value") {
				if (isInputElement(from) && from.value !== value) {
					if (!this.#options.preserveChanges || from.value === from.defaultValue) {
						from.value = value
					}
				}
			}

			if (name === "selected") {
				if (isOptionElement(from) && !from.selected) {
					if (!this.#options.preserveChanges || from.selected === from.defaultSelected) {
						from.selected = true
					}
				}
			}

			if (name === "checked") {
				if (isInputElement(from) && !from.checked) {
					if (!this.#options.preserveChanges || from.checked === from.defaultChecked) {
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

		const fromAttrs = from.attributes

		// Second pass: remove excess attributes (iterate backwards for efficiency)
		for (let i = fromAttrs.length - 1; i >= 0; i--) {
			const { name, value } = fromAttrs[i]!

			if (!to.hasAttribute(name)) {
				if (name === "selected") {
					if (isOptionElement(from) && from.selected) {
						if (!this.#options.preserveChanges || from.selected === from.defaultSelected) {
							from.selected = false
						}
					}
				}

				if (name === "checked") {
					if (isInputElement(from) && from.checked) {
						if (!this.#options.preserveChanges || from.checked === from.defaultChecked) {
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

	#visitTextArea([from, to]: PairOfMatchingElements<HTMLTextAreaElement>): void {
		const newTextContent = to.textContent || ""
		const isModified = from.value !== from.defaultValue

		// Update text content (which updates defaultValue)
		if (from.textContent !== newTextContent) {
			from.textContent = newTextContent
		}

		if (this.#options.preserveChanges && isModified) return

		from.value = from.defaultValue
	}

	visitChildNodes([from, to]: PairOfMatchingElements<Element>): void {
		if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) return
		const parent = from

		const fromChildNodes = Array.from(from.childNodes)
		const toChildNodes = Array.from(to.childNodes)

		const candidateNodes: Set<number> = new Set()
		const candidateElements: Set<number> = new Set()

		const unmatchedNodes: Set<number> = new Set()
		const unmatchedElements: Set<number> = new Set()

		const matches: Array<ChildNode | null> = Array.from({ length: toChildNodes.length }, () => null)

		for (let i = 0; i < fromChildNodes.length; i++) {
			const candidate = fromChildNodes[i]!
			if (isElement(candidate)) candidateElements.add(i)
			else candidateNodes.add(i)
		}

		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			if (isElement(node)) unmatchedElements.add(i)
			else unmatchedNodes.add(i)
		}

		// Match elements by isEqualNode
		for (const i of unmatchedElements) {
			const element = toChildNodes[i] as Element

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex]!
				if (candidate.isEqualNode(element)) {
					matches[i] = candidate
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(i)
					break
				}
			}
		}

		// Match by exact id
		for (const i of unmatchedElements) {
			const element = toChildNodes[i] as Element

			const id = element.id
			if (id === "") continue

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element
				if (element.localName === candidate.localName && id === candidate.id) {
					matches[i] = candidate
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(i)
					break
				}
			}
		}

		// Match by idSet
		for (const i of unmatchedElements) {
			const element = toChildNodes[i] as Element

			const idSet = this.#idMap.get(element)
			if (!idSet) continue

			candidateLoop: for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element
				const candidateIdSet = this.#idMap.get(candidate)
				if (candidateIdSet) {
					for (const id of idSet) {
						if (candidateIdSet.has(id)) {
							matches[i] = candidate
							candidateElements.delete(candidateIndex)
							unmatchedElements.delete(i)
							break candidateLoop
						}
					}
				}
			}
		}

		// Match by heuristics
		for (const i of unmatchedElements) {
			const element = toChildNodes[i] as Element

			const name = element.getAttribute("name")
			const href = element.getAttribute("href")
			const src = element.getAttribute("src")

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element
				if (
					element.localName === candidate.localName &&
					((name && name === candidate.getAttribute("name")) ||
						(href && href === candidate.getAttribute("href")) ||
						(src && src === candidate.getAttribute("src")))
				) {
					matches[i] = candidate
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(i)
					break
				}
			}
		}

		// Match by tagName
		for (const i of unmatchedElements) {
			const element = toChildNodes[i] as Element

			const localName = element.localName

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element
				if (localName === candidate.localName) {
					if (isInputElement(candidate) && isInputElement(element) && candidate.type !== element.type) {
						// Treat inputs with different type as though they are different tags.
						continue
					}
					matches[i] = candidate
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(i)
					break
				}
			}
		}

		// Match nodes by isEqualNode (skip whitespace-only text nodes)
		for (const i of unmatchedNodes) {
			const node = toChildNodes[i]!
			if (isWhitespace(node)) continue

			for (const candidateIndex of candidateNodes) {
				const candidate = fromChildNodes[candidateIndex]!
				if (candidate.isEqualNode(node)) {
					matches[i] = candidate
					candidateNodes.delete(candidateIndex)
					unmatchedNodes.delete(i)
					break
				}
			}
		}

		// Match by nodeType (skip whitespace-only text nodes)
		for (const i of unmatchedNodes) {
			const node = toChildNodes[i]!
			if (isWhitespace(node)) continue

			const nodeType = node.nodeType

			for (const candidateIndex of candidateNodes) {
				const candidate = fromChildNodes[candidateIndex]!
				if (nodeType === candidate.nodeType) {
					matches[i] = candidate
					candidateNodes.delete(candidateIndex)
					unmatchedNodes.delete(i)
					break
				}
			}
		}

		// Remove any unmatched candidates first, before calculating LIS and repositioning
		for (const candidateIndex of candidateNodes) {
			this.#removeNode(fromChildNodes[candidateIndex]!)
		}

		for (const candidateIndex of candidateElements) {
			this.#removeNode(fromChildNodes[candidateIndex]!)
		}

		// Build sequence of current indices for LIS calculation (after removals)
		const fromIndex = new Map<ChildNode, number>()
		Array.from(parent.childNodes).forEach((node, i) => fromIndex.set(node, i))

		const sequence: Array<number> = []
		for (let i = 0; i < matches.length; i++) {
			const match = matches[i]
			if (match && fromIndex.has(match)) {
				sequence.push(fromIndex.get(match)!)
			} else {
				sequence.push(-1) // New node, not in sequence
			}
		}

		// Find LIS - these nodes don't need to move
		const lisIndices = this.#longestIncreasingSubsequence(sequence)
		const shouldNotMove = new Set<number>()
		for (const i of lisIndices) {
			shouldNotMove.add(sequence[i]!)
		}

		let insertionPoint: ChildNode | null = parent.firstChild
		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const match = matches[i]
			if (match) {
				const matchIndex = fromIndex.get(match)!
				if (!shouldNotMove.has(matchIndex)) {
					moveBefore(parent, match, insertionPoint)
				}
				this.#morphOneToOne(match, node)
				insertionPoint = match.nextSibling
			} else {
				if (this.#options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true) {
					moveBefore(parent, node, insertionPoint)
					this.#options.afterNodeAdded?.(node)
					insertionPoint = node.nextSibling
				}
			}
		}

		this.#options.afterChildrenVisited?.(from)
	}

	#replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = node.parentNode || document
		const insertionPoint = node
		// Check if both removal and addition are allowed before starting the replacement
		if (
			(this.#options.beforeNodeRemoved?.(node) ?? true) &&
			(this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true)
		) {
			moveBefore(parent, newNode, insertionPoint)
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

	#mapIdSetsForEach(nodeList: NodeList): void {
		for (const childNode of nodeList) {
			if (isParentNode(childNode)) {
				this.#mapIdSets(childNode)
			}
		}
	}

	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	#mapIdSets(node: ParentNode): void {
		for (const elementWithId of node.querySelectorAll("[id]")) {
			const id = elementWithId.id

			if (id === "") continue

			let currentElement: Element | null = elementWithId

			while (currentElement) {
				const idSet: IdSet | undefined = this.#idMap.get(currentElement)
				if (idSet) idSet.add(id)
				else this.#idMap.set(currentElement, new Set([id]))
				if (currentElement === node) break
				currentElement = currentElement.parentElement
			}
		}
	}
}

function supportsMoveBefore(_node: ParentNode): _node is NodeWithMoveBefore {
	return SUPPORTS_MOVE_BEFORE
}

function isMatchingElementPair(pair: PairOfNodes<Element>): pair is PairOfMatchingElements<Element> {
	const [a, b] = pair
	return a.localName === b.localName
}

function isElementPair(pair: PairOfNodes<Node>): pair is PairOfNodes<Element> {
	const [a, b] = pair
	return isElement(a) && isElement(b)
}

function isElement(node: Node): node is Element {
	return node.nodeType === 1
}

function isInputElement(element: Element): element is HTMLInputElement {
	return element.localName === "input"
}

function isWhitespace(node: ChildNode): boolean {
	return node.nodeType === 3 && node.textContent?.trim() === ""
}

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option"
}

function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
	return element.localName === "textarea"
}

function isParentNode(node: Node): node is ParentNode {
	return PARENT_NODE_TYPES.has(node.nodeType)
}
