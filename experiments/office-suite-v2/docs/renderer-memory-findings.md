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
