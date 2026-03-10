import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { observeMutations } from "./utils"

type Random = () => number

type NodeSpec = ElementSpec | TextSpec | CommentSpec

type ElementSpec = {
	kind: "element"
	tag: string
	attrs: Record<string, string | boolean>
	text?: string
	children?: Array<NodeSpec>
	type?: string
}

type TextSpec = {
	kind: "text"
	value: string
}

type CommentSpec = {
	kind: "comment"
	value: string
}

type MatchingCase = {
	from: HTMLElement
	to: HTMLElement
	expected: HTMLElement
	reused: Array<ReusedNodeExpectation>
	seed: number
}

type ReusedNodeExpectation = {
	key: string
	node: Element
	selector: string
}

type ControlSpec =
	| {
			kind: "input-text"
			id: string
			defaultValue: string
	  }
	| {
			kind: "checkbox"
			id: string
			checked: boolean
	  }
	| {
			kind: "textarea"
			id: string
			defaultValue: string
	  }
	| {
			kind: "select"
			id: string
			options: Array<{ value: string; selected: boolean }>
	  }

type PreserveCase = {
	from: HTMLElement
	to: HTMLElement
	expected: HTMLElement
	dirtyControls: Array<DirtyControlExpectation>
	seed: number
}

type DirtyControlExpectation = {
	id: string
	kind: ControlSpec["kind"]
	liveValue: string | boolean | number
	targetValue: string | boolean
	targetIndex?: number
	targetSelected?: Array<boolean>
}

const MATCHING_SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_MATCHING_SEEDS", 40)
const PRESERVE_SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_PRESERVE_SEEDS", 24)
const MATCHING_SEEDS = Array.from({ length: MATCHING_SEED_COUNT }, (_, index) => 0x51f0 + index)
const PRESERVE_SEEDS = Array.from({ length: PRESERVE_SEED_COUNT }, (_, index) => 0x91c0 + index)
const INLINE_TAGS = ["div", "span", "p", "section", "article"] as const
const CONTROL_TYPES = ["text", "email", "search"] as const

test("seeded fuzz preserves structure and stable node identity", () => {
	for (const seed of MATCHING_SEEDS) {
		const scenario = createMatchingCase(seed)

		morph(scenario.from, scenario.to)
		assertDomEqual(scenario.from, scenario.expected, scenario.seed, "first morph")

		for (const reused of scenario.reused) {
			const result = scenario.from.querySelector(reused.selector)
			if (result !== reused.node) {
				throw new Error(`Seed ${seed} failed to reuse ${reused.key}`)
			}
		}

		const secondTarget = scenario.expected.cloneNode(true) as HTMLElement
		const mutations = observeMutations(scenario.from, () => {
			morph(scenario.from, secondTarget)
		})

		if (mutations.count !== 0) {
			throw new Error(`Seed ${seed} was not idempotent on the second morph`)
		}
	}
})

test("seeded fuzz keeps dirty form state while syncing defaults", () => {
	for (const seed of PRESERVE_SEEDS) {
		const scenario = createPreserveCase(seed)

		morph(scenario.from, scenario.to, { preserveChanges: true })
		assertDomEqual(scenario.from, scenario.expected, scenario.seed, "preserveChanges morph")

		for (const control of scenario.dirtyControls) {
			if (control.kind === "input-text") {
				const input = scenario.from.querySelector(`#${control.id}`) as HTMLInputElement | null
				expect(input?.value).toBe(control.liveValue)
				expect(input?.defaultValue).toBe(control.targetValue)
			} else if (control.kind === "checkbox") {
				const input = scenario.from.querySelector(`#${control.id}`) as HTMLInputElement | null
				expect(input?.checked).toBe(control.liveValue)
				expect(input?.defaultChecked).toBe(control.targetValue)
			} else if (control.kind === "textarea") {
				const textarea = scenario.from.querySelector(`#${control.id}`) as HTMLTextAreaElement | null
				expect(textarea?.value).toBe(control.liveValue)
				expect(textarea?.defaultValue).toBe(control.targetValue)
			} else {
				const select = scenario.from.querySelector(`#${control.id}`) as HTMLSelectElement | null
				expect(select?.selectedIndex).toBe(control.liveValue)
				expect(select?.selectedIndex).toBe(control.targetIndex)
				expect(select?.value).toBe(control.targetValue)
				expect(Array.from(select?.options ?? [], (option) => option.defaultSelected)).toEqual(control.targetSelected)
			}
		}
	}
})

function createMatchingCase(seed: number): MatchingCase {
	const random = createRandom(seed)
	const baseCount = randomInt(random, 4, 8)
	const baseSpecs = Array.from({ length: baseCount }, (_, index) => createBaseElementSpec(random, index))
	const overlap = baseSpecs.filter(() => random() > 0.28)
	const fromOnly = Array.from({ length: randomInt(random, 0, 2) }, (_, index) =>
		createLooseElementSpec(random, `from-${seed}-${index}`),
	)
	const toOnly = Array.from({ length: randomInt(random, 1, 3) }, (_, index) =>
		createLooseElementSpec(random, `to-${seed}-${index}`),
	)

	if (overlap.length === 0) overlap.push(baseSpecs[0]!)

	const fromSpecs = shuffle(random, [
		...overlap.map((spec) => mutateFromSpec(spec, random)),
		...fromOnly,
		...createNoiseNodes(random, "from"),
	])
	const toSpecs = shuffle(random, [
		...overlap.map((spec) => mutateToSpec(spec, random)),
		...toOnly,
		...createNoiseNodes(random, "to"),
	])

	const from = document.createElement("div")
	const to = document.createElement("div")

	appendChildren(from, fromSpecs)
	appendChildren(to, toSpecs)

	const expected = to.cloneNode(true) as HTMLElement
	const reused = collectReuseExpectations(from, overlap, toSpecs)

	return { from, to, expected, reused, seed }
}

function createPreserveCase(seed: number): PreserveCase {
	const random = createRandom(seed)
	const baseCount = randomInt(random, 3, 6)
	const controls = Array.from({ length: baseCount }, (_, index) => createControlSpec(random, seed, index))
	const overlap = controls.filter(() => random() > 0.2)

	if (overlap.length === 0) overlap.push(controls[0]!)

	const from = document.createElement("form")
	const to = document.createElement("form")

	const dirtyControls: Array<DirtyControlExpectation> = []
	const fromNodes = shuffle(random, [
		...overlap.map((spec) => createControlElement(spec)),
		...Array.from({ length: randomInt(random, 0, 2) }, (_, index) =>
			createControlElement(createControlSpec(random, seed + 1, index + 20)),
		),
	])
	const toNodes = shuffle(random, [
		...overlap.map((spec, index) => {
			const target = mutateControlSpec(spec, random, index)
			return createControlElement(target)
		}),
		...Array.from({ length: randomInt(random, 1, 2) }, (_, index) =>
			createControlElement(createControlSpec(random, seed + 2, index + 40)),
		),
	])

	for (const node of fromNodes) from.appendChild(node)
	for (const node of toNodes) to.appendChild(node)

	for (const target of Array.from(to.children)) {
		const id = (target as Element).id
		if (id === "" || random() < 0.45) continue

		const source = from.querySelector(`#${id}`)
		if (!source) continue

		if (source instanceof HTMLInputElement && source.type !== "checkbox") {
			const liveValue = `${source.defaultValue}-dirty-${seed}`
			source.value = liveValue
			dirtyControls.push({ id, kind: "input-text", liveValue, targetValue: target.getAttribute("value") ?? "" })
		} else if (source instanceof HTMLInputElement && source.type === "checkbox") {
			const liveValue = !source.defaultChecked
			source.checked = liveValue
			dirtyControls.push({
				id,
				kind: "checkbox",
				liveValue,
				targetValue: (target as HTMLInputElement).defaultChecked,
			})
		} else if (source instanceof HTMLTextAreaElement) {
			const liveValue = `${source.defaultValue}-dirty-${seed}`
			source.value = liveValue
			dirtyControls.push({
				id,
				kind: "textarea",
				liveValue,
				targetValue: (target as HTMLTextAreaElement).defaultValue,
			})
		} else if (source instanceof HTMLSelectElement) {
			continue
		}
	}

	const expected = to.cloneNode(true) as HTMLElement
	return { from, to, expected, dirtyControls, seed }
}

function collectReuseExpectations(
	from: HTMLElement,
	overlap: Array<ElementSpec>,
	toSpecs: Array<NodeSpec>,
): Array<ReusedNodeExpectation> {
	const expectations: Array<ReusedNodeExpectation> = []

	for (const spec of overlap) {
		const key = getStableKey(spec)
		if (!key) continue

		const source = from.querySelector(getSelector(key))
		if (!source) continue

		const target = toSpecs.find((candidate) => candidate.kind === "element" && getStableKey(candidate) === key) as
			| ElementSpec
			| undefined

		if (!target) continue

		if (!canRequireReuse(spec, target)) continue

		expectations.push({ key, node: source, selector: getSelector(key) })
	}

	return expectations
}

function canRequireReuse(from: ElementSpec, to: ElementSpec): boolean {
	if (from.tag !== to.tag) return false
	if (from.tag === "input") {
		return (from.type ?? "text") === (to.type ?? "text")
	}
	return true
}

function getStableKey(spec: ElementSpec): string | null {
	if (typeof spec.attrs.id === "string") return `id:${spec.attrs.id}`
	if (typeof spec.attrs.name === "string") return `name:${spec.tag}:${spec.attrs.name}`
	if (typeof spec.attrs.href === "string") return `href:${spec.attrs.href}`
	if (typeof spec.attrs.src === "string") return `src:${spec.attrs.src}`
	return null
}

function getSelector(key: string): string {
	if (key.startsWith("id:")) return `#${cssEscape(key.slice(3))}`
	if (key.startsWith("name:")) {
		const [, tag, name] = key.split(":")
		return `${tag}[name="${cssEscape(name)}"]`
	}
	if (key.startsWith("href:")) return `[href="${cssEscape(key.slice(5))}"]`
	return `[src="${cssEscape(key.slice(4))}"]`
}

function createBaseElementSpec(random: Random, index: number): ElementSpec {
	const variant = randomInt(random, 0, 5)
	const token = `case-${index}-${randomToken(random)}`

	if (variant === 0) {
		return {
			kind: "element",
			tag: "a",
			attrs: { href: `/${token}` },
			text: `link-${token}`,
		}
	}

	if (variant === 1) {
		return {
			kind: "element",
			tag: "img",
			attrs: { src: `/${token}.png`, alt: `alt-${token}` },
		}
	}

	if (variant === 2) {
		const type = pick(random, CONTROL_TYPES)
		return {
			kind: "element",
			tag: "input",
			type,
			attrs: { id: token, type, value: `value-${token}` },
		}
	}

	if (variant === 3) {
		return {
			kind: "element",
			tag: pick(random, INLINE_TAGS),
			attrs: { id: token, class: `c-${randomInt(random, 1, 4)}` },
			children: [
				{ kind: "text", value: `text-${token}` },
				{ kind: "element", tag: "strong", attrs: { id: `${token}-child` }, text: `child-${token}` },
			],
		}
	}

	if (variant === 4) {
		return {
			kind: "element",
			tag: pick(random, INLINE_TAGS),
			attrs: { name: token },
			text: `named-${token}`,
		}
	}

	return {
		kind: "element",
		tag: pick(random, INLINE_TAGS),
		attrs: { class: `plain-${randomInt(random, 1, 5)}` },
		children: [{ kind: "text", value: `plain-${token}` }],
	}
}

function createLooseElementSpec(random: Random, prefix: string): ElementSpec {
	return {
		kind: "element",
		tag: pick(random, ["div", "span", "p", "article"] as const),
		attrs: { id: `${prefix}-${randomToken(random)}` },
		text: `loose-${prefix}-${randomInt(random, 1, 9)}`,
	}
}

function mutateFromSpec(spec: ElementSpec, random: Random): ElementSpec {
	const next = cloneSpec(spec) as ElementSpec
	if (next.tag === "input") {
		next.attrs.value = `${next.attrs.value}-from`
		return next
	}

	if (next.tag === "img") {
		next.attrs.alt = `${next.attrs.alt}-from`
		return next
	}

	if (next.children) {
		next.children = next.children.map((child, index) => {
			if (child.kind === "text") return { ...child, value: `${child.value}-from-${index}` }
			if (child.kind === "element") return { ...child, text: `${child.text ?? ""}-from-${index}` }
			return child
		})
	} else if (next.text) {
		next.text = `${next.text}-from`
	}

	if (random() > 0.5) next.attrs["data-from"] = `from-${randomInt(random, 1, 9)}`
	return next
}

function mutateToSpec(spec: ElementSpec, random: Random): ElementSpec {
	const next = cloneSpec(spec) as ElementSpec
	if (next.tag === "input") {
		if (random() > 0.65) {
			const type = pick(random, CONTROL_TYPES)
			next.type = type
			next.attrs.type = type
		}
		next.attrs.value = `${next.attrs.value}-to`
		return next
	}

	if (next.tag === "img") {
		next.attrs.alt = `${next.attrs.alt}-to`
		return next
	}

	if (next.children) {
		next.children = next.children.map((child, index) => {
			if (child.kind === "text") return { ...child, value: `${child.value}-to-${index}` }
			if (child.kind === "element") return { ...child, text: `${child.text ?? ""}-to-${index}` }
			return child
		})
	} else if (next.text) {
		next.text = `${next.text}-to`
	}

	next.attrs["data-to"] = `to-${randomInt(random, 1, 9)}`
	return next
}

function createNoiseNodes(random: Random, label: string): Array<NodeSpec> {
	const nodes: Array<NodeSpec> = []
	const count = randomInt(random, 0, 2)

	for (let index = 0; index < count; index++) {
		if (random() > 0.5) {
			nodes.push({ kind: "text", value: ` ${label}-space-${index} ` })
		} else {
			nodes.push({ kind: "comment", value: `${label}-comment-${index}` })
		}
	}

	return nodes
}

function createControlSpec(random: Random, seed: number, index: number): ControlSpec {
	const id = `control-${seed}-${index}-${randomToken(random)}`
	const variant = randomInt(random, 0, 3)

	if (variant === 0) {
		return {
			kind: "input-text",
			id,
			defaultValue: `value-${randomToken(random)}`,
		}
	}

	if (variant === 1) {
		return {
			kind: "checkbox",
			id,
			checked: random() > 0.5,
		}
	}

	if (variant === 2) {
		return {
			kind: "textarea",
			id,
			defaultValue: `text-${randomToken(random)}`,
		}
	}

	const selected = randomInt(random, 0, 2)
	return {
		kind: "select",
		id,
		options: [0, 1, 2].map((optionIndex) => ({
			value: `option-${optionIndex}-${randomToken(random)}`,
			selected: optionIndex === selected,
		})),
	}
}

function mutateControlSpec(spec: ControlSpec, random: Random, index: number): ControlSpec {
	if (spec.kind === "input-text") {
		return { ...spec, defaultValue: `${spec.defaultValue}-to-${index}` }
	}

	if (spec.kind === "checkbox") {
		return { ...spec, checked: !spec.checked }
	}

	if (spec.kind === "textarea") {
		return { ...spec, defaultValue: `${spec.defaultValue}-to-${index}` }
	}

	const selectedIndex = randomInt(random, 0, spec.options.length - 1)
	return {
		...spec,
		options: spec.options.map((option, optionIndex) => ({
			value: `${option.value}-to-${index}`,
			selected: optionIndex === selectedIndex,
		})),
	}
}

function createControlElement(spec: ControlSpec): HTMLElement {
	if (spec.kind === "input-text") {
		const input = document.createElement("input")
		input.type = "text"
		input.id = spec.id
		input.name = spec.id
		input.value = spec.defaultValue
		return input
	}

	if (spec.kind === "checkbox") {
		const input = document.createElement("input")
		input.type = "checkbox"
		input.id = spec.id
		input.name = spec.id
		input.checked = spec.checked
		input.defaultChecked = spec.checked
		return input
	}

	if (spec.kind === "textarea") {
		const textarea = document.createElement("textarea")
		textarea.id = spec.id
		textarea.textContent = spec.defaultValue
		return textarea
	}

	const select = document.createElement("select")
	select.id = spec.id
	for (const optionSpec of spec.options) {
		const option = document.createElement("option")
		option.value = optionSpec.value
		option.textContent = optionSpec.value
		option.selected = optionSpec.selected
		option.defaultSelected = optionSpec.selected
		select.appendChild(option)
	}
	return select
}

function appendChildren(parent: HTMLElement, specs: Array<NodeSpec>): void {
	for (const spec of specs) {
		parent.appendChild(createNode(spec))
	}
}

function createNode(spec: NodeSpec): ChildNode {
	if (spec.kind === "text") return document.createTextNode(spec.value)
	if (spec.kind === "comment") return document.createComment(spec.value)

	const element = document.createElement(spec.tag)
	for (const [name, value] of Object.entries(spec.attrs)) {
		if (typeof value === "boolean") {
			if (value) element.setAttribute(name, "")
			continue
		}
		element.setAttribute(name, value)
	}

	if (spec.tag === "input" && spec.type) {
		;(element as HTMLInputElement).type = spec.type
	}

	if (spec.text) element.textContent = spec.text
	if (spec.children) {
		for (const child of spec.children) {
			element.appendChild(createNode(child))
		}
	}

	return element
}

function cloneSpec<T extends NodeSpec>(spec: T): T {
	return structuredClone(spec)
}

function assertDomEqual(from: HTMLElement, expected: HTMLElement, seed: number, phase: string): void {
	if (!from.isEqualNode(expected)) {
		throw new Error(`Seed ${seed} failed during ${phase}\nexpected: ${expected.outerHTML}\nreceived: ${from.outerHTML}`)
	}
}

function shuffle<T>(random: Random, items: Array<T>): Array<T> {
	const copy = [...items]
	for (let index = copy.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(random() * (index + 1))
		;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
	}
	return copy
}

function pick<T>(random: Random, values: readonly T[]): T {
	return values[Math.floor(random() * values.length)]!
}

function randomInt(random: Random, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
}

function randomToken(random: Random): string {
	return Math.floor(random() * 0xffffff)
		.toString(36)
		.padStart(4, "0")
}

function cssEscape(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function createRandom(seed: number): Random {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

function readPositiveIntEnv(name: string, fallback: number): number {
	const value = readEnv(name)
	if (!value) return fallback

	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed < 1) return fallback

	return parsed
}

function readEnv(name: string): string | undefined {
	const processValue = globalThis.process?.env?.[name]
	if (processValue) return processValue

	const viteValue = import.meta.env[`VITE_${name}`]
	return typeof viteValue === "string" && viteValue !== "" ? viteValue : undefined
}
