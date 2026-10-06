import { chromium } from "playwright"
import { build } from "rolldown"
import type { BenchmarkResult, RunOptions } from "./cases.ts"

type CliOptions = RunOptions & {
	thorough: boolean
	json: boolean
}

type BenchmarkSummary = {
	weightedMedianMs: number
	weightedP95Ms: number
	totalMeasuredMs: number
	trimmedMeanMs: number
}

const DEFAULT_ITERATIONS = 1500
const DEFAULT_WARMUP = 250

function parseOptions(argv: Array<string>): CliOptions {
	let iterations = DEFAULT_ITERATIONS
	let warmup = DEFAULT_WARMUP
	let thorough = false
	let json = false
	let repeats = 1

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
			continue
		}

		if (arg === "--repeats") {
			const value = Number(argv[i + 1])
			if (Number.isFinite(value) && value > 0) {
				repeats = Math.floor(value)
				i++
			}
		}
	}

	if (thorough) {
		iterations = Math.max(iterations, 5000)
		warmup = Math.max(warmup, 1000)
	}

	return { iterations, warmup, thorough, json, repeats }
}

function median(numbers: Array<number>): number {
	if (numbers.length === 0) return 0
	const sorted = [...numbers].sort((a, b) => a - b)
	return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function summarizeResults(results: Array<BenchmarkResult>): BenchmarkSummary {
	let totalWeight = 0
	let weightedMedianMs = 0
	let weightedP95Ms = 0
	let totalMeasuredMs = 0
	let weightedTrimmedMeanMs = 0

	for (let i = 0; i < results.length; i++) {
		const result = results[i]!
		const weight = result.weight
		const trimmedMean = Math.min(result.p95, result.mean)

		totalWeight += weight
		weightedMedianMs += result.median * weight
		weightedP95Ms += result.p95 * weight
		weightedTrimmedMeanMs += trimmedMean * weight
		totalMeasuredMs += result.total
	}

	if (totalWeight === 0) {
		return {
			weightedMedianMs: 0,
			weightedP95Ms: 0,
			totalMeasuredMs,
			trimmedMeanMs: 0,
		}
	}

	return {
		weightedMedianMs: weightedMedianMs / totalWeight,
		weightedP95Ms: weightedP95Ms / totalWeight,
		totalMeasuredMs,
		trimmedMeanMs: weightedTrimmedMeanMs / totalWeight,
	}
}

function aggregateResults(runs: Array<Array<BenchmarkResult>>): Array<BenchmarkResult> {
	if (runs.length === 0) return []

	const caseCount = runs[0]!.length
	const aggregated: Array<BenchmarkResult> = []

	for (let caseIndex = 0; caseIndex < caseCount; caseIndex++) {
		const samples = runs.map((run) => run[caseIndex]!)
		const first = samples[0]!

		aggregated.push({
			name: first.name,
			weight: first.weight,
			iterations: first.iterations,
			mean: median(samples.map((sample) => sample.mean)),
			median: median(samples.map((sample) => sample.median)),
			p95: median(samples.map((sample) => sample.p95)),
			min: median(samples.map((sample) => sample.min)),
			max: median(samples.map((sample) => sample.max)),
			opsPerSecond: median(samples.map((sample) => sample.opsPerSecond)),
			total: median(samples.map((sample) => sample.total)),
		})
	}

	return aggregated
}

function printTable(results: Array<BenchmarkResult>, options: CliOptions): void {
	const rows = results.map((result) => ({
		benchmark: result.name,
		weight: String(result.weight),
		iterations: String(result.iterations),
		mean: `${result.mean.toFixed(4)}ms`,
		median: `${result.median.toFixed(4)}ms`,
		p95: `${result.p95.toFixed(4)}ms`,
		trimmedMean: `${Math.min(result.p95, result.mean).toFixed(4)}ms`,
		ops: result.opsPerSecond.toFixed(1),
	}))

	const repeatLabel = options.repeats > 1 ? ` x${options.repeats} (median across runs)` : ""
	console.log(`Morphlex benchmark${options.thorough ? " (thorough)" : ""}${repeatLabel}`)
	console.table(rows)

	const summary = summarizeResults(results)
	console.log(`Weighted median: ${summary.weightedMedianMs.toFixed(4)}ms`)
	console.log(`Weighted p95: ${summary.weightedP95Ms.toFixed(4)}ms`)
	console.log(`Weighted trimmed mean: ${summary.trimmedMeanMs.toFixed(4)}ms`)
	console.log(`Total measured time: ${summary.totalMeasuredMs.toFixed(2)}ms`)
}

// The cases run in Chromium, since a real browser is what morphlex is for. The page is cross-origin isolated,
// because otherwise Chromium rounds `performance.now()` to 0.1ms, longer than many of the morphs take.
async function runInChromium(options: RunOptions): Promise<Array<Array<BenchmarkResult>>> {
	const bundle = await build({
		input: new URL("cases.ts", import.meta.url).pathname,
		platform: "browser",
		write: false,
		output: { format: "iife", name: "morphlexBenchmark" },
	})

	const browser = await chromium.launch()
	try {
		const page = await browser.newPage()
		const url = "http://localhost/"
		await page.route(url, (route) =>
			route.fulfill({
				contentType: "text/html",
				headers: { "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" },
				body: "<!doctype html><html><body></body></html>",
			}),
		)
		await page.goto(url)
		if (!(await page.evaluate(() => crossOriginIsolated))) throw new Error("The benchmark page isn't cross-origin isolated")
		await page.addScriptTag({ content: bundle.output[0].code })
		return await page.evaluate(
			(options) =>
				(window as unknown as { morphlexBenchmark: typeof import("./cases.ts") }).morphlexBenchmark.runBenchmarks(options),
			{ iterations: options.iterations, warmup: options.warmup, repeats: options.repeats },
		)
	} finally {
		await browser.close()
	}
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2))
	const results = aggregateResults(await runInChromium(options))

	if (options.json) {
		console.log(JSON.stringify({ options, summary: summarizeResults(results), results }, null, 2))
		return
	}

	printTable(results, options)
}

await main()
