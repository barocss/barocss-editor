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

## Selection Bias (Post-input Cursor)

`selectionBias` uses the cursor/selection position *after* the edit to disambiguate where the change happened.

Behavior:
- Uses the final cursor position (selection start) as the bias center.
- `insert`: uses the LCP/LCS result as-is (already precise).
- `replace` (1x1) and `delete`: re-search around the bias center.
  - replace 1x1: simulate within radius ≤ 3; skip candidates outside selection range.
  - delete: simulate within radius ≤ 6; pick the best match by overlap with selection and distance to the bias center.
- If a selection range exists, the range center is the bias center; candidates outside the range are skipped.

Example:
```typescript
const changes = analyzeTextChanges(oldText, newText, {
  selectionBias: cursorAfterInput, // cursor position after the edit
});
```

## Algorithm Details

### LCP/LCS Algorithm (Precise windowing)

- **Steps**
  1) **LCP**: scan from the front until chars differ → common prefix length `lcp`.
  2) **LCS**: scan from the back after trimming LCP → common suffix length `lcs`.
  3) **Change window**: old `[lcp, oldLen - lcs)`, new `[lcp, newLen - lcs)`.
  4) Classify: only inserted? → insert; only deleted? → delete; both → replace; none → none.

- **Complexity**: O(n) time, O(1) extra space (two pointers; only slices for the result).
- **Why accurate**: LCP/LCS shrink ambiguity to the minimal differing window before any selection biasing.

**Example – replace with bias after the window**
```ts
const oldText = 'abcXdefXghi';
const newText = 'abcYdefXghi';
// LCP = 'abc', LCS = 'defXghi'
// Change window: old[3..4)='X' → new[3..4)='Y' (replace at index 3)
// selectionBias near the second 'X' does NOT move the window (ambiguity already resolved).
```

**Example – delete with bias**
```ts
const oldText = 'aaaaa';
const newText = 'aaaa';
// LCP=4, LCS=0 → delete window at end by default
// selectionBias lets bias search relocate the delete toward the cursor intent.

// Cursor after the edit is at the start (0)
const biased = analyzeTextChanges(oldText, newText, { selectionBias: 0 });
// Result: delete at start (closer to cursor)

// Cursor after the edit is near the end (4)
const unbiased = analyzeTextChanges(oldText, newText, { selectionBias: 4 });
// Result: [{ type: 'delete', start: 4, end: 5 }]
```

**Example – selection range bias (collapse vs. range)**
```ts
// Replace a single char but selection spanned two chars
const oldText = 'abc';
const newText = 'axc';

// Cursor only (collapsed at 1): bias centers on index 1
analyzeTextChanges(oldText, newText, { selectionBias: 1 });
// Result: [{ type: 'replace', start: 1, end: 2, text: 'x' }]

// Selection range [0,2): bias centers between 0 and 2, stays inside range
analyzeTextChanges(oldText, newText, { selectionBias: 0 }); // range center treated as bias
// Result: [{ type: 'replace', start: 1, end: 2, text: 'x' }] (stays inside range)
```

**Example – Unicode insert with zero-width characters**
```ts
const oldText = 'Hello';
const newText = 'Hel\u200blo'; // inserts ZWSP between l and o

analyzeTextChanges(oldText, newText);
// Result: [{ type: 'insert', start: 3, end: 3, text: '\u200b' }]
```

**Example – Normalize to avoid false replaces**
```ts
const oldText = 'e\u0301cole';      // e + combining acute
const newText = 'école';           // precomposed

analyzeTextChanges(oldText, newText, { normalizeUnicode: true });
// Result: []  (no change after NFC)

analyzeTextChanges(oldText, newText, { normalizeUnicode: false });
// Result: [{ type: 'replace', start: 0, end: 2, text: 'é' }] (raw diff without NFC)
```

### Additional Examples (insert / delete / replace)

**Insert (multi-char)**
```ts
const oldText = 'Hello';
const newText = 'Hello world';
analyzeTextChanges(oldText, newText);
// Result: [{ type: 'insert', start: 5, end: 5, text: ' world' }]
```

**Delete (middle span)**
```ts
const oldText = 'fooBARbaz';
const newText = 'foobaz';
analyzeTextChanges(oldText, newText);
// Result: [{ type: 'delete', start: 3, end: 6 }]
```

**Replace (multi-char)**
```ts
const oldText = 'abcdef';
const newText = 'abXYZef';
analyzeTextChanges(oldText, newText);
// Result: [{ type: 'replace', start: 2, end: 4, text: 'XYZ' }] // old[2..4)='cd' -> 'XYZ'
```

**Insert (single-char, colour)**
```ts
const oldText = 'color';
const newText = 'colour';
analyzeTextChanges(oldText, newText);
// Result: [{ type: 'insert', start: 4, end: 4, text: 'u' }] // insert 'u' before final 'r'
```

**Insert with selectionBias near end**
```ts
const oldText = '12345';
const newText = '1234-5';
analyzeTextChanges(oldText, newText, { selectionBias: 5 });
// Result: [{ type: 'insert', start: 4, end: 4, text: '-' }]
```

**Delete with selectionBias in middle**
```ts
const oldText = 'abc---def';
const newText = 'abcdef';
analyzeTextChanges(oldText, newText, { selectionBias: 4 });
// Result: [{ type: 'delete', start: 3, end: 6 }]
```

**Replace with combining marks (no NFC)**
```ts
const oldText = 'a\u0308';  // a + diaeresis
const newText = 'ä';
analyzeTextChanges(oldText, newText, { normalizeUnicode: false });
// Result: [{ type: 'replace', start: 0, end: 2, text: 'ä' }]
```

### Unicode Handling (code-point safe)

- Works on UTF-16 code units for speed, but compares exact sequences so grapheme clusters (emoji+ZWJ, combining marks) are kept intact.
- Optional `normalizeUnicode: true` does NFC normalization first, so canonically equivalent strings don’t produce false diffs.
- Zero-width chars (ZWS, ZWNJ, ZWJ) are treated as significant; diffs won’t drop them implicitly.
- Surrogate pairs are compared as exact code-unit pairs; no split comparisons.

**Example – emoji replacement**
```ts
const oldText = 'hi 👩‍💻!';
const newText = 'hi 👩‍🚀!';
// LCP = 'hi ', LCS = '!'
// Change window isolates the full ZWJ emoji sequence; replace occurs on the whole sequence, not partial units.
```

**Example – combining marks**
```ts
const oldText = 'e\u0301cole';  // e + combining acute
const newText = 'école';       // precomposed
const changes = analyzeTextChanges(oldText, newText, { normalizeUnicode: true });
// After NFC, texts are equivalent → no diff; prevents false replace on combining marks.
```

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
