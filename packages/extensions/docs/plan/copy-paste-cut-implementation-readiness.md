# Copy/Paste/Cut Implementation Readiness

## Current Status Check

### ✅ Already Implemented

1. **RangeIterator**: Can traverse nodes within range  
   - `dataStore.createRangeIterator(startNodeId, endNodeId, options)`  
   - Already used in `extractText()`

2. **extractText()**: Text extraction available  
   - `RangeOperations.extractText(range)` - extracts text only

3. **createNodeWithChildren()**: Can create nested node structure  
   - `CoreOperations.createNodeWithChildren(node)` - usable in `deserializeNodes` implementation

4. **getNodeWithChildren()**: Can fetch node tree structure  
   - `QueryOperations.getNodeWithChildren(nodeId)` - usable in `serializeRange` implementation

5. **processNodeInModelSelection()**: Can handle partial node selection  
   - Private method in `RangeOperations` - usable for partial text extraction

6. **copyNode()**: Can copy single node  
   - `ContentOperations.copyNode(nodeId, newParentId?)` - single node copy

7. **SerializationOperations**: Implemented  
   - `SerializationOperations.serializeRange(range: ModelSelection): INode[]`  
   - `SerializationOperations.deserializeNodes(nodes: INode[], targetParentId: string, targetPosition?: number): string[]`  
   - Exposed via `DataStore.serializeRange(...)`, `DataStore.deserializeNodes(...)`

8. **@barocss/converter package**: Implemented and tested  
   - Core APIs: `defineParser`, `defineConverter`, `defineASTConverter`, `defineDocumentParser`  
   - Converter classes:
     - `HTMLConverter` (HTML ↔ Model)  
     - `MarkdownConverter` (Markdown/markdown-gfm ↔ Model)  
     - `LatexConverter` (LaTeX ↔ Model)  
   - Default rules:
     - `registerDefaultHTMLRules`, `registerDefaultMarkdownRules`, `registerDefaultLatexRules`  
     - Lists/tables/images/links, GFM task list, `data-*` attribute preservation, etc.
   - Platform-specific HTML cleaning and rules:
     - `OfficeHTMLCleaner`, `registerOfficeHTMLRules`  
     - `GoogleDocsHTMLCleaner`, `registerGoogleDocsHTMLRules`  
     - `NotionHTMLCleaner`, `registerNotionHTMLRules`
   - Tests:
     - `html-converter.test.ts`, `markdown-converter.test.ts`, `latex-converter.test.ts`  
     - `office-html-converter.test.ts`, `google-docs-html-converter.test.ts`, `notion-html-converter.test.ts`

### ❌ Not Implemented Yet

1. **Model Operations**: copy, paste, cut operations not implemented  
   - `copy()` operation (returns JSON + text, does not use Converter)  
   - `paste()` operation (accepts `INode[]`, calls DataStore.deserializeNodes)  
   - `cut()` operation (copy + deleteRange combination)  
   - Corresponding DSL functions

2. **CopyPasteExtension**: Does not exist  
   - Clipboard API integration  
   - Implement copy, paste, cut commands  
   - Clarify where Converter is used (detailed in sections 3/4 below)

---

## Additional Research Needed Before Implementation

### 1. serializeRange Implementation Strategy

**Issues**:
- RangeIterator returns only nodeId, so each node must be fetched with `getNodeWithChildren()`
- How to handle partially selected nodes (e.g., part of a text node)
- How to maintain node tree structure in cross-node ranges

**Considerations**:
```typescript
// Example: Partially selected text node
Before:
[paragraph-1]
  [text-1: "Hello World"]
           ↑---selected---↑ (offset 5-11)

After serializeRange:
[
  {
    stype: 'paragraph',
    content: [
      {
        stype: 'inline-text',
        text: ' Wor'  // Extract only partial text
      }
    ]
  }
]
```

**Approach**:
1. **Partial node handling**: Use `processNodeInModelSelection()` to extract partial text
2. **Maintain tree structure**: Find lowest common ancestor and rebuild tree structure
3. **Node splitting**: Split partially selected nodes into new nodes for serialization

### 2. deserializeNodes Implementation Strategy

**Issues**:
- Can use `createNodeWithChildren()`, but need logic to insert into existing nodes
- How to calculate `targetParentId` and `targetPosition`
- How to set relationships with existing nodes after insertion

**Considerations**:
```typescript
// Example: Paste inside text node
Before:
[text-1: "Hello"]
           ↑ cursor (offset 5)

Paste: " World"

After:
[text-1: "Hello World"]
                    ↑ cursor (offset 11)
```

**Approach**:
1. **Calculate targetParentId**: Find parent node of `selection.startNodeId`
2. **Calculate targetPosition**: Find index of `startNodeId` in parent's `content` array
3. **Node insertion**: Use `ContentOperations.addChild()` or `createNodeWithChildren()`

### 3. Converter Package API Summary (copy/paste focus)

**Implemented signatures (only portions used in copy/paste)**:

- **HTML → Model**
  ```typescript
  const converter = new HTMLConverter();
  const nodes: INode[] = converter.parse(html, 'html'); // format currently 'html' only
  ```

- **Model → HTML**
  ```typescript
  const converter = new HTMLConverter();
  const html: string = converter.convert(nodes, 'html'); // format currently 'html' only
  ```

- **Markdown / GFM → Model**
  ```typescript
  const mdConverter = new MarkdownConverter();
  const nodes: INode[] = mdConverter.parse(markdown, 'markdown');     // basic markdown
  const gfmNodes: INode[] = mdConverter.parse(markdown, 'markdown-gfm'); // GFM
  ```

- **Model → Markdown**
  ```typescript
  const mdConverter = new MarkdownConverter();
  const markdown: string = mdConverter.convert(nodes, 'markdown');
  ```

- **LaTeX → Model / Model → LaTeX** (usable for paste extension if needed)
  ```typescript
  const latexConverter = new LatexConverter();
  const nodes: INode[] = latexConverter.parse(latex, 'latex');
  const latexOut: string = latexConverter.convert(nodes, 'latex');
  ```

Copy/paste basic flow:

- **copy**: `DataStore.serializeRange` + `DataStore.range.extractText` + `HTMLConverter.convert`  
- **paste**: Read HTML/text/Markdown from clipboard,  
  use `HTMLConverter.parse` / `MarkdownConverter.parse` to create `INode[]`, then pass to `DataStore.deserializeNodes`.

### 4. Paste Target Location Logic

**Clarify**:
- How to implement `_getTargetParentId()`
- How to implement `_getTargetPosition()`
- Paste inside text node vs paste between block nodes

**Considerations**:
```typescript
// Case 1: Inside text node
selection: { startNodeId: 'text-1', startOffset: 5 }
→ targetParentId: parent of 'text-1' (e.g., 'paragraph-1')
→ targetPosition: index of 'text-1' in 'paragraph-1.content'
→ but actual insertion is inside text node

// Case 2: Between block nodes
selection: { startNodeId: 'paragraph-1', startOffset: 0 }
→ targetParentId: parent of 'paragraph-1' (e.g., 'document')
→ targetPosition: index of 'paragraph-1' in 'document.content'
→ insert new block before 'paragraph-1'
```

### 5. Cross-node Range Handling

**Issues**:
- When multiple nodes are selected, need to find lowest common ancestor and rebuild tree structure
- How to handle partially selected nodes

**Example**:
```
Before:
[paragraph-1]
  [text-1: "Hello"]
[paragraph-2]
  [text-2: "World"]
         ↑---selected---↑ (from end of text-1 to offset 3 of text-2)

After serializeRange:
[
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'o' }  // end part of text-1
    ]
  },
  {
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'Wor' }  // start part of text-2
    ]
  }
]
```

---

## Implementation Readiness Assessment

### ✅ Ready
- Base infrastructure: RangeIterator, extractText, createNodeWithChildren, etc.
- Documentation: Spec docs written in detail
- Architecture decisions: Converter package decoupled, pure object approach, etc.

### ⚠️ Further Research Needed
1. **serializeRange details**: Partial node handling, tree structure preservation (edge cases on top of base implementation)  
2. **deserializeNodes details**: Insertion position calculation for various selection types, relationship setup  
3. **Paste target location**: Concrete implementation and tests for `_getTargetParentId`, `_getTargetPosition`  
4. **copy/paste Model operations**: Define `copy`/`paste`/`cut` operations and DSL, organize patterns with Delete/Enter combinations  
5. **CopyPasteExtension design**: Test scenarios linking Converter/clipboard/Model operations (complex selection, table/list, etc.)

---

## Recommended Implementation Order

### Phase 0: Converter Package (Done)

**Status**:
- `@barocss/converter` package created and basic API/rules/tests implemented
- Baseline support for HTML/Markdown/LaTeX + Office/GoogleDocs/Notion HTML

**Next steps (copy/paste focus)**:
- Finalize minimal rule/cleaner combinations to use in CopyPasteExtension
- Define additional conversion rules per project if needed to match Schema

### Phase 1: DataStore Layer (Mostly Done)
**Why**: 
- Used by Model layer
- Relatively simple (leverages existing infrastructure)

**Work (Done)**:
1. Create `SerializationOperations` class  
2. Implement `serializeRange()`  
   - Use RangeIterator  
   - Partial node handling  
   - Preserve tree structure  
3. Implement `deserializeNodes()`  
   - Use `createNodeWithChildren()`  
   - Calculate insertion position  
4. Write tests

**Additional hardening needed**:
- Add regression tests for serialize/deserialize on complex cross-node selection, table/list structures

### Phase 2: Model Layer
**Why**: 
- Used by Extensions layer
- Wraps DataStore functions

**Work (Planned)**:
1. Define `copy`, `paste`, `cut` operations (use DataStore only, not Converter)  
2. Define DSL functions  
3. Register in `register-operations.ts`  
4. Write tests (use same transaction pattern as Delete/Enter/Selection extensions)

### Phase 3: Extensions Layer
**Why**: 
- End-user interface
- Implement after all lower layers are ready

**Work (Planned)**:
1. Create `CopyPasteExtension`  
2. Integrate Clipboard API  
3. Implement copy, paste, cut commands  
   - copy: `transaction` + `copy` operation → `CopyResult(json, text)` → generate HTML with `HTMLConverter.convert` then store `text/plain`, `text/html`, `application/json` to clipboard  
   - paste: read `application/json` / `text/html` / `text/markdown` / `text/plain` from clipboard, create `INode[]` via Converter, pass to `paste` operation  
   - cut: `transaction` + `cut` operation → `CutResult(json, text)` → store to clipboard same as copy  
4. Register key bindings  
5. Write tests (mock browser Clipboard API + converter round-trip verification)

---

## Conclusion

### ✅ Ready to Start
- Base infrastructure is prepared
- Spec docs are detailed
- Implementation strategy is clear

### ⚠️ Notes
1. Must implement **Converter package first** (other phases depend on it)
2. **Carefully design partial node handling** in serializeRange implementation
3. **Precisely calculate insertion position** in deserializeNodes implementation

### 📋 Next Steps
1. Create and implement Converter package
2. Implement SerializationOperations
3. Implement Model operations
4. Implement CopyPasteExtension

---

## Reference Documents
- [Copy/Paste/Cut Spec](./copy-paste-cut-spec.md)
- [Converter Architecture](./converter-architecture-options.md)
- [LaTeX Converter Sample](./converter-latex-sample.md)

