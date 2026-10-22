---
work_id: wonffice-532
artifact_type: allocation-investigation
status: qa_ready
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

## Conditional repair and actual before/after proof

The only production change passes one invocation-owned Range to lineTopAt.
The first probe, binary search and final probe still set both endpoints and query
the same one UTF-16 code unit. The Range is created after the empty-text return,
and detached in finally after normal completion, missing first geometry or a
throw. There is no cross-call Range/cache, geometry/probe-count/order change,
anchor redesign or other source seam. A directly related comment now describes
linear geometry queries rather than per-character Range construction.

Final production blob: 5dd28b9b44cdd79054413a6d62f2c29198e6fd87.
Final production SHA256:
21be21264601f75a4465d3dec0475b4289647c6552e27dc6e240d887fd11d755.
New test blob: 0998c2f94afc3cd0395e981080a7cdb5380da00a.
New test SHA256:
c5ba264b9348e8319cba9dee63685198f03d832040a0ff759a1ff5fbc94b4b12.

The expanded baseline ran on the unmodified parent source: exit1,7 failed and
2 passed across9 tests. Every expected anchor and endpoint precondition passed
before its constructor assertion. The throwing case recorded13 constructors
and12 detach calls because the first geometry exception bypassed old cleanup.
After repair, all9 actual-function tests PASS. Parsing the actual before/after
RANGE_PROOF outputs and comparing their complete anchors/query JSON values
returned true in all9 cases, including the recorded error endpoint.

| Case | Geometry probes across case | Constructors before → after | Detach before → after | All anchor / endpoint / top / height / error records |
| --- | --- | --- | --- | --- |
| multiline | 12 | 12 → 1 | 12 → 1 | identical |
| marked-and-multiple-sids | 24 | 24 → 1 | 24 → 1 | identical |
| float-bands | 34 | 34 → 2 | 34 → 2 | identical |
| display-only-breaks | 12 | 12 → 1 | 12 → 1 | identical |
| empty | 0 | 0 → 0 | 0 → 0 | identical |
| one-line | 4 | 4 → 1 | 4 → 1 | identical |
| missing-rectangle | 1 | 1 → 1 | 1 → 1 | identical |
| fresh-text-geometry-bands | 30 | 30 → 3 | 30 → 3 | identical |
| throw-and-recover | 13 | 13 → 2 | 12 → 2 | identical |

Float bands contains2 invocations; fresh-text/geometry/bands contains3;
throw/recovery contains2. Each nonempty final invocation has a distinct actual
Range, while empty text constructs none. The marked case retains cumulative
same-SID offsets across DOM marks and switches to another SID. Highlighted
document text counts despite its chrome attribute, while display-only page/cell
break text does not. Changed content, geometry and band input are measured on
the next call. Throw/recovery uses a new Range and finally cleanup without
claiming that detach frees native RAM.

### Complete paired endpoint ledger

Each JSON line below records the actual original anchors/geometry queries.
The final output's complete anchors/query arrays were JSON-identical; only
constructor/detach counts differ. This is the output of the actual exported
function, not a replacement measurement/search algorithm.

```jsonl
{"case":"multiline","anchors":[{"sid":"run","offset":4},{"sid":"run","offset":8}],"queries":[{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijkl","start":5,"end":6,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":7,"end":8,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijkl","start":11,"end":12,"top":50,"height":16}],"constructedBefore":12,"constructedAfter":1,"detachedBefore":12,"detachedAfter":1}
{"case":"marked-and-multiple-sids","anchors":[{"sid":"s","offset":3},{"sid":"s","offset":6},{"sid":"t","offset":1},{"sid":"t","offset":4},{"sid":"t","offset":7}],"queries":[{"text":"AABB","start":0,"end":1,"top":10,"height":16},{"text":"EEFFGGHH","start":0,"end":1,"top":50,"height":16},{"text":"CCDD","start":0,"end":1,"top":30,"height":16},{"text":"AABB","start":2,"end":3,"top":10,"height":16},{"text":"AABB","start":3,"end":4,"top":30,"height":16},{"text":"AABB","start":3,"end":4,"top":30,"height":16},{"text":"EEFFGGHH","start":1,"end":2,"top":70,"height":16},{"text":"CCDD","start":2,"end":3,"top":50,"height":16},{"text":"CCDD","start":0,"end":1,"top":30,"height":16},{"text":"CCDD","start":1,"end":2,"top":30,"height":16},{"text":"CCDD","start":2,"end":3,"top":50,"height":16},{"text":"EEFFGGHH","start":3,"end":4,"top":70,"height":16},{"text":"EEFFGGHH","start":0,"end":1,"top":50,"height":16},{"text":"EEFFGGHH","start":2,"end":3,"top":70,"height":16},{"text":"EEFFGGHH","start":1,"end":2,"top":70,"height":16},{"text":"EEFFGGHH","start":1,"end":2,"top":70,"height":16},{"text":"EEFFGGHH","start":4,"end":5,"top":90,"height":16},{"text":"EEFFGGHH","start":2,"end":3,"top":70,"height":16},{"text":"EEFFGGHH","start":3,"end":4,"top":70,"height":16},{"text":"EEFFGGHH","start":4,"end":5,"top":90,"height":16},{"text":"EEFFGGHH","start":6,"end":7,"top":90,"height":16},{"text":"EEFFGGHH","start":7,"end":8,"top":110,"height":16},{"text":"EEFFGGHH","start":7,"end":8,"top":110,"height":16},{"text":"EEFFGGHH","start":7,"end":8,"top":110,"height":16}],"constructedBefore":24,"constructedAfter":1,"detachedBefore":24,"detachedAfter":1}
{"case":"float-bands","anchors":{"grouped":[{"sid":"float","offset":8}],"separate":[{"sid":"float","offset":4},{"sid":"float","offset":8},{"sid":"float","offset":12}]},"queries":[{"text":"abcdefghijklmnop","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijklmnop","start":2,"end":3,"top":10,"height":16},{"text":"abcdefghijklmnop","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijklmnop","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijklmnop","start":7,"end":8,"top":30,"height":16},{"text":"abcdefghijklmnop","start":9,"end":10,"top":50,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":70,"height":16},{"text":"abcdefghijklmnop","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijklmnop","start":11,"end":12,"top":50,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":70,"height":16},{"text":"abcdefghijklmnop","start":14,"end":15,"top":70,"height":16},{"text":"abcdefghijklmnop","start":15,"end":16,"top":70,"height":16},{"text":"abcdefghijklmnop","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijklmnop","start":2,"end":3,"top":10,"height":16},{"text":"abcdefghijklmnop","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijklmnop","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijklmnop","start":7,"end":8,"top":30,"height":16},{"text":"abcdefghijklmnop","start":9,"end":10,"top":50,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":70,"height":16},{"text":"abcdefghijklmnop","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijklmnop","start":11,"end":12,"top":50,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":70,"height":16},{"text":"abcdefghijklmnop","start":14,"end":15,"top":70,"height":16},{"text":"abcdefghijklmnop","start":15,"end":16,"top":70,"height":16}],"constructedBefore":34,"constructedAfter":2,"detachedBefore":34,"detachedAfter":2}
{"case":"display-only-breaks","anchors":[{"sid":"run","offset":4},{"sid":"run","offset":8}],"queries":[{"text":"abcd","start":0,"end":1,"top":10,"height":16},{"text":"efgh","start":2,"end":3,"top":30,"height":16},{"text":"abcd","start":3,"end":4,"top":10,"height":16},{"text":"efgh","start":1,"end":2,"top":30,"height":16},{"text":"efgh","start":0,"end":1,"top":30,"height":16},{"text":"efgh","start":0,"end":1,"top":30,"height":16},{"text":"ijkl","start":0,"end":1,"top":50,"height":16},{"text":"efgh","start":2,"end":3,"top":30,"height":16},{"text":"efgh","start":3,"end":4,"top":30,"height":16},{"text":"ijkl","start":0,"end":1,"top":50,"height":16},{"text":"ijkl","start":2,"end":3,"top":50,"height":16},{"text":"ijkl","start":3,"end":4,"top":50,"height":16}],"constructedBefore":12,"constructedAfter":1,"detachedBefore":12,"detachedAfter":1}
{"case":"empty","anchors":[],"queries":[],"constructedBefore":0,"constructedAfter":0,"detachedBefore":0,"detachedAfter":0}
{"case":"one-line","anchors":[],"queries":[{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":10,"height":16},{"text":"abcdefghijkl","start":9,"end":10,"top":10,"height":16},{"text":"abcdefghijkl","start":11,"end":12,"top":10,"height":16}],"constructedBefore":4,"constructedAfter":1,"detachedBefore":4,"detachedAfter":1}
{"case":"missing-rectangle","anchors":[],"queries":[{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":0}],"constructedBefore":1,"constructedAfter":1,"detachedBefore":1,"detachedAfter":1}
{"case":"fresh-text-geometry-bands","anchors":{"first":[{"sid":"current","offset":4},{"sid":"current","offset":8}],"changed":[{"sid":"current","offset":8}],"regrouped":[]},"queries":[{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":40,"height":16},{"text":"abcdefghijkl","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijkl","start":5,"end":6,"top":40,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":40,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":40,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":70,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":40,"height":16},{"text":"abcdefghijkl","start":7,"end":8,"top":40,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":70,"height":16},{"text":"abcdefghijkl","start":10,"end":11,"top":70,"height":16},{"text":"abcdefghijkl","start":11,"end":12,"top":70,"height":16},{"text":"abcdefghijklmnop","start":0,"end":1,"top":80,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":110,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":80,"height":16},{"text":"abcdefghijklmnop","start":6,"end":7,"top":80,"height":16},{"text":"abcdefghijklmnop","start":7,"end":8,"top":80,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":110,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":110,"height":16},{"text":"abcdefghijklmnop","start":14,"end":15,"top":110,"height":16},{"text":"abcdefghijklmnop","start":15,"end":16,"top":110,"height":16},{"text":"abcdefghijklmnop","start":0,"end":1,"top":80,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":110,"height":16},{"text":"abcdefghijklmnop","start":4,"end":5,"top":80,"height":16},{"text":"abcdefghijklmnop","start":6,"end":7,"top":80,"height":16},{"text":"abcdefghijklmnop","start":7,"end":8,"top":80,"height":16},{"text":"abcdefghijklmnop","start":8,"end":9,"top":110,"height":16},{"text":"abcdefghijklmnop","start":12,"end":13,"top":110,"height":16},{"text":"abcdefghijklmnop","start":14,"end":15,"top":110,"height":16},{"text":"abcdefghijklmnop","start":15,"end":16,"top":110,"height":16}],"constructedBefore":30,"constructedAfter":3,"detachedBefore":30,"detachedAfter":3}
{"case":"throw-and-recover","anchors":[{"sid":"recover","offset":4},{"sid":"recover","offset":8}],"queries":[{"text":"abcdefghijkl","start":0,"end":1,"error":"controlled geometry failure"},{"text":"abcdefghijkl","start":0,"end":1,"top":10,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":3,"end":4,"top":10,"height":16},{"text":"abcdefghijkl","start":5,"end":6,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":4,"end":5,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":6,"end":7,"top":30,"height":16},{"text":"abcdefghijkl","start":7,"end":8,"top":30,"height":16},{"text":"abcdefghijkl","start":8,"end":9,"top":50,"height":16},{"text":"abcdefghijkl","start":10,"end":11,"top":50,"height":16},{"text":"abcdefghijkl","start":11,"end":12,"top":50,"height":16}],"constructedBefore":13,"constructedAfter":2,"detachedBefore":12,"detachedAfter":2}
```

Canonical SHA256 of each case's shared {anchors,queries}, using JSON sorted keys,
compact separators and UTF-8 (same before and after):

```text
multiline 2ad5aa3cb91e6f6a50b0f0e7096ab0cb13318e264c52d09e73aa2d0375756caa
marked-and-multiple-sids 8974b05b73e2ce0779d68614a45f3c4e9c1e58b568ed5ba4b3cf897cada01b3c
float-bands 98441076971612fbb4b7871667b13843dcbfdaa4186db398b35e0442b4110d91
display-only-breaks dbaf4a334b493054cac33ac2759c65c5afc91f55b8087569de7b7c277a819d0d
empty d78ddc46d11488929f0f5dde9a754841721629a6105c503e6554f919dab75754
one-line 46e34f12b01c6b1595d045034847013830c8c534d3ba1093085693eab777f01f
missing-rectangle fed383bea6c07d46b760b0402f1869c343314a600be84f340bb11c0377ef231d
fresh-text-geometry-bands 66af822b7654f460f92357e4bbab9c5b5a1792606ca5112c00da8e1073f52249
throw-and-recover bfa0518266d1d7492d2c9021f40a5b3f62ea45b1a1a49603ffe278a8223cb5b6
```

## Targeted checks and first-failure boundaries

Frozen dependency receipt:
`/Users/user/barocss-editor/.omx/m0/532-word-range-dependency-links.json`.
Integration reports46 node_modules folders,654 symlinks and145 created directory
entries; workspace imports resolve to this532 tree, externals to the frozen522
graph. Node22.22.0, office-word Vitest1.6.1, TypeScript5.9.3 and ESLint8.57.1.
The author did not install dependencies or write graph/root/config/lock files.

| Command / scope | Actual result |
| --- | --- |
| First new test, original source; command above | Exit1;1 failed. Actual12 constructors with both anchor and12-query expectations already PASS. Full first transcript preserved above. |
| Expanded new test, original source; same command | Exit1;7 failed/2 passed, no skips. All9 actual anchors/query vectors captured before repair. |
| From packages/office-word: `node node_modules/vitest/vitest.mjs run test/m0-line-offset-range-allocation.test.ts test/pagination.test.ts test/table-cell-pagination.test.ts --maxWorkers=1 --minWorkers=1 --no-file-parallelism` | Exit0;64/64: new9, pagination39, table-cell16; zero skips;5.37s. |
| Root: `node node_modules/typescript/bin/tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --lib ES2022,DOM,DOM.Iterable --skipLibCheck packages/office-word/src/line-offsets.ts` | Exit0;0 diagnostics in the changed standalone source. |
| From packages/office-word: `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | Exit2;100 unused-symbol diagnostics in unchanged editor-view-dom/renderer-dom source files, none in line-offsets.ts. First: decorator-prebuilder.ts11 unused DecoratorPosition. This raw package check is FAILED, not0/PASS. No unowned fixes, baseline suppression or budget increase. No separate parent package rerun was performed, so this is not a measured before/after package-diagnostic comparison. |
| Root: `node scripts/typecheck-tests.mjs office-word` | Exit0; unchanged7/7 diagnostic budget, not0 diagnostics. No baseline edit or adopt. |
| Root: `node node_modules/eslint/bin/eslint.js packages/office-word/src/line-offsets.ts packages/office-word/test/m0-line-offset-range-allocation.test.ts` | Exit0;0 errors/0 warnings in both owned files. |
| `git diff --check` | PASS before immutable handoff. |

The existing pagination39 and table-cell16 tests check direct anchor consumers
(paragraph/widow/orphan/float boundaries and table-cell continuation contracts).
They do not invoke lineStartOffsets and are not substituted for the9 actual
Range-function tests. The read-only helper selected this bounded consumer scope;
another read-only helper found no blocking source/test issue. Helpers edited
nothing and ran no tests, browser, profile or process actions. Parent owns final
verification.

## Integrity and remaining acceptance

The old curated17-source list does not include line-offsets.ts. Integration's
extra baseline sidecar is
`/Users/user/barocss-editor/.omx/m0/532-line-offsets-baseline-sidecar.json`.
Bind the exact new source blob/SHA above as an additional immutable sidecar
before any future runtime/profile; preserve normal H7 and its original integrity
list. Do not silently claim the old17 cover this file or change the normal
harness, frozen input/media, v1.1 targets,512MiB budget or no-GC protocol.

This establishes fewer Range constructions with identical controlled geometry
queries and anchors. jsdom controlled rectangles are not real browser/font,
native-memory, timing or RSS proof. Existing normal Word100 RSS
597786624/590364672/545865728 remains FAIL; empty native-attribution samples
and Runtime observer counters do not attribute it to this function. Browser and
integrated source checks are NOT RUN by the author. Integration chooses the
meaningful aggregate/browser checks; #526 alone may receive a new independent
normal performance window afterwards. No current qualification or release claim.

No push/PR/deploy, real DB or unrelated process operation, new schedule, old
backlog/M1/M2 activation, fixture reduction, sampler/flag workaround, print or
renderer/runtime change occurred. The exact3path checkpoint is ready for immutable
handoff; whole M0 and the normal resource gate remain OPEN.
