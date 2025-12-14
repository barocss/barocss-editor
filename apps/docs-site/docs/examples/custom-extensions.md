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

## Next Steps

- **[Extension Design Guide](../guides/extension-design)** - Complete guide on creating extensions
- **[Decorators Example](./decorators)** - Learn about decorators
- **[Architecture: Editor-Core](../architecture/editor-core)** - Understand the editor core
