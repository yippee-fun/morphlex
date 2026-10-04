import { expect, test } from "vitest"
import { morph, morphInner } from "../../src/morphlex"

const SVG_NS = "http://www.w3.org/2000/svg"
const XLINK_NS = "http://www.w3.org/1999/xlink"

function mount(html: string): HTMLElement {
	const host = document.createElement("div")
	host.innerHTML = html
	document.body.append(host)
	return host
}

function attributesOf(element: Element): Array<string> {
	return Array.from(element.attributes, ({ name, value }) => `${name}=${value}`).sort()
}

test("an attribute named @click is added", () => {
	const host = mount(`<div><button>x</button></div>`)
	morph(host.firstElementChild!, `<div><button @click="go">x</button></div>`)
	expect(host.innerHTML).toBe(`<div><button @click="go">x</button></div>`)
})

test("attribute names that setAttribute rejects are added, changed and removed", () => {
	// The tree fuzzer covers names like `x-on:click`, which happy-dom splits into a prefix and a local name.
	const names = ["@click", ":class", "#ref", "[x]", "*ngif"]
	const host = mount(`<div><span></span></div>`)
	const span = host.querySelector("span")!

	for (const value of ["a", "b"]) {
		const html = `<div><span ${names.map((name) => `${name}="${value}"`).join(" ")}></span></div>`
		morph(host.firstElementChild!, html)
		expect(host.querySelector("span")).toBe(span)
		expect(attributesOf(span)).toEqual(attributesOf(mount(html).querySelector("span")!))
	}

	morph(host.firstElementChild!, `<div><span></span></div>`)
	expect(attributesOf(span)).toEqual([])
})

test("attribute callbacks see names that setAttribute rejects", () => {
	const host = mount(`<div><button @click="a">x</button></div>`)
	const calls: Array<unknown> = []

	morph(host.firstElementChild!, `<div><button @click="b" :class="c">x</button></div>`, {
		beforeAttributeUpdated: (_element, name, value) => {
			calls.push(["before", name, value])
			return name !== ":class"
		},
		afterAttributeUpdated: (_element, name, previous) => calls.push(["after", name, previous]),
	})

	expect(calls).toEqual([
		["before", "@click", "b"],
		["after", "@click", "a"],
		["before", ":class", "c"],
	])
	expect(host.innerHTML).toBe(`<div><button @click="b">x</button></div>`)
})

test("a pending move completes when the target adds an @click attribute", () => {
	const host = mount(`<div><section><input id="i" value="a"></section><button>x</button><aside></aside></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	morph(
		host.firstElementChild!,
		`<div><section></section><button @click="x">x</button><aside><input id="i" value="a"></aside></div>`,
		{
			preserveChanges: true,
		},
	)

	expect(host.querySelector("aside > input")).toBe(input)
	expect(input.value).toBe("typed")
	expect(host.innerHTML).toBe(
		`<div><section></section><button @click="x">x</button><aside><input id="i" value="a"></aside></div>`,
	)
})

test("an existing namespaced attribute keeps its prefix when its value changes", () => {
	const host = mount(`<svg><use xlink:href="#a"></use></svg>`)
	const use = host.querySelector("use")!

	morph(host.firstElementChild!, `<svg><use xlink:href="#b"></use></svg>`)

	expect(use.getAttributeNS(XLINK_NS, "href")).toBe("#b")
	expect(use.attributes[0]!.name).toBe("xlink:href")
	expect(use.namespaceURI).toBe(SVG_NS)
})

test("a morphInner that throws leaves no morphlex-dirty behind", () => {
	const host = mount(`<div><button>x</button><input value="a"></div>`)
	const input = host.querySelector("input")!
	input.value = "typed"

	expect(() =>
		morphInner(host.firstElementChild!, `<div><button title="x">x</button><input value="a"></div>`, {
			beforeAttributeUpdated: () => {
				throw new Error("boom")
			},
		}),
	).toThrow("boom")
	expect(input.hasAttribute("morphlex-dirty")).toBe(false)
})
