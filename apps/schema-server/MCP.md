# Authenticated MCP schema tools

The document read is [#498](https://github.com/barocss/barocss-editor/issues/498). The bounded
registration tool is [#500](https://github.com/barocss/barocss-editor/issues/500). The bounded
structural validation tools are [#501](https://github.com/barocss/barocss-editor/issues/501).
The bounded adoption tool is [#502](https://github.com/barocss/barocss-editor/issues/502).
It requires the separately running, configured `@barocss/schema-server` HTTP process and its
operator schema policy. The read also requires `SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE`.
It does not start a second registry or document store, or enable native UI actions.

## Run

Use repository Node 22.22.0 and pnpm 8.15.0. Build the schema server, start its normal HTTP process
with the database, OIDC and protected document policy described in [README.md](README.md), then
configure the MCP host to launch the compiled entry:

```sh
pnpm --filter @barocss/schema-server build
SCHEMA_SERVER_MCP_BASE_URL=http://127.0.0.1:4101 \
SCHEMA_SERVER_MCP_BEARER_TOKEN="$OIDC_ACCESS_TOKEN" \
node apps/schema-server/dist/mcp-main.js
```

The host supplies the token in the child process environment. Do not put it in command arguments,
repository files, logs or issue text. Restart the child with a fresh token when the token expires.
Only an exact loopback HTTP origin is allowed; the entry rejects redirects. The HTTP server still
verifies the token and checks current tenant membership, stored document workspace, exact
selected definitions, capabilities and operator document policy on each GET. Missing token gives
`unauthorized`. Missing or empty document policy leaves the native2 routes unavailable.

The MCP host owns the stdio child. It performs protocol initialization and `tools/list`, then calls
`get_schema_bundle` with only `tenantId` and `documentId` UUID strings. Unknown fields fail schema
validation. The output is one JSON text block with `status: "pinned"`, the exact `document` head,
original `snapshotText`, `documentRevision`, `snapshotHash`, native format and complete `bundle`.
The bundle contains exact selected pins and immutable original definition texts, including parent
and dependency closure. The reader checks the raw SHA-256 against the head and compares the two
independently authorized HTTP responses. If a save occurs between them, it returns
`inconsistent_document_read`; the caller can start a new read. It never substitutes latest.

The result contains document content. The host must apply its normal protection for tool output.
The bearer credential is never returned. The entry allows at most 2 MiB per HTTP response and a
10 second timeout per GET. It returns a named tool error for denial, unavailable service, malformed
response, oversized response, cancellation and inconsistent reads. The MCP client closes its own
child; the HTTP schema server and database remain running.

## Register one declarative schema

`register_schema` takes exact `tenantId`, `workspaceId` and `schemaId` UUIDs, a positive integer
`version`, the original JSON `definitionText`, and a stable `idempotencyKey`. The caller keeps
the same key and bytes for a fixed retry. A later changed draft uses a new key. The tool accepts
no token, actor, role, permission or service URL argument. The child uses its configured bearer
token and sends one PUT to the existing Schema Server HTTP registration route. The HTTP server
checks the current account, tenant membership, workspace policy, capabilities and immutable
dependencies in PostgreSQL. The tool does not install executable validators or renderers.

The tool returns the existing registration receipt. It checks the request hash, schema identity,
canonical digest, scope and complete dependency closure before returning success. An equivalent
new request with different JSON whitespace can return the first stored `definitionText`; the
receipt's `requestHash` still binds the exact new request bytes. Same-key changed bytes return
`key_reuse`. Refusal and unavailable outcomes return a named tool error. Input definitions have
the registry's 64 KiB limit; the HTTP response is bounded, redirects are disabled, and a request
has a 10 second timeout. The host must protect the returned definition and receipt like other
private tool output. This operation registers a definition only. It never changes document pins.

## Verification boundary

`test/mcp-protocol.integration.mjs` launches the compiled entry with an independent SDK client
against a controlled loopback HTTP service. It verifies initialization, discovery, exact read,
registration, structural validation, adoption, fixed retry, argument rejection, denied access, cancellation
and shutdown. That controlled check
does not prove PostgreSQL authority or genuine login. Integration runs the serial private
PostgreSQL/JWKS check separately. The parent #495 whole flow remains open.
No LLM is needed or claimed by this fixed protocol client.

## Validate a Note native2 document or candidate

`validate_document` accepts exact `tenantId`, `documentId`, `expectedRevision`,
`expectedSnapshotHash` and `expectedPriorPinDigest`. `validate_candidate` accepts those fields
plus the original `snapshotText` and `intendedAction: "preserve" | "adopt"`. UUIDs and lowercase
SHA-256 hashes are required. The text has the native2 512 KiB UTF-8 limit. Neither tool accepts
a role, actor, workspace, token, service URL, approval or idempotency key from the caller.

Both tools send one strict POST to the same authenticated Schema Server native2 validation route.
The server checks current tenant/workspace/document membership, the stored source and raw hash,
the experimental native2 snapshot-pin CAS digest, exact registered definitions and closure,
and the current action policy for candidates. `expectedPriorPinDigest` uses the existing
`wonffice.note.snapshot-pins.cas.v1` value: tenant, stored workspace, document, `pinned`, and
ordered selected exact schema ID/version/digest tuples. This is an experimental native2
precondition, not a general public SDK protocol. The MCP adapter passes that value through; it
does not recalculate policy, native validity or the definition registry.

Success has `status: "structurally_valid"`, the checked kind, document ID, current revision,
source raw hash, prior pin digest and fixed named checks. A candidate also has the SHA-256 of its
exact submitted raw text and the checked action. The adapter verifies response identity,
preconditions, check names and candidate raw hash before returning it. Named HTTP refusals such
as `revision_conflict`, `snapshot_hash_conflict`, `schema_pin_conflict`, `invalid_snapshot` and
`scope_forbidden` become named MCP tool errors. HTTP responses are limited to 64 KiB, redirects
are disabled, and the request has a 10 second timeout. Caller cancellation closes the HTTP
request.

The result says only that the listed structural, registry, authority and precondition checks
passed for that observed source. It does not prove business field truth, renderer behavior,
human criterion confirmation or future write authority. It creates no snapshot, adoption,
reservation, receipt or approval. A later write must check current authority and revision/pins
again. The host protects document text in tool arguments and results as private content.

## Adopt an exact Note native2 snapshot

`adopt_schema` accepts exact `tenantId`, `documentId`, `expectedRevision`,
`expectedSnapshotHash`, `expectedPriorPinDigest`, original `snapshotText` and stable
`idempotencyKey`. It accepts no actor, role, token, workspace, permission, approval, URL or
action field. The adapter fixes `schemaAction: "adopt"` and sends one authenticated PUT to the
existing native2 snapshot route. The HTTP service checks current membership and capabilities,
the locked source revision, raw hash and prior pin digest, the complete registered bundle, and
current adoption policy. The adapter cannot grant adoption authority.

The caller must retain the same key and exact raw text for a fixed retry after an uncertain
response. The service returns its durable original `update` receipt for a completed retry. A
changed request with the same key returns `key_reuse`; a new draft needs a new key and fresh
source preconditions. The tool does not rebase, substitute a live head or retry automatically.

Before success, the adapter checks the receipt's exact key and request hash, tenant/document
scope, returned workspace ID, native2 head, next revision, page ID, raw text and SHA-256. It also
checks the candidate's declarative bundle closure and returned workspace scope. It refuses a
forged, partial or cross-scope receipt. The original snapshot text is private tool output.
Input text is limited to 512 KiB UTF-8; HTTP response is limited to 2 MiB. Loopback origin,
redirect refusal, cancellation and a 10 second timeout apply.

An adoption request can currently pass even when selected pins are unchanged. A successful
receipt alone does not prove a v1-to-v2 transition. The controlled #502 integration check must
show that A changes its selected pin while B stays byte-identical. Product Note reopen,
renderer behavior, genuine human login and full #495 acceptance need separate evidence.

## Independent current-backend SDK probe for #502

`test/mcp-protocol.integration.mjs` keeps its original no-argument controlled HTTP test. That
test uses the compiled MCP child, 19 controlled HTTP calls, cancellation and owned-child shutdown.
It does not connect to PostgreSQL or establish current authority. The separate exported
`runCurrentBackendProbe` is source preparation for Execute Integration's serial real-backend run.
Importing the module does not start the controlled server. Only direct no-argument execution does.

Execute Integration calls `runCurrentBackendProbe({ entryPath, baseUrl, fixture, tokens, hooks,
resultPath })` from its own private PostgreSQL/JWKS/API harness. `entryPath` is its exact absolute,
compiled `dist/mcp-main.js`. `baseUrl` is an exact `http://127.0.0.1:<port>` origin. The runner
starts one independent `@modelcontextprotocol/client` and `StdioClientTransport` child for each of
`writer`, `viewer`, `foreign` and `revocable`. The token for each account exists only in the
in-memory `tokens` object. The child receives only `SCHEMA_SERVER_MCP_BASE_URL` and
`SCHEMA_SERVER_MCP_BEARER_TOKEN`. Do not put tokens in `fixture`, logs or the result file.

`fixture.version` is `wonffice.mcp-adopt.current-backend.v1`. It declares `tenantId`,
`workspaceId`, `selectedSchemaId`, `A`, `B`, three distinct fixed `keys`, two complete
`expectedReceipts`, `lostAckError` and at least the five `negativeCases` below. `A.before` and
`B.before` each contain the complete server document head and original raw `snapshotText`.
`A` also contains `candidateSnapshotText`, `changedCandidateSnapshotText`, `priorPinDigest` and
`expectedAfter` with the complete head and exact candidate text. The selected schema must be
v1 in both source documents and v2 only in A's candidate. The runner checks the complete
definition closure, old definition bytes, unchanged native document and other selected pins,
raw SHA-256, expected next head and exact independently declared receipt for either race key.
Each `negativeCases` item has `{ id, account, arguments, expectedError }`; the required IDs are
`viewer`, `foreign`, `malformed`, `unsupported` and `executable`. These carry exact public
`adopt_schema` arguments and named refusal outcomes. `invalid_arguments` is a classification of
the SDK input-schema rejection, not a service status. Service errors require an exact single
JSON text block `{ "status": "..." }`.

The Root harness implements `hooks.audit(label)`, `armConcurrentLostAck()`,
`releaseConcurrentAfterBothEntered()`, `confirmCommitted()` and `revokeActor()`. The two SDK
adoption requests use the same A1 revision, hash, prior pin and exact A2 bytes, with different
fixed keys. Root's PostgreSQL barrier must prove both reached the locked service before release.
Root drops the committed operation's reply only after its SQL audit proves the write. Its
`confirmCommitted()` returns `{ winnerIndex, bothEntered: true, committedAfterLostAck: true,
bWholeUnchanged: true }`. The runner requires one declared lost-ACK error and one
`revision_conflict`, then retries the winning key with identical arguments and checks the
complete durable receipt. It also checks A2 and B1 read results, key reuse, stale source,
each refusal with Root's before/after SQL audit, and same-child access loss after `revokeActor()`.
The runner does not create accounts, grants, registered definitions, database fixtures or a
barrier. Root owns every shared runtime and whole-SQL/no-effect assertion.

`resultPath` has an owned mode-0700 parent. The runner creates a mode-0600 result and a
`resultPath + '.events'` JSONL file. Events include case entry/return, SDK child PID and closure,
response status, byte count and SHA-256; they contain no token, raw snapshot or definition text.
Root can use `call-entered` to coordinate its own database barrier, but an event alone does not
prove the SQL operation was reached. A missing compiled entry, token, fixture field, hook, or
cleanup fails closed. A passed runner means the declared SDK calls passed against the
configured HTTP backend. Root must separately prove signed-JWT/current authority and bind the
staged source, full private PostgreSQL audit and original #502 criteria before closing the
Issue. This is not genuine human login, an LLM run, the Note product UI or full #495 acceptance.


### Serial controlled backend adoption verification

Execute Integration extends the existing private PostgreSQL producer with `--mcp --mcp-adopt`. After exact Node 22.22.0 emission, run `PG_BIN=<owned PostgreSQL 16 bin> SCHEMA_SERVER_EVIDENCE=<fresh private directory> node apps/schema-server/test/schema-server.postgres-oidc.integration.mjs --mcp --mcp-adopt` from the repository root. Only Integration starts these shared runtime resources.

This producer runs the independent compiled SDK client against the same HTTP service and controlled signed-JWT/private PostgreSQL. It authors a fresh full native A1/B1 pair and a compatible registered v2 whose version and exact parent change while native dataset fields remain unchanged. All old definitions stay in the pinned dependency closure. A selects v2; B's whole native document and rows stay at v1. This tests actual pin/version adoption; it does not test field-label evolution.

Two distinct fixed requests must reach real PostgreSQL lock waiters before release. The producer drops the successful HTTP response only after independently observing its committed receipt and snapshot. It verifies one winner, one stale loser, exact durable retries, all-table allowed-effect boundaries, viewer/foreign/invalid/executable refusals and revocation within the same MCP child. Owned child shutdown and server/database cleanup are required. The earlier HTTP/SDK cases remain. An old absent-tool assertion now checks the advertised tool's missing-argument refusal instead.

Controlled account verification does not establish genuine human login, an actual LLM, product Note UI/renderer, field evolution, actual adoption cancellation, full parent #495 acceptance or release. Earlier failed producers remain evidence; only a terminal passing producer counts.
