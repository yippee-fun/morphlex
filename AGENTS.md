- I’m using Aube to manage packages and Node to run scripts.
- Don’t create a summary document.
- Running all the tests with `aube run test` is cheap, so do it all the time. Don’t do too much before running tests. You can also run browser tests with `aube run test:browser`.
- Try to maintain 100% test coverage. Use `aube run test --coverage`.
- Make sure you leave things in a good state. No warnings. No type errors.
- We use tabs for indentation and sometimes additional spaces for alignment
- When writing new tests, put them under `test/new` and use `test` instead of `it`. Try to keep all the setup in the test itself. If you need to share setup between multiple steps, make a function that each test calls.

## Design notes for `src/morphlex.ts`

### `morphlex-dirty` attribute

The `flagDirtyInputs` function sets a `morphlex-dirty` attribute on form elements where the user has modified the value (i.e., the DOM property has diverged from the content attribute). This attribute is not read for any conditional logic — its purpose is to act as a sentinel that forces `isEqualNode` to return `false` for dirty inputs. Without it, `#morphOneToOne` would short-circuit on line `if (from.isEqualNode(to)) return` and skip syncing DOM properties like `.value`, `.checked`, and `.selected`. The attribute is cleaned up at the start of `#visitAttributes`.

An option counts as dirty when its `.selected` differs from what the browser would select from the markup alone. A drop-down with no `selected` attribute shows its first enabled option as selected, so comparing against `defaultSelected` would flag every untouched select and get unnamed ones replaced.

The browser keeps a select's selection when options are added, moved, or when the select switches between a drop-down, a list box and a multiple select. So after visiting a select's children, `#syncDefaultSelection` selects what the markup selects. It skips selects the user changed under `preserveChanges`, and selects where a `selected` update was vetoed.

### Content attributes vs DOM properties for form elements

`#visitAttributes` only updates content attributes (`setAttribute`/`removeAttribute`). It never assigns `.value`, `.checked` or `.selected` itself, so a `beforeAttributeUpdated` veto leaves both the attribute and the property alone. Attribute updates are safe under `preserveChanges`: once the user has changed a control, `setAttribute("checked", "")` only changes `defaultChecked`, not `.checked`, and the same goes for `selected` and `value`, because the property decouples from the attribute per the HTML spec.

### Resetting user changes when not preserving

When `preserveChanges` is false, `#resetFormProperties` runs after the attribute passes and sets each property to what the target markup says, including edits where neither side has the attribute. It skips a property when its attribute still differs from the target, because that means `beforeAttributeUpdated` vetoed the update. It never assigns `.value` on checkbox, radio or file inputs.

### `open` on `details` and `dialog`

For these elements the `open` attribute is the live state the user toggles, and there's no default to compare it against. So with `preserveChanges`, `#visitAttributes` never adds or removes `open` on them. Without it, removing `open` from a dialog calls `close()` instead of `removeAttribute`, because removing the attribute leaves a modal dialog stuck in the top layer.
