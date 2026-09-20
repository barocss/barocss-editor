# @barocss/collaboration-liveblocks

Room-backed collaboration adapter and presence bridge.

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

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration-liveblocks)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration-liveblocks)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/collaboration-liveblocks) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
