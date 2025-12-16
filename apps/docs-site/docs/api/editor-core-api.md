# Editor Core API

The Editor Core API provides the main `Editor` class and related interfaces for managing editor state, commands, extensions, and events.

## Editor Class

The main editor class that manages document state, selection, commands, and extensions.

### Constructor

```typescript
new Editor(options?: EditorOptions)
```

**Parameters:**
- `options?: EditorOptions` - Editor configuration options

**Options:**
```typescript
interface EditorOptions {
  content?: DocumentState;        // Initial document content
  extensions?: Extension[];        // Extensions to register
  editable?: boolean;              // Whether editor is editable (default: true)
  history?: HistoryManagerOptions; // History manager options
  model?: ModelOptions;            // Model options
  contentEditableElement?: HTMLElement; // ContentEditable element
  dataStore?: DataStore;           // Custom DataStore instance
  schema?: Schema;                 // Schema for validation
}
```

**Example:**
```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: createCoreExtensions(),
  editable: true,
  history: { maxSize: 100 }
});
```

### Properties

#### `document: DocumentState`
Current document state (read-only).

```typescript
const doc = editor.document;
// { type: 'document', content: [...], version: number, ... }
```

#### `selection: ModelSelection | null`
Current selection (read-only).

```typescript
const sel = editor.selection;
// { type: 'range', startNodeId: '...', startOffset: 0, ... }
```

#### `dataStore: DataStore`
DataStore instance (read-only).

```typescript
const node = editor.dataStore.getNode('node-id');
```

#### `isFocused: boolean`
Whether editor is currently focused.

```typescript
if (editor.isFocused) {
  // Editor is focused
}
```

#### `isEditable: boolean`
Whether editor is editable.

```typescript
if (editor.isEditable) {
  // Editor is editable
}
```

#### `keybindings: KeybindingRegistry`
Keybinding registry for managing keyboard shortcuts.

```typescript
editor.keybindings.register({
  key: 'Mod-b',
  command: 'toggleBold'
});
```

#### `selectionManager: SelectionManager`
Selection manager instance.

```typescript
editor.selectionManager.setSelection(selection);
```

### Methods

#### `setContent(content: DocumentState): void`

Sets the document content.

**Parameters:**
- `content: DocumentState` - New document content

**Behavior:**
- Triggers `onBeforeContentChange` hooks (extensions can intercept/modify)
- Updates document state
- Emits `editor:content.change` event
- Triggers `onContentChange` hooks

**Example:**
```typescript
editor.setContent({
  type: 'document',
  content: [
    { id: 'p1', type: 'paragraph', text: 'Hello' }
  ],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

#### `updateSelection(selection: SelectionState | ModelSelection): void`

Updates the current selection.

**Parameters:**
- `selection: SelectionState | ModelSelection` - New selection

**Behavior:**
- Triggers `onBeforeSelectionChange` hooks (extensions can intercept/modify)
- Updates selection state
- Emits `editor:selection.change` or `editor:selection.model` event
- Triggers `onSelectionChange` hooks

**Example:**
```typescript
// ModelSelection format
editor.updateSelection({
  type: 'range',
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});

// SelectionState format (legacy)
editor.updateSelection({
  anchorNode: domNode,
  anchorOffset: 0,
  focusNode: domNode,
  focusOffset: 5,
  // ...
});
```

#### `executeCommand(command: string, payload?: any): Promise<boolean>`

Executes a command.

**Parameters:**
- `command: string` - Command name
- `payload?: any` - Optional command payload

**Returns:**
- `Promise<boolean>` - `true` if command executed successfully

**Behavior:**
- Checks if command exists
- Validates with `canExecute` if provided
- Emits `editor:command.before` event
- Calls command's `before` hook
- Executes command
- Calls command's `after` hook
- Emits `editor:command.after` and `editor:command.execute` events

**Example:**
```typescript
const success = await editor.executeCommand('toggleBold');
const result = await editor.executeCommand('insertText', { text: 'Hello' });
```

#### `canExecuteCommand(command: string, payload?: any): boolean`

Checks if a command can be executed.

**Parameters:**
- `command: string` - Command name
- `payload?: any` - Optional command payload

**Returns:**
- `boolean` - `true` if command can be executed

**Example:**
```typescript
if (editor.canExecuteCommand('toggleBold')) {
  await editor.executeCommand('toggleBold');
}
```

#### `registerCommand(command: Command): void`

Registers a new command.

**Parameters:**
- `command: Command` - Command definition

**Example:**
```typescript
editor.registerCommand({
  name: 'myCommand',
  execute: async (editor, payload) => {
    // Command logic
    return true;
  },
  canExecute: (editor, payload) => {
    // Check if command can execute
    return true;
  }
});
```

#### `use(extension: Extension): void`

Registers an extension.

**Parameters:**
- `extension: Extension` - Extension to register

**Behavior:**
- Calls `onBeforeCreate` hook
- Calls `onCreate` hook
- Registers extension commands
- Registers extension keybindings
- Emits `extension:add` event

**Example:**
```typescript
import { BoldExtension } from '@barocss/extensions';

editor.use(new BoldExtension());
```

#### `unuse(extension: Extension): void`

Unregisters an extension.

**Parameters:**
- `extension: Extension` - Extension to unregister

**Behavior:**
- Calls `onDestroy` hook
- Unregisters extension commands
- Unregisters extension keybindings
- Emits `extension:remove` event

**Example:**
```typescript
const extension = new BoldExtension();
editor.use(extension);
// Later...
editor.unuse(extension);
```

#### `setContext(key: string, value: unknown): void`

Sets a context value (VS Code style).

**Parameters:**
- `key: string` - Context key
- `value: unknown` - Context value (set to `null` or `undefined` to remove)

**Behavior:**
- Updates context
- Emits `editor:context.change` event
- Emits `editor:context.change:${key}` event

**Example:**
```typescript
editor.setContext('readOnly', true);
editor.setContext('myExtension.enabled', true);
```

#### `getContext(key?: string): Record<string, unknown> | unknown`

Gets context value(s).

**Parameters:**
- `key?: string` - Optional context key

**Returns:**
- If `key` provided: context value for that key
- If `key` not provided: all context values

**Example:**
```typescript
const readOnly = editor.getContext('readOnly');
const allContext = editor.getContext();
```

#### `onContextChange(key: string, callback: Function): () => void`

Subscribes to changes of a specific context key.

**Parameters:**
- `key: string` - Context key to watch
- `callback: Function` - Callback function

**Returns:**
- Unsubscribe function

**Example:**
```typescript
const unsubscribe = editor.onContextChange('readOnly', ({ value, oldValue }) => {
  console.log('readOnly changed:', value);
});

// Later...
unsubscribe();
```

#### `on(event: EditorEventType, callback: Function): void`

Subscribes to an editor event.

**Parameters:**
- `event: EditorEventType` - Event name
- `callback: Function` - Callback function

**Example:**
```typescript
editor.on('editor:content.change', ({ content, transaction }) => {
  console.log('Content changed:', content);
});

editor.on('editor:command.execute', ({ command, payload, success }) => {
  console.log('Command executed:', command, success);
});
```

#### `off(event: string, callback: Function): void`

Unsubscribes from an editor event.

**Parameters:**
- `event: string` - Event name
- `callback: Function` - Callback function to remove

**Example:**
```typescript
const handler = ({ content }) => console.log(content);
editor.on('editor:content.change', handler);
// Later...
editor.off('editor:content.change', handler);
```

#### `emit(event: string, data?: any): void`

Emits an editor event.

**Parameters:**
- `event: string` - Event name
- `data?: any` - Event data

**Example:**
```typescript
editor.emit('user:customEvent', { data: 'value' });
```

#### `undo(): void`

Undoes the last operation.

**Behavior:**
- Reverts to previous history state
- Emits `editor:history.undo` event
- Emits `editor:history.change` event

**Example:**
```typescript
if (editor.canUndo()) {
  editor.undo();
}
```

#### `redo(): void`

Redoes the last undone operation.

**Behavior:**
- Re-executes undone operation
- Emits `editor:history.redo` event
- Emits `editor:history.change` event

**Example:**
```typescript
if (editor.canRedo()) {
  editor.redo();
}
```

#### `canUndo(): boolean`

Checks if undo is possible.

**Returns:**
- `boolean` - `true` if undo is possible

#### `canRedo(): boolean`

Checks if redo is possible.

**Returns:**
- `boolean` - `true` if redo is possible

#### `setEditable(editable: boolean): void`

Sets whether editor is editable.

**Parameters:**
- `editable: boolean` - Whether editor is editable

**Behavior:**
- Updates `isEditable` property
- Updates `editorEditable` context
- Emits `editor:editable.change` event

**Example:**
```typescript
editor.setEditable(false); // Make read-only
```

#### `loadDocument(treeDocument: any, sessionId?: string): void`

Loads a document from tree format.

**Parameters:**
- `treeDocument: any` - Document in tree format
- `sessionId?: string` - Session ID (default: 'editor-session')

**Example:**
```typescript
editor.loadDocument({
  stype: 'document',
  content: [
    { stype: 'paragraph', text: 'Hello' }
  ]
});
```

#### `exportDocument(rootId?: string): any | null`

Exports document to tree format.

**Parameters:**
- `rootId?: string` - Root node ID (uses default if not provided)

**Returns:**
- `any | null` - Document in tree format

**Example:**
```typescript
const doc = editor.exportDocument();
```

#### `getDocumentProxy(rootId?: string): any | null`

Gets document as Proxy (lazy evaluation).

**Parameters:**
- `rootId?: string` - Root node ID (uses default if not provided)

**Returns:**
- `any | null` - Proxy-wrapped document

**Example:**
```typescript
const proxy = editor.getDocumentProxy();
// Accessing proxy.content converts IDs to nodes on-demand
```

#### `chain(): CommandChain`

Creates a command chain for chaining multiple commands.

**Returns:**
- `CommandChain` - Command chain instance

**Example:**
```typescript
await editor.chain()
  .insertText('Hello')
  .toggleBold()
  .run();
```

#### `destroy(): void`

Destroys the editor instance.

**Behavior:**
- Calls `onDestroy` for all extensions
- Cleans up event listeners
- Emits `editor:destroy` event

**Example:**
```typescript
editor.destroy();
```

---

## Extension Interface

Extensions add functionality to the editor.

```typescript
interface Extension {
  name: string;
  priority?: number;              // Execution priority (higher = first)
  dependencies?: string[];        // Extension dependencies
  
  // Lifecycle
  onBeforeCreate?(editor: Editor): void;
  onCreate?(editor: Editor): void;
  onDestroy?(editor: Editor): void;
  
  // Command registration
  commands?: Command[];
  
  // Before hooks (intercept and modify core model changes)
  onBeforeTransaction?(editor: Editor, transaction: Transaction): Transaction | null | void;
  onBeforeSelectionChange?(editor: Editor, selection: SelectionState): SelectionState | null | void;
  onBeforeContentChange?(editor: Editor, content: DocumentState): DocumentState | null | void;
  
  // After hooks (notification for core model changes)
  onTransaction?(editor: Editor, transaction: Transaction): void;
  onSelectionChange?(editor: Editor, selection: SelectionState): void;
  onContentChange?(editor: Editor, content: DocumentState): void;
}
```

### Lifecycle Hooks

#### `onBeforeCreate(editor: Editor): void`

Called before extension is created (before `onCreate`).

#### `onCreate(editor: Editor): void`

Called when extension is registered.

**Example:**
```typescript
onCreate(editor: Editor) {
  // Register commands
  editor.registerCommand({
    name: 'myCommand',
    execute: async (editor) => {
      // ...
    }
  });
  
  // Register keybindings
  editor.keybindings.register({
    key: 'Mod-k',
    command: 'myCommand'
  });
}
```

#### `onDestroy(editor: Editor): void`

Called when extension is unregistered.

**Example:**
```typescript
onDestroy(editor: Editor) {
  // Cleanup
  editor.off('editor:content.change', this.handler);
}
```

### Before Hooks

Before hooks allow extensions to intercept and modify core model changes.

#### `onBeforeTransaction(editor: Editor, transaction: Transaction): Transaction | null | void`

Intercepts transactions before execution.

**Returns:**
- `Transaction` - Modified transaction (use this instead)
- `null` - Cancel transaction
- `void` - Continue with original transaction

**Example:**
```typescript
onBeforeTransaction(editor: Editor, transaction: Transaction) {
  if (editor.getContext('readOnly')) {
    return null; // Cancel transaction
  }
  
  // Modify transaction
  const ops = transaction.getOperations();
  // ... modify operations
  return transaction; // Use modified transaction
}
```

#### `onBeforeSelectionChange(editor: Editor, selection: SelectionState): SelectionState | null | void`

Intercepts selection changes.

**Returns:**
- `SelectionState` - Modified selection (use this instead)
- `null` - Cancel selection change
- `void` - Continue with original selection

#### `onBeforeContentChange(editor: Editor, content: DocumentState): DocumentState | null | void`

Intercepts content changes.

**Returns:**
- `DocumentState` - Modified content (use this instead)
- `null` - Cancel content change
- `void` - Continue with original content

### After Hooks

After hooks provide notifications for core model changes.

#### `onTransaction(editor: Editor, transaction: Transaction): void`

Called after transaction is executed.

#### `onSelectionChange(editor: Editor, selection: SelectionState): void`

Called after selection changes.

#### `onContentChange(editor: Editor, content: DocumentState): void`

Called after content changes.

**Note**: For other changes (Node, Command, History, etc.), use `editor.on()` events instead.

---

## Command Interface

Commands define executable actions.

```typescript
interface Command {
  name: string;
  execute: (editor: Editor, payload?: any) => boolean | Promise<boolean>;
  canExecute?: (editor: Editor, payload?: any) => boolean;
  before?: (editor: Editor, payload?: any) => void;
  after?: (editor: Editor, payload?: any) => void;
}
```

### Properties

#### `name: string`
Command name (must be unique).

#### `execute: (editor: Editor, payload?: any) => boolean | Promise<boolean>`
Command execution function.

**Returns:**
- `boolean` - `true` if successful, `false` otherwise

**Example:**
```typescript
execute: async (editor: Editor, payload?: { text: string }) => {
  const text = payload?.text || '';
  // Execute command logic
  return true;
}
```

#### `canExecute?: (editor: Editor, payload?: any) => boolean`
Optional function to check if command can execute.

**Example:**
```typescript
canExecute: (editor: Editor) => {
  return editor.selection !== null;
}
```

#### `before?: (editor: Editor, payload?: any) => void`
Optional hook called before command execution.

**Note**: This is not a true hook (cannot intercept). Use `editor:command.before` event or `onBeforeTransaction` for interception.

#### `after?: (editor: Editor, payload?: any) => void`
Optional hook called after command execution.

**Note**: This is not a true hook (cannot intercept). Use `editor:command.after` event for notification.

---

## SelectionManager

Manages selection state at the model level.

### Methods

#### `getCurrentSelection(): ModelSelection | null`

Gets current selection.

**Returns:**
- `ModelSelection | null` - Current selection or `null`

#### `setSelection(selection: ModelSelection | null): void`

Sets selection.

**Parameters:**
- `selection: ModelSelection | null` - Selection to set

#### `clearSelection(): void`

Clears selection.

#### `isEmpty(): boolean`

Checks if selection is empty.

#### `isInNode(nodeId: string): boolean`

Checks if selection is in a specific node.

#### `isAtPosition(nodeId: string, position: number): boolean`

Checks if selection is at a specific position.

#### `isInRange(nodeId: string, start: number, end: number): boolean`

Checks if selection is in a specific range.

---

## HistoryManager

Manages undo/redo history.

### Methods

#### `push(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): void`

Adds entry to history.

#### `undo(): HistoryEntry | null`

Undoes last operation.

**Returns:**
- `HistoryEntry | null` - Undone entry or `null`

#### `redo(): HistoryEntry | null`

Redoes last undone operation.

**Returns:**
- `HistoryEntry | null` - Redone entry or `null`

#### `canUndo(): boolean`

Checks if undo is possible.

#### `canRedo(): boolean`

Checks if redo is possible.

#### `getStats(): HistoryStats`

Gets history statistics.

**Returns:**
```typescript
{
  totalEntries: number;
  currentIndex: number;
  canUndo: boolean;
  canRedo: boolean;
}
```

---

## KeybindingRegistry

Manages keyboard shortcuts.

### Methods

#### `register(binding: Keybinding): void`

Registers a keybinding.

**Parameters:**
```typescript
interface Keybinding {
  key: string;           // Key combination (e.g., 'Mod-b', 'Ctrl-k Ctrl-s')
  command: string;       // Command name
  args?: unknown;        // Optional command arguments
  when?: string;         // When clause (VS Code style)
  source?: KeybindingSource; // 'core' | 'extension' | 'user'
}
```

**Example:**
```typescript
editor.keybindings.register({
  key: 'Mod-b',
  command: 'toggleBold',
  when: 'editorTextFocus && !editorReadonly'
});
```

#### `unregister(binding: Keybinding): void`

Unregisters a keybinding.

#### `clear(source?: KeybindingSource): void`

Clears keybindings (optionally by source).

#### `resolve(key: string, context?: Record<string, unknown>): Array<{ command: string; args?: unknown }>`

Resolves keybinding to commands.

**Returns:**
- Array of matching commands

---

## Editor Events

Editor emits various events for extension integration.

### Event Types

#### Content Events
- `editor:content.change` - Content changed
- `editor:node.create` - Node created
- `editor:node.update` - Node updated
- `editor:node.delete` - Node deleted

#### Selection Events
- `editor:selection.change` - Selection changed
- `editor:selection.focus` - Selection focused
- `editor:selection.blur` - Selection blurred
- `editor:selection.model` - Model selection changed

#### Command Events
- `editor:command.execute` - Command executed
- `editor:command.before` - Before command execution
- `editor:command.after` - After command execution

#### History Events
- `editor:history.change` - History state changed
- `editor:history.undo` - Undo performed
- `editor:history.redo` - Redo performed

#### Context Events
- `editor:context.change` - Context changed
- `editor:context.change:${key}` - Specific context key changed

#### Extension Events
- `extension:add` - Extension added
- `extension:remove` - Extension removed
- `extension:enable` - Extension enabled
- `extension:disable` - Extension disabled

#### Error Events
- `error:selection` - Selection error
- `error:command` - Command error
- `error:extension` - Extension error

#### Lifecycle Events
- `editor:create` - Editor created
- `editor:destroy` - Editor destroyed
- `editor:editable.change` - Editable state changed

### Event Subscription

```typescript
// Subscribe
editor.on('editor:content.change', ({ content, transaction }) => {
  console.log('Content changed:', content);
});

// Unsubscribe
const handler = ({ content }) => console.log(content);
editor.on('editor:content.change', handler);
editor.off('editor:content.change', handler);
```

---

## Related

- [Extension Design Guide](../guides/extension-design) - Creating extensions
- [Advanced Extension Patterns](../guides/advanced-extensions) - Advanced extension patterns
- [Model Operations API](./model-operations) - Model layer operations
- [Operation Selection Guide](./operation-selection-guide) - Choosing operations
