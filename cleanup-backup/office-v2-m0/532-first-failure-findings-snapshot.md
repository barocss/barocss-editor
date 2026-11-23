---
work_id: wonffice-532
artifact_type: allocation-investigation
status: draft
owner_role: Execute Word Layout
source_request: https://github.com/barocss/barocss-editor/issues/532
last_updated: 2026-10-22
---

# Word line Range allocation

## Exact scope and source

- Work: 01a15f0a-7b41-7cc2-87f2-52eb044a3d73; parent #521, suite #520, M0.
- Managed root: /Users/user/.codex/worktrees/532-word-range/barocss-editor.
- Branch: codex/532-word-range.
- Parent: b679353f059c8075c05677d1a10e6fee83936b06; tree e6833337ebc0322029e9ff8460eb6080b09bf930.
- Original line-offsets.ts blob: d50eee3ed813c6cbd1f59db3d6315a3db6163039.
- Original SHA256: 82150af69c83e901ac6a5bf7051b2ab1ffc8b25c62a7a684d55231384d9d0dc8.
- Sole conditional paths: line-offsets.ts, new m0-line-offset-range-allocation.test.ts, this document.
- Primary main034a planning WIP, #527 W and #530 O/S/D are preserved.
- No normal H7, dependency/config/root, renderer/runtime/measurement/print or existing test edits.

## First actual-function failure, before any source repair

Node22.22.0; the office-word package resolves frozen Vitest1.6.1 (the root has
Vitest4.0.18, which this command does not execute). The new test calls the actual
exported lineStartOffsets with real DOM Text and Range endpoint operations.
Only getBoundingClientRect is controlled. Geometry is three four-character lines
at tops10/30/50 with height16. Expected anchors run:4 and run:8 pass. The exact
production binary-search query order also passes before the allocation assertion:

```
start offsets: 0,6,3,5,4,4,8,6,7,8,10,11
end offsets:   1,7,4,6,5,5,9,7,8,9,11,12
actual Range constructions: 12
actual detach calls:        12
```

Command (cwd packages/office-word):

```
/Users/user/.nvm/versions/node/v22.22.0/bin/node node_modules/vitest/vitest.mjs run test/m0-line-offset-range-allocation.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```

Preserved first command output, exit1 (1 test failed, no skipped tests):

```text
RUN  v1.6.1 /Users/user/.codex/worktrees/532-word-range/barocss-editor/packages/office-word

stdout | test/m0-line-offset-range-allocation.test.ts > M0 actual lineStartOffsets Range allocation > bounds Range construction while preserving the actual multiline probe sequence
RANGE_PROOF {"case":"multiline","anchors":[{"sid":"run","offset":4},{"sid":"run","offset":8}],"queries":[{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijkl","start":5,"end":6,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":7,"end":8,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijkl","start":11,"end":12,"top":50,"height":16}],"constructed":12,"detached":12}

 ❯ test/m0-line-offset-range-allocation.test.ts  (1 test | 1 failed) 19ms
   ❯ test/m0-line-offset-range-allocation.test.ts > M0 actual lineStartOffsets Range allocation > bounds Range construction while preserving the actual multiline probe sequence
     → one invocation must construct at most one actual DOM Range: expected [ …(12) ] to have a length of 1 but got 12

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/m0-line-offset-range-allocation.test.ts > M0 actual lineStartOffsets Range allocation > bounds Range construction while preserving the actual multiline probe sequence
AssertionError: one invocation must construct at most one actual DOM Range: expected [ …(12) ] to have a length of 1 but got 12

- Expected
+ Received

- 1
+ 12

 ❯ test/m0-line-offset-range-allocation.test.ts:47:91
     45|     console.info('RANGE_PROOF', JSON.stringify({ case: 'multiline', an…
     46|       constructed: observed.ranges.length, detached: observed.detached…
     47|     expect(observed.ranges, 'one invocation must construct at most one…
       |                                                                                           ^
     48|     expect(observed.detached).toEqual(observed.ranges);
     49|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  09:22:24
   Duration  1.15s (transform 41ms, setup 0ms, collect 24ms, tests 19ms, environment 843ms, prepare 155ms)
```

The constructor duplication is now reproduced through the actual function.
It permits the conditional one-invocation Range repair. It does not attribute
normal RSS to this function. These are controlled jsdom geometry checks, not
genuine browser/font/native heap measurements. Range.detach is observed as
logical cleanup only; no native-memory release guarantee is inferred.

## Next bounded action

Capture additional source behavior for marked same-SID runs, multiple SIDs,
float bands, display-only break text, empty/one-line/missing rectangles, changed
text/geometry/bands on a fresh invocation, and geometry exceptions. Then preserve
the same anchors and endpoint query traces while reducing constructions to one
per nonempty invocation. No Range may be reused across calls. Only new focused
and direct paragraph/float/table consumer checks are author-owned. Integration
owns aggregate/browser checks; #526 owns any later freshly leased normal profile.
Normal H7/v1.1/512MiB/frozen workload/media/no-GC remain unchanged. M0 is OPEN.

