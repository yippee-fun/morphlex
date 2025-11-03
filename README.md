<p align="center">
  <img src="https://github.com/phlex-ruby/morphlex/assets/246692/128ebe6a-bdf3-4b88-8a40-f29df64b3ac8" alt="Morphlex" width="481">
</p>

Morphlex is a ~2KB (gzipped) DOM morphing library that transforms one DOM tree to match another while preserving element state and making minimal changes.

## Installation

```bash
npm install morphlex
```

Or use it directly from a CDN:

```html
<script type="module">
  import { morph } from "https://www.unpkg.com/morphlex@0.0.18/dist/morphlex.min.js"
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
