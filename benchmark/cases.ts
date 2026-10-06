// Runs in the browser: `run.ts` bundles this file and calls `runBenchmarks` in a Chromium page.
import { morph, type Options } from "../src/morphlex.ts"

type BenchmarkCase = {
	name: string
	from: string
	to: string
	iterations?: number
	weight?: number
	options?: Options
	setup?: (from: ChildNode, to: ChildNode) => void
}

export type BenchmarkResult = {
	name: string
	weight: number
	iterations: number
	mean: number
	median: number
	p95: number
	min: number
	max: number
	opsPerSecond: number
	total: number
}

export type RunOptions = {
	iterations: number
	warmup: number
	repeats: number
}

const noopOptions: Options = {
	beforeNodeVisited: () => true,
	afterNodeVisited: () => {},
	beforeNodeAdded: () => true,
	afterNodeAdded: () => {},
	beforeNodeRemoved: () => true,
	afterNodeRemoved: () => {},
	beforeAttributeUpdated: () => true,
	afterAttributeUpdated: () => {},
	beforeChildrenVisited: () => true,
	afterChildrenVisited: () => {},
}

function buildIdRelatedCards(count: number, reverseOrder: boolean, updatedText: boolean): string {
	const indices = Array.from({ length: count }, (_, i) => i)
	if (reverseOrder) indices.reverse()

	return indices
		.map((i) => {
			const next = (i + 1) % count
			return `<article data-card="${i}"><h3 id="card-${i}">Card ${i}</h3><a href="#card-${next}" name="card-link-${i}">Next</a><p>${updatedText ? `Card ${i} updated` : `Card ${i}`}</p></article>`
		})
		.join("")
}

function buildPartiallyReorderedList(count: number, shift: number): string {
	const indices = Array.from({ length: count }, (_, i) => i)
	const rotated = indices.slice(shift).concat(indices.slice(0, shift))
	return rotated.map((i) => `<li id="row-${i}">Row ${i}</li>`).join("")
}

function buildDeepNestedIdTrees(count: number, depth: number, reverseOrder: boolean, updatedText: boolean): string {
	const indices = Array.from({ length: count }, (_, i) => i)
	if (reverseOrder) indices.reverse()

	return indices
		.map((i) => {
			const next = (i + 1) % count
			let nested = `<span id="deep-id-${i}">Node ${i}${updatedText ? " updated" : ""}</span><a href="#deep-id-${next}">Next</a>`
			for (let d = 0; d < depth; d++) {
				nested = `<div data-depth="${d}" data-key="${i}-${d}">${nested}</div>`
			}
			return `<article data-chain="${i}">${nested}</article>`
		})
		.join("")
}

const benchmarkCases: Array<BenchmarkCase> = [
	{
		name: "text-update",
		from: "<div>Hello world</div>",
		to: "<div>Goodbye world</div>",
		weight: 1,
	},
	{
		name: "attribute-churn",
		from: '<div class="a" data-mode="old" aria-hidden="true">Content</div>',
		to: '<div class="b" data-mode="new" title="fresh">Content</div>',
		weight: 1,
	},
	{
		name: "append-children",
		from: "<ul><li>One</li></ul>",
		to: "<ul><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>",
		weight: 1,
	},
	{
		name: "remove-children",
		from: "<ul><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>",
		to: "<ul><li>One</li></ul>",
		weight: 1,
	},
	{
		name: "reorder-with-ids-20",
		from: `<ul>${Array.from({ length: 20 }, (_, i) => `<li id="item-${i}">Item ${i}</li>`).join("")}</ul>`,
		to: `<ul>${Array.from({ length: 20 }, (_, i) => `<li id="item-${19 - i}">Item ${19 - i}</li>`).join("")}</ul>`,
		weight: 2,
	},
	{
		name: "large-list-update-200",
		from: `<div>${Array.from({ length: 200 }, (_, i) => `<p id="row-${i}">Row ${i}</p>`).join("")}</div>`,
		to: `<div>${Array.from({ length: 200 }, (_, i) => `<p id="row-${i}">Row ${i} updated</p>`).join("")}</div>`,
		iterations: 400,
		weight: 3,
	},
	{
		name: "mixed-structure",
		from: '<section><h1 id="title">Title</h1><p>Body</p><footer><a href="#">Link</a></footer></section>',
		to: '<section><h1 id="title">Title 2</h1><p>Body updated</p><aside>Side</aside><footer><a href="/x">Link</a></footer></section>',
		weight: 2,
	},
	{
		name: "partial-reorder-with-ids-100",
		from: `<ul>${buildPartiallyReorderedList(100, 0)}</ul>`,
		to: `<ul>${buildPartiallyReorderedList(100, 30)}</ul>`,
		iterations: 350,
		weight: 3,
	},
	{
		name: "idset-matching-related-cards-60",
		from: `<section>${buildIdRelatedCards(60, false, false)}</section>`,
		to: `<section>${buildIdRelatedCards(60, true, true)}</section>`,
		iterations: 350,
		weight: 3,
	},
	{
		name: "deep-id-ancestry-40x8",
		from: `<section>${buildDeepNestedIdTrees(40, 8, false, false)}</section>`,
		to: `<section>${buildDeepNestedIdTrees(40, 8, true, true)}</section>`,
		iterations: 300,
		weight: 3,
	},
	{
		name: "dirty-form-text-inputs-60",
		from: `<form>${Array.from({ length: 60 }, (_, i) => `<input name="field-${i}" value="value-${i}">`).join("")}</form>`,
		to: `<form>${Array.from({ length: 60 }, (_, i) => `<input name="field-${i}" value="new-${i}" data-next="1">`).join("")}</form>`,
		iterations: 500,
		weight: 1,
		setup: (from) => {
			const textInputs = (from as Element).querySelectorAll("input[name^='field-']")
			for (let i = 0; i < textInputs.length; i++) {
				const input = textInputs[i] as HTMLInputElement
				input.value = `${input.value}-dirty`
			}
		},
	},
	{
		name: "dirty-form-checkboxes-60",
		from: `<form>${Array.from({ length: 60 }, (_, i) => `<input type="checkbox" name="check-${i}" ${i % 3 === 0 ? "checked" : ""}>`).join("")}</form>`,
		to: `<form>${Array.from({ length: 60 }, (_, i) => `<input type="checkbox" name="check-${i}" ${i % 5 === 0 ? "checked" : ""}>`).join("")}</form>`,
		iterations: 500,
		weight: 1,
		setup: (from) => {
			const checkboxes = (from as Element).querySelectorAll("input[type='checkbox']")

			for (let i = 0; i < checkboxes.length; i++) {
				if (i % 4 === 0) {
					const checkbox = checkboxes[i] as HTMLInputElement
					checkbox.checked = !checkbox.checked
				}
			}
		},
	},
	{
		name: "hooks-mixed-structure",
		from: '<section><h1 id="title">Title</h1><p>Body</p><footer><a href="#">Link</a></footer></section>',
		to: '<section><h1 id="title">Title 2</h1><p>Body updated</p><aside>Side</aside><footer><a href="/x">Link</a></footer></section>',
		options: noopOptions,
		weight: 2,
	},
]

function createElement(html: string): ChildNode {
	const template = document.createElement("template")
	template.innerHTML = html
	const node = template.content.firstChild
	if (!node) throw new Error("Invalid benchmark fixture")
	return node
}

function runCase(testCase: BenchmarkCase, options: RunOptions): BenchmarkResult {
	const fromTemplate = createElement(testCase.from)
	const toTemplate = createElement(testCase.to)
	const iterations = testCase.iterations ?? options.iterations
	const times: Array<number> = []
	const morphOptions = testCase.options ?? {}

	for (let i = 0; i < options.warmup; i++) {
		const from = fromTemplate.cloneNode(true) as ChildNode
		const to = toTemplate.cloneNode(true) as ChildNode
		testCase.setup?.(from, to)
		morph(from, to, morphOptions)
	}

	for (let i = 0; i < iterations; i++) {
		const from = fromTemplate.cloneNode(true) as ChildNode
		const to = toTemplate.cloneNode(true) as ChildNode
		testCase.setup?.(from, to)
		const start = performance.now()
		morph(from, to, morphOptions)
		const end = performance.now()
		times.push(end - start)
	}

	times.sort((a, b) => a - b)
	let total = 0
	for (let i = 0; i < times.length; i++) total += times[i]!

	const mean = total / times.length
	const median = times[Math.floor(times.length / 2)] ?? 0
	const p95 = times[Math.floor(times.length * 0.95)] ?? 0
	const min = times[0] ?? 0
	const max = times[times.length - 1] ?? 0
	const opsPerSecond = mean > 0 ? 1000 / mean : 0

	return {
		name: testCase.name,
		weight: testCase.weight ?? 1,
		iterations,
		mean,
		median,
		p95,
		min,
		max,
		opsPerSecond,
		total,
	}
}

export function runBenchmarks(options: RunOptions): Array<Array<BenchmarkResult>> {
	const runs: Array<Array<BenchmarkResult>> = []
	for (let repeat = 0; repeat < options.repeats; repeat++) {
		runs.push(benchmarkCases.map((testCase) => runCase(testCase, options)))
	}
	return runs
}
