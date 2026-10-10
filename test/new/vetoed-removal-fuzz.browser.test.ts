import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

// Lists of items, text and comments, some with nested items, morphed into a list that keeps, drops, reorders, changes
// and adds them, while `beforeNodeRemoved` vetoes the removal of some nodes. The nodes it keeps stay where they were,
// and the nodes the morph adds or moves go after them, as other morphers place them.

type Random = () => number
type Item =
	| { kind: "item"; id: string; label: string; children: Array<Child> }
	| { kind: "text"; value: string }
	| { kind: "comment"; value: string }
type Child = { id: string; label: string }

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_KEPT_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_KEPT_SEED_START set to it and MORPHLEX_FUZZ_KEPT_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_KEPT_SEED_START", 0x6b70)

// Items and nested children take ids from their own pools, so an id never pairs elements of different tags.
const ITEM_IDS = ["a", "b", "c", "d", "e", "f"]
const CHILD_IDS = ["s1", "s2", "s3", "s4"]
const LABELS = ["one", "two", "three"]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 50) })

test("seeded fuzz places new and moved nodes after the nodes whose removal was vetoed", () => {
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const random = createRandom(seed)
		const scenario = createScenario(random)
		const host = document.createElement("div")
		host.innerHTML = scenario.from
		document.body.append(host)

		try {
			const root = host.firstElementChild!
			const nodes = [...allNodes(root)].filter((node) => !isWhitespace(node))
			const vetoed = new Set(nodes.filter(() => random() < 0.4))
			const parents = new Map(nodes.map((node) => [node, node.parentNode]))
			const siblings = new Map([root, ...nodes].map((node) => [node, [...node.childNodes]]))
			const kept = new Set<Node>()
			const added = new Set<Node>()
			const observer = new MutationObserver(() => {})
			observer.observe(root, { childList: true, subtree: true })

			const target = parse(scenario.to)
			morph(root, target, {
				beforeNodeRemoved: (node) => !(vetoed.has(node) && kept.add(node)),
			})

			for (const record of observer.takeRecords()) {
				for (const node of record.addedNodes) added.add(node)
			}
			observer.disconnect()

			const message = `seed ${seed}\n${scenario.from}\n${scenario.to}\nkept ${[...kept].map(describe).join(", ")}\nresult ${root.outerHTML}`

			for (const node of kept) {
				expect(node.parentNode, `${message}\nkept ${describe(node)} stays in its parent`).toBe(parents.get(node))
			}

			for (const [parent, children] of siblings) {
				if (!root.contains(parent)) continue
				const keptChildren = [...parent.childNodes].filter((node) => kept.has(node))
				expect(keptChildren, `${message}\nkept nodes keep their order in ${describe(parent)}`).toEqual(
					children.filter((node) => kept.has(node)),
				)
			}

			// Leaving out the kept nodes, the result matches the target.
			expect(serialize(root, kept), message).toBe(serialize(parse(scenario.to), new Set()))

			// Between two nodes that stayed put, the kept nodes come before the nodes the morph added or moved there.
			for (const parent of [root, ...root.querySelectorAll("li")]) {
				let placedBefore: Node | null = null
				for (const node of parent.childNodes) {
					if (isWhitespace(node)) continue
					if (kept.has(node)) {
						expect(placedBefore, `${message}\nkept ${describe(node)} comes after ${describe(placedBefore)}`).toBe(null)
					} else if (added.has(node)) {
						placedBefore = node
					} else {
						placedBefore = null
					}
				}
			}
		} finally {
			host.remove()
		}
	}
})

// The items of each side come from one pool, so the sides share some, and the target changes some of the ones it takes.
function createScenario(random: Random) {
	const itemIds = shuffle(random, ITEM_IDS)
	const childIds = shuffle(random, CHILD_IDS)
	const pool = Array.from({ length: randomInt(random, 1, 8) }, () => createItem(random, itemIds, childIds))
	const whitespace = random() < 0.5 ? "\n\t" : ""
	const list = (items: Array<Item>) => `<ul>${whitespace}${items.map((item) => serializeItem(item, whitespace)).join("")}</ul>`
	const from = shuffle(random, pool).slice(0, randomInt(random, 0, pool.length))
	const to = shuffle(random, pool)
		.slice(0, randomInt(random, 0, pool.length))
		.map((item) => (item.kind === "item" && random() < 0.3 ? changeItem(random, item, childIds) : item))

	return { from: list(from), to: list(to) }
}

function createItem(random: Random, itemIds: Array<string>, childIds: Array<string>): Item {
	const kind = random()
	if (kind < 0.15) return { kind: "text", value: pick(random, LABELS) }
	if (kind < 0.25) return { kind: "comment", value: pick(random, LABELS) }
	return {
		kind: "item",
		id: random() < 0.6 ? (itemIds.pop() ?? "") : "",
		label: pick(random, LABELS),
		children: createChildren(random, childIds),
	}
}

function createChildren(random: Random, childIds: Array<string>): Array<Child> {
	return Array.from({ length: randomInt(random, 0, 3) }, () => ({
		id: random() < 0.5 ? (childIds.pop() ?? "") : "",
		label: pick(random, LABELS),
	}))
}

// A changed item keeps its id, and its nested children can trade places with others or go.
function changeItem(random: Random, item: Item & { kind: "item" }, childIds: Array<string>): Item {
	const children = random() < 0.5 ? shuffle(random, item.children).slice(0, randomInt(random, 0, item.children.length)) : []
	return { ...item, label: pick(random, LABELS), children: [...children, ...createChildren(random, childIds)] }
}

function serializeItem(item: Item, whitespace: string): string {
	if (item.kind === "text") return `${item.value}${whitespace}`
	if (item.kind === "comment") return `<!--${item.value}-->${whitespace}`
	const children = item.children.map(({ id, label }) => `<span${id ? ` id="${id}"` : ""}>${label}</span>`).join(whitespace)
	return `<li${item.id ? ` id="${item.id}"` : ""}>${item.label}${children}</li>${whitespace}`
}

// The tree without whitespace and the given nodes, which keeps the text of adjacent text nodes apart.
function serialize(node: Node, without: Set<Node>): string {
	if (node.nodeType === Node.TEXT_NODE) return `"${node.nodeValue}"`
	if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.nodeValue}-->`
	const element = node as Element
	const children = [...element.childNodes].filter((child) => !without.has(child) && !isWhitespace(child))
	return `<${element.localName}${element.id ? `#${element.id}` : ""}>${children.map((child) => serialize(child, without)).join("")}</>`
}

function describe(node: Node | null): string {
	if (!node) return "nothing"
	if (node.nodeType === Node.ELEMENT_NODE) return (node as Element).outerHTML
	return node.nodeType === Node.COMMENT_NODE ? `<!--${node.nodeValue}-->` : `"${node.nodeValue}"`
}

function* allNodes(node: Node): Generator<Node> {
	for (const child of node.childNodes) {
		yield child
		yield* allNodes(child)
	}
}

function isWhitespace(node: Node): boolean {
	return node.nodeType === Node.TEXT_NODE && node.nodeValue!.trim() === ""
}

function parse(html: string): Element {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild!
}

function shuffle<T>(random: Random, items: ReadonlyArray<T>): Array<T> {
	const copy = [...items]
	for (let index = copy.length - 1; index > 0; index--) {
		const swapIndex = Math.floor(random() * (index + 1))
		;[copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!]
	}
	return copy
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
