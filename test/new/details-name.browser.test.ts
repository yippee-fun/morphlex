import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

// Opening a `details` closes the others with the same name, and inserting an open one, or giving an
// open one a name, closes it when another in that group is open. happy-dom doesn't do this, so the
// tests that need it to happen mid-morph close the item themselves in a callback.

function mount(html: string): HTMLElement {
	// A host a failed test left behind would hold open items in the same groups.
	document.body.replaceChildren()
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

// happy-dom lets every item in a group be open at once.
function closesOtherDetails(): boolean {
	const host = mount(`<details name="probe" open></details><details name="probe"></details>`)
	host.lastElementChild!.setAttribute("open", "")
	const closed = !host.firstElementChild!.hasAttribute("open")
	host.remove()
	return closed
}

function openIds(host: Element): string {
	return [...host.querySelectorAll("details")]
		.filter((details) => details.hasAttribute("open"))
		.map((details) => details.id)
		.filter((id) => id !== "")
		.join(" ")
}

test("an open item replaced by a new open one stays open", () => {
	const host = mount(`<div><details name="faq" id="q1" open><summary>Q1</summary></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><details name="faq" id="q2" open><summary>Q2</summary></details><span id="q1"></span></div>`,
	)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

test("an item that joins a group with open set before name stays open", () => {
	const host = mount(`<div><details id="a" name="g" open></details><details id="b" name="x"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="b" open name="g"></details><details id="a" name="g"></details></div>`)
	expect(openIds(host)).toBe("b")
	host.remove()
})

test("an open item that the morph left alone stays open when another item leaves its group", () => {
	const host = mount(`<div><details id="a" name="g" open></details><details id="b" name="g"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" name="g" open></details><details id="b" open name="x"></details></div>`)
	expect(openIds(host)).toBe("a b")
	host.remove()
})

test("an item opened before an earlier one leaves its group stays open", () => {
	const host = mount(`<div><details id="a" name="g" open></details><details id="b" name="g"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" open name="h"></details><details id="b" name="g" open></details></div>`)
	expect(openIds(host)).toBe("a b")
	host.remove()
})

test("an item the user opened stays open when it is renamed into an empty group", () => {
	const host = mount(`<div><details id="a" name="x"></details><details id="b" name="g"></details></div>`)
	host.querySelector("#a")!.setAttribute("open", "")
	morph(host.firstElementChild!, `<div><details id="a" name="g"></details><details id="b" name="g"></details></div>`, {
		preserveChanges: true,
	})
	expect(openIds(host)).toBe("a")
	host.remove()
})

test.skipIf(!closesOtherDetails())("an item renamed into a group where another is open stays closed", () => {
	const host = mount(`<div><details id="a" name="g" open></details><details id="b" name="x" open></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" name="g" open></details><details id="b" name="g" open></details></div>`, {
		preserveChanges: true,
	})
	expect(openIds(host)).toBe("a")
	host.remove()
})

test.skipIf(!closesOtherDetails())("the first of two new open items in a group is the one left open", () => {
	const host = mount(`<div><details id="a" name="g" open></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><span id="a"></span><details id="b" name="g" open></details><details id="c" name="g" open></details></div>`,
	)
	expect(openIds(host)).toBe("b")
	host.remove()
})

test.skipIf(!closesOtherDetails())("a new open item stays closed when an item outside the morph is open", () => {
	const host = mount(`<details id="outside" name="g" open></details><div><details id="a" name="g"></details></div>`)
	morph(host.lastElementChild!, `<div><details id="b" name="g" open></details></div>`)
	expect(openIds(host)).toBe("outside")
	host.remove()
})

test("a closed item the browser closed stays closed when the morph closes it too", () => {
	const host = mount(`<div><details id="a" name="g" open></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" name="g"></details><details id="b" name="g"></details></div>`)
	expect(openIds(host)).toBe("")
	host.remove()
})

test("an item keeps the value of its open attribute when it is reopened", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morph(host.firstElementChild!, `<div><details id="q2" name="g" open="yes"></details><span id="q1"></span></div>`, {
		afterNodeAdded(node) {
			if (node instanceof Element && node.id === "q2") node.removeAttribute("open")
		},
	})
	expect(host.querySelector("#q2")!.getAttribute("open")).toBe("yes")
	host.remove()
})

test("an item inside a new node is reopened", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morph(host.firstElementChild!, `<div><section><details id="q2" name="g" open></details></section><span id="q1"></span></div>`, {
		afterNodeAdded(node) {
			if (node instanceof Element) node.querySelector("details")?.removeAttribute("open")
		},
	})
	expect(openIds(host)).toBe("q2")
	host.remove()
})

test("an item without a name is reopened", () => {
	const host = mount(`<div><details id="a" name="g"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" open></details></div>`, {
		afterAttributeUpdated(element, name) {
			if (name === "open") element.removeAttribute("open")
		},
	})
	expect(openIds(host)).toBe("a")
	host.remove()
})

test("an item whose closing is vetoed stays open when another item opens", () => {
	const host = mount(`<div><details id="a" name="g" open></details><details id="b" name="g"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="a" name="g"></details><details id="b" name="g" open></details></div>`, {
		beforeAttributeUpdated: (element, name) => !(element.id === "a" && name === "open"),
	})
	expect(host.querySelector("#a")!.hasAttribute("open")).toBe(true)
	host.remove()
})

test("an item in a vetoed subtree stays open when another item opens", () => {
	const host = mount(`<div><section><details name="g" open></details></section><details id="b" name="g"></details></div>`)
	morph(host.firstElementChild!, `<div><section></section><details id="b" name="g" open></details></div>`, {
		beforeNodeVisited: (node) => !(node instanceof Element && node.localName === "section"),
	})
	expect(host.querySelector("section details")!.hasAttribute("open")).toBe(true)
	host.remove()
})

test("an item added by morphInner is reopened", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morphInner(host.firstElementChild!, `<div><details id="q2" name="g" open></details><span id="q1"></span></div>`)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

test("items closed in any order are reopened", () => {
	const host = mount(`<div><details id="a" name="g"></details></div>`)
	morph(
		host.firstElementChild!,
		`<details id="a" name="g" open></details><details id="b" name="h" open></details><details id="c" name="i" open></details>`,
		{
			afterNodeAdded(node) {
				if (node instanceof Element) node.removeAttribute("open")
			},
			afterAttributeUpdated(element, name) {
				if (name === "open") element.removeAttribute("open")
			},
		},
	)
	expect(openIds(host)).toBe("a b c")
	host.remove()
})

test("an item closed while another in its group is open stays closed", () => {
	const host = mount(`<details id="outside" name="g" open></details><div><details id="a" name="g"></details></div>`)
	morph(host.lastElementChild!, `<div><details id="b" name="g" open></details></div>`, {
		afterNodeAdded(node) {
			if (node instanceof Element) node.removeAttribute("open")
		},
	})
	expect(openIds(host)).toBe("outside")
	host.remove()
})

test("a closed item in a new node stays closed", () => {
	const host = mount(`<div><p></p></div>`)
	morph(
		host.firstElementChild!,
		`<div><section><details id="a" name="g"></details><details id="b" name="h" open></details></section></div>`,
	)
	expect(openIds(host)).toBe("b")
	host.remove()
})

test("an item inside a new item is reopened", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><details id="outer"><details id="q2" name="g" open></details></details><span id="q1"></span></div>`,
		{
			afterNodeAdded(node) {
				if (node instanceof Element) node.querySelector("#q2")?.removeAttribute("open")
			},
		},
	)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

// happy-dom and WebKit parse several open items in one group, and only the first stays open in a document.
test("a closed item opens when the only open item in its group comes later and the target opens it", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><details id="q2" name="g" open></details><details id="b" name="g" open></details><span id="q1"></span></div>`,
		{
			afterNodeAdded(node) {
				if (node instanceof Element && node.id === "q2") node.removeAttribute("open")
			},
		},
	)
	expect(host.querySelector("#q2")!.hasAttribute("open")).toBe(true)
	host.remove()
})

test("a closed item stays closed when an earlier item in its group is open", () => {
	const host = mount(`<div><details id="q1" name="g" open></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><details id="q2" name="g" open></details><details id="b" name="g" open></details><span id="q1"></span></div>`,
		{
			afterNodeAdded(node) {
				if (node instanceof Element && node.id === "b") node.removeAttribute("open")
			},
		},
	)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

test("a new item stays closed when the user keeps a later item in its group open", () => {
	for (const preserveChanges of [true, false]) {
		const host = mount(`<div><details id="a" name="g" open></details></div>`)
		morph(
			host.firstElementChild!,
			`<div><details id="n" name="g" open></details><details id="a" name="g" open></details></div>`,
			{
				preserveChanges,
				afterNodeAdded(node) {
					if (node instanceof Element && node.id === "n") node.removeAttribute("open")
				},
			},
		)
		// Without preserveChanges the target decides, and its first open item wins.
		expect(openIds(host).split(" ")[0]).toBe(preserveChanges ? "a" : "n")
		host.remove()
	}
})

test("a new item stays closed when a later item the user keeps open differs from its target", () => {
	const host = mount(`<div><details id="a" name="g" open class="x"></details></div>`)
	morph(host.firstElementChild!, `<div><details id="n" name="g" open></details><details id="a" name="g" open></details></div>`, {
		preserveChanges: true,
		afterNodeAdded(node) {
			if (node instanceof Element && node.id === "n") node.removeAttribute("open")
		},
	})
	expect(openIds(host)).toBe("a")
	host.remove()
})

test("an item stays closed when a later item in its group is open in a vetoed subtree", () => {
	const host = mount(`<div><details id="b" name="g"></details><section><details name="g" open></details></section></div>`)
	morph(host.firstElementChild!, `<div><details id="b" name="g" open></details><section></section></div>`, {
		beforeNodeVisited: (node) => !(node instanceof Element && node.localName === "section"),
		afterAttributeUpdated(element, name) {
			if (name === "open") element.removeAttribute("open")
		},
	})
	expect(openIds(host)).toBe("")
	expect(host.querySelector("section details")!.hasAttribute("open")).toBe(true)
	host.remove()
})

// Random accordions, morphed into a shuffled copy where items are renamed, opened, closed, added and removed.
test.skipIf(!closesOtherDetails())("items the user opened stay open, and other items show what the target says", () => {
	const failures: Array<string> = []
	for (let seed = 1; seed <= 300; seed++) {
		const random = createRandom(seed)
		const names = ["", "g", "h"]
		const item = (id: number, open: boolean) =>
			`<details id="d${id}"${pick(random, names) ? ` name="${pick(random, ["g", "h"])}"` : ""}${open ? " open" : ""}></details>`
		const fromIds = [1, 2, 3, 4, 5].filter(() => random() < 0.8)
		const fromHtml = `<div>${fromIds.map((id) => item(id, random() < 0.4)).join("")}</div>`
		const toIds = [...fromIds.filter(() => random() < 0.8), 6, 7].filter((id) => id < 6 || random() < 0.5)
		toIds.sort(() => random() - 0.5)
		const toHtml = `<div>${toIds.map((id) => item(id, random() < 0.4)).join("")}</div>`
		const preserveChanges = random() < 0.5

		const host = mount(fromHtml)
		const userOpened = preserveChanges ? [...host.querySelectorAll("details")].filter(() => random() < 0.3) : []
		for (const details of userOpened) details.setAttribute("open", "")
		const stillOpen = userOpened.filter((details) => details.hasAttribute("open"))
		const names_ = new Map(stillOpen.map((details) => [details, details.getAttribute("name")]))

		morph(host.firstElementChild!, toHtml, { preserveChanges })

		// WebKit lets a detached tree keep several open items in one accordion, but only the first stays open in a document.
		const expected = document.createElement("div")
		expected.innerHTML = toHtml
		const openNames = new Set<string>()
		for (const details of expected.querySelectorAll(`details[open]:not([name=""])[name]`)) {
			const name = details.getAttribute("name")!
			if (openNames.has(name)) details.removeAttribute("open")
			else openNames.add(name)
		}
		const describe = `seed ${seed}${preserveChanges ? " (preserveChanges)" : ""}: ${fromHtml} -> ${toHtml}, got ${host.innerHTML}`
		if (preserveChanges) {
			for (const details of stillOpen) {
				if (host.contains(details) && details.getAttribute("name") === names_.get(details) && !details.hasAttribute("open")) {
					failures.push(`${describe}, #${details.id} was closed`)
				}
			}
		} else if (openIds(host) !== openIds(expected)) {
			failures.push(describe)
		}
		host.remove()
	}
	expect(failures).toEqual([])
})

function pick<T>(random: () => number, values: ReadonlyArray<T>): T {
	return values[Math.floor(random() * values.length)]!
}

function createRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

test("an item that is the morph root is reopened before its own callback", () => {
	const host = mount(`<details id="a" name="g"></details>`)
	let openInCallback = false
	morph(host.firstElementChild!, `<details id="a" name="g" open></details>`, {
		afterAttributeUpdated(element, name) {
			if (name === "open") element.removeAttribute("open")
		},
		afterNodeVisited(node) {
			openInCallback = (node as Element).hasAttribute("open")
		},
	})
	expect(openInCallback).toBe(true)
	host.remove()
})

test("an svg element named details is left alone", () => {
	const host = mount(`<div><p id="q1"></p></div>`)
	morph(host.firstElementChild!, `<div><svg><details open></details></svg><details name="g" open></details></div>`, {
		afterNodeAdded(node) {
			if (node instanceof Element) node.querySelector("svg details")?.removeAttribute("open")
		},
	})
	expect(host.querySelector("svg details")!.hasAttribute("open")).toBe(false)
	host.remove()
})

// WebKit and happy-dom parse several open items in one group, but a document keeps only the first.
test("only the first open item of a group in the target is opened", () => {
	const host = mount(`<div><p></p></div>`)
	morph(
		host.firstElementChild!,
		`<div>x<details id="a" name="g" open></details><details id="b" open></details><details id="c" name="g" open></details><svg><details name="g" open></details></svg></div>`,
	)
	expect(openIds(host)).toBe("a b")
	expect(host.querySelector("svg details")!.hasAttribute("open")).toBe(true)
	host.remove()
})

test("only the first open item of a group in a target node list is opened", () => {
	const host = mount(`<div><p id="p"></p></div>`)
	morph(
		host.querySelector("#p")!,
		`text<details id="a" name="g" open><details id="b" name="g" open></details></details><details id="c" name="g" open></details>`,
	)
	expect(openIds(host)).toBe("a")
	host.remove()
})

test("only the first open item of a group in a morphInner target is opened", () => {
	const host = mount(`<div><p></p></div>`)
	morphInner(
		host.firstElementChild!,
		`<div><details id="a" name="g" open></details><details id="b" name="g" open></details></div>`,
	)
	expect(openIds(host)).toBe("a")
	host.remove()
})

test("only the first open item of a group in a target element is opened", () => {
	const host = mount(`<div><p></p></div>`)
	const target = document.createElement("div")
	target.innerHTML = `<details id="a" name="g" open></details><details id="b" name="g" open></details>`
	morph(host.firstElementChild!, target)
	expect(openIds(host)).toBe("a")
	host.remove()
})

test("an item whose name has a line break is reopened", () => {
	const host = mount(`<div><details id="q1" name="a&#10;b" open></details></div>`)
	morph(
		host.firstElementChild!,
		`<div><details id="q2" name="a&#10;b"></details><details id="b" name="a&#10;b"></details><span id="q1"></span></div>`,
	)
	morph(
		host.firstElementChild!,
		`<div><details id="q2" name="a&#10;b" open></details><details id="b" name="a&#10;b" open></details></div>`,
	)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

// happy-dom builds an unescaped selector for getElementsByName, so it only runs where browsers close other items.
test.skipIf(!closesOtherDetails())("an item whose name has quotes and backslashes is reopened", () => {
	const name = `a"b\\c&#13;d&#12;e`
	const host = mount(`<div><details id="q1" name='${name}' open></details></div>`)
	morph(host.firstElementChild!, `<div><details id="q2" name='${name}'></details><span id="q1"></span></div>`)
	morph(host.firstElementChild!, `<div><details id="q2" name='${name}' open></details></div>`)
	expect(openIds(host)).toBe("q2")
	host.remove()
})

test("an item outside a document is opened when another item in its group closes", () => {
	const host = document.createElement("div")
	host.innerHTML = `<details id="x" name="a" open></details><details id="y" name="a"></details>`
	morph(host, `<div><details id="x" name="a"></details><details id="y" name="a" open></details></div>`)
	expect(openIds(host)).toBe("y")
})

test("a namespaced attribute named open doesn't count as open", () => {
	const host = mount(`<div><details id="n1"></details></div>`)
	const live = host.querySelector("details")!
	live.setAttributeNS("urn:x", "open", "1")
	const to = document.createElement("div")
	const target = to.appendChild(document.createElement("details"))
	target.id = "n1"
	target.setAttribute("open", "")
	target.setAttributeNS("urn:x", "open", "1")

	morph(host.firstElementChild!, to, { preserveChanges: true })

	expect(live.hasAttributeNS(null, "open")).toBe(false)
	expect(live.getAttributeNS("urn:x", "open")).toBe("1")
	host.remove()
})

test("vetoing a namespaced attribute named open leaves the real one to the morph", () => {
	const host = mount(`<div><details id="n2" open></details></div>`)
	const live = host.querySelector("details")!
	live.setAttributeNS("urn:x", "open", "1")
	const to = document.createElement("div")
	const target = to.appendChild(document.createElement("details"))
	target.id = "n2"
	target.setAttributeNS("urn:x", "open", "2")

	morph(host.firstElementChild!, to, {
		beforeAttributeUpdated: (_element, name, value) => !(name === "open" && value === "2"),
	})

	expect(live.hasAttributeNS(null, "open")).toBe(false)
	expect(live.getAttributeNS("urn:x", "open")).toBe("1")
	host.remove()
})
