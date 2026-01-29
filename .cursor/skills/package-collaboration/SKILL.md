---
name: package-collaboration
description: Core collaboration interfaces and BaseAdapter for Barocss Editor. Use when implementing or modifying collaboration adapters, CRDT/OT integration, or operation sync between DataStore and backends.
---

# @barocss/collaboration

## Scope

- **CollaborationAdapter** interface: `connect`, `disconnect`, `sendOperation`, `receiveOperation`, `getDocumentState`, `setDocumentState`
- **BaseAdapter**: extends for custom adapters; implements `doConnect`, `doDisconnect`, `doSendOperation`, `doReceiveOperation`, `doGetDocumentState`, `doSetDocumentState`
- **AtomicOperation** flow: DataStore `emitOperation` → adapter → backend; backend → `receiveOperation` → `applyOperationToDataStore` (listener disabled to avoid circular updates)
- **AdapterConfig**: `clientId`, `user`, `debug`, `transformOperation`

## Rules

1. **Do not** call DataStore write APIs inside `doReceiveOperation`; use `applyOperationToDataStore(operation)` so the operation listener is not triggered.
2. **Override** `isRemoteOperation(operation)` only when the default (metadata/source) is insufficient.
3. **Custom adapters**: extend `BaseAdapter`, implement the abstract `do*` methods, and convert between backend format and `INode` in `doGetDocumentState` / `doSetDocumentState`.
4. **References**: `AtomicOperation`, `INode` from `@barocss/datastore`; package path `packages/collaboration/`.

## Quick reference

- Package: `packages/collaboration/`
- Deps: `@barocss/datastore`
- Adapters: `@barocss/collaboration-yjs`, `@barocss/collaboration-liveblocks`
