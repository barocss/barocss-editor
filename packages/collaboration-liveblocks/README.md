# @barocss/collaboration-liveblocks

Experimental room-bridge adapter for document operations and presence.

## Purpose

Use this adapter only with a room bridge that implements the interface used by this package.

## Install

```sh
npm install @barocss/collaboration-liveblocks @barocss/datastore "@liveblocks/client@^1.0.0"
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/collaboration-liveblocks` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/collaboration-liveblocks/src/...` are not part of the published API.

## Usage

```ts
import type { DataStore } from '@barocss/datastore';
import { LiveblocksAdapter, type LiveblocksAdapterOptions } from '@barocss/collaboration-liveblocks';

export async function connectRoomBridge(store: DataStore, options: LiveblocksAdapterOptions) {
  // Supply the compatible room bridge described below, not an unverified SDK room.
  const adapter = new LiveblocksAdapter(options);
  await adapter.connect(store);
  return async () => { await adapter.disconnect(); };
}
```

## Peer dependencies

- `@liveblocks/client`: `^1.0.0`.

## Integration notes

The current adapter expects room.subscribe("operations", ...), room.update(callback), and document storage/presence methods. Its room parameter is typed broadly; this is not a verified drop-in integration with the latest Liveblocks SDK. Validate or implement that bridge before production use. The host owns credentials and room access.

## Required room bridge

The current adapter consumes the following bridge shape. The broadly typed
`room` option does not prove that an SDK Room implements it.

| Bridge method | Use in this adapter |
| --- | --- |
| `subscribe('operations', callback)` | Receives arrays of atomic operations; returns an unsubscribe function. |
| `update(callback)` | Gives the callback a mutable root. Sends append to `root.operations`; snapshot writes set `root.document`. |
| `get('operations')` | Optional initial operation replay. |
| `getOthers()` plus `subscribe('others', callback)` | Enables the presence subscription; callbacks provide objects with `connectionId` and `presence`. |
| `updatePresence(patch)` | Optional user and cursor updates. |

The following is a **local bridge fixture**, not a Liveblocks network integration.
It checks explicit send/receive and cleanup against a small compatible object.
It does not import or certify a particular SDK Room implementation.

```ts
import { DataStore, type AtomicOperation } from '@barocss/datastore';
import { LiveblocksAdapter } from '@barocss/collaboration-liveblocks';

const sent: AtomicOperation[] = [];
let activeSubscriptions = 0;
const room = {
  subscribe(_event: string, _callback: (items: unknown[]) => void) {
    activeSubscriptions += 1;
    return () => { activeSubscriptions -= 1; };
  },
  update(callback: (root: { operations: AtomicOperation[] }) => void) {
    callback({ operations: sent });
  },
  get(_key: string) { return []; },
};
const store = new DataStore();
const adapter = new LiveblocksAdapter({ room });
try {
  await adapter.connect(store);
  await adapter.sendOperation({
    type: 'create', nodeId: 'outgoing', timestamp: Date.now(),
    data: { sid: 'outgoing', stype: 'inline-text', text: 'Outgoing' },
  });
  if (sent.length !== 1) throw new Error('Expected one bridge operation');
  await adapter.receiveOperation({
    type: 'create', nodeId: 'incoming', timestamp: Date.now(),
    data: { sid: 'incoming', stype: 'inline-text', text: 'Incoming' },
  });
  if (store.getNode('incoming')?.text !== 'Incoming') {
    throw new Error('Remote operation did not apply');
  }
  if (sent.length !== 1) throw new Error('Remote operation must not echo');
} finally {
  await adapter.disconnect();
  adapter.awareness.destroy();
}
if (activeSubscriptions !== 0) throw new Error('Subscription was not removed');
```

## Known limitations and troubleshooting

- Missing `room.update` or an unsupported `operations` subscription is a bridge
  mismatch. Successful package installation does not verify this contract. Do not
  solve it by casting an arbitrary SDK Room; implement and test a compatible bridge.
- `isConnected()` reports adapter setup, not server durability or permission checks.
  Automatic local send errors are logged by the base listener, not returned to the
  already-completed local edit.
- `setDocumentState` writes `root.document`; connection loads `root.operations`.
  A stored snapshot is not automatically rehydrated through that path. Its current
  JSON serializer also omits marks. Do not use it as a lossless backup recipe.
- `getDocumentState` returns the local store root, not a fetched server snapshot.
- The `others` handler adds or updates presence. It does not immediately remove
  peers absent from a later list; stale entries expire through the awareness timer.
- The exposed conflict resolver is not invoked by the adapter's incoming operation
  handler. No tested text-merge, operation deduplication, replay cursor, retry queue,
  offline recovery, or collaborative undo guarantee is provided here.

The host owns room access, SDK bridge compatibility, operation delivery and
ordering, server persistence, presence refresh, and provider shutdown. Disconnect
the adapter before leaving or destroying the room; use a fresh adapter per session.
See [Collaboration and saving](https://editor.barocss.com/docs/guides/collaboration-and-saving).

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration-liveblocks)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration-liveblocks)
- [Architecture reference](https://editor.barocss.com/docs/architecture/collaboration-liveblocks) (short summary; this README remains the source for examples).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
