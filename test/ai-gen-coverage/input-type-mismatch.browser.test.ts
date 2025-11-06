import { test, expect, describe } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "../new/utils"

describe("input type mismatch", () => {
	test("morphing inputs with different types treats them as different elements", () => {
		const a = dom(`<div><input type="text" id="a"><input type="checkbox" id="b"></div>`) as HTMLElement
		const b = dom(`<div><input type="checkbox" id="a"><input type="text" id="b"></div>`) as HTMLElement

		morph(a, b)

		const firstInput = a.querySelector("#a") as HTMLInputElement
		const secondInput = a.querySelector("#b") as HTMLInputElement

		expect(firstInput.type).toBe("checkbox")
		expect(secondInput.type).toBe("text")
	})

	test("morphing inputs with same type but different order", () => {
		const a = dom(`<div><input type="text" id="a" value="first"><input type="text" id="b" value="second"></div>`) as HTMLElement
		const b = dom(`<div><input type="text" id="b" value="second"><input type="text" id="a" value="first"></div>`) as HTMLElement

		morph(a, b)

		const firstInput = a.firstElementChild as HTMLInputElement
		const secondInput = a.lastElementChild as HTMLInputElement

		expect(firstInput.id).toBe("b")
		expect(firstInput.value).toBe("second")
		expect(secondInput.id).toBe("a")
		expect(secondInput.value).toBe("first")
	})

	test("morphing text input to number input creates new element", () => {
		const a = dom(`<div><input type="text" value="hello"></div>`) as HTMLElement
		const b = dom(`<div><input type="number" value="123"></div>`) as HTMLElement

		const originalInput = a.firstElementChild
		morph(a, b)
		const newInput = a.firstElementChild as HTMLInputElement

		// Different types should result in element replacement
		expect(newInput.type).toBe("number")
		expect(newInput.value).toBe("123")
	})

	test("morphing checkbox to radio creates new element", () => {
		const a = dom(`<div><input type="checkbox" checked></div>`) as HTMLElement
		const b = dom(`<div><input type="radio" name="test"></div>`) as HTMLElement

		morph(a, b)
		const newInput = a.firstElementChild as HTMLInputElement

		expect(newInput.type).toBe("radio")
		expect(newInput.name).toBe("test")
	})

	test("morphing inputs with same type uses localName matching", () => {
		const a = dom(`<div><input type="text" value="a"><input type="text" value="b"></div>`) as HTMLElement
		const b = dom(`<div><input type="text" value="x"><input type="text" value="y"></div>`) as HTMLElement

		const firstInput = a.children[0] as HTMLInputElement
		const secondInput = a.children[1] as HTMLInputElement

		morph(a, b)

		// Lines 566-568: inputs match by localName and type, so they're reused
		expect(a.children[0]).toBe(firstInput)
		expect(a.children[1]).toBe(secondInput)
		expect((a.children[0] as HTMLInputElement).value).toBe("x")
		expect((a.children[1] as HTMLInputElement).value).toBe("y")
	})

	test("morphing mixed inputs where some types match and some don't", () => {
		const a = dom(`<div><input type="text" id="1"><input type="checkbox" id="2"><input type="text" id="3"></div>`) as HTMLElement
		const b = dom(`<div><input type="text" id="a"><input type="radio" id="b"><input type="text" id="c"></div>`) as HTMLElement

		morph(a, b)

		// First and third should reuse text inputs, middle should be replaced
		const inputs = Array.from(a.children) as HTMLInputElement[]
		expect(inputs[0].type).toBe("text")
		expect(inputs[0].id).toBe("a")
		expect(inputs[1].type).toBe("radio")
		expect(inputs[1].id).toBe("b")
		expect(inputs[2].type).toBe("text")
		expect(inputs[2].id).toBe("c")
	})

	test("morphing inputs without IDs triggers localName matching with type check", () => {
		const a = dom(`<div><input type="text" class="a"><input type="number" class="b"></div>`) as HTMLElement
		const b = dom(`<div><input type="text" class="x"><input type="number" class="y"></div>`) as HTMLElement

		const firstInput = a.children[0] as HTMLInputElement
		const secondInput = a.children[1] as HTMLInputElement

		morph(a, b)

		// Lines 566-568: same-type inputs are matched and reused via localName
		expect(a.children[0]).toBe(firstInput)
		expect(a.children[1]).toBe(secondInput)
		expect((a.children[0] as HTMLInputElement).className).toBe("x")
		expect((a.children[1] as HTMLInputElement).className).toBe("y")
	})
})
