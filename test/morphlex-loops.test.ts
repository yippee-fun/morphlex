import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { morph, morphInner } from "../src/morphlex";

describe("Morphlex - Infinite Loop Bug Detection", () => {
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

	describe("Sensitivity-based reordering", () => {
		it("should not infinite loop when reordering sensitive elements", () => {
			const parent = document.createElement("div");

			// Create input (sensitive element)
			const input = document.createElement("input") as HTMLInputElement;
			input.id = "input1";
			input.value = "test";

			// Create regular div
			const div1 = document.createElement("div");
			div1.id = "div1";
			div1.textContent = "First";

			const div2 = document.createElement("div");
			div2.id = "div2";
			div2.textContent = "Second";

			parent.appendChild(div1);
			parent.appendChild(input);
			parent.appendChild(div2);

			// Reference wants to reorder them
			const reference = document.createElement("div");

			const refDiv1 = document.createElement("div");
			refDiv1.id = "div1";
			refDiv1.textContent = "First";

			const refDiv2 = document.createElement("div");
			refDiv2.id = "div2";
			refDiv2.textContent = "Second";

			const refInput = document.createElement("input") as HTMLInputElement;
			refInput.id = "input1";

			reference.appendChild(refDiv1);
			reference.appendChild(refDiv2);
			reference.appendChild(refInput);

			// This should complete without infinite loop
			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			// Should complete in reasonable time (< 1 second)
			expect(endTime - startTime).toBeLessThan(1000);
			expect(parent.children.length).toBe(3);
		});

		it("should not infinite loop with multiple sensitive elements", () => {
			const parent = document.createElement("div");

			const input1 = document.createElement("input") as HTMLInputElement;
			input1.id = "input1";

			const input2 = document.createElement("input") as HTMLInputElement;
			input2.id = "input2";

			const textarea = document.createElement("textarea");
			textarea.id = "textarea1";

			parent.appendChild(input1);
			parent.appendChild(input2);
			parent.appendChild(textarea);

			// Reverse order
			const reference = document.createElement("div");

			const refTextarea = document.createElement("textarea");
			refTextarea.id = "textarea1";

			const refInput2 = document.createElement("input") as HTMLInputElement;
			refInput2.id = "input2";

			const refInput1 = document.createElement("input") as HTMLInputElement;
			refInput1.id = "input1";

			reference.appendChild(refTextarea);
			reference.appendChild(refInput2);
			reference.appendChild(refInput1);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
			expect(parent.children[0].id).toBe("textarea1");
			expect(parent.children[1].id).toBe("input2");
			expect(parent.children[2].id).toBe("input1");
		});

		it("should not infinite loop with modified input value", () => {
			const parent = document.createElement("div");

			const input = document.createElement("input") as HTMLInputElement;
			input.id = "input1";
			input.defaultValue = "default";
			input.value = "modified";

			const div = document.createElement("div");
			div.id = "div1";

			parent.appendChild(input);
			parent.appendChild(div);

			const reference = document.createElement("div");

			const refDiv = document.createElement("div");
			refDiv.id = "div1";

			const refInput = document.createElement("input") as HTMLInputElement;
			refInput.id = "input1";

			reference.appendChild(refDiv);
			reference.appendChild(refInput);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
		});
	});

	describe("ID-based matching loops", () => {
		it("should not infinite loop when matching by overlapping ID sets", () => {
			const parent = document.createElement("div");

			const outer1 = document.createElement("div");
			outer1.id = "outer1";
			const inner1 = document.createElement("span");
			inner1.id = "inner1";
			outer1.appendChild(inner1);

			const outer2 = document.createElement("div");
			outer2.id = "outer2";
			const inner2 = document.createElement("span");
			inner2.id = "inner2";
			outer2.appendChild(inner2);

			parent.appendChild(outer1);
			parent.appendChild(outer2);

			// Reference has them in reverse order
			const reference = document.createElement("div");

			const refOuter2 = document.createElement("div");
			refOuter2.id = "outer2";
			const refInner2 = document.createElement("span");
			refInner2.id = "inner2";
			refOuter2.appendChild(refInner2);

			const refOuter1 = document.createElement("div");
			refOuter1.id = "outer1";
			const refInner1 = document.createElement("span");
			refInner1.id = "inner1";
			refOuter1.appendChild(refInner1);

			reference.appendChild(refOuter2);
			reference.appendChild(refOuter1);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
			expect(parent.children[0].id).toBe("outer2");
			expect(parent.children[1].id).toBe("outer1");
		});

		it("should not infinite loop when currentNode becomes child during matching", () => {
			const parent = document.createElement("div");

			const child1 = document.createElement("div");
			child1.id = "child1";

			const child2 = document.createElement("div");
			child2.id = "child2";

			const child3 = document.createElement("div");
			child3.id = "child3";

			parent.appendChild(child1);
			parent.appendChild(child2);
			parent.appendChild(child3);

			const reference = document.createElement("div");

			const refChild2 = document.createElement("div");
			refChild2.id = "child2";

			const refChild3 = document.createElement("div");
			refChild3.id = "child3";

			const refChild1 = document.createElement("div");
			refChild1.id = "child1";

			reference.appendChild(refChild2);
			reference.appendChild(refChild3);
			reference.appendChild(refChild1);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
		});
	});

	describe("Head element morphing loops", () => {
		it("should not infinite loop when morphing head with many elements", () => {
			const originalHead = document.createElement("head");

			for (let i = 0; i < 10; i++) {
				const meta = document.createElement("meta");
				meta.setAttribute("name", `meta-${i}`);
				meta.setAttribute("content", `value-${i}`);
				originalHead.appendChild(meta);
			}

			const referenceHead = document.createElement("head");

			for (let i = 0; i < 10; i++) {
				const meta = document.createElement("meta");
				meta.setAttribute("name", `meta-${i}`);
				meta.setAttribute("content", `updated-${i}`);
				referenceHead.appendChild(meta);
			}

			const startTime = Date.now();
			morph(originalHead, referenceHead);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
		});

		it("should not infinite loop with identical outerHTML", () => {
			const originalHead = document.createElement("head");
			const script1 = document.createElement("script");
			script1.textContent = "console.log('test')";
			originalHead.appendChild(script1);

			const script2 = document.createElement("script");
			script2.textContent = "console.log('test')";
			originalHead.appendChild(script2);

			const referenceHead = document.createElement("head");
			const refScript = document.createElement("script");
			refScript.textContent = "console.log('test')";
			referenceHead.appendChild(refScript);

			const startTime = Date.now();
			morph(originalHead, referenceHead);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
		});
	});

	describe("Recursive morphing loops", () => {
		it("should not infinite loop with deeply nested structures", () => {
			const parent = document.createElement("div");
			let current = parent;

			for (let i = 0; i < 20; i++) {
				const child = document.createElement("div");
				child.id = `level-${i}`;
				current.appendChild(child);
				current = child;
			}

			const reference = document.createElement("div");
			let refCurrent = reference;

			for (let i = 0; i < 20; i++) {
				const child = document.createElement("div");
				child.id = `level-${i}`;
				child.textContent = "updated";
				refCurrent.appendChild(child);
				refCurrent = child;
			}

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(2000);
		});

		it("should not infinite loop with circular-looking ID references", () => {
			const parent = document.createElement("div");

			const a = document.createElement("div");
			a.id = "a";
			const b = document.createElement("div");
			b.id = "b";
			const c = document.createElement("div");
			c.id = "c";

			parent.appendChild(a);
			parent.appendChild(b);
			parent.appendChild(c);

			const reference = document.createElement("div");

			const refB = document.createElement("div");
			refB.id = "b";
			const refC = document.createElement("div");
			refC.id = "c";
			const refA = document.createElement("div");
			refA.id = "a";

			reference.appendChild(refB);
			reference.appendChild(refC);
			reference.appendChild(refA);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
			expect(parent.children[0].id).toBe("b");
			expect(parent.children[1].id).toBe("c");
			expect(parent.children[2].id).toBe("a");
		});
	});

	describe("Edge case loops", () => {
		it("should not infinite loop when node equals insertionPoint", () => {
			const parent = document.createElement("div");
			const child = document.createElement("span");
			child.textContent = "test";
			parent.appendChild(child);

			const reference = document.createElement("div");
			const refChild = document.createElement("span");
			refChild.textContent = "test updated";
			reference.appendChild(refChild);

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
		});

		it("should not infinite loop with empty elements", () => {
			const parent = document.createElement("div");
			const reference = document.createElement("div");

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(100);
		});

		it("should not infinite loop when cleaning up excess nodes", () => {
			const parent = document.createElement("div");

			for (let i = 0; i < 100; i++) {
				const child = document.createElement("div");
				parent.appendChild(child);
			}

			const reference = document.createElement("div");

			const startTime = Date.now();
			morph(parent, reference);
			const endTime = Date.now();

			expect(endTime - startTime).toBeLessThan(1000);
			expect(parent.children.length).toBe(0);
		});
	});
});
