---
"@barocss/model": patch
"@barocss/datastore": patch
"@barocss/editor-core": patch
---

Restore rejected transactions completely, recover partial commit writes, and publish buffered operations only after commit. Add an explicit commit outcome and separate post-commit errors so notification failures do not cause an already committed edit to be retried. Transaction operation subscribers now receive committed changes only; writes outside a transaction remain immediate.
