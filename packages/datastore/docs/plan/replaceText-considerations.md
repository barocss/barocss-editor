# replaceText Considerations and Improvements

## Current Implementation Status

`replaceText` automatically adjusts marks when replacing text, but there are several considerations.

## Discovered Considerations

### 1. Normalization ✅ Resolved

**Current state** (updated):
- `replaceText` automatically performs normalization via `setMarks` after mark adjustment.
- Performs normalization in the same way as other methods (`applyMark`, `removeMark`, etc.).

**Implementation:**
```typescript
// Update text first
this.dataStore.updateNode(nodeId, { text: updatedText }, false);

// Normalize marks via setMarks for consistency with other mark operations
if (updatedMarks.length > 0) {
  this.dataStore.marks.setMarks(nodeId, updatedMarks, { normalize: true });
} else {
  // Explicitly set empty marks if needed
  this.dataStore.marks.setMarks(nodeId, [], { normalize: true });
}
```

**Effects:**
- Empty ranges or duplicate marks created during adjustment are automatically normalized.
- Adjacent marks of the same type are automatically merged.
- Ensures consistent behavior with other mark-related methods.

---

### 2. Mark Range Validity Check

**Current state:**
- Does not explicitly check validity of `[ms0, me0]`.
- Uses `[0, text.length]` as default when `range` is not present.

**Potential problems:**
- `ms0 > me0` (reverse range)
- `ms0 < 0` or `me0 > text.length` (range exceeds)
- `ms0 === me0` (empty range)

**Current handling:**
- Filters empty ranges in some cases (`newEnd > newStart` check)
- But not consistently handled in all cases

**Recommendation:**
```typescript
// Add empty range check in each case
if (newEnd > newStart) {
  resultMarks.push({ ...m, range: [newStart, newEnd] });
}
```

---

### 3. Delta Threshold (`delta >= -1`)

**Current logic:**
- `delta >= -1`: Expand (do not split)
- `delta < -1`: Split

**Considerations:**
- `delta = -1` means deletion of 1 character.
- Actually treated as "small deletion" and expanded.
- This may be intended behavior, but may differ from user intent.

**Example:**
```
Text: "Hello world"
Mark:   [0, 11] (bold)
Replace:   [5, 6] " " → "" (space deletion)
Delta:  0 - 1 = -1
Result:   [0, 10] (expanded) ✅

Text: "Hello beautiful world"
Mark:   [0, 22] (bold)
Replace:   [5, 15] " beautiful" → ""
Delta:  0 - 10 = -10
Result:   [0, 5], [5, 12] (split) ✅
```

**Recommendation:**
- Current logic is reasonable.
- But it would be good to clarify intent through documentation.

---

### 4. Multi-node Path

**Current implementation:**
```typescript
// Fallback: multi-node path via delete + insert
// Note: deleteText does not change node IDs, only updates text content.
// After deletion, startNodeId still exists and startOffset is valid
// (it becomes the end of the remaining text in start node).
const deletedText = this.deleteText(contentRange);
const insertRange = {
  startNodeId: contentRange.startNodeId,
  startOffset: contentRange.startOffset,
  endNodeId: contentRange.startNodeId,
  endOffset: contentRange.startOffset
};
this.insertText(insertRange, newText);
return deletedText;
```

**Considerations:**
- `deleteText` does not change node IDs, only updates text content.
- After `deleteText`, `startNodeId` is still valid, and `startOffset` becomes the end position of remaining text.
- Therefore, there is no need to recreate `insertRange`.
- `deleteText` and `insertText` each adjust marks.
- Mark state may be temporarily inconsistent between the two operations.
- But final result is maintained consistently.

**Recommendation:**
- Current implementation is appropriate.
- But should be executed within a transaction.

---

### 5. Edge Cases

#### 5.1. Empty Text Node

**Scenario**: When all text is deleted and becomes empty string

**Current handling:**
- Marks are adjusted, but marks for empty text are meaningless.
- Empty text marks are removed in `normalizeMarks`.

**Recommendation:**
- Current handling is appropriate.

#### 5.2. Range Exceeds Text Length

**Current handling:**
```typescript
if (start > end || start < 0 || end > text.length) {
  console.warn('[RangeOperations.replaceText] Invalid range', ...);
  return '';
}
```

**Recommendation:**
- Current validation is appropriate.

#### 5.3. Multiple Marks Share Same Range

**Scenario**: When multiple types of marks exist on the same range

**Current handling:**
- Each mark is adjusted independently.
- Duplicates are removed during normalization.

**Recommendation:**
- Current handling is appropriate.

---

### 6. Performance Considerations

**Current implementation:**
- Sequentially checks conditions for each mark.
- Time complexity: O(n) where n = number of marks

**Optimization possibility:**
- When there are many marks (hundreds or more)
- Use binary search to process only relevant marks
- But current implementation is sufficient for typical use cases

**Recommendation:**
- Keep current implementation
- Optimize after performance profiling if needed

---

### 7. Consistency and Testing

**Current state:**
- Single node path is implemented in detail
- Multi-node path handled with `deleteText` + `insertText`

**Recommendation:**
- Add test cases for single node path
- Add test cases for edge cases
- Add integration tests for multi-node path

---

## Improvement Proposal Summary

### High Priority

1. **Strengthen empty range filtering**
   - Add empty range check in all cases
   - Remove if `ms0 >= me0`
   - Note: Empty ranges are automatically removed during normalization, but filtering at adjustment stage is clearer.

### Medium Priority

3. **Document delta threshold**
   - Clarify intent of `delta >= -1` condition
   - Add usage examples

4. **Edge cases testing**
   - Empty text node
   - Range exceeds
   - Multiple marks sharing

### Low Priority

5. **Performance optimization**
   - Optimize when there are many marks
   - Implement only when needed

---

## Conclusion

Current `replaceText` implementation works well in most use cases.

**Resolved items:**
- ✅ **Normalization**: Automatically performs normalization via `setMarks` (maintains consistency with other mark-related methods)

**Remaining improvements:**
1. **Strengthen empty range filtering**: Handle consistently in all cases (optional, handled in normalization but for clarity)
2. **Strengthen testing**: Add tests for edge cases

Current implementation is stable and ensures consistent behavior with other mark-related methods.
