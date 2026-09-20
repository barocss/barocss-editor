# @barocss/dsl

Declarative templates and renderer registries shared by DOM and React renderers.

## Purpose

Use templates to describe the element, text, attribute, and child-slot output for a node type.

## Install

```sh
npm install @barocss/dsl
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/dsl` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/dsl/src/...` are not part of the published API.

## Usage

```ts
import { RendererRegistry, intoRegistry, define, element, data, slot } from '@barocss/dsl';

const registry = new RendererRegistry({ global: false });
intoRegistry(registry, () => {
  define('document', element('article', {}, [slot('content')]));
  define('paragraph', element('p', {}, [slot('content')]));
  define('inline-text', element('span', {}, [data('text', '')]));
});
console.log(registry.get('paragraph'));
```

## Integration notes

Register templates in a scoped RendererRegistry when embedding multiple products. Global registration can replace another product's definitions. A template does not define a schema or a command.

## Documentation

- [Package guide](https://editor.barocss.com/packages/dsl)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/dsl)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/dsl) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
