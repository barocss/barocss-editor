# @barocss/extensions

Reusable editing commands and keybindings for text, blocks, marks, tables, and document features.

## Purpose

Compose extension bundles with a schema and renderers that support the same vocabulary.

## Install

```sh
npm install @barocss/extensions @barocss/editor-core @barocss/schema
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/extensions` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/extensions/src/...` are not part of the published API.

## Usage

```ts
import { Editor } from '@barocss/editor-core';
import { createSchema, getMinimalSchemaDefinition } from '@barocss/schema';
import { createCoreExtensions, BoldExtension, ItalicExtension } from '@barocss/extensions';

const editor = new Editor({
  schema: createSchema('prose', getMinimalSchemaDefinition()),
  extensions: [...createCoreExtensions(), new BoldExtension(), new ItalicExtension()],
});
// Supply renderers and a view before accepting user input.
editor.destroy();
```

## Integration notes

Adding an extension does not automatically add its schema nodes, renderers, toolbar buttons, or persistence. Product factories deliberately select supported extensions; avoid enabling every extension without checking those boundaries.

## Compose supported behavior

Pass extension **instances**, such as `new BoldExtension()`, not class constructors. The minimal schema declares bold and italic marks. The view must also register their mark renderers to display the result.

`createCoreExtensions()` provides the baseline bundle. A product factory selects a different bundle for its document schema. Use the product's `extensions` option to add behavior without replacing that bundle. Use `kit` only when you intend to supply the whole replacement bundle.

Some extensions supply fallback renderers through `defaultRenderers`. This does not add missing schema definitions, product controls, or storage. Test command availability and the rendered result together. See the [extension guide](https://editor.barocss.com/docs/guides/editor-extensibility).

## Documentation

- [Package guide](https://editor.barocss.com/packages/extensions)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/extensions)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/extensions) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
