---
"@barocss/schema": minor
"@barocss/datastore": minor
"@barocss/model": minor
---

Add explicit open-fragment validation and editor-scoped FragmentEditor policies with a small transaction-backed copy consumer. Preserve source boundaries, marks and declared references, reject stale plans, and replay durable IDs during undo/redo. Add monotonic datastore edit/document epochs without changing the legacy version field. Existing clipboard paste and DND paths remain unchanged until their follow-up integrations.

Add editor-scoped defineEditingRule/defineEditingPolicy values consumed by the fragment planner. Resolve explicit priorities deterministically, reject conflicting rules, record decision traces, and preserve differing boundary types/attributes by default. Supported rule effects are open inline joining, structure preservation, and rejection; final schema, marks, isolation and reference checks remain mandatory.
