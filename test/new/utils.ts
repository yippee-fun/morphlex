export function dom(html: string): HTMLElement {
	const tmp = document.createElement("div")
	tmp.innerHTML = html.trim()
	return tmp.firstChild as HTMLElement
}

export class Mutations {
	records: Array<MutationRecord> = []

	push(...records: MutationRecord[]) {
		this.records.push(...records)
	}

	get count(): number {
		return this.records.length
	}

	get childListChanges(): number {
		return this.records.filter((m) => m.type === "childList").length
	}

	get elementsAdded(): number {
		return this.records.filter(
			(m) => m.type === "childList" && Array.from(m.addedNodes).some((n) => n.nodeType === Node.ELEMENT_NODE),
		).length
	}

	get elementsRemoved(): number {
		return this.records.filter(
			(m) => m.type === "childList" && Array.from(m.removedNodes).some((n) => n.nodeType === Node.ELEMENT_NODE),
		).length
	}

	get textNodesAdded(): number {
		return this.records.filter(
			(m) => m.type === "childList" && Array.from(m.addedNodes).some((n) => n.nodeType === Node.TEXT_NODE),
		).length
	}

	get textNodesRemoved(): number {
		return this.records.filter(
			(m) => m.type === "childList" && Array.from(m.removedNodes).some((n) => n.nodeType === Node.TEXT_NODE),
		).length
	}

	get nodesAdded(): number {
		return this.records.filter((m) => m.type === "childList" && m.addedNodes.length > 0).length
	}

	get nodesRemoved(): number {
		return this.records.filter((m) => m.type === "childList" && m.removedNodes.length > 0).length
	}

	get attributeChanges(): number {
		return this.records.filter((m) => m.type === "attributes").length
	}

	get characterDataChanges(): number {
		return this.records.filter((m) => m.type === "characterData").length
	}
}

export function observeMutations(target: Node, callback: () => void): Mutations {
	const mutations = new Mutations()
	const observer = new MutationObserver((records) => {
		mutations.push(...records)
	})

	observer.observe(target, {
		childList: true,
		attributes: true,
		characterData: true,
		subtree: true,
	})

	callback()

	// Flush any pending mutations
	const records = observer.takeRecords()
	mutations.push(...records)

	observer.disconnect()
	return mutations
}

// Like `isEqualNode`, but also compares template contents, and whitespace only as closely as it renders.
export function isSameTree(live: Node, target: Node, ignoreOpen = false): boolean {
	if (live.nodeType !== target.nodeType || live.childNodes.length !== target.childNodes.length) return false

	if (live instanceof Element) {
		const liveClone = live.cloneNode(false) as Element
		const targetClone = target.cloneNode(false) as Element
		if (ignoreOpen && liveClone.localName === "details") {
			liveClone.removeAttribute("open")
			targetClone.removeAttribute("open")
		}
		if (!liveClone.isEqualNode(targetClone)) return false
	} else if (live.nodeValue !== target.nodeValue && !isInterchangeableWhitespace(live, target)) {
		return false
	}

	if (live instanceof HTMLTemplateElement) {
		if (!isSameTree(live.content, (target as HTMLTemplateElement).content, ignoreOpen)) return false
	}

	for (let index = 0; index < live.childNodes.length; index++) {
		if (!isSameTree(live.childNodes[index]!, target.childNodes[index]!, ignoreOpen)) return false
	}

	return true
}

// Spaces, tabs and line breaks the browser collapses render the same whatever they hold, as long as both have a
// line break or neither does.
function isInterchangeableWhitespace(live: Node, target: Node): boolean {
	const whitespace = /^[ \t\n\r]+$/
	const lineBreak = /[\n\r]/
	const liveValue = live.nodeValue ?? ""
	const targetValue = target.nodeValue ?? ""
	if (live.nodeType !== Node.TEXT_NODE || !whitespace.test(liveValue) || !whitespace.test(targetValue)) return false
	if (lineBreak.test(liveValue) !== lineBreak.test(targetValue)) return false

	const parent = live.parentElement
	if (!parent?.isConnected) return false

	return ["normal", "nowrap"].includes(getComputedStyle(parent).whiteSpace)
}
