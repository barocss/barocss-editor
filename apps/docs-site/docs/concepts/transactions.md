# Transactions

A transaction groups document operations into one local commit. Use it to insert
text, apply formatting or change structure with a shared failure boundary.
Loading a document or writing directly to a DataStore is a different path; those
calls do not acquire all editor transaction behavior automatically.

Start with the [complete model example](/packages/model#commit-a-batch-and-handle-a-rejected-edit).
It creates an editor, inserts text and a bold mark, checks the result, then checks
rollback after a deliberately invalid target. The package README is the source
for that example and is compiled against packed public packages.

## Choose an entry point

| Entry point | Before hooks | Additional wrapper notification |
| --- | --- | --- |
| `transaction(editor, operations, options).commit()` | Synchronous `onBeforeTransaction` hooks, sorted by extension priority | None |
| `editor.executeTransaction({ operations, options })` | Does not run the DSL before hooks | `transactionExecuted` after the manager returns |
| `TransactionManager.execute(operations, options)` | None | None |

All three use the manager's operation execution, commit checks, history handling,
content event and `onTransaction` hooks. Before hooks are not a universal access
control boundary. A bare array passed to `editor.executeTransaction` returns
`Unsupported transaction format.` Use the object form.

The DSL accepts builder results and flattens one level of nested arrays. For a
text insertion, use `insertText(nodeId, pos, text)` or
`control(nodeId, [insertText(pos, text)])`. The raw payload field is `pos`.
Operation names, payloads and node IDs must match the active document and schema.
TypeScript's permissive operation types do not replace runtime checks.

## Local lifecycle

1. The DSL runs before hooks, if that entry point is used. Returning `null`
   cancels without entering the manager. A thrown hook rejects the promise.
2. The manager acquires the DataStore lock and creates an overlay. It snapshots
   the selection after acquiring the lock.
3. Operations execute in order against the overlay. Later operations can read
   earlier writes. The manager collects operation results and available inverses.
4. The manager resolves the proposed selection and ends the overlay write phase.
   Ordinary edits validate the transaction scope against the active schema.
5. The DataStore commits the overlay. Before this point, refusal, an unknown
   operation or an exception causes owned overlay writes to roll back.
6. After commit, the manager handles history, removes dangling selection targets,
   emits `editor:content.change`, calls extension `onTransaction` hooks and applies
   the final selection. Errors in these follow-up steps do not undo the commit.
7. Cleanup releases the lock. The caller receives the result. The editor wrapper
   then emits its additional `transactionExecuted` event.

DataStore operation observers run during commit, before these manager follow-up
steps. Content listeners can read the committed document but must not assume
`editor.selection` already equals the intended final selection. The content
event's `transaction.selectionAfter` carries that proposed selection.

## Read the outcome before retrying

| Result | State | Action |
| --- | --- | --- |
| `success: false`, `committed: false` | No local commit by this transaction | Show `errors`; preserve user input and correct the cause |
| `success: true`, `committed: true`, no follow-up errors | Local document committed | Continue; track saving separately |
| Success with `postCommitErrors` | Local document committed, but a later step failed | Report the failing stage; do not repeat the edit |
| Rejected promise | For example, a thrown DSL before hook | Catch at the caller boundary; investigate the failing integration |

The public `committed` field is optional for compatibility with external result
producers. Built-in results supply it. `errors` contains pre-commit failures;
`postCommitErrors` contains collected failures after commit. A history failure can
leave a committed edit without its expected history entry. A notification error
can leave a view stale. Neither condition authorizes re-inserting the same text.

Optional result fields include `transactionId`, executed `operations`,
`selectionBefore`, `selectionAfter` and `data`. An executed-operation list in a
failed result is diagnostic; it does not prove any operation committed. Do not
use `transactionId` as a server idempotency token.

## Atomicity has a boundary

Rollback protects changes made in the owned DataStore overlay. It does not undo
network requests, file writes or arbitrary state changes in callbacks. An
operation must not assume that an external side effect will roll back with its
document changes.

The lock serializes transactions on that DataStore. It is not a cross-tab,
cross-editor or server lock. Reads through the store can see pending overlay
writes, so this is not a guarantee that no observer can see intermediate values.
Committed operation publication and read isolation are different contracts.

Do not await a nested transaction inside an operation that already holds the
same lock. Schedule follow-up document work after the current transaction.
Keep lifecycle hooks synchronous. Their returned promises are not awaited;
asynchronous errors need their own handler.

## History and selection options

See the [canonical options table](/packages/model#options) for all four public
options. Important distinctions:

- `applySelectionToView: false` skips the final editor selection update as well as
  its view synchronization. It does not stop cleanup of references to deleted nodes.
- `preserveSelectionInHistory: false` omits selection snapshots; it does not omit
  the edit itself.
- `recordInHistory: false` is suitable only when the integration can maintain its
  derived state without a user undo entry.
- `appendToPreviousEntry: true` requests attachment to the previous applied entry.
  If there is no suitable entry, it records nothing instead of creating a new one.

There is no `selection` transaction option. Establish the editor selection or use
an explicit `setSelection` operation. Individual operations may suggest a caret;
the manager also has a newly created block fallback. Always inspect the result
and test the next user action for structural operations.

Undo/redo uses its own wrapper around transaction replay. Current main's failed
replay recovery is tracked in [#350](https://github.com/barocss/barocss-editor/issues/350).
This guide does not claim that its pending fix is already available.

## Custom operations and aliases

Prefer a registered operation with a defined result and inverse when an edit
must participate in undo/redo. The public `op(callback)` helper runs a callback,
but its successful result is not collected as an undoable operation. Supplying an
`inverse` there does not establish a working history contract.

Some creation operations establish aliases such as `$last`. Use only aliases
provided by the operation you called. Their lifetime is the transaction overlay;
they are not persistent node IDs. Do not store them for later edits or invent an
alias based on an old example. Use the actual resulting document IDs for later
transactions.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Unsupported transaction format | Pass `{ operations, options }` to the editor method |
| Unknown operation | Use a builder exported by the installed model package; check custom registration |
| Node not found | Resolve the target in the current document; do not reuse IDs from another session |
| Schema rejection | Check the final structure and allowed marks; do not disable validation to hide it |
| Edit committed but view or undo is wrong | Inspect `postCommitErrors`; preserve the document and repair that integration |
| Before hook not called | Check which entry point you used; the editor wrapper is not the DSL |
| Commit succeeded but reload lost the edit | Inspect the host's persistence flow; local success is not a save acknowledgement |

## Verification scope

Reviewed source: `895f0cf20582ccfe5aa0d797121740befa825365`, including model 1.0.3.
The examples use archives built from that source. This does not assert that an
npm archive with the same version has identical contents, or that cloud storage
and collaboration are ready. See the
[source and validation audit](https://github.com/barocss/barocss-editor/blob/codex/353-transaction-docs/docs/specs/transaction-documentation-audit.md).

- [Model public API](/packages/model)
- [Selection](./selection)
- [History](./history)
- [Editor core](./editor-core)
