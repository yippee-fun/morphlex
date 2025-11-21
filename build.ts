import { build } from "bun"
import { $ } from "bun"
import { gzipSync } from "zlib"
import { statSync, readFileSync } from "fs"

// Build and minify with Bun
await build({
	entrypoints: ["./src/morphlex.ts"],
	outdir: "./dist",
	minify: true,
	sourcemap: "external",
	naming: "[dir]/[name].min.[ext]",
	target: "browser",
})

// Generate TypeScript declarations (skip lib check to avoid node type errors)
await $`tsgo --emitDeclarationOnly --declaration --outDir dist --skipLibCheck`

// Calculate and display file sizes
const minifiedPath = "./dist/morphlex.min.js"
const minifiedSize = statSync(minifiedPath).size
const minifiedContent = readFileSync(minifiedPath)
const gzippedSize = gzipSync(new Uint8Array(minifiedContent)).length

console.log("Build complete")
console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`)
console.log(`Gzipped size: ${(gzippedSize / 1024).toFixed(2)} KB`)
