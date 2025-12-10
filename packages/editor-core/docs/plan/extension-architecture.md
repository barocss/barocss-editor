# Extension Architecture Design

## Current Structure

Currently Extensions are defined in `packages/editor-core/src/extensions/`:

```
packages/editor-core/
  src/
    extensions/
      - text.ts          (TextExtension)
      - delete.ts        (DeleteExtension)
      - paragraph.ts     (ParagraphExtension)
      - bold.ts          (BoldExtension)
      - italic.ts        (ItalicExtension)
      - heading.ts       (HeadingExtension)
```

---

## Problems

### 1. **editor-core's Responsibility Scope**
- `editor-core` should provide **core functionality** only
  - Document management
  - Selection management
  - Command system
  - Extension system (interface)
- **Specific Extension implementations** are not editor-core's responsibility

### 2. **Dependency Problems**
- Extensions directly import `@barocss/model`
- Extensions directly use editor-core internal types
- editor-core becomes dependent on specific features (Bold, Italic, etc.)

### 3. **Extensibility Problems**
- Must modify editor-core package every time new Extension is added
- Users must reference editor-core when creating custom Extensions

---

## Patterns from Other Editors

### ProseMirror
```
@prosemirror/core          → Minimal core functionality
@prosemirror/state         → Document/Selection management
@prosemirror/commands      → Basic Commands
@prosemirror/schema-basic  → Basic Schema + Extensions
@prosemirror/schema-list   → List Extension
@prosemirror/markdown      → Markdown Extension
```

**Characteristics**:
- Core provides minimum functionality only
- Extensions separated as separate packages
- Users selectively install only needed Extensions

### Tiptap
```
@tiptap/core               → Core functionality
@tiptap/extension-bold     → Bold Extension
@tiptap/extension-italic    → Italic Extension
@tiptap/extension-heading   → Heading Extension
```

**Characteristics**:
- Each Extension is independent package
- Users install only needed Extensions
- Tree-shaking optimization possible

### Slate.js
```
slate                      → Core
slate-history              → History Extension
slate-react                → React Extension
```

**Characteristics**:
- Core is minimum
- Extensions are separate packages

---

## Recommended Architecture

### Option 1: Separate Extensions into Separate Package ✅ (Recommended)

**Structure**:
```
packages/
  editor-core/              → Core functionality only
    src/
      types.ts              → Define Extension interface
      editor.ts             → Editor class
      index.ts              → Export Extension interface
  
  editor-extensions/        → Basic Extensions
    src/
      core/                 → Required Extensions
        - text.ts
        - delete.ts
        - paragraph.ts
      basic/                → Basic Extensions
        - bold.ts
        - italic.ts
        - heading.ts
      index.ts              → createCoreExtensions, createBasicExtensions
```

**Advantages**:
- ✅ editor-core provides only core functionality
- ✅ Extensions managed independently
- ✅ Users selectively install only needed Extensions
- ✅ Tree-shaking optimization possible
- ✅ Consistent pattern with other editors

**Disadvantages**:
- ⚠️ One more package added
- ⚠️ Initial setup becomes slightly more complex

---

### Option 2: Keep Only Core Extensions in editor-core

**Structure**:
```
packages/
  editor-core/
    src/
      extensions/
        core/               → Required Extensions only
          - text.ts
          - delete.ts
          - paragraph.ts
  
  editor-extensions/        → Optional Extensions
    src/
      - bold.ts
      - italic.ts
      - heading.ts
```

**Advantages**:
- ✅ Required Extensions included in editor-core (convenience)
- ✅ Optional Extensions in separate package (flexibility)

**Disadvantages**:
- ⚠️ Should Core Extensions be in editor-core? (question)
- ⚠️ Lack of consistency (some in editor-core, some in separate package)

---

### Option 3: Maintain Current Structure (Not Recommended)

**Structure**:
```
packages/
  editor-core/
    src/
      extensions/           → All Extensions
```

**Advantages**:
- ✅ Simple structure
- ✅ All Extensions in one place

**Disadvantages**:
- ❌ editor-core depends on specific features
- ❌ Limited extensibility
- ❌ Different pattern from other editors
- ❌ Difficult tree-shaking optimization

---

## Recommendations

### ✅ Option 1: Separate Extensions into Separate Package

**Reasons**:
1. **Separation of concerns**: editor-core provides only core functionality, Extensions managed separately
2. **Extensibility**: No need to modify editor-core when adding new Extensions
3. **Consistency**: Same pattern as other editors (ProseMirror, Tiptap)
4. **Optimization**: Users install only needed Extensions (Tree-shaking)

**Implementation Plan**:

1. **Create new package**: `packages/editor-extensions/`
   ```json
   {
     "name": "@barocss/extensions",
     "version": "0.1.0",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts",
     "dependencies": {
       "@barocss/editor-core": "workspace:*",
       "@barocss/model": "workspace:*"
     }
   }
   ```

2. **Move Extensions**:
   ```
   packages/editor-core/src/extensions/
     → packages/editor-extensions/src/
   ```

3. **Modify editor-core**:
   - Remove Extension implementations
   - Export only Extension interface
   - Remove `createCoreExtensions` (move to editor-extensions)

4. **Usage example**:
   ```typescript
   import { Editor } from '@barocss/editor-core';
   import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';
   
   const editor = new Editor({
     extensions: createBasicExtensions()
   });
   ```

---

## Location of Core Extensions

### Question: Should Core Extensions also be in editor-core?

**Answer**: No, separate package is better

**Reasons**:
1. **Consistency**: Manage all Extensions equally
2. **Flexibility**: Core Extensions can also be optionally removed
3. **Clarity**: editor-core only provides interface

**Alternative**: Provide `createCoreExtensions()` from editor-extensions and automatically call in Editor constructor

```typescript
// packages/editor-extensions/src/index.ts
export function createCoreExtensions(): Extension[] {
  return [
    new TextExtension(),
    new DeleteExtension(),
    new ParagraphExtension()
  ];
}

// packages/editor-core/src/editor.ts
import { createCoreExtensions } from '@barocss/extensions';

constructor(options: EditorOptions = {}) {
  // Automatically register Core Extensions
  const coreExtensions = createCoreExtensions();
  coreExtensions.forEach(ext => this.use(ext));
  
  // Add user Extensions
  if (options.extensions) {
    options.extensions.forEach(ext => this.use(ext));
  }
}
```

**Note**: In this case, editor-core depends on editor-extensions (circular dependency possible)

**Solution**: Don't auto-register in Editor constructor, users explicitly register

```typescript
// Users explicitly register
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // Required
    ...createBasicExtensions()  // Optional
  ]
});
```

Or provide convenience function:

```typescript
// packages/editor-extensions/src/index.ts
export function createEditorWithDefaults(options?: EditorOptions) {
  const editor = new Editor(options);
  
  // Automatically register Core Extensions
  const coreExtensions = createCoreExtensions();
  coreExtensions.forEach(ext => editor.use(ext));
  
  // Add user Extensions
  if (options?.extensions) {
    options.extensions.forEach(ext => editor.use(ext));
  }
  
  return editor;
}
```

---

## Conclusion

### ✅ Recommend Separating Extensions into Separate Package

**Structure**:
```
packages/
  editor-core/              → Core functionality + Extension interface
  editor-extensions/        → All Extension implementations
```

**Usage**:
```typescript
import { Editor } from '@barocss/editor-core';
import { createCoreExtensions, createBasicExtensions } from '@barocss/extensions';

const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // Required
    ...createBasicExtensions()  // Optional
  ]
});
```

Or convenience function:

```typescript
import { createEditorWithDefaults } from '@barocss/extensions';

const editor = createEditorWithDefaults({
  extensions: createBasicExtensions()
});
```
