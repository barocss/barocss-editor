---
title: Integrate Note
---

# Integrate Note

Use `@barocss/office-note` for an independent written document or an embedded rich-text body. The package supplies a Note schema, editing kit, sessions, and a React surface. Your application supplies document identity, navigation, storage, and asset services.

This guide reviews source commit `558714a8` (2026-09-20). Check your installed package version before adopting a newer API. The [Note package README](/packages/office-note) is the source of truth for the complete examples and option tables on this page.

## Choose the right entry point

| Input or task | Public path |
| --- | --- |
| Nested body tree from a CMS or saved document | `openNoteTree` from `@barocss/office-note` |
| Body stored as child node IDs in another document | `openNote` from `@barocss/office-note` |
| React editing surface | `NoteEditor` from `@barocss/office-note/view` |
| Native local-workspace codec | `@barocss/office-note/workspace` |

Start with the [complete React mounting example](/packages/office-note#usage). One body gets its own session, selection, and history. Do not share the parent editor's store to get a second selection for a CMS drawer. An embedded body is edited as a copy; the host decides how to write the changed blocks back into its document.

`createNoteEditor` is the lower-level factory. It requires a store and schema. `openNoteTree` assembles those for the standard Note contract. Neither entry point creates a backend or a complete workspace application.

## What the kit and view provide

The [feature inventory](/packages/office-note#implemented-feature-surfaces) covers writing blocks, formatting, tables, databases, prose columns, math, media, and page references. It also separates ordinary tables from Note databases and identifies host-supplied integrations.

That inventory describes code paths. It does not certify every browser interaction or claim complete Notion compatibility. In particular, menu/keyboard, heading insertion, and non-text selection regressions are tracked in [#278](https://github.com/barocss/barocss-editor/issues/278), [#279](https://github.com/barocss/barocss-editor/issues/279), [#280](https://github.com/barocss/barocss-editor/issues/280), [#281](https://github.com/barocss/barocss-editor/issues/281), and the [Note scenario work](https://github.com/barocss/barocss-editor/issues/282). An open fix PR is not part of this reviewed main baseline.

## Define save before adding autosave

There are three distinct steps:

1. Deliver pending child-body or math edits into the parent model.
2. Flush the Note session's pending body callback and combine it with host-owned metadata.
3. Await the host's storage write, then report saved or allow navigation.

The [session contract and explicit-save example](/packages/office-note#session-and-save-contract) demonstrate editing, native serialization, awaited storage, and reopening. The example has one simple body. A mounted database item drawer or math editor can hold a draft outside the outer snapshot. Follow [Saving a mounted view](/packages/office-note#saving-a-mounted-view) for the async callback registry and deepest-child-first order.

The default 350 ms pause batches body callbacks. It is not a persistence guarantee. An untouched session emits no change; `flush()` does not force one. `close()` delivers pending data and releases the editor synchronously. It cannot wait for a database write that the host started inside a callback.

Keep the page title, durable page ID, and dirty/save status in your host. Do not present a page as saved merely because the body callback ran. Preserve an unsaved snapshot and an editable session on a failed save so the user can retry. Decide how to order overlapping saves before enabling autosave.

## Connect optional services

- **Assets:** supply `onFile` and return a reference that your rendering layer can resolve. The data-URI fallback embeds file bytes in the document.
- **Page references:** supply the current page list, page identity, and navigation callback. `@` here selects pages, not employees. The host can refuse navigation while a save or nested delivery fails.
- **Layout and style:** choose contextual or always-visible toolbar mode. Follow the [Office styling recipe](office-styling.md), including installed-package CSS scanning. CSS imports alone do not generate the shared control utilities.
- **Workspace:** use the [shared workspace package](/packages/office-workspace) if you need its browser-local catalogue and product navigation. Sharing links, access control, and multi-user synchronization need their own host services.

The [view option table](/packages/office-note#optional-view-integrations) lists the public props. Source-only helpers are not published import paths.

## Choose the export contract

Keep native Note JSON for full product structure and page metadata. Use interchange formats only for their supported subset. The [format table and executable Markdown example](/packages/office-note#native-files-and-interchange) show the public APIs and their limits.

Markdown supports selected prose and LaTeX, but rejects unsupported formatting, product blocks, and ambiguous math boundaries. HTML export is a prose subset. CSV exchange targets a single ordinary table, not a database-backed Note workflow. Catch export errors and offer native JSON; do not silently strip unsupported structure.

Native JSON uses `readNoteFile`. `importNoteExchange` dispatches Markdown/HTML/CSV by filename. The latter uses browser APIs and is not a server-side parser contract.

## Verification boundary

The linked examples are compiled against locally packed public libraries. The documentation audit records source/tests and executed results in [the Note integration audit](https://github.com/barocss/barocss-editor/blob/main/docs/specs/note-documentation-audit.md). This work does not establish an SDK support tier or replace product regression testing.

For complete host wiring, inspect [apps/note](https://github.com/barocss/barocss-editor/tree/main/apps/note). For the suite-level assembly, use [Product integration](office-products.md).
