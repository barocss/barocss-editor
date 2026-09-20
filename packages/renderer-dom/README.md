# @barocss/renderer-dom

DSL-driven DOM rendering, reconciliation, component state, and measurements.

## Purpose

Use DOMRenderer when you need model-to-DOM rendering without the input handling provided by editor-view-dom.

## Install

```sh
npm install @barocss/renderer-dom @barocss/dsl
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/renderer-dom` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/renderer-dom/src/...` are not part of the published API.

## Usage

```ts
import { DOMRenderer } from '@barocss/renderer-dom';
import { RendererRegistry, intoRegistry, define, element, data } from '@barocss/dsl';

export function showText(container: HTMLElement) {
  const registry = new RendererRegistry({ global: false });
  intoRegistry(registry, () => define('inline-text', element('span', {}, [data('text')])));
  const renderer = new DOMRenderer(registry);
  renderer.render(container, { sid: 'preview:1', stype: 'inline-text', text: 'Preview' });
  return () => renderer.destroy();
}
```

## Integration notes

Rendering alone does not create editing commands, selection handling, or persistence. Destroy the renderer when its container is removed.

## Documentation

- [Package guide](https://editor.barocss.com/packages/renderer-dom)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/renderer-dom)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/renderer-dom) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
