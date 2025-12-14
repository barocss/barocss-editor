# @barocss/editor-core

The Editor-Core package provides the core editor logic: selection management, keybinding, context, and transaction orchestration. It's the central coordinator for all editor operations.

## Purpose

Core editor logic that orchestrates commands, manages selection, handles keybindings, and coordinates extensions.

## Key Exports

- `Editor` - Main editor class
- `SelectionManager` - Selection management
- `KeybindingManager` - Keybinding handling
- `Context` - Editor context

## Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  dataStore,
  schema,
  extensions: createCoreExtensions()
});
```

## Core Features

### Selection Management

The Editor manages text and node selection:

```typescript
// Get current selection
const selection = editor.getSelection();
// {
//   type: 'range',
//   startNodeId: 'text-1',
//   startOffset: 0,
//   endNodeId: 'text-1',
//   endOffset: 5,
//   collapsed: false,
//   direction: 'forward'
// }

// Set selection
editor.setSelection({
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});
```

### Command System

Commands are registered by extensions and executed by the editor:

```typescript
// Execute a command
await editor.executeCommand('insertText', {
  text: 'Hello',
  nodeId: 'text-1',
  offset: 0
});
```

### Keybinding System

Keyboard shortcuts are handled by the editor:

```typescript
// Keybindings are registered by extensions
// The editor dispatches them to the appropriate command
// Ctrl+B → bold command
// Ctrl+Z → undo command
```

### Extension System

Extensions add functionality to the editor:

```typescript
const editor = new Editor({
  dataStore,
  schema,
  extensions: [
    ...createCoreExtensions(),  // Basic editing
    ...createBasicExtensions(), // Formatting
    new MyCustomExtension()     // Custom functionality
  ]
});
```

## Editor Lifecycle

```typescript
// 1. Create editor
const editor = new Editor({ dataStore, schema, extensions });

// 2. Extensions are initialized (onCreate called)
// 3. Editor is ready for use

// 4. Execute commands
await editor.executeCommand('insertText', { ... });

// 5. Destroy editor (onDestroy called on extensions)
editor.destroy();
```

## When to Use

- **Editor Creation**: Required to create an editor instance
- **Command Execution**: Execute commands through the editor
- **Selection Management**: Manage text and node selection
- **Extension Registration**: Register extensions with the editor

## Integration

Editor-Core coordinates:

- **DataStore**: All operations go through DataStore
- **Extensions**: Extensions register commands and keybindings
- **Editor-View-DOM**: View layer connects to Editor for input handling

## Related

- [Extension Design](../guides/extension-design) - Learn how to create extensions
- [Editor-View-DOM](./editor-view-dom) - How Editor connects to DOM
- [Model Package](./model) - Transaction DSL used by commands
