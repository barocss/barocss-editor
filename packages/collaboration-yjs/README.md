# @barocss/collaboration-yjs

Experimental Yjs adapter for Barocss document operations and presence.

## Purpose

Connect an existing `Y.Doc` and optional provider awareness to a DataStore through
`YjsAdapter`. The initial hydration example below is verified separately from
live editing. Current outbound update and nested-map observation limitations mean
this is not a production-ready collaborative editor connection.

## Install

```sh
npm install @barocss/collaboration-yjs @barocss/datastore yjs
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/collaboration-yjs` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/collaboration-yjs/src/...` are not part of the published API.

## Usage

```ts
import * as Y from 'yjs';
import { DataStore } from '@barocss/datastore';
import { YjsAdapter } from '@barocss/collaboration-yjs';

// No WebSocket provider, credentials, or remote storage is used in this example.
const ydoc = new Y.Doc();
const nodes = ydoc.getMap('barocss-document');
nodes.set('doc', { sid: 'doc', stype: 'document', content: ['paragraph'] });
nodes.set('paragraph', { sid: 'paragraph', stype: 'paragraph', content: ['text'] });
nodes.set('text', { sid: 'text', stype: 'inline-text', text: 'Shared snapshot' });
const store = new DataStore('doc');
const adapter = new YjsAdapter({ ydoc });
try {
  await adapter.connect(store);
  if (!adapter.isConnected()) throw new Error('Adapter setup did not finish');
  if (store.getNode('text')?.text !== 'Shared snapshot') {
    throw new Error('Snapshot did not load');
  }
  const root = await adapter.getDocumentState();
  if (root?.sid !== 'doc') throw new Error('Unexpected root');
  // root.content contains IDs. This is not a recursively exported document.
} finally {
  await adapter.disconnect();
  adapter.awareness.destroy(); // Also release the timer if connection setup failed.
  ydoc.destroy();
}
```

## Peer dependencies

- `yjs`: `^13.6.0`.

## Integration notes

Supply the Yjs document, provider, room identity, and authentication in the host. connect receives the DataStore. Disconnect the adapter before destroying the provider and Y.Doc. This README does not claim a tested hosted provider configuration.

## Options and lifecycle

- `ydoc`: the host's document. The default map is `ydoc.getMap('barocss-document')`.
- `ymap`: an optional alternative map.
- `awareness`: an optional provider-compatible awareness object. The adapter uses
  `on/off('change', handler)`, `getStates`, `getLocalState`, and `setLocalState`.
- `config`: client identity, user metadata, operation transform, and debug logging.
- `conflictResolution`: accepted configuration; it does not establish a tested
  concurrent editing guarantee.

The host must finish any provider-specific initial synchronization before relying
on initial content. `connect` loads current map entries; it does not wait for a
network provider's synchronized event or upload an existing local document to an
empty remote map. Use a known document root ID: loading node entries is not the
same as attaching a new root to a product editor.

`getDocumentState()` returns the connected store's root node. `setDocumentState`
writes a tree into the Yjs map, resolving child IDs through that store. Neither
method waits for a server acknowledgement. Presence cursor methods are on the
adapter; `adapter.awareness` is the local/remote state reader. Disconnect before
destroying the host's provider and Y.Doc. Create a fresh adapter for a new session.

## Known limitations and troubleshooting

| Symptom or requirement | Current behavior and next action |
| --- | --- |
| Updating a node throws `.set is not a function` | Create/snapshot paths store plain objects, while update/move paths call `.set` on the stored value. The real-Yjs reproduction is recorded in the documentation audit. Do not treat local edits as synchronized. |
| Changes inside a nested `Y.Map` do not reach the store | The observer handles only events whose target is the top-level map. Supplying nested maps is not a complete workaround for the outbound problem. |
| An empty room does not receive existing content | Connection hydrates from Yjs; it does not automatically seed from the local store. Establish an explicit, tested initial-state policy. |
| Reconnection fails or duplicates work | The base adapter does not clean up a failed setup automatically. Do not retry on a live session without addressing cleanup. |
| A peer is visible but its document differs | Awareness and document operations are separate paths. Presence does not prove successful editing or persistence. |

Text is represented as node fields, not as a `Y.Text` per text node. The package
has no demonstrated character-level concurrent text merge, offline recovery,
provider authentication, or hosted persistence contract. The adapter's event path
also does not route incoming events through its conflict resolver. The documented
snapshot check must not be presented as a multi-user editing certification.

See [Collaboration and saving](https://editor.barocss.com/docs/guides/collaboration-and-saving)
for host responsibilities and the current support boundary.

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration-yjs)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration-yjs)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/collaboration-yjs) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
