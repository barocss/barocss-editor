# Renderer memory findings — #531

Date: 2026-10-22 (Asia/Seoul). Parent #521; integration #522; verification #526; milestone 19. M0 remains OPEN. This is a bounded source candidate, not RSS qualification, integration acceptance or release.

## Source and ownership

- Owner: Execute Renderer Memory, chat `01a160bd-c9b1-7131-916d-1f82cd9774db`.
- Worktree: `/Users/user/.codex/worktrees/531-renderer-memory/barocss-editor`.
- Branch: `codex/531-renderer-memory`.
- Exact parent: `8ac84fd2e4e5636327ba2fa8f9a012316a7d3a19`; tree `f64b23cad07f8fbbf5aac4d8f2586dd246d9ba06`.
- Changed paths: the three source files and new regression below, plus this record. The conditional `fiber-tree.ts` lease was not needed. All other paths remain read-only.
- Primary `/Users/user/barocss-editor` main `034a42c36924bc9a9808847d065e542cb5390c4c` and planning WIP were preserved. No reset, stash, shared branch write, dependency installation, root/lock/config edit, push, PR, browser/profile, database mutation or process stop.
- Startup remote observation: default main; remote main `034a42c36924bc9a9808847d065e542cb5390c4c`; remote develop `1190dce8de45bc61c06ec206df4138692d413a2d`; open PR #519 was unrelated. These observations do not change the exact local parent lease.
- Native helper `/root/lifecycle_audit` performed read-only lifecycle/source review. It owned no files and ran no tests. Parent performed all edits and verification.

Final source bindings (the immutable commit/tree is recorded in the Issue handoff, to avoid a self-referential commit ID):

| Path | Git blob | SHA-256 |
| --- | --- | --- |
| `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts` | `6c1d15b53f1a706ccdf5fbad685a944b73f89246` | `9d8d1489f6f4caab8329eb7a69e214301da89a9d5d5e35de9b6fa8abe870782e` |
| `packages/renderer-dom/src/reconcile/reconciler.ts` | `2cbaceabea95f072a60cdf197dd01f609eb9266f` | `9caee7b873e7b8033d07ac4b26122d286d425e4663deb10800aa2daa1f186a1a` |
| `packages/renderer-dom/src/dom-renderer.ts` | `53876351469fb942b899e8311fc36f29159a4e9f` | `d15729713f8e2b2ec8fe29bc2af461011ee73566158b1dcd627792e8195ad0ca` |
| `packages/renderer-dom/test/core/m0-fiber-retention.test.ts` | `23d220935797150451dcf52fe07e166443ebe798` | `faa74b1c45d7edc087c14f5f82de61446dd38e726c2fa46e730eb28fc7584707` |

## Deterministic first failure

The test uses the real DOMRenderer, VNodeBuilder, Reconciler and scheduler. It renders the same model 40 times and counts completed callbacks. A WeakMap labels actual newly created current Fibers; it is not a WeakRef/GC oracle. The graph walk follows enumerable plain-record, array, Map and Set edges, including all Fiber child/sibling/parentFiber/return/alternate links and VNode/context records. It excludes DOM internals, service class internals and function lexical environments. Therefore the count is a defined reachable data graph, not total heap size. Completed active-scheduler fields are checked separately, and both instance and captured-local scheduler references are explicitly released by source lifecycle.

| Completed renders | Parent generations | Parent Fibers | Parent graph objects | Final generations | Final Fibers | Final graph objects |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 1 | 5 | 79 | 1 | 5 | 79 |
| 10 | 10 | 50 | 754 | 1 | 5 | 79 |
| 40 | 40 | 200 | 3004 | 1 | 5 | 79 |

The initial parent test asserted identical DOM element references and exact text on every render. The final test strengthens this with equal total descendant count and identity for **every descendant, including Text nodes**. The bounded-history assertion failed only after all 40 parent completions and DOM checks. No manual graph, forced GC, WeakRef timing, RSS threshold, frozen fixture/media change or render no-op is used.

Initial command from `packages/renderer-dom` (Node PATH prefix below):

```sh
node node_modules/vitest/vitest.mjs run --config vitest.config.ts test/core/m0-fiber-retention.test.ts
```

Exit 1, 1 failed test. Preserved first output:

```text

 RUN  v4.0.18 /Users/user/.codex/worktrees/531-renderer-memory/barocss-editor/packages/renderer-dom

stdout | test/core/m0-fiber-retention.test.ts > M0 committed Fiber retention > bounds reachable generations and objects after actual same-document completions
M0 retention samples [{"fibers":5,"generations":1,"objects":79},{"fibers":50,"generations":10,"objects":754},{"fibers":200,"generations":40,"objects":3004}]

 ❯ test/core/m0-fiber-retention.test.ts (1 test | 1 failed) 58ms
     × bounds reachable generations and objects after actual same-document completions 57ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/core/m0-fiber-retention.test.ts > M0 committed Fiber retention > bounds reachable generations and objects after actual same-document completions
AssertionError: expected 40 to be less than or equal to 2
 ❯ test/core/m0-fiber-retention.test.ts:93:37
     91|     expect(completed).toBe(40);
     92|     console.info('M0 retention samples', JSON.stringify([samples[0], s…
     93|     expect(samples[39].generations).toBeLessThanOrEqual(2);
       |                                     ^
     94|     expect(samples[39].fibers).toBeLessThanOrEqual(samples[1].fibers);
     95|     expect(samples[39].objects).toBeLessThanOrEqual(samples[1].objects…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  08:15:30
   Duration  2.88s (transform 917ms, setup 54ms, import 1.01s, tests 58ms, environment 1.54s)
```

## Lifecycle repair and invariants

1. `createFiberTree` assigns each new Fiber's `alternate` to the matching old Fiber. Child creation passes the matching old child. This was the only alternate assignment site.
2. The old VNode/DOM remains available throughout render, keyed matching, replacement/deletion commit, primitive text handling and `removeStaleChildren`. Clearing a root alone is insufficient: child alternate → old parentFiber/return reaches the old root.
3. At the end of the **whole** `commitFiberTree`, walk only the new tree's child/sibling edges and clear each `alternate` and `prevVNode`. Do not traverse or mutate old/active trees via parent/alternate links. The next pass receives the current tree and uses its current VNodes/DOM.
4. Before root publication and external completion, release the instance scheduler only if it is still this render's scheduler. Also set the captured `renderScheduler` local to null. The latter avoids unnecessary retention through the lexical scope shared with context callbacks. Enumeration cannot prove hidden function edges or engine heap collection.
5. Existing `DOMRenderer.destroy()` now invokes internal Reconciler disposal: cancel pending root work, release root/scheduler/visited state and remove tracked portal hosts. It also clears renderer snapshot/model/decorator/runtime references. Disposal is idempotent; a later explicit render remains possible.
6. Root scheduler cancellation already prevents an abandoned idle continuation from committing. The focused test exercises both cancellation before any unit and replacement after the real scheduler has processed root + paragraph (next unit is the actual text Fiber, parent DOM is the existing paragraph). It then drains real queued callbacks and asserts only the newest callback, exact text, identity and released history.
7. Completion callbacks see the newly published clean tree. Synchronous nested render and a new deferred render from a completion callback keep the newest root/scheduler. Read-only helper review found no introduced regression; it did not run tests.

## Verification receipts and exact boundaries

Environment: `PATH=/Users/user/.nvm/versions/node/v22.22.0/bin:$PATH`; Node 22.22.0; pnpm 8.15 policy unchanged. Integration supplied 46 existing dependency directories / 798 links. Local workspace imports resolve to this worktree; external packages use the frozen #522 graph. Resolved Vitest 4.0.18, TypeScript 5.9.3 and ESLint 8.57.1.

| Check | Actual result | Source binding / limit |
| --- | --- | --- |
| Initial same-document regression | Exit 1; 1/1 FAIL | Exact parent source, raw failure above. |
| First minimal cleanup | Exit 0; 1/1 PASS | Predecessor source before expanded tests and final captured-local cleanup; not final coverage. |
| Directly affected selected set | Exit 0; 8 files / 60 tests PASS | Pre-final scheduler-local-null line; 51 unchanged existing tests are reused only for their unchanged paths/contracts. Final regression was run again. |
| Final focused regression | Exit 0; 9/9 PASS | Final source blobs above, including captured-local-null; graph/whole-DOM identity, key insert/delete/move/type replacement, nested mark/decorator, portal mount/removal/disposal, async supersession/partial work, callback reentrancy and disposal. |
| Source types | Exit 0, no diagnostics | Final three source blobs. `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` from renderer-dom. |
| Test-type budget | Exit 0; 123 / 123 unchanged debt | `node scripts/typecheck-tests.mjs renderer-dom`. Initial attempt was 126/123 (three new implicit-this diagnostics); explicit `this: FiberScheduler` repaired them. No budget/config change. This receipt predates only the final DOM-count guard and one scheduler-null line. |
| Focused new test + imported source types | Exit 0; 0 diagnostics | Final test, before only the scheduler-local-null line. Used TypeScript API with existing tsconfig.typecheck options and only the new test root; final source tsc above covers that last line. |
| Scoped raw ESLint | Raw exit 1; 13 existing errors, 61 warnings; new test 0/0 | Only the three changed sources + new test. Existing errors were not fixed outside scope. |
| Exact parent lint comparison | Exit 0; grew 0 / shrank 0 | Final files, ESLint lintText of exact parent with identical file paths; repository lintEntries/compareLint comparison. Source error counts 7/2/4 and warnings 19/20/22 unchanged. Final test lint exit 0. |
| Portal update diagnostic | Parent exit 1; predecessor candidate exit 1 | Text/title failures below stay FAIL; excluded from the 9/9 focused PASS count and remain unresolved. |

Selected test command, from renderer-dom:

```sh
node node_modules/vitest/vitest.mjs run test/core/m0-fiber-retention.test.ts test/core/fiber-tree.test.ts test/core/fiber-reconciler.test.ts test/core/reconciler-lifecycle.test.ts test/core/reconciler-portal.test.ts test/core/mark-decorator-complex.test.ts test/core/dom-renderer-multiple-render.test.ts test/core/native-tag-is-never-a-component.test.ts --maxWorkers=1 --fileParallelism=false
```

Final regression command (only this file rerun after final small changes):

```sh
node node_modules/vitest/vitest.mjs run test/core/m0-fiber-retention.test.ts --maxWorkers=1 --fileParallelism=false
```

No full-package/repository suite, full preflight, product/browser/native/physical-IME/performance qualification or normal Word100/300 was run. Integration owns meaningful aggregate verification. Verification needs a new serial lease for any unchanged normal profile. Source green does not establish RSS savings or close M0/#531.

## Preserved independent failures and limits

The first expanded run (`/tmp/531-expanded.log`) had 6 PASS / 2 FAIL. One was the portal text-update failure. The other was an **invalid new diagnostic oracle**:

```ts
expect(currentRoot(renderer)?.vnode).toBe(renderer['currentVNode']);
```

`DOMRenderer.currentVNode` is initialized null and is only assigned null in destroy on both parent and candidate; render never writes it. It is not the published Reconciler root. Source inspection, independently of the portal result, disproves this oracle. No product repair was made for it. The final callback test instead captures the actual root during the inner completion and requires that exact root after outer completion, correct text and released history. The raw original failure is preserved and is not reported as a product bug or a PASS.

Portal update is a distinct, genuine pre-existing failure. The original expectation was text `two`, observed `one` on the first portal content element. A title update also expected `second`, observed `first`. The same independent diagnostic below failed on the exact parent and the reviewed predecessor candidate. These assertions are preserved, not relaxed to the stale values. The final focused ownership test independently checks portal mount/removal and disposal with empty content; it makes **no** portal update/text correctness claim. Existing portal tests only cover their actual assertions and also emit `domElement is not set` diagnostics. Initial diagnostic rendering also produced duplicate primitive portal text (`oneone`); that independent behavior was not repaired.

Exact diagnostic fragment used as an appended temporary test in the owned regression path; same fragment/temporary-test bytes for parent and predecessor candidate:

```ts

// Independent diagnostic: original text-update oracle is not weakened.
it('M0 diagnostic portal primitive-text update', () => {
  const { renderer, container } = fixture();
  const target = document.createElement('aside');
  document.body.appendChild(target);
  define('m0-portal-diagnostic', (_props, model) => element('div', {}, [
    portal(() => target, element('p', { className: 'm0-portal-diagnostic-content', title: model.title }, [model.text]), 'm0-diagnostic-portal')
  ]));
  const model = { sid: 'm0-diagnostic-root', stype: 'm0-portal-diagnostic', text: 'one', title: 'first' };
  renderer.render(container, model);
  const content = target.querySelector('.m0-portal-diagnostic-content');
  renderer.render(container, { ...model, text: 'two', title: 'second' });
  expect(target.querySelector('.m0-portal-diagnostic-content')).toBe(content);
  expect.soft(content?.textContent).toBe('two');
  expect.soft(content?.getAttribute('title')).toBe('second');
});
```

Command: the focused test command above plus `-t 'M0 diagnostic portal primitive-text update'`. Both runs: 1 failed diagnostic / 9 filtered tests, exit 1. Files were saved as bytes; only the three owned source paths were temporarily populated from exact parent; candidate bytes and the final regression were restored in a finally block. No reset/stash was used. The source restoration receipt below records SHA-256 before/after, both equal. A later sole source delta adds `renderScheduler = null`; the diagnostic receipt stays bound to its predecessor source and is not represented as a fresh final-source run.

```json
{
  "parent": "8ac84fd2e4e5636327ba2fa8f9a012316a7d3a19",
  "candidateBefore": {
    "packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts": "9d8d1489f6f4caab8329eb7a69e214301da89a9d5d5e35de9b6fa8abe870782e",
    "packages/renderer-dom/src/reconcile/reconciler.ts": "3eadd582dffbfdbf06bdf99136f5b9c6e37558220501fe617f09ad2dd3ce8938",
    "packages/renderer-dom/src/dom-renderer.ts": "d15729713f8e2b2ec8fe29bc2af461011ee73566158b1dcd627792e8195ad0ca",
    "packages/renderer-dom/test/core/m0-fiber-retention.test.ts": "faa74b1c45d7edc087c14f5f82de61446dd38e726c2fa46e730eb28fc7584707"
  },
  "diagnosticSHA256": "9af1e880b78db1ee21d857cd21325fec082defbd5d9ce0528f4dc78cfa2bf1d1",
  "runs": {
    "parent": {
      "sourceSHA256": {
        "packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts": "d190c6361aa73532da42af1b8e1b835e5c2126ecd596fc8f8a90008e18c84ce9",
        "packages/renderer-dom/src/reconcile/reconciler.ts": "e229a6d7edd632a80ba3f2f7011bffa07cf9355ff3ccf75dd737e32a76513872",
        "packages/renderer-dom/src/dom-renderer.ts": "94310528c134fd7877795623c0756c3e97b62091e1dd662abb95652d45276ee1"
      },
      "temporaryTestSHA256": "5df9040efe4c447b6f8a4191570c23073b7705acb0368093c21bbabaf670b1eb",
      "exit": 1,
      "log": "/tmp/531-parent-portal-diagnostic-final.log",
      "logSHA256": "d07d6eac048f464c23097c8dc07042f30e16788c9af8c3051182cd2cc0bf5449"
    },
    "candidate": {
      "sourceSHA256": {
        "packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts": "9d8d1489f6f4caab8329eb7a69e214301da89a9d5d5e35de9b6fa8abe870782e",
        "packages/renderer-dom/src/reconcile/reconciler.ts": "3eadd582dffbfdbf06bdf99136f5b9c6e37558220501fe617f09ad2dd3ce8938",
        "packages/renderer-dom/src/dom-renderer.ts": "d15729713f8e2b2ec8fe29bc2af461011ee73566158b1dcd627792e8195ad0ca"
      },
      "temporaryTestSHA256": "5df9040efe4c447b6f8a4191570c23073b7705acb0368093c21bbabaf670b1eb",
      "exit": 1,
      "log": "/tmp/531-candidate-portal-diagnostic-final.log",
      "logSHA256": "c3e045bab5da923d3a386f60679c956fb29bce3c9df66883498dc77bcee330c1"
    }
  },
  "candidateRestored": {
    "packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts": "9d8d1489f6f4caab8329eb7a69e214301da89a9d5d5e35de9b6fa8abe870782e",
    "packages/renderer-dom/src/reconcile/reconciler.ts": "3eadd582dffbfdbf06bdf99136f5b9c6e37558220501fe617f09ad2dd3ce8938",
    "packages/renderer-dom/src/dom-renderer.ts": "d15729713f8e2b2ec8fe29bc2af461011ee73566158b1dcd627792e8195ad0ca",
    "packages/renderer-dom/test/core/m0-fiber-retention.test.ts": "faa74b1c45d7edc087c14f5f82de61446dd38e726c2fa46e730eb28fc7584707"
  },
  "restoredByteIdentical": true
}
```

Known unverified lifecycle boundary: nested portal content has a separate scheduler which is not registered with the root activeScheduler. Superseding an async root can leave its old portal-visit set and independent portal continuation. This was found by source audit, not proven as this patch's regression or RSS cause, and is not repaired here. The combined async-portal cancellation/visit-cleanup path is NOT VERIFIED. Root cancellation/partial work tests and synchronous owned portal host disposal do not imply that combined path passes.

The graph bound is independent of render count for the tested completed same-document path. Absolute memory remains dependent on the current document. No heap snapshot, hidden lexical-edge traversal, GC timing or RSS causal magnitude is claimed. deepCopyVNode recursion and WordRange reuse remain untouched. W522b, print O/S/D, diagnostic eadc, existing Word100 RSS FAIL and local develop f4 evidence are preserved.

## Raw evidence digests

Logs are retained at the local paths below. The initial failure and independent diagnostic/assertions are also embedded above so the committed record preserves the essential evidence. Successful receipts are not promoted to broader acceptance.

| Local evidence | SHA-256 |
| --- | --- |
| `/tmp/531-first-failure.log` | `470399cdc8d34607c1fa968477b1297dec1192cb72188324cbe4a48f7a3d648c` |
| `/tmp/531-initial-fix.log` | `1766bc234843b6f213d7e45482307b4ea75027bfd5cb9048fe061d408e0403aa` |
| `/tmp/531-expanded.log` | `37282ed37fda01bc04b7f4cd5ba134489a0da8beb89e0354a2569e12a3fb64ba` |
| `/tmp/531-expanded-second.log` | `0aecc041770af6fc105239ed01da740acefadf619f36635d7432d7a44d8300e1` |
| `/tmp/531-expanded-third.log` | `294cf572070ad2ed7ca63a537c2c0c01f08579f990a10ced8f6ce4c02af37771` |
| `/tmp/531-parent-portal-diagnostic.log` | `f1b80b6bef1f19c892a741ec06e2adac28a0a3c8e550d1b5f7ec387f12170c5d` |
| `/tmp/531-parent-portal-diagnostic-final.log` | `d07d6eac048f464c23097c8dc07042f30e16788c9af8c3051182cd2cc0bf5449` |
| `/tmp/531-candidate-portal-diagnostic-final.log` | `c3e045bab5da923d3a386f60679c956fb29bce3c9df66883498dc77bcee330c1` |
| `/tmp/531-targeted.log` | `12833c9f06f15f977c3324a99450e53171fa588edd1319046c0c9a7aeeb60ed5` |
| `/tmp/531-focused-final.log` | `c1261072390f7e7618e0dda3865247f7846a2c08b47e5c3c12d992adb1ba0924` |
| `/tmp/531-source-types-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/531-test-types.log` | `4ed0990a4ec2f864e55d6e6ca48838dd26035bcc9a094a8e62523b009215792b` |
| `/tmp/531-test-types-final.log` | `10e38c332782a8e7cf5aec1b9b10721263d21cb36853f55989c9924207a8fb41` |
| `/tmp/531-newtest-types-final.log` | `05733cf5ca835511fab84f5519a3c22aa540aa7c41ebe5435135675063b04e45` |
| `/tmp/531-lint.json` | `e217525f1e296cd4ea96d4f13a6d7d6aaf898c10240c552116df7f6e454fa4d3` |
| `/tmp/531-lint-comparison-final.json` | `44fcb8bf54d3769761ef0a4734480a4f75ec83d3072f7605b2ad8696ee9d991e` |
| `/tmp/531-source-restoration.json` | `f4197e89ab0ee95e61dd5e2dd5e920b04ae8fed00d582e0165e67ef3826f5607` |
| `/tmp/531-portal-diagnostic.ts.txt` | `9af1e880b78db1ee21d857cd21325fec082defbd5d9ce0528f4dc78cfa2bf1d1` |


# Portal lifecycle successor — #531, 2026-10-22

This section is additive. The entire preceding retention report and its original FAIL/raw bindings remain byte-identical to parent (prefix SHA-256 `06877ed5428d3e259193c0c08a627204596665a883e1e004bcbd2bb20934a1c0`). Old portal failures remain historical failures; the focused native behavior below is a new source-bound result. It does not accept all browser/portal/disposal behavior or resolve Word100 RSS.

## Authority, source and ownership

Planner reported the direct human answer “중지 해제하고 M0 수정·검증 계속” to the explicit Word/Renderer/Verification hold-release question. Scope is `wonffice-531/portal-lifecycle-next-v1`, same Issue #531 after duplicate checks; no second Issue. Parent owns production/review/final checks. Native `portal_tests` helper wrote only the new regression file and ran no tests. `lifecycle_audit` reviewed sources read-only, found two concrete initial-candidate defects, and ran no tests. Parent reproduced them and made all source fixes.

- Exact parent: `7eca44213c9b9609c88b635dcfc0ee8412a7e21d`; tree `e09d6f739d05407359c5a0af88cd309b3aac9949`.
- New managed root: `/Users/user/.codex/worktrees/531-portal-lifecycle-next/barocss-editor`; branch `codex/531-portal-lifecycle-next`; initially clean.
- Existing `/Users/user/.codex/worktrees/531-renderer-memory/barocss-editor` at `981cc151` stays clean and unchanged. Primary and all served/checkpoint roots are preserved.
- Renderer subtree equals prior e681/981: `ed0e19ca5f5eaa9e1fcd2b905da372a4a57e3cf2` on parent. This does not turn historical diagnostics into a fresh parent run.
- Exact seven-path lease: the five source files below, new regression, and this append. Other renderer files/public API, scheduler/types, View, Word, verification, root/config/locks are unchanged.
- Integration supplied source-aware frozen graph: receipt `/Users/user/barocss-editor/.omx/m0/531-portal-lifecycle-next-frozen-receipt.json`, 46 directories/799 entries/654 links. Node 22.22.0, pnpm8.15 policy and resolved Vitest4.0.18/TypeScript5.9.3/ESLint8.57.1 unchanged. No author install/link/config edits.

Final source/test bindings (final immutable parent/head/tree is in the Issue handoff):

| Path | Git blob | SHA-256 |
| --- | --- | --- |
| `packages/renderer-dom/src/reconcile/reconciler.ts` | `c67d6eb3205b4285325b15523685ab7f248e7674` | `a70bf6b4e5689535cc024ce7b7597b1c48447b1125f3e726dd1c7c69f1fb5d1d` |
| `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts` | `a0a8d38b32eb68847b7f9b25f96a120e0f071740` | `0e2792d6553a1f484acb29141471c921558afa875f42bd7ef01d3c0f2e6253d9` |
| `packages/renderer-dom/src/reconcile/fiber/fiber-tree.ts` | `7c6a8a6a0f60f437bb3a66f2f66c4918bcd953f1` | `3a5b0bbad8f1f42ffd339b880cca6c6a1a01b988d61d04af30ad97964b8196b6` |
| `packages/renderer-dom/src/reconcile/utils/portal-handler.ts` | `2d481b2421c06fcc5f9e6920d00e25e17690b08c` | `959bbbea33a5470895cb27cfceafb5677fa0de0cc91f53a919130d3dbff3698b` |
| `packages/renderer-dom/src/reconcile/fiber/get-host-sibling.ts` | `b7f49a6a780b438fb25be58bdae859f5773ea87f` | `677c957983c341e1e0d1be7100af7e9b792ae0abd977321b8d78ffda2b0fe83f` |
| `packages/renderer-dom/test/core/m0-portal-lifecycle.test.ts` | `fadb25314e0da4a804996b4afcc5249ad005106f` | `c0d56e3cd36bc23513be97b47351a6e0eea30342e2886ced6d2c1a53826c167f` |

## Actual parent first failures

All commands below ran the real DOMRenderer/DSL and actual FiberScheduler with Node22.22 PATH from `packages/renderer-dom`. The controlled clock/idle queue only forces actual scheduler yield boundaries; it does not replace the renderer, build a fake Fiber graph or force GC.

1. Exact unchanged parent, new initial 9-case file:

```sh
node node_modules/vitest/vitest.mjs run test/core/m0-portal-lifecycle.test.ts --maxWorkers=1 --fileParallelism=false
```

Exit1, 9/9 FAIL. First mount had **2 content elements, expected1**. Reorder later had10, expected3. The independently observed before-portal-unit cancellation case had obsolete callback0 / newest callback1, but target child count2 (foreign + stale host), expected1 (foreign only). Thus the shared visited-set cleanup problem is now an actual failure on this source, rather than only the earlier static suspicion. The after-portal-unit case had content5, expected1. These failures remain separate from RSS.

2. Still exact unchanged parent, enhanced 11-case file, only update case selected:

```sh
node node_modules/vitest/vitest.mjs run test/core/m0-portal-lifecycle.test.ts -t 'updates text and title once' --maxWorkers=1 --fileParallelism=false
```

Exit1, 1 failed /10 filtered. Soft assertions collect multiple failures without changing any expected result: initial count2 vs1; update count4 vs1; first content text `one` vs expected `two`, title `first` vs expected `second`; portal content incorrectly appears in source DOM (`beforetwo[a]after` vs `before[a]after`). Element/Text identity is still required. Soft assertions remain failing Vitest assertions, not accepted stale values. The first 9-case transcript stays preserved separately.

The baseline source was not temporarily overlaid or repaired during either parent run. Later test-only corrections are explicit: deleting a portal may leave its content in a detached owned host, so the removal oracle requires target absence and detached host, not `content.parentNode === null`. DOM/Text identity arrays were strengthened to exact lengths and per-index `toBe`. No frozen fixture, gate, media, budget or expected correct content was relaxed.

## Minimal repair and concrete review followups

The old code built portal content as ordinary child Fibers **and** launched a second independent portal scheduler with no previous content. Parent-return processing could launch it again. Content accumulated in the target, stayed stale at the first node and could also appear in source DOM.

The repair keeps portal content in the existing root Fiber tree and scheduler:

- `preparePortalHost` prepares a detached owned host or reuses the committed owned host. It never adopts a matching DOM attribute on a foreign host. The old internal `handlePortalVNode` contract is retained for its existing direct callers/tests; the actual Fiber path uses detached preparation. No package public API was added or changed.
- Each reconcile pass has its own prepared entries and visited set. The root cancellation/generation check guards unit processing, commit/sweeps, publication and external completion. Supersede and destroy invalidate old queued work; no portal-specific independent scheduler remains.
- Portal children commit to the host once. The host itself bypasses ordinary source placement. Target movement reuses the same host/content/Text nodes. Hosts attach and reorder only **after all source commits and text cleanup**, before root completion/history release.
- Source stale-child traversal and sibling lookup stop at portal boundaries. Committed owned hosts are preserved when a source host is also a portal target. Cleanup removes only hosts in this renderer's map, preserving unrelated target content and a foreign host with the same portal ID.
- Portal identity uses portalId in sibling matching. For ordinary template elements, the existing `getVNodeId` contract says an explicit key wins over an inherited owner SID; `identityOf` was discarding that key. The first repair candidate exposed two actual source-sibling identity failures. Giving the existing truthy string key priority fixes those. VNode.key remains string, existing empty-key truthiness behavior is unchanged, and no numeric/zero key contract was invented. Actual **non-portal** inherited-SID keyed reorder/insert/delete and ordinary unkeyed positional Element/Text reuse are separate final tests.

The initial candidate's 11 new +9 retention cases passed after the key correction. Read-only review then identified two concrete defects in that candidate and parent reproduced both before their fixes:

| Initial-candidate defect | Actual focused RED | Fix |
| --- | --- | --- |
| Target is the later `.source-after` text-only source element | Expected1 portal content, actual0 after later text reconciliation; exit1, 1FAIL/1PASS/14 filtered | Attach hosts at the end of the whole commit, after source text cleanup. |
| A custom-element disconnection during a target-change render calls destroy or a newer render | Both modes left committed map size1, expected0; exit1, 2FAIL/2PASS/12 filtered | Ownership checks after sweeps and before map writes; DOM movement checks immediately after append/insert. |

The custom probe is inserted directly in the owned host and can be disconnected by the stale sweep before the final host move. Its final PASS therefore establishes **post-sweep reentrancy ownership**, not branch-specific execution coverage of the post-append/post-insert guards. Those guards' placement was reviewed from source. No universal custom-element, component or disposal acceptance is inferred. No further introduced blocking defect was found by the read-only final review.

## Final targeted receipts

All final rows below bind to the six source/test blobs above, not an earlier candidate. No subsequent source/test edit follows these checks.

| Check | Actual result |
| --- | --- |
| New portal regression | 16/16 PASS; actual update/count/Element+Text identity, target move/removal, same-ID foreign host, portal/source order, nested removal, target-before and target-after, sweep callback destroy/supersede, explicit non-portal key and unkeyed positional rules, async before/after portal units, async completion reentry, reached-unit destroy/followup,20 completed portal updates. |
| Existing unchanged Fiber retention regression | 9/9 PASS; 40-render result remains1generation/5Fibers/79enumerable objects, whole-DOM count and Element/Text identity unchanged. |
| Directly affected selected set | Exit0; **11 files /92 PASS /0 skips**. Includes new16 + retention9 and existing67 checks. Full command below. |
| Source types | Exit0;0 diagnostics: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`. |
| Test types | Exit0;123/123 unchanged debt: from root `node scripts/typecheck-tests.mjs renderer-dom`. No budget/adopt/config changes. |
| Scoped lint | Five changed sources + new test have7 existing errors/45 warnings; new test0/0. Exact-parent `lintEntries/compareLint` grew0/shrank0, exit0. This is baseline compliance, not zero-diagnostic lint. |
| Scope/integrity | `git diff --check` PASS; old report prefix and existing retention test preserved exactly; no nonleased source edits. |

```sh
node node_modules/vitest/vitest.mjs run test/core/m0-portal-lifecycle.test.ts test/core/m0-fiber-retention.test.ts test/core/reconciler-portal.test.ts test/core/reconcile-utils-portal-handler.test.ts test/core/fiber-tree.test.ts test/core/fiber-create-fiber-tree.test.ts test/core/fiber-reconciler.test.ts test/core/reconciler-lifecycle.test.ts test/core/mark-decorator-complex.test.ts test/core/dom-renderer-multiple-render.test.ts test/core/native-tag-is-never-a-component.test.ts --maxWorkers=1 --fileParallelism=false
```

Intermediate receipts are preserved, not promoted: initial repair20/20, then selected87/87 pre-review-fix and standalone25/25 before the final portal-key fallback simplification; the final92 run above supersedes those for final-source coverage. The final fallback uses portalId after the existing truthy explicit-key check, so an empty key does not override portalId. The final92/source-types/test-budget/lint comparison were repeated after that last source line. Review-focused filtered cases are recorded with their filtered counts; filtered cases were not PASS.

Independent Verification #526 reported immutable parent RED candidate `0bea96d89a3299e0a199f347b30bf04986f985d3`:8 cases/4PASS4FAIL using public DOM/callbacks and real scheduler timing. That is independent baseline evidence, not a final-candidate PASS. Integration owns joining that unchanged verifier delta with this immutable source and any required aggregate/browser checks. The author did not run those independent files or mutate verification paths.

The prior portal text/title FAIL and async NOT VERIFIED statements above describe the predecessor checkpoint. This successor proves only the named native/jsdom cases on the new source; real-browser aggregate acceptance remains pending Integration/Verification. Word100 W4/W5 RSS failures, native-attribution gaps and all original raw records remain unchanged. No RSS causality/savings, new Word100/300 qualification, whole M0 acceptance, release or universal cleanup claim follows. No browser/heavy profile/full package/repository tests, push/PR/deploy, DB mutation, unrelated process stop or schedule action was performed.

## Successor raw evidence digests

| Local raw evidence | SHA-256 |
| --- | --- |
| `/tmp/531-portal-parent-first-failure.log` | `94f92eefa43a61dfcb44d358387c2148e5ec69306a66901db5439865ea47fcf4` |
| `/tmp/531-portal-parent-update-first-failure.log` | `d290ad5227dfb77be1303fef4c9cf4be5f407f603d1664b43ae17e0e93e540ba` |
| `/tmp/531-portal-initial-fix.log` | `1122442b66bf65b031f1d652ca0ef992b267fbf72853782d349da45e847496dc` |
| `/tmp/531-portal-fixed-focused.log` | `084256c846d335d75345fb71997187d66dc3c6ece75b53c07b45cb3ddb373e54` |
| `/tmp/531-portal-targeted.log` | `0bf49581593a6ea6ec40ec6a3f883af56882b7c6ba5b194eebbc7cf3fdb9f31c` |
| `/tmp/531-portal-review-first-failures.log` | `99953b8993498a253ca0690ec668c514aaa2c67541ca4c75466a5a1f60d8846c` |
| `/tmp/531-portal-move-review-first-failures.log` | `0fe136468e96b9a65ce6230e4a1098b34a6aa7b05d500f4ce663533cc788c672` |
| `/tmp/531-portal-final-focused.log` | `b3a21ddcd615c2f470e0c45c2e88a485235de5bf90de7eed5b537f4ce5bf85e5` |
| `/tmp/531-portal-targeted-final.log` | `ae5a63d590e4b6befd5d98e187dce3effd461fa6b3bd10d76b2b3e56ccc87977` |
| `/tmp/531-portal-source-types-final.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/531-portal-test-types-final.log` | `10e38c332782a8e7cf5aec1b9b10721263d21cb36853f55989c9924207a8fb41` |
| `/tmp/531-portal-lint-final.json` | `bc9551cec6be704fdf6a0fc198c2f070b8740a909db693dcff25d367c23b826a` |
| `/tmp/531-portal-lint-comparison-final.json` | `2f05bff26996bb9021fe96f664d09e28e8fe087411ed620a2601d133443b159e` |
| `/tmp/531-portal-targeted-final-pin.log` | `37d16f296af09f79e6ea0da6d4a6e62c873ddc5b26963d0109554a3c9d16c5ec` |
| `/tmp/531-portal-source-types-final-pin.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `/tmp/531-portal-test-types-final-pin.log` | `10e38c332782a8e7cf5aec1b9b10721263d21cb36853f55989c9924207a8fb41` |
| `/tmp/531-portal-lint-final-pin.json` | `ee6871119909dbca5a5002f44acf1ba77c4cc95852ecc574c993955e4acb63e7` |
| `/tmp/531-portal-lint-comparison-final-pin.json` | `2f05bff26996bb9021fe96f664d09e28e8fe087411ed620a2601d133443b159e` |


# Defensive commit guard successor — #531, 2026-10-22

Planner's source review identified a concrete defensive-path regression in immutable `889f92d3c81bad6ead8e835e7bc68984c4dba54b`: the new portal early-return read `vnode.tag` before the existing no-effect and missing/non-object-VNode DELETION guards. This section supersedes only that guard ordering. All previous report bytes remain a preserved prefix (SHA-256 `b140b21fd987e02d2185f80cb8d0bdd08e9603dbb0a9d7141b7be5ea20c36846`). The initial889 source/tree,92PASS and all first failures remain bound to their original immutable source, not silently requalified.

## Reachability and actual reproduction

Source search found no current production writer assigning EffectTag.DELETION or deliberately removing Fiber.vnode; normal removal goes through stale-child cleanup/type replacement. FiberNode.vnode is statically non-null. Therefore this is not evidence of a currently reachable null-VNode public DOMRenderer call. However the internal commitFiberNode explicitly retains the missing-node deletion branch, also described in renderer-dom-spec.md, and the new portal dereference broke that existing defensive behavior.

The one new case uses the actual DOMRenderer to create a Fiber and DOM node, then uses Reflect.deleteProperty on that real Fiber to exercise the **existing internal** missing-VNode state. It does not pass null to public render, construct a fake graph or introduce a new public contract. First with effectTag=null it requires no effect/no throw; then with DELETION and the actual previous VNode it requires exactly one real ComponentManager.unmountComponent call and removal of the prior actual DOM node. The unrelated portal content remains present.

Before source repair, the selected new case failed with TypeError reading undefined.tag in **both** no-effect and deletion attempts (exit1;1 failed/16 filtered). Raw first failure is retained below. The only production change moves the unchanged portal early-return below the unchanged no-effect and missing-node guards. No scheduler, host ownership, matching, public input or API change is made.

## Source bindings and checks

Immediate parent: `889f92d3c81bad6ead8e835e7bc68984c4dba54b`, tree `993b070f5923e7b68d914b4847f8920726f27b49`. Same managed root/branch; successor changes exactly these two leased files plus this append. Canonical original parent remains7eca4421. Final successor head/tree is recorded in the Issue handoff.

| Path | Git blob | SHA-256 |
| --- | --- | --- |
| `packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts` | `67a3b253f5b14fa3ee9421baf9064629d105e108` | `c2b3cac46caa46b76fba4df81f5cc9aa1c9ab1e16ac3b4ca2cc2225224d748e3` |
| `packages/renderer-dom/test/core/m0-portal-lifecycle.test.ts` | `9352c1297f4bcfd7d2ff195bcd5d400e5f54ff24` | `8d88469f8201d7fdbd4ad83c0d69c8a399a9abb9d899486df12bb1bbbf1c9760` |

- Targeted final command: `node node_modules/vitest/vitest.mjs run test/core/m0-portal-lifecycle.test.ts --maxWorkers=1 --fileParallelism=false`, cwd renderer-dom, Node22.22.0. Exit0, **17/17 PASS**, no skips. The same command with `-t 'missing-VNode'` produced the first failure above.
- Focused new-test/imported-source TypeScript program using existing tsconfig.typecheck.json options: exit0,0 diagnostics. No config or budget change.
- Two changed code files scoped ESLint: source retains2errors/20warnings; test0/0. Exact889 parent comparison grew0/shrank0, exit0. This is unchanged diagnostic debt, not zero-diagnostic source lint.
- `git diff --check` PASS. No broader/full test or preflight repeated. Prior92PASS and123/123 package test-type debt remain889 receipts; no93-test or new full-package result is claimed.

This is a defensive guard-order regression repair. It neither demonstrates a new public null-VNode lifecycle nor changes the earlier named native portal proof boundary. Post-move guard branch coverage, independent #526 candidate validation and browser/aggregate qualification remain as previously stated/pending. RSS failures and original raw data remain unchanged. Integration/Verification must bind final qualification to the actual successor. No source outside the lease, served root, dependency/config/lock, browser/profile, database, process or schedule was modified.

| Guard successor raw evidence | SHA-256 |
| --- | --- |
| `/tmp/531-portal-guard-first-failure.log` | `bb137213cc67383543d4dee9631ae5d075c923f2957009348e499f8a0eb02807` |
| `/tmp/531-portal-guard-final.log` | `a7737f23b19abe81af5285421e1b68fe6e5e5dd6e3c95f692e4a1607a33d0e3b` |
| `/tmp/531-portal-guard-types.log` | `05733cf5ca835511fab84f5519a3c22aa540aa7c41ebe5435135675063b04e45` |
| `/tmp/531-portal-guard-lint-comparison.json` | `28103eddfef41a61e294a848bef083765ce4d7fed23e099df8b08acb09819a65` |
