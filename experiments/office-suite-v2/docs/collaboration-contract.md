# Collaboration experiment v1 — #525

Scope: `office-v2-m0/collaboration-v1`, parent #521. Controlled actors and an
in-process provider exercise real Yjs **13.6.29**. This is an isolated prototype,
not Office, OIDC, PostgreSQL, product UI, full Note blocks or M0 acceptance.
Environment: scaffold S `9b390602d90e07f496b7b699915b7d605582d8a4`, shared C
`6ad373b4c31b7ec7aa97b75d8f6cb89b7174fc0e`, Integration correction I1
`1d443e47f39d9e6009a7f0ae8724d7cc9f9e05da`; Node 22.22.0, pnpm 8.15.0.
Root dependencies, locks, configuration and budgets are unchanged.

## Partial delivery boundary

This first immutable delivery contains `prose.ts`, `durable-store.ts`, their two
test files and this manual. Sheet bindings/tests remain unpublished, unverified
work. They import the genuine Core runtime once delivered; no substitute engine
is used. Sheet native operation algebra and reference calculation are not accepted
by this partial source. The later Sheet delivery must add its own exact evidence.

## Bounded prose source and selective undo

`ProseReplica(sessionId, initialUpdate?)` owns a private `Y.Doc` and a single real
`Y.Text` named `prose-v1`. Newlines are shared paragraph boundaries. `paragraphs`
and rich-text `runs` are detached read-only projections, not editable copies.
`insert`, `deleteText`, `mark`, `split`, `join`, `undo` and `redo` are the only local
mutation API. `receive` merges a validated native update; it does not replace a
text snapshot. `exportUpdate` and `frontier` return native bytes. `destroy` releases
the document and undo manager. One provider creates the initial content; other
replicas receive that actual update rather than independently recreating a seed.

Marks are boolean `bold`, `italic`, `underline`. A split inserts one shared newline;
a join deletes exactly one newline. Neither copies a text suffix into a second
paragraph store. Thus concurrent same-paragraph input, marks and split/join share
character identity. `anchor(index, assoc)` and `resolve(bytes)` use actual Yjs
relative positions. Remote edits move selections without inverse-offset replay.
The sample has no stable named block IDs, nesting, lists, tables, embeds, general
block move or paragraph deletion. `moveParagraph` and `deleteParagraph` explicitly
refuse. `deleteText` cannot remove paragraph delimiters; use explicit `join`.
This mapping does not assert that a Y.Text sample covers every Note block.

Each instance has a unique object transaction origin and an origin-scoped
`Y.UndoManager` with `captureTimeout: 0`. Remote transactions use a different origin.
Undo cancels only that instance's current-session contribution, including when
another tab belongs to the same user. Reopening creates an empty undo history.
It never restores a prior document snapshot. The supported profile bounds visible
text at 100,000 UTF-16 units, paragraphs at 512 and incoming updates at 1,000,000
bytes. Undo/redo conservatively refuse before mutation if all retained character
content could exceed these bounds when restored. This refusal can occur even when
one particular undo would fit. Bounds are measured prototype limits, not product
capacity or performance promises.

Incoming bytes are applied to an isolated trial document. Unknown roots, pending
structs/delete sets, embeds, unsupported marks, malformed bytes and profile-limit
violations refuse before the live document changes. Yjs parsing and private store
inspection are pinned to 13.6.29; a provider upgrade requires these checks again.
The byte/profile limits bound this controlled experiment. They are not a hardened
hostile-input CPU/memory sandbox or production parser isolation.

## Disposable durable service

`DisposableDurableStore.create(options)` allocates an `office-v2-m0-*` directory
under the OS temporary directory. `reopen(directory, options)` accepts only such a
directory after real-path validation. The caller closes the store and removes its
owned directory. Tests never open an existing Office database. Built-in
`node:sqlite` emits its standard experimental API warning; it is not suppressed.

`Admission` binds document ID, generation, engine ID and contract/engine/schema/
adapter versions. All versions are exactly 1. `UpdatePacket` adds an immutable
update ID and native bytes. `AuthenticatedSession` comes from the trusted server
request, independently of packet content. The required `currentAccess(session,
admission)` callback runs before every append and duplicate retry. It is a
controlled current-access seam, not an account/role implementation.

The required `validateDocument(candidate, previous, update, authenticated?)`
callback checks the engine mapping. `authenticated` is absent only during trusted
stored replay. The prose tests use `validateProseDocument`. Sheet will supply its
own native event validator, including new-event actor/session binding. Generic
CRDT application and current-access alone do not validate Sheet semantics.

`append` validates admission, size, update identity and an isolated candidate;
incomplete Yjs dependencies are explicitly rejected for retry with their missing
transport base. This differs from a valid native Sheet event whose domain
dependencies are pending. Failed input remains with the caller. The service does
not broadcast rejected input. Real network clients must reconcile from the
accepted service frontier and preserve rejected local drafts; no product provider
or reconnect UI is implemented here.

The SQLite writer uses exclusive locking, WAL and `synchronous=FULL`. A second live
writer cannot open the same database. It persists update ID, SHA-256 payload hash,
bytes and frontier in a transaction before returning a durable receipt. The
receipt binds admission, update ID, hash, sequence and native Yjs frontier.
Sequence orders service acceptance; it is not a global concurrent editing clock.
The state vector alone does not identify all deletions; update identity/hash and
checkpoint payload are part of the receipt/recovery contract.

An exact retry returns the original receipt; the same ID with another hash
refuses. `append(..., true)` deliberately loses the acknowledgment **after** COMMIT
and returns `acknowledgment-unknown`. It does not report durable success to that
client. `checkpoint()` records exact included IDs/sequence, full native bytes,
payload hash and frontier atomically, then clears covered update payloads while
retaining every update ID/hash/receipt for retry deduplication. Restart verifies
the checkpoint and replays only later payloads. There is no retention expiry or
schema migration in this prototype. The service bounds packets at 1 MB, state at
8 MB and update identities at 10,000; exceeding these refuses.

`replaceSnapshot()` always refuses. The private server trial document becomes the
next validated CRDT instance after commit; no client content snapshot overwrites
another writer. `PendingUpdates` records each update separately as `local-pending`,
`synchronized`, `durable`, `acknowledgment-unknown` or `rejected`. Broadcast is not
durable success. A late receipt cannot confirm a later update. Rejected/revoked
draft packets remain retrievable; no automatic reauthorization or upload occurs.

## Verification and remaining work

The partial source runs only changed-area strict types and tests:

```sh
pnpm --ignore-workspace type-check -- src/prose.ts src/durable-store.ts test/prose.test.ts test/recovery.test.ts
pnpm --ignore-workspace test -- test/prose.test.ts test/recovery.test.ts
```

Tests cover independent replicas, same-paragraph insertion and marks, stable
positions, split/join with remote edits, session undo/reload, bounds/refusals,
COMMIT then ACK loss, idempotent retry after checkpoint compaction, tail replay,
late ACK/newer draft, current-access revocation, admission mismatch, malformed and
causally incomplete binary input, snapshot refusal and exclusive-writer refusal.
One test exits a real child process immediately after COMMIT without closing its
SQLite handle, then opens a fresh service connection and replays the committed
text. This is a process-exit experiment, not proof against power loss or storage
hardware failure. First execution failure: none in the independent partial checks.

Remaining: qualify genuine Core runtime; run Sheet mapping, alternatives,
structural/reference/undo and authenticated append-only admission tests; hand
those sources to Integration/Verification. Formula calculations belong to Formula.
Actual Office accounts, network providers, product UI, asset lifecycle, hostile
parser isolation, production durable history/retention, backups/restore and M1/M2
acceptance remain unimplemented or unverified. No full-repository suite, shared
runtime, deployment, push, PR or existing DB mutation ran in this lane.
