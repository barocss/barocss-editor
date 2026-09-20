# @barocss/editor-view-dom

Browser editing surface, DOM input handling, selection synchronization, and decorator layers.

## Purpose

Connect an Editor to an HTMLElement with EditorViewDOM. Renderers remain separate from input handling.

## Install

```sh
npm install @barocss/editor-view-dom @barocss/editor-core @barocss/dsl
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/editor-view-dom` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/editor-view-dom/src/...` are not part of the published API.

## Usage

```ts
import type { Editor } from '@barocss/editor-core';
import type { RendererRegistry } from '@barocss/dsl';
import { EditorViewDOM } from '@barocss/editor-view-dom';

export function attachView(editor: Editor, container: HTMLElement, registry: RendererRegistry) {
  const view = new EditorViewDOM(editor, { container, registry });
  view.render();
  return () => view.destroy();
}
```

## Integration notes

The constructor takes an options object containing container. Call render after loading content; there is no mount method. Destroy the view before destroying its editor. Mount only in a browser.

Your document renderer must preserve whitespace. Set `style: { whiteSpace: 'pre-wrap' }` on its root element, or apply equivalent CSS. Without this rule, the browser collapses repeated and trailing spaces and caret positions can differ from the document text. The [DOM quick start](https://editor.barocss.com/docs/quick-start) includes this setting.

## Documentation

- [Package guide](https://editor.barocss.com/packages/editor-view-dom)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/editor-view-dom)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/editor-view-dom) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
