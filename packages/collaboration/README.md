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

const awareness = new DefaultAwarenessManager();
awareness.setLocalState({ clientId: 'tab-1', user: { id: 'user-1' } });
const unsubscribe = awareness.onRemoteChange((states) => {
  console.log('Remote participants', states.size);
});
// The host transport sends local state and applies received remote state.
unsubscribe();
awareness.destroy();
```

## Integration notes

Presence and adapter primitives are not a hosted collaboration service. The host owns authentication, authorization, network transport, persistence, and adapter lifecycle. Destroy awareness managers to stop cleanup timers.

## Documentation

- [Package guide](https://editor.barocss.com/packages/collaboration)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/collaboration)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/collaboration) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
