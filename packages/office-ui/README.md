# @barocss/office-ui

Shared React controls, design tokens, floating surfaces, panels, menus, and workspace layout primitives.

## Purpose

Use this package for UI that does not need to know about an Editor. Pass values and callbacks from the host.

## Install

```sh
npm install @barocss/office-ui react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-ui` | Public JavaScript and TypeScript API |
| `@barocss/office-ui/tokens.css` | Stylesheet |

Import only these public paths. Source paths such as `@barocss/office-ui/src/...` are not part of the published API.

## Usage

```tsx
import { useState } from 'react';
import { Button, TextField, TipProvider } from '@barocss/office-ui';
import '@barocss/office-ui/tokens.css';

export function RenameDocument() {
  const [title, setTitle] = useState('Weekly report');
  return <TipProvider>
    <TextField ariaLabel="Document title" value={title} onChange={setTitle} />
    <Button onClick={() => console.log('Save', title)}>Save</Button>
  </TipProvider>;
}
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Integration notes

Load tokens.css once and configure Tailwind 4 to scan the installed dist files. Tokens and component CSS alone do not generate utility classes. Use office-editor-ui for controls that subscribe to editor state or execute commands.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-ui)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-ui)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
