# @barocss/collaboration

Adapter contracts, presence state, and conflict-resolution support for shared document editing.

## Purpose

Use this package to implement or connect a collaboration transport. Yjs and Liveblocks integrations live in separate packages.

## Install

```sh
npm install @barocss/collaboration
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/collaboration` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/collaboration/src/...` are not part of the published API.

## Usage

```ts
import { DefaultAwarenessManager } from '@barocss/collaboration';

const presence = new DefaultAwarenessManager();
const updates: number[] = [];
const unsubscribe = presence.onRemoteChange((states) => updates.push(states.size));
try {
  presence.setLocalState({ clientId: 'tab-a', user: { id: 'user-a', name: 'Alex' } });
  presence.setLocalCursor({ nodeId: 'text-a', offset: 0 }, { nodeId: 'text-a', offset: 2 });
  const local = presence.getLocalState();
  if (!local?.cursor) throw new Error('Local presence was not initialized');

  // A transport would decode and validate this state before passing it in.
  // This example uses an in-memory peer; it makes no network request.
  presence.applyRemoteState('tab-b', {
    clientId: 'tab-b', user: { id: 'user-b', name: 'Blair' },
    cursor: null, lastActive: Date.now(),
  });
  if (presence.getRemoteStates().size !== 1) throw new Error('Expected one peer');
  presence.removeRemoteState('tab-b');
  if (updates.join(',') !== '1,0') throw new Error('Expected join and leave updates');
  presence.clearLocalCursor();
} finally {
  unsubscribe();
  presence.destroy();
}
```

## Integration notes

Presence and adapter primitives are not a hosted collaboration service. The host owns authentication, authorization, network transport, persistence, and adapter lifecycle. Destroy awareness managers to stop cleanup timers.

## Adapter lifecycle and error boundaries

`BaseAdapter` implements the common lifecycle. Extend its `doConnect`,
`doDisconnect`, `doSendOperation`, `doReceiveOperation`, `doGetDocumentState`,
and `doSetDocumentState` methods for a compatible transport.

| API | Current contract |
| --- | --- |
| `connect(store)` | Registers a DataStore operation listener, then runs adapter connection setup. A second connect while connected is rejected. |
| `isConnected()` | Reports completion of adapter setup; it is not a server-health or saved-state signal. |
| `sendOperation(op)` | Requires connection; applies `config.transformOperation` before sending. A direct call returns a promise that the caller can catch. |
| `receiveOperation(op)` | Delegates to the adapter's remote operation handler. This is not an authenticated server endpoint. |
| `disconnect()` | Removes the operation listener and runs cleanup when connected. |

Committed DataStore operations feed the adapter; a discarded transaction is not
sent through that commit path. The automatic listener catches send failures and
logs them. A successful local edit therefore does not prove that a peer received
it or that a server stored it. The base class supplies no durable retry queue or
server acknowledgement protocol.

Connection setup currently registers its listener before awaiting `doConnect`.
If setup throws, `connected` remains false and `disconnect()` returns early.
Do not assume a failed connection was cleaned up, or repeatedly retry it on a
live editing store. Use an isolated integration session, retain the user's local
draft, and resolve the transport/lifecycle failure before reusing resources.

## Presence and conflict support

Initialize local presence before setting a cursor. The concrete
`DefaultAwarenessManager` exposes `applyRemoteState` and `removeRemoteState` for
transport integration. `onRemoteChange` reports remote changes, not local state
changes. Nothing here broadcasts local presence automatically.

Remote presence expires after 30 seconds of inactivity by default, checked every
10 seconds. A transport must refresh `lastActive`, remove departed peers, and
render cursors in the view. Presence is not document storage or an access check.
Always unsubscribe and destroy the manager to stop its cleanup timer.

`ConflictResolver` can choose a last writer, first writer, shallow merge, or
custom result for two atomic operations. Its default is timestamp-based
last-writer-wins; the merge strategy combines update fields shallowly. This is
not character-level text merging, a global ordering protocol, or proof of
convergence. A concrete adapter must actually call it on the relevant path.

See [Collaboration and saving](https://editor.barocss.com/docs/guides/collaboration-and-saving)
for support status, integration checks, and troubleshooting.

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/collaboration) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
