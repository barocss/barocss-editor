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

## Print successor #530 — prepared source, browser proof pending

The original View candidate W is preserved at
`522b25bd2477e0dde62c7dbf45271aaf182117e0`. This successor starts from joined
`7d902bc69bf98b0dc6aaf681a24d34c7066703a1`, tree
`300251a4c121e39c4df43690108669035adda08f`, in managed worktree
`530-word-print/barocss-editor`, branch `codex/530-word-print`.

Independent normal-path measurements at that parent produced correct 100/300
layout without forced bootstrap. Print remained a separate failure:

- Each of three fresh 100-page samples added exactly 331,601 CDP DOM nodes.
  Source has 2,514 descendant elements, 800 text nodes and one root:
  `100 * 3315 + 100 page wrappers + 1 container = 331601`.
- Aggregate owned browser RSS reached 1.60–1.63 GB in the print phase. One sample
  already exceeded the 512 MiB product target before printing; print is not the
  only demonstrated memory gate.
- First 300-page print construction returned 537.3 ms, then aggregate RSS
  reached 2,198,929,408 bytes and the 2 GiB guard closed the owned browser. The
  after-print DOM counter and remaining 300-page samples were NOT RUN. The
  source-derived 2,974,801-node / 8.97x projection is a prediction, not an observed
  300/100 growth measurement.
- At 100 pages, cumulative browser layout duration grew from approximately
  0.04–0.05 s to 2.79–3.07 s. The 61–66 ms JavaScript build duration does not
  include all deferred browser layout. JS heap did not show equivalent growth;
  RSS is an aggregate process observation, not proof of a JS heap leak.

The exact source cause is `source.cloneNode(true)` once per sheet. The repair
reads source geometry once and indexes complete paint units into intersecting
page buckets. Source and surface ancestors are shallow copies. Whole paragraphs,
tables and lists are copied only to pages their paint reaches. Descendant bounds
include overflow, and `.w-sheets` furniture is indexed separately from body text.
Static body blocks remain static; geometric spacers retain omitted flow offsets,
so absolute images keep their original section containing block. Furniture keeps
its original position and transforms. Exact computed source width normalizes
ancestor zoom without using rounded `offsetWidth` when a used width is available.
Inherited typography is copied at document/surface boundaries. IDs and SVG/label
references are remapped per print page. A document-long single block can still
repeat on every intersecting page; no universal linear-growth claim is made.

Each printer now owns its own output container. Repeated build/clear/detach and
active-to-inactive cleanup cannot delete another printer's pages. Build failures
restore prepared state through `finally`; partial pages remain detached. Original
source/model/view/selection/layout/pagination/Fiber code is unchanged. No
`print.ts` CSS change was necessary for this prepared projection.

Before repair, the new four projection tests failed 4/4, first because page one
contained unrelated last-page content. Ownership tests failed 4/5: cross-printer
deletion, inactive detach, missing restore after build failure, and the missing
page-local partial-clone path. Those failures are retained as the first ledger.
After the repair, six projection tests, six ownership tests and seven existing
print-CSS tests pass (19 total, zero skipped), using existing Vitest 1.6.1 with one
worker and Node 22.22.0. The extra cases protect fractional width, actual overflow
bounds and SVG paint/label references. Read-only helper review found the rounded
width and focus-switch cleanup risks; the parent addressed both.

Strict compilation of the changed standalone `print-pages.ts` reports zero
diagnostics. `node scripts/typecheck-tests.mjs office-word` passes at the existing
7/7 diagnostic budget; that is not zero diagnostics. A raw package `tsc -p
packages/office-word` attempt fails on inherited unused-symbol diagnostics across
its imported View/renderer source closure, first `DecoratorPosition` in
`decorator-prebuilder.ts`; this attempt is not reported as PASS and no budgets
were changed. Targeted ESLint has no errors/new warnings in the changed code;
the existing browser spec's old `any` warning remains.

The prepared browser spec adds block coordinate equality/locality and native
document/browser-selection/ID/idempotence checks. Actual existing paragraph seam,
table continuations/repeated headers, furniture/header-edit restore, math/zoom
and PDF checks need Integration's serialized exact-candidate runtime lease. They
have not run at this prepared checkpoint. Verification independently owns the
unchanged-budget normal 100/300 timing/CDP-node/RSS remeasurement after source
integration. This source/unit result does not pass performance, PDF or M0.

### First actual P browser attempt and test-only successor

Exact prepared P `c0e27e86f5a8ff0ada2fe221d0046fd375e1e0b6` ran under
Integration's serialized private55261 Stage A lease, Node22.22/pinned Chromium,
one worker, no retry, 30 s per case and stop at first failure. Run27 exited1
after10.9s: real PDF page count, page construction and paragraph seam passed;
the header test failed; four remaining cases were NOT RUN. Raw results and
artifacts remain in primary `.omx/m0/530-word-print-stage-a-*` and
`integration-logs/27-P530-word-print-stage-a.*`.

The first failure was the inherited assertion that every print copy contains
the same total header DOM count. Trace call99 records `[1,1,1,1,1,1,1,0]`.
The shipped sample's first surface has default and first-page header bindings;
its second surface has no header binding (`sample-document.ts:730`). Entire
document copies had made all DOM header counts equal even for pages that showed
different headers. The test-only successor compares preprint SOURCE visible
header text and coordinates per actual sheet with printed visible header text
and coordinates, then checks the same output while editing/restoring a header.
It retains explicit nonempty/different first/default headers and the unbound
second section. This does not change the print implementation or drop the
prepare/restore requirement.

Separately, Vite denied KaTeX font files that resolve to the one frozen
Integration dependency graph outside its default allow list. Integration owns
the external harness correction. The PDF result proves page count on that
attempt only, not qualified font fidelity. No identical rerun or Stage B ran.
The private listener was gone after the Playwright-owned server closed. A fresh
exact-source/config lease is required for the corrected method. M0 remains OPEN.

The test-only followup also records actual KaTeX `FontFace` status and failed
font resource responses per case; it requires a loaded KaTeX face and no errors.
The first real PDF test saves `word-print.pdf` through Playwright's output path
and attaches the actual bytes for independent text/render inspection. Its page
count assertion alone is not called complete PDF fidelity. No print production
source changed in this followup.

### P1 valid-font geometry failure and P2 inheritance repair

P1 `b6a4a05e34dc119593bd008424b742313f94f0e9` ran with the corrected narrow
font allowlist. Run31 exited1 after11.427s: three cases passed (including saved
real PDF and the font gates), the independent header rectangle comparison
failed, and four cases were NOT RUN. Source header height was20.390625px;
printed header height was24px. Text, top, left and width comparisons had reached
the same header. Raw log/results/PDF/trace remain under primary `.omx/m0` with
`31-P1-Word-print-stage-a` / `530-word-print-p1-stage-a` prefixes. The tolerance
was not changed; Stage B did not run. Owned port55261 was closed afterwards.

The copy had frozen `getComputedStyle(...).lineHeight`, a resolved pixel value,
at the ancestor boundary. That discards the distinction between an inherited
unitless multiplier and a fixed length when furniture changes its font size.
P2 reads the native typed computed `line-height` value, preserving `1.5` as a
number and `24px` as a fixed length. It does not infer a ratio from every pixel
value, set a special header height, or change print CSS. An inline-value/resolved
fallback remains for environments without Typed OM; that fallback is not new
cross-browser fidelity evidence. The pinned Chromium browser gate must verify
the actual native computed values and resulting geometry.

The new unitless case failed before the change. The final focused set now passes
21/21 with no skipped tests: eight projections (including relative/fixed
line-height), six ownership and seven print CSS tests. Actual corrected PDF and
geometry checks require a fresh source-bound lease and remain pending here.

### P2 actual result and furniture-oracle followup

Exact P2 `086dfc892f4c38949cd0a971616b434908f998df` ran32 on the valid-font
serialized harness. It exited1 after15.409s with five PASS, one failure and two
NOT RUN. The source-relative header geometry and mid-edit restore now PASS;
so do actual saved PDF page count, paragraph seam and paper CSS. The next old
furniture assertion searched page one's DOM for `A footnote body` and received
null. Retained trace shows source area `notes-1`, top2040px with
`translateY(-100%)`, and the same note/body on printed page two. The native
renderer assigns it through `layout.footnotesByPage`; the fixture does not
declare it a first-page note. Whole-source copies had made the first print page
contain every off-page note in its DOM.

The test-only successor compares preprint SOURCE visible header, footer and
footnote text/type/rectangles per actual sheet with every printed page. It still
requires first-page `Draft` / `1 / ` and the nonempty known footnote body on its
source-assigned page. Any missing or shifted source-visible note fails. It also
extends the existing header case with a small actual fixed24px inherited context
and the same source-rectangle oracle; case count remains eight. This separates
actual browser unitless/fixed geometry from the two stubbed unit-copy cases.
No production source changes after P2. All previous raw failures are preserved;
no Stage B or performance run occurred at these failing checkpoints.

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
