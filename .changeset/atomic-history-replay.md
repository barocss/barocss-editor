---
"@barocss/editor-core": patch
"@barocss/model": patch
---

Keep undo and redo history unchanged when replay fails before commit. Select and finalize replay entries under the FIFO model lock, and keep committed replay successful when later notifications fail. This applies to local editor history; collaborative actor-safe undo remains separate.
