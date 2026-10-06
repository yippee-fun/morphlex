import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number
type Item = { id: string; text: string; children: Array<Item> | null }

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_FOCUS_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_FOCUS_SEED_START set to it and MORPHLEX_FUZZ_FOCUS_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_FOCUS_SEED_START", 0x4f01)

const SUPPORTS_MOVE_BEFORE = "moveBefore" in Element.prototype

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

// `moveBefore` keeps focus, so there focus mustn't make the morph move more elements. Without it, the elements
// holding the focused input stay put instead.
test("seeded fuzz moves no more elements around a focused input with moveBefore, otherwise keeps its holders still, and keeps focus", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const scenario = createScenario(seed)
		const message = `seed ${seed}\n${scenario.from}\n${scenario.to}`

		const unfocused = mount(scenario.from)
		const expected = removedElements(unfocused, () => morph(unfocused, scenario.to)).length
		unfocused.remove()

		const host = mount(scenario.from)
		try {
			const input = host.querySelector("input")!
			input.focus()
			input.setSelectionRange(1, 3)

			const holders = new Set<Node>()
			for (let node: Node | null = input; node; node = node.parentNode) holders.add(node)
			const removed = removedElements(host, () => morph(host, scenario.to))

			if (SUPPORTS_MOVE_BEFORE) expect(removed.length, message).toBeLessThanOrEqual(expected)
			else
				expect(
					removed.filter((element) => holders.has(element)),
					message,
				).toEqual([])
			expect(host.outerHTML, message).toBe(parse(scenario.to).outerHTML)
			expect(host.querySelector("input"), message).toBe(input)
			expect(document.activeElement, message).toBe(input)
			expect([input.selectionStart, input.selectionEnd], message).toEqual([1, 3])
		} finally {
			host.remove()
		}
	}
})

// Nested lists of items with ids, one of which holds the focused input, a few levels down. The target reorders each
// list and sometimes adds or removes items, so the input's holder at each level moves among its siblings.
function createScenario(seed: number) {
	const random = createRandom(seed)
	const ids = { next: 0 }
	const depth = randomInt(random, 1, 3)
	const tree = createList(random, ids, depth)

	const join = random() < 0.5 ? "\n" : ""
	const from = render(tree, join, "root")
	const to = render(reorder(random, ids, tree), join, "root")
	return { from, to }
}

function createList(random: Random, ids: { next: number }, depth: number): Array<Item> {
	const items = Array.from({ length: randomInt(random, 1, 8) }, () => createItem(ids))
	pick(random, items).children = depth > 1 ? createList(random, ids, depth - 1) : null
	return items
}

function createItem(ids: { next: number }): Item {
	const id = ids.next++
	return { id: `i${id}`, text: `item ${id}`, children: [] }
}

// Shuffles the list, or moves one item, and sometimes adds or removes an item that isn't the holder.
function reorder(random: Random, ids: { next: number }, items: Array<Item>): Array<Item> {
	let result = items.map((item) => ({
		...item,
		children: item.children?.length ? reorder(random, ids, item.children) : item.children,
	}))
	const roll = random()
	if (roll < 0.4) {
		result = shuffle(random, result)
	} else if (roll < 0.9) {
		const [moved] = result.splice(randomInt(random, 0, result.length - 1), 1)
		result.splice(randomInt(random, 0, result.length), 0, moved!)
	}
	if (random() < 0.2) result.splice(randomInt(random, 0, result.length), 0, createItem(ids))
	const removable = result.filter((item) => item.children && item.children.length === 0)
	if (random() < 0.2 && removable.length > 0) result.splice(result.indexOf(pick(random, removable)), 1)
	return result
}

// An item with `children` of null holds the input, and an empty array holds just its text.
function render(items: Array<Item>, join: string, id = ""): string {
	const html = items.map((item) => {
		const inner =
			item.children === null ? `<input id="x" value="hello">` : item.children.length ? render(item.children, join) : ""
		return `<li id="${item.id}">${item.text}${inner}</li>`
	})
	return `<ul${id ? ` id="${id}"` : ""}>${html.join(join)}</ul>`
}

// Each move removes the element before it's inserted again, with or without `moveBefore`. Whitespace holds no state,
// and which of it a move reuses can change with the nodes that move, so it isn't counted.
function removedElements(host: HTMLElement, run: () => void): Array<Node> {
	const observer = new MutationObserver(() => {})
	observer.observe(host, { childList: true, subtree: true })
	run()
	const removed = observer.takeRecords().flatMap((record) => [...record.removedNodes])
	observer.disconnect()
	return removed.filter((node) => node.nodeType === Node.ELEMENT_NODE)
}

function mount(html: string): HTMLElement {
	const host = parse(html)
	document.body.append(host)
	return host
}

function parse(html: string): HTMLElement {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild as HTMLElement
}

function shuffle<T>(random: Random, values: Array<T>): Array<T> {
	const result = [...values]
	for (let i = result.length - 1; i > 0; i--) {
		const j = randomInt(random, 0, i)
		;[result[i], result[j]] = [result[j]!, result[i]!]
	}
	return result
}

function pick<T>(random: Random, values: ReadonlyArray<T>): T {
	return values[Math.floor(random() * values.length)]!
}

function randomInt(random: Random, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
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
	const value = globalThis.process?.env?.[name] ?? import.meta.env[`VITE_${name}`]
	const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
