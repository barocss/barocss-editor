---
title: Integrate Word
---

# Integrate Word

`@barocss/office-word` provides a word-processing model, editing kit, layout helpers, and UI components. It does not mount a complete application or create a document service. A host connects those parts to a DOM view, storage, assets, and navigation.

This guide reviews source commit `558714a8` (2026-09-20). The [Word package README](/packages/office-word) owns the detailed API tables and complete examples. The reviewed source may include changes that are not in an older installed npm archive.

## Separate the model, page view, and host

| Layer | Package responsibility | Host responsibility |
| --- | --- | --- |
| Document | Word schema, commands, selection/history, style and field resolution | Choose a starter or saved tree; preserve unsaved changes during navigation |
| Display | Renderers, measurement, pagination, print-page helpers | Mount the DOM view and layout pass, supply live document/revision access, load fonts |
| Controls | React ribbon, ruler, dialogs, panes, drawing overlay | Wire callbacks and the same editor/view; manage pane and zoom state |
| Persistence | Native file functions, local library helpers, DOCX conversion | Durable storage, save status, retries, authorization, sharing, and synchronization |

The [implemented feature inventory](/packages/office-word#implemented-feature-surfaces) covers writing, page layout, tables/objects, references, review, and mathematics. It distinguishes a code surface from an independently verified end-to-end product scenario.

## Start from a document, not a screenshot

Create an editor with `createWordEditor()`. Load `createStarterDocument()` for a blank styled document, or decode an existing file first. `createSampleDocument()` is demonstration content; it should not overwrite a saved document on every application start.

The model root is a `document` containing metadata, flow sections, and resources. Each `surface` is a section that may span multiple printed sheets. Page count is a layout result. `surfaceCount()` cannot replace it.

The [document/display contract](/packages/office-word#document-and-display-contracts) explains title metadata, units, and the distinction between document geometry and viewport zoom. Keep display zoom outside the saved geometry.

## Assemble rendering and editing together

The [view/layout sequence](/packages/office-word#connect-a-view-and-layout) identifies the public integration pieces. The complete host is in [apps/word/src/main.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/word/src/main.tsx) and [apps/word/src/app.tsx](https://github.com/barocss/barocss-editor/blob/main/apps/word/src/app.tsx).

A registered renderer alone does not provide pagination. The layout pass measures rendered blocks, computes page positions, and supplies an updated environment. The host must connect paragraph/table break callbacks to the corresponding widgets. Keep the document access object's root live after a file is loaded, and change its revision token on content updates so styles and fields refresh.

Load [Office styles](office-styling.md) and wait for the selected fonts before relying on page measurements. The supplied font loader can request Google Fonts. An internal or offline installation needs its own font-delivery decision and cannot assume that network access exists.

`Ribbon` offers compact and detailed controls. Dialogs and panes still need host callbacks. `WordMathEditor` is a public dialog component; the in-place math integration is assembled inside the ribbon. Do not copy imports for internal hooks from `src/` into a consumer project.

## Make saving explicit

The [complete native-file example](/packages/office-word#complete-native-file-example) edits a starter document, awaits a host write, reads the native file, and reopens it in another model session. It does not claim to be an autosave implementation or a full visual editor.

Native files use the `barocss-word` envelope and `.word.json` extension. `WORD_FILE_VERSION` versions the data format, independently of npm package releases. Temporary editor IDs are removed from the serialized tree. Keep stable application identity in your host, not in those transient IDs.

`readWordFile` checks an envelope and basic tree shape, not the entire Word schema. A host can load the result into a temporary editor, inspect `documentFaults`, and decide whether to open it. A successful parse does not prove rendering fidelity or a complete validation of every mark.

Before replacing a document or exporting, resolve pending UI drafts and preserve the current unsaved state. Record a successful save only after the storage write succeeds. Handle save failures without destroying the user's active editor. The package's browser-local library is useful for a local host; it is not cloud backup.

## Treat DOCX as a reviewed exchange copy

Use the [DOCX contract and complete example](/packages/office-word#docx-is-bounded-interchange) to export bytes or decode a candidate document. Export and import return warning arrays. The importer uses browser XML APIs and can throw on invalid or unsupported input.

A document can display images, math, review information, or rich table formatting in Word while the current DOCX path cannot preserve those structures. The README lists supported subsets and hard rejections, including imported vertical merges and nested tables. Both paths produce baseline warnings for their bounded implementation; “no exception” does not mean lossless conversion.

Show the warnings before a host replaces an active document or presents a download. Keep the native file and original DOCX. This is distinct from app-level confirmation: the conversion API itself does not show a dialog, save a file, or navigate.

## Printing is a browser workflow

The [print helper contract](/packages/office-word#printing) operates on already rendered sheets. It creates temporary DOM copies for browser print events and returns cleanup hooks. Finish fonts and layout first, and include the matching print CSS.

These helpers do not return PDF bytes. A browser PDF workflow or a future server export service needs separate host wiring and validation. A unit test of layout or copy construction is not evidence of physical printer output.

## Current verification limits

[Issue #300](https://github.com/barocss/barocss-editor/issues/300) records UI scenarios blocked by an outdated ribbon entry path. It does not establish that the underlying formatting feature is broken, and those blocked later steps are not marked verified here. [Issue #303](https://github.com/barocss/barocss-editor/issues/303) tracks broader product scenario evidence.

The [Word documentation audit](https://github.com/barocss/barocss-editor/blob/main/docs/specs/word-documentation-audit.md) records source references, focused tests, packed example results, and the scope of browser checks. For shared product assembly, continue with [Product integration](office-products.md).
