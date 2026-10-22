# Slides connector baseline follow-up (#538)

This is the authorized Slides user-flow follow-up to #521. It does not add a new gate to original M0 criterion 7. That criterion records the format corpus baseline and declared loss. Full Slides feature parity and collaboration remain outside this follow-up.

## Source and ownership

- Base: `4dc191bc442c260ab320f3d8a229fe2c3db98d9f`.
- Branch: `codex/538-slides-m0-baseline`.
- Author root: `/Users/user/.codex/worktrees/slides-m0-baseline/barocss-editor`.
- Execute Slides Baseline owns the single changed test file. Integration owns dependencies, shared runtime and local integration.
- The predecessor's source, original failures, user tabs, servers and stores remain preserved.

## Diagnosis and change

The five failures in historical browser log 21 also failed on the original f4 baseline in log 22. They stop at old UI access paths:

| Failed step | Current user path | Preserved assertion |
| --- | --- | --- |
| Missing `insert-connector` in the closed toolbar | Open the header Insert menu. Check disabled with one selected shape, then enabled with two. Click its connector action. | Exactly one drawn line, original ordered node IDs, route and stored endpoint coordinates. |
| Ambiguous route label | Open the Properties panel and select the named combobox. | Native kind and rendered route both change; the end cap changes to hollow. |
| Ambiguous label field | Open the panel and use the exact named textbox. | Model text, drawn text and placement, movement with the shape, then empty text removal. |
| Ambiguous flow label | Open the panel and use the named checkbox. | The native flow value becomes true. |
| Hidden waypoint clear button | Open the panel through its visible menu, then click Clear. | The count is two and the resulting native waypoint array is empty. |

The same panel access pattern is applied to previously unrun direction, label type and endpoint-label tests. No production code, assertion, skip, timeout or product behavior was changed. No forced clicks were added.

## Evidence boundaries

Original evidence remains at `/Users/user/barocss-editor/.omx/m0/integration-logs/21-EDWP3-slides-connector-browser.{json,txt}` and `22-f4-slides-five-baseline.{json,txt}`, with their sibling trace directories. Log 21 is 21 PASS, 5 FAIL, 17 NOT RUN and two suite/teardown errors. It binds to `7d59d0093f7ef174555608242b4734979f5cc874`; the baseline comparison binds to `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`.

The 21 old passing cases remain historical evidence. Six Renderer production files changed before the current base, so the old result is not described as a source-identical current full-suite PASS. The current selection first covers only the five failed and seventeen unrun cases. It does not repeat the old passing cases merely to acknowledge handoff.

The original suite uses native commands to prepare models and to perform some edits. Its panel actions and gestures execute in a real browser. A passing test proves its stated mixed command/UI path; it does not prove an entirely pointer-driven workflow, real-account collaboration, server durability, physical IME, or the entire Slides feature inventory.

## Focused verification

- Node 22.22.0, pnpm 8.15.0, Integration's frozen graph receipt `9505052a191921989aef3302dcbd017e0251912524504e6c2b358cc183f9ad14`.
- `node scripts/typecheck-tests.mjs slide`: PASS, 0 diagnostics / 0 budget.
- ESLint on `apps/slide/tests/connector.spec.ts`: exit 0, 0 errors, 80 explicit-any warnings in the existing test style.
- Playwright v1: **22/22 PASS**, no skipped, failed, flaky or suite-error cases. Browser duration 76.053 seconds; total recorded runner duration 79.887 seconds. Original bounds remain 30 seconds per case and 120 seconds global; one worker and zero retries.
- Current browser evidence: `/Users/user/barocss-editor/.omx/m0/slides538-browser-v1/`. `result.json` contains all case results; `execution.json` records command, source hash, timestamps, process ownership and protected listener IDs. `checksums.json` binds these files.
- The executed test SHA256 is `4189fd67594084568414b3e9286757a5ff128d712fc99b9f328ff54e45f233e5`, unchanged before and after. All observed owned processes exited. Port 55261 is free. Protected listeners 55262–55266 retain the same five PIDs.
- The five historical failures were stale test access paths. Their actual current menu/panel flows and all downstream original assertions now pass. No production defect was demonstrated in this selected scope.
