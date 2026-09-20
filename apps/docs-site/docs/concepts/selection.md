# Selection

Selection identifies a caret, a text range, or a set of objects in an editor
session. It uses model node IDs and offsets, not DOM elements.

For a complete checked example, start with
[Select text or whole nodes](/packages/editor-core#select-text-or-whole-nodes).
That example loads a document, resolves its IDs, selects text and a block, and
clears the selection. It does not require an attached view.

## Choose the selection kind

| Kind | Meaning | What to read |
| --- | --- | --- |
| `range` | A text range, or a caret when collapsed | `startNodeId`, `startOffset`, `endNodeId`, `endOffset` |
| `node` | One or more whole objects | `selectedNodeIds(selection)` |
| `cell` | A set of table cells | `selectedNodeIds(selection)`; product table commands interpret it |
| `table` | A whole table | Selected IDs and product table commands |

Import `ModelSelection`, `createNodeSelection`, `selectedNodeIds`, and
`isCollapsedSelection` from `@barocss/editor-core`.

For a range in one text node, equal offsets mean a caret. Use
`isCollapsedSelection` instead of testing an optional `collapsed` field yourself.
An object selection with zero offsets is still an object selection. For a range
across nodes, collapse cannot be inferred from equal offsets alone.

For multiple objects, `nodeIds` carries the complete set. The start and end IDs
are compatibility endpoints. They do not describe all the objects in between.
`selectedNodeIds()` returns an empty array for a text range.

## Set and inspect selection

- Read `editor.selection` for the current model selection, or `null`.
- Call `editor.updateSelection(selection)` for a model selection.
- Call `editor.setRange({ type: 'range', startNodeId, startOffset, endNodeId, endOffset })` for text.
- Call `editor.updateSelection(createNodeSelection(ids))` for whole objects.
- Call `editor.updateSelection(null)` to clear it.

Include `type: 'range'` with `setRange`; it forwards the object to
`updateSelection` and does not add this field for you.

Use real IDs from the current loaded document. Keep text offsets within the
current text. Do not reuse a selection from another editor session.

`updateSelection` derives the collapsed flag for a range in one node. It removes
missing members from an object selection and clears a selection whose targets
are gone. Extension hooks can change or reject a selection request. These checks
are not a general guarantee that arbitrary offsets or cross-session IDs are valid.

## Keep toolbar state accurate

`editor.getSelectionSummary()` reads the live selection and document. It includes:

- `empty` and `collapsed`;
- marks that cover the whole selection and `mixedMarks` that cover only part;
- common mark attributes;
- touched blocks, common block attributes, and `mixedAttributes`.

Use `markState(summary, name)` for `on`, `mixed`, or `off`. A mixed selection
must not be presented as uniformly formatted. A saved summary is a snapshot:
read it again after selection or content changes. Shared editor UI can bind to
these answers; see the [editor UI package](/packages/office-editor-ui).

## Selection during edits

Operations can update the transaction's selection or return a suggested caret.
The transaction resolves this result before applying selection to the editor.
Movement depends on the operation: for example, `setText` replaces text without
moving the selection, while other text operations can supply a new caret.

`TransactionOptions` does **not** provide a `selection` override. Set a selection
through the editor API before a command, or use a supported selection operation
inside the transaction. Selection set after commit is not retroactively added
to that transaction's history snapshot.

`applySelectionToView: false` skips the transaction's final selection update to
the editor/view. It is not a general-purpose way to keep a fresh model caret
while hiding only its DOM counterpart. If an operation deletes the selected
nodes without a replacement position, the transaction can clear the dangling
selection. It does not always choose the nearest surviving paragraph.

## Model selection and browser focus

A view adapter translates browser selection to model positions and restores
model positions after rendering. Core alone does not draw a caret or an object
selection tool. It also does not focus an editable element.

Use the view's lifecycle and focus API. Do not repeatedly force DOM selection
while a user is composing IME text. IME timing belongs to the view/input adapter;
the model examples do not certify every browser, keyboard, or embedded editor.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Selection clears immediately | Verify both target IDs exist in this session; check extension selection hooks. |
| Only the first and last objects receive an action | Read `selectedNodeIds()` instead of treating endpoints as the whole set. |
| Toolbar says bold is off for mixed text | Read `mixedMarks` or `markState`, and refresh after content changes. |
| Model selection is correct but no caret is visible | Check the attached view, editable focus, rendering, and selection-sync options. |
| Caret is wrong after replacing text | Check whether the operation moves selection; supply a valid position when needed. |

Continue with [History](./history) for selection restoration on undo and redo.
