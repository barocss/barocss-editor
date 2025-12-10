# Relationship Between replaceText Data and Mark Transformation

## Overview

The `RangeOperations.replaceText()` method automatically adjusts all marks of a node when replacing a text range. This document explains in detail the impact of text replacement operations on marks.

## Basic Concepts

### Terminology

- **Replacement Range**: `[start, end]` - Start and end offset of text to be replaced
- **New Text (newText)**: New text to be inserted into replacement range
- **Delta (δ)**: `newText.length - (end - start)` - Text length change
- **Mark Range**: `[ms0, me0]` - Text range where Mark is applied

### Mark Adjustment Principles

1. **Preserve continuity**: Maintain mark continuity as much as possible.
2. **Preserve range**: Mark ranges outside replacement range remain unchanged.
3. **Automatic adjustment**: Marks overlapping replacement range are automatically adjusted.
4. **Minimize splitting**: Minimize unnecessary mark splitting.

## Mark Adjustment Cases

### Case 1: Mark is Before Replacement Range

**Condition**: `me0 <= start`

**Behavior**: Mark range is unchanged.

**Example:**
```
Text: "Hello world"
Mark:   [0, 5] "Hello" (bold)
Replace:   [6, 11] "world" → "universe"
Result:   [0, 5] "Hello" (bold) - unchanged
```

**Visualization:**
```
Before: [Hello][world]
        [====]         (bold mark)
        [     ][====]  (replacement range)

After:  [Hello][universe]
        [====]         (bold mark - unchanged)
```

---

### Case 2: Mark is After Replacement Range

**Condition**: `ms0 >= end`

**Behavior**: Mark range start and end move by delta.

**Transformation formula**: `[ms0 + delta, me0 + delta]`

**Example:**
```
Text: "Hello world"
Mark:   [6, 11] "world" (bold)
Replace:   [0, 5] "Hello" → "Hi"
Delta:  2 - 5 = -3
Result:   [3, 8] "world" (bold) - offset adjusted
```

**Visualization:**
```
Before: [Hello][world]
        [====]         (replacement range)
        [     ][====]   (bold mark)

After:  [Hi][world]
        [==]           (replacement range)
        [  ][====]     (bold mark - shifted left by 3)
```

---

### Case 3: Mark Overlaps Left Side of Replacement Range (Overlaps Left Only)

**Condition**: `ms0 < start && me0 > start && me0 <= end`

**Behavior**: Only left part of Mark is kept, part overlapping replacement range is removed.

**Transformation formula**: `[ms0, start]`

**Example:**
```
Text: "Hello world"
Mark:   [0, 7] "Hello w" (bold)
Replace:   [5, 11] " world" → " universe"
Result:   [0, 5] "Hello" (bold) - overlapping part removed
```

**Visualization:**
```
Before: [Hello world]
        [========]     (bold mark)
        [     ][====]  (replacement range)

After:  [Hello][universe]
        [====]         (bold mark - truncated to [0, 5])
        [     ][======]
```

---

### Case 4: Mark Overlaps Right Side of Replacement Range (Overlaps Right Only)

**Condition**: `ms0 >= start && ms0 < end && me0 > end`

**Behavior**: Only right part of Mark is kept, offset is adjusted.

**Transformation formula**: `[start + newText.length, me0 + delta]`

**Condition**: Only kept if `newEnd > newStart`.

**Example:**
```
Text: "Hello world"
Mark:   [5, 11] " world" (bold)
Replace:   [0, 5] "Hello" → "Hi"
Delta:  2 - 5 = -3
newStart: 0 + 2 = 2
newEnd: 11 + (-3) = 8
Result:   [2, 8] " world" (bold) - offset adjusted
```

**Visualization:**
```
Before: [Hello][world]
        [====]         (replacement range)
        [     ][====]  (bold mark)

After:  [Hi][world]
        [==]           (replacement range)
        [  ][====]     (bold mark - shifted and truncated)
```

---

### Case 5: Mark is Fully Inside Replacement Range (Fully Inside)

**Condition**: `ms0 >= start && me0 <= end`

**Behavior**: Mark is completely removed.

**Example:**
```
Text: "Hello world"
Mark:   [6, 8] "wo" (bold)
Replace:   [5, 11] " world" → " universe"
Result:   (removed) - mark is fully inside replacement range
```

**Visualization:**
```
Before: [Hello][world]
        [     ][====]  (replacement range)
        [      ][=]    (bold mark - fully inside)

After:  [Hello][universe]
        [     ][========] (replacement range)
        (bold mark removed)
```

---

### Case 6: Mark Fully Contains Replacement Range (Spans Across)

**Condition**: `ms0 < start && me0 > end`

This case is handled differently depending on replacement type.

#### 6-1: Insertion - `start === end`

**Behavior**: Expand Mark range to include inserted text.

**Transformation formula**: `[ms0, me0 + delta]`

**Example:**
```
Text: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
Replace:   [5, 5] "" → " beautiful"
Delta:  10 - 0 = 10
Result:   [0, 21] "Hello beautiful world" (bold) - expanded
```

**Visualization:**
```
Before: [Hello world]
        [===========]  (bold mark)
        [     |]       (insertion point)

After:  [Hello beautiful world]
        [====================]  (bold mark - extended)
```

#### 6-2: Small Replacement/Deletion - `delta >= -1`

**Behavior**: Expand Mark range to include replaced text.

**Transformation formula**: `[ms0, me0 + delta]`

**Example:**
```
Text: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
Replace:   [5, 6] " " → "x"
Delta:  1 - 1 = 0
Result:   [0, 11] "Helloxworld" (bold) - expanded (delta=0 so same length)
```

**Example (1 character deletion):**
```
Text: "Hello world"
Mark:   [0, 11] "Hello world" (bold)
Replace:   [5, 6] " " → ""
Delta:  0 - 1 = -1
Result:   [0, 10] "Helloworld" (bold) - expanded (delta=-1 so 1 character decrease)
```

**Visualization:**
```
Before: [Hello world]
        [===========]  (bold mark)
        [     ][=]     (replacement range)

After:  [Helloxworld]
        [==========]   (bold mark - extended, delta=0)
```

#### 6-3: Large Deletion - `delta < -1`

**Behavior**: Split Mark into two.

**Transformation formula:**
- Left part: `[ms0, start]`
- Right part: `[start + newText.length, me0 + delta]`
- Condition: Right part only kept if `rightEnd > rightStart`

**Example:**
```
Text: "Hello beautiful world"
Mark:   [0, 22] "Hello beautiful world" (bold)
Replace:   [5, 15] " beautiful" → ""
Delta:  0 - 10 = -10
Result:   
  - Left: [0, 5] "Hello" (bold)
  - Right: [5, 12] " world" (bold) - split
```

**Visualization:**
```
Before: [Hello beautiful world]
        [====================]  (bold mark)
        [     ][==========]      (replacement range - large deletion)

After:  [Hello][world]
        [====]         (bold mark - left part)
        [     ][====]  (bold mark - right part)
```

---

## Delta Calculation

Delta represents text length change:

```typescript
delta = newText.length - (end - start)
```

### Meaning of Delta Values

- **delta > 0**: Text increases (insertion or expansion)
- **delta = 0**: Text length same (replacement)
- **delta < 0**: Text decreases (deletion)

### Delta Examples

| Replacement Range | New Text | Delta | Description |
|------------------|----------|-------|-------------|
| `[5, 5]` | `"x"` | `1` | 1 character insertion |
| `[5, 6]` | `"x"` | `0` | 1 character replacement |
| `[5, 6]` | `""` | `-1` | 1 character deletion |
| `[5, 10]` | `"x"` | `-4` | 5 characters → 1 character (4 characters decrease) |
| `[5, 5]` | `"hello"` | `5` | 5 character insertion |

## Complex Case Examples

### Example 1: Multiple Marks

```
Initial text: "Hello world"
Marks:
  - bold: [0, 11]
  - italic: [6, 11]

Replace: [5, 6] " " → "x"

Processing:
1. bold [0, 11]:
   - spansAcross (0 < 5 && 11 > 6)
   - delta = 1 - 1 = 0
   - delta >= -1 → expand: [0, 11]

2. italic [6, 11]:
   - ms0 >= end? 6 >= 6? false
   - overlapsRightOnly? 6 >= 5 && 6 < 6 && 11 > 6? false
   - spansAcross? 6 < 5? false
   - Actually: ms0 = 6, end = 6 so ms0 >= end is false
   - But me0 > end (11 > 6) so handled as overlapsRightOnly
   - newStart = 5 + 1 = 6
   - newEnd = 11 + 0 = 11
   - Result: [6, 11] (unchanged, delta=0)

Final result:
  - bold: [0, 11] "Helloxworld"
  - italic: [6, 11] "world"
```

### Example 2: Mark Splitting Case

```
Initial text: "Hello beautiful world"
Marks:
  - bold: [0, 22]

Replace: [5, 15] " beautiful" → ""

Processing:
1. bold [0, 22]:
   - spansAcross (0 < 5 && 22 > 15)
   - delta = 0 - 10 = -10
   - delta < -1 → split
   - Left: [0, 5] "Hello"
   - Right: [5, 12] " world" (15 + 0 = 15, 22 + (-10) = 12)

Final result:
  - bold: [0, 5] "Hello"
  - bold: [5, 12] " world"
```

## Implementation Details

### Processing Order

1. For each mark, check conditions in the following order:
   - `me0 <= start` → Case 1
   - `ms0 >= end` → Case 2
   - `overlapsLeftOnly` → Case 3
   - `overlapsRightOnly` → Case 4
   - `fullyInside` → Case 5 (remove)
   - `spansAcross` → Case 6

2. Each case is handled independently, and one mark corresponds to only one case.

### Notes

1. **Remove empty ranges**: `overlapsRightOnly` and right part of `spansAcross` check `newEnd > newStart` condition to remove empty ranges.

2. **Delta calculation**: Delta is text length change, so use `delta` directly when adjusting mark ranges.

3. **Preserve continuity**: In `spansAcross` case, small replacement/deletion (`delta >= -1`) expands mark instead of splitting to preserve continuity.

## Table Summary

| Case | Condition | Behavior | Transformation Formula |
|------|-----------|----------|----------------------|
| 1. Before | `me0 <= start` | Unchanged | `[ms0, me0]` |
| 2. After | `ms0 >= end` | Offset shift | `[ms0 + delta, me0 + delta]` |
| 3. Left overlap | `ms0 < start && me0 > start && me0 <= end` | Keep left part only | `[ms0, start]` |
| 4. Right overlap | `ms0 >= start && ms0 < end && me0 > end` | Keep right part only (offset adjusted) | `[start + newText.length, me0 + delta]` (if `newEnd > newStart`) |
| 5. Fully inside | `ms0 >= start && me0 <= end` | Remove | (removed) |
| 6-1. Insertion | `spansAcross && start === end` | Expand | `[ms0, me0 + delta]` |
| 6-2. Small replacement | `spansAcross && start < end && delta >= -1` | Expand | `[ms0, me0 + delta]` |
| 6-3. Large deletion | `spansAcross && start < end && delta < -1` | Split | Left: `[ms0, start]`, Right: `[start + newText.length, me0 + delta]` (if `rightEnd > rightStart`) |

## Mark Normalization

`replaceText` automatically performs normalization after mark adjustment:

1. **Remove empty ranges**: Remove marks where `ms0 >= me0`
2. **Clamp ranges**: Adjust ranges to fit text length
3. **Remove duplicates**: Remove marks with same (stype, attrs, range)
4. **Merge**: Merge adjacent or overlapping marks of same type
5. **Sort**: Sort by start offset

Normalization is performed via `setMarks` and handled in the same way as other mark-related methods (`applyMark`, `removeMark`, etc.).

## Notes

- This document describes the single node path (fast-path) of the `RangeOperations.replaceText()` method.
- Multi-node paths are handled with `deleteText()` + `insertText()` combination.
- Mark adjustment is an atomic operation, all marks are adjusted simultaneously.
- Automatic normalization is performed after mark adjustment to ensure consistent state.
