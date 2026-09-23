# @barocss/office-note-file

Private Node.js bundle of the Note snapshot codec. Its build uses the same source implementation as `@barocss/office-note/file` and produces a self-contained ES module. The API service must build this package before loading it from a workspace checkout.

`serializeNoteFile` writes deterministic bytes when given the same document and `savedAt`. `readNoteSnapshotFile` validates a Note file and preserves its optional `savedAt`. `copyNoteSnapshotFile` accepts a server-issued new page ID and rewrites the root and its own page references. The service owns authentication, ID issuance, idempotency, hashing, and database transactions.
