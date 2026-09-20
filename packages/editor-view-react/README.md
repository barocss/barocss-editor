# @barocss/editor-view-react

React editor view with composable content, selection, decorator, and custom layers.

## Purpose

Use EditorView with an existing Editor and a renderer registry. The exported component is EditorView, not EditorViewReact.

## Install

```sh
npm install @barocss/editor-view-react @barocss/editor-core @barocss/dsl react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/editor-view-react` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/editor-view-react/src/...` are not part of the published API.

## Usage

```tsx
import type { Editor } from '@barocss/editor-core';
import type { RendererRegistry } from '@barocss/dsl';
import { EditorView } from '@barocss/editor-view-react';

export function DocumentView({ editor, registry }: {
  editor: Editor;
  registry: RendererRegistry;
}) {
  return <EditorView editor={editor} options={{ registry }} />;
}
```

## Peer dependencies

- `react`: `>=18.0.0`.
- `react-dom`: `>=18.0.0`.

## Integration notes

Own the Editor lifetime in the host. Mount layers inside EditorView or EditorViewContextProvider. The component is a browser editing surface, not a server-side editor instance.

## Documentation

- [Package guide](https://editor.barocss.com/packages/editor-view-react)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/editor-view-react)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/editor-view-react) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
