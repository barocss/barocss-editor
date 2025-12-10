# Reverse Transformation-Based Editing Algorithm Concept Review

## Current Approach Summary

We handle contenteditable editing using **DOM → Model reverse transformation**:

```
User editing (DOM)
  ↓
MutationObserver detection
  ↓
Reconstruct text from DOM (reconstructModelTextFromRuns)
  ↓
Identify edit position (convertDOMToModelPosition)
  ↓
Adjust Mark/Decorator ranges (adjustMarkRanges, adjustDecoratorRanges)
  ↓
Model update (text_replace transaction)
  ↓
Renderer re-renders DOM
```

## Why This Approach is Suitable

### ✅ Advantages

1. **Natural integration with contenteditable**
   - Leverages browser's native editing features as-is
   - Copy/paste, drag and drop work automatically
   - Can utilize IME input, autocomplete, and other browser features

2. **Single Source of Truth**
   - DOM is where actual editing occurs
   - Using DOM as reference reduces synchronization issues
   - Model always reflects latest state as "reverse transformation" result of DOM

3. **Explicit control**
   - Explicitly adjust ranges with `adjustMarkRanges`, `adjustDecoratorRanges`
   - Logic is clear and easy to debug
   - Highly customizable

4. **Flexibility**
   - Can handle various DOM structures
   - Can handle complex nesting of Marks and Decorators

### ⚠️ Potential Issues and Solutions

#### 1. **Inaccuracy in Edit Position Estimation**

**Problem:**
- Common prefix approach can be inaccurate in complex edits
- Example: `"abc"` → `"xyz"` (complete replacement) has editPosition = 0 but is actually full replacement

**Current solution:**
- Try Selection API first for edit position
- Fallback to common prefix if fails
- Works well in most cases

**Improvement:**
- Use LCS (Longest Common Subsequence) algorithm
- Can utilize `@barocss/text-analyzer`'s `analyzeTextChanges`
- Priority: Medium (current approach works sufficiently)

#### 2. **Simultaneous Changes to Multiple Text Nodes**

**Problem:**
- MutationObserver only detects individual text node changes
- When multiple text nodes change simultaneously, called multiple times

**Current solution:**
- Reconstruct entire text each time to ensure final state
- Ensure `handleEfficientEdit` is called only once

**Improvement:**
- Batch processing: collect multiple changes within short time and process together
- Priority: Low (current approach works sufficiently)

#### 3. **Performance Issues**

**Problem:**
- Build Text Run Index every time (O(n) where n = text nodes)
- Reconstruct entire text

**Current solution:**
- Number of text nodes within inline-text node is usually small (10 or less)
- Performance impact is minimal
- Removed caching for improved accuracy

**Improvement:**
- Use beforeinput event to identify edit position in advance (caching)
- Priority: Medium (performance improvement)

#### 4. **Unicode Handling**

**Problem:**
- Range adjustment may be inaccurate for complex characters like emojis, combining characters
- Need to handle UTF-16 surrogate pairs

**Current solution:**
- JavaScript strings are UTF-16 based, so mostly handled automatically
- No issues in general use

**Improvement:**
- Calculate in Unicode character units using `Array.from(text)`
- Priority: Low (current approach sufficient for most cases)

#### 5. **Possible DOM and Model Mismatch**

**Problem:**
- DOM changed but Model update failed
- Model and DOM may become inconsistent

**Current solution:**
- Renderer always re-renders DOM based on Model
- Automatically synchronizes DOM after Model update

**Improvement:**
- Periodic synchronization verification (optional)
- Priority: Low (renderer handles automatically)

## Comparison with Other Approaches

### Model → DOM (Unidirectional) Approach

**Examples:** ProseMirror, Slate, Draft.js

```
User editing (Model)
  ↓
Create Transaction/Operation
  ↓
Update Model
  ↓
Re-render DOM
```

**Advantages:**
- Model is always accurate
- Edit position is clear
- Range adjustment is automatic

**Disadvantages:**
- Difficult to utilize contenteditable's native features
- Need to manually implement copy/paste, drag and drop, etc.
- IME input handling is complex

### DOM → Model (Reverse Transformation) Approach (Our Approach)

**Advantages:**
- Natural integration with contenteditable
- Can utilize browser features
- Flexibility

**Disadvantages:**
- Need reverse transformation logic
- Possible inaccuracy in edit position estimation
- Need to manually handle range adjustment

## Conclusion: Is This Approach Suitable?

### ✅ **Suitable Cases:**

1. **contenteditable-based editor**
   - When you want to maximize use of browser's native editing features
   - When copy/paste, drag and drop should work automatically

2. **Complex Mark/Decorator structure**
   - When multiple levels of nesting are needed
   - When structure changes dynamically

3. **When explicit control is needed**
   - When you want to customize range adjustment logic
   - When easy-to-debug structure is needed

### ⚠️ **Cases Requiring Caution:**

1. **Large text**
   - Performance issues possible with very long text
   - Solution: virtualization or chunk-based processing

2. **Complex edit scenarios**
   - Edits spanning multiple nodes
   - Solution: batch processing or transaction grouping

3. **Real-time collaboration**
   - When multiple users edit simultaneously
   - Solution: integrate Operational Transform (OT) or CRDT

## Recommended Improvements

### Immediate Improvements (High Priority)

1. ✅ **Edge case handling in range adjustment logic** (completed)
   - When deletion completely removes mark range
   - When edit position is at range boundary

2. ✅ **Enhanced error handling** (completed)
   - When textNode is removed from DOM
   - When runs are empty
   - EditPosition validity check

### Gradual Improvements (Medium Priority)

3. **Improve accuracy of edit position estimation**
   - Use LCS/Diff algorithm
   - Utilize `analyzeTextChanges`

4. **Utilize beforeinput event**
   - Identify edit position in advance
   - Performance improvement

### Optional Improvements (Low Priority)

5. **Handle simultaneous changes to multiple text nodes**
   - Batch processing
   - Current approach works sufficiently

6. **Improve Unicode handling**
   - Complex character handling
   - Current approach sufficient for most cases

## Final Assessment

### ✅ **You can proceed with this approach**

**Reasons:**
1. **Suitable for contenteditable-based editor**: Maximizes use of browser's native features
2. **Explicit control**: Logic is clear and easy to debug
3. **Flexibility**: Can handle various DOM structures and Mark/Decorator nesting
4. **Stability**: Major edge cases handled, error handling enhanced

**Cautions:**
- Edit position estimation accuracy is sufficient in most cases, but has room for improvement in complex edits
- Performance is currently sufficient, but optimization may be needed for large text

**Conclusion:**
Current approach is suitable for contenteditable-based editors, and with major improvements applied, can be used stably. Additional improvements can be made gradually based on issues discovered during actual use.
