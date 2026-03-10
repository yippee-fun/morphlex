import { expect, test } from "vitest"
import { morph, morphDocument } from "../../src/morphlex"
import { dom } from "./utils"

import appBefore from "./fixtures/app-before.html?raw"
import appAfter from "./fixtures/app-after.html?raw"
import documentBefore from "./fixtures/document-before.html?raw"
import documentAfter from "./fixtures/document-after.html?raw"

test("morph updates a large application shell", () => {
	const from = dom(appBefore)
	const to = dom(appAfter)

	morph(from, to)

	expect(from.getAttribute("data-view")).toBe("release")
	expect(from.querySelector("[data-status='live']")?.textContent).toContain("Live")
	expect(Array.from(from.querySelectorAll("nav a"), (link) => link.getAttribute("href"))).toEqual([
		"/overview",
		"/releases",
		"/insights",
		"/settings",
	])
	expect(from.querySelectorAll("[data-card]")).toHaveLength(3)
	expect(Array.from(from.querySelectorAll("[data-card]"), (card) => card.getAttribute("data-card"))).toEqual([
		"beta",
		"alpha",
		"gamma",
	])
	expect(from.querySelector("[data-card='gamma'] h3")?.textContent).toBe("Support handoff")
	expect(from.querySelector("form")?.getAttribute("aria-busy")).toBe("false")
	expect(from.querySelector("textarea")?.textContent).toContain("Monitoring errors")
	expect(from.querySelector("footer p")?.textContent).toBe("Last synced 14:30 UTC")
})

test("morphDocument updates a large full document", () => {
	const parser = new DOMParser()
	const from = parser.parseFromString(documentBefore, "text/html")
	const to = parser.parseFromString(documentAfter, "text/html")

	morphDocument(from, to)

	expect(from.title).toBe("Morphlex Product Release")
	expect(from.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
		"Launch release notes and product overview for Morphlex.",
	)
	expect(from.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://example.com/product")
	expect(from.body.getAttribute("data-page")).toBe("product")
	expect(Array.from(from.querySelectorAll("header nav a"), (link) => link.getAttribute("href"))).toEqual([
		"/product",
		"/benchmarks",
		"/docs",
		"/blog",
	])
	expect(Array.from(from.querySelectorAll("#highlights > article"), (article) => article.id)).toEqual([
		"feature-safe",
		"feature-fast",
		"feature-tested",
	])
	expect(Array.from(from.querySelectorAll("#timeline li"), (item) => item.textContent?.trim())).toEqual([
		"Launch notes published",
		"Benchmarks verified",
		"Examples expanded",
	])
	expect(from.querySelectorAll("main article")).toHaveLength(4)
	expect(from.querySelector("#stories h3")?.textContent).toBe("Coverage")
	expect(from.querySelector("footer small")?.textContent).toContain("2026")
})
