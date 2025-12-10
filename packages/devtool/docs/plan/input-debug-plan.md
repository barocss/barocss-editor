## Devtool Input Debug Plan (`Last Input Debug`)

This document designs how input processing rules (especially `beforeinput`-based Insert Range hints and C1/C2 classification) can be visually verified in Devtool during actual operation.

---

## 1. Purpose

- **Purpose 1**: For input actions (typing/paste/delete/Hangul composition, etc.), collect in one place:
  - `InputHint` calculated at `beforeinput` stage
  - `contentRange` / `case` calculated by `dom-change-classifier`
  - `contentRange` actually used in `replaceText`/`deleteText`
  so they can be compared at a glance in Devtool.

- **Purpose 2**: When there are rule violations/mismatches, show **visual indicators** (OK/warning) on Devtool to immediately discover bugs in the input processing pipeline.

---

## 2. Data Structure Design (`LastInputDebug`)

Add a debug property to Editor instance:

```ts
interface LastInputDebug {
  case: 'C1' | 'C2' | 'C3' | 'C4' | 'IME_INTERMEDIATE' | 'UNKNOWN';
  inputType?: string;          // beforeinput.inputType
  usedInputHint?: boolean;     // Whether InputHint was actually used in classify stage
  inputHintRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  classifiedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  appliedContentRange?: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
  };
  modelSelectionAtInput?: any; // convertDOMSelectionToModel result (optional)
  timestamp: number;
  status?: 'ok' | 'mismatch' | 'skipped';
  notes?: string[];            // Rule violation/exception descriptions
}
```

Editor side fills this structure at the following locations:

- `handleBeforeInput`:
  - Initial setup of `inputType`, `inputHintRange`, `timestamp`
- `classifyDomChange` (C1/C2):
  - Update `case`, `classifiedContentRange`, `usedInputHint`, `modelSelectionAtInput`
- `handleC1` / `handleC2` / `handleC3`:
  - Set `appliedContentRange` to value actually used in `replaceText`/`deleteText`/command
  - Determine `status` and `notes` after rule comparison

This value is stored in a field like `editor.__lastInputDebug`.

---

## 3. Rule Definition and Comparison Logic

Define "rules" to expose in Devtool as follows.

### 3.1 C1 Rules (single inline-text)

- **Rule C1-1**:  
  - `classifiedContentRange` and `appliedContentRange` must be identical.
- **Rule C1-2**:  
  - When `inputType` is `insertText`/`insertFromPaste`/`insertReplacementText`,  
    `usedInputHint === true` must hold.
- **Rule C1-3**:  
  - During IME composition (`case === 'IME_INTERMEDIATE'`), `usedInputHint === false` must hold.

Comparison result:

- All rules satisfied → `status: 'ok'`
- Any violation → `status: 'mismatch'`, add violated rule to `notes`

### 3.2 C2 Rules (changes spanning multiple inline-text)

- **Rule C2-1**:  
  - Range calculated based on selection (currently `classifiedContentRange`) and  
    `appliedContentRange` must have consistency at least in start/end nodeId and offset direction.
- **Rule C2-2**:  
  - In insert types (including overwrite), if `inputHint` range was provided,  
    `classifiedContentRange` should reflect it preferentially (`usedInputHint === true`).

Comparison result handling is the same as C1, expressed with `status` and `notes`.

---

## 4. Devtool Integration Design

### 4.1 Devtool API Extension

Add the following method to `Devtool` class:

```ts
class Devtool {
  // ...
  private lastInputDebug: LastInputDebug | null = null;

  public updateLastInputDebug(debug: LastInputDebug): void {
    this.lastInputDebug = debug;
    this.ui.updateLastInputDebug(debug);
  }
}
```

Editor side, after input processing completes:

```ts
(editor as any).__lastInputDebug = debugObject;
devtool.updateLastInputDebug(debugObject);
```

### 4.2 Devtool UI Extension

Add "Last Input" area to `DevtoolUI`:

- Location: Place as a small box at top or bottom of Model Tree panel.
- Display items:
  - `Case: C1`
  - `InputType: insertText`
  - `Status: OK / MISMATCH`
  - `Ranges`:
    - `Hint: [sid, s, e]`
    - `Classified: [sid, s, e]`
    - `Applied: [sid, s, e]`
  - `Notes`: List of rule violation/exception messages.

Visual style:

- `Status: OK` → Green background/icon
- `Status: MISMATCH` → Red background/icon
- `Status: SKIPPED` → Gray

Also, automatically highlight `inline-text` or `text-run` affected by last input in Model Tree:

- Add badge to node element based on `appliedContentRange.startNodeId`:
  - Example: Short labels like `C1✓`, `C2⚠`.

---

## 5. Implementation TODO (Summary)

1. **Editor Side**
   - [ ] Define `LastInputDebug` type (shared in `editor-core` or `devtool` type module)
   - [ ] Construct `LastInputDebug` in `handleBeforeInput` / `classifyDomChange` / `handleC1` / `handleC2` / `handleC3` and store in `editor.__lastInputDebug`
   - [ ] Implement rule comparison logic (C1/C2 rules) to fill `status` and `notes`

2. **Devtool Side**
   - [ ] Add `lastInputDebug` field and `updateLastInputDebug` method to `Devtool`
   - [ ] Add "Last Input" panel UI to `DevtoolUI`
   - [ ] Apply badge/highlight style to corresponding node in Model Tree

3. **Testing**
   - [ ] Manual/automated test that `LastInputDebug` info and Devtool UI display match expected rules in T1/T2/T6 scenarios
