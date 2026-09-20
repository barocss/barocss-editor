---
title: Integrate Site
---

Site is a page-builder kit with native document files and static HTML export. Your application supplies the builder shell, persistence lifecycle and hosting service.

## Choose the integration boundary

| Need | Start here |
| --- | --- |
| A blank or sample site session | [Factory and host assembly](/packages/office-site#host-integration) |
| An existing rich-text body in a dataset | [Embedded Note lifecycle](/packages/office-site#embedded-note-bodies) |
| Native save and reopen | [Complete file example](/packages/office-site#native-files-and-local-persistence) |
| HTML pages and a ZIP archive | [Complete browser export example](/packages/office-site#static-html-and-zip-export) |
| Publish status in your service | [Local record limitations](/packages/office-site#publish-records-are-local-markers) |

The package README is the source of these examples. Its published package page is generated from that README, so the code is maintained in one place.

## Assemble the builder

Use the root package for commands and document operations. Use `/ui` for the page frame, inspector, overlay and navigation components. The factory does not mount a React application. Follow the [Office styling guide](office-styling.md) for tokens, content styles and packaged Tailwind sources.

The [reference Site application](https://github.com/barocss/barocss-editor/tree/main/apps/site) shows page selection, renderer environments, properties and persistence. Application helpers such as `NoteField` are not public package exports. A body editor has its own Note session and must deliver its pending changes before its parent is saved or exported.

## Keep three outputs distinct

1. **Native Site JSON** preserves the editable document. A local file or IndexedDB store is not a shared cloud service.
2. **HTML and ZIP output** prepares visitor files. The command can deliver supporting files to a host callback; the direct export function returns pages.
3. **A deployed site** needs a host to upload files, verify the result and manage its public URL. Local publish records cannot prove that this happened.

The current HTML exporter uses the built-in breakpoints for responsive output. A custom builder preview width is not evidence of matching exported media rules. Public forms and remote data also depend on services supplied outside the package.

## Validation and remaining work

The linked examples use public package imports. They cover native file round trips and browser-side HTML/ZIP preparation. They do not demonstrate a backend or a complete embedded-body UI.

Read the [known integration limits](/packages/office-site#known-integration-limits) before building on empty rich-text fields or the Site host's nested Note save shortcut. The [source and validation audit](https://github.com/barocss/barocss-editor/blob/main/docs/specs/site-documentation-audit.md) records the reviewed revision and checks. Documentation for repository main can be newer than the installed npm release.

For the wider product structure, see [Office product integration](office-products.md) and [package boundaries](package-boundaries.md).
