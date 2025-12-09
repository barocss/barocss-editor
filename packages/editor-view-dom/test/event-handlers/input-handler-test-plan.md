# InputHandlerImpl Test Plan

## Overview

`InputHandlerImpl` processes DOM input events and converts them into model transactions. It handles text changes detected by MutationObserver, manages IME composition state, and automatically adjusts mark/decorator ranges.

## Methods Under Test

### 1. Core methods
- `handleTextContentChange` - core method invoked by MutationObserver
- `commitPendingImmediate` - commits pending changes after IME composition ends
- `resolveModelTextNodeId` - extract nodeId from DOM

### 2. IME composition handling
- `handleCompositionStart` - composition start
- `handleCompositionUpdate` - during composition
- `handleCompositionEnd` - composition end

### 3. Event handling
- `handleInput` - handle input event
- `handleBeforeInput` - handle beforeinput event

### 4. Utilities
- `getCurrentSelection` - fetch current Selection info
- `marksChangedEfficient` - detect mark changes (utility)

---

## Test Cases

### 1. handleTextContentChange

#### 1.1 Early Return cases (filtering)

**1.1.1 Detect filler `<br>`**
- **Scenario**: Element has `br[data-bc-filler="true"]`
- **Expect**: `editor:input.skip_filler` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.2 Missing nodeId**
- **Scenario**: `resolveModelTextNodeId` returns `null`
- **Expect**: `editor:input.untracked_text` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.3 During IME composition**
- **Scenario**: `isComposing === true`
- **Expect**: Store pending, set `pendingTimer`, early return
- **Assert**: `executeTransaction` not called; `pendingTextNodeId` set

**1.1.4 Range Selection (not collapsed)**
- **Scenario**: `selection.length !== 0`
- **Expect**: `editor:input.skip_range_selection` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.5 Inactive Node**
- **Scenario**: `activeTextNodeId` exists and `textNodeId !== activeTextNodeId`
- **Expect**: `editor:input.skip_inactive_node` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.6 Missing Model Node**
- **Scenario**: `dataStore.getNode(textNodeId)` returns `null`
- **Expect**: `editor:input.node_not_found` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.7 No Text Node**
- **Scenario**: `target` is neither Text nor Element, or Element has no text node
- **Expect**: `editor:input.text_node_not_found` event fired; early return
- **Assert**: `executeTransaction` not called

**1.1.8 `handleEfficientEdit` returns null**
- **Scenario**: `handleEfficientEdit` returns `null` (no change)
- **Expect**: early return
- **Assert**: `executeTransaction` not called

#### 1.2 Normal processing

**1.2.1 Basic text insert**
- **Scenario**: Insert text in Text node
- **Expect**: `executeTransaction` called; `text_replace` transaction executed
- **Assert**:
  - `nodeId`, `start: 0`, `end: oldModelText.length`, `text: newText` match
  - If no mark changes, `marks` field absent

**1.2.2 Text delete**
- **Scenario**: Delete text in Text node
- **Expect**: `executeTransaction` called
- **Assert**: `text` field contains deleted text

**1.2.3 Text replace**
- **Scenario**: Replace text in Text node
- **Expect**: `executeTransaction` called
- **Assert**: `text` field contains replaced text

**1.2.4 Includes mark changes**
- **Scenario**: `marksChangedEfficient` returns `true`
- **Expect**: `marks` field included in `executeTransaction`
- **Assert**: `marks` matches `adjustedMarks`

**1.2.5 No mark changes**
- **Scenario**: `marksChangedEfficient` returns `false`
- **Expect**: No `marks` field in `executeTransaction`
- **Assert**: Transaction has no `marks` field

**1.2.6 Includes decorator changes**
- **Scenario**: `decoratorsChanged === true`
- **Expect**: `updateDecorators` called
- **Assert**: `updateDecorators` called with `adjustedDecorators`

**1.2.7 No decorator changes**
- **Scenario**: `decoratorsChanged === false`
- **Expect**: `updateDecorators` not called
- **Assert**: `updateDecorators` not called

**1.2.8 Find text node in Element**
- **Scenario**: `target` is Element node
- **Expect**: Find first text node via TreeWalker
- **Assert**: Processes correctly

#### 1.3 Complex scenarios

**1.3.1 Edit text with marks**
- **Scenario**: Edit text with marks applied
- **Expect**: `handleEfficientEdit` returns `adjustedMarks`
- **Assert**: `marksChangedEfficient` works correctly

**1.3.2 Edit text with decorator**
- **Scenario**: Edit text with decorator applied
- **Expect**: `handleEfficientEdit` returns `adjustedDecorators`
- **Assert**: `updateDecorators` called correctly

**1.3.3 Edit text with both mark and decorator**
- **Scenario**: Edit text with both mark and decorator
- **Expect**: Both are adjusted
- **Assert**: `marks` and `decorators` both updated

---

### 2. IME composition tests

#### 2.1 handleCompositionStart

**2.1.1 Start composition**
- **Scenario**: Call `handleCompositionStart()`
- **Expect**: `isComposing = true`, call `clearPending()`
- **Assert**: `isComposing` state set, pending cleared

#### 2.2 handleCompositionUpdate

**2.2.1 During composition**
- **Scenario**: Call `handleCompositionUpdate()`
- **Expect**: Do nothing (logging only)
- **Assert**: No state change

#### 2.3 handleCompositionEnd

**2.3.1 End composition**
- **Scenario**: Call `handleCompositionEnd()`
- **Expect**: `isComposing = false`, call `commitPendingImmediate()`
- **Assert**: `isComposing` state set, `commitPendingImmediate` called

#### 2.4 Text changes during composition

**2.4.1 Store changes during composition**
- **Scenario**: Call `handleTextContentChange` when `isComposing === true`
- **Expect**: Store pending; set `pendingTimer`
- **Assert**: `pendingTextNodeId`, `pendingOldText`, `pendingNewText` set

**2.4.2 Commit after composition end**
- **Scenario**: Changes stored pending; then `handleCompositionEnd()` called
- **Expect**: `commitPendingImmediate()` commits pending changes
- **Assert**: `executeTransaction` called

**2.4.3 Missing compositionend (timer)**
- **Scenario**: 400ms passes after `pendingTimer` set
- **Expect**: `commitPendingImmediate()` auto-called
- **Assert**: `executeTransaction` called

---

### 3. commitPendingImmediate

#### 3.1 Early Return cases

**3.1.1 No pendingTextNodeId**
- **Scenario**: `pendingTextNodeId === null`
- **Expect**: early return
- **Assert**: `executeTransaction` not called

**3.1.2 During composition**
- **Scenario**: `isComposing === true`
- **Expect**: early return
- **Assert**: `executeTransaction` not called

**3.1.3 Missing Model Node**
- **Scenario**: `dataStore.getNode(nodeId)` returns `null`
- **Expect**: early return (warn log)
- **Assert**: `executeTransaction` not called

**3.1.4 Missing inline-text node**
- **Scenario**: `document.querySelector` returns `null`
- **Expect**: Run transaction in basic mode (use oldText/newText)
- **Assert**: `executeTransaction` called; `text: newText` set

**3.1.5 No Text Node**
- **Scenario**: TreeWalker cannot find text node
- **Expect**: Run transaction in basic mode
- **Assert**: `executeTransaction` called; `text: newText` set

**3.1.6 `handleEfficientEdit` returns null**
- **Scenario**: `handleEfficientEdit` returns `null`
- **Expect**: early return
- **Assert**: `executeTransaction` not called

#### 3.2 Normal processing

**3.2.1 Successful commit**
- **Scenario**: All conditions satisfied
- **Expect**: Execute transaction using `handleEfficientEdit` result
- **Assert**:
  - `executeTransaction` called
  - `text: editResult.newText` set
  - `clearPending()` called

**3.2.2 Includes mark changes**
- **Scenario**: `marksChanged === true`
- **Expect**: `marks` field included in transaction
- **Assert**: `marks` field present

**3.2.3 Includes decorator changes**
- **Scenario**: `decoratorsChanged === true`
- **Expect**: `updateDecorators` called
- **Assert**: `updateDecorators` call verified

**3.2.4 clearPending called**
- **Scenario**: `clearPending()` called in `finally`
- **Expect**: Pending state reset
- **Assert**: `pendingTextNodeId`, `pendingOldText`, `pendingNewText`, `pendingTimer` all cleared

---

### 4. resolveModelTextNodeId

#### 4.1 Text Node handling

**4.1.1 Extract nodeId from Text Node**
- **Scenario**: `target.nodeType === Node.TEXT_NODE`
- **Expect**: Find nodeId via `parentElement.closest('[data-bc-sid]')`
- **Assert**: Correct nodeId returned

**4.1.2 parentElement is null**
- **Scenario**: `target.parentElement === null`
- **Expect**: Fire `editor:input.unresolved_text_node` event; return `null`
- **Assert**: Returns `null`

#### 4.2 Element Node handling

**4.2.1 Extract nodeId from Element Node**
- **Scenario**: `target.nodeType === Node.ELEMENT_NODE`
- **Expect**: Find nodeId via `target.closest('[data-bc-sid]')`
- **Assert**: Correct nodeId returned

**4.2.2 No nodeId in Element Node**
- **Scenario**: `closest('[data-bc-sid]')` returns `null`
- **Expect**: Fire `editor:input.unresolved_text_node` event; return `null`
- **Assert**: Returns `null`

#### 4.3 Other Node types

**4.3.1 Other node types**
- **Scenario**: `target.nodeType` is neither TEXT_NODE nor ELEMENT_NODE
- **Expect**: Fire `editor:input.unresolved_text_node` event; return `null`
- **Assert**: Returns `null`

---

### 5. handleBeforeInput

#### 5.1 Format commands

**5.1.1 formatBold**
- **Scenario**: `inputType === 'formatBold'`
- **Expect**: `event.preventDefault()`, `editor:command.execute` fired, `command: 'toggleBold'`
- **Assert**: `preventDefault` called; event verified

**5.1.2 formatItalic**
- **Scenario**: `inputType === 'formatItalic'`
- **Expect**: `event.preventDefault()`, `command: 'toggleItalic'`
- **Assert**: Event verified

**5.1.3 Other format commands**
- **Scenario**: `formatUnderline`, `formatStrikeThrough`, `formatSuperscript`, `formatSubscript`, `formatJustifyFull`, `formatJustifyCenter`, `formatJustifyRight`, `formatJustifyLeft`, `formatIndent`, `formatOutdent`, `formatRemove`
- **Expect**: Each fires event with correct command
- **Assert**: Events verified per command

#### 5.2 Structural commands

**5.2.1 insertParagraph**
- **Scenario**: `inputType === 'insertParagraph'`
- **Expect**: `event.preventDefault()`, `command: 'paragraph.insert'`
- **Assert**: Event verified

**5.2.2 Other structural commands**
- **Scenario**: `insertOrderedList`, `insertUnorderedList`, `insertHorizontalRule`, `insertLineBreak`
- **Expect**: Each fires event with correct command
- **Assert**: Events verified per command

#### 5.3 Regular input

**5.3.1 Regular input (no preventDefault)**
- **Scenario**: `inputType` not format/structural
- **Expect**: Do not call `preventDefault`; return `false`
- **Assert**: `preventDefault` not called; `false` returned

---

### 6. getCurrentSelection

#### 6.1 No selection

**6.1.1 Selection is null**
- **Scenario**: `window.getSelection()` returns `null`
- **Expect**: Return `{ offset: 0, length: 0 }`
- **Assert**: Return value verified

**6.1.2 rangeCount is 0**
- **Scenario**: `selection.rangeCount === 0`
- **Expect**: Return `{ offset: 0, length: 0 }`
- **Assert**: Return value verified

#### 6.2 Text Node Selection

**6.2.1 Collapsed Selection (Text Node)**
- **Scenario**: `startContainer.nodeType === Node.TEXT_NODE`, `collapsed === true`
- **Expect**: Return `{ offset: startOffset, length: 0 }`
- **Assert**: Return value verified

**6.2.2 Range Selection (Text Node)**
- **Scenario**: `startContainer.nodeType === Node.TEXT_NODE`, `collapsed === false`
- **Expect**: Return `{ offset: startOffset, length: endOffset - startOffset }`
- **Assert**: Return value verified

#### 6.3 Element Node Selection

**6.3.1 Collapsed Selection (Element Node)**
- **Scenario**: `startContainer.nodeType === Node.ELEMENT_NODE`, `collapsed === true`
- **Expect**: Traverse text children to compute offset
- **Assert**: Offset computed correctly

**6.3.2 Range Selection (Element Node, same container)**
- **Scenario**: `startContainer === endContainer`, Element Node
- **Expect**: `length = endOffset - startOffset`
- **Assert**: Return value verified

**6.3.3 Range Selection (Element Node, different containers)**
- **Scenario**: `startContainer !== endContainer`, Element Node
- **Expect**: Simplified calculation
- **Assert**: Return value verified

#### 6.4 Other Node types

**6.4.1 Other node types**
- **Scenario**: `startContainer.nodeType` neither TEXT_NODE nor ELEMENT_NODE
- **Expect**: Return `{ offset: 0, length: 0 }`
- **Assert**: Return value verified

---

### 7. marksChangedEfficient

#### 7.1 No changes

**7.1.1 Same marks**
- **Scenario**: `oldMarks` and `newMarks` identical
- **Expect**: Return `false`
- **Assert**: Return value verified

#### 7.2 With changes

**7.2.1 Different length**
- **Scenario**: `oldMarks.length !== newMarks.length`
- **Expect**: Return `true`
- **Assert**: Return value verified

**7.2.2 Different type**
- **Scenario**: `type` differs at same index
- **Expect**: Return `true`
- **Assert**: Return value verified

**7.2.3 Different range**
- **Scenario**: `range` differs at same index
- **Expect**: Return `true`
- **Assert**: Return value verified

---

### 8. handleInput

#### 8.1 Event firing

**8.1.1 Handle input event**
- **Scenario**: Call `handleInput(event)`
- **Expect**: `editor:input.detected` event fired
- **Assert**: Event data verified (`inputType`, `data`, `target`)

---

### 9. Constructor and event listeners

#### 9.1 Constructor

**9.1.1 Initialization**
- **Scenario**: Call `new InputHandlerImpl(editor)`
- **Expect**: Register `editor:selection.dom.applied` listener
- **Assert**: Listener registration verified

**9.1.2 Set activeTextNodeId**
- **Scenario**: `editor:selection.dom.applied` event fires
- **Expect**: `activeTextNodeId` is set
- **Assert**: `activeTextNodeId` value verified

---

## Test Structure

### Mock objects

1. **Editor mock**
   - `emit` method (track events)
   - `executeTransaction` method (track transactions)
   - `dataStore.getNode` (returns model node)
   - `getDecorators` (returns decorators)
   - `updateDecorators` (updates decorators)

2. **DOM mock**
   - `window.getSelection()` mock
   - `document.querySelector` mock
   - `document.createTreeWalker` mock

3. **handleEfficientEdit mock**
   - Mocked via `vi.mock`
   - Simulate various return values

### Test file structure

```
test/event-handlers/
  input-handler.test.ts
    - describe('InputHandlerImpl')
      - describe('constructor')
      - describe('handleTextContentChange')
        - describe('Early Return Cases')
        - describe('Normal Processing')
        - describe('Complex Scenarios')
      - describe('IME Composition')
        - describe('handleCompositionStart')
        - describe('handleCompositionUpdate')
        - describe('handleCompositionEnd')
        - describe('Composition Flow')
      - describe('commitPendingImmediate')
        - describe('Early Return Cases')
        - describe('Normal Processing')
      - describe('resolveModelTextNodeId')
      - describe('handleBeforeInput')
        - describe('Format Commands')
        - describe('Structural Commands')
        - describe('Normal Input')
      - describe('getCurrentSelection')
      - describe('marksChangedEfficient')
      - describe('handleInput')
```

---

## Priorities

### High priority (core)
1. ✅ `handleTextContentChange` - Early Return cases
2. ✅ `handleTextContentChange` - Normal processing
3. ✅ IME composition flow
4. ✅ `commitPendingImmediate` - Normal processing
5. ✅ `resolveModelTextNodeId` - Basic cases

### Medium priority (real scenarios)
6. ✅ `handleTextContentChange` - Complex (Mark/Decorator)
7. ✅ `commitPendingImmediate` - Early Return cases
8. ✅ `handleBeforeInput` - Format/Structural commands
9. ✅ `getCurrentSelection` - Various selection cases

### Low priority (edge cases)
10. ✅ `marksChangedEfficient` - utility
11. ✅ `handleInput` - event fired
12. ✅ Constructor event listener

---

## Notes for writing tests

1. **Mock setup**: `handleEfficientEdit` already tested; use mock
2. **Event tracking**: spy on `editor.emit`
3. **Async handling**: use `vi.useFakeTimers()` for `pendingTimer`
4. **DOM structure**: build actual DOM structure in tests
5. **State**: verify `isComposing`, `activeTextNodeId`, `pending*` states

---

## Estimated test count

- Total about **80-100** test cases
- Core functions: ~40
- Real scenarios: ~30
- Edge cases: ~20

