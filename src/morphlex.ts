// Type declaration for moveBefore API (not yet in TypeScript DOM types)
declare global {
	interface Element {
		moveBefore?(node: Node, child: Node | null): Node
	}
}

type IdSet = Set<string>
type IdMap = WeakMap<ReadonlyNode<Node>, IdSet>

// Maps to a type that can only read properties
type StrongReadonly<T> = { readonly [K in keyof T as T[K] extends Function ? never : K]: T[K] }

declare const brand: unique symbol
type Branded<T, B extends string> = T & { [brand]: B }

type NodeReferencePair<N extends Node> = Readonly<[N, ReadonlyNode<N>]>
type MatchingElementReferencePair<E extends Element> = Branded<NodeReferencePair<E>, "MatchingElementPair">

// Maps a Node to a type limited to read-only properties and methods for that Node
type ReadonlyNode<N extends Node> =
	| N
	| (StrongReadonly<N> & {
			readonly cloneNode: (deep: true) => Node
			readonly childNodes: ReadonlyNodeList<ChildNode>
			readonly querySelectorAll: (query: string) => ReadonlyNodeList<Element>
			readonly parentElement: ReadonlyNode<Element> | null
			readonly hasAttribute: (name: string) => boolean
			readonly hasAttributes: () => boolean
			readonly hasChildNodes: () => boolean
			readonly children: ReadonlyNodeList<Element>
	  })

// Maps a node to a read-only node list of nodes of that type
type ReadonlyNodeList<N extends Node> =
	| NodeListOf<N>
	| {
			[Symbol.iterator](): IterableIterator<ReadonlyNode<N>>
			readonly [index: number]: ReadonlyNode<N>
			readonly length: NodeListOf<N>["length"]
	  }

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
	const parser = new DOMParser()
	const doc = parser.parseFromString(string, "text/html")

	const firstChild = doc.body.firstChild
	if (firstChild) return firstChild
	else throw new Error("[Morphlex] The string was not a valid HTML node.")
}

// Feature detection for moveBefore support (cached for performance)
const supportsMoveBefore = typeof Element !== "undefined" && typeof Element.prototype.moveBefore === "function"

class Morph {
	readonly #idMap: IdMap

	readonly #ignoreActiveValue: boolean
	readonly #preserveModifiedValues: boolean
	readonly #beforeNodeMorphed?: (node: Node, referenceNode: Node) => boolean
	readonly #afterNodeMorphed?: (node: Node, referenceNode: Node) => void
	readonly #beforeNodeAdded?: (node: Node) => boolean
	readonly #afterNodeAdded?: (node: Node) => void
	readonly #beforeNodeRemoved?: (node: Node) => boolean
	readonly #afterNodeRemoved?: (node: Node) => void
	readonly #beforeAttributeUpdated?: (element: Element, attributeName: string, newValue: string | null) => boolean
	readonly #afterAttributeUpdated?: (element: Element, attributeName: string, previousValue: string | null) => void
	readonly #beforePropertyUpdated?: (node: Node, propertyName: PropertyKey, newValue: unknown) => boolean
	readonly #afterPropertyUpdated?: (node: Node, propertyName: PropertyKey, previousValue: unknown) => void

	constructor(options: Options = {}) {
		this.#idMap = new WeakMap()

		this.#ignoreActiveValue = options.ignoreActiveValue || false
		this.#preserveModifiedValues = options.preserveModifiedValues || false
		this.#beforeNodeMorphed = options.beforeNodeMorphed
		this.#afterNodeMorphed = options.afterNodeMorphed
		this.#beforeNodeAdded = options.beforeNodeAdded
		this.#afterNodeAdded = options.afterNodeAdded
		this.#beforeNodeRemoved = options.beforeNodeRemoved
		this.#afterNodeRemoved = options.afterNodeRemoved
		this.#beforeAttributeUpdated = options.beforeAttributeUpdated
		this.#afterAttributeUpdated = options.afterAttributeUpdated
		this.#beforePropertyUpdated = options.beforePropertyUpdated
		this.#afterPropertyUpdated = options.afterPropertyUpdated
	}

	morph(pair: NodeReferencePair<ChildNode>): void {
		this.#withAriaBusy(pair[0], () => {
			if (isParentNodePair(pair)) this.#buildMaps(pair)
			this.#morphNode(pair)
		})
	}

	morphInner(pair: NodeReferencePair<Element>): void {
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

	#buildMaps([node, reference]: NodeReferencePair<ParentNode>): void {
		this.#mapIdSets(node)
		this.#mapIdSets(reference)
	}

	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	#mapIdSets(node: ReadonlyNode<ParentNode>): void {
		const elementsWithIds = node.querySelectorAll("[id]")

		const elementsWithIdsLength = elementsWithIds.length
		for (let i = 0; i < elementsWithIdsLength; i++) {
			const elementWithId = elementsWithIds[i]
			const id = elementWithId.id

			// Ignore empty IDs
			if (id === "") continue

			let current: ReadonlyNode<Element> | null = elementWithId

			while (current) {
				const idSet: IdSet | undefined = this.#idMap.get(current)
				if (idSet) idSet.add(id)
				else this.#idMap.set(current, new Set([id]))
				if (current === node) break
				current = current.parentElement
			}
		}
	}

	// This is where we actually morph the nodes. The `morph` function (above) exists only to set up the `idMap`.
	#morphNode(pair: NodeReferencePair<ChildNode>): void {
		const [node, reference] = pair

		if (node.nodeType === 3 && reference.nodeType === 3) {
			if (node.textContent === reference.textContent) return
		}

		if (isMatchingElementPair(pair)) this.#morphMatchingElementNode(pair)
		else this.#morphOtherNode(pair)
	}

	#morphMatchingElementNode(pair: MatchingElementReferencePair<Element>): void {
		const [node, reference] = pair

		if (!(this.#beforeNodeMorphed?.(node, writableNode(reference)) ?? true)) return

		if (node.hasAttributes() || reference.hasAttributes()) this.#morphAttributes(pair)

		// TODO: Should use a branded pair here.
		this.#morphMatchingElementContent(pair)

		this.#afterNodeMorphed?.(node, writableNode(reference))
	}

	#morphOtherNode([node, reference]: NodeReferencePair<ChildNode>): void {
		if (!(this.#beforeNodeMorphed?.(node, writableNode(reference)) ?? true)) return

		if (node.nodeType === reference.nodeType && node.nodeValue !== null && reference.nodeValue !== null) {
			// Handle text nodes, comments, and CDATA sections.
			this.#updateProperty(node, "nodeValue", reference.nodeValue)
		} else this.#replaceNode(node, reference.cloneNode(true))

		this.#afterNodeMorphed?.(node, writableNode(reference))
	}

	#morphMatchingElementContent(pair: MatchingElementReferencePair<Element>): void {
		const [node, reference] = pair

		if (isHead(node)) {
			// We can pass the reference as a head here becuase we know it's the same as the node.
			this.#morphHeadContents(pair as MatchingElementReferencePair<HTMLHeadElement>)
		} else if (node.hasChildNodes() || reference.hasChildNodes()) this.#morphChildNodes(pair)
	}

	#morphHeadContents([node, reference]: MatchingElementReferencePair<HTMLHeadElement>): void {
		const refChildNodesMap: Map<string, ReadonlyNode<Element>> = new Map()

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
			else this.#removeNode(child)
		}

		// Any remaining nodes in the map should be appended to the head.
		for (const refChild of refChildNodesMap.values()) this.#appendChild(node, refChild.cloneNode(true))
	}

	#morphAttributes([element, reference]: MatchingElementReferencePair<Element>): void {
		// Remove any excess attributes from the element that aren’t present in the reference.
		for (const { name, value } of element.attributes) {
			if (!reference.hasAttribute(name) && (this.#beforeAttributeUpdated?.(element, name, null) ?? true)) {
				element.removeAttribute(name)
				this.#afterAttributeUpdated?.(element, name, value)
			}
		}

		// Copy attributes from the reference to the element, if they don’t already match.
		for (const { name, value } of reference.attributes) {
			const previousValue = element.getAttribute(name)
			if (previousValue !== value && (this.#beforeAttributeUpdated?.(element, name, value) ?? true)) {
				element.setAttribute(name, value)
				this.#afterAttributeUpdated?.(element, name, previousValue)
			}
		}

		// For certain types of elements, we need to do some extra work to ensure
		// the element’s state matches the reference elements’ state.
		if (isInput(element) && isInput(reference)) {
			this.#updateProperty(element, "checked", reference.checked)
			this.#updateProperty(element, "disabled", reference.disabled)
			this.#updateProperty(element, "indeterminate", reference.indeterminate)
			if (
				element.type !== "file" &&
				!(this.#ignoreActiveValue && document.activeElement === element) &&
				!(this.#preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
			) {
				this.#updateProperty(element, "value", reference.value)
			}
		} else if (isOption(element) && isOption(reference)) {
			this.#updateProperty(element, "selected", reference.selected)
		} else if (
			isTextArea(element) &&
			isTextArea(reference) &&
			!(this.#ignoreActiveValue && document.activeElement === element) &&
			!(this.#preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
		) {
			this.#updateProperty(element, "value", reference.value)

			const text = element.firstElementChild
			if (text) this.#updateProperty(text, "textContent", reference.value)
		}
	}

	// Iterates over the child nodes of the reference element, morphing the main element’s child nodes to match.
	#morphChildNodes(pair: MatchingElementReferencePair<Element>): void {
		const [element, reference] = pair

		const childNodes = element.childNodes
		const refChildNodes = reference.childNodes

		for (let i = 0; i < refChildNodes.length; i++) {
			const child = childNodes[i] as ChildNode | null
			const refChild = refChildNodes[i] as ReadonlyNode<ChildNode> | null

			if (child && refChild) {
				const pair: NodeReferencePair<ChildNode> = [child, refChild]

				if (isMatchingElementPair(pair)) {
					if (isHead(pair[0])) {
						this.#morphHeadContents(pair as MatchingElementReferencePair<HTMLHeadElement>)
					} else {
						this.#morphChildElement(pair, element)
					}
				} else this.#morphOtherNode(pair)
			} else if (refChild) {
				this.#appendChild(element, refChild.cloneNode(true))
			}
		}

		// Clean up any excess nodes that may be left over
		while (childNodes.length > refChildNodes.length) {
			const child = element.lastChild
			if (child) this.#removeNode(child)
		}
	}

	#morphChildElement([child, reference]: MatchingElementReferencePair<Element>, parent: Element): void {
		if (!(this.#beforeNodeMorphed?.(child, writableNode(reference)) ?? true)) return

		const refIdSet = this.#idMap.get(reference)

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
						this.#insertBefore(parent, currentNode, child)
						return this.#morphNode([currentNode, reference])
					} else {
						const currentIdSet = this.#idMap.get(currentNode)

						if (currentIdSet && refSetArray.some((it) => currentIdSet.has(it))) {
							this.#insertBefore(parent, currentNode, child)
							return this.#morphNode([currentNode, reference])
						}
					}
				}
			}

			currentNode = currentNode.nextSibling
		}

		// nextMatchByTagName is always set (at minimum to child itself since they have matching tag names)
		this.#insertBefore(parent, nextMatchByTagName!, child)
		this.#morphNode([nextMatchByTagName!, reference])

		this.#afterNodeMorphed?.(child, writableNode(reference))
	}

	#updateProperty<N extends Node, P extends keyof N>(node: N, propertyName: P, newValue: N[P]): void {
		const previousValue = node[propertyName]

		if (previousValue !== newValue && (this.#beforePropertyUpdated?.(node, propertyName, newValue) ?? true)) {
			node[propertyName] = newValue
			this.#afterPropertyUpdated?.(node, propertyName, previousValue)
		}
	}

	#replaceNode(node: ChildNode, newNode: Node): void {
		if ((this.#beforeNodeRemoved?.(node) ?? true) && (this.#beforeNodeAdded?.(newNode) ?? true)) {
			node.replaceWith(newNode)
			this.#afterNodeAdded?.(newNode)
			this.#afterNodeRemoved?.(node)
		}
	}

	#insertBefore(parent: ParentNode, node: Node, insertionPoint: ChildNode): void {
		if (node === insertionPoint) return

		// Use moveBefore when available (more efficient for moving existing nodes)
		if (supportsMoveBefore) {
			;(parent as any).moveBefore(node, insertionPoint)
		} else {
			parent.insertBefore(node, insertionPoint)
		}
	}

	#appendChild(node: ParentNode, newNode: Node): void {
		if (this.#beforeNodeAdded?.(newNode) ?? true) {
			node.appendChild(newNode)
			this.#afterNodeAdded?.(newNode)
		}
	}

	#removeNode(node: ChildNode): void {
		if (this.#beforeNodeRemoved?.(node) ?? true) {
			node.remove()
			this.#afterNodeRemoved?.(node)
		}
	}
}

function writableNode<N extends Node>(node: ReadonlyNode<N>): N {
	return node as N
}

function isMatchingElementPair(pair: NodeReferencePair<Node>): pair is MatchingElementReferencePair<Element> {
	const [a, b] = pair
	return isElement(a) && isElement(b) && a.localName === b.localName
}

function isParentNodePair(pair: NodeReferencePair<Node>): pair is NodeReferencePair<ParentNode> {
	return isParentNode(pair[0]) && isParentNode(pair[1])
}

function isElement(node: Node): node is Element
function isElement(node: ReadonlyNode<Node>): node is ReadonlyNode<Element>
function isElement(node: Node | ReadonlyNode<Node>): boolean {
	return node.nodeType === 1
}

function isInput(element: Element): element is HTMLInputElement
function isInput(element: ReadonlyNode<Element>): element is ReadonlyNode<HTMLInputElement>
function isInput(element: Element | ReadonlyNode<Element>): boolean {
	return element.localName === "input"
}

function isOption(element: Element): element is HTMLOptionElement
function isOption(element: ReadonlyNode<Element>): element is ReadonlyNode<HTMLOptionElement>
function isOption(element: Element | ReadonlyNode<Element>): boolean {
	return element.localName === "option"
}

function isTextArea(element: Element): element is HTMLTextAreaElement
function isTextArea(element: ReadonlyNode<Element>): element is ReadonlyNode<HTMLTextAreaElement>
function isTextArea(element: Element | ReadonlyNode<Element>): boolean {
	return element.localName === "textarea"
}

function isHead(element: Element): element is HTMLHeadElement
function isHead(element: ReadonlyNode<Element>): element is ReadonlyNode<HTMLHeadElement>
function isHead(element: Element | ReadonlyNode<Element>): boolean {
	return element.localName === "head"
}

const parentNodeTypes = new Set([1, 9, 11])

function isParentNode(node: Node): node is ParentNode
function isParentNode(node: ReadonlyNode<Node>): node is ReadonlyNode<ParentNode>
function isParentNode(node: Node | ReadonlyNode<Node>): boolean {
	return parentNodeTypes.has(node.nodeType)
}
