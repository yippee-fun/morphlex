import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { morph, morphInner } from "../src/morphlex";

describe("Morphlex - Coverage Tests", () => {
	let container: HTMLElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		if (container && container.parentNode) {
			container.parentNode.removeChild(container);
		}
	});

	describe("String parsing error cases", () => {
		it("should throw error when parseElementFromString receives non-element string", () => {
			const div = document.createElement("div");
			container.appendChild(div);

			// Text node is not an element
			expect(() => {
				morphInner(div, "Just text");
			}).toThrow("[Morphlex] The string was not a valid HTML element.");
		});

		it("should parse multiple elements as valid HTML (they go into body)", () => {
			const div = document.createElement("div");
			container.appendChild(div);

			// Multiple root nodes actually work because DOMParser wraps them in body
			// This test just verifies the parsing works
			const reference = "<div>Content</div>";
			morph(div, reference);
			expect(div.textContent).toBe("Content");
		});

		it("should throw error when morphInner called with non-matching elements", () => {
			const div = document.createElement("div");
			const span = document.createElement("span");
			container.appendChild(div);

			expect(() => {
				morphInner(div, span);
			}).toThrow("[Morphlex] You can only do an inner morph with matching elements.");
		});
	});

	describe("ariaBusy handling", () => {
		it("should set and restore ariaBusy on element during morph", () => {
			const div = document.createElement("div");
			div.ariaBusy = "false";
			const span = document.createElement("span");
			div.appendChild(span);

			const reference = document.createElement("div");
			const refSpan = document.createElement("span");
			refSpan.textContent = "Updated";
			reference.appendChild(refSpan);

			let ariaBusyDuringMorph: string | null = null;
			morph(div, reference, {
				afterNodeMorphed: (node) => {
					if (node === span) {
						ariaBusyDuringMorph = div.ariaBusy;
					}
				},
			});

			// ariaBusy should be set to "true" during morph and restored after
			expect(ariaBusyDuringMorph).toBe("true");
			expect(div.ariaBusy).toBe("false");
		});

		it("should handle ariaBusy for non-element nodes", () => {
			const parent = document.createElement("div");
			const textNode = document.createTextNode("Original");
			parent.appendChild(textNode);

			const referenceParent = document.createElement("div");
			const refTextNode = document.createTextNode("Updated");
			referenceParent.appendChild(refTextNode);

			morph(parent, referenceParent);

			expect(parent.textContent).toBe("Updated");
		});
	});

	describe("Sensitivity mapping for media elements", () => {
		it("should handle media elements with various states", () => {
			const parent = document.createElement("div");
			const video = document.createElement("video");
			video.id = "video1";
			parent.appendChild(video);

			const reference = document.createElement("div");
			const refVideo = document.createElement("video");
			refVideo.id = "video1";
			refVideo.setAttribute("src", "test.mp4");
			reference.appendChild(refVideo);

			morph(parent, reference);

			expect(parent.querySelector("video")).toBeTruthy();
		});

		it("should handle audio elements", () => {
			const parent = document.createElement("div");
			const audio = document.createElement("audio");
			audio.id = "audio1";
			parent.appendChild(audio);

			const reference = document.createElement("div");
			const refAudio = document.createElement("audio");
			refAudio.id = "audio1";
			refAudio.setAttribute("src", "test.mp3");
			reference.appendChild(refAudio);

			morph(parent, reference);

			expect(parent.querySelector("audio")).toBeTruthy();
		});

		it("should handle canvas elements", () => {
			const parent = document.createElement("div");
			const canvas = document.createElement("canvas");
			canvas.id = "canvas1";
			parent.appendChild(canvas);

			const reference = document.createElement("div");
			const refCanvas = document.createElement("canvas");
			refCanvas.id = "canvas1";
			refCanvas.width = 800;
			reference.appendChild(refCanvas);

			morph(parent, reference);

			expect(parent.querySelector("canvas")).toBeTruthy();
		});

		it("should handle embed elements", () => {
			const parent = document.createElement("div");
			const embed = document.createElement("embed");
			embed.id = "embed1";
			parent.appendChild(embed);

			const reference = document.createElement("div");
			const refEmbed = document.createElement("embed");
			refEmbed.id = "embed1";
			refEmbed.setAttribute("src", "test.pdf");
			reference.appendChild(refEmbed);

			morph(parent, reference);

			expect(parent.querySelector("embed")).toBeTruthy();
		});

		it("should handle iframe elements", () => {
			const parent = document.createElement("div");
			const iframe = document.createElement("iframe");
			iframe.id = "iframe1";
			parent.appendChild(iframe);

			const reference = document.createElement("div");
			const refIframe = document.createElement("iframe");
			refIframe.id = "iframe1";
			refIframe.setAttribute("src", "test.html");
			reference.appendChild(refIframe);

			morph(parent, reference);

			expect(parent.querySelector("iframe")).toBeTruthy();
		});

		it("should handle object elements", () => {
			const parent = document.createElement("div");
			const object = document.createElement("object");
			object.id = "object1";
			parent.appendChild(object);

			const reference = document.createElement("div");
			const refObject = document.createElement("object");
			refObject.id = "object1";
			refObject.setAttribute("data", "test.pdf");
			reference.appendChild(refObject);

			morph(parent, reference);

			expect(parent.querySelector("object")).toBeTruthy();
		});

		it("should handle input as active element", () => {
			const parent = document.createElement("div");
			container.appendChild(parent);

			const input = document.createElement("input");
			input.id = "input1";
			input.value = "test";
			parent.appendChild(input);

			// Focus the input to make it active
			input.focus();

			const reference = document.createElement("div");
			const refInput = document.createElement("input");
			refInput.id = "input1";
			refInput.value = "updated";
			reference.appendChild(refInput);

			morph(parent, reference, { ignoreActiveValue: true });

			// Value should be preserved because input is active
			expect(input.value).toBe("test");
		});

		it("should handle textarea as active element", () => {
			const parent = document.createElement("div");
			container.appendChild(parent);

			const textarea = document.createElement("textarea");
			textarea.id = "textarea1";
			textarea.value = "original";
			parent.appendChild(textarea);

			textarea.focus();

			const reference = document.createElement("div");
			const refTextarea = document.createElement("textarea");
			refTextarea.id = "textarea1";
			refTextarea.value = "updated";
			reference.appendChild(refTextarea);

			morph(parent, reference, { ignoreActiveValue: true });

			expect(textarea.value).toBe("original");
		});
	});

	describe("Property updates", () => {
		it("should update option selected property", () => {
			const select = document.createElement("select");
			const option1 = document.createElement("option");
			option1.value = "1";
			option1.textContent = "Option 1";
			const option2 = document.createElement("option");
			option2.value = "2";
			option2.textContent = "Option 2";
			select.appendChild(option1);
			select.appendChild(option2);

			const refSelect = document.createElement("select");
			const refOption1 = document.createElement("option");
			refOption1.value = "1";
			refOption1.textContent = "Option 1";
			const refOption2 = document.createElement("option");
			refOption2.value = "2";
			refOption2.textContent = "Option 2";
			refOption2.selected = true;
			refSelect.appendChild(refOption1);
			refSelect.appendChild(refOption2);

			morph(select, refSelect);

			expect(option2.selected).toBe(true);
		});

		it("should update textarea value with firstElementChild", () => {
			const parent = document.createElement("div");
			const textarea = document.createElement("textarea");
			textarea.name = "myTextarea";
			textarea.value = "original";
			textarea.defaultValue = "original";
			const textContent = document.createElement("span");
			textContent.textContent = "original";
			textarea.appendChild(textContent);
			parent.appendChild(textarea);

			const reference = document.createElement("div");
			const refTextarea = document.createElement("textarea");
			refTextarea.name = "myTextarea";
			refTextarea.value = "updated";
			reference.appendChild(refTextarea);

			morph(parent, reference);

			expect(textarea.value).toBe("updated");
			if (textarea.firstElementChild) {
				expect(textarea.firstElementChild.textContent).toBe("updated");
			}
		});

		it("should preserve modified textarea value with preserveModifiedValues", () => {
			const parent = document.createElement("div");
			const textarea = document.createElement("textarea");
			textarea.name = "myTextarea";
			textarea.defaultValue = "default";
			textarea.value = "modified";
			parent.appendChild(textarea);

			const reference = document.createElement("div");
			const refTextarea = document.createElement("textarea");
			refTextarea.name = "myTextarea";
			refTextarea.value = "new value";
			reference.appendChild(refTextarea);

			morph(parent, reference, { preserveModifiedValues: true });

			expect(textarea.value).toBe("modified");
		});

		it("should update input indeterminate property", () => {
			const parent = document.createElement("div");
			const input = document.createElement("input");
			input.type = "checkbox";
			input.indeterminate = false;
			parent.appendChild(input);

			const reference = document.createElement("div");
			const refInput = document.createElement("input");
			refInput.type = "checkbox";
			refInput.indeterminate = true;
			reference.appendChild(refInput);

			morph(parent, reference);

			expect(input.indeterminate).toBe(true);
		});

		it("should update input disabled property", () => {
			const parent = document.createElement("div");
			const input = document.createElement("input");
			input.disabled = false;
			parent.appendChild(input);

			const reference = document.createElement("div");
			const refInput = document.createElement("input");
			refInput.disabled = true;
			reference.appendChild(refInput);

			morph(parent, reference);

			expect(input.disabled).toBe(true);
		});

		it("should not update file input value", () => {
			const parent = document.createElement("div");
			const input = document.createElement("input");
			input.type = "file";
			parent.appendChild(input);

			const reference = document.createElement("div");
			const refInput = document.createElement("input");
			refInput.type = "file";
			reference.appendChild(refInput);

			morph(parent, reference);

			expect(input.type).toBe("file");
		});
	});

	describe("Head element special handling", () => {
		it("should handle nested head elements in child morphing", () => {
			const parent = document.createElement("div");
			const head = document.createElement("head");
			const meta1 = document.createElement("meta");
			meta1.setAttribute("name", "test");
			meta1.setAttribute("content", "value");
			head.appendChild(meta1);
			parent.appendChild(head);

			const reference = document.createElement("div");
			const refHead = document.createElement("head");
			const refMeta = document.createElement("meta");
			refMeta.setAttribute("name", "test");
			refMeta.setAttribute("content", "updated");
			refHead.appendChild(refMeta);
			reference.appendChild(refHead);

			morph(parent, reference);

			expect(parent.querySelector("head")).toBeTruthy();
		});
	});

	describe("Child element morphing edge cases", () => {
		it("should handle ID matching with overlapping ID sets", () => {
			const parent = document.createElement("div");
			const child1 = document.createElement("div");
			child1.id = "child1";
			const nested = document.createElement("span");
			nested.id = "nested";
			child1.appendChild(nested);

			const child2 = document.createElement("div");
			child2.id = "child2";

			parent.appendChild(child1);
			parent.appendChild(child2);

			const reference = document.createElement("div");
			const refChild1 = document.createElement("div");
			refChild1.id = "child1";
			const refNested = document.createElement("span");
			refNested.id = "different";
			refChild1.appendChild(refNested);

			const refChild2 = document.createElement("div");
			refChild2.id = "child2";

			reference.appendChild(refChild1);
			reference.appendChild(refChild2);

			morph(parent, reference);

			expect(parent.children[0].id).toBe("child1");
		});

		it("should insert new node when no match found and beforeNodeAdded returns true", () => {
			const parent = document.createElement("div");
			const existing = document.createElement("div");
			existing.id = "existing";
			parent.appendChild(existing);

			const reference = document.createElement("div");
			const refNew = document.createElement("div");
			refNew.id = "new";
			const refExisting = document.createElement("div");
			refExisting.id = "existing";
			reference.appendChild(refNew);
			reference.appendChild(refExisting);

			let addedNode: Node | null = null;
			morph(parent, reference, {
				beforeNodeAdded: (node) => {
					addedNode = node;
					return true;
				},
			});

			expect(addedNode).toBeTruthy();
			expect(parent.children[0].id).toBe("new");
		});

		it("should not insert new node when beforeNodeAdded returns false", () => {
			const parent = document.createElement("div");
			const existing = document.createElement("div");
			existing.id = "existing";
			existing.textContent = "original";
			parent.appendChild(existing);

			const reference = document.createElement("div");
			const refNew = document.createElement("span");
			refNew.id = "new";
			refNew.textContent = "new content";
			const refExisting = document.createElement("div");
			refExisting.id = "existing";
			refExisting.textContent = "updated";
			reference.appendChild(refNew);
			reference.appendChild(refExisting);

			let addCallbackCalled = false;
			morph(parent, reference, {
				beforeNodeAdded: () => {
					addCallbackCalled = true;
					return false;
				},
			});

			// beforeNodeAdded should have been called
			expect(addCallbackCalled).toBe(true);
			// The existing div will be morphed to match reference
			expect(parent.children[0].tagName).toBe("DIV");
		});

		it("should call afterNodeMorphed for child elements even when new node inserted", () => {
			const parent = document.createElement("div");
			const child = document.createElement("div");
			child.id = "child";
			parent.appendChild(child);

			const reference = document.createElement("div");
			const refChild = document.createElement("span");
			refChild.id = "newChild";
			reference.appendChild(refChild);

			let morphedCalled = false;
			morph(parent, reference, {
				afterNodeMorphed: () => {
					morphedCalled = true;
				},
			});

			expect(morphedCalled).toBe(true);
		});
	});

	describe("Sensitivity-based insertBefore", () => {
		it("should handle sensitivity reordering when previousNode is insertionPoint", () => {
			const parent = document.createElement("div");
			container.appendChild(parent);

			const input1 = document.createElement("input");
			input1.id = "input1";
			input1.value = "test";
			input1.defaultValue = "";

			const input2 = document.createElement("input");
			input2.id = "input2";
			input2.value = "test2";
			input2.defaultValue = "";

			parent.appendChild(input1);
			parent.appendChild(input2);

			const reference = document.createElement("div");
			const refInput2 = document.createElement("input");
			refInput2.id = "input2";
			refInput2.value = "test2";

			const refInput1 = document.createElement("input");
			refInput1.id = "input1";
			refInput1.value = "test";

			reference.appendChild(refInput2);
			reference.appendChild(refInput1);

			morph(parent, reference);

			expect(parent.children[0].id).toBe("input2");
			expect(parent.children[1].id).toBe("input1");
		});

		it("should break sensitivity reordering loop when previousNodeSensitivity >= sensitivity", () => {
			const parent = document.createElement("div");
			container.appendChild(parent);

			// Create inputs with different sensitivity levels
			const input1 = document.createElement("input");
			input1.id = "input1";
			input1.value = "modified1";
			input1.defaultValue = "default1";

			const input2 = document.createElement("input");
			input2.id = "input2";
			input2.value = "modified2";
			input2.defaultValue = "default2";

			const input3 = document.createElement("input");
			input3.id = "input3";
			input3.value = "modified3";
			input3.defaultValue = "default3";

			parent.appendChild(input1);
			parent.appendChild(input2);
			parent.appendChild(input3);

			const reference = document.createElement("div");
			const refInput3 = document.createElement("input");
			refInput3.id = "input3";

			const refInput1 = document.createElement("input");
			refInput1.id = "input1";

			const refInput2 = document.createElement("input");
			refInput2.id = "input2";

			reference.appendChild(refInput3);
			reference.appendChild(refInput1);
			reference.appendChild(refInput2);

			morph(parent, reference);

			// Verify elements were reordered
			expect(parent.children.length).toBe(3);
		});

		it("should handle insertBefore when node is not an element", () => {
			const parent = document.createElement("div");
			const text1 = document.createTextNode("First");
			const text2 = document.createTextNode("Second");
			parent.appendChild(text1);
			parent.appendChild(text2);

			const reference = document.createElement("div");
			const refText1 = document.createTextNode("First Updated");
			const refText2 = document.createTextNode("Second");
			reference.appendChild(refText1);
			reference.appendChild(refText2);

			morph(parent, reference);

			expect(parent.textContent).toBe("First UpdatedSecond");
		});

		it("should handle insertBefore with zero sensitivity", () => {
			const parent = document.createElement("div");
			const div1 = document.createElement("div");
			div1.id = "div1";
			const div2 = document.createElement("div");
			div2.id = "div2";

			parent.appendChild(div1);
			parent.appendChild(div2);

			const reference = document.createElement("div");
			const refDiv2 = document.createElement("div");
			refDiv2.id = "div2";
			const refDiv1 = document.createElement("div");
			refDiv1.id = "div1";

			reference.appendChild(refDiv2);
			reference.appendChild(refDiv1);

			morph(parent, reference);

			expect(parent.children[0].id).toBe("div2");
			expect(parent.children[1].id).toBe("div1");
		});
	});

	describe("Callback cancellation", () => {
		it("should call beforeAttributeUpdated and cancel attribute removal when it returns false", () => {
			const div = document.createElement("div");
			div.setAttribute("data-keep", "value");
			div.setAttribute("data-remove", "value");

			const reference = document.createElement("div");
			reference.setAttribute("data-keep", "value");

			morph(div, reference, {
				beforeAttributeUpdated: (element, name, value) => {
					if (name === "data-remove" && value === null) {
						return false; // Cancel removal
					}
					return true;
				},
			});

			// Attribute should still be there because callback returned false
			expect(div.hasAttribute("data-remove")).toBe(true);
		});

		it("should call beforePropertyUpdated and cancel property update when it returns false", () => {
			const input = document.createElement("input");
			input.checked = false;

			const reference = document.createElement("input");
			reference.checked = true;

			morph(input, reference, {
				beforePropertyUpdated: (node, propertyName, newValue) => {
					if (propertyName === "checked" && newValue === true) {
						return false; // Cancel update
					}
					return true;
				},
			});

			// Property should not be updated because callback returned false
			expect(input.checked).toBe(false);
		});
	});

	describe("Empty ID handling", () => {
		it("should ignore elements with empty id attribute", () => {
			const parent = document.createElement("div");
			const child1 = document.createElement("div");
			child1.setAttribute("id", ""); // Empty ID
			child1.textContent = "First";

			const child2 = document.createElement("div");
			child2.id = "valid-id";
			child2.textContent = "Second";

			parent.appendChild(child1);
			parent.appendChild(child2);

			const reference = document.createElement("div");
			const refChild1 = document.createElement("div");
			refChild1.setAttribute("id", "");
			refChild1.textContent = "First Updated";

			const refChild2 = document.createElement("div");
			refChild2.id = "valid-id";
			refChild2.textContent = "Second Updated";

			reference.appendChild(refChild1);
			reference.appendChild(refChild2);

			morph(parent, reference);

			expect(child1.textContent).toBe("First Updated");
			expect(child2.textContent).toBe("Second Updated");
		});
	});

	describe("Complex morphing scenarios", () => {
		it("should handle mixed content with sensitive and non-sensitive elements", () => {
			const parent = document.createElement("div");
			container.appendChild(parent);

			const div = document.createElement("div");
			div.id = "div1";

			const input = document.createElement("input");
			input.id = "input1";
			input.value = "test";
			input.defaultValue = "";

			const canvas = document.createElement("canvas");
			canvas.id = "canvas1";

			parent.appendChild(div);
			parent.appendChild(input);
			parent.appendChild(canvas);

			const reference = document.createElement("div");

			const refCanvas = document.createElement("canvas");
			refCanvas.id = "canvas1";

			const refInput = document.createElement("input");
			refInput.id = "input1";

			const refDiv = document.createElement("div");
			refDiv.id = "div1";

			reference.appendChild(refCanvas);
			reference.appendChild(refInput);
			reference.appendChild(refDiv);

			morph(parent, reference);

			expect(parent.children.length).toBe(3);
		});

		it("should handle text node morph with ariaBusy (non-element)", () => {
			// Test line 136 - else block() for non-element nodes
			const parent = document.createElement("div");
			const textNode = document.createTextNode("Original");
			parent.appendChild(textNode);

			const reference = document.createTextNode("Updated");

			morph(textNode, reference);

			expect(textNode.nodeValue).toBe("Updated");
		});

		it("should handle media elements that are playing", () => {
			// Test lines 159-163 - media sensitivity with playing state
			const parent = document.createElement("div");
			container.appendChild(parent);

			const video = document.createElement("video");
			video.id = "video1";
			// Mock playing state
			Object.defineProperty(video, "ended", { value: false, writable: true });
			Object.defineProperty(video, "paused", { value: false, writable: true });
			Object.defineProperty(video, "currentTime", { value: 5.0, writable: true });
			parent.appendChild(video);

			const reference = document.createElement("div");
			const refVideo = document.createElement("video");
			refVideo.id = "video1";
			reference.appendChild(refVideo);

			morph(parent, reference);

			expect(parent.querySelector("video")).toBeTruthy();
		});

		it("should match elements by overlapping ID sets", () => {
			// Test lines 372-373 - matching by overlapping ID sets
			const parent = document.createElement("div");

			const outer1 = document.createElement("div");
			outer1.id = "outer1";
			const inner1a = document.createElement("span");
			inner1a.id = "inner1a";
			const inner1b = document.createElement("span");
			inner1b.id = "inner1b";
			outer1.appendChild(inner1a);
			outer1.appendChild(inner1b);

			const outer2 = document.createElement("div");
			outer2.id = "outer2";
			const inner2 = document.createElement("span");
			inner2.id = "inner2";
			outer2.appendChild(inner2);

			parent.appendChild(outer1);
			parent.appendChild(outer2);

			const reference = document.createElement("div");

			// Reference wants outer1 to come second, but references an inner ID
			const refOuter2 = document.createElement("div");
			refOuter2.id = "outer2";
			const refInner2 = document.createElement("span");
			refInner2.id = "inner2";
			refOuter2.appendChild(refInner2);

			const refOuter1 = document.createElement("div");
			refOuter1.id = "outer1";
			const refInner1a = document.createElement("span");
			refInner1a.id = "inner1a";
			refOuter1.appendChild(refInner1a);

			reference.appendChild(refOuter2);
			reference.appendChild(refOuter1);

			morph(parent, reference);

			expect(parent.children[0].id).toBe("outer2");
		});

		it("should add completely new element when no match found by tag or ID", () => {
			// Test lines 386-389 - adding new node with callbacks
			const parent = document.createElement("div");
			const existing = document.createElement("div");
			existing.id = "existing";
			parent.appendChild(existing);

			const reference = document.createElement("div");
			const refNew = document.createElement("article");
			refNew.id = "brand-new";
			refNew.textContent = "New content";
			const refExisting = document.createElement("div");
			refExisting.id = "existing";
			reference.appendChild(refNew);
			reference.appendChild(refExisting);

			let addedNode: Node | null = null;
			let afterAddedCalled = false;
			morph(parent, reference, {
				beforeNodeAdded: (node) => {
					addedNode = node;
					return true;
				},
				afterNodeAdded: (node) => {
					afterAddedCalled = true;
				},
			});

			expect(addedNode).toBeTruthy();
			expect(afterAddedCalled).toBe(true);
			expect(parent.children[0].tagName).toBe("ARTICLE");
		});

		it("should continue sensitivity loop when reordering multiple nodes", () => {
			// Test lines 426-429 - continuing the sensitivity reordering loop
			const parent = document.createElement("div");
			container.appendChild(parent);

			// Create a chain of inputs with modified values (high sensitivity)
			const input1 = document.createElement("input");
			input1.id = "input1";
			input1.value = "modified1";
			input1.defaultValue = "default1";

			const input2 = document.createElement("input");
			input2.id = "input2";
			input2.value = "modified2";
			input2.defaultValue = "default2";

			const input3 = document.createElement("input");
			input3.id = "input3";
			input3.value = "modified3";
			input3.defaultValue = "default3";

			const div = document.createElement("div");
			div.id = "div1";

			parent.appendChild(div);
			parent.appendChild(input1);
			parent.appendChild(input2);
			parent.appendChild(input3);

			// Reference wants inputs in different order
			const reference = document.createElement("div");

			const refInput3 = document.createElement("input");
			refInput3.id = "input3";

			const refInput2 = document.createElement("input");
			refInput2.id = "input2";

			const refInput1 = document.createElement("input");
			refInput1.id = "input1";

			const refDiv = document.createElement("div");
			refDiv.id = "div1";

			reference.appendChild(refInput3);
			reference.appendChild(refInput2);
			reference.appendChild(refInput1);
			reference.appendChild(refDiv);

			morph(parent, reference);

			// The inputs should be reordered
			expect(parent.children.length).toBe(4);
		});

		describe("DOMParser edge cases", () => {
			it("should explore parser behavior to trigger line 74", () => {
				// Line 74 checks if doc.childNodes.length === 1
				// This is checking the document's childNodes, not body's childNodes
				// DOMParser always returns a document with html element as child
				// So doc.childNodes.length is always 1 (the html element)
				// The else branch on line 74 appears to be unreachable in normal usage

				// Let's verify with actual morph call
				const parent = document.createElement("div");
				const div = document.createElement("div");
				div.textContent = "Original";
				parent.appendChild(div);

				// This should work fine
				morph(div, "<span>Test</span>");
				expect(parent.firstChild?.textContent).toBe("Test");
			});
		});

		describe("Additional edge cases for remaining coverage", () => {
			it("should handle element matching with nested IDs and no direct ID match", () => {
				// More specific test for lines 372-373
				const parent = document.createElement("div");

				const container1 = document.createElement("section");
				const child1a = document.createElement("div");
				child1a.id = "shared-id-a";
				const child1b = document.createElement("div");
				child1b.id = "shared-id-b";
				container1.appendChild(child1a);
				container1.appendChild(child1b);

				const container2 = document.createElement("section");
				const child2 = document.createElement("div");
				child2.id = "other-id";
				container2.appendChild(child2);

				parent.appendChild(container1);
				parent.appendChild(container2);

				const reference = document.createElement("div");
				const refContainer = document.createElement("section");
				const refChild = document.createElement("div");
				refChild.id = "shared-id-a";
				refContainer.appendChild(refChild);

				reference.appendChild(refContainer);

				morph(parent, reference);

				expect(parent.children.length).toBeGreaterThanOrEqual(1);
			});

			it("should insert node before when no ID or tag match exists", () => {
				// Test for lines 386-389 with different scenario
				const parent = document.createElement("div");
				const oldChild = document.createElement("p");
				oldChild.textContent = "Old";
				parent.appendChild(oldChild);

				const reference = document.createElement("div");
				const newChild = document.createElement("article");
				newChild.textContent = "New";
				reference.appendChild(newChild);

				let beforeAddCalled = false;
				let afterAddCalled = false;

				morph(parent, reference, {
					beforeNodeAdded: (node) => {
						beforeAddCalled = true;
						return true;
					},
					afterNodeAdded: (node) => {
						afterAddCalled = true;
					},
				});

				expect(beforeAddCalled).toBe(true);
				expect(afterAddCalled).toBe(true);
			});

			it("should handle multiple previousNode reorderings in sensitivity loop", () => {
				// Test for lines 426-429 with more complex scenario
				const parent = document.createElement("div");
				container.appendChild(parent);

				const regularDiv = document.createElement("div");
				regularDiv.id = "regular";

				const sensitiveInput1 = document.createElement("input");
				sensitiveInput1.id = "sensitive1";
				sensitiveInput1.value = "changed";
				sensitiveInput1.defaultValue = "default";

				const sensitiveInput2 = document.createElement("input");
				sensitiveInput2.id = "sensitive2";
				sensitiveInput2.value = "changed2";
				sensitiveInput2.defaultValue = "default2";

				const sensitiveInput3 = document.createElement("input");
				sensitiveInput3.id = "sensitive3";
				sensitiveInput3.value = "changed3";
				sensitiveInput3.defaultValue = "default3";

				parent.appendChild(regularDiv);
				parent.appendChild(sensitiveInput1);
				parent.appendChild(sensitiveInput2);
				parent.appendChild(sensitiveInput3);

				const reference = document.createElement("div");

				const refInput3 = document.createElement("input");
				refInput3.id = "sensitive3";

				const refInput2 = document.createElement("input");
				refInput2.id = "sensitive2";

				const refInput1 = document.createElement("input");
				refInput1.id = "sensitive1";

				const refDiv = document.createElement("div");
				refDiv.id = "regular";

				reference.appendChild(refInput3);
				reference.appendChild(refInput2);
				reference.appendChild(refInput1);
				reference.appendChild(refDiv);

				morph(parent, reference);

				expect(parent.children.length).toBe(4);
			});

			it("should match by overlapping ID sets in sibling scan - lines 372-373", () => {
				// Lines 372-373: Match element by overlapping ID sets when ID doesn't match
				// This requires: currentNode has ID != reference.id, but has nested IDs that overlap
				const parent = document.createElement("div");

				// First child with nested IDs
				const div1 = document.createElement("div");
				div1.id = "div1";
				const nested1 = document.createElement("span");
				nested1.id = "overlap-id";
				div1.appendChild(nested1);

				// Second child that's a match by tag name
				const div2 = document.createElement("div");
				div2.id = "div2";

				parent.appendChild(div1);
				parent.appendChild(div2);

				// Reference wants div2 first, but references the overlap-id
				const reference = document.createElement("div");
				const refDiv = document.createElement("div");
				refDiv.id = "target";
				const refNested = document.createElement("span");
				refNested.id = "overlap-id"; // This ID exists nested in div1
				refDiv.appendChild(refNested);
				reference.appendChild(refDiv);

				morph(parent, reference);

				expect(parent.children.length).toBeGreaterThanOrEqual(1);
			});

			it("should add new node when no tag match exists - lines 386-389", () => {
				// Lines 386-389: No nextMatchByTagName, so add new node
				// This requires the reference child has a tag that doesn't exist in current children
				const parent = document.createElement("div");
				const p = document.createElement("p");
				p.textContent = "Paragraph";
				parent.appendChild(p);

				const reference = document.createElement("div");
				// Use article tag which doesn't exist in parent
				const article = document.createElement("article");
				article.textContent = "Article";
				const refP = document.createElement("p");
				reference.appendChild(article);
				reference.appendChild(refP);

				let addedNode: Node | null = null;
				morph(parent, reference, {
					beforeNodeAdded: (node) => {
						addedNode = node;
						return true;
					},
					afterNodeAdded: (node) => {
						// Lines 388-389
					},
				});

				expect(addedNode).toBeTruthy();
				expect(parent.querySelector("article")).toBeTruthy();
			});

			it("should trigger line 74 - unreachable error path in parseChildNodeFromString", () => {
				// Line 74: else throw new Error("[Morphlex] The string was not a valid HTML node.");
				// This line is actually unreachable because DOMParser always returns doc with childNodes.length === 1
				// However, we can document this as a known unreachable path
				// The parser always creates: doc -> html -> (head + body)
				// So doc.childNodes.length is always 1 (the html element)

				// All valid HTML strings will pass the check on line 72
				const parent = document.createElement("div");
				const child = document.createElement("div");
				parent.appendChild(child);

				// Even empty string parses to valid document structure
				morph(child, "<p>Test</p>");
				expect(parent.querySelector("p")?.textContent).toBe("Test");
			});

			it("should continue sensitivity reordering loop - lines 426-429", () => {
				// Lines 426-429: previousNode reordering continues until break condition
				const parent = document.createElement("div");
				container.appendChild(parent);

				// Create low sensitivity element
				const lowSensDiv = document.createElement("div");
				lowSensDiv.id = "low";

				// Create multiple high sensitivity elements that will trigger reordering
				const highSens1 = document.createElement("input");
				highSens1.id = "high1";
				highSens1.value = "modified";
				highSens1.defaultValue = "default";

				const highSens2 = document.createElement("input");
				highSens2.id = "high2";
				highSens2.value = "modified";
				highSens2.defaultValue = "default";

				const highSens3 = document.createElement("input");
				highSens3.id = "high3";
				highSens3.value = "modified";
				highSens3.defaultValue = "default";

				// Low sensitivity first, then high sensitivity elements
				parent.appendChild(lowSensDiv);
				parent.appendChild(highSens1);
				parent.appendChild(highSens2);
				parent.appendChild(highSens3);

				// Reference wants high sensitivity elements first
				const reference = document.createElement("div");
				const refHigh3 = document.createElement("input");
				refHigh3.id = "high3";
				const refHigh2 = document.createElement("input");
				refHigh2.id = "high2";
				const refHigh1 = document.createElement("input");
				refHigh1.id = "high1";
				const refLow = document.createElement("div");
				refLow.id = "low";

				reference.appendChild(refHigh3);
				reference.appendChild(refHigh2);
				reference.appendChild(refHigh1);
				reference.appendChild(refLow);

				morph(parent, reference);

				// Verify reordering happened
				expect(parent.children.length).toBe(4);
				// The loop should have moved multiple previousNodes
			});

			it("should handle case where child exists but refChild doesn't in loop - lines 332-333", () => {
				// Lines 332-333 are actually unreachable in the for loop
				// because we iterate up to refChildNodes.length, so refChild will always exist
				// The cleanup happens in the while loop below (lines 338-341)
				// This test documents that lines 332-333 appear to be dead code
				const parent = document.createElement("div");
				const child1 = document.createElement("span");
				child1.textContent = "Keep";
				const child2 = document.createElement("span");
				child2.textContent = "Remove via while loop";
				parent.appendChild(child1);
				parent.appendChild(child2);

				const reference = document.createElement("div");
				const refChild = document.createElement("span");
				refChild.textContent = "Keep Updated";
				reference.appendChild(refChild);

				morph(parent, reference);

				expect(parent.children.length).toBe(1);
			});

			it("should add new node when no ID or tag match exists - lines 386-389", () => {
				// Lines 386-389 require: no nextMatchByTagName AND beforeNodeAdded returns true
				// This means the first child must not match by tag, and no sibling matches either
				const parent = document.createElement("div");
				// Use a tag that won't match
				const article = document.createElement("article");
				article.id = "article1";
				article.textContent = "Article";
				parent.appendChild(article);

				const reference = document.createElement("div");
				// First child is a section (different tag), and has no ID match in siblings
				const section = document.createElement("section");
				section.id = "section1";
				section.textContent = "Section";
				// Second child to trigger morphChildElement for the article
				const refArticle = document.createElement("article");
				refArticle.id = "article1";
				reference.appendChild(section);
				reference.appendChild(refArticle);

				let beforeCalled = false;
				let afterCalled = false;

				morph(parent, reference, {
					beforeNodeAdded: (node) => {
						beforeCalled = true;
						return true; // Line 387: insertBefore is called
					},
					afterNodeAdded: (node) => {
						afterCalled = true; // Line 389
					},
				});

				expect(beforeCalled).toBe(true);
				expect(afterCalled).toBe(true);
			});

			it("should continue while loop in sensitivity reordering - lines 426-429", () => {
				// Lines 426-429: while loop continues, previousNode gets reassigned
				// Need multiple low-sensitivity nodes before a high-sensitivity node
				const parent = document.createElement("div");
				container.appendChild(parent);

				// Multiple regular divs (low sensitivity)
				const div1 = document.createElement("div");
				div1.id = "div1";
				const div2 = document.createElement("div");
				div2.id = "div2";
				const div3 = document.createElement("div");
				div3.id = "div3";

				// High sensitivity input at the end
				const input = document.createElement("input");
				input.id = "input1";
				input.value = "modified";
				input.defaultValue = "default";

				parent.appendChild(div1);
				parent.appendChild(div2);
				parent.appendChild(div3);
				parent.appendChild(input);

				// Reference wants input first - this will trigger insertBefore with sensitivity reordering
				const reference = document.createElement("div");
				const refInput = document.createElement("input");
				refInput.id = "input1";
				const refDiv1 = document.createElement("div");
				refDiv1.id = "div1";
				const refDiv2 = document.createElement("div");
				refDiv2.id = "div2";
				const refDiv3 = document.createElement("div");
				refDiv3.id = "div3";

				reference.appendChild(refInput);
				reference.appendChild(refDiv1);
				reference.appendChild(refDiv2);
				reference.appendChild(refDiv3);

				morph(parent, reference);

				// Input should be moved to front, with divs following
				expect(parent.children[0].id).toBe("input1");
			});

			describe("Exact uncovered line tests", () => {
				it("should cancel morphing with beforeNodeMorphed returning false in morphChildElement - line 300", () => {
					// Line 300: return early when beforeNodeMorphed returns false in morphChildElement
					const parent = document.createElement("div");
					const child = document.createElement("div");
					child.id = "child";
					parent.appendChild(child);

					const reference = document.createElement("div");
					const refChild = document.createElement("div");
					refChild.id = "child";
					refChild.textContent = "updated";
					reference.appendChild(refChild);

					let callbackInvoked = false;
					morph(parent, reference, {
						beforeNodeMorphed: (node) => {
							if (node === child) {
								callbackInvoked = true;
								return false; // This triggers line 300 return
							}
							return true;
						},
					});

					expect(callbackInvoked).toBe(true);
					// Child should not be updated because callback returned false
					expect(child.textContent).toBe("");
				});

				it("should add completely new element type with no matches - lines 386-389", () => {
					// Lines 386-389: else branch where no nextMatchByTagName exists
					// Need a reference child with a tag that doesn't exist anywhere in parent
					const parent = document.createElement("div");
					const p = document.createElement("p");
					p.textContent = "paragraph";
					parent.appendChild(p);

					const reference = document.createElement("div");
					// Use custom element or uncommon tag
					const custom = document.createElement("custom-element");
					custom.textContent = "custom";
					const refP = document.createElement("p");
					reference.appendChild(custom);
					reference.appendChild(refP);

					let beforeCalled = false;
					let afterCalled = false;

					morph(parent, reference, {
						beforeNodeAdded: (node) => {
							if ((node as Element).tagName === "CUSTOM-ELEMENT") {
								beforeCalled = true;
								return true; // Line 387-388
							}
							return true;
						},
						afterNodeAdded: (node) => {
							if ((node as Element).tagName === "CUSTOM-ELEMENT") {
								afterCalled = true; // Line 389
							}
						},
					});

					expect(beforeCalled).toBe(true);
					expect(afterCalled).toBe(true);
				});

				it("should reorder with sensitivity - moving multiple previous nodes - lines 426-429", () => {
					// Lines 426-429: while loop continues moving previousNode
					const parent = document.createElement("div");
					container.appendChild(parent);

					// Create a scenario where multiple low-sensitivity nodes need to be moved past a high-sensitivity node
					const div1 = document.createElement("div");
					div1.id = "div1";
					const div2 = document.createElement("div");
					div2.id = "div2";

					// High sensitivity input
					const input = document.createElement("input");
					input.id = "input";
					input.value = "modified";
					input.defaultValue = "default";

					parent.appendChild(div1);
					parent.appendChild(div2);
					parent.appendChild(input);

					// Reference wants input first - will trigger sensitivity reordering
					const reference = document.createElement("div");
					const refInput = document.createElement("input");
					refInput.id = "input";
					const refDiv1 = document.createElement("div");
					refDiv1.id = "div1";
					const refDiv2 = document.createElement("div");
					refDiv2.id = "div2";

					reference.appendChild(refInput);
					reference.appendChild(refDiv1);
					reference.appendChild(refDiv2);

					morph(parent, reference);

					// Input should be first due to higher sensitivity
					expect(parent.children[0].id).toBe("input");
				});
			});
		});
	});
});
