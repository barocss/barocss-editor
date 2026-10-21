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
pnpm --dir apps/note exec node --experimental-vm-modules --test cloud-workspace/worker.test.mjs
pnpm --dir apps/note exec node --test cloud-workspace/migration.test.mjs
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
The built Worker is also loaded in an isolated VM with web APIs and no Node `process` or
`Buffer` globals, then exercised for authenticated save/reopen, anonymous denial and asset serving.
Its module-initialization guard rejects randomness, timers and I/O until request handling begins;
the editing model creates its random session identity only when editing is first used.

The application build emits:

- `dist/client/`: Vite's native Note frontend and existing font assets.
- `dist/api/workspace-api.mjs`: bundled API for targeted SQL tests.
- `dist/server/index.js`: self-contained Worker ESM, default `fetch(request, env)`.

Client assets are embedded in the Worker. This requires only documented `env.DB`, with no
invented static asset binding, arbitrary Node server, PostgreSQL, or R2 requirement.

## Sites publisher contract

The parent registered a **new owner-private Site once**. Reuse the tracked identity in
`.openai/hosting.json`: `appgprj_6ad87b804224819184add84f015d82ba`. Do not create another Site.
The expected origin is `https://barocss-cloud-workspace.easylogic2.chatgpt.site`; this is not
proof of publication. Do not reuse an existing prototype/monitor ID. Keep plugin
tools, downloads, credentials, generated output and repository metadata out of source commits.
Use the official Sites setup/source/build/package helpers for publication; this script only
builds the application. GitHub remains the code source of truth. Record the exact GitHub SHA,
separate pushed Sites source SHA, saved version, deployment ID and final private URL.

The tracked app manifest retains the exact returned identity and documented logical storage binding:

```json
{"project_id":"appgprj_6ad87b804224819184add84f015d82ba","d1":"DB","r2":null}
```

This is Worker mode; there is no `static` field. Stage the built Worker as
`dist/server/index.js`, and let official packaging include the source hosting manifest as
`dist/.openai/hosting.json`. The `drizzle/` directory contains actual Drizzle Kit-generated SQL,
snapshot and journal metadata. It is generated from `migration-source/schema.ts` using pinned
Drizzle Kit 0.31.11 / ORM 0.45.4; metadata was not hand-authored. Regeneration is offline with
respect to D1 and requires no database credentials:

```sh
npm ci --prefix apps/note/cloud-workspace/migration-source
npm --prefix apps/note/cloud-workspace/migration-source run generate
```

The nested tooling package does not alter the monorepo package or pnpm lock. It is not needed
for the application build or Worker runtime. Applied SQL, snapshots and journal entries are
immutable; future schema changes append a migration. The separate plain SQL under `migrations/`
is an independently authored test oracle. A test compares generated columns, primary/unique
constraints and positive revision checks with that oracle. All server/browser fixtures apply
the generated journal migrations. No tables are created in production request handlers.

### Portable source layout

Keep the full monorepo source and its frozen pnpm lock: the app imports workspace packages.
Open the registered Site's source with official tooling into a **separate checkout**, retaining
its own `.git`. Export the exact GitHub commit into that checkout without Git metadata or
ignored files (`git archive <GitHub SHA>` is suitable). Never replace the Site checkout's `.git`
with the GitHub repository's `.git`. Record that GitHub SHA in deployment provenance.

In this derived Sites source checkout only:

1. Copy `apps/note/cloud-workspace/.openai/hosting.json` to root `.openai/hosting.json`, preserving
   the registered ID and any required fields from the official profile.
2. Set root `package.json`'s `scripts.build` to
   `node apps/note/cloud-workspace/build-sites-target.mjs`. This reproducible deployment overlay
   is the only required package change; it changes no dependencies or lockfile.
3. Run the official dependency/build/source/package workflow from this root. The target builds
   schema plus the app Worker, stages `dist/server/index.js` and its manifest, and copies
   `apps/note/cloud-workspace/drizzle/` to root `drizzle/`. It refuses to overwrite a different
   migration. Official packaging owns copying root `drizzle/` to `dist/.openai/drizzle` and
   producing the archive. Do not ship the Node test harness or a static+D1 manifest.
4. Commit/push the resulting **Sites** source through its supported credential workflow. Save
   and deploy that exact source SHA/archive. Keep it distinct from the recorded GitHub SHA.

No credential is embedded in this plan or build. Native source-write credentials and deployment
remain parent-owned. These steps do not add a second Site or change the private audience.

The trusted Sites boundary supplies `oai-authenticated-user-id`. Every API route requires it;
every query includes its stable value as `owner_id`. Neither email nor client-supplied IDs
grant access. Do not expose this Worker behind an origin that forwards visitor-supplied
identity headers. Do not add an identity/test override to deployed code. Reserved sign-in,
sign-out and callback endpoints remain platform-owned. The sign-in link uses top-level navigation.
The UI rejects an identity mismatch on every response and retires the previous editor.
After initial session discovery, every API request also carries the immutable client scope as
`X-Workspace-Expected-Scope`. The server compares it with the trusted Sites identity **before**
body parsing or database access. It is a precondition, not an authentication source. A session
switch cannot create an old owner's unsaved draft under the new owner. Auth failures during
post-save discovery retire the editor too. Pending navigation rechecks the same native editor's
flush/dirty guard before replacing it; new input during a delayed open cancels navigation.

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
