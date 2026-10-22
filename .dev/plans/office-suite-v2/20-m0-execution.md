---
work_id: office-suite-v2-m0
artifact_type: execution_plan
status: ready_for_build
owner_role: Planner
source_request: "Start M0 with scoped Execute Works; authors test changed areas and Integration runs broader checks when needed and reports results."
last_updated: 2026-10-21
source_commit: 034a42c36924bc9a9808847d065e542cb5390c4c
---

# M0 execution contract

The human explicitly activated M0 on 2026-10-21. The previous stop applied to the obsolete initial baseline assignment; this is a new scoped M0 assignment. Older product lanes and schedules remain outside this activation. The in-house Sheet decision remains final.

## Current authority and verification policy

Authors run tests/type checks for their changed areas and directly affected contracts only. They do not run the full repository test/preflight/build for each candidate. Execute Integration owns aggregate/full verification and chooses it when the combined source, shared dependencies, interface or release risk requires it. Integration reports the exact candidate SHA, commands, coverage, exit status, first failure and next owner to Planner and the affected Executes. This latest human instruction supersedes earlier author-full-preflight requirements. Existing budgets are unchanged; final integrated verification is not waived.

Keep one integration queue. Separate immutable author candidates from the integration receipt. Integration may batch independent candidates sharing one validated contract, run the combined M0 checks once, and run broader repository checks only when justified. Unchanged fixed-source evidence may be reused with its source/environment binding. Do not run unrelated product/browser/DB suites to acknowledge a message.

## Tracking and ownership

Parent [#521](https://github.com/barocss/barocss-editor/issues/521), suite [#520](https://github.com/barocss/barocss-editor/issues/520), milestone [19](https://github.com/barocss/barocss-editor/milestone/19).

All prototype paths below are relative to `experiments/office-suite-v2/`. This is an isolated M0 experiment, not a production engine registration. Production packages remain read-only unless a named later seam is explicitly leased.

| Issue | Work | Sole prototype paths | Dependency |
| --- | --- | --- | --- |
| [#522](https://github.com/barocss/barocss-editor/issues/522) | Execute Integration, existing chat `01a15e91-4846-7aa2-8445-7bfc513479ee` | `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `README.md`, `.gitignore`, `scripts/**`, `reports/integration.md` | Prepares immutable scaffold S; serial integration/full-check owner |
| [#523](https://github.com/barocss/barocss-editor/issues/523) | Execute Sheet Core | `src/contracts.ts`, `src/workbook.ts`, `test/workbook.test.ts`, `test/structure.test.ts`, `docs/core-contract.md` | S; publish a contracts-only immutable C before dependent implementation |
| [#524](https://github.com/barocss/barocss-editor/issues/524) | Execute Formula | `src/formula.ts`, `src/references.ts`, `src/calculation.ts`, corresponding `test/formula.test.ts`, `test/references.test.ts`, `test/calculation.test.ts`, `docs/formula-contract.md` | C and the agreed native Core interface |
| [#525](https://github.com/barocss/barocss-editor/issues/525) | Execute Collaboration | `src/collaboration.ts`, `src/prose.ts`, `src/durable-store.ts`, corresponding `test/collaboration.test.ts`, `test/prose.test.ts`, `test/recovery.test.ts`, `docs/collaboration-contract.md` | C, Core operation semantics and frozen dependency graph |
| [#526](https://github.com/barocss/barocss-editor/issues/526) | Execute Verification | `verification/**` | S for corpus/baselines; exact delivered modules for independent concurrency/scale checks |

Planner owns this execution plan and scope/acceptance records. Integration also owns bounded operating-policy amendments in `AGENTS.md` and `docs/operations/wonffice-workflow.md`, the M0 activation/testing sections in the architecture/roadmap, and shared dependency/runner changes. Semantic engine fixes return to the file owner. A role name grants no other files.

## Isolation and initial baseline

Preserve the primary checkout at `/Users/user/barocss-editor`; it contains the four explicitly approved planning files: `docs/ROADMAP.md`, `docs/specs/office-suite-v2.md`, `.dev/plans/office-suite-v2/10-feature-brief.md` and this file. Integration may copy only those scoped files into its managed worktree, verify their hashes, add the bounded testing-policy/scaffold changes and commit the isolated baseline. Do not reset/stash/switch the dirty primary checkout or copy other inherited WIP.

Integration creates its managed checkout from exact `034a42c36924bc9a9808847d065e542cb5390c4c`, records source tree/identity and produces S on `codex/522-m0-integration`. Authors use separate managed worktrees and `codex/<issue>-<scope>` branches from S/C as applicable. Integration alone controls local develop/serial integration; no main/develop push or product PR is authorized. Record any accepted local develop pointer without switching the preserved primary checkout.

Use Node22.22.0 and pnpm8.15.0. The existing lock contains Yjs13.6.29; treat it as the first pinned primitive candidate. The standalone experimental manifest/lock/strict type runner is Integration-owned. Authors do not install divergent dependency versions or modify roots/locks. Root package registration is unnecessary for an isolated experiment unless Integration records a concrete need.

## Contracts, messages and handoff

Core owns the shared types and freezes the contracts-only commit C first. Formula and Collaboration may review the proposed interface and send concrete changes to Core, but do not write or duplicate those types. Publish interface amendments as new exact commits, notify dependents, and recheck only affected code. Preserve history and first failures.

The human authorized M0 Works, coordination, integration and Integration result messages. For technical exchanges include Issue/scope version, source SHA, requested result, exact interface/files and response destination. Planner and Integration can collect final receipts with `wait_threads`; do not block work on a routine acknowledgment relay. If cross-chat reply authority cannot be independently established, leave the result artifact and final response for collection rather than asking the user to approve routine reporting.

ACK records actual worktree/branch/HEAD, dirty paths, active producer, owned paths and first action before edits. RESULT records immutable parent/head/tree, owned diff, executed targeted checks, first failures, remaining criteria and next dependency. Use easylogic <cyberuls@gmail.com> as author and committer with no coauthor; never change global Git settings.

## Completion boundary

M0 original criteria remain those of #521. Prototype replicas and controlled actors are labeled as such. Actual Office/current OIDC/DB/product acceptance belongs to M1/M2. M0 cannot be called complete if its required prose, native structure/reference/undo, durable retry/restart, corpus or 100/300-page and 10k-row scale evidence is missing. The final decision pack must identify implemented support, explicit refusals, measured limits and the exact M1/M2 contract and ownership split.

Use disposable test storage and isolated browser contexts/ports under Integration's resource lease. Never stop unrelated processes or mutate existing databases. Do not create schedules, deploy, purchase services/licenses or resume archived work.


## Phase C — remaining M0 prerequisites, human2026-10-22

The human explicitly resumed the remaining M0 work from bounded checkpoint `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f` (tree `b0093963b96cccf62c2595dca09417e8cab0306d`). The earlier stop-current-turn receipt is superseded only for these M0 prerequisites. Preserve its104/104 native evidence, original first failures, primary main/planning WIP and all immutable author history. This is not old backlog, M1/M2, schedule or release activation.

### Current exact responsibility routing

- Execute Integration #522 (`01a15e91-4846-7aa2-8445-7bfc513479ee`) remains the unique shared graph/config/lock/develop/resource writer and aggregate-check owner. It may amend this Phase C routing and its existing integration report. Frozen external dependencies are linked without a new install; workspace links must point to the actual author checkout, not silently to older Integration sources.
- Execute Sheet Core #523 (`01a15ec9-fcab-7e82-8c3d-54453bb2a1c3`) keeps only its original Core contract/workbook/tests/manual lease. The Phase C E candidate preserves C/API/native semantics and changes only qualified immutable-event/projection reuse; actual full-profile benefit remains independently measured, not inferred.
- Execute Verification #526 (`01a15eca-e1d3-7910-9aa1-d590162dbf18`) alone writes `verification/**`: full-fixture cause traces, exact font provenance, the versioned frozen reference budget/method, guarded normal100/300-page and exact Sheet profile observations and the independent matrix. It does not repair production engines or copy a second renderer/model.
- New Execute Word Layout #527 (`01a15f0a-7b41-7cc2-87f2-52eb044a3d73`) is the only semantic source owner for the named large-Word failure. Its explicit production exception supersedes the earlier isolated-only restriction for these paths only: `apps/word/src/runtime.ts`; `packages/office-word/src/{word-layout-pass,measurement,layout,pagination,display-preparation}.ts`; new `packages/office-word/test/m0-large-layout.test.ts`; `experiments/office-suite-v2/docs/word-layout-findings.md`. Planner's demonstrated-source extension adds only `packages/editor-view-dom/src/editor-view-dom.ts` and new `packages/editor-view-dom/test/layout-waits-for-content.test.ts`.
- Renderer/Fiber and every other unlisted production file, including the current print implementation, remain read-only until a concrete Planner lease extension. Formula #524 and Collaboration #525 retain their preserved candidates/ownership; this continuation does not dispatch unrelated new work to them.

Direct technical coordination among these owners is authorized. Do not wait for routine Planner ACKs or make all Works idle for a measurement lease. Finish current atomic writes/checks, preserve actual ownership and advance independent source/diagnosis work. Shared production semantics return to their sole owner; Integration does not invent semantic fixes.

### Demonstrated first-failure cause and repair boundary

The first actual100-page45s timeout is immutable history. A source-bound Phase C full100 fixture passes native admission and has matching model root/DOM root/surface. Actual layout ran before async DOM completion with zero surfaces; after renderer completion the800paragraph surface existed but no normal follow-up layout ran. One controlled post-commit render produced100pages. That force is a diagnosis, not a shipped fix or performance PASS.

The Word owner must preserve actual content, geometry, selection, generation/root retirement, disposal, composition and finite `MAX_LAYOUT_ROUNDS`. No all-sync render, force-bootstrap, timeout inflation, arbitrary page cap, fixture truncation or model hiding is accepted. Preserve initial deterministic failures and any composition regression separately from final source/unit successes. Simulated composition remains distinct from physical OS IME.

### Aggregate checks and resource ownership

Authors run only changed-area/directly affected checks. Existing test-type debt compliance is not zero diagnostics: the View test target's104/104 budget and inherited lint errors/warnings remain explicitly qualified. No root budget or exclusion is changed to pass.

The shared production View delta invalidates the earlier isolated-prototype-only reason for skipping root preflight. On the meaningful E/diagnosis/Word/reference batch, Integration assesses and runs affected View, renderer, Word layout/measurement/pagination/print and the actual Slides connector layout consumer, plus unchanged root preflight and the M0 strict/native aggregate. Preserve existing skipped rows as skipped and exact first failures; do not repeat these checks for metadata ACKs. Reuse unaffected evidence only through exact blobs/source closure.

Integration issues fresh finite loopback/browser leases.55260 is the Verification diagnostic/profile entry;55261 is a serialized Word-source/other-consumer entry as explicitly allocated. Different worktrees do not isolate ports, databases or identity providers. Start no overlapping expensive M0 producer, installer or shared runtime. No unrelated process may be stopped. Independent light code/docs and bounded checks continue.

### Frozen reference authority before new data

The single authoritative record is Verification's `verification/reports/reference-budget-v1.1.json` and README, frozen by Planner before the corrected-source baseline. Earlier Integration proposals remain superseded history. Existing root lint/type budgets are separate and unchanged.

Use the named machine/browser/viewport/actual selected fonts and file hashes, exact source/input/runner hashes,3fresh sequential raw samples and before/after load, active swap/memory and owned process RSS. A stable recorded loaded workstation is allowed; absolute idle or zero allocated swap is not a new gate. Qualify by recorded phase CV<=0.25 OR absolute max-minus-min<=10ms. Report all raw values and worst-of3/coarse percentiles without a statistical-tail claim.

Guards are distinct from product targets:45s/sample,10s cold phase,15s print phase,2GiB owned fresh-browser PID tree. An error/guard failure stops identical heavy repeats and returns a concrete cause/owner. Measured over-target is a MISS/defect, not an unmeasured row. Do not raise or retune thresholds after data.

Word targets: cold100/300<=1s/3s; warm full render<=250/750ms; print DOM build<=1s/3s; RSS<=512MiB/1GiB; printed-node growth300/100<=3.5x. Sheet targets: cold projection<=1s, full diff<=250ms, initial calculation<=250ms, dirty calculation<=16ms, peak RSS<=512MiB, range-paste projection+diff<=1s. Additional v1.1 totals retain construction/admission cost: cold construction+projection+calculation<=2s; single-cell admission+projection+diff+calculation<=200ms;1000-cell paste total<=500ms. These totals do not replace phase gates.

Headless Core/calculator results do not prove Canvas/provider/keystroke timing. Word print DOM timing does not prove PDF or paper fidelity. Missing fonts, unstable/failed profiles and unmet targets remain visible; no whole M0 acceptance is inferred from unit checks.

### Planned next stages remain inactive

Planner's concrete [M1 #528](https://github.com/barocss/barocss-editor/issues/528) and [M2 #529](https://github.com/barocss/barocss-editor/issues/529) record the exact future package/service/host/test responsibility split and dependencies. Both are WAIT_M0 planning only. They supply decision-pack routing, not production source leases, new Executes, migrations or runtime activation. An actually accepted M0 source/receipt and explicit later dispatch remain prerequisites.

### Measured successors — 2026-10-22, exact7d902 baseline

The frozen candidate profile at `7d902bc69bf98b0dc6aaf681a24d34c7066703a1` completed3normal100-page samples and3fresh headless Sheet children. Word100 print duplicates the full3315-node source on each page, matching the actual331601-node delta. All100RSS observations miss512MiB; the first300print crosses the2GiB guard, leaving2samples and measured300node growth NOT RUN. One100sample already exceeds512MiB before print. Sheet single-cell TOTAL296.46/462.17/268.92ms misses200ms in every sample. Raw and assessed evidence is preserved by #526; targets remain unchanged.

Planner activated [Word print repair #530](https://github.com/barocss/barocss-editor/issues/530) for the existing Word Layout Work and the bounded recent-checkpoint repair in [Core #523](https://github.com/barocss/barocss-editor/issues/523). Both use new managed branches from exact7d902; preserve original W/E worktrees and candidates. #530 supersedes only the earlier print-read-only boundary for its exact lease: `packages/office-word/src/print-pages.ts`; new `packages/office-word/test/print-pages.test.ts`; existing `packages/office-word/test/print-ownership.test.ts`; `apps/word/tests/word-print.spec.ts`; existing findings doc. `packages/office-word/src/print.ts` requires a demonstrated projection-CSS need reported before edits. Word runtime/layout/pagination/view/renderer/Fiber stay read-only. Preserve complete page-crossing paint, furniture, native/source authority, ownership and finally-based restore/cleanup.

Core keeps its named five-path lease and existing public C/API/exact revision semantics. It freezes bounded private cache retention before implementation, proves the covering-prefix append case and retains the full canonical safe fallback for unsupported or unproved inputs. All construction/admission/projection/diff/calculation costs remain measured. Verification owns the separate startup/cleanup guard method revision and preserves historical raw source bindings and measurement limits.

Integration's root preflight and separate source/test types now have actual receipts at7d902. The preflight first fails4new lint diagnostics; those return to Core/Verification. Source types pass with3existing known-broken demo allowances; test types pass1251/1251existing diagnostics over41targets. Neither result means zero diagnostics or whole preflight PASS. The source-aware frozen graph remains Integration-owned. Authors/helpers use changed-area checks only; Integration serializes later actual Word browser/PDF correctness and repaired100/300/Sheet profiles after immutable intake. No unchanged failing profile repeats, target increases, M0 closure or M1/M2 activation follows from these repairs alone.

### Repaired reference checkpoint — residual100RSS and supplemental proof

Core K now passes the unchanged bounded v1.1 model reference in immutable Verification V2ea861b2f on source6b3ea4a; reuse its ten exact Core/Formula/harness/budget files through later Word-only changes. Word W2eb2c019f on ccf1 completes all six normal100/300 samples with timing/repeatability/actual fonts/node-growth gates met (16201→48601,ratio2.99987655).100sampled aggregate RSS still misses512MiB in two of three samples;300 stays below1GiB. This remains a real measured MISS and no identical retry/threshold increase is authorized.

Actual Word P2b A8 passes source-relative and fixed24px geometry, per-sheet furniture, native/selection/PDF/font/cleanup. Old B retains2math PASS/1legacy UI failure before print/5NOTRUN. Existing Word #530 owns the approved four actual native table print-only cases plus at most two supported reduced-zoom cases in its already leased spec/doc. A held pre-run test-method candidate is preserved without counting it as an executed failure; fresh exact correction and finite serial lease are required. No old UI workflow patch or whole-suite retry follows.

The initial PDF header/margin visual concern was a reviewer reading error, corrected with byte-bound pixel/PDF coordinates; it is not a semantic defect or reason for another browser diagnosis. Remaining real work is100RSS phase/PID/source decomposition and supplemental native print proof. Planner grants any necessary new precise source scope. Root preflight34 passed the P2 semantic source with unchanged budgets; later test/doc/evidence-only successors use exact closure and changed-area checks. Whole M0 and local develop adoption stay pending.
# Phase C O/S result and one diagnostic route — 2026-10-22

Measured4579/tree146248: WordO ID traversal-only change; root39PASS284.094s/Word23unitsPASS/O8A+S6nativeprintPASS. Ddoconly b9e9571b and W3evidence2a29a8ee independently bound and joined. All6normal samples complete; timing/fonts/nodegrowth/300RSSPASS.100RSS577470464/598196224/575438848bytes: all3MISS512MiB, two already over before print; sample2no print poll. Frozen budgets/history unchanged. Core10files reused, no profile repeat. Supplemental actualPDF review is bounded12visual/24text pages. Old rich B/Slides UI gaps remain separate.

Planner activates exactlyONE #526diagnostic-only100page attempt after immutable protocol/harness commit. #522 grants serialized diagnostic-kind lease and holds exact O production source; no concurrent heavy producer. Preserve actual native API/workload/browser/fonts; record heap/DOM/ownedRSS phase pairs/skew through clear/dispose, optional domain release/finalGC diagnostic only.45s/10scold/15sprint/2GiB/bounded5s cleanup, firstfailureSTOP/no retry. No semantic/snapshot/runtime/renderer edit or new path lease is inferred. M0OPEN/developf4held/#528/#529WAIT_M0.

## One memory diagnostic receipt — 2026-10-22

Immutable predata8235bc84→held6e3bcc03, one15.434571125s diagnostic exit0/11seams/22readsets/ONEGC; evidence eadc3576 Verification-only6paths. RawSHA b6a6ca09f07d104df6252b6b694d2727d26091572d09c8a8cb3ab80635505ef8/30sourcebindings/oldv4criteria independently verified.4ownedPIDs+55260absent, canonicalleaseRETURNED, sourceholdreleasedafterintake. Warm CDPheap+12,711,252B/nodesunchanged/RSSdecreases; print CDP+1,834,712B/nodes+4501. No causalRSS/Mapleak claim or normalqualificationreversal. Next boundary warm view.render path is readonlyPlanner/helper analysis; no sourcewrite/profilelease. M0OPEN/developf4held/#528/#529WAIT_M0.

## Renderer531 source qualification and residual RSS — 2026-10-22

Author981cc151(parent8ac84fd2/tree342b1cdd7),exact5paths/3renderer sources, preparedjoinedee61af6f same tree. Actual40renders now1generation/5Fibers/79enumerableobjects with whole Element/Text identity/count; parent40generations/200Fibers/3004objects FAIL preserved. FreshRenderer41 819PASS+4existingSKIP109files112.108s;View42 596PASS+3existingSKIP50files58.657s;Word43 114PASS9files16.660s;ONEroot44PASS483.905s unchangedlint533/7381+0new/source45known3/test41targets1251of1251;A8S6browser45all14PASS0skip/retry/flaky/errors111.220s.19observedPIDs+55261absent;actual6PDFall24renderpixelsmatchpriorS. Core10exactreuse/no duplicateprofile.

ONEnewnormal100x3/300x3 atsameee61 completeswithoutguard/console/page/cleanupfailure;W4c44cb819 evidence-only5paths/rawSHAa30efe793b0a163d720454424d229d50fd992b68a23c99dd20039b583228f7ca independentlybound17production/H7/font/budget/Core10/RSSsums/maxima. Alltiming/repeat/font/nodegrowth/300RSSPASS;100RSS597786624/590364672/545865728 all3MISS512MiB.100preprint524025856/525467648/545865728,sample2alreadyMISSandNOprintpoll. No causalRSS/continuousHWMclaim;40→1sourcegraphproofdoesnotcompleteRSSgate.24observedPIDs+55260absent/canonicalnormalleaseRETURNED/sourceholdreleasedafterimmutableintake.

Existingportalprimitive-updatebaselineFAIL/invalidnewcurrentVNodeoraclecorrection/combinedasyncportalNOTVERIFIED remain. Next#526preparesnative-attributionprotocol/harnessONLY; Runtimeisolate/nativealloc/RSSseriesstayseparate, actual145supportunverified. Immutableprotocol/targetednegativechecks/IntegrationreviewrequiredbeforeanyNEWdiagnosticexecutionlease. NoGC/pressure/cachepurge/heapsnapshot/JSsampler/vmmapattach/sourcefix/normalretryauthorized. M0OPEN/developf4held/#528/#529WAIT_M0;alloriginalWIP and priorraw/acceptancepreserved.

## Native-attribution ONE diagnostic receipt — 2026-10-22

Predata414f9ff1 exact9Verificationpaths/protocolSHA067ebfd78b617579c1f6b23b76f626e49de097b9254841cfdecae9bd255c0bdc→joined6e7be70e/tree349324d5. Ownreview/17production+H7/support/font/budget/HTMLstyle/pinnedtypes/11tests/strict0/lint0/syntax0/negativeleasechecksPASS. NEWkinddiagnostic-word-native-memory-attribution-v1 max_runs1/100pages800paragraphs sourceheld45s/2GiB/5scleanup. Actual6.802332917s exit0/8seams16readsets/88brackets/33commands;3native start/get/stop sequencesallACK.3SUPPORTED EMPTY profiles0samples0modules39compactJSONbytes each/117total, notUNAVAILABLE/zeroallocationproof; nostackattribution. Runtime4isolateseriesavailable, coldembedderGCused+55,788,360B/warm−50,352,320/print+15,562,184 versusRSS+139,853,824/+45,694,976/−20,496,384. No memoryequation/collector-event/function/PID/live/resident/RSSaccountingclaim.

Evidencea271d237 exact5Verificationpaths/rawSHAb39cf30726c32f71846b4e6509fe5cef6268d1359d64834a574de93406ab78d5/31measured+workingbindings/protocol/Core10/v7everyv6criterion preserved independentlyPASS.4observedPIDs45162/45170/45171/45175+55260absent/canonicalleaseRETURNEDbeforeanalysis/sourceholdreleasedafterimmutableintake. NormalW4Word100all3FAIL unchanged; allpriorraw/firstfailures/sourcegraphproof/portalFAIL/combinedasyncportalNOTVERIFIED preserved. NextPlannerhelperONLYofficialChromium145source reading foracceptedempty backend/prerequisite/targetscope. No flags/newruntime/sourcefix/normalretry authorized. M0OPEN/developf4held/#528/#529WAIT_M0.

## Range allocation532 code/browser qualification — 2026-10-22

Authorcb0dba97214690b98a55aa4c64ccea30a23bd07b(parentb679) joined45a82a7c6f77268a7f63c685610338d48ced777f/sametree583ef3122e31a61baa11238a6d85f9731f5e0952 with exact3leasedpaths. First actual-function12Range-vs1FAIL preserved; invocation-ownedRange/finally cleanup has no cross-call state and preserves all9anchor/query vectors. This is allocation work,not RSS attribution. Additional line-offsets binding outside curated17:blob5dd28b9b44cdd79054413a6d62f2c29198e6fd87/SHA21be21264601f75a4465d3dec0475b4289647c6552e27dc6e240d887fd11d755/6079B;each actual runtime before/after matches. NormalH7/old17/font/v1.1 unchanged.

FreshWord46c10files123PASS0skip32.881s;ONEroot47PASS407.417s(lint2771files533errors7381warnings0new;source45known3;test41targets1251of1251). Samecwd/compiler parent-only source input overlay and actualcandidate rawWordtsc bothFAILexit2/100diagnostics;diagnostic bodies byte-identical,new0. Parent full log has one overlay marker. No fullRenderer/View/Core repeat. ActualA8S6browser48all14PASS0skip/retry/flaky/errors62.913s;21observedownedPIDs+55261absent/canonicalleaseRETURNED. SixPDF/24rawtexts and72dpirasterpages exactlymatch531. Initial offline single-space header assertion rejected double-space extraction also present in predecessor;failure preserved,whitespace-normalized header/text/pixel comparison passes without browser rerun.

Planner allows one NEW unchangednormal3fresh100+3fresh300 window after this immutable receipt,exactpin/sourcehold/extraSidecar/serial526lease. No newnormalrun yet;prior100RSSALL3FAIL remainscurrent,M0OPEN/developf4held. Userpreview55262/session61358/PID12634 andIABWorddocument stayopen without automaticinput/refresh/reset/close;record loadedworkstation and excludeuserUIfrom benchmark-ownedRSS/cleanup. No idlecondition/target/workload/GC/media/harnesschange. FirstguardSTOP/noidenticalretry;singlewindowdifferences arenotcausal attribution. FutureactualSheetUI notification doesnotactivateM1/M2;alloldholds/gaps preserved.
