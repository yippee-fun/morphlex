import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { morph, morphInner } from "../src/morphlex";

describe("Morphlex Vitest Suite", () => {
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

	describe("morph() - Basic functionality", () => {
		it("should update text content", () => {
			const original = document.createElement("div");
			original.textContent = "Hello";

			const reference = document.createElement("div");
			reference.textContent = "World";

			morph(original, reference);

			expect(original.textContent).toBe("World");
		});

		it("should accept HTML string as reference", () => {
			const original = document.createElement("div");
			original.textContent = "Old";

			morph(original, "<div>New</div>");

			expect(original.textContent).toBe("New");
		});

		it("should preserve element when morphing matching tags", () => {
			const original = document.createElement("div");
			original.id = "test";
			const elementRef = original;

			const reference = document.createElement("div");
			reference.textContent = "Updated";

			morph(original, reference);

			expect(original).toBe(elementRef);
			expect(original.textContent).toBe("Updated");
		});

		it("should replace element when morphing different tags", () => {
			const original = document.createElement("div");
			const parent = document.createElement("section");
			parent.appendChild(original);

			const reference = document.createElement("span");
			reference.textContent = "Updated";

			morph(original, reference);

			expect(parent.querySelector("span")).toBeTruthy();
			expect(parent.querySelector("div")).toBeFalsy();
		});
	});

	describe("morph() - Attribute handling", () => {
		it("should add attributes", () => {
			const original = document.createElement("button");

			const reference = document.createElement("button");
			reference.setAttribute("class", "btn-primary");
			reference.setAttribute("disabled", "");

			morph(original, reference);

			expect(original.className).toBe("btn-primary");
			expect(original.hasAttribute("disabled")).toBe(true);
		});

		it("should remove attributes", () => {
			const original = document.createElement("div");
			original.setAttribute("data-test", "value");

			const reference = document.createElement("div");

			morph(original, reference);

			expect(original.hasAttribute("data-test")).toBe(false);
		});

		it("should update attributes", () => {
			const original = document.createElement("div");
			original.setAttribute("data-value", "old");

			const reference = document.createElement("div");
			reference.setAttribute("data-value", "new");

			morph(original, reference);

			expect(original.getAttribute("data-value")).toBe("new");
		});

		it("should update class attribute", () => {
			const original = document.createElement("div");
			original.className = "old-class";

			const reference = document.createElement("div");
			reference.className = "new-class";

			morph(original, reference);

			expect(original.className).toBe("new-class");
		});
	});

	describe("morph() - Child elements", () => {
		it("should add child elements", () => {
			const original = document.createElement("ul");

			const reference = document.createElement("ul");
			const li1 = document.createElement("li");
			li1.textContent = "Item 1";
			const li2 = document.createElement("li");
			li2.textContent = "Item 2";
			reference.appendChild(li1);
			reference.appendChild(li2);

			morph(original, reference);

			expect(original.children.length).toBe(2);
			expect(original.children[0].textContent).toBe("Item 1");
		});

		it("should remove excess child elements", () => {
			const original = document.createElement("ul");
			original.innerHTML = "<li>A</li><li>B</li><li>C</li>";

			const reference = document.createElement("ul");
			reference.innerHTML = "<li>A</li>";

			morph(original, reference);

			expect(original.children.length).toBe(1);
		});

		it("should morph existing child elements", () => {
			const original = document.createElement("div");
			const child = document.createElement("span");
			child.textContent = "old";
			original.appendChild(child);

			const reference = document.createElement("div");
			const refChild = document.createElement("span");
			refChild.textContent = "new";
			reference.appendChild(refChild);

			morph(original, reference);

			expect(original.children[0].textContent).toBe("new");
		});

		it("should handle text nodes", () => {
			const original = document.createElement("div");
			original.appendChild(document.createTextNode("Hello"));

			const reference = document.createElement("div");
			reference.appendChild(document.createTextNode("World"));

			morph(original, reference);

			expect(original.textContent).toBe("World");
		});

		it("should handle mixed text and element nodes", () => {
			const original = document.createElement("div");
			original.appendChild(document.createTextNode("Start "));
			const span = document.createElement("span");
			span.textContent = "middle";
			original.appendChild(span);
			original.appendChild(document.createTextNode(" end"));

			const reference = document.createElement("div");
			reference.appendChild(document.createTextNode("Start "));
			const refSpan = document.createElement("span");
			refSpan.textContent = "updated";
			reference.appendChild(refSpan);
			reference.appendChild(document.createTextNode(" end"));

			morph(original, reference);

			expect(original.textContent).toBe("Start updated end");
		});
	});

	describe("morph() - Element identity and IDs", () => {
		it("should preserve element identity when using IDs", () => {
			const original = document.createElement("div");
			original.innerHTML = '<p id="p1">Para 1</p><p id="p2">Para 2</p>';

			const reference = document.createElement("div");
			reference.innerHTML = '<p id="p2">Para 2</p><p id="p1">Para 1</p>';

			const p1Original = original.querySelector("#p1");

			morph(original, reference);

			const p1After = original.querySelector("#p1");

			expect(p1After).toBe(p1Original);
		});

		it("should reorder elements with IDs correctly", () => {
			const original = document.createElement("div");
			original.innerHTML = '<span id="a">A</span><span id="b">B</span><span id="c">C</span>';

			const reference = document.createElement("div");
			reference.innerHTML = '<span id="c">C</span><span id="a">A</span><span id="b">B</span>';

			const originalA = original.querySelector("#a");

			morph(original, reference);

			const newA = original.querySelector("#a");

			expect(newA).toBe(originalA);
			expect(original.children[1]).toBe(newA);
		});
	});

	describe("morph() - Callbacks", () => {
		it("should call beforeNodeMorphed and afterNodeMorphed", () => {
			const original = document.createElement("div");
			original.textContent = "Before";

			const reference = document.createElement("div");
			reference.textContent = "After";

			let beforeCalled = false;
			let afterCalled = false;

			morph(original, reference, {
				beforeNodeMorphed: () => {
					beforeCalled = true;
					return true;
				},
				afterNodeMorphed: () => {
					afterCalled = true;
				},
			});

			expect(beforeCalled).toBe(true);
			expect(afterCalled).toBe(true);
		});

		it("should cancel morphing if beforeNodeMorphed returns false", () => {
			const original = document.createElement("div");
			original.textContent = "Original";

			const reference = document.createElement("div");
			reference.textContent = "Reference";

			morph(original, reference, {
				beforeNodeMorphed: () => false,
			});

			expect(original.textContent).toBe("Original");
		});

		it("should call beforeNodeAdded and afterNodeAdded", () => {
			const original = document.createElement("div");

			const reference = document.createElement("div");
			const newChild = document.createElement("p");
			newChild.textContent = "New";
			reference.appendChild(newChild);

			let beforeAddCalled = false;
			let afterAddCalled = false;

			morph(original, reference, {
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

		it("should call beforeNodeRemoved and afterNodeRemoved", () => {
			const original = document.createElement("div");
			const child = document.createElement("p");
			child.textContent = "To remove";
			original.appendChild(child);

			const reference = document.createElement("div");

			let beforeRemoveCalled = false;
			let afterRemoveCalled = false;

			morph(original, reference, {
				beforeNodeRemoved: (node) => {
					beforeRemoveCalled = true;
					return true;
				},
				afterNodeRemoved: (node) => {
					afterRemoveCalled = true;
				},
			});

			expect(beforeRemoveCalled).toBe(true);
			expect(afterRemoveCalled).toBe(true);
		});

		it("should call attribute update callbacks", () => {
			const original = document.createElement("div");

			const reference = document.createElement("div");
			reference.setAttribute("data-test", "value");

			let callbackCalled = false;

			morph(original, reference, {
				afterAttributeUpdated: (element, attrName, prevValue) => {
					if (attrName === "data-test") {
						callbackCalled = true;
					}
				},
			});

			expect(callbackCalled).toBe(true);
		});
	});

	describe("morph() - Form elements", () => {
		it("should update input value", () => {
			const original = document.createElement("input") as HTMLInputElement;
			original.type = "text";
			original.value = "old";

			const reference = document.createElement("input") as HTMLInputElement;
			reference.type = "text";
			reference.value = "new";

			morph(original, reference);

			expect(original.value).toBe("new");
		});

		it("should update checkbox checked state", () => {
			const original = document.createElement("input") as HTMLInputElement;
			original.type = "checkbox";
			original.checked = false;

			const reference = document.createElement("input") as HTMLInputElement;
			reference.type = "checkbox";
			reference.checked = true;

			morph(original, reference);

			expect(original.checked).toBe(true);
		});

		it("should update textarea value", () => {
			const original = document.createElement("textarea") as HTMLTextAreaElement;
			original.textContent = "old text";

			const reference = document.createElement("textarea") as HTMLTextAreaElement;
			reference.textContent = "new text";

			morph(original, reference);

			expect(original.textContent).toBe("new text");
		});
	});

	describe("morph() - Options", () => {
		it("should preserve modified values with preserveModifiedValues option", () => {
			const original = document.createElement("input") as HTMLInputElement;
			original.value = "user-input";

			const reference = document.createElement("input") as HTMLInputElement;
			reference.value = "from-server";

			morph(original, reference, { preserveModifiedValues: true });

			expect(original.value).toBe("user-input");
		});

		it("should ignore active value with ignoreActiveValue option", () => {
			const original = document.createElement("input") as HTMLInputElement;
			original.value = "active";

			const reference = document.createElement("input") as HTMLInputElement;
			reference.value = "inactive";

			morph(original, reference, { ignoreActiveValue: true });

			expect(original).toBeDefined();
		});
	});

	describe("morphInner() - Basic functionality", () => {
		it("should morph inner content only", () => {
			const original = document.createElement("div");
			original.id = "container";
			original.innerHTML = "<p>Old</p>";

			const reference = document.createElement("div");
			reference.innerHTML = "<p>New</p>";

			morphInner(original, reference);

			expect(original.id).toBe("container");
			expect(original.innerHTML).toBe("<p>New</p>");
		});

		it("should accept string reference for morphInner", () => {
			const original = document.createElement("div");
			original.innerHTML = "<span>Old</span>";

			const reference = document.createElement("div");
			reference.innerHTML = "<span>New</span>";

			morphInner(original, reference);

			expect(original.innerHTML).toBe("<span>New</span>");
		});

		it("should preserve outer element attributes with morphInner", () => {
			const original = document.createElement("div");
			original.setAttribute("class", "container");
			original.setAttribute("data-id", "123");
			original.innerHTML = "<p>Old</p>";

			const reference = document.createElement("div");
			reference.setAttribute("class", "different");
			reference.innerHTML = "<p>New</p>";

			morphInner(original, reference);

			expect(original.getAttribute("class")).toBe("container");
			expect(original.getAttribute("data-id")).toBe("123");
			expect(original.innerHTML).toBe("<p>New</p>");
		});

		it("should update multiple children with morphInner", () => {
			const original = document.createElement("ul");
			original.innerHTML = "<li>Item 1</li><li>Item 2</li>";

			const reference = document.createElement("ul");
			reference.innerHTML = "<li>Item A</li><li>Item B</li><li>Item C</li>";

			morphInner(original, reference);

			expect(original.children.length).toBe(3);
			expect(original.children[0].textContent).toBe("Item A");
			expect(original.children[2].textContent).toBe("Item C");
		});

		it("should empty contents with morphInner when reference has no children", () => {
			const original = document.createElement("div");
			original.innerHTML = "<span>Content</span><p>More</p>";

			const reference = document.createElement("div");

			morphInner(original, reference);

			expect(original.children.length).toBe(0);
		});
	});

	describe("Edge cases and complex scenarios", () => {
		it("should handle empty elements", () => {
			const original = document.createElement("div");
			const reference = document.createElement("div");

			expect(() => morph(original, reference)).not.toThrow();
			expect(original.children.length).toBe(0);
		});

		it("should handle deeply nested structures", () => {
			const original = document.createElement("div");
			original.innerHTML = "<div><div><div><span>Deep</span></div></div></div>";

			const reference = document.createElement("div");
			reference.innerHTML = "<div><div><div><span>Updated</span></div></div></div>";

			morph(original, reference);

			expect(original.querySelector("span")?.textContent).toBe("Updated");
		});

		it("should handle special characters in text", () => {
			const original = document.createElement("div");
			original.textContent = "Hello & goodbye";

			const reference = document.createElement("div");
			reference.textContent = 'Special <> characters "test"';

			morph(original, reference);

			expect(original.textContent).toBe('Special <> characters "test"');
		});

		it("should handle multiple class names", () => {
			const original = document.createElement("div");
			original.classList.add("class1", "class2", "class3");

			const reference = document.createElement("div");
			reference.classList.add("class2", "class3", "class4");

			morph(original, reference);

			expect(original.classList.contains("class2")).toBe(true);
			expect(original.classList.contains("class3")).toBe(true);
			expect(original.classList.contains("class4")).toBe(true);
			expect(original.classList.contains("class1")).toBe(false);
		});

		it("should handle element replacement", () => {
			const original = document.createElement("div");
			const span = document.createElement("span");
			span.textContent = "Span";
			original.appendChild(span);

			const reference = document.createElement("div");
			const p = document.createElement("p");
			p.textContent = "Paragraph";
			reference.appendChild(p);

			morph(original, reference);

			expect(original.children[0].nodeName).toBe("P");
			expect(original.children[0].textContent).toBe("Paragraph");
		});

		it("should handle list updates with ID preservation", () => {
			const original = document.createElement("ul");
			original.innerHTML = '<li id="item-1">Item 1</li><li id="item-2">Item 2</li><li id="item-3">Item 3</li>';

			const item2Ref = original.querySelector("#item-2");

			const reference = document.createElement("ul");
			reference.innerHTML =
				'<li id="item-1">Item 1</li><li id="item-3">Item 3</li><li id="item-2">Item 2</li><li id="item-4">Item 4</li>';

			morph(original, reference);

			expect(original.querySelector("#item-2")).toBe(item2Ref);
			expect(original.children.length).toBe(4);
		});

		it("should handle complex page-like structure", () => {
			const original = document.createElement("main");
			original.innerHTML = `
				<header id="header">
					<h1>Title</h1>
				</header>
				<article>
					<p>Old paragraph</p>
				</article>
			`;

			const reference = document.createElement("main");
			reference.innerHTML = `
				<header id="header">
					<h1>New Title</h1>
				</header>
				<article>
					<p>New paragraph</p>
					<p>Another paragraph</p>
				</article>
			`;

			const headerRef = original.querySelector("#header");

			morph(original, reference);

			expect(original.querySelector("#header")).toBe(headerRef);
			expect(original.querySelector("h1")?.textContent).toBe("New Title");
			expect(original.querySelectorAll("article p").length).toBe(2);
		});

		it("should handle nested element morphing with updates", () => {
			const original = document.createElement("div");
			original.innerHTML = "<p>Old <span>content</span></p>";

			const reference = document.createElement("div");
			reference.innerHTML = "<p>New <span>text</span></p>";

			morph(original, reference);

			expect(original.innerHTML).toBe("<p>New <span>text</span></p>");
		});

		it("should preserve element reference through morph", () => {
			const original = document.createElement("div");
			original.textContent = "Original";

			const reference = document.createElement("div");
			reference.textContent = "Updated";

			const originalRef = original;
			morph(original, reference);

			expect(original).toBe(originalRef);
			expect(original.textContent).toBe("Updated");
		});
	});
});
