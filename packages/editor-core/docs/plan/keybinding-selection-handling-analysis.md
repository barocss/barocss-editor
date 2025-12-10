# Analysis of Selection Passing Method in Keybinding System

## Problem Situation

Backspace/Delete commands require `{ selection: ModelSelection }` parameter.

Current:
```typescript
// editor-view-dom.ts
handleBackspaceKey(): void {
  const modelSelection = this.selectionHandler.convertDOMSelectionToModel(domSelection);
  this.editor.executeCommand('backspace', { selection: modelSelection });
}
```

When integrating with keybinding system:
```typescript
// editor-view-dom.ts
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  // How to pass selection?
  void this.editor.executeCommand(command, args);
}
```

## Option Comparison

### Option A: Store Selection in Context

**Structure**:
```typescript
// Editor._updateBuiltinContext()
this._context['selection'] = this.selection; // Store ModelSelection object

// Use in Command
execute: async (editor: Editor, payload?: any) => {
  const selection = editor.getContext('selection') || editor.selection;
  return await this._executeBackspace(editor, selection);
}
```

**Advantages**:
1. ✅ **Consistency**: Context already manages selection metadata
2. ✅ **Usable in when clauses**: `when: 'selection && !selectionEmpty'`
3. ✅ **Auto-update**: Automatically maintains latest state in `_updateBuiltinContext()`
4. ✅ **Explicit**: Clear that it's in Context

**Disadvantages**:
1. ❌ **Context pollution**: Context mainly stores boolean/string values, but storing objects
2. ❌ **Type safety**: Context is `Record<string, unknown>` so type checking is difficult
3. ❌ **Performance**: Copy selection object every time context updates
4. ❌ **Circular reference risk**: Storing complex objects in Context can be risky

**VS Code approach**:
- VS Code does not store selection objects in context
- Instead, only stores selection metadata in context

### Option B: Command Directly Reads `editor.selection` (Recommended)

**Structure**:
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  // Use selection from payload if provided, otherwise use editor.selection
  const selection = payload?.selection || editor.selection;
  if (!selection) {
    return false; // Cannot execute without selection
  }
  return await this._executeBackspace(editor, selection);
}
```

**Advantages**:
1. ✅ **Simplicity**: Most direct method
2. ✅ **Type safety**: `editor.selection` is `ModelSelection | null` type
3. ✅ **Performance**: No context update overhead
4. ✅ **Clarity**: Command explicitly requires selection
5. ✅ **Flexibility**: Can override with payload if needed
6. ✅ **Similar to VS Code**: VS Code also reads state internally in commands

**Disadvantages**:
1. ❌ **Cannot use in when clauses**: Complex conditions like `when: 'selection.startNodeId === ...'` not possible
2. ❌ **Not explicit**: Can be used even if selection is not in command signature

**Solution**:
- `when` clauses only use metadata (already implemented: `selectionEmpty`, `selectionType`)
- Commands use `editor.selection` as default but can override with payload

### Option C: Auto-Pass in Keybinding System

**Structure**:
```typescript
// keybinding.ts resolve()
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  
  // Automatically add selection for specific commands
  const commandsNeedingSelection = ['backspace', 'deleteForward', 'insertParagraph'];
  if (commandsNeedingSelection.includes(command)) {
    const selection = this._contextProvider?.getContext('selection') || 
                      (this._contextProvider as any)?.selection;
    args = { ...args, selection };
  }
  
  void this.editor.executeCommand(command, args);
}
```

**Advantages**:
1. ✅ **Automation**: Commands don't need to worry
2. ✅ **Consistency**: Automatically applied to all commands needing selection

**Disadvantages**:
1. ❌ **Hardcoding**: Must hardcode command names
2. ❌ **Limited extensibility**: Need to modify when adding new commands
3. ❌ **Complexity**: Keybinding system must know command requirements
4. ❌ **Increased coupling**: Increased coupling between keybinding system and commands

### Option D: Store Only Selection ID in Context

**Structure**:
```typescript
// Editor._updateBuiltinContext()
this._context['selectionId'] = this.selection ? 'current' : null;
// Or store only core selection information
this._context['selectionStartNodeId'] = this.selection?.startNodeId;
this._context['selectionStartOffset'] = this.selection?.startOffset;

// Use in Command
execute: async (editor: Editor, payload?: any) => {
  const selection = editor.selection; // Still directly read
  // context only used in when clauses
}
```

**Advantages**:
1. ✅ **Context lightweight**: Store only primitives instead of objects
2. ✅ **Utilize when clauses**: `when: 'selectionStartNodeId === "node-1"'`

**Disadvantages**:
1. ❌ **Complexity**: Difficult to store all Selection information in context
2. ❌ **Duplication**: Commands still need to directly read `editor.selection`

## Recommendations

### Option B (Command Directly Reads `editor.selection`) Recommended

**Reasons**:
1. **Simple and clear**: Most direct method
2. **Type safety**: TypeScript type checking possible
3. **Performance**: No context update overhead
4. **Similar to VS Code**: Proven pattern
5. **Flexibility**: Can override with payload if needed

**Implementation method**:
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  // 1. Use selection from payload if provided (explicit passing)
  // 2. Otherwise use editor.selection (default)
  const selection = payload?.selection || editor.selection;
  
  if (!selection) {
    console.warn('[DeleteExtension] No selection available');
    return false;
  }
  
  return await this._executeBackspace(editor, selection);
}

canExecute: (editor: Editor, payload?: any) => {
  // Executable if selection exists
  const selection = payload?.selection || editor.selection;
  return selection != null;
}
```

**keybinding system integration**:
```typescript
// editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME check ...
  
  const key = getKeyString(event);
  const resolved = this.editor.keybindings.resolve(key);
  
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    
    // Command automatically reads editor.selection
    // Can override with args if needed
    void this.editor.executeCommand(command, args);
  }
}
```

**Context only stores metadata**:
- `selectionEmpty`: boolean
- `selectionType`: 'range' | 'node' | ...
- `selectionDirection`: 'forward' | 'backward' | null
- **Selection object itself is not stored in context**

## Implementation Plan

### Step 1: Modify DeleteExtension

```typescript
// packages/extensions/src/delete.ts
editor.registerCommand({
  name: 'backspace',
  execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
    // Use selection from payload if provided, otherwise use editor.selection
    const selection = payload?.selection || editor.selection;
    if (!selection) {
      return false;
    }
    return await this._executeBackspace(editor, selection);
  },
  canExecute: (editor: Editor, payload?: any) => {
    const selection = payload?.selection || editor.selection;
    return selection != null;
  }
});
```

### Step 2: Modify editor-view-dom

```typescript
// packages/editor-view-dom/src/editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME check ...
  
  const key = getKeyString(event);
  
  // Remove direct Backspace/Delete handling
  // Integrate all keys into keybinding system
  
  const resolved = this.editor.keybindings.resolve(key);
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    void this.editor.executeCommand(command, args);
  }
}
```

### Step 3: Context Only Maintains Metadata

```typescript
// Editor._updateBuiltinContext()
this._context['selectionEmpty'] = !this.selection || this.selection.collapsed;
this._context['selectionType'] = this.selection?.type || null;
this._context['selectionDirection'] = this.selection?.direction || null;
// Selection object itself is not stored in context
```

## Conclusion

**Option B (Command Directly Reads `editor.selection`) is recommended.**

**Reasons**:
1. Simple and clear
2. Type safety
3. Performance optimization
4. Similar pattern to VS Code
5. Context only manages metadata (lightweight)

**When implementing**:
- Commands use `payload?.selection || editor.selection` pattern
- Context only stores selection metadata
- `when` clauses only use metadata
