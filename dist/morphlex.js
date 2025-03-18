export function morph(node, reference, options = {}) {
	if (typeof reference === "string") reference = parseChildNodeFromString(reference);
	new Morph(options).morph([node, reference]);
}
export function morphInner(element, reference, options = {}) {
	if (typeof reference === "string") reference = parseElementFromString(reference);
	new Morph(options).morphInner([element, reference]);
}
function parseElementFromString(string) {
	const node = parseChildNodeFromString(string);
	if (isElement(node)) return node;
	else throw new Error("[Morphlex] The string was not a valid HTML element.");
}
function parseChildNodeFromString(string) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(string, "text/html");
	if (doc.childNodes.length === 1) return doc.body.firstChild;
	else throw new Error("[Morphlex] The string was not a valid HTML node.");
}
class Morph {
	#idMap;
	#sensivityMap;
	#ignoreActiveValue;
	#preserveModifiedValues;
	#beforeNodeMorphed;
	#afterNodeMorphed;
	#beforeNodeAdded;
	#afterNodeAdded;
	#beforeNodeRemoved;
	#afterNodeRemoved;
	#beforeAttributeUpdated;
	#afterAttributeUpdated;
	#beforePropertyUpdated;
	#afterPropertyUpdated;
	constructor(options = {}) {
		this.#idMap = new WeakMap();
		this.#sensivityMap = new WeakMap();
		this.#ignoreActiveValue = options.ignoreActiveValue || false;
		this.#preserveModifiedValues = options.preserveModifiedValues || false;
		this.#beforeNodeMorphed = options.beforeNodeMorphed;
		this.#afterNodeMorphed = options.afterNodeMorphed;
		this.#beforeNodeAdded = options.beforeNodeAdded;
		this.#afterNodeAdded = options.afterNodeAdded;
		this.#beforeNodeRemoved = options.beforeNodeRemoved;
		this.#afterNodeRemoved = options.afterNodeRemoved;
		this.#beforeAttributeUpdated = options.beforeAttributeUpdated;
		this.#afterAttributeUpdated = options.afterAttributeUpdated;
		this.#beforePropertyUpdated = options.beforePropertyUpdated;
		this.#afterPropertyUpdated = options.afterPropertyUpdated;
		Object.freeze(this);
	}
	morph(pair) {
		this.#withAriaBusy(pair[0], () => {
			if (isParentNodePair(pair)) this.#buildMaps(pair);
			this.#morphNode(pair);
		});
	}
	morphInner(pair) {
		this.#withAriaBusy(pair[0], () => {
			if (isMatchingElementPair(pair)) {
				this.#buildMaps(pair);
				this.#morphMatchingElementContent(pair);
			} else {
				throw new Error("[Morphlex] You can only do an inner morph with matching elements.");
			}
		});
	}
	#withAriaBusy(node, block) {
		if (isElement(node)) {
			const originalAriaBusy = node.ariaBusy;
			node.ariaBusy = "true";
			block();
			node.ariaBusy = originalAriaBusy;
		} else block();
	}
	#buildMaps([node, reference]) {
		this.#mapIdSets(node);
		this.#mapIdSets(reference);
		this.#mapSensivity(node);
		Object.freeze(this.#idMap);
		Object.freeze(this.#sensivityMap);
	}
	#mapSensivity(node) {
		const sensitiveElements = node.querySelectorAll("audio,canvas,embed,iframe,input,object,textarea,video");
		const sensitiveElementsLength = sensitiveElements.length;
		for (let i = 0; i < sensitiveElementsLength; i++) {
			const sensitiveElement = sensitiveElements[i];
			let sensivity = 0;
			if (isInput(sensitiveElement) || isTextArea(sensitiveElement)) {
				sensivity++;
				if (sensitiveElement.value !== sensitiveElement.defaultValue) sensivity++;
				if (sensitiveElement === document.activeElement) sensivity++;
			} else {
				sensivity += 3;
				if (isMedia(sensitiveElement) && !sensitiveElement.ended) {
					if (!sensitiveElement.paused) sensivity++;
					if (sensitiveElement.currentTime > 0) sensivity++;
				}
			}
			let current = sensitiveElement;
			while (current) {
				this.#sensivityMap.set(current, (this.#sensivityMap.get(current) || 0) + sensivity);
				if (current === node) break;
				current = current.parentElement;
			}
		}
	}
	// For each node with an ID, push that ID into the IdSet on the IdMap, for each of its parent elements.
	#mapIdSets(node) {
		const elementsWithIds = node.querySelectorAll("[id]");
		const elementsWithIdsLength = elementsWithIds.length;
		for (let i = 0; i < elementsWithIdsLength; i++) {
			const elementWithId = elementsWithIds[i];
			const id = elementWithId.id;
			// Ignore empty IDs
			if (id === "") continue;
			let current = elementWithId;
			while (current) {
				const idSet = this.#idMap.get(current);
				idSet ? idSet.add(id) : this.#idMap.set(current, new Set([id]));
				if (current === node) break;
				current = current.parentElement;
			}
		}
	}
	// This is where we actually morph the nodes. The `morph` function (above) exists only to set up the `idMap`.
	#morphNode(pair) {
		if (isMatchingElementPair(pair)) this.#morphMatchingElementNode(pair);
		else this.#morphOtherNode(pair);
	}
	#morphMatchingElementNode(pair) {
		const [node, reference] = pair;
		if (!(this.#beforeNodeMorphed?.(node, writableNode(reference)) ?? true)) return;
		if (node.hasAttributes() || reference.hasAttributes()) this.#morphAttributes(pair);
		// TODO: Should use a branded pair here.
		this.#morphMatchingElementContent(pair);
		this.#afterNodeMorphed?.(node, writableNode(reference));
	}
	#morphOtherNode([node, reference]) {
		if (!(this.#beforeNodeMorphed?.(node, writableNode(reference)) ?? true)) return;
		if (node.nodeType === reference.nodeType && node.nodeValue !== null && reference.nodeValue !== null) {
			// Handle text nodes, comments, and CDATA sections.
			this.#updateProperty(node, "nodeValue", reference.nodeValue);
		} else this.#replaceNode(node, reference.cloneNode(true));
		this.#afterNodeMorphed?.(node, writableNode(reference));
	}
	#morphMatchingElementContent(pair) {
		const [node, reference] = pair;
		if (isHead(node)) {
			// We can pass the reference as a head here becuase we know it's the same as the node.
			this.#morphHeadContents(pair);
		} else if (node.hasChildNodes() || reference.hasChildNodes()) this.#morphChildNodes(pair);
	}
	#morphHeadContents([node, reference]) {
		const refChildNodesMap = new Map();
		// Generate a map of the reference head element’s child nodes, keyed by their outerHTML.
		const referenceChildrenLength = reference.children.length;
		for (let i = 0; i < referenceChildrenLength; i++) {
			const child = reference.children[i];
			refChildNodesMap.set(child.outerHTML, child);
		}
		const nodeChildrenLength = node.children.length;
		for (let i = 0; i < nodeChildrenLength; i++) {
			const child = node.children[i];
			const key = child.outerHTML;
			const refChild = refChildNodesMap.get(key);
			// If the child is in the reference map already, we don’t need to add it later.
			// If it’s not in the map, we need to remove it from the node.
			refChild ? refChildNodesMap.delete(key) : this.#removeNode(child);
		}
		// Any remaining nodes in the map should be appended to the head.
		for (const refChild of refChildNodesMap.values()) this.#appendChild(node, refChild.cloneNode(true));
	}
	#morphAttributes([element, reference]) {
		// Remove any excess attributes from the element that aren’t present in the reference.
		for (const { name, value } of element.attributes) {
			if (!reference.hasAttribute(name) && (this.#beforeAttributeUpdated?.(element, name, null) ?? true)) {
				element.removeAttribute(name);
				this.#afterAttributeUpdated?.(element, name, value);
			}
		}
		// Copy attributes from the reference to the element, if they don’t already match.
		for (const { name, value } of reference.attributes) {
			const previousValue = element.getAttribute(name);
			if (previousValue !== value && (this.#beforeAttributeUpdated?.(element, name, value) ?? true)) {
				element.setAttribute(name, value);
				this.#afterAttributeUpdated?.(element, name, previousValue);
			}
		}
		// For certain types of elements, we need to do some extra work to ensure
		// the element’s state matches the reference elements’ state.
		if (isInput(element) && isInput(reference)) {
			this.#updateProperty(element, "checked", reference.checked);
			this.#updateProperty(element, "disabled", reference.disabled);
			this.#updateProperty(element, "indeterminate", reference.indeterminate);
			if (
				element.type !== "file" &&
				!(this.#ignoreActiveValue && document.activeElement === element) &&
				!(this.#preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
			) {
				this.#updateProperty(element, "value", reference.value);
			}
		} else if (isOption(element) && isOption(reference)) {
			this.#updateProperty(element, "selected", reference.selected);
		} else if (
			isTextArea(element) &&
			isTextArea(reference) &&
			!(this.#ignoreActiveValue && document.activeElement === element) &&
			!(this.#preserveModifiedValues && element.name === reference.name && element.value !== element.defaultValue)
		) {
			this.#updateProperty(element, "value", reference.value);
			const text = element.firstElementChild;
			if (text) this.#updateProperty(text, "textContent", reference.value);
		}
	}
	// Iterates over the child nodes of the reference element, morphing the main element’s child nodes to match.
	#morphChildNodes(pair) {
		const [element, reference] = pair;
		const childNodes = element.childNodes;
		const refChildNodes = reference.childNodes;
		for (let i = 0; i < refChildNodes.length; i++) {
			const child = childNodes[i];
			const refChild = refChildNodes[i];
			if (child && refChild) {
				const pair = [child, refChild];
				if (isMatchingElementPair(pair)) {
					if (isHead(pair[0])) {
						this.#morphHeadContents(pair);
					} else {
						this.#morphChildElement(pair, element);
					}
				} else this.#morphOtherNode(pair);
			} else if (refChild) {
				this.#appendChild(element, refChild.cloneNode(true));
			} else if (child) {
				this.#removeNode(child);
			}
		}
		// Clean up any excess nodes that may be left over
		while (childNodes.length > refChildNodes.length) {
			const child = element.lastChild;
			if (child) this.#removeNode(child);
		}
	}
	#morphChildElement([child, reference], parent) {
		if (!(this.#beforeNodeMorphed?.(child, writableNode(reference)) ?? true)) return;
		const refIdSet = this.#idMap.get(reference);
		// Generate the array in advance of the loop
		const refSetArray = refIdSet ? [...refIdSet] : [];
		let currentNode = child;
		let nextMatchByTagName = null;
		// Try find a match by idSet, while also looking out for the next best match by tagName.
		while (currentNode) {
			if (isElement(currentNode)) {
				const id = currentNode.id;
				if (!nextMatchByTagName && currentNode.localName === reference.localName) {
					nextMatchByTagName = currentNode;
				}
				if (id !== "") {
					if (id === reference.id) {
						this.#insertBefore(parent, currentNode, child);
						return this.#morphNode([currentNode, reference]);
					} else {
						const currentIdSet = this.#idMap.get(currentNode);
						if (currentIdSet && refSetArray.some((it) => currentIdSet.has(it))) {
							this.#insertBefore(parent, currentNode, child);
							return this.#morphNode([currentNode, reference]);
						}
					}
				}
			}
			currentNode = currentNode.nextSibling;
		}
		if (nextMatchByTagName) {
			this.#insertBefore(parent, nextMatchByTagName, child);
			this.#morphNode([nextMatchByTagName, reference]);
		} else {
			const newNode = reference.cloneNode(true);
			if (this.#beforeNodeAdded?.(newNode) ?? true) {
				this.#insertBefore(parent, newNode, child);
				this.#afterNodeAdded?.(newNode);
			}
		}
		this.#afterNodeMorphed?.(child, writableNode(reference));
	}
	#updateProperty(node, propertyName, newValue) {
		const previousValue = node[propertyName];
		if (previousValue !== newValue && (this.#beforePropertyUpdated?.(node, propertyName, newValue) ?? true)) {
			node[propertyName] = newValue;
			this.#afterPropertyUpdated?.(node, propertyName, previousValue);
		}
	}
	#replaceNode(node, newNode) {
		if ((this.#beforeNodeRemoved?.(node) ?? true) && (this.#beforeNodeAdded?.(newNode) ?? true)) {
			node.replaceWith(newNode);
			this.#afterNodeAdded?.(newNode);
			this.#afterNodeRemoved?.(node);
		}
	}
	#insertBefore(parent, node, insertionPoint) {
		if ("moveBefore" in parent && typeof parent.moveBefore === "function") {
			return parent.moveBefore(node, insertionPoint);
		}
		if (node === insertionPoint) return;
		if (isElement(node)) {
			const sensitivity = this.#sensivityMap.get(node) ?? 0;
			if (sensitivity > 0) {
				let previousNode = node.previousSibling;
				while (previousNode) {
					const previousNodeSensitivity = this.#sensivityMap.get(previousNode) ?? 0;
					if (previousNodeSensitivity < sensitivity) {
						parent.insertBefore(previousNode, node.nextSibling);
						if (previousNode === insertionPoint) return;
						previousNode = node.previousSibling;
					} else break;
				}
			}
		}
		parent.insertBefore(node, insertionPoint);
	}
	#appendChild(node, newNode) {
		if (this.#beforeNodeAdded?.(newNode) ?? true) {
			node.appendChild(newNode);
			this.#afterNodeAdded?.(newNode);
		}
	}
	#removeNode(node) {
		if (this.#beforeNodeRemoved?.(node) ?? true) {
			node.remove();
			this.#afterNodeRemoved?.(node);
		}
	}
}
function writableNode(node) {
	return node;
}
function isMatchingElementPair(pair) {
	const [a, b] = pair;
	return isElement(a) && isElement(b) && a.localName === b.localName;
}
function isParentNodePair(pair) {
	return isParentNode(pair[0]) && isParentNode(pair[1]);
}
function isElement(node) {
	return node.nodeType === 1;
}
function isMedia(element) {
	return element.localName === "video" || element.localName === "audio";
}
function isInput(element) {
	return element.localName === "input";
}
function isOption(element) {
	return element.localName === "option";
}
function isTextArea(element) {
	return element.localName === "textarea";
}
function isHead(element) {
	return element.localName === "head";
}
const parentNodeTypes = new Set([1, 9, 11]);
function isParentNode(node) {
	return parentNodeTypes.has(node.nodeType);
}
//# sourceMappingURL=morphlex.js.map
