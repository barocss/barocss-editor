---
name: package-text-analyzer
description: Smart text change analysis (LCP/LCS, selection bias). Use when deriving precise text diffs (insert/delete/replace) from old/new text for DOM sync or collaboration.
---

# @barocss/text-analyzer

## Scope

- **API**: `analyzeTextChanges(oldText, newText, options?)` → `TextChange[]`; options: `selectionBias`, `normalizeUnicode`, `preserveWhitespace`.
- **Types**: insert, delete, replace; each with start, end, and optional text/length.
- **Algorithm**: LCP/LCS-based; O(n); selection bias improves position when multiple interpretations exist (e.g. cursor at change).
- **Unicode**: NFC normalization when `normalizeUnicode`; handles emoji, combining marks, surrogate pairs.

## Rules

1. **Selection bias**: pass cursor/selection start when available (e.g. from DOM selection) so the analyzer prefers changes near that position.
2. **Use in editor-view-dom**: MutationObserver gives oldText/newText; call analyzeTextChanges and apply resulting TextChange[] to model (e.g. via model operations).
3. **Do not** use for full-document diff only; optimized for single-node or local text changes.
4. **References**: `packages/text-analyzer/`; consumed by `@barocss/editor-view-dom`.

## Quick reference

- Package: `packages/text-analyzer/`
- Entry: analyzeTextChanges(oldText, newText, options?)
- Types: TextChange (type, start, end, text?, length?), TextChangeAnalysisOptions
