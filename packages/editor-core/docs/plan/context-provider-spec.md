# Context Provider Specification

## 1. Overview

`ContextProvider` is a system that manages and provides context keys representing the current state of the Editor. It was designed by referencing VS Code's [when clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts).

Context keys are used in `when` clauses to control activation/deactivation of keybindings, commands, and UI elements.

## 2. Purpose

ContextProvider is used for the following purposes:

1. **Keybinding activation/deactivation**: Control keybinding activation only in specific states using `when` clauses
2. **Command activation/deactivation**: Control command activation conditions with context keys in Extension
3. **UI state management**: Control display/hide of UI elements with context keys in Extension
4. **State-based logic**: Perform different actions based on Editor's current state

## 3. ContextProvider Interface

```typescript
export interface ContextProvider {
  getContext(): Record<string, unknown>;
}
```

`Editor` implements `ContextProvider` and is automatically registered in `KeybindingRegistry`.

## 4. Default Context Keys

Editor automatically manages the following context keys. These values are **automatically initialized when Editor is created, and already exist before Extension's `onCreate` is executed.**

### 4.1 Default Context Key Definition

Default context keys are explicitly defined in `@barocss/editor-core/src/context/default-context.ts`:

```typescript
import { 
  DEFAULT_CONTEXT_KEYS, 
  DEFAULT_CONTEXT_INITIAL_VALUES,
  DEFAULT_CONTEXT_DESCRIPTIONS 
} from '@barocss/editor-core';

// Use default context key constants
const isFocused = editor.getContext()[DEFAULT_CONTEXT_KEYS.EDITOR_FOCUS];
```

### 4.2 Editor State

| Context Key | Type | Initial Value | Description |
|-------------|------|--------------|-------------|
| `editorFocus` | `boolean` | `false` | Whether Editor has focus |
| `editorEditable` | `boolean` | `true` | Whether Editor is in editable state |

### 4.3 Platform State

| Context Key | Type | Initial Value | Description |
|-------------|------|--------------|-------------|
| `isMac` | `boolean` | `false` | Whether current execution environment is macOS (based on `IS_MAC` from `@barocss/shared`) |
| `isLinux` | `boolean` | `false` | Whether current execution environment is Linux (based on `IS_LINUX`) |
| `isWindows` | `boolean` | `false` | Whether current execution environment is Windows (based on `IS_WINDOWS`) |

These values are initialized with default values when Editor is created, then always overwritten with latest platform constants when `_updateBuiltinContext()` is called.  
That is, Extensions can safely use `isMac`, `isLinux`, `isWindows` in `when` clauses at any time.

### 4.4 Selection State

| Context Key | Type | Initial Value | Description |
|-------------|------|--------------|-------------|
| `selectionEmpty` | `boolean` | `true` | Whether Selection is empty (collapsed) |
| `selectionType` | `'range' \| 'node' \| 'multi-node' \| 'cell' \| 'table' \| null` | `null` | Selection type |
| `selectionDirection` | `'forward' \| 'backward' \| null` | `null` | Selection direction |

### 4.5 History State

| Context Key | Type | Initial Value | Description |
|-------------|------|--------------|-------------|
| `historyCanUndo` | `boolean` | `false` | Whether Undo is possible |
| `historyCanRedo` | `boolean` | `false` | Whether Redo is possible |

### 4.6 Automatic Updates

The above default context keys are automatically updated when Editor state changes:

- `editorFocus`: When Editor focus changes
- `editorEditable`: When `setEditable()` is called
- `selectionEmpty`, `selectionType`, `selectionDirection`: When `updateSelection()` is called
- `historyCanUndo`, `historyCanRedo`: When History state changes
- `isMac`, `isLinux`, `isWindows`: Reset each time `_updateBuiltinContext()` is called based on platform constants (`IS_MAC`, etc.), and remain immutable during runtime.

**Important**: Default context keys are updated via `_updateBuiltinContext()` method, and this method does not call `setContext()`, so **no events are emitted**. Extensions can assume these values always exist.

### 4.7 Using Default Context in Extension

When using default context keys in Extension's `onCreate`, you can assume these values always exist:

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // Default context keys always exist, so can be used safely
    const isFocused = editor.getContext()['editorFocus'] as boolean;
    const isEditable = editor.getContext()['editorEditable'] as boolean;
    const isMac = editor.getContext()['isMac'] as boolean;
    
    // Can also be used safely in when clauses
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable' // Always defined
    });

    // Can also register different keybindings per OS
    editor.keybindings.register({
      key: isMac ? 'Alt+ArrowLeft' : 'Ctrl+ArrowLeft',
      command: 'moveCursorWordLeft',
      when: 'editorFocus'
    });
  }
}
```

## 5. Adding Custom Context

Extensions or host applications can add custom context keys.

### 5.1 Context Key Value Types

Context keys can have values of the following types:

- **boolean**: `true`, `false`
- **string**: `'edit'`, `'view'`, etc.
- **number**: `0`, `5`, `-1`, etc.
- **array**: `['test', 'foo', 'bar']`, etc.
- **object**: `{ test: true, foo: 'anything' }`, etc.
- **null**: Used to remove context key
- **undefined**: Used to remove context key

### 5.2 Direct Method Call

```typescript
// Set boolean value
editor.setContext('myExtension.showMyCommand', true);

// Set number value
editor.setContext('myExtension.numberOfItems', 5);

// Set string value
editor.setContext('myExtension.currentMode', 'edit');

// Set array value
editor.setContext('myExtension.supportedFolders', ['test', 'foo', 'bar']);

// Set object value (check by key existence)
editor.setContext('myExtension.supportedFolders', {
  test: true,
  foo: 'anything',
  bar: true
});

// Remove context key
editor.setContext('myExtension.showMyCommand', null);
// Or
editor.setContext('myExtension.showMyCommand', undefined);
```

### 5.3 Using Command (VS Code Style)

```typescript
// Use setContext command
await editor.executeCommand('setContext', {
  key: 'myExtension.showMyCommand',
  value: true
});

// Remove context key
await editor.executeCommand('setContext', {
  key: 'myExtension.showMyCommand',
  value: null
});
```

### 5.4 Context Key Initialization Timing

Context keys are initialized at the following times:

1. **When Editor is created**: Default context keys are automatically initialized.
2. **When Extension is activated**: It's common to set context keys in `onCreate`.
3. **When state changes**: Related context keys are automatically updated when Editor state changes.

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // Initialize context when Extension is activated
    editor.setContext('myExtension.enabled', true);
    editor.setContext('myExtension.mode', 'default');
  }
  
  onDestroy(editor: Editor): void {
    // Clean up context when Extension is removed
    editor.setContext('myExtension.enabled', false);
    editor.setContext('myExtension.mode', null);
  }
}
```

## 6. Subscribing to Context Change Events

Events are emitted when Context changes. You can subscribe to specific keys only or all changes.

### 6.1 Subscribe to All Context Changes

```typescript
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  console.log(`Context ${key} changed:`, value);
});
```

### 6.2 Subscribe to Specific Keys Only (Recommended)

```typescript
// Method 1: Directly subscribe to specific key event
editor.on('editor:context.change:myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// Method 2: Use convenience method (recommended)
const unsubscribe = editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// Unsubscribe if needed
unsubscribe();
```

### 6.3 ⚠️ Initialization Timing Event Loss Issue

**Problem**: When `setContext` is called in `onCreate`, events are emitted, but other Extensions' `onCreate` may not have executed yet, so initial setting events may be missed.

**Scenario**:
```typescript
// Extension A (registered first)
export class ExtensionA implements Extension {
  onCreate(editor: Editor): void {
    editor.setContext('extensionA.key', 'value'); // Event emitted
  }
}

// Extension B (registered later)
export class ExtensionB implements Extension {
  onCreate(editor: Editor): void {
    // Extension A's onCreate already executed and event was emitted, but
    // listener not registered yet at this point, so event not received
    editor.onContextChange('extensionA.key', (data) => {
      console.log('Received:', data); // Initial setting event not received
    });
  }
}
```

**Solutions**:

1. **Initial state check pattern** (recommended):
```typescript
export class ExtensionB implements Extension {
  onCreate(editor: Editor): void {
    // 1. Register listener
    editor.onContextChange('extensionA.key', ({ value }) => {
      this.handleChange(value);
    });

    // 2. Check initial state (may already be set)
    const initialValue = editor.getContext()['extensionA.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }
  }

  private handleChange(value: unknown): void {
    // Handle change
  }
}
```

2. **Adjust Extension registration order**:
```typescript
// Adjust order so Extension B is registered before Extension A
const editor = new Editor({
  extensions: [
    new ExtensionB(), // Register first (register listener)
    new ExtensionA()  // Register later (set context)
  ]
});
```

3. **Explicit dependency**:
```typescript
export class ExtensionB implements Extension {
  name = 'extensionB';
  dependencies = ['extensionA']; // Ensure Extension A is registered first

  onCreate(editor: Editor): void {
    // Extension A may have already executed onCreate, so check initial state
    const initialValue = editor.getContext()['extensionA.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }

    // Subscribe to subsequent changes
    editor.onContextChange('extensionA.key', ({ value }) => {
      this.handleChange(value);
    });
  }
}
```

**Recommendations**:
- If there are dependencies between Extensions, use the pattern of checking initial state.
- Calling `setContext` in `onCreate` is fine, but when other Extensions subscribe to it, initial state should be checked.
- Listeners detect "changes", so missing events at initial setting time is common and can be resolved by checking initial state.

## 7. Usage in When Clause

Context keys are used in `when` clauses to control activation conditions of keybindings or commands.

### 7.1 Basic Usage Examples

```typescript
// Activate only when Editor has focus and is editable
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable'
});

// Activate only when Selection is not empty
editor.keybindings.register({
  key: 'Mod+c',
  command: 'copy',
  when: '!selectionEmpty'
});

// Activate only for specific Selection type
editor.keybindings.register({
  key: 'Mod+d',
  command: 'duplicateNode',
  when: 'selectionType == "node"'
});
```

### 7.2 Custom Context Usage Examples

```typescript
// Set context in Extension
editor.setContext('myExtension.showMyCommand', true);

// Keybinding using custom context
editor.keybindings.register({
  key: 'Mod+Shift+m',
  command: 'myCustomCommand',
  when: 'myExtension.showMyCommand && editorFocus',
  source: 'extension'
});
```

### 7.3 Complex Condition Examples

```typescript
// Activate only when Undo is possible and Editor is editable
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  when: 'historyCanUndo && editorEditable'
});

// Activate only when Selection is not empty and specific type
editor.keybindings.register({
  key: 'Delete',
  command: 'deleteSelection',
  when: '!selectionEmpty && selectionType == "range"'
});
```

## 8. Context Key Naming Rules

When adding custom context keys, it's recommended to follow these rules:

1. **Use Extension name prefix**: Format like `myExtension.keyName`
2. **Use camelCase**: `showMyCommand`, `numberOfItems`, etc.
3. **Clear names**: Use names that clearly show purpose
4. **boolean values**: Use prefixes like `is`, `has`, `can`, `show`

Examples:
- ✅ `myExtension.showMyCommand`
- ✅ `myExtension.canEdit`
- ✅ `myExtension.hasSelection`
- ❌ `showCommand` (no extension name)
- ❌ `SHOW_COMMAND` (using uppercase)

## 9. Context Query

There are two ways to query context keys:

### 9.1 Query All Context

```typescript
const context = editor.getContext();
console.log(context);
// {
//   editorFocus: true,
//   editorEditable: true,
//   selectionEmpty: false,
//   selectionType: 'range',
//   selectionDirection: 'forward',
//   historyCanUndo: true,
//   historyCanRedo: false,
//   myExtension.showMyCommand: true,
//   ...
// }
```

### 9.2 Query Specific Key (Convenience Method)

To query only a specific context key, you can use `getContext(key)`:

```typescript
// Query specific key (recommended)
const isFocused = editor.getContext('editorFocus') as boolean;
const isEditable = editor.getContext('editorEditable') as boolean;
const selectionType = editor.getContext('selectionType') as string | null;

// Query custom context key
const showCommand = editor.getContext('myExtension.showMyCommand') as boolean;

// Returns undefined for non-existent keys
const unknown = editor.getContext('unknown.key'); // undefined
```

**Advantages**:
- More concise code: `editor.getContext('key')` vs `editor.getContext()['key']`
- Type safety: Type casting is clearer in TypeScript
- Readability: Intent is clearer

**Existing method still available**:
```typescript
// Existing method still usable
const context = editor.getContext();
const isFocused = context['editorFocus'] as boolean;
```

## 10. Compatibility with VS Code

This ContextProvider system was designed by referencing VS Code's when clause contexts system:

- **Same concept**: State management via context keys
- **Same usage**: Use `setContext` command
- **Similar default context**: Editor state, Selection state, etc.
- **Extensible**: Extensions can add custom context

VS Code documentation: [When clause contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

## 11. Usage Example: Using Context in Extension

```typescript
import { Extension, Editor } from '@barocss/editor-core';

export class MyExtension implements Extension {
  name = 'myExtension';

  onCreate(editor: Editor): void {
    // Set context when Extension is activated
    editor.setContext('myExtension.enabled', true);
    
    // Update context under specific conditions
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      if (selection && selection.type === 'node') {
        editor.setContext('myExtension.hasNodeSelection', true);
      } else {
        editor.setContext('myExtension.hasNodeSelection', false);
      }
    });
    
    // Subscribe to context changes
    const unsubscribe = editor.onContextChange('myExtension.enabled', ({ value }) => {
      console.log('Extension enabled:', value);
    });
    
    // Clean up when Extension is removed
    this.onDestroy = () => {
      unsubscribe();
      editor.setContext('myExtension.enabled', false);
    };
  }
}
```

## 12. Debugging

### 12.1 Context Key Query

You can query all current context keys for debugging:

```typescript
const context = editor.getContext();
console.log('Current context keys:', context);

// Check specific key
console.log('showMyCommand:', context['myExtension.showMyCommand']);
```

### 12.2 Context Change Tracking

You can track context changes for debugging:

```typescript
// Log all context changes
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  console.log(`[Context] ${key}: ${oldValue} → ${value}`);
});

// Track specific key only
editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log(`[Context] showMyCommand: ${oldValue} → ${value}`);
});
```

### 12.3 When Clause Evaluation Check

When keybinding is not activated, you can check context keys to identify the cause:

```typescript
import { evaluateWhenExpression } from '@barocss/editor-core';

// Register keybinding
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'myExtension.showMyCommand && editorFocus'
});

// Check context
const context = editor.getContext();
console.log('showMyCommand:', context['myExtension.showMyCommand']); // true/false
console.log('editorFocus:', context['editorFocus']); // true/false

// Manually evaluate when clause (for debugging)
const whenExpr = 'myExtension.showMyCommand && editorFocus';
const result = evaluateWhenExpression(whenExpr, context);
console.log(`When clause "${whenExpr}" evaluates to:`, result);
```

## 13. Performance Considerations

### 13.1 Number of Context Keys

When managing many context keys, consider the following:

1. **Set only needed keys**: Don't set or remove unused context keys.
2. **Subscribe to specific keys only**: Instead of subscribing to all context changes, subscribe only to needed keys.
3. **Clean up event listeners**: Clean up event listeners when Extension is removed.

```typescript
export class MyExtension implements Extension {
  private unsubscribeCallbacks: (() => void)[] = [];

  onCreate(editor: Editor): void {
    // Subscribe to multiple context changes
    this.unsubscribeCallbacks.push(
      editor.onContextChange('myExtension.key1', this.handleKey1Change),
      editor.onContextChange('myExtension.key2', this.handleKey2Change)
    );
  }

  onDestroy(editor: Editor): void {
    // Unsubscribe all
    this.unsubscribeCallbacks.forEach(unsubscribe => unsubscribe());
    this.unsubscribeCallbacks = [];
  }
}
```

### 13.2 Context Change Frequency

Frequently changing context keys can affect performance:

- **Prevent excessive updates**: Update context only when needed.
- **Batch updates**: Updating multiple contexts at once may be more efficient.

```typescript
// Inefficient: Update multiple times
editor.setContext('myExtension.item1', value1);
editor.setContext('myExtension.item2', value2);
editor.setContext('myExtension.item3', value3);

// Efficient: Update once with object
editor.setContext('myExtension.items', {
  item1: value1,
  item2: value2,
  item3: value3
});
```

## 14. Common Patterns

### 14.1 Extension Activation State Management

```typescript
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.setContext('myExtension.enabled', true);
  }

  onDestroy(editor: Editor): void {
    editor.setContext('myExtension.enabled', false);
  }
}
```

### 14.2 Selection-Based Context Update

```typescript
editor.on('editor:selection.model', () => {
  const selection = editor.selection;
  
  // Update context based on Selection type
  if (selection?.type === 'node') {
    editor.setContext('myExtension.hasNodeSelection', true);
  } else {
    editor.setContext('myExtension.hasNodeSelection', false);
  }
});
```

### 14.3 Mode-Based Context Management

```typescript
class EditorMode {
  private currentMode: string = 'default';

  setMode(editor: Editor, mode: string): void {
    this.currentMode = mode;
    editor.setContext('myExtension.mode', mode);
  }

  getMode(): string {
    return this.currentMode;
  }
}
```

### 14.4 Conditional Keybinding Registration

```typescript
// Register keybinding only when Extension is activated
editor.onContextChange('myExtension.enabled', ({ value }) => {
  if (value) {
    editor.keybindings.register({
      key: 'Mod+Shift+m',
      command: 'myCustomCommand',
      when: 'editorFocus',
      source: 'extension'
    });
  }
});
```

## 17. Real-World Use Cases

### 17.1 Read-Only Mode Management

Disable certain commands when editor is in read-only mode:

```typescript
export class ReadOnlyExtension implements Extension {
  name = 'readOnly';

  onCreate(editor: Editor): void {
    // Set read-only mode
    editor.setEditable(false);
    // Or use custom context
    editor.setContext('readOnlyExtension.enabled', true);
  }

  setReadOnly(editor: Editor, readOnly: boolean): void {
    editor.setEditable(!readOnly);
    editor.setContext('readOnlyExtension.enabled', readOnly);
    
    // Disable edit-related keybindings when read-only
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: '!readOnlyExtension.enabled && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.2 Edit Mode Switching (Normal/Markdown/Code)

Perform different actions based on various edit modes:

```typescript
export class ModeExtension implements Extension {
  name = 'mode';
  private currentMode: 'normal' | 'markdown' | 'code' = 'normal';

  onCreate(editor: Editor): void {
    editor.setContext('modeExtension.currentMode', 'normal');
    
    // Register keybindings per mode
    editor.keybindings.register({
      key: 'Mod+Shift+m',
      command: 'toggleMarkdownMode',
      when: 'modeExtension.currentMode != "markdown"',
      source: 'extension'
    });
    
    editor.keybindings.register({
      key: 'Mod+Shift+c',
      command: 'toggleCodeMode',
      when: 'modeExtension.currentMode != "code"',
      source: 'extension'
    });
  }

  setMode(editor: Editor, mode: 'normal' | 'markdown' | 'code'): void {
    this.currentMode = mode;
    editor.setContext('modeExtension.currentMode', mode);
  }
}
```

### 17.3 UI Display Based on Selected Node Type

Display different toolbars or menus based on selected node's type:

```typescript
export class NodeTypeExtension implements Extension {
  name = 'nodeType';

  onCreate(editor: Editor): void {
    // Update node type context when Selection changes
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      if (selection?.type === 'node') {
        const node = editor.dataStore.getNode(selection.nodeId);
        if (node) {
          editor.setContext('nodeTypeExtension.selectedType', node.stype);
          editor.setContext('nodeTypeExtension.isImage', node.stype === 'inline-image');
          editor.setContext('nodeTypeExtension.isTable', node.stype === 'table');
        }
      } else {
        editor.setContext('nodeTypeExtension.selectedType', null);
        editor.setContext('nodeTypeExtension.isImage', false);
        editor.setContext('nodeTypeExtension.isTable', false);
      }
    });
    
    // Activate image edit commands only when image is selected
    editor.keybindings.register({
      key: 'Mod+i',
      command: 'editImage',
      when: 'nodeTypeExtension.isImage && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.4 Multi-Selection State Management

Manage state when multiple nodes are selected:

```typescript
export class MultiSelectionExtension implements Extension {
  name = 'multiSelection';

  onCreate(editor: Editor): void {
    editor.on('editor:selection.model', () => {
      const selection = editor.selection;
      const isMultiSelection = selection?.type === 'multi-node';
      const selectionCount = isMultiSelection 
        ? (selection as any).nodeIds?.length || 0 
        : 0;
      
      editor.setContext('multiSelectionExtension.hasMultiple', isMultiSelection);
      editor.setContext('multiSelectionExtension.count', selectionCount);
    });
    
    // Activate batch operation commands only during multi-selection
    editor.keybindings.register({
      key: 'Mod+Shift+d',
      command: 'duplicateSelected',
      when: 'multiSelectionExtension.hasMultiple && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.5 Drag and Drop State Management

Disable specific actions while dragging:

```typescript
export class DragDropExtension implements Extension {
  name = 'dragDrop';
  private isDragging = false;

  onCreate(editor: Editor): void {
    editor.setContext('dragDropExtension.isDragging', false);
    
    // DOM event listeners
    const element = editor.selectionManager.getContentEditableElement();
    if (element) {
      element.addEventListener('dragstart', () => {
        this.isDragging = true;
        editor.setContext('dragDropExtension.isDragging', true);
      });
      
      element.addEventListener('dragend', () => {
        this.isDragging = false;
        editor.setContext('dragDropExtension.isDragging', false);
      });
    }
    
    // Disable text selection while dragging
    editor.keybindings.register({
      key: 'Mod+a',
      command: 'selectAll',
      when: '!dragDropExtension.isDragging && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.6 Error State Management

Limit specific actions when errors occur:

```typescript
export class ErrorStateExtension implements Extension {
  name = 'errorState';

  onCreate(editor: Editor): void {
    editor.setContext('errorStateExtension.hasError', false);
    editor.setContext('errorStateExtension.errorMessage', null);
    
    // Update context when error occurs
    editor.on('error:command', ({ error }) => {
      editor.setContext('errorStateExtension.hasError', true);
      editor.setContext('errorStateExtension.errorMessage', error.message);
      
      // Automatically clear after certain time after error
      setTimeout(() => {
        editor.setContext('errorStateExtension.hasError', false);
        editor.setContext('errorStateExtension.errorMessage', null);
      }, 3000);
    });
    
    // Disable some commands when in error state
    editor.keybindings.register({
      key: 'Mod+s',
      command: 'save',
      when: '!errorStateExtension.hasError && editorFocus',
      source: 'extension'
    });
  }
}
```

### 17.7 Loading State Management

Control UI during async operations:

```typescript
export class LoadingStateExtension implements Extension {
  name = 'loadingState';
  private loadingCount = 0;

  onCreate(editor: Editor): void {
    editor.setContext('loadingStateExtension.isLoading', false);
    editor.setContext('loadingStateExtension.loadingCount', 0);
    
    this.startLoading = (editor: Editor) => {
      this.loadingCount++;
      editor.setContext('loadingStateExtension.isLoading', true);
      editor.setContext('loadingStateExtension.loadingCount', this.loadingCount);
    };
    
    this.stopLoading = (editor: Editor) => {
      this.loadingCount = Math.max(0, this.loadingCount - 1);
      editor.setContext('loadingStateExtension.isLoading', this.loadingCount > 0);
      editor.setContext('loadingStateExtension.loadingCount', this.loadingCount);
    };
  }

  startLoading(editor: Editor): void {}
  stopLoading(editor: Editor): void {}
}
```

### 17.8 History-Based Undo/Redo Button State

Control Undo/Redo button activation based on history state:

```typescript
export class HistoryUIExtension implements Extension {
  name = 'historyUI';

  onCreate(editor: Editor): void {
    // Update context when history changes
    editor.on('editor:history.change', () => {
      editor.setContext('historyUIExtension.canUndo', editor.historyManager.canUndo());
      editor.setContext('historyUIExtension.canRedo', editor.historyManager.canRedo());
    });
    
    // Set initial state
    editor.setContext('historyUIExtension.canUndo', false);
    editor.setContext('historyUIExtension.canRedo', false);
    
    // Undo/Redo keybindings use default context, but
    // custom context can also be used for UI button activation
    editor.keybindings.register({
      key: 'Mod+z',
      command: 'undo',
      when: 'historyUIExtension.canUndo && editorEditable',
      source: 'extension'
    });
  }
}
```

### 17.9 Extension-Specific Settings State

Change behavior based on extension settings:

```typescript
export class SettingsExtension implements Extension {
  name = 'settings';
  private settings: Record<string, unknown> = {};

  onCreate(editor: Editor): void {
    // Manage settings as context
    this.updateSettings(editor, {
      autoSave: true,
      theme: 'light',
      fontSize: 14
    });
  }

  updateSettings(editor: Editor, newSettings: Record<string, unknown>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // Set each setting as context key
    Object.entries(newSettings).forEach(([key, value]) => {
      editor.setContext(`settingsExtension.${key}`, value);
    });
    
    // Activate/deactivate keybindings based on settings
    editor.keybindings.register({
      key: 'Mod+Shift+s',
      command: 'toggleAutoSave',
      when: 'settingsExtension.autoSave == false',
      source: 'extension'
    });
  }
}
```

### 17.10 Complex Conditions: Combining Multiple Context Keys

Create complex conditions by combining multiple context keys:

```typescript
export class ComplexConditionExtension implements Extension {
  name = 'complexCondition';

  onCreate(editor: Editor): void {
    // Keybinding combining multiple conditions
    editor.keybindings.register({
      key: 'Mod+Shift+p',
      command: 'preview',
      when: 'editorFocus && !readOnlyExtension.enabled && modeExtension.currentMode == "markdown" && !loadingStateExtension.isLoading',
      source: 'extension'
    });
    
    // Activate only when specific node type and not multi-selection
    editor.keybindings.register({
      key: 'Mod+Shift+e',
      command: 'editNode',
      when: 'nodeTypeExtension.isImage && !multiSelectionExtension.hasMultiple && editorFocus',
      source: 'extension'
    });
  }
}
```

## 15. Context Key and When Clause Re-evaluation

When context keys change, `editor:context.change` event is emitted. However, `when` clauses are **not automatically re-evaluated immediately**.

### 15.1 Re-evaluation Timing

`when` clauses are re-evaluated at the following times:

1. **When keybinding is resolved**: When `editor.keybindings.resolve(key)` is called
2. **When key is pressed**: When `editor-view-dom` receives key input and calls `resolve()`

### 15.2 Behavior Flow

```
1. Context change: editor.setContext('myExtension.showMyCommand', true)
2. Event emitted: editor:context.change event emitted
3. Key input: User presses key
4. resolve called: editor.keybindings.resolve(key) called
5. When Clause evaluation: Re-evaluate when clause with current context
6. Keybinding activation/deactivation: Decide whether to return keybinding based on re-evaluation result
```

### 15.3 Notes

- Changing context keys does **not immediately activate/deactivate keybindings**.
- Re-evaluation occurs at next key input time and is reflected.
- To display keybinding state in UI, you need to subscribe to context change events and manually update UI.

## 16. Notes

1. **Context Keys are strings**: All context keys are stored as strings, and values are of type `unknown`.
2. **Automatic updates**: Default context keys are automatically updated when Editor state changes.
3. **Event-based**: Context changes are notified via events, so subscribe only when needed.
4. **Performance**: Subscribing to specific keys only reduces unnecessary event processing.
5. **Naming conflicts**: Use Extension name as prefix to prevent conflicts with other Extensions.
6. **Context Key removal**: Setting `null` or `undefined` completely removes context key (uses `delete` operator). It also disappears from `getContext()`.
7. **When Clause evaluation**: If context key is `undefined` or doesn't exist, it evaluates to `false` in `when` clause.
8. **Type safety**: Context key values are of type `unknown`, so type checks may be needed when using them.

---

## 18. Related Documents

- [Keybinding & Context Usage Examples Guide](./keybinding-and-context-examples.md) - **Collection of real-world usage examples and sample code** ⭐
- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Detailed keybinding system specification
- [When Expression Spec](./when-expression-spec.md) - `when` clause evaluation specification
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - Default keybinding management specification
