type IdSet = Set<string>
type IdMap = WeakMap<Node, IdSet>

declare const brand: unique symbol
type Branded<T, B extends string> = T & { [brand]: B }

type PairOfNodes<N extends Node> = [N, N]
type PairOfMatchingElements<E extends Element> = Branded<PairOfNodes<E>, "MatchingElementPair">

interface Options {
	ignoreActiveValue?: boolean
	preserveModifiedValues?: boolean
	beforeNodeMorphed?: (node: Node, referenceNode: Node) => boolean
	afterNodeMorphed?: (node: Node, referenceNode: Node) => void
	beforeNodeAdded?: (node: Node) => boolean
	afterNodeAdded?: (node: Node) => void
	beforeNodeRemoved?: (node: Node) => boolean
	afterNodeRemoved?: (node: Node) => void
	beforeAttributeUpdated?: (element: Element, attributeName: string, newValue: string | null) => boolean
	afterAttributeUpdated?: (element: Element, attributeName: string, previousValue: string | null) => void
	beforePropertyUpdated?: (node: Node, propertyName: PropertyKey, newValue: unknown) => boolean
	afterPropertyUpdated?: (node: Node, propertyName: PropertyKey, previousValue: unknown) => void
}

export function morph(node: ChildNode, reference: ChildNode | string, options: Options = {}): void {
	if (typeof reference === "string") reference = parseChildNodeFromString(reference)
	new Morph(options).morph([node, reference])
}

export function morphInner(element: Element, reference: Element | string, options: Options = {}): void {
	if (typeof reference === "string") reference = parseElementFromString(reference)
	new Morph(options).morphInner([element, reference])
}

function parseElementFromString(string: string): Element {
	const node = parseChildNodeFromString(string)

	if (isElement(node)) return node
	else throw new Error("[Morphlex] The string was not a valid HTML element.")
}

function parseChildNodeFromString(string: string): ChildNode {
	const template = document.createElement("template")
	template.innerHTML = string.trim()

	const firstChild = template.content.firstChild
	if (firstChild) return firstChild
	else throw new Error("[Morphlex] The string was not a valid HTML node.")
}

// Feature detection for moveBefore support (cached for performance)

class Morph {
	readonly idMap: IdMap
	readonly options: Options

	constructor(options: Options = {}) {
		this.idMap = new WeakMap()
		this.options = options
	}

	morph(pair: PairOfNodes<ChildNode>): void {
		this.#withAriaBusy(pair[0], () => {
			if (isParentNodePair(pair)) this.#buildMaps(pair)
			this.#morphNode(pair)
		})
	}

	morphInner(pair: PairOfNodes<Element>): void {
		this.#withAriaBusy(pair[0], () => {
			if (isMatchingElementPair(pair)) {
				this.#buildMaps(pair)
				this.#morphMatchingElementContent(pair)
			} else {
				throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
			}
		})
	}

	#withAriaBusy(node: Node, block: () => void): void {
		if (isElement(node)) {
			const originalAriaBusy = node.ariaBusy
			node.ariaBusy = "true"
			block()
			node.ariaBusy = originalAriaBusy
		} else block()
	}

	#buildMaps([node, reference]: PairOfNodes<ParentNode>): void {
		this.#mapIdSets(node)
		this.#mapIdSets(reference)
	}

	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	#mapIdSets(node: ParentNode): void {
		const elementsWithIds = node.querySelectorAll("[id]")

		const elementsWithIdsLength = elementsWithIds.length
		for (let i = 0; i < elementsWithIdsLength; i++) {
			const elementWithId = elementsWithIds[i]
			const id = elementWithId.id

			// Ignore empty IDs
			if (id === "") continue

			let current: Element | null = elementWithId

			while (current) {
				const idSet: IdSet | undefined = this.idMap.get(current)
				if (idSet) idSet.add(id)
				else this.idMap.set(current, new Set([id]))
				if (current === node) break
				current = current.parentElement
			}
		}
	}

	// This is where we actually morph the nodes. The `morph` function (above) exists only to set up the `idMap`.
	#morphNode(pair: PairOfNodes<ChildNode>): void {
		const [node, reference] = pair

		if (isTextNode(node) && isTextNode(reference)) {
			if (node.textContent === reference.textContent) return
		}

		if (isMatchingElementPair(pair)) this.#morphMatchingElementNode(pair)
		else this.#morphOtherNode(pair)
	}

	#morphMatchingElementNode(pair: PairOfMatchingElements<Element>): void {
		const [node, reference] = pair

		if (!(this.options.beforeNodeMorphed?.(node, reference) ?? true)) return

		if (node.hasAttributes() || reference.hasAttributes()) this.#morphAttributes(pair)

		// TODO: Should use a branded pair here.
		this.#morphMatchingElementContent(pair)

		this.options.afterNodeMorphed?.(node, reference)
	}

	#morphOtherNode([node, reference]: PairOfNodes<ChildNode>): void {
		if (!(this.options.beforeNodeMorphed?.(node, reference) ?? true)) return

		if (node.nodeType === reference.nodeType && node.nodeValue !== null && reference.nodeValue !== null) {
			// Handle text nodes, comments, and CDATA sections.
			this.#updateProperty(node, "nodeValue", reference.nodeValue)
		} else this.replaceNode(node, reference.cloneNode(true))

		this.options.afterNodeMorphed?.(node, reference)
	}

	#morphMatchingElementContent(pair: PairOfMatchingElements<Element>): void {
		const [node, reference] = pair

		if (isHeadElement(node)) {
			// We can pass the reference as a head here becuase we know it's the same as the node.
			this.#morphHeadContents(pair as PairOfMatchingElements<HTMLHeadElement>)
		} else if (node.hasChildNodes() || reference.hasChildNodes()) this.#morphChildNodes(pair)
	}

	#morphHeadContents([node, reference]: PairOfMatchingElements<HTMLHeadElement>): void {
		const refChildNodesMap: Map<string, Element> = new Map()

		// Generate a map of the reference head element’s child nodes, keyed by their outerHTML.
		const referenceChildrenLength = reference.children.length
		for (let i = 0; i < referenceChildrenLength; i++) {
			const child = reference.children[i]
			refChildNodesMap.set(child.outerHTML, child)
		}

		// Iterate backwards to safely remove children without affecting indices
		for (let i = node.children.length - 1; i >= 0; i--) {
			const child = node.children[i]
			const key = child.outerHTML
			const refChild = refChildNodesMap.get(key)

			// If the child is in the reference map already, we don't need to add it later.
			// If it's not in the map, we need to remove it from the node.
			if (refChild) refChildNodesMap.delete(key)
			else this.removeNode(child)
		}

		// Any remaining nodes in the map should be appended to the head.
		for (const refChild of refChildNodesMap.values()) this.appendChild(node, refChild.cloneNode(true))
	}

	#morphAttributes([element, reference]: PairOfMatchingElements<Element>): void {
		// Remove any excess attributes from the element that aren’t present in the reference.
		for (const { name, value } of element.attributes) {
			if (!reference.hasAttribute(name) && (this.options.beforeAttributeUpdated?.(element, name, null) ?? true)) {
				element.removeAttribute(name)
				this.options.afterAttributeUpdated?.(element, name, value)
			}
		}

		// Copy attributes from the reference to the element, if they don’t already match.
		for (const { name, value } of reference.attributes) {
			const previousValue = element.getAttribute(name)
			if (previousValue !== value && (this.options.beforeAttributeUpdated?.(element, name, value) ?? true)) {
				element.setAttribute(name, value)
				this.options.afterAttributeUpdated?.(element, name, previousValue)
			}
		}

		// For certain types of elements, we need to do some extra work to ensure
		// the element’s state matches the reference elements’ state.
		if (isInputElement(element) && isInputElement(reference)) {
			this.#updateProperty(element, "checked", reference.checked)
			this.#updateProperty(element, "disabled", reference.disabled)
			this.#updateProperty(element, "indeterminate", reference.indeterminate)
			if (
				element.type !== "file" &&
				!(this.options.ignoreActiveValue && document.activeElement === element) &&
				!(this.options.preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
			) {
				this.#updateProperty(element, "value", reference.value)
			}
		} else if (isOptionElement(element) && isOptionElement(reference)) {
			this.#updateProperty(element, "selected", reference.selected)
		} else if (
			isTextAreaElement(element) &&
			isTextAreaElement(reference) &&
			!(this.options.ignoreActiveValue && document.activeElement === element) &&
			!(this.options.preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
		) {
			this.#updateProperty(element, "value", reference.value)

			const text = element.firstElementChild
			if (text) this.#updateProperty(text, "textContent", reference.value)
		}
	}

	// Iterates over the child nodes of the reference element, morphing the main element’s child nodes to match.
	#morphChildNodes(pair: PairOfMatchingElements<Element>): void {
		const [element, reference] = pair

		const childNodes = element.childNodes
		const refChildNodes = reference.childNodes

		for (let i = 0; i < refChildNodes.length; i++) {
			const child = childNodes[i] as ChildNode | null
			const refChild = refChildNodes[i] as ChildNode | null

			if (child && refChild) {
				const pair: PairOfNodes<ChildNode> = [child, refChild]

				if (isMatchingElementPair(pair)) {
					if (isHeadElement(pair[0])) {
						this.#morphHeadContents(pair as PairOfMatchingElements<HTMLHeadElement>)
					} else {
						this.#morphChildElement(pair, element)
					}
				} else this.#morphOtherNode(pair)
			} else if (refChild) {
				this.appendChild(element, refChild.cloneNode(true))
			}
		}

		// Clean up any excess nodes that may be left over
		while (childNodes.length > refChildNodes.length) {
			const child = element.lastChild
			if (child) this.removeNode(child)
		}
	}

	#morphChildElement([child, reference]: PairOfMatchingElements<Element>, parent: Element): void {
		if (!(this.options.beforeNodeMorphed?.(child, reference) ?? true)) return

		const refIdSet = this.idMap.get(reference)

		// Generate the array in advance of the loop
		const refSetArray = refIdSet ? [...refIdSet] : []

		let currentNode: ChildNode | null = child
		let nextMatchByTagName: ChildNode | null = null

		// Try find a match by idSet, while also looking out for the next best match by tagName.
		while (currentNode) {
			if (isElement(currentNode)) {
				const id = currentNode.id

				if (!nextMatchByTagName && currentNode.localName === reference.localName) {
					nextMatchByTagName = currentNode
				}

				if (id !== "") {
					if (id === reference.id) {
						this.moveBefore(parent, currentNode, child)
						return this.#morphNode([currentNode, reference])
					} else {
						const currentIdSet = this.idMap.get(currentNode)

						if (currentIdSet && refSetArray.some((it) => currentIdSet.has(it))) {
							this.moveBefore(parent, currentNode, child)
							return this.#morphNode([currentNode, reference])
						}
					}
				}
			}

			currentNode = currentNode.nextSibling
		}

		// nextMatchByTagName is always set (at minimum to child itself since they have matching tag names)
		this.moveBefore(parent, nextMatchByTagName!, child)
		this.#morphNode([nextMatchByTagName!, reference])

		this.options.afterNodeMorphed?.(child, reference)
	}

	#updateProperty<N extends Node, P extends keyof N>(node: N, propertyName: P, newValue: N[P]): void {
		const previousValue = node[propertyName]

		if (previousValue !== newValue && (this.options.beforePropertyUpdated?.(node, propertyName, newValue) ?? true)) {
			node[propertyName] = newValue
			this.options.afterPropertyUpdated?.(node, propertyName, previousValue)
		}
	}

	private replaceNode(node: ChildNode, newNode: Node): void {
		if ((this.options.beforeNodeRemoved?.(node) ?? true) && (this.options.beforeNodeAdded?.(newNode) ?? true)) {
			node.replaceWith(newNode)
			this.options.afterNodeAdded?.(newNode)
			this.options.afterNodeRemoved?.(node)
		}
	}

	private moveBefore(parent: ParentNode, node: Node, insertionPoint: ChildNode): void {
		if (node === insertionPoint) return

		if ("moveBefore" in parent && typeof parent.moveBefore === "function") {
			parent.moveBefore(node, insertionPoint)
		} else {
			parent.insertBefore(node, insertionPoint)
		}
	}

	private appendChild(node: ParentNode, newNode: Node): void {
		if (this.options.beforeNodeAdded?.(newNode) ?? true) {
			node.appendChild(newNode)
			this.options.afterNodeAdded?.(newNode)
		}
	}

	private removeNode(node: ChildNode): void {
		if (this.options.beforeNodeRemoved?.(node) ?? true) {
			node.remove()
			this.options.afterNodeRemoved?.(node)
		}
	}
}

const parentNodeTypes = new Set([1, 9, 11])

function isMatchingElementPair(pair: PairOfNodes<Node>): pair is PairOfMatchingElements<Element> {
	const [a, b] = pair
	return isElement(a) && isElement(b) && a.localName === b.localName
}

function isParentNodePair(pair: PairOfNodes<Node>): pair is PairOfNodes<ParentNode> {
	return isParentNode(pair[0]) && isParentNode(pair[1])
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

function isHeadElement(element: Element): element is HTMLHeadElement {
	return element.localName === "head"
}

function isParentNode(node: Node): node is ParentNode {
	return parentNodeTypes.has(node.nodeType)
}

function isTextNode(node: Node): node is Text {
	return node.nodeType === 3
}
