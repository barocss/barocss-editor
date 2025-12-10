# Transaction vs Extension Architecture

## Current Structure

### 1. **Transaction System** (`@barocss/model`)

**Location**: Core functionality (basic editor features)

**Composition**:
```
@barocss/model
  ├── TransactionManager      → Transaction execution management
  ├── transaction() DSL        → Transaction creation function
  └── operations/              → Basic Operations
      ├── insertText           → Text insertion
      ├── deleteTextRange      → Text range deletion
      ├── delete               → Node deletion
      ├── replaceText          → Text replacement
      └── ... (other operations)
```

**Characteristics**:
- ✅ **Core functionality**: Available in all editors
- ✅ **Basic Operations**: `insertText`, `deleteTextRange`, `delete`, etc.
- ✅ **Automatic History management**: TransactionManager automatically adds to History
- ✅ **Independent of Extensions**: Transactions operate independently

**Usage example**:
```typescript
import { transaction, control } from '@barocss/model';

// Direct Transaction usage (possible without Extensions)
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```

---

### 2. **Extension System** (`@barocss/extensions`)

**Location**: Extension (provided externally like bold/italic)

**Composition**:
```
@barocss/extensions
  ├── TextExtension           → Register insertText, deleteText commands
  ├── DeleteExtension         → Register delete command
  ├── ParagraphExtension      → Paragraph-related commands
  ├── BoldExtension           → toggleBold command
  └── ItalicExtension         → toggleItalic command
```

**Characteristics**:
- ✅ **Provided as Extension**: Users must explicitly register
- ✅ **Command wrapper**: Wrap Transaction operations as Commands
- ✅ **Keyboard shortcuts**: Extensions handle keyboard events
- ✅ **Convenience**: Use as `editor.executeCommand('delete')`

**Usage example**:
```typescript
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  coreExtensions: createCoreExtensions() // ← Explicitly register
});

// Use as Command (Extension must be registered)
await editor.executeCommand('delete', { range });
```

---

## Architecture Comparison

### ProseMirror Structure

```
@prosemirror/state
  └── Transaction          → Core (basic functionality)

@prosemirror/commands
  └── insertText, delete  → Separate package (basic editing features)

@prosemirror/example-setup
  └── baseKeymap          → Separate package (keyboard shortcuts)
```

**Characteristics**:
- Transaction is **Core**
- Basic Commands are **separate package**
- Keyboard shortcuts are also **separate package**

---

### Our Editor Structure

```
@barocss/model
  └── Transaction + Operations  → Core (basic functionality)

@barocss/extensions
  └── TextExtension, DeleteExtension  → Extension (basic editing features)
```

**Characteristics**:
- Transaction is **Core** (`@barocss/model`)
- Basic Commands are **Extension** (`@barocss/extensions`)
- Keyboard shortcuts are also handled in **Extension**

---

## Key Differences

### Transaction Operations vs Commands

| Distinction | Transaction Operations | Commands (Extension) |
|-------------|----------------------|---------------------|
| **Location** | `@barocss/model` (Core) | `@barocss/extensions` (Extension) |
| **Usage** | `transaction(editor, [op])` | `editor.executeCommand('name')` |
| **Role** | Data changes (low-level) | User actions (high-level) |
| **Required** | Always available | Extension registration required |
| **Examples** | `insertText`, `deleteTextRange` | `insertText`, `delete` |

---

## Actual Usage Flow

### 1. Direct Transaction Usage Without Extension

```typescript
import { transaction, control } from '@barocss/model';

// Can use without Extension registration
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```

### 2. Command Usage via Extension

```typescript
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  coreExtensions: createCoreExtensions() // Register Extension
});

// Use as Command (Extension wraps Transaction)
await editor.executeCommand('delete', { range });
```

---

## Conclusion

### ✅ **Transaction is Core Functionality**

- Included in `@barocss/model`
- Can be used without Extension registration
- Provides basic Operations (`insertText`, `deleteTextRange`, `delete`, etc.)

### ✅ **Basic Editing Features are Extensions**

- Included in `@barocss/extensions`
- `TextExtension`, `DeleteExtension`, etc.
- Wrap Transactions as Commands
- Include keyboard shortcut handling

### ✅ **Similar Structure to ProseMirror**

- Transaction is Core
- Basic editing features are separate package (Extension)
- Users must explicitly register

---

## Recommended Usage Patterns

### Basic Usage (Using Extensions)

```typescript
const editor = new Editor({
  coreExtensions: createCoreExtensions()
});

// Use Commands (recommended)
await editor.executeCommand('delete', { range });
```

### Advanced Usage (Direct Transaction Usage)

```typescript
// Can use Transaction directly without Extensions
await transaction(editor, [
  ...control(nodeId, [
    { type: 'insertText', payload: { pos: 5, text: 'Hello' } }
  ])
]).commit();
```
