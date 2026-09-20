# @barocss/model

Document operations, transaction helpers, positions, and selection context.

## Purpose

Use the model layer to build document trees and apply structured edits through the editor transaction system.

## Install

```sh
npm install @barocss/model @barocss/editor-core
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/model` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/model/src/...` are not part of the published API.

## Usage

```ts
import { node, textNode, mark } from '@barocss/model';

const paragraph = node('paragraph', {}, [
  textNode('inline-text', 'A clear heading', [mark('bold')]),
]);
console.log(paragraph.content); // Pass the tree to your document loader.
```

## Peer dependencies

- `@barocss/editor-core`: `workspace:*`.

## Integration notes

Tree builders return model data; constructing a node does not insert it into a live document. Apply edits through a transaction or an editor command so history and selection mapping can participate.

## Documentation

- [Package guide](https://editor.barocss.com/packages/model)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/model)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/model) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
