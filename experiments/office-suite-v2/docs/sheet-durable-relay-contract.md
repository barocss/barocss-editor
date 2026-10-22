# Controlled Sheet relay v1 — #534

Base `1638944c6db0d39e994ba5f12367a4b56714f958`. Contracts-only P1
`6768f95decf5f49168639184c06fec2fd42e6681` froze the browser-neutral DTOs first.
The WebSocket contracts-only successor P2 adds shared frames and guards. Service
source remains uncommitted work until its separate immutable candidate is handed off.
Existing engine/store/fixture sources are imported read-only, never copied.
Node22.22/pnpm8.15 frozen graph. B two-tab qualification precedes C runtime.

`src/sheet-preview-protocol.ts` owns all shared DTOs and pure base64/admission
helpers. It has only a type import from Core contracts. No Node/store/PendingUpdates
runtime import belongs in the browser. Local outbox/sync/durable/ACK-unknown/error
states are distinct. B BroadcastChannel and C HTTP are separate native update
adapters; neither may re-author remote input or replace workbook snapshots.

All endpoints use prefix `/api/sheet-relay/v1`, JSON `protocolVersion: 1`.
Integration alone owns fixed ports, same-origin Vite proxy, scripts and actual
runtime. The owned service tests may use port0 with explicit owned cleanup.

## WebSocket contract P2

The real WebSocket route is `/api/sheet-relay/v1/ws`. The Vite proxy must enable
WebSocket forwarding and `changeOrigin:true`; its UI origin must be allowed by the
relay. Host/origin rules apply to the upgrade. No credential belongs in URL/query,
subprotocol, logs or broadcast. Text JSON frames only; compression is disabled.
The limit applies to the entire reassembled frame, not each network fragment.
There is no raw Yjs sync protocol and no HTTP append fallback in the C browser.

Every correlated frame has `protocolVersion:1` and a nonempty `requestId` of at
most128 characters. It is unique within one socket. Reconnect creates a new
correlation namespace; the durable original packet ID/bytes/credential stay the
same. A new socket must authenticate before any other operation. For an old
outbox it must use its original credential; failure never falls back to new auth.

| Client type | Fields beyond version/type/requestId | Server reply |
| --- | --- | --- |
| authenticate | session: existing SheetRelaySessionRequest | authenticated: original P1 session plus current access, and accepted state |
| open | none | state: existing SheetRelayState |
| append | request: exact original SheetRelayAppendRequest; optional delayAckMs0..1000 | append-result: original SheetRelayAppendResult |
| checkpoint | none | checkpoint: existing SheetRelayCheckpoint |

`SheetRelaySession` stays unchanged so existing persisted P1 clients remain
readable. `SheetRelayWsSession` extends it with required current `access` equal to
`read-write` or `read-only`. Access is returned by the server, never requested by
the client. Trusted Node controlplane `setSessionAccess` and `revokeSession` have
no browser HTTP/WS endpoint. `read-only-denied` refuses writes/checkpoint/retries;
`current-access-denied` refuses revoked reads/writes/resume before dedup;
`session-denied` refuses an unknown credential. Revocation must also prevent later
state pushes and delayed replies. A server `access` frame reports a current
read-only/read-write change; it does not rewrite stored client identity.

Server push `accepted` carries the exact receipt and full accepted state for a
committed update. Its context must match and receipt sequence must not exceed
state.latestSequence. It excludes the originating socket. A client merges those
actual native bytes using its existing validator and confirms its own outbox
only from its correlated append-result. A server `rejected` frame has code plus
optional requestId/updateId; a transport error is separate from packet rejection.
Neither peer traffic nor a generic Yjs acknowledgment means saved.

All accepted writes use the same serialized service/native validate→COMMIT→
receipt-marker path. Marker-persistence failure after COMMIT is ACK unknown,
never rejected. For injected `loseAck:true`, commit and marker really complete;
peers can receive accepted state while the origin socket closes before its reply.
`delayAckMs` holds a real accepted receipt, rechecks current access before sending,
and keeps its original requestId/packet ID. It never fabricates a newer receipt.

Bounds: native packet/full state1,000,000 bytes, frontier64,000, WS text frame
2,000,000 UTF-8 bytes, queued socket bytes4,000,000, connections128,
pending requests32/socket, request IDs4,096/socket, fragments1,024/message and
buffered receive chunks4,096. These are explicit finite ws8.22.0 options, not
unbounded library defaults; see [upstream options](https://github.com/websockets/ws/blob/8.22.0/doc/ws.md#new-websocketserveroptions-callback).
The frame bound includes a
full native state plus state/receipt frontiers without changing native caps.
Handshake deadline5s, caller reply deadline10s, ping interval15s with stale-peer
cleanup on the next tick; client reconnect backoff250ms..5s. Queues do not grow
without bounds. No automatic reconnect creates a new session over old pending.
Closure cancels only this listener's sockets/timers; the service then closes its
owned writer while retaining storage. Shared parsers/codecs are exported from
the browser-neutral protocol; UI must not make private DTO copies.

P2 owned contract checks: strict2 roots with0 diagnostics; protocol6/6 PASS on
Node22.22.0/pnpm8.15.0. These checks prove frame shape/bounds, not actual WS,
current-ACL runtime or browser/restart acceptance. Those source checks follow
the contracts-only commit. Existing prior63PASS and later receipt-persistence
regressionFAIL remain separate evidence; neither is replaced by contract tests.

| Method/path | Request | Response |
| --- | --- | --- |
| POST `/session` | SheetRelaySessionRequest; optional resumeCredential | SheetRelaySession; server-issued opaque credential + actor/session + context |
| GET `/open` | Authorization Bearer credential | SheetRelayState; current accepted native state + original bootstrap descriptor |
| GET `/state` | Authorization Bearer credential | Same accepted state for polling; merge native bytes, never reseed |
| POST `/append` | Bearer + SheetRelayAppendRequest | SheetRelayAppendResult, per-update exact receipt or explicit rejection |
| POST `/checkpoint` | Bearer + `{protocolVersion:1}` | SheetRelayCheckpoint; throughSequence/frontier/count/state hash |

`context` includes workbookId as well as document/generation/engine versions.
`admission` adds sheet-v1 identity. Each packet has exact updateId, canonical
base64 bytes, declared byteLength and SHA-256. Server recomputes the hash; a body
does not authorize its actor/session. Existing foreign bootstrap/events are legal;
every new event is bound to the server-authenticated session. Session credential
resumption never issues a new identity when the old credential is missing/invalid.
Registry persists before issuance response; revoked credentials refuse reads,
new writes and retries before deduplication, while past accepted history remains.
If a browser has persisted pending/ACK-unknown packets but its old credential is
missing, corrupt or denied, it must NOT issue a fresh session as fallback. Preserve
the original packets/identity and show refusal. Fresh session creation is an
explicit new-client operation with no old pending queue.

Open/state `state` is the complete accepted native update, not a new snapshot
writer. `bootstrap` is an identity/hash/length descriptor, not a second full byte
copy in the HTTP response. Manifest preserves the exact original bootstrap bytes.
`latestSequence` and checkpoint throughSequence order service acceptance, not all
concurrent edits. Append receipts bind context/admission/updateId/hash/sequence
and frontier. A late receipt confirms only its packet. Acknowledgment loss is
injected after COMMIT; `loseAck:true` is a controlled fault seam, not permission.
HTTP may close the request without a reply; caller preserves the exact packet.
Retry exact original ID/bytes/identity to obtain the same durable receipt.

Native packet and full accepted state are capped at 1,000,000 decoded bytes;
frontier at 64,000 bytes; encoded HTTP request/response at 1,500,000 UTF-8 bytes;
sessions at 128. The full-state cap is enforced on the candidate before commit.
Native store caps are unchanged. No byte chunking or silent normalization.

Create/resume are different startup modes. Create uses one actual fixture replica
once, fresh owned temporary storage and an immutable manifest. Resume validates
manifest, original bootstrap, persisted credential registry, existing DB/schema/
metadata/receipts/checkpoint/tail before calling the native reopening constructor,
which can otherwise create missing files/metadata. Missing/corrupt state fails
closed and preserves original files. Re-seeding or guessing a new generation is
forbidden. A wrapper packet audit retained before native commit allows receipt
hash/frontier verification even after native checkpoint compacts packet payloads.
The relay retains owned storage on close for explicit restart.

## Node service API and owned resources

`relay/sheet/index.ts` exports:

```ts
SheetRelayService.create(): SheetRelayService
SheetRelayService.resume(directory: string): SheetRelayService
startSheetRelay({service, port, allowedOrigins?}): Promise<{url, port, close()}>
```

The service exposes readonly `directory`/`context`, `issueSession(request)`,
`open(credential)`, `append(credential, request)`, `checkpoint(credential)`,
`revokeSession(credential)`, `binding()` and `close()`. Revocation is a Node control
seam, not a caller-authorized HTTP endpoint. HTTP/session bodies cannot choose an
actor, role or session. Call listener `close()` first, then service `close()`.
Only that listener and writer are stopped. Temporary storage is retained; tests
explicitly remove only their own newly allocated fixture directories.

`binding()` returns only process ID, directory/context, bootstrap descriptor,
database path, manifest/registry hashes and full accepted-state hash/sequence.
`databaseMainFileSha256` excludes WAL and is labelled accordingly; it is not a
hash of all committed content. Credentials and packet bodies are never included
in the binding or printed logs. Registry files contain credential hashes rather
than bearer tokens. The browser must privately persist its original credential.

The HTTP listener binds strictly to `127.0.0.1`. Host must equal the listener
address/port. Supplied Origin must be explicitly configured. Integration's Vite
proxy uses `changeOrigin:true` and allows its own local UI origin. There is no
cross-origin CORS grant. HTTP request/response bodies have the explicit 1.5 MB
encoded cap. No Node store, service or PendingUpdates module is imported by the
shared browser protocol; native store types/runtime remain Node-only.

Controlled loss fault `loseAck:true` closes the HTTP response only after the real
store append COMMIT and durable receipt marker. A request aborted before COMMIT
is not this proof. Header `x-sheet-relay-delay-ack-ms` accepts 0..1000 and delays
the actual accepted response, allowing a newer packet to receive its own ACK
first. It does not change packet identity or fabricate a receipt. Browser status
and private IndexedDB outbox behavior remain the UI owner's responsibility.

## Persistence, admission and resume ordering

Creation calls the existing fixture exactly once, preserving native Yjs item IDs,
generation, event IDs, bootstrap actor/session and exact bootstrap packet bytes.
It creates a fresh native `office-v2-m0-*` store, then write-once manifest, registry
and bootstrap audit before native append. There is no independent workbook model.
Each new session registry is atomically persisted/fsynced before its credential is
returned. Current access is checked before body/hash/audit/dedup and again by the
native store. Server recomputes SHA-256 before audit/dedup; matching hash format
in the DTO parser alone is not proof. Each candidate's complete native export and
frontier must fit 1 MB/64 KB BEFORE COMMIT, in addition to native caps. Bounds are
not raised to make browser reopening pass.

Files in each owned directory:

- `updates.sqlite` and native WAL/SHM when present.
- `relay-manifest.json`: immutable exact context/admission/bootstrap bytes/identity.
- `relay-sessions.json`: persisted credential-hash/actor/session/current-access registry.
- `packet-audit/<update-ID-hash>.json`: exact packet/context/identity, fsynced BEFORE native append.
- `receipt-audit/<update-ID-hash>.json`: exact native receipt, fsynced AFTER COMMIT and BEFORE reply/loss injection.
- `relay-owner.json`: PID/nonce writer claim, released only by its owner on close.

Prepared packet audit is NOT a durable receipt. Rejected/uncommitted orphan audits
are retained but never replayed as accepted input. Valid DB rows are replayed from
their original audits even after native checkpoint payload compaction; every
receipt frontier/hash/sequence and checkpoint prefix is checked. A native COMMIT
can precede receipt-marker persistence if the process dies. Such a valid row can
resume from its original audit and be retried for a receipt; an earlier ACK is not
invented. Once a receipt marker exists, removing or altering that confirmed row
fails closed. Coordinated rollback/tampering of all files has no external trust
anchor and is not claimed as secure backup/anti-rollback protection.

Resume first rejects a known live owner PID. It inventories all original paths,
regular-file ownership, sizes and SHA-256 values. Actual SQLite validation runs on
a NEW owned diagnostic copy, including any durable WAL, plus manifest/registry/
packet audits. Original byte hashes and full file/directory inventory must remain
identical before/after validation; only the diagnostic copy is deleted. No copy
is promoted to storage and no original is normalized/repaired. This avoids Node
read-only SQLite creating auxiliary files in an invalid original directory.

The copy gate checks native SQLite schema/integrity, exact metadata/admission,
full workbookId/context, original bootstrap, known historical session identities,
continuous receipt sequence, exact audit hashes/bytes, pending/refused native
outcomes, checkpoint prefix/frontier and later tail. Parent then validates the
independent confirmed-receipt markers. Only after these gates does it open the
ORIGINAL native store, acquire SQLite's exclusive writer, compare restored export
against the validated bytes and replace a dead owner claim. A copy gate by itself
does not acquire writer authority. Unknown/reused live PID refuses conservatively;
elapsed time never removes another owner's claim. Existing native exclusivity
remains the final concurrent-open gate before registry/audit writes.

## Verification and first failures

Node22.22.0/pnpm8.15.0, unchanged frozen graph; own checks ran sequentially:

```sh
pnpm --ignore-workspace type-check -- relay/sheet src/sheet-preview-protocol.ts test/sheet-preview-protocol.test.ts
pnpm --ignore-workspace test -- relay/sheet test/sheet-preview-protocol.test.ts
```

Result: 10 strict roots plus direct imports, **0 diagnostics**; **63/63 tests PASS**,
0 failed/0 skipped, single test-file concurrency. Coverage: HTTP 2, service/recovery
6, storage startup/corruption 52, pure protocol 3. Actual owned port0 HTTP verifies
commit-before-socket-loss, exact retry, delayed real ACK identity, origin/body
refusal. Service tests cover original registry/credential across checkpoint+tail,
two-session convergence/undo, actual child process exit without DB close then
resume, prepared-only versus committed-before-marker, confirmed-tail deletion,
native actor/context/hash/revocation refusals and full-state cap BEFORE COMMIT.
Storage cases verify missing/corrupt DB/metadata/manifest/bootstrap/registry/audit/
receipts/checkpoint/tail, symlink denial, raw incomplete update, crash WAL, original
file byte/list preservation and diagnostic cleanup.

Preserved first failures:

1. Helper's first narrow strict run reported 5 diagnostics, including a codec
   default parameter inferred as literal 1000000, preventing explicit 64000-byte
   frontier calls. Explicit `number` parameters fix the type seam; wire DTOs are
   unchanged. Helper-owned validation/test typing corrections did not suppress diagnostics.
2. Direct read-only SQLite inspection: 49 cases, 19 PASS/30 FAIL because new
   zero-byte WAL and 32 KB SHM files violated original directory preservation.
   They were not deleted/normalized by startup; only test-owned fixtures were cleaned.
3. Read-only plus exclusive locking probe: 1 case FAIL with `disk I/O error`.
   That strategy was discarded; diagnostic-copy validation preserves the original.
4. First copy-strategy 52-case run: 51 PASS/1 FAIL from an invalid unsupported
   operation in a test fixture (`first-unseen`); valid Core operation names fixed
   that fixture. The final parent run above reran all 63 cases successfully.

These are controlled source/service tests. B private-browser qualification, C
fixed-port startup/proxy, fresh private-page close/new relay PID/same DB/UI reopen,
persisted browser outbox/composition and independent runtime matrix are NOT RUN
by this lane. Integration schedules actual C only after B qualifies. Production
OIDC/accounts/PG, hardware power-loss, external backup/anti-rollback, resource/perf
profiles, #534/whole-M0 closure and release are not claimed. No native source patch,
root/full suite, config/lock change, fixed runtime, existing DB mutation, push/PR,
deployment or unrelated process stop occurred.
