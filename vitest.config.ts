import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"

// Tests run in Chromium, which is also where coverage is measured. `vitest.config.browser.ts` adds Firefox and WebKit.
export default defineConfig({
	test: {
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [{ browser: "chromium" }],
			// Enable headless mode by default, can be overridden with --browser.headless=false
			headless: true,
			// Screenshot on failure
			screenshotFailures: true,
		},
		include: ["test/**/*.test.ts"],
		testTimeout: 30000,
		hookTimeout: 30000,
		// Don't use globals in browser tests to avoid pollution
		globals: false,
		// Retry failed tests once in browser mode
		retry: 1,
		coverage: {
			include: ["src/morphlex.ts"],
			thresholds: { 100: true },
		},
	},
})
