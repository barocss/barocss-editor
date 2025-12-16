# Advanced Extension Patterns

This guide covers advanced patterns for building complex extensions, including multiple commands, command chaining, and integration with other editor features.

## Table of Contents

1. [Multiple Commands](#multiple-commands)
2. [Command Chaining](#command-chaining)
3. [Extension Options](#extension-options)
4. [Integration Patterns](#integration-patterns)
5. [Before Hooks (Intercepting Changes)](#before-hooks-intercepting-changes)
6. [Extension Lifecycle](#extension-lifecycle)

---

## Multiple Commands

Extensions can register multiple related commands:

```typescript
export class ListExtension implements Extension {
  name = 'list';
  
  onCreate(editor: Editor): void {
    // Bullet list command
    editor.registerCommand({
      name: 'toggleBulletList',
      execute: async (editor: Editor) => {
        return await this._toggleList(editor, 'bullet');
      },
      canExecute: (editor: Editor) => {
        return !!editor.selection?.startNodeId;
      }
    });
    
    // Numbered list command
    editor.registerCommand({
      name: 'toggleNumberedList',
      execute: async (editor: Editor) => {
        return await this._toggleList(editor, 'numbered');
      },
      canExecute: (editor: Editor) => {
        return !!editor.selection?.startNodeId;
      }
    });
    
    // Keybindings
    editor.keybindings.register({
      key: 'Mod+Shift+8',
      command: 'toggleBulletList',
      when: 'editorFocus && editorEditable'
    });
    
    editor.keybindings.register({
      key: 'Mod+Shift+7',
      command: 'toggleNumberedList',
      when: 'editorFocus && editorEditable'
    });
  }
  
  onDestroy(_editor: Editor): void {
    // Cleanup if needed
  }
  
  private async _toggleList(editor: Editor, type: 'bullet' | 'numbered'): Promise<boolean> {
    // Implementation
    const selection = editor.selection;
    if (!selection?.startNodeId) {
      return false;
    }
    
    // Execute transaction to toggle list
    const result = await transaction(editor, [
      // ... operations
    ]).commit();
    
    return result.success;
  }
}
```

---

## Command Chaining

Chain multiple commands together in a single execution:

```typescript
export class FormatExtension implements Extension {
  name = 'format';
  
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'formatAsHeading',
      execute: async (editor: Editor, payload?: { level: number }) => {
        const level = payload?.level || 1;
        const selection = editor.selection;
        
        if (!selection?.startNodeId) {
          return false;
        }
        
        // Chain multiple operations in one transaction
        const result = await transaction(editor, [
          ...control(selection.startNodeId, [
            transformNode({ newType: 'heading', attrs: { level } }),
            applyMark('bold', [0, -1])  // Apply bold to entire heading
          ])
        ]).commit();
        
        return result.success;
      }
    });
  }
}
```

**Benefits:**
- Atomic execution (all or nothing)
- Better performance (single transaction)
- Cleaner code

---

## Extension Options

Use options to make extensions configurable:

```typescript
export interface MyExtensionOptions {
  enabled?: boolean;
  customOption?: string;
  keyboardShortcut?: string;
}

export class MyExtension implements Extension {
  name = 'my-extension';
  priority = 100;
  
  private _options: MyExtensionOptions;
  
  constructor(options: MyExtensionOptions = {}) {
    this._options = {
      enabled: true,
      customOption: 'default',
      keyboardShortcut: 'Mod+k',
      ...options
    };
  }
  
  onCreate(editor: Editor): void {
    if (!this._options.enabled) {
      return;  // Skip registration if disabled
    }
    
    editor.registerCommand({
      name: 'myCommand',
      execute: async (editor: Editor) => {
        // Use options
        return await this._executeCommand(editor, this._options.customOption);
      }
    });
    
    if (this._options.keyboardShortcut) {
      editor.keybindings.register({
        key: this._options.keyboardShortcut,
        command: 'myCommand',
        when: 'editorFocus && editorEditable'
      });
    }
  }
  
  onDestroy(_editor: Editor): void {
    // Cleanup
  }
  
  private async _executeCommand(editor: Editor, option: string): Promise<boolean> {
    // Implementation using option
    // ...
    return true;
  }
}

// Usage
const editor = new Editor({
  extensions: [
    new MyExtension({
      enabled: true,
      customOption: 'custom-value',
      keyboardShortcut: 'Mod+Shift+k'
    })
  ]
});
```

---

## Integration Patterns

### Integration with Decorators

Extensions can add decorators via the view:

```typescript
export class CommentExtension implements Extension {
  name = 'comment';
  
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'addComment',
      execute: async (editor: Editor, payload?: { text: string }) => {
        const selection = editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }
        
        // Access view via editor (if available)
        const view = (editor as any)._viewDOM;
        if (view) {
          view.addDecorator({
            sid: `comment-${Date.now()}`,
            stype: 'comment',
            category: 'layer',
            target: {
              sid: selection.startNodeId,
              startOffset: selection.startOffset,
              endOffset: selection.endOffset
            },
            data: {
              text: payload?.text || '',
              author: 'current-user'
            }
          });
        }
        
        return true;
      }
    });
  }
}
```

### Integration with Context

Extensions can use editor context for conditional behavior:

```typescript
export class ContextAwareExtension implements Extension {
  name = 'context-aware';
  
  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'contextualAction',
      execute: (editor: Editor) => {
        // Check context
        const isReadonly = editor.getContext?.('readonly');
        const mode = editor.getContext?.('mode');
        
        if (isReadonly || mode === 'view') {
          return false;
        }
        
        // Perform action
        // ...
        return true;
      }
    });
    
    // Register keybinding with context condition
    editor.keybindings.register({
      key: 'Mod+k',
      command: 'contextualAction',
      when: '!readonly && mode === edit'
    });
  }
}
```

### Using Editor Events

**Important:** Only core model changes (Transaction, Selection, Content) are provided as hooks. For all other changes, use `editor.on()` events.

Extensions can listen to editor events for non-core changes:

```typescript
export class EventListenerExtension implements Extension {
  name = 'event-listener';
  private _cleanup: (() => void)[] = [];
  
  onCreate(editor: Editor): void {
    // Node events (not available as hooks)
    const nodeCreateHandler = (data: any) => {
      console.log('Node created:', data.node);
    };
    editor.on('editor:node.create', nodeCreateHandler);
    this._cleanup.push(() => editor.off('editor:node.create', nodeCreateHandler));
    
    // Command events (not available as hooks)
    const commandHandler = (data: any) => {
      console.log('Command executed:', data.command);
    };
    editor.on('editor:command.execute', commandHandler);
    this._cleanup.push(() => editor.off('editor:command.execute', commandHandler));
    
    // History events (not available as hooks)
    const historyHandler = (data: any) => {
      console.log('History changed:', data.canUndo, data.canRedo);
    };
    editor.on('editor:history.change', historyHandler);
    this._cleanup.push(() => editor.off('editor:history.change', historyHandler));
    
    // Alternative: Use events for core model changes (more flexible, less type-safe)
    const contentHandler = (data: any) => {
      console.log('Content changed:', data.content);
    };
    editor.on('editor:content.change', contentHandler);
    this._cleanup.push(() => editor.off('editor:content.change', contentHandler));
    
    // Custom events
    editor.on('plugin:myPlugin.action', (data: any) => {
      console.log('Custom event:', data);
    });
  }
  
  onDestroy(_editor: Editor): void {
    // Cleanup event listeners
    this._cleanup.forEach(cleanup => cleanup());
    this._cleanup = [];
  }
}
```

**Available events:**
- **Core model changes** (also available as hooks):
  - `editor:content.change` - Document content changed
  - `editor:selection.change` - Selection changed
  
- **Other changes** (events only):
  - `editor:node.create` - Node created
  - `editor:node.update` - Node updated
  - `editor:node.delete` - Node deleted
  - `editor:command.execute` - Command executed
  - `editor:command.before` - Before command execution
  - `editor:command.after` - After command execution
  - `editor:history.change` - History state changed
  - `editor:history.undo` - Undo performed
  - `editor:history.redo` - Redo performed
  - `editor:editable.change` - Editable state changed
  - `editor:selection.focus` - Selection focused
  - `editor:selection.blur` - Selection blurred
  - `error:selection` - Selection error
  - `error:command` - Command error
  - `error:extension` - Extension error
  - `extension:add` - Extension added
  - `extension:remove` - Extension removed
  - `plugin:${string}` - Custom plugin events
  - `user:${string}` - Custom user events

---

## Before Hooks (Intercepting Changes)

Before hooks allow extensions to **intercept and modify** transactions, selections, and content changes **before** they are applied. This enables powerful features like read-only enforcement, content sanitization, auto-formatting, and more.

### onBeforeTransaction

Intercept and modify transactions before they are committed:

```typescript
export class ReadOnlyExtension implements Extension {
  name = 'readOnly';
  priority = 10; // High priority (executes first)
  
  onCreate(editor: Editor): void {
    editor.setContext('readOnly', true);
  }
  
  onBeforeTransaction(
    editor: Editor, 
    transaction: Transaction
  ): Transaction | null {
    // Cancel transaction if read-only
    if (editor.getContext('readOnly')) {
      return null; // Cancel transaction
    }
    return transaction; // Allow to proceed
  }
}
```

**Return values:**
- `Transaction` - Use modified transaction (operations can be changed)
- `null` - Cancel transaction
- `void` - Proceed with original transaction

### onBeforeSelectionChange

Intercept and modify selection changes:

```typescript
export class SelectionNormalizeExtension implements Extension {
  name = 'selectionNormalize';
  priority = 20;
  
  onBeforeSelectionChange(
    editor: Editor,
    selection: SelectionState
  ): SelectionState | null {
    // Normalize selection to block boundaries
    const normalized = this._normalizeToBlock(editor, selection);
    
    if (normalized.startNodeId !== selection.startNodeId) {
      return normalized; // Use normalized selection
    }
    
    return selection; // Proceed with original
  }
  
  private _normalizeToBlock(
    editor: Editor,
    selection: SelectionState
  ): SelectionState {
    // Normalization logic
    // ...
    return selection;
  }
}
```

### onBeforeContentChange

Intercept and modify content changes:

```typescript
export class ContentSanitizeExtension implements Extension {
  name = 'contentSanitize';
  priority = 5; // Very high priority
  
  onBeforeContentChange(
    editor: Editor,
    content: DocumentState
  ): DocumentState | null {
    // Sanitize content (remove malicious code, etc.)
    const sanitized = this._sanitize(content);
    
    if (sanitized !== content) {
      return sanitized; // Use sanitized content
    }
    
    return content; // Proceed with original
  }
  
  private _sanitize(content: DocumentState): DocumentState {
    // Sanitization logic
    // ...
    return content;
  }
}
```

### Complete Example: Auto-Format Extension

```typescript
export class AutoFormatExtension implements Extension {
  name = 'autoFormat';
  priority = 50;
  
  onBeforeTransaction(
    editor: Editor,
    transaction: Transaction
  ): Transaction | null {
    const newOps: TransactionOperation[] = [];
    
    for (const op of transaction.operations) {
      if (op.type === 'insertText') {
        // Auto-format URLs to links
        const urlMatch = op.payload?.text?.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          // Add link mark
          newOps.push(op);
          newOps.push({
            type: 'addMark',
            payload: {
              nodeId: op.payload.nodeId,
              mark: { type: 'link', attrs: { href: urlMatch[0] } },
              range: [op.payload.offset, op.payload.offset + urlMatch[0].length]
            }
          });
          continue;
        }
      }
      newOps.push(op);
    }
    
    // Return modified transaction if changed
    if (newOps.length !== transaction.operations.length) {
      return {
        ...transaction,
        operations: newOps
      };
    }
    
    return transaction;
  }
}
```

### Extension Priority

Extensions are executed in **priority order** (lower values execute first):

```typescript
export class ExtensionA implements Extension {
  name = 'extensionA';
  priority = 10; // Executes first
}

export class ExtensionB implements Extension {
  name = 'extensionB';
  priority = 20; // Executes after ExtensionA
}

export class ExtensionC implements Extension {
  name = 'extensionC';
  // No priority = defaults to 100 (executes last)
}
```

**Execution flow:**
1. Extension A's `onBeforeTransaction` is called
2. Extension B receives the result from Extension A
3. Extension C receives the result from Extension B
4. If any extension returns `null`, transaction is cancelled

### Use Cases

**1. Read-Only Enforcement**
```typescript
onBeforeTransaction(editor, transaction) {
  if (editor.getContext('readOnly')) {
    return null; // Cancel all transactions
  }
  return transaction;
}
```

**2. Content Sanitization**
```typescript
onBeforeTransaction(editor, transaction) {
  const sanitized = sanitizeOperations(transaction.operations);
  return { ...transaction, operations: sanitized };
}
```

**3. Auto-Formatting**
```typescript
onBeforeTransaction(editor, transaction) {
  const formatted = autoFormatOperations(transaction.operations);
  return { ...transaction, operations: formatted };
}
```

**4. Change Tracking**
```typescript
onBeforeTransaction(editor, transaction) {
  // Add metadata
  return {
    ...transaction,
    metadata: {
      ...transaction.metadata,
      userId: this.userId,
      timestamp: Date.now()
    }
  };
}
```

**5. Collaborative Editing Protection**
```typescript
onBeforeTransaction(editor, transaction) {
  // Block external changes to active node
  if (this.activeNodeId && affectsNode(transaction, this.activeNodeId)) {
    return null; // Cancel
  }
  return transaction;
}
```

### After Hooks

After hooks are called **after** changes are applied (for notification only):

```typescript
export class LoggingExtension implements Extension {
  name = 'logging';
  
  // Called after transaction is committed
  onTransaction(editor: Editor, transaction: Transaction): void {
    console.log('Transaction committed:', transaction.sid);
  }
  
  // Called after selection changes
  onSelectionChange(editor: Editor, selection: SelectionState): void {
    console.log('Selection changed:', selection);
  }
  
  // Called after content changes
  onContentChange(editor: Editor, content: DocumentState): void {
    console.log('Content changed');
  }
}
```

**Note:** After hooks cannot modify or cancel changes - they are for notification only.

**Alternative:** You can also use events instead of after hooks for more flexibility:

```typescript
export class LoggingExtension implements Extension {
  onCreate(editor: Editor): void {
    // Use events instead of after hooks
    editor.on('editor:content.change', (data) => {
      console.log('Content changed:', data.content);
    });
    
    editor.on('editor:selection.change', (data) => {
      console.log('Selection changed:', data.selection);
    });
  }
}
```

### When to Use Hooks vs Events

**Use Hooks for:**
- ✅ **Before hooks**: When you need to intercept/modify (Transaction, Selection, Content)
- ✅ **After hooks**: When you need type safety for core model changes

**Use Events for:**
- ✅ **Everything else**: Node changes, Command execution, History, Errors, etc.
- ✅ **Custom events**: Plugin-specific or user-defined events

**Core Model Changes (Hooks):**
- Transaction
- Selection
- Content

**Other Changes (Events):**
- Node create/update/delete
- Command execute
- History change
- Editable change
- Errors
- Extension lifecycle

---

## Extension Lifecycle

### onCreate

Called when extension is registered:

```typescript
onCreate(editor: Editor): void {
  // Register commands
  editor.registerCommand({ /* ... */ });
  
  // Register keybindings
  editor.keybindings.register({ /* ... */ });
  
  // Set up event listeners
  editor.on('editor:content.change', (data) => { /* ... */ });
  
  // Initialize extension state
  this._initialize(editor);
}
```

### onDestroy

Called when extension is removed:

```typescript
onDestroy(editor: Editor): void {
  // Cleanup resources
  this._cleanup();
  
  // Note: Event listeners are automatically cleaned up by editor
  // No need to manually remove them
}
```

### onBeforeCreate

Called before onCreate (if defined):

```typescript
onBeforeCreate(editor: Editor): void {
  // Setup that needs to happen before onCreate
  // For example, checking dependencies
  if (!this._checkDependencies(editor)) {
    throw new Error('Missing required dependencies');
  }
}
```

---

## Complete Example: Advanced Extension

Here's a complete example combining multiple patterns:

```typescript
import { Extension, Editor } from '@barocss/editor-core';
import { transaction, control, insertText, toggleMark } from '@barocss/model';

export interface SnippetExtensionOptions {
  snippets: Record<string, string>;
  enabled?: boolean;
  keyboardShortcut?: string;
}

export class SnippetExtension implements Extension {
  name = 'snippet';
  priority = 100;
  
  private _options: SnippetExtensionOptions;
  private _snippetHistory: string[] = [];
  
  constructor(options: SnippetExtensionOptions) {
    this._options = {
      enabled: true,
      keyboardShortcut: 'Mod+Shift+p',
      ...options
    };
  }
  
  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;
    
    // Register insert snippet command
    editor.registerCommand({
      name: 'insertSnippet',
      execute: async (editor: Editor, payload?: { name: string }) => {
        return await this._insertSnippet(editor, payload?.name);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return !!payload?.name && !!this._options.snippets[payload.name];
      }
    });
    
    // Register show snippets command
    editor.registerCommand({
      name: 'showSnippets',
      execute: (editor: Editor) => {
        return this._showSnippetPalette(editor);
      }
    });
    
    // Keybindings
    if (this._options.keyboardShortcut) {
      editor.keybindings.register({
        key: this._options.keyboardShortcut,
        command: 'showSnippets',
        when: 'editorFocus'
      });
    }
    
    // Listen to content changes for auto-complete
    editor.on('editor:content.change', (data: any) => {
      // Auto-complete logic
      this._checkAutoComplete(editor, data);
    });
  }
  
  onDestroy(editor: Editor): void {
    // Cleanup
    this._snippetHistory = [];
  }
  
  private async _insertSnippet(editor: Editor, name?: string): Promise<boolean> {
    if (!name || !this._options.snippets[name]) {
      return false;
    }
    
    const snippet = this._options.snippets[name];
    const selection = editor.selection;
    
    if (!selection?.startNodeId) {
      return false;
    }
    
    // Track in history
    this._snippetHistory.unshift(name);
    if (this._snippetHistory.length > 10) {
      this._snippetHistory.pop();
    }
    
    // Insert snippet
    const result = await transaction(editor, [
      ...control(selection.startNodeId, [
        insertText({ text: snippet, offset: selection.startOffset || 0 })
      ])
    ]).commit();
    
    return result.success;
  }
  
  private _showSnippetPalette(editor: Editor): boolean {
    // Show snippet palette UI
    // Implementation...
    return true;
  }
  
  private _checkAutoComplete(editor: Editor, data: any): void {
    // Auto-complete logic
    // Implementation...
  }
}

// Usage
const editor = new Editor({
  extensions: [
    new SnippetExtension({
      snippets: {
        'hello': 'Hello, World!',
        'date': new Date().toISOString(),
        'signature': 'Best regards,\nJohn Doe'
      },
      keyboardShortcut: 'Mod+Shift+p'
    })
  ]
});
```

---

## Best Practices

### 1. Keep Extensions Focused

```typescript
// ✅ Good: Single responsibility
export class BoldExtension implements Extension {
  // Only handles bold formatting
}

// ❌ Bad: Multiple responsibilities
export class FormattingExtension implements Extension {
  // Handles bold, italic, underline, etc. - should be separate extensions
}
```

### 2. Use Options for Configuration

```typescript
// ✅ Good: Configurable via options
export class MyExtension implements Extension {
  constructor(private options: MyExtensionOptions = {}) {}
  
  onCreate(editor: Editor): void {
    if (!this.options.enabled) return;
    // ...
  }
}

// ❌ Bad: Hard-coded behavior
export class MyExtension implements Extension {
  onCreate(editor: Editor): void {
    // Always enabled, no way to configure
  }
}
```

### 3. Handle Errors Gracefully

```typescript
// ✅ Good: Error handling
private async _executeCommand(editor: Editor): Promise<boolean> {
  try {
    const result = await transaction(editor, [/* ... */]).commit();
    if (!result.success) {
      console.error('Command failed:', result.error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Command execution failed:', error);
    return false;
  }
}

// ❌ Bad: No error handling
private async _executeCommand(editor: Editor): Promise<boolean> {
  const result = await transaction(editor, [/* ... */]).commit();
  return result.success;  // May throw if transaction fails
}
```

### 4. Provide canExecute

```typescript
// ✅ Good: Check if command can execute
editor.registerCommand({
  name: 'myCommand',
  execute: async (editor, payload) => { /* ... */ },
  canExecute: (editor, payload) => {
    return !!payload?.requiredField && !!editor.selection;
  }
});

// ❌ Bad: No canExecute
editor.registerCommand({
  name: 'myCommand',
  execute: async (editor, payload) => {
    // May fail if conditions aren't met
  }
});
```

### 5. Clean Up in onDestroy

```typescript
// ✅ Good: Cleanup resources
onDestroy(editor: Editor): void {
  // Clear timers
  if (this._timer) {
    clearTimeout(this._timer);
  }
  
  // Clear state
  this._state = null;
}

// ❌ Bad: No cleanup
onDestroy(editor: Editor): void {
  // Resources may leak
}
```

---

## Related

- [Extension Design Guide](./extension-design) - Basic extension creation
- [Custom Operations Guide](./custom-operations) - Creating custom operations
- [Core Concepts: Editor Core](../concepts/editor-core) - Editor core concepts
- [Architecture: Extensions](../architecture/extensions) - Extension package details

## Additional Resources

For more detailed use cases and safety analysis of Before hooks, see:
- [Before Hooks Use Cases](./before-hooks-use-cases) - Comprehensive use case examples
- [Before Hooks Safety Analysis](./before-hooks-safety-analysis) - Safety and implementation details
