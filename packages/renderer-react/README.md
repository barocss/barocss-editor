# @barocss/renderer-react

React output from the shared DSL templates and document model.

## Purpose

Use ReactRenderer to render a document model as React nodes. Use editor-view-react when you also need browser editing behavior.

## Install

```sh
npm install @barocss/renderer-react @barocss/dsl react
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/renderer-react` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/renderer-react/src/...` are not part of the published API.

## Usage

```tsx
import { ReactRenderer } from '@barocss/renderer-react';
import { RendererRegistry, intoRegistry, define, element, data } from '@barocss/dsl';

const registry = new RendererRegistry({ global: false });
intoRegistry(registry, () => define('inline-text', element('span', {}, [data('text')])));
const renderer = new ReactRenderer(registry);

export function Preview() {
  return <div>{renderer.build({ stype: 'inline-text', text: 'Preview' })}</div>;
}
```

## Peer dependencies

- `react`: `>=18.0.0`.

## Integration notes

Pass resolved model data with a stype and registered templates. A renderer does not subscribe to an editor or implement keyboard editing by itself.

## Documentation

- [Package guide](https://editor.barocss.com/packages/renderer-react)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/renderer-react)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/renderer-react) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
