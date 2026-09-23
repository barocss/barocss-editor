# @barocss/office-word

Word-processing schema, editor kit, pagination, formatting, and document UI components.

## Purpose

Use the root entry for document behavior and the /ui entry for React controls. The complete application assembly is in apps/word.

## Install

```sh
npm install @barocss/office-word react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-word` | Public JavaScript and TypeScript API |
| `@barocss/office-word/ui` | React UI components |
| `@barocss/office-word/ui.css` | Stylesheet |
| `@barocss/office-word/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-word/src/...` are not part of the published API.

## Usage

```ts
import { createWordEditor, getWordSchemaDefinition } from '@barocss/office-word';

const editor = createWordEditor();
console.log(getWordSchemaDefinition().topNode);
console.log(editor.getRootId());
// Keep this editor for the host's view, layout, and controls.
// When the host closes the document:
editor.destroy();
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-word/ui.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Host integration

Register `registerWordRenderers` in the registry passed to `EditorViewDOM`. The host also coordinates measurement and pagination. `Ribbon`, `Ruler`, `DrawingOverlay`, `OutlinePane`, and dialogs are available from `/ui`. See [the Word host](https://github.com/barocss/barocss-editor/tree/main/apps/word) for the full composition; the example above intentionally creates only the editor session.

## Integration notes

createWordEditor creates a session, not a ready-mounted word processor. A host must connect the DOM view, page measurement/layout, selection overlays, storage, and UI. Importing the package does not provide a cloud document service.

## Customization boundary

`createWordEditor(options)` accepts these composition options:

| Option | Behavior |
| --- | --- |
| `extensions` | Append extension instances after the default product kit |
| `kit` | Replace the default product extension kit, including when set to an empty array |
| `schema` | Replace the default product schema; it is not merged automatically |
| `keybindings` | Register additional bindings without clearing the existing registry |

Keep the product's schema, commands, and renderers compatible. An arbitrary schema accepted by the factory does not make every product control work with that schema. A custom extension does not automatically add a toolbar or inspector control.

The `author` option supplies the identity used by document features such as comments. It is not authentication. The factory adds Word keybindings before caller keybindings. Keep pagination and measurement in the host; changing a renderer can change page geometry.

See [extension boundaries and product customization](https://editor.barocss.com/docs/guides/editor-extensibility) before replacing a kit or adding a node type.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-word)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-word)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
