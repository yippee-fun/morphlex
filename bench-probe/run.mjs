// usage: node run.mjs --variants main,cand [--libs] [--rounds 11] [--filter regex] [--profile variant:scenario]
import { chromium } from "playwright"
import { readFileSync, writeFileSync } from "node:fs"
const dir = new URL(".", import.meta.url).pathname
const args = process.argv.slice(2)
const arg = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const variants = arg("--variants", "main").split(",")
const rounds = Number(arg("--rounds", "31"))
const filter = new RegExp(arg("--filter", "."))
const libs = args.includes("--libs")
const profile = arg("--profile", null)
const browser = await chromium.launch({ args: ["--js-flags=--expose-gc"], executablePath: process.env.CHROME_PATH || undefined })
const page = await browser.newPage()
await page.setContent("<!doctype html><html><body></body></html>")
for (const v of variants) await page.addScriptTag({ content: readFileSync(`${dir}v/${v}.js`, "utf8").replace(/^var \w+ =/, `window["V_${v}"] =`) })
if (libs) { await page.addScriptTag({ content: readFileSync(`${dir}v/morphdom.js`, "utf8") }); await page.addScriptTag({ content: readFileSync(`${dir}v/idiomorph.js`, "utf8") }) }
await page.addScriptTag({ content: readFileSync(`${dir}scenarios.js`, "utf8") })
await page.evaluate(({ variants, libs }) => {
	const impls = {}
	for (const v of variants) impls[v] = (f, t, o) => window[`V_${v}`].morph(f, t, o)
	if (libs) { impls.morphdom = (f, t) => window.morphdom(f, t); impls.idiomorph = (f, t) => window.Idiomorph.morph(f, t) }
	window.IMPLS = impls
	const host = document.createElement("div"); document.body.append(host)
	const parse = (html) => { const t = document.createElement("template"); t.innerHTML = html; return t.content.firstElementChild }
	window.prepare = (s, k) => {
		host.replaceChildren()
		const pairs = []
		for (let i = 0; i < k; i++) {
			const box = document.createElement("div"); box.innerHTML = s.from; host.append(box)
			const from = box.firstElementChild; if (s.setup) s.setup(from)
			pairs.push([from, parse(s.to)])
		}
		return pairs
	}
	window.timeOnce = (impl, s, k) => {
		const pairs = window.prepare(s, k)
		const f = IMPLS[impl]
		window.gc()
		const t0 = performance.now()
		for (const [a, b] of pairs) f(a, b, s.options)
		const t = performance.now() - t0
		// sanity: compare result
		const ok = pairs[0][0].outerHTML.replace(/ morphlex-dirty=""/g, "")
		return { t: t / k, ok }
	}
}, { variants, libs })
const names = await page.evaluate(() => SCENARIOS.map((s) => s.name))
const impls = await page.evaluate(() => Object.keys(IMPLS))
if (profile) {
	const [impl, scen] = profile.split(":")
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 50 })
	await page.evaluate(({ impl, scen }) => { const s = SCENARIOS.find((s) => s.name === scen); for (let i = 0; i < 3; i++) timeOnce(impl, s, 5) }, { impl, scen })
	await cdp.send("Profiler.start")
	await page.evaluate(({ impl, scen }) => { const s = SCENARIOS.find((s) => s.name === scen); for (let i = 0; i < 20; i++) timeOnce(impl, s, 5) }, { impl, scen })
	const { profile: p } = await cdp.send("Profiler.stop")
	writeFileSync(`${dir}profile.cpuprofile`, JSON.stringify(p))
	const self = new Map(); const byId = new Map(p.nodes.map((n) => [n.id, n]))
	const dt = {}; p.samples.forEach((id, i) => { dt[id] = (dt[id] || 0) + (p.timeDeltas[i] || 0) })
	let total = 0
	for (const n of p.nodes) { const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber + 1}`; const v = dt[n.id] || 0; total += v; self.set(k, (self.get(k) || 0) + v) }
	// inclusive
	const incl = new Map()
	const walk = (n, stack) => { const k = `${n.callFrame.functionName || "(anon)"}:${n.callFrame.lineNumber + 1}`; let sum = dt[n.id] || 0; const st = new Set(stack); st.add(k); for (const c of n.children || []) sum += walk(byId.get(c), st); if (!stack.has(k)) incl.set(k, (incl.get(k) || 0) + sum); return sum }
	walk(p.nodes[0], new Set())
	console.log("SELF"); [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log((v / total * 100).toFixed(1).padStart(5) + "% " + k))
	console.log("INCLUSIVE"); [...incl].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log((v / total * 100).toFixed(1).padStart(5) + "% " + k))
	await browser.close(); process.exit(0)
}
const results = {}; const RAW = {}; const T0 = Date.now()
for (const name of names.filter((n) => filter.test(n))) {
	// calibrate k so a batch takes ~40ms on first impl
	let k = 1
	for (;;) { const { t } = await page.evaluate(({ i, n, k }) => timeOnce(i, SCENARIOS.find((s) => s.name === n), k), { i: impls[0], n: name, k }); if (t * k > 15 || k >= 200) break; k = Math.min(200, Math.ceil(k * Math.max(2, 15 / Math.max(t * k, 0.5)))) }
	const samples = Object.fromEntries(impls.map((i) => [i, []]))
	const outs = {}
	for (let r = 0; r < rounds; r++) for (const i of (r % 2 ? impls.slice().reverse() : impls)) {
		const { t, ok } = await page.evaluate(({ i, n, k }) => timeOnce(i, SCENARIOS.find((s) => s.name === n), k), { i, n: name, k })
		samples[i].push(t); outs[i] = ok
	}
	const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 4)] }
	RAW[name] = samples; results[name] = Object.fromEntries(impls.map((i) => [i, med(samples[i])]))
	const base = results[name][impls[0]]
	const mismatch = variants.filter((v) => outs[v] !== outs[variants[0]])
	console.log(name.padEnd(32) + impls.map((i) => `${i} ${results[name][i].toFixed(3)}ms${i === impls[0] ? "" : ` (${((results[name][i] / base - 1) * 100).toFixed(0)}%)`}`).join("  ") + (mismatch.length ? `  OUTPUT DIFFERS: ${mismatch}` : ""))
}
writeFileSync(`${dir}raw.json`, JSON.stringify(RAW))
console.log("elapsed", (Date.now() - T0) / 1000, "s"); await browser.close()
