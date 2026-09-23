# @barocss/office-note-file

Private Node.js bundle of the Note snapshot codec. Its build uses the same source implementation as `@barocss/office-note/file` and produces a self-contained ES module. The API service must build this package before loading it from a workspace checkout.

`serializeNoteFile` writes deterministic bytes when given the same document and `savedAt`. `readNoteSnapshotFile` validates a Note file and preserves its optional `savedAt`. `copyNoteSnapshotFile` accepts a server-issued new page ID and rewrites the root and its own page references. The service owns authentication, ID issuance, idempotency, hashing, and database transactions.

For migration input, `savedAt` is optional. Any nonempty JSON string is preserved verbatim, even if it is not an ISO date. An empty or non-string value returns `{ error }` from the reader; the serializer throws for an invalid explicit value.

Malformed source files return `{ error }` from the copy function. The new page ID is a server-owned invariant: it must pass `isNotePageId` and differ from the source page ID. An invalid or unchanged new ID throws. The service must not pass a client-supplied ID to this function.
