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

### Content attributes vs DOM properties for form elements

In `#visitAttributes`, there's a deliberate separation between content attribute updates (`setAttribute`/`removeAttribute`) and DOM property updates (`.value`, `.checked`, `.selected`). The `preserveChanges` option only guards the _property_ assignments, not the attribute calls. This is correct because in all modern browsers, `setAttribute("checked", "")` only changes `defaultChecked`, not `.checked`, and `setAttribute("selected", "")` only changes `defaultSelected`, not `.selected`. Once a user interacts with the element, the property decouples from the attribute per the HTML spec.

### Asymmetry in attribute removal for `value` vs `checked`/`selected`

In the second pass of `#visitAttributes` (removing attributes not present in the target), there's special `preserveChanges` handling for `checked` and `selected` (which explicitly sets the property to `false`) but not for `value`. This is intentional — removing the `value` attribute only resets `defaultValue` to `""`, never `.value`. There's no equivalent need to guard `value` removal because `.value` is always a string and can't be meaningfully "unset" the way `.checked` and `.selected` can be set to `false`.

### Resetting user changes when not preserving

The attribute passes only touch `.value`, `.checked` and `.selected` when the matching attribute is added, changed or removed. So when `preserveChanges` is false, `#resetFormProperties` runs after them and sets each property to what the target markup says, which covers edits where neither side has the attribute. It skips a property when its attribute still differs from the target, because that means `beforeAttributeUpdated` vetoed the update. It never assigns `.value` on checkbox, radio or file inputs. It also runs when `preserveChanges` is true for controls that weren't flagged dirty. Assigning a property sets the browser's internal dirty flag, after which attribute changes no longer reach the property, so a control morphlex has written to would otherwise stop following the markup.
