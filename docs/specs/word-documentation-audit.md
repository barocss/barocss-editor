# Word integration documentation audit

Issue: [#318](https://github.com/barocss/barocss-editor/issues/318).
Reviewed source: `558714a818ae8f0dcffc8436d8e7e30a66c93442`, main, 2026-09-20.

## Scope

The Word README is the source of truth for the feature inventory, document/display contracts, native-file lifecycle, DOCX limits, and two complete public-import examples. The public `guides/word-integration` page links those sections into an integration sequence.

This is documentation only. It does not alter the model, rendering, file formats, package versions, or release policy. Extension replacement rules in #285/#304 and the SDK support-tier proposal #294 remain separate. It does not close Word UI scenario issues #300/#303.

## Evidence map

Paths below are relative to `packages/office-word` unless stated otherwise.

| Contract | Source | Behavioral evidence |
| --- | --- | --- |
| Public package surfaces | `src/index.ts`, `src/ui.ts`, `package.json` | Packed public-import example compilation |
| Factory and starter document | `src/word-kit.ts`, `src/starter-document.ts` | `test/word-file.test.ts` and new native-file example |
| Native format and temporary identity | `src/word-file.ts`, `packages/shared/src/document-file/document-file.ts` | `test/word-file.test.ts` |
| Local library / section count | `src/word-library.ts` | `test/word-file.test.ts` |
| Layout environment and revision | `src/render-context.ts`, `src/word-layout-pass.ts`, `src/measurement.ts` | `test/render-context.test.ts`, `test/pagination.test.ts` |
| Font and print integration | `src/font-loader.ts`, `src/print-pages.ts`, `src/print.ts` | `test/print.test.ts`; host assembly review |
| DOCX body, formatting, tables, rejection | `src/word-docx.ts`, `src/word-docx-import.ts` | `test/word-docx.test.ts`, `test/word-docx-import.test.ts` |
| DOCX styles and references | `src/word-docx-references.ts`, `src/word-docx-import.ts` | `test/word-docx-styles.test.ts`, `test/word-docx-references.test.ts` |
| Math entry boundary | `src/ui.ts`, `src/ribbon.tsx`, `src/math-editor-dialog.tsx`, `src/math-inplace.tsx` | Source review; no new full math UI certification |
| Complete host assembly | `apps/word/src/main.tsx`, `apps/word/src/app.tsx`, `apps/word/src/docx-import.tsx` | Source review; new guide browser links, not a full host regression run |

The inventory also uses the exported command and UI declarations. An export or existing test name is evidence of a surface, not proof of full Microsoft Word compatibility.

## Findings reflected in the documents

- Word's factory is a model session. A DOM view, page layout, widgets, and controls need separate assembly.
- A flow surface is a section; it is not a rendered sheet. Geometry uses format-specific units and must not be rewritten for viewport zoom.
- Reopening changes the root ID; a document access object should read it dynamically.
- A content revision is needed even for updates that leave pagination unchanged.
- Native file parsing checks an envelope/basic shape. It does not provide full schema or security validation.
- DOCX import/export return warnings and preserve only a bounded subset. Baseline warnings are always present, and not every unsupported attribute has its own warning.
- The importer has size/XML/relationship checks and rejects vertical merges/nested tables. It is not a universal Office-file scanner.
- Print helpers operate on measured DOM sheets. They do not return PDF bytes.
- `WordMathEditor` is public from `/ui`; the in-place hook is internal and is wired by the public ribbon.

## Verification record

Verified on Node 22.22.0 from `.nvmrc`:

- `pnpm preflight`: passed, with existing source/test baselines unchanged.
- `pnpm release:npm:prepare`: built and packed 31 libraries; no publish.
- `pnpm docs:examples`: compiled 36 complete TS/TSX snippets against packed libraries and built the Office CSS fixture.
- `pnpm docs:check`: passed (4 checks; coverage for 31 public packages and the private release marker).
- `pnpm build:docs`: passed.
- Focused Word tests: 8 files, 87 tests passed (`word-file`, `word-docx`, `word-docx-import`, `word-docx-styles`, `word-docx-references`, `pagination`, `render-context`, `print`).
- Browser execution of the exact two extracted README examples: native format version 1, one awaited write, restored text, and no serialized temporary IDs. A rejected host write propagated the error. DOCX export returned bytes without mutating the source; import restored a document root; both warning arrays were present.
- Desktop browser navigation: Word guide → complete native-file example on the package page → Word guide. Both pages rendered and the package anchor resolved.

The browser harness used an in-memory host write callback. It did not test durable storage, a complete Word editing UI, or printed output. No mobile viewport checks were run. Issues #300/#303 remain open.
