---
name: package-collaboration-yjs
description: Yjs adapter for Barocss DataStore (Y.Doc, y-websocket). Use when integrating or changing Yjs-based real-time collaboration.
---

# @barocss/collaboration-yjs

## Scope

- **YjsAdapter**: extends BaseAdapter; constructor takes `{ ydoc, ymap?, config }`; `ymap` defaults to `ydoc.getMap('barocss-document')`.
- **Flow**: DataStore `emitOperation` → adapter sends to Yjs; Yjs updates → adapter `receiveOperation` → `applyOperationToDataStore`.
- **Provider**: use `y-websocket` or custom provider; adapter does not create connection.
- **Config**: AdapterConfig (clientId, user, debug, transformOperation) from @barocss/collaboration.

## Rules

1. **Do not** create WebSocket inside adapter; pass existing ydoc (and optional ymap); provider is external.
2. **State**: initial load via `getDocumentState()`; sync remote updates via Yjs observe → `receiveOperation`.
3. **Circular updates**: BaseAdapter disables operation listener when applying remote ops; no extra handling in YjsAdapter for that.
4. **References**: `packages/collaboration-yjs/`; deps: `@barocss/collaboration`, `@barocss/datastore`, `yjs`.

## Quick reference

- Package: `packages/collaboration-yjs/`
- Entry: YjsAdapter; options: ydoc (required), ymap (optional), config
- Usage: create ydoc + provider → new YjsAdapter({ ydoc, config }) → adapter.connect(dataStore)
