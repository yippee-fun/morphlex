const SUPPORTS_MOVE_BEFORE = typeof Element !== "undefined" && "moveBefore" in Element.prototype
// Browsers with customizable selects fill a drop-down's `selectedcontent` with a copy of its selected option.
const FILLS_SELECTED_CONTENT = "HTMLSelectedContentElement" in globalThis
const ELEMENT_NODE_TYPE = 1
const TEXT_NODE_TYPE = 3
const DOCUMENT_NODE_TYPE = 9
const DOCUMENT_FRAGMENT_NODE_TYPE = 11
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const SVG_NAMESPACE = "http://www.w3.org/2000/svg"
const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML"
const CLOBBER_ATTRIBUTE = "morphlex-clobber"
const DIRTY_ATTRIBUTE = "morphlex-dirty"
// The most cells `chooseStaying` fills for one set of siblings, about 8 MB in all, so a morph removing many of many
// identical siblings stays fast.
const STAYING_CELLS = 1 << 20
const DETACHED_NODE_ERROR = "[Morphlex] Cannot replace a detached node. It needs a parent."

// The passes matching wrappers by choice, as [targets with their own identity, same attributes, all choices,
// only the choices the user picked], from strictest to loosest.
const CHOICE_PASSES = [
	[false, true, true, true],
	[false, true, true, false],
	[false, true, false, true],
	[false, true, false, false],
	[false, false, true, true],
	[false, false, true, false],
	[false, false, false, true],
	[false, false, false, false],
	[true, true, true, true],
	[true, true, true, false],
	[true, true, false, true],
	[true, true, false, false],
	[true, false, true, true],
	[true, false, true, false],
	[true, false, false, true],
	[true, false, false, false],
] as const

const STYLING_ATTRIBUTES = ["class", "style"]
const OPEN_ATTRIBUTE = ["open"]
// Attributes that load what they point to as soon as they change.
const ADDRESS_ATTRIBUTES = new Set(["src", "href", "srcdoc"])

const Operation = {
	EqualNode: 0,
	SameElement: 1,
	SameNode: 2,
} as const

type Operation = (typeof Operation)[keyof typeof Operation]

type IdSetMap = WeakMap<Node, Set<string>>
type IdArrayMap = WeakMap<Node, Array<string>>
// What the markup selects in each option's single select, or undefined for an option of a multiple select.
type DefaultOptionMap = Map<Element, HTMLOptionElement | null | undefined>

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
	morph(documentElementOf(from), documentElementOf(to), options)
}

/**
 * Morph one `ChildNode` to another. If the `to` node is a string, it will be parsed where `from` is: with a
 * `DOMParser` for an `html`, `head` or `body` root, in an element of the parent's namespace inside SVG or MathML,
 * and otherwise with a `<template>` element.
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
	if (typeof to === "string") to = parseTarget(from, to)

	run(from, to, takeClobbered(to), options, (morpher) => morpher.morph(from, to))
}

/**
 * Morph the inner content of one ChildNode to the inner content of another.
 * If the `to` node is a string, it will be parsed where `from` is, as with `morph`.
 * A shadow root is morphed to the children of a fragment (or another shadow root), or to a string of its content.
 *
 * @param from The source element or shadow root to morph from.
 * @param to The target element, fragment or string to morph to.
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
export function morphInner(from: ChildNode, to: ChildNode | string, options?: Options): void
export function morphInner(from: ShadowRoot, to: DocumentFragment | string, options?: Options): void
export function morphInner(from: ChildNode | ShadowRoot, to: ChildNode | DocumentFragment | string, options: Options = {}): void {
	if (nodeTypeOf(from) === DOCUMENT_FRAGMENT_NODE_TYPE) {
		const root = from as ShadowRoot
		if (typeof to === "string") to = parseFragment(to, root.host)
		if (nodeTypeOf(to) !== DOCUMENT_FRAGMENT_NODE_TYPE) {
			throw new Error("[Morphlex] You can only do an inner morph of a shadow root with a fragment or a string.")
		}
		const fragment = to as DocumentFragment
		const targets = fragment.childNodes
		run(root, targets, takeClobbered(targets), options, (morpher) => morpher.morphChildren(root, fragment))
		return
	}

	if (typeof to === "string") {
		const parsed = parseTarget(from as ChildNode, to)

		if (!isNodeList(parsed)) {
			to = parsed
		} else if (parsed.length === 1 && nodeTypeOf(parsed[0]!) === ELEMENT_NODE_TYPE) {
			to = parsed[0]!
		} else {
			throw new Error("[Morphlex] The string was not a valid HTML element.")
		}
	}

	if (
		nodeTypeOf(from) === ELEMENT_NODE_TYPE &&
		nodeTypeOf(to) === ELEMENT_NODE_TYPE &&
		localNameOf(from as Element) === localNameOf(to as Element) &&
		namespaceURIOf(from as Element) === namespaceURIOf(to as Element)
	) {
		const fromElement = from as Element
		const toElement = to as Element
		const clobbered = takeClobbered(toElement)
		if (clobbered?.has(toElement)) options = { ...options, preserveChanges: false }
		run(fromElement, toElement, clobbered, options, (morpher) => morpher.morphChildren(fromElement, toElement))
	} else {
		throw new Error("[Morphlex] You can only do an inner morph with matching elements.")
	}
}

// The flags of the morphs running, which a morph from a callback of one of them can clear.
const runningFlags: Array<Array<Element>> = []

// Flag the controls the user changed, note the select around the root and what its markup selects, and
// run the morph. A root select's options are keyed by the live select, even if the target renames it and the
// rename is vetoed. A morph run from a callback puts back the flags of the morphs around it that it cleared.
function run(
	from: ChildNode | ShadowRoot,
	to: ChildNode | NodeListOf<ChildNode>,
	clobbered: Set<Element> | null,
	options: Options,
	morph: (morpher: Morph) => void,
): void {
	const select = selectOf(from)
	const outerFlags = runningFlags.flat().filter((element) => hasAttribute(element, DIRTY_ATTRIBUTE))
	const flagged: Array<Element> = []
	runningFlags.push(flagged)
	try {
		if (isParentNode(from)) flagDirtyInputs(from, options.preserveChanges ? to : null, flagged)
		const keySelect = isElement(from) && isSelectElement(from) ? from : select
		const morpher = new Morph(options, clobbered, flagged, keySelect)
		if (select) morpher.setEnclosingSelect(select, selectionOf(select))
		morph(morpher)
	} finally {
		runningFlags.pop()
		clearDirtyFlags(flagged)
		for (const element of outerFlags) {
			if (!hasAttribute(element, DIRTY_ATTRIBUTE)) setAttribute(element, DIRTY_ATTRIBUTE, "")
		}
	}
}

// Remove `morphlex-clobber` from the target so it never reaches the live DOM,
// and return the elements that had it so the morph can discard user changes inside them.
// Template content is left alone, so a template keeps it for when its content is used as a target.
// Also remove `morphlex-dirty` from the target, so a dirty element can never look equal to it.
function takeClobbered(to: ChildNode | NodeListOf<ChildNode>): Set<Element> | null {
	let clobbered: Set<Element> | null = null
	const nodes = isNodeList(to) ? to : [to]

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!
		if (nodeTypeOf(node) !== ELEMENT_NODE_TYPE) continue

		const element = node as Element
		if (stripMarkerAttributes(element)) (clobbered ??= new Set()).add(element)

		for (const descendant of querySelectorAll(element, `[${CLOBBER_ATTRIBUTE}], [${DIRTY_ATTRIBUTE}]`)) {
			if (stripMarkerAttributes(descendant)) (clobbered ??= new Set()).add(descendant)
		}
	}

	return clobbered
}

// Returns whether the element had `morphlex-clobber`.
function stripMarkerAttributes(element: Element): boolean {
	removeAttribute(element, DIRTY_ATTRIBUTE)
	if (!hasAttribute(element, CLOBBER_ATTRIBUTE)) return false
	removeAttribute(element, CLOBBER_ATTRIBUTE)
	return true
}

// With `preserveChanges`, the target is given, and the `details` and `dialog` elements are flagged too when some are open
// and others closed, here or in the target, since an element's open state is the user's, and there's no default to
// tell whether they changed it. When they're all open or all closed, matching one to any other keeps what it shows.
function flagDirtyInputs(node: ParentNode, to: ChildNode | NodeListOf<ChildNode> | null, flagged: Array<Element>): void {
	let defaultOptions: DefaultOptionMap | null = null
	const openStateElements: Array<Element> = []

	// The selector also matches elements with these names in other namespaces, like SVG.
	const selector = to ? "input, option, textarea, details, dialog" : "input, option, textarea"
	const elements = [...querySelectorAll(node, selector)]
	if (isElement(node)) elements.unshift(node)
	for (const element of elements) {
		let dirty = false
		if (hasOpenState(element)) {
			openStateElements.push(element)
		} else if (isInputElement(element)) {
			dirty = isDirtyInput(element)
		} else if (isOptionElement(element)) {
			defaultOptions ??= defaultOptionsOf(node)
			dirty = isDirtyOption(element, defaultOptions)
		} else if (isTextAreaElement(element)) {
			dirty = isDirtyTextArea(element)
		}
		if (dirty) flagDirty(element, flagged)
	}

	if (to && openStateElements.length) {
		const open: Set<string> = new Set()
		const closed: Set<string> = new Set()
		for (const element of openStateElements) {
			;(hasAttributeNS(element, null, "open") ? open : closed).add(localNameOf(element))
		}
		const targets: Array<Element> = []
		for (const target of isNodeList(to) ? to : [to]) {
			if (nodeTypeOf(target) === ELEMENT_NODE_TYPE) targets.push(target as Element)
		}
		// The selectors can also match elements in other namespaces, which only flags more elements than needed.
		const targetHas = (selector: string) =>
			targets.some((target) => matchesSelector(target, selector) || querySelector(target, selector) !== null)
		const mixed = [...new Set([...open, ...closed])].filter(
			(name) => (open.has(name) || targetHas(`${name}[open]`)) && (closed.has(name) || targetHas(`${name}:not([open])`)),
		)
		for (const element of openStateElements) {
			if (mixed.includes(localNameOf(element))) flagDirty(element, flagged)
		}
	}
}

// The element is noted first, so a morph from its attribute callback puts its flag back.
function flagDirty(element: Element, flagged: Array<Element>): void {
	flagged.push(element)
	// Stryker disable next-line StringLiteral: only the marker's presence matters, never its value.
	setAttribute(element, DIRTY_ATTRIBUTE, "")
}

// Checkboxes and radios report a `.value` of "on" when they have no `value` attribute,
// while `defaultValue` is "", so only their checkedness tells us if the user changed them.
function isDirtyInput(input: HTMLInputElement): boolean {
	if (input.type === "checkbox" || input.type === "radio") {
		return input.checked !== input.defaultChecked
	}

	return input.value !== input.defaultValue && hasDirtyValue(input)
}

let probeDocument: Document | null = null

// A clone keeps an input's value and dirty value flag. Cloning into a document without
// custom elements keeps a customized built-in from upgrading.
function probeClone(input: HTMLInputElement): HTMLInputElement {
	probeDocument ??= implementationOf(input.ownerDocument).createHTMLDocument("")
	return probeDocument.importNode(input) as HTMLInputElement
}

// The browser sanitizes `.value` for many input types, so it can differ from the `value`
// attribute when the user changed nothing: a range with no value reads "50", and email
// inputs trim spaces. Only the browser knows if the user changed it. A clone keeps that
// dirty flag, and while it's unset a text input's value follows its `value` attribute.
// A file input ignores its `value` attribute and has a value only once the user picks a file.
function hasDirtyValue(input: HTMLInputElement): boolean {
	if (input.type === "file") return input.value !== ""
	const clone = probeClone(input)
	clone.type = "text"
	const probe = clone.value === "a" ? "b" : "a"
	clone.defaultValue = probe
	return clone.value !== probe
}

// The attributes besides `type` and `value` that the browser sanitizes an input's value with.
const SANITIZING_ATTRIBUTES = ["min", "max", "step", "multiple"]

// An untouched input can still differ from its target, because the browser sanitizes its value
// as attributes change: a range that gains `max="10"` clamps 50 to 10, while the parsed target
// shows 5. Setting the `value` attribute again sanitizes it afresh, without marking it as changed
// the way assigning `.value` would. Try it on a clone first, so it only happens when it helps.
// Returns whether it dealt with the input, so assigning `.value` isn't needed. An untouched input
// whose sanitizing attribute update was vetoed is left alone on purpose.
function resanitizeValue(input: HTMLInputElement, target: Element, value: string | null, shown: string): boolean {
	if (hasDirtyValue(input)) return false
	if (SANITIZING_ATTRIBUTES.some((name) => input.getAttribute(name) !== getAttribute(target, name))) return true
	const clone = probeClone(input)
	setValueAttribute(clone, value)
	if (clone.value !== shown) return false
	setValueAttribute(input, value)
	return true
}

function setValueAttribute(input: HTMLInputElement, value: string | null): void {
	if (value === null) {
		input.setAttribute("value", "")
		input.removeAttribute("value")
	} else {
		input.setAttribute("value", value)
	}
}

// The browser turns carriage returns into line feeds in a textarea's `.value`.
function isDirtyTextArea(textarea: HTMLTextAreaElement): boolean {
	return textarea.value !== textarea.defaultValue.replace(/\r\n?/g, "\n")
}

// A single select shows one option as selected even when no option has a `selected`
// attribute, so compare each option with what the browser selects from the markup alone.
function isDirtyOption(option: HTMLOptionElement, defaultOptions: DefaultOptionMap): boolean {
	const defaultOption = defaultOptions.get(option)
	if (defaultOption === undefined) return option.selected !== option.defaultSelected
	return option.selected !== (option === defaultOption)
}

// The last option with a `selected` attribute wins. Without one, a drop-down
// (display size 1) selects its first enabled option and a list box selects nothing.
// When every option is disabled, some browsers select the first one anyway.
function defaultOptionOf(select: HTMLSelectElement): HTMLOptionElement | null {
	const options = select.options
	let firstEnabled: HTMLOptionElement | null = null

	for (let i = options.length - 1; i >= 0; i--) {
		const option = options[i]!
		if (option.hasAttribute("selected")) return option
		if (!isDisabledOption(option)) firstEnabled = option
	}

	if (displaySizeOf(select) > 1) return null
	/* v8 ignore next -- only WebKit selects a disabled option */
	return firstEnabled ?? (selectsDisabledOption(select.ownerDocument) ? (options[0] ?? null) : null)
}

let disabledOptionSelected: boolean | undefined

function selectsDisabledOption(document: Document): boolean {
	if (disabledOptionSelected === undefined) {
		const select = createElement(document, "select") as HTMLSelectElement
		const option = createElement(document, "option") as HTMLOptionElement
		option.disabled = true
		select.append(option)
		disabledOptionSelected = select.selectedIndex === 0
	}
	return disabledOptionSelected
}

function isDropDown(select: HTMLSelectElement): boolean {
	return !select.multiple && displaySizeOf(select) <= 1
}

// HTML integer parsing skips only ASCII whitespace, where `parseInt` skips any whitespace.
function displaySizeOf(select: HTMLSelectElement): number {
	const match = /^[\t\n\f\r ]*\+?(\d+)/.exec(select.getAttribute("size") ?? "")
	return match ? Number(match[1]) : 1
}

function isDisabledOption(option: HTMLOptionElement): boolean {
	if (option.disabled) return true

	for (let parent = option.parentElement!; !isSelectElement(parent); parent = parentElementOf(parent)!) {
		if (localNameOf(parent) === "optgroup" && namespaceURIOf(parent) === HTML_NAMESPACE) {
			return (parent as HTMLOptGroupElement).disabled
		}
	}

	return false
}

// The parser selects the first option of a drop-down that has no `selected` option, so a new
// option can arrive selected and take the selection from the option the user chose. New options
// going into a select lose that implicit selection. The node leaves its parsed select
// first, where clearing an option would just select it again. Live nodes passed as the target
// keep their state, and so does a new select, whose options are its own.
function clearImplicitSelection(node: ChildNode, parent: ParentNode): void {
	if (nodeTypeOf(node) !== ELEMENT_NODE_TYPE || nodeTypeOf(parent) !== ELEMENT_NODE_TYPE) return
	if (isConnected(node) && ownerDocumentOf(node) === ownerDocumentOf(parent)) return
	const element = node as Element
	// Only an option, or an element holding one, can hold an option, which saves looking for a select.
	if (isSelectElement(element) || (!isOptionElement(element) && !firstElementChildOf(element))) return
	if (!isSelectElement(parent as Element) && !selectOf(parent)) return

	let selected: Array<HTMLOptionElement> | null = null
	if (isOptionElement(element)) {
		if (isImplicitlySelected(element)) selected = [element]
	} else {
		forEachNewOption(element, (option) => {
			if (isImplicitlySelected(option)) (selected ??= []).push(option)
		})
	}
	if (!selected) return

	remove(element)
	for (const option of selected as Array<HTMLOptionElement>) option.selected = false
}

function isImplicitlySelected(option: HTMLOptionElement): boolean {
	return option.selected && !option.hasAttribute("selected")
}

// Options inside an element, other than those of a select inside it, which keep their selection.
function forEachNewOption(element: Element, callback: (option: HTMLOptionElement) => void): void {
	for (let child = firstElementChildOf(element); child; child = nextElementSiblingOf(child)) {
		if (isOptionElement(child)) callback(child)
		else if (!isSelectElement(child)) forEachNewOption(child, callback)
	}
}

// Options belong to their select, so an element holding options only moves within its select.
// Customizable selects allow options inside other elements.
function movesOptionsBetweenSelects(live: Element, select: HTMLSelectElement | null): boolean {
	if (isSelectElement(live) || !querySelector(live, "option")) return false
	return selectOf(live) !== select
}

// The select a child of the live `parent` belongs to.
function selectAt(parent: ParentNode): HTMLSelectElement | null {
	return isElement(parent) && isSelectElement(parent) ? parent : selectOf(parent)
}

// Customizable selects allow options nested inside other elements, so look past the parent.
function selectOf(node: Node): HTMLSelectElement | null {
	for (let parent = parentElementOf(node); parent; parent = parentElementOf(parent)) {
		if (isSelectElement(parent)) return parent
	}

	return null
}

// What the markup selects in the single select each option belongs to, or undefined for an option of a multiple
// select, taken from the browser's own option lists. These leave out options the select doesn't own, such as those
// inside a datalist or a nested optgroup.
function defaultOptionsOf(node: ParentNode): DefaultOptionMap {
	const defaultOptions: DefaultOptionMap = new Map()
	const enclosing = selectOf(node)
	if (enclosing) addDefaultOptions(defaultOptions, enclosing)
	if (isElement(node) && isSelectElement(node)) addDefaultOptions(defaultOptions, node)

	for (const select of querySelectorAll(node, "select")) {
		if (isSelectElement(select)) addDefaultOptions(defaultOptions, select)
	}

	return defaultOptions
}

function addDefaultOptions(defaultOptions: DefaultOptionMap, select: HTMLSelectElement): void {
	const defaultOption = select.multiple ? undefined : defaultOptionOf(select)
	for (const option of select.options) defaultOptions.set(option, defaultOption)
}

// The options the markup selects, then the options the select shows, to tell whether a morph inside
// the select changed either. Updating an option's `selected` or `disabled` attribute can change what
// the select shows even when the markup selects the same options. A multiple select's lists are
// separated by null.
function selectionOf(select: HTMLSelectElement): Array<HTMLOptionElement | null> {
	if (!select.multiple) return [defaultOptionOf(select), select.options[select.selectedIndex] ?? null]
	const markup = Array.from(select.options).filter((option) => option.hasAttribute("selected"))
	return [...markup, null, ...select.selectedOptions]
}

// Focus inside an editable region goes to its editing host, so the active element is the one the user types in.
function focusedEditorOf(node: Node): Element | null {
	const element = activeElementIn(getRootNode(node))
	return element && namespaceURIOf(element) === HTML_NAMESPACE && isContentEditableOf(element as HTMLElement) ? element : null
}

// The browser copies the selected option's content into each `selectedcontent` of a drop-down, so the morph leaves
// its children alone. The target's copy shows what the target's markup selects rather than what the user picked,
// and WebKit leaves it empty when parsing a template.
function isFilledSelectedContent(element: Element): boolean {
	if (!FILLS_SELECTED_CONTENT || !isSelectedContent(element)) return false
	const select = selectOf(element)
	return select !== null && !select.multiple
}

function isSelectedContent(element: Element): boolean {
	return localNameOf(element) === "selectedcontent" && namespaceURIOf(element) === HTML_NAMESPACE
}

function hasEqualChildren(node: Node, other: Node | null): boolean {
	let child = firstChildOf(node)
	let otherChild = other && firstChildOf(other)
	for (; child && otherChild; child = nextSiblingOf(child), otherChild = nextSiblingOf(otherChild)) {
		if (!isEqualNode(child, otherChild)) return false
	}

	return child === otherChild
}

function clearDirtyFlags(elements: Array<Element>): void {
	for (let i = 0; i < elements.length; i++) {
		removeAttribute(elements[i]!, DIRTY_ATTRIBUTE)
	}
}

// HTML elements whose innerHTML is parsed as text, as a page with scripting enabled parses a noscript's.
const TEXT_PARENTS = new Set([
	"script",
	"style",
	"textarea",
	"title",
	"xmp",
	"iframe",
	"noembed",
	"noframes",
	"noscript",
	"plaintext",
])

// A string is parsed where `from` is, as `innerHTML` on its parent would parse it. An `html`, `head` or `body`
// can't be parsed in a template, so it's taken from a parsed document. Inside a script, a textarea and the like,
// it's parsed in a new element of the parent's name, which keeps tags as text, so nothing loads. Inside SVG or
// MathML, the string is parsed in an element like the parent (or for a root without one, an `svg` or `math`), so
// a `circle` isn't an HTML element. Anything else is parsed in a template, which keeps table rows and the like
// where they are.
function parseTarget(from: ChildNode, string: string): ChildNode | NodeListOf<ChildNode> {
	if (isElement(from) && namespaceURIOf(from) === HTML_NAMESPACE) {
		const name = localNameOf(from)
		if (name === "html" || name === "head" || name === "body") {
			const parsed = parseDocument(string)
			return name === "html" ? documentElementOf(parsed)! : name === "head" ? headOf(parsed) : bodyOf(parsed)
		}
	}

	const parent = parentNodeOf(from)
	if (parent && isElement(parent) && namespaceURIOf(parent) === HTML_NAMESPACE && TEXT_PARENTS.has(localNameOf(parent))) {
		const element = createElement(document, localNameOf(parent))
		setHTML(element, string)
		return element.childNodes
	}

	const fragment = parseFragment(string, foreignContextOf(from))
	trimFragmentEdgeWhitespace(fragment)
	return fragment.childNodes
}

// The parent of `from` when it's an SVG or MathML element, or for an SVG or MathML root without one, an `svg` or
// `math`. The parent's attributes count too, since an `annotation-xml` with an HTML `encoding` holds HTML.
function foreignContextOf(from: ChildNode): Element | null {
	const parent = parentNodeOf(from)
	if (parent && isElement(parent)) return namespaceURIOf(parent) === HTML_NAMESPACE ? null : parent

	const namespace = isElement(from) ? namespaceURIOf(from) : null
	if (namespace === SVG_NAMESPACE) return createElementNS(document, namespace, "svg")
	if (namespace === MATHML_NAMESPACE) return createElementNS(document, namespace, "math")
	return null
}

// `setHTMLUnsafe` and `Document.parseHTMLUnsafe` attach declarative shadow roots, as a page does, so a
// `<template shadowrootmode>` never lands in a host's light DOM. Older browsers fall back to parsers that don't.
// A context (a foreign parent, or a shadow root's host) is parsed in a shallow copy of it in the template's inert
// document, so nothing loads.
function parseFragment(string: string, context: Element | null = null): DocumentFragment {
	const template = createElement(document, "template") as HTMLTemplateElement
	if (context) {
		const element = importNode(template.content.ownerDocument, context)
		setHTML(element, string)
		while (element.firstChild) template.content.appendChild(element.firstChild)
	} else {
		setHTML(template, string)
	}
	/* v8 ignore next -- only Firefox parses a template's content with scripting enabled */
	if (!templateKeepsNoscriptText()) flattenNoscripts(template.content)

	return template.content
}

function setHTML(element: Element, string: string): void {
	/* v8 ignore next -- every browser the tests run in has setHTMLUnsafe */
	if (element.setHTMLUnsafe) element.setHTMLUnsafe(string)
	else element.innerHTML = string
}

function parseDocument(string: string): Document {
	const trimmed = trimAsciiWhitespace(string)
	/* v8 ignore next -- every browser the tests run in has parseHTMLUnsafe */
	const parsed = Document.parseHTMLUnsafe
		? Document.parseHTMLUnsafe(trimmed)
		: new DOMParser().parseFromString(trimmed, "text/html")
	flattenNoscripts(parsed)

	return parsed
}

let noscriptTextKept: boolean | undefined

// Whether a template parses a noscript's content as text, as a page does with scripting enabled.
function templateKeepsNoscriptText(): boolean {
	if (noscriptTextKept === undefined) {
		const template = createElement(document, "template") as HTMLTemplateElement
		setHTML(template, "<noscript><p></p></noscript>")
		noscriptTextKept = nodeTypeOf(template.content.firstChild!.firstChild!) === TEXT_NODE_TYPE
	}
	return noscriptTextKept
}

// Parsing with scripting disabled turns a noscript's content into elements, but a page parsed with scripting
// enabled holds it as text. So it's turned back into text, so the morph never adds its elements.
function flattenNoscripts(parent: ParentNode): void {
	const noscripts = querySelectorAll(parent, "noscript")
	for (let i = 0; i < noscripts.length; i++) {
		const noscript = noscripts[i] as HTMLElement
		if (namespaceURIOf(noscript) === HTML_NAMESPACE) noscript.textContent = noscript.innerHTML
	}

	const templates = querySelectorAll(parent, "template")
	for (let i = 0; i < templates.length; i++) {
		const template = templates[i]!
		if (isTemplateElement(template)) flattenNoscripts(template.content)
	}
}

/* v8 ignore start -- reorder fast paths are environment-sensitive */
function moveBefore(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (node === insertionPoint) return
	if (parentNodeOf(node) === parent) {
		if (nextSiblingOf(node) === insertionPoint) return
		if (SUPPORTS_MOVE_BEFORE) {
			;(parentPrototypeOf(parent) as NodeWithMoveBefore).moveBefore.call(parent, node, insertionPoint)
			return
		}
	}
	insertBefore(parent, node, insertionPoint)
}
/* v8 ignore stop */

// The ids of the forms in a node, or null when it holds none.
function formIdsIn(node: Node): Set<string> | null {
	// An element without children holds no form, which saves looking for one.
	if (!isElement(node) || (!isFormElement(node) && !firstElementChildOf(node))) return null
	let ids: Set<string> | null = null
	const forms = isFormElement(node) ? [node] : getElementsByTagName(node, "form")
	for (let i = 0; i < forms.length; i++) {
		const form = forms[i]!
		if (idOf(form) !== "" && isFormElement(form)) (ids ??= new Set()).add(idOf(form))
	}
	return ids
}

// Firefox keeps whether the user changed a radio for its whole group, and a radio takes that on when it joins one.
// Moving a form briefly drops the radios whose `form` attribute names it into the group of radios without a form,
// where a radio the user picked would stop them following their `checked` attribute. So they move without a name,
// which keeps them out of any group, and get it back straight after with `restoreNames`.
function unnameRadiosNamingFormsIn(node: Node): Array<[HTMLInputElement, string]> | null {
	const ids = formIdsIn(node)
	if (!ids) return null
	let unnamed: Array<[HTMLInputElement, string]> | null = null
	const inputs = querySelectorAll(getRootNode(node) as ParentNode, `input[form][name]:not([name=""])`)
	for (let i = 0; i < inputs.length; i++) {
		const input = inputs[i]!
		if (isRadio(input) && ids.has(input.getAttribute("form")!)) {
			;(unnamed ??= []).push([input, input.getAttribute("name")!])
			input.removeAttribute("name")
		}
	}
	return unnamed
}

function restoreNames(unnamed: Array<[HTMLInputElement, string]> | null): void {
	if (unnamed) for (const [input, name] of unnamed) input.setAttribute("name", name)
}

// Radios that a change to a form unchecked by removing their `checked` attribute, with its value, so
// they're checked again the same way and keep following the markup.
const uncheckedByAttribute = new WeakMap<HTMLInputElement, string>()

function moveInto(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): void {
	if (SUPPORTS_MOVE_BEFORE && isConnected(node) && isConnected(parent)) {
		try {
			;(parentPrototypeOf(parent) as NodeWithMoveBefore).moveBefore.call(parent, node, insertionPoint)
			return
		} catch {
			// Fall back to insertBefore, for example when the nodes are in different documents.
		}
	}
	insertBefore(parent, node, insertionPoint)
}

// The focused element, followed into open shadow roots, and its selection. Browsers without `moveBefore` lose
// focus when it moves, Chromium's resets a text control's selection, and none keeps the document's selection
// inside a moved node. So a move that takes them saves them first and puts them back straight after.
interface Focus {
	element: Element
	// A text control's selection.
	selection: [number, number, "forward" | "backward" | "none"] | null
	// The document's selection inside any other element.
	range: [Node, number, Node, number] | null
	// Whether another element took focus while a move ran or focus was put back, such as from a custom element's
	// lifecycle callback or a focus handler.
	taken: boolean
	// The document listened to for focus that another element takes before the morph settles.
	document: Document
}

function focusOf(node: Node): Focus | null {
	let element = activeElementIn(getRootNode(node))
	if (!element) return null
	const document = ownerDocumentOf(element)!
	// The body is active when nothing is focused, unless it's editable and holds the caret.
	if (element === bodyOf(document) && !(element as HTMLElement).isContentEditable) return null
	while (element.shadowRoot?.activeElement) element = element.shadowRoot.activeElement

	let selection: Focus["selection"] = null
	let range: Focus["range"] = null
	if ((isInputElement(element) || isTextAreaElement(element)) && element.selectionStart !== null) {
		selection = [element.selectionStart, element.selectionEnd!, element.selectionDirection!]
	} else {
		// A document without a browsing context, such as a parsed one, has no selection.
		/* v8 ignore next */
		const { anchorNode, anchorOffset, focusNode, focusOffset } = getSelection(document) ?? {}
		if (anchorNode && focusNode && contains(element, anchorNode) && contains(element, focusNode)) {
			range = [anchorNode, anchorOffset!, focusNode, focusOffset!]
		}
	}

	return { element, selection, range, taken: false, document }
}

// The focus a move of the node would take: the focused element when the node holds it or the selection inside it.
function focusHeldBy(node: Node): Focus | null {
	const focus = focusOf(node)
	return focus && holdersOf(focus).has(node) ? focus : null
}

// The nodes holding the focused element inside the root, or the selection inside it, when the morph starts.
function focusHoldersIn(root: Node): Set<Node> | null {
	const focus = focusOf(root)
	if (!focus) return null
	const holders = holdersOf(focus)
	return holders.has(root) ? holders : null
}

// The nodes holding the focused element or an end of its selection.
function holdersOf({ element, range }: Focus): Set<Node> {
	const holders = new Set<Node>()
	for (const held of range ? [element, range[0], range[2]] : [element]) {
		for (let node: Node | null = held; node; node = parentOrHost(node)) holders.add(node)
	}
	return holders
}

// Put back the focus and selection a move just took. Focus that another element took meanwhile, such as from a
// custom element's lifecycle callback or a focus handler, stays there. Returns whether to try again when the morph
// settles, because the element can't be focused where it is yet and nothing else has focus.
function restoreFocus(focus: Focus): boolean {
	const { element, selection, range } = focus
	const root = getRootNode(element)
	const document = ownerDocumentOf(element)!
	if (activeElementIn(root) !== element) {
		if (focus.taken || !isFocusLost(document)) return false
		focusElement(element)
		if (activeElementIn(root) !== element) return !focus.taken && isFocusLost(document)
	}

	// A custom element's lifecycle callback can run during the move and change the control's type or the selected
	// text, so the selection may no longer fit.
	try {
		if (selection) {
			// Firefox's moveBefore keeps the selection, and setting it again keeps it when the morph sets a new value.
			const control = element as HTMLInputElement | HTMLTextAreaElement
			const [start, end, direction] = selection
			if (control.selectionStart !== start || control.selectionEnd !== end || control.selectionDirection !== direction) {
				control.setSelectionRange(start, end, direction)
			}
		} else if (range && contains(element, range[0]) && contains(element, range[2])) {
			// A selection that moved out of the focused element stays where the browser put it, inside the element,
			// because putting it back would leave the caret where typing goes nowhere.
			// Until its styles are brought up to date, Chromium 153 can drop a selection set in a node that `moveBefore`
			// just moved, and crashes when the node moved into a `details`.
			getBoundingClientRect(element)
			getSelection(document)!.setBaseAndExtent(...range)
		}
	} catch {}
	return false
}

// A custom element can define its own `focus` and a form's field can shadow it, so this calls the platform's own,
// the one furthest along the prototype chain.
function focusElement(element: Element): void {
	let platform: object = element
	for (
		let prototype = Object.getPrototypeOf(element) as object | null;
		prototype;
		prototype = Object.getPrototypeOf(prototype) as object | null
	) {
		if (Object.hasOwn(prototype, "focus")) platform = prototype
	}
	Reflect.apply(Reflect.get(platform, "focus") as HTMLElement["focus"], element, [{ preventScroll: true }])
}

// With nothing focused, a document's body is active, or its root element when it has no body, though WebKit has none.
function isFocusLost(document: Document): boolean {
	const activeElement = activeElementOf(document)
	/* v8 ignore next -- tests run in documents with a body */
	return activeElement === null || activeElement === (bodyOf(document) ?? documentElementOf(document))
}

// A shadow root's members can't be shadowed, unlike a document's.
function activeElementIn(root: Node): Element | null {
	if (nodeTypeOf(root) === DOCUMENT_NODE_TYPE) return activeElementOf(root as Document)
	return (root as Partial<ShadowRoot>).activeElement ?? null
}

function parentOrHost(node: Node): Node | null {
	// Focus and the selection are always in a document, so a fragment here is a shadow root.
	return parentNodeOf(node) ?? (nodeTypeOf(node) === DOCUMENT_FRAGMENT_NODE_TYPE ? (node as ShadowRoot).host : null)
}

interface PendingMove {
	live: Element
	target: Element
	placeholder: Comment
	preserveChanges: boolean
	// A replacement asks `beforeNodeAdded` before it claims, so its target isn't asked again.
	approved: boolean
	// The live select the target ends up in.
	select: HTMLSelectElement | null
}

// The children of a live element and of its target while they're matched. Each live child is a candidate
// in one of the lists until a target takes it, and each target child is unmatched until it takes one. Whitespace
// is only ever matched with whitespace, so it's kept apart.
class Siblings {
	readonly from: Array<ChildNode>
	readonly to: Array<ChildNode>
	readonly candidateNodes: Array<number> = []
	readonly candidateElements: Array<number> = []
	readonly candidateElementsById: Map<string, Array<number>> = new Map()
	readonly whitespace: Array<number> = []
	readonly unmatchedNodes: Array<number> = []
	readonly unmatchedElements: Array<number> = []
	readonly candidateActive: Uint8Array
	readonly unmatchedActive: Uint8Array
	// The candidate each target took, and how the pair is morphed.
	readonly matches: Array<number> = []
	readonly op: Array<Operation> = []
	// The candidates holding the user's changes, by shape, once they've been matched.
	dirtyCandidatesByShape: Map<string, Array<number>> | null = null
	// The untouched candidates that gave their equal target to a candidate holding the user's changes.
	readonly displaced: Array<number> = []
	// A shape spans the whole subtree, so it's worked out once for each node. Under preserveChanges, it ignores the
	// `open` state the user toggles.
	readonly #shapes: Map<Node, string> = new Map()
	readonly #ignoresOpen: boolean
	// Each element's choice, worked out once while its siblings are matched.
	choices: Map<Element, string | null> | null = null
	readonly #fromLocalNames: Array<string> = []
	readonly #fromNamespaces: Array<string | null> = []
	readonly #toLocalNames: Array<string> = []
	readonly #toNamespaces: Array<string | null> = []

	shapeOf(node: Node): string {
		let shape = this.#shapes.get(node)
		if (shape === undefined) this.#shapes.set(node, (shape = shapeOf(node, this.#ignoresOpen)))
		return shape
	}

	constructor(from: ParentNode, to: ParentNode, ignoresOpen: boolean) {
		this.#ignoresOpen = ignoresOpen
		this.from = nodeListToArray(childNodesOf(from))
		this.to = nodeListToArray(childNodesOf(to))
		this.candidateActive = new Uint8Array(this.from.length)
		this.unmatchedActive = new Uint8Array(this.to.length)

		for (let i = 0; i < this.from.length; i++) {
			const candidate = this.from[i]!
			if (isElement(candidate)) {
				this.candidateActive[i] = 1
				this.#fromLocalNames[i] = localNameOf(candidate)
				this.#fromNamespaces[i] = namespaceURIOf(candidate)
				const id = idOf(candidate)
				if (id === "") {
					this.candidateElements.push(i)
				} else {
					addToBucket(this.candidateElementsById, id, i)
				}
			} else if (isWhitespaceTextNode(candidate)) {
				this.whitespace.push(i)
			} else {
				this.candidateActive[i] = 1
				this.candidateNodes.push(i)
			}
		}

		for (let i = 0; i < this.to.length; i++) {
			const node = this.to[i]!
			if (isElement(node)) {
				this.unmatchedActive[i] = 1
				this.#toLocalNames[i] = localNameOf(node)
				this.#toNamespaces[i] = namespaceURIOf(node)
				this.unmatchedElements.push(i)
			} else if (!isWhitespaceTextNode(node)) {
				this.unmatchedActive[i] = 1
				this.unmatchedNodes.push(i)
			}
		}
	}

	// Whether the target and candidate elements have the same name and namespace.
	sameKind(target: number, candidate: number): boolean {
		return (
			this.#toLocalNames[target] === this.#fromLocalNames[candidate] &&
			this.#toNamespaces[target] === this.#fromNamespaces[candidate]
		)
	}

	// The active candidate elements, when there are enough of them and of the targets left that a pass is worth indexing.
	manyPairs(): Array<number> | null {
		const { candidateElements, unmatchedElements, candidateActive, unmatchedActive } = this
		if (candidateElements.length * unmatchedElements.length <= 1024) return null
		const candidates = candidateElements.filter((candidate) => candidateActive[candidate])
		let targets = 0
		for (const target of unmatchedElements) targets += unmatchedActive[target]!
		return candidates.length * targets > 1024 ? candidates : null
	}

	take(target: number, candidate: number, op: Operation): void {
		this.matches[target] = candidate
		this.op[target] = op
		this.candidateActive[candidate] = 0
		this.unmatchedActive[target] = 0
	}
}

// A candidate for matching by choice: its index, the choices it holds, and the ones the user picked.
type ChoiceCandidate = [number, Array<string>, Array<string>]

// One pass pairing candidates with the targets they can take, as a bipartite matching, so one candidate
// taking a target never leaves another without one it could have had. Each candidate first takes the first
// free target in its lists, and paths are only searched for the rest, breadth first and without recursion,
// through the listed targets only, reaching each target once.
class ChoiceMatching {
	// The candidate owning each target.
	readonly owners: Map<number, number> = new Map()
	readonly #targets: Array<number>
	readonly #position: Map<number, number>
	readonly #takes: (k: number, target: number) => boolean
	readonly #listsOf: (k: number) => Array<Array<number>>
	readonly #likenessOf: (k: number) => string
	readonly #lists: Array<Array<Array<number>>> = []
	readonly #likenesses: Array<string> = []
	readonly #listIds: Map<Array<number>, number> = new Map()
	// Alike candidates share where each list's untried targets start.
	readonly #firstFree: Map<string, Map<Array<number>, number>> = new Map()
	// Until a search succeeds, the targets a failed search reached can't lead to a free target, and a
	// candidate alike to one whose search failed, with the same lists, fails too.
	readonly #deadTargets: Set<number> = new Set()
	readonly #failedSearches: Set<string> = new Set()
	readonly #unassigned: Array<number> = []

	constructor(
		targets: Array<number>,
		takes: (k: number, target: number) => boolean,
		listsOf: (k: number) => Array<Array<number>>,
		likenessOf: (k: number) => string,
	) {
		this.#targets = targets
		this.#position = new Map(targets.map((target, t) => [target, t]))
		this.#takes = takes
		this.#listsOf = listsOf
		this.#likenessOf = likenessOf
	}

	#listsFor(k: number): Array<Array<number>> {
		let lists = this.#lists[k]
		if (!lists) {
			lists = this.#lists[k] = this.#listsOf(k)
			for (const list of lists) if (!this.#listIds.has(list)) this.#listIds.set(list, this.#listIds.size)
		}
		return lists
	}

	#likeness(k: number): string {
		return (this.#likenesses[k] ??= this.#likenessOf(k))
	}

	// Give the candidate the first free target it can take, walking its lists together in target order.
	// Those it passes were taken or failed, for it and the candidates alike, so they're not tried again.
	assignFree(k: number): void {
		// A target the candidate can take is in its lists, so without any it has none.
		const lists = this.#listsFor(k)
		if (!lists.length) return
		const likeness = this.#likeness(k)
		let untried = this.#firstFree.get(likeness)
		if (!untried) this.#firstFree.set(likeness, (untried = new Map()))
		const heads: Array<number> = []
		for (const list of lists) {
			let head = untried.get(list) ?? 0
			while (head < list.length && this.owners.has(list[head]!)) head++
			heads.push(head)
		}
		let assigned = false
		while (!assigned) {
			let next: number | undefined
			for (let l = 0; l < lists.length; l++) {
				const target = lists[l]![heads[l]!]
				if (target !== undefined && (next === undefined || this.#position.get(target)! < this.#position.get(next)!)) {
					next = target
				}
			}
			if (next === undefined) break
			for (let l = 0; l < lists.length; l++) if (lists[l]![heads[l]!] === next) heads[l] = heads[l]! + 1
			if (this.owners.has(next) || !this.#takes(k, next)) continue
			this.owners.set(next, k)
			assigned = true
		}
		for (let l = 0; l < lists.length; l++) untried.set(lists[l]!, heads[l]!)
		if (!assigned) this.#unassigned.push(k)
	}

	// Search a path for each candidate still without a target, while there are free targets.
	assignRest(): void {
		for (const k of this.#unassigned) {
			if (this.owners.size === this.#targets.length) break
			this.#assign(k)
		}
	}

	// Search breadth first for a chain of candidates, each taking the next one's target, that ends at a free
	// target, and shift the targets along it.
	#assign(start: number): void {
		const search = `${this.#likeness(start)} ${this.#listsFor(start)
			.map((list) => this.#listIds.get(list)!)
			.join(" ")}`
		if (this.#failedSearches.has(search)) return
		const reachedFrom: Map<number, number> = new Map()
		const ownedTarget: Map<number, number> = new Map()
		// Alike candidates reach the same targets in a list, so each list is walked once for them.
		const walked: Set<string> = new Set()
		const queue = [start]
		for (let q = 0; q < queue.length; q++) {
			const k = queue[q]!
			for (const list of this.#listsFor(k)) {
				const walk = `${this.#likeness(k)} ${this.#listIds.get(list)!}`
				if (walked.has(walk)) continue
				walked.add(walk)
				for (const target of list) {
					if (reachedFrom.has(target) || this.#deadTargets.has(target) || !this.#takes(k, target)) continue
					reachedFrom.set(target, k)
					const owner = this.owners.get(target)
					if (owner !== undefined) {
						ownedTarget.set(owner, target)
						queue.push(owner)
						continue
					}
					for (let next: number | undefined = target; next !== undefined;) {
						const taker = reachedFrom.get(next)!
						this.owners.set(next, taker)
						next = ownedTarget.get(taker)
					}
					this.#deadTargets.clear()
					this.#failedSearches.clear()
					return
				}
			}
		}
		for (const target of reachedFrom.keys()) this.#deadTargets.add(target)
		this.#failedSearches.add(search)
	}
}

class Morph {
	readonly #options: Options
	#preserveChanges: boolean
	// Pending moves and removals are settled when the root's children have been visited, or when
	// the root is replaced, so the root's own callbacks see the finished DOM.
	#root: Node | null = null
	// The morph's own nodes are inside this node, between these two siblings when there are any.
	#scope: Node | null = null
	#scopeStart: Node | null = null
	#scopeEnd: Node | null = null
	// The target's root nodes, which bound the search for an option's select or a control's form.
	readonly #targetRoots: Set<Node> = new Set()
	// The live form a target's control past the target's roots ends up in, and an inner morph's target, which
	// stands for the live root rather than a form of its own.
	#keyForm: HTMLFormElement | null = null
	#innerTarget: Node | null = null
	// Nodes whose visit or children's visit was vetoed, and controls with a vetoed attribute update.
	#vetoedNodes: Array<Node> | null = null
	#vetoedControls: Set<Element> | null = null

	// Discarding user changes: the `morphlex-clobber` elements, them and their ancestors, and the live node whose
	// subtree discards user changes while the rest of the morph preserves them.
	readonly #clobbered: Set<Element> | null
	#clobberedHolders: Set<Element> | null = null
	#clobberedScope: Node | null = null

	// Keeping user changes: elements flagged `morphlex-dirty` and their ancestors, which can't equal their
	// targets, so they're compared without the flag. The flagged elements themselves are kept too, since a nested
	// morph from a callback can clear their flags.
	readonly #dirtyElements: Set<Element> | null = null
	readonly #flagged: Set<Element> = new Set()
	readonly #targetChoices: Map<Element, { counts: Map<string, number>; size: number }> = new Map()
	// The select keying the target's options in a morph rooted at or inside a select, which the target's options
	// don't have.
	readonly #keySelect: HTMLSelectElement | null
	// The live select each target select is morphed into, so the target's options are keyed by the live select,
	// whose attributes a veto can keep.
	readonly #liveSelects: Map<Element, HTMLSelectElement> = new Map()

	// Moving elements across parents: live elements by id, and how often each id appears in the target. An element
	// whose id appears once in each tree is moved to wherever the target puts that id, even under another parent.
	readonly #idArrayMap: IdArrayMap = new WeakMap()
	readonly #idSetMap: IdSetMap = new WeakMap()
	readonly #liveElementsById: Map<string, Element | null> = new Map()
	readonly #targetIdCounts: Map<string, number> = new Map()
	readonly #targetElementsById: Map<string, Element> = new Map()
	// Movable elements left where they were, to be removed at the end unless they moved.
	#unplacedElements: Array<Element> | null = null
	// Approved removals put off until the end, because the node holds an element that may move out.
	#deferredRemovals: Array<ChildNode> | null = null
	// Moves wait for the morph to settle, because a later veto can still pin the element where it is.
	#pendingMoves: Array<PendingMove> | null = null
	readonly #claimedElements: Map<Element, PendingMove> = new Map()
	readonly #movesInProgress: Set<PendingMove> = new Set()
	// The latest pending move whose target holds each id.
	readonly #movesByTargetId: Map<string, PendingMove> = new Map()

	// Selects synced to their markup, synced again when the morph settles, after options have moved or gone.
	#syncedSelects: Set<HTMLSelectElement> | null = null
	// Multiple selects and list boxes that had no selection when visited, so a drop-down they become shows an option the browser picked.
	#unselectedSelects: Set<HTMLSelectElement> | null = null
	// The select around a morph rooted inside it, and what its markup selected before the morph.
	#enclosingSelect: [HTMLSelectElement, Array<HTMLOptionElement | null>] | null = null
	#resetEnclosingOption = false

	// Radios whose checkedness the morph reset or whose radio group a move changed. Their groups are
	// synced to the markup when the morph settles, because moves complete out of document order.
	#radiosToSync: Set<HTMLInputElement> | null = null
	// Checked radios that moved unchecked, so they couldn't uncheck the rest of a group they joined.
	#radiosUncheckedForMove: Set<HTMLInputElement> | null = null
	// Radios unchecked by a radio checked again straight after changing form, and that radio. They're
	// checked again when the morph settles if that radio has left their group by then.
	#displacedRadios: Map<HTMLInputElement, HTMLInputElement> | null = null
	// Only a target with a checked input can add a checked radio, so other morphs skip looking for one.
	#targetChecksInputs = false

	// Items of exclusive accordions (`details` with a name) the morph wants open, with their `open` value.
	// Inserting an open item, or giving one a name, closes it while another in its group is open, so the
	// noted items are opened again when the morph settles.
	#openDetails: Map<Element, string> | null = null
	// Only a target with an open `details` can add one, so other morphs skip looking for one.
	#targetOpensDetails = false

	// The nodes holding the focused element inside the root, or the selection inside it, which stay where they are
	// among their siblings when they can.
	#focusHolders: Set<Node> | null = null
	// The editing host that's focused when the morph starts.
	#editor: Element | null = null
	// Focus a move took to where it couldn't be put back straight away, such as into a closed `details` that the
	// morph opens later. It's tried again when the morph settles.
	#unrestoredFocus: Focus | null = null
	// Where the ends of its selection are, followed through later moves and removals.
	#unrestoredRange: [Range, Range] | null = null
	#watchedFocus: Focus | null = null
	#watchedDocuments: Array<Document> = []

	constructor(
		options: Options = {},
		clobbered: Set<Element> | null = null,
		flagged: Array<Element> | null = null,
		keySelect: HTMLSelectElement | null = null,
	) {
		this.#options = options
		this.#keySelect = keySelect
		this.#clobbered = clobbered
		this.#preserveChanges = options.preserveChanges ?? false
		if (flagged?.length) {
			const dirtyElements = new Set<Element>()
			for (const element of flagged) {
				this.#flagged.add(element)
				for (let node: Element | null = element; node && !dirtyElements.has(node); node = parentElementOf(node)) {
					dirtyElements.add(node)
				}
			}
			this.#dirtyElements = dirtyElements
		}
	}

	morph(from: ChildNode, to: ChildNode | NodeListOf<ChildNode>): void {
		this.#root = from
		this.#focusHolders = focusHoldersIn(from)
		this.#editor = focusedEditorOf(from)
		// A detached root has no siblings, so it's its own scope.
		this.#scope = parentNodeOf(from) ?? from
		this.#scopeStart = previousSiblingOf(from)
		this.#scopeEnd = nextSiblingOf(from)
		this.#keyForm = closestForm(parentNodeOf(from))
		if (isParentNode(from)) {
			this.#mapIdSets(from)
		}

		const targets = isNodeList(to) ? [...to] : [to]
		for (const node of targets) {
			this.#targetRoots.add(node)
			if (isParentNode(node)) this.#mapIdArrays(node)
		}
		if (this.#targetOpensDetails) closeLaterOpenDetails(targets)
		this.#morphOneToMany(from, targets)

		this.#finish()
	}

	morphChildren(from: Element | ShadowRoot, to: Element | DocumentFragment): void {
		this.#root = from
		this.#focusHolders = focusHoldersIn(from)
		this.#editor = focusedEditorOf(from)
		this.#scope = from
		this.#keyForm = closestForm(from)
		this.#innerTarget = to
		this.#targetRoots.add(to)
		this.#mapIdSets(from)
		this.#mapIdArrays(to, false)
		if (this.#targetOpensDetails) closeLaterOpenDetails(childNodesOf(to))
		if (isElement(from)) this.visitChildNodes(from, to as Element)
		else this.#visitShadowRootChildNodes(from, to as DocumentFragment)
		this.#finish()
	}

	#settleIfRoot(node: Node): void {
		if (node === this.#root) this.#finish()
	}

	#finish(): void {
		this.#completeMoves()

		const unplaced = this.#unplacedElements
		if (unplaced) {
			for (let i = 0; i < unplaced.length; i++) {
				const element = unplaced[i]!
				if (this.#liveElementsById.has(idOf(element))) this.#removeNode(element, true)
			}
			this.#unplacedElements = null
		}

		const deferred = this.#deferredRemovals
		if (deferred) {
			for (let i = 0; i < deferred.length; i++) {
				const node = deferred[i]!
				this.#removeChild(node)
				this.#options.afterNodeRemoved?.(node)
			}
			this.#deferredRemovals = null
		}

		// Option wrappers can move or go after a select was synced, which keeps the old selection, so sync it again.
		const selects = this.#syncedSelects
		if (selects) {
			const preserveChanges = this.#preserveChanges
			this.#preserveChanges = false
			for (const select of selects) this.#syncDefaultSelection(select)
			this.#preserveChanges = preserveChanges
			this.#syncedSelects = null
		}

		const displaced = this.#displacedRadios
		if (displaced) {
			this.#displacedRadios = null
			this.#restoreDisplacedRadios(displaced)
		}

		const unchecked = this.#radiosUncheckedForMove
		if (unchecked) {
			this.#radiosUncheckedForMove = null
			const groups: RadioGroups = new Map()
			for (const radio of unchecked) {
				if (radio.checked || !(radio.hasAttribute("checked") || this.#isVetoed(radio))) continue
				// Checking it would uncheck the rest of its new group, where a checked radio that's vetoed stays checked.
				if (radioGroupOf(radio, groups).some((member) => member.checked && this.#isVetoed(member))) continue
				radio.checked = true
				// The new group can have a later radio the markup checks, which wins as when parsing.
				;(this.#radiosToSync ??= new Set()).add(radio)
			}
		}

		const radios = this.#radiosToSync
		if (radios) {
			this.#radiosToSync = null
			this.#syncRadioGroups(radios)
		}

		const openDetails = this.#openDetails
		if (openDetails) {
			this.#openDetails = null
			this.#reopenDetails(openDetails)
		}

		const enclosingSelect = this.#enclosingSelect?.[0]
		this.#syncEnclosingSelect()
		if (enclosingSelect) this.#refreshSelectedContent(enclosingSelect)
		for (const select of this.#liveSelects.values()) this.#refreshSelectedContent(select)

		const focus = this.#unrestoredFocus
		if (focus) {
			this.#unrestoredFocus = null
			removeEventListener(focus.document, "focusin", this.#dropUnrestoredFocus)
			const range = this.#unrestoredRange
			/* v8 ignore start -- as in #restoreFocus */
			if (range) {
				this.#unrestoredRange = null
				const [anchor, focusEnd] = range
				const [anchorNode, anchorOffset, focusNode, focusOffset] = focus.range!
				focus.range = [
					...followedEnd(focus.element, anchor, anchorNode, anchorOffset),
					...followedEnd(focus.element, focusEnd, focusNode, focusOffset),
				]
			}
			/* v8 ignore stop */
			restoreFocus(focus)
		}
	}

	// Open each item the morph wants open but the browser closed, in document order, so the first one wins
	// as when parsing. An item stays closed while another in its group is open, since opening it would
	// close that one, which is either wanted open too, outside the morph, vetoed or kept open by the user.
	#reopenDetails(openDetails: Map<Element, string>): void {
		const closed: Array<Element> = []
		for (const details of openDetails.keys()) {
			if (!hasAttributeNS(details, null, "open") && this.#inScope(details)) closed.push(details)
		}
		closed.sort((a, b) => (compareDocumentPosition(a, b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

		for (const details of closed) {
			if (openDetailsInGroup(details).length === 0) setAttributeNS(details, null, "open", openDetails.get(details)!)
		}
	}

	// Completing a move morphs the element, which can claim more elements, so keep going until none are left.
	#completeMoves(): void {
		for (let moves = this.#pendingMoves; moves; moves = this.#pendingMoves) {
			this.#pendingMoves = null
			for (let i = 0; i < moves.length; i++) this.#completeMove(moves[i]!)
		}
	}

	#morphOneToMany(from: ChildNode, to: Array<ChildNode>): void {
		const length = to.length

		if (length === 0) {
			this.#removeNode(from)
		} else if (length === 1) {
			this.#morphOneToOne(from, to[0]!)
		} else {
			const parent = parentNodeOf(from)
			if (!parent) throw new Error(DETACHED_NODE_ERROR)

			// Add the other nodes first, so moves into them are settled when the first node's morph finishes.
			const [first, ...newNodes] = to
			const insertionPoint = nextSiblingOf(from)
			for (let i = 0; i < newNodes.length; i++) {
				this.#addNode(parent, newNodes[i]!, insertionPoint)
			}

			this.#morphOneToOne(from, first!)
		}
	}

	#morphOneToOne(from: ChildNode, to: ChildNode): void {
		// Fast path: if nodes are exactly the same object, skip morphing
		if (from === to) return
		if (isEqualNode(from, to)) return

		this.#visitNode(from, to, isElement(from) && isElement(to) && canMorphElementInPlace(from, to))
	}

	// Morph an element in place when it can be, update another node's text, or replace the node.
	#visitNode(from: ChildNode, to: ChildNode, inPlace: boolean): void {
		if (!(this.#options.beforeNodeVisited?.(from, to) ?? true)) {
			this.#pinSubtree(from)
			return
		}

		// Nodes of the same type that aren't elements aren't forms either. A processing instruction's target is its name.
		if (inPlace) {
			this.#morphMatchingElements(from as Element, to as Element)
		} else if (
			!isElement(from) &&
			nodeTypeOf(from) === nodeTypeOf(to) &&
			from.nodeName === to.nodeName &&
			from.nodeValue !== null &&
			to.nodeValue !== null
		) {
			from.nodeValue = to.nodeValue
			// A root settles here, so its afterNodeVisited sees the finished DOM.
			this.#settleIfRoot(from)
		} else {
			this.#replaceNode(from, to)
		}

		this.#options.afterNodeVisited?.(from, to)
	}

	#morphMatchingElements(from: Element, to: Element): void {
		// Discard user changes inside a `morphlex-clobber` element, as if `preserveChanges` were off.
		const preserveChanges = this.#preserveChanges
		const clobberedScope = this.#clobberedScope
		if (preserveChanges && this.#clobbered?.has(to)) {
			this.#preserveChanges = false
			this.#clobberedScope = from
		}
		if (this.#preserveChanges && isSelectElement(from) && !isDropDown(from) && from.selectedIndex < 0)
			(this.#unselectedSelects ??= new Set()).add(from)

		if (hasAttributes(from) || hasAttributes(to)) {
			this.#visitAttributes(from, to)
		}

		if (hasChildNodes(from) || hasChildNodes(to) || isTemplateElement(from)) {
			this.visitChildNodes(from, to)
		} else if (isTextAreaElement(from)) {
			this.#resetTextArea(from)
		}
		// A root without children to visit settles here, so its afterNodeVisited sees the finished DOM.
		this.#settleIfRoot(from)

		this.#preserveChanges = preserveChanges
		this.#clobberedScope = clobberedScope
	}

	#visitAttributes(from: Element, to: Element): void {
		removeAttribute(from, DIRTY_ATTRIBUTE)

		const details = isDetailsElement(from)
		const open = details ? getAttributeNS(from, null, "open") : null
		// The user toggles `open` on these elements, so with `preserveChanges` it's neither added nor removed.
		const keepsOpen = this.#preserveChanges && hasOpenState(from)

		// First pass: update/add attributes from reference (iterate forwards). An address loads as soon as it
		// changes, with the attributes the element has then, like an iframe's `sandbox` or a link's `integrity`,
		// so addresses are updated last, after the other attributes are added, changed and removed.
		const toAttributes = attributesOf(to)
		let addresses: Array<Attr> | null = null
		for (let i = 0; i < toAttributes.length; i++) {
			const attribute = toAttributes[i]!
			if (attribute.namespaceURI === null && ADDRESS_ATTRIBUTES.has(attribute.name)) {
				;(addresses ??= []).push(attribute)
			} else {
				this.#updateAttribute(from, attribute, keepsOpen, details)
			}
		}

		// Second pass: remove excess attributes. Check for any first, to avoid copying the attribute list.
		if (hasExcessAttributes(from, to)) {
			for (const { name, localName, value, namespaceURI } of Array.from(attributesOf(from))) {
				if (!hasAttributeNS(to, namespaceURI, localName)) {
					if (keepsOpen && name === "open" && namespaceURI === null) continue

					if (this.#options.beforeAttributeUpdated?.(from, name, null) ?? true) {
						// Removing `open` from a modal dialog leaves it stuck in the top layer, so close it properly.
						if (name === "open" && namespaceURI === null && isDialogElement(from)) {
							from.close()
						} else {
							const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, null)
							removeAttributeNS(from, namespaceURI, localName)
							this.#checkRadios(radios)
							// The markup unchecks it, so it doesn't get back a check another radio took from it.
							if (name === "checked") this.#displacedRadios?.delete(from as HTMLInputElement)
						}
						this.#options.afterAttributeUpdated?.(from, name, value)
					} else {
						this.#noteVetoedAttribute(from, name, namespaceURI)
					}
				}
			}
		}

		if (addresses) {
			for (const attribute of addresses) this.#updateAttribute(from, attribute, keepsOpen, details)
		}

		if (details) this.#noteIntendedOpen(from, to, open)

		if (!this.#preserveChanges) {
			this.#resetFormProperties(from, to)
		}
	}

	// Add the attribute, or update its value, asking the callbacks first.
	#updateAttribute(from: Element, attribute: Attr, keepsOpen: boolean, details: boolean): void {
		const { name, localName, value, namespaceURI } = attribute
		// Adding `open` would open it, but changing the value of an existing one is fine.
		if (keepsOpen && name === "open" && namespaceURI === null && !hasAttributeNS(from, null, "open")) return
		const oldValue = getAttributeNS(from, namespaceURI, localName)

		if (oldValue === value) return
		if (this.#options.beforeAttributeUpdated?.(from, name, value) ?? true) {
			// Go through `Attr` nodes, because `setAttribute` rejects names the parser accepts, like `@click`.
			// Look the attribute up after the callback, which may have removed or replaced it.
			const radios = namespaceURI ? null : this.#uncheckRadiosForAttribute(from, name, value)
			// Checking a radio unchecks the rest of its group, which gets its check back if the radio then leaves.
			const group =
				name === "checked" && namespaceURI === null && isRadio(from) && !from.checked ? checkedRadiosInGroup(from) : null
			const existing = getAttributeNodeNS(from, namespaceURI, localName)
			if (existing) {
				existing.value = value
			} else if (details && name === "open" && namespaceURI === null) {
				this.#openDetailsItem(from, value)
			} else {
				setAttributeNodeNS(from, attribute.cloneNode() as Attr)
			}
			this.#checkRadios(radios)
			if (group) this.#noteDisplacedRadios(group, from as HTMLInputElement)
			this.#options.afterAttributeUpdated?.(from, name, oldValue)
		} else {
			this.#noteVetoedAttribute(from, name, namespaceURI)
		}
	}

	// Note the `open` value the morph means an accordion item to have, whatever the browser does to it:
	// the target's, unless the update was vetoed, or `preserveChanges` keeps the item open or closed.
	#noteIntendedOpen(details: Element, to: Element, open: string | null): void {
		const vetoed = this.#vetoedControls?.has(details) ?? false
		let intended = getAttributeNS(to, null, "open")
		if (vetoed) intended = open
		else if (this.#preserveChanges) intended = open === null ? null : (intended ?? open)

		if (intended === null) return

		;(this.#openDetails ??= new Map()).set(details, intended)
	}

	// Opening an accordion item closes the open one in its group, which may be vetoed, kept by the user,
	// or wanted open by the target, since the morph may not have reached it yet. So the item opens outside
	// its group, and rejoining the group closes it instead. It's opened again when the morph settles, if
	// nothing else in its group is open by then.
	#openDetailsItem(details: Element, value: string): void {
		const name = getAttributeNS(details, null, "name")
		if (name && openDetailsInGroup(details).length > 0) {
			setAttributeNS(details, null, "name", "")
			setAttributeNS(details, null, "open", value)
			setAttributeNS(details, null, "name", name)
		} else {
			setAttributeNS(details, null, "open", value)
		}
	}

	// Note the open accordion items in a new node, since the browser closes them on insertion while
	// another item in their group is open.
	#noteAddedDetails(element: Element): void {
		const openDetails = (this.#openDetails ??= new Map())
		const open = isDetailsElement(element) ? getAttributeNS(element, null, "open") : null
		if (open !== null) openDetails.set(element, open)
		const items = getElementsByTagName(element, "details")
		for (let i = 0; i < items.length; i++) {
			const item = items[i]!
			const value = getAttributeNS(item, null, "open")
			if (value !== null && isDetailsElement(item)) openDetails.set(item, value)
		}
	}

	// Reset user changes to match the target markup. Skip any property whose
	// attribute update was vetoed, since the attributes then still differ.
	#resetFormProperties(from: Element, to: Element): void {
		if (isInputElement(from)) {
			const checked = hasAttribute(to, "checked")
			// The markup decides, so it doesn't get back a check another radio took from it.
			if (hasAttribute(from, "checked") === checked) this.#displacedRadios?.delete(from)
			if (from.checked !== checked && hasAttribute(from, "checked") === checked) {
				// Checking a radio unchecks the rest of its group, which gets its check back if the radio then leaves,
				// as a radio with a `form` attribute does when the morph adds or changes its form later.
				const group = checked && from.type === "radio" && from.hasAttribute("form") ? checkedRadiosInGroup(from) : null
				from.checked = checked
				if (group) this.#noteDisplacedRadios(group, from)
				if (from.type === "radio") (this.#radiosToSync ??= new Set()).add(from)
			} else if (checked && from.type === "radio") {
				// Adding `checked` checks the radio, which unchecks the others in its group, even later ones.
				;(this.#radiosToSync ??= new Set()).add(from)
			}

			// Checkbox and radio values aren't user-editable, and assigning them writes the value attribute.
			// The browser sanitizes both values, so compare with what the target's markup shows.
			const type = from.type
			const value = getAttribute(to, "value")
			const target = to as HTMLInputElement
			if (
				type !== "file" &&
				type !== "checkbox" &&
				type !== "radio" &&
				type === target.type &&
				getAttribute(from, "value") === value
			) {
				const shown = isDirtyInput(target) ? (value ?? "") : target.value
				if (from.value !== shown && !resanitizeValue(from, to, value, shown)) from.value = shown
			}
		} else if (isOptionElement(from)) {
			const selected = hasAttribute(to, "selected")
			if (from.selected !== selected && hasAttribute(from, "selected") === selected) {
				from.selected = selected
				// WebKit can keep showing a drop-down's option the morph deselects, so a select around the root syncs.
				if (this.#enclosingSelect?.[0].options[from.index] === from) this.#resetEnclosingOption = true
			}
		}
	}

	#resetTextArea(textarea: HTMLTextAreaElement): void {
		// Assigning `.value` marks it dirty, so only do it when it has actually diverged.
		if (!this.#preserveChanges && isDirtyTextArea(textarea)) {
			textarea.value = textarea.defaultValue
		}
	}

	visitChildNodes(from: Element, to: Element): void {
		if (!(this.#options.beforeChildrenVisited?.(from) ?? true)) {
			this.#pinSubtree(from)
			this.#settleIfRoot(from)
			return
		}

		// The focused editing host keeps what the user typed, as a typed-in input keeps its value, and nothing inside it
		// moves elsewhere. So does an element inside it, when the morph starts there. When the target holds a
		// `morphlex-clobber` element, its children are visited, so that element discards the user's changes.
		const keepsEdits = this.#preserveChanges && this.#editor !== null && contains(this.#editor, from) && !this.#holdsClobbered(to)
		if (keepsEdits) this.#pinSubtree(from)
		if (keepsEdits || isFilledSelectedContent(from)) {
			this.#settleIfRoot(from)
			this.#options.afterChildrenVisited?.(from)
			return
		}

		if (isTemplateElement(from) && isTemplateElement(to)) {
			this.#visitTemplateContent(from, to)
			this.#settleIfRoot(from)
			this.#options.afterChildrenVisited?.(from)
			return
		}

		if (isSelectElement(from) && isSelectElement(to)) this.#liveSelects.set(to, from)

		// Each pass pairs the targets still without a candidate with the candidates still free, from the surest
		// pairing to the loosest, and the remaining candidates are removed before the targets are placed.
		// Placing the children moves the target's text into a textarea, so its text is read first.
		const textAreaText = isTextAreaElement(from) ? textContentOf(to) : null
		this.#morphChildNodes(from, to)

		// Changing a textarea's text updates its default value, which the browser copies to `.value` until the user
		// changes it, so the browser decides whether the user changed it. Text that still differs from the target's
		// means a callback vetoed the update, so the value is left alone too.
		if (isTextAreaElement(from) && textContentOf(from) === textAreaText) this.#resetTextArea(from)
		// Sync the select before a root settles, which syncs it again, so nothing changes it after its callbacks.
		if (isSelectElement(from)) this.#syncDefaultSelection(from)
		this.#settleIfRoot(from)

		this.#options.afterChildrenVisited?.(from)
	}

	// A shadow root's children are visited like an element's, without what's special to some elements.
	#visitShadowRootChildNodes(from: ShadowRoot, to: DocumentFragment): void {
		if (this.#options.beforeChildrenVisited?.(from) ?? true) {
			this.#morphChildNodes(from, to)
			this.#settleIfRoot(from)
			this.#options.afterChildrenVisited?.(from)
		} else {
			this.#pinSubtree(from)
			this.#settleIfRoot(from)
		}
	}

	#morphChildNodes(from: ParentNode, to: ParentNode): void {
		const text = onlyTextChildOf(from)
		const targetText = text && onlyTextChildOf(to)
		if (text && targetText && isWhitespaceTextNode(text) === isWhitespaceTextNode(targetText)) {
			// Text that's the only child on both sides would be matched with the other text and stay where it is, so
			// it's morphed straight away.
			this.#morphOneToOne(text, targetText)
		} else {
			const siblings = new Siblings(from, to, this.#preserveChanges)
			this.#matchEqualElements(siblings)
			this.#matchDirtyElements(siblings)
			this.#matchElementsById(siblings)
			this.#leaveClaimedTargets(siblings, from)
			this.#matchElementsByIdSets(siblings)
			if (this.#preserveChanges && this.#dirtyElements) this.#matchElementsByChoices(siblings)
			if (this.#dirtyElements) {
				this.#takeEqualTargets(siblings)
				this.#matchElementsByDirtyOutline(siblings)
			}
			this.#matchElementsByAttributes(siblings)
			this.#matchElementsByKind(siblings)
			this.#matchEqualNodes(siblings)
			this.#matchNodesByType(siblings)
			this.#orderIdenticalCandidates(siblings)
			// The candidates still here, and whether a callback vetoed their removal or it waits for the morph to settle.
			let kept: Map<ChildNode, boolean> | null = null
			for (let i = 0; i < siblings.from.length; i++) {
				if (!siblings.candidateActive[i]) continue
				const candidate = siblings.from[i]!
				const vetoed = this.#removeNode(candidate)
				if (parentNodeOf(candidate) === from) (kept ??= new Map()).set(candidate, vetoed)
			}
			this.#placeChildren(from, siblings, kept)
		}
	}

	// Match elements by isEqualNode. With many siblings, bucket the candidates rather than comparing every pair. An
	// element holding the user's changes can't equal its target, so it's left for the pass after this one.
	#matchEqualElements(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		const dirtyElements = this.#dirtyElements
		const buckets =
			candidateElements.length * unmatchedElements.length > 1024 ? new EqualBuckets(siblings, candidateElements) : null

		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue
			const element = to[target] as Element
			let candidates = candidateElements
			let c = 0
			if (buckets) {
				const bucket = buckets.get(element)
				if (bucket === undefined) continue
				candidates = bucket
				c = buckets.firstActive(bucket, candidateActive)
			}

			for (; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue
				const candidate = from[candidateIndex] as Element
				if (dirtyElements?.has(candidate)) continue

				if (isEqualNode(candidate, element)) {
					siblings.take(target, candidateIndex, Operation.EqualNode)
					break
				}
				buckets?.fail(candidates)
			}
		}
	}

	// Match elements that only differ by the user's changes, so a changed control keeps its own target.
	// Such elements share their shape, so the candidates are bucketed by it rather than comparing every pair.
	#matchDirtyElements(siblings: Siblings): void {
		const dirtyElements = this.#dirtyElements
		if (!dirtyElements) return
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings

		const candidatesByShape = (siblings.dirtyCandidatesByShape = bucketByShape(
			siblings,
			candidateElements.filter((candidate) => candidateActive[candidate] && dirtyElements.has(from[candidate] as Element)),
		))

		const firstActive: Map<Array<number>, number> = new Map()
		for (let i = 0; candidatesByShape.size && i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue
			const element = to[target] as Element
			const candidates = candidatesByShape.get(siblings.shapeOf(element))
			// A target discarding user changes can't keep them, so it's left for the passes that rank it last.
			if (!candidates || this.#holdsClobbered(element)) continue

			// Elements with the same shape are equal apart from `morphlex-dirty`, so the target takes the bucket's first
			// candidate that isn't taken yet.
			let c = firstActive.get(candidates) ?? 0
			while (c < candidates.length && !candidateActive[candidates[c]!]) c++
			firstActive.set(candidates, c)
			const candidateIndex = candidates[c]
			if (candidateIndex !== undefined) siblings.take(target, candidateIndex, Operation.SameElement)
		}
	}

	// When a changed element is still without a target, the free elements with the same outline (its shape without
	// attributes) take the targets with that outline, in order and among the targets the attribute and kind passes
	// would give them, so the user's changes stay in their place among elements like theirs, rather than going to the
	// first target of their kind. An outline spans the whole subtree, so it's only worked out for elements with a
	// changed element's name.
	#matchElementsByDirtyOutline(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		const dirtyElements = this.#dirtyElements!
		const outlines: Set<string> = new Set()
		const names: Set<string> = new Set()
		for (const candidates of [...siblings.dirtyCandidatesByShape!.values(), siblings.displaced]) {
			for (const candidateIndex of candidates) {
				if (!candidateActive[candidateIndex]) continue
				const candidate = from[candidateIndex] as Element
				outlines.add(outlineOf(candidate))
				names.add(localNameOf(candidate))
			}
		}
		if (!names.size) return

		const candidatesByOutline: Map<string, Array<number>> = new Map()
		for (const candidateIndex of candidateElements) {
			if (!candidateActive[candidateIndex]) continue
			const candidate = from[candidateIndex] as Element
			if (!names.has(localNameOf(candidate))) continue
			const outline = outlineOf(candidate)
			if (!outlines.has(outline)) continue
			addToBucket(candidatesByOutline, outline, candidateIndex)
		}
		const targets: Array<[number, Array<number>]> = []
		const targetCounts: Map<Array<number>, number> = new Map()
		const reserved: Set<number> = new Set()
		// A target discarding user changes only takes an untouched candidate, so it's left out once none is left.
		const untouchedLeft: Map<Array<number>, number> = new Map()
		for (const candidates of candidatesByOutline.values()) {
			untouchedLeft.set(candidates, candidates.filter((candidate) => !dirtyElements.has(from[candidate] as Element)).length)
		}
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue
			const element = to[target] as Element
			if (!names.has(localNameOf(element))) continue
			const candidates = candidatesByOutline.get(outlineOf(element))
			if (!candidates || (!untouchedLeft.get(candidates) && this.#holdsClobbered(element))) continue
			targets.push([target, candidates])
			// A target counts when a candidate not yet counted for another target can take it, since a target none can
			// take leaves a candidate without one. Targets usually go to candidates in order, so the search starts at the
			// candidate in this target's place.
			const count = targetCounts.get(candidates) ?? 0
			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[(count + c) % candidates.length]!
				if (!reserved.has(candidateIndex) && this.#canTakeByOutline(element, candidateIndex, siblings)) {
					reserved.add(candidateIndex)
					targetCounts.set(candidates, count + 1)
					if (!dirtyElements.has(from[candidateIndex] as Element))
						untouchedLeft.set(candidates, untouchedLeft.get(candidates)! - 1)
					break
				}
			}
		}
		// When there are fewer targets than candidates, the untouched candidates go rather than the user's changes. The
		// identical candidates are put back in order later.
		for (const [candidates, count] of targetCounts) {
			if (count >= candidates.length) continue
			candidates.sort(
				(a, b) => Number(dirtyElements.has(from[b] as Element)) - Number(dirtyElements.has(from[a] as Element)) || a - b,
			)
		}

		const firstActive: Map<Array<number>, number> = new Map()
		for (const [target, candidates] of targets) {
			const element = to[target] as Element
			// Each candidate is taken once, so the bucket skips its taken prefix.
			let first = firstActive.get(candidates) ?? 0
			while (first < candidates.length && !candidateActive[candidates[first]!]) first++
			firstActive.set(candidates, first)
			for (let c = first; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (candidateActive[candidateIndex] && this.#canTakeByOutline(element, candidateIndex, siblings)) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// The outline holds the element's name, so the two are of the same kind, but an input of another type would be replaced.
	// A target discarding user changes only takes an untouched candidate, so it keeps its place among the rest.
	#canTakeByOutline(element: Element, candidateIndex: number, siblings: Siblings): boolean {
		const candidate = siblings.from[candidateIndex] as Element
		return (
			!this.#holdsOtherChoice(candidate, element, siblings) &&
			(!this.#dirtyElements!.has(candidate) || !this.#holdsClobbered(element)) &&
			((canSoftMatchByTagName(element) && canSoftMatchByTagName(candidate)) ||
				(sharesMatchKey(element, candidate) && canMorphElementInPlace(candidate, element)))
		)
	}

	// Match by exact id.
	#matchElementsById(siblings: Siblings): void {
		const { to, candidateElementsById, unmatchedElements, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const id = idOf(to[target] as Element)
			if (id === "") continue

			const candidates = candidateElementsById.get(id)
			if (candidates === undefined) continue

			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (candidateActive[candidateIndex] && siblings.sameKind(target, candidateIndex)) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// A target whose live element is elsewhere is left for #addNode to claim, so no other candidate takes its id.
	#leaveClaimedTargets(siblings: Siblings, parent: ParentNode): void {
		const { to, unmatchedElements, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (unmatchedActive[target] && this.#canClaim(to[target] as Element, parent)) unmatchedActive[target] = 0
		}
	}

	// Match a target by the ids inside it against the ids inside each candidate, since elements holding ids
	// may not have ids themselves.
	#matchElementsByIdSets(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const idArray = this.#idArrayMap.get(to[target]!)
			if (!idArray) continue

			candidateLoop: for (let c = 0; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue

				const candidateIdSet = this.#idSetMap.get(from[candidateIndex]!)
				if (!candidateIdSet) continue
				for (let a = 0; a < idArray.length; a++) {
					if (candidateIdSet.has(idArray[a]!)) {
						siblings.take(target, candidateIndex, Operation.SameElement)
						break candidateLoop
					}
				}
			}
		}
	}

	// Under preserveChanges, match a checkbox, radio or option the user changed to a target with the same
	// choice, and a wrapper without its own identity holding some to a target holding one of the same choices,
	// so other elements can't take their targets and the user's choices keep their values. A wrapper tries targets
	// without their own identity first, so a new label with an id can't take its place, but can still take its own
	// target when it gains an id. A changed control, or a select, tries targets without an id first in the same way.
	// Then targets with the same attributes apart from class and style, so a form doesn't
	// take another form's target for holding the same choice, and then targets holding all of its choices.
	#matchElementsByChoices(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings

		// Candidates holding more choices go first, so one holding fewer can't take the only target holding them all.
		const choiceCandidates: Array<ChoiceCandidate> = []
		for (let c = 0; c < candidateElements.length; c++) {
			const candidateIndex = candidateElements[c]!
			if (!candidateActive[candidateIndex]) continue
			const candidate = from[candidateIndex] as Element
			const dirtyChoices = this.#dirtyChoicesOf(candidate)
			if (dirtyChoices && (this.#holdsOwnChoices(candidate) || canSoftMatchByTagName(candidate))) {
				choiceCandidates.push([candidateIndex, dirtyChoices.choices, dirtyChoices.picked])
			}
		}
		if (!choiceCandidates.length) return
		choiceCandidates.sort((a, b) => b[1].length - a[1].length)

		// Passes needing the same attributes index targets by their attributes too, so candidates skip the others.
		const attributeKeys: Map<Element, string> = new Map()
		const indexKey = (element: Element, choice: string, sameAttributes: boolean): string => {
			if (!sameAttributes) return choice
			let key = attributeKeys.get(element)
			if (key === undefined) attributeKeys.set(element, (key = attributesKeyOf(element, STYLING_ATTRIBUTES)))
			return `${key}\n${choice}`
		}

		for (const [identified, sameAttributes, allChoices, pickedOnly] of CHOICE_PASSES) {
			// The choices each candidate is matched by in this pass.
			const choicesOf = (k: number): Array<string> => choiceCandidates[k]![pickedOnly ? 2 : 1]

			// Whether the candidate can take the target in this pass.
			const takes = (k: number, target: number): boolean => {
				const candidateIndex = choiceCandidates[k]![0]
				if (!siblings.sameKind(target, candidateIndex)) return false
				const candidate = from[candidateIndex] as Element
				const element = to[target] as Element
				return (
					hasSameIs(candidate, element) &&
					identified === (this.#holdsOwnChoices(candidate) ? this.#idArrayMap.has(element) : !canSoftMatchByTagName(element)) &&
					this.#holdsChoices(choicesOf(k), element, allChoices)
				)
			}

			// The targets in the order candidates try them, smallest first when a candidate needs all of its choices.
			const targets = unmatchedElements.filter((i) => unmatchedActive[i])
			if (allChoices) {
				targets.sort((a, b) => this.#targetChoicesOf(to[a] as Element).size - this.#targetChoicesOf(to[b] as Element).size)
			}

			// A candidate can only take a target holding one of its choices, so index the targets by the choices
			// they hold, in the order candidates try them.
			const holders: Map<string, Array<number>> = new Map()
			for (const target of targets) {
				const element = to[target] as Element
				for (const choice of this.#targetChoicesOf(element).counts.keys()) {
					const key = indexKey(element, choice, sameAttributes)
					addToBucket(holders, key, target)
				}
			}

			// The lists holding the targets the candidate can take. A target holding all of its choices is in every
			// list, so then only the shortest is needed.
			const listsOf = (k: number): Array<Array<number>> => {
				const candidate = from[choiceCandidates[k]![0]] as Element
				let candidateLists: Array<Array<number>> = []
				for (const choice of new Set(choicesOf(k))) {
					const list = holders.get(indexKey(candidate, choice, sameAttributes))
					if (list) candidateLists.push(list)
					else if (allChoices) return []
				}
				if (allChoices && candidateLists.length) {
					candidateLists = [candidateLists.reduce((a, b) => (b.length < a.length ? b : a))]
				}
				return candidateLists
			}

			// Candidates alike in everything `takes` checks pass and fail the same targets. A target in a list holds
			// one of the candidate's choices, so when one choice is enough, their choices don't matter.
			const likenessOf = (k: number): string => {
				const candidate = from[choiceCandidates[k]![0]] as Element
				return JSON.stringify([
					namespaceURIOf(candidate),
					localNameOf(candidate),
					getAttribute(candidate, "is"),
					this.#holdsOwnChoices(candidate),
					allChoices && [...choicesOf(k)].sort(),
					sameAttributes && indexKey(candidate, "", true),
				])
			}

			const matching = new ChoiceMatching(targets, takes, listsOf, likenessOf)
			for (let k = 0; k < choiceCandidates.length; k++) {
				if (candidateActive[choiceCandidates[k]![0]] && choicesOf(k).length) matching.assignFree(k)
			}
			matching.assignRest()

			for (const [target, k] of matching.owners) siblings.take(target, choiceCandidates[k]![0], Operation.SameElement)
		}
	}

	// An element holding the user's changes that's still without a target takes one that an identical
	// untouched sibling took, so the untouched sibling goes rather than the user's changes, and takes another
	// target it equals if there is one.
	#takeEqualTargets(siblings: Siblings): void {
		const { to, unmatchedElements, candidateActive, matches, op } = siblings
		let equalTargets: Map<string, Array<number>> | null = null
		const firstEqual: Map<Array<number>, number> = new Map()
		for (const [shape, candidates] of siblings.dirtyCandidatesByShape!) {
			for (const candidateIndex of candidates) {
				if (!candidateActive[candidateIndex]) continue
				if (!equalTargets) {
					equalTargets = bucketByShape(
						siblings,
						unmatchedElements.filter(
							(target) => op[target] === Operation.EqualNode && !this.#holdsClobbered(to[target] as Element),
						),
						to,
					)
				}
				const list = equalTargets.get(shape)
				if (!list) continue
				// Each target is taken once, so the list skips its taken prefix.
				const t = firstEqual.get(list) ?? 0
				const target = list[t]
				if (target === undefined) continue
				firstEqual.set(list, t + 1)
				candidateActive[matches[target]!] = 1
				siblings.displaced.push(matches[target]!)
				siblings.take(target, candidateIndex, Operation.SameElement)
			}
		}
		// The untouched siblings that went can take other targets they equal.
		if (siblings.displaced.length) this.#matchEqualElements(siblings)
	}

	// Match by a shared `name`, `href` or `src`. A candidate that would be replaced rather than morphed, like an input of
	// another type, is only taken once every target has had the chance to take one it can be morphed into, so it doesn't
	// take the target of a same-name input of the target's type. Replacing it still asks both vetoes before changing
	// anything, which removing it and adding the target as a new node wouldn't.
	#matchElementsByAttributes(siblings: Siblings): void {
		// With many siblings, the candidates are indexed by each `name`, `href` and `src` once a target has one, so a
		// target only looks at those sharing one, in the same order.
		let sharing: Map<string, Array<number>> | null | undefined
		const candidatesFor = (element: Element): Array<number> => {
			if (sharing === undefined) {
				const candidates = siblings.manyPairs()
				sharing = candidates && indexByMatchKeys(siblings.from, candidates)
			}
			return sharing ? candidatesSharing(sharing, element) : siblings.candidateElements
		}
		if (this.#matchElementsByAttributesIf(siblings, true, candidatesFor)) {
			this.#matchElementsByAttributesIf(siblings, false, candidatesFor)
		}
	}

	// Returns whether a candidate was passed over because it would be replaced.
	#matchElementsByAttributesIf(
		siblings: Siblings,
		morphable: boolean,
		candidatesFor: (element: Element) => Array<number>,
	): boolean {
		const { from, to, unmatchedElements, candidateActive, unmatchedActive } = siblings
		let passedOver = false
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const element = to[target] as Element
			if (!hasMatchKeyAttribute(element)) continue

			const candidates = candidatesFor(element)
			for (let c = 0; c < candidates.length; c++) {
				const candidateIndex = candidates[c]!
				if (!candidateActive[candidateIndex] || !siblings.sameKind(target, candidateIndex)) continue
				const candidate = from[candidateIndex] as Element

				if (!this.#holdsOtherChoice(candidate, element, siblings) && sharesMatchKey(element, candidate)) {
					if (morphable && !canMorphElementInPlace(candidate, element)) {
						passedOver = true
						continue
					}
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
		return passedOver
	}

	// Match elements of the same kind, only for elements without distinguishing attributes.
	#matchElementsByKind(siblings: Siblings): void {
		const { from, to, candidateElements, unmatchedElements, candidateActive, unmatchedActive } = siblings
		let firstActiveCandidate = 0
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			if (!unmatchedActive[target]) continue

			const element = to[target] as Element
			if (!canSoftMatchByTagName(element)) continue

			while (firstActiveCandidate < candidateElements.length && !candidateActive[candidateElements[firstActiveCandidate]!]) {
				firstActiveCandidate++
			}

			for (let c = firstActiveCandidate; c < candidateElements.length; c++) {
				const candidateIndex = candidateElements[c]!
				if (!candidateActive[candidateIndex]) continue

				const candidate = from[candidateIndex] as Element
				if (!canSoftMatchByTagName(candidate)) continue

				if (siblings.sameKind(target, candidateIndex) && !this.#holdsOtherChoice(candidate, element, siblings)) {
					siblings.take(target, candidateIndex, Operation.SameElement)
					break
				}
			}
		}
	}

	// The isEqualNode pass gives a target the first equal candidate, which can be the identical sibling of a
	// changed element's live node, and the changed target then takes the sibling's place, so the two swap.
	// Identical candidates are interchangeable, so give each set of them to its targets in order instead, when that
	// leaves more nodes in place. This runs after the other nodes are matched, since they count too.
	// An element holding the user's changes isn't equal to anything, so it's first ordered with the siblings of its
	// shape among targets with the same outline and choices, whatever targets they took, so it keeps its place.
	#orderIdenticalCandidates(siblings: Siblings): void {
		const { from, to, unmatchedElements, matches, op, candidateActive } = siblings
		const dirtyElements = this.#dirtyElements

		if (dirtyElements) {
			// The matched candidates, unless a changed element took a target that discards the user's changes.
			const candidates: Array<number> = []
			const changed: Array<number> = []
			const targetOf: Array<number> = []
			for (let i = 0; i < unmatchedElements.length; i++) {
				const target = unmatchedElements[i]!
				const candidate = matches[target]
				if (candidate === undefined) continue
				const isChanged = dirtyElements.has(from[candidate] as Element)
				if (isChanged && this.#holdsClobbered(to[target] as Element)) continue
				if (isChanged) changed.push(candidate)
				candidates.push(candidate)
				targetOf[candidate] = target
			}
			if (changed.length) {
				// A shape spans the whole subtree, so it's only worked out for candidates with a changed element's name
				// and text, and they're bucketed by it rather than compared pair by pair. The kind pass can give a
				// candidate a target with another outline, and the choice pass a target holding other choices than its
				// identical sibling's, so the target's outline and choices count too, and a changed element never trades
				// into another outline or takes the user's choices to another value. The choice pass prefers targets with
				// the same attributes apart from class and style, so targets holding choices count those attributes too.
				const keyOf = (index: number): string => `${localNameOf(from[index] as Element)} ${textContentOf(from[index]!)}`
				const changedKeys = new Set(changed.map(keyOf))
				const candidatesByShape: Map<string, Array<number>> = new Map()
				for (const candidate of candidates) {
					if (!changedKeys.has(keyOf(candidate))) continue
					const target = to[targetOf[candidate]!] as Element
					const choices = [...this.#targetChoicesOf(target).counts].map(([choice, count]) => `${count} ${choice}`).sort()
					if (choices.length) choices.push(attributesKeyOf(target, STYLING_ATTRIBUTES))
					const shape = siblings.shapeOf(from[candidate]!) + outlineOf(target) + JSON.stringify(choices)
					addToBucket(candidatesByShape, shape, candidate)
				}
				// Each set holding a changed element takes its targets in order. The other sets are left to the ordering
				// below, which keeps the passes' order on a tie.
				const ordered = matches.slice()
				let reordered = false
				const isChanged = (candidate: number): boolean => dirtyElements.has(from[candidate] as Element)
				// The untouched candidates no target took, by shape, which can stay instead of an identical one.
				const goingByShape = bucketByShape(
					siblings,
					siblings.candidateElements.filter(
						(candidate) => candidateActive[candidate] && !isChanged(candidate) && changedKeys.has(keyOf(candidate)),
					),
				)
				// The sets that can trade candidates with those going are ordered last, so the other sets are in order
				// when the crossings are counted.
				const buckets = [...candidatesByShape.values()].filter((bucket) => bucket.some(isChanged))
				const goingOf = buckets.map((bucket) =>
					goingByShape.size ? goingByShape.get(siblings.shapeOf(from[bucket[0]!]!)) : undefined,
				)
				const order = buckets.map((_, b) => b).sort((a, b) => Number(!!goingOf[a]) - Number(!!goingOf[b]))
				const targetsOf = buckets.map((bucket) => bucket.map((candidate) => targetOf[candidate]!).sort((a, b) => a - b))
				const canTake = (candidate: number, target: number): boolean =>
					!isChanged(candidate) || !this.#holdsClobbered(to[target] as Element)
				// Choosing which candidates stay in one set moves the matches the next set counts crossings with, so the sets
				// that can trade with those going are ordered twice.
				let budget = STAYING_CELLS
				for (const b of [...order, ...order.filter((b) => goingOf[b])]) {
					let bucket = buckets[b]!
					const targets = targetsOf[b]!
					const going = goingOf[b]
					// Each choice fills a table of cells and walks every match, out of a budget for all the sets, so many sets
					// sharing many candidates going stay fast. Past it, the candidates the passes kept stay.
					const cells = going?.length ? (bucket.length + going.length + 1) * (going.length + 1) + ordered.length : 0
					if (going?.length && cells <= budget) {
						budget -= cells
						const staying = new Set(bucket)
						bucket = buckets[b] = chooseStaying([...bucket, ...going], targets, ordered, isChanged, staying, canTake)
						const stays = new Set(bucket)
						for (const candidate of [...staying, ...going]) candidateActive[candidate] = stays.has(candidate) ? 0 : 1
						going.splice(0, going.length, ...[...staying, ...going].filter((candidate) => !stays.has(candidate)))
					} else {
						bucket.sort((a, b) => a - b)
					}
					const takers = takeInOrder(bucket, targets, isChanged, (target) => this.#holdsClobbered(to[target] as Element))
					for (let t = 0; t < targets.length; t++) {
						if (ordered[targets[t]!] !== takers[t]) {
							ordered[targets[t]!] = takers[t]!
							reordered = true
						}
					}
				}
				if (reordered) {
					for (let i = 0; i < unmatchedElements.length; i++) {
						const target = unmatchedElements[i]!
						const candidate = (matches[target] = ordered[target]!)
						// Equal targets skip the morph, which a changed element needs.
						if (candidate !== undefined && dirtyElements.has(from[candidate] as Element)) op[target] = Operation.SameElement
					}
				}
			}
		}

		// The untouched candidates that can trade targets, the ones taken by a target they didn't equal, and the
		// target of each. A candidate whose id no other sibling has is identical to none of them.
		const { candidateElementsById } = siblings
		const candidates: Array<number> = []
		const changed: Array<number> = []
		const targetOf: Array<number> = []
		for (let i = 0; i < unmatchedElements.length; i++) {
			const target = unmatchedElements[i]!
			const candidate = matches[target]
			if (candidate === undefined || dirtyElements?.has(from[candidate] as Element)) continue
			const id = idOf(from[candidate] as Element)
			if (id !== "" && candidateElementsById.get(id)!.length === 1) continue
			candidates.push(candidate)
			targetOf[candidate] = target
			if (op[target] !== Operation.EqualNode) changed.push(candidate)
		}
		if (changed.length) {
			// With many siblings, compare within the candidate's bucket.
			const buckets = changed.length * candidates.length > 1024 ? new EqualBuckets(siblings, candidates) : null
			const identicalTo = (candidate: number): Array<number> => {
				const bucket = buckets ? buckets.get(from[candidate]!)! : candidates
				const identical = bucket.filter((other) => other === candidate || isEqualNode(from[other]!, from[candidate]!))
				buckets?.fail(bucket, bucket.length - identical.length)
				return identical
			}
			// Ordering a set can cross other matches, so keep the order the passes chose unless ordering leaves more
			// nodes in place. On a tie, it's other nodes that move, and whitespace is reused around the nodes that stay.
			const ordered = matches.slice()
			if (
				orderSets(ordered, changed, targetOf, identicalTo) &&
				longestIncreasingSubsequence(ordered).length > longestIncreasingSubsequence(matches).length
			) {
				for (let target = 0; target < ordered.length; target++) matches[target] = ordered[target]!
			}
		}
	}

	// Match the other nodes by isEqualNode.
	#matchEqualNodes(siblings: Siblings): void {
		const { from, to, candidateNodes, unmatchedNodes, candidateActive } = siblings
		for (let i = 0; i < unmatchedNodes.length; i++) {
			const target = unmatchedNodes[i]!
			const node = to[target]!
			for (let c = 0; c < candidateNodes.length; c++) {
				const candidateIndex = candidateNodes[c]!
				if (candidateActive[candidateIndex] && isEqualNode(from[candidateIndex]!, node)) {
					siblings.take(target, candidateIndex, Operation.EqualNode)
					break
				}
			}
		}
	}

	// Match the other nodes by node type.
	#matchNodesByType(siblings: Siblings): void {
		const { from, to, candidateNodes, unmatchedNodes, candidateActive, unmatchedActive } = siblings
		for (let i = 0; i < unmatchedNodes.length; i++) {
			const target = unmatchedNodes[i]!
			if (!unmatchedActive[target]) continue

			const nodeType = nodeTypeOf(to[target]!)
			for (let c = 0; c < candidateNodes.length; c++) {
				const candidateIndex = candidateNodes[c]!
				if (candidateActive[candidateIndex] && nodeType === nodeTypeOf(from[candidateIndex]!)) {
					siblings.take(target, candidateIndex, Operation.SameNode)
					break
				}
			}
		}
	}

	// Put the target's children in order, moving the matched candidates that aren't already in order, morphing
	// each into its target and adding the targets nothing matched.
	#placeChildren(parent: ParentNode, siblings: Siblings, kept: Map<ChildNode, boolean> | null): void {
		const { from, to, matches, op } = siblings

		// The nodes in the longest increasing subsequence of matches don't need to move.
		const lisIndices = longestIncreasingSubsequence(this.#pinFocused(parent, siblings))
		const shouldNotMove: Array<boolean> = new Array(from.length)
		for (let i = 0; i < lisIndices.length; i++) {
			shouldNotMove[matches[lisIndices[i]!]!] = true
		}

		// The matches that move, which go after the kept nodes too, so a kept node never ends up after the nodes placed
		// in front of one of them.
		let moving: Set<ChildNode> | null = null
		if (kept) {
			moving = new Set()
			for (let i = 0; i < to.length; i++) {
				const matchInd = matches[i]
				if (matchInd !== undefined && !shouldNotMove[matchInd]) moving.add(from[matchInd]!)
			}
		}

		// Whitespace stays in place for now, so target whitespace can reuse whatever is at the insertion point.
		const liveWhitespace: Set<ChildNode> | null = siblings.whitespace.length ? new Set() : null
		for (let i = 0; i < siblings.whitespace.length; i++) {
			liveWhitespace!.add(from[siblings.whitespace[i]!]!)
		}

		let insertionPoint: ChildNode | null = firstChildOf(parent)
		const placed: Array<ChildNode> = []
		for (let i = 0; i < to.length; i++) {
			// A callback can remove the insertion point, such as the whitespace after the node it visits.
			// Then carry on after the last node placed that's still here.
			if (insertionPoint && parentNodeOf(insertionPoint) !== parent) {
				insertionPoint = firstChildOf(parent)
				for (let index = placed.length - 1; index >= 0; index--) {
					if (parentNodeOf(placed[index]!) === parent) {
						insertionPoint = nextSiblingOf(placed[index]!)
						break
					}
				}
			}

			const node = to[i]!
			const matchInd = matches[i]
			const isWhitespace = isWhitespaceTextNode(node)
			// Target whitespace still reuses the live whitespace where it is.
			if (kept && !(isWhitespace && insertionPoint && liveWhitespace?.has(insertionPoint))) {
				insertionPoint = skipKeptNodes(insertionPoint, kept, moving!, liveWhitespace)
			}
			if (isWhitespace && insertionPoint && liveWhitespace?.has(insertionPoint)) {
				const whitespace: ChildNode = insertionPoint
				liveWhitespace.delete(whitespace)
				placed.push(whitespace)
				insertionPoint = nextSiblingOf(whitespace)
				this.#morphOneToOne(whitespace, node)
			} else if (matchInd !== undefined) {
				const match = from[matchInd]!
				const operation = op[i]!

				if (!shouldNotMove[matchInd]) {
					const outsideRadios = this.#uncheckRadiosNamingFormsIn(match, getRootNode(match))
					const insideRadios = this.#uncheckRadiosInFormsIn(match)
					const unnamed = unnameRadiosNamingFormsIn(match)
					const focus = this.#watchFocus(match, parent)
					moveBefore(parent, match, insertionPoint)
					if (focus) this.#restoreFocus(focus)
					restoreNames(unnamed)
					this.#checkRadios(outsideRadios)
					this.#checkRadios(insideRadios, true)
				}
				// Read this before the morph, which can replace the match. A match that moved itself
				// elsewhere when it reconnected leaves the insertion point where it was.
				if (parentNodeOf(match) === parent) insertionPoint = nextSiblingOf(match)

				if (operation === Operation.EqualNode) {
				} else if (operation === Operation.SameElement) {
					// Elements matched by id skip the isEqualNode pass, so check here before visiting them.
					if (isEqualNode(match, node)) {
					} else {
						this.#visitNode(match, node, hasSameIs(match as Element, node as Element))
					}
				} else {
					this.#morphOneToOne(match, node)
				}
				// A replaced match leaves the target in its place.
				placed.push(parentNodeOf(match) === parent ? match : node)
			} else {
				const added = this.#addNode(parent, node, insertionPoint)
				if (added) placed.push(added)
				// A new node can move or remove itself when it's added, and then the insertion point stays.
				if (added === node && parentNodeOf(node) === parent) insertionPoint = nextSiblingOf(node)
			}
		}

		// The whitespace before the vetoed nodes after the last target stays with them too.
		if (kept && liveWhitespace && insertionPoint && parentNodeOf(insertionPoint) === parent) {
			skipKeptNodes(insertionPoint, kept, moving!, liveWhitespace)
		}

		if (liveWhitespace) {
			for (const whitespace of liveWhitespace) {
				if (parentNodeOf(whitespace) === parent) this.#removeNode(whitespace)
			}
		}
	}

	// The focus a move of the node into the parent takes, watched until it's put back, so focus that another element
	// takes meanwhile stays there, even on the body, which also has focus when the move loses it. The parent can be in
	// another document, which the element is adopted into.
	#watchFocus(node: Node, parent: ParentNode): Focus | null {
		const focus = focusHeldBy(node)
		if (!focus) return null
		// A document's own children move around its root element, which holds the focused element and is pinned.
		/* v8 ignore next */
		const destination = nodeTypeOf(parent) === DOCUMENT_NODE_TYPE ? (parent as Document) : ownerDocumentOf(parent)!
		this.#watchedFocus = focus
		this.#watchedDocuments = destination === focus.document ? [destination] : [focus.document, destination]
		for (const document of this.#watchedDocuments) {
			EventTarget.prototype.addEventListener.call(document, "focusin", this.#noteFocusTaken, true)
		}
		return focus
	}

	// Focus that the element itself takes, such as when it's put back, isn't taken from it.
	readonly #noteFocusTaken = (event: Event): void => {
		const focus = this.#watchedFocus!
		if (event.composedPath()[0] !== focus.element) focus.taken = true
	}

	#restoreFocus(focus: Focus): void {
		const retry = restoreFocus(focus)
		for (const document of this.#watchedDocuments) removeEventListener(document, "focusin", this.#noteFocusTaken)
		this.#watchedFocus = null
		this.#watchedDocuments = []
		if (!retry) return
		// Try again when the morph settles, unless another element takes focus first, such as from a callback.
		const unrestored = this.#unrestoredFocus
		/* v8 ignore next -- tests haven't found a way to take focus between a failed restore and the retry */
		if (unrestored) removeEventListener(unrestored.document, "focusin", this.#dropUnrestoredFocus)
		focus.document = ownerDocumentOf(focus.element)!
		// The nodes holding the selection can still move or go before then, so follow its ends with live ranges, which
		// a removal leaves where the node was. A custom element's lifecycle callback can shorten the text during the
		// move, so the selection may no longer fit.
		const range = focus.range
		/* v8 ignore start -- Chromium's moveBefore keeps focus in an element holding the document's selection */
		try {
			this.#unrestoredRange = range && [rangeAt(focus.document, range[0], range[1]), rangeAt(focus.document, range[2], range[3])]
		} catch {
			this.#unrestoredRange = null
		}
		/* v8 ignore stop */
		this.#unrestoredFocus = focus
		EventTarget.prototype.addEventListener.call(focus.document, "focusin", this.#dropUnrestoredFocus, {
			capture: true,
			once: true,
		})
	}

	/* v8 ignore start -- as above */
	readonly #dropUnrestoredFocus = (): void => {
		this.#unrestoredFocus = null
	}
	/* v8 ignore stop */

	// Without `moveBefore`, moving the focused element loses focus. So keep only the matches in order with the child
	// holding it, so the longest increasing subsequence includes that child and its siblings move around it, even when
	// that moves more of them. `moveBefore` keeps focus, so there the fewest nodes move.
	#pinFocused(parent: ParentNode, siblings: Siblings): Array<number | undefined> {
		const { from, matches } = siblings
		const holders = this.#focusHolders
		/* v8 ignore start -- only browsers without moveBefore pin the focused child */
		if (SUPPORTS_MOVE_BEFORE || !holders?.has(parent)) return matches

		const pinnedIndex = matches.findIndex((match) => match !== undefined && holders.has(from[match]!))
		if (pinnedIndex === -1) return matches

		const pinned = matches[pinnedIndex]!
		return matches.map((match, i) =>
			(i < pinnedIndex ? match < pinned : i > pinnedIndex ? match > pinned : true) ? match : undefined,
		)
	}
	/* v8 ignore stop */

	// A morph inside a select never visits the select, so sync it when the morph settles if the morph
	// changed what the markup selects or what the select shows, or reset an option's selection. A vetoed
	// morph changes nothing, so it leaves it alone.
	setEnclosingSelect(select: HTMLSelectElement, selection: Array<HTMLOptionElement | null>): void {
		this.#enclosingSelect = [select, selection]
	}

	// The browser copies the option only when the selection changes or the `selectedcontent` is inserted, so changing
	// the selected option's content leaves the old copy. So when the morph settles, each one that doesn't match the
	// selected option is inserted again, for the browser to copy the option afresh, unless a callback vetoed it.
	#refreshSelectedContent(select: HTMLSelectElement): void {
		if (!FILLS_SELECTED_CONTENT || select.multiple) return

		const elements = getElementsByTagName(select, "selectedcontent")
		const option = select.options[select.selectedIndex] ?? null
		for (let i = 0; i < elements.length; i++) {
			const element = elements[i]!
			if (isSelectedContent(element) && !hasEqualChildren(element, option) && !this.#isVetoed(element)) {
				insertBefore(parentNodeOf(element)!, element, nextSiblingOf(element))
			}
		}
	}

	#syncEnclosingSelect(): void {
		const enclosing = this.#enclosingSelect
		if (!enclosing) return
		this.#enclosingSelect = null

		const [select, selection] = enclosing
		if (this.#preserveChanges) return

		const newSelection = selectionOf(select)
		const same = newSelection.length === selection.length && newSelection.every((option, i) => option === selection[i])
		if (same && !this.#resetEnclosingOption) return

		this.#syncDefaultSelection(select)
	}

	// The browser keeps its selection when options are added or moved, or when the select changes
	// between a drop-down and a list box, so an untouched select can end up showing something
	// other than its markup. Select what the markup selects. Under `preserveChanges` the browser's
	// selection stands, because a user who picked the default option again looks untouched. But when a select
	// without a selection becomes a drop-down, the browser picks the first option, wherever the morph has got to with
	// the options, so the drop-down shows what the markup selects.
	#syncDefaultSelection(select: HTMLSelectElement): void {
		if (this.#preserveChanges && !(this.#unselectedSelects?.has(select) && isDropDown(select))) return

		const options = select.options
		const defaultOption = select.multiple ? null : defaultOptionOf(select)
		const isSelected = (option: HTMLOptionElement) =>
			select.multiple ? option.hasAttribute("selected") : option === defaultOption

		// Leave the select alone when that would change an option whose update or visit was vetoed. A drop-down's
		// vetoed option can still be selected again, since an earlier option gaining `selected` takes the selection from it.
		if (this.#vetoedControls || this.#vetoedNodes) {
			for (let i = 0; i < options.length; i++) {
				const option = options[i]!
				if (option.selected !== isSelected(option) && (select.multiple || option.selected) && this.#isVetoed(option)) return
			}
		}

		for (let i = 0; i < options.length; i++) {
			const option = options[i]!
			const selected = isSelected(option)
			if (option.selected !== selected) option.selected = selected
		}

		;(this.#syncedSelects ??= new Set()).add(select)
	}

	// A checked radio that's added unchecks the rest of its group, even radios the markup checks later on.
	// It can arrive unchecked too, when the form it adds takes over the group of a checked radio outside.
	// The morph never removes a node it added, so noting the radio is enough.
	#noteAddedRadios(element: Element): void {
		const inputs = isInputElement(element) ? [element] : getElementsByTagName(element, "input")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (isInputElement(input) && input.type === "radio" && (input.checked || input.hasAttribute("checked")))
				(this.#radiosToSync ??= new Set()).add(input)
		}
	}

	// A radio that moved can uncheck the rest of its group, so note the whole group now, in case the
	// morph then removes the radio.
	#noteRadioGroups(element: Element): void {
		const inputs = isInputElement(element) ? [element] : querySelectorAll(element, "input")
		const groups: RadioGroups = new Map()
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (isInputElement(input) && input.type === "radio") {
				const radios = (this.#radiosToSync ??= new Set())
				for (const member of radioGroupOf(input, groups)) radios.add(member)
			}
		}
	}

	// Moving an element can change the form of radios inside it, and briefly of radios outside it
	// whose form is inside it, and a checked radio that changes form unchecks the rest of its new
	// group. So checked radios outside the element move unchecked and are checked again straight
	// after. Checked radios inside it that change form move unchecked too. With `preserveChanges`
	// they're checked again straight after, so the radios they uncheck get their check back if the
	// markup then unchecks them. Without it, they're checked again when the morph settles if the
	// markup or a veto keeps them checked. Returns the radios to check again straight after.
	#uncheckRadiosForMove(element: Element, parent: ParentNode): Array<HTMLInputElement> | null {
		let radios = this.#uncheckRadiosNamingFormsIn(element, getRootNode(element))

		const inputs = isInputElement(element) ? [element] : querySelectorAll(element, "input")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (isCheckedRadio(input) && input.form !== formAfterMove(input, element, parent)) {
				if (this.#preserveChanges) {
					this.#uncheckRadio(input)
					;(radios ??= []).push(input)
				} else {
					input.checked = false
					;(this.#radiosUncheckedForMove ??= new Set()).add(input)
				}
			}
		}

		return radios
	}

	// A radio with a `form` attribute changes form when a form with that id is added, moved or removed,
	// or when either attribute changes, and a checked one then unchecks the rest of its new group. Firefox
	// and Safari can briefly put it in the group of radios without a form on the way, where it unchecks a
	// radio it never joins. So these radios change form unchecked, and are checked again straight after,
	// which unchecks the rest of their new group as the change itself would. Returns the radios it unchecked,
	// which are only those outside the node unless `inside` is set.
	#uncheckRadiosNamingFormsIn(node: Node, root: Node, inside = false): Array<HTMLInputElement> | null {
		const ids = formIdsIn(node)
		return ids && this.#uncheckRadiosNaming(ids, root, inside ? null : node)
	}

	// Chromium and Firefox briefly reset the form of a radio with a `form` attribute while a form around it
	// moves or leaves, and a checked one then unchecks the radio in the group it joins for that moment. So
	// when a node holding a form moves or leaves, these radios go unchecked, and are checked again straight
	// after, back in the group they were in.
	#uncheckRadiosInFormsIn(node: Node): Array<HTMLInputElement> | null {
		if (
			!isElement(node) ||
			(!isFormElement(node) && (!firstElementChildOf(node) || getElementsByTagName(node, "form").length === 0))
		)
			return null
		return this.#uncheckRadiosWithForm(node)
	}

	// A new radio with a `form` attribute is checked in the group it joins, but can leave that group when the
	// morph adds or changes its form later. So it's inserted unchecked and checked again straight after, which
	// notes the radios it unchecks, to give them their check back if it leaves.
	#uncheckRadiosWithForm(element: Element): Array<HTMLInputElement> | null {
		let unchecked: Array<HTMLInputElement> | null = null
		const inputs = isInputElement(element) ? [element] : querySelectorAll(element, "input[form]:checked")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (isCheckedRadio(input) && input.hasAttribute("form")) {
				this.#uncheckRadio(input, true)
				;(unchecked ??= []).push(input)
			}
		}
		return unchecked
	}

	#uncheckRadiosNaming(ids: ReadonlySet<string>, root: Node, except: Node | null): Array<HTMLInputElement> | null {
		let unchecked: Array<HTMLInputElement> | null = null
		// Only checked inputs matter, which keeps this short on pages with many radios.
		const inputs = querySelectorAll(root as ParentNode, "input[form]:checked, input[form][checked]")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i]!
			if (!isRadio(input) || !ids.has(input.getAttribute("form")!) || (except && contains(except, input))) continue
			if (input.checked) {
				this.#uncheckRadio(input)
				;(unchecked ??= []).push(input)
			} else if (this.#defersRadio(input)) {
				// Another radio of the morph unchecked it in its old group, and the markup decides it in the new one.
				;(this.#radiosToSync ??= new Set()).add(input)
			}
		}
		return unchecked
	}

	// Changing a radio's `form` attribute or a form's id changes the form of radios, like moving a form,
	// changing a radio's name changes its group too, and a checked input that becomes a radio joins one.
	#uncheckRadiosForAttribute(element: Element, name: string, value: string | null): Array<HTMLInputElement> | null {
		if (
			((name === "form" || name === "name") && isCheckedRadio(element)) ||
			(name === "type" &&
				value?.toLowerCase() === "radio" &&
				isInputElement(element) &&
				element.type !== "radio" &&
				element.checked)
		) {
			this.#uncheckRadio(element)
			return [element]
		}
		if (name === "id" && isFormElement(element)) {
			const ids = new Set(value === null || value === "" ? [idOf(element)] : [idOf(element), value])
			return this.#uncheckRadiosNaming(ids, getRootNode(element), null)
		}
		return null
	}

	// Setting `.checked` stops a radio from following its `checked` attribute. So a radio that's checked
	// again straight after, and still follows the attribute, is unchecked by removing the attribute.
	#uncheckRadio(radio: HTMLInputElement, immediate = false): void {
		const value = !immediate && this.#defersRadio(radio) ? null : radio.getAttribute("checked")
		if (value !== null) {
			radio.removeAttribute("checked")
			if (!radio.checked) {
				uncheckedByAttribute.set(radio, value)
				return
			}
			radio.setAttribute("checked", value)
		}
		radio.checked = false
	}

	// Radios that changed form unchecked are checked again. Without `preserveChanges`, the morph's own
	// radios wait until it settles, and are checked only if the markup or a veto keeps them checked, so
	// one the markup unchecks doesn't uncheck the rest of its new group first.
	#checkRadios(radios: Array<HTMLInputElement> | null, immediate = false): void {
		if (!radios) return
		const groups: RadioGroups = new Map()
		for (let i = 0; i < radios.length; i++) {
			const radio = radios[i]!
			if (!immediate && this.#defersRadio(radio) && !uncheckedByAttribute.has(radio)) {
				;(this.#radiosUncheckedForMove ??= new Set()).add(radio)
				continue
			}

			// A radio outside the morph that joins a group with a checked radio inside it leaves that one
			// checked, as when the page is parsed with the radio from the markup coming later.
			const group = radioGroupOf(radio, groups)
			const checkedInMorph = this.#inScope(radio) ? undefined : group.find((member) => member.checked && this.#inScope(member))
			const checked = group.filter((member) => member.checked)

			const value = uncheckedByAttribute.get(radio)
			if (value !== undefined) {
				uncheckedByAttribute.delete(radio)
				radio.setAttribute("checked", value)
				/* v8 ignore next -- Firefox can stop a radio following the attribute while it changes form */
				if (!radio.checked) radio.checked = true
			} else {
				radio.checked = true
			}
			if (checkedInMorph) {
				checkedInMorph.checked = true
				// The radio can still join another group later in the morph, and then gets its check back.
				this.#noteDisplacedRadio(radio, checkedInMorph)
			}

			this.#noteDisplacedRadios(checked, radio)
		}
	}

	// Note the radios that were checked before `radio` took their group.
	#noteDisplacedRadios(checked: Array<HTMLInputElement>, radio: HTMLInputElement): void {
		for (let i = 0; i < checked.length; i++) {
			const member = checked[i]!
			if (!member.checked) this.#noteDisplacedRadio(member, radio)
		}
	}

	// Radios are given back newest first, so a radio displaced again moves to the end.
	#noteDisplacedRadio(member: HTMLInputElement, radio: HTMLInputElement): void {
		const displaced = (this.#displacedRadios ??= new Map())
		displaced.delete(member)
		displaced.set(member, radio)
	}

	// A radio that passed through a group on its way elsewhere, say when the morph removes a form and
	// then the radio, or changes a form's id and then the radio's `form` attribute or name, unchecked a
	// radio it doesn't end up with, or one it no longer keeps unchecked. That one is checked again, unless
	// another radio in its group is checked.
	#restoreDisplacedRadios(displaced: Map<HTMLInputElement, HTMLInputElement>): void {
		const groups: RadioGroups = new Map()
		// Newest first, so a radio that took a group and then lost it to another gets it back before the one it took it from.
		for (const [member, radio] of Array.from(displaced).reverse()) {
			const group = radioGroupOf(member, groups)
			if (radio.checked && group.includes(radio)) continue
			if (group.some((other) => other.checked)) continue
			// Adding the attribute back checks a radio that follows it, and keeps it following it.
			const value = member.getAttribute("checked")
			if (value !== null) {
				member.removeAttribute("checked")
				member.setAttribute("checked", value)
			}
			/* v8 ignore next -- Chromium doesn't check a radio again by its attribute once its group has unchecked it */
			if (!member.checked) member.checked = true
		}
	}

	// Whether a radio that changed form waits until the morph settles to be checked again: one that
	// the morph discards user changes for, which is the whole morph, or inside a `morphlex-clobber` element.
	#defersRadio(radio: HTMLInputElement): boolean {
		if (this.#preserveChanges) return false
		const scope = this.#clobberedScope
		return scope ? contains(scope, radio) : this.#inScope(radio)
	}

	#removeChild(node: ChildNode): void {
		const radios = this.#uncheckRadiosNamingFormsIn(node, getRootNode(node))
		const insideRadios = this.#uncheckRadiosInFormsIn(node)
		remove(node)
		this.#checkRadios(radios)
		this.#checkRadios(insideRadios, true)
	}

	// Check each radio the markup checks, in document order, so the last one wins as when parsing.
	// Radios outside the morph stay as they are, and so does a group with a radio in a vetoed subtree
	// or with a vetoed `checked` update.
	#syncRadioGroups(radios: Set<HTMLInputElement>): void {
		const done = new Set<HTMLInputElement>()
		const groups: RadioGroups = new Map()
		for (const radio of radios) {
			if (done.has(radio)) continue

			// Checking one radio unchecks the others, so a group with a vetoed radio is left as it is.
			const group = radioGroupOf(radio, groups).filter((member) => this.#inScope(member))
			for (const member of group) done.add(member)
			if (group.some((member) => this.#isVetoed(member))) continue

			// Checking each radio in turn would uncheck the one before, so check only the last.
			let last: HTMLInputElement | null = null
			for (const member of group) if (member.hasAttribute("checked")) last = member
			for (const member of group) {
				const checked = member === last
				if (member.checked !== checked) member.checked = checked
			}
		}
	}

	#inScope(node: Node): boolean {
		if (!contains(this.#scope!, node)) return false

		const start = this.#scopeStart
		const end = this.#scopeEnd
		if (start && (contains(start, node) || !(compareDocumentPosition(start, node) & Node.DOCUMENT_POSITION_FOLLOWING)))
			return false
		if (end && (contains(end, node) || !(compareDocumentPosition(end, node) & Node.DOCUMENT_POSITION_PRECEDING))) return false
		return true
	}

	#isVetoed(control: Element): boolean {
		if (this.#vetoedControls?.has(control)) return true
		const nodes = this.#vetoedNodes
		if (nodes) {
			for (let i = 0; i < nodes.length; i++) {
				if (contains(nodes[i]!, control)) return true
			}
		}
		return false
	}

	// A changed control, or a select holding changed options, is matched by its choices even though it has a name.
	#holdsOwnChoices(candidate: Element): boolean {
		return this.#flagged.has(candidate) || isSelectElement(candidate)
	}

	// A checkbox, radio or option the user changed holds their choice of its value, so under
	// preserveChanges it must not be matched to a target with another value, unless the target
	// discards user changes with `morphlex-clobber`.
	#holdsOtherChoice(candidate: Element, element: Element, siblings: Siblings): boolean {
		return (
			this.#preserveChanges &&
			this.#flagged.has(candidate) &&
			!this.#clobbered?.has(element) &&
			this.#choiceIn(siblings, candidate) !== this.#choiceIn(siblings, element)
		)
	}

	// The element's choice, worked out once while its siblings are matched.
	#choiceIn(siblings: Siblings, element: Element): string | null {
		const choices = (siblings.choices ??= new Map())
		let choice = choices.get(element)
		if (choice === undefined) choices.set(element, (choice = this.#choiceOf(element)))
		return choice
	}

	// Whether the target holds all of the choices, or with `all` false, any of them.
	#holdsChoices(choices: Array<string>, element: Element, all: boolean): boolean {
		const targetChoices = this.#targetChoicesOf(element).counts
		if (!all) return choices.some((choice) => targetChoices.has(choice))
		for (const [choice, count] of countChoices(choices)) if ((targetChoices.get(choice) ?? 0) < count) return false
		return true
	}

	// How often each choice appears in the target, and how many choices it holds. A control with a movable id
	// keeps its live element wherever it goes, so it isn't a choice the target can keep for a wrapper. Each choice
	// is keyed with the path down to its control too, which the live control's path has to match to be kept.
	#targetChoicesOf(element: Element): { counts: Map<string, number>; size: number } {
		let targetChoices = this.#targetChoices.get(element)
		if (!targetChoices) {
			const choices: Array<string> = []
			for (const control of [element, ...querySelectorAll(element, "input, option")]) {
				if (this.#isClobberedWithin(control, element) || this.#movesWithin(control, element)) continue
				const choice = this.#choiceOf(control)
				if (choice !== null) choices.push(pathTo(control, element) + choice)
			}
			targetChoices = { counts: countChoices(choices), size: choices.length }
			this.#targetChoices.set(element, targetChoices)
		}
		return targetChoices
	}

	// Whether the control, or an element between it and the wrapper, has an id pairing a live element with a target
	// it can be morphed into, so the control moves with that element, wherever the wrapper goes.
	#movesWithin(control: Element, wrapper: Element): boolean {
		for (let node: Element = control; node !== wrapper; node = parentElementOf(node)!) {
			const live = this.#movableElement(idOf(node))
			const target = live && this.#targetElementsById.get(idOf(node))
			if (target && canMorphElementInPlace(live, target)) return true
		}
		return false
	}

	// Whether the target is, or holds, a `morphlex-clobber` element.
	#holdsClobbered(element: Element): boolean {
		const clobbered = this.#clobbered
		if (!clobbered) return false
		if (!this.#clobberedHolders) {
			this.#clobberedHolders = new Set()
			for (const node of clobbered) {
				for (let holder: Element | null = node; holder && !this.#clobberedHolders.has(holder); holder = parentElementOf(holder)) {
					this.#clobberedHolders.add(holder)
				}
			}
		}
		return this.#clobberedHolders.has(element)
	}

	// Whether the control is in a `morphlex-clobber` element inside the target, or is one, so it can't keep a choice.
	#isClobberedWithin(control: Element, element: Element): boolean {
		const clobbered = this.#clobbered
		if (!clobbered) return false
		for (let node: Element | null = control; node; node = node === element ? null : parentElementOf(node)) {
			if (clobbered.has(node)) return true
		}
		return false
	}

	// An option is keyed by the nearest select around it up to the morph's root, or else the select around the
	// morph, unless it's in a datalist the select doesn't own. A target can still be in another select past its root.
	#choiceOf(element: Element): string | null {
		if (!isOptionElement(element)) return choiceOf(element, null, this.#formOf(element))
		let select: HTMLSelectElement | null = null
		for (
			let node: Element = element, parent = parentElementOf(node);
			parent && node !== this.#root && !this.#targetRoots.has(node);
			node = parent, parent = parentElementOf(parent)
		) {
			if (localNameOf(parent) === "datalist" && namespaceURIOf(parent) === HTML_NAMESPACE) return null
			if (isSelectElement(parent)) {
				select = parent
				break
			}
		}
		select ??= this.#keySelect
		select = (select && this.#liveSelects.get(select)) ?? select
		return choiceOf(element, select, select && this.#formOf(select))
	}

	// The form around the control. A target's control past the target's roots ends up in the form around the morph.
	#formOf(control: Element): HTMLFormElement | null {
		for (let node: Element | null = control; node; node = parentElementOf(node)) {
			if (isFormElement(node) && node !== this.#innerTarget) return node
			if (this.#targetRoots.has(node)) return this.#keyForm
		}
		return null
	}

	// The choices of the checkboxes, radios and options the user changed in this element, or null when there are none.
	// A control with a movable id goes to its own target, so the element doesn't need a target for it.
	// The picked ones leave out options and radios the user moved away from, which can be matched once those can't.
	#dirtyChoicesOf(element: Element): { choices: Array<string>; picked: Array<string> } | null {
		if (!this.#dirtyElements?.has(element)) return null
		const choices: Array<string> = []
		const picked: Array<string> = []
		for (const control of [element, ...querySelectorAll(element, "input, option")]) {
			const choice = this.#flagged.has(control) && !this.#movesWithin(control, element) ? this.#choiceOf(control) : null
			if (choice === null) continue
			const key = pathTo(control, element) + choice
			choices.push(key)
			if (control === element || !isLeftChoice(control)) picked.push(key)
		}
		return choices.length ? { choices, picked } : null
	}

	// A vetoed `selected` or `checked` update leaves the selection alone, like other vetoed form attributes,
	// and a vetoed `open` update leaves an accordion item as it was.
	#noteVetoedAttribute(element: Element, name: string, namespaceURI: string | null): void {
		// Only the attributes in no namespace are the control's state.
		if (namespaceURI !== null) return
		if (
			(name === "selected" && isOptionElement(element)) ||
			(name === "checked" && isInputElement(element)) ||
			(name === "open" && isDetailsElement(element))
		) {
			;(this.#vetoedControls ??= new Set()).add(element)
		}
	}

	// Template content is replaced wholesale rather than morphed, so no node callbacks fire inside it.
	#visitTemplateContent(from: HTMLTemplateElement, to: HTMLTemplateElement): void {
		if (isEqualNode(from.content, to.content)) return
		from.content.replaceChildren(to.content)
	}

	// Add a new node, or claim the live element with its id. Returns the new node or the claim's
	// placeholder, or null when the new node wasn't inserted.
	#addNode(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null): ChildNode | null {
		const placeholder = isElement(node) ? this.#claimMovableElement(node, parent) : null
		if (placeholder) {
			insertBefore(parent, placeholder, insertionPoint)
			return placeholder
		}

		return this.#insertNewNode(parent, node, insertionPoint) ? node : null
	}

	#insertNewNode(parent: ParentNode, node: ChildNode, insertionPoint: ChildNode | null, approved = false): boolean {
		if (!approved && !(this.#options.beforeNodeAdded?.(parent, node, insertionPoint) ?? true)) return false

		// A live target takes its forms away from the radios where it is, in its own document or shadow root
		// and inside it, including forms that live elements claim out of it next. Those inside it are
		// checked again straight away, since they're the target's own state, not markup the morph resets.
		const live = isConnected(node)
		const sourceRadios = live ? this.#uncheckRadiosNamingFormsIn(node, getRootNode(node), true) : null
		// A live target can hold the focused element, which its claimed descendants take out of it next.
		const focus = this.#watchFocus(node, parent)
		clearImplicitSelection(node, parent)
		this.#placeMovableDescendants(node, parent)
		if (this.#targetOpensDetails && isElement(node)) this.#noteAddedDetails(node)
		const radios = this.#uncheckRadiosNamingFormsIn(node, getRootNode(parent))
		const addedRadios =
			this.#targetChecksInputs && isElement(node)
				? this.#uncheckRadiosWithForm(node)
				: live
					? this.#uncheckRadiosInFormsIn(node)
					: null
		moveInto(parent, node, insertionPoint)
		if (focus) this.#restoreFocus(focus)
		this.#checkRadios(radios)
		this.#checkRadios(sourceRadios, true)
		this.#checkRadios(addedRadios, true)
		if (this.#targetChecksInputs && !this.#preserveChanges && isElement(node)) this.#noteAddedRadios(node)
		this.#options.afterNodeAdded?.(node)
		return true
	}

	// Put the live element where its placeholder is and morph it into the target, unless a veto
	// pinned it in the meantime. Then the target is added as a new node instead.
	#completeMove(move: PendingMove): void {
		const { live, target, placeholder, preserveChanges, approved } = move
		// A move completes once, even when another move completed it first.
		if (!this.#claimedElements.has(live) || this.#movesInProgress.has(move)) return

		// An element doesn't move out of an ancestor whose visit can still be vetoed: one that's claimed,
		// or one that a pending move will reach. Those moves complete first. A move that's already waiting
		// on this one is a cycle, which this move breaks by adding its target as a new node instead.
		this.#movesInProgress.add(move)
		let inCycle = false
		for (let ancestor = parentElementOf(live); ancestor && !inCycle;) {
			const first = this.#claimedElements.get(ancestor) ?? this.#moveReaching(ancestor)
			if (!first) {
				ancestor = parentElementOf(ancestor)
			} else if (this.#movesInProgress.has(first)) {
				inCycle = true
			} else {
				this.#completeMove(first)
				ancestor = parentElementOf(live)
			}
		}
		this.#movesInProgress.delete(move)
		this.#claimedElements.delete(live)

		// A custom element's `connectedCallback` can replace its children, placeholder included.
		const parent = parentNodeOf(placeholder)
		if (!parent) return

		const saved = this.#preserveChanges
		const savedScope = this.#clobberedScope
		this.#preserveChanges = preserveChanges
		if (!preserveChanges && this.#options.preserveChanges) this.#clobberedScope = live

		if (!inCycle && this.#liveElementsById.get(idOf(target)) === live && !contains(live, parent)) {
			this.#liveElementsById.delete(idOf(target))
			const radios = this.#uncheckRadiosForMove(live, parent)
			const insideRadios = this.#uncheckRadiosInFormsIn(live)
			const unnamed = unnameRadiosNamingFormsIn(live)
			const focus = this.#watchFocus(live, parent)
			moveInto(parent, live, placeholder)
			if (focus) this.#restoreFocus(focus)
			restoreNames(unnamed)
			remove(placeholder)
			this.#checkRadios(radios)
			this.#checkRadios(insideRadios, true)
			if (!this.#preserveChanges) this.#noteRadioGroups(live)
			this.#morphOneToOne(live, target)
		} else {
			this.#insertNewNode(parent, target, placeholder, approved)
			remove(placeholder)
		}

		this.#preserveChanges = saved
		this.#clobberedScope = savedScope
	}

	#replaceNode(node: ChildNode, newNode: ChildNode): void {
		const parent = parentNodeOf(node)
		if (!parent) throw new Error(DETACHED_NODE_ERROR)

		const insertionPoint = node
		// Check if both removal and addition are allowed before starting the replacement. A replacement
		// that moves a live element here asks too, so either veto keeps the node.
		if (
			(this.#options.beforeNodeRemoved?.(node) ?? true) &&
			(this.#options.beforeNodeAdded?.(parent, newNode, insertionPoint) ?? true)
		) {
			// The replacement can be a live element from elsewhere, even one inside the node it replaces.
			const placeholder = isElement(newNode) ? this.#claimMovableElement(newNode, parent, undefined, true) : null
			if (placeholder) {
				insertBefore(parent, placeholder, insertionPoint)
			} else {
				this.#insertNewNode(parent, newNode, insertionPoint, true)
			}
			this.#removeApprovedNode(node)
		}

		this.#settleIfRoot(node)
	}

	// A movable element stays put for now, since the target may place it under another parent, until the morph settles.
	// Returns whether a callback vetoed the removal.
	#removeNode(node: ChildNode, settled = false): boolean {
		if (!settled && isElement(node) && this.#movableElement(idOf(node)) === node) {
			;(this.#unplacedElements ??= []).push(node)
			return false
		}

		if (!(this.#options.beforeNodeRemoved?.(node) ?? true)) return true
		this.#removeApprovedNode(node, settled)
		return false
	}

	#removeApprovedNode(node: ChildNode, settled = false): void {
		if (!settled && this.#holdsMovableElement(node)) {
			;(this.#deferredRemovals ??= []).push(node)
		} else {
			this.#removeChild(node)
			this.#options.afterNodeRemoved?.(node)
		}
	}

	// A vetoed visit leaves the node's subtree alone, so nothing inside it moves elsewhere.
	#pinSubtree(node: Node): void {
		;(this.#vetoedNodes ??= []).push(node)
		const ids = this.#idSetMap.get(node)
		if (!ids) return

		for (const id of ids) {
			// An element that has already moved isn't in the map any more, so it stays where it is.
			const live = this.#liveElementsById.get(id)
			if (live && live !== node) this.#liveElementsById.set(id, null)
		}
	}

	#movableElement(id: string): Element | null {
		if (id === "" || this.#targetIdCounts.get(id) !== 1) return null

		// Options and optgroups don't move, because an option's selection belongs to its select.
		const live = this.#liveElementsById.get(id)
		if (!live || isOptionElement(live) || isOptgroupElement(live)) return null
		return live
	}

	#holdsMovableElement(node: ChildNode): boolean {
		const ids = this.#idSetMap.get(node)
		if (!ids) return false

		for (const id of ids) {
			const live = this.#movableElement(id)
			if (live && live !== node && contains(node, live)) return true
		}
		return false
	}

	// Whether the live element with the target's id can be morphed into the target where the target goes.
	// `select` is the live select the target ends up in, since a new node's targets are still in their
	// parsed select. It's found from `parent` when not given, and only once there's a live element to claim.
	#canClaim(target: Element, parent: ParentNode, select?: HTMLSelectElement | null): boolean {
		const live = this.#movableElement(idOf(target))
		if (live === null || !canMorphElementInPlace(live, target) || contains(live, parent)) return false
		if (select === undefined) select = selectAt(parent)
		// Claiming takes the target out of its parent, so an element holding options is only claimed where it can move.
		return !this.#wrapsMovableAncestor(live, target, select) && !movesOptionsBetweenSelects(live, select)
	}

	// Whether the target puts a movable ancestor of the live element inside the element, where that
	// ancestor can be morphed into its own target. Moving the element out would come before that
	// ancestor's visit, so a veto there couldn't keep it.
	#wrapsMovableAncestor(live: Element, target: Element, select: HTMLSelectElement | null): boolean {
		const ids = this.#idArrayMap.get(target)
		if (!ids) return false

		for (let ancestor = parentElementOf(live); ancestor; ancestor = parentElementOf(ancestor)) {
			const id = idOf(ancestor)
			if (id !== "" && this.#movableElement(id) === ancestor && ids.includes(id) && canMoveInto(ancestor, target, select))
				return true
		}
		return false
	}

	// Claim the live element with the target's id, if it can be. Returns a placeholder for the target's
	// place, where the move completes when the morph settles.
	#claimMovableElement(target: Element, parent: ParentNode, select?: HTMLSelectElement | null, approved = false): Comment | null {
		if (!this.#canClaim(target, parent, select)) return null
		const live = this.#liveElementsById.get(idOf(target))!
		if (select === undefined) select = selectAt(parent)

		const placeholder = createComment(ownerDocumentOf(live)!, "")
		const preserveChanges = this.#preserveChanges && !this.#clobbered?.has(target)
		const move = { live, target, placeholder, preserveChanges, approved, select }
		;(this.#pendingMoves ??= []).push(move)
		this.#claimedElements.set(live, move)
		const ids = this.#idArrayMap.get(target)
		if (ids) for (const id of ids) this.#movesByTargetId.set(id, move)
		return placeholder
	}

	// The pending move whose target holds the target of this live element, if it's still to be placed there.
	#moveReaching(element: Element): PendingMove | undefined {
		if (this.#movableElement(idOf(element)) !== element) return undefined
		const move = this.#movesByTargetId.get(idOf(element))
		return move && this.#claimedElements.has(move.live) && canMoveInto(element, move.target, move.select) ? move : undefined
	}

	// A new node can hold targets for live elements elsewhere. Claim each live element, leaving a
	// placeholder for its target. This runs before the new node is attached, so discarded targets
	// never connect.
	// `parent` is the live parent the node goes into.
	#placeMovableDescendants(node: ChildNode, parent: ParentNode): void {
		if (!isElement(node)) return

		const ids = this.#idArrayMap.get(node)
		if (!ids?.some((id) => id !== idOf(node) && this.#movableElement(id))) return

		this.#placeMovableChildren(node, selectAt(parent))
	}

	// Swap the targets under `parent` that claim a live element for placeholders. Inside a
	// `morphlex-clobber` element, the moves discard user changes as if `preserveChanges` were off.
	#placeMovableChildren(parent: Element, outerSelect: HTMLSelectElement | null): void {
		const preserveChanges = this.#preserveChanges
		if (preserveChanges && this.#clobbered?.has(parent)) this.#preserveChanges = false
		const select = isSelectElement(parent) ? parent : outerSelect

		let target = firstElementChildOf(parent)
		while (target) {
			const next = nextElementSiblingOf(target)

			if (this.#idArrayMap.has(target)) {
				const placeholder = this.#claimMovableElement(target, parent, select)
				if (placeholder) {
					replaceChild(parent, placeholder, target)
				} else {
					this.#placeMovableChildren(target, select)
				}
			}

			target = next
		}

		this.#preserveChanges = preserveChanges
	}

	// For each node with an ID, push that ID into the IdArray on the IdArrayMap, for each of its parent elements.
	#mapIdArrays(node: ParentNode, countRoot = true): void {
		const idArrayMap = this.#idArrayMap

		if (!this.#targetChecksInputs) {
			this.#targetChecksInputs =
				isElement(node) && isInputElement(node) ? hasAttribute(node, "checked") : querySelector(node, "input[checked]") !== null
		}
		if (!this.#targetOpensDetails) {
			this.#targetOpensDetails =
				(isElement(node) && isDetailsElement(node) && hasAttributeNS(node, null, "open")) ||
				querySelector(node, "details[open]") !== null
		}

		// An inner morph leaves the target's own element out of the result, so its id doesn't count.
		const targetIdCounts = this.#targetIdCounts
		if (countRoot && isElement(node) && idOf(node) !== "")
			targetIdCounts.set(idOf(node), (targetIdCounts.get(idOf(node)) ?? 0) + 1)

		forEachDescendantElementWithId(node, (element) => {
			const id = idOf(element)
			targetIdCounts.set(id, (targetIdCounts.get(id) ?? 0) + 1)
			this.#targetElementsById.set(id, element)

			let currentElement: Element | null = element

			while (currentElement) {
				const idArray = idArrayMap.get(currentElement)
				if (idArray) {
					idArray.push(id)
				} else {
					idArrayMap.set(currentElement, [id])
				}
				if (currentElement === node) break
				currentElement = parentElementOf(currentElement)
			}
		})
	}

	// For each node with an ID, add that ID into the IdSet on the IdSetMap, for each of its parent elements.
	#mapIdSets(node: ParentNode): void {
		const idSetMap = this.#idSetMap

		// The root's id counts towards uniqueness, but the root itself never moves.
		const liveElementsById = this.#liveElementsById
		if (isElement(node) && idOf(node) !== "") liveElementsById.set(idOf(node), null)

		forEachDescendantElementWithId(node, (element) => {
			const id = idOf(element)
			liveElementsById.set(id, liveElementsById.has(id) ? null : element)

			let currentElement: Element | null = element

			while (currentElement) {
				const idSet = idSetMap.get(currentElement)
				if (idSet) {
					idSet.add(id)
				} else {
					idSetMap.set(currentElement, new Set([id]))
				}
				if (currentElement === node) break
				currentElement = parentElementOf(currentElement)
			}
		})
	}
}

// Whether the live element can be morphed into the element with its id inside `target`, which holds one,
// and moved there. `select` is the live select that `target` ends up in. A select inside `target` is a new one.
function canMoveInto(live: Element, target: Element, select: HTMLSelectElement | null): boolean {
	const element = Array.from(querySelectorAll(target, "[id]")).find((element) => idOf(element) === idOf(live))!
	const innerSelect = selectOf(element)
	return (
		canMorphElementInPlace(live, element) &&
		!movesOptionsBetweenSelects(live, innerSelect && contains(target, innerSelect) ? innerSelect : select)
	)
}

function forEachDescendantElementWithId(node: ParentNode, callback: (element: Element) => void): void {
	for (const element of querySelectorAll(node, "[id]")) {
		if (idOf(element) !== "") callback(element)
	}
}

function hasExcessAttributes(from: Element, to: Element): boolean {
	const attributes = attributesOf(from)
	for (let i = 0; i < attributes.length; i++) {
		const { localName, namespaceURI } = attributes[i]!
		if (!hasAttributeNS(to, namespaceURI, localName)) return true
	}
	return false
}

// The candidate each target takes, both in order. A target discarding the user's changes takes the first untouched
// candidate, so no changed candidate trades into it, and the other targets take the first free candidate while enough
// untouched ones are left for those.
function takeInOrder(
	candidates: Array<number>,
	targets: Array<number>,
	isChanged: (candidate: number) => boolean,
	discards: (target: number) => boolean,
): Array<number> {
	let discarding = targets.filter(discards).length
	if (!discarding) return candidates
	let untouched = candidates.filter((candidate) => !isChanged(candidate)).length
	const taken: Set<number> = new Set()
	// Where the search for the first free candidate, the first untouched one and the first changed one starts.
	const starts = [0, 0, 0]
	const first = (kind: number): number => {
		let c = starts[kind]!
		while (taken.has(candidates[c]!) || (kind === 1 && isChanged(candidates[c]!)) || (kind === 2 && !isChanged(candidates[c]!)))
			c++
		starts[kind] = c
		return candidates[c]!
	}
	return targets.map((target) => {
		let candidate: number
		if (discarding && discards(target)) {
			candidate = first(1)
			discarding--
		} else {
			candidate = first(untouched > discarding ? 0 : 2)
		}
		taken.add(candidate)
		if (!isChanged(candidate)) untouched--
		return candidate
	})
}

// Choose which of the identical candidates stay when there are more of them than targets. The changed ones always
// stay, and the others are chosen so that, taking the targets in order, they cross the fewest other matches, where
// crossing a changed element outweighs crossing all the others, and two changed elements crossing outweighs both, since
// the user's changes keep their order. On a tie, the candidates already staying stay. A changed candidate never takes a
// target discarding the user's changes.
function chooseStaying(
	candidates: Array<number>,
	targets: Array<number>,
	matches: Array<number | undefined>,
	isChanged: (candidate: number) => boolean,
	staying: Set<number>,
	canTake: (candidate: number, target: number) => boolean,
): Array<number> {
	candidates.sort((a, b) => a - b)
	const n = candidates.length
	const spare = n - targets.length
	const width = spare + 1
	const own = new Set(targets)
	const others: Array<[number, number]> = []
	for (let target = 0; target < matches.length; target++) {
		const candidate = matches[target]
		if (candidate !== undefined && !own.has(target)) others.push([candidate, target])
	}
	others.sort((a, b) => a[0] - b[0])
	// The candidates taking the targets cross at most this many other matches, so a crossing weighing one more outweighs
	// any number of lighter ones, and one between two changed elements weighs its square.
	const heavy = targets.length * others.length + 1
	const weightOf = (candidate: number): number => (isChanged(candidate) ? heavy : 1)
	// The weight of the other matches with a target below each target, all of them, and in a Fenwick tree the ones
	// whose candidate comes before the current candidate.
	const below = new Float64Array(matches.length + 1)
	for (const [candidate, target] of others) below[target + 1]! += weightOf(candidate)
	for (let target = 0; target < matches.length; target++) below[target + 1]! += below[target]!
	const tree = new Float64Array(matches.length + 1)
	const belowBefore = (target: number): number => {
		let weight = 0
		for (let i = target; i > 0; i -= i & -i) weight += tree[i]!
		return weight
	}

	// cost[i * width + k] is the least crossing weight, then the fewest staying candidates going, for the first i
	// candidates when k of them go. Crossings outweigh any number of those going.
	const cost = new Float64Array((n + 1) * width).fill(Infinity)
	cost[0] = 0
	let before = 0
	for (let i = 1, o = 0; i <= n; i++) {
		const candidate = candidates[i - 1]!
		for (; o < others.length && others[o]![0] < candidate; o++) {
			const weight = weightOf(others[o]![0])
			before += weight
			for (let t = others[o]![1] + 1; t <= matches.length; t += t & -t) tree[t]! += weight
		}
		for (let k = 0; k <= spare && k <= i; k++) {
			const j = i - k
			if (j > targets.length) continue
			let best = Infinity
			if (k > 0 && !isChanged(candidate)) best = cost[(i - 1) * width + k - 1]! + (staying.has(candidate) ? 1 : 0)
			const target = targets[j - 1]
			if (target !== undefined && k < i && canTake(candidate, target)) {
				const crossings = before - 2 * belowBefore(target) + below[target]!
				best = Math.min(best, cost[(i - 1) * width + k]! + crossings * weightOf(candidate) * (n + 1))
			}
			cost[i * width + k] = best
		}
	}

	// Without a way to take the targets in order, the candidates staying stay.
	if (cost[n * width + spare] === Infinity) return candidates.filter((candidate) => staying.has(candidate))
	const stays: Array<number> = []
	for (let i = n, k = spare; i > 0; i--) {
		const candidate = candidates[i - 1]!
		if (
			k > 0 &&
			!isChanged(candidate) &&
			cost[i * width + k] === cost[(i - 1) * width + k - 1]! + (staying.has(candidate) ? 1 : 0)
		) {
			k--
		} else {
			stays.push(candidate)
		}
	}
	return stays.reverse()
}

// Give each changed candidate's set of interchangeable candidates, from `identicalTo`, to their targets in order in
// `matches`. Returns whether any target changed hands.
function orderSets(
	matches: Array<number>,
	changed: Array<number>,
	targetOf: Array<number>,
	identicalTo: (candidate: number) => Array<number>,
): boolean {
	const grouped: Set<number> = new Set()
	let reordered = false
	for (let i = 0; i < changed.length; i++) {
		const candidate = changed[i]!
		if (grouped.has(candidate)) continue
		const identical = identicalTo(candidate)
		if (identical.length < 2) continue

		identical.sort((a, b) => a - b)
		const targets = identical.map((other) => targetOf[other]!).sort((a, b) => a - b)
		for (let t = 0; t < identical.length; t++) {
			grouped.add(identical[t]!)
			if (matches[targets[t]!] !== identical[t]) {
				matches[targets[t]!] = identical[t]!
				reordered = true
			}
		}
	}
	return reordered
}

// Nodes bucketed so equal nodes share a bucket, by text content. Comparisons keep failing in a bucket of nodes with
// the same text that differ in their markup, like empty elements, so once they've cost more than the bucket has
// nodes, it's split by shape and its nodes aren't compared pair by pair. Each bucket of many also skips its taken
// prefix, so many identical siblings aren't scanned again for each target.
class EqualBuckets {
	readonly #siblings: Siblings
	readonly #byText: Map<string, Array<number>>
	readonly #state: Map<Array<number>, { taken: number; failures: number; byShape?: Map<string, Array<number>> }> = new Map()

	constructor(siblings: Siblings, indices: Array<number>) {
		this.#siblings = siblings
		this.#byText = bucketByTextContent(siblings.from, indices)
	}

	get(node: Node): Array<number> | undefined {
		const bucket = this.#byText.get(textContentOf(node)!)
		const state = bucket && bucket.length > 1 && this.#state.get(bucket)
		if (!state || state.failures <= bucket.length) return bucket
		state.byShape ??= bucketByShape(this.#siblings, bucket)
		return state.byShape.get(this.#siblings.shapeOf(node))
	}

	// The first position in the bucket from which candidates may still be active.
	firstActive(bucket: Array<number>, active: Uint8Array): number {
		if (bucket.length === 1) return 0
		const state = this.#stateOf(bucket)
		while (state.taken < bucket.length && !active[bucket[state.taken]!]) state.taken++
		return state.taken
	}

	// Notes comparisons in a bucket that found no equal node.
	fail(bucket: Array<number>, count = 1): void {
		if (bucket.length > 1) this.#stateOf(bucket).failures += count
	}

	#stateOf(bucket: Array<number>): { taken: number; failures: number; byShape?: Map<string, Array<number>> } {
		let state = this.#state.get(bucket)
		if (!state) this.#state.set(bucket, (state = { taken: 0, failures: 0 }))
		return state
	}
}

// Adds the value to the list under the key, starting the list when there's none.
function addToBucket<K, V>(buckets: Map<K, Array<V>>, key: K, value: V): void {
	const bucket = buckets.get(key)
	if (bucket) bucket.push(value)
	else buckets.set(key, [value])
}

// The nodes at the indices, the candidates unless others are given, by shape.
function bucketByShape(siblings: Siblings, indices: Array<number>, nodes = siblings.from): Map<string, Array<number>> {
	const buckets: Map<string, Array<number>> = new Map()
	for (const index of indices) {
		addToBucket(buckets, siblings.shapeOf(nodes[index]!), index)
	}
	return buckets
}

function bucketByTextContent(nodes: Array<ChildNode>, indices: Array<number>): Map<string, Array<number>> {
	const buckets: Map<string, Array<number>> = new Map()
	for (let i = 0; i < indices.length; i++) {
		const index = indices[i]!
		const text = textContentOf(nodes[index]!)!
		addToBucket(buckets, text, index)
	}
	return buckets
}

// The element's child when it's a single text node.
function onlyTextChildOf(parent: ParentNode): ChildNode | null {
	const child = firstChildOf(parent)
	return child && nodeTypeOf(child) === TEXT_NODE_TYPE && !nextSiblingOf(child) ? child : null
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
	if (nodeTypeOf(node) !== TEXT_NODE_TYPE) return false

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
	if (!fragment.firstElementChild) return

	while (fragment.firstChild && isWhitespaceTextNode(fragment.firstChild)) {
		fragment.firstChild.remove()
	}

	while (fragment.lastChild && isWhitespaceTextNode(fragment.lastChild)) {
		fragment.lastChild.remove()
	}
}

// What choosing this element means: an option's value in its select, or a checkbox or radio's type, name,
// value and form, along with its `is`, since a control with another `is` is recreated. An option's select is passed in, since a target's option is keyed by the live select,
// and so is the form around the select or the control, since a target's control is keyed by the form it ends up in.
function choiceOf(element: Element, select: HTMLSelectElement | null, form: Element | null): string | null {
	if (isOptionElement(element)) {
		return JSON.stringify([
			select?.getAttribute("name") ?? "",
			select && formOf(select, form),
			select && (select.hasAttribute("multiple") ? 2 : displaySizeOf(select) > 1 ? 1 : 0),
			element.value,
			getAttribute(element, "is"),
		])
	}
	if (isInputElement(element) && (element.type === "checkbox" || element.type === "radio")) {
		return JSON.stringify([element.type, element.name, element.value, formOf(element, form), getAttribute(element, "is")])
	}
	return null
}

// The control's `form` attribute, or null when it names the form the control is in.
function formOf(control: Element, form: Element | null): string | null {
	const name = getAttribute(control, "form")
	return name && form && name === idOf(form) ? null : name
}

// The namespaces, names and `is` of the elements between the wrapper and the control. The wrapper's morph only keeps a
// control whose path matches, since an element with another name or `is` is replaced along with what it holds.
function pathTo(control: Element, wrapper: Element): string {
	const path: Array<[string | null, string, string | null]> = []
	for (let node = control; node !== wrapper;) {
		node = parentElementOf(node)!
		if (node !== wrapper) path.push([namespaceURIOf(node), localNameOf(node), getAttribute(node, "is")])
	}
	return JSON.stringify(path)
}

// How often each choice appears.
function countChoices(choices: Array<string>): Map<string, number> {
	const counts = new Map<string, number>()
	for (const choice of choices) counts.set(choice, (counts.get(choice) ?? 0) + 1)
	return counts
}

// A key for the element's attributes, equal for elements with the same attributes ignoring `morphlex-dirty` and any `ignored` names.
function attributesKeyOf(element: Element, ignored: ReadonlyArray<string>): string {
	const attributes: Array<string> = []
	for (const { namespaceURI, localName, value } of attributesOf(element)) {
		if (namespaceURI !== null || (localName !== DIRTY_ATTRIBUTE && !ignored.includes(localName))) {
			attributes.push(JSON.stringify([namespaceURI, localName, value]))
		}
	}
	return JSON.stringify(attributes.sort())
}

// An option the user deselected or moved a select away from, or a radio they moved their group away from. What holds
// it is matched by the picked one first, though the option or radio itself still keeps its own target.
function isLeftChoice(element: Element): boolean {
	if (isOptionElement(element)) return !element.selected
	return isInputElement(element) && element.type === "radio" && !element.checked
}

// A key that's the same for nodes that are equal apart from `morphlex-dirty`, as `isEqualNode` compares them,
// template content included. With `ignoresOpen`, the `open` attribute of a `details` or `dialog` is left out too,
// since `preserveChanges` keeps it as the user left it.
function shapeOf(node: Node, ignoresOpen: boolean): string {
	if (!isElement(node)) return JSON.stringify([nodeTypeOf(node), node.nodeName, node.nodeValue])
	const attributes = attributesKeyOf(node, ignoresOpen && hasOpenState(node) ? OPEN_ATTRIBUTE : [])
	let children = ""
	for (const child of childNodesOf(node)) children += shapeOf(child, ignoresOpen)
	if (isTemplateElement(node)) {
		children += "<#content"
		for (const child of node.content.childNodes) children += shapeOf(child, ignoresOpen)
		children += ">"
	}
	return `<${JSON.stringify([namespaceURIOf(node), prefixOf(node), localNameOf(node)])}${attributes}${children}>`
}

// The shape of a subtree without its attributes, apart from `is`, which decides whether an element can be morphed.
function outlineOf(node: Node): string {
	if (!isElement(node)) return JSON.stringify([nodeTypeOf(node), node.nodeName, node.nodeValue])
	let children = ""
	// A textarea's text is only its default value, which the user's typing replaces.
	if (!isTextAreaElement(node)) for (const child of childNodesOf(node)) children += outlineOf(child)
	if (isTemplateElement(node)) {
		children += "<#content"
		for (const child of node.content.childNodes) children += outlineOf(child)
		children += ">"
	}
	return `<${JSON.stringify([namespaceURIOf(node), prefixOf(node), localNameOf(node), getAttribute(node, "is")])}${children}>`
}

// `isEqualNode` ignores template content, so templates need comparing separately.
function isEqualNode(from: Node, to: Node): boolean {
	if (!Node.prototype.isEqualNode.call(from, to)) return false
	if (!isParentNode(from)) return true

	if (isElement(from) && isTemplateElement(from) && !isEqualNode(from.content, (to as HTMLTemplateElement).content)) {
		return false
	}

	const fromTemplates = querySelectorAll(from as ParentNode, "template")
	if (fromTemplates.length === 0) return true

	// The trees are equal, so their templates line up one-to-one.
	const toTemplates = querySelectorAll(to as ParentNode, "template")
	for (let i = 0; i < fromTemplates.length; i++) {
		const fromTemplate = fromTemplates[i]!
		if (!isTemplateElement(fromTemplate)) continue
		if (!isEqualNode(fromTemplate.content, (toTemplates[i] as HTMLTemplateElement).content)) return false
	}

	return true
}

function isTemplateElement(element: Element): element is HTMLTemplateElement {
	return localNameOf(element) === "template" && namespaceURIOf(element) === HTML_NAMESPACE
}

// The radios in the same group as this one, in document order: same name and form owner, in the same tree.
// Groups are found per form, or per tree for radios without one, and kept in `groups` so each is
// only searched once.
type RadioGroups = Map<Node, Map<string, Array<HTMLInputElement>>>

function radioGroupOf(radio: HTMLInputElement, groups: RadioGroups): Array<HTMLInputElement> {
	if (radio.name === "") return [radio]

	const form = radio.form
	const owner = form ?? radio.getRootNode()
	let byName = groups.get(owner)
	if (!byName) {
		byName = new Map()
		groups.set(owner, byName)
		const inputs = form ? elementsOf(form) : querySelectorAll(owner as ParentNode, "input")
		for (let i = 0; i < inputs.length; i++) {
			const input = inputs[i] as Element
			if (isInputElement(input) && input.type === "radio" && input.form === form) {
				addToBucket(byName, input.name, input)
			}
		}
	}
	return byName.get(radio.name) ?? []
}

// The form a control inside `element` belongs to once `element` moves into `parent`.
function formAfterMove(control: HTMLInputElement, element: Element, parent: ParentNode): HTMLFormElement | null {
	if (hasAttribute(control, "form")) return control.form
	const form = closestForm(parentNodeOf(control))
	return form && contains(element, form) ? form : closestForm(parent)
}

// The node itself or its nearest ancestor that is a form.
function closestForm(node: Node | null): HTMLFormElement | null {
	for (; node; node = parentNodeOf(node)) {
		if (isElement(node) && isFormElement(node)) return node
	}
	return null
}

function isFormElement(element: Element): element is HTMLFormElement {
	return localNameOf(element) === "form" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isCheckedRadio(element: Element): element is HTMLInputElement {
	return isRadio(element) && element.checked
}

function isRadio(element: Element): element is HTMLInputElement {
	return isInputElement(element) && element.type === "radio"
}

// Only the form's controls with the radio's name, or the checked inputs in a tree, are read, which keeps
// this short in forms with many radios.
function checkedRadiosInGroup(radio: HTMLInputElement): Array<HTMLInputElement> {
	if (radio.name === "") return []
	const form = radio.form
	let inputs: ArrayLike<Node> = []
	if (form) {
		// A list of the controls with that name, or just the radio itself when it's alone.
		const named = elementsOf(form).namedItem(radio.name)
		if (named && "length" in named) inputs = named
	} else {
		inputs = querySelectorAll(radio.getRootNode() as ParentNode, "input:checked")
	}
	const checked: Array<HTMLInputElement> = []
	for (let i = 0; i < inputs.length; i++) {
		const input = inputs[i] as Element
		if (isRadio(input) && input.checked && input.name === radio.name && input.form === form) checked.push(input)
	}
	return checked
}

function isInputElement(element: Element): element is HTMLInputElement {
	return localNameOf(element) === "input" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
	return localNameOf(element) === "textarea" && namespaceURIOf(element) === HTML_NAMESPACE
}

// A customized built-in's definition is fixed when it's created, so changing `is` needs a new element.
function hasSameIs(from: Element, to: Element): boolean {
	return getAttribute(from, "is") === getAttribute(to, "is")
}

function canMorphElementInPlace(from: Element, to: Element): boolean {
	if (localNameOf(from) !== localNameOf(to)) return false
	if (namespaceURIOf(from) !== namespaceURIOf(to)) return false
	if (!hasSameIs(from, to)) return false
	if (isFormControl(from) && isFormControl(to)) {
		const fromId = idOf(from)
		const toId = idOf(to)

		if ((fromId !== "" || toId !== "") && fromId !== toId) {
			return false
		}
	}

	if (isInputElement(from) && isInputElement(to)) {
		return from.type === to.type
	}

	return true
}

// Only an element's own identity counts, so a wrapper holding an id'd element still matches by its tag. An `href` or
// `src` pairs elements sharing it first, but doesn't stop one matching by its tag, so a link or an iframe whose
// address changes is updated in place. A script doesn't run again when its `src` (or an SVG script's `href`)
// changes, so it's still replaced.
function canSoftMatchByTagName(element: Element): boolean {
	return (
		idOf(element) === "" &&
		!isFormControl(element) &&
		!getAttribute(element, "name") &&
		!(localNameOf(element) === "script" && (getAttribute(element, "src") || getAttribute(element, "href")))
	)
}

// Whether the elements have the same non-empty name, href or src.
function sharesMatchKey(element: Element, other: Element): boolean {
	for (const name of ["name", "href", "src"]) {
		const value = getAttribute(element, name)
		if (value && value === getAttribute(other, name)) return true
	}
	return false
}

// The `name`, `href` and `src` an element can be matched by, keyed by the attribute.
function matchKeysOf(element: Element): Array<string> {
	const keys: Array<string> = []
	for (const name of ["name", "href", "src"]) {
		const value = getAttribute(element, name)
		if (value) keys.push(`${name} ${value}`)
	}
	return keys
}

// The candidates by each `name`, `href` and `src` they have.
function indexByMatchKeys(nodes: Array<ChildNode>, candidates: Array<number>): Map<string, Array<number>> {
	const sharing: Map<string, Array<number>> = new Map()
	for (const candidateIndex of candidates) {
		for (const key of matchKeysOf(nodes[candidateIndex] as Element)) {
			addToBucket(sharing, key, candidateIndex)
		}
	}
	return sharing
}

// The indexed candidates sharing a `name`, `href` or `src` with the element, in order.
function candidatesSharing(sharing: Map<string, Array<number>>, element: Element): Array<number> {
	const lists = matchKeysOf(element).map((key) => sharing.get(key) ?? [])
	return lists.length === 1 ? lists[0]! : [...new Set(lists.flat())].sort((a, b) => a - b)
}

function hasMatchKeyAttribute(element: Element): boolean {
	return !!(getAttribute(element, "name") || getAttribute(element, "href") || getAttribute(element, "src"))
}

function isFormControl(element: Element): boolean {
	if (namespaceURIOf(element) !== HTML_NAMESPACE) return false

	const localName = localNameOf(element)
	return (
		localName === "input" ||
		localName === "textarea" ||
		localName === "select" ||
		(localName.includes("-") && (element.constructor as unknown as Record<string, unknown>)["formAssociated"] === true)
	)
}

function isDialogElement(element: Element): element is HTMLDialogElement {
	return localNameOf(element) === "dialog" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isDetailsElement(element: Element): element is HTMLDetailsElement {
	return localNameOf(element) === "details" && namespaceURIOf(element) === HTML_NAMESPACE
}

// The `open` attribute on these elements is the live state the user toggles, not a default.
function hasOpenState(element: Element): boolean {
	return isDialogElement(element) || isDetailsElement(element)
}

// The other open items in the same exclusive accordion as this one: same name, in the same tree.
function openDetailsInGroup(details: Element): Array<Element> {
	const name = getAttributeNS(details, null, "name")
	if (!name) return []

	// A document finds elements by name without looking through the rest, so only other roots are searched.
	const root = getRootNode(details)
	const candidates = isDocument(root)
		? getElementsByName(root, name)
		: querySelectorAll(root as ParentNode, "details[open][name]")
	return [...candidates].filter(
		(other) =>
			other !== details &&
			getAttributeNS(other, null, "name") === name &&
			hasAttributeNS(other, null, "open") &&
			isDetailsElement(other),
	)
}

// A document keeps only the first open item of an accordion, but WebKit's parser keeps them all, so
// close the later ones in the target.
function closeLaterOpenDetails(nodes: ArrayLike<Node>): void {
	const names = new Set<string>()
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!
		if (!isElement(node)) continue

		const items = [...querySelectorAll(node, "details[open]")]
		if (matchesSelector(node, "details[open]")) items.unshift(node)
		for (const item of items) {
			const name = getAttributeNS(item, null, "name")
			if (!name || !isDetailsElement(item)) continue
			/* v8 ignore next -- only WebKit parses several open items in one group */
			if (names.has(name)) removeAttributeNS(item, null, "open")
			else names.add(name)
		}
	}
}

function isSelectElement(element: Element): element is HTMLSelectElement {
	return localNameOf(element) === "select" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isOptgroupElement(element: Element): boolean {
	return localNameOf(element) === "optgroup" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isOptionElement(element: Element): element is HTMLOptionElement {
	return localNameOf(element) === "option" && namespaceURIOf(element) === HTML_NAMESPACE
}

function isElement(node: Node): node is Element {
	return nodeTypeOf(node) === ELEMENT_NODE_TYPE
}

function isDocument(node: Node): node is Document {
	return nodeTypeOf(node) === DOCUMENT_NODE_TYPE
}

function isParentNode(node: Node): node is ParentNode {
	const type = nodeTypeOf(node)
	return type === ELEMENT_NODE_TYPE || type === DOCUMENT_NODE_TYPE || type === DOCUMENT_FRAGMENT_NODE_TYPE
}

function isNodeList(value: ChildNode | NodeListOf<ChildNode>): value is NodeListOf<ChildNode> {
	return Object.prototype.toString.call(value) === "[object NodeList]"
}

// A form's fields shadow its members, so `<input name="remove">` makes `form.remove` the input, and the same goes for
// `parentNode`, `id` or any other member. A named image does it to its document. So the members of a node that can be
// a form or a document are read through the prototype that defines them. An element narrowed to an input, an option
// or the like can't be either, and neither can a text node, so those are read directly.

// The prototype is looked up on first use, since importing morphlex mustn't need a DOM.
function getter<T extends object, K extends keyof T>(prototype: () => T, key: K): (node: T) => T[K] {
	let descriptor: PropertyDescriptor | undefined
	return (node) => (descriptor ??= Object.getOwnPropertyDescriptor(prototype(), key)!).get!.call(node)
}

const nodeTypeOf = getter(() => Node.prototype, "nodeType")
const parentNodeOf = getter(() => Node.prototype, "parentNode")
const parentElementOf = getter(() => Node.prototype, "parentElement")
const childNodesOf = getter(() => Node.prototype, "childNodes")
const firstChildOf = getter(() => Node.prototype, "firstChild")
const previousSiblingOf = getter(() => Node.prototype, "previousSibling")
const nextSiblingOf = getter(() => Node.prototype, "nextSibling")
const ownerDocumentOf = getter(() => Node.prototype, "ownerDocument")
const isContentEditableOf = getter(() => HTMLElement.prototype, "isContentEditable")
const isConnected = getter(() => Node.prototype, "isConnected")
const textContentOf = getter(() => Node.prototype, "textContent")
const idOf = getter(() => Element.prototype, "id")
const localNameOf = getter(() => Element.prototype, "localName")
const namespaceURIOf = getter(() => Element.prototype, "namespaceURI")
const prefixOf = getter(() => Element.prototype, "prefix")
const attributesOf = getter(() => Element.prototype, "attributes")
const firstElementChildOf = getter(() => Element.prototype, "firstElementChild")
const nextElementSiblingOf = getter(() => Element.prototype, "nextElementSibling")
const documentElementOf = getter(() => Document.prototype, "documentElement")
const headOf = getter(() => Document.prototype, "head")
const bodyOf = getter(() => Document.prototype, "body")
const activeElementOf = getter(() => Document.prototype, "activeElement")
const implementationOf = getter(() => Document.prototype, "implementation")
const elementsOf = getter(() => HTMLFormElement.prototype, "elements")

function insertBefore(parent: ParentNode, node: Node, insertionPoint: Node | null): void {
	Node.prototype.insertBefore.call(parent, node, insertionPoint)
}

function replaceChild(parent: ParentNode, node: Node, child: Node): void {
	Node.prototype.replaceChild.call(parent, node, child)
}

function remove(node: ChildNode): void {
	const parent = parentNodeOf(node)
	if (parent) Node.prototype.removeChild.call(parent, node)
}

/* v8 ignore next 5 -- only used where Chromium's moveBefore keeps focus */
function rangeAt(document: Document, node: Node, offset: number): Range {
	const range = Document.prototype.createRange.call(document)
	range.setStart(node, offset)
	return range
}

// A live range follows its end through a removal, but a move without `moveBefore` removes the node too, which takes the
// end out of the focused element though the node is still inside it. Then the end goes back to the node, as near its
// old offset as still fits.
/* v8 ignore next 5 -- only used where Chromium's moveBefore keeps focus */
function followedEnd(element: Element, live: Range, node: Node, offset: number): [Node, number] {
	if (contains(element, live.startContainer) || !contains(element, node)) return [live.startContainer, live.startOffset]
	const length = nodeTypeOf(node) === ELEMENT_NODE_TYPE ? childNodesOf(node).length : (node as CharacterData).length
	return [node, Math.min(offset, length)]
}

function contains(node: Node, other: Node | null): boolean {
	return Node.prototype.contains.call(node, other)
}

function compareDocumentPosition(node: Node, other: Node): number {
	return Node.prototype.compareDocumentPosition.call(node, other)
}

function hasChildNodes(node: Node): boolean {
	return Node.prototype.hasChildNodes.call(node)
}

function getRootNode(node: Node): Node {
	return Node.prototype.getRootNode.call(node)
}

function getBoundingClientRect(element: Element): DOMRect {
	return Element.prototype.getBoundingClientRect.call(element)
}

function getSelection(document: Document): Selection | null {
	return Document.prototype.getSelection.call(document)
}

function removeEventListener(document: Document, type: string, listener: (event: Event) => void): void {
	EventTarget.prototype.removeEventListener.call(document, type, listener, true)
}

function getAttribute(element: Element, name: string): string | null {
	return Element.prototype.getAttribute.call(element, name)
}

function getAttributeNS(element: Element, namespace: string | null, localName: string): string | null {
	return Element.prototype.getAttributeNS.call(element, namespace, localName)
}

function getAttributeNodeNS(element: Element, namespace: string | null, localName: string): Attr | null {
	return Element.prototype.getAttributeNodeNS.call(element, namespace, localName)
}

function hasAttribute(element: Element, name: string): boolean {
	return Element.prototype.hasAttribute.call(element, name)
}

function hasAttributeNS(element: Element, namespace: string | null, localName: string): boolean {
	return Element.prototype.hasAttributeNS.call(element, namespace, localName)
}

function hasAttributes(element: Element): boolean {
	return Element.prototype.hasAttributes.call(element)
}

function setAttribute(element: Element, name: string, value: string): void {
	Element.prototype.setAttribute.call(element, name, value)
}

function setAttributeNS(element: Element, namespace: string | null, name: string, value: string): void {
	Element.prototype.setAttributeNS.call(element, namespace, name, value)
}

function setAttributeNodeNS(element: Element, attribute: Attr): void {
	Element.prototype.setAttributeNodeNS.call(element, attribute)
}

function removeAttribute(element: Element, name: string): void {
	Element.prototype.removeAttribute.call(element, name)
}

function removeAttributeNS(element: Element, namespace: string | null, localName: string): void {
	Element.prototype.removeAttributeNS.call(element, namespace, localName)
}

function matchesSelector(element: Element, selectors: string): boolean {
	return Element.prototype.matches.call(element, selectors)
}

function getElementsByTagName(element: Element, name: string): HTMLCollectionOf<Element> {
	return Element.prototype.getElementsByTagName.call(element, name)
}

// Elements, documents and fragments each have their own copy of these.
function parentPrototypeOf(parent: ParentNode): ParentNode {
	if (isElement(parent)) return Element.prototype
	return isDocument(parent) ? Document.prototype : DocumentFragment.prototype
}

function querySelector(parent: ParentNode, selectors: string): Element | null {
	return parentPrototypeOf(parent).querySelector.call(parent, selectors)
}

function querySelectorAll(parent: ParentNode, selectors: string): NodeListOf<Element> {
	return parentPrototypeOf(parent).querySelectorAll.call(parent, selectors)
}

function createElement(document: Document, localName: string): HTMLElement {
	return Document.prototype.createElement.call(document, localName)
}

function createElementNS(document: Document, namespace: string, localName: string): Element {
	return Document.prototype.createElementNS.call(document, namespace, localName)
}

// A shallow copy of the node in the document.
function importNode<T extends Node>(document: Document, node: T): T {
	return Document.prototype.importNode.call(document, node, false) as T
}

function createComment(document: Document, data: string): Comment {
	return Document.prototype.createComment.call(document, data)
}

function getElementsByName(document: Document, name: string): NodeListOf<HTMLElement> {
	return Document.prototype.getElementsByName.call(document, name)
}

// New nodes and moved matches go after the nodes whose removal was vetoed, as they go in other morphers, and after the
// movable elements that may stay when the morph settles. So the insertion point skips the kept nodes in front of it,
// with the matches that move later and the whitespace among them. The whitespace before a vetoed node stays with it,
// rather than being removed.
function skipKeptNodes(
	insertionPoint: ChildNode | null,
	kept: Map<ChildNode, boolean>,
	moving: Set<ChildNode>,
	liveWhitespace: Set<ChildNode> | null,
): ChildNode | null {
	let after = insertionPoint
	for (let node = insertionPoint; node;) {
		const next = nextSiblingOf(node)
		const vetoed = kept.get(node)
		if (vetoed !== undefined) {
			if (vetoed) {
				for (let skipped = after!; skipped !== node; skipped = nextSiblingOf(skipped)!) liveWhitespace?.delete(skipped)
			}
			after = next
		} else if (!moving.has(node) && !liveWhitespace?.has(node)) {
			break
		}
		node = next
	}
	return after
}

// Find longest increasing subsequence to minimize moves during reordering
// Returns the indices in the sequence that form the LIS
function longestIncreasingSubsequence(sequence: Array<number | undefined>): Array<number> {
	const n = sequence.length
	const smallestEnding = new Array<number>(n)
	const indices = new Array<number>(n)
	const prev = new Int32Array(n)

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
