# Core Extensions Decision Guide

## ProseMirror `baseKeymap` review

### Keys included in ProseMirror `baseKeymap`

ProseMirror’s `@prosemirror/example-setup` `baseKeymap`:

```typescript
{
  "Enter": splitBlock,                    // split block (new paragraph)
  "Backspace": deleteSelection | joinBackward, // delete selection or merge with previous block
  "Delete": deleteSelection | joinForward,    // delete selection or merge with next block
  "Mod+b": toggleMark('strong'),         // Bold
  "Mod+i": toggleMark('em'),             // Italic
  "Mod+z": undo,                         // Undo
  "Mod+y": redo,                         // Redo (or Mod+Shift+z)
}
```

**Key findings**:
- ✅ **Enter, Backspace, Delete**: core editing
- ✅ **Undo/Redo**: history
- ❌ **Bold, Italic**: formatting (optional)
- ❌ **Text input**: not in `baseKeymap` (uses browser default)

---

## Our editor’s current structure

### Current `createCoreExtensions()`

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete
    new DeleteExtension(),    // delete command (transaction-based)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### Issue spotted

#### 1) Duplicate `delete` command

**TextExtension**:
- `backspace` command
- `delete` command (keyboard event handling)

**DeleteExtension**:
- `delete` command (transaction-based)

**Problem**: both provide `delete` → potential conflict

---

## Core Extensions criteria

### ✅ Should be in Core

#### 1) Basic text editing (mandatory for any editor)
- `insertText`: text input
- `deleteText`: text deletion
- **Keyboard events**: Backspace, Delete (shortcut mapping)

#### 2) Basic structural editing (document structure basics)
- `insertParagraph`: Enter handling
- `setParagraph`: set paragraph

#### 3) Transaction-based deletion (data mutation must-have)
- `delete`: transaction-based delete command
- Cross-node delete support
- Whole-node delete support

---

### ❌ Should not be in Core

#### 1) Formatting (optional)
- Bold, Italic
- Heading
- Other marks/styles

#### 2) History (automatic)
- Undo/Redo handled by TransactionManager
- No extension needed

---

## Recommended structures

### Option 1: Keep current split (recommended) ✅

**TextExtension**:
- Role: **keyboard event handling** + **basic text editing**
- Commands: `insertText`, `deleteText`, `backspace`, `delete` (keyboard handling)
- Behavior: receive keyboard events and dispatch appropriate commands

**DeleteExtension**:
- Role: **transaction-based deletion** (actual data change)
- Command: `delete` (transaction-based)
- Behavior: handle `editor.executeCommand('delete')` and run the transaction

**Pros**:
- Clear separation of concerns
- TextExtension handles keyboard events only
- DeleteExtension handles data changes only

**Caution**:
- `TextExtension`’s `delete` is for keyboard event translation
- `DeleteExtension`’s `delete` mutates data
- Avoid name collisions (e.g., use `deleteKey` vs `delete` if needed)

---

### Option 2: Merge (TextExtension owns everything)

**TextExtension**:
- `insertText`
- `deleteText`
- `backspace` (keyboard event → transaction)
- `delete` (keyboard event → transaction)
- `deleteSelection` (transaction-based)

**DeleteExtension removed**

**Pros**:
- Simpler structure
- Removes duplication

**Cons**:
- TextExtension carries too many responsibilities
- Harder to keep concerns separated

---

## Comparison with ProseMirror

### ProseMirror structure

```
@prosemirror/example-setup
  └── baseKeymap
      ├── Enter → splitBlock
      ├── Backspace → deleteSelection / joinBackward
      ├── Delete → deleteSelection / joinForward
      ├── Mod+b → toggleMark('strong')  ← formatting included
      ├── Mod+i → toggleMark('em')      ← formatting included
      ├── Mod+z → undo
      └── Mod+y → redo
```

**Notes**:
- `baseKeymap` includes Bold/Italic, but that’s “example-setup” (optional)
- Users pick only what they need

---

### Recommended structure for our editor

```
createCoreExtensions()
  ├── TextExtension
  │   ├── insertText
  │   ├── deleteText
  │   ├── backspace (keyboard event)
  │   └── delete (keyboard event)
  ├── DeleteExtension
  │   └── delete (transaction-based)
  └── ParagraphExtension
      ├── insertParagraph
      └── setParagraph
```

---

## Final recommendations

### ✅ Core Extensions (mandatory)

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete (keyboard)
    new DeleteExtension(),    // delete (transaction-based)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### ✅ Clarify separation of roles

**TextExtension**:
- Keyboard event handling (`backspace`, `delete` keys)
- Basic text editing (`insertText`, `deleteText`)
- Receives keyboard events and calls DeleteExtension’s `delete` command

**DeleteExtension**:
- Transaction-based deletion (`delete` command)
- Cross-node deletion
- Whole-node deletion

**ParagraphExtension**:
- Enter handling (`insertParagraph`)
- Set paragraph (`setParagraph`)

---

## Decision criteria summary

### Core Extensions belong when

1. **Mandatory for any editor**
   - ✅ Text input/delete
   - ✅ Basic structural edits (paragraph)

2. **Cannot rely on browser defaults**
   - ✅ Transaction-based deletion
   - ✅ Structural changes (paragraph creation)

3. **Standard keyboard shortcuts**
   - ✅ Enter (new paragraph)
   - ✅ Backspace/Delete (delete)

### Basic Extensions belong when

1. **Common but not mandatory**
   - Bold, Italic
   - Heading

2. **Can be removed optionally by users**
