# Custom Extensions Example

This example shows how to create a custom extension that adds a "Insert Hello" command to the editor.

## Demo

import EditorDemo from '@site/src/components/EditorDemo';

<EditorDemo />

## Creating a Custom Extension

Here's a complete example of a custom extension that adds a command to insert "Hello" text:

```typescript
import { Extension, Editor } from '@barocss/editor-core';
import { transaction, control, insertText } from '@barocss/model';

class InsertHelloExtension implements Extension {
  name = 'insert-hello';
  priority = 100;

  onCreate(editor: Editor): void {
    // Register a custom command
    editor.registerCommand('insertHello', async (payload) => {
      const { nodeId } = payload;
      
      // Execute transaction to insert text
      await transaction(editor, control(nodeId, [
        insertText({ text: 'Hello' })
      ])).commit();
      
      return true;
    });

    // Register keyboard shortcut (Ctrl+H or Cmd+H)
    editor.registerKeybinding({
      key: 'h',
      mod: 'Mod',
      command: 'insertHello'
    });
  }

  onDestroy(_editor: Editor): void {
    // Cleanup if needed
  }
}

// Use the extension
const editor = new Editor({
  dataStore,
  schema,
  extensions: [
    ...createCoreExtensions(),
    new InsertHelloExtension()
  ]
});
```

## What This Example Shows

- **Extension Interface**: How to implement the Extension interface
- **Command Registration**: Registering custom commands
- **Keybinding**: Connecting keyboard shortcuts to commands
- **Transaction Usage**: Using transactions to modify the document

## Built-in Extension Examples

The editor ships with 55+ built-in extensions covering all schema types. Here are a few patterns used in real extensions:

### Mark Toggle (Cross-Node Support)

Extensions like `UnderlineExtension` and `StrikethroughExtension` support toggling marks across multiple nodes:

```typescript
import { transaction, toggleMark } from '@barocss/model';

const op = toggleMark(
  selection.startNodeId, selection.startOffset,
  selection.endNodeId, selection.endOffset,
  'underline'
);
const result = await transaction(editor, [op]).commit();
```

### Block Insertion with addChild

Block extensions like `ColumnsExtension` and `DetailsExtension` use `addChild` to insert structured content:

```typescript
import { transaction, control, addChild } from '@barocss/model';

const result = await transaction(editor, [
  ...control(rootNodeId, [
    addChild({
      node: {
        stype: 'bDetails',
        content: [
          { stype: 'bSummary', content: [{ stype: 'inline-text', text: 'Click to expand' }] },
          { stype: 'paragraph', content: [{ stype: 'inline-text', text: '' }] }
        ]
      }
    })
  ])
]).commit();
```

### Attribute Mutation via Transaction

The `ChecklistExtension` uses transactions for attribute changes to ensure undo/redo works:

```typescript
const ops = [
  ...control(payload.nodeId, [
    { type: 'setAttrs', payload: { attrs: { checked: !currentChecked } } }
  ])
];
const result = await transaction(editor, ops).commit();
```

## Next Steps

- **[Extension Design Guide](../guides/extension-design)** - Complete guide on creating extensions
- **[Extensions API Reference](../api/extensions-api)** - Full list of all 55+ built-in extensions
- **[Decorators Example](./decorators)** - Learn about decorators
- **[Architecture: Editor-Core](../architecture/editor-core)** - Understand the editor core
