# Local Agent prompt source references

The local Agent keeps the complete, validated `LocalAgentInput`. Its stored input and
`provenance.inputHash` use the original `JSON.stringify(input)` bytes in the input's
existing property order. The adapter does not sort keys or change a project input pin.

Adapter version 4 can send `root-snapshot-ref/v1` in the model prompt. The `input`
object contains the full root `snapshotText`. A pin may contain
`{"$snapshotRef":"root"}` in place of its `snapshotText` only when its `documentId`,
`revision`, `snapshotHash` and exact snapshot text all match the root. Each pin keeps
its ID, metadata and array position. Other documents, versions, hashes and text remain
complete. If no pin matches, the prompt uses the prior full JSON representation.

Before dispatch, the adapter decodes a referenced prompt and requires its exact JSON
bytes to equal the original input. Invalid or forged references fail before the local
provider. The unchanged 24,576-byte UTF-8 limit covers the full prompt, including the
schema and reference explanation. The original 262,144-byte input limit, 32,768-token
context and 4,096-token output limit remain in force. The fixed installed model,
loopback address, opt-in setting, cancellation, deadline, no retry, no tools and output
validation remain unchanged.

This representation removes only repeated prompt bytes. It does not prove that the
model understood the source. Integration must verify the final saved full Word input
with the installed model and complete #449 authority, native, apply, check, reopen and
recovery flow. Smaller examples do not establish broad document support or release.
