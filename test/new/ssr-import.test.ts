import { test, expect, vi } from "vitest"

// morphlex feature-detects `"moveBefore" in Element.prototype` at module
// scope. In a DOM-less environment (bare Node / SSR) `Element` is undefined,
// so evaluating that expression on import throws `ReferenceError: Element is
// not defined` before any morph function is called. Guarding the detect with
// `typeof Element !== "undefined"` keeps the module importable there (morph
// still needs a real DOM to run — this only protects the import).
test("imports without a DOM (SSR-safe module evaluation)", async () => {
	vi.stubGlobal("Element", undefined)
	vi.resetModules()
	try {
		const mod = await import("../../src/morphlex")
		expect(typeof mod.morph).toBe("function")
		expect(typeof mod.morphInner).toBe("function")
	} finally {
		vi.unstubAllGlobals()
		vi.resetModules()
	}
})
