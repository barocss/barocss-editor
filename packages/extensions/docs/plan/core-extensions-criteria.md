# Core Extensions Criteria

## ProseMirror `baseKeymap` review

### What ProseMirror `baseKeymap` includes

ProseMirror’s `@prosemirror/example-setup` `baseKeymap` has these shortcuts:

1. **Enter** → `splitBlock` (split block, create new paragraph)
2. **Backspace** → `deleteSelection` or `joinBackward` (delete selection or merge with previous block)
3. **Delete** → `deleteSelection` or `joinForward` (delete selection or merge with next block)
4. **Mod+b** → `toggleMark('strong')` (bold toggle)
5. **Mod+i** → `toggleMark('em')` (italic toggle)
6. **Mod+z** → `undo`
7. **Mod+y** / **Mod+Shift+z** → `redo`

**Important**: `baseKeymap` does **not** include text input (`insertText`).
- Text input uses the browser’s default behavior
- ProseMirror handles it via `beforeinput` / `input` events

---

## Our editor’s current structure

### What `createCoreExtensions()` currently includes

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete
    new DeleteExtension(),    // delete command (Backspace, Delete keys)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### Roles of each Extension

#### 1) TextExtension
- `insertText`: insert text
- `deleteText`: delete text range
- `deleteSelection`: delete selected text
- `backspace`: handle Backspace
- `delete`: handle Delete

#### 2) DeleteExtension
- `delete`: transaction-based delete command
- Cross-node delete support
- Delete whole inline nodes

#### 3) ParagraphExtension
- `insertParagraph`: insert new paragraph
- `setParagraph`: set current selection to paragraph

---

## Criteria for Core Extensions

### ✅ Should be in Core

#### 1) Basic text editing
- Reason: mandatory for any editor
- Functions:
  - Text input (`insertText`)
  - Text delete (`deleteText`, `deleteSelection`)
  - Backspace/Delete handling

#### 2) Basic structural editing
- Reason: fundamental document structure
- Functions:
  - Paragraph creation (`insertParagraph`)
  - Enter key handling (new paragraph)

#### 3) Basic delete capability
- Reason: deletion is mandatory
- Functions:
  - Range delete (transaction-based)
  - Cross-node delete
  - Whole-node delete

---

### ❌ Should not be in Core

#### 1) Formatting (Bold, Italic, etc.)
- Reason: optional
- Location: `createBasicExtensions()` or individual extensions

#### 2) Advanced structural features (Heading, List, etc.)
- Reason: optional
- Location: `createBasicExtensions()` or individual extensions

#### 3) History (Undo/Redo)
- Reason: handled automatically by TransactionManager
- Location: built into Core (no extension needed)

---

## Comparison with ProseMirror

### ProseMirror structure

```
@prosemirror/example-setup
  └── baseKeymap
      ├── Enter → splitBlock
      ├── Backspace → deleteSelection / joinBackward
      ├── Delete → deleteSelection / joinForward
      ├── Mod+b → toggleMark('strong')
      ├── Mod+i → toggleMark('em')
      ├── Mod+z → undo
      └── Mod+y → redo
```

**Characteristics**:
- Text input uses browser defaults
- `baseKeymap` only provides keyboard shortcuts
- Actual commands come from `@prosemirror/commands`

---

### Our editor structure

```
@barocss/extensions
  └── createCoreExtensions()
      ├── TextExtension → insertText, deleteText, backspace, delete
      ├── DeleteExtension → delete command (transaction-based)
      └── ParagraphExtension → insertParagraph, setParagraph
```

**Differences**:
- We provide text input via an Extension (no reliance on browser defaults)
- We provide transaction-based delete via a dedicated Extension
- History is handled automatically by TransactionManager (no extension needed)

---

## Recommended criteria

### ✅ Include in Core Extensions

1. **TextExtension** ✅
   - `insertText`: text input (required)
   - `deleteText`: text delete (required)
   - `backspace`, `delete`: keyboard shortcuts (required)

2. **DeleteExtension** ✅
   - `delete`: transaction-based delete (required)
   - Cross-node delete support (required)

3. **ParagraphExtension** ✅
   - `insertParagraph`: Enter handling (required)
   - `setParagraph`: set paragraph (optional but foundational)

---

### ❓ Points to consider

#### 1) Overlap between TextExtension and DeleteExtension?

**Current state**:
- `TextExtension`: provides `backspace`, `delete` commands
- `DeleteExtension`: provides `delete` (transaction-based)

**Issue**:
- Both provide a `delete` command
- Possible duplication

**Resolution**:
- `TextExtension` `backspace`/`delete` handle **keyboard event translation only**
- `DeleteExtension` `delete` performs **transaction-based data change**
- Clear split: TextExtension = key event handling; DeleteExtension = data mutation

#### 2) Is ParagraphExtension needed in Core?

**ProseMirror**: `splitBlock` is in `baseKeymap`

**Our editor**: `insertParagraph` is in Core

**Conclusion**: ✅ Keep it (Enter handling is essential)

---

## Final recommendations

### ✅ Core Extensions (mandatory)

```typescript
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),      // insertText, deleteText, backspace, delete (keyboard event handling)
    new DeleteExtension(),    // delete command (transaction-based)
    new ParagraphExtension()  // insertParagraph, setParagraph
  ];
}
```

### ✅ Basic Extensions (optional)

```typescript
export function createBasicExtensions(): Extension[] {
  return [
    new BoldExtension(),     // toggleBold
    new ItalicExtension(),   // toggleItalic
    new HeadingExtension()   // setHeading
  ];
}
```

---

## Criteria summary

### Core Extensions belong when

1. **Mandatory for any editor**
   - Text input/delete
   - Basic structure editing (paragraph)

2. **Cannot be left to browser defaults**
   - Transaction-based deletion
   - Structural changes (paragraph creation)

3. **Standardized keyboard shortcuts**
   - Enter (new paragraph)
   - Backspace/Delete (delete)

### Basic Extensions belong when

1. **Common but not mandatory**
   - Bold, Italic
   - Heading

2. **Removable by users if desired**
