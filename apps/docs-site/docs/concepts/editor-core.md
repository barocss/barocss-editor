# Editor Core

Editor Core is the central coordinator of the Barocss editor. It manages commands, selection, keybindings, extensions, and provides the context that all editor operations need.

## What is Editor Core?

Editor Core (`@barocss/editor-core`) is the orchestration layer that:
- **Manages Commands**: Executes commands registered by extensions
- **Manages Selection**: Tracks and updates text/node selection
- **Handles Keybindings**: Dispatches keyboard shortcuts to commands
- **Coordinates Extensions**: Initializes and manages extension lifecycle
- **Provides Context**: Supplies DataStore, Schema, and other services to operations

## Core Components

### Editor Class

The `Editor` class is the main entry point:

```typescript
import { Editor } from '@barocss/editor-core';

const editor = new Editor({
  dataStore,
  schema,
  extensions: [...]
});
```

**What Editor manages:**
- **DataStore**: Reference to the document store
- **Schema**: Document structure definition
- **Extensions**: Array of extension instances
- **SelectionManager**: Current selection state
- **KeybindingManager**: Keyboard shortcut registry
- **Context**: Shared context for all operations

### Selection Management

Editor tracks selection state using `ModelSelection`:

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

**Selection properties:**
- **type**: Selection type (`'range'`, `'node'`, `'cell'`, `'table'`)
- **startNodeId**: Starting node ID
- **startOffset**: Starting offset within start node
- **endNodeId**: Ending node ID
- **endOffset**: Ending offset within end node
- **collapsed**: Whether selection is collapsed (cursor)
- **direction**: Selection direction (`'forward'`, `'backward'`, `'none'`)

**Selection is used by:**
- Commands to know where to insert/delete text
- Extensions to determine current context
- View layer to sync with DOM selection

### Command System

Commands are the primary way to modify the document:

```typescript
// Execute a command
await editor.executeCommand('insertText', {
  text: 'Hello',
  nodeId: 'text-1',
  offset: 0
});
```

**Command flow:**
1. Extension registers command: `registerCommand('insertText', handler)`
2. User action triggers command: `editor.executeCommand('insertText', payload)`
3. Editor finds command handler
4. Handler executes transaction
5. Model updates
6. View re-renders

### Keybinding System

Keyboard shortcuts are handled by the editor with conditional execution via `when` clauses. This system is inspired by VS Code's keybinding system, providing familiar patterns for developers.

```typescript
// Extension registers keybinding with when condition
extension.registerKeybinding('Mod-b', 'bold', {
  when: 'editorFocus && editorEditable'
});

// User presses Ctrl+B (or Cmd+B on Mac)
// → Editor checks when condition
// → If condition is true, dispatches to 'bold' command
// → Command executes
```

**Keybinding flow:**
1. Extension registers keybinding: `registerKeybinding('Mod-b', 'bold', { when: '...' })`
2. User presses keyboard shortcut
3. View captures event and dispatches to editor
4. Editor evaluates `when` condition against current context
5. If condition is true, editor finds command for keybinding
6. Command executes

**When conditions:**
- `when` is an optional string expression that evaluates against editor context
- Uses boolean logic: `&&` (and), `||` (or), `!` (not)
- Common context keys: `editorFocus`, `editorEditable`, `selectionEmpty`, `historyCanUndo`, etc.

```typescript
// Examples of when conditions
{ when: 'editorFocus' }  // Only when editor has focus
{ when: 'editorFocus && editorEditable' }  // Focused and editable
{ when: 'editorFocus && !selectionEmpty' }  // Focused with selection
{ when: 'editorFocus && historyCanUndo' }  // Focused and can undo
```

### Extension System

Extensions add functionality to the editor:

```typescript
const editor = new Editor({
  dataStore,
  schema,
  extensions: [
    ...createCoreExtensions(),  // Basic editing commands
    ...createBasicExtensions(), // Formatting commands
    new MyCustomExtension()     // Custom functionality
  ]
});
```

**Extension lifecycle:**
1. **onCreate**: Called when editor is created
2. **onDestroy**: Called when editor is destroyed
3. **registerCommand**: Register commands
4. **registerKeybinding**: Register keyboard shortcuts
5. **registerDecorator**: Register decorators

## Editor Context

Editor provides context to all operations and allows dynamic context updates:

### Static Context

Editor provides static context to all operations:

```typescript
interface EditorContext {
  dataStore: DataStore;
  schema: Schema;
  selection: SelectionManager;
  editor: Editor;
}
```

**Static context is used by:**
- Commands to access DataStore and Schema
- Operations to get current selection
- Extensions to interact with editor

### Dynamic Context

Editor allows setting dynamic context values that can be used in keybinding `when` conditions. This follows VS Code's context system pattern.

```typescript
// Set context value
editor.setContext('myCustomState', true);

// Context is now available in when conditions
extension.registerKeybinding('Mod-k', 'myCommand', {
  when: 'editorFocus && myCustomState'
});

// Remove context value (set to null or undefined)
editor.setContext('myCustomState', null);
```

**Dynamic context features:**
- **Set context**: `editor.setContext(key, value)` - Set or update context value
- **Remove context**: `editor.setContext(key, null)` - Remove context key
- **Context events**: Emits `editor:context.change` and `editor:context.change:${key}` events
- **Used in when conditions**: Context values are evaluated in keybinding `when` expressions

**Common context keys:**
- `editorFocus`: Whether editor has focus
- `editorEditable`: Whether editor is editable
- `selectionEmpty`: Whether selection is empty (collapsed)
- `selectionType`: Selection type ('range', 'node', etc.)
- `historyCanUndo`: Whether undo is available
- `historyCanRedo`: Whether redo is available
- `isMac`: Whether running on macOS

## How Editor Core Fits

```
User Input (View)
    ↓
Editor Core (Commands, Keybindings, Selection)
    ↓
Model (Transactions)
    ↓
DataStore (Updates)
    ↓
Renderer (DOM Updates)
```

**Editor Core's role:**
- **Input → Command**: Converts user actions to commands
- **Command → Transaction**: Executes transactions for commands
- **Selection Sync**: Keeps selection in sync with operations
- **Extension Coordination**: Manages extension lifecycle

## Key Concepts

### 1. Commands are the API

All document modifications go through commands:

```typescript
// ✅ Good: Use commands
await editor.executeCommand('insertText', { text: 'Hello' });

// ❌ Bad: Direct DataStore manipulation
dataStore.updateNode('text-1', { text: 'Hello' }); // Bypasses editor logic
```

### 2. Selection is Central

Selection determines where operations happen:

```typescript
// Insert text at current selection
await editor.executeCommand('insertText', {
  text: 'Hello',
  // Selection is automatically used from editor.getSelection()
});
```

### 3. Extensions Extend Functionality

Extensions add commands, keybindings, and behavior:

```typescript
class MyExtension {
  onCreate(context) {
    // Register command
    context.registerCommand('myCommand', async (payload) => {
      // Command logic
    });
    
    // Register keybinding
    context.registerKeybinding('Mod-k', 'myCommand');
  }
}
```

## When to Use Editor Core

- **Creating an Editor**: Required to create editor instance
- **Executing Commands**: Use `editor.executeCommand()`
- **Managing Selection**: Use `editor.getSelection()` / `setSelection()`
- **Registering Extensions**: Pass extensions to Editor constructor

## Next Steps

- Learn about [Editor View DOM](./editor-view-dom) - How Editor connects to DOM
- See [Extension Design](../guides/extension-design) - How to create extensions
- See [Architecture: Editor Core](../architecture/editor-core) - Detailed package documentation
