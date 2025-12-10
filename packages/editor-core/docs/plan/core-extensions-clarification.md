# Core Extensions Concept Clarification

## Current Problems

### 1. **Ambiguous Concept**
- Distinction between `coreExtensions` and `extensions` is unclear
- What "Core" means is ambiguous
- Whether required or optional is unclear

### 2. **Current Structure**
```typescript
interface EditorOptions {
  coreExtensions?: Extension[]; // Basic editing features?
  extensions?: Extension[];     // Additional features?
}
```

**Problems**:
- Both are optional, so Editor can be created
- But actually cannot edit without basic editing features
- Users may be confused

---

## ProseMirror Approach (Reference)

```typescript
// ProseMirror uses only plugins array
const view = new EditorView(document.body, {
  state: EditorState.create({
    plugins: [
      keymap(baseKeymap),  // Basic features
      // ... other plugins
    ]
  })
});
```

**Characteristics**:
- ✅ Simple structure: Only one `plugins` array
- ✅ Clear: All plugins treated equally
- ✅ No distinction: No "core" vs "extension" distinction

---

## Improvement Options

### Option 1: Remove `coreExtensions`, Unify with `extensions` ✅ **Recommended**

**Structure**:
```typescript
interface EditorOptions {
  extensions?: Extension[]; // All Extensions (no distinction)
}
```

**Usage**:
```typescript
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // Basic editing features
    ...createBasicExtensions()  // Additional features
  ]
});
```

**Advantages**:
- ✅ Simple and clear
- ✅ Similar structure to ProseMirror
- ✅ Treat all Extensions equally without distinction
- ✅ Users can select only needed Extensions

**Disadvantages**:
- ⚠️ Users must call `createCoreExtensions()` (but this is intended behavior)

---

### Option 2: Make `coreExtensions` Required

**Structure**:
```typescript
interface EditorOptions {
  coreExtensions: Extension[]; // Required
  extensions?: Extension[];    // Optional
}
```

**Usage**:
```typescript
const editor = new Editor({
  coreExtensions: createCoreExtensions(), // Required
  extensions: createBasicExtensions()    // Optional
});
```

**Advantages**:
- ✅ Clear required/optional distinction
- ✅ Prevents missing basic editing features

**Disadvantages**:
- ⚠️ "core" concept still ambiguous
- ⚠️ Users must always call `createCoreExtensions()`

---

### Option 3: Provide Convenience Function

**Structure**:
```typescript
// @barocss/extensions
export function createEditorWithDefaults(options?: EditorOptions) {
  const editor = new Editor(options);
  
  // Automatically register Core Extensions
  createCoreExtensions().forEach(ext => editor.use(ext));
  
  // Add user Extensions
  if (options?.extensions) {
    options.extensions.forEach(ext => editor.use(ext));
  }
  
  return editor;
}
```

**Usage**:
```typescript
// Simple usage (basic features automatically included)
const editor = createEditorWithDefaults({
  extensions: createBasicExtensions()
});

// Advanced usage (direct control of all Extensions)
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),
    ...createBasicExtensions()
  ]
});
```

**Advantages**:
- ✅ Provides simple usage
- ✅ Advanced users can also directly control
- ✅ Prevents missing basic features

**Disadvantages**:
- ⚠️ Two approaches coexist (may cause confusion)

---

## Recommended Approach

### ✅ **Option 1: Remove `coreExtensions`, Unify with `extensions`**

**Reasons**:
1. **Simplicity**: Use only one option
2. **Clarity**: No need for "core" vs "extension" distinction
3. **Consistency**: Similar structure to ProseMirror
4. **Flexibility**: Users can select only needed Extensions

**Implementation**:
```typescript
// Modify EditorOptions
interface EditorOptions {
  extensions?: Extension[]; // All Extensions (no distinction)
}

// Usage
const editor = new Editor({
  extensions: [
    ...createCoreExtensions(),  // Basic editing features
    ...createBasicExtensions()  // Additional features
  ]
});
```

**Notes**:
- If `createCoreExtensions()` is not called, no basic editing features
- But this is intended behavior (same as ProseMirror)
- Need clear documentation

---

## Conclusion

### ✅ **Recommend Removing `coreExtensions`**

**Reasons**:
1. Concept is ambiguous
2. Simplify similar to ProseMirror
3. Treat all Extensions equally

**Implementation**:
- Remove `coreExtensions` option
- Use only `extensions` option
- Users include `createCoreExtensions()` in `extensions`
