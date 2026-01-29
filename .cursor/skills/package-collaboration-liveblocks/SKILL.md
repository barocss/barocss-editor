---
name: package-collaboration-liveblocks
description: Liveblocks adapter for Barocss DataStore (Room, createClient). Use when integrating or changing Liveblocks-based collaborative editing.
---

# @barocss/collaboration-liveblocks

## Scope

- **LiveblocksAdapter**: extends BaseAdapter; constructor takes `{ room, config }`; room from `createClient({ publicApiKey }).enter(roomId)`.
- **Flow**: DataStore `emitOperation` → adapter sends to Liveblocks room; room storage/updates → adapter `receiveOperation` → `applyOperationToDataStore`.
- **Auth**: use `authEndpoint` in createClient for production; publicApiKey for simple setup.
- **Config**: AdapterConfig (clientId, user, debug, transformOperation) from @barocss/collaboration.

## Rules

1. **Do not** create client/room inside adapter; pass existing room from app.
2. **State**: initial load and remote updates via room storage subscription; adapter maps to AtomicOperation and applies to DataStore.
3. **Presence**: room.updatePresence, room.subscribe('others') are app-level; adapter focuses on operation sync.
4. **References**: `packages/collaboration-liveblocks/`; deps: `@barocss/collaboration`, `@barocss/datastore`, `@liveblocks/client`.

## Quick reference

- Package: `packages/collaboration-liveblocks/`
- Entry: LiveblocksAdapter; options: room (required), config
- Usage: createClient → room = client.enter(id) → new LiveblocksAdapter({ room, config }) → adapter.connect(dataStore)
