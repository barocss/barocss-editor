# @barocss/office-text

Shared prose, formatting, tables, columns, math rendering, and text-related document behavior.

## Purpose

Use this layer when a product needs text behavior without depending on another product package.

## Install

```sh
npm install @barocss/office-text @barocss/dsl
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-text` | Public JavaScript and TypeScript API |
| `@barocss/office-text/text.css` | Stylesheet |

Import only these public paths. Source paths such as `@barocss/office-text/src/...` are not part of the published API.

## Usage

```ts
import { RendererRegistry, intoRegistry } from '@barocss/dsl';
import { registerTextRenderers, normalizeProseTree } from '@barocss/office-text';
import '@barocss/office-text/text.css';

const registry = new RendererRegistry({ global: false });
intoRegistry(registry, registerTextRenderers);
const tree = normalizeProseTree({ stype: 'note', content: [
  { stype: 'paragraph', content: [{ stype: 'inline-text', text: 'Shared text' }] },
]});
console.log(tree); // Add the product's root renderer before displaying the tree.
```

## Styles

Import `@barocss/office-text/text.css` once in the host.

## Integration notes

Load text.css for document rendering. registerTextRenderers registers shared templates; it does not install a product kit, page layout, or UI. Product-specific renderers may override the shared templates in their own registry.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-text)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-text)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
