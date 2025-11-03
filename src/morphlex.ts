const ParentNodeTypes = new Set([1, 9, 11])

type IdSet = Set<string>
type IdMap = WeakMap<Node, IdSet>

declare const brand: unique symbol
type Branded<T, B extends string> = T & { [brand]: B }

type PairOfNodes<N extends Node> = [N, N]
type PairOfMatchingElements<E extends Element> = Branded<PairOfNodes<E>, "MatchingElementPair">

interface Options {
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

export function morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode> | string, options: Options = {}): void {
	if (typeof to === "string") to = parseString(to).childNodes
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
		new Morph(options).morphChildren(pair)
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

function parseString(string: string): DocumentFragment {
	const template = document.createElement("template")
	template.innerHTML = string.trim()

	return template.content
}

function moveBefore(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (node === insertionPoint) return
	if (node.parentNode === parent && node.nextSibling === insertionPoint) return

	// Use moveBefore when available and the node is already in the same parent
	if ("moveBefore" in parent && typeof parent.moveBefore === "function" && node.parentNode === parent) {
		parent.moveBefore(node, insertionPoint)
	} else {
		parent.insertBefore(node, insertionPoint)
	}
}

class Morph {
	private readonly idMap: IdMap = new WeakMap()
	private readonly options: Options

	constructor(options: Options = {}) {
		this.options = options
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
		if (from.isSameNode?.(to)) return
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
		this.visitAttributes(pair)
		this.morphChildren(pair)
	}

	private morphNonMatchingElements([from, to]: PairOfNodes<Element>): void {
		this.replaceNode(from, to)
	}

	private morphOtherNode([from, to]: PairOfNodes<ChildNode>): void {
		// TODO: Improve this logic
		// Handle text nodes, comments, and CDATA sections.
		if (from.nodeType === to.nodeType && from.nodeValue !== null && to.nodeValue !== null) {
			from.nodeValue = to.nodeValue
		} else {
			this.replaceNode(from, to)
		}
	}

	private visitAttributes([from, to]: PairOfMatchingElements<Element>): void {
		const isInput = isInputElement(from) && isInputElement(to)
		const isOption = isInput ? false : isOptionElement(from)

		const toAttrs = to.attributes
		const fromAttrs = from.attributes

		// First pass: update/add attributes from reference (iterate forwards)
		for (let i = 0; i < toAttrs.length; i++) {
			const attr = toAttrs[i]!
			const name = attr.name
			const value = attr.value
			const oldValue = from.getAttribute(name)

			if (isInput && (name === "value" || name === "checked" || name === "indeterminate")) continue
			if (isOption && name === "selected") continue

			if (oldValue !== value && (this.options.beforeAttributeUpdated?.(from, name, value) ?? true)) {
				from.setAttribute(name, value)

				if (isInput && name === "disabled" && from.disabled !== to.disabled) {
					from.disabled = to.disabled
				}

				this.options.afterAttributeUpdated?.(from, name, oldValue)
			}
		}

		// Second pass: remove excess attributes (iterate backwards for efficiency)
		for (let i = fromAttrs.length - 1; i >= 0; i--) {
			const attr = fromAttrs[i]!
			const name = attr.name
			const value = attr.value

			if (!to.hasAttribute(name) && (this.options.beforeAttributeUpdated?.(from, name, null) ?? true)) {
				from.removeAttribute(name)
				this.options.afterAttributeUpdated?.(from, name, value)
			}
		}
	}

	morphChildren(pair: PairOfMatchingElements<Element>): void {
		const [node, reference] = pair
		if (!(this.options.beforeChildrenVisited?.(node) ?? true)) return

		if (isHeadElement(node)) {
			this.morphHeadChildren(pair as PairOfMatchingElements<HTMLHeadElement>)
		} else if (node.hasChildNodes() || reference.hasChildNodes()) {
			this.morphChildNodes(pair)
		}

		this.options.afterChildrenVisited?.(node)
	}

	// TODO: Review this.
	private morphHeadChildren([node, reference]: PairOfMatchingElements<HTMLHeadElement>): void {
		const refChildNodesMap: Map<string, Element> = new Map()

		// Generate a map of the reference head element’s child nodes, keyed by their outerHTML.
		const referenceChildrenLength = reference.children.length
		for (let i = 0; i < referenceChildrenLength; i++) {
			const child = reference.children[i]!
			refChildNodesMap.set(child.outerHTML, child)
		}

		// Iterate backwards to safely remove children without affecting indices
		for (let i = node.children.length - 1; i >= 0; i--) {
			const child = node.children[i]!
			const key = child.outerHTML
			const refChild = refChildNodesMap.get(key)

			// If the child is in the reference map already, we don't need to add it later.
			// If it's not in the map, we need to remove it from the node.
			if (refChild) refChildNodesMap.delete(key)
			else this.removeNode(child)
		}

		// Any remaining nodes in the map should be appended to the head.
		for (const refChild of refChildNodesMap.values()) this.appendChild(node, refChild)
	}

	private morphChildNodes([from, to]: PairOfMatchingElements<Element>): void {
		const parent = from

		const fromChildNodes = from.childNodes
		const toChildNodes = Array.from(to.childNodes)

		const candidates: Set<ChildNode> = new Set(fromChildNodes)
		const unmatched: Set<ChildNode> = new Set(toChildNodes)

		const matches: Map<ChildNode, ChildNode> = new Map()

		// Match by isEqualNode
		for (const node of unmatched) {
			for (const candidate of candidates) {
				if (candidate.isEqualNode(node)) {
					matches.set(node, candidate)
					unmatched.delete(node)
					candidates.delete(candidate)
					break
				}
			}
		}

		// Match by exact id
		for (const node of unmatched) {
			if (!isElement(node)) continue
			const id = node.id
			if (id === "") continue

			for (const candidate of candidates) {
				if (isElement(candidate) && node.localName === candidate.localName && id === candidate.id) {
					matches.set(node, candidate)
					unmatched.delete(node)
					candidates.delete(candidate)
					break
				}
			}
		}

		// Match by idSet
		for (const node of unmatched) {
			if (!isElement(node)) continue
			const idSet = this.idMap.get(node)
			if (!idSet) continue
			const idSetArray = [...idSet]

			for (const candidate of candidates) {
				if (isElement(candidate)) {
					const candidateIdSet = this.idMap.get(candidate)
					if (candidateIdSet && idSetArray.some((id) => candidateIdSet.has(id))) {
						matches.set(node, candidate)
						unmatched.delete(node)
						candidates.delete(candidate)
						break
					}
				}
			}
		}

		// Match by huristics
		for (const node of unmatched) {
			if (!isElement(node)) continue
			const className = node.className
			const name = node.getAttribute("name")
			const ariaLabel = node.getAttribute("aria-label")
			const ariaDescription = node.getAttribute("aria-description")
			const href = node.getAttribute("href")

			for (const candidate of candidates) {
				if (
					isElement(candidate) &&
					node.localName === candidate.localName &&
					((className !== "" && className === candidate.className) ||
						(name !== "" && name === candidate.getAttribute("name")) ||
						(ariaLabel !== "" && ariaLabel === candidate.getAttribute("aria-label")) ||
						(ariaDescription !== "" && ariaDescription === candidate.getAttribute("aria-description")) ||
						(href !== "" && href === candidate.getAttribute("href")))
				) {
					matches.set(node, candidate)
					unmatched.delete(node)
					candidates.delete(candidate)
					break
				}
			}
		}

		// Match by nodeType
		for (const node of unmatched) {
			const nodeType = node.nodeType

			if (isElement(node)) {
				const localName = node.localName

				for (const candidate of candidates) {
					if (isElement(candidate) && localName === candidate.localName) {
						if (isInputElement(candidate) && isInputElement(node) && candidate.type !== node.type) {
							// Treat inputs with different type as though they are different tags.
							continue
						}
						matches.set(node, candidate)
						unmatched.delete(node)
						candidates.delete(candidate)
						break
					}
				}
			} else {
				for (const candidate of candidates) {
					if (nodeType === candidate.nodeType) {
						matches.set(node, candidate)
						unmatched.delete(node)
						candidates.delete(candidate)
						break
					}
				}
			}
		}

		// Process nodes in forward order to maintain proper positioning
		let insertionPoint: ChildNode | null = parent.firstChild
		for (let i = 0; i < toChildNodes.length; i++) {
			const node = toChildNodes[i]!
			const match = matches.get(node)
			if (match) {
				moveBefore(parent, match, insertionPoint)
				this.morphOneToOne(match, node)
				insertionPoint = match.nextSibling
				// Skip over any nodes that will be removed to avoid unnecessary moves
				while (insertionPoint && candidates.has(insertionPoint)) {
					insertionPoint = insertionPoint.nextSibling
				}
			} else {
				if (this.options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true) {
					moveBefore(parent, node, insertionPoint)
					this.options.afterNodeAdded?.(node)
					insertionPoint = node.nextSibling
					// Skip over any nodes that will be removed to avoid unnecessary moves
					while (insertionPoint && candidates.has(insertionPoint)) {
						insertionPoint = insertionPoint.nextSibling
					}
				}
			}
		}

		// Remove any remaining unmatched candidates
		for (const candidate of candidates) {
			this.removeNode(candidate)
		}
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

	private appendChild(parent: ParentNode, newChild: ChildNode): void {
		const insertionPoint = null
		if (this.options.beforeNodeAdded?.(parent, newChild, insertionPoint) ?? true) {
			moveBefore(parent, newChild, insertionPoint)
			this.options.afterNodeAdded?.(newChild)
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

function isHeadElement(element: Element): element is HTMLHeadElement {
	return element.localName === "head"
}

function isParentNode(node: Node): node is ParentNode {
	return ParentNodeTypes.has(node.nodeType)
}
