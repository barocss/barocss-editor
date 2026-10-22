# Controlled Sheet relay v1 — #534

Base `1638944c6db0d39e994ba5f12367a4b56714f958`. This first delivery freezes only
the browser-neutral contract; service, HTTP and restart tests follow separately.
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
The relay retains owned storage on close for explicit restart. No production
OIDC/account/PostgreSQL acceptance, fixed C runtime, browser proof or #534 closure
is claimed by this contracts-only delivery.
