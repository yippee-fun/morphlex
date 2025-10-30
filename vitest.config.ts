import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		environment: "happy-dom",
		globals: true,
		testTimeout: 10000,
		hookTimeout: 10000,
	},
})
