import { expect, test } from "vitest"
import { morph } from "../../src/morphlex"
import { observeMutations } from "./utils"

// Morphs a div's children and reports which original child each final child is
// (-1 for a new node), and how many insertions and removals it made.
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
		original: Array.from(from.childNodes, (node) => before.indexOf(node)),
		added: mutations.nodesAdded,
		removed: mutations.nodesRemoved,
		textChanges: mutations.characterDataChanges,
	}
}

test.each([
	["<p>a</p>", "<p>a</p><p>a</p>", { original: [0, -1], added: 1, removed: 0, textChanges: 0 }],
	["<p>a</p><p>a</p>", "<p>a</p><p>a</p><p>b</p>", { original: [0, 1, -1], added: 1, removed: 0, textChanges: 0 }],
	["<p>a</p><p>a</p><p>b</p>", "<p>b</p><p>a</p><p>a</p>", { original: [2, 0, 1], added: 1, removed: 1, textChanges: 0 }],
	[
		`<p id="x">1</p><p id="x">2</p><p id="x">3</p>`,
		`<p id="x">3</p><p id="x">2</p><p id="x">1</p>`,
		{ original: [0, 1, 2], added: 0, removed: 0, textChanges: 2 },
	],
	[
		`<p id="x">1</p><p id="x">2</p>`,
		`<p id="x">2b</p><p id="x">1b</p>`,
		{ original: [0, 1], added: 0, removed: 0, textChanges: 2 },
	],
	[`<p id="x">1</p>`, `<p id="x">1b</p><p id="x">2</p>`, { original: [0, -1], added: 1, removed: 0, textChanges: 1 }],
	[
		"<p>1</p> <p>2</p> <p>3</p>",
		"<p>3</p> <p>1</p> <p>2</p>",
		{ original: [4, -1, 0, 1, 2], added: 2, removed: 2, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>2</p><p>3</p><p>4</p><p>5</p><p>1</p>",
		{ original: [1, 2, 3, 4, 0], added: 1, removed: 1, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>5</p><p>1</p><p>2</p><p>3</p><p>4</p>",
		{ original: [4, 0, 1, 2, 3], added: 1, removed: 1, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>1</p><p>4</p><p>3</p><p>2</p><p>5</p>",
		{ original: [0, 3, 2, 1, 4], added: 2, removed: 2, textChanges: 0 },
	],
	[
		"<p>1</p><p>2</p><p>3</p><p>4</p><p>5</p>",
		"<p>5</p><p>4</p><p>3</p><p>2</p><p>1</p>",
		{ original: [4, 3, 2, 1, 0], added: 4, removed: 4, textChanges: 0 },
	],
	["t1<!--c-->t2", "t2<!--c-->t1", { original: [2, 1, 0], added: 2, removed: 2, textChanges: 0 }],
	[
		`<a name="n1">1</a><a name="n2">2</a>`,
		`<a name="n2">2x</a><a name="n1">1x</a>`,
		{ original: [1, 0], added: 1, removed: 1, textChanges: 2 },
	],
	[`<a name="n">1</a>`, `<a name="n">1</a><a name="n">2</a>`, { original: [0, -1], added: 1, removed: 0, textChanges: 0 }],
	[
		`<a href="/a">1</a><a href="/b">2</a>`,
		`<a href="/b">2x</a><a href="/a">1x</a>`,
		{ original: [1, 0], added: 1, removed: 1, textChanges: 2 },
	],
	[
		`<img src="a.png" alt="1"><img src="b.png" alt="2">`,
		`<img src="b.png"><img src="a.png">`,
		{ original: [1, 0], added: 1, removed: 1, textChanges: 0 },
	],
	["<b>1</b><i>2</i>", "<i>2x</i><b>1x</b>", { original: [1, 0], added: 1, removed: 1, textChanges: 2 }],
	["<b>1</b>", "<b>1</b><b>2</b>", { original: [0, -1], added: 1, removed: 0, textChanges: 0 }],
	[
		"<div><b></b></div><div><i></i></div>",
		"<div><i></i>x</div><div><b></b>y</div>",
		{ original: [0, 1], added: 4, removed: 2, textChanges: 0 },
	],
])("morphing %s into %s", (fromHTML, toHTML, expected) => {
	expect(morphChildren(fromHTML, toHTML)).toEqual(expected)
})
