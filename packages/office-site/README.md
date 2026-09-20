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

## Implemented capabilities

| Area | Package support | Host responsibility |
| --- | --- | --- |
| Pages | Site surfaces, page paths, links, metadata, frames and stacked layout | Page navigation and the builder shell |
| Content | Shared text, tables, pictures, components and collection resolution | Renderer registration, assets and property controls |
| Data | Datasets, fields, rows, rich-text references and collection queries | Data-source access and nested Note editor lifecycle |
| Responsive layout | Width definitions, attribute overrides and preview environments | Active preview width; check export limitations below |
| Files | Native JSON, local library and document-session options | Save prompts, persistence lifecycle and error handling |
| Delivery | HTML pages, supporting files, ZIP bytes and local publish records | Downloads, hosting, deployment verification and access control |

These are implementation boundaries, not a claim that every product interaction has passed release acceptance. See the known issues below.

## Host integration

`createSiteEditor()` creates an editor session. It does not mount a complete builder. `createStarterSite()` supplies a blank one-page document; `createSampleSite()` supplies demonstration content.

1. Create the editor and load the document.
2. Call `registerSiteRenderers()` before drawing or exporting. Use the registry containing those renderers for the view.
3. Compose `PageFrame`, `Inspector`, `Overlay`, `Rail`, and optionally `Admin` from `/ui`. These are building blocks, not a single application component.
4. Supply the shared text environment and Site width environment when assembling a DOM view yourself. The reference `PageFrame` shows this wiring. Include the page-content CSS as well as the UI styles above.
5. Keep the active page and preview width in the host. Page flow is browser layout, not Word pagination. Preview width and viewport zoom are different settings.
6. Flush embedded edits before saving, replacing or exporting a document. Dispose views, subscriptions and editor sessions when their host closes.

See [the Site host](https://github.com/barocss/barocss-editor/tree/main/apps/site) and [PageFrame](https://github.com/barocss/barocss-editor/blob/main/packages/office-site/src/page-frame.tsx) for the complete view assembly. Registering Note's standalone renderers over the Site registry is not the embedded-body integration path.

A Site page is a `surface` with the Site surface kind, not a node with `stype: 'page'`. Use `pagesOf` to find pages. A session `sid` is a node address for commands; page paths and persistent page identifiers serve different purposes. Do not persist session IDs as external links.

### Embedded Note bodies

The reference host opens a separate Note session for an existing rich-text body. It delivers changed blocks back to the owning Site node. Pending writes must be flushed into the Site document before taking its snapshot. A late callback from a closed body must not write into a replacement document.

`NoteField` and the host's body-flush registry are application code, not exports of `@barocss/office-site/ui`. Use the [Note package's session contract](https://editor.barocss.com/packages/office-note) when building your own host. A shared parent/child store is not required.

## Native files and local persistence

The native format is `barocss-site`, currently file version `1`, with the `.site.json` extension. This file version is separate from the npm package version. `siteFileText` removes transient node session IDs. `readSiteFile` reports format, version and basic document-shape errors; it is not a complete schema validator for arbitrary imported content.

The following complete browser-module example changes the site metadata, serializes it, and reopens it in a fresh session. It does not write a download or start autosave.

```ts
import {
  createSiteEditor, createStarterSite, readSiteFile, siteFileText, siteTitle,
} from '@barocss/office-site';

const editor = createSiteEditor();
const reopened = createSiteEditor();
try {
  editor.loadDocument(createStarterSite(), 'site-original');
  const changed = await editor.executeCommand('setSiteInfo', {
    name: 'Team handbook', lang: 'en', description: 'Working agreements',
  });
  if (!changed) throw new Error('Site metadata was not updated');

  const text = siteFileText(editor.exportDocument(), '2026-09-20T00:00:00.000Z');
  const parsed = readSiteFile(text);
  if ('error' in parsed) throw new Error(parsed.error);
  reopened.loadDocument(parsed.document, 'site-reopened');
  if (siteTitle(reopened.dataStore) !== 'Team handbook') {
    throw new Error('The site title did not survive the round trip');
  }
  console.log('Site native file round trip passed');
} finally {
  reopened.destroy();
  editor.destroy();
}
```

Use `siteSessionOptions(editor, beforeSnapshot)` with the shared document-session controller for working-document persistence. This function supplies snapshot, replacement and change-subscription callbacks; calling it alone does not start autosave. Its `beforeSnapshot` callback must await nested Note writes. Keep failures visible and preserve pending edits for retry.

`siteDocuments` and `siteDrafts` use browser-local IndexedDB. The named-library helpers (`keepSite`, `siteLibraryRows`, `siteLibraryDocument`, `dropSite`) use a separate local library. None of these APIs supplies cross-device synchronization or a server backup. The `/workspace` entry exposes `read`, `text`, `create` and `schema` for native-file integration without mounting UI.

## Static HTML and ZIP export

Export renders through the Site DOM renderers into a detached element. It requires DOM APIs, even though no editor view has to be mounted. It is not a DOM-free server-rendering API.

| API | Result | Document mutation |
| --- | --- | --- |
| `exportPage(editor, pageSid)` | One `ExportedPage`: `path`, `file`, `name`, `html` | None |
| `exportSite(editor)` | Array of exported pages | None |
| `editor.executeCommand('exportPage', payload)` | One page delivered to `payload.write` | None |
| `editor.executeCommand('exportSite', payload)` | Pages plus supporting files delivered to `payload.write` | None |
| `editor.executeCommand('publishSite', payload)` | Output plus a local publish record | Yes; see below |

For the page command, pass `{ pageId: pageSid, write }`; `pageId` is the page's current session ID. If omitted, the command selects the first page. `write` receives a `Published` object and may return a promise, which the command awaits.

The Site export command can include embedded assets and renditions, sitemap, robots and a configured not-found page. Which files appear depends on the document. Page-only output does not collect all supporting files. `Published.files[].bytes` is base64 text; `zipOf` decodes it and returns ZIP bytes as a `Uint8Array`.

This complete browser-module example prepares an archive without downloading or deploying it. Install the package and run it in a bundled browser entry, after loading the styles required by your own view.

```ts
import {
  createSiteEditor, createStarterSite, exportSite, registerSiteRenderers,
  siteFileText, zipOf, type Published,
} from '@barocss/office-site';

registerSiteRenderers();
const editor = createSiteEditor();
try {
  editor.loadDocument(createStarterSite(), 'site-export');
  const changed = await editor.executeCommand('setSiteInfo', {
    name: 'Team handbook', lang: 'en', address: 'https://example.com',
  });
  if (!changed) throw new Error('Site metadata was not updated');
  const before = siteFileText(editor.exportDocument(), '');
  const pages = exportSite(editor);
  if (pages.length !== 1 || pages[0].file !== 'index.html') {
    throw new Error('Expected the starter home page');
  }
  if (!pages[0].html.startsWith('<!doctype html>')) {
    throw new Error('Expected a complete HTML document');
  }

  let archive: Uint8Array | undefined;
  const exported = await editor.executeCommand('exportSite', {
    write: (result: Published) => {
      archive = zipOf([
        ...result.pages.map(page => ({ file: page.file, text: page.html })),
        ...result.files,
      ]);
    },
  });
  if (!exported || !archive?.byteLength) throw new Error('No ZIP was prepared');
  if (siteFileText(editor.exportDocument(), '') !== before) {
    throw new Error('Export unexpectedly changed the document');
  }
  console.log('Site HTML and ZIP export passed', pages[0].file, archive.byteLength);
} finally {
  editor.destroy();
}
```

The example address is metadata only; this code does not contact that server. The host decides how to save or upload the returned files.

### Export boundaries

- **CSS and widths:** output contains generated page CSS and supported interaction scripts. The current media, state and reveal exporters use the built-in breakpoint list. Do not assume custom document width definitions have full export parity.
- **Assets:** embedded asset bytes can become supporting files. External URLs still depend on their hosts. Export is not a crawler that downloads every remote image or font.
- **Data:** stored rows form the exported snapshot. Opt-in live collections ship a browser script and public source URL. The endpoint must permit browser access; failed or empty refreshes keep the published rows. This is not an authenticated data proxy.
- **Forms:** output can describe a configured form and endpoint. A submission service, storage, spam handling and delivery remain host responsibilities.
- **Hosting:** validate output paths for your deployment target, serve the files and manage public URLs in your host. ZIP creation neither deploys nor verifies a live site.

### Publish records are local markers

`publishSite` records a document digest and metadata **before** it calls the supplied `write` callback. A failed write can therefore leave a record. Omitting `write` can still return success without uploading anything. Supply `at` explicitly for a meaningful timestamp; the current fallback is the Unix epoch. The optional `by` value is caller-provided, not an authenticated identity.

`publishState` compares the current document with the last local record. It does not inspect a deployed server. The digest is a change indicator, not a cryptographic integrity check. Keep confirmed deployment status and rollback artifacts in the host; a publish record is neither a deployment receipt nor a stored revision.

## Integration notes

### Known integration limits

As reviewed on 2026-09-20. Repository documentation can describe changes newer than your installed npm release:

- [#299](https://github.com/barocss/barocss-editor/issues/299): the Site host's save shortcut for an open Note body has a separate, unmerged fix under review.
- [#325](https://github.com/barocss/barocss-editor/issues/325): an empty rich-text field or a new data row does not yet provide the same editable Note-body entry path as an existing body.
- The examples above verify model/file/export APIs. They do not certify the full builder UI, nested input behavior, custom-width export, a form backend or production deployment.

Check each issue's current status before depending on the affected interaction. `writerMayRun` and `writerMaySet` control editor modes; use a server permission system for access control.

## Documentation

- [Site integration guide](https://editor.barocss.com/docs/guides/site-integration)
- [Package guide](https://editor.barocss.com/packages/office-site)
- [Choose a package](https://editor.barocss.com/packages)
- [Source and tests](https://github.com/barocss/barocss-editor/tree/main/packages/office-site)

## License

MIT. The published archive includes the license in `dist/LICENSE`.
