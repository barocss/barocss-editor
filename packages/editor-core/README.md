# @barocss/editor-core

Editor sessions, commands, extensions, selection, keybindings, and history.

## Purpose

Use this package for an editor without a prescribed UI. For Note, Word, Slides, or Site, start with that product's editor factory instead.

## Install

```sh
npm install @barocss/editor-core @barocss/schema @barocss/extensions
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/editor-core` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/editor-core/src/...` are not part of the published API.

## Usage

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions } from '@barocss/extensions';

const editor = new Editor({
  schema: createSchema('example', getMinimalSchemaDefinition()),
  extensions: createCoreExtensions(),
});
editor.loadDocument({ stype: 'document', content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Hello' }] },
]}, 'example-session');
console.log(editor.getRootId());
// Attach your view here. When the session ends:
editor.destroy();
```

## Integration notes

Create one editor per independent editing session. Load a document after construction, attach a view separately, and call destroy when the session ends.

## Documentation

- [Package guide](https://editor.barocss.com/packages/editor-core)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/editor-core)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/editor-core) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
