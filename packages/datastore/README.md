# @barocss/datastore

Node storage, document loading, and atomic mutations for the editor model.

## Purpose

Use a DataStore when you need direct access to the document graph. An Editor owns a store and coordinates editing transactions above it.

## Install

```sh
npm install @barocss/datastore @barocss/schema @barocss/editor-core
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/datastore` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/datastore/src/...` are not part of the published API.

## Usage

```ts
import { DataStore } from '@barocss/datastore';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';

const schema = createSchema('my-document', getMinimalSchemaDefinition());
const store = new DataStore(undefined, schema, 'example-session');
console.log(store.getRootNode()); // No document has been loaded yet.
```

## Peer dependencies

- `@barocss/editor-core`: `workspace:*`.

## Integration notes

Do not create a second Editor over a live store to edit an embedded document. Use an independent session, such as openNoteTree, so selections and undo histories stay separate.

## Documentation

- [Package guide](https://editor.barocss.com/packages/datastore)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/datastore)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/datastore) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
