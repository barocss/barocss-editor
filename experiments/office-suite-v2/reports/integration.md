# M0 integration — bounded local decision pack v1

**M0 remains OPEN.** All delivered prototype code and independent native correctness checks pass on exact source V `bfda7d531a8e8924219e8b4c7cf6ca71737249d5`, tree `ffb6680184ab3f1020cb5351627742ba3aa8fcc7`. The final aggregate has **0 strict diagnostics and 104/104 native tests passed, 0 failed, 0 skipped**. This is a local bounded source checkpoint, not M0, M1/M2 product, Office interoperability, performance-budget or release acceptance.

Scope: `office-v2-m0/integration-v1`, #522 under #521/#520. This final commit changes only the Integration-owned receipt. Its exact commit/tree and the local develop pointer are published after commit in primary `.omx/m0/integration-control.json`; the tested source V remains the immutable execution binding. No self-referential commit hash is embedded in its own tree.

## Final command and preserved source

- Actual environment: Node22.22.0, pnpm8.15.0, TypeScript5.9.3, frozen standalone graph; Yjs13.6.29 and Node declarations22.20.2. Root workspace registration is unchanged.
- From `experiments/office-suite-v2`: `pnpm --ignore-workspace check`, exit0, 6.286s, 2026-10-21T15:01:19.813151Z to15:01:26.099157Z. Strict compiler: **26 roots plus imports, 0 diagnostics**. Native Node runner: **16 test files,104 passed,0failed,0skipped**. Corpus generation, native Office readers and scale/browser runs are separately fixed evidence, not silently replayed by this native test command.
- Full stdout and command/status/elapsed JSON: `/Users/user/barocss-editor/.omx/m0/integration-logs/16-V-final-combined-check.{txt,json}`. The source closure stays unchanged in this report-only successor; no code test repeat is required for receipt text.
- Exact owner blob validation:110 bindings in primary `.omx/m0/final-owner-blobs.json`. C's contract blob is unchanged. Final Core/Formula/Collaboration/prose/store/runner and all82 Verification files match their immutable producing commits. No Integration semantic edits or duplicate engine were introduced.
- Primary `main` remains `034a42c36924bc9a9808847d065e542cb5390c4c`, with the same four approved planning WIP files and hashes. Root package/workspace/lock, existing lint/type debt budgets and production source remain unchanged. The four approved planning files copied into S remain byte-identical to their preserved snapshot.
- All commits use verified easylogic author and committer with no coauthor. Ordinary product push/PR/deploy, legacy WIP replay, real existing DB writes, old role/schedule activation and unrelated process stops did not occur.

## Immutable intake ledger

| Receipt | Exact head | Owned contribution / check boundary |
| --- | --- | --- |
| S | `9b390602d90e07f496b7b699915b7d605582d8a4` | Four approved planning copies, latest-human testing policy, standalone graph/strict/native runner and scaffold smoke. |
| C | `6ad373b4c31b7ec7aa97b75d8f6cb89b7174fc0e` | Sole shared Core types/key codec and manual; targeted strict0, no runtime claim. |
| I1 | `1d443e47f39d9e6009a7f0ae8724d7cc9f9e05da` | Ignore frozen symlink as well as directory; Word setup receipt only. |
| P | `7f1602c4b2c3519c1af14f4d259de9ee70d89078` | Real prose and disposable store partial source; first combined16/16 strict0 at P. |
| R | `1458fa7d4c7396bbd8b9edb36f07ee4e1864f326` | Genuine Core workbook/projector/tests/manual; author28/28, C unchanged. |
| J | `a332facd6740c491f761be39dbeee2c6a6a24f70` | Disjoint P/R join; combined44/44 strict0. First bounded local develop checkpoint. |
| H | `702b9f8dc7d412c41d179fddeaf2e1e0d3ce85d3` | Actual Sheet provider/admission and bounded store update; author22/22; original H preserved. |
| F | `b785fd65c6fae71c57b70650b06f69a68bea3070` | Actual parser/reference/calculator; author18/18. Historical incorrect arithmetic oracle is preserved, not accepted as final. |
| M | `8184e7f4a7bea8981825c5b0924920e304553dd1` | Disjoint H/F join; combined72/72 strict0. Later source-review findings remained open. |
| K | `23fa95116b11882be4905ae257c0859911a2b88a` | Owner-only causal-frontier correction/regression/manual; parentM, targeted Sheet12/12 strict0. |
| Q | `3f8354c6bb733bc597488d64c3bf41e5f650f6f8` | Owner-only parser/arithmetic/reference regression/manual; parentK, focused/targeted checks PASS. |
| V | `bfda7d531a8e8924219e8b4c7cf6ca71737249d5` | Exact82 Verification-only files; parentQ; final combined104/104 strict0. |

Each intake verified exact parent/head/tree, role-owned paths, identity, clean Integration state and diff checks. Joined commits preserve original histories and owned blobs. Authors used disjoint worktrees and the shared frozen graph. New semantic findings returned to the named owner and arrived as new immutable candidates.

## Bounded decisions and native format

The prototype keeps our sparse workbook, commands, typed formula AST, references and calculation in our own code. Core v1 is the only native operation/projection authority. Literal/formula/invalid input records are atomic; displayed formula text and calculated values are derived. Stable sheet/row/column identities and tombstones define reference/undo behavior. Valid refused/pending events remain in the event history. General concurrent moves/overlapping merges explicitly refuse; no snapshot fallback or ID reuse supplies those operations.

Yjs13.6.29 remains the low-level candidate demonstrated by actual granular Sheet event transport and bounded `Y.Text` prose. It is not adoption of the old generic adapter or a production engine registration. Per-session undo preserves remote contributions; structural undo can return recoverable conflict. Core projection and native validity are independently checked alongside replica convergence. Bounded actor/session and raw/hidden-update admission seams are exercised; no OIDC identity or hardened hostile-parser sandbox is inferred.

Version1 contracts are in `src/contracts.ts`, `docs/core-contract.md`, `docs/formula-contract.md` and `docs/collaboration-contract.md`. WorkbookContext binds document/workbook/generation and contract/engine/schema/adapter versions. The controlled durable Admission additionally binds its engine ID. Persistence records immutable update IDs, SHA-256 payload hashes, native bytes, exact included IDs/frontier and checkpoint+tail replay. Broadcast/local apply is distinct from durable acknowledgment. An exact retry is idempotent; lost ACK and later input remain distinct. These are disposable SQLite/provider proofs, not a deployed service, backup/retention plan or actual current-account product acceptance.

Supported arithmetic now follows the chosen [Microsoft precedence table](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel): unary negation precedes exponentiation and equal-precedence operators evaluate left to right. Q and independent Verification correct the earlier F/K edge expectations; explicit parentheses preserve the alternative grouping. Existing typed native ASTs are not automatically reparsed or migrated. The M0 function profile is SUM/IF and the bounded documented arithmetic/reference cases; the larger M3 function/file/UI profile is not implemented by this checkpoint.

## Evidence matrix and unresolved original gates

The independent detailed matrix is [Verification criteria](../verification/reports/criteria.json), with exact logs, corpus, raw phases and source bindings in [Verification receipt](../verification/README.md).

| Original evidence area | Actual result | Limit / remaining prerequisite |
| --- | --- | --- |
| Native two-sheet model, reference/copy/cut, concurrent structure/cells, alternatives and session undo | PASS in controlled owner and independent native tests on final source | Full product UI, general move/merge and later function profile are not inferred. |
| Prose text/marks/split/join, anchors and session undo | PASS for actual bounded Y.Text sample | No full Note block/nesting/list/table codec or production editor binding. |
| ACK-loss retry, checkpoint+tail, real new-process reopen, access/version refusal and pending retention | PASS for actual disposable store and controlled trusted sessions | Actual OIDC/current-account/production server/asset/recovery requirements remain M1/M2. |
| Raw actor/body tamper and causal frontier | PASS in actual owner/independent checks | Independent probes do not claim every owner hidden-payload case. Full10k collaborative provider scale is NOT RUN. |
| Required Sheet model workload | Three fresh bounded actual Core/Formula samples completed:10k rows,100columns,50k populated including10k formulas | Observational under uncontrolled contention. It bypasses provider/durability/UI. No qualified capacity/budget, scroll/keystroke/physical-IME claim. |
| Native Office fixture readers | Actual Microsoft Word/Excel/PowerPoint16.114 bounded original/export/open/read evidence | No product XLSX/PPTX adapter, edit-recalc, broad format fidelity or full Office acceptance. |
| Current DOCX round trip | Basic text/table/horizontal merge PASS; full feature corpus FAIL with explicit losses/warnings | Numbering/image/header/footer/footnote parts are lost. Original corpus retention is not a product retention workflow. |
| Word one-page smoke and tiny discriminator | PASS; actual16-paragraph same-pattern diagnostic produced2pages with schema/root/surface agreement | These cannot substitute for100/300-page evidence. |
| Word100-page probe | FAIL/NOT QUALIFIED:45s timeout,800paragraphs/2414elements,0sheets | Cause remains UNKNOWN: severe ambient contention and product behavior were not separated. No valid100-page layout/print sample. |
| Word300-page probe, exact fonts/fallbacks and qualified numerical budgets | NOT RUN / incomplete | Need a named qualified reference environment, verified font provenance, successful source-bound100/300 layout/print observations and frozen budgets before M0/M1 exit. |
| Complete M0 decision/next-stage ownership acceptance | Incomplete, Planner-owned | This bounded pack preserves decisions/evidence and proposes the split below; exact future production Issue/file leases are not activated here. |

Model observations at historical F: peak RSS417,005,568bytes; canonical revision12,466,063bytes for10,152events; cold Core p50~866.34ms, initial calculation p50~66.49ms; single-edit Core projection p50~883.28ms and diff p50~543.22ms, separate from dirty calculation p50~0.047ms. Calculator dirty incrementality does not remove Core projection/diff costs. Raw samples/percentiles and source reuse proof through Q are retained; the typed-AST workload did not invoke Q's changed parser. No scale or browser measurement was repeated for this report/final aggregate.

## Preserved first failures and owner resolution

| First observation | Classification / disposition |
| --- | --- |
| Optional registry lookup: EEXIST/EACCES in shared npm cache | Environment lookup failure; no cache deletion/permission change. Selected actual existing-lock Node declarations, standalone frozen install passed. |
| Initial scaffold strict check:7missing Yjs DOM declarations | Integration config issue, fixed by required DOM declarations; strict flags and skipLibCheck=false preserved. Exact first failure and identical successful rerun retained. |
| Formula NODE_OPTIONS test-concurrency command:exit9 before tests | Command failure, corrected to unchanged sequential runner; no source/oracle waiver. |
| H frontier regression:64edits stored2528dependency IDs, expected64 | Actual new failing regression preserved; owner K uses covering causal frontier. Fixed64edges, independent40edges and three offline branch contexts checked. Width remains actual concurrency, not a constant-size promise. |
| K arithmetic focused checks:3failures with -4/512/-64 versus expected4/64/64 | Incorrect profile/parser/oracle, corrected only by Formula Q. The same focused checks and independent arithmetic now pass. Historical F expected tests remain in Git. |
| Word harness/native-reader setup failures | Verification preserves CJS API, React prebundle/CDP CSS and initial native Word timeout separately from subsequent bounded source/UI successes. |
| Word100-page45s stabilization failure | Unresolved/UNKNOWN under unqualified load and swap pressure; first log/raw diagnostics preserved, no identical heavy-repeat loop,300NOT RUN. Tiny2-page success does not erase this failure. |

## M1/M2 handoff split — proposed responsibility, not a write lease

The current source/producer contracts below are exact. Later product destinations, Issues and file leases require Planner's explicit scoped records after M0 gates pass. No M1/M2 author, schedule, package registration, migration or production edit is activated by this table.

| Stage / responsibility | Current exact handoff and producer | Required next contract / acceptance |
| --- | --- | --- |
| M1 common engine admission and host | Core #523: `src/contracts.ts` atC and `src/workbook.ts` atR; Collaboration #525: `sheetAdmission`/`sheetUpdateValidator` in `src/collaboration.ts` atK | Runtime/Workspace responsibility must bind trusted tenant/workspace/document/generation plus engine/schema/adapter versions at every effect; one mutable authority and read-only projection. Proposed seams are existing Office host/auth/workspace/API/service families; Planner must name exact production files/Issue before edits. |
| M1 durable transport/checkpoints/access/assets | Collaboration #525: `src/durable-store.ts` atH; native admission/binding atK; Integration #522 owns shared graph/registration/runtime | Replace disposable controlled callbacks/storage with separately scoped actual auth/current-ACL/durable update/checkpoint service. Preserve fixed update IDs, receipts, ACK-unknown/later drafts, revoked pending retention, replay/compaction, asset-finalize before confirmation and legacy snapshot exclusion. Two actual accounts, restart/recovery and isolated restore remain required. |
| M1 independent integration verification | Verification #526: full `verification/**` atV; Integration aggregate binds exact V source | Reuse only unchanged blob-bound evidence. Add actual Office/OIDC/service/database/browser account and negative-recovery evidence on the same candidate. Qualify Word/fonts/budgets first; do not promote controlled fixtures or native reader opens. |
| M2 native Sheet vertical slice | Core #523 R/C; Formula #524 `src/formula.ts` atQ, `src/references.ts`/`src/calculation.ts` atF; Collaboration #525 K/H | Keep our engine/typed AST as sole authority through a qualified M1 host. A separately named Sheet-view owner/file scope must add virtualized Canvas2D+DOM input/accessibility, native Save/Open/re-edit and declared export. Existing experiment paths are inputs to adoption, not a production registration. |
| M2 collaborative Note/prose slice | Collaboration #525 `src/prose.ts` atP plus durable host contracts; existing Editor/native consumers remain preserved | An explicitly leased Editor/Prose owner must define the complete native Note codec/binding and input/history/recovery seam. Bounded newline/Y.Text sample is insufficient for all Note structures. Require two-account live edit, session undo, durable reopen/re-edit and denied/revoked/unknown-ACK behavior on the same integrated candidate. |
| M2 acceptance and later expansion | Planner owns whole criteria; Integration owns serial shared-resource verification; current authors retain exact scoped technical contracts | Create/reuse exact M1/M2 Issues and production paths before dispatch. Preserve M3 moves/merges/functions/XLSX/grid and M4 Word/Slides fidelity/layout limits. Release, install/privacy/account/operator/backup gates remain separate. |

## Final checkpoint and next action

The source-scoped turn ends after this receipt commit, exact metadata/blob/diff checks, local develop advancement and result delivery to Planner/affected authors. Primary main/WIP stays untouched. The final report commit can be recovered from the named Integration branch and control receipt; all immutable candidates and first failures remain in history.

No active Integration command, browser server or measurement lease remains. Verification reports its owned browser/server/fixture windows cleaned and both ports55260/55261 free; final read-only listener checks confirm ports without stopping another process. Native Office applications may remain running. Existing unrelated processes/databases and old schedules stay untouched.

**Next owner: Planner.** Record the whole #521 decision as OPEN, qualify the Word100/300/font/reference-budget prerequisite, and authorize exact M1/M2 Issue/file ownership when ready. Do not restart unchanged performance probes, select a new backlog or infer release authority from104green native tests.

---

## Preserved Phase A and setup record

# M0 integration — Phase A scaffold receipt

Scope: `office-v2-m0/integration-v1`, Issue #522 under #521/#520. Observation: 2026-10-21T14:14:53.812902+00:00.

## Source and checkpoint

- Immutable parent: `034a42c36924bc9a9808847d065e542cb5390c4c`; parent tree: `13a66ea9a2ee596a9cfb0f7ce4f5ee447cb049c2`.
- Managed worktree: `/Users/user/.codex/worktrees/522-m0-integration/barocss-editor`; branch: `codex/522-m0-integration`.
- This receipt is part of scaffold S. Its exact commit/tree, copied-file hashes, actual commit identity, owned paths and final dirty state are recorded after commit in `/Users/user/barocss-editor/.omx/m0/integration-control.json`. No self-referential commit hash is placed inside the commit.
- Initial ACK: clean isolated parent on the named branch; primary planning WIP preserved. Current remote reads found #520/#521/#522 open and Draft PR #519 separate. Remote main/develop remained `034a42c...` / `1190dce...`; their tracked tree is identical.
- Git default identity differed from the required identity. Commit-scoped environment variables supply `easylogic <cyberuls@gmail.com>` for author and committer; global/local configuration is not changed. Actual metadata is checked after commit.

## Phase A result

| Criterion | Result | Evidence and boundary |
| --- | --- | --- |
| A: isolate exact baseline | PASS | Managed worktree from the assigned parent, named branch, approved-copy hashes below; primary checkout preserved. |
| B: fixed runtime/graph | PASS | Node22.22.0, pnpm8.15.0; frozen standalone install; TypeScript5.9.3, Node declarations22.20.2, Yjs13.6.29. Six locked packages; primitive is still a candidate. |
| C: current test policy | PASS | Same latest-human policy inserted below the title in AGENTS.md and operating workflow. No legacy requirement was deleted or budget changed. |
| Targeted/combined scaffold checks | PASS | Strict check: 0 diagnostics; 4 native Node tests passed, 0 skipped. These are runtime/dependency/scaffold tests, not domain evidence. |
| Runner refusal/error propagation | PASS | Four controlled negative cases exit nonzero: dependent type error, failing test, empty test selector and missing input. The harness expects these failures. |
| D/E: domain integration and aggregate result handoffs | NOT RUN | No author candidates or Core contract C have arrived in Phase A. The S delivery message/receipt supplies this phase's source-bound setup only. |
| Full repository preflight/build/product suites | NOT RUN | Production packages, root graph, root config and budgets are unchanged. A full baseline is not justified for this isolated scaffold. |
| M0 original #521 acceptance | NOT RUN | No native workbook/formula/prose/binding/durable recovery/corpus/scale decision-pack acceptance at S. |

## Actual commands and first failures

Commands ran with the fixed Node directory first in PATH, from `experiments/office-suite-v2` unless stated. Full output and command/status/elapsed JSON are in `/Users/user/barocss-editor/.omx/m0/integration-logs/`.

| Log ID | Actual command | Exit | Elapsed |
| --- | --- | --- | --- |
| `01-lock` | `pnpm --ignore-workspace install --lockfile-only --ignore-scripts` | 0 | 1.564s |
| `02-lock-node22-types` | `pnpm --ignore-workspace install --lockfile-only --ignore-scripts` | 0 | 0.853s |
| `03-frozen-install` | `pnpm --ignore-workspace install --frozen-lockfile --ignore-scripts` | 0 | 3.037s |
| `04-scaffold-check` | `pnpm --ignore-workspace check` | 1 | 2.273s |
| `05-scaffold-check-fixed-libs` | `pnpm --ignore-workspace check` | 0 | 2.925s |
| `06-runner-guards` | `python3 /Users/user/barocss-editor/.omx/m0/verify-runner.py` | 0 | 3.123s |
| `07-targeted-types` | `pnpm --ignore-workspace type-check -- scripts/scaffold.test.ts` | 0 | 2.158s |
| `08-targeted-tests` | `pnpm --ignore-workspace test -- scripts/scaffold.test.ts` | 0 | 1.362s |

First observed environment failure: optional `pnpm view @types/node@22.18.0 version` exited 1 through npm's registry lookup with `EEXIST` and `EACCES` creating `/Users/user/.npm/_cacache/content-v2/sha512/3c/55`. Its diagnostic is preserved in `02a-registry-probe-failure.txt`; elapsed time was not measured. No shared cache deletion, permission change or repair was attempted. The actual baseline lock already contains Node declarations22.20.2, which were selected for built-in SQLite types. Standalone lock generation and frozen install then succeeded.

First actual scaffold-check failure: `04-scaffold-check` exited 1 at strict TypeScript with 7 Yjs declaration diagnostics. First: `YXmlFragment.d.ts(161,30) TS2304: Cannot find name 'Document'`. Classification: Integration-owned compiler-library configuration, not a domain failure. Added DOM/DOM.Iterable declarations required by Yjs public XML types. Strict flags and `skipLibCheck=false` are preserved. `05-scaffold-check-fixed-libs` reran the same aggregate command successfully. Tests had not run in the failed aggregate chain; the successful rerun ran all four.

The controlled runner guard failures are expected negative tests and are not unresolved acceptance failures. SQLite emits its normal experimental-API warning; no database is opened by the scaffold test. No root dependencies were installed.

## Approved planning-copy binding

The only inherited planning WIP copied into S is the four approved files. Each copy was verified byte-for-byte before scaffold edits and remains unchanged in S relative to that copied snapshot.

| Path | SHA-256 in primary and S copy |
| --- | --- |
| `docs/ROADMAP.md` | `e71ebaf85bb7d0a35c3636e310f9de1120cc9c20f4356cd7f9d4bbe05cd6caf6` |
| `docs/specs/office-suite-v2.md` | `ea119a4d9d3d8f6b2c0b72d7c8b29c2e71ab5a899f2b604cd4f26d6298f61c95` |
| `.dev/plans/office-suite-v2/10-feature-brief.md` | `bb908c6f7b7b4c99dcdebc0a04d119f993b1a1b52b983c44deb4a02da024a895` |
| `.dev/plans/office-suite-v2/20-m0-execution.md` | `3331f284157fc81cb4b99783bb68fb628102f07fd5508583d18e269d7f1d7aed` |

## Reproduction, broad checks and next owner

Use the exact installed graph described in README and the primary control receipt. Authors link that fixed `node_modules` only after matching their manifest/lock against S. Authors do not install divergent dependencies. Native tests use Node's own runner; no additional test framework is installed. `pnpm --ignore-workspace type-check -- <owned-files>` compiles imports too; `pnpm --ignore-workspace test -- <owned-test-files>` fails on an empty selection.

Core #523 next publishes contracts-only immutable C from S. Formula #524 and Collaboration #525 wait for C, use that native contract and do not duplicate shared types. Verification #526 may prepare its independent corpus/baselines from S. Integration owns any later root dependency setup and private browser/port lease when the selected baseline requires them; the scaffold starts no runtime or DB.

Phase B waits for explicit candidate/contracts or new directions. Integrate only immutable owned deltas, then run all M0 types/tests once per meaningful combined batch. Add affected root checks and the unchanged broad preflight when combined source/shared dependencies/interfaces/production seams justify them; do not demand a full repository run from each author. Report exact aggregate source, commands, exits, first failure and next owner to Planner and affected Executes. Domain semantic repairs return to their owner.

No existing branches/WIP, budgets, production engine, old schedules, Draft PR519 or existing databases/processes were changed. No push, PR, deployment or release was performed. M0 and product acceptance remain open.

## Phase B — contract and Word environment checkpoint

Planner explicitly activated Phase B. Core contract C is `6ad373b4c31b7ec7aa97b75d8f6cb89b7174fc0e`, parent S, tree `1fab82408fabb09509c7c7a768827934e41b4598`. Intake verified exactly the two owned contract/manual paths, easylogic author/committer, ancestry, clean Integration state and whitespace checks. Integration fast-forwarded to C. One targeted `pnpm --ignore-workspace type-check -- src/contracts.ts` passed with 0 diagnostics, exit 0, 2.755s (`11-contract-C-types`). No aggregate M0 runtime suite was run for contracts alone. Workbook runtime and dependent engine candidates remain pending.

Verification requested actual Word layout/print and DOCX source in a narrow browser entry. One `pnpm --filter @barocss/word-app... --filter barocss-editor install --frozen-lockfile --ignore-scripts` passed, exit 0, 16.293s (`09-word-root-frozen-install`). Its closure is 25 of 47 projects, including existing cycles and root tools; 1,838 packages were installed. Root manifests/config/lock/budgets and production source are unchanged. Normal source exports require no package build. The source-only browser condition for schema's registry contract is distinct from its Node dist condition; no Node dist build is claimed.

Pinned Playwright 1.58.0 needed revision 1208; an existing revision 1217 cache was not reused as the matching browser. `pnpm exec playwright install chromium --only-shell` passed, exit 0, 9.860s (`10-pinned-chromium-install`). Installed executable: `/Users/user/Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell`, reporting `Google Chrome for Testing 145.0.7632.6`. No Integration browser server/context is started. Verification owns fresh contexts and loopback ports 55260/55261. The control receipt pins the actual unchanged Word/rendering source trees, so a later experiment-only Integration commit does not silently change the Word measurement source. Browser performance, external-reader capability and full M0 acceptance remain unverified until actually measured.

Planner observed that the scaffold's `node_modules/` ignore entry matched directories but left an author's frozen dependency symlink untracked. The bounded correction is `node_modules`, matching both a directory and a symlink. The graph/link is preserved. Read-only `git check-ignore` verifies the new pattern in the linked Core worktree using the Integration ignore file as a temporary command-local excludes source; this does not modify the author's ignore file or Git configuration. Authors receive the immutable correction as an Integration-owned dependency change and must never stage the link. This ignore/report-only checkpoint requires no engine test or whole-repository preflight.

Full aggregate checks are scheduled for qualified combined runtime candidates. Root preflight remains NOT RUN here: no production source, shared manifest/config/lock or budget changed. Independent source-bound runtime, browser and performance evidence is still required. Integration does not repair another lane's semantic code.
