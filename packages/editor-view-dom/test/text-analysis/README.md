# Text Analysis Tests

This directory tests text change detection and analysis algorithms.

## Test Files

### `smart-text-analyzer.test.ts`
- Core algorithm tests for Smart Text Analyzer
- LCP/LCS-based text change detection
- Selection Bias application validation
- Change type classification (insert, delete, replace)
- Confidence calculation tests

### `basic-text-analysis.test.ts`
- Basic text change scenario tests
- Simple insert, delete, replace cases
- Basic algorithm behavior validation

### `unicode-text-analysis.test.ts`
- Unicode and composite character handling tests
- Emoji, CJK characters, RTL text handling
- Normalization tests
- Composite character boundary detection

## Core Concepts

### TextChange Structure
```typescript
interface TextChange {
  type: 'insert' | 'delete' | 'replace';
  start: number;
  end: number;
  text: string;
  confidence: number;
}
```

### Algorithm Features
- **LCP/LCS**: Efficient comparison based on Longest Common Prefix/Suffix
- **Selection Bias**: Change point estimation considering cursor position
- **Unicode Safe**: Safe handling of composite characters and surrogate pairs

## How to Run

```bash
# Run all text analysis tests
pnpm test test/text-analysis

# Run specific test file
pnpm test test/text-analysis/smart-text-analyzer.test.ts
```
