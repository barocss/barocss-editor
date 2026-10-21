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
| `@barocss/office-workspace/project` | Goal, results, work and immutable input evidence UI |
| `@barocss/office-workspace/feedback` | Optional original-document feedback UI |

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

The Office host keeps the source editor mounted while a different product prepares its original. A staged `NativeHostSlot` does not become the active host until its exact native identity is ready and the source finishes its final input and save preparation. Cancelled, replaced and failed targets cannot publish a route or clear a newer target. The source URL changes only at successful promotion.

Browser-local Office editors use same-origin frames to isolate product module lifetimes, renderer registries and native document locations. This is lifecycle isolation, not an authorization or security boundary. Authenticated editors still require the current account, tenant, workspace, product and document checks. Site authenticated opening remains unsupported.

Project feedback checks its prepared input version again after native preparation. Later text or unfinished composition blocks navigation and preserves the current editor. A document identity guard alone does not certify that the latest input is saved.

Same-product completion checks the exact target lifetime. Word can retain its host object while changing the document ID and identity epoch. On real source retirement, feedback disables the old input and retains only a valid prepared draft witness. Ordinary unmount, changed feedback ownership and stale witness queries cannot protect or disable a new input. This input witness does not grant account or navigation authority.

Local parent-managed Back and Forward entries use the same preparation and staged-original checks. A refused traversal restores the retained source entry without overwriting the destination. A native identity change must wait for its own committed header and feedback registration before preparing input and publishing the new address. Home or external-page traversal and Note's child history entries are not covered by this contract.

Account exit uses the separate captured `beforeAccountExit` capability. It may settle an already admitted save, but does not start a new publication or retry. Failed immutable attempts and separate later drafts remain in their account-owned recovery storage. If the exact current input, recovery protection or feedback witness cannot be confirmed, exit stays blocked. Ordinary document navigation keeps its existing save preparation.

`WorkspaceHome` is exported from `/ui`; `ProductNavigation` is exported from `/host`. The root module provides the local catalogue and file/navigation contracts. Backups restore to new IDs and remap live result links. Historical input bytes, captured source IDs and native comment targets remain unchanged.

## Integration notes

Storage is browser-local and origin-specific. The host supplies /products/{product}/index.html routes. This package does not provide accounts, cloud storage, authorization, or real-time collaboration. A durable file ID is different from a runtime node ID.

## Documentation

- [Package guide](https://editor.barocss.com/packages/office-workspace)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-workspace)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
