<p align="center">
  <img src="https://github.com/phlex-ruby/morphlex/assets/246692/128ebe6a-bdf3-4b88-8a40-f29df64b3ac8" alt="Morphlex" width="481">
</p>

Morphlex is a DOM morphing library that transforms one DOM tree to match another. It keeps what the user did, ends with exactly the markup you asked for, and makes as few changes to the DOM as it can.

## It keeps what the user did

Re-rendering a page from the server shouldn’t undo the user’s work. With [`preserveChanges`](#preserving-changes), what the user typed, checked, picked or opened survives it, as long as each form control has a `name` or `id` so Morphlex can tell which is which (see [Form controls need a `name` or `id`](#form-controls-need-a-name-or-id)). Say the user picked a size and wrote a note on the second item of a list:

```javascript
// <form>
//   <select name="size"><option>S</option><option>M</option><option>L</option></select>
//   <ul><li>Milk <input name="note"></li><li>Eggs <input name="note"></li></ul>
// </form>
//
// The user picks “M”, then types “a dozen” next to Eggs and leaves the caret there.

const html = `
  <form>
    <select name="size"><option>XS</option><option>S</option><option>M</option><option>L</option></select>
    <ul><li>Bread <input name="note"></li><li>Milk <input name="note"></li><li>Eggs <input name="note"></li></ul>
  </form>
`

morph(form, html, { preserveChanges: true })
```

The select still shows “M”, even though a new option arrived before it. “a dozen” is still next to Eggs, in the same input, which still has focus and its caret, even though a new row arrived above it and none of the rows have ids. Bread gets a fresh, empty input.

With `preserveChanges`, Morphlex:

- Keeps typed text, checked boxes and picked options and radios, and lets the browser decide what the user has touched, so inputs and textareas the user hasn’t touched still follow the new markup. (A select keeps showing what it showed, unless the markup selects something new. See [Preserving changes](#preserving-changes).)
- Keeps each change with its own item when items are added, removed or reordered around it, even in lists without ids.
- Gives the user’s pick back when the new markup moves `checked` to another radio or `selected` to another option, which the browser alone would let it take. A user who picks the default again looks untouched to the browser, so then the markup decides.
- Leaves `<details>` and `<dialog>` open or closed as the user left them.
- Leaves the text in a focused `contenteditable` alone. Once it loses focus, it follows the markup, since whether the user typed in it can’t be told.
- Keeps focus, the caret and the selection when the focused element moves, even to another parent.
- Moves elements with a unique `id` to wherever the new markup puts them, even under another parent, so they keep their state and listeners. Options, optgroups and the element you pass to `morph` don’t move.

When the server does need to overwrite what the user typed, such as clearing a form after it’s submitted, mark that part of the markup with [`morphlex-clobber`](#discarding-changes-with-morphlex-clobber).

## It’s correct

Whatever the user has or hasn’t touched, the morph ends with the markup you passed in, unless one of your callbacks says otherwise, or `preserveChanges` keeps what only the user decides: whether a `<details>` or `<dialog>` is open, and the content of a focused `contenteditable`. That holds for the tricky parts of HTML too: `<template>` content, duplicate ids, SVG and MathML, forms with fields named like DOM properties (such as `<input name="remove">`), radio groups that span forms, and customizable selects.

### How it’s tested

Every test runs in a real browser, through Vitest’s browser mode and Playwright, never in a simulated DOM. Most of what a morph can get wrong depends on how browsers really behave: which controls they count as changed, how radio groups and selects pick, where focus and the caret go when a node moves, and what `moveBefore` keeps.

The suite has over 1,200 tests of several kinds:

- **Examples** of each behaviour, including cases adapted from the morphdom and idiomorph test suites, and before-and-after fixtures of a whole app and a whole document.
- **Exhaustive tests** that morph every small tree over a fixed set of nodes into every other one, where matching rules interact most, and check that a second morph changes nothing.
- **Fuzzers** that morph random trees, lists and forms and check a property over every seed: the result matches the target; morphing again makes no mutations; a small change makes only that one mutation; callbacks that allow everything change nothing, and vetoes are respected; elements that move keep their node, focus and caret; and the user’s typed text, checked boxes, picked options and radios, and open `<details>` and `<dialog>` are kept with `preserveChanges` and reset without it. A failure names its seed, so it can be rerun on its own.

On every pull request and every push to main, CI checks formatting, lint and types, then runs the whole suite in Chromium, Firefox and WebKit, each on its own runner. Most fuzzers try 2,000 fresh seeds inside the suite and 4,000 more in a separate job for each browser, starting from a new seed on every run. Coverage is measured in Chromium, and the build fails if it drops below 100% of lines, branches, functions and statements. Every night, they each run another 50,000 seeds.

### Compared with other morphers

In October 2026 we ran the same 33 scenarios against Morphlex and seven other morphing libraries, each in its most state-keeping mode, in Chromium, Firefox and WebKit. The results were the same in all three browsers.

| Scenario                                                                   | Morphlex | Others passing |
| -------------------------------------------------------------------------- | :------: | :------------: |
| Typed text stays in its row when an unkeyed row is added above             |    ✅    |     0 of 7     |
| A select keeps the user’s pick when an option is added before it           |    ✅    |     0 of 7     |
| A picked radio stays picked when a radio is added before it                |    ✅    |     0 of 7     |
| A `<details>` the user opened stays open when the page re-renders          |    ✅    |     0 of 7     |
| An input with an `id` keeps its typed text when it moves to another parent |    ✅    |     0 of 7     |
| Adding an item before identical unkeyed items adds one node                |    ✅    |     0 of 7     |
| Typed text stays in its row when a keyed row is added above                |    ✅    |     2 of 7     |
| The caret stays put when the focused input’s row moves                     |    ✅    |     2 of 7     |

Overall, Morphlex passed 31 of the 33 scenarios. The others passed between 14 and 21: idiomorph 21, set-dom 18, Alpine morph 17, nanomorph 16, morphdom 15, diffhtml 15 and micromorph 14. Morphlex fails two on purpose or along with everyone else. A form control without a `name` or `id` is replaced when its markup changes (see [Form controls need a `name` or `id`](#form-controls-need-a-name-or-id)), and no library keeps text typed into a `contenteditable` that has lost focus.

## How it changes the DOM

1. No cascading mutations from inserts. Each inserted node is one DOM operation.
2. No cascading mutations from removes. Each removed node is one DOM operation.
3. No cascading mutations from partial sorts. Morphlex finds the longest increasing subsequence, so it moves the fewest elements it can.
4. It uses [`moveBefore`](https://developer.mozilla.org/en-US/docs/Web/API/Element/moveBefore) when available, preserving state.
5. It uses [`isEqualNode`](https://developer.mozilla.org/en-US/docs/Web/API/Node/isEqualNode), but in a way that is sensitive to the value of form inputs.
6. It uses id sets, inspired by Idiomorph, so ids nested deep inside an element can help to identify it.

## Installation

<kbd>npm install morphlex</kbd>

Or use it directly from a CDN:

```html
<script type="module">
  import { morph } from "https://www.unpkg.com/morphlex@latest/dist/morphlex.min.js"
</script>
```

Morphlex only touches the DOM when you call it, so it’s safe to import in environments without a DOM, such as during server-side rendering.

## Usage

```javascript
import { morph, morphInner, morphDocument } from "morphlex"

// Morph the element itself, including its attributes
morph(currentNode, newNode)

// Morph only the children of the element
morphInner(currentNode, newNode)

// Morph the entire document
morphDocument(document, newDocument)
```

Each function also accepts a string of HTML as the target:

```javascript
morph(currentNode, `<div id="profile" class="active">…</div>`)
morphInner(currentNode, `<ul><li>One</li><li>Two</li></ul>`)
morphDocument(document, await response.text())
```

- **`morph(from, to, options?)`** morphs `from` into `to`. The target can be a node, a `NodeList` or a string. If it has several nodes, the first is morphed into `from` and the rest are inserted after it. If it has none, `from` is removed. A string is parsed where `from` is, as `innerHTML` on its parent would parse it: a string for an `<html>`, `<head>` or `<body>` is parsed as a document, and one for an element inside SVG or MathML is parsed in that namespace.
- **`morphInner(from, to, options?)`** morphs the children of `from` into the children of `to`, leaving the attributes of `from` alone. Both must be elements with the same tag name and namespace. A string target must contain exactly one element. `from` can also be a shadow root, in which case `to` is a `DocumentFragment` (or another shadow root) whose children it takes, or a string of its content, like `shadowRoot.innerHTML`.
- **`morphDocument(from, to, options?)`** morphs the `<html>` element of one document into another. A string target is parsed with `DOMParser`.

Morphlex throws if it needs to replace or insert next to a node that has no parent, for example when morphing a detached `<div>` into a `<span>`.

> [!WARNING]
> When you pass a string, it is parsed as HTML and its nodes are inserted into the live document, where inline event handlers (such as `onclick`) and resource-loading attributes (such as `src`) take effect. Don’t pass untrusted HTML without sanitizing it first.

## Options

All three functions accept an optional third argument for configuration:

```javascript
morph(currentNode, newNode, {
  preserveChanges: true,
  beforeNodeAdded: (parent, node, insertionPoint) => {
    console.log("Adding node:", node)
    return true // return false to prevent addition
  },
})
```

- **`preserveChanges`**: When `true`, form controls the user has changed keep their values, and the `open` state of `<details>` and `<dialog>` elements is left alone. See [Preserving changes](#preserving-changes). Default: `false`

- **`beforeNodeVisited(fromNode, toNode)`**: Called before a node is visited during morphing. Return `false` to skip morphing this node. Nodes that already match their target are left alone without being visited, so this isn’t called for them.

- **`afterNodeVisited(fromNode, toNode)`**: Called after a node has been visited and morphed.

- **`beforeNodeAdded(parent, node, insertionPoint)`**: Called before a new node is added to the DOM. `insertionPoint` is the node it will be inserted before, or `null` if it will be appended. Return `false` to prevent adding the node.

- **`afterNodeAdded(node)`**: Called after a node has been added to the DOM.

- **`beforeNodeRemoved(node)`**: Called before a node is removed from the DOM. Return `false` to prevent removal.

- **`afterNodeRemoved(node)`**: Called after a node has been removed from the DOM.

- **`beforeAttributeUpdated(element, name, newValue)`**: Called before an attribute is added, changed or removed. `newValue` is `null` when the attribute is being removed. Return `false` to prevent the update.

```javascript
morph(currentNode, newNode, {
  beforeAttributeUpdated: (element, name) => {
    if (element.tagName === "DETAILS" && name === "open") return false
    return true
  },
})
```

This can be useful for preserving UI state that your backend does not track. `preserveChanges` already does this for `open` on `<details>` and `<dialog>`, so a hook like this is for when you want the same behaviour without preserving form changes, or for other attributes.

- **`afterAttributeUpdated(element, name, previousValue)`**: Called after an attribute has been updated on an element. `previousValue` is `null` if the attribute didn’t exist before.

- **`beforeChildrenVisited(parent)`**: Called before an element’s children are visited during morphing. Return `false` to skip visiting children.

- **`afterChildrenVisited(parent)`**: Called after an element’s children have been visited and morphed.

When a node can’t be morphed in place and has to be replaced, `beforeNodeRemoved` is called first, then `beforeNodeAdded` only if the removal was allowed. Returning `false` from either one leaves the original node where it is, even when the replacement is an element that would move in from elsewhere.

An element with a unique id can move to a new parent during a morph (except `<option>` and `<optgroup>` elements, whose selection belongs to their `<select>`), and it moves once the rest of the morph is done. Until then, callbacks for other nodes, including `afterNodeAdded`, may see an empty comment where the element will go, or the element still in its old place. The after callbacks for the node you passed to `morph` see the finished DOM.

## Scripts

A `<script>` in new content doesn’t run when Morphlex inserts it, just as it wouldn’t with `innerHTML`. Browsers never run a script parsed from a string, a `<template>` or `DOMParser`, so this applies to string targets and to most node targets. A script that is morphed into an existing `<script>` doesn’t run again either, even when its content changes.

To run new scripts, collect them in `afterNodeAdded`, then once the morph is done, replace each one with a fresh copy in document order, so they see the finished DOM:

```javascript
const scripts = []

morph(currentNode, newHTML, {
  afterNodeAdded(node) {
    if (!(node instanceof Element)) return
    scripts.push(...(node.matches("script") ? [node] : node.querySelectorAll("script")))
  },
})

scripts.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

for (const inert of scripts) {
  const script = document.createElement("script")
  for (const { name, value } of inert.attributes) script.setAttribute(name, value)
  script.nonce = inert.nonce
  script.async = inert.hasAttribute("async")
  script.textContent = inert.textContent
  inert.replaceWith(script)
}
```

Copying `nonce` keeps the script allowed under a nonce-based Content Security Policy, since the browser hides the attribute once the script is in the page. Setting `async` from the attribute keeps external scripts running in order, but inline scripts still run straight away, so one can run before an external script above it has loaded. Only use this with HTML strings, templates or parsed documents: a script you create with `document.createElement` already runs when it’s inserted, so this would run it twice.

## Preserving changes

Form controls have two sides: the content attribute in the markup (`value`, `checked`, `selected`, or the text inside a `<textarea>`), and the live property the user edits. Morphlex always updates the attributes to match the new markup. What happens to the live properties depends on `preserveChanges`.

### With `preserveChanges: true`

User intent always wins. If the user typed into a field, checked a box or picked an option, a morph will never undo it, even if the new markup happens to match what was there before.

Morphlex doesn’t guess whether a control has changed. It updates the attributes and lets the browser decide, using its own record of whether the user has interacted with the control. Controls the user hasn’t touched follow the new markup, and controls they have touched keep their values.

The browser keeps that record for each radio and option, not for each group. So when the markup moves `checked` to another radio, or a new radio arrives with it, the browser would check it and drop the radio the user picked, and the same goes for `selected` in a single select. Morphlex gives the user’s pick back.

Otherwise, a select shows whatever the browser selects. When an untouched select’s option gains a `selected` attribute, or a new one arrives with it, the browser selects it. But Morphlex never reselects anything itself, so after options are added or moved, a select keeps showing the option it showed before, even if the user never touched it. The one exception is a multiple select or list box with nothing selected that becomes a drop-down: a drop-down always shows an option, so Morphlex selects the one the markup selects.

The `open` attribute on `<details>` and `<dialog>` is also live state, toggled by the user and with no default to compare against. So Morphlex never adds or removes it, and an open element stays open while a closed one stays closed. If the attribute is present on both sides, its value is still updated.

One limitation follows from this. Once a control’s value has been set by script, including by Morphlex during a morph without `preserveChanges`, the browser treats it as changed, so it won’t follow new markup in later morphs that use `preserveChanges`.

### Discarding changes with `morphlex-clobber`

Sometimes the server does want to overwrite what the user typed, for example to clear a form after it has been submitted. Add a `morphlex-clobber` attribute to an element in the new markup, and that element and everything inside it are morphed as if `preserveChanges` were `false`, including the `open` state of any `<details>` or `<dialog>` inside it.

```html
<form morphlex-clobber>
  <textarea name="comment"></textarea>
</form>
```

The attribute only applies to the morph it arrives in. Morphlex removes it from the new markup before morphing, so it never appears in the live DOM. Inside a `<template>`, it’s kept, so it applies when that template’s content is morphed in later.

With `morphInner`, putting the attribute on the target element itself applies it to all of its children.

### With `preserveChanges: false`

The target markup wins. Values, checked states, selected options and `<textarea>` contents are reset to match it, even where the user has edited them and the markup itself hasn’t changed. The one exception is `<input type="file">`, whose selected file Morphlex never clears. Removing `open` from a `<dialog>` calls `close()`, so a modal dialog leaves the top layer properly.

If `beforeAttributeUpdated` returns `false` for one of these attributes, Morphlex leaves the matching property alone too.

## How matching works

When morphing the children of an element, Morphlex pairs each new child with an existing one, trying these in order:

1. An existing node that is already identical.
2. An element that only differs by what the user changed in its form controls, unless the new element is or holds a `morphlex-clobber` element.
3. An element with the same `id`.
4. An element that contains one of the same `id`s somewhere inside it.
5. With `preserveChanges`, a checkbox, radio or option the user changed is paired with one making the same choice, such as the same name and value in the same form, and an element such as a `<label>` holding one is paired with an element holding the same choice. This keeps the user’s pick in place when items are added or reordered around it.
6. An element with the same non-empty `name`, `href` or `src` attribute.
7. Any element with the same tag name, as long as neither element has an `id` or a non-empty `name`, and neither is a form control. Ids inside the elements don’t count, so a wrapper without its own identity still pairs by position, and an `href` or `src` doesn’t either, so a link, image or iframe whose address changes is updated in place. A `<script>` or media `<source>` with a `src` still isn’t paired by tag, since it wouldn’t be loaded again.

When a new child’s unique `id` belongs to a live element under another parent that can be morphed into it, the new child isn’t paired here. That element moves to the new child’s place instead (see [Options](#options)).

Elements are only paired with elements of the same tag name and namespace. Text and comment nodes are paired with nodes of the same type, except text nodes that are only whitespace. Those are never paired with other nodes. Existing whitespace that sits where the new children have whitespace is kept, with its text updated if it differs. Other whitespace is removed or inserted fresh.

Paired nodes are morphed in place, existing nodes that weren’t paired are removed, and new nodes that weren’t paired are inserted. Morphlex then moves the fewest nodes it can to get them in the right order, using `moveBefore` where the browser supports it so moved elements keep their state. The focused element keeps focus and its caret or selection when it moves. In browsers without `moveBefore`, the element holding focus stays where it is and its siblings move around it, and if a move takes it anyway, for example to another parent, it gets focus and its caret or selection back straight after the move.

Stable `id`s are the best way to help Morphlex match elements, especially in lists that get reordered.

The element you pass to `morph` is replaced rather than morphed in place if its tag name, namespace or `is` attribute differs from the target, if it’s a form control whose `id` differs, or if it’s an `<input>` whose `type` differs. Elements paired during a morph already share a tag name and namespace, and are replaced only when their `is` attribute differs.

### Form controls need a `name` or `id`

When matching children, Morphlex keeps a form control (an `<input>`, `<textarea>`, `<select>` or form-associated custom element) only when it can tell that the control in the new markup is the same field. It tells by the control’s `id`, or else its `name`. Without either, all it has to go on is the markup itself, so it only keeps a control whose markup hasn’t changed. If anything about it changes, even a class, the control could just as well be a different field in the same spot, and Morphlex assumes it is. It removes the old control and inserts a fresh one, so what the user typed into one field never turns up in another, such as an email address in a phone number field.

The same goes when a control’s `name` changes and it has no `id`, when its `id` changes, and when an `<input>`’s `type` changes, which always means a fresh input. The element you pass to `morph` follows the rules in the paragraph just before this section instead.

A replaced control loses what the user typed and its focus, even with `preserveChanges`. To keep them, give the control a `name` or `id` that stays the same while the rest of its markup changes:

```html
<!-- Replaced when the class changes, losing what the user typed -->
<input placeholder="Search" class="busy" />

<!-- Morphed in place, keeping what the user typed -->
<input name="q" placeholder="Search" class="busy" />
```

With `preserveChanges`, a `<select>` the user picked from can also be matched by the option they picked, as in step 5 above.

### Templates

The contents of a `<template>` element are compared and, if they differ, replaced in one go rather than morphed, so no callbacks are called for nodes inside a template.

### Whitespace in strings

When a string target contains elements, whitespace at its start and end is trimmed so it doesn’t turn into extra text nodes. Only ASCII whitespace is trimmed, so `&nbsp;` is kept.
