# @barocss/collaboration-yjs

Yjs-backed adapter for Barocss document operations and presence.

## Purpose

Connect an existing Y.Doc and optional provider awareness to a DataStore through YjsAdapter.

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
import type { DataStore } from '@barocss/datastore';
import { YjsAdapter, type YjsAdapterOptions } from '@barocss/collaboration-yjs';

export async function connectSharedDocument(store: DataStore, options: YjsAdapterOptions) {
  // options.ydoc comes from the host's Yjs document/provider setup.
  const adapter = new YjsAdapter(options);
  await adapter.connect(store);
  return async () => { await adapter.disconnect(); };
}
```

## Peer dependencies

- `yjs`: `^13.6.0`.

## Integration notes

Supply the Yjs document, provider, room identity, and authentication in the host. connect receives the DataStore. Disconnect the adapter before destroying the provider and Y.Doc. This README does not claim a tested hosted provider configuration.

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration-yjs)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration-yjs)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/collaboration-yjs) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
