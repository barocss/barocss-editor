# @barocss/devtool

Browser diagnostics for editor model structure, events, and execution traces.

## Purpose

Attach Devtool to an Editor while developing an integration.

## Install

```sh
npm install @barocss/devtool @barocss/editor-core
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/devtool` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/devtool/src/...` are not part of the published API.

## Usage

```ts
import type { Editor } from '@barocss/editor-core';
import { Devtool } from '@barocss/devtool';

export function inspectEditor(editor: Editor) {
  const devtool = new Devtool({ editor, maxEvents: 500, debug: true });
  return () => devtool.destroy();
}
```

## Integration notes

Create diagnostics in a browser and destroy them with the editor session. Keep this development UI out of normal production screens unless your product deliberately exposes it.

## Documentation

- [Package guide](https://editor.barocss.com/packages/devtool)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/devtool)
- [Detailed architecture reference](https://editor.barocss.com/docs/architecture/devtool) (older deep reference; use the package guide for current entry points).

## License

MIT. The published archive includes the license in `dist/LICENSE`.
