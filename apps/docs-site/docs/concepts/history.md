# History (undo and redo)

Each editor instance has a local transaction history. Recorded edits store
forward operations, inverse operations, and normally the selection before and
after the edit. Use the complete
[Edit, undo, and redo example](/packages/editor-core#edit-undo-and-redo) to check
text restoration, caret restoration, and redo-branch removal.

## Run undo and redo

- `await editor.undo()` returns whether the inverse transaction succeeded.
- `await editor.redo()` returns whether replay succeeded.
- `editor.canUndo()` and `editor.canRedo()` report available history entries.
- `editor.getHistoryStats()` reports entry count, current index, and availability.

Await each edit, undo, and redo before starting another. A successful undo/redo
restores the recorded selection when its metadata is present. Replay does not
create another undo entry.

A new recorded edit after undo removes the redo branch. Clearing history with
`editor.clearHistory()` removes undo and redo entries; it does not erase the
document. Do not clear history automatically to hide a failed action.

## Why one undo can remove several typed characters

The current manager groups eligible consecutive text edits within a 500 ms
window. A new entry must contain one `replaceText`, `insertText`, or `setText`
operation. Earlier operations in the group must be text edits on the same node.
When selection snapshots exist, the previous end caret and next start caret must
agree in start node and offset. This is an operation-level rule, not a promise
that every visible keystroke is one step.

Explicit `deleteTextRange` operations are not included in this typing group.
Structural edits and mixed operation entries do not join a text-only group.
Undo, redo, editor blur, and the DOM input handler's non-composition navigation
keys close the group. Custom input adapters must manage their own boundaries.

Call `editor.historyManager.closeGroup()` before an independent programmatic
edit when it must start a new undo step. The checked example uses this method
rather than a timing delay.

The editor's public `history` constructor option currently documents `maxSize`.
The standalone `HistoryManager` also accepts `coalesceMs`, but this option is not
exposed by the current `EditorOptions` type. Do not bypass the type with a cast
as an installation recipe.

## Recording and selection options

| Transaction option | Default | Effect |
| --- | --- | --- |
| `recordInHistory` | `true` | `false` skips a new history entry for that transaction. |
| `preserveSelectionInHistory` | `true` | `false` omits selection snapshots; it does not stop recording the edit. |
| `applySelectionToView` | `true` | `false` skips the final editor/view selection update. It does not disable history. |
| `appendToPreviousEntry` | `false` | Tries to append a derived consequence to the current last applied entry instead of making a new entry. |

A transaction with no executed operations and an undo/redo replay are not added
to history. A rejected edit is not a recorded successful edit. Direct DataStore
writes are outside this transaction recording path.

Use `recordInHistory: false` for state that can be recomputed, not as a general
collaboration switch. Skipping history does not transform old inverse operations
against subsequent edits. Appending a consequence requires a last applied entry
with no redo branch; when that requirement is not met, it records no new entry.
These options require an integration policy for the derived state.

## Limits and document lifecycle

The default capacity is 100 entries. Set a positive `history.maxSize` when
constructing the editor, or call `editor.resizeHistory(positiveInteger)` later.
Oldest entries are removed when capacity is exceeded. Coalesced edits share one
entry, so this is not a limit on characters or bytes.

`loadDocument()` does not clear the transaction history. Use a new editor for an
independent document/session, and destroy the old one after detaching its view.
History is in memory; serializing the document does not save the undo stack.
This API is not document version history, autosave, or collaborative undo.

`getHistoryMemoryUsage()` is an estimate. `validateHistory()` checks structural
properties of stored entries; it is not proof that replay succeeds on a changed
document. `compressHistory()` is a separate manual pass over compatible
`setText` entries. It is not the normal typing-group mechanism and is not needed
for the documented editing flow.

## Troubleshooting and failure handling

| Symptom | Check or action |
| --- | --- |
| Undo removes a burst of text | Check grouping above; close the group before an independent API edit. |
| Undo is unavailable after reopening | Local history belongs to the old editor instance; it is not persisted with content. |
| Redo disappears after typing | A new recorded edit intentionally replaces the redo branch. |
| Undo changes content but not the caret | Check `preserveSelectionInHistory`, target survival, and view focus/synchronization. |
| A transaction reports `postCommitErrors` | The edit committed. Report the follow-up failure; do not retry the edit as if it were rejected. History recording itself can be one of these failures. |
| Undo or redo returns `false` | Stop dependent actions and report the failure. Availability alone does not guarantee replay success. |

The current history manager moves its index before replay. The editor does not
restore that index when replay fails. Do not automatically repeat undo/redo or
claim that a failed replay leaves all history state unchanged. Preserve the
current document and collect a reproduction for the implementation owner.

## Verification scope

The examples check model operations and selection snapshots with published
entry points. Existing core tests cover grouping, branch pruning, selection
restoration, and history options. Desktop browser execution of these examples
is not a new end-to-end certification of IME input, native keyboard undo, remote
collaboration, or server persistence. Those require product-specific scenarios.

See [Selection](./selection) for model/view boundaries and
[Transactions](./transactions) for commit outcomes.
