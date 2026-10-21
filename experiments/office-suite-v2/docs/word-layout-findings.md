# Word large-layout diagnosis — #527

## Source and ownership

Execute Word Layout uses managed worktree `527-word-layout/barocss-editor`, branch
`codex/527-word-layout`, from parent
`f4ed8eddafdca39290b4d9a7b8ec14eb1405907f` (tree
`b0093963b96cccf62c2595dca09417e8cab0306d`). Verification owns the full-fixture
browser harness and raw observations in #526. Integration owns dependencies and
shared runtime resources. The primary checkout and other candidates are preserved.

## Preserved first failure

The original #526 `verification/reports/word-100-first-failure.json` records
`Actual Word layout did not stabilize within45s`. Its companion baseline record
has no successful samples. The observed document had 800 paragraphs, zero
`.w-sheet` elements and an empty layout map. Native root/surface identity was not
captured in that first attempt. Severe host contention was observed; it does not
establish a cause.

The separate `word-tiny-diagnostic.json` uses 16 paragraphs from the same generator.
It records native admission, model and DOM surface `word:6`, two pages and no
console/page errors. That is a small diagnostic, not the required 100/300 baseline.

## Confirmed completion-order defect

1. `apps/word/src/runtime.ts` registers `createWordLayoutPass`, then calls
   `view.render()` before font loading. Debug `window.wordLayout` is set only by
   the pass's `onLayout` callback.
2. `packages/editor-view-dom/src/editor-view-dom.ts` calls `DOMRenderer.render`
   with an `onComplete` callback that restores pending selection. At the end of
   `render()`, it invokes `_runLayoutPasses()` immediately.
3. `packages/renderer-dom/src/reconcile/reconciler.ts` delegates to
   `reconcileWithFiber`. Its `onComplete` runs after the scheduler finishes.
4. `packages/renderer-dom/src/reconcile/fiber/fiber-scheduler.ts` yields after a
   5 ms normal-priority slice and resumes through idle/frame callbacks. DOM work
   can therefore remain incomplete when `DOMRenderer.render` returns.
5. `createWordLayoutPass` queries current `.w-surface` elements. It can publish an
   empty layout when none exist yet. A second unchanged empty result terminates
   the View's bounded layout loop. The View completion callback currently does
   not request another layout measurement.

Verification independently ran the complete 100-group/800-paragraph fixture on
the exact parent. `verification/reports/word-phase-c-diagnostic.json` records:

| Event | Time from probe start | Observation |
| --- | --- | --- |
| Native admission | 39.6 ms | PASS, no document faults |
| First two layout passes | 102.7 / 129.8 ms | Zero DOM surfaces; empty layout |
| Actual DOM renderer completion | 157.2 ms | Surface `word:6`, 800 paragraphs |
| Normal-path sample | 344.9 ms | Matching model/DOM root `word:1`, zero sheets, empty layout, no later pass |
| One controlled postcommit render | 345 ms | Actual layout receives the surface |
| Diagnostic result | 498.9 ms | 100 pages appeared |

No console, page or layout exception was recorded. The diagnostic render proves
the missing completion followup; it is not product remediation or a performance
sample. The old 45-second failure remains separate. Host load is not used as the
cause. Word native admission, root and surface contracts were valid.
Raw diagnostic SHA-256:
`dd2ed6442339c018b7890904a69617f1794eba385d5d339cdf9b8e40e7e67286`.

## Boundaries and next action

Planner extended the sole #527 lease to
`packages/editor-view-dom/src/editor-view-dom.ts` and
`packages/editor-view-dom/test/layout-waits-for-content.test.ts` after inspecting
this path. Renderer/Fiber source stays read-only. The focused regression drives
the actual View and Fiber scheduler with controlled yielding; it does not copy a
rendering or layout engine. Before-fix results and the final repair are recorded
below when executed.

The repair must measure only completed content, retain the finite three-round
budget across asynchronous completion, retire old/disposed completion and keep
the synchronous path. Word measurement, pagination, geometry, content and
page-count rules remain unchanged. Integration must assess affected shared-view,
renderer, Word and other layout-consuming product checks for this production
delta. An experiment-only justification does not cover it.

The required 100/300 layout/print, exact fonts and performance budget remain open.
No product, release or complete-M0 acceptance is claimed.

## Repair and focused verification

The shared View now waits for the current content renderer's real completion.
Synchronous completion is measured at the existing render tail; asynchronous
completion resumes measurement from its callback. A pending content render stops
the layout loop. The three-round counter spans those callbacks and resets only
for a new external render. Completion is bound to render generation, editor root,
document epoch, view root and disposal. Pending selection retains its own
generation check. An open composition defers layout to the existing
composition-end render path.

Only the shared View source, its new regression and this document change. The
Word runtime, renderer/Fiber scheduler, measurement, pagination, native model,
geometry and print source are unchanged. There is no diagnostic forced render,
all-sync workaround, timeout increase, sample cap or alternate engine.

Commands below use Node 22.22.0 and the one frozen pnpm 8.15.0 dependency graph
linked by Integration into this candidate. Vitest is the existing package
version 1.6.1. Workspace package links resolve to this candidate's source.

| Check | Result |
| --- | --- |
| Before repair: `vitest run test/layout-waits-for-content.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism` | Exit 1; 3 failed, 2 passed. First failure: expected no measurement before completion, received `['UNFINISHED', 'UNFINISHED']`. Successor and dispose checks also failed. This used the unmodified parent View. |
| Initial completion repair, same five tests | Exit 0; 5/5 passed. |
| Expanded root/epoch regression + `test/dom-sync/render-is-not-input.test.ts` + `test/integration/renderer-dom-integration.test.ts` | Exit 0; 20/20 passed. |
| New composition case against the initial repair, selector `-t 'open composition'` | Exit 1; 1 failed, 7 intentionally unselected. A completion-driven pass ran inside the open composition. This led to the bounded composition guard. |
| Final regression + `test/core/composition-boundary.test.ts` + `test/dom-selection-is-not-programmatic.test.ts` | Exit 0; 23/23 passed, including all eight new cases. No skipped tests. |
| `node node_modules/typescript/bin/tsc --noEmit -p packages/editor-view-dom` | Exit 0; zero source diagnostics on the final source. |
| `node scripts/typecheck-tests.mjs editor-view-dom` | Exit 0; existing 104/104 diagnostic budget, not zero diagnostics. No budget file changed. |
| Direct ESLint of the two changed TypeScript files | Exit 1; seven errors and 25 warnings in the inherited View source, zero diagnostics in the new test. First error: inherited unused `info` at line 1189. |
| Same scoped ESLint against exact parent text, using repository `lintEntries` / `compareLint` | Exit 0; parent and candidate both seven errors/25 warnings, zero new/increased or decreased entries. No lint baseline changed. |
| `git diff --check` | PASS before immutable handoff. |

The View test harness logs its existing `Command cancelFragmentDrag not found`
cleanup warning with a bare Editor. It does not represent a passed physical IME
or authenticated Word flow. The controlled asynchronous scheduler test is a
correctness regression, not a timing sample. Integration owns broader impacted
checks; Verification owns genuine corrected 100/300 layout/print measurements.
