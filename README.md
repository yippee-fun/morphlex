<p align="center">
  <img src="https://github.com/phlex-ruby/morphlex/assets/246692/128ebe6a-bdf3-4b88-8a40-f29df64b3ac8" alt="Morphlex" width="481">
</p>

Morphlex is a ~2.3KB (gzipped) DOM morphing library that transforms one DOM tree to match another while preserving element state and making minimal changes.

## Installation

```bash
npm install morphlex
```

Or use it directly from a CDN:

```html
<script type="module">
  import { morph } from "https://www.unpkg.com/morphlex@0.0.19/dist/morphlex.min.js"
</script>
```

## Usage

```javascript
import { morph, morphInner } from "morphlex"

// Morph the entire element
morph(currentNode, referenceNode)

// Morph only the children of the current node
morphInner(currentNode, referenceNode)
```

## What makes Morphlex different?

1. No cascading mutations from inserts. Simple inserts should be one DOM operation.
2. No cascading mutations from removes. Simple removes should be one DOM operation.
3. No cascading mutations from partial sorts. Morphlex finds the longest increasing subsequence for near optimal partial sorts.
4. It uses `moveBefore` when available, preserving state.
5. It uses `isEqualNode`, but in a way that is sensitive to the value of form inputs.
6. It uses id sets inspired by Idiomorph.
