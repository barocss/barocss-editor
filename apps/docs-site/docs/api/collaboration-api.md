---
title: Collaboration API
---

# Collaboration API

The public packages expose adapter building blocks. Their API does not include a
hosted service or a remote save acknowledgement. Start with the checked
[Collaboration and saving guide](/docs/guides/collaboration-and-saving)
and the package READMEs for runnable examples.

## Core interface

`CollaborationAdapter` defines `connect(dataStore)`, `disconnect()`,
`isConnected()`, `sendOperation(operation)`, `receiveOperation(operation)`,
`getDocumentState()`, and `setDocumentState(rootNode)`.
`BaseAdapter` implements the lifecycle and requires subclasses to implement
`doConnect`, `doDisconnect`, `doSendOperation`, `doReceiveOperation`,
`doGetDocumentState`, and `doSetDocumentState`. Its constructor takes
`AdapterConfig`; store attachment happens through `connect(dataStore)`.

`AdapterConfig` includes optional `clientId`, `user`, `debug`, and
`transformOperation`. `BaseAdapter.isRemoteOperation` defaults to `false`;
provider subclasses must identify their own remote updates. Its protected
`handleLocalOperation` and `applyOperationToDataStore` helpers are not a public
host API. See the [base adapter README](/packages/collaboration#adapter-lifecycle-and-error-boundaries).

## Existing provider adapters

| Package | Constructor input | Current boundary |
| --- | --- | --- |
| `@barocss/collaboration-yjs` | `ydoc`, optional `ymap`, `awareness`, `config`, `conflictResolution` | Initial Y.Doc hydration has a checked example. Live editing has known update and observer defects. |
| `@barocss/collaboration-liveblocks` | `room`, optional `config`, `conflictResolution` | Requires a compatible room bridge; an SDK Room alone has not been verified. |

See the [Yjs example](/packages/collaboration-yjs#usage) and
[room bridge fixture](/packages/collaboration-liveblocks#required-room-bridge).
Neither adapter establishes product permissions, persistence, or collaborative
undo by itself.

## Other exports

`DefaultAwarenessManager` holds local and remote presence state in memory.
`ConflictResolver` supports `last-writer-wins`, `first-writer-wins`, `merge`,
and a custom resolver for atomic operations. These helpers do not transform
arbitrary concurrent document structures or enforce tenant access. See the
[collaboration package guide](/packages/collaboration#usage) for checked imports.

Wonffice's external alpha direction is Yorkie Cloud, as recorded in
[release tracking](https://github.com/barocss/barocss-editor/issues/322).
That product integration remains unverified; the Yjs and room packages above
are existing library APIs, not alternative alpha release configurations.
