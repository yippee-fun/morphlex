import { execFile } from "node:child_process"
import { gzipSync } from "node:zlib"
import { statSync, readFileSync } from "node:fs"
import { promisify } from "node:util"
import { build } from "esbuild"

const execFileAsync = promisify(execFile)

const shared = {
	entryPoints: ["./src/morphlex.ts"],
	outdir: "./dist",
	bundle: true,
	format: "esm",
	sourcemap: true,
	platform: "browser",
	target: "es2022",
} as const

// `package.json` points `main` at the unminified build.
await build(shared)
await build({ ...shared, minify: true, outExtension: { ".js": ".min.js" } })

// Generate TypeScript declarations (skip lib check to avoid node type errors)
await execFileAsync("tsgo", ["--emitDeclarationOnly", "--declaration", "--outDir", "dist", "--skipLibCheck"])

// Calculate and display file sizes
const minifiedPath = "./dist/morphlex.min.js"
const minifiedSize = statSync(minifiedPath).size
const minifiedContent = readFileSync(minifiedPath)
const gzippedSize = gzipSync(new Uint8Array(minifiedContent)).length

console.log("Build complete")
console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`)
console.log(`Gzipped size: ${(gzippedSize / 1024).toFixed(2)} KB`)
