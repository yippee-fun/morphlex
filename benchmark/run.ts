import { Window } from "happy-dom"

type BenchmarkCase = {
	name: string
	from: string
	to: string
	iterations?: number
}

type BenchmarkResult = {
	name: string
	iterations: number
	mean: number
	median: number
	p95: number
	min: number
	max: number
	opsPerSecond: number
	total: number
}

type CliOptions = {
	iterations: number
	warmup: number
	thorough: boolean
	json: boolean
}

const DEFAULT_ITERATIONS = 1500
const DEFAULT_WARMUP = 250

const window = new Window({
	url: "http://localhost",
})

Object.assign(window, {
	SyntaxError,
})

const globals: Record<string, unknown> = {
	window,
	document: window.document,
	Node: window.Node,
	Element: window.Element,
	NodeList: window.NodeList,
	DOMParser: window.DOMParser,
	DocumentFragment: window.DocumentFragment,
	HTMLInputElement: window.HTMLInputElement,
	HTMLOptionElement: window.HTMLOptionElement,
	HTMLTextAreaElement: window.HTMLTextAreaElement,
	performance: window.performance,
}

for (const [key, value] of Object.entries(globals)) {
	Object.assign(globalThis, { [key]: value })
}

const { morph } = await import("../src/morphlex")

const benchmarkCases: Array<BenchmarkCase> = [
	{
		name: "text-update",
		from: "<div>Hello world</div>",
		to: "<div>Goodbye world</div>",
	},
	{
		name: "attribute-churn",
		from: '<div class="a" data-mode="old" aria-hidden="true">Content</div>',
		to: '<div class="b" data-mode="new" title="fresh">Content</div>',
	},
	{
		name: "append-children",
		from: "<ul><li>One</li></ul>",
		to: "<ul><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>",
	},
	{
		name: "remove-children",
		from: "<ul><li>One</li><li>Two</li><li>Three</li><li>Four</li></ul>",
		to: "<ul><li>One</li></ul>",
	},
	{
		name: "reorder-with-ids-20",
		from: `<ul>${Array.from({ length: 20 }, (_, i) => `<li id="item-${i}">Item ${i}</li>`).join("")}</ul>`,
		to: `<ul>${Array.from({ length: 20 }, (_, i) => `<li id="item-${19 - i}">Item ${19 - i}</li>`).join("")}</ul>`,
	},
	{
		name: "large-list-update-200",
		from: `<div>${Array.from({ length: 200 }, (_, i) => `<p id="row-${i}">Row ${i}</p>`).join("")}</div>`,
		to: `<div>${Array.from({ length: 200 }, (_, i) => `<p id="row-${i}">Row ${i} updated</p>`).join("")}</div>`,
		iterations: 400,
	},
	{
		name: "mixed-structure",
		from: '<section><h1 id="title">Title</h1><p>Body</p><footer><a href="#">Link</a></footer></section>',
		to: '<section><h1 id="title">Title 2</h1><p>Body updated</p><aside>Side</aside><footer><a href="/x">Link</a></footer></section>',
	},
]

function parseOptions(argv: Array<string>): CliOptions {
	let iterations = DEFAULT_ITERATIONS
	let warmup = DEFAULT_WARMUP
	let thorough = false
	let json = false

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === "--thorough") {
			thorough = true
			continue
		}

		if (arg === "--json") {
			json = true
			continue
		}

		if (arg === "--iterations") {
			const value = Number(argv[i + 1])
			if (Number.isFinite(value) && value > 0) {
				iterations = Math.floor(value)
				i++
			}
			continue
		}

		if (arg === "--warmup") {
			const value = Number(argv[i + 1])
			if (Number.isFinite(value) && value >= 0) {
				warmup = Math.floor(value)
				i++
			}
		}
	}

	if (thorough) {
		iterations = Math.max(iterations, 5000)
		warmup = Math.max(warmup, 1000)
	}

	return { iterations, warmup, thorough, json }
}

function createElement(html: string): ChildNode {
	const template = document.createElement("template")
	template.innerHTML = html
	const node = template.content.firstChild
	if (!node) throw new Error("Invalid benchmark fixture")
	return node
}

function runCase(testCase: BenchmarkCase, options: CliOptions): BenchmarkResult {
	const fromTemplate = createElement(testCase.from)
	const toTemplate = createElement(testCase.to)
	const iterations = testCase.iterations ?? options.iterations
	const times: Array<number> = []

	for (let i = 0; i < options.warmup; i++) {
		const from = fromTemplate.cloneNode(true) as ChildNode
		const to = toTemplate.cloneNode(true) as ChildNode
		morph(from, to)
	}

	for (let i = 0; i < iterations; i++) {
		const from = fromTemplate.cloneNode(true) as ChildNode
		const to = toTemplate.cloneNode(true) as ChildNode
		const start = performance.now()
		morph(from, to)
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

function printTable(results: Array<BenchmarkResult>, options: CliOptions): void {
	const rows = results.map((result) => {
		return {
			benchmark: result.name,
			iterations: String(result.iterations),
			mean: `${result.mean.toFixed(4)}ms`,
			median: `${result.median.toFixed(4)}ms`,
			p95: `${result.p95.toFixed(4)}ms`,
			ops: result.opsPerSecond.toFixed(1),
		}
	})

	console.log(`Morphlex benchmark${options.thorough ? " (thorough)" : ""}`)
	console.table(rows)

	let totalMs = 0
	for (let i = 0; i < results.length; i++) totalMs += results[i]!.total
	console.log(`Total measured time: ${totalMs.toFixed(2)}ms`)
}

function main(): void {
	const options = parseOptions(process.argv.slice(2))
	const results: Array<BenchmarkResult> = []

	for (let i = 0; i < benchmarkCases.length; i++) {
		results.push(runCase(benchmarkCases[i]!, options))
	}

	if (options.json) {
		console.log(JSON.stringify({ options, results }, null, 2))
		return
	}

	printTable(results, options)
}

main()
