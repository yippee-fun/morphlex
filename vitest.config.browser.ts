import { defineConfig } from "vitest/config"
import { playwright } from "@vitest/browser-playwright"

export default defineConfig({
	test: {
		browser: {
			enabled: true,
			provider: playwright(),
			instances: [
				{
					browser: "chromium",
				},
				{
					browser: "firefox",
				},
				{
					browser: "webkit",
				},
			],
			// Enable headless mode by default, can be overridden with --browser.headless=false
			headless: true,
			// Screenshot on failure
			screenshotFailures: true,
		},
		// Increase timeouts for browser tests
		testTimeout: 30000,
		hookTimeout: 30000,
		// Don't use globals in browser tests to avoid pollution
		globals: false,
		// Retry failed tests once in browser mode
		retry: 1,
		// Include only browser-specific tests
		include: ["test/**/*.browser.test.ts"],
	},
})
