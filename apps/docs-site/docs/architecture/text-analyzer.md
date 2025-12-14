# @barocss/text-analyzer

Smart text change analyzer with LCP/LCS algorithm and selection bias for accurate text difference calculation.

## Purpose

Analyzes text changes between old and new text content, providing precise change detection for:
- DOM mutation synchronization
- Collaborative editing
- Undo/redo operations
- Text change tracking

## Key Exports

- `analyzeTextChanges()` - Analyze text differences
- `TextChange` - Change description type
- `TextChangeAnalysisOptions` - Analysis options

## Basic Usage

```typescript
import { analyzeTextChanges } from '@barocss/text-analyzer';

const oldText = 'Hello World';
const newText = 'Hello Universe';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'replace', start: 6, end: 11, text: 'Universe' }]
```

## Text Change Types

The analyzer detects three types of changes:

### Insert

```typescript
const oldText = 'Hello';
const newText = 'Hello World';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'insert', start: 5, end: 5, text: ' World' }]
```

### Delete

```typescript
const oldText = 'Hello World';
const newText = 'Hello';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'delete', start: 5, end: 11 }]
```

### Replace

```typescript
const oldText = 'Hello World';
const newText = 'Hello Universe';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'replace', start: 6, end: 11, text: 'Universe' }]
```

## Selection Bias

Use selection position to improve accuracy:

```typescript
const oldText = 'Hello World';
const newText = 'Hello Universe';
const selectionStart = 6;  // Cursor position

const changes = analyzeTextChanges(oldText, newText, {
  selectionBias: selectionStart
});
// Uses selection position to determine change location
```

**Why selection bias matters:**
- User edits typically happen at cursor position
- Improves accuracy for ambiguous changes
- Better handling of multiple possible change locations

## Algorithm Details

### LCP/LCS Algorithm

The analyzer uses Longest Common Prefix (LCP) and Longest Common Suffix (LCS) algorithms:
- **Time Complexity**: O(n) where n is text length
- **Space Complexity**: O(n)
- **Efficiency**: Fast even for large texts

### Unicode Handling

Properly handles complex Unicode:
- Emojis and complex characters
- Combining marks
- Zero-width characters
- Surrogate pairs
- NFC normalization

## Options

```typescript
const changes = analyzeTextChanges(oldText, newText, {
  selectionBias: 0,              // Selection start position
  normalizeUnicode: true,        // Apply NFC normalization
  preserveWhitespace: false      // Preserve whitespace differences
});
```

## Integration

Text analyzer is used by:
- **Editor View DOM**: Analyzes DOM text changes
- **MutationObserver**: Detects text mutations
- **Collaboration**: Syncs text changes across clients

## Performance

- **O(n) time complexity** for text difference calculation
- **Efficient memory usage** with minimal allocations
- **Fast Unicode normalization** using native APIs
- **Optimized for real-time** editing scenarios

## When to Use

- **DOM Change Detection**: Analyze text changes from MutationObserver
- **Collaborative Editing**: Detect and sync text changes
- **Undo/Redo**: Track text modifications
- **Change Tracking**: Monitor document changes

## Related

- [Editor View DOM](./editor-view-dom) - Uses text analyzer for DOM changes
- [DOM Observer](./dom-observer) - Works with mutation observer
