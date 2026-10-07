import { expect, test, vi } from "vitest"
import { morph } from "../../src/morphlex"

type Random = () => number

const SEED_COUNT = readPositiveIntEnv("MORPHLEX_FUZZ_FORM_SEEDS", 300)
// A failure names its seed, which reruns with MORPHLEX_FUZZ_FORM_SEED_START set to it and MORPHLEX_FUZZ_FORM_SEEDS=1.
const SEED_START = readPositiveIntEnv("MORPHLEX_FUZZ_FORM_SEED_START", 0xf0a1)
// MORPHLEX_FUZZ_FORM_MODE=default or preserve runs every seed in one mode; otherwise each seed picks one.
const MODE = globalThis.process?.env?.["MORPHLEX_FUZZ_FORM_MODE"] ?? import.meta.env["VITE_MORPHLEX_FUZZ_FORM_MODE"]

vi.setConfig({ testTimeout: Math.max(30_000, SEED_COUNT * 100) })

type Kind = "radio" | "checkbox" | "text" | "textarea" | "select"
type TextType = "text" | "email" | "search"

interface Option {
	value: string
	selected: boolean
}

interface Control {
	node: "control"
	kind: Kind
	id: string | null
	name: string
	value: string
	checked: boolean
	form: string | null
	type: TextType
	options: Array<Option>
	multiple: boolean
	className: string | null
}

interface Container {
	node: "container"
	tag: "section" | "form" | "div" | "label"
	id: string | null
	children: Array<Item>
}

type Item = Control | Container

interface Scenario {
	host: Container
	root: Container
	target: Container
	preserveChanges: boolean
}

// Each kind has its own names, so radios form groups and nothing else is paired across kinds by name: a text input
// and a radio with one name would be paired by it, and the typed text would become the radio's value.
const RADIO_NAMES = ["a", "a", "b"]
const CHECKBOX_NAMES = ["c", "c", "d"]
const OTHER_NAMES = ["t", "t", "u"]

const VALUES = ["1", "2", "3"]
const TEXT_VALUES = ["", "1", "x y"]
const TEXTAREA_VALUES = ["", "t", "l1\nl2"]

function namesFor(kind: Kind): Array<string> {
	return kind === "radio" ? RADIO_NAMES : kind === "checkbox" ? CHECKBOX_NAMES : OTHER_NAMES
}

test("seeded fuzz: form state after a morph is what parsing the markup gives, or what the user chose", () => {
	const failures: Array<string> = []
	for (let seed = SEED_START; seed < SEED_START + SEED_COUNT; seed++) {
		const random = createRandom(seed)
		const scenario = createScenario(random)
		const host = parse(render(scenario.host, random)) as HTMLElement
		document.body.append(host)

		try {
			const root = scenario.root === scenario.host ? host : host.querySelector(`#${scenario.root.id}`)!
			const targetHtml = render(scenario.target, random)
			const changes = applyUserChanges(random, root, scenario.preserveChanges)
			const fromHtml = host.outerHTML
			const message = () =>
				`seed ${seed} ${scenario.preserveChanges ? "preserveChanges" : "default"} root #${scenario.root.id}\nfrom: ${fromHtml}\nto:   ${targetHtml}\nuser: ${changes.join(", ")}\nnow:  ${host.outerHTML}`

			if (scenario.preserveChanges) {
				const dirty = recordDirtyControls(root, parse(targetHtml))
				const targets = countFreeTargets(parse(targetHtml), root)

				morph(root, parse(targetHtml), { preserveChanges: true })

				expect(root.isEqualNode(parse(targetHtml)), message()).toBe(true)
				assertUserChangesKept(dirty, targets, host, message)
			} else {
				const outside = recordOutsideState(host, root)
				const expected = parseExpectedDocument(scenario, targetHtml)

				morph(root, parse(targetHtml))

				expect(root.isEqualNode(parse(targetHtml)), message()).toBe(true)
				assertStateMatchesMarkup(root, expected, outside, message)
			}
		} catch (error) {
			// An assertion names its seed already; a thrown error doesn't.
			failures.push(String(error).includes(`seed ${seed} `) ? String(error) : `seed ${seed} ${MODE ?? "mixed"}: ${String(error)}`)
		} finally {
			host.remove()
		}
	}
	expect(failures.length, `${failures.length} of ${SEED_COUNT} seeds failed\n\n${failures.slice(0, 5).join("\n\n")}`).toBe(0)
})

// Mode A: without `preserveChanges` every control inside the root holds what parsing the final markup gives.
// Radios outside the root are left alone by design, so for those only the group invariant is checked: one that
// was checked stays checked unless a radio inside the root took its group, and one that was unchecked stays so.
function assertStateMatchesMarkup(
	root: Element,
	expected: Document,
	outside: Array<[FormControl, boolean | string | Array<string>]>,
	message: () => string,
): void {
	const expectedRoot = expected.getElementById(root.id)!
	const parsedRadios = [...expected.querySelectorAll<HTMLInputElement>("input[type=radio]")]
	// A radio's group is read from the parsed document once it's complete, but not its checkedness: while parsing,
	// a radio whose `form` attribute names a form later in the document briefly sits in the group of radios
	// without a form, and can uncheck one there. In each final group, the last radio inside the root that the
	// markup checks is the one checked, as the morph leaves radios outside the root alone.
	const expectedChecked = (radio: HTMLInputElement) =>
		radio.hasAttribute("checked") &&
		!parsedRadios.some(
			(other) =>
				other !== radio &&
				expectedRoot.contains(other) &&
				other.hasAttribute("checked") &&
				other.name === radio.name &&
				other.form === radio.form &&
				radio.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING,
		)
	const expectedState = (control: FormControl) => (isRadio(control) ? expectedChecked(control) : stateOf(control))

	const live = [...root.querySelectorAll<FormControl>("input, textarea, select")]
	const parsed = [...expectedRoot.querySelectorAll<FormControl>("input, textarea, select")]
	expect(live.length, message()).toBe(parsed.length)
	live.forEach((control, i) => {
		expect(stateOf(control), `${message()}\ninside control ${i}`).toEqual(expectedState(parsed[i]!))
	})

	const parsedOutside = [...expected.querySelectorAll<FormControl>("input, textarea, select")].filter(
		(c) => !expectedRoot.contains(c),
	)
	expect(outside.length, message()).toBe(parsedOutside.length)
	outside.forEach(([control, before], i) => {
		const counterpart = parsedOutside[i]!
		if (!isRadio(control)) {
			expect(stateOf(control), `${message()}\noutside control ${i}`).toEqual(stateOf(counterpart))
			return
		}
		const group = parsedRadios.filter((radio) => radio.name === counterpart.name && radio.form === counterpart.form)
		const takenInside = group.some((radio) => expectedRoot.contains(radio) && expectedChecked(radio))
		const otherOutsideChecked = group.some(
			(radio) => radio !== counterpart && !expectedRoot.contains(radio) && outside[parsedOutside.indexOf(radio)]![1],
		)
		// Two checked radios joining one group is the browser's call, so that's left alone.
		if (!takenInside && otherOutsideChecked) return
		expect(control.checked, `${message()}\noutside radio ${i}`).toBe(takenInside ? false : before)
	})
}

// Mode B: with `preserveChanges` every control the user changed keeps its change when the target has a control of
// the same kind, name (and value, for a checkbox or radio) along the same path. When the target has fewer such
// controls than the user changed, at least that many changed ones survive, since untouched ones go first.
function assertUserChangesKept(
	dirty: Array<DirtyControl>,
	targets: Map<string, number>,
	host: HTMLElement,
	message: () => string,
): void {
	const byKey = new Map<string, Array<DirtyControl>>()
	for (const entry of dirty) {
		const list = byKey.get(entry.key) ?? []
		list.push(entry)
		byKey.set(entry.key, list)
	}
	for (const [key, entries] of byKey) {
		const survivors = entries.filter((entry) => host.contains(entry.control))
		const expected = Math.min(entries.length, targets.get(key) ?? 0)
		expect(survivors.length, `${message()}\nsurvivors of ${key}`).toBeGreaterThanOrEqual(expected)
		for (const { control, state } of survivors) {
			if (isSelect(control)) {
				const picked = state as Pick
				const option = [...control.options].find((option) => option.value === picked.value)
				if (option) expect(option.selected, `${message()}\npick ${picked.value} of ${key}`).toBe(picked.selected)
			} else {
				expect(stateOf(control), `${message()}\nstate of ${key}`).toEqual(state)
			}
		}
	}
}

type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

// The option the user picked or toggled in a select, and whether they left it selected.
interface Pick {
	value: string
	selected: boolean
}

interface DirtyControl {
	control: FormControl
	key: string
	state: boolean | string | Pick
}

// The controls the user changed that still differ from their markup: a radio the user picked and then left for
// another one in its group looks untouched again. A control whose id the target dropped is left out, since it's
// no longer paired by anything.
function recordDirtyControls(root: Element, target: Element): Array<DirtyControl> {
	const targetIds = idsIn(target)
	return [...root.querySelectorAll<FormControl>("input, textarea, select")]
		.filter((control) => (control as Element & { fuzzDirty?: boolean }).fuzzDirty && isDirty(control))
		.filter((control) => !control.id || targetIds.has(control.id))
		.map((control) => ({
			control,
			key: keyOf(control, targetIds),
			state: isSelect(control)
				? (control as HTMLSelectElement & { fuzzPick: Pick }).fuzzPick
				: (stateOf(control) as boolean | string),
		}))
}

// How many targets of each key a changed control can take. README's first rule pairs an untouched control with a
// target it already equals before anything else, so such a target isn't free for a changed control of its key,
// unless a changed control has the same markup as the untouched one: then the changed one takes the target and the
// untouched one goes instead (see the design notes on identical siblings).
function countFreeTargets(target: Element, root: Element): Map<string, number> {
	const liveIds = idsIn(root)
	const targetIds = idsIn(target)
	const controls = [...root.querySelectorAll<FormControl>("input, textarea, select")]
	const free = new Map<string, Array<Element>>()
	for (const control of target.querySelectorAll<FormControl>("input, textarea, select")) {
		const key = keyOf(control, liveIds)
		free.set(key, [...(free.get(key) ?? []), control])
	}
	for (const control of controls) {
		if (isDirty(control)) continue
		const key = keyOf(control, targetIds)
		if (controls.some((other) => isDirty(other) && keyOf(other, targetIds) === key && other.isEqualNode(control))) continue
		const candidates = free.get(key) ?? []
		const index = candidates.findIndex((candidate) => control.isEqualNode(candidate))
		if (index >= 0) candidates.splice(index, 1)
	}
	return new Map([...free].map(([key, candidates]) => [key, candidates.length]))
}

// Whether the morph sees the control as changed. A drop-down with no `selected` option shows its first option, so
// for selects only the user's own pick counts, and the user is only given picks that differ from the markup.
function isDirty(control: FormControl): boolean {
	if (isSelect(control)) return "fuzzPick" in control
	if (isInput(control) && isCheckable(control)) return control.checked !== control.defaultChecked
	return control.value !== control.defaultValue
}

function idsIn(root: Element): Set<string> {
	return new Set([...root.querySelectorAll("[id]")].map((element) => element.id))
}

// A control whose id is on both sides is matched by it. Otherwise the key is the nearest ancestor with an id, the
// tags between it and the control, the control's kind and name, and for a checkbox or radio its value and `form`
// attribute, which make up its choice.
function keyOf(control: FormControl, otherSideIds: Set<string>): string {
	if (control.id && otherSideIds.has(control.id)) return JSON.stringify(["id", control.id])
	const path: Array<string> = []
	let ancestor = control.parentElement!
	while (!ancestor.id) {
		path.push(ancestor.localName)
		ancestor = ancestor.parentElement!
	}
	const kind = isInput(control) ? (isCheckable(control) ? control.type : "text") : control.localName
	const choice = isInput(control) && isCheckable(control) ? [control.value, control.getAttribute("form")] : []
	return JSON.stringify([ancestor.id, path, kind, control.name, ...choice, isSelect(control) && control.multiple])
}

function stateOf(control: FormControl): boolean | string | Array<string> {
	if (isSelect(control)) return selectedValues(control)
	if (isInput(control) && isCheckable(control)) return control.checked
	return control.value
}

function selectedValues(select: HTMLSelectElement): Array<string> {
	return [...select.options].filter((option) => option.selected).map((option) => option.value)
}

function recordOutsideState(host: HTMLElement, root: Element): Array<[FormControl, boolean | string | Array<string>]> {
	return [...host.querySelectorAll<FormControl>("input, textarea, select")]
		.filter((control) => !root.contains(control))
		.map((control) => [control, stateOf(control)])
}

// The final markup parsed as a document, with the root replaced by the target.
function parseExpectedDocument(scenario: Scenario, targetHtml: string): Document {
	const html = render(scenario.host, createRandom(0), scenario.root, targetHtml)
	return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html")
}

// The user changes about 40% of the controls inside the root. With `preserveChanges`, a drop-down pick that looks
// like the markup's own pick isn't a change, so the user picks another option.
function applyUserChanges(random: Random, root: Element, preserveChanges: boolean): Array<string> {
	const changes: Array<string> = []
	const controls = [...root.querySelectorAll<FormControl>("input, textarea, select")]
	controls.forEach((control, i) => {
		if (random() > 0.4) return
		if (isSelect(control)) {
			const options = [...control.options]
			const candidates = options.filter((option, index) => {
				if (control.multiple) return true
				if (option.selected) return false
				return !preserveChanges || (index > 0 && !option.hasAttribute("selected"))
			})
			if (!candidates.length) return
			const option = pick(random, candidates)
			if (control.multiple) option.selected = !option.selected
			else control.value = option.value
			;(control as HTMLSelectElement & { fuzzPick?: Pick }).fuzzPick = { value: option.value, selected: option.selected }
			changes.push(`select ${i} ${option.value}`)
		} else if (isInput(control) && control.type === "radio") {
			if (control.checked) return
			control.checked = true
			changes.push(`radio ${i}`)
		} else if (isInput(control) && control.type === "checkbox") {
			control.checked = !control.checked
			changes.push(`checkbox ${i}`)
		} else {
			control.value = `typed ${i}`
			changes.push(`text ${i}`)
		}
		;(control as Element & { fuzzDirty?: boolean }).fuzzDirty = true
	})
	return changes
}

// With `preserveChanges` every form and wrapper has an id, so each control's targets are the ones in its own
// container, which is what the README promises to pair, and no two checkboxes or radios make the same choice, since
// which of two twins keeps the user's choice is the choice fuzzer's business. Without it the tree is heavy on
// radios, where the browser's own group logic has to be matched.
function createScenario(random: Random): Scenario {
	const preserveChanges = MODE === "preserve" || (MODE !== "default" && random() < 0.5)
	let nextId = 0
	const host: Container = { node: "container", tag: "section", id: "host", children: [] }
	const forms = Array.from({ length: randomInt(random, 1, 2) }, (_, i) =>
		container("form", preserveChanges || random() < 0.85 ? `f${i + 1}` : null),
	)
	const formIds = forms.flatMap((form) => (form.id ? [form.id] : []))
	host.children.push(...forms)

	const wrappers: Array<Container> = []
	for (let i = 0, count = randomInt(random, 0, 2); i < count; i++) {
		const wrapper = container(random() < 0.5 ? "label" : "div", preserveChanges || random() < 0.5 ? `w${i + 1}` : null)
		pick(random, [host, ...forms]).children.push(wrapper)
		wrappers.push(wrapper)
	}

	for (let i = 0, count = randomInt(random, 3, 7); i < count; i++) {
		const places = [host, ...forms, ...wrappers.filter((wrapper) => wrapper.tag === "div" || !wrapper.children.length)]
		const place = pick(random, places)
		const control = createControl(random, () => `c${nextId++}`, preserveChanges)
		control.form = formAttribute(random, formOf(place, forms), formIds)
		if (preserveChanges && makesSameChoice(control, controlsIn(host))) continue
		place.children.push(control)
	}
	shuffle(random, host.children)
	for (const form of forms) shuffle(random, form.children)

	const roots: Array<Container> = [host, ...forms.filter((form) => form.id), ...wrappers.filter((wrapper) => wrapper.id)]
	const root = pick(random, roots)
	const target = structuredClone(root)
	mutate(random, target, preserveChanges, formIds, () => `n${nextId++}`)
	return { host, root, target, preserveChanges }
}

const PRESERVE_KINDS: Array<Kind> = [
	"radio",
	"radio",
	"radio",
	"checkbox",
	"checkbox",
	"text",
	"text",
	"textarea",
	"select",
	"select",
]
const DEFAULT_KINDS: Array<Kind> = [
	"radio",
	"radio",
	"radio",
	"radio",
	"radio",
	"checkbox",
	"checkbox",
	"text",
	"textarea",
	"select",
	"select",
]

function createControl(random: Random, nextId: () => string, preserveChanges: boolean): Control {
	const kind = pick(random, preserveChanges ? PRESERVE_KINDS : DEFAULT_KINDS)
	const control: Control = {
		node: "control",
		kind,
		id: random() < (preserveChanges ? 0.4 : 0.6) ? nextId() : null,
		name: pick(random, namesFor(kind)),
		value: "",
		checked: false,
		form: null,
		type: pick<TextType>(random, ["text", "text", "email", "search"]),
		options: [],
		multiple: false,
		className: random() < 0.2 ? "x" : null,
	}
	if (kind === "radio" || kind === "checkbox") {
		control.value = pick(random, VALUES)
		control.checked = random() < 0.35
	} else if (kind === "text") {
		control.value = pick(random, TEXT_VALUES)
	} else if (kind === "textarea") {
		control.value = pick(random, TEXTAREA_VALUES)
	} else {
		control.multiple = random() < 0.3
		control.options = shuffle(random, [...VALUES])
			.slice(0, randomInt(random, 2, 3))
			.map((value) => ({ value, selected: false }))
		if (random() < 0.4) pick(random, control.options).selected = true
		if (control.multiple && random() < 0.3) pick(random, control.options).selected = true
	}
	return control
}

function makesSameChoice(control: Control, others: Array<Control>): boolean {
	if (control.kind !== "radio" && control.kind !== "checkbox") return false
	return others.some((other) => other !== control && other.name === control.name && other.value === control.value)
}

// About 30% of controls carry a `form` attribute naming the form they're in, another form, or a missing one.
function formAttribute(random: Random, ownForm: Container | null, formIds: Array<string>): string | null {
	if (random() > 0.3) return null
	const choices = ["missing", ...formIds]
	if (ownForm?.id) choices.push(ownForm.id, ownForm.id)
	return pick(random, choices)
}

function formOf(item: Container, forms: Array<Container>): Container | null {
	return forms.find((form) => form === item || contains(form, item)) ?? null
}

// Zero to four changes to the target, within the root. With `preserveChanges` the changes keep every control's
// path and never check a radio or select an option the user didn't, since the browser would then drop the user's
// pick, and never rename a text control, whose target is found by name.
function mutate(random: Random, root: Container, preserveChanges: boolean, formIds: Array<string>, nextId: () => string): void {
	const count = random() < 0.1 ? 0 : randomInt(random, 1, 4)
	for (let i = 0; i < count; i++) {
		const controls = controlsIn(root)
		const containers = containersIn(root)
		const control = controls.length ? pick(random, controls) : null
		const ops: Array<() => void> = []

		if (control) {
			// One to three attribute changes to one control at once, weighted like the structural changes together,
			// since a radio that changes name and `checked` together is where groups go wrong, and that's rare one
			// change at a time.
			const retune = () => {
				if (!preserveChanges && (control.kind === "radio" || control.kind === "checkbox")) {
					regroup(random, control, formIds)
					return
				}
				const changes = attributeChanges(random, control, preserveChanges, formIds)
				for (const change of shuffle(random, changes).slice(0, randomInt(random, 1, 3))) change()
			}
			ops.push(retune, retune, retune)
			ops.push(() => removeItem(root, control))
			if (control.kind === "select") {
				ops.push(() => shuffle(random, control.options))
				if (control.options.length > 1)
					ops.push(() => control.options.splice(randomInt(random, 0, control.options.length - 1), 1))
				const missing = VALUES.filter((value) => !control.options.some((option) => option.value === value))
				if (missing.length) {
					ops.push(() => control.options.push({ value: pick(random, missing), selected: !preserveChanges && random() < 0.3 }))
				}
				ops.push(() => {
					const option = pick(random, control.options)
					option.selected = preserveChanges ? false : !option.selected
				})
			}
			if (!preserveChanges) {
				ops.push(() => {
					removeItem(root, control)
					insertItem(random, root, pick(random, containersIn(root)), control)
				})
				ops.push(() => {
					const wrapper = container(random() < 0.5 ? "label" : "div", null)
					replaceItem(root, control, wrapper)
					wrapper.children.push(control)
				})
			}
		}
		ops.push(() => {
			const source = controls.length ? pick(random, controls) : null
			const added = createControl(random, nextId, preserveChanges)
			const parent = pick(random, containers)
			if (source && random() < 0.7 && namesFor(source.kind) === namesFor(added.kind)) added.name = source.name
			if (preserveChanges) {
				if (makesSameChoice(added, controls)) return
				added.checked = false
				for (const option of added.options) option.selected = false
			} else {
				added.form = pick(random, [null, null, "missing", ...formIds])
			}
			insertItem(random, root, parent, added)
		})
		ops.push(() => shuffle(random, pick(random, containers).children))
		if (!preserveChanges) {
			const forms = containers.filter((c) => c.tag === "form" && c !== root)
			if (forms.length) ops.push(() => (pick(random, forms).id = pick(random, [null, "f9"])))
			const wrappers = containers.filter((c) => c !== root && c.tag !== "form")
			if (wrappers.length) {
				ops.push(() => {
					const wrapper = pick(random, wrappers)
					const parent = parentOf(root, wrapper)!
					parent.children.splice(parent.children.indexOf(wrapper), 1, ...wrapper.children)
				})
			}
		}
		pick(random, ops)()
	}
}

// Without `preserveChanges`, a checkbox or radio usually changes group (by name, `form` or type) and often its
// `checked` at the same time, since that's where the browser's group logic has to be followed.
function regroup(random: Random, control: Control, formIds: Array<string>): void {
	if (random() < 0.7) {
		pick(random, [
			() => (control.name = pick(random, namesFor(control.kind))),
			() => (control.form = pick(random, [null, "missing", ...formIds])),
			() => {
				control.kind = control.kind === "radio" ? "checkbox" : "radio"
				control.name = pick(random, namesFor(control.kind))
			},
		])()
	}
	if (random() < 0.6) control.checked = !control.checked
	if (random() < 0.2) control.value = pick(random, VALUES)
	if (random() < 0.2) control.className = control.className ? null : "x"
}

// The attribute changes allowed on a control. Checkboxes and radios only come here with `preserveChanges`, where a
// radio is never checked, a select never gains a selected option, no control changes type, form, name or (for a
// checkbox or radio) value, since the user's change would be dropped by design, or taken by another control of the
// new name.
function attributeChanges(random: Random, control: Control, preserveChanges: boolean, formIds: Array<string>): Array<() => void> {
	const changes: Array<() => void> = [() => (control.className = control.className ? null : "x")]
	switch (control.kind) {
		case "checkbox":
			changes.push(() => (control.checked = !control.checked))
			break
		case "radio":
			changes.push(() => (control.checked = false))
			break
		case "text":
			changes.push(() => (control.value = pick(random, TEXT_VALUES)))
			if (!preserveChanges) {
				changes.push(
					() => (control.name = pick(random, OTHER_NAMES)),
					() => (control.type = pick<TextType>(random, ["text", "email", "search"])),
				)
			}
			break
		case "textarea":
			changes.push(() => (control.value = pick(random, TEXTAREA_VALUES)))
			if (!preserveChanges) changes.push(() => (control.name = pick(random, OTHER_NAMES)))
			break
		case "select":
			if (!preserveChanges) {
				changes.push(
					() => (control.name = pick(random, OTHER_NAMES)),
					() => (control.multiple = !control.multiple),
				)
			}
	}
	if (!preserveChanges) changes.push(() => (control.form = pick(random, [null, "missing", ...formIds])))
	return changes
}

function container(tag: Container["tag"], id: string | null): Container {
	return { node: "container", tag, id, children: [] }
}

function controlsIn(item: Item): Array<Control> {
	if (item.node === "control") return [item]
	return item.children.flatMap(controlsIn)
}

function containersIn(item: Container): Array<Container> {
	return [item, ...item.children.flatMap((child) => (child.node === "container" ? containersIn(child) : []))]
}

function contains(container: Container, item: Item): boolean {
	return container.children.some((child) => child === item || (child.node === "container" && contains(child, item)))
}

function parentOf(root: Container, item: Item): Container | null {
	for (const child of root.children) {
		if (child === item) return root
		if (child.node === "container") {
			const found = parentOf(child, item)
			if (found) return found
		}
	}
	return null
}

function removeItem(root: Container, item: Item): void {
	const parent = parentOf(root, item)!
	parent.children.splice(parent.children.indexOf(item), 1)
}

function replaceItem(root: Container, item: Item, replacement: Item): void {
	const parent = parentOf(root, item)!
	parent.children.splice(parent.children.indexOf(item), 1, replacement)
}

// A label holds one control, so a second one goes beside the label instead.
function insertItem(random: Random, root: Container, parent: Container, item: Item): void {
	if (parent.tag === "label" && parent.children.length) parent = parentOf(root, parent) ?? root
	parent.children.splice(randomInt(random, 0, parent.children.length), 0, item)
}

// Renders the model with its attributes in a random order, so `checked` can come before `name`. The root item,
// when given, is rendered as the given HTML instead.
function render(item: Item, random: Random, replaced: Item | null = null, replacement = ""): string {
	if (item === replaced) return replacement
	if (item.node === "container") {
		const attributes = item.id ? ` id="${item.id}"` : ""
		return `<${item.tag}${attributes}>${item.children.map((child) => render(child, random, replaced, replacement)).join("")}</${item.tag}>`
	}
	const attributes: Array<string> = [`name="${item.name}"`]
	if (item.id) attributes.push(`id="${item.id}"`)
	if (item.form) attributes.push(`form="${item.form}"`)
	if (item.className) attributes.push(`class="${item.className}"`)
	switch (item.kind) {
		case "radio":
		case "checkbox": {
			attributes.push(`type="${item.kind}"`, `value="${item.value}"`)
			if (item.checked) attributes.push("checked")
			return `<input ${shuffle(random, attributes).join(" ")}>`
		}
		case "text": {
			attributes.push(`type="${item.type}"`)
			if (item.value) attributes.push(`value="${item.value}"`)
			return `<input ${shuffle(random, attributes).join(" ")}>`
		}
		case "textarea":
			return `<textarea ${shuffle(random, attributes).join(" ")}>${item.value}</textarea>`
		case "select": {
			if (item.multiple) attributes.push("multiple")
			const options = item.options.map(
				(option) => `<option value="${option.value}"${option.selected ? " selected" : ""}>${option.value}</option>`,
			)
			return `<select ${shuffle(random, attributes).join(" ")}>${options.join("")}</select>`
		}
	}
}

function parse(html: string): Element {
	const template = document.createElement("template")
	template.innerHTML = html
	return template.content.firstElementChild!
}

function isInput(control: Element): control is HTMLInputElement {
	return control.localName === "input"
}

function isCheckable(input: HTMLInputElement): boolean {
	return input.type === "checkbox" || input.type === "radio"
}

function isRadio(control: Element): control is HTMLInputElement {
	return isInput(control) && control.type === "radio"
}

function isSelect(control: Element): control is HTMLSelectElement {
	return control.localName === "select"
}

function shuffle<T>(random: Random, values: Array<T>): Array<T> {
	for (let i = values.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1))
		;[values[i], values[j]] = [values[j]!, values[i]!]
	}
	return values
}

function pick<T>(random: Random, values: ReadonlyArray<T>): T {
	return values[Math.floor(random() * values.length)]!
}

function randomInt(random: Random, min: number, max: number): number {
	return min + Math.floor(random() * (max - min + 1))
}

function createRandom(seed: number): Random {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let next = Math.imul(state ^ (state >>> 15), 1 | state)
		next ^= next + Math.imul(next ^ (next >>> 7), 61 | next)
		return ((next ^ (next >>> 14)) >>> 0) / 4294967296
	}
}

function readPositiveIntEnv(name: string, fallback: number): number {
	const value = globalThis.process?.env?.[name] ?? import.meta.env[`VITE_${name}`]
	const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
