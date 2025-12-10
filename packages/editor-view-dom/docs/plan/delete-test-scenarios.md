# Delete Feature Test Scenarios

This document provides scenarios for systematically testing the delete feature.

## Pre-Test Checklist

1. Open browser console (F12)
2. Check Devtool right panel
3. Prepare "Last Input" tab and "Model Tree" tab

---

## Test Scenarios

### 1. Basic Backspace Delete (C1)

#### 1.1 Single Character Delete
**Scenario**:
1. Place cursor after "o" in "Hello" text and press Backspace

**Expected Result**:
- Model: `text: "Hell"`
- DOM: "Hell" text displayed
- Cursor: positioned after "Hell"
- Devtool: `case: "C1"`, `inputType: "deleteContentBackward"`, `status: "✓"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌
- [ ] Devtool display: ✅ / ❌

**Console Log Check**:
```
[InputHandler] handleC1: CALLED
[InputHandler] handleC1: text change { type: 'delete', start: 4, end: 5, text: '' }
[InputHandler] handleC1: calling deleteText
```

**Issues** (if any):
```
[Issue description]
```

---

#### 1.2 Multiple Character Delete (Select then Delete)
**Scenario**:
1. Select "ell" in "Hello" text
2. Press Backspace or Delete

**Expected Result**:
- Model: `text: "Ho"`
- DOM: "Ho" text displayed
- Cursor: positioned after "H"
- Devtool: `case: "C1"` or `"C2"`, `status: "✓"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

#### 1.3 Delete in Text with Marks
**Scenario**:
1. Select "and" in "bold and italic" text (with bold+italic mark)
2. Press Backspace

**Expected Result**:
- Model: `text: "bold  italic"` (or "bold italic"), marks adjusted
- DOM: bold+italic style maintained
- Cursor: positioned after "bold "
- Marks correctly adjusted (not split)

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] Mark adjustment: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Check Marks in Devtool**:
- [ ] Marks correctly adjusted (not split into M, T, M form)

**Issues** (if any):
```
[Issue description]
```

---

#### 1.4 Delete in Text with Range-less Mark
**Scenario**:
1. Delete part of text in `text-bold-after-img` node (bold mark without range)

**Expected Result**:
- Model: text deleted, mark maintained (no range)
- DOM: bold style applied to entire text
- Devtool: mark not split, applied to entire text

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] Mark maintained (no range): ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 2. Delete Key Delete

#### 2.1 Single Character Delete (Delete)
**Scenario**:
1. Place cursor before "H" in "Hello" text and press Delete

**Expected Result**:
- Model: `text: "ello"`
- DOM: "ello" text displayed
- Cursor: at start of "ello"
- Devtool: `case: "C1"`, `inputType: "deleteContentForward"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 3. Delete Across Multiple Nodes (C2)

#### 3.1 Delete Across Multiple inline-text Nodes
**Scenario**:
1. Select text spanning multiple inline-text nodes
2. Press Backspace or Delete

**Expected Result**:
- Model: selected range deleted
- DOM: correctly rendered
- Cursor: positioned at deleted location
- Devtool: `case: "C2"`, `status: "✓"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Console Log Check**:
```
[InputHandler] handleC2: CALLED
[InputHandler] handleC2: calling replaceText (or deleteText)
```

**Issues** (if any):
```
[Issue description]
```

---

### 4. Edge Cases

#### 4.1 Backspace at Node Start
**Scenario**:
1. Place cursor at start of text node and press Backspace

**Expected Result**:
- Model: merged with previous node or deleted (depending on policy)
- DOM: correctly rendered
- Cursor: correct position

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

#### 4.2 Delete at Node End
**Scenario**:
1. Place cursor at end of text node and press Delete

**Expected Result**:
- Model: merged with next node or deleted (depending on policy)
- DOM: correctly rendered
- Cursor: correct position

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

#### 4.3 Backspace in Empty Node
**Scenario**:
1. Place cursor in empty inline-text node and press Backspace

**Expected Result**:
- Model: node deleted or merged with previous node
- DOM: correctly rendered

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

#### 4.4 Delete After Selecting All Text
**Scenario**:
1. Select all text in inline-text node (Ctrl+A or drag)
2. Press Backspace or Delete

**Expected Result**:
- Model: `text: ""` (empty string)
- DOM: empty text node or placeholder displayed
- Cursor: at node start position
- Marks maintained or removed (depending on policy)

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌
- [ ] Mark handling: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 5. Hangul Delete

#### 5.1 Hangul Character Delete
**Scenario**:
1. Place cursor after "요" in "안녕하세요" text and press Backspace

**Expected Result**:
- Model: `text: "안녕하세"`
- DOM: "안녕하세" text displayed
- Cursor: positioned after "안녕하세"
- Unicode/surrogate pairs correctly handled

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌
- [ ] Unicode handling: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

#### 5.2 Delete During Hangul Composition
**Scenario**:
1. Press Backspace while composing Hangul (during composition)

**Expected Result**:
- Model: composition cancelled or updated to intermediate state
- DOM: correctly rendered
- Cursor: correct position

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌
- [ ] IME handling: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## Test Results Summary

### Successful Scenarios
- [ ] 1.1 Single character delete
- [ ] 1.2 Multiple character delete (select then delete)
- [ ] 1.3 Delete in text with marks
- [ ] 1.4 Delete in text with range-less mark
- [ ] 2.1 Single character delete (Delete)
- [ ] 3.1 Delete across multiple nodes
- [ ] 4.1 Backspace at node start
- [ ] 4.2 Delete at node end
- [ ] 4.3 Backspace in empty node
- [ ] 4.4 Delete after selecting all text
- [ ] 5.1 Hangul character delete
- [ ] 5.2 Delete during Hangul composition

### Discovered Bugs List

1. **Bug #1**: [Title]
   - Scenario: [Which scenario it occurred in]
   - Symptom: [What went wrong]
   - Reproduction: [How to reproduce]
   - Console log: [Relevant logs]
   - Suspected cause: [Estimated cause]

2. **Bug #2**: [Title]
   - ...

---

## Next Steps

After completing tests:
1. Organize discovered bugs by priority
2. Create fix plan for each bug
3. Re-test after fixes
