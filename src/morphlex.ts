const SupportsMoveBefore = "moveBefore" in Element.prototype
const ParentNodeTypes = new Set([1, 9, 11])

type IdSet = Set<string>
type IdMap = WeakMap<Node, IdSet>

declare const brand: unique symbol
type Branded<T, B extends string> = T & { [brand]: B }

type PairOfNodes<N extends Node> = [N, N]
type PairOfMatchingElements<E extends Element> = Branded<PairOfNodes<E>, "MatchingElementPair">

interface Options {
	preserveModified?: boolean
	beforeNodeVisited?: (fromNode: Node, toNode: Node) => boolean
	afterNodeVisited?: (fromNode: Node, toNode: Node) => void
	beforeNodeAdded?: (parent: ParentNode, node: Node, insertionPoint: ChildNode | null) => boolean
	afterNodeAdded?: (node: Node) => void
	beforeNodeRemoved?: (node: Node) => boolean
	afterNodeRemoved?: (node: Node) => void
	beforeAttributeUpdated?: (element: Element, attributeName: string, newValue: string | null) => boolean
	afterAttributeUpdated?: (element: Element, attributeName: string, previousValue: string | null) => void
	beforeChildrenVisited?: (parent: ParentNode) => boolean
	afterChildrenVisited?: (parent: ParentNode) => void
}

type NodeWithMoveBefore = ParentNode & {
	moveBefore: (node: ChildNode, before: ChildNode | null) => void
}

export function morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode> | string, options: Options = {}): void {
	if (typeof to === "string") to = parseString(to).childNodes

	if (isParentNode(from)) flagDirtyInputs(from)

	new Morph(options).morph(from, to)
}

export function morphInner(from: ChildNode, to: ChildNode | string, options: Options = {}): void {
	if (typeof to === "string") {
		const fragment = parseString(to)

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
	for (const element of node.querySelectorAll("input")) {
		if (element.value !== element.defaultValue) {
			element.setAttribute("morphlex-dirty", "")
		}

		if (element.checked !== element.defaultChecked) {
			element.setAttribute("morphlex-dirty", "")
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

function parseString(string: string): DocumentFragment {
	const template = document.createElement("template")
	template.innerHTML = string.trim()

	return template.content
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
	private readonly idMap: IdMap = new WeakMap()
	private readonly options: Options

	constructor(options: Options = {}) {
		this.options = options
	}

	// Find longest increasing subsequence to minimize moves during reordering
	// Returns the indices in the sequence that form the LIS
	private longestIncreasingSubsequence(sequence: Array<number>): Array<number> {
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
			this.mapIdSets(from)
		}

		if (to instanceof NodeList) {
			this.mapIdSetsForEach(to)
			this.morphOneToMany(from, to)
		} else if (isParentNode(to)) {
			this.mapIdSets(to)
			this.morphOneToOne(from, to)
		}
	}

	private morphOneToMany(from: ChildNode, to: NodeListOf<ChildNode>): void {
		const length = to.length

		if (length === 0) {
			this.removeNode(from)
		} else if (length === 1) {
			this.morphOneToOne(from, to[0]!)
		} else if (length > 1) {
			const newNodes = Array.from(to)
			this.morphOneToOne(from, newNodes.shift()!)
			const insertionPoint = from.nextSibling
			const parent = from.parentNode || document

			for (const newNode of newNodes) {
				if (this.options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true) {
					moveBefore(parent, newNode, insertionPoint)
					this.options.afterNodeAdded?.(newNode)
				}
			}
		}
	}

	private morphOneToOne(from: ChildNode, to: ChildNode): void {
		// Fast path: if nodes are exactly the same object, skip morphing
		if (from === to) return
		if (from.isEqualNode?.(to)) return

		if (!(this.options.beforeNodeVisited?.(from, to) ?? true)) return

		const pair: PairOfNodes<ChildNode> = [from, to]

		if (isElementPair(pair)) {
			if (isMatchingElementPair(pair)) {
				this.morphMatchingElements(pair)
			} else {
				this.morphNonMatchingElements(pair)
			}
		} else {
			this.morphOtherNode(pair)
		}

		this.options.afterNodeVisited?.(from, to)
	}

	private morphMatchingElements(pair: PairOfMatchingElements<Element>): void {
		const [from, to] = pair

		if (from.hasAttributes() || to.hasAttributes()) {
			this.visitAttributes(pair)
		}

		if (isTextAreaElement(from) && isTextAreaElement(to)) {
			this.visitTextArea(pair as PairOfMatchingElements<HTMLTextAreaElement>)
		} else if (from.hasChildNodes() || to.hasChildNodes()) {
			this.visitChildNodes(pair)
		}
	}

	private morphNonMatchingElements([from, to]: PairOfNodes<Element>): void {
		this.replaceNode(from, to)
	}

	private morphOtherNode([from, to]: PairOfNodes<ChildNode>): void {
		if (from.nodeType === to.nodeType && from.nodeValue !== null && to.nodeValue !== null) {
			from.nodeValue = to.nodeValue
		} else {
			this.replaceNode(from, to)
		}
	}

	private visitAttributes([from, to]: PairOfMatchingElements<Element>): void {
		if (from.hasAttribute("morphlex-dirty")) {
			from.removeAttribute("morphlex-dirty")
		}

		// First pass: update/add attributes from reference (iterate forwards)
		for (const { name, value } of to.attributes) {
			if (name === "value") {
				if (isInputElement(from) && from.value !== value) {
					if (!this.options.preserveModified || from.value === from.defaultValue) {
						from.value = value
					}
				}
			}

			if (name === "selected") {
				if (isOptionElement(from) && !from.selected) {
					if (!this.options.preserveModified || from.selected === from.defaultSelected) {
						from.selected = true
					}
				}
			}

			if (name === "checked") {
				if (isInputElement(from) && !from.checked) {
					if (!this.options.preserveModified || from.checked === from.defaultChecked) {
						from.checked = true
					}
				}
			}

			const oldValue = from.getAttribute(name)

			if (oldValue !== value && (this.options.beforeAttributeUpdated?.(from, name, value) ?? true)) {
				from.setAttribute(name, value)
				this.options.afterAttributeUpdated?.(from, name, oldValue)
			}
		}

		const fromAttrs = from.attributes

		// Second pass: remove excess attributes (iterate backwards for efficiency)
		for (let i = fromAttrs.length - 1; i >= 0; i--) {
			const { name, value } = fromAttrs[i]!

			if (!to.hasAttribute(name)) {
				if (name === "selected") {
					if (isOptionElement(from) && from.selected) {
						if (!this.options.preserveModified || from.selected === from.defaultSelected) {
							from.selected = false
						}
					}
				}

				if (name === "checked") {
					if (isInputElement(from) && from.checked) {
						if (!this.options.preserveModified || from.checked === from.defaultChecked) {
							from.checked = false
						}
					}
				}

				if (this.options.beforeAttributeUpdated?.(from, name, null) ?? true) {
					from.removeAttribute(name)
					this.options.afterAttributeUpdated?.(from, name, value)
				}
			}
		}
	}

	private visitTextArea([from, to]: PairOfMatchingElements<HTMLTextAreaElement>): void {
		const newTextContent = to.textContent || ""
		const isModified = from.value !== from.defaultValue

		// Update text content (which updates defaultValue)
		if (from.textContent !== newTextContent) {
			from.textContent = newTextContent
		}

		if (this.options.preserveModified && isModified) return

		from.value = from.defaultValue
	}

	visitChildNodes([from, to]: PairOfMatchingElements<Element>): void {
		if (!(this.options.beforeChildrenVisited?.(from) ?? true)) return
		const parent = from

		const fromChildNodes = from.childNodes
		const toChildNodes = Array.from(to.childNodes)

		const candidateNodes: Set<ChildNode> = new Set()
		const candidateElements: Set<Element> = new Set()

		const matches: Array<ChildNode | null> = Array.from({ length: toChildNodes.length }, () => null)

		for (const candidate of fromChildNodes) {
			if (isElement(candidate)) candidateElements.add(candidate)
			else candidateNodes.add(candidate)
		}

		// Match elements by isEqualNode
		for (let i = 0; i < toChildNodes.length; i++) {
			const element = toChildNodes[i]!
			if (!isElement(element)) continue

			for (const candidate of candidateElements) {
				if (candidate.isEqualNode(element)) {
					matches[i] = candidate
					candidateElements.delete(candidate)
					break
				}
			}
		}

		// Match by exact id
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const element = toChildNodes[i]!
			if (!isElement(element)) continue

			const id = element.id
			if (id === "") continue

			for (const candidate of candidateElements) {
				if (element.localName === candidate.localName && id === candidate.id) {
					matches[i] = candidate
					candidateElements.delete(candidate)
					break
				}
			}
		}

		// Match by idSet
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const element = toChildNodes[i]!
			if (!isElement(element)) continue

			const idSet = this.idMap.get(element)
			if (!idSet) continue

			candidateLoop: for (const candidate of candidateElements) {
				if (isElement(candidate)) {
					const candidateIdSet = this.idMap.get(candidate)
					if (candidateIdSet) {
						for (const id of idSet) {
							if (candidateIdSet.has(id)) {
								matches[i] = candidate
								candidateElements.delete(candidate)
								break candidateLoop
							}
						}
					}
				}
			}
		}

		// Match by heuristics
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const element = toChildNodes[i]!
			if (!isElement(element)) continue

			const name = element.getAttribute("name")
			const href = element.getAttribute("href")
			const src = element.getAttribute("src")

			for (const candidate of candidateElements) {
				if (
					isElement(candidate) &&
					element.localName === candidate.localName &&
					((name !== "" && name === candidate.getAttribute("name")) ||
						(href !== "" && href === candidate.getAttribute("href")) ||
						(src !== "" && src === candidate.getAttribute("src")))
				) {
					matches[i] = candidate
					candidateElements.delete(candidate)
					break
				}
			}
		}

		// Match by tagName
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const element = toChildNodes[i]!
			if (!isElement(element)) continue

			const localName = element.localName

			for (const candidate of candidateElements) {
				if (localName === candidate.localName) {
					if (isInputElement(candidate) && isInputElement(element) && candidate.type !== element.type) {
						// Treat inputs with different type as though they are different tags.
						continue
					}
					matches[i] = candidate
					candidateElements.delete(candidate)
					break
				}
			}
		}

		// Match nodes by isEqualNode
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const node = toChildNodes[i]!
			if (isElement(node)) continue

			for (const candidate of candidateNodes) {
				if (candidate.isEqualNode(node)) {
					matches[i] = candidate
					candidateNodes.delete(candidate)
					break
				}
			}
		}

		// Match by nodeType
		for (let i = 0; i < toChildNodes.length; i++) {
			if (matches[i]) continue
			const node = toChildNodes[i]!
			if (isElement(node)) continue

			const nodeType = node.nodeType

			for (const candidate of candidateNodes) {
				if (nodeType === candidate.nodeType) {
					matches[i] = candidate
					candidateNodes.delete(candidate)
					break
				}
			}
		}

		// Build sequence of current indices for LIS calculation
		const fromIndex = new Map<ChildNode, number>()
		Array.from(fromChildNodes).forEach((node, i) => fromIndex.set(node, i))

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
		const lisIndices = this.longestIncreasingSubsequence(sequence)
		const shouldNotMove = new Set<number>()
		for (const idx of lisIndices) {
			shouldNotMove.add(sequence[idx]!)
		}

		// Process nodes in forward order to maintain proper positioning
		let insertionPoint: ChildNode | null = parent.firstChild
		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const match = matches[i]
			if (match) {
				const matchIndex = fromIndex.get(match)!
				// Only move if not in LIS
				if (!shouldNotMove.has(matchIndex)) {
					moveBefore(parent, match, insertionPoint)
				}
				this.morphOneToOne(match, node)
				insertionPoint = match.nextSibling
				// Skip over any nodes that will be removed to avoid unnecessary moves
				while (
					insertionPoint &&
					(candidateNodes.has(insertionPoint) || (isElement(insertionPoint) && candidateElements.has(insertionPoint)))
				) {
					insertionPoint = insertionPoint.nextSibling
				}
			} else {
				if (this.options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true) {
					moveBefore(parent, node, insertionPoint)
					this.options.afterNodeAdded?.(node)
					insertionPoint = node.nextSibling
					// Skip over any nodes that will be removed to avoid unnecessary moves
					while (
						insertionPoint &&
						(candidateNodes.has(insertionPoint) || (isElement(insertionPoint) && candidateElements.has(insertionPoint)))
					) {
						insertionPoint = insertionPoint.nextSibling
					}
				}
			}
		}

		// Remove any remaining unmatched candidates
		for (const candidate of candidateNodes) {
			this.removeNode(candidate)
		}

		for (const candidate of candidateElements) {
			this.removeNode(candidate)
		}

		this.options.afterChildrenVisited?.(from)
	}

	private replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = node.parentNode || document
		const insertionPoint = node
		if (this.options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true) {
			moveBefore(parent, newNode, insertionPoint)
			this.options.afterNodeAdded?.(newNode)
			this.removeNode(node)
		}
	}

	private removeNode(node: ChildNode): void {
		if (this.options.beforeNodeRemoved?.(node) ?? true) {
			node.remove()
			this.options.afterNodeRemoved?.(node)
		}
	}

	private mapIdSetsForEach(nodeList: NodeList): void {
		for (const childNode of nodeList) {
			if (isParentNode(childNode)) {
				this.mapIdSets(childNode)
			}
		}
	}

	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	private mapIdSets(node: ParentNode): void {
		for (const elementWithId of node.querySelectorAll("[id]")) {
			const id = elementWithId.id

			if (id === "") continue

			let currentElement: Element | null = elementWithId

			while (currentElement) {
				const idSet: IdSet | undefined = this.idMap.get(currentElement)
				if (idSet) idSet.add(id)
				else this.idMap.set(currentElement, new Set([id]))
				if (currentElement === node) break
				currentElement = currentElement.parentElement
			}
		}
	}
}

function supportsMoveBefore(_node: ParentNode): _node is NodeWithMoveBefore {
	return SupportsMoveBefore
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

function isOptionElement(element: Element): element is HTMLOptionElement {
	return element.localName === "option"
}

function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
	return element.localName === "textarea"
}

function isParentNode(node: Node): node is ParentNode {
	return ParentNodeTypes.has(node.nodeType)
}
