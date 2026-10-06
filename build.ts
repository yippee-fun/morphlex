import { execFile } from "node:child_process"
import { gzipSync } from "node:zlib"
import { statSync, readFileSync } from "node:fs"
import { promisify } from "node:util"
import { build } from "rolldown"

const execFileAsync = promisify(execFile)

const shared = {
	input: "./src/morphlex.ts",
	platform: "browser",
	transform: { target: "es2022" },
} as const

// `package.json` points `main` at the unminified build, which keeps its comments.
await build({ ...shared, output: { file: "./dist/morphlex.js", format: "esm", sourcemap: true } })
// Rolldown's minifier is oxc's, but it keeps annotation comments like `@__PURE__` unless told not to.
await build({
	...shared,
	output: { file: "./dist/morphlex.min.js", format: "esm", sourcemap: true, minify: true, comments: false },
})

// Generate TypeScript declarations (skip lib check to avoid node type errors)
await execFileAsync("tsc", ["--emitDeclarationOnly", "--declaration", "--outDir", "dist", "--skipLibCheck"])

// Calculate and display file sizes
const minifiedPath = "./dist/morphlex.min.js"
const minifiedSize = statSync(minifiedPath).size
const minifiedContent = readFileSync(minifiedPath)
const gzippedSize = gzipSync(new Uint8Array(minifiedContent)).length

console.log("Build complete")
console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)} KB`)
console.log(`Gzipped size: ${(gzippedSize / 1024).toFixed(2)} KB`)
