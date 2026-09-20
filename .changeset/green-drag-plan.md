---
"@barocss/model": minor
"@barocss/extensions": minor
"@barocss/shared": minor
"@barocss/editor-view-dom": patch
"@barocss/editor-view-react": patch
"@barocss/office-note": patch
"@barocss/office-site": patch
---

Route native flow drag/drop and product block transfers through schema editing plans.

Resolve the actual pointer position, authorize moves only from live local drag sessions, preserve whole-node IDs and exact undo order, and reject stale or invalid edits without partial writes. Add trusted `transferNodes`, `gapBeforeRemoval`, explicit move sources and no-op plans. Copy retains the existing schema adapter and reference policy contract.

Reorder, Note and Site flow moves now honor schema and editing policy rejection. Multi-run text moves, cross-document atomic moves, table ranges, canvas placement and file transport remain outside the generic flow move API. Whole-node drag handles remain product-owned; native copy uses Alt or Ctrl. See the repository DND contract for ID, position and performance limits.
