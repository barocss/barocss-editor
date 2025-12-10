# Keybinding Defaults and Customization Spec

## Overview

This document defines the specification for managing the editor's default keyboard shortcut list and user customization system.

IDEs like VS Code have built-in default keyboard shortcut lists, and users can customize them. We follow the same pattern, but `editor-core` focuses only on internal editor state, and external settings are handled by the host application.

---

## 1. Keybinding Source Levels

### 1.1 Source Priority

Keybindings are divided into the following 3 source levels:

1. **`core`**: Editor core default bindings (built-in)
2. **`extension`**: Bindings registered by Extensions
3. **`user`**: Custom bindings set by users/host applications

**Priority**: `user` > `extension` > `core`

### 1.2 Characteristics per Source

#### Core (`source: 'core'`)
- **Purpose**: Define editor's default behavior
- **Examples**: Enter, Backspace, Delete, Arrow keys, etc.
- **Management**: Managed internally in `editor-core`
- **Not changeable**: Users cannot directly change (but can override at `user` level)

#### Extension (`source: 'extension'`)
- **Purpose**: Shortcuts for features provided by Extensions
- **Examples**: Bold (`Mod+b`), Italic (`Mod+i`), Heading, etc.
- **Management**: Registered in each Extension's `onCreate`
- **Changeable**: Can be overridden at `user` level

#### User (`source: 'user'`)
- **Purpose**: Custom bindings set by users or host applications
- **Examples**: User remaps `Ctrl+d` to a different command
- **Management**: Managed by host application (JSON file, settings UI, etc.)
- **Highest priority**: Overrides all other sources

---

## 2. Default Keybinding List Management

### 2.1 Default List Definition Location

Default keybinding list is defined inside `@barocss/editor-core` package.

**Proposed structure**:
```
packages/editor-core/
  src/
    keybinding/
      default-keybindings.ts    # Default keybinding list
      index.ts
```

### 2.2 Default Keybinding List Example

```typescript
// packages/editor-core/src/keybinding/default-keybindings.ts

import type { Keybinding } from './types';

/**
 * Editor core default keyboard shortcut list
 * 
 * This list defines editor's default behavior,
 * and can be overridden by users at user level.
 */
export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // Basic editing
  {
    key: 'Enter',
    command: 'insertParagraph',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  {
    key: 'Backspace',
    command: 'backspace',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  {
    key: 'Delete',
    command: 'deleteForward',
    when: 'editorFocus && editorEditable',
    source: 'core'
  },
  
  // Cursor movement
  {
    key: 'ArrowLeft',
    command: 'moveCursorLeft',
    when: 'editorFocus',
    source: 'core'
  },
  {
    key: 'ArrowRight',
    command: 'moveCursorRight',
    when: 'editorFocus',
    source: 'core'
  },
  
  // History
  {
    key: 'Mod+z',
    command: 'historyUndo',
    when: 'editorFocus && historyCanUndo',
    source: 'core'
  },
  {
    key: 'Mod+Shift+z',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo',
    source: 'core'
  },
  {
    key: 'Mod+y',
    command: 'historyRedo',
    when: 'editorFocus && historyCanRedo',
    source: 'core'
  }
];
```

### 2.3 Default List Registration Timing

Default keybinding list is automatically registered when `Editor` is created:

```typescript
// packages/editor-core/src/editor.ts

import { DEFAULT_KEYBINDINGS } from './keybinding/default-keybindings';

export class Editor {
  constructor(options: EditorOptions = {}) {
    // ... existing initialization code ...
    
    // Register default keybindings
    this._registerDefaultKeybindings();
    
    // Register Extensions (Extension keybindings registered later)
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
    
    // Register user keybindings (injected by host application)
    if (options.userKeybindings) {
      options.userKeybindings.forEach(binding => {
        this.keybindings.register({
          ...binding,
          source: 'user'
        });
      });
    }
  }
  
  private _registerDefaultKeybindings(): void {
    DEFAULT_KEYBINDINGS.forEach(binding => {
      this.keybindings.register(binding);
    });
  }
}
```

---

## 3. Extension Keybinding Registration

### 3.1 Register Keybinding in Extension

Each Extension registers its keybinding in `onCreate`:

```typescript
// packages/extensions/src/bold.ts

export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    // Register command
    editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor) => {
        // Bold toggle logic
        return true;
      }
    });
    
    // Register keybinding
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable',
      source: 'extension'
    });
  }
}
```

### 3.2 Extension Keybinding Registration Order

Extension keybindings are added in the order Extensions are registered:

1. `DEFAULT_KEYBINDINGS` registered when `Editor` is created (`core`)
2. Keybindings registered in Extension registration order (`extension`)
3. User keybindings registered (`user`)

**Important**: Within the same `source`, later registrations have higher priority.

---

## 4. User Customization

### 4.1 User Keybinding Setting Methods

User keybindings are managed by host application:

#### Method 1: Inject at Editor Creation

```typescript
// Host application
const editor = new Editor({
  extensions: [...],
  userKeybindings: [
    {
      key: 'Ctrl+d',
      command: 'deleteSelection',
      when: 'editorFocus && !selectionEmpty'
    },
    {
      key: 'Mod+b',
      command: 'myCustomBoldCommand',  // Override Extension's Mod+b
      when: 'editorFocus && editorEditable'
    }
  ]
});
```

#### Method 2: Register at Runtime

```typescript
// Host application
// If setCurrentSource is not called, 'user' is automatically the default
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source is automatically 'user' (default)
});

// Or can explicitly call setCurrentSource
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand'
});
editor.keybindings.setCurrentSource(null);
```

#### Method 3: Load from JSON File (Host Application Responsibility)

```typescript
// Host application
import keybindingsJson from './user-keybindings.json';

// If source is not specified, 'user' is automatically the default
keybindingsJson.forEach(binding => {
  editor.keybindings.register(binding);
  // source is automatically 'user'
});
```

**JSON File Example** (`user-keybindings.json`):
```json
[
  {
    "key": "Ctrl+d",
    "command": "deleteSelection",
    "when": "editorFocus && !selectionEmpty"
  },
  {
    "key": "Mod+b",
    "command": "myCustomBoldCommand",
    "when": "editorFocus && editorEditable"
  }
]
```

### 4.2 User Keybinding Management API

Host applications can manage user keybindings using the following API:

```typescript
// Remove all user keybindings
editor.keybindings.clear('user');

// Remove specific user keybinding
editor.keybindings.unregister({
  key: 'Ctrl+d',
  source: 'user'
});

// Add new user keybinding
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand',
  source: 'user'
});
```

---

## 5. Keybinding Source Auto-Determination and Conflict Handling

### 5.1 Source Auto-Determination Problem

**Problem**: Currently `register()` method can arbitrarily specify `source`, so Extensions can register with `source: 'user'` to unfairly raise priority.

```typescript
// Problem: Extension can manipulate source
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myBold',
  source: 'user'  // ❌ If Extension registers as user, it takes priority over other Extensions
});
```

### 5.2 Solution: Auto-Detect Registration Context (VS Code Style)

VS Code doesn't provide a separate method, but **automatically determines source based on registration context**. We follow the same approach.

#### Implementation Approach

`Editor` and `KeybindingRegistry` cooperate to automatically detect context at registration time:

**Rules**:
1. **When registering Core keybinding**: Automatically call `setCurrentSource('core')`
2. **Before executing Extension's `onCreate`**: Automatically call `setCurrentSource('extension')`
3. **Otherwise (if `setCurrentSource()` is not explicitly called)**: `user` is default

```typescript
// Editor class
export class Editor {
  private _keybindingRegistry: KeybindingRegistry;

  constructor(options: EditorOptions = {}) {
    // ... existing initialization code ...
    
    // Register Core keybindings (automatically source: 'core')
    this._registerDefaultKeybindings();
    
    // Register Extensions (automatically source: 'extension')
    if (options.extensions) {
      options.extensions.forEach(ext => this.use(ext));
    }
  }

  use(extension: Extension): void {
    // Set current source to 'extension' before registering Extension
    this._keybindingRegistry.setCurrentSource('extension');
    
    extension.onCreate?.(this);
    
    // Reset source after Extension registration
    this._keybindingRegistry.setCurrentSource(null);
  }
  
  private _registerDefaultKeybindings(): void {
    // Automatically set to 'core' when registering Core keybindings
    this._keybindingRegistry.setCurrentSource('core');
    DEFAULT_KEYBINDINGS.forEach(binding => {
      this.keybindings.register(binding);
    });
    this._keybindingRegistry.setCurrentSource(null);
  }
}

// KeybindingRegistry class
export class KeybindingRegistryImpl {
  private _currentSource: KeybindingSource | null = null;
  
  setCurrentSource(source: KeybindingSource | null): void {
    this._currentSource = source;
  }
  
  register(binding: Keybinding): void {
    // Source determination priority:
    // 1. Current context (value set by setCurrentSource)
    // 2. Explicitly specified source
    // 3. Default: 'user' (if setCurrentSource not explicitly called)
    const source = this._currentSource ?? binding.source ?? 'user';
    
    const enriched: InternalBinding = {
      ...binding,
      source,
      id: this._nextId++
    };
    this._bindings.push(enriched);
  }
}
```

#### Usage Examples

```typescript
// In Extension (inside onCreate)
export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    // Even if source is not specified, automatically 'extension'
    // (setCurrentSource('extension') already called in Editor.use())
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold',
      when: 'editorFocus && editorEditable'
      // source is automatically 'extension'
    });
  }
}

// In host application (after Editor creation)
const editor = new Editor({ ... });

// When registering User keybinding
// If setCurrentSource('user') is not called, automatically 'user'
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source is automatically 'user' (default)
});

// Or can explicitly call setCurrentSource
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+k',
  command: 'myCommand'
});
editor.keybindings.setCurrentSource(null);
```

#### Security Considerations

Extensions may attempt to explicitly specify `source: 'user'`:

```typescript
// Malicious attempt in Extension
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myBold',
  source: 'user'  // ❌ Attempt to raise priority
});
```

**Solution**: In `register()` method, ignore explicit `source` specification when current context exists:

```typescript
register(binding: Keybinding): void {
  // If current context exists, always use it (ignore explicit source)
  // If Extension registration in progress, always 'extension'
  // If Core registration in progress, always 'core'
  const source = this._currentSource ?? binding.source ?? 'user';
  
  // Warn if source specified as 'user' during Extension registration
  if (this._currentSource === 'extension' && binding.source === 'user') {
    console.warn(`[KeybindingRegistry] Extensions cannot specify source as 'user'. Will be set to 'extension'.`);
  }
  
  const enriched: InternalBinding = {
    ...binding,
    source: this._currentSource ?? 'user',  // Current context takes priority
    id: this._nextId++
  };
  this._bindings.push(enriched);
}
```

### 5.3 Keybinding Conflicts Between Extensions

Conflicts can occur when multiple Extensions register the same `key`:

```typescript
// Extension A (inside onCreate)
export class BoldExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBold'
      // source is automatically 'extension'
    });
  }
}

// Extension B (registered later, inside onCreate)
export class BoldItalicExtension implements Extension {
  onCreate(editor: Editor): void {
    editor.keybindings.register({
      key: 'Mod+b',
      command: 'toggleBoldItalic'  // Override Extension A's Mod+b
      // source is automatically 'extension'
    });
  }
}
```

**Conflict handling rules**:
1. **Within same source, later registration takes priority** (already implemented)
2. Conflicts between Extensions are considered **intentional overrides**
3. Conflict detection and warnings are optional (can be handled by host application)

**Conflict detection API (optional)**:
```typescript
interface KeybindingRegistry {
  // Detect conflicts
  detectConflicts(key?: string): Array<{
    key: string;
    bindings: Keybinding[];
    conflicts: Array<{ binding1: Keybinding; binding2: Keybinding }>;
  }>;
  
  // Query all bindings for specific key
  getKeybindings(key?: string): Keybinding[];
}
```

### 5.4 Override Extension with User Keybinding

Users can override Extension keybindings:

```typescript
// Keybinding registered by Extension (inside onCreate)
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold'
  // source is automatically 'extension'
});

// User override (in host application)
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold'  // Override Extension's Mod+b
  // source is automatically 'user'
});
editor.keybindings.setCurrentSource(null);

// resolve('Mod+b') → [{ command: 'myCustomBold', ... }] (user takes priority)
```

---

## 6. Keybinding Resolution Priority

### 6.1 Resolve Algorithm

`keybindings.resolve(key)` finds keybindings in the following order:

1. **key matching**: Find all keybinding candidates matching the given `key`.
2. **when evaluation**: Evaluate each candidate's `when` clause with current context.
3. **Source priority sorting**:
   - `user` > `extension` > `core`
   - Within same source, later registration takes priority (based on id)
4. **Return result**: Return array of commands sorted by priority.

### 6.2 Priority Examples

Assume the following keybindings are registered:

```typescript
// 1. Core (registered first)
{ key: 'Mod+b', command: 'coreBold', source: 'core' }

// 2. Extension (registered second)
{ key: 'Mod+b', command: 'toggleBold', source: 'extension' }

// 3. User (registered last)
{ key: 'Mod+b', command: 'myCustomBold', source: 'user' }
```

When `Mod+b` key is pressed:
- `resolve('Mod+b')` → `[{ command: 'myCustomBold', ... }]` (user has highest priority)
- `editor-view-dom` executes the first command (`myCustomBold`).

### 6.3 Filtering by when Clause

When multiple keybindings exist for the same `key`, those with `when` clause evaluating to `false` are excluded:

```typescript
// Registered keybindings
{ key: 'Mod+z', command: 'undo1', when: 'editorFocus', source: 'core' }
{ key: 'Mod+z', command: 'undo2', when: 'editorFocus && historyCanUndo', source: 'user' }

// Context: { editorFocus: true, historyCanUndo: false }
resolve('Mod+z') → [{ command: 'undo1', ... }]  // undo2 excluded because when is false

// Context: { editorFocus: true, historyCanUndo: true }
resolve('Mod+z') → [{ command: 'undo2', ... }]  // user has higher priority
```

---

## 7. Keybinding Profile (Future Extension)

### 7.1 Profile Concept

Like VS Code, multiple keybinding profiles can be supported:

- **Default**: Default keybindings
- **Vim**: Vim style keybindings
- **Emacs**: Emacs style keybindings
- **Custom**: User-defined profile

### 7.2 Profile Implementation Direction

Profiles can be implemented as a way to replace default keybinding list:

```typescript
// packages/editor-core/src/keybinding/profiles.ts

export const KEYBINDING_PROFILES = {
  default: DEFAULT_KEYBINDINGS,
  vim: VIM_KEYBINDINGS,
  emacs: EMACS_KEYBINDINGS
};

// When creating Editor
const editor = new Editor({
  keybindingProfile: 'vim',  // or 'default', 'emacs', 'custom'
  userKeybindings: [...]     // Applied additionally on top of profile
});
```

**Implementation timing**: Currently focus on default keybinding list management, profile feature considered for future extension.

---

## 8. Implementation Plan

### 8.1 Phase 1: Implement Registration Context Auto-Detection

1. Add `setCurrentSource()` method to `KeybindingRegistry`
2. Call `setCurrentSource('extension')` in `Editor.use()` when registering Extension
3. Call `setCurrentSource('core')` in `Editor._registerDefaultKeybindings()` when registering Core
4. Use current context first in `KeybindingRegistry.register()` (ignore or warn on explicit source)
5. Update test code

### 8.2 Phase 2: Define Default Keybinding List

1. Create `packages/editor-core/src/keybinding/default-keybindings.ts`
2. Define default keybinding list (Enter, Backspace, Delete, Arrow keys, etc.)
3. Automatically register with `register()` after `setCurrentSource('core')` when `Editor` is created

### 8.3 Phase 3: Extension Keybinding Registration

1. Use `register()` in each Extension's `onCreate` (source auto-determined)
2. Add keybindings to `ParagraphExtension`, `DeleteExtension`, `MoveSelectionExtension`, etc.
3. Document Extension conflict handling

### 8.4 Phase 4: User Keybinding Support

1. Add `userKeybindings` option to `EditorOptions`
2. Use `register()` after `setCurrentSource('user')` in host application
3. JSON file loading functionality (host application responsibility)

### 8.5 Phase 5: Keybinding Management and Conflict Detection API

1. Complete management APIs like `keybindings.clear('user')`
2. Keybinding query APIs (`getKeybindings(key?: string)`, etc.)
3. Keybinding conflict detection APIs (`detectConflicts()`, etc., optional)

---

## 9. Related Documents

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Complete keybinding system specification
- [When Expression Spec](./when-expression-spec.md) - `when` clause evaluation specification
- [Context Provider Spec](./context-provider-spec.md) - Context management specification

---

## 10. Comparison with VS Code

### Similarities
- Source level distinction (`core`, `extension`, `user`)
- Priority system (`user` > `extension` > `core`)
- Conditional activation via `when` clauses
- **Registration context auto-detection**: Like VS Code, doesn't provide separate method, automatically determines source based on registration context.

### Differences
- **JSON file parsing**: VS Code directly parses `keybindings.json` file, but we use approach where host application parses JSON and registers with `register()`.
- **Profile**: VS Code provides multiple profiles by default, but we currently focus only on default keybinding list.
- **Settings UI**: VS Code provides settings UI, but we don't provide settings UI in `editor-core` (host application responsibility).
- **API exposure**: VS Code registers keybindings via Extension API, but we use `setCurrentSource()` + `register()` approach.

---

## 11. Example: Complete Flow

```typescript
// 1. Create Editor
const editor = new Editor({
  extensions: [
    new ParagraphExtension(),
    new DeleteExtension(),
    new BoldExtension()
  ]
});

// Inside Editor:
// - Register Core keybindings: setCurrentSource('core') → register(...) → setCurrentSource(null)
// - Register Extensions: use() → setCurrentSource('extension') → onCreate() → register(...) → setCurrentSource(null)

// 2. Register User keybinding (in host application)
editor.keybindings.setCurrentSource('user');
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty'
  // source is automatically 'user'
});
editor.keybindings.setCurrentSource(null);

// 3. Registered keybinding order
// - Core: Enter, Backspace, Delete, ArrowLeft, ArrowRight, Mod+z, ...
// - Extension: Mod+b (BoldExtension), insertParagraph (ParagraphExtension), ...
// - User: Ctrl+d

// 4. User presses Mod+b
// - resolve('Mod+b') → [{ command: 'toggleBold', ... }] (Extension)
// - executeCommand('toggleBold')

// 5. User presses Ctrl+d
// - resolve('Ctrl+d') → [{ command: 'deleteSelection', ... }] (User)
// - executeCommand('deleteSelection')

// 6. User overrides Mod+b
// If setCurrentSource is not called, 'user' is automatically the default
editor.keybindings.register({
  key: 'Mod+b',
  command: 'myCustomBold'
  // source is automatically 'user' (default)
});

// 7. Press Mod+b again
// - resolve('Mod+b') → [{ command: 'myCustomBold', ... }] (User takes priority)
// - executeCommand('myCustomBold')
```
