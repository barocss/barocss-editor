# @barocss/extensions

The Extensions package provides extension functionality for Barocss Editor. Extensions allow you to add new commands, keybindings, and features to the editor.

## Purpose

Extensions are the primary way to extend editor functionality. They provide:
- **Commands**: New operations that can be executed
- **Keybindings**: Keyboard shortcuts for commands
- **Decorators**: Visual overlays and widgets
- **Lifecycle Hooks**: onCreate, onDestroy for setup/cleanup

## Key Exports

- `Extension` - Base extension interface
- `createCoreExtensions()` - Basic editing extensions
- `createBasicExtensions()` - Formatting extensions
- `createRichExtensions()` - Rich text extensions

## Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  dataStore,
  schema,
  extensions: [
    ...createCoreExtensions(),  // Basic editing (insertText, delete, etc.)
    ...createBasicExtensions(), // Formatting (bold, italic, etc.)
  ]
});
```

## Extension Structure

An extension is a class or object that implements the Extension interface:

```typescript
import { Extension } from '@barocss/extensions';

class MyExtension implements Extension {
  onCreate(context) {
    // Register commands
    context.registerCommand('myCommand', async (payload) => {
      // Command implementation
    });
    
    // Register keybindings
    context.registerKeybinding('Mod-k', 'myCommand', {
      when: 'editorFocus'
    });
  }
  
  onDestroy(context) {
    // Cleanup
  }
}
```

## Extension Lifecycle

1. **onCreate**: Called when editor is created
   - Register commands
   - Register keybindings
   - Register decorators
   - Set up event listeners

2. **Active State**: Extension is active
   - Commands can be executed
   - Keybindings are active
   - Event listeners are active

3. **onDestroy**: Called when editor is destroyed
   - Clean up resources
   - Remove event listeners

## Registering Commands

Commands are the primary way to add functionality:

```typescript
class MyExtension implements Extension {
  onCreate(context) {
    context.registerCommand('insertHello', async (payload) => {
      const selection = context.editor.getSelection();
      if (!selection) return;
      
      await context.editor.executeCommand('insertText', {
        text: 'Hello',
        nodeId: selection.startNodeId,
        offset: selection.startOffset
      });
    });
  }
}
```

## Registering Keybindings

Keybindings connect keyboard shortcuts to commands:

```typescript
class MyExtension implements Extension {
  onCreate(context) {
    // Simple keybinding
    context.registerKeybinding('Mod-h', 'insertHello');
    
    // Keybinding with when condition
    context.registerKeybinding('Mod-k', 'myCommand', {
      when: 'editorFocus && editorEditable'
    });
  }
}
```

## Extension Sets

Pre-built extension sets provide common functionality:

### Core Extensions

Basic editing operations:
- `insertText` - Insert text
- `deleteSelection` - Delete selected text
- `moveCursorLeft/Right` - Cursor movement
- `backspace` - Backspace key
- `deleteForward` - Delete key

### Basic Extensions

Text formatting:
- `bold` - Toggle bold
- `italic` - Toggle italic
- `underline` - Toggle underline
- `strikeThrough` - Toggle strikethrough

### Rich Extensions

Advanced formatting:
- `heading` - Heading levels
- `list` - Bullet and numbered lists
- `blockquote` - Blockquotes
- `codeBlock` - Code blocks

## Custom Extensions

Create your own extensions:

```typescript
import { Extension } from '@barocss/extensions';

class CommentExtension implements Extension {
  onCreate(context) {
    // Register comment command
    context.registerCommand('comment.add', async (payload) => {
      const { nodeId, range } = payload;
      
      // Add comment decorator
      context.editor.viewDOM?.decoratorManager.add({
        id: `comment-${Date.now()}`,
        category: 'inline',
        type: 'comment',
        target: { nodeId, startOffset: range[0], endOffset: range[1] },
        data: { text: payload.text }
      });
    });
    
    // Register keybinding
    context.registerKeybinding('Mod-Shift-m', 'comment.add', {
      when: 'editorFocus && !selectionEmpty'
    });
  }
  
  onDestroy(context) {
    // Cleanup if needed
  }
}
```

## Extension Context

Extensions receive a context object with:

```typescript
interface ExtensionContext {
  editor: Editor;
  dataStore: DataStore;
  schema: Schema;
  registerCommand: (name: string, handler: CommandHandler) => void;
  registerKeybinding: (key: string, command: string, options?: KeybindingOptions) => void;
  registerDecorator: (type: string, renderer: DecoratorRenderer) => void;
  setContext: (key: string, value: unknown) => void;
  getContext: (key: string) => unknown;
}
```

## Integration

Extensions integrate with:
- **Editor Core**: Commands and keybindings are registered with editor
- **Model**: Commands execute transactions
- **Editor View DOM**: Decorators are rendered in view layer
- **DataStore**: All operations go through DataStore

## When to Use Extensions

- **Add New Commands**: Create new editing operations
- **Add Keyboard Shortcuts**: Map keys to commands
- **Add Visual Features**: Decorators, toolbars, etc.
- **Customize Editor Behavior**: Modify default behavior

## Related

- [Extension Design Guide](../guides/extension-design) - Detailed extension development guide
- [Editor Core](./editor-core) - How extensions integrate with editor
- [Core Concepts: Decorators](../concepts/decorators) - How to use decorators
