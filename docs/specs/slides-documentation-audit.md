# Slides integration documentation audit

Issue: [#321](https://github.com/barocss/barocss-editor/issues/321).
Reviewed source: `558714a818ae8f0dcffc8436d8e7e30a66c93442`, main, 2026-09-20.

## Scope

The Slides README owns feature boundaries, coordinate units, host assembly, native persistence, playback rules, and three complete public-import examples. The Docs integration guide connects those sections into a reading path.

This is documentation only. Runtime fixes, SDK support-tier policy #294, extension contract PR #304, and product UI verification #298/#301/#302/#303 remain separate. No package versions or deployment settings change.

## Source and evidence map

Paths are relative to `packages/office-slides` unless qualified.

| Contract | Source | Evidence |
| --- | --- | --- |
| Public entry points and factory | `package.json`, `src/index.ts`, `src/ui.ts`, `src/slides-kit.ts` | Packed public-import examples |
| Starter and definitions | `src/starter-deck.ts`, `src/deck.ts` | `test/template-start.test.ts`, `test/deck.test.ts` |
| Coordinate units and board positions | `src/geometry.ts`, `src/stage.tsx`, `apps/slide/src/app.tsx` | `test/geometry.test.ts`, `test/coordinates.test.ts`, `test/slide-commands.test.ts`; new examples |
| Native file lifecycle | `src/deck-file.ts`, `packages/shared/src/document-file/document-file.ts` | `test/deck-file.test.ts`, new save/reopen example |
| Local library and session | `src/deck-storage.ts`, `src/deck-autosave.ts`, `src/document-library.tsx`, `src/workspace-adapter.ts` | Source review; no new persistent-storage or cloud certification |
| Host/environment | `apps/slide/src/main.tsx`, `apps/slide/src/app.tsx`, `src/renderers.ts`, `src/connector-pass.ts` | Source review; `test/master.test.ts`, `test/connector-pass.test.ts` |
| Playback state and timeline | `src/playback.ts`, `src/timeline.ts`, `src/scroll-show.ts` | `test/playback.test.ts`, `test/timeline.test.ts`, `test/scroll-show.test.ts`; new example |
| Presentation and print | `src/presenter-window.tsx`, `src/print.ts`, `src/print-dialog.tsx` | Source review only; no new actual print, media, or second-window test |

## Findings documented

- An editor factory creates a model session, not the full UI or a cloud product.
- Scene geometry uses twips. Workspace board placement uses unscaled CSS pixels. Board placement is distinct from slide order.
- The format environment uses the shared text key; Slides does not use Word pagination. Connector routing needs its own view pass.
- Active slide, caret, selected objects, and panel state need host coordination.
- Native envelope parsing is narrower than full schema validation. Temporary IDs are not durable references.
- Local named-library storage and document/recovery sessions are different stores. Neither automatically supplies a remote service.
- `deckTitle` reads title-role content; persistence has a separate metadata-first naming policy.
- Playback navigation and stage showing are pure state calculations; the host owns timers/media/windows.
- Browser printing is static output. No public PPTX importer/exporter or PDF-byte API was found in the reviewed exports.
- Existing feature surfaces and focused tests do not close known UI defect/selector issues.

## Verification record

Verified on Node 22.22.0 from `.nvmrc`:

- `pnpm docs:check`: 4 checks and coverage for 31 public packages plus the private release marker passed.
- `pnpm release:npm:prepare`: built/packed 31 libraries locally; no npm publication.
- `pnpm docs:examples`: 37 complete TS/TSX snippets compiled against packed libraries; Office CSS fixture built.
- Focused existing Slides tests: 11 files, 334 tests passed (the test files listed above).
- Browser execution of the three exact extracted README examples passed: native format/version, one awaited write, save failure propagation, slide label/board position after reload, fresh IDs, unchanged geometry, fit scale, forward/back/links-only navigation, and scrub hold state.
- Desktop browser: guide → package save/reopen anchor → guide navigation passed.

- `pnpm preflight`: passed with existing lint/source/test baselines unchanged. This is not a claim that the repository has no recorded type debt.
- `pnpm build:docs`: passed after the final coordinate/enumeration wording update.

Before publication, main advanced to `e8e48e2b` through CI-only PR #307. Its three changed files do not alter the reviewed Slides implementation. The source baseline above remains explicit.

The save example uses an in-memory write callback. Playback and geometry checks calculate state; they do not mount the full Slides editor, run media, or drive a projector. Persistent storage, physical print/PDF output, and popup behavior were not newly tested. No mobile checks were run. Known product/UI test issues remain open.
