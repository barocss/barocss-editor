# Note integration documentation audit

Issue: [#312](https://github.com/barocss/barocss-editor/issues/312).
Reviewed source: `558714a818ae8f0dcffc8436d8e7e30a66c93442`, main, 2026-09-20.

## Scope

The package README owns the implementation inventory, save/session contract, optional view integrations, native files, interchange restrictions, and complete public-import examples. The public `guides/note-integration` page connects those sections into a host integration flow. It links to the README instead of copying its API examples.

No runtime changes, package version changes, automatic merge/deployment, or SDK support-tier promises are included. Extension replacement rules in #285/#304 and schema policy work in #308/#309 remain separate. Open Note fix PRs are not represented as part of the reviewed source.

## Evidence map

| Documented surface | Source evidence | Relevant existing tests |
| --- | --- | --- |
| Public paths and exported names | `packages/office-note/package.json`, `src/index.ts` | Packed documentation consumer compilation |
| Sessions, body snapshots, flush/close, namespaces | `src/session.ts` | `test/session.test.ts` |
| Native document/page identity | `src/note-file.ts`, `src/note-schema.ts` | `test/note-file.test.ts` |
| Exchange selection, errors, math boundaries | `src/note-exchange.ts`, `src/markdown-math.ts` | `test/note-exchange.test.ts` |
| View integration props and nested delivery | `src/note-view.tsx`, `src/database-item-body.tsx` | Source review; reference host `apps/note` |
| Page query and navigation | `src/page-reference-ui.tsx` | `test/page-reference-ui.test.ts` |
| Prose and kit inventory | `src/note-schema.ts`, `src/note-kit.ts`, `src/toolbar-model.ts`, `packages/office-text/src/body-blocks.ts` | Existing writing/formatting tests; not all rerun for this document |
| Columns | `packages/office-text/src/columns.ts` | `test/columns.test.ts` |
| Database advanced behavior | `src/database.ts` | `test/database-advanced.test.ts` |
| Math persistence | `packages/office-text/src/latex.ts`, `src/note-view.tsx` | `test/latex.test.ts` |

Paths without the `packages/` prefix are relative to `packages/office-note`. Evidence references identify the inspected implementation and test coverage, not a claim that all product/browser scenarios passed.

## Review findings

- `NoteOptions` is accepted through `openNoteTree`/`openNote` but is not a root type export. Documentation does not invent an import for it.
- `readNoteCSV` is source-exported but not exported from the public package root. Document the public exchange function instead.
- `onChange` sends body blocks only. Root title/page identity must remain in host state.
- `flush`/`close` synchronously deliver callbacks; async persistence remains the host's responsibility.
- Pending nested body/math delivery must happen before the parent snapshot.
- A node-ID session prefix is not a semantic anchor guarantee after structural edits.
- `importNoteExchange` does not accept native JSON even though one error message names Note JSON. Use `readNoteFile` for native input.
- Markdown/HTML/CSV export is not a complete-product backup. The guide explicitly describes rejection and preservation limits.

## Verification record

- Node 22.22.0: `pnpm preflight` passed under the existing lint/source/test type baselines. No baseline increases.
- `pnpm build:docs` passed, including documentation generation and static links.
- `pnpm docs:examples` compiled 36 complete TypeScript/TSX snippets against 31 locally packed packages and built the Office styling fixture.
- Seven focused Note test files passed: 69 tests for sessions, native files, interchange, page references, columns, advanced databases, and math persistence.
- The two new README snippets executed in a browser using those packed libraries. The save example delivered once, awaited one write, preserved title/page ID, reopened the edited text without temporary IDs, and rejected a failing host write. The Markdown example preserved its supported prose/math body.
- Browser navigation passed from the new guide to the README save-contract anchor and back. The guide appeared in the Office integration sidebar. No mobile viewport checks.

These results do not certify every Note interaction, all interchange combinations, or cloud persistence. The verification harness used an in-memory storage callback, not a backend.
