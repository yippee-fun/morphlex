import { defineConfig, mergeConfig } from "vitest/config"
import base from "./vitest.config.ts"

// Merging adds these instances to the base config's Chromium.
export default mergeConfig(
	base,
	defineConfig({
		test: {
			browser: {
				instances: [{ browser: "firefox" }, { browser: "webkit" }],
			},
		},
	}),
)
