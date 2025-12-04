# @barocss/text-analyzer

Smart text change analyzer with LCP/LCS algorithm and selection bias for accurate text difference calculation.

## Overview

`@barocss/text-analyzer` provides:

- **LCP/LCS Algorithm**: O(n) time complexity text difference calculation
- **Selection Bias**: Accurate change position detection based on selection
- **Unicode Safety**: Proper handling of complex characters (emojis, combining marks)
- **NFC Normalization**: Consistent text processing with Unicode normalization

## Installation

```bash
pnpm add @barocss/text-analyzer
```

## Usage

### Basic Text Analysis

```typescript
import { analyzeTextChanges } from '@barocss/text-analyzer';

const oldText = 'Hello World';
const newText = 'Hello Universe';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'replace', start: 6, end: 11, text: 'Universe' }]
```

### With Selection Bias

```typescript
import { analyzeTextChanges } from '@barocss/text-analyzer';

const oldText = 'Hello World';
const newText = 'Hello Universe';
const selectionStart = 6;  // Cursor position

const changes = analyzeTextChanges(oldText, newText, {
  selectionBias: selectionStart
});
// Uses selection position to determine change location
```

### With Options

```typescript
import { analyzeTextChanges } from '@barocss/text-analyzer';

const changes = analyzeTextChanges(oldText, newText, {
  selectionBias: 0,
  normalizeUnicode: true,  // Apply NFC normalization
  preserveWhitespace: false
});
```

## API Reference

### analyzeTextChanges

```typescript
function analyzeTextChanges(
  oldText: string,
  newText: string,
  options?: TextChangeAnalysisOptions
): TextChange[];
```

#### Parameters

- `oldText: string` - Previous text content
- `newText: string` - New text content
- `options?: TextChangeAnalysisOptions` - Analysis options

#### Returns

Array of `TextChange` objects describing the differences.

### Types

#### TextChange
```typescript
interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;      // Start position in old text
  end: number;        // End position in old text
  text?: string;      // New text (for insert/replace)
  length?: number;    // Length of change
}
```

#### TextChangeAnalysisOptions
```typescript
interface TextChangeAnalysisOptions {
  selectionBias?: number;        // Selection start position for bias
  normalizeUnicode?: boolean;    // Apply NFC normalization
  preserveWhitespace?: boolean;  // Preserve whitespace differences
}
```

#### TextDifference
```typescript
interface TextDifference {
  changes: TextChange[];
  oldLength: number;
  newLength: number;
}
```

## Algorithm Details

### LCP/LCS Algorithm

The analyzer uses Longest Common Prefix (LCP) and Longest Common Suffix (LCS) algorithms to efficiently calculate text differences in O(n) time complexity.

### Selection Bias

When a selection position is provided, the algorithm uses it to determine the most likely location of changes, improving accuracy for user-initiated edits.

### Unicode Handling

The analyzer properly handles:
- Emojis and complex Unicode characters
- Combining marks
- Zero-width characters
- Surrogate pairs

## Examples

### Insert Detection

```typescript
const oldText = 'Hello';
const newText = 'Hello World';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'insert', start: 5, end: 5, text: ' World' }]
```

### Delete Detection

```typescript
const oldText = 'Hello World';
const newText = 'Hello';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'delete', start: 5, end: 11 }]
```

### Replace Detection

```typescript
const oldText = 'Hello World';
const newText = 'Hello Universe';

const changes = analyzeTextChanges(oldText, newText);
// Result: [{ type: 'replace', start: 6, end: 11, text: 'Universe' }]
```

### Multiple Changes

```typescript
const oldText = 'Hello World';
const newText = 'Hi Universe';

const changes = analyzeTextChanges(oldText, newText);
// Result: [
//   { type: 'replace', start: 0, end: 5, text: 'Hi' },
//   { type: 'replace', start: 6, end: 11, text: 'Universe' }
// ]
```

## Performance

The analyzer is optimized for performance:
- O(n) time complexity for text difference calculation
- Efficient memory usage
- Fast Unicode normalization

## License

MIT

