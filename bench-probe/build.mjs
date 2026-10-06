// usage: node build.mjs <src.ts> <out.js> <globalName>
import { build } from "rolldown"
import { resolve } from "node:path"
const [src, out, name] = process.argv.slice(2)
await build({ input: resolve(src), platform: "browser", transform: { target: "es2022" }, output: { file: resolve(out), format: "iife", name } })
