import { expect, onTestFinished, test } from "vitest"
import { morph } from "../../src/morphlex"

// A checked radio that a form id change moves into another group joins it as when parsing, so the last
// radio the markup checks there stays checked.

test("a user-checked radio moved into another group by a form id change leaves that group's later radio checked", () => {
	const host = document.createElement("section")
	host.innerHTML = `<form id="f1"><input checked name="a" form="f2" type="radio" value="3" id="c1"></form><input value="3" checked id="c3" type="radio" name="a"><form id="f2"></form>`
	document.body.append(host)
	onTestFinished(() => host.remove())
	host.querySelector<HTMLInputElement>("#c1")!.checked = true

	morph(
		host,
		`<section><form id="f1"><input form="f2" id="c1" name="a" value="3" type="radio" checked></form><input name="a" value="3" checked id="c3" type="radio"><form id="f9"></form></section>`,
	)

	expect(host.querySelector<HTMLInputElement>("#c1")!.checked).toBe(false)
	expect(host.querySelector<HTMLInputElement>("#c3")!.checked).toBe(true)
})
