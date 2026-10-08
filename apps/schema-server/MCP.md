# First authenticated MCP document read

This entry is the first read-only Agent transport for [#498](https://github.com/barocss/barocss-editor/issues/498).
It requires the separately running, configured `@barocss/schema-server` HTTP process and its
`SCHEMA_SERVER_NOTE_DOCUMENT_POLICY_FILE`. It does not start a second document store or enable
registration, validation, adoption, save or native UI actions.

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

## Verification boundary

`test/mcp-protocol.integration.mjs` launches the compiled entry with an independent SDK client
against a controlled loopback HTTP service. It verifies initialization, discovery, exact read,
argument rejection, denied access and shutdown. That check does not prove PostgreSQL authority or
genuine login. The serial private PostgreSQL/JWKS and current account/product UI results remain
separate. This read is only the first part of parent #495 criterion 7; other Agent operations remain
open. No LLM is needed or claimed by this fixed protocol client.
