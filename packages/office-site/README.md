# @barocss/office-site

Site-builder schema, editor commands, responsive layout, reusable content, and export helpers.

## Purpose

Use the root entry for site behavior and the /ui entry for page frames, inspectors, overlays, and navigation.

## Install

```sh
npm install @barocss/office-site react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-site` | Public JavaScript and TypeScript API |
| `@barocss/office-site/ui` | React UI components |
| `@barocss/office-site/ui.css` | Stylesheet |
| `@barocss/office-site/workspace` | Workspace file codec |

Import only these public paths. Source paths such as `@barocss/office-site/src/...` are not part of the published API.

## Usage

```ts
import { createSiteEditor, createSampleSite } from '@barocss/office-site';

const editor = createSiteEditor();
editor.loadDocument(createSampleSite(), 'site-session');
console.log(editor.getRootId());
// Mount PageFrame, Inspector, and other host-owned UI separately.
// When the host closes the site:
editor.destroy();
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. Load `@barocss/office-text/text.css` for shared document content. This package also exposes `@barocss/office-site/ui.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Host integration

Register `registerSiteRenderers` for the builder view. Compose `PageFrame`, `Inspector`, `Overlay`, and `Rail` from `/ui`. `createSampleSite` is demonstration content, not a production persistence format. See [the Site host](https://github.com/barocss/barocss-editor/tree/main/apps/site) for the complete assembly.

## Integration notes

createSiteEditor creates the model session. The host must mount the builder UI and supply durable storage, asset handling, deployment, and access control. Export helpers do not create a hosted public URL.

## Customization boundary

`createSiteEditor(options)` accepts these composition options:

| Option | Behavior |
| --- | --- |
| `extensions` | Append extension instances after the default product kit |
| `kit` | Replace the default product extension kit, including when set to an empty array |
| `schema` | Replace the default product schema; it is not merged automatically |
| `keybindings` | Register additional bindings without clearing the existing registry |

Keep the product's schema, commands, and renderers compatible. An arbitrary schema accepted by the factory does not make every product control work with that schema. A custom extension does not automatically add a toolbar or inspector control.

The factory also installs Site content resolution for reusable content and collections. Replacing the extension kit does not remove this factory behavior. Keep asset storage, publishing, and access control in the host.

See [extension boundaries and product customization](https://editor.barocss.com/docs/guides/editor-extensibility) before replacing a kit or adding a node type.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-site)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-site)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
