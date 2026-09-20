---
"@barocss/model": minor
"@barocss/extensions": minor
"@barocss/shared": minor
"@barocss/editor-view-dom": patch
"@barocss/editor-view-react": patch
---

Preserve fragment boundaries, source identity, marks, and reference declarations through native and HTML clipboard transports. Route schema-backed body paste through editor-scoped planning and transactional application, including sibling text ranges, stale-read rejection, exact undo/redo, and read-only guards.

Expose clipboard codecs, `FragmentEditor.forEditor`, range capture, plain-text import, and `standardClipboardPolicy`. Products may declare a portable `schemaId`/`schemaRevision` contract; equal type names alone do not establish compatibility. Existing custom policy owners must explicitly compose external-input adapters. Known non-literal losses require acceptance. Text-only fallback and legacy direct `paste(nodes, range)` calls do not provide fragment round-trip guarantees. See `packages/extensions/docs/copy-paste-cut-spec.md`.
