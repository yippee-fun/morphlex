import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

// Checks the package as it would be published. Run it after `aube run build`.

const pkg = JSON.parse(readFileSync("./package.json", "utf8"))
const errors: Array<string> = []

const packed = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { encoding: "utf8" }))
const files = new Set<string>(packed[0].files.map((file: { path: string }) => file.path))

for (const field of ["main", "types"]) {
	const path = pkg[field]
	if (!existsSync(path)) errors.push(`${field} points at ${path}, which the build didn't create`)
	if (!files.has(path)) errors.push(`${field} points at ${path}, which isn't in the packed tarball`)
}

const declarations = existsSync(pkg.types) ? readFileSync(pkg.types, "utf8") : ""
const module = existsSync(pkg.main) ? await import(`./${pkg.main}`) : {}

for (const name of ["morph", "morphInner", "morphDocument"]) {
	if (typeof module[name] !== "function") errors.push(`${pkg.main} doesn't export a ${name} function`)
	if (!declarations.includes(`export declare function ${name}(`)) errors.push(`${pkg.types} doesn't declare ${name}`)
}

if (errors.length > 0) {
	console.error(errors.join("\n"))
	process.exit(1)
}

console.log(`Package OK: ${files.size} files`)
