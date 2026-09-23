---
"@barocss/editor-core": patch
"@barocss/model": patch
---

Keep undo and redo history unchanged when replay fails before commit. Serialize replay entry selection and history finalization with ordinary edits, and preserve successful replay results when post-commit notifications fail.
