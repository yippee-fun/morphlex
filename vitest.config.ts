import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "happy-dom",
		globals: true,
		// These generate trees that happy-dom can't parse and serialize faithfully, so they only run in real browsers.
		exclude: [
			...configDefaults.exclude,
			"test/new/tree-fuzz.browser.test.ts",
			"test/new/move-fuzz.browser.test.ts",
			"test/new/exhaustive.browser.test.ts",
			// happy-dom loses a select's selection when options are inserted or moved.
			"test/new/choice-fuzz.browser.test.ts",
		],
		testTimeout: 10000,
		hookTimeout: 10000,
		coverage: {
			include: ["src/morphlex.ts"],
			thresholds: { 100: true },
		},
	},
})
