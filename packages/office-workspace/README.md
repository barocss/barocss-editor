# @barocss/office-workspace

Local document catalogue and navigation contracts shared by Note, Word, Slides, and Site.

## Purpose

Use this package to list, create, copy, import, and navigate local product documents. Product-specific file codecs stay in each product's /workspace entry.

## Install

```sh
npm install @barocss/office-workspace react react-dom
```

The published package provides ES modules and TypeScript declarations. Use a bundler that supports package exports.

## Public entry points

| Import | Role |
| --- | --- |
| `@barocss/office-workspace` | Public JavaScript and TypeScript API |
| `@barocss/office-workspace/ui` | React UI components |
| `@barocss/office-workspace/style.css` | Stylesheet |
| `@barocss/office-workspace/host` | Product-host navigation |

Import only these public paths. Source paths such as `@barocss/office-workspace/src/...` are not part of the published API.

## Usage

```ts
import { OfficeWorkspace, workspaceIdentity, documentURL } from '@barocss/office-workspace';

export async function createReport() {
  const workspace = new OfficeWorkspace(workspaceIdentity());
  const id = await workspace.create('word', 'Weekly report');
  await workspace.update(`word:${id}`, { favorite: true, folder: 'Reports' });
  return documentURL({ workspace: workspace.id, product: 'word', id });
}
// Run in the browser, then navigate to the returned URL in your host.
```

## Peer dependencies

- `react`: `>=18`.
- `react-dom`: `>=18`.

## Styles

Load `@barocss/office-ui/tokens.css` once in the host. This package also exposes `@barocss/office-workspace/style.css`.

Office React controls use Tailwind 4 utility classes. Configure the host to scan the installed package `dist` files; npm packages do not include the repository's `src` directories. See the [Office styling guide](https://editor.barocss.com/docs/guides/office-styling) for a Vite setup and CSS source paths.

## Save before navigation

Product hosts register a `beforeNavigate` callback through `registerProductDocumentHost` from `@barocss/shared`. Flush embedded editors before durable storage. Return `false` if saving fails so the current editor stays open.

`WorkspaceHome` is exported from `/ui`; `ProductNavigation` is exported from `/host`. The root module provides the local catalogue and file/navigation contracts. Backups restore to new IDs and remap included document references.

## Integration notes

Storage is browser-local and origin-specific. The host supplies /products/{product}/index.html routes. This package does not provide accounts, cloud storage, authorization, or real-time collaboration. A durable file ID is different from a runtime node ID.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-workspace)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-workspace)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
