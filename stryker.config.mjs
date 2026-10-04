/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
	testRunner: "vitest",
	vitest: { configFile: "vitest.config.ts" },
	mutate: ["src/morphlex.ts"],
	coverageAnalysis: "perTest",
	reporters: ["clear-text", "progress", "html", "json"],
	incremental: true,
	incrementalFile: "reports/stryker-incremental.json",
	// Stryker rewrites the tsconfig with the TypeScript 5 API, which TypeScript 7 doesn't have.
	// Our tsconfig has no paths outside the project to rewrite, so point it at a file that doesn't exist.
	tsconfigFile: "tsconfig.stryker-none.json",
	// The run fails below `break`. Raise it as surviving mutants are killed.
	thresholds: { high: 95, low: 85, break: 80 },
}
