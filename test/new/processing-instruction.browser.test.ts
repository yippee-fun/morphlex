import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"

test("a processing instruction with another target is replaced", () => {
	const from = document.createElement("p")
	from.append(document.createProcessingInstruction("start", 'name="a"'))
	document.createElement("div").append(from)

	const to = document.createElement("p")
	to.append(document.createProcessingInstruction("marker", 'name="a"'))

	morph(from, to)

	const instruction = from.firstChild as ProcessingInstruction
	expect(instruction.target).toBe("marker")
	expect(instruction.data).toBe('name="a"')
})

test("a processing instruction with the same target keeps its node and takes the new data", () => {
	const from = document.createElement("p")
	const original = document.createProcessingInstruction("marker", 'name="a"')
	from.append(original)

	const to = document.createElement("p")
	to.append(document.createProcessingInstruction("marker", 'name="b"'))

	morph(from, to)

	expect(from.firstChild).toBe(original)
	expect(original.data).toBe('name="b"')
})

test("a processing instruction morphed directly into one with another target is replaced", () => {
	const parent = document.createElement("div")
	const from = document.createProcessingInstruction("start", "")
	parent.append(from)

	morph(from, document.createProcessingInstruction("end", ""))

	expect((parent.firstChild as ProcessingInstruction).target).toBe("end")
})
