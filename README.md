<p align="center">
  <img src="https://github.com/phlex-ruby/morphlex/assets/246692/128ebe6a-bdf3-4b88-8a40-f29df64b3ac8" alt="Morphlex" width="481">
</p>

Morphlex is a 2KB DOM morphing library that transforms one DOM tree to match another while preserving element state and making minimal changes.

## Installation

```bash
npm install morphlex
```

Or use it directly from a CDN:

```html
<script type="module">
  import { morph } from "https://www.unpkg.com/morphlex@0.0.16/dist/morphlex.min.js"
</script>
```

## Usage

```javascript
import { morph, morphInner } from "morphlex"

// Morph the entire element
morph(currentNode, referenceNode)

// Morph only the inner content
morphInner(currentNode, referenceNode)
```

The `currentNode` is transformed to match the `referenceNode`. The `referenceNode` remains unchanged.

## How it works

Morphlex uses a smart matching algorithm that produces minimal DOM operations for common patterns like inserts, deletes, and reordering.

### Matching strategy

When morphing child nodes, Morphlex tries multiple matching strategies in order of specificity:

1. **Exact match** — Nodes that are completely identical (`isEqualNode`)
2. **ID match** — Elements with the same `id` attribute
3. **ID set match** — Elements containing the same nested IDs (see below)
4. **Tag match** — Elements with the same tag name, or nodes with the same type

This cascading approach means most updates find optimal matches quickly, while still handling edge cases gracefully.

### ID sets

ID sets are inspired by [Idiomorph](https://github.com/bigskysoftware/idiomorph). Each element is tagged with the set of IDs it contains, including deeply nested ones. This helps match elements even when they've moved or been restructured.

For example, if you have a card with `id="card-123"` nested inside a container, the container's ID set includes `"card-123"`. When morphing, Morphlex can match the container based on that nested ID, even if the container itself has no ID.

### Minimal operations

After matching, Morphlex processes nodes in order and makes the minimum number of DOM operations:

- Matched elements are moved into position (if needed) and recursively morphed
- New nodes are inserted at the correct position
- Unmatched nodes are removed

This means operations like sorting a list or inserting items in the middle produce exactly the moves you'd expect, with no unnecessary removals or recreations.

## Contributing

Found a bug or have a feature request? Open an issue. Want to contribute? Open a pull request.
