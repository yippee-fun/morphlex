<p align="center">
  <img src="https://github.com/phlex-ruby/morphlex/assets/246692/128ebe6a-bdf3-4b88-8a40-f29df64b3ac8" alt="Morphlex" width="481">
</p>

Morphlex is a DOM morphing library that transforms one DOM tree to match another while preserving element state and making minimal changes.

## What makes Morphlex different?

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

- **`morph(from, to, options?)`** morphs `from` into `to`. The target can be a node, a `NodeList` or a string. If it has several nodes, the first is morphed into `from` and the rest are inserted after it. If it has none, `from` is removed.
- **`morphInner(from, to, options?)`** morphs the children of `from` into the children of `to`, leaving the attributes of `from` alone. Both must be elements with the same tag name and namespace. A string target must contain exactly one element.
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

## Preserving changes

Form controls have two sides: the content attribute in the markup (`value`, `checked`, `selected`, or the text inside a `<textarea>`), and the live property the user edits. Morphlex always updates the attributes to match the new markup. What happens to the live properties depends on `preserveChanges`.

### With `preserveChanges: true`

User intent always wins. If the user typed into a field, checked a box or picked an option, a morph will never undo it, even if the new markup happens to match what was there before.

Morphlex doesn’t guess whether a control has changed. It updates the attributes and lets the browser decide, using its own record of whether the user has interacted with the control. Controls the user hasn’t touched follow the new markup, and controls they have touched keep their values.

A select shows whatever the browser selects. When an option gains a `selected` attribute, or a new one arrives with it, the browser selects it, as it would for any untouched option. But Morphlex never reselects anything itself, so after options are added or moved, a select keeps showing the option it showed before, even if the user never touched it.

The `open` attribute on `<details>` and `<dialog>` is also live state, toggled by the user and with no default to compare against. So Morphlex never adds or removes it, and an open element stays open while a closed one stays closed. If the attribute is present on both sides, its value is still updated.

One limitation follows from this. Once a control’s value has been set by script, including by Morphlex during a morph without `preserveChanges`, the browser treats it as changed, so it won’t follow new markup in later morphs that use `preserveChanges`.

### Discarding changes with `morphlex-clobber`

Sometimes the server does want to overwrite what the user typed, for example to clear a form after it has been submitted. Add a `morphlex-clobber` attribute to an element in the new markup, and that element and everything inside it are morphed as if `preserveChanges` were `false`, including the `open` state of any `<details>` or `<dialog>` inside it.

```html
<form morphlex-clobber>
  <textarea name="comment"></textarea>
</form>
```

The attribute only applies to the morph it arrives in. Morphlex removes it from the new markup before morphing, so it never appears in the live DOM.

With `morphInner`, putting the attribute on the target element itself applies it to all of its children.

### With `preserveChanges: false`

The target markup wins. Values, checked states, selected options and `<textarea>` contents are reset to match it, even where the user has edited them and the markup itself hasn’t changed. The one exception is `<input type="file">`, whose selected file Morphlex never clears. Removing `open` from a `<dialog>` calls `close()`, so a modal dialog leaves the top layer properly.

If `beforeAttributeUpdated` returns `false` for one of these attributes, Morphlex leaves the matching property alone too.

## How matching works

When morphing the children of an element, Morphlex pairs each new child with an existing one, trying these in order:

1. An existing node that is already identical.
2. An element that only differs by what the user changed in its form controls.
3. An element with the same `id`.
4. An element that contains one of the same `id`s somewhere inside it.
5. With `preserveChanges`, a checkbox, radio or option the user changed is paired with one making the same choice (the same name and value), and an element such as a `<label>` holding one is paired with an element holding the same choice. This keeps the user’s pick in place when items are added or reordered around it.
6. An element with the same non-empty `name`, `href` or `src` attribute.
7. Any element with the same tag name, as long as neither element has an `id`, one of the attributes above, or ids inside it, and neither is a form control.

A new child whose unique `id` belongs to a live element under another parent isn’t paired here. If that element can move, it moves to the new child’s place (see [Options](#options)).

Elements are only paired with elements of the same tag name and namespace. Text and comment nodes are paired with nodes of the same type, except text nodes that are only whitespace. Those are never paired with other nodes. Existing whitespace that sits where the new children have whitespace is kept, with its text updated if it differs. Other whitespace is removed or inserted fresh.

Paired nodes are morphed in place, existing nodes that weren’t paired are removed, and new nodes that weren’t paired are inserted. Morphlex then moves the fewest nodes it can to get them in the right order, using `moveBefore` where the browser supports it so moved elements keep their state.

Form controls are never paired by tag name alone, so give them an `id` or `name`. Otherwise a control the user has changed can be replaced with a fresh one when its markup changes, and its value is lost even with `preserveChanges`. In general, stable `id`s are the best way to help Morphlex match elements, especially in lists that get reordered.

The element you pass to `morph` is replaced rather than morphed in place if its tag name, namespace or `is` attribute differs from the target, if it’s a form control whose `id` differs, or if it’s an `<input>` whose `type` differs. The same goes for any element paired during a morph.

### Templates

The contents of a `<template>` element are compared and, if they differ, replaced in one go rather than morphed, so no callbacks are called for nodes inside a template.

### Whitespace in strings

When a string target contains elements, whitespace at its start and end is trimmed so it doesn’t turn into extra text nodes. Only ASCII whitespace is trimmed, so `&nbsp;` is kept.
