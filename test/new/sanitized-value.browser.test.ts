import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

function observeMutations(node: Node): () => Array<MutationRecord> {
	const observer = new MutationObserver(() => {})
	observer.observe(node, { subtree: true, attributes: true, childList: true })
	return () => {
		const records = observer.takeRecords()
		observer.disconnect()
		return records
	}
}

const sanitizedInputs = [
	`<input type="range">`,
	`<input type="range" min="0" max="10" value="15">`,
	`<input type="range" min="0" max="10" step="3" value="5">`,
	`<input type="color">`,
	`<input type="color" value="RED">`,
	`<input type="email" value=" a@b.c ">`,
	`<input type="url" value=" https://example.com ">`,
	`<input value="a&#10;b">`,
	`<input type="number" value="abc">`,
	`<input type="date" value="2020-13-01">`,
	`<input type="time" value="25:00">`,
]

for (const input of sanitizedInputs) {
	test(`an untouched ${input} keeps its node`, () => {
		const from = dom(`<div>${input}</div>`)
		const before = from.querySelector("input")!
		const value = before.value

		morph(from, `<div>${input}<p>new</p></div>`)

		expect(from.querySelector("input")).toBe(before)
		expect(before.value).toBe(value)
	})

	test(`morphing an untouched ${input} to identical markup changes nothing`, () => {
		const from = dom(`<div>${input}</div>`)
		const mutations = observeMutations(from)

		morph(from, `<div>${input}</div>`)

		expect(mutations()).toEqual([])
	})

	test(`an untouched ${input} follows a new value attribute under preserveChanges after a reset`, () => {
		const from = dom(`<div>${input}</div>`)
		const before = from.querySelector("input")!
		before.id = "i"

		morph(from, `<div class="a">${before.outerHTML}</div>`)
		const next = dom(before.outerHTML) as HTMLInputElement
		next.setAttribute("value", before.type === "color" ? "#00ff00" : before.type === "range" ? "2" : "")
		const expected = next.value
		morph(from, `<div>${next.outerHTML}</div>`, { preserveChanges: true })

		expect(from.querySelector("input")).toBe(before)
		expect(before.value).toBe(expected)
	})
}

test("a range the user never touched follows its markup under preserveChanges", () => {
	const from = dom(`<div><input id="r" type="range" class="a"></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><input id="r" type="range" class="b"></div>`)
	morph(from, `<div><input id="r" type="range" class="b" value="20"></div>`, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("20")
})

test("a range the user moved keeps its position under preserveChanges", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	input.value = "70"

	morph(from, `<div><input id="r" type="range" value="20"></div>`, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("70")
})

test("a range the user moved back to its default keeps it under preserveChanges", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	input.value = "50"

	morph(from, `<div><input id="r" type="range" value="20"></div>`, { preserveChanges: true })

	expect(input.value).toBe("50")
})

test("a range the user moved is reset to its markup without preserveChanges", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	input.value = "70"

	morph(from, `<div><input id="r" type="range"></div>`)

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("50")
})

test("a range the user moved back to its default is reset to new markup", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	input.value = "50"

	morph(from, `<div><input id="r" type="range" value="20"></div>`)

	expect(input.value).toBe("20")
})

test("an email the user edited to the sanitized value keeps it under preserveChanges", () => {
	const from = dom(`<div><input id="e" type="email" value=" a@b.c "></div>`)
	const input = from.querySelector("input")!
	input.value = "x@y.z"
	input.value = "a@b.c"

	morph(from, `<div><input id="e" type="email" value="d@e.f"></div>`, { preserveChanges: true })

	expect(input.value).toBe("a@b.c")
})

test("an untouched textarea with a carriage return keeps its node and value", () => {
	const from = dom(`<div><textarea>a&#13;b</textarea></div>`)
	const textarea = from.querySelector("textarea")!
	const mutations = observeMutations(from)

	morph(from, `<div><textarea>a&#13;b</textarea></div>`)

	expect(mutations()).toEqual([])
	expect(from.querySelector("textarea")).toBe(textarea)
	expect(textarea.value).toBe("a\nb")
})

test("an untouched textarea with a carriage return follows new text under preserveChanges after a reset", () => {
	const from = dom(`<div><textarea id="t">a&#13;b</textarea></div>`)
	const textarea = from.querySelector("textarea")!

	morph(from, `<div class="a"><textarea id="t">a&#13;b</textarea></div>`)
	morph(from, `<div><textarea id="t">c</textarea></div>`, { preserveChanges: true })

	expect(textarea.value).toBe("c")
})

test("an untouched file input with a value attribute keeps its node", () => {
	const from = dom(`<div><input type="file" value="a.txt"></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><input type="file" value="a.txt"><p>new</p></div>`)

	expect(from.querySelector("input")).toBe(input)
})

test("an input the user changed to the letter a keeps it under preserveChanges", () => {
	const from = dom(`<div><input id="i" value="x"></div>`)
	const input = from.querySelector("input")!
	input.value = "a"

	morph(from, `<div><input id="i" value="y"></div>`, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("a")
	expect(input.defaultValue).toBe("y")
})

test("an input the user changed to the letter a is reset without preserveChanges", () => {
	const from = dom(`<div><input id="i" value="x"></div>`)
	const input = from.querySelector("input")!
	input.value = "a"

	morph(from, `<div><input id="i" value="y"></div>`)

	expect(input.value).toBe("y")
})

test("checking an untouched customized built-in input doesn't construct another one", () => {
	let constructed = 0
	class CountedSlider extends HTMLInputElement {
		constructor() {
			super()
			constructed++
		}
	}
	customElements.define("x-counted-slider", CountedSlider, { extends: "input" })
	const from = dom(`<div><input is="x-counted-slider" type="range"></div>`)
	const input = from.querySelector("input")!
	constructed = 0

	morph(from, `<div><input is="x-counted-slider" type="range"><p>new</p></div>`)

	expect(from.querySelector("input")).toBe(input)
	expect(constructed).toBe(0)
})

test("an untouched range shows what the target shows after its attributes change", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	const target = dom(`<div><input id="r" max="10" type="range"></div>`)
	const expected = target.querySelector("input")!.value

	morph(from, target)

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe(expected)
})

test("an untouched range with a value shows what the target shows after its max changes", () => {
	const from = dom(`<div><input id="r" type="range" value="40"></div>`)
	const input = from.querySelector("input")!
	const target = dom(`<div><input id="r" max="10" type="range" value="40"></div>`)
	const expected = target.querySelector("input")!.value

	morph(from, target)

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe(expected)
})

test("an untouched range stays clamped when a target the user changed has a value out of its range", () => {
	const from = dom(`<div><input id="r" type="range" value="200"></div>`)
	const input = from.querySelector("input")!
	const target = dom(`<div><input id="r" type="range" value="200" class="a"></div>`)
	target.querySelector("input")!.value = "30"

	morph(from, target)

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("100")
})

test("a vetoed type change doesn't take the target's value", () => {
	const from = dom(`<div><input id="r"></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><input id="r" type="range"></div>`, {
		beforeAttributeUpdated: (_element, name) => name !== "type",
	})

	expect(input.type).toBe("text")
	expect(input.value).toBe("")
})

test("resetting a clamped range doesn't mark it as changed", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!

	morph(from, `<div><input id="r" max="10" type="range"></div>`)
	morph(from, `<div><input id="r" max="10" type="range" value="2"></div>`, { preserveChanges: true })

	expect(from.querySelector("input")).toBe(input)
	expect(input.value).toBe("2")
})

test("a vetoed max keeps an untouched range's value", () => {
	const from = dom(`<div><input id="r" type="range"></div>`)
	const input = from.querySelector("input")!
	const value = input.value

	morph(from, `<div><input id="r" max="10" type="range"></div>`, {
		beforeAttributeUpdated: (_element, name) => name !== "max",
	})

	expect(input.hasAttribute("max")).toBe(false)
	expect(input.value).toBe(value)
})

test("a vetoed max doesn't keep what the user typed without preserveChanges", () => {
	const from = dom(`<div><input id="t" value="a"></div>`)
	const input = from.querySelector("input")!
	input.value = "typed"

	morph(from, `<div><input id="t" max="10" value="a"></div>`, {
		beforeAttributeUpdated: (_element, name) => name !== "max",
	})

	expect(input.hasAttribute("max")).toBe(false)
	expect(input.value).toBe("a")
})
