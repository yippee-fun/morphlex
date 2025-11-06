import { test, expect } from "vitest"
import { morph } from "../../src/morphlex"
import { dom } from "../new/utils"

test("input type mismatch triggers continue - then finds matching type", () => {
	// This test ensures we hit the continue statement on line 564
	// by having two input candidates where:
	// 1. First candidate has wrong type (continue is executed)
	// 2. Second candidate has correct type (match succeeds)
	const a = dom(
		`<div>
			<input type="text" data-marker="1">
			<input type="checkbox" data-marker="2">
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<input type="checkbox" data-marker="new">
		</div>`,
	) as HTMLElement

	morph(a, b)

	// The checkbox should be reused, text input removed
	expect(a.children.length).toBe(1)
	expect((a.children[0] as HTMLInputElement).type).toBe("checkbox")
	expect((a.children[0] as HTMLInputElement).getAttribute("data-marker")).toBe("new")
})

test("input type mismatch with multiple wrong types before match", () => {
	// Multiple candidates with wrong types, continue is executed multiple times
	const a = dom(
		`<div>
			<input type="text">
			<input type="radio">
			<input type="number">
			<input type="email" data-id="target">
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<input type="email" data-id="new">
		</div>`,
	) as HTMLElement

	morph(a, b)

	// Text, radio, and number inputs trigger continue, email matches
	expect(a.children.length).toBe(1)
	expect((a.children[0] as HTMLInputElement).type).toBe("email")
	expect((a.children[0] as HTMLInputElement).getAttribute("data-id")).toBe("new")
})

test("input type mismatch with no matching type - all trigger continue", () => {
	// All candidates have wrong type, continue is executed for all, no match found
	const a = dom(
		`<div>
			<input type="text">
			<input type="checkbox">
			<input type="radio">
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<input type="email">
		</div>`,
	) as HTMLElement

	morph(a, b)

	// No type matches, so new element is created, old ones removed
	expect(a.children.length).toBe(1)
	expect((a.children[0] as HTMLInputElement).type).toBe("email")
})

test("input with matching type does not trigger continue", () => {
	// When types match, the continue branch is NOT taken
	const a = dom(
		`<div>
			<input type="text" data-value="old">
			<input type="text" data-value="old2">
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<input type="text" data-value="new">
		</div>`,
	) as HTMLElement

	const firstInput = a.children[0]

	morph(a, b)

	// First text input matches without triggering continue
	expect(a.children.length).toBe(1)
	expect(a.children[0]).toBe(firstInput)
	expect((a.children[0] as HTMLInputElement).getAttribute("data-value")).toBe("new")
})

test("non-input elements skip the type check entirely", () => {
	// isInputElement checks prevent non-inputs from entering the type check
	const a = dom(
		`<div>
			<button data-test="1">A</button>
			<button data-test="2">B</button>
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<button data-test="new">C</button>
		</div>`,
	) as HTMLElement

	const firstButton = a.children[0]

	morph(a, b)

	// Buttons match by localName without any type checking
	expect(a.children.length).toBe(1)
	expect(a.children[0]).toBe(firstButton)
	expect(a.children[0].getAttribute("data-test")).toBe("new")
})

test("mixed inputs and non-inputs in localName matching", () => {
	// Ensure the logic handles both inputs and non-inputs correctly
	const a = dom(
		`<div>
			<input type="text">
			<button>Button</button>
			<input type="email" class="target">
		</div>`,
	) as HTMLElement

	const b = dom(
		`<div>
			<input type="email" class="new">
			<button>New Button</button>
		</div>`,
	) as HTMLElement

	morph(a, b)

	// Email input and button should both be matched
	expect(a.children.length).toBe(2)
	expect((a.children[0] as HTMLInputElement).type).toBe("email")
	expect(a.children[1].tagName).toBe("BUTTON")
})
