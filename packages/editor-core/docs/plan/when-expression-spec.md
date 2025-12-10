# When Expression Parser Spec (`@barocss/editor-core`)

## Overview

The `when-expression` parser is a conditional expression evaluation engine implemented based on VS Code's when clause specification. It is used in the `when` property of Keybindings and evaluates boolean expressions based on context keys.

**Reference**: [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)

---

## API

### `evaluateWhenExpression(expr: string, context: Record<string, unknown>): boolean`

Evaluates a when expression and returns a boolean value.

```typescript
import { evaluateWhenExpression } from '@barocss/editor-core';

const context = {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false
};

const result = evaluateWhenExpression('editorFocus && editorEditable', context);
// true
```

**Parameters**:
- `expr`: When expression string to evaluate
- `context`: Mapping object of context keys and values

**Returns**: Expression evaluation result (`true` or `false`)

**Special cases**:
- Empty string or only whitespace: Always returns `true`
- Undefined context key: Treated as `false`

---

## Supported Operators

### 1. Logical Operators

| Operator | Symbol | Example | Priority |
|----------|--------|---------|----------|
| Not | `!` | `!editorFocus` | High |
| And | `&&` | `editorFocus && editorEditable` | Medium |
| Or | `\|\|` | `editorFocus \|\| editorEditable` | Low |

**Priority rules**:
- `!` > `&&` > `||`
- Example: `!foo && bar` → `(!foo) && bar`
- Example: `foo || bar && baz` → `foo || (bar && baz)`

**Examples**:
```typescript
evaluateWhenExpression('editorFocus && editorEditable', {
  editorFocus: true,
  editorEditable: true
}); // true

evaluateWhenExpression('!editorReadonly', {
  editorReadonly: false
}); // true

evaluateWhenExpression('editorFocus || editorEditable', {
  editorFocus: false,
  editorEditable: true
}); // true
```

---

### 2. Equality Operators

| Operator | Symbol | Example |
|----------|--------|---------|
| Equality | `==` | `selectionType == 'range'` |
| Inequality | `!=` | `selectionType != 'node'` |

**Note**: `===` and `!==` are also supported and behave the same as `==` and `!=`.

**String literals**:
- Must be wrapped in single quotes (`'`)
- Strings with spaces must also be wrapped in quotes
- Escape: `\'` (quote), `\\` (backslash)

**Examples**:
```typescript
evaluateWhenExpression("selectionType == 'range'", {
  selectionType: 'range'
}); // true

evaluateWhenExpression("resourceFilename == 'My New File.md'", {
  resourceFilename: 'My New File.md'
}); // true

evaluateWhenExpression("selectionType == 'It\\'s a test'", {
  selectionType: "It's a test"
}); // true
```

---

### 3. Comparison Operators

| Operator | Symbol | Example | Notes |
|----------|--------|---------|-------|
| Greater than | `>` | `workspaceFolderCount > 1` | Requires spaces on both sides |
| Greater than or equal | `>=` | `workspaceFolderCount >= 1` | Requires spaces on both sides |
| Less than | `<` | `workspaceFolderCount < 2` | Requires spaces on both sides |
| Less than or equal | `<=` | `workspaceFolderCount <= 2` | Requires spaces on both sides |

**Behavior**:
- Converts left and right operands to numbers for comparison
- Returns `false` if not numbers

**Number literal support**:
- Integers: `1`, `42`, `100`
- Decimals: `0.5`, `1.5`, `10.99`
- `.5` format (0 omitted): `.5` is interpreted as `0.5`
- Context values also support decimal numbers

**Examples**:
```typescript
evaluateWhenExpression('workspaceFolderCount > 1', {
  workspaceFolderCount: 2
}); // true

evaluateWhenExpression('workspaceFolderCount >= 1', {
  workspaceFolderCount: 1
}); // true

// Decimal number literals
evaluateWhenExpression('progress > 0.5', {
  progress: 0.75
}); // true

evaluateWhenExpression('progress > .5', {
  progress: 0.6
}); // true (.5 is interpreted as 0.5)

// Context value is decimal
evaluateWhenExpression('progress > 0', {
  progress: 0.1
}); // true

evaluateWhenExpression('0.5 < progress', {
  progress: 0.75
}); // true

evaluateWhenExpression('workspaceFolderCount < 2', {
  workspaceFolderCount: 1
}); // true

evaluateWhenExpression('editorFocus > 1', {
  editorFocus: true
}); // false (non-numeric comparison)
```

---

### 4. Match Operator (Regex Matching)

| Operator | Symbol | Example |
|----------|--------|---------|
| Matches | `=~` | `resourceFilename =~ /docker/` |

**Regex literal format**:
- `/pattern/flags` format
- Flags: `i` (case-insensitive), `s` (dotall), `m` (multiline), `u` (unicode)
- `g`, `y` flags are ignored

**Escape rules**:
- In JSON strings, backslashes must be double-escaped
- Example: `/file:\/\/\/` → `"/file:\\/\\//"` in JSON

**Examples**:
```typescript
evaluateWhenExpression("resourceFilename =~ /docker/", {
  resourceFilename: 'docker-compose.yml'
}); // true

evaluateWhenExpression("resourceFilename =~ /DOCKER/i", {
  resourceFilename: 'docker-compose.yml'
}); // true (case-insensitive)

evaluateWhenExpression("resourceScheme =~ /^untitled$|^file$/", {
  resourceScheme: 'file'
}); // true

evaluateWhenExpression("resourceScheme =~ /file:\\/\\//", {
  resourceScheme: 'file://'
}); // true
```

---

### 5. In / Not In Operators (Membership Operators)

| Operator | Symbol | Example |
|----------|--------|---------|
| In | `in` | `resourceFilename in supportedFolders` |
| Not in | `not in` | `resourceFilename not in supportedFolders` |

**Behavior**:
- Checks if left value is included in right array/object
- Arrays: Uses `Array.includes()`
- Objects: Uses `in` operator (key existence check)
- Returns `false` if not array/object

**Examples**:
```typescript
// Array
evaluateWhenExpression("resourceFilename in supportedFolders", {
  resourceFilename: 'test',
  supportedFolders: ['test', 'foo', 'bar']
}); // true

// Object
evaluateWhenExpression("resourceFilename in supportedFolders", {
  resourceFilename: 'test',
  supportedFolders: { test: true, foo: 'anything', bar: 123 }
}); // true

// not in
evaluateWhenExpression("resourceFilename not in supportedFolders", {
  resourceFilename: 'baz',
  supportedFolders: ['test', 'foo', 'bar']
}); // true
```

---

## Literals

### Boolean Literals

```typescript
evaluateWhenExpression('true', {}); // true
evaluateWhenExpression('false', {}); // false
```

### String Literals

Strings wrapped in single quotes:

```typescript
evaluateWhenExpression("selectionType == 'range'", {
  selectionType: 'range'
}); // true
```

### Number Literals

Supports integers and decimal numbers:

**Supported formats**:
- Integers: `1`, `42`, `100`
- Decimals: `0.5`, `1.5`, `10.99`
- `.5` format (0 omitted): `.5` is automatically interpreted as `0.5` (VS Code compatible)

**Examples**:
```typescript
// Integer
evaluateWhenExpression('workspaceFolderCount > 1', {
  workspaceFolderCount: 2
}); // true

// Decimal number literals
evaluateWhenExpression('progress > 0.5', {
  progress: 0.75
}); // true

evaluateWhenExpression('progress > .5', {
  progress: 0.6
}); // true (.5 is interpreted as 0.5)

// Context value is decimal
evaluateWhenExpression('progress > 0', {
  progress: 0.1
}); // true

evaluateWhenExpression('0.5 < progress', {
  progress: 0.75
}); // true

// Both sides are decimals
evaluateWhenExpression('progress > 0.3', {
  progress: 0.7
}); // true
```

---

## Parentheses

Parentheses can be used to adjust operator precedence:

```typescript
evaluateWhenExpression('(editorFocus || editorEditable) && selectionEmpty', {
  editorFocus: false,
  editorEditable: true,
  selectionEmpty: true
}); // true

evaluateWhenExpression('!(editorFocus || editorEditable)', {
  editorFocus: true,
  editorEditable: false
}); // false
```

---

## Context Keys

Context keys are looked up from the `context` object:

```typescript
const context = {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false,
  selectionType: 'range',
  workspaceFolderCount: 2
};

evaluateWhenExpression('editorFocus && !selectionEmpty', context);
```

**Undefined keys**:
- `undefined` or non-existent keys are treated as `false`
- `null` values are also treated as `false`

---

## Complex Expression Examples

### VS Code Style When Clause

```typescript
evaluateWhenExpression("debuggersAvailable && !inDebugMode", {
  debuggersAvailable: true,
  inDebugMode: false
}); // true
```

### Editor Focus and Editability Check

```typescript
evaluateWhenExpression("editorFocus && editorEditable && !selectionEmpty", {
  editorFocus: true,
  editorEditable: true,
  selectionEmpty: false
}); // true
```

### Selection Type Check

```typescript
evaluateWhenExpression("selectionType == 'range' && editorFocus", {
  selectionType: 'range',
  editorFocus: true
}); // true

evaluateWhenExpression("selectionType == 'node' || selectionType == 'multi-node'", {
  selectionType: 'node'
}); // true
```

---

## Edge Cases

### Empty String

```typescript
evaluateWhenExpression('', {}); // true (always true)
evaluateWhenExpression('   ', {}); // true (true even with only whitespace)
```

### Undefined Context Key

```typescript
evaluateWhenExpression('undefinedKey', {}); // false
evaluateWhenExpression('undefinedKey || editorFocus', {
  editorFocus: true
}); // true
```

### Null Value

```typescript
evaluateWhenExpression('nullKey', {
  nullKey: null
}); // false

evaluateWhenExpression("nullKey == null", {
  nullKey: null
}); // true (compares with string 'null')
```

---

## Implementation Location

- **Source code**: `packages/editor-core/src/when-expression.ts`
- **Test code**: `packages/editor-core/test/when-expression.test.ts`
- **Usage**: `when` condition evaluation in `KeybindingRegistry`

---

## VS Code Spec Compatibility

This parser is implemented based on VS Code's when clause specification and supports the following features:

✅ Logical operators (`!`, `&&`, `||`)  
✅ Equality operators (`==`, `!=`, `===`, `!==`)  
✅ Comparison operators (`>`, `>=`, `<`, `<=`)  
✅ Match operator (`=~`) with regex literals  
✅ In/Not in operators (`in`, `not in`)  
✅ Parentheses for precedence  
✅ String literals with single quotes  
✅ Number literals  
✅ Boolean literals (`true`, `false`)  

**Differences**:
- Some VS Code context keys (e.g., `editorLangId`, `resourceExtname`) are not included in `editor-core`
- `editor-core` focuses only on internal editor state

---

## Related Documents

- [Keyboard Shortcut Spec](./keyboard-shortcut-spec.md) - Complete Keybinding system specification
- [VS Code When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts) - VS Code official documentation
