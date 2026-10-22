---
work_id: 536
artifact_type: implementation-evidence
status: qa_ready
owner_role: Planner scoped native helper /root/core_rendering
source_request: https://github.com/barocss/barocss-editor/issues/536
last_updated: 2026-10-22
---

# Root SID ownership

Parent source: `2c889f64dcd7173cd02c037cb3e12640315db829`, tree
`3262b82b010235c217679afacde867bfb2bc8a8c`.
Only the leased root-SID test was added before this first run. Production source
was unchanged. The test uses the actual DOMRenderer and supported non-null models.

## Preserved first failure

Working directory: `packages/renderer-dom` in the Issue 536 managed worktree.
Command: `/Users/user/.nvm/versions/node/v22.22.0/bin/node node_modules/vitest/vitest.mjs run test/core/m0-root-sid-ownership.test.ts --maxWorkers=1 --fileParallelism=false`.
Exit: **1**. Failure-bearing raw output below (decorative separators omitted):

```text
 RUN  v4.0.18 /Users/user/.codex/worktrees/536-root-sid-ownership/barocss-editor/packages/renderer-dom

stdout | test/core/m0-root-sid-ownership.test.ts > M0 model root SID ownership > replaces the document owner when the same tag and stype acquire a different root SID
M0 root ownership {"expected":"document-B","actual":"document-A","content":"B","reusedRoot":true,"reusedChild":true}

 ❯ test/core/m0-root-sid-ownership.test.ts (2 tests | 1 failed) 18ms
     × replaces the document owner when the same tag and stype acquire a different root SID 15ms
     ✓ preserves actual DOM and Text identity for ordinary same-root edits 2ms

 FAIL  test/core/m0-root-sid-ownership.test.ts > M0 model root SID ownership > replaces the document owner when the same tag and stype acquire a different root SID
AssertionError: expected 'document-A' to be 'document-B' // Object.is equality

Expected: "document-B"
Received: "document-A"

 ❯ test/core/m0-root-sid-ownership.test.ts:40:70
     38|     }));
     39|     expect(container.textContent).toBe('B');
     40|     expect(container.firstElementChild?.getAttribute('data-bc-sid')).t…
       |                                                                      ^
     41|     expect(container.firstElementChild).not.toBe(previous);
     42|     expect(container.querySelector('span')).not.toBe(previousText);

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   Start at  19:21:25
   Duration  1.12s (transform 324ms, setup 16ms, import 369ms, tests 18ms, environment 354ms)
```

The root owns document A in DOM while rendering B's content. This is an actual
source defect. It does not establish the cause of the earlier Word diagnostic:
that receipt retained hashes, not raw IDs and view/DOM ownership. Its FAIL stays
unresolved. No RSS, native-byte, GC, browser, or budget claim follows from this test.

## Preserved intermediate lifecycle failure

The first ownership repair passed the six initial regressions and 39 adjacent
tests (45 total). Static review then identified callback reentry. A teardown-only
delay passed unmount reentry but did not protect a new component's mount callback.
The same Vitest command above returned **exit 1**, `1 failed | 7 passed (8)`, at
`19:28:38`, duration `1.15s`. The exact failing case was:

```text
FAIL test/core/m0-root-sid-ownership.test.ts > M0 model root SID ownership > keeps the latest instance when an external mount hook requests another root
AssertionError: expected '' to be 'C' // Object.is equality

- Expected
+ Received

- C

❯ test/core/m0-root-sid-ownership.test.ts:225:35
225|     expect(container.textContent).toBe('C');
   |                                   ^
```

That intermediate WIP is not an accepted candidate. Reconciler captures the old
root and changes its current token before entering the Fiber scheduler. A delay
inside Fiber teardown alone cannot protect subsequent mount callbacks and their
registry writes. A narrow additional lease for Reconciler was requested before
editing it. The strengthened test also checks completion ownership, model
binding, registry/DOM identity, callback counts and detached handler cleanup.

## Repair and the extended lease

Planner explicitly added `packages/renderer-dom/src/reconcile/reconciler.ts` to
the three-path lease after the actual lifecycle failure. The candidate has four
paths. No ComponentManager, public API, scheduler, editor, model, Word, dependency,
configuration or budget file changed.

The root boundary now builds a fresh subtree for a different explicit model SID.
It releases old component instances only when the instance's actual Element is
owned by that old Fiber. It does not use ComponentManager's global-SID fallback.
The old document remains live during asynchronous preparation. At commit, old
subtree lifecycle and portal ownership are released before new self-drawing
components mount. The latter mount occurs in **commit**, after teardown; normal
initial mounts retain their existing render-phase path. Same-root edits retain
their existing DOM and Text nodes.

Reconciler defers reentry only across synchronous commit/bookkeeping/publication.
It holds one latest pending request. It does not hold the gate across an
asynchronous render or prevent normal superseding/cancellation. The completed B
tree is recorded internally as the real ownership baseline before C starts.
If C is pending, B's external completion callback is suppressed. This internal
baseline is needed to release B's instances; it is not a claim that B delivered
an accepted completion to its caller. Destroy discards pending work. A callback
exception releases the gate in `finally`. A superseded synchronous preparation
checks current ownership before it can release old roots or current portals.

## Final changed-area evidence

Node: `/Users/user/.nvm/versions/node/v22.22.0/bin/node` (22.22.0).
Frozen graph receipt: primary `.omx/m0/536-root-sid-ownership-frozen-receipt.json`,
SHA256 `b949b6ad714fde45c9e86c45e6b19e5658cb04245760e0c42ff651c388174159`.
Workspace aliases point to this Issue 536 source root. No install or build ran.

Final test command, working directory `packages/renderer-dom`:

```sh
/Users/user/.nvm/versions/node/v22.22.0/bin/node node_modules/vitest/vitest.mjs run test/core/m0-root-sid-ownership.test.ts test/core/m0-portal-lifecycle.test.ts test/core/m0-fiber-retention.test.ts test/external-owns-its-dom.test.ts test/core/reconciler-lifecycle.test.ts --maxWorkers=1 --fileParallelism=false
```

Exit **0**, `5 passed` files, **52 passed** tests at `19:35:40`, duration `2.37s`.
Counts: new root ownership 13; unchanged portal lifecycle 17; Fiber retention 9;
self-drawing components 7; component lifecycle 6. The retained Fiber sample was
`5 Fibers / 1 generation / 79 enumerable objects` at all three printed checkpoints.
This is a graph regression result, not a total heap or RSS result.

The new tests cover actual root SID/content/DOM replacement, same-root DOM/Text
identity, overlapping child IDs, component lifecycle order, native getModel
binding, removed event handlers, self-drawing roots, foreign portal targets,
asynchronous cancellation, mount/unmount reentry, actual yielded lifecycle
reentry with a bounded latest C/D slot, destroy, callback exception, explicit
source Element targets, and stale synchronous preparation preserving C's portals.
Both reentry cases assert C's real instance/DOM/model/handler and suppress B's
external completion. A real asynchronous yield precedes the separate B mount
reentry case; it records mounts A/B/D and completion A/D.

Scoped source/test types: **exit 0, zero diagnostics**, 338 source/declaration
inputs. This in-memory TypeScript program uses the existing strict compiler
options, only the two changed source roots and the new test as entry files, the
repository as rootDir for workspace-source aliases, and the Node/jsdom types
required by the test environment. It writes no config or output:

```js
import ts from 'typescript';
import path from 'node:path';
const root = process.cwd(), pkg = path.join(root, 'packages/renderer-dom');
const config = ts.readConfigFile(path.join(pkg, 'tsconfig.tests.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, pkg);
const options = { ...parsed.options, rootDir: root, noEmit: true,
  types: ['node', 'jsdom'],
  typeRoots: [path.join(pkg, 'node_modules/@types'), path.join(root, 'node_modules/@types')] };
const names = ['src/reconcile/fiber/fiber-reconciler.ts', 'src/reconcile/reconciler.ts',
  'test/core/m0-root-sid-ownership.test.ts'].map(file => path.join(pkg, file));
const program = ts.createProgram(names, options);
const diagnostics = ts.getPreEmitDiagnostics(program);
console.log(`Scoped renderer source/test types: ${diagnostics.length} diagnostics, ${program.getSourceFiles().length} source/declaration inputs`);
if (diagnostics.length) process.exitCode = 1;
```

Earlier attempts are not PASS: the package-wide `tsconfig.tests.json` command
returned exit 2 with TS6059 rootDir/source-alias errors. A rootDir override then
exposed unrelated legacy test diagnostics, including missing `dom-reconcile`.
The first narrow in-memory attempts also exposed environment-resolution and new
test nullability/missing-unmount errors. The new test errors were repaired; the
final scoped program above passes. No full-package or whole-repository type
acceptance is claimed.

Scoped ESLint comparison used the ESLint API on the exact parent bytes from
`git show 2c889f64dcd7173cd02c037cb3e12640315db829:<path>` and current bytes for
both changed sources, with each real filePath and existing configuration. It
compared diagnostic counts by severity/rule/message, not line offsets. Exit **0**:

| Input | Parent errors/warnings | Candidate errors/warnings | New diagnostics |
| --- | ---: | ---: | ---: |
| fiber-reconciler.ts | 2 / 20 | 2 / 20 | 0 |
| reconciler.ts | 4 / 22 | 4 / 22 | 0 |
| new root ownership test | absent | 0 / 0 | 0 |

The direct ESLint CLI first returned exit 1 for the retained source diagnostics.
Those diagnostics were not removed, suppressed, or rebased. No baseline file
changed. `git diff --check` passed. A separate helper read the current sources
without executing tests and found no remaining blocker within the single DOM
model-root replacement scope.

## Explicit target and proof limits

An explicit portal Element reference remains that exact Element. The actual
test confirms that a reference inside A becomes detached with A; B's new portal
host targets that explicit old Element until the caller supplies B's new source
Element. The caller can then rebind it on a same-root render; disposal removes
the owned host. No automatic semantic counterpart mapping was introduced.
Current-source and external-target ownership remain covered by the unchanged
portal suite. This does not accept automatic rebinding across document roots.

The tested API is actual DOMRenderer with supported non-null model roots and
element-rendering templates. Tagless low-level Fiber roots and component-free
top-level child cleanup are not accepted by this evidence. No browser, native
print probe, performance measurement, full preflight, push, PR, deployment or
whole-M0 acceptance ran here. The prior Word hash mismatch FAIL and the unchanged
512 MiB gate remain open; this isolated defect does not establish their cause.
