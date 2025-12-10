# Keybinding System: Built-in Keys vs Custom Keys Analysis

## Current State

### Discovered Problems
1. **Already registered in `default-keybindings.ts`**:
   ```typescript
   {
     key: 'Backspace',
     command: 'backspace',
     when: 'editorFocus && editorEditable'
   },
   {
     key: 'Delete',
     command: 'deleteForward',
     when: 'editorFocus && editorEditable'
   }
   ```

2. **But directly handled in `editor-view-dom.ts`**:
   ```typescript
   if (key === 'Backspace') {
     this.handleBackspaceKey(); // Bypasses keybinding system
     return;
   }
   ```

3. **Consistency problem**:
   - Enter uses keybinding system
   - ArrowLeft/ArrowRight are directly handled
   - Backspace/Delete are directly handled
   - Mod+b, Mod+i use keybinding system

## Option Comparison

### Option A: Integrate All Keys into Keybinding System

**Structure**:
```
All key inputs
  ↓
editor-view-dom: handleKeydown()
  ↓
getKeyString(event) → Normalized key string
  ↓
editor.keybindings.resolve(key)
  ↓
command execution
```

**Advantages**:
1. ✅ **Consistency**: All keys processed through same path
2. ✅ **Flexibility**: Users can customize Backspace/Delete too
3. ✅ **Extensibility**: Extensions can override default key behaviors
4. ✅ **Easy testing**: Only need to test keybinding system
5. ✅ **Code simplification**: Remove special cases from `editor-view-dom`

**Disadvantages**:
1. ❌ **User confusion**: Users may accidentally change basic editing keys
2. ❌ **Performance**: Basic keys also go through resolve process (minimal overhead)
3. ❌ **Complexity**: Basic keys also need `when` condition evaluation

**VS Code approach**:
- VS Code processes all keys through keybinding system
- But marks basic editing keys as "built-in" to prevent accidental changes
- However, technically override is possible

### Option B: Separate Built-in Keys and Custom Keys

**Structure**:
```
Key input
  ↓
editor-view-dom: handleKeydown()
  ↓
Check built-in keys (Backspace, Delete, Enter, Arrow keys)
  ↓
IF built-in key:
  Direct handling (bypass keybinding system)
ELSE:
  Delegate to keybinding system
```

**Built-in key list**:
- Backspace, Delete
- Enter
- ArrowLeft, ArrowRight (basic cursor movement)
- ArrowUp, ArrowDown → Leave to browser native cursor movement, exclude from default keybindings
- Tab, Shift+Tab (optional)

**Advantages**:
1. ✅ **Performance**: Direct handling for basic keys is faster
2. ✅ **Stability**: Basic editing keys always behave the same
3. ✅ **Simplicity**: Basic keys don't need complex condition evaluation
4. ✅ **User protection**: Users cannot accidentally change basic keys

**Disadvantages**:
1. ❌ **Lack of consistency**: Some use keybinding, some use direct handling
2. ❌ **Limited extensibility**: Difficult for Extensions to change basic key behaviors
3. ❌ **Code duplication**: Need to maintain two paths
4. ❌ **Test complexity**: Need to test both paths

**ProseMirror approach**:
- `baseKeymap` includes basic keys
- But users can override
- Basic keys are also part of keybinding system

## Approaches from Other Editors

### VS Code
- **Processes all keys through keybinding system**
- Basic editing keys also registered in keybindings
- UI marks as "built-in" to prevent changes
- But technically override is possible

### ProseMirror
- **`baseKeymap` includes basic keys**
- Users can override `baseKeymap`
- Basic keys are also part of keybinding system

### Sublime Text
- **Processes all keys through keybinding system**
- Basic keys also defined in configuration file
- Users can freely change

## Recommendations

### Option A (Integrate All Keys into Keybinding System) Recommended

**Reasons**:
1. **Consistency**: All keys processed through same path
2. **Extensibility**: Extensions can change basic key behaviors
3. **Code simplification**: Remove special cases from `editor-view-dom`
4. **Same approach as VS Code**: Proven pattern

**Implementation method**:
1. Remove direct Backspace/Delete handling from `editor-view-dom.ts`
2. Actually use registrations in `default-keybindings.ts`
3. Integrate Arrow keys into keybinding system (optional)

**User protection method**:
- Mark basic editing keys as "built-in" in UI
- Or mark keybindings with `source: 'core'` as non-changeable in UI
- But technically override is possible (for advanced users)

## Implementation Plan

### Step 1: Integrate Backspace/Delete into Keybinding System

**Changes**:
```typescript
// editor-view-dom.ts
handleKeydown(event: KeyboardEvent): void {
  // ... IME check ...
  
  const key = getKeyString(event);
  
  // Remove special cases: Backspace, Delete also go through keybinding system
  // Arrow keys also go through keybinding system (optional)
  
  const resolved = this.editor.keybindings.resolve(key);
  if (resolved.length > 0) {
    const { command, args } = resolved[0];
    event.preventDefault();
    void this.editor.executeCommand(command, args);
  }
}
```

**Notes**:
- Backspace/Delete commands need `selection` parameter
- When executing commands from keybinding system, must automatically pass current selection
- Or implement commands to read selection internally

### Step 2: Improve Command Parameter Handling

**Problem**: Backspace/Delete commands need `{ selection: ModelSelection }` parameter

**Solution A**: Commands read selection internally
```typescript
// DeleteExtension
execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
  const selection = payload?.selection || editor.selection;
  return await this._executeBackspace(editor, selection);
}
```

**Solution B**: Keybinding system automatically passes selection
```typescript
// keybinding.ts resolve()
const resolved = this.editor.keybindings.resolve(key);
if (resolved.length > 0) {
  const { command, args } = resolved[0];
  
  // Automatically add selection for specific commands
  if (command === 'backspace' || command === 'deleteForward') {
    const selection = this._getCurrentSelection();
    args = { ...args, selection };
  }
  
  void this.editor.executeCommand(command, args);
}
```

## Conclusion

**Option A (Integrate All Keys into Keybinding System) is recommended.**

**Reasons**:
1. Consistency and extensibility
2. Code simplification
3. Same approach as VS Code
4. User protection can be handled at UI level

**Considerations when implementing**:
- Need to decide command parameter handling method
- Need to decide whether to integrate Arrow keys
- Minimize performance impact (resolve is already fast)
