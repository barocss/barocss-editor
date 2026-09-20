# @barocss/office-editor-ui

React bindings between Editor state, control declarations, and shared Office UI.

## Purpose

Use this package for command controls, contextual toolbars, selection tools, math editing, file actions, and editor-aware hooks.

## Install

```sh
npm install @barocss/office-editor-ui @barocss/editor-core @barocss/office-controls @barocss/office-ui react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-editor-ui` | Public JavaScript and TypeScript API |

Import only these public paths. Source paths such as `@barocss/office-editor-ui/src/...` are not part of the published API.

## Usage

```tsx
import type { Editor } from '@barocss/editor-core';
import { stateOfMark, type Control } from '@barocss/office-controls';
import { Controls } from '@barocss/office-editor-ui';
import { Toolbar, TipProvider } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

const controls: Control[] = [{
  label: 'Bold', icon: 'bold', command: 'toggleBold', state: stateOfMark('bold'),
}];
export function Formatting({ editor }: { editor: Editor }) {
  return <TipProvider><Toolbar aria-label="Formatting">
    <Controls editor={editor} controls={controls} />
  </Toolbar></TipProvider>;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Integration notes

Load office-ui tokens and configure Tailwind source scanning for both packages. The host owns the editor, enabled extensions, storage, and command declarations. Use office-ui directly for UI that has no editor dependency.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-editor-ui)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-editor-ui)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
