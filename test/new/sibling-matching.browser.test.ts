import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { observeMutations } from "./utils"

// Morphs a div's children and reports how many of the original children it kept
// and how many insertions and removals it made.
function morphChildren(fromHTML: string, toHTML: string) {
	const from = document.createElement("div")
	from.innerHTML = fromHTML
	const before = Array.from(from.childNodes)
	const to = document.createElement("div")
	to.innerHTML = toHTML
	const expected = to.innerHTML

	const mutations = observeMutations(from, () => morph(from, to))

	expect(from.innerHTML).toBe(expected)
	return {
		kept: Array.from(from.childNodes).filter((node) => before.includes(node)).length,
		added: mutations.nodesAdded,
		removed: mutations.nodesRemoved,
		textChanges: mutations.characterDataChanges,
	}
}

test.each([
	["<p>a</p>", "<p>a</p><p>a</p>", { kept: 1, added: 1, removed: 0, textChanges: 0 }],
	["<p>a</p><p>a</p>", "<p>a</p><p>a</p><p>b</p>", { kept: 2, added: 1, removed: 0, textChanges: 0 }],
	["<p>a</p><p>a</p><p>b</p>", "<p>b</p><p>a</p><p>a</p>", { kept: 3, added: 1, removed: 1, textChanges: 0 }],
	[
		`<p id="x">1</p><p id="x">2</p><p id="x">3</p>`,
		`<p id="x">3</p><p id="x">2</p><p id="x">1</p>`,
		{ kept: 3, added: 0, removed: 0, textChanges: 2 },
	],
	[`<p id="x">1</p><p id="x">2</p>`, `<p id="x">2b</p><p id="x">1b</p>`, { kept: 2, added: 0, removed: 0, textChanges: 2 }],
	[`<p id="x">1</p>`, `<p id="x">1b</p><p id="x">2</p>`, { kept: 1, added: 1, removed: 0, textChanges: 1 }],
	["<p>1</p> <p>2</p> <p>3</p>", "<p>3</p> <p>1</p> <p>2</p>", { kept: 4, added: 2, removed: 2, textChanges: 0 }],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>2</p><p>3</p><p>4</p><p>5</p><p>1</p>",
		{ kept: 5, added: 1, removed: 1, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>5</p><p>1</p><p>2</p><p>3</p><p>4</p>",
		{ kept: 5, added: 1, removed: 1, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>1</p><p>4</p><p>3</p><p>2</p><p>5</p>",
		{ kept: 5, added: 2, removed: 2, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>5</p><p>4</p><p>3</p><p>2</p><p>1</p>",
		{ kept: 5, added: 4, removed: 4, textChanges: 0 },
	],
	["t1<!--c-->t2", "t2<!--c-->t1", { kept: 3, added: 2, removed: 2, textChanges: 0 }],
	[
		`<a name="n1">1</a><a name="n2">2</a>`,
		`<a name="n2">2x</a><a name="n1">1x</a>`,
		{ kept: 2, added: 1, removed: 1, textChanges: 2 },
	],
	[`<a name="n">1</a>`, `<a name="n">1</a><a name="n">2</a>`, { kept: 1, added: 1, removed: 0, textChanges: 0 }],
	[
		`<a href="/a">1</a><a href="/b">2</a>`,
		`<a href="/b">2x</a><a href="/a">1x</a>`,
		{ kept: 2, added: 1, removed: 1, textChanges: 2 },
	],
	[
		`<img src="a.png" alt="1"><img src="b.png" alt="2">`,
		`<img src="b.png"><img src="a.png">`,
		{ kept: 2, added: 1, removed: 1, textChanges: 0 },
	],
	["<b>1</b><i>2</i>", "<i>2x</i><b>1x</b>", { kept: 2, added: 1, removed: 1, textChanges: 2 }],
	["<b>1</b>", "<b>1</b><b>2</b>", { kept: 1, added: 1, removed: 0, textChanges: 0 }],
	[
		"<div><b></b></div><div><i></i></div>",
		"<div><i></i>x</div><div><b></b>y</div>",
		{ kept: 2, added: 4, removed: 2, textChanges: 0 },
	],
])("morphing %s into %s", (fromHTML, toHTML, expected) => {
	expect(morphChildren(fromHTML, toHTML)).toEqual(expected)
})
