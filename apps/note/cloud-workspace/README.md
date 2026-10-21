# Cloud Note workspace

This slice embeds the existing `@barocss/office-note` `NoteEditor`, `openNoteTree`, native
history and Note v1 codec. It does not replace the editor or enable held Word Apply, Yorkie,
native2 adoption, local-model services, or a second task store.

The UI supports document discovery/search, a new native Note, direct editing, native undo/redo,
explicit save, reload/reopen, and preserved in-memory drafts during failed or conflicting saves.
Saved documents use structured complete Note v1 snapshots, not HTML or textarea strings.
Each server save appends an immutable document revision. Document revisions are unrelated to
Git commits and Sites application deployment versions.

AI is deliberately unavailable. No provider is configured, no content is sent to a model, no
fixtures appear as generated proposals, and the request button is disabled. A future supported
runtime must use the existing `captureNoteParagraph` proposal/preview/apply contract and validate
the frozen document/revision/current identity before applying. The accepted native proposal
tests in `packages/office-note/test/connected-proposal.test.ts` and
`note-proposal-native-history.test.ts` remain unchanged. There is no live AI acceptance claim.

## Build and checks

Use repository `.nvmrc` Node 22.22.0 and pnpm 8.15.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @barocss/schema build
pnpm --dir apps/note exec node cloud-workspace/build-worker.mjs
pnpm --dir apps/note exec node --test cloud-workspace/server.test.mjs
pnpm --dir apps/note exec playwright test --config cloud-workspace/playwright.config.ts --reporter=line
pnpm --filter @barocss/office-note test:run test/note-proposal-native-history.test.ts test/connected-proposal.test.ts
pnpm preflight
```

The browser config uses already-installed `/usr/bin/chromium`. Override `CLOUD_CHROMIUM_PATH`
with an installed executable on another cloud machine. No browser installation is performed.
Browser tests run the complete built Worker through a loopback-only HTTP harness and real
SQLite. The harness supplies fictional identities and never ships in the Worker. This proves
the local application/SQL behavior, not actual Sites authentication, D1 deployment, or access policy.
The server tests separately close and reopen an on-disk SQLite database to verify persistence.

`test-db.mjs`, `test-server.mjs`, test cookies and Node SQLite are test infrastructure only.
Production output contains no test identity or test endpoints and uses no Node APIs.

The application build emits:

- `dist/client/`: Vite's native Note frontend and existing font assets.
- `dist/api/workspace-api.mjs`: bundled API for targeted SQL tests.
- `dist/server/index.js`: self-contained Worker ESM, default `fetch(request, env)`.

Client assets are embedded in the Worker. This requires only documented `env.DB`, with no
invented static asset binding, arbitrary Node server, PostgreSQL, or R2 requirement.

## Sites publisher contract

Create a **new owner-private Site**. Do not reuse an existing prototype/monitor ID. Keep plugin
tools, downloads, credentials, generated output and repository metadata out of source commits.
Use the official Sites setup/source/build/package helpers for publication; this script only
builds the application. GitHub remains the code source of truth. Record the exact GitHub SHA,
separate pushed Sites source SHA, saved version, deployment ID and final private URL.

The publisher must add the returned Site identity and documented logical storage binding:

```json
{"project_id":"<exact returned Site ID>","d1":"DB","r2":null}
```

This is Worker mode; there is no `static` field. Stage the built Worker as
`dist/server/index.js`, and let official packaging include the source hosting manifest as
`dist/.openai/hosting.json`. Use the official starter's Drizzle schema/migration generation
to install the exact table declared in `migrations/0000_document_revisions.sql`, preserving its
primary key and request-key uniqueness, and include the required migration journal/metadata.
The plain SQL here is also the executable test oracle. No tables are created in request handlers.
Do not silently ship without the migration, or invent migration metadata if the publisher
cannot confirm the official contract.

The trusted Sites boundary supplies `oai-authenticated-user-id`. Every API route requires it;
every query includes its stable value as `owner_id`. Neither email nor client-supplied IDs
grant access. Do not expose this Worker behind an origin that forwards visitor-supplied
identity headers. Do not add an identity/test override to deployed code. Reserved sign-in,
sign-out and callback endpoints remain platform-owned. The sign-in link uses top-level navigation.
The UI rejects an identity mismatch on every response and retires the previous editor.

## Save and recovery contract

`POST /api/workspace/documents` creates revision 1. `PUT /documents/:id` requires the exact
`baseRevision`. Both take a frozen `{documentId, baseRevision, requestId, snapshotText}` body.
`Origin` must match the request URL. A single guarded SQL insert appends the next revision;
there is no non-atomic head-update/receipt pair. The unique `(owner_id, request_id)` makes an
identical retry idempotent; a reused key with a different payload returns 409. Stale revisions
and changed page identity create no rows. Snapshot bytes, compatible native metadata, optional
marks and authored `savedAt` are retained. Validation refuses unsupported/normalized input.

`GET /documents/:id` reopens the current owner-scoped head; `GET /receipts/:requestId` can
recover a previous acknowledgment. The client checks exact receipt bytes/hash/revision and a
same-identity reopen before displaying server-saved status. Input authored during a save stays
unsaved. Unknown save acknowledgment retries the original bytes/key/base; no automatic rebase
or overwrite occurs. A confirmed conflict keeps the native draft and offers download plus an
explicitly confirmed discard/reopen. Dirty navigation is blocked and browser unload warns.

There is no automatic server save, offline synchronization, cross-device draft recovery,
deletion, collaboration, permissions UI, or whole-product/alpha acceptance claim. Unsaved
drafts live in memory: retain the page or download the Note file before leaving. A browser
crash can lose unsaved work; this slice does not claim durable draft recovery. The server
accepts at most 256 KiB per snapshot and titles up to 120 characters.

Production verification still needs real Sites owner access, unauthenticated denial, trusted
header handling, D1 save/reopen and deployment/browser screenshots. A controlled local identity
test is not a substitute for those checks. Physical Korean OS IME and mobile QA are unrun.
