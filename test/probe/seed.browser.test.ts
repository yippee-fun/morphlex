// @ts-nocheck
/* oxlint-disable */
// Temporary: traces move-fuzz seed 37194942587 in each browser.
import { test as base } from "vitest"
import { morph } from "../../src/morphlex"
const test = base.skipIf(navigator.userAgent.includes("HappyDOM"))

test("PROBE seed 37194942587", () => {
	const fromHtml = `<div id="root"><section><input id="i0" type="radio" name="s" checked=""><input id="i1" type="hidden"><form id="i2"><textarea class="b"></textarea></form></section><form id="i5"><input id="i3" type="radio" name="r" checked=""><input id="i4" type="radio" name="r" checked=""></form><form><input id="i6" type="radio" name="r" checked=""><input id="i7" type="radio" name="r" checked=""></form></div>`
	const toHtml = `<div id="root"><input id="i4" type="radio" name="r" checked=""><form id="i2"><textarea class="b"></textarea><section><input id="i0" type="radio" name="s" checked=""><input id="i1" type="hidden"></section></form><form id="i5"><input id="i3" type="radio" name="r" checked=""></form><form><input id="i6" type="radio" name="r" checked=""><input id="i7" type="radio" name="r" checked=""></form></div>`
	const t = document.createElement("template")
	t.innerHTML = fromHtml
	const host = document.createElement("div")
	host.append(t.content)
	document.body.append(host)
	host.insertAdjacentHTML("beforebegin", `<input type="radio" name="r" form="i2" checked>`)
	const y = host.previousElementSibling
	const lines = []
	const st = () => `y ${y.checked}/${y.getAttribute("checked")} owner ${y.form?.id ?? "-"}`
	const d = (n) => (n ? n.nodeName + (n.id ? "#" + n.id : "") : "null")
	const restore = []
	for (const [proto, name] of [
		[Node.prototype, "insertBefore"],
		[Element.prototype, "moveBefore"],
		[Node.prototype, "removeChild"],
		[Node.prototype, "replaceChild"],
		[Element.prototype, "remove"],
		[CharacterData.prototype, "remove"],
		[Element.prototype, "setAttribute"],
		[Element.prototype, "removeAttribute"],
	]) {
		const orig = proto[name]
		if (!orig) continue
		proto[name] = function (...args) {
			const pre = st()
			const r = orig.apply(this, args)
			lines.push(`${name} ${d(this)} ${args.map((a) => (typeof a === "string" ? a : d(a))).join(" ")} | ${pre} -> ${st()}`)
			return r
		}
		restore.push(() => (proto[name] = orig))
	}
	const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")
	Object.defineProperty(HTMLInputElement.prototype, "checked", {
		configurable: true,
		get: desc.get,
		set(v) {
			const pre = st()
			desc.set.call(this, v)
			lines.push(`checked ${d(this)}${this === y ? "(y)" : ""} = ${v} | ${pre} -> ${st()}`)
		},
	})
	restore.push(() => Object.defineProperty(HTMLInputElement.prototype, "checked", desc))
	const t2 = document.createElement("template")
	t2.innerHTML = toHtml
	try {
		morph(host.firstChild, t2.content.firstElementChild)
	} finally {
		for (const r of restore) r()
	}
	console.log(`PROBE final ${st()}\n${lines.join("\n")}`)
	y.remove()
	host.remove()
})
