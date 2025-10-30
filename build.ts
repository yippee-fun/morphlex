import { build } from "bun"
import { $ } from "bun"

// Build and minify with Bun
await build({
	entrypoints: ["./src/morphlex.ts"],
	outdir: "./dist",
	minify: true,
	sourcemap: "external",
	naming: "[dir]/[name].min.[ext]",
})

// Generate TypeScript declarations (skip lib check to avoid node type errors)
await $`tsc --emitDeclarationOnly --declaration --outDir dist --skipLibCheck`

console.log("Build complete")
