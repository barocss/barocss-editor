# Copy/Paste/Cut Feature Implementation Specification

## Overview

This document outlines the features needed to implement copy/paste/cut functionality across each layer (schema, datastore, model, extensions).  
In particular, it clearly defines **how to use the `@barocss/converter` package in the copy/paste/cut flow**.

---

## 1. Schema Layer

### 1.1 Required Features

**Current State**: Schema is responsible only for model structure and validation.

**Conclusion**: No additions needed in the Schema layer.
- Conversion rules are defined in the Converter package
- Schema only defines model structure (no conversion rules)

**Reasons**:
- Schema should focus only on "data model structure" and "validation rules"
- Conversion rules are "external format processing", which is the Converter package's responsibility
- Maintain Schema's purity by not depending on conversion logic
- Design Converter package to work independently

**Note**: 
- ProseMirror defines `parseDOM` in Schema, but we separate it into the Converter package for clearer responsibility separation.
- Schema defines only model structure, and Converter defines conversion rules.

---

## 2. DataStore Layer

### 2.1 Required Features

#### 2.1.1 Node Tree Serialization

**Purpose**: Serialize nodes in the selected range to JSON format

**⚠️ Important**: DataStore only knows about model data, so it is responsible for **JSON serialization only**.
- HTML/Markdown serialization is handled in **Extension layer + `@barocss/converter`** (JSON → external format conversion)
- Text serialization uses `RangeOperations.extractText()` (already exists)

**Required Method**:
```typescript
// packages/datastore/src/operations/serialization-operations.ts

class SerializationOperations {
  /**
   * Serialize nodes in the selected range to JSON format
   * 
   * @param range Selected range (ModelSelection)
   * @returns Serialized node tree (INode[] format, IDs removed or newly generated)
   */
  serializeRange(range: ModelSelection): INode[] {
    // 1. Extract all nodes included in range
    // 2. Maintain node tree structure (parent-child relationships)
    // 3. Remove or regenerate IDs (to prevent conflicts on paste)
    // 4. Return in JSON format (pure model data only)
  }
}
```

**Exposed in DataStore**:
```typescript
// packages/datastore/src/data-store.ts

class DataStore {
  // ... existing code ...
  
  /**
   * Serialize selected range to JSON
   * 
   * Note: HTML/text serialization is handled in Extension layer
   */
  serializeRange(range: ModelSelection): INode[] {
    return this.serialization.serializeRange(range);
  }
}
```

**Text Extraction**:
- Use `RangeOperations.extractText()` (already exists)
- Or use `DataStore.range.extractText(range)`

#### 2.1.2 Node Tree Deserialization

**Purpose**: Parse serialized JSON data and restore to node tree

**⚠️ Important**: DataStore only knows about model data, so it is responsible for **JSON deserialization only**.
- HTML deserialization is handled in Extension layer (HTML → model nodes (`INode[]`) conversion, then call `deserializeNodes()`)
- Text/Markdown deserialization is handled in Extension layer (Text/Markdown → model nodes (`INode[]`) conversion, then call `deserializeNodes()`)

**Required Method**:
```typescript
// packages/datastore/src/operations/serialization-operations.ts

class SerializationOperations {
  /**
   * Parse JSON format node tree and create nodes
   * 
   * @param nodes Serialized node array (INode[])
   * @param targetParentId Parent node ID to paste into
   * @param targetPosition Position to paste (index in parent's content array)
   * @returns Array of created node IDs
   */
  deserializeNodes(
    nodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    // 1. Recursively traverse node tree
    // 2. Assign new ID to each node (ignore existing IDs)
    // 3. Reset parentId relationships
    // 4. Insert into targetParentId's content
    // 5. Return array of created node IDs
  }
}
```

**Exposed in DataStore**:
```typescript
// packages/datastore/src/data-store.ts

class DataStore {
  // ... existing code ...
  
  /**
   * Deserialize JSON node tree and insert
   * 
   * Note: HTML/text deserialization is handled in Extension layer
   */
  deserializeNodes(
    nodes: INode[],
    targetParentId: string,
    targetPosition?: number
  ): string[] {
    return this.serialization.deserializeNodes(nodes, targetParentId, targetPosition);
  }
}
```

#### 2.1.3 Delete Selected Range

**Current State**: `RangeOperations.deleteText()` already exists.

**Extension Needs**:
- May need to support deletion of entire block nodes, not just text nodes
- Current `deleteText` only deletes text ranges, so a separate method is needed for entire node deletion

**Required Method**:
```typescript
// packages/datastore/src/operations/range-operations.ts

class RangeOperations {
  /**
   * Delete nodes in the selected range
   * - Text range: use deleteText
   * - Entire node: use deleteNode
   */
  deleteRange(range: ModelSelection): void {
    // 1. Determine if range is text range or node range
    // 2. If text range, call deleteText
    // 3. If node range, call deleteNode (for each node)
  }
}
```

---

## 3. Model Layer

### 3.1 Required Features

#### 3.1.1 Copy Operation

**Purpose**: Prepare selected range as copyable data (model JSON + text) from **model perspective**  
Clipboard API calls and HTML/Markdown conversion are the responsibility of **Extensions + Converter**.

**Required Operation (Final Form)**:
```typescript
// packages/model/src/operations/copy.ts

export interface CopyResult {
  json: INode[];  // Model JSON (based on DataStore.serializeRange)
  text: string;   // Plain text (based on RangeOperations.extractText)
}

export function copy(context: OperationContext, range: ModelSelection): CopyResult {
  // 1. Call DataStore.serializeRange() → json
  // 2. Call DataStore.range.extractText() → text
  // 3. Do not create external formats like html/markdown here
  return {
    json: context.dataStore.serializeRange(range),
    text: context.dataStore.range.extractText(range)
  };
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/copy.ts

export function copy(range: ModelSelection) {
  return {
    type: 'copy',
    range
  };
}
```

#### 3.1.2 Paste Operation

**Purpose**: Responsible for **model node insertion + Selection update** at the paste target location  
Conversion of external formats (HTML/Markdown/Text) to model nodes (`INode[]`) is handled in **Extensions + Converter**.

**Required Operation (Final Form)**:
```typescript
// packages/model/src/operations/paste.ts

export interface PasteInput {
  nodes: INode[];             // Model nodes already created through Converter
}

export interface PasteResult {
  insertedNodeIds: string[];
  newSelection: ModelSelection;  // Cursor position after paste
}

export function paste(
  context: OperationContext,
  data: PasteInput,
  targetRange: ModelSelection
): PasteResult {
  // 1. Determine paste location based on targetRange's startNodeId/startOffset
  // 2. Call context.dataStore.deserializeNodes(data.nodes, targetParentId, targetPosition)
  // 3. Calculate newSelection based on created node IDs
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/paste.ts

export function paste(nodes: INode[], targetRange: ModelSelection) {
  return {
    type: 'paste',
    data: { nodes },
    targetRange
  };
}
```

#### 3.1.3 Cut Operation

**Purpose**: Copy and delete selected range  
Converter is not used here either, only returns **model JSON + text**.

**Required Operation**:
```typescript
// packages/model/src/operations/cut.ts

export interface CutResult {
  json: INode[];
  text: string;
  deletedRange: ModelSelection;
}

export function cut(context: OperationContext, range: ModelSelection): CutResult {
  // 1. Call copy() to obtain json + text
  const copied = copy(context, range);

  // 2. Call deleteRange() to delete (or deleteTextRange)
  context.dataStore.range.deleteRange(range);

  // 3. Return result (clipboard storage/HTML conversion is Extension's responsibility)
  return {
    json: copied.json,
    text: copied.text,
    deletedRange: range
  };
}
```

**DSL 함수**:
```typescript
// packages/model/src/operations-dsl/cut.ts

export function cut(range: ModelSelection) {
  return {
    type: 'cut',
    range
  };
}
```

**Transaction Usage Example**:
```typescript
// Usage in Extension
const result = await transaction(editor, (control) => {
  const copyResult = control(range, [copy(range)]);
  const deleteResult = control(range, [deleteTextRange(range)]);
  return { copyResult, deleteResult };
});
```

---

## 4. Extensions Layer

### 4.1 Required Features

#### 4.1.1 Copy Command

**Purpose**: Provide copy functionality integrated with clipboard API

**Required Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  name = 'copyPaste';
  priority = 100;
  
  private _converter: HTMLConverter;

  constructor() {
    // Create Converter instance
    this._converter = new HTMLConverter();
  }

  onCreate(editor: Editor): void {
    // 1. Register default conversion rules
    this._registerDefaultRules();
    
    // 2. Reference Schema (for checking node type names)
    this._converter.useSchema(editor.dataStore.getActiveSchema());
    
    // 3. Register copy command
    editor.registerCommand({
      name: 'copy',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // 1. Serialize JSON from DataStore
        const json = editor.dataStore.serializeRange(selection);
        
        // 2. Extract text (using existing method)
        const text = editor.dataStore.range.extractText(selection);
        
        // 3. Convert JSON to HTML (using Converter)
        const html = this._converter.convert(json, 'html');

        // 4. Save to clipboard API
        await this._writeToClipboard({ json, html, text });
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  /**
   * Register default conversion rules
   */
  private _registerDefaultRules(): void {
    // Register default conversion rules in Converter
    // Examples: paragraph, heading, bold, italic, etc.
  }

  private async _writeToClipboard(data: { json: INode[]; html: string; text: string }): Promise<void> {
    // 1. Use Clipboard API (navigator.clipboard.write)
    // 2. Save multiple formats (text/plain, text/html, application/json)
    // 3. Fallback: use document.execCommand('copy')
  }
}
```

#### 4.1.2 Paste Command

**Purpose**: Read data from clipboard API and paste

**Required Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  onCreate(editor: Editor): void {
    // ... copy command ...

    // 2. Register paste command
    editor.registerCommand({
      name: 'paste',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection; clipboardData?: ClipboardData }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // 1. Read data from clipboard
        const clipboardData = payload?.clipboardData || await this._readFromClipboard();

        // 2. Convert clipboard data to JSON (using Converter)
        const json = await this._clipboardDataToJSON(clipboardData);

        // 3. Call DataStore.deserializeNodes() to create nodes
        const targetParentId = this._getTargetParentId(selection, editor.dataStore);
        const targetPosition = this._getTargetPosition(selection, editor.dataStore);
        
        const insertedNodeIds = editor.dataStore.deserializeNodes(json, targetParentId, targetPosition);

        // 4. Update Selection
        const newSelection = this._createSelectionAfterPaste(selection, insertedNodeIds);
        editor.updateSelection(newSelection);
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  /**
   * Convert clipboard data to JSON node tree
   * 
   * Priority:
   * 1. application/json (priority): use directly
   * 2. text/html: HTML → JSON conversion (using Converter)
   * 3. text/plain: text → JSON conversion
   */
  private async _clipboardDataToJSON(
    clipboardData: ClipboardData
  ): Promise<INode[]> {
    // 1. If application/json format exists, use directly
    if (clipboardData.json) {
      return clipboardData.json;
    }

    // 2. If text/html format exists, convert HTML → JSON (using Converter)
    if (clipboardData.html) {
      return this._converter.parse(clipboardData.html, 'html');
    }

    // 3. If text/plain format exists, convert text → JSON
    if (clipboardData.text) {
      return this._textToJSON(clipboardData.text);
    }

    return [];
  }

  /**
   * Convert text to JSON node tree
   */
  private _textToJSON(text: string): INode[] {
    // 1. Convert text to paragraph + inline-text nodes
    // 2. Handle line breaks as paragraph separation
    // 3. Create JSON node tree
  }

  private async _readFromClipboard(): Promise<ClipboardData> {
    // 1. Use Clipboard API (navigator.clipboard.read)
    // 2. Read multiple formats (text/plain, text/html, application/json)
    // 3. Fallback: use clipboardData from paste event
  }
}
```

#### 4.1.3 Cut Command

**Purpose**: Copy + delete combination

**Required Command**:
```typescript
// packages/extensions/src/copy-paste.ts

export class CopyPasteExtension implements Extension {
  onCreate(editor: Editor): void {
    // ... copy, paste commands ...

    // 3. Register cut command
    editor.registerCommand({
      name: 'cut',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection = payload?.selection || editor.selection;
        if (!selection || selection.type !== 'range') {
          return false;
        }

        // Cut using Model operation (copy + delete)
        const cutResult = await transaction(editor, (control) => {
          return control(selection, [
            copy(selection),
            deleteTextRange(selection)  // or deleteRange(selection)
          ]);
        });

        // Save to clipboard API
        await this._writeToClipboard(cutResult.copyResult);
        return true;
      },
      canExecute: (editor: Editor, payload?: any) => {
        const selection = payload?.selection || editor.selection;
        return selection != null && selection.type === 'range' && !selection.collapsed;
      }
    });
  }
}
```

#### 4.1.4 Key Binding Registration

**Default Key Bindings (Planned)**:
```typescript
// packages/editor-core/src/keybinding/default-keybindings.ts

export const DEFAULT_KEYBINDINGS: Keybinding[] = [
  // ... existing keybindings ...
  
  // Copy/Paste/Cut
  {
    key: 'Mod+c',
    command: 'copy',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  },
  {
    key: 'Mod+v',
    command: 'paste',
    when: 'editorFocus && editorEditable'
  },
  {
    key: 'Mod+x',
    command: 'cut',
    when: 'editorFocus && editorEditable && !selectionEmpty'
  }
];
```

**Summary Table**:

| Key           | command | when                                               | Description                                 |
|--------------|---------|----------------------------------------------------|---------------------------------------------|
| `Mod+c`      | `copy`  | `editorFocus && editorEditable && !selectionEmpty`| Copy selected range to clipboard         |
| `Mod+v`      | `paste` | `editorFocus && editorEditable`                   | Paste clipboard content to current selection |
| `Mod+x`      | `cut`   | `editorFocus && editorEditable && !selectionEmpty`| Cut selected range (copy + delete)   |

---

### 4.2 Selection Rules After Paste (Flow Assuming Converter Usage)

How to position Selection after paste is key to copy/paste UX.  
Below are rules for **range selection + paste**, specifying where and how to paste model nodes created through Converter and how to move Selection.

#### 4.2.1 Pasting Single Inline Text Only

**Scenario**: Pasting only one `inline-text` fragment.

```text
Before:
[paragraph]
  [inline-text: "Hello ▮World"]

Clipboard (text/html → Converter → INode[]):
  [inline-text: "Test"]

Operation:
- "Test"를 caret 위치(Hello와 World 사이)에 삽입

After:
[paragraph]
  [inline-text: "Hello Test▮World"]
```

- **Rule**:  
  - If text range is `collapsed`, place caret at the **end** of pasted text.  
  - Selection type remains `range` with `collapsed: true`.

#### 4.2.2 Pasting Multiple Blocks

**Scenario**: Pasting two or more block nodes.

```text
Before:
[paragraph-1]
  [inline-text: "Hello"]
[paragraph-2]
  [inline-text: "▮World"]

Clipboard (html/markdown → Converter → INode[]):
  [paragraph-A: "AAA"]
  [paragraph-B: "BBB"]

Operation:
- selection.start 기준으로 paragraph-2 앞에 A, B 삽입

After:
[paragraph-1]
  [inline-text: "Hello"]
[paragraph-A]
  [inline-text: "AAA"]
[paragraph-B]
  [inline-text: "BBB▮"]
[paragraph-2]
  [inline-text: "World"]
```

- **Rule**:
  - If pasted blocks are one or more, place caret at the **end of the last inserted block**.
  - Selection type is `range` with `collapsed: true`.

#### 4.2.3 Pasting with Text Range Selected (Replacement)

```text
Before:
[paragraph]
  [inline-text: "He[llo Wo]rld"]   // []: selection range

Clipboard:
  [inline-text: "TEST"]

Operation:
- 선택된 범위를 삭제하고 "TEST" 삽입

After:
[paragraph]
  [inline-text: "HeTEST▮rld"]
```

- **Rule**:
  - If range selection is not empty, delete selected content first, then paste.
  - Caret is positioned at the **end of the last pasted inline fragment**.

#### 4.2.4 Pasting with Entire Block Selected (multi-block range)

```text
Before:
[paragraph-1]
  [inline-text: "[AAA]"]
[paragraph-2]
  [inline-text: "[BBB]"]
// selection: paragraph-1 끝 ~ paragraph-2 끝

Clipboard:
  [paragraph-X: "X"]

Operation:
- paragraph-1, paragraph-2 삭제
- paragraph-X 삽입

After:
[paragraph-X]
  [inline-text: "X▮"]
```

- **Rule**:
  - If selected range includes multiple blocks, delete those blocks and replace with pasted blocks.
  - Caret is positioned at the end of the last inserted block.

---

## 5. Implementation Order

### Phase 0: Create Converter Package
1. Create `@barocss/converter` package
2. Implement `HTMLConverter` class
3. Define conversion rule interfaces (`ConverterRule`, `ParseDOMRule`)
4. Define default conversion rules (`DEFAULT_HTML_RULES`)
5. Write test code

### Phase 1: DataStore Layer
1. Create `SerializationOperations` class
2. Implement `serializeRange()` (JSON serialization only)
3. Implement `deserializeNodes()` (JSON deserialization only)
4. Expose methods in `DataStore`
5. Write test code

### Phase 2: Model Layer
1. Define `copy`, `paste`, `cut` operations
2. Define DSL functions
3. Register in `register-operations.ts`
4. Write test code

### Phase 3: Extensions Layer
1. Create `CopyPasteExtension`
2. Implement `copy`, `paste`, `cut` commands
3. **Implement HTML conversion using Converter package**
4. Integrate clipboard API
5. Register key bindings
6. Write test code

### Phase 4: Integration Testing
1. Test complete flow
2. Test various formats (JSON, HTML, Text)
3. Test cross-node ranges
4. Test Mark preservation

---

## 6. Considerations

### 6.1 Clipboard Format Priority
1. **JSON format** (priority): Complete preservation of model structure
2. **HTML format**: Compatibility with external applications (JSON ↔ HTML conversion in Extension layer)
3. **Text format**: Fallback (JSON ↔ text conversion in Extension layer)

### 6.2 HTML Serialization/Deserialization Location
- **DataStore layer**: Responsible only for JSON serialization/deserialization (only knows model data)
- **Converter package**: Responsible for HTML ↔ JSON conversion
  - Define and register conversion rules
  - HTML tag → node type mapping
  - HTML tag → Marks mapping
  - Different from Renderer-DOM's actual rendering (semantic HTML)
- **Extension layer**: Perform conversion using Converter package

### 6.3 Converter Package-Based Conversion

**Our Approach**:
- **Converter package**: Responsible for conversion rule definition and actual conversion logic
- **Schema**: Defines only model structure (no conversion rules)
- **Loose coupling**: Converter only references Schema's node type names

**Advantages**:
1. **Clear responsibility separation**: Schema only for model structure, Converter only for conversion
2. **Schema purity**: Schema does not depend on conversion logic
3. **Converter independence**: Converter can work without Schema (using default rules)
4. **Extensibility**: Easy to add new conversion formats (Markdown, RTF, etc.)
5. **Reusability**: Converter can be used in other projects

**Usage Example**:
```typescript
// Define conversion rules in Converter package
import { HTMLConverter } from '@barocss/converter';
import { DEFAULT_HTML_RULES } from '@barocss/converter/rules';

const converter = new HTMLConverter();

// Register default rules
DEFAULT_HTML_RULES.forEach(rule => {
  converter.registerRule(rule.stype, rule);
});

// Reference Schema (for checking node type names)
converter.useSchema(schema);

// Use conversion
const nodes = converter.parse(html, 'html');
const html = converter.convert(nodes, 'html');
```

### 6.4 External HTML Paste Handling

**Issues**:
- HTML copied from external applications (browsers, word processors, etc.) may differ from our model structure
- Example: `<div><p><strong>Hello</strong> World</p></div>` (external HTML)
- Our model: `paragraph` → `inline-text` (marks: bold)

**Processing Strategy**:

1. **HTML Cleaning**:
   - Remove unnecessary wrapper tags (`<div><p>...</p></div>` → `<p>...</p>`)
   - Remove inline styles (`style="..."`)
   - Remove class names (`class="..."`)
   - Remove `<script>`, `<style>` tags

2. **Tag Mapping**:
   - Basic HTML tag → node type mapping (defined in Extension)
   - Handle unknown tags:
     - Block elements → convert to `paragraph`
     - Inline elements → extract text only and convert to `inline-text`

3. **Schema Validation**:
   - Node types in schema: use as-is
   - Node types not in schema: convert to default type
   - Example: `<div>` → `paragraph` (treated as block)

4. **Marks Processing**:
   - HTML tag → Marks mapping (`<strong>` → `bold`)
   - Handle nested Marks (`<strong><em>...</em></strong>` → `bold` + `italic`)

5. **Customization**:
   - Can override `_getNodeTypeFromHTMLTag()` in Extension
   - Can override `_getMarkFromHTMLTag()` in Extension
   - Can specially handle specific HTML structures

**Example: External HTML Processing**

```typescript
// HTML copied from external source
const externalHTML = `
  <div style="color: red;">
    <p><strong>Hello</strong> <em>World</em></p>
    <h1>Title</h1>
  </div>
`;

// 1. After cleaning
// <p><strong>Hello</strong> <em>World</em></p>
// <h1>Title</h1>

// 2. After conversion (JSON)
[
  {
    stype: 'paragraph',
    content: [
      {
        stype: 'inline-text',
        text: 'Hello',
        marks: [{ stype: 'bold', range: [0, 5] }]
      },
      {
        stype: 'inline-text',
        text: ' ',
        marks: []
      },
      {
        stype: 'inline-text',
        text: 'World',
        marks: [{ stype: 'italic', range: [0, 5] }]
      }
    ]
  },
  {
    stype: 'heading',
    attributes: { level: 1 },
    content: [
      {
        stype: 'inline-text',
        text: 'Title',
        marks: []
      }
    ]
  }
]
```

### 6.5 Paste Location Determination
- Insert based on `targetRange.startNodeId` and `targetRange.startOffset`
- Inside text node: insert text
- Between block nodes: insert new block

### 6.6 Mark Preservation
- On copy: include Mark information
- On paste: restore Mark information
- On HTML parsing: convert HTML tags to Marks

### 6.7 Security Considerations
- Clipboard read/write only allowed from user gestures (key input, etc.)
- XSS prevention on HTML parsing

### 6.8 Clipboard API Detailed Implementation

**Using ClipboardItem API**:
```typescript
private async _writeToClipboard(data: { json: INode[]; html: string; text: string }): Promise<void> {
  try {
    // Use ClipboardItem API (modern browsers)
    if (navigator.clipboard && navigator.clipboard.write) {
      const clipboardItems: ClipboardItem[] = [];
      
      // Save multiple formats simultaneously
      if (data.text) {
        clipboardItems.push(new ClipboardItem({
          'text/plain': new Blob([data.text], { type: 'text/plain' })
        }));
      }
      
      if (data.html) {
        clipboardItems.push(new ClipboardItem({
          'text/html': new Blob([data.html], { type: 'text/html' })
        }));
      }
      
      if (data.json) {
        clipboardItems.push(new ClipboardItem({
          'application/json': new Blob([JSON.stringify(data.json)], { type: 'application/json' })
        }));
      }
      
      await navigator.clipboard.write(clipboardItems);
      return;
    }
    
    // Fallback: document.execCommand('copy')
    // Copy text only using textarea
    const textarea = document.createElement('textarea');
    textarea.value = data.text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  } catch (error) {
    console.error('Failed to write to clipboard:', error);
    throw error;
  }
}
```

**Reading from Clipboard**:
```typescript
private async _readFromClipboard(): Promise<ClipboardData> {
  try {
    // Use ClipboardItem API (modern browsers)
    if (navigator.clipboard && navigator.clipboard.read) {
      const clipboardItems = await navigator.clipboard.read();
      const data: ClipboardData = {};
      
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type === 'text/plain') {
            data.text = await item.getType('text/plain').then(blob => blob.text());
          } else if (type === 'text/html') {
            data.html = await item.getType('text/html').then(blob => blob.text());
          } else if (type === 'application/json') {
            data.json = await item.getType('application/json')
              .then(blob => blob.text())
              .then(text => JSON.parse(text));
          }
        }
      }
      
      return data;
    }
    
    // Fallback: use clipboardData from paste event
    // (handled in event handler)
    return {};
  } catch (error) {
    console.error('Failed to read from clipboard:', error);
    throw error;
  }
}
```

**Security Constraints**:
- Clipboard API only available on HTTPS or localhost
- Can only be called from user gestures (key input, mouse click, etc.)
- May require permission request (some browsers)

### 6.9 Selection Position Determination After Paste

**Rules**:
1. **Paste inside text node**: Move cursor to end position of inserted text
2. **Paste between block nodes**: Move cursor to end of last inserted block
3. **Paste multiple nodes**: Move cursor to end of last node

**Implementation Example**:
```typescript
private _createSelectionAfterPaste(
  originalSelection: ModelSelection,
  insertedNodeIds: string[]
): ModelSelection {
  if (insertedNodeIds.length === 0) {
    return originalSelection;
  }
  
  // Find last inserted node
  const lastNodeId = insertedNodeIds[insertedNodeIds.length - 1];
  const lastNode = this.editor.dataStore.getNode(lastNodeId);
  
  if (!lastNode) {
    return originalSelection;
  }
  
  // If text node: move cursor to end of text
  if (lastNode.text !== undefined) {
    const textLength = lastNode.text.length;
    return {
      type: 'range',
      startNodeId: lastNodeId,
      startOffset: textLength,
      endNodeId: lastNodeId,
      endOffset: textLength,
      collapsed: true
    };
  }
  
  // If block node: move cursor to end of node
  // (find last text node in block node)
  const lastTextNode = this._findLastTextNode(lastNodeId);
  if (lastTextNode) {
    const textLength = lastTextNode.text?.length || 0;
    return {
      type: 'range',
      startNodeId: lastTextNode.sid!,
      startOffset: textLength,
      endNodeId: lastTextNode.sid!,
      endOffset: textLength,
      collapsed: true
    };
  }
  
  // Fallback: maintain original selection
  return originalSelection;
}

private _findLastTextNode(nodeId: string): INode | null {
  const node = this.editor.dataStore.getNode(nodeId);
  if (!node) return null;
  
  if (node.text !== undefined) {
    return node;
  }
  
  if (node.content && Array.isArray(node.content)) {
    // Traverse from last element of content array in reverse
    for (let i = node.content.length - 1; i >= 0; i--) {
      const childId = node.content[i];
      if (typeof childId === 'string') {
        const child = this._findLastTextNode(childId);
        if (child) return child;
      }
    }
  }
  
  return null;
}
```

### 6.10 Error Handling and Exception Cases

**Clipboard Access Failure**:
```typescript
try {
  await this._writeToClipboard(data);
} catch (error) {
  // Notify user (optional)
  console.error('Failed to copy to clipboard:', error);
  // Fallback: try document.execCommand('copy')
  // Or guide user to manual copy
}
```

**Conversion Failure**:
```typescript
try {
  const json = await this._clipboardDataToJSON(clipboardData);
  if (json.length === 0) {
    // Conversion failed: extract text only and create default paragraph
    return this._textToJSON(clipboardData.text || '');
  }
  return json;
} catch (error) {
  console.error('Failed to convert clipboard data:', error);
  // Fallback: extract text only
  return this._textToJSON(clipboardData.text || '');
}
```

**Schema Validation Failure**:
```typescript
try {
  const insertedNodeIds = editor.dataStore.deserializeNodes(json, targetParentId, targetPosition);
  // Success
} catch (error) {
  // Schema validation failed: convert to default type and retry
  const sanitizedJson = this._sanitizeNodesForSchema(json, editor.dataStore.getActiveSchema());
  const insertedNodeIds = editor.dataStore.deserializeNodes(sanitizedJson, targetParentId, targetPosition);
}
```

### 6.11 Performance Optimization

**When Copying Large Documents**:
- Minimize deep copying during serialization
- Optimize JSON.stringify (handle circular references)
- Serialize only when saving to clipboard (only when needed)

**When Parsing Complex HTML**:
- Remove unnecessary tags early in HTML cleaning stage
- Cache DOM parsing results (when reusing same HTML)
- Async parsing (for large HTML)

### 6.12 User Feedback

**On Copy Success**:
- Visual feedback (optional): toast messages, animations, etc.
- Accessibility: screen reader notifications

**On Paste Failure**:
- Clear error messages to user
- Guide fallback behavior

### 6.13 Browser Compatibility

**Clipboard API Support**:
- Chrome 66+, Edge 79+, Firefox 63+, Safari 13.1+
- Fallback: `document.execCommand('copy')` (older browsers)

**Paste Event Fallback**:
```typescript
// Handle paste event in editor-view-dom
handlePaste(event: ClipboardEvent): void {
  const clipboardData = event.clipboardData;
  if (!clipboardData) return;
  
  // Use clipboardData from paste event if Clipboard API is unavailable
  const data: ClipboardData = {
    text: clipboardData.getData('text/plain'),
    html: clipboardData.getData('text/html'),
    json: null // JSON format not supported in paste event
  };
  
  // Execute paste command
  this.editor.executeCommand('paste', { clipboardData: data });
}
```

---

## 7. Related Documents
- [Delete Extension Spec](./delete-extension-responsibilities.md)
- [Range Operations Spec](../datastore/docs/range-operations.md)
- [Model Operations Spec](../model/docs/operations.md)

