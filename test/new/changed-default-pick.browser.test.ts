import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "./utils"

function radios(checked: string | null, attributes = ""): HTMLFormElement {
	return dom(
		`<form${attributes}>${["a", "b", "c"].map((v) => `<input type="radio" name="g" value="${v}"${v === checked ? " checked" : ""}>`).join("")}</form>`,
	) as HTMLFormElement
}

function select(selected: string | null, attributes = ""): HTMLFormElement {
	return dom(
		`<form${attributes}><select name="s">${["a", "b", "c"].map((v) => `<option value="${v}"${v === selected ? " selected" : ""}>${v}</option>`).join("")}</select></form>`,
	) as HTMLFormElement
}

function pickRadio(form: HTMLFormElement, value: string): void {
	form.querySelector<HTMLInputElement>(`[value="${value}"]`)!.click()
}

test("with preserveChanges, a radio the user picked stays checked when the markup checks another", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("c"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("b")
	expect(from.querySelector("[value=c]")!.hasAttribute("checked")).toBe(true)
	from.remove()
})

test("with preserveChanges, a radio the user picked stays checked when the markup first checks one", () => {
	const from = radios(null)
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("c"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, a radio the user picked stays checked through later morphs", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("c"), { preserveChanges: true })
	morph(from, radios("a"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, a radio the user picked stays checked when the markup's default is unchanged", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("a"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, an untouched radio group follows its markup", () => {
	const from = radios("a")

	morph(from, radios("c"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("c")
})

test("with preserveChanges, a radio group inside morphlex-clobber follows its markup", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("c", " morphlex-clobber"), { preserveChanges: true })

	expect(new FormData(from).get("g")).toBe("c")
	from.remove()
})

test("without preserveChanges, a radio group follows its markup", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(from, radios("c"))

	expect(new FormData(from).get("g")).toBe("c")
	from.remove()
})

test("with preserveChanges, an option the user picked stays selected when the markup selects another", () => {
	const from = select("a")
	from.querySelector("select")!.value = "b"

	morph(from, select("c"), { preserveChanges: true })

	expect(new FormData(from).get("s")).toBe("b")
	expect(from.querySelector("[value=c]")!.hasAttribute("selected")).toBe(true)
})

test("with preserveChanges, an option the user picked stays selected when the markup first selects one", () => {
	const from = select(null)
	from.querySelector("select")!.value = "b"

	morph(from, select("c"), { preserveChanges: true })

	expect(new FormData(from).get("s")).toBe("b")
})

test("with preserveChanges, an option the user picked in a multiple select stays selected when it becomes a drop-down", () => {
	const from = dom(
		`<form><select name="s" multiple><option value="a" selected>a</option><option value="b">b</option><option value="c">c</option></select></form>`,
	) as HTMLFormElement
	from.querySelector<HTMLOptionElement>("[value=b]")!.selected = true

	morph(from, select("c"), { preserveChanges: true })

	expect(new FormData(from).getAll("s")).toEqual(["b"])
})

test("with preserveChanges, an option the user picked in a multiple select stays selected when it becomes a drop-down and moves", () => {
	const from = dom(
		`<form><select name="s" multiple><option value="a">a</option><option value="b" selected>b</option><option value="c">c</option></select></form>`,
	) as HTMLFormElement
	from.querySelector<HTMLOptionElement>("[value=c]")!.selected = true

	morph(from, `<form><select name="s"><option value="c">c</option><option value="a">a</option></select></form>`, {
		preserveChanges: true,
	})

	expect(new FormData(from).getAll("s")).toEqual(["c"])
})

test("with preserveChanges, an untouched select follows its markup", () => {
	const from = select("a")

	morph(from, select("c"), { preserveChanges: true })

	expect(new FormData(from).get("s")).toBe("c")
})

test("with preserveChanges, a select inside morphlex-clobber follows its markup", () => {
	const from = select("a")
	from.querySelector("select")!.value = "b"

	morph(from, select("c", " morphlex-clobber"), { preserveChanges: true })

	expect(new FormData(from).get("s")).toBe("c")
})

test("with preserveChanges, an untouched option of a multiple select follows its markup", () => {
	const from = dom(
		`<select multiple name="s"><option value="a">a</option><option value="b">b</option><option value="c">c</option></select>`,
	) as HTMLSelectElement
	from.options[1]!.selected = true

	morph(
		from,
		`<select multiple name="s"><option value="a">a</option><option value="b">b</option><option value="c" selected>c</option></select>`,
		{ preserveChanges: true },
	)

	expect([...from.selectedOptions].map((option) => option.value)).toEqual(["b", "c"])
})

test("with preserveChanges, a radio the user picked stays checked when a new radio arrives checked", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(
		from,
		`<form><input type="radio" name="g" value="a"><input type="radio" name="g" value="b"><input type="radio" name="g" value="c"><input type="radio" name="g" value="d" checked></form>`,
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, an option the user picked stays selected when a new option arrives selected", () => {
	const from = select("a")
	from.querySelector("select")!.value = "b"

	morph(
		from,
		`<form><select name="s"><option value="a">a</option><option value="b">b</option><option value="c">c</option><option value="d" selected>d</option></select></form>`,
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("s")).toBe("b")
})

test("without preserveChanges, a new radio arriving checked takes the group", () => {
	const from = radios("a")
	document.body.append(from)
	pickRadio(from, "b")

	morph(
		from,
		`<form><input type="radio" name="g" value="a"><input type="radio" name="g" value="b"><input type="radio" name="g" value="c"><input type="radio" name="g" value="d" checked></form>`,
	)

	expect(new FormData(from).get("g")).toBe("d")
	from.remove()
})

test("with preserveChanges, a radio the user picked stays checked when a new form takes it into a group with a checked radio", () => {
	const radio = (value: string, checked = false) =>
		`<input type="radio" name="g" value="${value}" form="f"${checked ? " checked" : ""}>`
	const from = dom(`<div>${radio("a", true)}${radio("b")}</div>`) as HTMLDivElement
	document.body.append(from)
	from.querySelector<HTMLInputElement>("[value=b]")!.click()

	morph(from, `<div>${radio("a", true)}${radio("b")}<div><form id="f"></form>${radio("c", true)}</div></div>`, {
		preserveChanges: true,
	})

	expect(from.querySelector<HTMLInputElement>("[value=b]")!.checked).toBe(true)
	expect(from.querySelector<HTMLInputElement>("[value=c]")!.checked).toBe(false)
	from.remove()
})

test("with preserveChanges, a new radio the markup checks keeps the group when the user's pick is removed later", () => {
	const from = dom(
		`<form><p><input type="radio" name="g" value="b"><span id="k">k</span></p><input type="radio" name="g" value="a" checked></form>`,
	) as HTMLFormElement
	document.body.append(from)
	from.querySelector<HTMLInputElement>("[value=b]")!.click()

	morph(
		from,
		`<form><span id="k">k</span><input type="radio" name="g" value="a"><input type="radio" name="g" value="c" checked></form>`,
		{ preserveChanges: true },
	)

	expect(from.querySelector("[value=b]")).toBe(null)
	expect(new FormData(from).get("g")).toBe("c")
	from.remove()
})

test("with preserveChanges, a radio the user picked keeps its pick when it moves out of a removed row", () => {
	const from = dom(
		`<form><div></div><div><p><input id="r" type="radio" name="g" value="b"><span id="k">k</span></p></div><div><input type="radio" name="g" value="a" checked></div></form>`,
	) as HTMLFormElement
	document.body.append(from)
	const picked = from.querySelector<HTMLInputElement>("#r")!
	picked.click()

	morph(
		from,
		`<form><div><input id="r" type="radio" name="g" value="b"></div><div><span id="k">k</span></div><div><input type="radio" name="g" value="a"><input type="radio" name="g" value="c" checked></div></form>`,
		{ preserveChanges: true },
	)

	expect(from.querySelector("#r")).toBe(picked)
	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, a radio the user picked stays checked beside a removed row", () => {
	const from = dom(
		`<form><p><span id="k">k</span></p><input type="radio" name="g" value="b"><input type="radio" name="g" value="a" checked></form>`,
	) as HTMLFormElement
	document.body.append(from)
	from.querySelector<HTMLInputElement>("[value=b]")!.click()

	morph(
		from,
		`<form><span id="k">k</span><input type="radio" name="g" value="b"><input type="radio" name="g" value="a"><input type="radio" name="g" value="c" checked></form>`,
		{ preserveChanges: true },
	)

	expect(new FormData(from).get("g")).toBe("b")
	from.remove()
})

test("with preserveChanges, a radio the user picked outside a partial morph stays checked when the markup checks one inside", () => {
	const from = dom(
		`<form><input type="radio" name="g" value="a"><div><input type="radio" name="g" value="b" checked><input type="radio" name="g" value="c"></div></form>`,
	) as HTMLFormElement
	document.body.append(from)
	from.querySelector<HTMLInputElement>("[value=a]")!.click()

	morph(
		from.querySelector("div")!,
		`<div><input type="radio" name="g" value="b"><input type="radio" name="g" value="c" checked></div>`,
		{
			preserveChanges: true,
		},
	)

	expect(new FormData(from).get("g")).toBe("a")
	from.remove()
})

test("with preserveChanges, a radio the user picked outside a partial morph stays checked when a new radio arrives checked", () => {
	const from = dom(
		`<form><input type="radio" name="g" value="a"><div><input type="radio" name="g" value="b" checked></div></form>`,
	) as HTMLFormElement
	document.body.append(from)
	from.querySelector<HTMLInputElement>("[value=a]")!.click()

	morph(
		from.querySelector("div")!,
		`<div><input type="radio" name="g" value="b"><input type="radio" name="g" value="c" checked></div>`,
		{
			preserveChanges: true,
		},
	)

	expect(new FormData(from).get("g")).toBe("a")
	from.remove()
})
