# Comparison of Default Feature Management Methods in Other Editors

## Approaches of Major Editors

### 1. **ProseMirror**

**Structure**:
```
@prosemirror/core          → Minimal core functionality (EditorState, Transaction)
@prosemirror/commands      → Basic Commands (insertText, delete, etc.)
@prosemirror/schema-basic  → Basic Schema + Extensions
```

**Characteristics**:
- ✅ Core provides **minimum only** (EditorState, Transaction)
- ✅ **Basic Commands are separate package** (`@prosemirror/commands`)
- ✅ Users explicitly import and use
- ❌ Core does not include basic commands

**Usage example**:
```typescript
import { EditorState } from '@prosemirror/state';
import { EditorView } from '@prosemirror/view';
import { Schema, DOMParser } from '@prosemirror/model';
import { schema } from '@prosemirror/schema-basic';
import { keymap } from '@prosemirror/keymap';
import { baseKeymap } from '@prosemirror/example-setup';

// Explicitly add basic features to plugins array
const view = new EditorView(document.body, {
  state: EditorState.create({
    doc: DOMParser.fromSchema(schema).parse(document.body),
    plugins: [
      keymap(baseKeymap), // Basic keyboard shortcuts (Enter, Backspace, etc.)
      // ... other plugins
    ]
  })
});
```

**Core**:
- ProseMirror **provides basic editing features externally**
- `baseKeymap` provides basic behaviors like Enter, Backspace
- Users must **explicitly add** to `plugins` array

---

### 2. **Slate.js**

**Structure**:
```
slate                      → Core (Editor, Transforms)
slate-history              → History Extension
```

**Characteristics**:
- ✅ Core **includes basic Transform functions**
  - `Transforms.insertText()`
  - `Transforms.delete()`
  - `Transforms.insertNodes()`
- ✅ Basic editing features are **built into core**
- ✅ Users can use without separate imports

**Usage example**:
```typescript
import { Editor, Transforms } from 'slate';

// Basic Transforms are included in core
Transforms.insertText(editor, 'Hello');
Transforms.delete(editor, { at: [0] });
```

---

### 3. **Tiptap**

**Structure**:
```
@tiptap/core               → Core functionality (Editor, Extension system)
@tiptap/extension-bold      → Bold Extension
@tiptap/extension-italic    → Italic Extension
@tiptap/starter-kit         → Basic Extension set
```

**Characteristics**:
- ✅ Core provides **minimum only** (Editor, Extension system)
- ✅ **All features provided as Extensions**
- ✅ `@tiptap/starter-kit` includes basic Extensions
- ❌ Core does not include basic commands

**Usage example**:
```typescript
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

const editor = new Editor({
  extensions: [StarterKit], // Includes basic features
});
```

---

### 4. **Lexical**

**Structure**:
```
lexical                    → Core (Editor, Node, Commands)
@lexical/rich-text         → Rich Text Extension
@lexical/plain-text        → Plain Text Extension
```

**Characteristics**:
- ✅ Core **includes basic Commands**
  - `$insertText()`
  - `$deleteSelection()`
  - `$getSelection()`
- ✅ Basic editing features are **built into core**
- ✅ Users can use without separate imports

**Usage example**:
```typescript
import { $insertText, $deleteSelection } from 'lexical';

// Basic commands are included in core
$insertText('Hello');
$deleteSelection();
```

---

## Comparison Summary

| Editor | Basic Features in Core? | How Basic Features Provided |
|--------|------------------------|---------------------------|
| **ProseMirror** | ❌ | Separate package (`@prosemirror/commands`) |
| **Slate.js** | ✅ | Core includes `Transforms` |
| **Tiptap** | ❌ | Provided as Extension (`@tiptap/starter-kit`) |
| **Lexical** | ✅ | Core includes Command functions |

---

## Pattern Analysis

### Pattern 1: Include Basic Features in Core (Slate.js, Lexical)
**Advantages**:
- ✅ Users can use immediately
- ✅ No separate package installation needed
- ✅ Simple usage

**Disadvantages**:
- ⚠️ Core package size increase
- ⚠️ Difficult tree-shaking
- ⚠️ Cannot remove basic features

### Pattern 2: Provide as Separate Package (ProseMirror, Tiptap)
**Advantages**:
- ✅ Core package lightweight
- ✅ Tree-shaking optimization possible
- ✅ Users can selectively install

**Disadvantages**:
- ⚠️ Users must explicitly import
- ⚠️ Possibility of missing basic features
- ⚠️ Complex initial setup

---

## Recommendations for Our Editor

### Current Situation
- `editor-core`: Only provides Extension system
- `@barocss/extensions`: Provides basic Extensions
- Users must explicitly call `createCoreExtensions()`

### Recommended Approach

#### Option A: Include Basic Features in Core (Slate.js/Lexical Approach) ✅ **Recommended**

**Reasons**:
1. **User experience**: Basic editing features (insertText, delete) are **always needed**
2. **Consistency**: Other editors also include basic features in core
3. **Convenience**: Users can use immediately without separate setup

**Implementation**:
```typescript
// packages/editor-core/src/editor.ts
constructor(options: EditorOptions = {}) {
  // ...
  
  // Automatically register basic Extensions (always included)
  // TextExtension, DeleteExtension, ParagraphExtension
  this._registerCoreExtensions();
  
  // Add user Extensions
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}

private _registerCoreExtensions() {
  // Implement Core Extensions directly in editor-core
  // Or use @barocss/extensions as optional dependency
}
```

**Notes**:
- `editor-core` will depend on `@barocss/extensions`
- Need to prevent circular dependencies

#### Option B: Maintain Current Approach (ProseMirror/Tiptap Approach)

**Reasons**:
1. **Lightweight**: Minimize core package size
2. **Flexibility**: Users can select only needed Extensions
3. **Dependency separation**: Core does not depend on Extension implementation

**Current implementation**:
```typescript
// Users explicitly register
const editor = new Editor({
  coreExtensions: createCoreExtensions(),
  extensions: createBasicExtensions()
});
```

---

## Conclusion

### ✅ **Recommend: Option A (Include Basic Features in Core)**

**Reasons**:
1. **Basic editing features are essential**: `insertText`, `delete` are needed in all editors
2. **User experience**: Can use immediately without separate setup
3. **Consistency**: Similar pattern to Slate.js, Lexical

**Implementation method**:
- Implement basic Extensions inside `editor-core`
- Or use `@barocss/extensions` as **optional dependency**
- Auto-register in Editor constructor

**Alternative**:
- Maintain current approach but **provide convenience function**:
  ```typescript
  // @barocss/extensions
  export function createEditorWithDefaults(options?: EditorOptions) {
    const editor = new Editor(options);
    createCoreExtensions().forEach(ext => editor.use(ext));
    return editor;
  }
  ```
