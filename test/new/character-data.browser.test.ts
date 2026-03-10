import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { observeMutations } from "./utils"

test("unchanged text nodes do not emit characterData mutations", () => {
	const parent = document.createElement("div")
	parent.textContent = "same text"

	const to = document.createElement("div")
	to.textContent = "same text"

	const mutations = observeMutations(parent, () => {
		morph(parent, to)
	})

	expect(parent.textContent).toBe("same text")
	expect(mutations.characterDataChanges).toBe(0)
	expect(mutations.childListChanges).toBe(0)
})

test("unchanged comment nodes do not emit characterData mutations", () => {
	const parent = document.createElement("div")
	parent.appendChild(document.createComment("same comment"))

	const to = document.createElement("div")
	to.appendChild(document.createComment("same comment"))

	const mutations = observeMutations(parent, () => {
		morph(parent, to)
	})

	expect(parent.firstChild?.nodeValue).toBe("same comment")
	expect(mutations.characterDataChanges).toBe(0)
	expect(mutations.childListChanges).toBe(0)
})

test("changed text nodes still emit a characterData mutation", () => {
	const parent = document.createElement("div")
	parent.textContent = "before"

	const to = document.createElement("div")
	to.textContent = "after"

	const mutations = observeMutations(parent, () => {
		morph(parent, to)
	})

	expect(parent.textContent).toBe("after")
	expect(mutations.characterDataChanges).toBe(1)
	expect(mutations.childListChanges).toBe(0)
})
