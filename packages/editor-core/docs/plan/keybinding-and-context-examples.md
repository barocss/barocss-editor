# Keybinding & Context Usage Examples Guide

This document shows how to actually use Barocss Editor's Keybinding and Context systems with various case-by-case examples. It provides examples suitable for real development scenarios by referencing editors like VS Code, ProseMirror, Slate, etc.

## Table of Contents

1. [Basic Usage](#1-basic-usage)
2. [Registering Keybindings in Extensions](#2-registering-keybindings-in-extensions)
3. [Context-Based Conditional Keybindings](#3-context-based-conditional-keybindings)
4. [User Customization](#4-user-customization)
5. [Complex Scenarios](#5-complex-scenarios)
6. [Best Practices](#6-best-practices)

---

## 1. Basic Usage

### 1.1 Simple Keybinding Registration

Most basic form, connecting commands to specific key combinations.

```typescript
import { Editor } from '@barocss/editor-core';

// After creating Editor instance
const editor = new Editor({ /* ... */ });

// Register basic keybinding (always active)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});

// Multiple modifier combinations
editor.keybindings.register({
  key: 'Ctrl+Shift+z',
  command: 'redo'
});

// Special keys
editor.keybindings.register({
  key: 'Enter',
  command: 'insertParagraph'
});
```

### 1.2 Command Registration and Connection

Keybindings must be connected to registered Commands.

```typescript
// Register Command
editor.registerCommand({
  name: 'toggleBold',
  execute: async (editor: Editor) => {
    // Bold toggle logic
    const selection = editor.selection;
    // ... actual implementation
    return true;
  },
  canExecute: (editor: Editor) => {
    // Check if executable
    return editor.selection !== null;
  }
});

// Register Keybinding (connected to above Command)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});
```

### 1.3 Passing Arguments to Commands

Keybindings can pass arguments to Commands.

```typescript
// Register Command (receive arguments)
editor.registerCommand({
  name: 'insertHeading',
  execute: async (editor: Editor, args?: { level: number }) => {
    const level = args?.level ?? 1;
    // Heading insertion logic
    return true;
  }
});

// Register Keybinding (with arguments)
editor.keybindings.register({
  key: 'Mod+Alt+1',
  command: 'insertHeading',
  args: { level: 1 }
});

editor.keybindings.register({
  key: 'Mod+Alt+2',
  command: 'insertHeading',
  args: { level: 2 }
});
```

---

## 2. Registering Keybindings in Extensions

Register keybindings in Extension's `onCreate` method. `source: 'extension'` is automatically set.

### 2.1 Basic Extension Pattern

```typescript
import { Editor, Extension } from '@barocss/editor-core';

export class BoldExtension implements Extension {
  name = 'bold';
  priority = 100;

  onCreate(editor: Editor): void {
    // Register Command
    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        // Bold toggle logic
        return true;
      }
    });

    // Register Keybinding (source automatically set to 'extension')
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable'
    });
  }

  onDestroy(_editor: Editor): void {
    // Cleanup (if needed)
  }
}
```

### 2.2 Option-Based Keybinding

Keybindings can be customized via Extension options.

```typescript
export interface BoldExtensionOptions {
  keyboardShortcut?: string;
  enabled?: boolean;
}

export class BoldExtension implements Extension {
  name = 'bold';
  private _options: BoldExtensionOptions;

  constructor(options: BoldExtensionOptions = {}) {
    this._options = {
      keyboardShortcut: 'Mod+b', // Default
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        // Bold toggle logic
        return true;
      }
    });

    // Use keyboard shortcut from options
    if (this._options.keyboardShortcut) {
      editor.keybindings.register({
        key: this._options.keyboardShortcut,
        command: 'toggleBold',
        when: 'editorFocus && editorEditable'
      });
    }
  }
}

// Usage example
const editor = new Editor({
  extensions: [
    new BoldExtension({
      keyboardShortcut: 'Mod+Shift+b' // Custom shortcut
    })
  ]
});
```

### 2.3 Registering Multiple Keybindings

One Extension can register multiple keybindings.

```typescript
export class HeadingExtension implements Extension {
  name = 'heading';

  onCreate(editor: Editor): void {
    // Register Command
    editor.registerCommand({
      name: 'insertHeading',
      execute: async (editor: Editor, args?: { level: number }) => {
        const level = args?.level ?? 1;
        // Heading insertion logic
        return true;
      }
    });

    // Register multiple keybindings
    editor.keybindings.register({
      key: 'Mod+Alt+1',
      command: 'insertHeading',
      args: { level: 1 },
      when: 'editorFocus && editorEditable'
    });

    editor.keybindings.register({
      key: 'Mod+Alt+2',
      command: 'insertHeading',
      args: { level: 2 },
      when: 'editorFocus && editorEditable'
    });

    editor.keybindings.register({
      key: 'Mod+Alt+3',
      command: 'insertHeading',
      args: { level: 3 },
      when: 'editorFocus && editorEditable'
    });
  }
}
```

---

## 3. Context-Based Conditional Keybindings

Use Context to activate keybindings only under specific conditions.

### 3.1 Using Default Context Keys

Use default context keys provided by Editor.

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

// Activate only when Undo is possible
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  when: 'historyCanUndo && editorEditable'
});

// Activate only for specific Selection type
editor.keybindings.register({
  key: 'Mod+d',
  command: 'duplicateNode',
  when: 'selectionType == "node"'
});
```

### 3.2 Setting Custom Context Keys

Set and use custom context keys in Extensions.

```typescript
export class ReadOnlyExtension implements Extension {
  name = 'readOnly';

  onCreate(editor: Editor): void {
    // Set custom context
    editor.setContext('readOnlyExtension.enabled', false);

    // Keybinding using Context
    editor.keybindings.register({
      key: 'Mod+s',
      command: 'save',
      when: '!readOnlyExtension.enabled && editorFocus'
    });

    // Read-only mode toggle Command
    editor.registerCommand({
      name: 'toggleReadOnly',
      execute: async (editor: Editor) => {
        const current = editor.getContext()['readOnlyExtension.enabled'] as boolean;
        editor.setContext('readOnlyExtension.enabled', !current);
        return true;
      }
    });
  }
}
```

### 3.3 Dynamic Context Updates

Dynamically update Context to change keybinding activation state.

```typescript
export class ModeExtension implements Extension {
  name = 'mode';

  onCreate(editor: Editor): void {
    // Set initial context
    editor.setContext('modeExtension.currentMode', 'edit');

    // Keybinding active only in Edit mode
    editor.keybindings.register({
      key: 'Mod+e',
      command: 'editMode',
      when: 'modeExtension.currentMode == "edit"'
    });

    // Keybinding active only in Preview mode
    editor.keybindings.register({
      key: 'Mod+p',
      command: 'previewMode',
      when: 'modeExtension.currentMode == "preview"'
    });

    // Mode switching Command
    editor.registerCommand({
      name: 'switchMode',
      execute: async (editor: Editor, args?: { mode: 'edit' | 'preview' }) => {
        const mode = args?.mode ?? 'edit';
        editor.setContext('modeExtension.currentMode', mode);
        return true;
      }
    });
  }
}
```

### 3.4 Complex Condition Combinations

Combine multiple context keys to create complex conditions.

```typescript
// Combine multiple conditions with AND
editor.keybindings.register({
  key: 'Mod+Shift+p',
  command: 'preview',
  when: 'editorFocus && !readOnlyExtension.enabled && modeExtension.currentMode == "markdown"'
});

// Use OR conditions
editor.keybindings.register({
  key: 'Mod+k',
  command: 'showCommandPalette',
  when: 'editorFocus || commandPaletteExtension.isVisible'
});

// Use NOT conditions
editor.keybindings.register({
  key: 'Delete',
  command: 'deleteSelection',
  when: '!selectionEmpty && selectionType == "range"'
});

// Use comparison operators
editor.keybindings.register({
  key: 'Mod+Shift+e',
  command: 'editNode',
  when: 'nodeTypeExtension.isImage && !multiSelectionExtension.hasMultiple && editorFocus'
});
```

### 3.5 Subscribing to Context Change Events

Detect context changes to update UI.

**⚠️ Important: Initialization timing event loss issue**

When `setContext` is called in `onCreate`, events are emitted, but other Extensions' `onCreate` may not have executed yet. Therefore, events at initial setting time may be missed.

**Solutions**:
1. **Check initial state**: Check current value after registering listener
2. **Guarantee order**: Adjust Extension registration order
3. **Initialization pattern**: Manually synchronize initial state after registering listener

```typescript
export class ToolbarExtension implements Extension {
  name = 'toolbar';

  onCreate(editor: Editor): void {
    // 1. Register listener (adjust order to execute before other Extensions' onCreate)
    editor.onContextChange('readOnlyExtension.enabled', ({ value }) => {
      const isReadOnly = value as boolean;
      this.updateToolbarUI(isReadOnly);
    });

    // 2. Check initial state (may already be set)
    const currentValue = editor.getContext()['readOnlyExtension.enabled'];
    if (currentValue !== undefined) {
      this.updateToolbarUI(currentValue as boolean);
    }

    // Subscribe to all context changes
    editor.on('editor:context.change', (event) => {
      console.log('Context changed:', event.key, event.value);
      // Update entire UI
    });
  }

  private updateToolbarUI(isReadOnly: boolean): void {
    // Enable/disable toolbar buttons
  }
}
```

**Recommended pattern**: If there are dependencies between Extensions, explicitly manage Extension registration order or use pattern of checking initial state.

```typescript
export class DependentExtension implements Extension {
  name = 'dependent';
  dependencies = ['providerExtension']; // Explicit dependency

  onCreate(editor: Editor): void {
    // Register listener
    editor.onContextChange('providerExtension.key', ({ value }) => {
      this.handleChange(value);
    });

    // Check initial state (providerExtension may have already executed onCreate)
    const initialValue = editor.getContext()['providerExtension.key'];
    if (initialValue !== undefined) {
      this.handleChange(initialValue);
    }
  }

  private handleChange(value: unknown): void {
    // Handle change
  }
}
```

---

## 4. User Customization

Allow users to customize keybindings.

### 4.1 Registering User Keybindings

Users register keybindings directly.

```typescript
// Keybindings from user settings
const userKeybindings = [
  {
    key: 'Mod+Shift+b',
    command: 'toggleBold'
  },
  {
    key: 'Mod+Alt+i',
    command: 'toggleItalic'
  }
];

// Register user keybindings (source automatically set to 'user')
userKeybindings.forEach(binding => {
  editor.keybindings.register({
    ...binding,
    source: 'user' // Can explicitly specify (auto-set)
  });
});
```

### 4.2 Overriding Keybindings

Users can override default keybindings.

```typescript
// Default keybinding registered by Extension
// Mod+b → toggleBold

// User registers different command on same key (higher priority, overrides)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold',
  source: 'user'
});
```

### 4.3 Removing Keybindings

Remove specific keybindings.

```typescript
// Remove keybinding (use unregister method)
editor.keybindings.unregister({
  key: 'Mod+b',
  command: 'toggleBold'
});
```

### 4.4 Loading from Configuration File

Load keybindings from JSON configuration file.

```typescript
// keybindings.json
const keybindingsConfig = [
  {
    "key": "Mod+b",
    "command": "toggleBold",
    "when": "editorFocus"
  },
  {
    "key": "Mod+i",
    "command": "toggleItalic",
    "when": "editorFocus && editorEditable"
  }
];

// Load from configuration file and register
keybindingsConfig.forEach(binding => {
  editor.keybindings.register({
    ...binding,
    source: 'user'
  });
});
```

---

## 5. Complex Scenarios

Covers complex scenarios frequently encountered in actual development.

### 5.1 Different Keybindings per Mode

Activate different keybindings based on editor mode.

```typescript
export class MultiModeExtension implements Extension {
  name = 'multiMode';

  onCreate(editor: Editor): void {
    // Set current mode context
    editor.setContext('multiModeExtension.currentMode', 'normal');

    // Normal mode keybinding
    editor.keybindings.register({
      key: 'i',
      command: 'enterInsertMode',
      when: 'multiModeExtension.currentMode == "normal" && editorFocus'
    });

    // Insert mode keybinding
    editor.keybindings.register({
      key: 'Escape',
      command: 'exitInsertMode',
      when: 'multiModeExtension.currentMode == "insert" && editorFocus'
    });

    // Visual mode keybinding
    editor.keybindings.register({
      key: 'v',
      command: 'enterVisualMode',
      when: 'multiModeExtension.currentMode == "normal" && editorFocus'
    });
  }
}
```

### 5.2 Plugin Activation/Deactivation

Control keybindings based on plugin activation state.

```typescript
export class PluginManagerExtension implements Extension {
  name = 'pluginManager';
  private plugins: Map<string, boolean> = new Map();

  onCreate(editor: Editor): void {
    // Manage plugin activation state as context
    this.plugins.set('spellCheck', true);
    editor.setContext('pluginManager.spellCheckEnabled', true);

    // Activate only when spell check plugin is enabled
    editor.keybindings.register({
      key: 'Mod+Shift+s',
      command: 'toggleSpellCheck',
      when: 'pluginManager.spellCheckEnabled && editorFocus'
    });

    // Plugin toggle Command
    editor.registerCommand({
      name: 'togglePlugin',
      execute: async (editor: Editor, args?: { pluginName: string }) => {
        const pluginName = args?.pluginName;
        if (!pluginName) return false;

        const current = this.plugins.get(pluginName) ?? false;
        this.plugins.set(pluginName, !current);
        editor.setContext(`pluginManager.${pluginName}Enabled`, !current);
        return true;
      }
    });
  }
}
```

### 5.3 Conditional Command Execution

Change command execution logic based on Context.

```typescript
export class ConditionalCommandExtension implements Extension {
  name = 'conditionalCommand';

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'smartDelete',
      execute: async (editor: Editor) => {
        const context = editor.getContext();
        const selectionType = context['selectionType'] as string;

        // Different behavior based on Selection type
        if (selectionType === 'range') {
          return await editor.executeCommand('deleteSelection');
        } else if (selectionType === 'node') {
          return await editor.executeCommand('deleteNode');
        } else {
          return await editor.executeCommand('deleteForward');
        }
      },
      canExecute: (editor: Editor) => {
        const context = editor.getContext();
        return context['editorFocus'] === true && 
               context['editorEditable'] === true;
      }
    });

    editor.keybindings.register({
      key: 'Delete',
      command: 'smartDelete',
      when: 'editorFocus && editorEditable'
    });
  }
}
```

### 5.4 Multiple Keybinding Chains

Chain multiple keybindings to create complex behaviors.

```typescript
export class CommandChainExtension implements Extension {
  name = 'commandChain';

  onCreate(editor: Editor): void {
    // Manage first key input state
    editor.setContext('commandChain.waitingForSecondKey', false);

    // First key input
    editor.keybindings.register({
      key: 'Mod+k',
      command: 'startCommandChain',
      when: 'editorFocus && !commandChain.waitingForSecondKey'
    });

    // Second key input (active only after first key input)
    editor.keybindings.register({
      key: 'b',
      command: 'applyBold',
      when: 'commandChain.waitingForSecondKey && editorFocus'
    });

    editor.keybindings.register({
      key: 'i',
      command: 'applyItalic',
      when: 'commandChain.waitingForSecondKey && editorFocus'
    });

    // Register Command
    editor.registerCommand({
      name: 'startCommandChain',
      execute: async (editor: Editor) => {
        editor.setContext('commandChain.waitingForSecondKey', true);
        // Automatically clear after certain time
        setTimeout(() => {
          editor.setContext('commandChain.waitingForSecondKey', false);
        }, 1000);
        return true;
      }
    });
  }
}
```

### 5.5 Context Sharing Between Extensions

Multiple Extensions share context to cooperate.

```typescript
// Extension A: Provide Context
export class ThemeExtension implements Extension {
  name = 'theme';

  onCreate(editor: Editor): void {
    editor.setContext('themeExtension.currentTheme', 'light');
    
    editor.registerCommand({
      name: 'toggleTheme',
      execute: async (editor: Editor) => {
        const current = editor.getContext()['themeExtension.currentTheme'] as string;
        const next = current === 'light' ? 'dark' : 'light';
        editor.setContext('themeExtension.currentTheme', next);
        return true;
      }
    });
  }
}

// Extension B: Use Context
export class SyntaxHighlightExtension implements Extension {
  name = 'syntaxHighlight';

  onCreate(editor: Editor): void {
    // Use Theme Extension's context
    editor.keybindings.register({
      key: 'Mod+Shift+t',
      command: 'toggleSyntaxHighlight',
      when: 'themeExtension.currentTheme == "dark" && editorFocus'
    });

    // Subscribe to context changes
    editor.onContextChange('themeExtension.currentTheme', (theme) => {
      this.updateSyntaxHighlight(theme as string);
    });
  }

  private updateSyntaxHighlight(theme: string): void {
    // Update syntax highlight
  }
}
```

---

## 6. Best Practices

### 6.1 Context Key Naming

- **Use Extension name prefix**: Format like `myExtension.keyName`
- **Use camelCase**: `showMyCommand`, `numberOfItems`, etc.
- **Clear names**: Use names that clearly show purpose

```typescript
// ✅ Good examples
editor.setContext('boldExtension.enabled', true);
editor.setContext('themeExtension.currentTheme', 'dark');

// ❌ Bad examples
editor.setContext('enabled', true); // No extension name
editor.setContext('THEME', 'dark'); // Using uppercase
```

### 6.2 When Clause Optimization

- **Prioritize simple conditions**: Handle complex conditions in Command's `canExecute`
- **Evaluate frequently used conditions first**: Performance optimization

```typescript
// ✅ Good example: Simple conditions
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable'
});

// ❌ Bad example: Too complex conditions
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable && !readOnlyExtension.enabled && modeExtension.currentMode == "edit" && !loadingStateExtension.isLoading && selectionType != "cell"'
});
```

### 6.3 Utilizing Source Priority

- **Core**: Basic features (undo, redo, etc.)
- **Extension**: Extension features
- **User**: User customization

```typescript
// Core keybinding (lowest priority)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'undo',
  source: 'core'
});

// Extension keybinding (medium priority)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'customUndo',
  source: 'extension'
});

// User keybinding (highest priority, overrides)
editor.keybindings.register({
  key: 'Mod+z',
  command: 'myUndo',
  source: 'user'
});
```

### 6.4 Context Update Timing

- **Update only when needed**: Unnecessary context changes affect performance
- **Batch updates**: Update multiple contexts at once

```typescript
// ✅ Good example: Update only when needed
if (oldValue !== newValue) {
  editor.setContext('myExtension.value', newValue);
}

// ✅ Good example: Batch updates
editor.setContext('myExtension.value1', value1);
editor.setContext('myExtension.value2', value2);
// Two events are emitted, but can be batch processed if needed

// ❌ Bad example: Unnecessary updates
editor.setContext('myExtension.value', value); // Keep calling even with same value
```

### 6.5 Separating Commands and Keybindings

- **Commands are business logic**: Can operate independently of Keybindings
- **Keybindings are shortcut mappings**: Multiple keybindings can reference same Command

```typescript
// ✅ Good example: Separate Commands and Keybindings
editor.registerCommand({
  name: 'toggleBold',
  execute: async (editor: Editor) => {
    // Bold toggle logic
    return true;
  }
});

// Multiple keybindings reference same Command
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
});

editor.keybindings.register({
  key: 'Mod+Shift+b',
  command: 'toggleBold',
  when: 'someCondition'
});
```

### 6.6 Error Handling

- **Handle command execution failures**: Appropriate error handling in `execute` method
- **Pre-validate with canExecute**: Block in advance if not executable

```typescript
editor.registerCommand({
  name: 'deleteNode',
  execute: async (editor: Editor) => {
    try {
      // Delete logic
      return true;
    } catch (error) {
      console.error('Delete failed:', error);
      return false;
    }
  },
  canExecute: (editor: Editor) => {
    // Pre-validate executability
    const context = editor.getContext();
    return context['editorFocus'] === true && 
           context['selectionType'] === 'node';
  }
});
```

---

## References

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Detailed keybinding system specification
- [Context Provider Spec](./context-provider-spec.md) - Detailed context system specification
- [When Expression Spec](./when-expression-spec.md) - When clause evaluation specification
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - Default keybinding management specification
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings) - VS Code official documentation
