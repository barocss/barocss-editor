# indentText / outdentText Specification

## Overview

`indentText` and `outdentText` are features that **add/remove indentation strings to the text content itself**.

**⚠️ Note: This feature is primarily suitable for use in single text nodes like code blocks (code-block).**

When used across multiple nodes or when a paragraph has multiple inline-text nodes, it may behave unexpectedly at node boundaries.

## Core Concepts

### indentText vs indentNode

| Aspect | indentText | indentNode |
|--------|-----------|------------|
| **Target** | **Content** of text node | **Structure** of block node |
| **Operation** | Add whitespace string before each line | Move node as child of previous sibling |
| **Use Cases** | Indentation inside code blocks | List item indentation |
| **Model Change** | Change `node.text` content | Change `node.parentId`, `parent.content` |

### Examples

#### indentText (Text Content Change)

**Before:**
```javascript
// Model
{
  sid: 'code-1',
  stype: 'code-block',
  text: 'function hello() {\n  return "world";\n}'
}
```

**After `indentText(range, '  ')`:**
```javascript
// Model
{
  sid: 'code-1',
  stype: 'code-block',
  text: '  function hello() {\n    return "world";\n  }'
}
```

#### indentNode (Structure Change)

**Before:**
```javascript
// Model
{
  sid: 'doc',
  content: [
    { sid: 'p1', stype: 'paragraph', text: 'First' },
    { sid: 'p2', stype: 'paragraph', text: 'Second' }
  ]
}
```

**After `indentNode('p2')`:**
```javascript
// Model
{
  sid: 'doc',
  content: [
    { 
      sid: 'p1', 
      stype: 'paragraph', 
      text: 'First',
      content: [
        { sid: 'p2', stype: 'paragraph', text: 'Second', parentId: 'p1' }
      ]
    }
  ]
}
```

## How It Works

### 1. DataStore Level (`range.indent` / `range.outdent`)

```typescript
// packages/datastore/src/operations/range-operations.ts

indent(contentRange: ModelSelection, indent: string = '  '): string {
  // 1. Extract text from range
  const text = this.extractText(contentRange);
  if (text.length === 0) return '';
  
  // 2. Add indent string before each line
  // Regex: (^|\n) - line start or after newline
  const transformed = text.replace(/(^|\n)/g, (m, g1) => g1 + indent);
  
  // 3. Replace original range with transformed text
  this.replaceText(contentRange, transformed);
  
  return transformed;
}

outdent(contentRange: ModelSelection, indent: string = '  '): string {
  const text = this.extractText(contentRange);
  if (text.length === 0) return '';
  
  // Escape indent string for use in regex
  const escaped = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(`(^|\\n)${escaped}`, 'g');
  
  // Remove indent string before each line
  const transformed = text.replace(rx, (m, g1) => g1);
  
  this.replaceText(contentRange, transformed);
  return transformed;
}
```

### 2. Model Level (`indentText` / `outdentText` operation)

```typescript
// packages/model/src/operations/indentText.ts

defineOperation('indentText', async (operation, context) => {
  const payload = operation.payload;
  const indent = payload.indent ?? '  ';
  
  // Create and validate range
  const range: ModelSelection = {
    type: 'range',
    startNodeId: nodeId,
    startOffset: start,
    endNodeId: nodeId,
    endOffset: end,
    collapsed: false,
    direction: 'forward'
  };
  
  // Call DataStore's range.indent
  const result = context.dataStore.range.indent(range, indent);
  
  return {
    ok: true,
    data: result,  // Return transformed text
    inverse: { type: 'outdentText', payload: { nodeId, start, end, indent } }
  };
});
```

### 3. Extension Level (Command)

```typescript
// packages/extensions/src/indent.ts

editor.registerCommand({
  name: 'indentText',
  execute: async (editor, payload) => {
    const selection = payload?.selection || editor.selection;
    if (!selection || selection.type !== 'range') return false;
    
    // Create operation and execute transaction
    const operations = [
      ...control(selection.startNodeId, [
        indentText(selection.startOffset, selection.endOffset, indentStr)
      ])
    ];
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
});
```

## Renderer-DOM Representation

### Core Principle

**Since `indentText`/`outdentText` change the `node.text` content in the model, renderer-dom automatically renders the changed text.**

### Rendering Flow

```
1. Model Change
   node.text: 'function hello() {\n  return "world";\n}'
   ↓ indentText execution
   node.text: '  function hello() {\n    return "world";\n  }'

2. Renderer-DOM Rendering
   - Get text with data('text')
   - Create VNode: { tag: 'code', children: [{ text: '  function...' }] }
   - Create DOM: <code>  function hello() {
     return "world";
   }</code>

3. Browser Display
   - Whitespace characters are preserved (white-space: pre or pre-wrap required)
   - Visualize indentation with CSS
```

### Real Examples

#### Code Block Example

**Model:**
```javascript
{
  sid: 'code-1',
  stype: 'code-block',
  attributes: { language: 'javascript' },
  text: 'function hello() {\n  return "world";\n}'
}
```

**After indentText execution:**
```javascript
{
  sid: 'code-1',
  stype: 'code-block',
  attributes: { language: 'javascript' },
  text: '  function hello() {\n    return "world";\n  }'
}
```

**Renderer-DOM VNode:**
```javascript
{
  tag: 'pre',
  attributes: { 'data-language': 'javascript' },
  children: [
    {
      tag: 'code',
      children: [
        { text: '  function hello() {\n    return "world";\n  }' }
      ]
    }
  ]
}
```

**DOM Result:**
```html
<pre data-language="javascript">
  <code>  function hello() {
    return "world";
  }</code>
</pre>
```

**CSS Required:**
```css
pre, code {
  white-space: pre;  /* or pre-wrap */
  /* Whitespace characters are preserved */
}
```

### Notes

1. **Whitespace Preservation**
   - `indentText` adds actual whitespace characters (` `, `\t`) to the text.
   - Browsers collapse consecutive whitespace by default, so `white-space: pre` or `pre-wrap` CSS is required.

2. **Mark Range Adjustment**
   - `range.replaceText` automatically adjusts mark ranges.
   - Mark ranges move according to text length changes caused by indentation.

3. **Cross-node Ranges**
   - Ranges spanning multiple nodes are also supported.
   - Indentation is applied to the corresponding part of each node.

## Use Cases

### 1. Code Block Indentation

```typescript
// User presses Tab key inside code block
const selection = {
  type: 'range',
  startNodeId: 'code-1',
  startOffset: 0,
  endNodeId: 'code-1',
  endOffset: 20
};

// Execute indentText
await editor.executeCommand('indentText', {
  selection,
  indent: '  '  // 2 spaces
});

// Result: Selected part of code block is indented by 2 spaces
```

### 2. Quote Indentation

```typescript
// Indent text inside quote
const selection = {
  type: 'range',
  startNodeId: 'quote-text-1',
  startOffset: 0,
  endNodeId: 'quote-text-1',
  endOffset: 50
};

await editor.executeCommand('indentText', {
  selection,
  indent: '> '  // Quote marker
});
```

### 3. List Item Indentation (Structural)

```typescript
// Indent list item itself (structure change)
await editor.executeCommand('indentNode', {
  nodeId: 'list-item-2'
});

// This uses indentNode (structure change)
```

## DSL Usage

### Single Node Range

```typescript
import { transaction, control, indentText } from '@barocss/model';

// Using control
await transaction(editor, [
  ...control('code-1', [
    indentText(0, 20, '  ')  // start, end, indent
  ])
]).commit();

// Direct call
await transaction(editor, [
  indentText('code-1', 0, 20, '  ')  // nodeId, start, end, indent
]).commit();
```

### Cross-node Range

```typescript
await transaction(editor, [
  indentText(
    'text-1', 5,      // startNodeId, startOffset
    'text-3', 10,    // endNodeId, endOffset
    '  '             // indent
  )
]).commit();
```

## Limitations and Notes

### 1. Text Nodes Only

**`indentText`/`outdentText` only target text nodes (nodes with `node.text`).**

- ✅ **Works**: Nodes with text like `inline-text`, `code-block`
- ❌ **Ignored**: Atom nodes without text like `inline-image`, `page-break`
- ⚠️ **Warning**: Nodes without text are excluded from `extractText`

### 2. Behavior with Ranges Spanning Multiple Nodes

**When paragraph has multiple inline-text nodes:**

```javascript
// Model structure
{
  sid: 'para-1',
  stype: 'paragraph',
  content: [
    { sid: 'text-1', stype: 'inline-text', text: 'Hello\n' },
    { sid: 'img-1', stype: 'inline-image', src: '...' },  // atom node
    { sid: 'text-2', stype: 'inline-text', text: 'World\n' }
  ]
}

// Range: from start of text-1 to end of text-2
const range = {
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-2',
  endOffset: 6
};

// When indentText executes:
// 1. extractText: Extract 'Hello\nWorld\n' (img-1 excluded)
// 2. Transform: '  Hello\n  World\n'
// 3. replaceText: Process as deleteText + insertText
//    - text-1: Replace with '  Hello\n'
//    - text-2: Replace with '  World\n'
//    - img-1: No change (no text)
```

**Result:**
- ✅ First line of each text node is indented
- ✅ Atom nodes (inline-image, etc.) are unaffected
- ⚠️ **However**: With ranges spanning multiple nodes, `replaceText` is processed as `deleteText` + `insertText`, so **original structure may change**

### 3. Appropriate Use Cases

#### ✅ Suitable Use Cases (Recommended)

1. **Code Block (code-block) - Most Suitable**
   ```javascript
   // Inside single code-block node
   {
     sid: 'code-1',
     stype: 'code-block',
     text: 'function hello() {\n  return "world";\n}'
   }
   // indentText → Add whitespace before each line
   // ✅ Safe operation since it's a single text node
   ```

2. **Block Node with Single Text**
   ```javascript
   // Block with only single text node
   {
     sid: 'pre-1',
     stype: 'pre',
     text: 'Line 1\nLine 2\nLine 3'
   }
   // indentText → Add whitespace before each line
   // ✅ Safe operation since it's a single text node
   ```

#### ⚠️ Use Cases Requiring Caution (Not Recommended)

1. **Ranges Spanning Multiple inline-text Nodes**
   - Processed individually per node
   - Line-based indentation may break at node boundaries
   - Example: When last line of `text-1` and first line of `text-2` are the same logical line
   - **Not recommended**: When paragraph has multiple inline-text nodes, structure can become complex

2. **Ranges Including Atom Nodes**
   - Atom nodes have no text, so excluded from `extractText`
   - Indentation result may differ from expectations
   - **Not recommended**: Ranges including inline-image, etc. may behave unexpectedly

#### ❌ Unsuitable Use Cases

1. **Structural Indentation (List Items, etc.)**
   - Must use `indentNode`/`outdentNode`
   - `indentText` only changes text content, cannot change structure

2. **Indentation of Block Node Itself**
   - Block nodes usually don't have text directly
   - Must use `indentNode`

### 4. Tab Character (`\t`) vs Space Character (` `)

**`indentText` can add any string:**

```typescript
// 2 spaces
indentText(range, '  ')

// Tab character
indentText(range, '\t')

// Custom string
indentText(range, '> ')  // Quote
indentText(range, '- ')   // List marker
```

**Default is 2 spaces (`'  '`).**

### 5. Actual Behavior Examples

#### Example 1: Single Text Node (Code Block)

```javascript
// Before
{
  sid: 'code-1',
  stype: 'code-block',
  text: 'function hello() {\n  return "world";\n}'
}

// Execute indentText(range, '  ')
// extractText: 'function hello() {\n  return "world";\n}'
// transformed: '  function hello() {\n    return "world";\n  }'
// replaceText: Direct replacement since single node

// After
{
  sid: 'code-1',
  stype: 'code-block',
  text: '  function hello() {\n    return "world";\n  }'
}
```

#### Example 2: Multiple Text Nodes (Caution Required)

```javascript
// Before
{
  sid: 'para-1',
  content: [
    { sid: 'text-1', text: 'Line 1\n' },
    { sid: 'text-2', text: 'Line 2\n' }
  ]
}

// Range: text-1[0] ~ text-2[7]
// extractText: 'Line 1\nLine 2\n'
// transformed: '  Line 1\n  Line 2\n'
// replaceText: deleteText + insertText
//   - text-1: Replace with '  Line 1\n'
//   - text-2: Replace with '  Line 2\n'

// After
{
  sid: 'para-1',
  content: [
    { sid: 'text-1', text: '  Line 1\n' },
    { sid: 'text-2', text: '  Line 2\n' }
  ]
}
```

**⚠️ Issues:**
- Line-based indentation may break at node boundaries
- When last line of `text-1` and first line of `text-2` are the same logical line, individual processing may differ from intent

## Summary

1. **`indentText`/`outdentText` change text content**.
2. **Since `node.text` in model changes**, renderer-dom automatically renders the changed text.
3. **Whitespace characters are included in actual text**, so CSS `white-space: pre` may be required.
4. **Use `indentNode`/`outdentNode` for structural indentation**.
5. **Only targets text nodes**, atom nodes (inline-image, etc.) are unaffected.
6. **Caution needed for ranges spanning multiple nodes**: Processed individually per node, so may differ from expectations at node boundaries.
7. **Both Tab character (`\t`) and space (` `) can be used**: Specified via `indent` parameter.
8. **⚠️ Recommended use case: Use only in single text nodes like code blocks (code-block)**

