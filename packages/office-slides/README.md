# @barocss/office-slides

Presentation schema, editing commands, slide geometry, playback, and React workspace components.

## Purpose

Use the root entry for deck behavior and the /ui entry for Stage, filmstrip, properties, presentation, and other React surfaces.

## Install

```sh
npm install @barocss/office-slides react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-slides` | Public JavaScript and TypeScript API |
| `@barocss/office-slides/ui` | React UI components |
| `@barocss/office-slides/slides.css` | Stylesheet |
| `@barocss/office-slides/ui.css` | Stylesheet |
| `@barocss/office-slides/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-slides/src/...` are not part of the published API.

## Usage

```ts
import { createSlidesEditor, createStarterDeck } from '@barocss/office-slides';

const editor = createSlidesEditor();
editor.loadDocument(createStarterDeck(), 'deck-session');
console.log(editor.getRootId());
// Hand the session to your Stage and workspace UI.
// When the host closes the deck:
editor.destroy();
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-slides/slides.css`, `@barocss/office-slides/ui.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Host integration

Register `registerSlidesRenderers` for the deck view. Compose `Stage`, `SlideSidebar`, `Properties`, and presentation surfaces from `/ui`. Keep the viewport scale separate from document geometry. See [the Slides host](https://github.com/barocss/barocss-editor/tree/main/apps/slide) for the complete assembly.

## Integration notes

createSlidesEditor and createStarterDeck prepare a deck session. The complete UI assembly, viewport ownership, and persistence wiring are in apps/slide. A deck uses shared text and canvas behavior; it does not use the Word page layout loop.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-slides)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-slides)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
