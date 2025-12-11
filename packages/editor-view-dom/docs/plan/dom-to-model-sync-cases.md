## DOM → Model Synchronization Cases (`contenteditable`-based Editing)

This document organizes case-by-case how to reflect changes to the model (= DOM → model synchronization) when the browser changes the DOM first in a `contenteditable` environment.

Premises:
- **Model is the final source of truth.**
- However, due to `contenteditable` characteristics, **there are moments when DOM changes first and model must follow.**
- This document defines such moments as "DOM-origin change" cases.

---

## 1. Common Rules

### 1.1 Directionality Rules

- **Model-origin Change**  
  - Trigger: Command execution, DataStore API calls, direct `editor.render()` calls in code  
  - Flow: **Model → VNode → DOM**  
  - MutationObserver **ignores** or skips by identifying with internal flag as "change made by itself".

- **DOM-origin Change**  
  - Trigger: Browser's default editing behavior (`contenteditable`), IME, paste, some key inputs  
  - Flow: **DOM (change occurs) → MutationObserver detects → model patch → VNode → DOM re-render**  
  - All cases covered in this document are DOM-origin changes.

### 1.2 Common Processing Pipeline

All DOM-origin changes use the following pipeline in common.

1. **DOM Change Detection**
   - `MutationObserver` collects `childList` / `characterData` changes.
2. **Target Node Identification**
   - Follow `data-bc-sid` chain upward to  
     identify which `inline-text` / `block` / `decorator-root` the change is for.
3. **DOM selection → Model selection Conversion (if needed)**
   - Read DOM selection immediately after change to  
     convert to model selection information like `SelectionState` / `contentRange`.
4. **Text/Structure Diff Analysis**
   - If only text changed: Use `analyzeTextChanges` from `@barocss/text-analyzer`  
   - If structure (node add/delete/merge/split) changed: Classify as separate case (see case sections below)
5. **Model Patch with DataStore Operations**
   - Text change → `dataStore.range.replaceText(...)`  
   - Node insert/delete/merge → `dataStore.range.insertText`, `deleteText`, block-related commands, etc.
6. **Rendering and Selection Synchronization**
   - Regenerate VNode → DOM with `editor.render()`
   - Remap model selection to DOM selection to restore cursor/range.

---

## 2. Case Classification Overview

DOM-origin changes are classified into the following four top-level categories.

1. **C1: Pure text change within single `inline-text` (structure unchanged)**
2. **C2: Text change spanning multiple `inline-text` / inline nodes (structure logically same)**
3. **C3: Browser changed block structure (Enter/Backspace/paste, etc.)**
4. **C4: Browser-origin change for marks/styles/decorators**

Each case specifies "allow/disallow" and "DataStore operation mapping".

---

## 3. C1: Pure Text Change Within Single `inline-text`

### 3.1 Definition

- Only text changes within DOM area corresponding to one `inline-text` node.
- DOM structure (tags/nesting/mark wrappers) remains **logically identical**.
- Examples:
  - `"abc"` → `"abx"` (single character replacement)
  - `"abc"` → `"abcd"` (insertion)
  - `"abc"` → `"ac"` (deletion)

### 3.2 Detection Criteria (MutationObserver)

- `characterData` change occurs, and
- Can find node with `data-bc-sid="...inline-text..."` in parent chain of changed text node, and
- `childList` changes limited to "text node replacement" level.

### 3.3 Model Synchronization Procedure

1. **Identify Model Target**
   - `data-bc-sid` → `inline-text` node's `sid` → corresponding model node ID.
2. **Text Diff Analysis**
   - Read prev/next DOM text to  
     call `analyzeTextChanges(prevText, nextText)`.
   - Convert result to `contentRange`(startOffset, endOffset, insertedText).
3. **DataStore Operation**
   - Call `dataStore.range.replaceText({ nodeId, startOffset, endOffset }, insertedText)`.
   - Already implemented `replaceText` internally performs:
     - Mark split/merge, range adjustment
     - Decorator range adjustment (`DecoratorOperations`)
4. **Render and Selection Restoration**
   - Call `editor.render()`
   - Convert DOM selection immediately before change to model selection and store,  
     then remap to DOM selection after render.

### 3.4 Allow/Disallow Judgment

- **Allowed**: C1 is actively allowed because even if browser changes DOM first,  
  the same text change can be expressed in the model.

---

## 4. C2: Text Change Spanning Multiple Inline Nodes (Logical Structure Same)

### 4.1 Definition

- User performs typing/deletion/paste with range selection, causing  
  multiple `inline-text` / mark-wrapper / decorator-wrapped text to change together.
- But **logical inline structure** can be maintained.
  - Example: When `bold + italic` marks continue to cover entire range
  - Example: When multiple `inline-text` merge or split, can still be viewed as single text run

### 4.2 Detection Criteria

- `childList` + `characterData` concentrated in **contiguous inline area**, and
- When comparing before/after:
  - Block boundaries (`<p>`, `<li>`, etc.) maintained,
  - Mark wrapper / decorator root structure can be maintained,
  - Only text content significantly different.

### 4.3 Model Synchronization Procedure

1. **Calculate `contentRange` Based on Selection Range**
   - Convert DOM selection's anchor/focus to  
     `inline-text` + offset → model selection.
   - If selection spans multiple `inline-text`,  
     `contentRange` can span multiple nodes.
2. **Extract Flattened Text**
   - "Flatten" text in DOM section corresponding to selection into single string.
   - Flatten text in same range from DOM after change and compare.
3. **DataStore Operation**
   - Call `dataStore.range.replaceText(contentRange, nextFlatText)`.
   - At this time:
     - Multiple `inline-text` and marks normalized in single operation.
     - Marks merged/adjusted according to `replaceText`'s mark-normalization logic.
4. **Render and Selection Restoration**
   - Render + selection reset in same way as C1.

### 4.4 Allow/Disallow Judgment

- **Allowed**: C2 is also allowed as it is a general text editing case.
- However, if structure cannot actually be maintained, classify as C3.

### 4.5 Wide Selection + Typing Scenario (During Real-time Input)

This scenario satisfies the following conditions:

- User holds **wide selection** (multiple words/multiple `inline-text`) and types immediately.
- Not IME composition, but **direct input (English, etc.)** reflected to DOM with each key.
- Even if model changes slightly with each key input during input,  
  **cursor/selection must remain natural and "not break" from user's perspective**.

#### 4.5.1 Flow Overview

1. User inputs one key while long range is selected.
2. Browser deletes entire selection range and inserts new text node(s).
3. MutationObserver detects this DOM change.
4. We interpret this DOM change as "**replacing entire selection range with single new text**" to:
   - Calculate `contentRange` (previous selection range) and
   - Call `range.replaceText(contentRange, insertedText)`.
5. DataStore updates model including marks/decorators.
6. Regenerate DOM with `editor.render()`, then  
   remap model selection corresponding to **cursor position after input** to DOM selection.

#### 4.5.2 Interpretation of "Should Not Re-render During Input"

Here, "should not re-render" means:

- **From user's perspective, cursor should not jump or selection should not move to strange places with each input**, not
- Technically never call `editor.render()`.

Our strategy is as follows:

- **Model is updated immediately with each key input**.  
  - Reason: Need synchronization with undo/redo, collaboration, Devtool, other views (e.g., minimap/outline).
- Also call `editor.render()` after each key input, but:
  - **Accurately map current DOM selection to model selection** before render, and
  - **Restore same model selection to DOM selection** after render.
- This way:
  - Internally "input → model patch → render" occurs each time, but
  - **Cursor/selection appears to continue naturally** from user's perspective.

For IME (Korean, etc.) input:

- Minimize render during composition intermediate stages, or  
  use strategy of applying `replaceText` via C1/C2 path only at composition completion (final string confirmed).
- This connects with methods in `input-event-editing-plan.md` / `input-rendering-race-condition.md`  
  for safely catching composition completion timing without using composition events.

#### 4.5.3 Answer to "Is MutationObserver Alone Sufficient?"

To accurately handle this scenario, **MutationObserver alone is insufficient**, and the following are also needed:

1. **Previous State of Model**
   - `prevText` / `prevMarks` come from **model, not DOM.**
   - `prevText` in `analyzeTextChanges(prevText, nextText)` is always model-based.
2. **DOM Selection Information**
   - Cannot know "where was selected" from MutationRecord alone.
   - Must read **DOM selection (anchor/focus)** immediately after change to  
     convert to model selection / `contentRange`.
3. **Input Type Information (Optional)**  
   - If "whether this change is typing, paste, or Enter" from `beforeinput` / `keydown`  
     is kept like a tag, case classification (C1/C2/C3/C4) in MutationObserver can be more accurate.

That is:

- **MutationObserver only tells "what changed (result DOM)".**
- "**Previous state (prev)**", "**selection range (selection)**", "**action intent (inputType/key info)**" must  
  come from **model + selection layer + event layer**.

In our design:

- Read **result** of DOM-origin change from MutationObserver, and
- Get **previous state/selection/action type** from existing:
  - DataStore model
  - SelectionManager
  - `beforeinput`/`keydown` handling
  to **map to C1/C2/C3/C4 cases**.

Using this combination, even in wide selection + typing situations:

- Even if DOM is created first  
  → Create **accurate `replaceText` operation** with MutationObserver + model/selection information  
  → Make **cursor/selection remain natural** even after `editor.render()`.

---

## 5. C3: Browser Changed Block Structure

### 5.1 Definition

- Browser changes block-level element structure due to  
  `Enter`, `Backspace`, `Delete`, paste, etc.
- Examples:
  - `<p>` split into two with `Enter`
  - Two `<p>` merged with `Backspace`
  - Block tree significantly changed when structure like `<div><p>...</p></div>` comes in via paste

### 5.2 Principle

- **Structure changes are handled directly in `beforeinput` in principle**.  
  - `insertParagraph`, `insertLineBreak`, `historyUndo`, `historyRedo`, etc. are  
    handled only via **model → DOM** path after `preventDefault()` in `beforeinput`.
- Therefore, cases where MutationObserver sees C3 are limited to the following two situations:
  1. `beforeinput` does not come due to browser/platform differences, or inputType is non-standard
  2. Special cases we have not yet handled (e.g., blocks included in paste)

### 5.3 C3 Processing Strategy

#### 5.3.1 When Possible: Express as Command Combination

- If structure change detected by MutationObserver can be  
  expressed as a combination of existing commands, process in the following order:

1. Structure Pattern Recognition
   - Example: `<p>AAA⦿BBB</p>` with Enter → `<p>AAA</p><p>⦿BBB</p>`
   - Compare with model selection/node information to determine "this is insertParagraph pattern".
2. Execute Corresponding Command
   - `editor.executeCommand('insertParagraph')`
3. **Ignore** DOM created by browser, and  
   use DOM re-rendered from command result as basis.

#### 5.3.2 When Not Expressible: Fallback Policy

- When structure not in model schema comes in via paste, etc., or  
  difficult to express with existing command combinations:

1. **Extract Only Allowed Text/Inline**
   - Discard block structure, flatten only text and allowed inline elements.
2. Reconstruct Block Boundaries According to Model Rules
   - Example: Divide text based on current block and insert as multiple paragraphs.
3. Patch model with `dataStore.range.replaceText` + block insert command combination.

### 5.4 Allow/Disallow Judgment

- **Structure changes are allowed only as "model-origin" in principle**.  
  - That is, when C3 situation occurs:  
    - Recognize as command pattern as much as possible to reinterpret as "model-origin action".
    - If not possible, "safely absorb only text" with fallback policy.

---

## 6. C4: Browser-origin Change for Marks/Styles/Decorators

### 6.1 Definition

- Depending on browser/platform, **Native Bold/Italic/Underline** actions can  
  directly apply styles to `contenteditable`.
  - Example: When user presses `Ctrl+B` and we fail to prevent it,  
    browser directly inserts `<b>`, `<strong>`, `style="font-weight: bold"`, etc.
- Also, inline styles can come in as-is during paste in some environments.

### 6.2 Principle

- Goal is to **manage marks/styles/decorators only in model**.
- Therefore, styles/tags directly created by browser are  
  projected to **model's marks/decorators and then normalize DOM structure** as much as possible.

### 6.3 Processing Strategy

1. **Block Native Formatting Shortcuts in keydown as Much as Possible**
   - `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, etc. are `preventDefault()` in `keydown` and  
     handled with `toggleMark('bold')`, etc.
   - This greatly reduces C4 occurrence frequency.

2. **Handle Styles Coming in via Paste**
   - Paste is designed to extract **text + minimal mark information** in MutationObserver.
   - Allow policy:
     - Allowed: Styles mappable to marks we already support (bold/italic/underline, etc.)
     - Disallowed: Styles not in schema (font, color, line height, etc.) → drop or map to separate decorator

3. **Convert Tags Created by Browser to Model Marks**
   - Example: `<b>text</b>` → `inline-text` + `marks: [{ stype: 'bold', range: ... }]`
   - Afterward, render only with mark wrapper structure we defined.

### 6.4 Allow/Disallow Judgment

- **Allowed**:
  - Basic formatting information (bold/italic/underline, etc.) with clear user expectation from paste, etc.
  - And when it can be accurately mapped to model's mark/decorator
- **Disallowed or Strong Normalization**:
  - Arbitrary styles/tags not defined in schema
  - In this case, extract only text or encapsulate minimal information as decorator.

---

## 7. Case-by-Case Summary Table

| Case | Example | Detection Method | DataStore Operation | Allow/Disallow |
|------|---------|------------------|---------------------|----------------|
| C1: Single `inline-text` text change | `abc` → `abx` | `characterData` + `inline-text sid` | `range.replaceText` | Allowed |
| C2: Text change spanning multiple inline | `bold+italic` area overwrite | `childList`+`characterData` in contiguous inline area | `range.replaceText` (contentRange) | Allowed |
| C3: Block structure change | `<p>AAA⦿BBB</p>` → `<p>AAA</p><p>⦿BBB</p>` | block-level `childList` change | If possible `insertParagraph` etc. command, otherwise fallback | Limited allow (reinterpret as command) |
| C4: Mark/style/decorator change | `<b>text</b>` insertion | Inline tag/style change | Map to marks/decorators then normalize | Limited allow (policy-based) |

---

## 8. Additional Browser-origin Cases to Consider

In addition to C1–C4 above, the following DOM-origin cases can occur in actual browsers/platforms.

### 8.1 Auto Correction / Smart Features (Autocorrect, Smart Quotes, etc.)

**Examples**:
- `"test"` → `"Test"` (automatic capitalization of first letter in sentence)
- `"` → `"` / `"` (smart quotes)
- Automatic typo correction (`teh` → `the`) – depending on OS/browser settings

**How Other Editors Handle**:
- Many code editors/rich text editors **disable or minimize OS/browser auto correction features**.
- ProseMirror/Slate, etc. view text changes as single `insertText` / `deleteText` operation and reflect to model.

**Our Policy Candidates**:
- **Absorb into C1/C2 text change cases**.
  - Since it's ultimately the same in that "text changed",  
    normalizing with `range.replaceText` is sufficient.
- However, auto correction can subtly change marks/decorators ranges, so  
  testing whether mark-normalization logic is stable is needed.

### 8.2 Automatic Link Generation / URL Detection

**Example**:
- When `https://example.com` is entered, browser can automatically wrap it with `<a>`.

**How Other Editors Handle**:
- ProseMirror/Tiptap:
  - Usually use their own **InputRule** (e.g., URL pattern detection) to add link mark instead of browser default behavior.
  - That is, prevent "browser creating `<a>`" and  
    design so "model adds link mark".

**Our Policy Candidates**:
- **Block browser's automatic link generation in principle**.
  - `preventDefault()` as much as possible in keydown + `beforeinput` stage, then  
    handle URL pattern detection at model/command level.
- If MutationObserver detects new `<a>`:
  - If allowed: Map like C4 "style/tag → decorator/mark".
  - If disallowed: Extract only text and remove `<a>`.

### 8.3 Spell/Grammar Check Display (Squiggly Underline, etc.)

**Characteristics**:
- Most browser/OS spell check features  
  **operate only in rendering layer, do not change actual DOM tree, or use separate shadow layer**.
- Often not detected by MutationObserver.

**Policy**:
- **Completely ignore** as long as DOM tree is not changed.
- If specific browser touches DOM for spell check display:
  - Judge similar to C4 as "decorator not in schema" and establish policy to remove/ignore.

### 8.4 Drag & Drop (From Inside/Outside Editor)

**Examples**:
- Drag text/block inside editor and drop at different location.
- Drag text/HTML from external page/app and paste.

**How Other Editors Handle**:
- ProseMirror/Slate/TinyMCE, etc.:
  - Usually intercept `drop` event and  
    **block browser default DnD insertion, then manipulate model with own clipboard/insert API**.

**Our Policy Candidates**:
- **Block default DnD insertion as much as possible**,  
  in `drop` event:
  - If internal drag: Move model with `delete + insert` command combination
  - If external drag: Same pipeline as paste (clipboard/text normalization → model insertion)
- If detected only in MutationObserver:
  - Interpret as "paste + delete" combination and handle with C2/C3 + paste policy.

### 8.5 IME Special Cases (Intermediate Composition State DOM)

**Characteristics**:
- During IME composition, browser creates **temporary DOM state** multiple times.
- As we already designed:
  - Do not use composition events, and
  - Use strategy of processing only final confirmed text via MutationObserver → `replaceText`.

**Additional Considerations**:
- If some browsers/platforms have bugs/characteristics that touch block structure during composition,  
  prioritize C3 policy (structure changes allowed only in beforeinput/command in principle) and  
  choose method to ignore intermediate composition DOM as much as possible.

---

## 9. Summary of Other Editors' DOM-origin Processing Strategies

The following is a summary of how major editors handle DOM-origin changes.

### 9.1 ProseMirror / Tiptap

- **Core Idea**:
  - Block browser default behavior as much as possible and **handle all editing with command/keymap/inputRule**.
- Main Strategies:
  - Intercept keydown with `prosemirror-keymap`, most structure changes occur only via command.
  - Combine `beforeinput` / `input` / `composition` events with  
    `handleDOMEvents`, `handleTextInput`, `handleKeyDown`, etc. to  
    intervene "before browser breaks DOM".
  - Even when DOMChange is unavoidable (`handleDOMChange`),  
    reparse DOM to reconstruct ProseMirror model → regenerate DOM again.
- Conclusion:
  - ProseMirror **hardly allows DOM-origin changes and  
    enforces "DOM is projection of ProseMirror model" as much as possible**.

### 9.2 Slate.js

- React-based model-view structure:
  - React tree represents model, DOM is its projection.
- Input Handling:
  - Actively use `beforeinput` event to  
    express most text/structure changes as **Slate commands (insert_text, remove_text, insert_node, etc.)**.
  - For cases where browser changes DOM first,  
    intercept in `onDOMBeforeInput`, `onKeyDown`, etc. to reflect to model first.
- Conclusion:
  - Slate also strongly tends to **"allow only Model-origin as much as possible"** similar to ProseMirror.

### 9.3 Lexical (Meta)

- Lexical uses **own node model + update queue**:
  - All editing modifies model inside `editor.update(() => { ... })`.
  - DOM updated through reconciliation.
- Input Handling:
  - Use keydown/beforeinput/selectionchange precisely and  
    do not directly trust DOM changes.
- Conclusion:
  - Lexical also minimizes DOM-origin changes and  
    tries to maintain "model → DOM unidirectional".

### 9.4 Quill / TinyMCE / CKEditor (Traditional Rich Text Editors)

- Common Points:
  - Have separate **Clipboard/Keyboard modules** and  
    control paste/key input with own pipeline.
  - Express all changes with Delta (Quill) / internal model (minimal structure).
  - **Parse then normalize** HTML created by browser to absorb into model.
- Attitude Toward DOM-origin:
  - Even if allowed, design so always **go through model** via  
    "HTML parsing → internal model conversion → DOM regeneration again" path.

---

## 10. Future Implementation Checklist

1. **Implement MutationObserver → Case Classification Logic**
   - Organize helper functions to identify C1/C2/C3/C4 + additional cases mentioned in section 8 (auto correction, links, DnD, etc.).
2. **Implement/Connect DataStore Operations for Each Case**
   - C1/C2: Verify `range.replaceText` path (already implemented)
   - C3: Pattern mapping with `insertParagraph`/`mergeBlock`, etc.
   - C4: Define style→mark/decorator mapping table
   - Implement additional policies for auto links/paste/DnD
3. **Error/Exception Logging**
   - Log unclassifiable cases for analysis.
4. **Test Cases**
   - IME input, paste, Enter/Backspace, Native Bold/Italic,  
     auto correction/smart quotes, URL auto links, DnD, complex mark combinations, etc.
   - Verify all DOM-origin changes correctly result in model patch.
5. **Synchronize Policy Document with Implementation**
   - Periodically verify case definitions in this document (C1–C4 + 8.x)  
     match actual `MutationObserver` implementation, `input-handler`, `RangeOperations`.

This document aims to comprehensively organize DOM-origin cases that can occur in our editor  
by referencing strategies from other editors (ProseMirror, Slate, Lexical, Quill, etc.).


This document's goal is to explicitly classify all situations where "browser changes DOM first"  
and connect each case to **specific DataStore operations**.
