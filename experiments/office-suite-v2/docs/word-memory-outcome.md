---
work_id: office-v2-m0/word100-memory-outcome-v1
artifact_type: implementation_evidence
status: running
owner_role: Execute Word Layout
source_request: Planner actual user item 01a163cc-9d96-7be3-89cc-240864c124bb
last_updated: 2026-10-22
---

# Word100 memory outcome

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
