## Keyboard Shortcut / Keybinding Spec (`@barocss/editor-core`)

### 1. Purpose

- Specification for consistently handling **key input → command execution** in `editor-core`.
- Defines behavior with **string-based keybindings** and **conditional expressions (`when` clauses)** independent of platform/host (UI, framework).
- View layers like `editor-view-dom` **normalize key events and pass to core**, and core **finds and executes commands matching current context**.
- Design references VS Code keybinding system but focuses on minimal set of [`key`, `command`, `when`, `args`].  
  Reference: [VS Code Keyboard Shortcuts Documentation](https://code.visualstudio.com/docs/configure/keybindings)

---

### 2. Terminology

- **Keybinding**: One definition of command to execute under specific key combination and conditions.
- **Keybinding Rule**: Internal representation including `key`, `command`, `when`, `args`, `source`, etc.
- **Context Key**: Boolean or string value representing current editor/selection/focus state. Used for true/false evaluation in `when` expressions.

---

### 3. Keybinding Format

#### 3.1 String Format

- **Modifier**: `Ctrl`, `Cmd`, `Alt`, `Shift`
- **Key names**:  
  - Alphabet/numbers: `A`–`Z`, `0`–`9` (`Ctrl+b`, `Cmd+Z`, etc.)  
  - Special keys: `Enter`, `Escape`, `Backspace`, `Delete`, `Tab`, `Space`, `ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Home`, `End`, `PageUp`, `PageDown`, etc.
- **Combination rules**:
  - Single string combined with **`+`** like `Ctrl+b`, `Cmd+Shift+z`, `Alt+ArrowLeft`, `Shift+Enter`.
  - **Note**: Use `+`, not `-` (same format as VS Code).
  - Use only **logical modifier (Mod)** platform-neutrally (`Mod` itself is not used as string, but distinguished as `Ctrl`/`Cmd` at actual registration).
- **Case handling**:
  - **Case-insensitive**: Automatically normalized both at registration and resolve time.
  - **Modifier**: Normalized to first letter uppercase (`Ctrl`, `Cmd`, `Alt`, `Shift`, `Mod`)
    - Example: `ctrl+b`, `CTRL+B`, `Ctrl+b` → all normalized to `Ctrl+b`
  - **Key names**: Alphabet keys normalized to lowercase, special keys kept as is
    - Example: `Ctrl+B`, `Ctrl+b` → all normalized to `Ctrl+b`
    - Example: `Enter`, `Escape` → kept as is
  - **At registration**: Automatically normalized and stored when `register()` is called.
  - **At resolve**: Input key string is also automatically normalized for matching.

#### 3.2 Keybinding Structure

```ts
interface Keybinding {
  key: string;              // Example: "Mod+b", "Ctrl+Shift+z", "Enter"
  command: string;          // Example: "toggleBold", "insertParagraph"
  args?: unknown;           // Command payload (optional)
  when?: string;            // Context conditional expression (optional)
  source?: 'core' | 'extension' | 'user'; // Tag for priority distinction
}
```

- **`key`**: Normalized key string.  
- **`command`**: Must exactly match command name used in `editor.executeCommand(name)`.
- **`when`**:
  - If empty, always active.
  - String expression combining context keys:
    - Operators: `==`, `!=`, `&&`, `||`, `!`, `=~` (regex matching)
    - Examples: `"editorFocus && selectionType == 'range'"`, `"isEditable && !readOnly"`

---

### 4. Context / `when` clause System

> **Note**: For detailed information on ContextProvider, refer to [Context Provider Spec](./context-provider-spec.md) document.

#### 4.1 Context Key Examples (Initial Set)

`editor-core` provides the following context keys based on selection, state, etc.

- **Editor state**
  - `editorFocus: boolean`
  - `editorEditable: boolean`
  - `historyCanUndo: boolean`
  - `historyCanRedo: boolean`
- **Selection state**
  - `selectionEmpty: boolean`
  - `selectionType: 'range' | 'node' | 'multi-node' | 'cell' | 'table'`
  - `selectionDirection: 'forward' | 'backward'`
- **Document structure**
  - `cursorInText: boolean` (whether current selection is inside text node)
  - `cursorInEditableBlock: boolean`
  - `cursorBeforeBlockBoundary: boolean`
  - `cursorAfterBlockBoundary: boolean`

These keys are automatically managed inside `Editor` and automatically updated when state changes.

#### 4.2 Context Management System

`Editor` provides VS Code-style context management system:

```typescript
// Context setting method 1: Direct method call
editor.setContext('myExtension.showMyCommand', true);

// Context setting method 2: Use command (VS Code style)
await editor.executeCommand('setContext', { key: 'myExtension.showMyCommand', value: true });

// Context query
const context = editor.getContext();
// { editorFocus: true, editorEditable: true, selectionEmpty: false, ... }
```

**Automatically managed Context Keys**:
- `editorFocus`: Editor focus state (auto-updated)
- `editorEditable`: Whether editor is editable (auto-updated)
- `selectionEmpty`: Whether Selection is empty (auto-updated)
- `selectionType`: Selection type (auto-updated)
- `selectionDirection`: Selection direction (auto-updated)
- `historyCanUndo`: Whether Undo is possible (auto-updated)
- `historyCanRedo`: Whether Redo is possible (auto-updated)

**Custom Context Keys**:
Can be added by Extensions or host applications with `editor.setContext(key, value)` or `editor.executeCommand('setContext', { key, value })`.

**Context change events**:
When Context changes, events are emitted in two ways:

1. **Subscribe to all context changes**:
```typescript
editor.on('editor:context.change', ({ key, value, oldValue }) => {
  // Subscribe to all context changes
  console.log(`Context ${key} changed:`, value);
});
```

2. **Subscribe to specific keys only** (recommended):
```typescript
// Method 1: Directly subscribe to specific key event
editor.on('editor:context.change:myExtension.showMyCommand', ({ value, oldValue }) => {
  // Subscribe only to myExtension.showMyCommand
  console.log('showMyCommand changed:', value);
});

// Method 2: Use convenience method (recommended)
const unsubscribe = editor.onContextChange('myExtension.showMyCommand', ({ value, oldValue }) => {
  console.log('showMyCommand changed:', value);
});

// Unsubscribe if needed
unsubscribe();
```

Subscribing to specific keys only reduces unnecessary event processing, providing performance benefits.

#### 4.3 `when` Evaluation

- `when` is a string expression evaluated to boolean using context keys.
- Evaluation rules:
  - Undefined keys are considered `false` or empty string.
  - Mainly use simple logical expressions like `"editorFocus && editorEditable"`.
- If `when` is `undefined` or empty string, always considered `true`.
- Context is automatically managed inside `Editor`, so no need to manually pass context when calling `resolve`.

---

### 5. Architecture: `editor-core` Based

#### 5.1 Keybinding Registry (Proposal)

Place central registry component in `@barocss/editor-core`.

```ts
interface KeybindingRegistry {
  register(binding: Keybinding): void;
  unregister(binding: Keybinding): void;
  clear(source?: 'core' | 'extension' | 'user'): void;

  // Find command list to execute for given key input.
  // context is optional, and if not provided, Editor's context is automatically used.
  resolve(
    key: string,
    context?: Record<string, unknown>
  ): Array<{ command: string; args?: unknown }>;
  
  // Set context provider (Editor automatically sets)
  setContextProvider(provider: ContextProvider | null): void;
}
```

- **Registration levels**
  - `source: 'core'`  : Editor core default bindings (e.g., Enter, Backspace, Delete, Arrow keys, etc.).
  - `source: 'extension'`: Registered by individual extensions (e.g., Bold, Italic, Paragraph, etc.).
  - `source: 'user'` : User settings injected by host application (IDE, app level).

#### 5.2 Priority Rules

1. **Find all rule candidates** where **key + when match simultaneously**.
   - Key strings are matched **case-insensitively**.
   - Both registration and resolve are automatically normalized for comparison.
   - Example: Registered as `Mod+b` → matches when resolved as `Ctrl+B`, `CMD+b`, `mod+B`, etc.
2. `source` priority:
   - `user` > `extension` > `core`
3. Within same `source`, **later registered rules take precedence** (override).
4. `resolve` result is array of commands sorted by priority.
   - To maintain single execution model, use only the first one.

---

### 6. Integration with `Editor`

#### 6.1 Editor API Extension (Actual Implementation)

```ts
interface Editor {
  readonly keybindings: KeybindingRegistry;
}
```

- `Editor` instance provides `keybindings` property.
- Extensions and hosts declare shortcuts with `editor.keybindings.register(...)`.

#### 6.2 Execution Flow

1. View layer (e.g., `editor-view-dom`) receives browser `KeyboardEvent`.
2. Normalize key+modifier to string:
   - Examples: `Cmd+b`, `Ctrl+Shift+z`, `Enter`, `Backspace`, `ArrowLeft`
3. Call `editor.keybindings.resolve(normalizedKey)`.
   - Context is automatically managed inside `Editor`, so no need to manually pass.
   - Can override with custom context via `resolve(normalizedKey, customContext)` if needed.
4. Execute `editor.executeCommand(command, args)` based on first returned command.

View layer is responsible only for **key combination normalization + deciding whether to cancel default browser behavior**, and completely delegates which command executes to `editor-core`'s keybinding resolution.

---

### 7. Core / Extension / User Level Examples

#### 7.1 Core Default Binding Examples

```ts
// core-internal default keybindings
const coreDefaults: Keybinding[] = [
  { key: 'Enter', command: 'insertParagraph', when: 'editorFocus && editorEditable' },
  { key: 'Backspace', command: 'backspace', when: 'editorFocus && editorEditable' },
  { key: 'Delete', command: 'deleteForward', when: 'editorFocus && editorEditable' },
  { key: 'ArrowLeft', command: 'moveCursorLeft', when: 'editorFocus' },
  { key: 'ArrowRight', command: 'moveCursorRight', when: 'editorFocus' }
];
```

#### 7.2 Extension Level Binding Examples

```ts
// Inside BoldExtension onCreate
editor.keybindings.register({
  key: 'Mod+b',
  command: 'toggleBold',
  when: 'editorFocus && editorEditable',
  source: 'extension'
});

// Set custom context in Extension
editor.setContext('myExtension.showMyCommand', true);

// Keybinding using custom context
editor.keybindings.register({
  key: 'Ctrl+Shift+m',
  command: 'myCustomCommand',
  when: 'myExtension.showMyCommand && editorFocus',
  source: 'extension'
});
```

#### 7.3 User Level Binding Examples

```ts
// Reflect user settings in host app
editor.keybindings.register({
  key: 'Ctrl+d',
  command: 'deleteSelection',
  when: 'editorFocus && !selectionEmpty',
  source: 'user'
});
```

---

### 8. Differences from VS Code Style

- Similar to VS Code:
  - `key` / `command` / `when` structure.
  - Using context keys and logical expressions in `when`.
  - Override concept at user/default/extension levels.
- Differences:
  - `editor-core` focuses only on **internal editor state** and does not include external contexts like UI or file types (e.g., `editorLangId`) by default.
  - Keybinding definitions are **JS object-based**, and JSON file parsing is host application responsibility.

---

### 9. Next Steps (Implementation Plan Overview)

1. Add `KeybindingRegistry` interface and basic implementation to `@barocss/editor-core`.
2. Expose `keymap` API in `Editor` and define entry point for initializing core default bindings.
3. Existing `KeymapManagerImpl` in `editor-view-dom` should
   - Convert browser events → normalized key strings
   - Call `editor.keymap.resolve` and delegate to `executeCommand`
   only, and gradually migrate.
4. Unit tests:
   - Verify priority based on `source` / `when` / registration order for same key.
   - Verify keybinding matching results based on selection / editable state changes.

This document is a **high-level spec for unifying keybinding system based on `editor-core`**, and `editor-view-dom` and each Extension will gradually replace shortcut registration methods to match this spec.

---

## 10. Key String Normalization Details

### 10.1 Normalization Rules

Key strings are **automatically normalized both at registration and resolve time**. Case-insensitive.

1. **Modifier normalization**:
   - Convert to first letter uppercase: `Ctrl`, `Cmd`, `Alt`, `Shift`, `Mod`
   - Example: `ctrl`, `CTRL`, `Ctrl` → all `Ctrl`
   - Example: `mod+shift+z` → `Mod+Shift+z`

2. **Key name normalization**:
   - Alphabet keys: Convert to lowercase (`A`–`Z` → `a`–`z`)
   - Special keys: Keep as is (`Enter`, `Escape`, `F1`, etc.)
   - Example: `Ctrl+B` → `Ctrl+b`
   - Example: `Enter` → `Enter` (no change)

3. **Normalization at registration**:
   ```ts
   // Automatically normalized at registration
   registry.register({ key: 'CTRL+B', command: 'toggleBold' });
   // Stored internally as 'Ctrl+b'
   ```

4. **Normalization at resolve**:
   ```ts
   // Input key also automatically normalized at resolve
   registry.resolve('ctrl+b', {});
   // Normalized to 'Ctrl+b' and matched
   ```

### 10.2 KeyboardEvent Processing

`getKeyString()` function (`@barocss/shared`) converts `KeyboardEvent` to normalized key string:

- **Standard**: Use `event.key` (same as VS Code, ProseMirror, Slate, etc.)
- **Fallback**: Use `event.code` only when `event.key` is not available (very rare, older browsers)
- **Deprecated**: Do not use `event.keyCode` (deprecated)

```ts
import { getKeyString } from '@barocss/shared';

document.addEventListener('keydown', (event) => {
  const key = getKeyString(event);
  // Mac Cmd+b → 'Cmd+b'
  // Windows Ctrl+b → 'Ctrl+b'
  // Enter → 'Enter'
  // Shift+Enter → 'Shift+Enter'
});
```

### 10.3 Case-Insensitive Matching Examples

```ts
// Registration (case-insensitive)
registry.register({ key: 'mod+b', command: 'toggleBold' });
registry.register({ key: 'CTRL+SHIFT+Z', command: 'redo' });

// resolve (case-insensitive)
registry.resolve('Mod+B', {});        // ✅ Matched
registry.resolve('CMD+b', {});        // ✅ Matched (on Mac)
registry.resolve('Ctrl+Shift+z', {});  // ✅ Matched
```

### 10.4 resolve Behavior

`resolve()` method behaves as follows:

1. **Input key normalization**: Normalize input key with `_normalizeKeyString()`
2. **Mod key expansion**: Expand `Mod+b` → `[Mod+b, Ctrl+b, Cmd+b]`, etc.
3. **Matching**: Compare with registered keybindings (already normalized)
4. **when clause evaluation**: Evaluate `when` clause of matched keybindings
5. **Priority sorting**: Sort by `source` priority and registration order

**Important**: Registered keybindings are already normalized and stored at `register()` time, so `resolve()` only needs to normalize input key.

---

## 11. Related Documents

- [Keybinding & Context Usage Examples Guide](./keybinding-and-context-examples.md) - **Collection of real-world usage examples and sample code** ⭐
- [Keybinding Defaults and Customization](./keybinding-defaults-and-customization.md) - Default keybinding list management and user customization spec
- [When Expression Spec](./when-expression-spec.md) - `when` clause evaluation specification
- [Context Provider Spec](./context-provider-spec.md) - Context management specification
- [VS Code Keyboard Shortcuts](https://code.visualstudio.com/docs/configure/keybindings) - VS Code official documentation

