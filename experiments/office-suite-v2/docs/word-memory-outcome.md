---
work_id: office-v2-m0/word100-memory-outcome-v1
artifact_type: implementation_evidence
status: done
owner_role: Execute Word Layout
source_request: Planner actual user item 01a163cc-9d96-7be3-89cc-240864c124bb
last_updated: 2026-10-22
---

# Word100 memory outcome

The bounded Word100 outcome is verified on local integrated source `36b0fa98447d1f1b43c42066c88ec975f96f6c93`, production-equivalent to author `174595dd`. One unchanged normal H7 window passes all six samples: Word100 **494.59375 /491.1875 /459.65625 MiB**, Word300 **804.296875 /807.859375 /804.015625 MiB**. All original timing/font/repeatability/node-growth/guard criteria pass. Final evidence and limits are recorded at the end. Historical first failures below remain intact.

Parent #521; outcome #537. The human delegated cause analysis, justified structural repair and unchanged Word100 memory qualification as one outcome. Existing user screens, five servers, native data, planning WIP and all earlier Word/Renderer failures remain preserved. No push, deployment, schedule or model changes.

## Starting source and preserved evidence

- New managed author root: `/Users/user/.codex/worktrees/word100-memory-outcome/barocss-editor`, branch `codex/537-word100-memory`, exact base `cd384423c4fd3503a95031f7f0fc229f7d68743f`.
- Production is equivalent to measured `760bb716bdd35b23ca28159b0b909e7cf43f9098`. Historical author roots and RED `95d68158` remain unchanged.
- Latest normal H7 raw: primary `.omx/m0/word-runtime-normal-final/report.json`, SHA256 `efc93e3d5484f8ee225612aeb084644f08a5e93d78af824a22bfa634a9b85f1a`. Integration's original raw remains in its immutable-source worktree.
- Word100 maximum sampled owned aggregate RSS: `581976064 / 529956864 / 552681472` bytes. Two of three exceed `536870912`. Word300 `800309248 / 744669184 / 794951680` are below `1073741824`; original timing and printed-node-growth gates pass. All six samples completed, but runner success is not memory acceptance.
- RSS is a 200ms sampled sum of the owned browser process tree, including shared pages. It is not private bytes, physical RAM or continuous high-water mark. Existing source improvements and historical window differences do not establish RSS causation.

## Read-only initial decomposition

The first Word100 sample peaks at 555.016 MiB during a print-labelled poll. Its root process contributes 81.344 MiB; three children contribute about 56.469, 65.828 and 351.375 MiB. The last child grows from about 162.6 MiB in module navigation to 294 MiB during cold open. Its role must be verified from actual browser process metadata; PID order is not a role contract.

Word100 samples one and two peak in the warm-completion-labelled interval, with the largest child near 303.5 and 325.1 MiB. A 200ms label is not exact phase attribution, and some short phases have no poll.

CDP counters are much smaller than aggregate RSS: before document open JS used is about 21 MB, after open about 38 MB, and after print about 58 MB. Actual native node counts are 3356 after open and 7857 after print. These counters do not explain the entire native/process footprint.

## Concrete source leads and exclusions

1. `createFiberTree` recursively deep-copies every child subtree, then repeats the same operation at each descendant. For a strict tagged tree the copy count is the sum of node depths. Fibers retain independent nested VNode copies in the current generation. This is separate from already repaired alternate-history retention. A deterministic actual-function regression and linear owned-copy implementation are assigned to the renderer helper under this outcome.
2. `assertWordNativeDocument` executes before mount and creates a temporary validation editor, normalized/exported/reconciled native trees and canonical copies. Separate this allocation boundary from actual mount/layout in the diagnostic. A temporary allocation is not a leak.
3. `measureBlocks` rereads shared ancestor transforms for each body block and each layout round. Measure actual call counts before deciding whether a bounded per-call scalar memo is useful. Do not skip measurement on document revision alone: fonts, width, zoom and display can change without a model edit.
4. Direct H7 runtime mounting bypasses React/StrictMode. Its plain-text fixture has no named web-font requests, math or table content. Print snapshot construction starts at print build, not cold mount. No duplicated print registration or accumulated print stylesheet was established.

## Diagnostic and acceptance separation

Integration owns frozen dependencies, private browser/profile/runtime resources and the unchanged H7 harness. A finite source-bound diagnostic is requested for phase/PID-role RSS, JS allocation sampling without forced GC, native counters and an actual committed Fiber/VNode identity census. Diagnostic profiles and instrumentation cannot be relabeled as normal budget qualification.

The author runs meaningful changed-area checks. Integration qualifies the final immutable candidate with the required combined checks and original H7 three fresh Word100 and three Word300 samples. Keep fixture, fonts, media, no-GC policy, timing targets, node growth, 512 MiB/1 GiB limits and first failures unchanged. Do not repeat unchanged source until it passes.

## First actual diagnostic: process and current-generation ownership

Integration completed one 100-page diagnostic on immutable `cd384423`, using the normal native fixture with separately instrumented observation boundaries. Raw primary `.omx/m0/word100-diagnostic-v1/report.json`: 707069 bytes, SHA256 `b8a2662dfda3be83589bcb2bbc39a56fec950aa223cbd9a0bfcd8b7ed2b15e9a`. Browser and private port were closed. All 1208 recorded source entries were unchanged before/after.

Actual `SystemInfo` role mappings identify renderer PID22578 as the growing child. Browser20843 stays near 82–83 MiB, GPU22176 near 43–52.5 MiB and network22183 near 59.7 MiB. Renderer RSS is about 169 MiB after module navigation, 184 MiB after admission, 317 MiB after mount return, 318 MiB cold-stable, 320 MiB warm-stable and 327 MiB after print. Diagnostic pauses and allocation sampling affect timing/GC opportunities; these observations are not a normal H7 acceptance run or a causal comparison to earlier RSS windows.

The actual committed tree has **3315 Fibers and 14840 distinct tagged VNodes** at both cold and warm stable boundaries, maximum depth five and zero alternate links. This demonstrates current-generation subtree multiplicity in the real document; it does not demonstrate previous-generation leakage.

32 KiB statistical JS allocation sampling, including collected objects, estimates cumulative sampled allocation near 21.49 MB after admission, 100.66 MB after mount, 132.02 MB warm and 134.40 MB print. The named `deepCopyVNode` frames account for about 4.10 MB cold and 6.49 MB cumulative warm. These are sampling estimates of allocated work, not exact live/retained bytes or an RSS equation. Other large sampled paths include style resolution's `Object.entries`, iterators and DSL `_makeContext`; they are separate from this initial renderer repair. Native/process RSS remains larger than the available JS counters explain.

Actual module responses include 630 JavaScript responses totaling 16721310 transformed bytes including source maps. The UI barrel imports lucide-react (~1.62 MB), KaTeX (~489 KB), Math React (~194 KB), Radix and other UI modules for a direct runtime that never mounts their React components. Module allocation sampling starts after navigation, so it cannot assign native baseline bytes to these imports. The concrete source boundary is `runtime.ts → office-word/ui → dialogs/ribbon/React UI`; `jumpToWordBookmark` itself needs only bookmark selection and DOM navigation. Its function can move to a UI-free module while preserving the existing dialog/UI exports and behavior.

## Renderer repair and focused evidence

The regression calls actual `createFiberTree`, counts reachable current Fiber/VNode identities and checks source isolation. Baseline chain10 has 55 VNodes and branching15 has 49; the first actual run has four failed assertions. The raw log also preserves an earlier CLI flag failure: this renderer package resolves Vitest4, which does not support the inherited `--minWorkers` flag. That CLI failure is not a product reproduction.

The repair preserves the public root VNode identity, clones each direct child subtree once and consumes that owned subtree during internal recursion. Mutable attributes/style/meta/children remain isolated from caller input; external props/model/DOM references keep their original sharing contract. Anonymous fragments and text VNodes are included. Current counts become chain19 and branching29, with parent VNode children and child Fibers sharing the same owned nodes below the root.

Focused actual renderer checks: 75 PASS and one existing SKIP. New allocation/ownership cases and existing tree, retention, portal, cancellation, primitive-text, mark-wrapper and template-chrome cases are included. Renderer source types pass; test type debt remains 123/123 with no owned-test diagnostics. Scoped lint reports zero errors and one pre-existing `any` warning. These checks do not replace actual Word geometry, native selection, print or normal RSS qualification.

First failure log primary `.omx/m0/537-renderer-allocation-red.log`, SHA256 `9402027bc2f66b3ae55366aae0dac04896c358f11deb594cb192838135ac1381`. Source SHA256 `90c159f8fb0128878c3e4e3c7b504af11f06526a22d4c6d4e895580737cac676`; new test SHA256 `223e3afd6be63f25401666c4da418dab4fd83650bbac3535c05b3ca59cc7acc7`.

Renderer commands use `/Users/user/.nvm/versions/node/v22.22.0/bin/node` (Node22.22.0), actual package Vitest4.0.18. In `packages/renderer-dom`:

```sh
node node_modules/vitest/vitest.mjs run test/core/fiber-vnode-allocation.test.ts test/core/fiber-create-fiber-tree.test.ts test/core/fiber-tree.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run test/core/m0-fiber-retention.test.ts test/core/m0-portal-lifecycle.test.ts test/core/fiber-reconcile-edge-cases.test.ts test/core/fiber-reconcile-deep-nested-complex.test.ts test/core/fiber-process-primitive-text.test.ts test/core/fiber-create-fiber-tree-mark-wrapper.test.ts test/template-chrome-identity.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json
```

From the author root:

```sh
node scripts/typecheck-tests.mjs renderer-dom
node node_modules/eslint/bin/eslint.js packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts packages/renderer-dom/test/core/fiber-vnode-allocation.test.ts
```

All five commands exit zero. The two test invocations are disjoint 23 PASS and 52 PASS/one existing SKIP. Successful outputs were tool outputs, not separately saved raw files; only the first RED has the separately retained log above. No fresh whole-renderer suite, browser or RSS claim follows from these commands.

## UI-free runtime navigation repair

Move `jumpToWordBookmark` unchanged into `bookmark-navigation.ts`, export it from the existing root entry and retain its dialog/UI export. Runtime uses its existing root import instead of `/ui`. The actual Word app still imports and renders its UI normally; no command, dialog, renderer, native type, schema, font or math feature is removed or deferred. No package/export-map/build metadata changes are needed.

New navigation tests use a real Editor, real EditorViewDOM and DOM targets, with controlled scroll observation. They cover bookmark navigation, focus→selection→scroll ordering, same-name caption identity, missing/unsupported target refusal without focus/selection changes, and native document preservation. These are bounded JSDOM checks, not genuine browser selection proof.

Using Node22.22.0 and actual office-word package Vitest1.6.1, cwd `packages/office-word`:

```sh
node node_modules/vitest/vitest.mjs run test/bookmark-commands.test.ts test/caption-reference.test.ts test/caption-commands.test.ts --maxWorkers 1 --minWorkers 1 --no-file-parallelism
node node_modules/vitest/vitest.mjs run test/bookmark-navigation.test.ts --maxWorkers 1 --minWorkers 1 --no-file-parallelism
```

Existing consumers: 10 PASS across three files. Final strengthened navigation test: four PASS. An earlier command also named the not-yet-created test path after a shell write-path mistake; Vitest ran the three existing files and no product assertion failed. The first navigation test passed before two assertions were strengthened; only that changed file was rerun. Do not count it twice.

Scoped ESLint on the five files: zero errors. Runtime's two pre-existing `any` warnings match HEAD; the other four files have no warnings. A TypeScript API `createProgram` uses existing `packages/office-word/tsconfig.typecheck.json`, no emit/incremental state, the five changed roots and syntax/semantic diagnostics requested only for those changed SourceFiles. Each changed file and options/config have zero diagnostics. After strengthening only the test, its type/lint checks were repeated and passed. Dependent-file diagnostics are excluded from this scoped check; this is not a whole-package/root type PASS. Integration owns the required complete candidate checks.

Final new module SHA256 `9d8a79fffbaaf90cbf1c9e5fbfdb4bf426f93f1e763906d6a70233d4f8732592`; final navigation test SHA256 `bbddae6cddbd171dba6d7cd7d04fa6dc0378c199d4123fd03563951cf68bf35e`.

## Candidate diagnostic and mixed-text qualification failure

Immutable first candidate `4961f4c1474f064c7210d4990d573843dfda5919` has eight paths and clean source. Integration's one native-bucket diagnostic binds 1209 sources and 654 aliases. Actual 3315 Fibers now retain **6629** distinct tagged VNodes at cold and warm completion, versus 14840 in the previous diagnostic. Actual JavaScript responses are 490 /11110950 transformed bytes versus 630 /16721310. These demonstrate the intended structural and import-closure changes; diagnostic RSS is not a normal comparison.

Three explicit native dumps use `deterministic:false` without forced GC. Assessment primary `.omx/m0/word100-native-buckets-v1/assessment.json`, SHA256 `981b3461950df0a5395a853cd1556180304e57146bd5af16674096f647112089`; trace 151759456 bytes SHA256 `db28f8cb4bde7c5dceb91f29ce786da785acc6d9167889e882da91d2049bf812`. The diagnostic adds a tracing service and allocates trace data. Its aggregate RSS must not be compared to H7 or used for budget acceptance. Native counters show BlinkGC committed capacity/free pools after allocation churn; buckets overlap and must not be summed into an RSS equation. No retained-JS-leak or single product source of the full native footprint is established.

Independent review identified a changed-reference risk: primitive text placement reads parent `children[].meta.domElement`, now connected to the actual child Fiber. Existing weak tests checked text existence rather than exact mixed order. A new actual Reconciler/scheduler/commit test on 4961 has two FAIL: ordinary mixed mount is correct, but update yields `[text:updated,a:A2,b:B2]` instead of `[a:A2,text:updated,b:B2]`; fragment mount yields `[a:A,text:tail,b:B,c:C]` instead of `[a:A,b:B,text:tail,c:C]`. Element identities, source descendant immutability and completion/root preconditions pass. Later stages are NOT RUN after those assertions. Raw primary `.omx/m0/537-mixed-text-test.log` is preserved.

Integration performed one actual baseline comparison on exact `cd384423`, copying only the same new observer test (SHA256 `9eb630f75bdd3c6f715a6999a616fb5e4c9449470c08a98dddc8415316f64511`). Both baseline tests fail earlier: ordinary mount is `[text:middle,a:A,b:B]`, fragment mount is `[text:tail,a:A,b:B,c:C]`. Original update/reorder are NOT REACHED, so their exact failures cannot be relabeled as pre-existing or resolved. Baseline result primary `.omx/m0/word100-mixed-commit-baseline.json`, SHA256 `ce205521a41a86fd28e3e084aece4ff23e10405818aa755b0047ccc5d08ad549`; all 1208 original bound files remain unchanged.

Source trace shows the concrete mismatch: element commit can move around deferred primitive text, but primitive handling treats the final logical ordinal as a current DOM index. A fragment is also counted as one host although it expands to multiple direct nodes. The affected path needs actual DOM anchors, expanded fragments and protected Text VNodes rather than an ambiguous ordinal. Normal H7 qualification is held until this source correction and meaningful regressions complete; successful earlier native diagnostics and atomic preflight stages retain their exact source binding.

## Affected primitive/fragment ordering correction

An initial anchor-only implementation made ordinary mount/update/reorder pass and exposed a second failure: a virtual fragment's stale-child sweep removed its sibling C from the shared host. Deferring only its text was insufficient because following siblings had not finished moving. These intermediate failures remain in the appended RED transcript; no assertion was weakened.

The final correction processes literal output once the nearest concrete owning host (or root fragment) has committed all children. It flattens only virtual fragments into ordered concrete-node/literal jobs, excludes portals, protects actual Text VNode identities and uses the following actual DOM node as the insertion anchor. Nested fragments sharing the ancestor's host defer both literal placement and stale-child sweeping to that complete owner. A root fragment still owns its container cleanup. All job arrays/sets are call-local; no global retained graph, cross-render cache or new Fiber field is added. The linear VNode-copy implementation and UI-free navigation remain byte-identical to 4961.

Seven new actual commit cases now pass: ordinary mixed mount/update/reorder; fragment mount/update/reorder/deletion with sibling identity; adjacent primitives; protected tagged Text VNode identity; nested fragment literals; prefix before literal-only/duplicate-value fragments; root fragment stale cleanup. The final affected nine-file run is **63 PASS including these seven**, not 70. Source TypeScript exits zero. Existing renderer test type debt remains 123/123.

Scoped ESLint exits one: current has one inherited unused `findOrCreateHost` import error and 20 existing `any` warnings. Actual HEAD source checked via ESLint stdin has two unused errors (including the old unused `deps` parameter) and the same 20 warnings. Current has no added lint diagnostic; the scoped command is not labeled PASS and no unrelated cleanup or budget suppression is applied. Integration must apply the unchanged repository guard.

Final correction source SHA256 `fbd67337fcc429eb4d3e5d25a7609a6b4369fe1ce779479a754bc3a4728c874c`; new commit test SHA256 `dd522c3e6df7bb8e8ad6cd7aa88bd401437c646f45e5c50cd620f0f34ccc2d68`. Raw transcripts are primary `.omx/m0/537-mixed-text-{test,green}.log` and the source/test-type/lint/baseline-lint receipts retained beside them.

Integration's literal `pnpm preflight` on immutable 4961 exits zero after 459.278 seconds, Node22.22/pnpm8.15. Record `.omx/m0/integration-logs/word100-candidate-preflight.json`, SHA256 `f8119e0599d7655b333ae1ddb1a5e1b3d722a884794b11373184cddec894de79`; complete ledger `.omx/m0/word100-candidate-preflight-ledger.json`. Original source targets/known-broken rows and 41 test-budget rows (1251 total allowed diagnostics, renderer123/Word7) remain unchanged. This run is bound to 4961; the correction needs affected checks, not a relabeled full preflight or per-edit repetition.

Final correction commands use the same Node22.22 binary and renderer package Vitest4.0.18. In `packages/renderer-dom`:

```sh
node node_modules/vitest/vitest.mjs run test/core/fiber-vnode-commit-ownership.test.ts test/core/fiber-vnode-allocation.test.ts test/core/fiber-process-primitive-text.test.ts test/core/fiber-process-primitive-text-mark-wrapper.test.ts test/core/process-primitive-text-mark-wrapper-structure.test.ts test/core/m0-portal-lifecycle.test.ts test/core/m0-fiber-retention.test.ts test/core/fiber-reconcile-edge-cases.test.ts test/core/foreign-node-cleanup.test.ts --maxWorkers=1 --no-file-parallelism
node node_modules/typescript/bin/tsc --noEmit --project tsconfig.json
```

From the author root:

```sh
node scripts/typecheck-tests.mjs renderer-dom
node node_modules/eslint/bin/eslint.js packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts packages/renderer-dom/test/core/fiber-vnode-commit-ownership.test.ts
git show HEAD:packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts | node node_modules/eslint/bin/eslint.js --stdin --stdin-filename packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts
```

The first three commands exit zero; both scoped lint commands exit one with the baseline/current diagnostics described above. In that last baseline command HEAD was immutable 4961. The intermediate fragment-literal timing failure is retained in helper tool output `0578fe`, not a separate raw file; the other first failures are appended to `537-mixed-text-test.log`.

## Genuine browser navigation reconciliation

Integration's first expanded browser run on production-equivalent guard successor `7a956c3df424e4d8cad7f773148faf17df10dccc` stops before feature interaction: `bookmarks.spec.ts` waits for a reference Ribbon tab that is hidden by the unchanged compact default UI. Actual results are zero PASS, one FAIL and 18 NOT RUN, retry zero/maxFailures one. Primary `.omx/m0/word100-candidate-browser/` retains the result, screenshot/error context and trace. This is test navigation drift, not proof of a product failure or permission to remove feature assertions.

Only `apps/word/tests/bookmarks.spec.ts` and `caption-reference.spec.ts` change: their reference-opening helpers call the existing `setWordWholeTools(page)`. It opens the visible document-panel menu, selects the actual whole-tools checkbox and asserts the retained tool group visible before the original reference tab/button clicks. No JavaScript exposes a hidden Ribbon. All five test bodies retain their original source/reference/rename/delete/Undo/save/reload/focus/native-selection/mouse/Enter assertions. Production source, fixture, layout and H7 are unchanged.

Changed-file-only TypeScript diagnostics and options/config are zero using the existing app typecheck configuration; dependent diagnostics are excluded from this scoped claim. Scoped ESLint has zero errors; bookmarks' three and caption-reference's five existing warnings match HEAD. Browser execution remains Integration-owned. An initial shell heredoc write failed with no space left on device before either spec changed; a later minimal apply_patch succeeded after read-only free-space inspection. No unrelated file, trace, cache, user data or process was deleted.

Integration separately ran the previously NOT RUN original 14 print browser cases once: all14 PASS, zero skipped/unexpected/flaky and no runner errors (`word100-candidate-print-browser/results.json`). The five bookmark/caption cases remain pending until the genuine test-navigation delta is applied; do not rerun the passed print set merely for this test-only change.

The next feature run on integrated test successor `64885376` reaches and passes real rename/delete/reference-missing assertions, then stops at another obsolete assumption: the Home tab after closing the dialog is hidden again. Result primary `.omx/m0/word100-feature-browser-v1/results.json`: zero completed PASS, one FAIL, four NOT RUN. These partial assertions are not promoted to a completed test PASS. The parent missed this subsequent navigation when reviewing the first helper change; its first failure remains intact.

Audit of all four tab call sites in both specs adds the same genuine menu helper before the remaining Home navigation and the caption test's later direct Reference tab after selecting its image. Every tab navigation now opens the actual retained tool surface immediately beforehand. Only two lines change; all feature assertions remain intact. Scoped lint exits zero with the same eight existing warnings, and diff check passes. Product source and previous print/native evidence are unchanged. Integration may collect the first failure of each of the five distinct feature cases with one worker, zero retries and maxFailures five; any failure still holds H7, whose original resource/time first-failure STOP is unchanged.

## Final source-bound qualification and independent review

Integration applies only the verified one-error lint baseline decrease after author174595, then the two test-navigation deltas. Final measured HEAD `36b0fa98447d1f1b43c42066c88ec975f96f6c93`, tree `566bcdfbd902946ef68f6af92ceee14db89f7aee`, has the exact174595 production bytes. The intervening commits have easylogic author/committer and no coauthor. This is a local qualified candidate, not a local develop merge or production adoption claim.

Final meaningful integrated checks: renderer151 PASS/one existing SKIP; View69 PASS; Word39 PASS; independent8 PASS. Required stages are covered by the one literal4961 preflight plus affected source/test/lint checks after the correction, recorded in `word100-final-preflight-ledger.json` SHA256 `88a7741991616135014e608b83c9962875ec39f1c58e4354956cd687c8d7f706`. Word app test types pass0/0 after test-only updates. The lint baseline drops exactly one observed occurrence,533→532; rules and limits are not raised.

Genuine browser evidence:

- Print14 PASS at7a956, zero skipped/retries/flaky/errors. Raw `.omx/m0/word100-candidate-print-browser/results.json`, SHA256 `360f8fb781c73cfb2c95337dd7b6c77081173c63d391b1a5ba1ed87c78ac5f15`.
- Bookmark/caption5 PASS at36b0fa, zero skipped/retries/flaky/errors. Raw `.omx/m0/word100-feature-browser-v2/results.json`, SHA256 `685e6727a7287df8e118e09877f30a8849f862fda33083fb1d5613b57e2623dc`.
- Print production remains byte-identical across these test-only descendants, so the passed14 are reused rather than rerun. Both earlier UI-navigation failures remain distinct preserved results.

Exactly one final normal H7 window uses three fresh browser processes per size, original fixture/fonts/media/no-GC/guards and seven unchanged harness files. Raw primary `.omx/m0/word100-normal-qualification-v1/report.json`, 134876 bytes, SHA256 `16a8fe3ceb2e3fb30d9178eb47887945b5a14d466a4d040f915cf62a0473a856`; original raw in the Integration root has the same hash. Assessment SHA256 `8d76344f7ef7ade87d21536814d069d234ebd52476ef3dbeff3cccd3e6646794`.

| Profile | Maximum sampled owned RSS, bytes | MiB | Limit | Result |
| --- | --- | --- | --- | --- |
| Word100 sample1 | 518619136 | 494.59375 | 512 MiB | PASS |
| Word100 sample2 | 515047424 | 491.1875 | 512 MiB | PASS |
| Word100 sample3 | 481984512 | 459.65625 | 512 MiB | PASS |
| Word300 sample1 | 843366400 | 804.296875 | 1024 MiB | PASS |
| Word300 sample2 | 847101952 | 807.859375 | 1024 MiB | PASS |
| Word300 sample3 | 843071488 | 804.015625 | 1024 MiB | PASS |

Worst-of-three cold/warm/print timings: Word100305.5/100.5/24.3ms; Word300989.6/345.3/66.8ms, all original targets pass. Actual pages and print pages match100/300, root IDs match DOM, all actual font identities are known, all repeatability checks pass and there are no page/console/resource/time-guard errors. Printed native node deltas4501/13501 give2.9995556543 growth, within3.5. Owned browser/server/Vite cleanup completes within5s.

Independent author review rehashes both raw copies, recomputes all six RSS maxima and every poll's PID sum, verifies six distinct fresh browser root PIDs, compares the frozen budget/harness/workload/method/guards with the old failed run, and checks actual timings/fonts/pages/nodes/errors. Before binding SHA256 `bbf8dfb75538d13b8fd09697535e46e51dcb1ea7cfcda1b2b506a12fffdab8dd`, after binding `15f6780fcd2c5dc270fc97cd20de6ceec6ce446400aed0b31301dd638116b514`: all1215 file records and654 aliases match exactly. All1215 actual file hashes and654 current symlink targets also match. The curated17-file omissions are explicitly covered, including the new navigation module and changed fiber-tree. Review record: primary `.omx/m0/537-word100-author-review.json`.

All24 observed normal browser PIDs are absent and private55260/55261 are closed. All five existing user server PIDs remain alive; existing primary planning WIP is unchanged. Earlier Word checkpoints, diagnostic full FAILs, failed normal samples and first test failures are preserved. Conditional office-text style resolution and lazy Word anchor proposals remain INACTIVE; no further source change or measurement is needed for this achieved outcome.

Evidence boundary: RSS is a200ms sampled owned-process sum including shared pages, not continuous HWM/private bytes or a population-tail guarantee. Actual copy/module counts and native capacity observations identify concrete work/ownership issues, but these separate windows do not isolate per-change RSS causation. This accepts the bounded Word100 outcome and same-candidate300 regression, not whole M0/alpha/physical IME/release/deployment or full PDF/paper fidelity.
