---
"@barocss/schema": minor
"@barocss/datastore": minor
"@barocss/model": minor
---

Add explicit open-fragment validation and editor-scoped FragmentEditor policies with a small transaction-backed copy consumer. Preserve source boundaries, marks and declared references, reject stale plans, and replay durable IDs during undo/redo. Add monotonic datastore edit/document epochs without changing the legacy version field. Existing clipboard paste and DND paths remain unchanged until their follow-up integrations.
