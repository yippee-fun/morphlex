var morphlex = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region src/morphlex.ts
	const SUPPORTS_MOVE_BEFORE = typeof Element !== "undefined" && "moveBefore" in Element.prototype;
	const ELEMENT_NODE_TYPE = 1;
	const TEXT_NODE_TYPE = 3;
	const DOCUMENT_NODE_TYPE = 9;
	const DOCUMENT_FRAGMENT_NODE_TYPE = 11;
	const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
	const CLOBBER_ATTRIBUTE = "morphlex-clobber";
	const DIRTY_ATTRIBUTE = "morphlex-dirty";
	const STAYING_CELLS = 1 << 20;
	const DETACHED_NODE_ERROR = "[Morphlex] Cannot replace a detached node. It needs a parent.";
	const CHOICE_PASSES = [
		[
			false,
			true,
			true,
			true
		],
		[
			false,
			true,
			true,
			false
		],
		[
			false,
			true,
			false,
			true
		],
		[
			false,
			true,
			false,
			false
		],
		[
			false,
			false,
			true,
			true
		],
		[
			false,
			false,
			true,
			false
		],
		[
			false,
			false,
			false,
			true
		],
		[
			false,
			false,
			false,
			false
		],
		[
			true,
			true,
			true,
			true
		],
		[
			true,
			true,
			true,
			false
		],
		[
			true,
			true,
			false,
			true
		],
		[
			true,
			true,
			false,
			false
		],
		[
			true,
			false,
			true,
			true
		],
		[
			true,
			false,
			true,
			false
		],
		[
			true,
			false,
			false,
			true
		],
		[
			true,
			false,
			false,
			false
		]
	];
	const STYLING_ATTRIBUTES = ["class", "style"];
	const Operation = {
		EqualNode: 0,
		SameElement: 1,
		SameNode: 2
	};
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
	function morphDocument(from, to, options) {
		if (typeof to === "string") to = parseDocument(to);
		morph(documentElementOf(from), documentElementOf(to), options);
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
	function morph(from, to, options = {}) {
		if (typeof to === "string") to = parseFragment(to).childNodes;
		run(from, takeClobbered(to), options, (morpher) => morpher.morph(from, to));
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
	function morphInner(from, to, options = {}) {
		if (typeof to === "string") {
			const fragment = parseFragment(to);
			if (fragment.firstChild && fragment.childNodes.length === 1 && nodeTypeOf(fragment.firstChild) === ELEMENT_NODE_TYPE) to = fragment.firstChild;
			else throw new Error("[Morphlex] The string was not a valid HTML element.");
		}
		if (nodeTypeOf(from) === ELEMENT_NODE_TYPE && nodeTypeOf(to) === ELEMENT_NODE_TYPE && localNameOf(from) === localNameOf(to) && namespaceURIOf(from) === namespaceURIOf(to)) {
			const fromElement = from;
			const toElement = to;
			const clobbered = takeClobbered(toElement);
			if (clobbered?.has(toElement)) options = {
				...options,
				preserveChanges: false
			};
			run(fromElement, clobbered, options, (morpher) => morpher.morphChildren(fromElement, toElement));
		} else throw new Error("[Morphlex] You can only do an inner morph with matching elements.");
	}
	function run(from, clobbered, options, morph) {
		const select = selectOf(from);
		const flagged = isElement(from) ? flagDirtyInputs(from) : null;
		const keySelect = isElement(from) && isSelectElement(from) ? from : select;
		try {
			const morpher = new Morph(options, clobbered, flagged, keySelect);
			if (select) morpher.setEnclosingSelect(select, markupSelectionOf(select));
			morph(morpher);
		} finally {
			if (flagged) clearDirtyFlags(flagged);
		}
	}
	function takeClobbered(to) {
		let clobbered = null;
		const nodes = isNodeList(to) ? to : [to];
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (nodeTypeOf(node) !== ELEMENT_NODE_TYPE) continue;
			const element = node;
			if (stripMarkerAttributes(element)) (clobbered ??= /* @__PURE__ */ new Set()).add(element);
			for (const descendant of querySelectorAll(element, `[${CLOBBER_ATTRIBUTE}], [${DIRTY_ATTRIBUTE}]`)) if (stripMarkerAttributes(descendant)) (clobbered ??= /* @__PURE__ */ new Set()).add(descendant);
		}
		return clobbered;
	}
	function stripMarkerAttributes(element) {
		removeAttribute(element, DIRTY_ATTRIBUTE);
		if (!hasAttribute(element, CLOBBER_ATTRIBUTE)) return false;
		removeAttribute(element, CLOBBER_ATTRIBUTE);
		return true;
	}
	function flagDirtyInputs(node) {
		const flagged = [];
		const defaultOptions = /* @__PURE__ */ new Map();
		let optionSelects = null;
		for (const element of [node, ...querySelectorAll(node, "input, option, textarea")]) {
			let dirty = false;
			if (isInputElement(element)) dirty = isDirtyInput(element);
			else if (isOptionElement(element)) {
				optionSelects ??= optionSelectsOf(node);
				dirty = isDirtyOption(element, optionSelects.get(element), defaultOptions);
			} else if (isTextAreaElement(element)) dirty = isDirtyTextArea(element);
			if (dirty) flagDirty(element, flagged);
		}
		return flagged;
	}
	function flagDirty(element, flagged) {
		setAttribute(element, DIRTY_ATTRIBUTE, "");
		flagged.push(element);
	}
	function isDirtyInput(input) {
		if (input.type === "checkbox" || input.type === "radio") return input.checked !== input.defaultChecked;
		return input.value !== input.defaultValue && hasDirtyValue(input);
	}
	let probeDocument = null;
	function probeClone(input) {
		probeDocument ??= implementationOf(input.ownerDocument).createHTMLDocument("");
		return probeDocument.importNode(input);
	}
	function hasDirtyValue(input) {
		if (input.type === "file") return input.value !== "";
		const clone = probeClone(input);
		clone.type = "text";
		const probe = clone.value === "a" ? "b" : "a";
		clone.defaultValue = probe;
		return clone.value !== probe;
	}
	const SANITIZING_ATTRIBUTES = [
		"min",
		"max",
		"step",
		"multiple"
	];
	function resanitizeValue(input, target, value, shown) {
		if (hasDirtyValue(input)) return false;
		if (SANITIZING_ATTRIBUTES.some((name) => input.getAttribute(name) !== getAttribute(target, name))) return true;
		const clone = probeClone(input);
		setValueAttribute(clone, value);
		if (clone.value !== shown) return false;
		setValueAttribute(input, value);
		return true;
	}
	function setValueAttribute(input, value) {
		if (value === null) {
			input.setAttribute("value", "");
			input.removeAttribute("value");
		} else input.setAttribute("value", value);
	}
	function isDirtyTextArea(textarea) {
		return textarea.value !== textarea.defaultValue.replace(/\r\n?/g, "\n");
	}
	function isDirtyOption(option, select, defaultOptions) {
		if (!select || select.multiple) return option.selected !== option.defaultSelected;
		let defaultOption = defaultOptions.get(select);
		if (defaultOption === void 0) {
			defaultOption = defaultOptionOf(select);
			defaultOptions.set(select, defaultOption);
		}
		return option.selected !== (option === defaultOption);
	}
	function defaultOptionOf(select) {
		const options = select.options;
		let firstEnabled = null;
		for (let i = options.length - 1; i >= 0; i--) {
			const option = options[i];
			if (option.hasAttribute("selected")) return option;
			if (!isDisabledOption(option)) firstEnabled = option;
		}
		if (displaySizeOf(select) > 1) return null;
		/* v8 ignore next -- only WebKit selects a disabled option */
		return firstEnabled ?? (selectsDisabledOption(select.ownerDocument) ? options[0] ?? null : null);
	}
	let disabledOptionSelected;
	function selectsDisabledOption(document) {
		if (disabledOptionSelected === void 0) {
			const select = createElement(document, "select");
			const option = createElement(document, "option");
			option.disabled = true;
			select.append(option);
			disabledOptionSelected = select.selectedIndex === 0;
		}
		return disabledOptionSelected;
	}
	function displaySizeOf(select) {
		const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(select.getAttribute("size") ?? "");
		return match ? Number(match[1]) : 1;
	}
	function isDisabledOption(option) {
		if (option.disabled) return true;
		for (let parent = option.parentElement; !isSelectElement(parent); parent = parentElementOf(parent)) if (localNameOf(parent) === "optgroup" && namespaceURIOf(parent) === HTML_NAMESPACE) return parent.disabled;
		return false;
	}
	function clearImplicitSelection(node, parent) {
		if (nodeTypeOf(node) !== ELEMENT_NODE_TYPE || nodeTypeOf(parent) !== ELEMENT_NODE_TYPE) return;
		if (isConnected(node) && ownerDocumentOf(node) === ownerDocumentOf(parent)) return;
		if (!isSelectElement(parent) && !selectOf(parent)) return;
		const element = node;
		if (isSelectElement(element)) return;
		let selected = null;
		if (isOptionElement(element)) {
			if (isImplicitlySelected(element)) selected = [element];
		} else forEachNewOption(element, (option) => {
			if (isImplicitlySelected(option)) (selected ??= []).push(option);
		});
		if (!selected) return;
		remove(element);
		for (const option of selected) option.selected = false;
	}
	function isImplicitlySelected(option) {
		return option.selected && !option.hasAttribute("selected");
	}
	function forEachNewOption(element, callback) {
		for (let child = firstElementChildOf(element); child; child = nextElementSiblingOf(child)) if (isOptionElement(child)) callback(child);
		else if (!isSelectElement(child)) forEachNewOption(child, callback);
	}
	function movesOptionsBetweenSelects(live, select) {
		if (isSelectElement(live) || !querySelector(live, "option")) return false;
		return selectOf(live) !== select;
	}
	function selectAt(parent) {
		return isElement(parent) && isSelectElement(parent) ? parent : selectOf(parent);
	}
	function selectOf(node) {
		for (let parent = parentElementOf(node); parent; parent = parentElementOf(parent)) if (isSelectElement(parent)) return parent;
		return null;
	}
	function optionSelectsOf(node) {
		const optionSelects = /* @__PURE__ */ new Map();
		const enclosing = selectOf(node);
		if (enclosing) addOptionSelects(optionSelects, enclosing);
		if (isSelectElement(node)) addOptionSelects(optionSelects, node);
		for (const select of querySelectorAll(node, "select")) if (isSelectElement(select)) addOptionSelects(optionSelects, select);
		return optionSelects;
	}
	function addOptionSelects(optionSelects, select) {
		for (const option of select.options) optionSelects.set(option, select);
	}
	function markupSelectionOf(select) {
		if (!select.multiple) return [defaultOptionOf(select)];
		return Array.from(select.options).filter((option) => option.hasAttribute("selected"));
	}
	function clearDirtyFlags(elements) {
		for (let i = 0; i < elements.length; i++) removeAttribute(elements[i], DIRTY_ATTRIBUTE);
	}
	function parseFragment(string) {
		const template = createElement(document, "template");
		template.innerHTML = string;
		trimFragmentEdgeWhitespace(template.content);
		return template.content;
	}
	function parseDocument(string) {
		return new DOMParser().parseFromString(trimAsciiWhitespace(string), "text/html");
	}
	/* v8 ignore start -- reorder fast paths are environment-sensitive */
	function moveBefore(parent, node, insertionPoint) {
		if (node === insertionPoint) return;
		if (parentNodeOf(node) === parent) {
			if (nextSiblingOf(node) === insertionPoint) return;
			if (SUPPORTS_MOVE_BEFORE) {
				parentPrototypeOf(parent).moveBefore.call(parent, node, insertionPoint);
				return;
			}
		}
		insertBefore(parent, node, insertionPoint);
	}
	/* v8 ignore stop */
	const uncheckedByAttribute = /* @__PURE__ */ new WeakMap();
	function moveInto(parent, node, insertionPoint) {
		if (SUPPORTS_MOVE_BEFORE && isConnected(node) && isConnected(parent)) try {
			parentPrototypeOf(parent).moveBefore.call(parent, node, insertionPoint);
			return;
		} catch {}
		insertBefore(parent, node, insertionPoint);
	}
	function focusOf(node) {
		let element = activeElementIn(getRootNode(node));
		if (!element) return null;
		const document = ownerDocumentOf(element);
		if (element === bodyOf(document) && !element.isContentEditable) return null;
		while (element.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
		let selection = null;
		let range = null;
		if ((isInputElement(element) || isTextAreaElement(element)) && element.selectionStart !== null) selection = [
			element.selectionStart,
			element.selectionEnd,
			element.selectionDirection
		];
		else {
			/* v8 ignore next */
			const { anchorNode, anchorOffset, focusNode, focusOffset } = getSelection(document) ?? {};
			if (anchorNode && focusNode && contains(element, anchorNode) && contains(element, focusNode)) range = [
				anchorNode,
				anchorOffset,
				focusNode,
				focusOffset
			];
		}
		return {
			element,
			selection,
			range,
			taken: false,
			document
		};
	}
	function focusHeldBy(node) {
		const focus = focusOf(node);
		if (!focus) return null;
		const { element, range } = focus;
		return holds(node, element) || range && (holds(node, range[0]) || holds(node, range[2])) ? focus : null;
	}
	function focusHoldersIn(root) {
		const focus = focusOf(root);
		if (!focus) return null;
		const holders = /* @__PURE__ */ new Set();
		const { element, range } = focus;
		for (const held of range ? [
			element,
			range[0],
			range[2]
		] : [element]) for (let node = held; node; node = parentOrHost(node)) holders.add(node);
		return holders.has(root) ? holders : null;
	}
	function restoreFocus(focus) {
		const { element, selection, range } = focus;
		const root = getRootNode(element);
		const document = ownerDocumentOf(element);
		if (activeElementIn(root) !== element) {
			if (focus.taken || !isFocusLost(document)) return false;
			focusElement(element);
			if (activeElementIn(root) !== element) return !focus.taken && isFocusLost(document);
		}
		try {
			if (selection) {
				const control = element;
				const [start, end, direction] = selection;
				if (control.selectionStart !== start || control.selectionEnd !== end || control.selectionDirection !== direction) control.setSelectionRange(start, end, direction);
			} else if (range && contains(element, range[0]) && contains(element, range[2])) {
				getBoundingClientRect(element);
				getSelection(document).setBaseAndExtent(...range);
			}
		} catch {}
		return false;
	}
	function focusElement(element) {
		let platform = element;
		for (let prototype = Object.getPrototypeOf(element); prototype; prototype = Object.getPrototypeOf(prototype)) if (Object.hasOwn(prototype, "focus")) platform = prototype;
		Reflect.apply(Reflect.get(platform, "focus"), element, [{ preventScroll: true }]);
	}
	function isFocusLost(document) {
		const activeElement = activeElementOf(document);
		/* v8 ignore next -- tests run in documents with a body */
		return activeElement === null || activeElement === (bodyOf(document) ?? documentElementOf(document));
	}
	function activeElementIn(root) {
		if (nodeTypeOf(root) === DOCUMENT_NODE_TYPE) return activeElementOf(root);
		return root.activeElement ?? null;
	}
	function holds(node, element) {
		for (let holder = element; holder; holder = parentOrHost(holder)) if (holder === node) return true;
		return false;
	}
	function parentOrHost(node) {
		return parentNodeOf(node) ?? (nodeTypeOf(node) === DOCUMENT_FRAGMENT_NODE_TYPE ? node.host : null);
	}
	var Siblings = class {
		from;
		to;
		candidateNodes = [];
		candidateElements = [];
		candidateElementsById = /* @__PURE__ */ new Map();
		whitespace = [];
		unmatchedNodes = [];
		unmatchedElements = [];
		candidateActive;
		unmatchedActive;
		matches = [];
		op = [];
		dirtyCandidatesByShape = null;
		displaced = [];
		#fromLocalNames = [];
		#fromNamespaces = [];
		#toLocalNames = [];
		#toNamespaces = [];
		constructor(from, to) {
			this.from = nodeListToArray(childNodesOf(from));
			this.to = nodeListToArray(childNodesOf(to));
			this.candidateActive = new Uint8Array(this.from.length);
			this.unmatchedActive = new Uint8Array(this.to.length);
			for (let i = 0; i < this.from.length; i++) {
				const candidate = this.from[i];
				if (isElement(candidate)) {
					this.candidateActive[i] = 1;
					this.#fromLocalNames[i] = localNameOf(candidate);
					this.#fromNamespaces[i] = namespaceURIOf(candidate);
					const id = idOf(candidate);
					if (id === "") this.candidateElements.push(i);
					else {
						const bucket = this.candidateElementsById.get(id);
						if (bucket) bucket.push(i);
						else this.candidateElementsById.set(id, [i]);
					}
				} else if (isWhitespaceTextNode(candidate)) this.whitespace.push(i);
				else {
					this.candidateActive[i] = 1;
					this.candidateNodes.push(i);
				}
			}
			for (let i = 0; i < this.to.length; i++) {
				const node = this.to[i];
				if (isElement(node)) {
					this.unmatchedActive[i] = 1;
					this.#toLocalNames[i] = localNameOf(node);
					this.#toNamespaces[i] = namespaceURIOf(node);
					this.unmatchedElements.push(i);
				} else if (!isWhitespaceTextNode(node)) {
					this.unmatchedActive[i] = 1;
					this.unmatchedNodes.push(i);
				}
			}
		}
		sameKind(target, candidate) {
			return this.#toLocalNames[target] === this.#fromLocalNames[candidate] && this.#toNamespaces[target] === this.#fromNamespaces[candidate];
		}
		take(target, candidate, op) {
			this.matches[target] = candidate;
			this.op[target] = op;
			this.candidateActive[candidate] = 0;
			this.unmatchedActive[target] = 0;
		}
	};
	var ChoiceMatching = class {
		owners = /* @__PURE__ */ new Map();
		#targets;
		#position;
		#takes;
		#listsOf;
		#likenessOf;
		#lists = [];
		#likenesses = [];
		#listIds = /* @__PURE__ */ new Map();
		#firstFree = /* @__PURE__ */ new Map();
		#deadTargets = /* @__PURE__ */ new Set();
		#failedSearches = /* @__PURE__ */ new Set();
		#unassigned = [];
		constructor(targets, takes, listsOf, likenessOf) {
			this.#targets = targets;
			this.#position = new Map(targets.map((target, t) => [target, t]));
			this.#takes = takes;
			this.#listsOf = listsOf;
			this.#likenessOf = likenessOf;
		}
		#listsFor(k) {
			let lists = this.#lists[k];
			if (!lists) {
				lists = this.#lists[k] = this.#listsOf(k);
				for (const list of lists) if (!this.#listIds.has(list)) this.#listIds.set(list, this.#listIds.size);
			}
			return lists;
		}
		#likeness(k) {
			return this.#likenesses[k] ??= this.#likenessOf(k);
		}
		assignFree(k) {
			const lists = this.#listsFor(k);
			if (!lists.length) return;
			const likeness = this.#likeness(k);
			let untried = this.#firstFree.get(likeness);
			if (!untried) this.#firstFree.set(likeness, untried = /* @__PURE__ */ new Map());
			const heads = [];
			for (const list of lists) {
				let head = untried.get(list) ?? 0;
				while (head < list.length && this.owners.has(list[head])) head++;
				heads.push(head);
			}
			let assigned = false;
			while (!assigned) {
				let next;
				for (let l = 0; l < lists.length; l++) {
					const target = lists[l][heads[l]];
					if (target !== void 0 && (next === void 0 || this.#position.get(target) < this.#position.get(next))) next = target;
				}
				if (next === void 0) break;
				for (let l = 0; l < lists.length; l++) if (lists[l][heads[l]] === next) heads[l] = heads[l] + 1;
				if (this.owners.has(next) || !this.#takes(k, next)) continue;
				this.owners.set(next, k);
				assigned = true;
			}
			for (let l = 0; l < lists.length; l++) untried.set(lists[l], heads[l]);
			if (!assigned) this.#unassigned.push(k);
		}
		assignRest() {
			for (const k of this.#unassigned) {
				if (this.owners.size === this.#targets.length) break;
				this.#assign(k);
			}
		}
		#assign(start) {
			const search = `${this.#likeness(start)} ${this.#listsFor(start).map((list) => this.#listIds.get(list)).join(" ")}`;
			if (this.#failedSearches.has(search)) return;
			const reachedFrom = /* @__PURE__ */ new Map();
			const ownedTarget = /* @__PURE__ */ new Map();
			const walked = /* @__PURE__ */ new Set();
			const queue = [start];
			for (let q = 0; q < queue.length; q++) {
				const k = queue[q];
				for (const list of this.#listsFor(k)) {
					const walk = `${this.#likeness(k)} ${this.#listIds.get(list)}`;
					if (walked.has(walk)) continue;
					walked.add(walk);
					for (const target of list) {
						if (reachedFrom.has(target) || this.#deadTargets.has(target) || !this.#takes(k, target)) continue;
						reachedFrom.set(target, k);
						const owner = this.owners.get(target);
						if (owner !== void 0) {
							ownedTarget.set(owner, target);
							queue.push(owner);
							continue;
						}
						for (let next = target; next !== void 0;) {
							const taker = reachedFrom.get(next);
							this.owners.set(next, taker);
							next = ownedTarget.get(taker);
						}
						this.#deadTargets.clear();
						this.#failedSearches.clear();
						return;
					}
				}
			}
			for (const target of reachedFrom.keys()) this.#deadTargets.add(target);
			this.#failedSearches.add(search);
		}
	};
	var Morph = class {
		#options;
		#preserveChanges;
		#root = null;
		#scope = null;
		#scopeStart = null;
		#scopeEnd = null;
		#targetRoots = /* @__PURE__ */ new Set();
		#vetoedNodes = null;
		#vetoedControls = null;
		#clobbered;
		#clobberedHolders = null;
		#clobberedScope = null;
		#dirtyElements = null;
		#flagged = /* @__PURE__ */ new Set();
		#targetChoices = /* @__PURE__ */ new Map();
		#keySelect;
		#liveSelects = /* @__PURE__ */ new Map();
		#idArrayMap = /* @__PURE__ */ new WeakMap();
		#idSetMap = /* @__PURE__ */ new WeakMap();
		#liveElementsById = /* @__PURE__ */ new Map();
		#targetIdCounts = /* @__PURE__ */ new Map();
		#targetElementsById = /* @__PURE__ */ new Map();
		#unplacedElements = null;
		#deferredRemovals = null;
		#pendingMoves = null;
		#claimedElements = /* @__PURE__ */ new Map();
		#movesInProgress = /* @__PURE__ */ new Set();
		#movesByTargetId = /* @__PURE__ */ new Map();
		#syncedSelects = null;
		#enclosingSelect = null;
		#radiosToSync = null;
		#radiosUncheckedForMove = null;
		#displacedRadios = null;
		#targetChecksInputs = false;
		#openDetails = null;
		#targetOpensDetails = false;
		#focusHolders = null;
		#unrestoredFocus = null;
		#watchedFocus = null;
		#watchedDocuments = [];
		constructor(options = {}, clobbered = null, flagged = null, keySelect = null) {
			this.#options = options;
			this.#keySelect = keySelect;
			this.#clobbered = clobbered;
			this.#preserveChanges = options.preserveChanges ?? false;
			if (flagged?.length) {
				const dirtyElements = /* @__PURE__ */ new Set();
				for (const element of flagged) {
					this.#flagged.add(element);
					for (let node = element; node && !dirtyElements.has(node); node = parentElementOf(node)) dirtyElements.add(node);
				}
				this.#dirtyElements = dirtyElements;
			}
		}
		morph(from, to) {
			this.#root = from;
			this.#focusHolders = focusHoldersIn(from);
			this.#scope = parentNodeOf(from) ?? from;
			this.#scopeStart = previousSiblingOf(from);
			this.#scopeEnd = nextSiblingOf(from);
			if (isParentNode(from)) this.#mapIdSets(from);
			if (isNodeList(to)) {
				for (const node of to) this.#targetRoots.add(node);
				this.#mapIdArraysForEach(to);
				if (this.#targetOpensDetails) closeLaterOpenDetails(to);
				this.#morphOneToMany(from, to);
			} else {
				this.#targetRoots.add(to);
				if (isParentNode(to)) this.#mapIdArrays(to);
				if (this.#targetOpensDetails) closeLaterOpenDetails([to]);
				this.#morphOneToOne(from, to);
			}
			this.#finish();
		}
		morphChildren(from, to) {
			this.#root = from;
			this.#focusHolders = focusHoldersIn(from);
			this.#scope = from;
			this.#targetRoots.add(to);
			this.#mapIdSets(from);
			this.#mapIdArrays(to, false);
			if (this.#targetOpensDetails) closeLaterOpenDetails(childrenOf(to));
			this.visitChildNodes(from, to);
			this.#finish();
		}
		#settleIfRoot(node) {
			if (node === this.#root) this.#finish();
		}
		#finish() {
			this.#completeMoves();
			const unplaced = this.#unplacedElements;
			if (unplaced) {
				for (let i = 0; i < unplaced.length; i++) {
					const element = unplaced[i];
					if (this.#liveElementsById.has(idOf(element))) this.#removeNode(element, true);
				}
				this.#unplacedElements = null;
			}
			const deferred = this.#deferredRemovals;
			if (deferred) {
				for (let i = 0; i < deferred.length; i++) {
					const node = deferred[i];
					this.#removeChild(node);
					this.#options.afterNodeRemoved?.(node);
				}
				this.#deferredRemovals = null;
			}
			const selects = this.#syncedSelects;
			if (selects) {
				const preserveChanges = this.#preserveChanges;
				this.#preserveChanges = false;
				for (const select of selects) this.#syncDefaultSelection(select);
				this.#preserveChanges = preserveChanges;
				this.#syncedSelects = null;
			}
			const displaced = this.#displacedRadios;
			if (displaced) {
				this.#displacedRadios = null;
				this.#restoreDisplacedRadios(displaced);
			}
			const unchecked = this.#radiosUncheckedForMove;
			if (unchecked) {
				this.#radiosUncheckedForMove = null;
				const groups = /* @__PURE__ */ new Map();
				for (const radio of unchecked) {
					if (radio.checked || !(radio.hasAttribute("checked") || this.#isVetoed(radio))) continue;
					if (radioGroupOf(radio, groups).some((member) => member.checked && this.#isVetoed(member))) continue;
					radio.checked = true;
				}
			}
			const radios = this.#radiosToSync;
			if (radios) {
				this.#radiosToSync = null;
				this.#syncRadioGroups(radios);
			}
			const openDetails = this.#openDetails;
			if (openDetails) {
				this.#openDetails = null;
				this.#reopenDetails(openDetails);
			}
			this.#syncEnclosingSelect();
			const focus = this.#unrestoredFocus;
			if (focus) {
				this.#unrestoredFocus = null;
				removeEventListener(focus.document, "focusin", this.#dropUnrestoredFocus);
				restoreFocus(focus);
			}
		}
		#reopenDetails(openDetails) {
			const closed = [];
			for (const details of openDetails.keys()) if (!hasAttributeNS(details, null, "open") && this.#inScope(details)) closed.push(details);
			closed.sort((a, b) => compareDocumentPosition(a, b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
			for (const details of closed) if (openDetailsInGroup(details).length === 0) setAttributeNS(details, null, "open", openDetails.get(details));
		}
		#completeMoves() {
			for (let moves = this.#pendingMoves; moves; moves = this.#pendingMoves) {
				this.#pendingMoves = null;
				for (let i = 0; i < moves.length; i++) this.#completeMove(moves[i]);
			}
		}
		#morphOneToMany(from, to) {
			const length = to.length;
			if (length === 0) this.#removeNode(from);
			else if (length === 1) this.#morphOneToOne(from, to[0]);
			else {
				const parent = parentNodeOf(from);
				if (!parent) throw new Error(DETACHED_NODE_ERROR);
				const newNodes = [...to];
				const first = newNodes.shift();
				const insertionPoint = nextSiblingOf(from);
				for (let i = 0; i < newNodes.length; i++) this.#addNode(parent, newNodes[i], insertionPoint);
				this.#morphOneToOne(from, first);
			}
		}
		#morphOneToOne(from, to) {
			if (from === to) return;
			if (isEqualNode(from, to)) return;
			if (nodeTypeOf(from) === ELEMENT_NODE_TYPE && nodeTypeOf(to) === ELEMENT_NODE_TYPE) {
				if (canMorphElementInPlace(from, to)) this.#morphMatchingElements(from, to);
				else this.#morphNonMatchingElements(from, to);
			} else this.#morphOtherNode(from, to);
		}
		#morphMatchingElements(from, to) {
			if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
				this.#pinSubtree(from);
				return;
			}
			const preserveChanges = this.#preserveChanges;
			const clobberedScope = this.#clobberedScope;
			if (preserveChanges && this.#clobbered?.has(to)) {
				this.#preserveChanges = false;
				this.#clobberedScope = from;
			}
			if (hasAttributes(from) || hasAttributes(to)) this.#visitAttributes(from, to);
			if (isTextAreaElement(from) && isTextAreaElement(to)) this.#visitTextArea(from, to);
			else if (hasChildNodes(from) || hasChildNodes(to) || isTemplateElement(from)) this.visitChildNodes(from, to);
			this.#settleIfRoot(from);
			this.#preserveChanges = preserveChanges;
			this.#clobberedScope = clobberedScope;
			this.#options.afterNodeVisited?.(from, to);
		}
		#morphNonMatchingElements(from, to) {
			if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
				this.#pinSubtree(from);
				return;
			}
			this.#replaceNode(from, to);
			this.#options.afterNodeVisited?.(from, to);
		}
		#morphOtherNode(from, to) {
			if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
				this.#pinSubtree(from);
				return;
			}
			if (nodeTypeOf(from) === nodeTypeOf(to) && from.nodeValue !== null && to.nodeValue !== null) from.nodeValue = to.nodeValue;
			else this.#replaceNode(from, to);
			this.#options.afterNodeVisited?.(from, to);
		}
		#visitAttributes(from, to) {
			removeAttribute(from, DIRTY_ATTRIBUTE);
			const details = isDetailsElement(from);
			const open = details ? getAttributeNS(from, null, "open") : null;
			const keepsOpen = this.#preserveChanges && hasOpenState(from);
			const toAttributes = attributesOf(to);
			for (let i = 0; i < toAttributes.length; i++) {
				const attribute = toAttributes[i];
				const { name, localName, value, namespaceURI } = attribute;
				if (keepsOpen && name === "open" && namespaceURI === null && !hasAttributeNS(from, null, "open")) continue;
				const oldValue = getAttributeNS(from, namespaceURI, localName);
				if (oldValue === value) continue;
				if (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true) {
					const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, value);
					const existing = getAttributeNodeNS(from, namespaceURI, localName);
					if (existing) existing.value = value;
					else if (details && name === "open" && namespaceURI === null) this.#openDetailsItem(from, value);
					else setAttributeNodeNS(from, attribute.cloneNode());
					this.#checkRadios(radios);
					this.#options.afterAttributeUpdated?.(from, name, oldValue);
				} else this.#noteVetoedAttribute(from, name, namespaceURI);
			}
			if (hasExcessAttributes(from, to)) {
				for (const { name, localName, value, namespaceURI } of Array.from(attributesOf(from))) if (!hasAttributeNS(to, namespaceURI, localName)) {
					if (keepsOpen && name === "open" && namespaceURI === null) continue;
					if (this.#options.beforeAttributeUpdated?.(from, name, null) ?? true) {
						if (name === "open" && namespaceURI === null && isDialogElement(from)) from.close();
						else {
							const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, null);
							removeAttributeNS(from, namespaceURI, localName);
							this.#checkRadios(radios);
							if (name === "checked") this.#displacedRadios?.delete(from);
						}
						this.#options.afterAttributeUpdated?.(from, name, value);
					} else this.#noteVetoedAttribute(from, name, namespaceURI);
				}
			}
			if (details) this.#noteIntendedOpen(from, to, open);
			if (!this.#preserveChanges) this.#resetFormProperties(from, to);
		}
		#noteIntendedOpen(details, to, open) {
			const vetoed = this.#vetoedControls?.has(details) ?? false;
			let intended = getAttributeNS(to, null, "open");
			if (vetoed) intended = open;
			else if (this.#preserveChanges) intended = open === null ? null : intended ?? open;
			if (intended === null) return;
			(this.#openDetails ??= /* @__PURE__ */ new Map()).set(details, intended);
		}
		#openDetailsItem(details, value) {
			const name = getAttributeNS(details, null, "name");
			if (name && openDetailsInGroup(details).length > 0) {
				setAttributeNS(details, null, "name", "");
				setAttributeNS(details, null, "open", value);
				setAttributeNS(details, null, "name", name);
			} else setAttributeNS(details, null, "open", value);
		}
		#noteAddedDetails(element) {
			const openDetails = this.#openDetails ??= /* @__PURE__ */ new Map();
			const open = isDetailsElement(element) ? getAttributeNS(element, null, "open") : null;
			if (open !== null) openDetails.set(element, open);
			const items = getElementsByTagName(element, "details");
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				const value = getAttributeNS(item, null, "open");
				if (value !== null && isDetailsElement(item)) openDetails.set(item, value);
			}
		}
		#resetFormProperties(from, to) {
			if (isInputElement(from)) {
				const checked = hasAttribute(to, "checked");
				if (hasAttribute(from, "checked") === checked) this.#displacedRadios?.delete(from);
				if (from.checked !== checked && hasAttribute(from, "checked") === checked) {
					from.checked = checked;
					if (from.type === "radio") (this.#radiosToSync ??= /* @__PURE__ */ new Set()).add(from);
				} else if (checked && from.type === "radio") (this.#radiosToSync ??= /* @__PURE__ */ new Set()).add(from);
				const type = from.type;
				const value = getAttribute(to, "value");
				const target = to;
				if (type !== "file" && type !== "checkbox" && type !== "radio" && type === target.type && getAttribute(from, "value") === value) {
					const shown = isDirtyInput(target) ? value ?? "" : target.value;
					if (from.value !== shown && !resanitizeValue(from, to, value, shown)) from.value = shown;
				}
			} else if (isOptionElement(from)) {
				const selected = hasAttribute(to, "selected");
				if (from.selected !== selected && hasAttribute(from, "selected") === selected) from.selected = selected;
			}
		}
		#visitTextArea(from, to) {
			const newTextContent = to.textContent || "";
			if (from.textContent !== newTextContent) from.textContent = newTextContent;
			if (this.#preserveChanges) return;
			if (isDirtyTextArea(from)) from.value = from.defaultValue;
		}
		visitChildNodes(from, to) {
			if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) {
				this.#pinSubtree(from);
				this.#settleIfRoot(from);
				return;
			}
			if (isTemplateElement(from) && isTemplateElement(to)) {
				this.#visitTemplateContent(from, to);
				this.#settleIfRoot(from);
				this.#options.afterChildrenVisited?.(from);
				return;
			}
			if (isSelectElement(from) && isSelectElement(to)) this.#liveSelects.set(to, from);
			const siblings = new Siblings(from, to);
			this.#matchEqualElements(siblings);
			this.#matchDirtyElements(siblings);
			this.#matchElementsById(siblings);
			this.#leaveClaimedTargets(siblings, from);
			this.#matchElementsByIdSets(siblings);
			if (this.#preserveChanges && this.#dirtyElements) this.#matchElementsByChoices(siblings);
			if (this.#dirtyElements) {
				this.#takeEqualTargets(siblings);
				this.#matchElementsByDirtyOutline(siblings);
			}
			this.#matchElementsByAttributes(siblings);
			this.#matchElementsByKind(siblings);
			this.#matchEqualNodes(siblings);
			this.#matchNodesByType(siblings);
			this.#orderIdenticalCandidates(siblings);
			for (let i = 0; i < siblings.from.length; i++) if (siblings.candidateActive[i]) this.#removeNode(siblings.from[i]);
			this.#placeChildren(from, siblings);
			this.#settleIfRoot(from);
			if (isSelectElement(from)) this.#syncDefaultSelection(from);
			this.#options.afterChildrenVisited?.(from);
		}
		#matchEqualElements(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			const dirtyElements = this.#dirtyElements;
			const candidatesByText = candidateElements.length * unmatchedElements.length > 1024 ? bucketByTextContent(from, candidateElements) : null;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const element = to[target];
				let candidates = candidateElements;
				if (candidatesByText) {
					const bucket = candidatesByText.get(textContentOf(element));
					if (bucket === void 0) continue;
					candidates = bucket;
				}
				for (let c = 0; c < candidates.length; c++) {
					const candidateIndex = candidates[c];
					if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue;
					const candidate = from[candidateIndex];
					if (dirtyElements?.has(candidate)) continue;
					if (isEqualNode(candidate, element)) {
						siblings.take(target, candidateIndex, Operation.EqualNode);
						break;
					}
				}
			}
		}
		#matchDirtyElements(siblings) {
			const dirtyElements = this.#dirtyElements;
			if (!dirtyElements) return;
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			const candidatesByShape = siblings.dirtyCandidatesByShape = /* @__PURE__ */ new Map();
			for (let c = 0; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c];
				const candidate = from[candidateIndex];
				if (!candidateActive[candidateIndex] || !dirtyElements.has(candidate)) continue;
				const shape = shapeOf(candidate);
				const bucket = candidatesByShape.get(shape);
				if (bucket) bucket.push(candidateIndex);
				else candidatesByShape.set(shape, [candidateIndex]);
			}
			const firstActive = /* @__PURE__ */ new Map();
			for (let i = 0; candidatesByShape.size && i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const element = to[target];
				const candidates = candidatesByShape.get(shapeOf(element));
				if (!candidates || this.#holdsClobbered(element)) continue;
				let c = firstActive.get(candidates) ?? 0;
				while (c < candidates.length && !candidateActive[candidates[c]]) c++;
				firstActive.set(candidates, c);
				const candidateIndex = candidates[c];
				if (candidateIndex !== void 0) siblings.take(target, candidateIndex, Operation.SameElement);
			}
		}
		#matchElementsByDirtyOutline(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			const dirtyElements = this.#dirtyElements;
			const outlines = /* @__PURE__ */ new Set();
			const names = /* @__PURE__ */ new Set();
			for (const candidates of [...siblings.dirtyCandidatesByShape.values(), siblings.displaced]) for (const candidateIndex of candidates) {
				if (!candidateActive[candidateIndex]) continue;
				const candidate = from[candidateIndex];
				outlines.add(outlineOf(candidate));
				names.add(localNameOf(candidate));
			}
			if (!names.size) return;
			const candidatesByOutline = /* @__PURE__ */ new Map();
			for (const candidateIndex of candidateElements) {
				if (!candidateActive[candidateIndex]) continue;
				const candidate = from[candidateIndex];
				if (!names.has(localNameOf(candidate))) continue;
				const outline = outlineOf(candidate);
				if (!outlines.has(outline)) continue;
				const bucket = candidatesByOutline.get(outline);
				if (bucket) bucket.push(candidateIndex);
				else candidatesByOutline.set(outline, [candidateIndex]);
			}
			const targets = [];
			const targetCounts = /* @__PURE__ */ new Map();
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const element = to[target];
				if (!names.has(localNameOf(element)) || this.#holdsClobbered(element)) continue;
				const candidates = candidatesByOutline.get(outlineOf(element));
				if (!candidates) continue;
				targets.push([target, candidates]);
				targetCounts.set(candidates, (targetCounts.get(candidates) ?? 0) + 1);
			}
			for (const [candidates, count] of targetCounts) {
				if (count >= candidates.length) continue;
				candidates.sort((a, b) => Number(dirtyElements.has(from[b])) - Number(dirtyElements.has(from[a])) || a - b);
			}
			const firstActive = /* @__PURE__ */ new Map();
			for (const [target, candidates] of targets) {
				const element = to[target];
				let first = firstActive.get(candidates) ?? 0;
				while (first < candidates.length && !candidateActive[candidates[first]]) first++;
				firstActive.set(candidates, first);
				const softMatches = canSoftMatchByTagName(element, this.#idArrayMap.has(element));
				for (let c = first; c < candidates.length; c++) {
					const candidateIndex = candidates[c];
					if (!candidateActive[candidateIndex]) continue;
					const candidate = from[candidateIndex];
					if ((softMatches && canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate)) || sharesMatchKey(element, candidate)) && !this.#holdsOtherChoice(candidate, element)) {
						siblings.take(target, candidateIndex, Operation.SameElement);
						break;
					}
				}
			}
		}
		#matchElementsById(siblings) {
			const { to, candidateElementsById, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const id = idOf(to[target]);
				if (id === "") continue;
				const candidates = candidateElementsById.get(id);
				if (candidates === void 0) continue;
				for (let c = 0; c < candidates.length; c++) {
					const candidateIndex = candidates[c];
					if (candidateActive[candidateIndex] && siblings.sameKind(target, candidateIndex)) {
						siblings.take(target, candidateIndex, Operation.SameElement);
						break;
					}
				}
			}
		}
		#leaveClaimedTargets(siblings, parent) {
			const { to, unmatchedElements, unmatchedActive } = siblings;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (unmatchedActive[target] && this.#canClaim(to[target], parent)) unmatchedActive[target] = 0;
			}
		}
		#matchElementsByIdSets(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const idArray = this.#idArrayMap.get(to[target]);
				if (!idArray) continue;
				candidateLoop: for (let c = 0; c < candidateElements.length; c++) {
					const candidateIndex = candidateElements[c];
					if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue;
					const candidateIdSet = this.#idSetMap.get(from[candidateIndex]);
					if (!candidateIdSet) continue;
					for (let a = 0; a < idArray.length; a++) if (candidateIdSet.has(idArray[a])) {
						siblings.take(target, candidateIndex, Operation.SameElement);
						break candidateLoop;
					}
				}
			}
		}
		#matchElementsByChoices(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			const choiceCandidates = [];
			for (let c = 0; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c];
				if (!candidateActive[candidateIndex]) continue;
				const candidate = from[candidateIndex];
				const dirtyChoices = this.#dirtyChoicesOf(candidate);
				if (dirtyChoices && (this.#holdsOwnChoices(candidate) || canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate)))) choiceCandidates.push([
					candidateIndex,
					dirtyChoices.choices,
					dirtyChoices.picked
				]);
			}
			choiceCandidates.sort((a, b) => b[1].length - a[1].length);
			const attributeKeys = /* @__PURE__ */ new Map();
			const indexKey = (element, choice, sameAttributes) => {
				if (!sameAttributes) return choice;
				let key = attributeKeys.get(element);
				if (key === void 0) attributeKeys.set(element, key = attributesKeyOf(element, STYLING_ATTRIBUTES));
				return `${key}\n${choice}`;
			};
			for (const [identified, sameAttributes, allChoices, pickedOnly] of CHOICE_PASSES) {
				const choicesOf = (k) => choiceCandidates[k][pickedOnly ? 2 : 1];
				const takes = (k, target) => {
					const candidateIndex = choiceCandidates[k][0];
					if (!siblings.sameKind(target, candidateIndex)) return false;
					const candidate = from[candidateIndex];
					const element = to[target];
					return hasSameIs(candidate, element) && identified === (this.#holdsOwnChoices(candidate) ? this.#idArrayMap.has(element) : !canSoftMatchByTagName(element, this.#idArrayMap.has(element))) && this.#holdsChoices(choicesOf(k), element, allChoices);
				};
				const targets = unmatchedElements.filter((i) => unmatchedActive[i]);
				if (allChoices) targets.sort((a, b) => this.#targetChoicesOf(to[a]).size - this.#targetChoicesOf(to[b]).size);
				const holders = /* @__PURE__ */ new Map();
				for (const target of targets) {
					const element = to[target];
					for (const choice of this.#targetChoicesOf(element).counts.keys()) {
						const key = indexKey(element, choice, sameAttributes);
						const list = holders.get(key);
						if (list) list.push(target);
						else holders.set(key, [target]);
					}
				}
				const listsOf = (k) => {
					const candidate = from[choiceCandidates[k][0]];
					let candidateLists = [];
					for (const choice of new Set(choicesOf(k))) {
						const list = holders.get(indexKey(candidate, choice, sameAttributes));
						if (list) candidateLists.push(list);
						else if (allChoices) return [];
					}
					if (allChoices && candidateLists.length) candidateLists = [candidateLists.reduce((a, b) => b.length < a.length ? b : a)];
					return candidateLists;
				};
				const likenessOf = (k) => {
					const candidate = from[choiceCandidates[k][0]];
					return JSON.stringify([
						namespaceURIOf(candidate),
						localNameOf(candidate),
						getAttribute(candidate, "is"),
						this.#holdsOwnChoices(candidate),
						allChoices && [...choicesOf(k)].sort(),
						sameAttributes && indexKey(candidate, "", true)
					]);
				};
				const matching = new ChoiceMatching(targets, takes, listsOf, likenessOf);
				for (let k = 0; k < choiceCandidates.length; k++) if (candidateActive[choiceCandidates[k][0]] && choicesOf(k).length) matching.assignFree(k);
				matching.assignRest();
				for (const [target, k] of matching.owners) siblings.take(target, choiceCandidates[k][0], Operation.SameElement);
			}
		}
		#takeEqualTargets(siblings) {
			const { to, unmatchedElements, candidateActive, matches, op } = siblings;
			let equalTargets = null;
			const firstEqual = /* @__PURE__ */ new Map();
			for (const [shape, candidates] of siblings.dirtyCandidatesByShape) for (const candidateIndex of candidates) {
				if (!candidateActive[candidateIndex]) continue;
				if (!equalTargets) {
					equalTargets = /* @__PURE__ */ new Map();
					for (const target of unmatchedElements) {
						if (op[target] !== Operation.EqualNode) continue;
						const element = to[target];
						if (this.#holdsClobbered(element)) continue;
						const targetShape = shapeOf(element);
						const list = equalTargets.get(targetShape);
						if (list) list.push(target);
						else equalTargets.set(targetShape, [target]);
					}
				}
				const list = equalTargets.get(shape);
				if (!list) continue;
				const t = firstEqual.get(list) ?? 0;
				const target = list[t];
				if (target === void 0) continue;
				firstEqual.set(list, t + 1);
				candidateActive[matches[target]] = 1;
				siblings.displaced.push(matches[target]);
				siblings.take(target, candidateIndex, Operation.SameElement);
			}
			if (siblings.displaced.length) this.#matchEqualElements(siblings);
		}
		#matchElementsByAttributes(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const element = to[target];
				if (!hasMatchKeyAttribute(element)) continue;
				for (let c = 0; c < candidateElements.length; c++) {
					const candidateIndex = candidateElements[c];
					if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue;
					const candidate = from[candidateIndex];
					if (sharesMatchKey(element, candidate) && !this.#holdsOtherChoice(candidate, element)) {
						siblings.take(target, candidateIndex, Operation.SameElement);
						break;
					}
				}
			}
		}
		#matchElementsByKind(siblings) {
			const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings;
			let firstActiveCandidate = 0;
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				if (!unmatchedActive[target]) continue;
				const element = to[target];
				if (!canSoftMatchByTagName(element, this.#idArrayMap.has(element))) continue;
				while (firstActiveCandidate < candidateElements.length && !candidateActive[candidateElements[firstActiveCandidate]]) firstActiveCandidate++;
				for (let c = firstActiveCandidate; c < candidateElements.length; c++) {
					const candidateIndex = candidateElements[c];
					if (!candidateActive[candidateIndex]) continue;
					const candidate = from[candidateIndex];
					if (!canSoftMatchByTagName(candidate, this.#idSetMap.has(candidate))) continue;
					if (siblings.sameKind(target, candidateIndex) && !this.#holdsOtherChoice(candidate, element)) {
						siblings.take(target, candidateIndex, Operation.SameElement);
						break;
					}
				}
			}
		}
		#orderIdenticalCandidates(siblings) {
			const { from, to, unmatchedElements, matches, op, candidateActive } = siblings;
			const dirtyElements = this.#dirtyElements;
			if (dirtyElements) {
				const candidates = [];
				const changed = [];
				const targetOf = [];
				for (let i = 0; i < unmatchedElements.length; i++) {
					const target = unmatchedElements[i];
					const candidate = matches[target];
					if (candidate === void 0) continue;
					const isChanged = dirtyElements.has(from[candidate]);
					if (isChanged && this.#holdsClobbered(to[target])) continue;
					if (isChanged) changed.push(candidate);
					candidates.push(candidate);
					targetOf[candidate] = target;
				}
				if (changed.length) {
					const keyOf = (index) => `${localNameOf(from[index])} ${textContentOf(from[index])}`;
					const changedKeys = new Set(changed.map(keyOf));
					const candidatesByShape = /* @__PURE__ */ new Map();
					for (const candidate of candidates) {
						if (!changedKeys.has(keyOf(candidate))) continue;
						const target = to[targetOf[candidate]];
						const choices = [...this.#targetChoicesOf(target).counts].map(([choice, count]) => `${count} ${choice}`).sort();
						if (choices.length) choices.push(attributesKeyOf(target, STYLING_ATTRIBUTES));
						const shape = shapeOf(from[candidate]) + outlineOf(target) + JSON.stringify(choices);
						const bucket = candidatesByShape.get(shape);
						if (bucket) bucket.push(candidate);
						else candidatesByShape.set(shape, [candidate]);
					}
					const ordered = matches.slice();
					let reordered = false;
					const isChanged = (candidate) => dirtyElements.has(from[candidate]);
					const goingByShape = /* @__PURE__ */ new Map();
					for (const candidateIndex of siblings.candidateElements) {
						if (!candidateActive[candidateIndex] || isChanged(candidateIndex) || !changedKeys.has(keyOf(candidateIndex))) continue;
						const shape = shapeOf(from[candidateIndex]);
						const going = goingByShape.get(shape);
						if (going) going.push(candidateIndex);
						else goingByShape.set(shape, [candidateIndex]);
					}
					const buckets = [...candidatesByShape.values()].filter((bucket) => bucket.some(isChanged));
					const goingOf = buckets.map((bucket) => goingByShape.size ? goingByShape.get(shapeOf(from[bucket[0]])) : void 0);
					const order = buckets.map((_, b) => b).sort((a, b) => Number(!!goingOf[a]) - Number(!!goingOf[b]));
					const targetsOf = buckets.map((bucket) => bucket.map((candidate) => targetOf[candidate]).sort((a, b) => a - b));
					const canTake = (candidate, target) => !isChanged(candidate) || !this.#holdsClobbered(to[target]);
					let budget = STAYING_CELLS;
					for (const b of [...order, ...order.filter((b) => goingOf[b])]) {
						let bucket = buckets[b];
						const targets = targetsOf[b];
						const going = goingOf[b];
						const cells = going?.length ? (bucket.length + going.length + 1) * (going.length + 1) + ordered.length : 0;
						if (going?.length && cells <= budget) {
							budget -= cells;
							const staying = new Set(bucket);
							bucket = buckets[b] = chooseStaying([...bucket, ...going], targets, ordered, isChanged, staying, canTake);
							const stays = new Set(bucket);
							for (const candidate of [...staying, ...going]) candidateActive[candidate] = stays.has(candidate) ? 0 : 1;
							going.splice(0, going.length, ...[...staying, ...going].filter((candidate) => !stays.has(candidate)));
						} else bucket.sort((a, b) => a - b);
						const takers = takeInOrder(bucket, targets, isChanged, (target) => this.#holdsClobbered(to[target]));
						for (let t = 0; t < targets.length; t++) if (ordered[targets[t]] !== takers[t]) {
							ordered[targets[t]] = takers[t];
							reordered = true;
						}
					}
					if (reordered) for (let i = 0; i < unmatchedElements.length; i++) {
						const target = unmatchedElements[i];
						const candidate = matches[target] = ordered[target];
						if (candidate !== void 0 && dirtyElements.has(from[candidate])) op[target] = Operation.SameElement;
					}
				}
			}
			const { candidateElementsById } = siblings;
			const candidates = [];
			const changed = [];
			const targetOf = [];
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i];
				const candidate = matches[target];
				if (candidate === void 0 || dirtyElements?.has(from[candidate])) continue;
				const id = idOf(from[candidate]);
				if (id !== "" && candidateElementsById.get(id).length === 1) continue;
				candidates.push(candidate);
				targetOf[candidate] = target;
				if (op[target] !== Operation.EqualNode) changed.push(candidate);
			}
			if (changed.length) {
				const candidatesByText = changed.length * candidates.length > 1024 ? bucketByTextContent(from, candidates) : null;
				const identicalTo = (candidate) => (candidatesByText ? candidatesByText.get(textContentOf(from[candidate])) : candidates).filter((other) => other === candidate || isEqualNode(from[other], from[candidate]));
				const ordered = matches.slice();
				if (orderSets(ordered, changed, targetOf, identicalTo) && longestIncreasingSubsequence(ordered).length > longestIncreasingSubsequence(matches).length) for (let target = 0; target < ordered.length; target++) matches[target] = ordered[target];
			}
		}
		#matchEqualNodes(siblings) {
			const { from, to, candidateNodes, unmatchedNodes, candidateActive } = siblings;
			for (let i = 0; i < unmatchedNodes.length; i++) {
				const target = unmatchedNodes[i];
				const node = to[target];
				for (let c = 0; c < candidateNodes.length; c++) {
					const candidateIndex = candidateNodes[c];
					if (candidateActive[candidateIndex] && isEqualNode(from[candidateIndex], node)) {
						siblings.take(target, candidateIndex, Operation.EqualNode);
						break;
					}
				}
			}
		}
		#matchNodesByType(siblings) {
			const { from, to, candidateNodes, unmatchedNodes, candidateActive, unmatchedActive } = siblings;
			for (let i = 0; i < unmatchedNodes.length; i++) {
				const target = unmatchedNodes[i];
				if (!unmatchedActive[target]) continue;
				const nodeType = nodeTypeOf(to[target]);
				for (let c = 0; c < candidateNodes.length; c++) {
					const candidateIndex = candidateNodes[c];
					if (candidateActive[candidateIndex] && nodeType === nodeTypeOf(from[candidateIndex])) {
						siblings.take(target, candidateIndex, Operation.SameNode);
						break;
					}
				}
			}
		}
		#placeChildren(parent, siblings) {
			const { from, to, matches, op } = siblings;
			const lisIndices = longestIncreasingSubsequence(this.#pinFocused(parent, siblings));
			const shouldNotMove = new Array(from.length);
			for (let i = 0; i < lisIndices.length; i++) shouldNotMove[matches[lisIndices[i]]] = true;
			const liveWhitespace = siblings.whitespace.length ? /* @__PURE__ */ new Set() : null;
			for (let i = 0; i < siblings.whitespace.length; i++) liveWhitespace.add(from[siblings.whitespace[i]]);
			let insertionPoint = firstChildOf(parent);
			const placed = [];
			for (let i = 0; i < to.length; i++) {
				if (insertionPoint && parentNodeOf(insertionPoint) !== parent) {
					insertionPoint = firstChildOf(parent);
					for (let index = placed.length - 1; index >= 0; index--) if (parentNodeOf(placed[index]) === parent) {
						insertionPoint = nextSiblingOf(placed[index]);
						break;
					}
				}
				const node = to[i];
				const matchInd = matches[i];
				if (insertionPoint && liveWhitespace?.has(insertionPoint) && isWhitespaceTextNode(node)) {
					const whitespace = insertionPoint;
					liveWhitespace.delete(whitespace);
					placed.push(whitespace);
					insertionPoint = nextSiblingOf(whitespace);
					this.#morphOneToOne(whitespace, node);
				} else if (matchInd !== void 0) {
					const match = from[matchInd];
					const operation = op[i];
					if (!shouldNotMove[matchInd]) {
						const outsideRadios = this.#uncheckRadiosNamingFormsIn(match, getRootNode(match));
						const focus = this.#watchFocus(match, parent);
						moveBefore(parent, match, insertionPoint);
						if (focus) this.#restoreFocus(focus);
						this.#checkRadios(outsideRadios);
					}
					if (parentNodeOf(match) === parent) insertionPoint = nextSiblingOf(match);
					if (operation === Operation.EqualNode) {} else if (operation === Operation.SameElement) {
						if (isEqualNode(match, node)) {} else if (hasSameIs(match, node)) this.#morphMatchingElements(match, node);
						else this.#morphNonMatchingElements(match, node);
					} else this.#morphOneToOne(match, node);
					placed.push(parentNodeOf(match) === parent ? match : node);
				} else {
					const added = this.#addNode(parent, node, insertionPoint);
					if (added) placed.push(added);
					if (added === node && parentNodeOf(node) === parent) insertionPoint = nextSiblingOf(node);
				}
			}
			if (liveWhitespace) {
				for (const whitespace of liveWhitespace) if (parentNodeOf(whitespace) === parent) this.#removeNode(whitespace);
			}
		}
		#watchFocus(node, parent) {
			const focus = focusHeldBy(node);
			if (!focus) return null;
			/* v8 ignore next */
			const destination = nodeTypeOf(parent) === DOCUMENT_NODE_TYPE ? parent : ownerDocumentOf(parent);
			this.#watchedFocus = focus;
			this.#watchedDocuments = destination === focus.document ? [destination] : [focus.document, destination];
			for (const document of this.#watchedDocuments) EventTarget.prototype.addEventListener.call(document, "focusin", this.#noteFocusTaken, true);
			return focus;
		}
		#noteFocusTaken = (event) => {
			const focus = this.#watchedFocus;
			if (event.composedPath()[0] !== focus.element) focus.taken = true;
		};
		#restoreFocus(focus) {
			const retry = restoreFocus(focus);
			for (const document of this.#watchedDocuments) removeEventListener(document, "focusin", this.#noteFocusTaken);
			this.#watchedFocus = null;
			this.#watchedDocuments = [];
			if (!retry) return;
			const unrestored = this.#unrestoredFocus;
			/* v8 ignore next -- tests haven't found a way to take focus between a failed restore and the retry */
			if (unrestored) removeEventListener(unrestored.document, "focusin", this.#dropUnrestoredFocus);
			focus.document = ownerDocumentOf(focus.element);
			this.#unrestoredFocus = focus;
			EventTarget.prototype.addEventListener.call(focus.document, "focusin", this.#dropUnrestoredFocus, {
				capture: true,
				once: true
			});
		}
		/* v8 ignore start -- as above */
		#dropUnrestoredFocus = () => {
			this.#unrestoredFocus = null;
		};
		/* v8 ignore stop */
		#pinFocused(parent, siblings) {
			const { from, matches } = siblings;
			const holders = this.#focusHolders;
			/* v8 ignore start -- only browsers without moveBefore pin the focused child */
			if (SUPPORTS_MOVE_BEFORE || !holders?.has(parent)) return matches;
			const pinnedIndex = matches.findIndex((match) => match !== void 0 && holders.has(from[match]));
			if (pinnedIndex === -1) return matches;
			const pinned = matches[pinnedIndex];
			return matches.map((match, i) => (i < pinnedIndex ? match < pinned : i > pinnedIndex ? match > pinned : true) ? match : void 0);
		}
		/* v8 ignore stop */
		setEnclosingSelect(select, selection) {
			this.#enclosingSelect = [select, selection];
		}
		#syncEnclosingSelect() {
			const enclosing = this.#enclosingSelect;
			if (!enclosing) return;
			this.#enclosingSelect = null;
			const [select, selection] = enclosing;
			if (this.#preserveChanges) return;
			const newSelection = markupSelectionOf(select);
			if (newSelection.length === selection.length && newSelection.every((option, i) => option === selection[i])) return;
			this.#syncDefaultSelection(select);
		}
		#syncDefaultSelection(select) {
			if (this.#preserveChanges) return;
			const options = select.options;
			const vetoed = this.#vetoedControls;
			if (vetoed) {
				for (let i = 0; i < options.length; i++) if (vetoed.has(options[i])) return;
			}
			const defaultOption = select.multiple ? null : defaultOptionOf(select);
			for (let i = 0; i < options.length; i++) {
				const option = options[i];
				const selected = select.multiple ? option.hasAttribute("selected") : option === defaultOption;
				if (option.selected !== selected) option.selected = selected;
			}
			(this.#syncedSelects ??= /* @__PURE__ */ new Set()).add(select);
		}
		#noteAddedRadios(element) {
			const inputs = isInputElement(element) ? [element] : getElementsByTagName(element, "input");
			for (let i = 0; i < inputs.length; i++) {
				const input = inputs[i];
				if (isInputElement(input) && input.type === "radio" && (input.checked || input.hasAttribute("checked"))) (this.#radiosToSync ??= /* @__PURE__ */ new Set()).add(input);
			}
		}
		#noteRadioGroups(element) {
			const inputs = isInputElement(element) ? [element] : querySelectorAll(element, "input");
			const groups = /* @__PURE__ */ new Map();
			for (let i = 0; i < inputs.length; i++) {
				const input = inputs[i];
				if (isInputElement(input) && input.type === "radio") {
					const radios = this.#radiosToSync ??= /* @__PURE__ */ new Set();
					for (const member of radioGroupOf(input, groups)) radios.add(member);
				}
			}
		}
		#uncheckRadiosForMove(element, parent) {
			const outside = this.#uncheckRadiosNamingFormsIn(element, getRootNode(element));
			if (!this.#preserveChanges) {
				const inputs = isInputElement(element) ? [element] : querySelectorAll(element, "input");
				for (let i = 0; i < inputs.length; i++) {
					const input = inputs[i];
					if (isCheckedRadio(input) && input.form !== formAfterMove(input, element, parent)) {
						input.checked = false;
						(this.#radiosUncheckedForMove ??= /* @__PURE__ */ new Set()).add(input);
					}
				}
			}
			return outside;
		}
		#uncheckRadiosNamingFormsIn(node, root, inside = false) {
			if (!isElement(node)) return null;
			let ids = null;
			const forms = isFormElement(node) ? [node] : getElementsByTagName(node, "form");
			for (let i = 0; i < forms.length; i++) {
				const form = forms[i];
				if (idOf(form) !== "" && isFormElement(form)) (ids ??= /* @__PURE__ */ new Set()).add(idOf(form));
			}
			return ids && this.#uncheckRadiosNaming(ids, root, inside ? null : node);
		}
		#uncheckRadiosNaming(ids, root, except) {
			let unchecked = null;
			const inputs = querySelectorAll(root, "input[form]:checked");
			for (let i = 0; i < inputs.length; i++) {
				const input = inputs[i];
				if (isCheckedRadio(input) && ids.has(input.getAttribute("form")) && !(except && contains(except, input))) {
					this.#uncheckRadio(input);
					(unchecked ??= []).push(input);
				}
			}
			return unchecked;
		}
		#uncheckRadiosForAttribute(element, name, value) {
			if ((name === "form" || name === "name") && isCheckedRadio(element)) {
				this.#uncheckRadio(element);
				return [element];
			}
			if (name === "id" && isFormElement(element)) {
				const ids = new Set(value === null || value === "" ? [idOf(element)] : [idOf(element), value]);
				return this.#uncheckRadiosNaming(ids, getRootNode(element), null);
			}
			return null;
		}
		#uncheckRadio(radio) {
			const value = this.#defersRadio(radio) ? null : radio.getAttribute("checked");
			if (value !== null) {
				radio.removeAttribute("checked");
				if (!radio.checked) {
					uncheckedByAttribute.set(radio, value);
					return;
				}
				radio.setAttribute("checked", value);
			}
			radio.checked = false;
		}
		#checkRadios(radios, immediate = false) {
			if (!radios) return;
			const groups = /* @__PURE__ */ new Map();
			for (let i = 0; i < radios.length; i++) {
				const radio = radios[i];
				if (!immediate && this.#defersRadio(radio) && !uncheckedByAttribute.has(radio)) {
					(this.#radiosUncheckedForMove ??= /* @__PURE__ */ new Set()).add(radio);
					continue;
				}
				const group = radioGroupOf(radio, groups);
				const checkedInMorph = this.#inScope(radio) ? void 0 : group.find((member) => member.checked && this.#inScope(member));
				const checked = group.filter((member) => member.checked);
				const value = uncheckedByAttribute.get(radio);
				if (value !== void 0) {
					uncheckedByAttribute.delete(radio);
					radio.setAttribute("checked", value);
					/* v8 ignore next -- Firefox can stop a radio following the attribute while it changes form */
					if (!radio.checked) radio.checked = true;
				} else radio.checked = true;
				if (checkedInMorph) {
					checkedInMorph.checked = true;
					(this.#displacedRadios ??= /* @__PURE__ */ new Map()).set(radio, checkedInMorph);
				}
				for (let j = 0; j < checked.length; j++) {
					const member = checked[j];
					if (!member.checked) (this.#displacedRadios ??= /* @__PURE__ */ new Map()).set(member, radio);
				}
			}
		}
		#restoreDisplacedRadios(displaced) {
			const groups = /* @__PURE__ */ new Map();
			for (const [member, radio] of displaced) {
				const group = radioGroupOf(member, groups);
				if (radio.checked && group.includes(radio)) continue;
				if (group.some((other) => other.checked)) continue;
				const value = member.getAttribute("checked");
				if (value !== null) {
					member.removeAttribute("checked");
					member.setAttribute("checked", value);
				}
				/* v8 ignore next -- Chromium doesn't check a radio again by its attribute once its group has unchecked it */
				if (!member.checked) member.checked = true;
			}
		}
		#defersRadio(radio) {
			if (this.#preserveChanges) return false;
			const scope = this.#clobberedScope;
			return scope ? contains(scope, radio) : this.#inScope(radio);
		}
		#removeChild(node) {
			const radios = this.#uncheckRadiosNamingFormsIn(node, getRootNode(node));
			remove(node);
			this.#checkRadios(radios);
		}
		#syncRadioGroups(radios) {
			const done = /* @__PURE__ */ new Set();
			const groups = /* @__PURE__ */ new Map();
			for (const radio of radios) {
				if (done.has(radio)) continue;
				const group = radioGroupOf(radio, groups).filter((member) => this.#inScope(member));
				for (const member of group) done.add(member);
				if (group.some((member) => this.#isVetoed(member))) continue;
				let last = null;
				for (const member of group) if (member.hasAttribute("checked")) last = member;
				for (const member of group) {
					const checked = member === last;
					if (member.checked !== checked) member.checked = checked;
				}
			}
		}
		#inScope(node) {
			if (!contains(this.#scope, node)) return false;
			const start = this.#scopeStart;
			const end = this.#scopeEnd;
			if (start && (contains(start, node) || !(compareDocumentPosition(start, node) & Node.DOCUMENT_POSITION_FOLLOWING))) return false;
			if (end && (contains(end, node) || !(compareDocumentPosition(end, node) & Node.DOCUMENT_POSITION_PRECEDING))) return false;
			return true;
		}
		#isVetoed(control) {
			if (this.#vetoedControls?.has(control)) return true;
			const nodes = this.#vetoedNodes;
			if (nodes) {
				for (let i = 0; i < nodes.length; i++) if (contains(nodes[i], control)) return true;
			}
			return false;
		}
		#holdsOwnChoices(candidate) {
			return this.#flagged.has(candidate) || isSelectElement(candidate);
		}
		#holdsOtherChoice(candidate, element) {
			return this.#preserveChanges && this.#flagged.has(candidate) && !this.#clobbered?.has(element) && this.#choiceOf(candidate) !== this.#choiceOf(element);
		}
		#holdsChoices(choices, element, all) {
			const targetChoices = this.#targetChoicesOf(element).counts;
			if (!all) return choices.some((choice) => targetChoices.has(choice));
			for (const [choice, count] of countChoices(choices)) if ((targetChoices.get(choice) ?? 0) < count) return false;
			return true;
		}
		#targetChoicesOf(element) {
			let targetChoices = this.#targetChoices.get(element);
			if (!targetChoices) {
				const choices = [];
				for (const control of [element, ...querySelectorAll(element, "input, option")]) {
					if (this.#isClobberedWithin(control, element) || this.#movesWithin(control, element)) continue;
					const choice = this.#choiceOf(control);
					if (choice !== null) choices.push(pathTo(control, element) + choice);
				}
				targetChoices = {
					counts: countChoices(choices),
					size: choices.length
				};
				this.#targetChoices.set(element, targetChoices);
			}
			return targetChoices;
		}
		#movesWithin(control, wrapper) {
			for (let node = control; node !== wrapper; node = parentElementOf(node)) {
				const live = this.#movableElement(idOf(node));
				const target = live && this.#targetElementsById.get(idOf(node));
				if (target && canMorphElementInPlace(live, target)) return true;
			}
			return false;
		}
		#holdsClobbered(element) {
			const clobbered = this.#clobbered;
			if (!clobbered) return false;
			if (!this.#clobberedHolders) {
				this.#clobberedHolders = /* @__PURE__ */ new Set();
				for (const node of clobbered) for (let holder = node; holder && !this.#clobberedHolders.has(holder); holder = parentElementOf(holder)) this.#clobberedHolders.add(holder);
			}
			return this.#clobberedHolders.has(element);
		}
		#isClobberedWithin(control, element) {
			const clobbered = this.#clobbered;
			if (!clobbered) return false;
			for (let node = control; node; node = node === element ? null : parentElementOf(node)) if (clobbered.has(node)) return true;
			return false;
		}
		#choiceOf(element) {
			if (!isOptionElement(element)) return choiceOf(element, null);
			let select = null;
			for (let node = element, parent = parentElementOf(node); parent && node !== this.#root && !this.#targetRoots.has(node); node = parent, parent = parentElementOf(parent)) {
				if (localNameOf(parent) === "datalist" && namespaceURIOf(parent) === HTML_NAMESPACE) return null;
				if (isSelectElement(parent)) {
					select = parent;
					break;
				}
			}
			select ??= this.#keySelect;
			return choiceOf(element, (select && this.#liveSelects.get(select)) ?? select);
		}
		#dirtyChoicesOf(element) {
			if (!this.#dirtyElements?.has(element)) return null;
			const choices = [];
			const picked = [];
			for (const control of [element, ...querySelectorAll(element, "input, option")]) {
				const choice = this.#flagged.has(control) && !this.#movesWithin(control, element) ? this.#choiceOf(control) : null;
				if (choice === null) continue;
				const key = pathTo(control, element) + choice;
				choices.push(key);
				if (control === element || !isLeftChoice(control)) picked.push(key);
			}
			return choices.length ? {
				choices,
				picked
			} : null;
		}
		#noteVetoedAttribute(element, name, namespaceURI) {
			if (namespaceURI !== null) return;
			if (name === "selected" && isOptionElement(element) || name === "checked" && isInputElement(element) || name === "open" && isDetailsElement(element)) (this.#vetoedControls ??= /* @__PURE__ */ new Set()).add(element);
		}
		#visitTemplateContent(from, to) {
			if (isEqualNode(from.content, to.content)) return;
			from.content.replaceChildren(to.content);
		}
		#addNode(parent, node, insertionPoint) {
			const placeholder = isElement(node) ? this.#claimMovableElement(node, parent) : null;
			if (placeholder) {
				insertBefore(parent, placeholder, insertionPoint);
				return placeholder;
			}
			return this.#insertNewNode(parent, node, insertionPoint) ? node : null;
		}
		#insertNewNode(parent, node, insertionPoint, approved = false) {
			if (!approved && !(this.#options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true)) return false;
			const sourceRadios = isConnected(node) ? this.#uncheckRadiosNamingFormsIn(node, getRootNode(node), true) : null;
			const focus = this.#watchFocus(node, parent);
			clearImplicitSelection(node, parent);
			this.#placeMovableDescendants(node, parent);
			if (this.#targetOpensDetails && isElement(node)) this.#noteAddedDetails(node);
			const radios = this.#uncheckRadiosNamingFormsIn(node, getRootNode(parent));
			insertBefore(parent, node, insertionPoint);
			if (focus) this.#restoreFocus(focus);
			this.#checkRadios(radios);
			this.#checkRadios(sourceRadios, true);
			if (this.#targetChecksInputs && !this.#preserveChanges && isElement(node)) this.#noteAddedRadios(node);
			this.#options.afterNodeAdded?.(node);
			return true;
		}
		#completeMove(move) {
			const { live, target, placeholder, preserveChanges, approved } = move;
			if (!this.#claimedElements.has(live) || this.#movesInProgress.has(move)) return;
			this.#movesInProgress.add(move);
			let inCycle = false;
			for (let ancestor = parentElementOf(live); ancestor && !inCycle;) {
				const first = this.#claimedElements.get(ancestor) ?? this.#moveReaching(ancestor);
				if (!first) ancestor = parentElementOf(ancestor);
				else if (this.#movesInProgress.has(first)) inCycle = true;
				else {
					this.#completeMove(first);
					ancestor = parentElementOf(live);
				}
			}
			this.#movesInProgress.delete(move);
			this.#claimedElements.delete(live);
			const parent = parentNodeOf(placeholder);
			if (!parent) return;
			const saved = this.#preserveChanges;
			const savedScope = this.#clobberedScope;
			this.#preserveChanges = preserveChanges;
			if (!preserveChanges && this.#options.preserveChanges) this.#clobberedScope = live;
			if (!inCycle && this.#liveElementsById.get(idOf(target)) === live && !contains(live, parent)) {
				this.#liveElementsById.delete(idOf(target));
				const outsideRadios = this.#uncheckRadiosForMove(live, parent);
				const focus = this.#watchFocus(live, parent);
				moveInto(parent, live, placeholder);
				if (focus) this.#restoreFocus(focus);
				remove(placeholder);
				this.#checkRadios(outsideRadios);
				if (!this.#preserveChanges) this.#noteRadioGroups(live);
				this.#morphOneToOne(live, target);
			} else {
				this.#insertNewNode(parent, target, placeholder, approved);
				remove(placeholder);
			}
			this.#preserveChanges = saved;
			this.#clobberedScope = savedScope;
		}
		#replaceNode(node, newNode) {
			const parent = parentNodeOf(node);
			if (!parent) throw new Error(DETACHED_NODE_ERROR);
			const insertionPoint = node;
			if ((this.#options.beforeNodeRemoved?.(node) ?? true) && (this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true)) {
				const placeholder = isElement(newNode) ? this.#claimMovableElement(newNode, parent, void 0, true) : null;
				if (placeholder) insertBefore(parent, placeholder, insertionPoint);
				else this.#insertNewNode(parent, newNode, insertionPoint, true);
				this.#removeApprovedNode(node);
			}
			this.#settleIfRoot(node);
		}
		#removeNode(node, settled = false) {
			if (!settled && isElement(node) && this.#movableElement(idOf(node)) === node) {
				(this.#unplacedElements ??= []).push(node);
				return;
			}
			if (this.#options.beforeNodeRemoved?.(node) ?? true) this.#removeApprovedNode(node, settled);
		}
		#removeApprovedNode(node, settled = false) {
			if (!settled && this.#holdsMovableElement(node)) (this.#deferredRemovals ??= []).push(node);
			else {
				this.#removeChild(node);
				this.#options.afterNodeRemoved?.(node);
			}
		}
		#pinSubtree(node) {
			(this.#vetoedNodes ??= []).push(node);
			const ids = this.#idSetMap.get(node);
			if (!ids) return;
			for (const id of ids) {
				const live = this.#liveElementsById.get(id);
				if (live && live !== node) this.#liveElementsById.set(id, null);
			}
		}
		#movableElement(id) {
			if (id === "" || this.#targetIdCounts.get(id) !== 1) return null;
			const live = this.#liveElementsById.get(id);
			if (!live || isOptionElement(live) || isOptgroupElement(live)) return null;
			return live;
		}
		#holdsMovableElement(node) {
			const ids = this.#idSetMap.get(node);
			if (!ids) return false;
			for (const id of ids) {
				const live = this.#movableElement(id);
				if (live && live !== node && contains(node, live)) return true;
			}
			return false;
		}
		#canClaim(target, parent, select = selectAt(parent)) {
			const live = this.#movableElement(idOf(target));
			return live !== null && canMorphElementInPlace(live, target) && !contains(live, parent) && !this.#wrapsMovableAncestor(live, target, select) && !movesOptionsBetweenSelects(live, select);
		}
		#wrapsMovableAncestor(live, target, select) {
			const ids = this.#idArrayMap.get(target);
			if (!ids) return false;
			for (let ancestor = parentElementOf(live); ancestor; ancestor = parentElementOf(ancestor)) {
				const id = idOf(ancestor);
				if (id !== "" && this.#movableElement(id) === ancestor && ids.includes(id) && canMoveInto(ancestor, target, select)) return true;
			}
			return false;
		}
		#claimMovableElement(target, parent, select = selectAt(parent), approved = false) {
			if (!this.#canClaim(target, parent, select)) return null;
			const live = this.#liveElementsById.get(idOf(target));
			const placeholder = createComment(ownerDocumentOf(live), "");
			const move = {
				live,
				target,
				placeholder,
				preserveChanges: this.#preserveChanges && !this.#clobbered?.has(target),
				approved,
				select
			};
			(this.#pendingMoves ??= []).push(move);
			this.#claimedElements.set(live, move);
			const ids = this.#idArrayMap.get(target);
			if (ids) for (const id of ids) this.#movesByTargetId.set(id, move);
			return placeholder;
		}
		#moveReaching(element) {
			if (this.#movableElement(idOf(element)) !== element) return void 0;
			const move = this.#movesByTargetId.get(idOf(element));
			return move && this.#claimedElements.has(move.live) && canMoveInto(element, move.target, move.select) ? move : void 0;
		}
		#placeMovableDescendants(node, parent) {
			if (!isElement(node)) return;
			if (!this.#idArrayMap.get(node)?.some((id) => id !== idOf(node) && this.#movableElement(id))) return;
			this.#placeMovableChildren(node, selectAt(parent));
		}
		#placeMovableChildren(parent, outerSelect) {
			const preserveChanges = this.#preserveChanges;
			if (preserveChanges && this.#clobbered?.has(parent)) this.#preserveChanges = false;
			const select = isSelectElement(parent) ? parent : outerSelect;
			let target = firstElementChildOf(parent);
			while (target) {
				const next = nextElementSiblingOf(target);
				if (this.#idArrayMap.has(target)) {
					const placeholder = this.#claimMovableElement(target, parent, select);
					if (placeholder) replaceChild(parent, placeholder, target);
					else this.#placeMovableChildren(target, select);
				}
				target = next;
			}
			this.#preserveChanges = preserveChanges;
		}
		#mapIdArraysForEach(nodeList) {
			for (const childNode of nodeList) if (isParentNode(childNode)) this.#mapIdArrays(childNode);
		}
		#mapIdArrays(node, countRoot = true) {
			const idArrayMap = this.#idArrayMap;
			if (!this.#targetChecksInputs) this.#targetChecksInputs = isElement(node) && isInputElement(node) ? hasAttribute(node, "checked") : querySelector(node, "input[checked]") !== null;
			if (!this.#targetOpensDetails) this.#targetOpensDetails = isElement(node) && isDetailsElement(node) && hasAttributeNS(node, null, "open") || querySelector(node, "details[open]") !== null;
			const targetIdCounts = this.#targetIdCounts;
			if (countRoot && isElement(node) && idOf(node) !== "") targetIdCounts.set(idOf(node), (targetIdCounts.get(idOf(node)) ?? 0) + 1);
			forEachDescendantElementWithId(node, (element) => {
				const id = idOf(element);
				targetIdCounts.set(id, (targetIdCounts.get(id) ?? 0) + 1);
				this.#targetElementsById.set(id, element);
				let currentElement = element;
				while (currentElement) {
					const idArray = idArrayMap.get(currentElement);
					if (idArray) idArray.push(id);
					else idArrayMap.set(currentElement, [id]);
					if (currentElement === node) break;
					currentElement = parentElementOf(currentElement);
				}
			});
		}
		#mapIdSets(node) {
			const idSetMap = this.#idSetMap;
			const liveElementsById = this.#liveElementsById;
			if (isElement(node) && idOf(node) !== "") liveElementsById.set(idOf(node), null);
			forEachDescendantElementWithId(node, (element) => {
				const id = idOf(element);
				liveElementsById.set(id, liveElementsById.has(id) ? null : element);
				let currentElement = element;
				while (currentElement) {
					const idSet = idSetMap.get(currentElement);
					if (idSet) idSet.add(id);
					else idSetMap.set(currentElement, /* @__PURE__ */ new Set([id]));
					if (currentElement === node) break;
					currentElement = parentElementOf(currentElement);
				}
			});
		}
	};
	function canMoveInto(live, target, select) {
		const element = Array.from(querySelectorAll(target, "[id]")).find((element) => idOf(element) === idOf(live));
		const innerSelect = selectOf(element);
		return canMorphElementInPlace(live, element) && !movesOptionsBetweenSelects(live, innerSelect && contains(target, innerSelect) ? innerSelect : select);
	}
	function forEachDescendantElementWithId(node, callback) {
		for (const element of querySelectorAll(node, "[id]")) if (idOf(element) !== "") callback(element);
	}
	function hasExcessAttributes(from, to) {
		const attributes = attributesOf(from);
		for (let i = 0; i < attributes.length; i++) {
			const { localName, namespaceURI } = attributes[i];
			if (!hasAttributeNS(to, namespaceURI, localName)) return true;
		}
		return false;
	}
	function takeInOrder(candidates, targets, isChanged, discards) {
		let discarding = targets.filter(discards).length;
		if (!discarding) return candidates;
		let untouched = candidates.filter((candidate) => !isChanged(candidate)).length;
		const taken = /* @__PURE__ */ new Set();
		const starts = [
			0,
			0,
			0
		];
		const first = (kind) => {
			let c = starts[kind];
			while (taken.has(candidates[c]) || kind === 1 && isChanged(candidates[c]) || kind === 2 && !isChanged(candidates[c])) c++;
			starts[kind] = c;
			return candidates[c];
		};
		return targets.map((target) => {
			let candidate;
			if (discarding && discards(target)) {
				candidate = first(1);
				discarding--;
			} else candidate = first(untouched > discarding ? 0 : 2);
			taken.add(candidate);
			if (!isChanged(candidate)) untouched--;
			return candidate;
		});
	}
	function chooseStaying(candidates, targets, matches, isChanged, staying, canTake) {
		candidates.sort((a, b) => a - b);
		const n = candidates.length;
		const spare = n - targets.length;
		const width = spare + 1;
		const own = new Set(targets);
		const others = [];
		for (let target = 0; target < matches.length; target++) {
			const candidate = matches[target];
			if (candidate !== void 0 && !own.has(target)) others.push([candidate, target]);
		}
		others.sort((a, b) => a[0] - b[0]);
		const weightOf = (candidate) => isChanged(candidate) ? others.length + 1 : 1;
		const below = new Float64Array(matches.length + 1);
		for (const [candidate, target] of others) below[target + 1] += weightOf(candidate);
		for (let target = 0; target < matches.length; target++) below[target + 1] += below[target];
		const tree = new Float64Array(matches.length + 1);
		const belowBefore = (target) => {
			let weight = 0;
			for (let i = target; i > 0; i -= i & -i) weight += tree[i];
			return weight;
		};
		const cost = new Float64Array((n + 1) * width).fill(Infinity);
		cost[0] = 0;
		let before = 0;
		for (let i = 1, o = 0; i <= n; i++) {
			const candidate = candidates[i - 1];
			for (; o < others.length && others[o][0] < candidate; o++) {
				const weight = weightOf(others[o][0]);
				before += weight;
				for (let t = others[o][1] + 1; t <= matches.length; t += t & -t) tree[t] += weight;
			}
			for (let k = 0; k <= spare && k <= i; k++) {
				const j = i - k;
				if (j > targets.length) continue;
				let best = Infinity;
				if (k > 0 && !isChanged(candidate)) best = cost[(i - 1) * width + k - 1] + (staying.has(candidate) ? 1 : 0);
				const target = targets[j - 1];
				if (target !== void 0 && k < i && canTake(candidate, target)) {
					const crossings = before - 2 * belowBefore(target) + below[target];
					best = Math.min(best, cost[(i - 1) * width + k] + crossings * (n + 1));
				}
				cost[i * width + k] = best;
			}
		}
		if (cost[n * width + spare] === Infinity) return candidates.filter((candidate) => staying.has(candidate));
		const stays = [];
		for (let i = n, k = spare; i > 0; i--) {
			const candidate = candidates[i - 1];
			if (k > 0 && !isChanged(candidate) && cost[i * width + k] === cost[(i - 1) * width + k - 1] + (staying.has(candidate) ? 1 : 0)) k--;
			else stays.push(candidate);
		}
		return stays.reverse();
	}
	function orderSets(matches, changed, targetOf, identicalTo) {
		const grouped = /* @__PURE__ */ new Set();
		let reordered = false;
		for (let i = 0; i < changed.length; i++) {
			const candidate = changed[i];
			if (grouped.has(candidate)) continue;
			const identical = identicalTo(candidate);
			if (identical.length < 2) continue;
			identical.sort((a, b) => a - b);
			const targets = identical.map((other) => targetOf[other]).sort((a, b) => a - b);
			for (let t = 0; t < identical.length; t++) {
				grouped.add(identical[t]);
				if (matches[targets[t]] !== identical[t]) {
					matches[targets[t]] = identical[t];
					reordered = true;
				}
			}
		}
		return reordered;
	}
	function bucketByTextContent(nodes, indices) {
		const buckets = /* @__PURE__ */ new Map();
		for (let i = 0; i < indices.length; i++) {
			const index = indices[i];
			const text = textContentOf(nodes[index]);
			const bucket = buckets.get(text);
			if (bucket) bucket.push(index);
			else buckets.set(text, [index]);
		}
		return buckets;
	}
	function nodeListToArray(nodeList) {
		const length = nodeList.length;
		const array = new Array(length);
		for (let i = 0; i < length; i++) array[i] = nodeList[i];
		return array;
	}
	function isWhitespaceTextNode(node) {
		if (nodeTypeOf(node) !== TEXT_NODE_TYPE) return false;
		const value = node.nodeValue;
		if (!value) return true;
		for (let i = 0; i < value.length; i++) if (!isAsciiWhitespace(value.charCodeAt(i))) return false;
		return true;
	}
	function isAsciiWhitespace(code) {
		return code === 32 || code === 9 || code === 10 || code === 13 || code === 12;
	}
	function trimAsciiWhitespace(string) {
		let start = 0;
		let end = string.length;
		while (start < end && isAsciiWhitespace(string.charCodeAt(start))) start++;
		while (end > start && isAsciiWhitespace(string.charCodeAt(end - 1))) end--;
		return string.slice(start, end);
	}
	function trimFragmentEdgeWhitespace(fragment) {
		let hasElementChild = false;
		for (let current = fragment.firstChild; current; current = nextSiblingOf(current)) if (nodeTypeOf(current) === ELEMENT_NODE_TYPE) {
			hasElementChild = true;
			break;
		}
		if (!hasElementChild) return;
		while (fragment.firstChild && isWhitespaceTextNode(fragment.firstChild)) fragment.firstChild.remove();
		while (fragment.lastChild && isWhitespaceTextNode(fragment.lastChild)) fragment.lastChild.remove();
	}
	function choiceOf(element, select) {
		if (isOptionElement(element)) return JSON.stringify([
			select?.getAttribute("name") ?? "",
			select && formOf(select),
			select && (select.hasAttribute("multiple") ? 2 : displaySizeOf(select) > 1 ? 1 : 0),
			element.value,
			getAttribute(element, "is")
		]);
		if (isInputElement(element) && (element.type === "checkbox" || element.type === "radio")) return JSON.stringify([
			element.type,
			element.name,
			element.value,
			formOf(element),
			getAttribute(element, "is")
		]);
		return null;
	}
	function formOf(control) {
		const form = getAttribute(control, "form");
		const closestForm = closest(control, "form");
		return form && closestForm && form === idOf(closestForm) ? null : form;
	}
	function pathTo(control, wrapper) {
		const path = [];
		for (let node = control; node !== wrapper;) {
			node = parentElementOf(node);
			if (node !== wrapper) path.push([
				namespaceURIOf(node),
				localNameOf(node),
				getAttribute(node, "is")
			]);
		}
		return JSON.stringify(path);
	}
	function countChoices(choices) {
		const counts = /* @__PURE__ */ new Map();
		for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1);
		return counts;
	}
	function attributesKeyOf(element, ignored) {
		const attributes = [];
		for (const { namespaceURI, name, localName, value } of attributesOf(element)) if (namespaceURI !== null || name !== DIRTY_ATTRIBUTE && !ignored.includes(name)) attributes.push([
			namespaceURI,
			localName,
			value
		]);
		return JSON.stringify(attributes.sort((a, b) => `${a[0]} ${a[1]}` < `${b[0]} ${b[1]}` ? -1 : 1));
	}
	function isLeftChoice(element) {
		if (isOptionElement(element)) return !element.selected;
		return isInputElement(element) && element.type === "radio" && !element.checked;
	}
	function shapeOf(node) {
		if (!isElement(node)) return JSON.stringify([
			nodeTypeOf(node),
			node.nodeName,
			node.nodeValue
		]);
		const attributes = [];
		for (const { namespaceURI, localName, value } of attributesOf(node)) if (namespaceURI !== null || localName !== DIRTY_ATTRIBUTE) attributes.push(JSON.stringify([
			namespaceURI,
			localName,
			value
		]));
		let children = "";
		for (const child of childNodesOf(node)) children += shapeOf(child);
		if (isTemplateElement(node)) {
			children += "<#content";
			for (const child of node.content.childNodes) children += shapeOf(child);
			children += ">";
		}
		return `<${JSON.stringify([
			namespaceURIOf(node),
			prefixOf(node),
			localNameOf(node),
			attributes.sort()
		])}${children}>`;
	}
	function outlineOf(node) {
		if (!isElement(node)) return JSON.stringify([
			nodeTypeOf(node),
			node.nodeName,
			node.nodeValue
		]);
		let children = "";
		for (const child of childNodesOf(node)) children += outlineOf(child);
		if (isTemplateElement(node)) {
			children += "<#content";
			for (const child of node.content.childNodes) children += outlineOf(child);
			children += ">";
		}
		return `<${JSON.stringify([
			namespaceURIOf(node),
			prefixOf(node),
			localNameOf(node),
			getAttribute(node, "is")
		])}${children}>`;
	}
	function isEqualNode(from, to) {
		if (!Node.prototype.isEqualNode.call(from, to)) return false;
		if (!isParentNode(from)) return true;
		if (isElement(from) && isTemplateElement(from) && !isEqualNode(from.content, to.content)) return false;
		const fromTemplates = querySelectorAll(from, "template");
		if (fromTemplates.length === 0) return true;
		const toTemplates = querySelectorAll(to, "template");
		for (let i = 0; i < fromTemplates.length; i++) {
			const fromTemplate = fromTemplates[i];
			if (!isTemplateElement(fromTemplate)) continue;
			if (!isEqualNode(fromTemplate.content, toTemplates[i].content)) return false;
		}
		return true;
	}
	function isTemplateElement(element) {
		return localNameOf(element) === "template" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function radioGroupOf(radio, groups) {
		if (radio.name === "") return [radio];
		const form = radio.form;
		const owner = form ?? radio.getRootNode();
		let byName = groups.get(owner);
		if (!byName) {
			byName = /* @__PURE__ */ new Map();
			groups.set(owner, byName);
			const inputs = form ? elementsOf(form) : querySelectorAll(owner, "input");
			for (let i = 0; i < inputs.length; i++) {
				const input = inputs[i];
				if (isInputElement(input) && input.type === "radio" && input.form === form) {
					const group = byName.get(input.name);
					if (group) group.push(input);
					else byName.set(input.name, [input]);
				}
			}
		}
		return byName.get(radio.name) ?? [];
	}
	function formAfterMove(control, element, parent) {
		if (hasAttribute(control, "form")) return control.form;
		const form = closestForm(parentNodeOf(control));
		return form && contains(element, form) ? form : closestForm(parent);
	}
	function closestForm(node) {
		for (; node; node = parentNodeOf(node)) if (isElement(node) && isFormElement(node)) return node;
		return null;
	}
	function isFormElement(element) {
		return localNameOf(element) === "form" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isCheckedRadio(element) {
		return isInputElement(element) && element.type === "radio" && element.checked;
	}
	function isInputElement(element) {
		return localNameOf(element) === "input" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isTextAreaElement(element) {
		return localNameOf(element) === "textarea" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function hasSameIs(from, to) {
		return getAttribute(from, "is") === getAttribute(to, "is");
	}
	function canMorphElementInPlace(from, to) {
		if (localNameOf(from) !== localNameOf(to)) return false;
		if (namespaceURIOf(from) !== namespaceURIOf(to)) return false;
		if (!hasSameIs(from, to)) return false;
		if (isFormControl(from) && isFormControl(to)) {
			const fromId = idOf(from);
			const toId = idOf(to);
			if ((fromId !== "" || toId !== "") && fromId !== toId) return false;
		}
		if (isInputElement(from) && isInputElement(to)) return from.type === to.type;
		return true;
	}
	function canSoftMatchByTagName(element, hasDescendantIdMarker) {
		return !hasStableSoftMatchIdentity(element, hasDescendantIdMarker);
	}
	function hasStableSoftMatchIdentity(element, hasDescendantIdMarker) {
		return idOf(element) !== "" || isFormControl(element) || hasDescendantIdMarker || hasMatchKeyAttribute(element);
	}
	function sharesMatchKey(element, other) {
		for (const name of [
			"name",
			"href",
			"src"
		]) {
			const value = getAttribute(element, name);
			if (value && value === getAttribute(other, name)) return true;
		}
		return false;
	}
	function hasMatchKeyAttribute(element) {
		return !!(getAttribute(element, "name") || getAttribute(element, "href") || getAttribute(element, "src"));
	}
	function isFormControl(element) {
		if (namespaceURIOf(element) !== HTML_NAMESPACE) return false;
		const localName = localNameOf(element);
		return localName === "input" || localName === "textarea" || localName === "select" || localName.includes("-") && element.constructor["formAssociated"] === true;
	}
	function isDialogElement(element) {
		return localNameOf(element) === "dialog" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isDetailsElement(element) {
		return localNameOf(element) === "details" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function hasOpenState(element) {
		return isDialogElement(element) || isDetailsElement(element);
	}
	function openDetailsInGroup(details) {
		const name = getAttributeNS(details, null, "name");
		if (!name) return [];
		const root = getRootNode(details);
		return [...isDocument(root) ? getElementsByName(root, name) : querySelectorAll(root, "details[open][name]")].filter((other) => other !== details && getAttributeNS(other, null, "name") === name && hasAttributeNS(other, null, "open") && isDetailsElement(other));
	}
	function closeLaterOpenDetails(nodes) {
		const names = /* @__PURE__ */ new Set();
		for (let i = 0; i < nodes.length; i++) {
			const node = nodes[i];
			if (!isElement(node)) continue;
			const items = [...querySelectorAll(node, "details[open]")];
			if (matchesSelector(node, "details[open]")) items.unshift(node);
			for (const item of items) {
				const name = getAttributeNS(item, null, "name");
				if (!name || !isDetailsElement(item)) continue;
				/* v8 ignore next -- only WebKit parses several open items in one group */
				if (names.has(name)) removeAttributeNS(item, null, "open");
				else names.add(name);
			}
		}
	}
	function isSelectElement(element) {
		return localNameOf(element) === "select" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isOptgroupElement(element) {
		return localNameOf(element) === "optgroup" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isOptionElement(element) {
		return localNameOf(element) === "option" && namespaceURIOf(element) === HTML_NAMESPACE;
	}
	function isElement(node) {
		return nodeTypeOf(node) === ELEMENT_NODE_TYPE;
	}
	function isDocument(node) {
		return nodeTypeOf(node) === DOCUMENT_NODE_TYPE;
	}
	function isParentNode(node) {
		const type = nodeTypeOf(node);
		return type === ELEMENT_NODE_TYPE || type === DOCUMENT_NODE_TYPE || type === DOCUMENT_FRAGMENT_NODE_TYPE;
	}
	function isNodeList(value) {
		return Object.prototype.toString.call(value) === "[object NodeList]";
	}
	function getter(prototype, key) {
		let descriptor;
		return (node) => (descriptor ??= Object.getOwnPropertyDescriptor(prototype(), key)).get.call(node);
	}
	const nodeTypeOf = getter(() => Node.prototype, "nodeType");
	const parentNodeOf = getter(() => Node.prototype, "parentNode");
	const parentElementOf = getter(() => Node.prototype, "parentElement");
	const childNodesOf = getter(() => Node.prototype, "childNodes");
	const firstChildOf = getter(() => Node.prototype, "firstChild");
	const previousSiblingOf = getter(() => Node.prototype, "previousSibling");
	const nextSiblingOf = getter(() => Node.prototype, "nextSibling");
	const ownerDocumentOf = getter(() => Node.prototype, "ownerDocument");
	const isConnected = getter(() => Node.prototype, "isConnected");
	const textContentOf = getter(() => Node.prototype, "textContent");
	const idOf = getter(() => Element.prototype, "id");
	const localNameOf = getter(() => Element.prototype, "localName");
	const namespaceURIOf = getter(() => Element.prototype, "namespaceURI");
	const prefixOf = getter(() => Element.prototype, "prefix");
	const attributesOf = getter(() => Element.prototype, "attributes");
	const childrenOf = getter(() => Element.prototype, "children");
	const firstElementChildOf = getter(() => Element.prototype, "firstElementChild");
	const nextElementSiblingOf = getter(() => Element.prototype, "nextElementSibling");
	const documentElementOf = getter(() => Document.prototype, "documentElement");
	const bodyOf = getter(() => Document.prototype, "body");
	const activeElementOf = getter(() => Document.prototype, "activeElement");
	const implementationOf = getter(() => Document.prototype, "implementation");
	const elementsOf = getter(() => HTMLFormElement.prototype, "elements");
	function insertBefore(parent, node, insertionPoint) {
		Node.prototype.insertBefore.call(parent, node, insertionPoint);
	}
	function replaceChild(parent, node, child) {
		Node.prototype.replaceChild.call(parent, node, child);
	}
	function remove(node) {
		const parent = parentNodeOf(node);
		if (parent) Node.prototype.removeChild.call(parent, node);
	}
	function contains(node, other) {
		return Node.prototype.contains.call(node, other);
	}
	function compareDocumentPosition(node, other) {
		return Node.prototype.compareDocumentPosition.call(node, other);
	}
	function hasChildNodes(node) {
		return Node.prototype.hasChildNodes.call(node);
	}
	function getRootNode(node) {
		return Node.prototype.getRootNode.call(node);
	}
	function getBoundingClientRect(element) {
		return Element.prototype.getBoundingClientRect.call(element);
	}
	function getSelection(document) {
		return Document.prototype.getSelection.call(document);
	}
	function removeEventListener(document, type, listener) {
		EventTarget.prototype.removeEventListener.call(document, type, listener, true);
	}
	function getAttribute(element, name) {
		return Element.prototype.getAttribute.call(element, name);
	}
	function getAttributeNS(element, namespace, localName) {
		return Element.prototype.getAttributeNS.call(element, namespace, localName);
	}
	function getAttributeNodeNS(element, namespace, localName) {
		return Element.prototype.getAttributeNodeNS.call(element, namespace, localName);
	}
	function hasAttribute(element, name) {
		return Element.prototype.hasAttribute.call(element, name);
	}
	function hasAttributeNS(element, namespace, localName) {
		return Element.prototype.hasAttributeNS.call(element, namespace, localName);
	}
	function hasAttributes(element) {
		return Element.prototype.hasAttributes.call(element);
	}
	function setAttribute(element, name, value) {
		Element.prototype.setAttribute.call(element, name, value);
	}
	function setAttributeNS(element, namespace, name, value) {
		Element.prototype.setAttributeNS.call(element, namespace, name, value);
	}
	function setAttributeNodeNS(element, attribute) {
		Element.prototype.setAttributeNodeNS.call(element, attribute);
	}
	function removeAttribute(element, name) {
		Element.prototype.removeAttribute.call(element, name);
	}
	function removeAttributeNS(element, namespace, localName) {
		Element.prototype.removeAttributeNS.call(element, namespace, localName);
	}
	function matchesSelector(element, selectors) {
		return Element.prototype.matches.call(element, selectors);
	}
	function closest(element, selectors) {
		return Element.prototype.closest.call(element, selectors);
	}
	function getElementsByTagName(element, name) {
		return Element.prototype.getElementsByTagName.call(element, name);
	}
	function parentPrototypeOf(parent) {
		if (isElement(parent)) return Element.prototype;
		return isDocument(parent) ? Document.prototype : DocumentFragment.prototype;
	}
	function querySelector(parent, selectors) {
		return parentPrototypeOf(parent).querySelector.call(parent, selectors);
	}
	function querySelectorAll(parent, selectors) {
		return parentPrototypeOf(parent).querySelectorAll.call(parent, selectors);
	}
	function createElement(document, localName) {
		return Document.prototype.createElement.call(document, localName);
	}
	function createComment(document, data) {
		return Document.prototype.createComment.call(document, data);
	}
	function getElementsByName(document, name) {
		return Document.prototype.getElementsByName.call(document, name);
	}
	function longestIncreasingSubsequence(sequence) {
		const n = sequence.length;
		if (n === 0) return [];
		const smallestEnding = new Array(n);
		const indices = new Array(n);
		const prev = new Int32Array(n);
		prev.fill(-1);
		let lisLength = 0;
		for (let i = 0; i < n; i++) {
			const val = sequence[i];
			if (val === void 0) continue;
			let left = 0;
			let right = lisLength;
			while (left < right) {
				const mid = Math.floor((left + right) / 2);
				if (smallestEnding[mid] < val) left = mid + 1;
				else right = mid;
			}
			prev[i] = left > 0 ? indices[left - 1] : -1;
			smallestEnding[left] = val;
			indices[left] = i;
			if (left === lisLength) lisLength++;
		}
		const result = new Array(lisLength);
		let curr = indices[lisLength - 1];
		for (let i = lisLength - 1; i >= 0; i--) {
			result[i] = curr;
			curr = prev[curr];
		}
		return result;
	}
	//#endregion
	exports.morph = morph;
	exports.morphDocument = morphDocument;
	exports.morphInner = morphInner;
	return exports;
})({});
