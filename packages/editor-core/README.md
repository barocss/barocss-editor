# @barocss/editor-core

Editor sessions, commands, extensions, selection, keybindings, and history.

## Purpose

Use this package for an editor without a prescribed UI. For Note, Word, Slides, or Site, start with that product's editor factory instead.

## Install

```sh
npm install @barocss/editor-core @barocss/schema @barocss/extensions
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/editor-core` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/editor-core/src/...` are not part of the published API.

## Usage

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  schema: createSchema('example', getMinimalSchemaDefinition()),
  extensions: createCoreExtensions(),
});
editor.loadDocument({ stype: 'document', content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
]}, 'example-session');
console.log(editor.getRootId());
// Attach your view here. When the session ends:
editor.destroy();
```

## Integration notes

Create one editor per independent editing session. Load a document after construction, attach a view separately, and call destroy when the session ends.

## Documentation

- [Package guide](https://editor.barocss.com/packages/editor-core)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/editor-core)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/editor-core) (older deep reference; use the package guide for current entry points).

## Select text or whole nodes

Use IDs from the loaded document, not example strings such as `text-1`. A text
range and a set of selected objects have different meanings. This complete
example checks both without mounting a view:

```ts
import {
  Editor, createNodeSelection, selectedNodeIds, isCollapsedSelection,
} from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  schema: createSchema('selection-example', getMinimalSchemaDefinition()),
  extensions: createCoreExtensions(),
});
const check = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message);
};
try {
  editor.loadDocument({ stype: 'document', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
  ] }, 'selection-example-session');
  const firstChild = (id: string): string => {
    const child = editor.dataStore.getNode(id)?.content?.[0];
    if (typeof child !== 'string') throw new Error('Expected a child ID');
    return child;
  };
  const rootId = editor.getRootId();
  if (!rootId) throw new Error('Document did not load');
  const paragraphId = firstChild(rootId);
  const textId = firstChild(paragraphId);

  editor.updateSelection({
    type: 'range', startNodeId: textId, startOffset: 0,
    endNodeId: textId, endOffset: 5,
  });
  check(!isCollapsedSelection(editor.selection), 'Expected a text range');
  check(selectedNodeIds(editor.selection).length === 0, 'A range is not a node set');
  check(!editor.getSelectionSummary().empty, 'Expected a selection summary');

  editor.setRange({ type: 'range', startNodeId: textId, startOffset: 5,
    endNodeId: textId, endOffset: 5 });
  check(isCollapsedSelection(editor.selection), 'Expected a caret');

  editor.updateSelection(createNodeSelection([paragraphId]));
  check(selectedNodeIds(editor.selection)[0] === paragraphId, 'Expected the block');
  check(!isCollapsedSelection(editor.selection), 'A selected block is not a caret');

  editor.updateSelection(null);
  check(editor.getSelectionSummary().empty, 'Expected no selection');
} finally {
  editor.destroy();
}
```

`createNodeSelection(ids)` also supports multiple object IDs. Use
`selectedNodeIds(selection)` to read the entire set; endpoints alone can omit
middle objects. These model APIs do not mount a selection overlay, move browser
focus, or implement product-specific table interaction. An attached view and
product commands provide those behaviors. See [Selection](https://editor.barocss.com/docs/concepts/selection).

## Edit, undo, and redo

Add `@barocss/model` when using operation builders:

```sh
npm install @barocss/model
```

Await each transaction and check its result before continuing. The example uses
`setText`, which replaces a text node's contents without moving its selection.
It closes the typing group before each independent edit, so the checks do not
depend on typing speed.

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';
import { setText } from '@barocss/model';

const editor = new Editor({
  schema: createSchema('history-example', getMinimalSchemaDefinition()),
  extensions: createCoreExtensions(),
  history: { maxSize: 100 },
});
const check = (ok: boolean, message: string) => {
  if (!ok) throw new Error(message);
};
try {
  editor.loadDocument({ stype: 'document', content: [
    { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
  ] }, 'history-example-session');
  const firstChild = (id: string): string => {
    const child = editor.dataStore.getNode(id)?.content?.[0];
    if (typeof child !== 'string') throw new Error('Expected a child ID');
    return child;
  };
  const rootId = editor.getRootId();
  if (!rootId) throw new Error('Document did not load');
  const textId = firstChild(firstChild(rootId));
  const text = () => editor.dataStore.getNode(textId)?.text;
  const caret = (offset: number) => editor.setRange({
    type: 'range', startNodeId: textId, startOffset: offset,
    endNodeId: textId, endOffset: offset,
  });
  const replace = async (value: string) => {
    editor.historyManager.closeGroup();
    const result = await editor.transaction([setText(textId, value)]).commit();
    if (!result.success) throw new Error(result.errors.join('; '));
    // The edit already committed. Report these errors; do not retry the edit.
    if (result.postCommitErrors?.length) {
      throw new Error(result.postCommitErrors.join('; '));
    }
  };

  caret(1);
  await replace('Hello world');
  caret(3);
  await replace('Hello again');
  check(editor.getHistoryStats().totalEntries === 2, 'Expected two undo steps');
  check(await editor.undo(), 'Undo failed');
  check(text() === 'Hello world', 'Undo did not restore text');
  check(editor.selection?.startOffset === 3, 'Undo did not restore the caret');
  check(await editor.undo(), 'Second undo failed');
  check(text() === 'Hello', 'Original text was not restored');
  check(editor.selection?.startOffset === 1, 'Original caret was not restored');
  check(await editor.redo(), 'Redo failed');
  check(text() === 'Hello world', 'Redo did not restore text');

  await replace('Hello branch');
  check(!editor.canRedo(), 'A new recorded edit must discard the redo branch');
  editor.clearHistory();
  check(!editor.canUndo() && !editor.canRedo(), 'History was not cleared');
  check(text() === 'Hello branch', 'Clearing history must not erase the document');
} finally {
  editor.destroy();
}
```

History belongs to this editor instance. It is not a saved document version or a
collaborative undo service. `loadDocument()` does not reset the transaction
history: create a new editor for an independent document/session. See
[History](https://editor.barocss.com/docs/concepts/history) for grouping, options,
and troubleshooting.

## License

MIT. The published archive includes the license in `dist/LICENSE`.
