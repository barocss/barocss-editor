# Browser Input Events → Editing Features Mapping Plan

## 1. Goals
- Structure input-related events that occur in the browser and connect them to model/view editing features.
- Clearly define what data and state each event requires, and maintain consistent processing order.
- Establish a common layer that can cover various scenarios such as IME/paste/special keys.
- **Maximize use of browser default behavior to minimize Hangul input corruption.**

---

## 2. Core Principles

### 2.1 Events Not Used
- ❌ **`input` event**: Not used. Overlaps with MutationObserver and occurs after DOM changes, which can cause timing issues.
- ❌ **`compositionstart/update/end` events**: Not used. Let the browser handle them automatically to prevent Hangul input corruption.

### 2.2 Events Used
- ✅ **`beforeinput`**: Only detects structural changes (`insertParagraph`, `insertLineBreak`) and handles with `preventDefault()`. Let the browser handle the rest automatically.
- ✅ **`keydown`**: Handles shortcuts and special key combinations that the browser doesn't provide `inputType` for (e.g., Ctrl+B, Ctrl+Z, Enter fallback, etc.).
- ✅ **`selectionchange`**: Synchronizes model selection when DOM selection changes.
- ✅ **`MutationObserver`**: **Primary processing layer**. Detects DOM changes and updates the model. Detects changes after the browser automatically modifies the DOM.

### 2.3 Core Processing Strategy

**General text input/deletion**:
- Do not call `preventDefault()` in `beforeinput`
- Browser automatically changes DOM
- `MutationObserver` detects DOM changes → model update

**Structural changes (insertParagraph, insertLineBreak)**:
- Call `preventDefault()` in `beforeinput`
- Change model first
- Update DOM through rendering
- Update Selection

---

## 3. Role by Event Source

| Event | Purpose | Notes |
| --- | --- | --- |
| `beforeinput` | **Only detects structural changes**: Only for structural changes like `insertParagraph`, `insertLineBreak`, calls `preventDefault()` and changes model first. Let the browser handle the rest automatically. | Only handles structural changes. Does not handle text input/deletion. |
| `keydown / keyup` | Handles shortcuts and special key combinations that the browser doesn't provide `inputType` for (e.g., Ctrl+B, Ctrl+Z, Enter fallback, etc.). | Complements when beforeinput is insufficient. |
| `selectionchange` | Synchronizes model selection when DOM selection changes. Updates SelectionManager and emits `editor:selection.change`. | Always subscribed. |
| `MutationObserver` | **Primary processing layer**: Detects DOM changes made automatically by the browser and updates the model. Handles most text input/deletion here. | Primary processing layer. |

---

## 4. beforeinput inputType Mapping Table

### 4.1 Text Input Related

| inputType | Key/Action | Editing Action | DataStore Operation | Selection State | Browser Support |
| --- | --- | --- | --- | --- | --- |
| `insertText` | General character input (a-z, 0-9, Hangul, etc.) | **Handled in MutationObserver**: Detect DOM changes and update model | `dataStore.range.replaceText(contentRange, text)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `insertCompositionText` | IME intermediate input (during Hangul composition) | **Let browser handle automatically, MutationObserver only detects final result** | `dataStore.range.replaceText(contentRange, text)` (final result only) | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromPaste` | Ctrl+V / Cmd+V | **Handled in MutationObserver**: Detect pasted text from DOM and update model | `dataStore.range.replaceText(contentRange, pastedText)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromDrop` | Drag and drop | **Handled in MutationObserver**: Detect dropped text from DOM and update model | `dataStore.range.replaceText(contentRange, droppedText)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `insertFromYank` | Some editors' yank action | **Handled in MutationObserver**: Text insertion | `dataStore.range.replaceText(contentRange, text)` | collapsed or range | ⚠️ Limited support |

#### Detailed Processing Flow

**`insertText` (General text input)**:
1. Browser automatically inserts text into DOM
2. `MutationObserver` detects `characterData` or `childList` changes
3. Call `handleTextContentChange(oldValue, newValue, target)`
4. Execute `dataStore.range.replaceText(contentRange, insertedText)`
   - `contentRange`: Current selection range
   - `insertedText`: Inserted text (extracted from DOM)
   - marks/decorators automatically adjusted
5. Emit `editor.emit('editor:content.change', { skipRender: true })`

**`insertCompositionText` (IME input)**:
1. Browser automatically handles IME composition intermediate steps
2. `MutationObserver` detects intermediate changes but defers (during composition)
3. Detect final text change after IME input completes
4. Execute `dataStore.range.replaceText(contentRange, finalText)`
5. Emit `editor.emit('editor:content.change', { skipRender: true })`

### 4.2 Structural Changes Related

| inputType | Key/Action | Editing Action | DataStore Operation | Selection State | Browser Support |
| --- | --- | --- | --- | --- | --- |
| `insertParagraph` | Enter | **Handle after preventDefault() in beforeinput**: Block split, create new paragraph | `dataStore.range.splitNode(nodeId, position)` + `dataStore.core.setNode(newParagraphNode)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertLineBreak` | Shift+Enter | **Handle after preventDefault() in beforeinput**: Insert soft break node | `dataStore.range.insertText(contentRange, '\n')` or insert inline break node | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `insertOrderedList` | Browser shortcut | **Handled in MutationObserver**: Insert ordered list | `dataStore.core.setNode(orderedListNode)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `insertUnorderedList` | Browser shortcut | **Handled in MutationObserver**: Insert unordered list | `dataStore.core.setNode(unorderedListNode)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `insertHorizontalRule` | Browser shortcut | **Handled in MutationObserver**: Insert horizontal rule | `dataStore.core.setNode(horizontalRuleNode)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |

#### Detailed Processing Flow

**`insertParagraph` (Enter key)**:
1. Execute `event.preventDefault()` in `beforeinput` event
2. Check current selection position (`selectionManager.current`)
3. **Change model first**:
   - Execute `dataStore.range.splitNode(currentNodeId, cursorPosition)`
     - Split current node at cursor position
     - Keep left part as existing node
     - Create right part as new node
   - Create new paragraph node: `dataStore.core.setNode(newParagraphNode)`
   - Insert new paragraph into parent node's `content` array
4. **Rendering**: Call `editor.render()` to update DOM
5. **Selection update**: Move selection to start of new paragraph
   - `selectionManager.setSelection({ nodeId: newParagraphId, offset: 0 })`
   - `editor.emit('editor:selection.change', { selection })`

**`insertLineBreak` (Shift+Enter)**:
1. Execute `event.preventDefault()` in `beforeinput` event
2. Check current selection position
3. **Change model first**:
   - Option 1: Insert `\n` into text
     - `dataStore.range.insertText(contentRange, '\n')`
   - Option 2: Insert inline break node
     - `dataStore.core.setNode(breakNode)` (e.g., `{ type: 'line-break' }`)
4. **Rendering**: Call `editor.render()`
5. **Selection update**: Move to position after break node

### 4.3 Deletion Related

| inputType | Key/Action | Editing Action | DataStore Operation | Selection State | Browser Support |
| --- | --- | --- | --- | --- | --- |
| `deleteContentBackward` | Backspace | **Handled in MutationObserver**: Detect deleted text from DOM and update model | `dataStore.range.deleteText(contentRange)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteContentForward` | Delete | **Handled in MutationObserver**: Forward direction deletion | `dataStore.range.deleteText(contentRange)` | collapsed or range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteWordBackward` | Option+Backspace (Mac) / Ctrl+Backspace (Windows) | **Handled in MutationObserver**: Word range deletion | `dataStore.range.deleteText(expandedContentRange)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `deleteWordForward` | Option+Delete (Mac) / Ctrl+Delete (Windows) | **Handled in MutationObserver**: Word range deletion | `dataStore.range.deleteText(expandedContentRange)` | collapsed | ✅ Chrome, Firefox, Safari, Edge |
| `deleteSoftLineBackward` | Browser-specific implementation | **Handled in MutationObserver**: Soft line unit deletion | `dataStore.range.deleteText(softLineRange)` | collapsed | ⚠️ Browser differences |
| `deleteSoftLineForward` | Browser-specific implementation | **Handled in MutationObserver**: Soft line unit deletion | `dataStore.range.deleteText(softLineRange)` | collapsed | ⚠️ Browser differences |
| `deleteHardLineBackward` | Browser-specific implementation | **Handled in MutationObserver**: Hard line unit deletion | `dataStore.range.deleteText(hardLineRange)` | collapsed | ⚠️ Browser differences |
| `deleteHardLineForward` | Browser-specific implementation | **Handled in MutationObserver**: Hard line unit deletion | `dataStore.range.deleteText(hardLineRange)` | collapsed | ⚠️ Browser differences |
| `deleteByDrag` | Select then delete by drag | **Handled in MutationObserver**: Delete selected range | `dataStore.range.deleteText(contentRange)` | range | ✅ Chrome, Firefox, Safari, Edge |
| `deleteByCut` | Ctrl+X / Cmd+X | **Handled in MutationObserver**: Delete selected range and copy to clipboard | `dataStore.range.deleteText(contentRange)` | range | ✅ Chrome, Firefox, Safari, Edge |

#### Detailed Processing Flow

**`deleteContentBackward` (Backspace)**:
1. Browser automatically deletes text from DOM
2. `MutationObserver` detects `characterData` or `childList` changes
3. Call `handleTextContentChange(oldValue, newValue, target)`
4. Calculate deletion range:
   - If collapsed selection: Delete character before cursor (considering Unicode, surrogate pairs)
   - If range selection: Delete selected range
5. Execute `dataStore.range.deleteText(contentRange)`
   - `contentRange`: Range to delete
   - marks/decorators automatically adjusted (split/trim/shift)
6. Emit `editor.emit('editor:content.change', { skipRender: true })`

**`deleteContentForward` (Delete)**:
- Same flow as `deleteContentBackward`
- Difference: Delete character after cursor

**`deleteWordBackward` (Option+Backspace)**:
1. Browser automatically expands to word range and deletes
2. `MutationObserver` detects changes
3. Calculate deleted word range
4. Execute `dataStore.range.deleteText(expandedContentRange)`

### 4.4 Format Related

| inputType | Key/Action | Editing Action | DataStore Operation | Selection State | Browser Support | Important Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `formatBold` | Ctrl+B / Cmd+B | **Handled in MutationObserver**: Detect format changes from DOM and update model | `dataStore.range.toggleMark(contentRange, { stype: 'bold' })` | **range only** (does not occur with collapsed) | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **Does not occur with collapsed selection** |
| `formatItalic` | Ctrl+I / Cmd+I | **Handled in MutationObserver**: Detect format changes from DOM | `dataStore.range.toggleMark(contentRange, { stype: 'italic' })` | **range only** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **Does not occur with collapsed selection** |
| `formatUnderline` | Ctrl+U / Cmd+U | **Handled in MutationObserver**: Detect format changes from DOM | `dataStore.range.toggleMark(contentRange, { stype: 'underline' })` | **range only** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **Does not occur with collapsed selection** |
| `formatStrikeThrough` | Browser shortcut | **Handled in MutationObserver**: Detect format changes from DOM | `dataStore.range.toggleMark(contentRange, { stype: 'strikeThrough' })` | **range only** | ✅ Chrome, Firefox, Safari, Edge | ⚠️ **Does not occur with collapsed selection** |
| `formatSuperscript` | Browser shortcut | **Handled in MutationObserver**: Detect format changes from DOM | `dataStore.range.toggleMark(contentRange, { stype: 'superscript' })` | **range only** | ⚠️ Limited support | |
| `formatSubscript` | Browser shortcut | **Handled in MutationObserver**: Detect format changes from DOM | `dataStore.range.toggleMark(contentRange, { stype: 'subscript' })` | **range only** | ⚠️ Limited support | |
| `formatRemove` | Browser shortcut | **Handled in MutationObserver**: Remove all formats | `dataStore.range.clearMarks(contentRange)` | range | ⚠️ Limited support | |
| `formatJustifyFull` | Browser shortcut | **Handled in MutationObserver**: Justify alignment | `dataStore.core.updateNode(nodeId, { attributes: { align: 'justify' } })` | collapsed or range | ⚠️ Limited support | |
| `formatJustifyCenter` | Browser shortcut | **Handled in MutationObserver**: Center alignment | `dataStore.core.updateNode(nodeId, { attributes: { align: 'center' } })` | collapsed or range | ⚠️ Limited support | |
| `formatJustifyRight` | Browser shortcut | **Handled in MutationObserver**: Right alignment | `dataStore.core.updateNode(nodeId, { attributes: { align: 'right' } })` | collapsed or range | ⚠️ Limited support | |
| `formatJustifyLeft` | Browser shortcut | **Handled in MutationObserver**: Left alignment | `dataStore.core.updateNode(nodeId, { attributes: { align: 'left' } })` | collapsed or range | ⚠️ Limited support | |
| `formatIndent` | Tab / Browser shortcut | **Handled in MutationObserver**: Increase indentation | `dataStore.core.updateNode(nodeId, { attributes: { indent: currentIndent + 1 } })` | collapsed or range | ⚠️ Browser differences | |
| `formatOutdent` | Shift+Tab / Browser shortcut | **Handled in MutationObserver**: Decrease indentation | `dataStore.core.updateNode(nodeId, { attributes: { indent: Math.max(0, currentIndent - 1) } })` | collapsed or range | ⚠️ Browser differences | |

#### Detailed Processing Flow

**`formatBold` (Ctrl+B / Cmd+B)**:
1. Browser automatically adds/removes `<strong>` or `<b>` tags in DOM
2. `MutationObserver` detects `attributes` or `childList` changes
3. Check changed range and format type
4. Execute `dataStore.range.toggleMark(contentRange, { stype: 'bold' })`
   - `contentRange`: Text range where format is applied
   - Remove bold if exists, add if not
   - Internally calls `dataStore.marks.toggleMark()`
5. Emit `editor.emit('editor:content.change', { skipRender: true })`

**`formatItalic`, `formatUnderline`, etc.**:
- Same flow as `formatBold`
- Difference: Only `stype` value differs (`'italic'`, `'underline'`, etc.)

**`formatRemove` (Remove all formats)**:
1. Browser automatically removes format tags from DOM
2. `MutationObserver` detects changes
3. Execute `dataStore.range.clearMarks(contentRange)`
   - Remove all marks in selected range

### 4.5 History Related

| inputType | Key/Action | Editing Action | DataStore Operation | Selection State | Browser Support | Important Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `historyUndo` | Ctrl+Z / Cmd+Z | **Handle after preventDefault() in beforeinput**: Connect to editor history system | `editor.history.undo()` (internally restores DataStore state) | collapsed or range | ✅ Chrome, Firefox, Safari, Edge | ⚠️ May conflict with OS default undo |
| `historyRedo` | Ctrl+Shift+Z / Cmd+Shift+Z | **Handle after preventDefault() in beforeinput**: Connect to editor history system | `editor.history.redo()` (internally restores DataStore state) | collapsed or range | ✅ Chrome, Firefox, Safari, Edge | ⚠️ May conflict with OS default redo |

#### Detailed Processing Flow

**`historyUndo` (Ctrl+Z / Cmd+Z)**:
1. Execute `event.preventDefault()` in `beforeinput` event
2. Call `editor.history.undo()`
   - HistoryManager restores previous state
   - Internally reverts `dataStore` to previous state
   - Uses TransactionalOverlay for atomic restoration
3. **Rendering**: Call `editor.render()` to update DOM
4. **Selection update**: Restore to previous state's selection

**`historyRedo` (Ctrl+Shift+Z / Cmd+Shift+Z)**:
- Same flow as `historyUndo`
- Difference: Call `editor.history.redo()`

### 4.6 Others

| inputType | Key/Action | Editing Action | Selection State | Browser Support |
| --- | --- | --- | --- | --- |
| `insertReplacementText` | Autocomplete/correction | Insert corrected text | collapsed or range | ⚠️ Limited support |
| `insertFromComposition` | IME final input | Insert text after IME input completes | collapsed | ⚠️ Browser differences |

---

### 4.7 Browser Differences and Notes

#### Chrome/Edge (Chromium-based)
- ✅ Supports most `inputType`s
- ✅ Well supports format-related `inputType`s like `formatBold`, `formatItalic`
- ⚠️ `formatBold` **only occurs with range selection** (does not occur with collapsed)
- ✅ Supports `historyUndo`, `historyRedo`

#### Firefox
- ✅ Supports most `inputType`s
- ⚠️ Some format-related `inputType`s may be more limited than Chrome
- ⚠️ `formatBold` **only occurs with range selection** (does not occur with collapsed)
- ✅ Supports `historyUndo`, `historyRedo`

#### Safari
- ⚠️ Support for some `inputType`s is limited
- ⚠️ Format-related `inputType`s like `formatBold` may be more limited than Chrome
- ⚠️ `formatBold` **only occurs with range selection** (does not occur with collapsed)
- ⚠️ Support for `historyUndo`, `historyRedo` may be unstable

#### Common Notes
1. **Format-related `inputType`s only occur with range selection**
   - `formatBold`, `formatItalic`, etc. only occur when text is selected (range)
   - Do not occur with collapsed selection (cursor only)
   - Therefore, to apply format in collapsed state, must handle with `keydown` event

2. **Browser differences in `inputType` support**
   - Safari may not support some `inputType`s
   - Therefore, `keydown` fallback is essential

3. **History-related `inputType`s**
   - `historyUndo`, `historyRedo` may conflict with OS default undo/redo
   - To use editor's own history system, must execute own logic after `preventDefault()`

---

## 5. Shortcuts and Hook System

### 5.1 KeyBinding System

**Decision**: **Use only `KeyBinding`**. Do not provide separate hook concept.

**Reasons**:
1. Other editors (ProseMirror, Slate, Lexical, etc.) also do not provide `inputType` hooks
2. Browser compatibility issues (Safari limited support)
3. Directly parsing key combinations is more flexible and controllable
4. Maintain consistency with existing `KeymapManager`
5. `KeyBinding` already includes `before`/`after` hooks, so separate hook concept is unnecessary

**KeyBinding Structure**:

```ts
interface KeyBinding {
  // Shortcut identifier (Key-based only)
  key: string;           // e.g., 'Ctrl+B', 'Enter', 'Cmd+B'
  
  // Command connection (optional)
  command?: string;       // e.g., 'bold.toggle'
  commandPayload?: any;   // Payload to pass to command
  
  // Or direct handler (can be used without command)
  handler?: () => void;
  
  // Hook support
  before?: (event: KeyboardEvent, context: EditorContext) => boolean | void;
  after?: (event: KeyboardEvent, context: EditorContext, result: any) => void;
  
  // Priority (lower executes first)
  priority?: number;
}
```

**Processing Order**:
1. `keydown` event occurs
2. Check and execute `KeyBinding`'s `before` hook
3. Execute `command` or `handler`
4. Execute `KeyBinding`'s `after` hook

### 5.2 Shortcut Processing Flow

Actions with shortcuts are processed in the following order:

1. **KeyBinding's before hook**: External code can intercept shortcuts to perform different actions
2. **Default action**: Perform default action if hook doesn't handle it
3. **Key-based Hook (after)**: Additional processing after default action completes

### 5.3 Intercepting Shortcuts from External Code

**Example 1**: Customize `Ctrl+B` (Bold toggle)

```ts
// Register hook with KeyBinding (use handler only without command)
keyBindingManager.registerBinding({
  key: 'Ctrl+B', // or 'Cmd+B' (platform-specific)
  handler: () => {
    // Custom Bold action
    performCustomBoldAction(editor);
  },
  before: (event, context) => {
    // Conditionally skip default action
    if (shouldUseCustomBold(context)) {
      event.preventDefault();
      return true; // Execute handler, skip default action
    }
  },
  after: (event, context, result) => {
    // Log after Bold toggle
    logBoldAction(context, result);
  },
  priority: 100
});
```

**Example 2**: Customize `Enter` key (paragraph insertion)

```ts
// Register hook with KeyBinding
keyBindingManager.registerBinding({
  key: 'Enter',
  handler: () => {
    // Custom action inside code block
    if (isInCodeBlock(editor)) {
      insertCodeBlockLineBreak(editor);
    } else {
      // Default action (execute existing command)
      editor.executeCommand('insertParagraph');
    }
  },
  before: (event, context) => {
    // Skip default action inside code block
    if (isInCodeBlock(context)) {
      event.preventDefault();
      return true; // Execute handler, skip default action
    }
  },
  after: (event, context, result) => {
    // Log after paragraph insertion
    analytics.track('paragraph_inserted', { result });
  },
  priority: 100
});
```

**Example 3**: Only add additional processing (logging) to shortcut connected to command

```ts
// Use existing command as-is, only add additional processing
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  command: 'bold.toggle', // Use existing command
  after: (event, context, result) => {
    // Only add logging after command execution
    analytics.track('bold_toggled', { result });
  },
  priority: 2000 // Execute after command execution
});
```

### 5.4 Hook Execution Order

#### keydown Event Handling

```ts
function handleKeyDown(event: KeyboardEvent) {
  const key = getKeyString(event); // e.g., 'Ctrl+B', 'Enter'
  
  // Find KeyBinding
  const bindings = keyBindingManager.getBindings(key).sort((a, b) => 
    (a.priority || 1000) - (b.priority || 1000)
  );
  
  // Execute before hooks
  for (const binding of bindings) {
    if (binding.before) {
      const result = binding.before(event, editorContext);
      if (result === true) {
        // Skip default action (but handler or command can still execute)
        // Execute binding.handler or binding.command
        if (binding.handler) {
          binding.handler();
        } else if (binding.command) {
          editor.executeCommand(binding.command, binding.commandPayload);
        }
        // Execute after hooks
        for (const b of bindings) {
          b.after?.(event, editorContext, null);
        }
        return;
      }
    }
  }
  
  // Perform default action (command or handler)
  let defaultResult = null;
  for (const binding of bindings) {
    if (binding.command) {
      defaultResult = editor.executeCommand(binding.command, binding.commandPayload);
      break;
    } else if (binding.handler) {
      binding.handler();
      break;
    }
  }
  
  // Execute after hooks
  for (const binding of bindings) {
    if (binding.after) {
      binding.after(event, editorContext, defaultResult);
    }
  }
}
```

#### Processing Flow

```
User input (e.g., Enter key)
  ↓
keydown event occurs
  ├─ Check key: 'Enter'
  ├─ Execute Key-based hook's before
  ├─ Perform or skip default action
  └─ Execute Key-based hook's after
```

### 5.5 Key-based Hook Usage Guide

#### Using Key-based Hooks

✅ **All shortcuts are handled Key-based**:
- Directly parse key combinations in `keydown` event
- Handle platform differences (Ctrl vs Cmd)
- Work consistently across all selection states

**Example**:
```ts
// Enter key → Insert paragraph (connect to command)
keyBindingManager.bindCommand('Enter', 'insertParagraph');

// Or with additional processing
keyBindingManager.registerBinding({
  key: 'Enter',
  command: 'insertParagraph',
  before: (event, context) => { /* ... */ }
});

// Ctrl+B → Bold toggle (all selection states)
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle');
```

#### Platform-specific Key Handling

```ts
// Automatic platform detection
const modifier = navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
keyBindingManager.bindCommand(`${modifier}+B`, 'bold.toggle');

// Or explicitly register both
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle'); // Windows/Linux
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle'); // macOS
```

### 5.6 How Other Editors Handle This (Reference)

#### Research Results

**Most editors do not provide `inputType` hooks**:

1. **ProseMirror**: Uses `keydown` event-based `Keymap` plugin
2. **Slate.js**: Uses `beforeinput` event but does not provide `inputType` hooks
3. **Lexical (Meta)**: `keydown` event-based handling
4. **Tiptap**: Based on ProseMirror, so uses `keydown` event
5. **Quill**: `keydown` event-based handling

#### Why Don't They Provide inputType Hooks?

1. **Browser compatibility issues**: Limited support in Safari
2. **Integration difficulties with existing systems**: Most editors already have `keydown`-based systems
3. **Need for fine-grained control**: Directly parsing key combinations is more flexible

#### Our Decision

**Provide only Key-based hooks**:
- Same approach as other editors
- Maximize browser compatibility
- Maintain consistency with existing `KeymapManager`
- Work consistently across all selection states

---

### 5.7 KeymapManager and Command System Integration

#### Current State

**KeymapManager** (`packages/editor-view-dom/src/keymap/keymap-manager.ts`):
- ✅ Already exists
- Simple `key → handler` mapping
- `register(key: string, handler: () => void)` form
- Not directly connected to commands

**Command System** (`packages/editor-core/src/editor.ts`):
- `registerCommand({ name, execute, before, after })` form
- Commands registered in extensions
- Not directly connected to shortcuts

#### Integration Need

✅ **Shortcut → Command connection is needed**:
- Extensions should be able to register commands and execute them via shortcuts
- Need to integrate KeymapManager to call commands
- Should be able to use hook system and command system together

#### Integration Approach: KeyBindingManager

**Option 1: Extend KeymapManager (Recommended)**

```ts
interface KeyBinding {
  // Shortcut identifier (Key-based only)
  key: string;           // e.g., 'Ctrl+B', 'Enter', 'Cmd+B'
  
  // Command connection
  command?: string;       // e.g., 'bold.toggle'
  commandPayload?: any;   // Payload to pass to command
  
  // Or direct handler (compatible with existing KeymapManager)
  handler?: () => void;
  
  // Hook support
  before?: (event: KeyboardEvent, context: EditorContext) => boolean | void;
  after?: (event: KeyboardEvent, context: EditorContext, result: any) => void;
  
  // Priority
  priority?: number;
}

interface KeyBindingManager extends KeymapManager {
  // Register KeyBinding
  registerBinding(binding: KeyBinding): () => void; // Returns unregister function
  
  // Connect command to shortcut (convenience method)
  bindCommand(key: string, command: string, payload?: any): void;
  
  // Query registered bindings
  getBindings(key?: string): KeyBinding[];
  
  // Maintain existing KeymapManager API (backward compatibility)
  register(key: string, handler: () => void): void;
  getHandler(key: string): (() => void) | undefined;
  remove(key: string): void;
  clear(): void;
}
```

**Usage Example**:

```ts
// Register command in extension
editor.registerCommand({
  name: 'bold.toggle',
  before: (editor, payload) => {
    console.log('Before bold toggle');
  },
  execute: (editor, payload) => {
    return editor.dataStore.range.toggleMark(...);
  },
  after: (editor, payload) => {
    console.log('After bold toggle');
  }
});

// Connect shortcut to command with KeyBindingManager
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
keyBindingManager.bindCommand('Cmd+B', 'bold.toggle'); // macOS

// Or with more fine-grained control
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  command: 'bold.toggle',
  before: (event, context) => {
    if (!canToggleBold(context)) {
      event.preventDefault();
      return true; // Skip command execution
    }
  },
  after: (event, context, result) => {
    analytics.track('bold_toggled', { result });
  },
  priority: 100
});
```

**Processing Flow**:

```
User input (e.g., Ctrl+B)
  ↓
keydown event (key: 'Ctrl+B')
  ├─ Execute KeyBinding's before hook
  ├─ Execute Command's before hook
  ├─ Execute Command's execute
  ├─ Execute Command's after hook
  └─ Execute KeyBinding's after hook
```

**Execution Order**:
1. KeyBinding `before` hook (Key-based)
2. Command `before` hook
3. Command `execute`
4. Command `after` hook
5. KeyBinding `after` hook

#### Compatibility with Existing KeymapManager

Maintain existing `KeymapManager` API but use `KeyBindingManager` internally:

```ts
// Existing API (backward compatibility)
keymapManager.register('Ctrl+B', () => {
  editor.executeCommand('bold.toggle');
});

// New API (direct command connection)
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
```

### 5.8 Extension-based Keymap Registration

#### Current Issues

Currently registering keys one by one in `EditorViewDOM`:

```ts
// editor-view-dom.ts
this.keymapManager.register('Ctrl+b', () => this.toggleBold());
this.keymapManager.register('Cmd+b', () => this.toggleBold());
this.keymapManager.register('Ctrl+i', () => this.toggleItalic());
this.keymapManager.register('Cmd+i', () => this.toggleItalic());
// ... repeated
```

**Issues**:
- Must register platform-specific key combinations one by one (Ctrl vs Cmd)
- Must modify `EditorViewDOM` every time an extension is added
- Connection between commands and shortcuts is scattered

#### Solution: Extension-based Registration

**Register keymap directly in Extension**:

```ts
// packages/editor-core/src/extensions/bold.ts
export class BoldExtension implements Extension {
  name = 'bold';
  
  onCreate(editor: Editor): void {
    // Register command
    editor.registerCommand({
      name: 'bold.toggle',
      execute: (editor) => {
        // Bold toggle logic
        return true;
      },
      canExecute: (editor) => {
        return true;
      }
    });
    
    // Register KeyBinding (directly in extension)
    const keyBindingManager = editor._viewDOM?._keyBindingManager;
    if (keyBindingManager) {
      // Automatic platform detection
      const modKey = navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl';
      
      keyBindingManager.bindCommand(`${modKey}+B`, 'bold.toggle');
      
      // Or explicitly register both
      keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');
      keyBindingManager.bindCommand('Cmd+B', 'bold.toggle');
    }
  }
}
```

**Advantages**:
- Extension manages its own commands and shortcuts together
- No need to modify `EditorViewDOM`
- Keymap automatically added/removed when extension is added/removed

#### KeyProfile Concept (Optional)

**KeyProfile**: Profile system that can apply different key mappings based on user or environment

**WYSIWYG Editor Vim Mode Support Status**:

| Editor Type | Vim Mode Support | Notes |
|------------|-----------------|-------|
| **Code Editors** (VS Code, Sublime Text, Atom) | ✅ Provided | Common for code editing |
| **Traditional WYSIWYG** (Google Docs, Notion, Word Online) | ❌ Not provided | GUI-centric, doesn't match modal editing style |
| **Library-based** (ProseMirror, Tiptap, Slate.js) | ⚠️ Limited | Not officially provided, but community plugins may exist |
| **Markdown Editors** (Typora, Obsidian) | ⚠️ Some provide | Some provide vim-style shortcuts in markdown mode |

**Conclusion**:
- **Traditional WYSIWYG editors** generally do not provide vim mode
- **Code editors** have vim mode as standard feature
- **Library-based editors** can be implemented via community plugins, but official support is rare
- **Our editor** can optionally provide vim mode through KeyProfile system (optional in initial implementation)

**Use Cases**:
1. **Default profile**: Standard shortcuts (Ctrl+B, Ctrl+I, etc.)
2. **Vim profile**: Vim-style shortcuts (e.g., `i` = insert mode, `dd` = delete line) - **Optional**
3. **Emacs profile**: Emacs-style shortcuts (e.g., `Ctrl+X Ctrl+S` = save) - **Optional**
4. **User custom profile**: Shortcuts defined directly by user

**Implementation Approach**:

```ts
interface KeyProfile {
  name: string;
  keymaps: Record<string, string>; // key -> command mapping
}

// Default profile
const defaultProfile: KeyProfile = {
  name: 'default',
  keymaps: {
    'Ctrl+B': 'bold.toggle',
    'Ctrl+I': 'italic.toggle',
    'Enter': 'insertParagraph',
    // ...
  }
};

// Vim profile
const vimProfile: KeyProfile = {
  name: 'vim',
  keymaps: {
    'i': 'insertMode',
    'dd': 'deleteLine',
    'yy': 'copyLine',
    // ...
  }
};

// Apply profile to KeyBindingManager
keyBindingManager.loadProfile(defaultProfile);
// or
keyBindingManager.loadProfile(vimProfile);
```

**Mode Switching Feature**:

```ts
interface KeyBindingManager {
  // Load profile
  loadProfile(profile: KeyProfile): void;
  
  // Get current profile
  getCurrentProfile(): KeyProfile | null;
  
  // Switch profile
  switchProfile(profileName: string): void;
  
  // List available profiles
  getAvailableProfiles(): KeyProfile[];
  
  // Register profile
  registerProfile(profile: KeyProfile): void;
}

// Usage example
keyBindingManager.registerProfile(defaultProfile);
keyBindingManager.registerProfile(vimProfile);
keyBindingManager.registerProfile(emacsProfile);

// Switch profile
keyBindingManager.switchProfile('vim'); // Switch to Vim mode
keyBindingManager.switchProfile('default'); // Switch to default mode
```

**Additional Considerations for Vim Mode**:

Vim is a modal editor, so simple key mapping alone is insufficient:

```ts
// Vim mode state management
interface VimModeState {
  mode: 'normal' | 'insert' | 'visual' | 'command';
  pendingKeys: string[]; // Multi-key commands (e.g., 'dd', 'yy')
}

// Vim profile needs different key mappings per mode
const vimProfile: KeyProfile = {
  name: 'vim',
  keymaps: {
    // Normal mode
    'i': 'vim.enterInsertMode',
    'v': 'vim.enterVisualMode',
    'dd': 'deleteLine',
    'yy': 'copyLine',
    'p': 'paste',
    // ...
  },
  // Separate key mappings by mode
  modeKeymaps: {
    normal: {
      'i': 'vim.enterInsertMode',
      'dd': 'deleteLine',
      // ...
    },
    insert: {
      'Escape': 'vim.enterNormalMode',
      // Regular text input remains as-is
    },
    visual: {
      'd': 'delete',
      'y': 'copy',
      'Escape': 'vim.enterNormalMode',
      // ...
    }
  }
};
```

**Notes When Switching Modes**:

1. **State initialization**: Initialize pending keys when switching modes
2. **UI feedback**: Display current mode (e.g., show "NORMAL", "INSERT" in status bar)
3. **Restore default behavior**: Remove previous mode's key bindings when switching modes
4. **Extension compatibility**: Handle conflicts with key bindings registered by extensions

**Implementation Example**:

```ts
class KeyBindingManagerImpl {
  private currentProfile: KeyProfile | null = null;
  private registeredProfiles: Map<string, KeyProfile> = new Map();
  
  loadProfile(profile: KeyProfile): void {
    // Remove existing key bindings
    this.clear();
    
    // Register new profile's key bindings
    for (const [key, command] of Object.entries(profile.keymaps)) {
      this.bindCommand(key, command);
    }
    
    this.currentProfile = profile;
    this.emit('profile:changed', { profile });
  }
  
  switchProfile(profileName: string): void {
    const profile = this.registeredProfiles.get(profileName);
    if (!profile) {
      throw new Error(`Profile "${profileName}" not found`);
    }
    this.loadProfile(profile);
  }
  
  registerProfile(profile: KeyProfile): void {
    this.registeredProfiles.set(profile.name, profile);
  }
  
  getCurrentProfile(): KeyProfile | null {
    return this.currentProfile;
  }
  
  getAvailableProfiles(): KeyProfile[] {
    return Array.from(this.registeredProfiles.values());
  }
}
```

**How Other Editors Manage Key Bindings**:

| Editor | Key Binding Management | Profile Support | Notes |
|--------|----------------------|----------------|-------|
| **VS Code** | `keybindings.json` file-based | ✅ Key binding profiles (e.g., Vim, Emacs) | Managed via JSON file, profiles provided by extensions |
| **ProseMirror** | `prosemirror-keymap` plugin | ❌ No profiles | Register keymaps per plugin, cannot switch at runtime |
| **Tiptap** | ProseMirror-based | ❌ No profiles | Register keymaps in extensions |
| **Slate.js** | Plugin/Extension-based | ❌ No profiles | Each plugin manages its own keymap |
| **Sublime Text** | `.sublime-keymap` file | ✅ Profile per keymap file | Platform-specific keymap files (Default, Linux, OSX, Windows) |
| **Atom** | `keymap.cson` file | ✅ Profile per keymap file | CoffeeScript Object Notation file |
| **Vim/Neovim** | `.vimrc` / `init.vim` | ✅ Profile per config file | Modal editor, keymap per mode |

**VS Code's Key Binding Management**:

```json
// keybindings.json
[
  {
    "key": "ctrl+b",
    "command": "editor.action.toggleBold",
    "when": "editorTextFocus"
  },
  {
    "key": "ctrl+i",
    "command": "editor.action.toggleItalic"
  }
]
```

- Manage key bindings via JSON file
- Extensions can add key bindings
- Vim extension provides separate keymap (profile concept)

**ProseMirror's Keymap Management**:

```ts
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';

// Register keymap plugin
const keymapPlugin = keymap({
  'Mod+b': toggleBold,
  'Mod+i': toggleItalic,
  // ...
});

// Merge multiple keymaps
const allKeymaps = keymap([
  ...baseKeymap,
  customKeymap,
  anotherKeymap
]);
```

- Register keymaps per plugin
- Merge multiple keymaps for use
- Cannot switch profiles at runtime (requires plugin re-registration)

**Sublime Text's Keymap Profiles**:

```
Default (Linux).sublime-keymap
Default (OSX).sublime-keymap
Default (Windows).sublime-keymap
```

- Automatically select platform-specific keymap file
- Can override with user keymap file
- Profile switching via file replacement

**Our Editor's Approach**:

We use a **hybrid approach**:

1. **Extension-based registration** (default): Similar to ProseMirror/Tiptap
   - Extensions automatically register keymaps
   - Managed together with code

2. **KeyProfile system** (optional): Similar to VS Code/Sublime Text
   - Can switch profiles at runtime
   - Supports user customization
   - Supports special modes like Vim/Emacs

**Advantages**:
- Extension developers can easily register keymaps (ProseMirror style)
- Users can customize via profiles (VS Code style)
- Supports both approaches for flexibility

**KeyProfile vs One-by-One Registration**:

| Approach | Advantages | Disadvantages | Recommended Use |
|----------|-----------|---------------|----------------|
| **Extension-based registration** | - Shortcuts managed together with extension<br>- Automatically added/removed<br>- Code not scattered | - Extension must access keyBindingManager | ✅ **Recommended**: Default approach |
| **One-by-one registration** | - Simple<br>- Explicit | - Must register platform-specific keys one by one<br>- Must modify when extension is added | ❌ Not recommended |
| **KeyProfile** | - User customization possible<br>- Can switch between multiple profiles<br>- Supports special editor styles like Vim/Emacs | - Increased implementation complexity<br>- Unnecessary for basic use | ⚠️ **Optional**: Only when user customization is needed |

**Conclusion**:
- **Default**: Use extension-based registration (do not register one by one)
- **KeyProfile**: Add only when user customization is needed (optional in initial implementation)

### 5.9 Command Parameter Passing

**Can pass parameters when mapping command to shortcut**:

```ts
// Without parameters
keyBindingManager.bindCommand('Ctrl+B', 'bold.toggle');

// With parameters
keyBindingManager.bindCommand('Ctrl+Shift+B', 'bold.toggle', { 
  weight: 'bold' 
});

// Or use registerBinding
keyBindingManager.registerBinding({
  key: 'Ctrl+1',
  command: 'heading.set',
  commandPayload: { level: 1 } // Passed to Command's execute(editor, payload)
});

keyBindingManager.registerBinding({
  key: 'Ctrl+2',
  command: 'heading.set',
  commandPayload: { level: 2 }
});
```

**Using parameters in Command**:

```ts
// Register command in extension
editor.registerCommand({
  name: 'heading.set',
  execute: (editor, payload?: { level: number }) => {
    const level = payload?.level ?? 1;
    // Heading setting logic
    return true;
  }
});

// When executed via shortcut
// Ctrl+1 → execute(editor, { level: 1 })
// Ctrl+2 → execute(editor, { level: 2 })
```

**Can register multiple shortcuts with same command but different parameters**:

```ts
// Register multiple shortcuts in extension
keyBindingManager.bindCommand('Ctrl+1', 'heading.set', { level: 1 });
keyBindingManager.bindCommand('Ctrl+2', 'heading.set', { level: 2 });
keyBindingManager.bindCommand('Ctrl+3', 'heading.set', { level: 3 });
// ...
```

#### Implementation Considerations

1. **KeyBindingManager extends KeymapManager**
   - Recommend extension form for compatibility with existing code
   - Extend `KeymapManagerImpl` to `KeyBindingManagerImpl`

2. **Hook System Integration**
   - KeyBinding's `before`/`after` hooks execute together with Command's `before`/`after` hooks
   - Execution order: KeyBinding before → Command before → Command execute → Command after → KeyBinding after

3. **Usage in Extensions**
   - Can automatically bind shortcuts when registering commands in extensions
   - Or explicitly register shortcut bindings in extensions

---

## 6. Processing Pipeline

### 6.1 Overall Flow
1. **beforeinput structural change detection** (only handle structural changes)  
   - Only for structural changes like `insertParagraph`, `insertLineBreak`, handle after `preventDefault()`.  
   - Processing order: Change model first → render → update selection.  
   - Let browser handle remaining `inputType`s automatically.

2. **MutationObserver** (primary processing layer)  
   - Detect DOM changes made automatically by browser and update model.  
   - Handle most text input/deletion here.  
   - Also detect final text changes after IME input completes.

3. **keydown fallback** (auxiliary processing)  
   - `Meta/Control` combination shortcuts (Bold, Italic, Underline, etc.)  
   - Manual handling when some browsers don't provide `inputType` for `Enter`/`Backspace`, etc.  
   - **Check `event.isComposing` but do not directly handle composition events.**

### 6.2 Pseudocode
```ts
function handleBeforeInput(event: InputEvent) {
  // Only handle structural changes, let browser handle the rest automatically
  
  // Structural changes: preventDefault then change model first → render → selection
  if (event.inputType === 'insertParagraph' || 
      event.inputType === 'insertLineBreak') {
    event.preventDefault();
    
    const selection = selectionManager.ensureModelSelection();
    
    // 1. Change model first
    let result;
    if (event.inputType === 'insertParagraph') {
      result = splitBlock(selection);
    } else if (event.inputType === 'insertLineBreak') {
      result = insertLineBreak(selection);
    }
    
    // 2. Rendering (DOM update)
    editor.render();
    
    // 3. Selection update
    const newSelection = calculateNewSelection(selection);
    selectionManager.setSelection(newSelection);
    editor.emit('editor:selection.change', { selection: newSelection });
    
    return;
  }
  
  // History related (when using editor's own history)
  if (event.inputType === 'historyUndo') {
    event.preventDefault();
    editor.history.undo();
    return;
  }
  
  if (event.inputType === 'historyRedo') {
    event.preventDefault();
    editor.history.redo();
    return;
  }
  
  // Do not preventDefault for the rest
  // Browser automatically changes DOM, MutationObserver detects and updates model
}

function handleMutationObserver(event: MutationEvent) {
  // Detect DOM changes made automatically by browser and update model
  // Handle most text input/deletion here
  
  if (event.type === 'characterData' || event.type === 'childList') {
    const textNodeId = resolveModelTextNodeId(event.target);
    if (textNodeId) {
      // Reflect DOM changes to model
      updateModelFromDOMChange(textNodeId, event.oldValue, event.newValue);
    }
  }
}

function handleKeyDown(event: KeyboardEvent) {
  // Special keys can be handled even during composition (shortcuts, etc.)
  // But leave text input-related keys to browser
  
  const key = getKeyString(event); // e.g., 'Ctrl+B', 'Enter'
  
  // Find binding in KeyBindingManager
  const bindings = keyBindingManager.getBindings(key);
  const sortedBindings = bindings.sort((a, b) => 
    (a.priority || 1000) - (b.priority || 1000)
  );
  
  // Execute before hooks
  for (const binding of sortedBindings) {
    if (binding.before) {
      const result = binding.before(event, editorContext);
      if (result === true) {
        // Hook handled it, so skip default action
        // Do not execute after hooks (no default action)
        return;
      }
    }
  }
  
  // Perform default action
  let defaultResult = null;
  
  // If command is connected
  for (const binding of sortedBindings) {
    if (binding.command) {
      defaultResult = await editor.executeCommand(binding.command, binding.commandPayload);
      break; // Only execute first command
    } else if (binding.handler) {
      // Existing handler approach
      binding.handler();
      break;
    }
  }
  
  // Find default handler in KeymapManager (fallback)
  if (!defaultResult && !sortedBindings.some(b => b.command || b.handler)) {
    const handler = keymapManager.getHandler(key);
    if (handler) {
      handler();
    }
  }
  
  // Execute after hooks
  for (const binding of sortedBindings) {
    if (binding.after) {
      binding.after(event, editorContext, defaultResult);
    }
  }
}

// Do not use composition events
// Browser handles automatically, MutationObserver detects final result
```

---

## 7. IME Input Processing Strategy (No Composition Events)

### 7.1 Core Principles
- **Do not use composition events (`compositionstart/update/end`)**
- Let browser automatically handle IME input to prevent Hangul input corruption
- Handle via `beforeinput`'s `insertCompositionText` or `insertText`
- MutationObserver detects final result and updates model

### 7.2 Processing Flow
1. **User starts Hangul input**
   - Browser automatically manages composition state
   - `beforeinput` event occurs (`insertCompositionText` or `insertText`)
   - **We do not call `preventDefault()` and let browser handle automatically**

2. **Intermediate input stage**
   - Browser automatically updates DOM
   - `MutationObserver` detects changes but ignores or defers if composition is active

3. **Input completion**
   - Browser reflects final text to DOM
   - `MutationObserver` detects final text change
   - Model update (`dataStore.range.replaceText`)

### 7.3 Advantages
- Minimize Hangul input corruption by leveraging browser's default IME handling
- No need for complex state management of composition events
- No need to worry about browser differences

---

## 8. Selection Synchronization
- Convert DOM Selection → Model Selection in `selectionchange` event (reuse `DOMSelectionHandlerImpl`).
- Call `editor.selectionManager.setSelection(modelSelection)` then `editor.emit('editor:selection.change', { selection })`.
- Must keep SelectionManager state up-to-date even before beforeinput/keydown processing to edit accurate ranges.

---

## 9. MutationObserver Role (Primary Processing Layer)
- **Main purpose**: Detect DOM changes made automatically by browser and update model
- **Handle most text input/deletion here**
- **Detect final text changes after IME input completes**
- Skip structural changes (`insertParagraph`, `insertLineBreak`) as they are already handled in `beforeinput`

### 9.1 Processing Logic
```ts
function handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node) {
  // Skip structural changes as they are already handled in beforeinput
  if (isStructuralChange(target)) {
    return;
  }
  
  // Ignore DOM changes during rendering (prevent infinite loop)
  if (editor.isRendering) {
    return;
  }
  
  // Reflect DOM changes made automatically by browser to model
  const textNodeId = resolveModelTextNodeId(target);
  if (textNodeId) {
    // Reflect DOM changes to model
    updateModelFromDOMChange(textNodeId, oldValue, newValue);
    
    // Emit event with skipRender: true (prevent infinite loop)
    editor.emit('editor:content.change', {
      skipRender: true,
      from: 'MutationObserver',
      content: editor.document
    });
  }
}
```

---

## 10. Data Manipulation API
- **Text editing**: `dataStore.range.replaceText(contentRange, newText)`  
  - marks/decorators automatically adjusted.
- **Node deletion/insertion**: Use `dataStore.deleteNode`, `dataStore.insertNode`, `transactionManager`.
- **Mark toggle**: `editor.chain().toggleMark('bold')` or directly `dataStore.marks.toggleMark`.
- **Block split**: Implement `splitBlock(selection)` (split current cursor block and insert new node).

---

## 11. Suggested Implementation Order
1. **Event handler scaffolding**  
   - Add `beforeinput-handler.ts`, `keydown-handler.ts` to `packages/editor-view-dom/src/event-handlers`.
   - **Do not create `composition-handler.ts`** (composition events not used).

2. **Selection helper**  
   - Reuse DOM selection → Model selection conversion utility (`selection-handler.ts`).
   - Always ensure latest selection inside handleBeforeInput.

3. **Implement beforeinput handler map**  
   - Start with `insertText` to establish basic text editing behavior.
   - Handle `insertCompositionText` same as `insertText` (browser handles automatically).

4. **Enter/Shift+Enter/Backspace**  
   - Handle special cases: Enter (paragraph split), soft break, Backspace.

5. **Paste/drop**  
   - Parse clipboard data, handle drop data.

6. **Strengthen MutationObserver safety net**  
   - Add logic to distinguish changes handled in beforeinput.
   - Improve logic to detect final text changes after IME input completes.

7. **Shortcuts/commands**  
   - Handle keydown for Bold/Italic/Tabs, etc., and link with command system.

8. **Testing**  
   - Unit tests based on beforeinput (Vitest + jsdom)  
   - Integration tests: User scenarios (Enter, Backspace, paste, **Hangul input**).

---

## 12. KeyBinding System Implementation Considerations

### 12.1 KeyBinding Registration API

```ts
interface KeyBindingManager {
  // Register KeyBinding
  registerBinding(binding: KeyBinding): () => void; // Returns unregister function
  
  // Connect command to shortcut (convenience method)
  bindCommand(key: string, command: string, payload?: any): void;
  
  // Query registered bindings
  getBindings(key?: string): KeyBinding[];
  
  // Maintain existing KeymapManager API (backward compatibility)
  register(key: string, handler: () => void): void;
  getHandler(key: string): (() => void) | undefined;
  remove(key: string): void;
  clear(): void;
}
```

### 12.2 Hook Priority

- Lower `priority` values execute first
- Default action is considered `priority: 1000`
- External hooks recommended: `priority: 100` (before default) or `priority: 2000` (after default)

### 12.3 Relationship Between Hooks and Default Action

- If `before` hook returns `true`, skip default action (but `handler` or `command` can still execute)
- If `before` hook returns `false` or `undefined`, perform default action
- `after` hook always executes (regardless of default action success)

### 12.4 External Shortcut Interception Scenarios

**Scenario 1: Custom Bold Action**
```ts
keyBindingManager.registerBinding({
  key: 'Ctrl+B',
  handler: () => {
    performCustomBoldAction(editor);
  },
  before: (event, context) => {
    if (context.selection.isCollapsed && shouldUseCustomBold(context)) {
      event.preventDefault();
      return true; // Execute handler, skip default action
    }
  }
});
```

**Scenario 2: Enter Key Customization**
```ts
keyBindingManager.registerBinding({
  key: 'Enter',
  handler: () => {
    if (isInCodeBlock(editor)) {
      insertCodeBlockLineBreak(editor);
    } else {
      editor.executeCommand('insertParagraph');
    }
  },
  before: (event, context) => {
    if (isInCodeBlock(context)) {
      event.preventDefault();
      return true; // Execute handler, skip default action
    }
  }
});
```

**Scenario 3: Logging and Analytics (Use Command as-is)**
```ts
keyBindingManager.registerBinding({
  key: 'Ctrl+Z',
  command: 'history.undo', // Use existing command
  after: (event, context, result) => {
    analytics.track('undo_performed', {
      success: result,
      timestamp: Date.now()
    });
  },
  priority: 2000 // Execute after command execution
});
```

---

## 13. Key Input Processing Details

### 13.1 Key String Parsing (`getKeyString`)

**Implementation**:

```ts
function getKeyString(event: KeyboardEvent): string {
  const modifiers = [];
  
  // Modifier key order: Ctrl, Cmd, Alt, Shift
  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.metaKey) modifiers.push('Cmd'); // macOS Command key
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');
  
  // Normalize key name
  const key = normalizeKeyName(event.key);
  
  return modifiers.length > 0 
    ? [...modifiers, key].join('+')
    : key;
}

function normalizeKeyName(key: string): string {
  // Key name normalization rules
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    // Add as needed
  };
  
  return keyMap[key] || key;
}
```

**Key String Format Rules**:
- Modifier order: Sort in order `Ctrl`, `Cmd`, `Alt`, `Shift`
- Key name: Start with uppercase (e.g., `B`, `Enter`, `Space`)
- Separator: Use `+` (e.g., `Ctrl+B`, `Shift+Enter`)
- Single key: Key name only if no modifier (e.g., `Enter`, `Backspace`)

**Examples**:
```ts
// Ctrl+B → 'Ctrl+B'
// Cmd+B → 'Cmd+B'
// Shift+Enter → 'Shift+Enter'
// Enter → 'Enter'
// Space → 'Space'
```

### 13.2 Platform-specific Key Mapping

**Modifier Key Mapping**:

| Platform | Ctrl | Meta/Cmd | Alt | Shift |
|----------|------|----------|-----|-------|
| Windows/Linux | `Ctrl` | `Cmd` (some browsers) | `Alt` | `Shift` |
| macOS | `Ctrl` | `Cmd` | `Option` (Alt) | `Shift` |

**Notes**:
- `metaKey` means Command key on macOS
- `metaKey` is generally `false` on Windows/Linux
- Detect platform via `navigator.platform` or `navigator.userAgent`

**Platform Detection Example**:
```ts
function isMac(): boolean {
  return navigator.platform.toUpperCase().includes('MAC') ||
         navigator.userAgent.toUpperCase().includes('MAC');
}

// Usage
const modKey = isMac() ? 'Cmd' : 'Ctrl';
```

### 13.3 Key Event Filtering

**Key events that should not be processed**:

1. **Text input keys during composition**:
   ```ts
   if (event.isComposing && isTextInputKey(event.key)) {
     return; // Let browser handle automatically
   }
   ```

2. **Editor external focus**:
   ```ts
   if (!editor.isFocused()) {
     return; // Ignore if editor is not focused
   }
   ```

3. **System shortcuts**:
   ```ts
   // Some system shortcuts are handled by browser
   // e.g., Cmd+Q (macOS quit), Ctrl+W (close window)
   // Cannot be blocked with preventDefault()
   ```
```

**Text Input Key Detection**:
```ts
function isTextInputKey(key: string): boolean {
  // Keys with length 1 are generally text input
  if (key.length === 1) return true;
  
  // Special keys are not text input
  const specialKeys = ['Enter', 'Backspace', 'Delete', 'Tab', 'Escape', 
                       'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  return !specialKeys.includes(key);
}
```

### 13.4 Key Binding Registration Rules

**Duplicate Registration Handling**:
- Can register multiple `KeyBinding`s with same `key`
- Execution order determined by `priority`
- Only first executed `command`/`handler` runs (rest skipped)

**Key String Case**:
- Key names normalized to uppercase (e.g., `B`, `Enter`)
- Modifiers only first letter uppercase (e.g., `Ctrl`, `Cmd`, `Shift`)
- Case-insensitive on registration (normalized internally)

**Invalid Key String Handling**:
```ts
// Invalid format examples
'ctrl+b'  // lowercase → normalized to 'Ctrl+B'
'Ctrl + B' // contains space → remove space to 'Ctrl+B'
'B+Ctrl'  // wrong order → normalized to 'Ctrl+B'
```

### 13.5 Relationship Between beforeinput and keydown

**Processing Order**:

```
User input
  ↓
beforeinput event occurs
  ├─ Structural changes (insertParagraph, insertLineBreak) → handle after preventDefault()
  ├─ History (historyUndo, historyRedo) → handle after preventDefault()
  └─ Rest → do not preventDefault()
  ↓
keydown event occurs
  ├─ If preventDefault() in beforeinput → only execute KeyBinding (do not execute Command)
  └─ If preventDefault() not called → execute KeyBinding (execute Command)
```

**Notes**:
- If `preventDefault()` in `beforeinput`, default action is also blocked in `keydown`
- If `preventDefault()` in `keydown`, `beforeinput`'s default action has already executed
- Structural changes handled in `beforeinput`, shortcuts handled in `keydown`

### 13.6 Error Handling

**Exception Cases**:

1. **Non-existent Command**:
   ```ts
   keyBindingManager.bindCommand('Ctrl+B', 'nonexistent.command');
   // Error occurs on executeCommand → log error and ignore
   ```

2. **Invalid key string**:
   ```ts
   keyBindingManager.bindCommand('Invalid+Key', 'bold.toggle');
   // Attempt normalization then register, ignore on matching failure
   ```

3. **Duplicate registration**:
   ```ts
   // Can register multiple times with same key
   // Execution order determined by priority
   ```

## 14. Future Considerations
- undo/redo: Decide whether to disable OS default undo and use only editor history.
- inputType coverage: Fallback for browser differences (especially Safari).
- Accessibility: Verify screen reader compatibility when selection changes.
- KeyBinding system: Implement and test KeyBinding system.
- IME input stability: Continuously monitor whether MutationObserver accurately detects IME input completion.
- Key binding conflict resolution: Notify user when multiple bindings registered for same key.
- Key binding customization UI: Provide UI for users to change shortcuts.

---

## 15. Core Summary

### Events Used
- ✅ `beforeinput`: **Only handle structural changes** (`insertParagraph`, `insertLineBreak`)
- ✅ `keydown`: Handle shortcuts and special keys (fallback)
- ✅ `selectionchange`: Selection synchronization
- ✅ `MutationObserver`: **Primary processing layer** (handles most text input/deletion)

### Events Not Used
- ❌ `input`: Not used
- ❌ `compositionstart/update/end`: Not used (browser handles automatically)

### Processing Strategy
1. **General text input/deletion**: 
   - Do not call `preventDefault()` in `beforeinput`
   - Browser automatically changes DOM
   - `MutationObserver` detects DOM changes → model update

2. **Structural changes (`insertParagraph`, `insertLineBreak`)**:
   - Call `preventDefault()` in `beforeinput`
   - Change model first → render → update selection

3. **IME input processing**:
   - Let browser automatically handle IME input
   - MutationObserver detects final result and updates model
   - **Core strategy to minimize Hangul input corruption**

---

By implementing the event layer and editing features step by step based on this plan, we can establish stable synchronization between browser input and model editing, and especially ensure stability of Hangul input.

