# Selection and history documentation audit

## Scope and status

- Issue: [#341](https://github.com/barocss/barocss-editor/issues/341).
- Code baseline: `eeb0ab67390b2898e85d8aa1e028ce5b6a993ff2`.
- Scope: editor-core README and the Selection/History concept pages.
- Audience: integrators who need to select content, run undo/redo, and diagnose unexpected behavior.
- This is documentation for the audited source, not a new package release or service alpha acceptance.
- Documentation preparation: ready for PR review after the checks below. External publication: incomplete until approved merge and deployment verification.
- IME, native keyboard, remote collaboration, server persistence, and a named service release candidate: unverified in this task.

## Source evidence

| Contract | Implementation and tests |
| --- | --- |
| Selection kinds, object sets | `packages/shared/src/selection.ts`; `packages/editor-core/test/multi-node-selection.test.ts` |
| Model selection entry point, target validation, hooks | `packages/editor-core/src/editor.ts` (`updateSelection`, `setRange`); `test/editor-selection-integration.test.ts` |
| Live toolbar answers | `packages/editor-core/src/selection-summary.ts`; `test/selection-summary.test.ts` |
| Transaction selection and recording options | `packages/model/src/transaction.ts`, `transaction-dsl.ts`; `packages/editor-core/test/undo-redo-history.test.ts` |
| Active undo/redo methods | `packages/editor-core/src/editor.ts` prototype methods at the end of the file; `test/editor-history.test.ts` |
| Text coalescing, explicit group boundary, capacity | `packages/editor-core/src/history-manager.ts`; `test/history-coalescing.test.ts`, `test/history-manager.test.ts` |
| DOM navigation boundary | `packages/editor-view-dom/src/event-handlers/input-handler.ts` (`handleKeyDown`) |

The earlier undo/redo class bodies in `editor.ts` are replaced by prototype methods.
The guide describes those active methods. It does not describe the legacy snapshot
array as the transaction history used by `editor.undo()`.

## Corrected documentation

1. Removed the unsupported `TransactionOptions.selection` example.
2. Replaced a universal nearest-caret remapping promise with operation-specific behavior and dangling-selection clearing.
3. Added whole-node sets and mixed-format selection summaries.
4. Added `type: 'range'` to `setRange` calls. The method forwards its input; it does not infer the type.
5. Distinguished automatic typing groups from manual compression and from explicit deletion operations.
6. Explained recording, view synchronization, and selection-snapshot options separately.
7. Explained that `loadDocument()` does not reset transaction history and that exporting content does not persist undo.
8. Added failure handling: post-commit errors must not cause a duplicate edit; replay failure is not a guarantee of an unchanged history index.
9. Added complete public-import examples to the README and linked the concept pages to them.

## Verification

- Node `22.22.0`, as specified by `.nvmrc`.
- Focused core suite: 9 files, 132 tests passed, 10 existing skipped tests. No skipped test was counted as a pass.
- Packed consumer check: 36 complete TypeScript/TSX examples against 31 local package archives. The final selection examples were recompiled after the browser correction.
- Desktop browser executed the exact two new README snippets: text range, caret, whole-node selection, summary/clear, two independent edits, undo twice, selection restoration, redo, branch pruning, and clearing history without clearing content.
- `pnpm preflight`: passed under the existing lint/source/test-type baselines (41 source projects checked, 3 known-broken). No baseline was raised.
- `pnpm docs:check`: 4 tests passed; 31 public packages and the private marker covered.
- `pnpm build:docs`: passed, with existing bundle-size/Browserslist/update-check notices.
- Desktop navigation: History → README history anchor → Selection → README selection anchor → History. All destinations rendered.
- No mobile viewport tests. No new runtime implementation.

## Limits and next owner

The public `EditorOptions.history` type exposes `maxSize`; the standalone history
manager additionally accepts `coalesceMs`. The guide does not use a cast to
advertise the latter as a supported editor option.

Replay moves the history index before applying operations; the current editor
wrapper does not restore it on failure. This is an implementation-owner follow-up,
not a defect fixed by this documentation PR or a new alpha release requirement.
The PM should route prioritization through existing tracking after a duplicate check.

Technical Writer owns documentation corrections and alignment with the eventual
release candidate. The implementation owner owns runtime behavior. Product Master
PM owns release scope; existing [#322](https://github.com/barocss/barocss-editor/issues/322)
remains the technical release tracker. External site publication is not verified by
local browser results.

## Upstream check

Before publication, main advanced to `0d97e1f00948aafd27bd6bdf4ac2b9a2f9f51e60` via Note scenario PR #283. Its changed runtime files do not alter the audited core history or selection APIs. The examples and checks above used the exact baseline stated at the top. The new PR CI remains the integration gate.

On 2026-09-23, this documentation was integrated with `origin/main`
`41df1b8618d395d998de4402dee67760fdd564fa`. The audited editor,
history, selection, transaction, and DOM input implementation files have not
changed since the baseline above. The merge retains the extension guide in the
editor-core README and both documentation entries in the roadmap.

Replay-failure repair PR #354 is still separate at head
`d9f73ad892a41ccd3f5f5443938f5d732f3da266`. The failure wording here and
in the History page describes the current main behavior. Coordinate a wording
update with #354 integration and verify the exact integrated implementation;
the older wording must not be presented as the repaired contract.
