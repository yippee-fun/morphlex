const SUPPORTS_MOVE_BEFORE = "moveBefore" in Element.prototype
const ELEMENT_NODE_TYPE = 1
const TEXT_NODE_TYPE = 3
const PARENT_NODE_TYPES = [false, true, false, false, false, false, false, false, false, true, false, true]

const candidateNodes: Set<number> = new Set()
const candidateElements: Set<number> = new Set()
const unmatchedNodes: Set<number> = new Set()
const unmatchedElements: Set<number> = new Set()
const whitespaceNodes: Set<number> = new Set()

type IdMap = WeakMap<Node, Array<string>>

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

	if (!options.preserveChanges && isParentNode(from)) flagDirtyInputs(from)

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
		(from as Element).localName === (to as Element).localName
	) {
		if (isParentNode(from)) flagDirtyInputs(from)
		new Morph(options).visitChildNodes(from as Element, to as Element)
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

function flagDirtyInputs(node: ParentNode): void {
	for (const input of node.querySelectorAll("input")) {
		if ((input.name && input.value !== input.defaultValue) || input.checked !== input.defaultChecked) {
			input.setAttribute("morphlex-dirty", "")
		}
	}

	for (const element of node.querySelectorAll("option")) {
		if (element.value && element.selected !== element.defaultSelected) {
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
		if (SUPPORTS_MOVE_BEFORE) {
			;(parent as NodeWithMoveBefore).moveBefore(node, insertionPoint)
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
	#longestIncreasingSubsequence(sequence: Array<number | undefined>): Array<number> {
		const n = sequence.length
		if (n === 0) return []

		// smallestEnding[i] = smallest ending value of any increasing subsequence of length i+1
		const smallestEnding: Array<number> = []
		// indices[i] = index in sequence where smallestEnding[i] occurs
		const indices: Array<number> = []
		// prev[i] = previous index in the LIS ending at sequence[i]
		const prev: Array<number> = new Array(n)

		// Build the LIS by processing each value
		for (let i = 0; i < n; i++) {
			const val = sequence[i]
			if (val === undefined) continue // Skip new nodes (not in original sequence)

			// Binary search: find where this value fits in smallestEnding
			let left = 0
			let right = smallestEnding.length

			while (left < right) {
				const mid = Math.floor((left + right) / 2)
				if (smallestEnding[mid]! < val) left = mid + 1
				else right = mid
			}

			// Link this element to the previous one in the subsequence
			prev[i] = left > 0 ? indices[left - 1]! : -1

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
			const newNodes = [...to]
			this.#morphOneToOne(from, newNodes.shift()!)
			const insertionPoint = from.nextSibling
			const parent = from.parentNode || document

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
		if (from.isEqualNode?.(to)) return

		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) return

		if (from.nodeType === ELEMENT_NODE_TYPE && to.nodeType === ELEMENT_NODE_TYPE) {
			if ((from as Element).localName === (to as Element).localName) {
				this.#morphMatchingElements(from as Element, to as Element)
			} else {
				this.#morphNonMatchingElements(from as Element, to as Element)
			}
		} else {
			this.#morphOtherNode(from, to)
		}

		this.#options.afterNodeVisited?.(from, to)
	}

	#morphMatchingElements(from: Element, to: Element): void {
		if (from.hasAttributes() || to.hasAttributes()) {
			this.#visitAttributes(from, to)
		}

		if ("textarea" === from.localName && "textarea" === to.localName) {
			this.#visitTextArea(from as HTMLTextAreaElement, to as HTMLTextAreaElement)
		} else if (from.hasChildNodes() || to.hasChildNodes()) {
			this.visitChildNodes(from, to)
		}
	}

	#morphNonMatchingElements(from: Element, to: Element): void {
		this.#replaceNode(from, to)
	}

	#morphOtherNode(from: ChildNode, to: ChildNode): void {
		if (from.nodeType === to.nodeType && from.nodeValue !== null && to.nodeValue !== null) {
			from.nodeValue = to.nodeValue
		} else {
			this.#replaceNode(from, to)
		}
	}

	#visitAttributes(from: Element, to: Element): void {
		if (from.hasAttribute("morphlex-dirty")) {
			from.removeAttribute("morphlex-dirty")
		}

		// First pass: update/add attributes from reference (iterate forwards)
		const toAttributes = to.attributes
		for (let i = 0; i < toAttributes.length; i++) {
			const { name, value } = toAttributes[i]!
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

		const fromChildNodes = [...from.childNodes]
		const toChildNodes = [...to.childNodes]

		candidateNodes.clear()
		candidateElements.clear()
		unmatchedNodes.clear()
		unmatchedElements.clear()
		whitespaceNodes.clear()

		const seq: Array<number | undefined> = []
		const matches: Array<number | undefined> = []

		for (let i = 0; i < fromChildNodes.length; i++) {
			const candidate = fromChildNodes[i]!
			const nodeType = candidate.nodeType

			if (nodeType === ELEMENT_NODE_TYPE) {
				candidateElements.add(i)
			} else if (nodeType === TEXT_NODE_TYPE && candidate.textContent?.trim() === "") {
				whitespaceNodes.add(i)
			} else {
				candidateNodes.add(i)
			}
		}

		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const nodeType = node.nodeType

			if (nodeType === ELEMENT_NODE_TYPE) {
				unmatchedElements.add(i)
			} else if (nodeType === TEXT_NODE_TYPE && node.textContent?.trim() === "") {
				continue
			} else {
				unmatchedNodes.add(i)
			}
		}

		// Match elements by isEqualNode
		for (const unmatchedIndex of unmatchedElements) {
			const element = toChildNodes[unmatchedIndex] as Element

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element

				if (candidate.isEqualNode(element)) {
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(unmatchedIndex)
					break
				}
			}
		}

		// Match by exact id or idSet
		for (const unmatchedIndex of unmatchedElements) {
			const element = toChildNodes[unmatchedIndex] as Element

			const id = element.id
			const idSet = this.#idMap.get(element)

			if (id === "" && !idSet) continue

			candidateLoop: for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element

				// Match by exact id
				if (id !== "" && element.localName === candidate.localName && id === candidate.id) {
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(unmatchedIndex)
					break candidateLoop
				}

				// Match by idSet
				if (idSet) {
					const candidateIdSet = this.#idMap.get(candidate)
					if (candidateIdSet) {
						for (let i = 0; i < idSet.length; i++) {
							const setId = idSet[i]!
							for (let k = 0; k < candidateIdSet.length; k++) {
								if (candidateIdSet[k] === setId) {
									matches[unmatchedIndex] = candidateIndex
									seq[candidateIndex] = unmatchedIndex
									candidateElements.delete(candidateIndex)
									unmatchedElements.delete(unmatchedIndex)
									break candidateLoop
								}
							}
						}
					}
				}
			}
		}

		// Match by heuristics
		for (const unmatchedIndex of unmatchedElements) {
			const element = toChildNodes[unmatchedIndex] as Element

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
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(unmatchedIndex)
					break
				}
			}
		}

		// Match by tagName
		for (const unmatchedIndex of unmatchedElements) {
			const element = toChildNodes[unmatchedIndex] as Element

			const localName = element.localName

			for (const candidateIndex of candidateElements) {
				const candidate = fromChildNodes[candidateIndex] as Element
				if (localName === candidate.localName) {
					if (isInputElement(candidate) && isInputElement(element) && candidate.type !== element.type) {
						// Treat inputs with different type as though they are different tags.
						continue
					}
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateElements.delete(candidateIndex)
					unmatchedElements.delete(unmatchedIndex)
					break
				}
			}
		}

		// Match nodes by isEqualNode (skip whitespace-only text nodes)
		for (const unmatchedIndex of unmatchedNodes) {
			const node = toChildNodes[unmatchedIndex]!

			for (const candidateIndex of candidateNodes) {
				const candidate = fromChildNodes[candidateIndex]!
				if (candidate.isEqualNode(node)) {
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateNodes.delete(candidateIndex)
					unmatchedNodes.delete(unmatchedIndex)
					break
				}
			}
		}

		// Match by nodeType
		for (const unmatchedIndex of unmatchedNodes) {
			const node = toChildNodes[unmatchedIndex]!

			const nodeType = node.nodeType

			for (const candidateIndex of candidateNodes) {
				const candidate = fromChildNodes[candidateIndex]!
				if (nodeType === candidate.nodeType) {
					matches[unmatchedIndex] = candidateIndex
					seq[candidateIndex] = unmatchedIndex
					candidateNodes.delete(candidateIndex)
					unmatchedNodes.delete(unmatchedIndex)
					break
				}
			}
		}

		// Remove any unmatched candidates first, before calculating LIS and repositioning
		for (const i of candidateNodes) this.#removeNode(fromChildNodes[i]!)
		for (const i of whitespaceNodes) this.#removeNode(fromChildNodes[i]!)
		for (const i of candidateElements) this.#removeNode(fromChildNodes[i]!)

		// Find LIS - these nodes don't need to move
		// matches already contains the fromChildNodes indices, so we can use it directly
		const lisIndices = this.#longestIncreasingSubsequence(matches)

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

				if (!shouldNotMove[matchInd]) {
					moveBefore(parent, match, insertionPoint)
				}
				this.#morphOneToOne(match, node)
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
		const parent = node.parentNode || document
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

	#mapIdSetsForEach(nodeList: NodeList): void {
		for (const childNode of nodeList) {
			if (isParentNode(childNode)) {
				this.#mapIdSets(childNode)
			}
		}
	}

	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	#mapIdSets(node: ParentNode): void {
		const idMap = this.#idMap

		for (const element of node.querySelectorAll("[id]")) {
			const id = element.id

			if (id === "") continue

			let currentElement: Element | null = element

			while (currentElement) {
				const idSet: Array<string> | undefined = idMap.get(currentElement)
				if (idSet) idSet.push(id)
				else idMap.set(currentElement, [id])
				if (currentElement === node) break
				currentElement = currentElement.parentElement
			}
		}
	}
}

function isInputElement(element: Element): element is HTMLInputElement {
	return element.localName === "input"
}

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option"
}

function isParentNode(node: Node): node is ParentNode {
	return !!PARENT_NODE_TYPES[node.nodeType]
}
