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
