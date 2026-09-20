# Site integration documentation audit

Issue: [#327](https://github.com/barocss/barocss-editor/issues/327).
Reviewed source: `9111de74730f0ec3dc240dd807d81eda40ea55d0`, main, 2026-09-20.

## Scope

The English package README owns the implemented capability table, host lifecycle, native file example, HTML/ZIP example and deployment boundaries. The Docs guide links to those canonical sections. Generated package pages are not edited directly.

This change does not modify runtime code, version packages, deploy a site or close product defects. SDK support policy #294 and Site input/save work #299/#325 remain separate.

## Source and evidence map

Paths are relative to `packages/office-site` unless qualified.

| Contract | Source | Evidence |
| --- | --- | --- |
| Public API and factory | `package.json`, `src/index.ts`, `src/ui.ts`, `src/site-kit.ts` | Packed public-import examples |
| Page structure and view | `src/site-schema.ts`, `src/selection.ts`, `src/starter-site.ts`, `src/page-frame.tsx`, `apps/site/src/main.tsx` | Source review, `test/site-file.test.ts`, `test/export.test.ts` |
| Native file format and title | `src/site-file.ts`, shared `documentFileFormat` | `test/site-file.test.ts`, `test/site-info.test.ts`, new round-trip example |
| Local persistence | `src/site-autosave.ts`, `src/workspace-adapter.ts` | Source review; not a new IndexedDB recovery certification |
| Embedded Note lifecycle | `apps/site/src/data-editor.tsx`, `apps/site/src/app.tsx` | Source review; known #299/#325 retained |
| HTML and supporting files | `src/export-html.ts`, `src/publish-commands.ts`, `src/assets.ts` | `test/export.test.ts`, `test/prose-export.test.ts`, `test/site-files.test.ts`, `test/assets.test.ts` |
| Publish status | `src/publishes.ts`, `src/publish-commands.ts` | `test/publishes.test.ts`; record/write ordering inspected in source |
| ZIP bytes | `src/zip.ts` | `test/zip.test.ts`, new output example |
| Forms and live collections | `src/form.ts`, `src/live.ts` | `test/form.test.ts`, `test/live.test.ts`; no external endpoint test |

## Findings

- The editor factory does not mount a complete application. Page surfaces use the Site surface kind; persistent page links are distinct from session IDs.
- A nested Note session must deliver pending writes before Site snapshots. Application `NoteField` is not a public UI export. Existing body editing does not prove that the empty-body path works.
- Native parsing checks the envelope/basic root shape, not arbitrary content against the complete schema.
- Local library and document/draft stores do not provide cloud persistence.
- DOM export uses Site renderers; it is not DOM-free SSR. Direct page arrays differ from command output with supporting files.
- Export media/state/reveal code reads built-in breakpoints. Custom builder width definitions must not be described as fully supported in published output.
- Binary supporting-file contents are base64 strings; ZIP output is a byte array.
- `publishSite` commits its local marker before invoking `write`. A failed callback can leave a marker, and missing `write` does not imply failure. `at` defaults to epoch, while `by` is caller input. A local digest match is not live deployment verification or cryptographic integrity.
- Forms, remote data, external assets and deployment need host services. Exporting a file does not create a public URL.

## Verification record

Verified with Node 22.22.0 from `.nvmrc`:

- `pnpm release:npm:prepare`: 31 libraries built and packed locally; nothing published to npm.
- `pnpm docs:examples`: 36 complete TS/TSX examples compiled against the packed libraries; the Office CSS fixture built.
- Focused existing Site tests: 10 files, 99 tests passed. The files are the ten test files listed in the evidence table above.
- Desktop browser ran all three exact extracted Site README examples: session creation, native title round trip, and HTML/ZIP output. Output was nonempty, the home file was `index.html`, HTML was a complete document, and export preserved the native snapshot.
- Desktop navigation from the Site guide to the package export anchor and back to the guide passed.
- `pnpm build:docs`: passed, including the final wording update.
- `pnpm preflight`: passed with existing lint/source/test baselines unchanged. This does not claim zero repository type debt.
- `pnpm docs:check`: four checks plus coverage of 31 public packages and the private release marker passed.

Full builder interaction, persistent storage recovery, custom-width output, network services and production deployment are outside this documentation check. No mobile viewport checks were run. Existing export unit tests check responsive CSS calculations without resizing a browser.
