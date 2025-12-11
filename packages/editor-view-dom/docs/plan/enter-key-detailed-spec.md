## Enter Key Detailed Spec (`enter-key-detailed-spec.md`)

### 1. Goals and Scope

- **Goals**
  - Define model-first behavior for **splitting blocks / creating new blocks / inserting line breaks** when Enter is pressed.
  - Handle with the same **Model-first + Command pattern** used for Backspace / DeleteForward / MoveSelection.
- **Scope**
  - Enter behavior for `SelectionType = 'range' | 'node'`.
  - Nodes with `group: 'block'` / `group: 'inline'`, and nodes with `editable` / `atom` flags.
  - Default rules based on `paragraph`, plus schema extension points.

---

### 2. Architecture Overview

#### 2.1 Event Flow

```
KeyboardEvent(Enter)
   ↓
EditorViewDOM.handleKeydown
   ↓  (key === 'Enter')
EditorViewDOM.insertParagraph()
   ↓
DOMSelection → ModelSelection conversion
   ↓
editor.executeCommand('insertParagraph', { selection })
   ↓
ParagraphExtension._insertParagraph(editor, selection)
   ↓
DataStore transaction (split / create / merge)
   ↓
ModelSelection update
   ↓
EditorViewDOM (selection-handler) → apply DOMSelection
```

#### 2.2 Separation of Responsibilities

- **EditorViewDOM**
  - Converts DOMSelection to ModelSelection.
  - Passes Enter input only as an `insertParagraph` command call.
- **ParagraphExtension**
  - Registers the `insertParagraph` command.
  - Decides **where and how to split which block** based on schema and selection.
- **DataStore**
  - Performs node split / new node creation / child reordering as a transaction.

---

### 3. Default Rules (Paragraph Baseline)

#### 3.1 Preconditions

- `paragraph`:
  - `group: 'block'`
  - Children are **inline nodes** (`inline-text`, `inline-image`, etc.).
  - Text is an `inline-text` node with a `.text` field.
- Enter **always operates relative to the current block**:
  - If selection is inside block text → **split current block**.
  - If selection is at block start/end → **create a new block**.

#### 3.2 Caret Inside Paragraph Text (split)

**Scenario A: Single paragraph, caret at a middle offset**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello│World") │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P2)                          │
│  └─ inline-text (sid: T2, text: "World")    │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

- **Split** the selected `inline-text` node.
  - left: `"Hello"`
  - right: `"World"`
- Keep only the left text in current paragraph (P1).
- Create **new paragraph (P2)** after P1 under the same parent block container.
  - Add an `inline-text` (T2) with the right text.
- Place caret at start of the first text node in the new paragraph.

Current implementation:

- In `ParagraphExtension._insertParagraph`
  - Only when parent paragraph has a **single text child** (`content.length === 1` and the child is the selected text node)  
    it performs `dataStore.splitTextNode` + `dataStore.splitBlockNode`.
  - If there are multiple children or inline-images mixed in, split is not yet performed and returns `false` (no-op).

---

### 4. Enter at Paragraph Boundaries

#### 4.1 Enter at Paragraph End (create empty paragraph after)

**Scenario B: Caret at last offset of paragraph**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello│")   │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P2)                          │
│  └─ inline-text (sid: T2, text: "")         │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

- No need to split current paragraph (P1); **append empty paragraph (P2)** under same parent.
- Place caret at offset 0 of P2’s first inline-text (T2).

#### 4.2 Enter at Paragraph Start (create empty paragraph above)

**Scenario C: Caret at start offset of paragraph**

Before:

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "│Hello")   │
└──────────────────────────────────────────────┘
```

After (Enter):

```
┌──────────────────────────────────────────────┐
│ paragraph (sid: P0)                          │
│  └─ inline-text (sid: T0, text: "")         │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ paragraph (sid: P1)                          │
│  └─ inline-text (sid: T1, text: "Hello")    │
└──────────────────────────────────────────────┘
                ▲
                └─ caret: (P0, T0, offset 0)
```

Operation:

- Insert **empty paragraph (P0)** before current paragraph (P1).
- Place caret at offset 0 of P0’s first inline-text (T0).

Current implementation:

- In `ParagraphExtension._insertParagraph`
  - Finds grandParent of parent paragraph,
  - Creates new paragraph (P0) with same stype and attributes,
  - Inserts P0 before P1 in grandParent.content to implement the above rule.

---

### 5. Enter with RangeSelection

#### 5.1 RangeSelection Within Same Paragraph

**Scenario D: Range selection within a single paragraph**

Before:

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "He[llo W]orld")          │
│                        ^    ^                             │
│                      start end                            │
└────────────────────────────────────────────────────────────┘
```

After (Enter):

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "He")                     │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2)                                        │
│  └─ inline-text (sid: T2, text: "orld")                   │
└────────────────────────────────────────────────────────────┘
                ▲
                └─ caret: (P2, T2, offset 0)
```

Operation:

1. Delete the RangeSelection span (`[start, end)`).
   - Logical text becomes `"He" + "orld"`.
2. Apply the **same split rule as single-caret Scenario A** at the resulting caret offset.
   - Equivalent to pressing Enter at `"He│orld"`.

Current implementation:

- If RangeSelection (`collapsed === false`), `insertParagraph` currently returns `false` (not implemented).
- Future plan for RangeSelection Enter:
  - Delete range via `dataStore.range.deleteText(selection)`,
  - Then re-run `insertParagraph` logic based on the resulting caret position.

#### 5.2 RangeSelection Across Multiple Blocks

**Scenario E: Range from end of paragraph-1 to middle of paragraph-2**

Before:

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "Hello[")                 │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2)                                        │
│  └─ inline-text (sid: T2, text: "Wo]rld")                 │
└────────────────────────────────────────────────────────────┘
```

After (Enter):

```
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P1)                                        │
│  └─ inline-text (sid: T1, text: "Hello")                  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ paragraph (sid: P2')                                       │
│  └─ inline-text (sid: T2', text: "rld")                   │
└────────────────────────────────────────────────────────────┘
                ▲
                └─ caret: (P2', T2', offset 0)
```

Operation:

1. Delete **all content inside blocks** covered by the RangeSelection.
   - Remove text after selection start in P1 and text before selection end in P2.
   - Remove all blocks between P1 and P2.
2. After deletion, caret sits at **the boundary between P1 and P2**.
3. From this state, Enter follows **Scenario B** (Enter at block end).
   - Final result: keep P1, create new paragraph (P2'), caret at start of P2'.

Current implementation/plan:

- Currently supports only **RangeSelection within the same text node**:
  - Call `dataStore.range.deleteText(selection)` → create collapsed selection at `startOffset` →  
    reuse single-caret rules from Section 3.
- For multi-block/mixed-node ranges, plan steps:
  1. Delete entire range with `dataStore.range.deleteText(selection)`.
     - Clear tails/heads of start/end texts and intermediate text nodes per schema rules.
  2. Compute caret position as **ModelSelection** after deletion.
     - v1: place caret using `startNodeId/startOffset`,
     - later: datastore-level tests to ensure caret lands naturally after deletion.
  3. Invoke `insertParagraph` again with the collapsed selection.
     - Goal: produce structure equivalent to Scenario E (front block + new paragraph).

---

### 6. Special Blocks and Schema Extensions

#### 6.1 `editable: true` blocks (codeBlock, mathBlock, etc.)

- `group: 'block'`, `editable: true`, `.text` field → treat as **single text block**.
- Enter rules:
  - Enter inside same block:
    - Insert newline (`\n`) into internal text.
    - Do **not** split the block.
  - RangeSelection:
    - Delete selected range, then insert a single `\n`.

Current implementation:

- Special handling for `editable: true` blocks not implemented yet.
- When Enter is pressed in such blocks, `insertParagraph` returns `false` for non-text parent/node, so no structural change occurs.

#### 6.2 `atom: true` blocks (table, imageBlock, etc.)

- `group: 'block'`, `atom: true` → **not a split target** on Enter.
- When caret is a NodeSelection on an atom block and Enter is pressed:
  - Default: create a **paragraph below** the atom block.
  - Caret moves to start of the new paragraph.

Current implementation:

- Enter behavior for NodeSelection and `atom: true` blocks not yet implemented.
- If Enter is invoked on non-text nodes like inline-image, current logic detects non-text and returns `false`.

#### 6.3 Schema Extension Points

- In each `NodeTypeDefinition`, consider:
  - `enterBehavior?: 'split' | 'lineBreak' | 'afterBlock' | 'beforeBlock' | 'custom'`
  - `enterHandler?: (context) => EnterBehaviorResult`
- Default rules:
  - `group: 'block'` + `editable !== true` → `enterBehavior: 'split'` (paragraph style).
  - `group: 'block'` + `editable === true` → `enterBehavior: 'lineBreak'`.
  - `group: 'block'` + `atom === true` → `enterBehavior: 'afterBlock'`.

---

### 7. Pseudo-code (ParagraphExtension baseline)

```ts
function handleInsertParagraph(selection: ModelSelection) {
  if (selection.type !== 'range') return false;

  if (!selection.collapsed) {
    // 1) If RangeSelection, delete first (not implemented)
    // deleteRange(selection);
    // Convert to collapsed selection after delete
    // selection = getCollapsedSelectionAfterDelete();
    return false; // reflects current implementation
  }

  const { startNodeId, startOffset } = selection;
  const textNode = getNode(startNodeId);

  if (typeof textNode.text === 'string') {
    const parentBlock = getParentBlock(textNode);
    const blockType = getNodeType(parentBlock.stype);

    if (blockType.group === 'block' && blockType.editable !== true && !blockType.atom) {
      // paragraph-like block split
      return splitParagraphLikeBlock(parentBlock, textNode, startOffset);
    }

    if (blockType.group === 'block' && blockType.editable === true) {
      // codeBlock style: internal line break
      return insertLineBreakInEditableBlock(textNode, startOffset);
    }
  }

  // atom block, or caret at block boundary
  return insertParagraphAfterCurrentBlock(selection);
}
```

Based on this spec, next steps:

- Implement `ParagraphExtension.insertParagraph` with actual DataStore operations, and
- Add Enter unit tests following the same patterns used for Backspace / DeleteForward / MoveSelection.
