# Manual Test Scenarios for Input Processing

This document provides systematic scenarios for testing input functionality in the browser.

## Test Environment

- Browser: Chrome, Firefox, Safari (test each)
- Test App: `apps/editor-test/src/main.ts`
- Devtool: Check real-time model state in right panel

---

## Test Checklist

After performing each test, verify:
- [ ] Model updated correctly (check in Devtool)
- [ ] DOM rendered correctly (check in browser)
- [ ] Cursor position is correct
- [ ] Marks maintained/adjusted correctly
- [ ] Correct information displayed in Devtool's "Last Input" panel

---

## 1. Basic Text Input (C1)

### 1.1 Text Input in Single inline-text
**Scenario**:
1. Place cursor in empty inline-text node and type "Hello"

**Expected Result**:
- Model: `text: "Hello"`
- DOM: "Hello" text displayed
- Cursor: Positioned after "Hello"
- Devtool: `case: "C1"`, `inputType: "insertText"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌
- [ ] Devtool display: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 1.2 Input in Text with Marks
**Scenario**:
1. Place cursor in middle of "bold and italic" text (bold+italic mark) and type "x"

**Expected Result**:
- Model: Text changes to "bold xand italic", marks maintained across entire text
- DOM: bold+italic style maintained
- Cursor: Positioned after "x"
- Devtool: `case: "C1"`, marks not split

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Mark maintenance: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 1.3 Input in Text with Range-less Marks
**Scenario**:
1. Input text in `text-bold-after-img` node (bold mark without range)

**Expected Result**:
- Model: Text added, mark maintained as-is (no range)
- DOM: bold style applied to entire text
- Devtool: mark not split and applied to entire text

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] Mark maintenance (no range): ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 1.4 Text Deletion (Backspace)
**Scenario**:
1. Place cursor after "o" in "Hello" text and press Backspace

**Expected Result**:
- Model: `text: "Hell"`
- DOM: "Hell" text displayed
- Cursor: Positioned after "Hell"
- Devtool: `case: "C1"`, `inputType: "deleteContentBackward"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## 2. Text Changes Spanning Multiple Nodes (C2)

### 2.1 Wide Selection + Overwrite
**Scenario**:
1. Select text spanning multiple inline-text nodes
2. Type "New Text"

**Expected Result**:
- Model: Selected range replaced with "New Text"
- DOM: Rendered correctly
- Cursor: Positioned after "New Text"
- Devtool: `case: "C2"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 2.2 Deletion Spanning Multiple Nodes
**Scenario**:
1. Select text spanning multiple inline-text nodes
2. Press Delete or Backspace

**Expected Result**:
- Model: Selected range deleted
- DOM: Rendered correctly
- Cursor: Positioned at deleted location

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## 3. Structure Changes (C3)

### 3.1 Enter Key (insertParagraph)
**Scenario**:
1. Place cursor in middle of text and press Enter

**Expected Result**:
- Model: New paragraph node created
- DOM: New line created
- Cursor: Positioned at start of new paragraph
- Devtool: `case: "C3"`, `inputType: "insertParagraph"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 3.2 Shift+Enter (insertLineBreak)
**Scenario**:
1. Place cursor in middle of text and press Shift+Enter

**Expected Result**:
- Model: Line break inserted (or line break within same paragraph)
- DOM: Line break displayed
- Cursor: Positioned after line break

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## 4. Hangul Input (IME)

### 4.1 Basic Hangul Input
**Scenario**:
1. Type "안녕하세요" in empty text

**Expected Result**:
- Model: `text: "안녕하세요"`
- DOM: "안녕하세요" text displayed
- Cursor: Positioned after "안녕하세요"
- Devtool: `case: "C1"`, IME composition intermediate states ignored

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

### 4.2 Hangul Input in Text with Marks
**Scenario**:
1. Place cursor in middle of "bold and italic" text (bold+italic mark) and type "안녕"

**Expected Result**:
- Model: Text changes to "bold 안녕and italic", marks maintained
- DOM: bold+italic style maintained
- Cursor: Positioned after "안녕"
- Marks not split

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] Mark maintenance: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## 5. Paste

### 5.1 Plain Text Paste
**Scenario**:
1. Copy "Pasted Text" from external source
2. Paste into editor

**Expected Result**:
- Model: "Pasted Text" inserted
- DOM: Rendered correctly
- Cursor: Positioned after pasted text
- Devtool: `case: "C2"` or `"C1"`, `inputType: "insertFromPaste"`

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 5.2 Paste in Text with Marks
**Scenario**:
1. Place cursor in middle of "bold and italic" text (bold+italic mark) and paste text

**Expected Result**:
- Model: Pasted text inserted
- Marks may be applied to pasted text (depending on policy)
- DOM: Rendered correctly

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] Mark handling: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## 6. Devtool Verification

### 6.1 Last Input Panel Check
**Scenario**:
1. Check Devtool's "Last Input" panel after text input

**Check Items**:
- [ ] `case` displayed correctly (C1, C2, C3, etc.)
- [ ] `inputType` displayed correctly
- [ ] `usedInputHint` displayed correctly
- [ ] `contentRange` displayed correctly
- [ ] `status` icon correct (✓/⚠/○)

**Issues** (if any):
```
[Issue description]
```

---

### 6.2 Model Tree Update Check
**Scenario**:
1. Check Devtool's "Model Tree" tab after text input

**Check Items**:
- [ ] Text updated correctly
- [ ] Marks displayed correctly (M, D, T)
- [ ] Selection displayed correctly

**Issues** (if any):
```
[Issue description]
```

---

## 7. Edge Cases

### 7.1 Input in Empty Node
**Scenario**:
1. Place cursor in empty inline-text node and input text

**Expected Result**:
- Model: Text added
- DOM: Text displayed

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 7.2 Input at Node End
**Scenario**:
1. Place cursor at end of text node and input text

**Expected Result**:
- Model: Text added
- DOM: Text displayed
- Cursor: Correct position

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌
- [ ] Cursor position: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

### 7.3 Backspace at Node Start
**Scenario**:
1. Place cursor at start of text node and press Backspace

**Expected Result**:
- Model: Merged with previous node or deleted (depending on policy)
- DOM: Rendered correctly

**Actual Result**:
- [ ] Model update: ✅ / ❌
- [ ] DOM rendering: ✅ / ❌

**Issues** (if any):
```
[Issue description]
```

---

## Test Results Summary

### Successful Scenarios
- [ ] 1.1 Text input in single inline-text
- [ ] 1.2 Input in text with marks
- [ ] 1.3 Input in text with range-less marks
- [ ] 1.4 Text deletion (Backspace)
- [ ] 2.1 Wide selection + overwrite
- [ ] 2.2 Deletion spanning multiple nodes
- [ ] 3.1 Enter key (insertParagraph)
- [ ] 3.2 Shift+Enter (insertLineBreak)
- [ ] 4.1 Basic Hangul input
- [ ] 4.2 Hangul input in text with marks
- [ ] 5.1 Plain text paste
- [ ] 5.2 Paste in text with marks
- [ ] 6.1 Last Input panel check
- [ ] 6.2 Model Tree update check
- [ ] 7.1 Input in empty node
- [ ] 7.2 Input at node end
- [ ] 7.3 Backspace at node start

### Found Bugs List

1. **Bug #1**: [Title]
   - Scenario: [Which scenario it occurs in]
   - Symptom: [What went wrong]
   - Reproduction: [How to reproduce]
   - Suspected cause: [Estimated cause]

2. **Bug #2**: [Title]
   - ...

---

## Next Steps

After test completion:
1. Organize found bugs by priority
2. Create fix plan for each bug
3. Re-test after fixes

