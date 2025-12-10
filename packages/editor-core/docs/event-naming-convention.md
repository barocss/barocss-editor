# Event Naming Convention

Barocss Editor uses a namespace-based event naming convention for a systematic and extensible event system.

## 📋 Basic Structure

```
[namespace]:[category].[action]
```

## 🏷️ Namespace Categories

### 1. Editor Core Events (`editor:`)
Events related to the editor's core functionality.

```typescript
// Content related
'editor:content.change'     // content change
'editor:node.create'        // node creation
'editor:node.update'        // node update
'editor:node.delete'        // node deletion

// Selection related
'editor:selection.change'   // selection change
'editor:selection.focus'    // selection focus
'editor:selection.blur'     // selection blur

// Command related
'editor:command.execute'    // command execution
'editor:command.before'     // before command execution
'editor:command.after'      // after command execution

// History related
'editor:history.change'     // history change
'editor:history.undo'       // undo
'editor:history.redo'       // redo

// Others
'editor:editable.change'    // editable state change
'editor:create'             // editor creation
'editor:destroy'            // editor destruction
```

### 2. Error Events (`error:`)
Events related to errors.

```typescript
'error:selection'    // selection-related error
'error:command'      // command-related error
'error:extension'    // extension-related error
```

### 3. Extension Events (`extension:`)
Events related to extensions.

```typescript
'extension:add'      // extension added
'extension:remove'   // extension removed
'extension:enable'   // extension enabled
'extension:disable'  // extension disabled
```

### 4. Plugin Events (`plugin:`)
Custom events related to plugins.

```typescript
'plugin:custom'           // custom plugin
'plugin:myPlugin.action'  // specific plugin action
'plugin:save.auto'        // auto-save plugin
```

### 5. User Events (`user:`)
Custom events related to user actions.

```typescript
'user:save'        // user save
'user:action'      // user action
'user:keyboard'    // keyboard input
'user:mouse'       // mouse action
```

## 🎯 Usage Examples

### Basic Usage

```typescript
import { Editor } from '@barocss/editor-core';

const editor = new Editor({
  contentEditableElement: document.getElementById('editor'),
  dataStore: dataStore,
  schema: schema
});

// Editor Core events
editor.on('editor:content.change', (data) => {
  console.log('Content changed:', data.content);
});

editor.on('editor:selection.change', (data) => {
  console.log('Selection changed:', data.selection);
});

// Error events
editor.on('error:selection', (data) => {
  console.error('Selection error:', data.error);
});

// Extension events
editor.on('extension:add', (data) => {
  console.log('Extension added:', data.extension.name);
});

// Plugin events (custom)
editor.on('plugin:myPlugin.save', (data) => {
  console.log('Plugin save:', data);
});

// User events (custom)
editor.on('user:customAction', (data) => {
  console.log('User action:', data);
});
```

### Type Safety

```typescript
// Type safety in TypeScript
editor.on('editor:selection.change', (data) => {
  // data is automatically typed as { selection: SelectionState; oldSelection: SelectionState }
  console.log(data.selection.textContent);
  console.log(data.oldSelection.textContent);
});

editor.on('error:selection', (data) => {
  // data is automatically typed as { error: SelectionError }
  console.error(data.error.code, data.error.message);
});
```

## 🔧 Extension Methods

### Adding New Namespace

```typescript
// Add new namespace in types.ts
export type EditorEventType = 
  | 'editor:content.change'
  | 'myapp:feature.action'  // new namespace
  | `myapp:${string}`       // dynamic namespace
  | string;

// Define types in EditorEvents interface
export interface EditorEvents {
  'editor:content.change': { content: DocumentState; transaction: Transaction };
  'myapp:feature.action': { feature: string; action: string; data: any };
  [K: `myapp:${string}`]: any;
  [K: string]: any;
}
```

### Using Custom Events

```typescript
// Completely free custom events
editor.on('myCustomEvent', (data) => {
  console.log('Custom event:', data);
});

editor.emit('myCustomEvent', { message: 'Hello World' });
```

## 📝 Naming Rules

1. **Namespace**: lowercase, separated by colon
2. **Category**: lowercase, separated by dot
3. **Action**: lowercase, separated by dot
4. **Consistency**: events in the same category use the same namespace
5. **Clarity**: event name should clearly indicate its purpose

## 🚀 Benefits

- **Systematic**: events grouped by namespace
- **Extensible**: easy to add new namespaces
- **Type-safe**: TypeScript type checking
- **Intuitive**: purpose clear from event name
- **Flexible**: free to use custom events
