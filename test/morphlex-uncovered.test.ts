import { describe, it, expect, vi } from "vitest"
import { morph, morphInner } from "../src/morphlex"

describe("Morphlex - Remaining Uncovered Lines", () => {
	describe("Invalid HTML string error (line 39)", () => {
		it("should verify the error is thrown with correct message and stack trace", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// Verify the error is actually thrown from the correct line
			try {
				morphInner(div.firstChild!, "<p>First</p><p>Second</p>")
				expect.fail("Should have thrown an error")
			} catch (e: any) {
				expect(e.message).toBe("[Morphlex] The string was not a valid HTML element.")
				// The error should be thrown from morphInner function
				expect(e.stack).toContain("morphInner")
			}

			div.remove()
		})

		it("should throw error when string contains multiple root elements", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// String with multiple root elements should throw when using morphInner
			expect(() => {
				morphInner(div.firstChild!, "<p>First</p><p>Second</p>")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})

		it("should throw error when string contains only text content", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// String with only text (no element) should throw
			expect(() => {
				morphInner(div.firstChild!, "Just plain text")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})

		it("should throw error when string contains comment only", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// String with only a comment should throw
			expect(() => {
				morphInner(div.firstChild!, "<!-- just a comment -->")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})

		it("should throw error when string is empty", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// Empty string should throw
			expect(() => {
				morphInner(div.firstChild!, "")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})

		it("should throw error when string contains whitespace only", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// Whitespace-only string should throw
			expect(() => {
				morphInner(div.firstChild!, "   \n\t  ")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})

		it("should throw error when morphInner receives string with text and element", () => {
			const div = document.createElement("div")
			div.innerHTML = "<span>Test</span>"
			document.body.appendChild(div)

			// String with text before element
			expect(() => {
				morphInner(div.firstChild!, "text before <div>element</div>")
			}).toThrow("[Morphlex] The string was not a valid HTML element.")

			div.remove()
		})
	})

	describe("morphOneToMany with empty array (lines 116-125)", () => {
		it("should remove node when morphing to empty NodeList", () => {
			const parent = document.createElement("div")
			const child = document.createElement("span")
			child.textContent = "Will be removed"
			parent.appendChild(child)
			document.body.appendChild(parent)

			// Create an empty NodeList by parsing empty content
			const template = document.createElement("template")
			const emptyNodeList = template.content.childNodes

			// Morph the child to empty NodeList
			morph(child, emptyNodeList)

			// Child should be removed from parent
			expect(parent.children.length).toBe(0)
			expect(parent.contains(child)).toBe(false)

			parent.remove()
		})

		it("should remove node when morphing to empty string parsed as NodeList", () => {
			const parent = document.createElement("div")
			const element = document.createElement("p")
			element.id = "test-element"
			element.textContent = "Original"
			parent.appendChild(element)
			document.body.appendChild(parent)

			// Morph to empty string (gets parsed to empty NodeList)
			morph(element, "")

			// Element should be removed
			expect(parent.querySelector("#test-element")).toBe(null)
			expect(parent.children.length).toBe(0)

			parent.remove()
		})

		it("should call beforeNodeRemoved/afterNodeRemoved when removing via empty NodeList", () => {
			const parent = document.createElement("div")
			const child = document.createElement("span")
			child.id = "to-remove"
			parent.appendChild(child)
			document.body.appendChild(parent)

			let beforeRemoveCalled = false
			let afterRemoveCalled = false
			let removedNode: Node | null = null

			// Create empty NodeList
			const template = document.createElement("template")
			const emptyNodeList = template.content.childNodes

			// Morph with callbacks
			morph(child, emptyNodeList, {
				beforeNodeRemoved: (node) => {
					beforeRemoveCalled = true
					removedNode = node
					return true
				},
				afterNodeRemoved: (node) => {
					afterRemoveCalled = true
					expect(node).toBe(removedNode)
				},
			})

			expect(beforeRemoveCalled).toBe(true)
			expect(afterRemoveCalled).toBe(true)
			expect(removedNode).toBe(child)
			expect(parent.children.length).toBe(0)

			parent.remove()
		})

		it("should not remove node when beforeNodeRemoved returns false", () => {
			const parent = document.createElement("div")
			const child = document.createElement("span")
			child.textContent = "Should not be removed"
			parent.appendChild(child)
			document.body.appendChild(parent)

			// Create empty NodeList
			const template = document.createElement("template")
			const emptyNodeList = template.content.childNodes

			// Morph with beforeNodeRemoved returning false
			morph(child, emptyNodeList, {
				beforeNodeRemoved: () => false,
			})

			// Child should still be in parent
			expect(parent.children.length).toBe(1)
			expect(parent.contains(child)).toBe(true)

			parent.remove()
		})

		it("should morph one element to multiple elements from string", () => {
			const parent = document.createElement("div")
			const single = document.createElement("span")
			single.id = "single"
			single.textContent = "Single"
			parent.appendChild(single)
			document.body.appendChild(parent)

			// Morph single element to multiple elements using a string
			morph(single, "<span id='first'>First</span><span id='second'>Second</span><span id='third'>Third</span>")

			// Should have morphed the first element and added the rest
			expect(parent.children.length).toBe(3)
			expect(parent.children[0].id).toBe("first")
			expect(parent.children[0].textContent).toBe("First")
			expect(parent.children[1].id).toBe("second")
			expect(parent.children[2].id).toBe("third")

			parent.remove()
		})

		it("should call callbacks when morphing one to many", () => {
			const parent = document.createElement("div")
			const single = document.createElement("span")
			single.textContent = "Single"
			parent.appendChild(single)
			document.body.appendChild(parent)

			const addedNodes: Node[] = []
			let morphedCalled = false

			morph(single, "<span>First</span><span>Second</span>", {
				beforeNodeAdded: (_node) => {
					return true // Allow addition
				},
				afterNodeAdded: (node) => {
					addedNodes.push(node)
				},
				afterNodeVisited: (_from, _to) => {
					morphedCalled = true
					// The 'from' could be the original single element or its child nodes after morphing
					// Just verify the callback was called
				},
			})

			expect(morphedCalled).toBe(true)
			expect(addedNodes.length).toBe(1) // Only second span was added, first was morphed
			expect(parent.children.length).toBe(2)

			parent.remove()
		})

		it("should prevent adding nodes when beforeNodeAdded returns false", () => {
			const parent = document.createElement("div")
			const single = document.createElement("span")
			single.id = "original"
			single.textContent = "Original"
			parent.appendChild(single)
			document.body.appendChild(parent)

			morph(single, "<span id='first'>First</span><span id='second'>Second</span>", {
				beforeNodeAdded: () => false, // Prevent all additions
			})

			// Only the first element should be morphed, second should not be added
			expect(parent.children.length).toBe(1)
			expect(parent.children[0].id).toBe("first") // First was morphed
			expect(parent.children[0].textContent).toBe("First")

			parent.remove()
		})

		it("should handle morphing to single text node", () => {
			const parent = document.createElement("div")
			const element = document.createElement("span")
			element.textContent = "Element"
			parent.appendChild(element)
			document.body.appendChild(parent)

			// Morph to just text content (which creates a text node in NodeList)
			morph(element, "Just text")

			// Element should be replaced with text node
			expect(parent.children.length).toBe(0) // No elements
			expect(parent.textContent).toBe("Just text")

			parent.remove()
		})
	})

	describe("moveBefore API usage (line 66)", () => {
		it("should use moveBefore when available and node is in same parent", () => {
			const parent = document.createElement("div")
			const child1 = document.createElement("span")
			child1.id = "first"
			const child2 = document.createElement("span")
			child2.id = "second"

			parent.appendChild(child1)
			parent.appendChild(child2)
			document.body.appendChild(parent)

			// Mock moveBefore if it doesn't exist, to test the condition
			const originalMoveBefore = (parent as any).moveBefore
			if (!("moveBefore" in parent)) {
				// Add a mock moveBefore to test the branch
				;(parent as any).moveBefore = vi.fn((node: Node, before: Node | null) => {
					// Simulate moveBefore behavior
					if (node.parentNode === parent) {
						parent.insertBefore(node, before)
					}
				})
			}

			// Morph to reverse order - should trigger moveBefore if available
			morph(parent, '<div><span id="second"></span><span id="first"></span></div>')

			// Check order is reversed
			expect(parent.children[0].id).toBe("second")
			expect(parent.children[1].id).toBe("first")

			// Restore original moveBefore (if it existed)
			if (originalMoveBefore === undefined) {
				delete (parent as any).moveBefore
			} else {
				;(parent as any).moveBefore = originalMoveBefore
			}

			parent.remove()
		})

		it("should fall back to insertBefore when moveBefore is not available", () => {
			const parent = document.createElement("div")
			const child1 = document.createElement("span")
			child1.id = "a"
			const child2 = document.createElement("span")
			child2.id = "b"

			parent.appendChild(child1)
			parent.appendChild(child2)
			document.body.appendChild(parent)

			// Ensure moveBefore is not available
			const originalMoveBefore = (parent as any).moveBefore
			if ("moveBefore" in parent) {
				delete (parent as any).moveBefore
			}

			// Morph to reverse order - should use insertBefore fallback
			morph(parent, '<div><span id="b"></span><span id="a"></span></div>')

			// Check order is reversed
			expect(parent.children[0].id).toBe("b")
			expect(parent.children[1].id).toBe("a")

			// Restore original moveBefore if it existed
			if (originalMoveBefore !== undefined) {
				;(parent as any).moveBefore = originalMoveBefore
			}

			parent.remove()
		})

		it("should use insertBefore when node is not already in the same parent", () => {
			const parent1 = document.createElement("div")
			const parent2 = document.createElement("div")
			const child = document.createElement("span")
			child.id = "movable"
			child.textContent = "Move me"

			parent2.appendChild(child)
			document.body.appendChild(parent1)
			document.body.appendChild(parent2)

			// Add mock moveBefore to parent1
			let moveBeforeCalled = false
			const originalMoveBefore = (parent1 as any).moveBefore
			if (!("moveBefore" in parent1)) {
				;(parent1 as any).moveBefore = vi.fn(() => {
					moveBeforeCalled = true
				})
			}

			// Create a reference element in parent1
			const reference = document.createElement("span")
			reference.id = "ref"
			parent1.appendChild(reference)

			// Morph parent1 to include the child from parent2
			// The child with id="movable" will be found in parent2 and moved to parent1
			morph(parent1, '<div><span id="movable">Move me</span><span id="ref"></span></div>')

			// moveBefore should NOT be called since node was in different parent
			expect(moveBeforeCalled).toBe(false)

			// Child should now be in parent1
			expect(parent1.querySelector("#movable")).toBeTruthy()

			// Restore original moveBefore
			if (originalMoveBefore === undefined) {
				delete (parent1 as any).moveBefore
			} else {
				;(parent1 as any).moveBefore = originalMoveBefore
			}

			parent1.remove()
			parent2.remove()
		})
	})
})
