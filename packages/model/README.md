# @barocss/model

Document operations, transaction helpers, positions, and selection context.

## Purpose

Use the model layer to build document trees and apply structured edits through the editor transaction system.

## Install

```sh
npm install @barocss/model @barocss/editor-core @barocss/schema
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/model` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/model/src/...` are not part of the published API.

## Usage

### Build a detached tree

```ts
import { node, textNode, mark } from '@barocss/model';

const paragraph = node('paragraph', {}, [
  textNode('inline-text', 'A clear heading', [mark('bold')]),
]);
console.log(paragraph.content); // Pass the tree to your document loader.
```

### Commit a batch and handle a rejected edit

This complete example uses a browser runtime and an editor without a view. It
inserts text and applies a mark in one transaction. It then deliberately targets a
missing node to show that the preceding write in that second batch is rolled back.
The example uses fixed IDs only inside its own new document.

```ts
import { Editor } from '@barocss/editor-core';
import { Schema } from '@barocss/schema';
import { transaction, control, insertText, applyMark, setText } from '@barocss/model';

const editor = new Editor({
  schema: new Schema('transaction-example', {
    topNode: 'document',
    nodes: {
      document: { name: 'document', content: 'paragraph+' },
      paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
      'inline-text': { name: 'inline-text', group: 'inline' },
    },
    marks: { bold: { name: 'bold' } },
  }),
});

try {
  editor.loadDocument({ stype: 'document', content: [
    { sid: 'p', stype: 'paragraph', content: [
      { sid: 't', stype: 'inline-text', text: 'Hello' },
    ] },
  ] });
  editor.setRange({
    type: 'range', startNodeId: 't', startOffset: 5,
    endNodeId: 't', endOffset: 5, collapsed: true,
  });

  const result = await transaction(editor, [
    ...control('t', [insertText(5, ' world'), applyMark(0, 5, 'bold')]),
  ]).commit();

  if (!result.success) {
    throw new Error(result.errors.join('; '));
  }
  if (result.postCommitErrors?.length) {
    // The document has committed. Report these errors; do not repeat this edit.
    console.warn('Edit committed with follow-up errors', result.postCommitErrors);
  }
  if (editor.dataStore.getNode('t')?.text !== 'Hello world') {
    throw new Error('Unexpected committed text');
  }
  if (!editor.dataStore.getNode('t')?.marks?.some(mark => mark.stype === 'bold')) {
    throw new Error('Expected a bold mark');
  }

  const before = JSON.stringify(editor.exportDocument());
  const rejected = await editor.executeTransaction({ operations: [
    setText('t', 'This write must roll back'),
    setText('missing-node', 'Cannot apply'),
  ] });
  if (rejected.success || rejected.committed !== false) {
    throw new Error('Expected an uncommitted failure');
  }
  if (JSON.stringify(editor.exportDocument()) !== before) {
    throw new Error('The rejected batch changed the document');
  }
  console.log('Committed text and mark; rejected batch preserved the document.');
} finally {
  editor.destroy();
}
```

`insertText` uses `pos`, not `offset`, in its raw payload. Prefer builders such as
`insertText('t', 5, ' world')`. `control(id, actions)` adds the target `nodeId` to
each action. It does not execute the actions by itself.

## Execution paths

| API | Input and behavior |
| --- | --- |
| `transaction(editor, operations, options).commit()` | Flattens one level of operation arrays; runs synchronous extension `onBeforeTransaction` hooks before entering the manager |
| `editor.executeTransaction({ operations, options })` | Requires an object with an operations array; uses the editor's transaction manager; emits `transactionExecuted` after it returns |
| `TransactionManager.execute(operations, options)` | Lower-level execution; does not run the DSL's before hooks or the editor wrapper's `transactionExecuted` event |

The second API does **not** accept a bare operation array. The two convenient
entry points are not interchangeable when your integration depends on before
hooks. Both use the manager's commit, history and post-transaction handling.
A thrown before hook rejects the DSL promise before the manager runs; returning
`null` instead produces a normal unsuccessful result. Handle promise rejection at
your UI boundary as well as checking the returned result.

## Results and recovery

| Outcome | Meaning | Host action |
| --- | --- | --- |
| `success: false`, `committed: false` | Cancellation or failure before local commit | Display `errors`; correct the cause before trying a new edit |
| `success: true`, `committed: true` | The document committed locally | Continue the UI and handle persistence separately |
| Success with `postCommitErrors` | A history, event, extension, selection or cleanup step failed after commit | Preserve the committed document; report and repair the failed integration; do not replay the edit |

`committed` is optional in the public result type for compatibility with external
result producers. The built-in paths above report it explicitly. Use `success` as
the primary result check. `transactionId` identifies a local transaction; it is
not a durable request ID or a deduplication key for remote retries.

Rollback covers writes owned by the DataStore overlay. It does not undo an HTTP
request, file write, or other side effect performed by a custom operation. Keep
external work outside the transaction and give it a separate error/retry policy.

## Options

| Option | Default | Effect |
| --- | --- | --- |
| `applySelectionToView` | `true` | Apply the computed selection through `editor.updateSelection` after notifications; `false` skips this editor/view update, not just the DOM part |
| `preserveSelectionInHistory` | `true` | Include before/after selection snapshots in a new history entry |
| `recordInHistory` | `true` | Record eligible, nonempty edits; `false` is for derived state with its own recomputation policy |
| `appendToPreviousEntry` | `false` | Append a consequence to the last applied history entry; if no suitable entry exists, record nothing |

`appendToPreviousEntry: true` takes precedence over normal history recording.
Omitting history does not disable document events or make an edit private.
There is no `selection` override in `TransactionOptions`. Set a valid editor
selection before the edit or use the `setSelection` operation. A dangling
selection can be cleared even when `applySelectionToView` is false.

## Peer dependencies

- `@barocss/editor-core`: `workspace:*`.

## Integration notes

Tree builders return model data; constructing a node does not insert it into a
live document. Apply edits through a transaction or an editor command so history
and selection mapping can participate. Public model imports expose the built-in
operation builders; do not import an internal registration file.

The transaction lock belongs to one DataStore. It does not serialize other editor
instances, browser tabs or clients. Reads through that store can see its overlay
while an asynchronous operation is pending. Treat this as local editing
coordination, not database isolation or distributed consensus.

The current `op(callback)` path does not collect an undoable operation from a
successful callback result, even if an `inverse` is supplied. Do not use it as a
shortcut for undoable direct DataStore mutations. Define a registered operation
with an inverse and test replay instead.

## Known limits and troubleshooting

- A local commit does not confirm autosave, server storage or collaborator delivery.
- Schema checks run on the transaction scope before ordinary commits; this is not
  complete validation of every external input or side effect. Undo/redo replay is
  exempt from this commit check in the reviewed revision.
- Content events and `onTransaction` run before the final selection update and
  before releasing the lock. Use the result's `selectionAfter` for the intended
  post-edit selection. Keep hooks synchronous and do not wait for another edit
  from inside an operation that holds the same store lock.
- Asynchronous work started by a hook is not awaited or included in
  `postCommitErrors`. Catch its errors in the owning integration.
- Current main has a separate undo/redo failure-recovery issue:
  [#350](https://github.com/barocss/barocss-editor/issues/350). A normal transaction
  rollback does not establish that failed history replay is safe. Do not loop
  undo/redo retries after a failure.

These contracts were checked against source revision
`895f0cf20582ccfe5aa0d797121740befa825365` with locally packed libraries, including
`@barocss/model` 1.0.3. Matching an npm version number alone does not prove the
registry archive contains that exact source. See the transaction guide for the
validation scope.

## Documentation

- [Package guide](https://editor.barocss.com/packages/model)
- [Transactions](https://editor.barocss.com/docs/concepts/transactions)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/model)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/model) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
