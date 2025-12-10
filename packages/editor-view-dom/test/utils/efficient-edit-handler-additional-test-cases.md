# Additional Test Cases for handleEfficientEdit

## Current Test Coverage
- ✅ Basic editing (insert, delete, replace)
- ✅ Mark/decorator range adjustment
- ✅ Error cases (node lookup failure)
- ✅ Selection-based edit position calculation
- ✅ Multiple text node reconstruction
---

## Additional Test Cases (by Category)

### 1. Boundary and Edge Cases

#### 1.1 Empty Text Related
- **Insert into empty text**: `''` → `'Hello'`
- **Delete entire text**: `'Hello'` → `''`
- **Empty to empty**: `''` → `''` (return null)
- **Empty to whitespace**: `''` → `' '`

#### 1.2 Whitespace Character Handling
- **Text with only whitespace**: `'   '` → `'Hello'`
- **Whitespace insertion**: `'Hello'` → `'Hello World'` (whitespace in middle)
- **Whitespace deletion**: `'Hello World'` → `'HelloWorld'`
- **Tab character handling**: `'Hello\tWorld'` → `'Hello World'`
- **Newline character handling**: `'Hello\nWorld'` → `'Hello World'`
- **Multiple consecutive whitespaces**: `'Hello    World'` → `'Hello World'`

#### 1.3 Long Text
- **Very long text insertion**: 1000+ characters
- **Very long text deletion**: delete part of 1000+ characters
- **Very long text replacement**: replace part of 1000+ characters

---

### 2. Selection-Related Tests

#### 2.1 Editing by Selection Position
- **Selection at start**: `|Hello` → `X|Hello` (insert)
- **Selection at end**: `Hello|` → `HelloX|` (insert)
- **Selection in middle**: `Hel|lo` → `HelX|lo` (insert)
- **Range selection**: `[Hello]` → `X` (replace entire selection)
- **Partial selection**: `He[llo]` → `HeX` (replace partial selection)

#### 2.2 Selection Outside Edit Range
- **Selection before text**: `|Hello` → `Hello World` (insert after)
- **Selection after text**: `Hello|` → `Hello World` (insert before)
- **Selection in different node**: when selection is in another inline-text node

#### 2.3 Selection on Element Node
- **startContainer is Element**: set selection inside Element node
- **endContainer is Element**: set selection inside Element node

---

### 3. Mark-Related Tests

#### 3.1 Multiple Mark Combinations
- **Overlapping marks**: `bold[0,5]`, `italic[2,7]` → both adjust on text insertion
- **Consecutive marks**: `bold[0,5]`, `italic[5,10]` → both adjust on middle insertion
- **Separated marks**: `bold[0,5]`, `italic[10,15]` → only one adjusts on middle insertion
- **Three or more marks**: `bold[0,5]`, `italic[2,7]`, `underline[4,9]` → all adjust

#### 3.2 Mark Range and Edit Range Relationship
- **Mark before edit range**: `bold[0,5]`, edit position 10 → no adjustment
- **Mark after edit range**: `bold[10,15]`, edit position 5 → no adjustment
- **Mark partially overlaps edit range (front)**: `bold[0,10]`, edit position 5 → adjusted
- **Mark partially overlaps edit range (back)**: `bold[5,15]`, edit position 10 → adjusted
- **Mark completely inside edit range**: `bold[5,10]`, edit position 3, insert length 10 → adjusted
- **Edit range completely inside mark**: `bold[0,20]`, edit position 5, insert length 5 → adjusted

#### 3.3 Mark Deletion Scenarios
- **Entire mark range deleted**: `bold[0,5]`, `'Hello'` → `''` (entire deletion)
- **Part of mark range deleted**: `bold[0,10]`, `'Hello World'` → `'Hello'` (partial deletion)
- **Front part of mark range deleted**: `bold[5,15]`, `'Hello World'` → `'World'` (front deletion)

#### 3.4 Complex Mark Structures
- **Nested marks**: `bold[0,10]` with `italic[2,7]` inside → both adjust
- **Marks spanning multiple text nodes**: when mark includes multiple text nodes

---

### 4. Decorator-Related Tests

#### 4.1 Multiple Decorator Combinations
- **Overlapping decorators**: `highlight[0,5]`, `comment[2,7]` → both adjust
- **Consecutive decorators**: `highlight[0,5]`, `comment[5,10]` → both adjust
- **Separated decorators**: `highlight[0,5]`, `comment[10,15]` → only one adjusts
- **Three or more decorators**: `highlight[0,5]`, `comment[2,7]`, `badge[4,9]` → all adjust

#### 4.2 Decorator Range and Edit Range Relationship
- **Decorator before edit range**: `highlight[0,5]`, edit position 10 → no adjustment
- **Decorator after edit range**: `highlight[10,15]`, edit position 5 → no adjustment
- **Decorator partially overlaps edit range (front)**: `highlight[0,10]`, edit position 5 → adjusted
- **Decorator partially overlaps edit range (back)**: `highlight[5,15]`, edit position 10 → adjusted
- **Decorator completely inside edit range**: `highlight[5,10]`, edit position 3, insert length 10 → adjusted
- **Edit range completely inside decorator**: `highlight[0,20]`, edit position 5, insert length 5 → adjusted

#### 4.3 Decorator Deletion Scenarios
- **Entire decorator range deleted**: `highlight[0,5]`, `'Hello'` → `''` (entire deletion)
- **Part of decorator range deleted**: `highlight[0,10]`, `'Hello World'` → `'Hello'` (partial deletion)
- **Front part of decorator range deleted**: `highlight[5,15]`, `'Hello World'` → `'World'` (front deletion)

#### 4.4 Decorators with Different nodeId
- **Decorators with different nodeId should not be adjusted**: decorators where `target.sid !== nodeId` are ignored

---

### 5. Complex DOM Structure Tests

#### 5.1 Multiple Nested Mark Structures
- **Bold with Italic inside**: `<strong>He<em>ll</em>o</strong>` → both adjust on text change
- **Italic with Bold inside**: `<em>He<strong>ll</strong>o</em>` → both adjust on text change
- **Triple nesting**: `<strong>He<em>ll<u>o</u></em></strong>` → all adjust

#### 5.2 Mixed Mark and Decorator Structures
- **Overlapping mark and decorator**: `bold[0,5]`, `highlight[2,7]` → both adjust
- **Separated mark and decorator**: `bold[0,5]`, `highlight[10,15]` → only one adjusts
- **Decorator inside mark**: `bold[0,10]`, `highlight[2,7]` → both adjust

#### 5.3 Multiple Text Node Separation
- **Separation due to mark**: `Hello <strong>World</strong> Test` → reconstruct entire text
- **Separation due to decorator**: `Hello <span class="highlight">World</span> Test` → reconstruct entire text
- **Complex separation with marks and decorators**: reconstruct entire text in complex structure

#### 5.4 Empty Text Node Handling
- **Empty text node exists**: `<strong></strong>` (empty mark wrapper)
- **Mixed empty and actual text nodes**: `Hello <strong></strong> World`

---

### 6. Unicode and Special Character Tests

#### 6.1 Unicode Characters
- **Emoji handling**: `'Hello 👋'` → `'Hello 👋 World'`
- **Unicode combining characters**: `'café'` → `'café world'` (é is e + ́ combination)
- **Unicode normalization after identical**: `'café'` (NFC) vs `'café'` (NFD) → return null
- **Korean handling**: `'안녕'` → `'안녕하세요'`
- **Japanese handling**: `'こんにちは'` → `'こんにちは世界'`
- **Chinese handling**: `'你好'` → `'你好世界'`

#### 6.2 Special Characters
- **Special symbols**: `'Hello @#$%'` → `'Hello @#$% World'`
- **Math symbols**: `'x = y + z'` → `'x = y + z * 2'`
- **HTML entities**: `'Hello &lt;world&gt;'` → `'Hello &lt;world&gt; test'`
- **Control characters**: tabs, newlines, etc.

#### 6.3 Multilingual Mix
- **English + Korean**: `'Hello 안녕'` → `'Hello 안녕 World'`
- **English + Japanese + Korean**: `'Hello こんにちは 안녕'` → complex editing

---

### 7. Edit Position and Range Tests

#### 7.1 Tests by Edit Position
- **Insert at start**: `|Hello` → `X|Hello`
- **Delete at start**: `|Hello` → `|ello` (delete first character)
- **Insert at end**: `Hello|` → `HelloX|`
- **Delete at end**: `Hello|` → `Hell|` (delete last character)
- **Insert in middle**: `Hel|lo` → `HelX|lo`
- **Delete in middle**: `Hel|lo` → `He|lo` (delete middle character)

#### 7.2 Multiple Simultaneous Edits (text-analyzer detects multiple changes)
- **Insert at two places**: `Hello` → `HeXlloY` (theoretically possible but rare in practice)
- **Delete at two places**: `Hello World` → `Hlo Wrld` (delete at two places)

#### 7.3 Bulk Editing
- **Bulk insertion**: `'Hello'` → `'Hello' + 1000 characters`
- **Bulk deletion**: 1000 characters → `'Hello'`
- **Bulk replacement**: 1000 characters → different 1000 characters

---

### 8. Error and Exception Cases

#### 8.1 DOM Structure Issues
- **Text Run Index is empty**: `runs.runs.length === 0` → return null
- **buildTextRunIndex returns null**: → return null
- **convertDOMToModelPosition returns null**: conversion fails even with selection

#### 8.2 Selection Conversion Failure
- **startContainer is Element**: → selectionOffset = 0
- **endContainer is Element**: → selectionLength = 0
- **convertDOMToModelPosition fails**: → selectionOffset = 0

#### 8.3 text-analyzer Results
- **text-analyzer returns empty array (identical after Unicode normalization)**: → return null
- **text-analyzer detects multiple changes**: → use only first change

---

### 9. Performance and Stress Tests

#### 9.1 Many Marks/Decorators
- **100+ marks**: verify all marks are adjusted
- **100+ decorators**: verify all decorators are adjusted
- **Mixed marks and decorators (50 each)**: verify all are adjusted

#### 9.2 Many Text Nodes
- **100+ text nodes**: verify entire text reconstruction is accurate
- **Deeply nested structure**: verify accuracy in very deep nested structure

---

### 10. Real Usage Scenarios

#### 10.1 Typing Scenarios
- **Continuous typing**: `'H'` → `'He'` → `'Hel'` → `'Hell'` → `'Hello'` (test each step)
- **Backspace**: `'Hello'` → `'Hell'` → `'Hel'` → `'He'` → `'H'` → `''` (test each step)
- **Middle insertion**: `'Hello'` → `'HeXllo'` → `'HeXYllo'` (continue inserting in middle)

#### 10.2 Copy/Paste Scenarios
- **Select all then paste**: `'Hello'` → `'World'` (entire replacement)
- **Select partial then paste**: `'Hello'` → `'HeWorld'` (partial replacement)
- **Paste in middle**: `'Hello'` → `'HeWorldllo'` (middle insertion)

#### 10.3 IME Input Scenarios
- **Korean composition**: `'안'` → `'안녕'` → `'안녕하'` → `'안녕하세요'` (composition process)
- **Japanese composition**: `'こ'` → `'こん'` → `'こんに'` → `'こんにちは'` (composition process)

---

### 11. Detailed Mark/Decorator Range Adjustment Tests

#### 11.1 Range Adjustment on Insertion
- **Insert before mark range**: `bold[5,10]`, edit position 0, insert length 3 → `bold[8,13]` (range shift)
- **Insert inside mark range**: `bold[5,10]`, edit position 7, insert length 3 → `bold[5,13]` (range expansion)
- **Insert after mark range**: `bold[5,10]`, edit position 15, insert length 3 → `bold[5,10]` (no change)

#### 11.2 Range Adjustment on Deletion
- **Delete front part of mark range**: `bold[5,10]`, edit position 0, delete length 3 → `bold[2,7]` (range shift)
- **Delete part of mark range**: `bold[5,10]`, edit position 7, delete length 3 → `bold[5,7]` (range shrink)
- **Delete entire mark range**: `bold[5,10]`, edit position 5, delete length 5 → remove mark or empty range

#### 11.3 Range Adjustment on Replacement
- **Replacement overlapping mark range**: `bold[5,10]`, edit position 7, delete length 3, insert length 5 → `bold[5,12]` (range adjustment)

---

### 12. Composite Scenarios

#### 12.1 Mark + Decorator + Selection Combination
- **All of mark, decorator, selection present**: complex editing scenario
- **Overlapping mark and decorator with selection**: Selection biasing test

#### 12.2 Multiple Consecutive Edits
- **Insert then delete**: `'Hello'` → `'Hello World'` → `'Hello'` (consecutive edits)
- **Delete then insert**: `'Hello World'` → `'Hello'` → `'Hello Test'` (consecutive edits)

---

## Prioritized Summary

### High Priority (Core Features)
1. ✅ Empty text handling
2. ✅ Selection on Element node
3. ✅ Mark/Decorator range and edit range relationship (partial overlap, complete inclusion, etc.)
4. ✅ Multiple Mark/Decorator combinations
5. ✅ Identical after Unicode normalization (return null)
6. ✅ Ignore decorators with different nodeId

### Medium Priority (Real Usage Scenarios)
7. ✅ IME input scenarios (Korean, Japanese composition)
8. ✅ Copy/paste scenarios
9. ✅ Continuous typing scenarios
10. ✅ Nested mark structures
11. ✅ Mixed mark and decorator structures

### Low Priority (Edge Cases)
12. ✅ Very long text
13. ✅ Many marks/decorators (100+)
14. ✅ Special character handling
15. ✅ Cases where text-analyzer detects multiple changes

---

## Notes for Writing Tests

1. **DOM Structure Accuracy**: DOM structure created in tests must match actual rendering results
2. **Mark/Decorator Ranges**: Verify actual adjustment results accurately
3. **Selection Normalization**: Verify DOM offset → Model offset conversion is accurate
4. **Unicode Handling**: Verify null return when identical after normalization
5. **Error Handling**: Verify null return in exception cases
