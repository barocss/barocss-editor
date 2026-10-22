## Word runtime and print tranche — 2026-10-22

The requested implementation, integrated checks, actual print qualification and
fixed normal Word100 revalidation are delivered. **Word100 RSS remains FAIL.**
M0/alpha/release are not accepted. No unchanged-source retry follows this result.

Measured source: `760bb716bdd35b23ca28159b0b909e7cf43f9098`, tree
`e4dc22a3f0c5b9d9931a4944c91b8a10684844ed`, managed `522-m0-portal-joint`.
Its production code equals combined source `08cabfcd`: portal `2c889f64`,
Word RED `95d68158` plus repair `decdf4c5`, and root ownership `64b635c7`.
Two test-only recovery commits preserve identity assertions and align the
OfficeService noEmit test compiler with its actual Node22 `.ts` imports.
Production build, budgets, shared lock and package registration are unchanged.

The portal fix uses one root scheduler and owned hosts. Root SID changes retire
the previous model's components/handlers/portals before new ownership; commit
reentry keeps one latest request and suppresses obsolete completion. Same-root
DOM/Text identity remains covered. Word reads typed line-height only at the root
and direct surface inheritance boundaries. The preserved two-page unit output
is identical. These changes do not prove RSS causality or allocation savings.

- Final Renderer: 13 files /113 PASS; adjacent View: 6 files /69 PASS; independent
  verifier: 8 PASS, each with zero skips/failures. Pure Word print: 25 integrated
  PASS on byte-identical relevant source, reused after the test-only commits.
- Required preflight stage ledger: PASS under unchanged budgets. The original
  `pnpm preflight` command remains FAIL at lint (39.005s); its source-identity test
  repair passed5 native cases, scoped lint/types0 and root lint with0 growth.
  Source types passed45 targets with3 existing known-broken projects. The first
  full test-type guard failed five TS5097 in OfficeService; its test-only noEmit
  config repair passed the same project guard0/0. The unchanged40 project rows
  and earlier checks/release/npm/docs inputs are reused explicitly. Original
  failures are not relabeled. Ledger is primary `.omx/m0/word-runtime-preflight-ledger.json`.
- Actual original Word print browser file: **14 PASS /0 skip /0 retry /0 flaky**,
  52.685s CLI. PDF page count, clipping/table characters, page furniture, native
  document and selection checks passed. Physical paper/OS IME are not claimed.

One unchanged H7 window ran3 fresh100 and3 fresh300 samples at the fixed
font/media/fixture/guard/noGC/RSS definitions. All six completed, exit0,20.861s.
Exit0 means completed observation, not all performance criteria passed.

| Profile | Peak sampled owned aggregate RSS, bytes | Limit | Result |
| --- | --- | --- | --- |
| 100 pages | 581976064 /529956864 /552681472 | 536870912 | FAIL,2/3 misses |
| 300 pages | 800309248 /744669184 /794951680 | 1073741824 | PASS,3/3 |

All open/render/print timing targets, actual font identities, repeatability,
resource guards and printed-node growth (`13501/4501 =2.99956`, limit3.5) passed.
100 p95 open/render/print:346/103.9/25.2ms;300:1035.7/341.9/70.8ms.
RSS is the maximum200ms owned browser-process aggregate sample, including shared
pages; it is not private bytes, continuous HWM or a controlled old/new comparison.

Raw: `verification/reports/word-performance-2026-10-22T11-10-19-102Z/report.json`,
131994 bytes, SHA256 `efc93e3d5484f8ee225612aeb084644f08a5e93d78af824a22bfa634a9b85f1a`.
Primary preserved copy: `.omx/m0/word-runtime-normal-final/report.json`.
Assessment: `.omx/m0/word-runtime-normal-final-assessment.json`, SHA256
`8ac083b4518415d8168ff7370372f5707e8dc0f75ef30f0b46703ec259ddc463`.

Before/after1208 tracked runtime-source/manifest/harness files and654 actual
aliases (244 workspace-source aliases) match. This expanded superset includes
the three Renderer files outside curated17 and `line-offsets.ts`; it does not
claim every file was dynamically imported. The source lead independently
reviewed raw and bindings: primary `.omx/m0/word-runtime-source-review.json`.
All24 observed browser PIDs and private ports55260/55261 are absent. The lease
is returned; its original granted snapshot is preserved. No duplicate observer,
performance retry, account/Sheet-scale repeat, push/PR/deploy or schedule ran.

The earlier single native TypedOM diagnostic remains separately FAIL at old
source8558/7eca for root/DOM mismatch and a duplicate-store warning; its proven
536/533/3 call-work counts are not native allocation/RSS evidence. Root536's
isolated defect does not establish that earlier failure's cause.

All old/new user tabs, Word55262/Sheet55263/B55264/relay55265(operatorOFF)/WS55266
PIDs, account evidence, primary WIP and local develop `f4ed8edd` are preserved.
Next work, if selected within this tranche, needs a real source-backed cause or
new defect for the remaining Word100 RSS gate; do not rerun unchanged source.

---

# M0 integration — previews, source and memory evidence

## C client source/model qualification — backend human hold

Planner accepted the bounded B result below and the exact C client source/model
intake. Author e19eec186f3b1de427e0b7495f9652adcd3ed3a1, parent11f6204f,
contains exactly14 leased preview/contract paths. Its two-file style successor
bc947b4741fe3f11b675536c58bb459c8be16ab7 preserves behavior. Exact deltas join
at6ff23e9c and99ed27d0 in the separate BC integration checkout. All14 final
blobs and actual easylogic author/committer metadata match. Original A/B authors
and the user's old522 source remain preserved. Frozen P1 protocol6768f95d is
unchanged; no held backend WIP was adopted.

The client implements a browser IndexedDB outbox, exclusive client writer,
original native packet/identity resumption, separate persistence and delivery
queues, per-update receipt validation and honest pending/ACK-unknown/rejected
status. Normal persistence keeps editing available; actual persistence failure
blocks further input. Source/model tests cover two stored packets while the
first HTTP response remains pending. Current-view toolbar Undo starts fresh on
reload; original native Undo events/targets persist. Outbox lifetime limits are
256 records/8MB including confirmed/rejected entries; there is no auto-pruning.
These are source/model properties, not actual browser storage or server proof.

| Joined check | Result and binding |
| --- | --- |
|64 types at6ff23e9c |24 preview/protocol roots plus imports,0 diagnostics. |
|65 tests at6ff23e9c |12 preview/protocol files,83 PASS,0 fail/skip,5.989s. |
|66 first lint |3 new errors in2 files: two constant-condition loops and one unused type import. The failure is preserved. |
|67–68 after99ed27d0 |Two affected type roots/imports,0 diagnostics; two changed lint files,0 errors/warnings. Two while(true) spellings become for(;;), with the same exits; unused type removed. Unchanged tests/lint retain exact-source evidence; no fresh83 aggregate is claimed. |

Owner source/model timing and readonly-fixture type failures remain in its
contract. Root review also required separate local persistence from network
delivery and failure-only editing freeze. No eslint suppression, budget,
configuration, native engine or production change was used. Supporting intake
receipts and complete command outputs are primary `.omx/m0/533-C-client-*.json`
and logs64–68. Integration launcher912d2eab adds explicit durable mode and a
same-origin55264 proxy to55265 with changeOrigin:true. Its entry checks start
no browser, service or storage.

The relay author's later direct human instruction says "추가 실행은 하지 말고".
Planner's resume question is pending. Do not adopt its uncommitted WIP, resume
that lane or bypass the hold. C server runtime, saved/restart/reopen and outbox
browser proof remain NOT RUN. Verification535 also keeps its read-only hold.
The private C predata-v3 contains ten NOT RUN cases and exact-ID controlled
ACK-delivery conditions. Final service pin and actual capabilities must be
bound before runtime. Actual IndexedDB/WebLock, continuous keyboard focus,
remote composition, BFCache, relay ACK/retry, new-process same-DB restart and
reopen remain unverified. No server success follows from client source checks.

## Latest Sheet533 Phase B — actual two-tab collaboration

The controlled two-tab preview passed 11 actual browser records on source
`11f6204f91978d0784db5b11c513592947c76736`, tree
`85ab39842b749ed3eb90fdba551b87d9403040ad`. The private test rooms and server
are closed. Their room URLs are not user handoff URLs. Phase C storage/recovery
follows this qualification; it has not run at this checkpoint. The user's
Word55262/PID12634 and Sheet55263/PID21740 documents and servers remain open.
Their old522 source checkout stays read-only to avoid HMR resets.

New managed integration is `522-sheet-bc-integration`, based on clean1638944c.
Author81960494 contains exactly nine leased preview/contract paths. Its
826b5532 successor corrects initial peer reload guidance; its d7db7b6a successor
retains manual Pause across controlled lifecycle suspension/restoration. The
exact deltas join at aa998bab,4218e16f,11f6204f. No native engine, root graph,
configuration, lock, budget or production source changed. Integration owns the
separate55264 launcher and prepared55265 relay runner. Contracts-only relay
P1 source6768f95d joins as ba5fd4f2; its presence is not C runtime evidence.
All actual commits use easylogic as author and committer, without coauthors.

| Check | Actual evidence and boundary |
| --- | --- |
| Joined native checks57–59 at4218e16f | 11 type roots/imports,0 diagnostics; five preview test files,46 PASS,0 skip; six changed TS files plus two runners lint clean. |
| Lifecycle checks60–62 at11f6204f | Three affected type roots/imports,0 diagnostics; two lifecycle tests PASS,0 skip; three changed files lint clean. The unchanged46-test evidence remains source-bound; no fresh48-test aggregate is claimed. |
| Real two-tab start | Actual UI Create/Open second screen; independent replicas/sessions share the same original54,751-byte bootstrap/context and91 native events. Core revision is canonical context/event bodies, not a local counter. |
| Bidirectional edit and Undo | RatesB2 12→10 makes the other tab show BudgetD4 38 and D5 Within budget. Reverse-direction input arrives. Each session's Undo removes only its own edit and preserves the other contribution and bootstrap. |
| Concurrent same-cell input | Both send/receive paths paused; original packet IDs/lengths/SHA remain queued and native branches stay separate. Literal17 and cross-sheet formula13 converge to identical native state with both retained inputs. A's Undo preserves B's formula; B's Undo removes only B. |
| Remote input during a draft | Real remote edits/recalculation preserve the same editor DOM object, DOM focus, caret, draft CellKey/generation and text. Controlled composition blocks Enter until composition ends; this is not physical OS IME proof. |
| Reload and room loss | A private reload joins a surviving peer with original event identities/bootstrap, a fresh session and empty own-Undo history; re-edit/Undo works. After the last peer closes, the original room waits without creating a new replica/bootstrap. This is temporary peer recovery, not durable storage. |
| Desktop rendering and modules | All12 PNGs visually reviewed. DPR2 at1024x1100 has942x480 CSS/1884x960 backing,120 visible DOM cells, real two-axis wheel/hit on I15, no page horizontal overflow and real peer delivery. All16 observed JS responses200; no runtime Node/store/PendingUpdates;0 positive console/page errors. |

Qualified raw receipt:
`/Users/user/barocss-editor/.omx/m0/533-b-browser/actual-browser-receipt-v2.json`,
SHA-256 `25c7ec8c7a26a8d3705f92c8a9d6272b6a09469514a7b3ff6e40818d4fe3dea9`,
15,255 bytes. It preserves two harness failures: an undeclared page handle and
an incorrect expected synonym in the initial status oracle. Both corrections
continued the existing joined pages without product changes or reseeding.
The first unexpected product runtime failure is null. V1 remains preserved:
its screenshot hashes used JSON serialization of a Node Buffer; V2 uses actual
file bytes. The raw-byte correction and original hashes are recorded in
`533-b-evidence-hash-correction.json`; module/native string hashes were valid.

Owner first failures also remain: original pending-ACK delivery, pending-to-
applied own-Undo eligibility, initial peer reload wording and manual Pause
restoration. Their original candidates/regressions are not rewritten. Native
missing-base/tampering tests are separate from the browser proof; no browser
packet fault injection or actual BFCache acceptance is claimed.

All eight observed private browser PIDs are absent after201ms closure. Owned
Vite3043/esbuild3114 and port55264 are absent; session94007 exits0. The34 bound
source hashes,19 old live-source hashes and four primary planning WIP hashes
match before/after. Git is clean, the private lease is returned and its source
hold is released. Supporting predata, original read-only535 review, intake,
pre/post bindings and logs55–62 remain under primary `.omx/m0/`.

B's1MB bound applies to a delta and bootstrap-plus-state message. It is not a
cap on accumulated live state; a later join/reload can refuse. Peer64,
deferred256 and each8MB collection limit are distinct. C requires a separate
full accepted-state1MB pre-COMMIT gate. Peer receipts never mean saved.
Actual BFCache, physical IME, screen reader, durable C recovery, production
accounts, mobile QA, performance and whole M0/release remain unverified.
Word100 W5 RSS still fails1of3; developf4/M0OPEN/M1–M2 holds remain. No push,
PR, deployment, existing DB mutation, unrelated stop or schedule change ran.

## Latest Sheet533 Phase A — actual editable preview

The native-engine Sheet preview is available at `http://127.0.0.1:55263/`. Execute Integration owns the retained server PID21740,execsession77025. It serves source `cd0c45b3e0e3b75673a34cfe586f4486fc41f987`,tree `2d4acee0d52a816ac65d2c1ec964643fdded4b7b`. Planner received the URL/source/server owner and bounded browser proof for opening the user view. Two32x12native sheets support local cell edits, native SUM/IF/cross-sheet calculation and own-session Undo. This is session-only; reload discards edits. Saving,sync,two-tab transport and durable recovery are not active.

Author `d1feb6097b02d36d942bedf5e0bea530c71cd0c1`,parent8380696b/tree28e2c178,contains exactly11new leased preview/contract files. Integration's one-path launcher `412a6e7d899b975cc9beca4369bdc5f1c2ea5926` joins atc7f92b02. Both original candidates are preserved. Planner then found P2: selection called cancel without a draft,overwriting Applied after Enter/Tab with Edit cancelled. Author reproduced5PASS/2FAIL on the original controller,then delivered `0c2555e5b13d661f512a364787ab30aa567dd613`,parentd1feb/tree5665791a,exact3path delta. The one-line draft condition and two real status regressions are reviewed and joined atcd0c45b3. No browser/server was started on the held predecessor. All actual author/Integration commits use easylogic author and committer,no coauthor. First oracle/type failures and this P2 failure remain in the author contract/history.

The runner uses configFile:false,existingVite5.4.21/Yjs13.6.29,strictloopback55263,exact clean HEAD/entry/dependency guards,and a browser runtime Node/store module boundary. No installation,root registration/config/lock/policy,budget,existing native engine or product edit occurred. Author writes only preview/sheet/** and its contract. Node durable-store/PendingUpdates are absent from the actual browser graph; the existing collaboration type-only import is erased.

| Evidence | Actual result and scope |
| --- | --- |
| Predecessor joined49–51 |8type roots0diagnostics;21testsPASS0skip;9lintfiles0errors0warnings. Preserved atc7,not relabeled as corrected fresh evidence. |
| Corrected joined52–54 |2type roots/imports0diagnostics,exit0/1.998s;binding+controller18testsPASS0skip,exit0/.693s;2changed lintfiles0errors0warnings,exit0/.752s. The5unchanged grid tests retain exact-source predecessor evidence. No Word/Core/fullroot/profile repeat. |
| Actual browser |11bounded check recordsPASS,9PNG,0positive page/console errors on existing Chromium145.0.7632.6/Playwright1.58.0. Actual pointer,printable sequential keys,keyboard and wheel;inspect is auxiliary only. |
| Critical native flow |RatesB2typed12→10;BudgetD444→38 andD5Review→Within budget;nativeUndo restores44/Review and excludes bootstrap. Applied/Undo status stays correct through selection movement. |
| Editing and refusal |Edit button,F2,double-click,Enter/ShiftEnter,Tab/ShiftTab,all arrows,column wrap,Escape,native caret Undo,typed0012/boolean roundtrip. Invalid draft preserves native event/value;actual unsupported AST and DIV0 remain explicit engine errors. |
| Composition boundary |Controlled compositionstart/end,isComposing,keyCode229 and composing Enter do not commit;real wheel/selection attempts preserve the focused input node/text. A separate Enter applies;ordinary draft cancels safely on sheet switch. Synthetic events are not physical OS IME proof. |
| Canvas/DOM/viewport |Reviewed initial,changed,Undo,refusal,error and scrolled screenshots. DPR1Canvas1198x480CSS/backing;DPR2smaller desktop1024x960 has942x480CSS and1884x960backing. Real pointer selectsI15/H15 after both-axis wheel. Visible DOM mirrors150/135cells at those scrolled states,below384native cells;no page horizontal overflow. Fixed cell clipping is the explicit contract. |
| Module/cache/source |14actual JavaScript responses200,including optimizedYjs/lib0 and native modules;no runtime Node/store/PendingUpdates import in that loaded graph. All18preview/runner/native source bindings match before/after;git clean;Vite cache ignored. This is the observed graph,not an arbitrary-URL security audit. |
| Session/exploration |67.972s exploration covers literal types,error/cancel,caret Undo and controlled composition during real scrolling. A private verification-page reload resets generation/edits to44/Review;the user's Word/IAB document is never accessed or refreshed. |

Raw browser receipt is primary `/Users/user/barocss-editor/.omx/m0/533-browser/actual-browser-receipt.json`,SHA-256 `51205040a9434aff6d724e83eb38648db194968b60fd8d17f36825f38d6e3d1f`,29474bytes. It binds all11records,actual module responses,9PNGpaths/hashes,viewports and process ownership. Supporting primary receipts: `533-frozen-dependency-receipt.json`,`533-author-intake.json`,`533-prebrowser-binding.json`,`533-postbrowser-binding.json`,logs49–54 and`533-browser-smoke-plan.json`. Representative final image: `533-browser/09-qualified-native-sheet.png`.

Private browser/context closure took81ms;all5observed private browser PIDs22729/22738/22740/22742/29805are absent. The browser lease is RETURNED and source hold RELEASED after source-bound qualification. Keep the separately owned Sheet server21740/55263/session77025 for the user. Keep Word12634/55262/session61358 and its IAB tab/document unchanged. Documentation-only successors do not change the served preview code. Planner owns whole #533/#521 acceptance and any later PhaseB/C dispatch.

Physical OS IME,screen-reader behavior,Back/Forward BFCache,collaboration UI,durable save/recovery,performance and whole M0 acceptance remain NOT RUN by this preview qualification. M1/M2 remain WAIT_M0. Word100W5RSS stillFAILS1of3;local develop staysf4ed8edd. All earlier raw/first failures/portal/old UI limits and primary planning WIP remain preserved. No push,PR,deploy,existing DB mutation,unrelated process stop,schedule or automatic Issue/Goal closure occurred.

**M0 remains OPEN.** Range allocation #532 passes its source/code/browser checks. The new W5 normal window still misses the frozen100-page512MiB sampled aggregate RSS target in one of three samples. W4's three failed samples remain separate history. Local develop remains `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`; no Phase C develop, whole M0 or release acceptance follows.

## Latest W5 normal reference — residual100RSS failure

Verification evidence `3aee39f9bb50b162b9584e24cc67aba58ab26992`, parent `a271d2379fa1178abaa6a0ec4827682854fc7e3d`, tree `386b26ed312e0f8df22e42403f492c4ac8372034`, contains exactly six Verification metadata/raw paths. Integration reviewed immutable bytes, scope, identity, source bindings and assessments, then applied only that parent-to-child delta at `e2271f4a6a2d636018565bd0cfaa529d75721595`, tree `9dc8b83eeac43e417221b7bc4c5890151449c8f6`. No older Verification product tree was replayed. Its working product source is not the measurement authority.

The measured source is clean `e681e91fc3f0505d27c13e5a55298235522be7b8`, tree `b596ec895663837469dbb3e447c0337299295fbc`, the documentation-only successor of tested45a82a7c. Actual old17production and unchangedH7 match both the measured git bytes and Integration working files. The additional line-offsets blob/SHA/6079bytes are separately verified before/after in [the extra source receipt](../verification/reports/word-range532-extra-source-binding-v1.json); old17does not cover this file. Font reference,v1.1 budget and Core10source/harness/budget bindings are exact. No Core rerun or normal method change occurred.

Exactly one new default3fresh100+3fresh300 window completed all six samples/30phases with actual native counts, browser145, fonts, frozen media/noGC and guards. Command exit0 and no console/page/guard/monitor/cleanup error mean execution completed; they do not make the failed resource criterion PASS. [Raw report](../verification/reports/word-performance-2026-10-22T01-45-59-393Z/report.json) SHA-256 `33dd68dcbee6f4d04ad2cc1f96df7ef335c94b69c35abf7ffd7a6a519e710dc5`,152733bytes, is preserved unmodified.

| Profile | Cold worst-of3 | Warm worst-of3 | Print worst-of3 | All three sampled owned aggregate RSS observations |
| --- | ---: | ---: | ---: | --- |
|100pages |332.6ms |105.2ms |27.1ms |522420224 /497008640 /574439424B;last sample exceeds536870912B,FAIL1of3. |
|300pages |1026.7ms |345.7ms |75.1ms |742981632 /803979264 /760102912B;all below1073741824B. |

All six timing targets and CV/spread repeatability gates pass. Actual native printed CDP node deltas are4501/4501/4501 and13501/13501/13501,ratio2.9995556543<=3.5. Use Memory.getDOMCounters before/after print,not the separately sampled Performance.Nodes series. See [assessmentv5](../verification/reports/word-candidate-assessment-v5.json) and [current criteriav8](../verification/reports/criteria-phase-c-v8.json).

The100-page preprint observed maxima are522420224/497008640/522764288B,all below512MiB. Samples0/1have no actual-print-tag RSS poll;sample0has a later inventory poll487014400B while sample1has neither print nor inventory poll. Their warm-tagged overall maxima do not establish a measured print peak. Sample2's574439424B print-tagged poll includes adjacent readout/deferred work;it does not isolate synchronous print as the cause. All300samples have print-tagged observations,but samples0/2overall maxima are warm-tagged. Preserve overall maxima and sampling gaps. These200ms aggregate/shared-page observations are not continuous HWM or private physical bytes. After-open→after-print heap spans font/warm/print/readout. Constructor-count proof and Range.detach do not establish RSS savings or native release.

Historical W4 at ee61remains FAILall3:597786624/590364672/545865728B. W5 is a separate loaded-source window with the user's preview open. Neither the change in passing sample count nor one window difference establishes a controlled A/B or causal benefit. Native attribution's accepted-empty profiles and other earlier failures remain unchanged;no sampler/flags/probes were added.

All24observed benchmark-owned PIDs and55260listener are absent after bounded5s cleanup. The canonical normal lease was RETURNED before offline assessment. User preview12634/55262 remains listening and is excluded from owned RSS/cleanup;the IAB user document was not accessed,refreshed,reset or closed. Integration independently verified raw SHA/full17git+working bytes/H7/extra prepost/font/budget/Core10/RSSperPID sums+maxima/gate arithmetic and immutable six-path hashes. Primary independent receipts are `532-normal-raw-independent.json`,`532-normal-independent-gates.json` and `532-immutable-evidence-intake-review.json`. Source hold is RELEASED after immutable intake. No measurement job or lease remains active;the user preview stays open.

**Next owner: Planner.** Design the next Sheet-centered M0 preview scope and record its explicit file/server authority before execution. No such new authority exists at this checkpoint. M1/M2 remain WAIT_M0. Do not retry this same Word candidate or assign a new Word micro-fix. Preserve Word100FAIL,M0OPEN,developf4,all original WIP/first failures,portal and old UI limits. No push,PR,deploy,existing DB mutation,unrelated process stop or automatic Issue/Goal closure occurred.

## Range allocation #532 — immutable code and browser qualification

Author candidate `cb0dba97214690b98a55aa4c64ccea30a23bd07b`, parent `b679353f059c8075c05677d1a10e6fee83936b06`, was joined at `45a82a7c6f77268a7f63c685610338d48ced777f`. Both candidate and joined tree are `583ef3122e31a61baa11238a6d85f9731f5e0952`. Integration checked the exact three leased paths, clean state, easylogic author and committer, no coauthor, source/test blobs and all nine canonical anchor/query vectors. The source change owns one Range per nonempty invocation, resets both endpoints for each unchanged probe and detaches in finally. No cross-call state is added. The preserved first actual-function failure created12Ranges for one multiline call; the repaired call creates1. This is allocation-work evidence, not attributed native memory or RSS savings.

The changed `packages/office-word/src/line-offsets.ts` is outside the old curated17 list. Its additional binding is blob `5dd28b9b44cdd79054413a6d62f2c29198e6fd87`, SHA-256 `21be21264601f75a4465d3dec0475b4289647c6552e27dc6e240d887fd11d755`,6079bytes. Primary `532-candidate-sidecar.json` and the before/after runtime bindings record it separately. The old17source files, normalH7, fonts and v1.1 budget are unchanged. The earlier sidecar's lack-of-parent-comparison statement records its creation time; the later comparison below supplies new evidence without rewriting it.

| Fresh check at45a82a7c | Result | Boundary |
| --- | --- | --- |
| Word46c,10layout/measurement/table/print/Range files |123PASS,0skip;exit0;32.881s | All nine actual Range anchor/query vectors match author canonical hashes. |
| Root47,one unchanged-budget preflight |exit0;407.417s | Lint2771files,533errors/7381warnings,0new;source45projects/3known allowances;test41targets1251/1251existing debt,including Word7. Not zero diagnostics. |
| Actual Word48,A8+S6 |14PASS,0skip/retry/flaky/errors;exit0;62.913s | Actual app/Chrome145/fonts/native model/selection/glyph geometry/PDF/rebuild/clear;desktop1280x900DPR1. |
| Same-environment raw Word types46a/46b |Both exit2,100diagnostics;FAIL | Same Integration cwd,Node/compiler/config/graph. Read-only fs overlay substitutes only the parent line-offsets blob; one actual overlay read. The100diagnostic lines are byte-identical,SHA94c87cbe54fdeeb5253b64755cc1715e5bfdcd2b397ea134307e528a3bc56ee0;new0/ownedsource0. The complete parent log also has an overlay marker,so complete logs are not byte-identical. |

No full Renderer/View/Core checks were repeated. Earlier source-bound evidence remains distinct. The browser's21observed owned PIDs and55261listener are absent; its canonical lease is RETURNED. Six saved native PDFs have24nonblank pages; all24raw extracted page texts and72dpi raster images exactly match #531. Continuation headers pass whitespace-normalized extraction. The first offline header assertion failed because it compared single spaces against double spaces in extraction; the same double spaces are present in predecessor PDFs. Preserve `532-pdf-first-analysis-failure.json` and the corrected full comparison. No product patch or browser rerun occurred. This transfers only the earlier bounded12visual/24text paint scope,not universal PDF,Office interoperability or physical paper acceptance.

Primary evidence is `/Users/user/barocss-editor/.omx/m0/`: logs46a–48,`532-raw-types-comparison.json`,`532-integration-range-ledger.json`,`532-prebrowser-sourceproof.json`,`532-binding-*.json`,`532-browser-owned-cleanup.json` and `532-native-PDF-comparison.json`. The author findings document preserves original reproduction and all paired vectors.

Planner authorized one later unchanged normal3fresh100+3fresh300 window after this immutable receipt. No new normal run has started at this receipt. Integration must freeze the next exact SHA/tree,hold source,grant one serialized #526 lease and verify the extra line-offsets binding before/after. Keep normalH7/v1.1/workload/fonts/browser/threshold/guards/noGC/media unchanged;first guard failure stops the run without an identical retry. The existing100RSS ALL3FAIL remains current until new evidence arrives. A difference between windows is not sole-cause proof.

User preview `http://127.0.0.1:55262/?sample`,Integration-owned session61358/PID12634,and the user's IAB Word tab/document stay open. Do not auto-input,refresh,reset or close them. Record this loaded-workstation state in the next measurement environment. User UI processes are outside the benchmark-owned PID sum and cleanup. Other heavy/browser/API/profile jobs stay serialized. No absolute-idle condition or workload change is added. Notify Planner when approved future work supplies a real engine-connected Sheet editing UI; this request does not activate M1/M2. M0 stays OPEN,developf4held,and all earlier failures/holds/WIP remain preserved.

## Latest native-attribution diagnostic — completed, allocation source unresolved

The new verification-only protocol/harness `414f9ff1c9821151cf6c990d7d756a608304aaa4`, parentc44cb819, was committed before data and joined at `6e7be70e0150e43f76587a8b9fb0a54c11ea8ef9`, tree `349324d5ff912dab82687785d58055feaadb5c7c`. Integration independently checked its exact9paths/identity/tree/protocol SHA `067ebfd78b617579c1f6b23b76f626e49de097b9254841cfdecae9bd255c0bdc`, actual17production hashes againstee61/currentroot, normalH7/support/font/budget/pinnedprotocol/HTMLstyle and absence of prior claim/data. Predata11testsPASS/strict2roots0/lint4files0errors0warnings/syntax0 and expected missing/old-lease refusals passed; initial new-only type/lint failures remain preserved. No full root/Core/browser14 checks were repeated for this diagnostic-only delta.

A new serialized diagnostic-kind,max_runs1lease authorized exactlyONE100-page/800-paragraph run on unchangedee61production. It completed8seams/16sequential readsets and exactly3cold/warm/print native sampler windows in6.802332917s, exit0. No first guard/page/console/cleanup failure occurred. All4observed owned PIDs45162/45170/45171/45175 and55260listener are absent. Canonical lease is RETURNED. Raw SHA `b39cf30726c32f71846b4e6509fe5cef6268d1359d64834a574de93406ab78d5` and original220682bytes are independently preserved;31measured-source bindings/read brackets/RSSperPID sums are checked. No GC, media/fixture/source patch, normal retry, allocation fallback or extra sampler window was used.

All9native start/get/stop commands acknowledged. Every returned profile has samples:[] and modules:[],39compact JSON bytes each,total117, with matching byte/hash/cap records. All3stops acknowledged and final mayBeActive=false. This is accepted-command/supported-empty evidence, not missing-method behavior, zero-allocation proof or effective native-attribution coverage. No stack/module samples exist to identify a native function, allocation family, lifetime or resident bytes.

Runtime.getHeapUsage returned all4finite isolate-total series. They remain distinct from page performance.memory, CDP Performance and owned process RSS. Closest sequential readsets show:

| Observed interval | Embedder GC-heap used change | Owned RSS change | Limit |
| --- | ---: | ---: | --- |
| Module baseline→combined cold open |+55,788,360B |+139,853,824B | Cold includes fixture/admission/mount, document.fonts.ready, normal stable layout and TreeWalker inventory; no independent admission/font-ready boundary. |
| Font query→warm completion |−50,352,320B |+45,694,976B | Counter decrease does not itself establish a collector event, freed resident bytes or retained-object cause. |
| Warm completion→print return |+15,562,184B |−20,496,384B | Native/profile/CDP readouts perturb scheduling; not pure synchronous print allocation or RSS byte accounting. |

The positive cold/print embedder intervals are diagnostic observations, not permission for a Range/cache/deep-copy/print rewrite. After clear/dispose live source/print pages and runtime globals are removed, but global node counters remain7857 without a requested GC; this does not establish a leak or natural cleanup timing. The16paired readsets are sequential with explicit clocks/skew, not atomic per-process measurements. Native profiles contain no PID/time/live/resident/shared/free fields and are never automatically joined to adjacent renderer RSS roles. Randomized128KiB sampling and post-materialization16/32MiB response caps do not provide exhaustive live allocation or a backend receive bound.

Normal W4 Word100RSS597786624/590364672/545865728 remainsFAILall3. This diagnostic is not qualification, a controlled A/B, proof of RSS savings or whole M0 acceptance. The next precise source/diagnostic boundary remains Planner-owned after immutable assessment; no source fix, normal retry, second diagnostic or broad resource run is authorized by this result alone.

Evidence-only `a271d2379fa1178abaa6a0ec4827682854fc7e3d`, parent414f9ff1/tree197044e2096a0414e3a7afe53364a1e5ed1f8582, is intaken after exact5path/identity/tree/raw/protocol/31measured-and-working source bindings/Core10/budget checks. [Current criteria v7](../verification/reports/criteria-phase-c-v7.json) preserves every v6normal criterion exactly and adds this diagnostic separately. See [native-attribution assessment](../verification/reports/word-native-memory-attribution-assessment-v1.json). Maximum diagnostic sampled RSS534,102,016bytes does not qualify the512MiB normal target. The runtime source hold is released after this immutable intake; resulting documentation head/tree is recorded in primary control after commit.

## Immutable source and proved change

Author `981cc151da53c223a7a59d1b4275b728dd024f44`, parent `8ac84fd2e4e5636327ba2fa8f9a012316a7d3a19`, tree `342b1cdd7f7c8eb898c34852e24ea34ae3767e62`, changes exactly three renderer sources, one new regression and one findings document inside #531's lease. Integration reviewed exact parent/path/tree/easylogic author+committer/no coauthor and checked four source/test SHA bindings plus18 preserved raw log digests. The prepared joined source `ee61af6f66f74f84708e0e434077122d91394cf6` has the same tree and remained clean through all checks and the profile. No Word/View/layout/print/measurement, Fiber tree/scheduler, normal harness, root/config/lock or numerical budget changes occur.

Actual DOMRenderer completions1/10/40 on the parent retained1/10/40generations,5/50/200Fibers and79/754/3004enumerable graph objects. The first deterministic assertion failed after40completions with identical DOM/text. The final source retains1generation/5Fibers/79objects, preserving total descendant count and every Element/Text identity. History is cleared only after the whole commit's deletion/text consumers; completed instance and captured-local scheduler references are released before publication/external callbacks. Disposal cancels root work and releases retained state and owned portal hosts. This proves the tested enumerable data graph bound, not hidden lexical-edge reachability, heap/RSS savings or universal cleanup.

## Fresh checks at ee61

| Check | Result | Boundary |
| --- | --- | --- |
| Full Renderer,41 |109files;819PASS/4existingSKIP;exit0,112.108s | Includes final9regressions, replacing predecessor-only reuse for the51existing checks. |
| Full View,42 |50files;596PASS/3existingSKIP;exit0,58.657s | Native input/selection/history/async/disposal consumer checks; physical OS IME not inferred. |
| Word layout/measurement/table/print,43 |9files;114PASS/0skip;exit0,16.660s | Existing8files plus current print-pages units. |
| ONE unchanged-budget preflight,44 |exit0,483.905s | Lint2766files533errors7381warnings/0new-increased;source45projects/3known allowances;test41targets1251/1251existing debt, includingRenderer123/View104/Word7. Not zero diagnostics. |
| Actual Word A8+S6 browser,45 |14PASS/0skip/retry/flaky/errors;exit0,111.220s | Same immutable source, actual app/Chrome145, fonts/native/model/selection, source/print glyph+geometry, PDF/cleanup; desktop1280x900DPR1. |

The browser's19observed owned process IDs and55261listener are absent; its canonical lease is RETURNED. All six saved supplemental native PDFs have four nonblank pages and all continuation headers. All24new72dpi raster pages match the exact prior S renders pixel for pixel. This transfers only the prior bounded12visual/24text paint scope; it is not universal PDF, Office interoperability or physical paper acceptance. Actual old rich B UI/Save and Slides baseline findings remain separate and unresolved.

## Single normal profile:100RSS still fails

The normal driver remains exact G word-wall-v3 and frozen v1.1; all7harness files/font reference/budget are unchanged. Three fresh100-page and three fresh300-page samples complete without guard/page/console/cleanup failures. Actual fonts, native/root/page invariants, all timing/repeatability gates and actual node-growth ratio pass. Core V2's10exact files remain unchanged and its existing reference evidence is reused; no Core profile was repeated.

| Frozen gate |100pages,3fresh samples |300pages,3fresh samples |
| --- | --- | --- |
| Cold open, worst |316.5ms <=1000 |1000.5ms <=3000 |
| Warm full native completion, worst |103.4ms <=250 |345.3ms <=750 |
| Synchronous print build, worst |26ms <=1000 |71.3ms <=3000 |
| Actual printed node delta |4501each |13501each;ratio2.99955565 <=3.5 |
| Maximum sampled owned aggregate RSS bytes |597786624/590364672/545865728;**all3MISS536870912** |803897344/812335104/797818880;all below1073741824 |

100preprint maxima are524025856/525467648/545865728bytes. Sample2already misses before print and has no print-tagged RSS poll; it is not a measured print peak. Samples0/1have print-labelled maxima597786624/590364672, but that label includes adjacent CDP/deferred readout. Open→postprint heap also includes font query and warm render. RSS is maximum200ms sampled owned aggregate, includes shared pages and can miss short peaks; it is not private physical bytes or continuous HWM. Different source windows are not a controlled A/B, and the40→1graph repair does not establish an RSS reduction or complete the memory gate.

Raw sourceee61 SHA `a30efe793b0a163d720454424d229d50fd992b68a23c99dd20039b583228f7ca` is independently preserved. Integration checked17production+7normal harness bindings, all6sample statuses/font identities/repeatability, RSS per-PID sums and maxima. All24observed owned PIDs and55260listener are absent; the canonical normal lease is RETURNED. No GC, media override, threshold increase, identical normal retry or blind micro-optimization follows.

## Immutable evidence intake

Evidence-only W4 `c44cb8196cffe524c8b4909399e8c3e825370022`, parent `eadc3576cfdeccff03ac90ab25e90c0f3bbb4570`, tree `f85ab6da26a97480149892279734d0af26a56808`, changes exactly five Verification receipt paths. Exact path/tree/identity and raw SHA are verified. Its product branch remains on eadc; the17measured production hashes bind actual ee61 and the held working source, not W4's old renderer files. Serial integration applies only its evidence delta. Normal [criteria v6](../verification/reports/criteria-phase-c-v6.json) and [Word assessment v4](../verification/reports/word-candidate-assessment-v4.json) contain the exact ee61source-proof receipt and remaining failure. Historical raw/matrices and original first failures remain unchanged. No code/check/profile repeat is required for this evidence-only delta.

The source hold ends after this immutable intake. The resulting Integration report head/tree is recorded in primary `.omx/m0/integration-control.json` after the documentation commit; measured product source remains ee61.

## Remaining exact scope and next owner

Known portal primitive text/title update remains a genuine parent/predecessor FAIL. Its original oracle, exact source restore and raw hashes are preserved. The invalid new currentVNode callback oracle is separately corrected by source evidence and is not a product fix. The combined async-portal scheduler/visited cleanup path remains NOT VERIFIED; full package green does not accept that path. #531's source graph result and the residual Word RSS criterion remain distinct.

The native-attribution runtime and immutable evidence intake are complete. Planner's helper now reads only the official Chromium145 implementation to check the accepted-empty backend, prerequisites and target scope. This source analysis grants no flags trial, new browser/attach/sampler run, normal retry or semantic fix. No cache purge, GC, pressure simulation, heap snapshot, JS sampler, heavy trace or vmmap attach is authorized. #526 owns recorded verification evidence; #522 owns intake/shared resources; Planner owns the next bounded source/diagnostic scope, whole acceptance and release. M0OPEN/#528/#529WAIT_M0/developf4held. Primary main and original four planning WIP hashes remain unchanged; no push/PR/deploy, existing DB mutation, unrelated process stop or automatic closure occurs.

# Historical O/S and one-diagnostic checkpoint

**M0 remains OPEN for Word100 sampled aggregate RSS.** The single O optimization and its independent normal100/300 profile are complete. All three100-page samples exceed512MiB. Supplemental native table/zoom print proof now passes. Local develop remains `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`; Phase C adoption and whole M0 acceptance remain pending.

## Current source and checks

Measured source `4579f1030174bf87e4679888458d5631a35fe492`, tree `146248459a5faed173600965dbe04dfa5b7c2143`, contains Word O `8c3bc79cc63af3877b5513c681afeeb27364a62a` and supplemental S `07f4f43a35b3f7355f1dc846e80ece59b1361efc`. O changes only ID traversal allocation. Snapshot, typography, geometry, runtime, layout, View and renderer semantics remain unchanged from the earlier qualified closure. S changes only the Word test and findings document. The earlier broad snapshot draft was superseded before checks and was not adopted.

Integration independently verified and joined doc-only D `b9e9571b6e4b907cb939a04414cccea30b38f9e1` and Verification W3 `2a29a8ee431adc2a95d48b9547c4d560f10fae99`. Exact parents, trees, easylogic author/committer, no coauthor and leased paths match. W3 changes five verification receipt paths. Raw SHA `9e921d937f5de489b8bfbcd20d2d1564e64622070934c17f33403d394ce7d3a3`, all17production,7harness and10reused Core bindings match measured4579 and the handoff. RSS per-PID sums and six completed sample maxima match. Numeric budgets and raw history are unchanged.

| Actual check | Source/result | Boundary |
| --- | --- | --- |
| Full unchanged-budget preflight, log39 |O joinedaf4589d9; PASS exit0,284.094s | Lint2761files533errors7381warnings,0new/increased; source45projects/3known allowances; test41targets1251/1251 existing diagnostics. Not zero debt. |
| Word print units, log38 |O;23PASS,2.572s | Includes root/duplicate ID and SVG/CSS/local/external reference preservation. |
| Existing print browser A, log37 |O;8PASS | Whole combined14 attempt then failed at a supplemental preprint fixture rowspan count; remaining5NOTRUN. No print failure inferred. |
| Supplemental native print, log40 |S;6PASS,0skip/retry/flaky/errors,38.224s | Four real native table fixtures plus two supported reduced zoom cases; glyph/geometry, generated header, native/selection, actual fonts/PDF and cleanup retained. |
| Core V2 reference |Reused exact10files; all8timing/RSS/repeatability gates PASS | No Core profile rerun or provider/Canvas/UI claim. |

R corrected two owner-identified test-method errors before execution. S corrected the first actual preprint fixture expectation by binding merged cell IDs/counts/spans to native exports. Ordinary rowspan1 cells had inflated the old count. The unused ac2652 lease and actual log37 failure remain distinct historical records. No redundant full checks follow test/doc/evidence-only commits.

## Word O result and measurement limits

See [current criteria](../verification/reports/criteria-phase-c-v4.json) and [Word O assessment](../verification/reports/word-candidate-assessment-v3.json). All six fresh normal samples complete without guard, console/page or cleanup errors. Actual font identities, page/native/root counts, timing and repeatability meet frozen v1.1.

| Gate |100pages,3fresh samples |300pages,3fresh samples |
| --- | --- | --- |
| Cold open, worst |368.7ms <=1000 |1087.3ms <=3000 |
| Warm native completion, worst |112.6ms <=250 |368.3ms <=750 |
| Print build, worst |29ms <=1000 |79.3ms <=3000 |
| Actual print node delta |4501 each |13501 each; ratio2.99955565 <=3.5 |
| Sampled owned aggregate RSS bytes |577470464 /598196224 /575438848; **all3MISS536870912** |806305792 /799784960 /804552704; all below1073741824 |

100preprint maxima are525942784/570408960/575438848bytes. Samples1/2 already exceed512MiB under the warm/native completion label. Sample2 has no print-tagged RSS poll; its maximum is not a measured print peak. The print label includes adjacent deferred layout/CDP readout. Open→postprint heap includes font query and warm rendering. These records do not isolate an allocation cause or establish an accumulating Map leak.

RSS is maximum200ms sampled owned process aggregate, includes shared pages and can miss short peaks. It is not continuous/private physical HWM. Different source windows are not a controlled A/B. All24 observed PIDs and55260listener are absent after cleanup; O lease is RETURNED. No identical qualification retry, target increase or blind micro-optimization loop follows this miss.

## Bounded actual PDF review

Each of the six supplemental PDFs has four nonblank pages. All36 expected continuation generated-header cells appear in actual PDF text. All24 pages were rendered offline. Parent reviewed six page4 images; a read-only native helper reviewed six page2 images. No concrete header/body overlap or tail/end-row paint defect was found in those12visual pages. Normal/reduced line and parallel fixtures have identical rendered pixels on all four corresponding pages. Primary `.omx/m0/530-S-native-PDF-review.json` binds exact PDF hashes/renders. This is bounded paint evidence, not universal PDF or physical paper acceptance.

The earlier P2b page5/6 concern remains retracted; its correction below is retained. Rich B36 remains2PASS/1preprint legacy 보기-tab failure/5NOTRUN. Existing editing/Save flow and Slides baseline UI findings require separate owner triage; supplemental print-only proof does not accept them.

## One diagnostic completed; next source boundary remains read-only

The diagnostic protocol/harness `8235bc847b3b0399e2ac3147bace620d065d8586` was committed before data and independently reviewed. Integration joined it at `6e3bcc03a5e2cb1f50fe7291e582aa92e85f659e`, tree `0fe8be1c63531c2b3eaa9f02fcdb076f652a3d0f`, then granted a new diagnostic-kind, max_runs1 serialized lease. No production, normal harness or numerical budget changed. Six targeted guard/read tests, strict2roots0diagnostics, scoped lint0/0, syntax0 and expected missing/old-lease refusal passed before execution. No full preflight or Core profile was repeated for this verification-only delta.

Exactly ONE fresh100-page/800-paragraph diagnostic completed in15.434571125s, exit0, with11seams/22sequential readsets/99completed seam-read brackets, actual reference fonts and one final diagnostic GC. No guard/page/console/cleanup error occurred. All four observed owned PIDs49168/49205/49206/49218 and55260listener are absent. Canonical lease is RETURNED. Integration checked the raw and all30source bindings; raw SHA is `b6a6ca09f07d104df6252b6b694d2727d26091572d09c8a8cb3ab80635505ef8`. Evidence-only `eadc3576cfdeccff03ac90ab25e90c0f3bbb4570` changes six leased verification paths and is joined. All prior v4 qualification criteria are preserved exactly in [v5](../verification/reports/criteria-phase-c-v5.json). See [diagnostic assessment](../verification/reports/word-memory-diagnostic-assessment-v1.json) and [interpretation](../verification/reports/word-memory-diagnostic-v1.md).

Closest adjacent readsets show font→warm CDP used heap +12,711,252bytes, DOM nodes unchanged3356 and RSS −5,849,088bytes. Warm→print CDP used heap +1,834,712bytes, nodes +4501 to7857 and RSS +10,190,848bytes; the later second print readset adds another9,895,936RSSbytes. This identifies the largest observed preprint JS-heap interval in this diagnostic, not a function-level allocation cause or RSS byte accounting. Page performance.memory and CDP differ by about17–18MB and remain separate series.

The diagnostic observes screen media throughout: printMatches=false, actual print stylesheet present, container/page block/static/visible and copy flex/static/visible. LayoutDuration already increases0.059086→0.086372s before the explicit deferred geometry read; deferred counters then stay unchanged. This is screen print-DOM construction, not an actual print-media performance qualification, and does not explain the original preprint RSS miss by itself.

clearPrint/dispose remove live printed pages, surfaces and runtime globals. Global native node counters remain7857 until observer release and the final diagnostic GC, then fall to31. The nearest pre/post-GC CDP used-heap difference is−32,840,020bytes and RSS−79,478,784bytes. Forced diagnostic GC does not prove a leak, its absence, or natural cleanup timing. Readset skew102.143–551.818ms/fullpair380.054–765.469ms and changed host pressure perturb scheduling/GC/residency. Diagnostic maximum sampled RSS464,273,408bytes does not reverse normal O's three512MiB misses. No retry follows this attempt.

The smallest justified next read-only source boundary is existing warm api.render(100)→runtime.view.render()→render-tree/content/reconciliation and Word native completion before print. Planner's existing helper examines that boundary and safe invalidation/regression proposals without tests/browser/writes. No particular Map/cache or source defect has been established. The source hold for this diagnostic ends after immutable intake; no production write lease, snapshot/renderer/layout repair, root/dependency change or further profile is authorized from RSS alone.

#526 owns diagnostic interpretation; #522 owns exact intake and shared resources; Planner owns the next bounded source decision and whole M0 acceptance. M0 remains OPEN; #528/#529 remain WAIT_M0; develop remainsf4. No push/PR/deploy, existing DB mutation, unrelated process stop or automatic Issue/Goal closure occurs. Primary main and original four planning WIP hashes remain preserved.

# Historical P2b/W2 checkpoint

**M0 remains OPEN for Word100 sampled aggregate RSS and supplemental native table/zoom print proof.** Core's repaired bounded reference workload passes. Word normal100/300 now completes all six fresh samples and passes timing, fonts, repeatability and measured node growth. Two100-page RSS samples still miss512MiB. Local develop remains `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`; no Phase C adoption, whole M0, product or release acceptance is inferred.

## Current immutable source and checks

The current joined evidence parent is `eb2c019f391660ca7198ac3354dce39405bc0db2`, tree `e1581621e0f219c32a07581d7dbc93851e7ff55c`. Its measured Word source is `ccf1ffd0353eccbdc23b922e54973fb0919b81a4`, tree `3c4b0234375c1f944960e0f72f982530c62e79f3`. It contains the original W async-layout repair, Core K, guarded method G, page-local Word P and its source-causal P2 line-height repair, test-only P1/P2b, and immutable Core/Word receipts. This new commit changes only Integration's report/routing; resulting head/tree is recorded after commit in primary `.omx/m0/integration-control.json`.

| Actual check | Source and result | Scope |
| --- | --- | --- |
| M0 strict/native, log28 |6b3ea4a; strict28roots+imports0diagnostics,126/126PASS,0skip,5.339s | Bounded native source and independent contract/guard checks. |
| Final affected Word print units, log33 |ea70e738;21/21PASS,10.031s | Includes locality, ownership/cleanup and unitless-versus-fixed line-height regressions. |
| Unchanged pnpm preflight, log34 |ea70e738a4ba9de27d829675e9ddc0efdff65225; exit0,336.767s | Lint0new, source45projects/3known allowances, test41targets1251/1251existing debt budget. Not zero diagnostics. |
| Exact P2b source/print browser A, log35 |1ff71ac5;8/8PASS,0skip/retry,19.407s | Retained real PDF/actual loaded fonts; source-native unitless AND fixed24px header geometry; mid-edit restore; per-sheet header/footer/footnote text/rect; paragraph seam, body locality, native export/Range/IDs/rebuild/clear. |
| Selected rich browser B, log36 |Same P2 production closure;2PASS/1FAIL/5NOTRUN+1suiteerror,47.039s | Math KaTeX/long-math actual print PASS. Table-cell test times out at missing legacy 보기 tab before print. This is a preserved UI/test-flow finding, not P2 print FAIL or all-rich PASS. |

P2's source repair preserves a typed unitless computed line-height instead of converting it to used pixels; fixed px remains fixed. It is not a header-height patch or blanket px-to-ratio rewrite. The actual P1 source/header20.390625px versus printed24px failure remains preserved. P2 and P2b restore the matching geometry without raising tolerances. No print.ts/runtime/layout/view/renderer semantic edits were made in #530.

P2b after ea70 changes only Word's spec and findings doc. Its author appWord test-type guard0/0 and scoped lint0errors/1unchanged warning supplement the exact unchanged production closure. No redundant full preflight or native/print-unit repeat was run for this test/doc-only successor or for evidence-only commits. Earlier View/Renderer/Word/Canvas/Slides checks and all first failures remain in the historical sections below.

## Qualified Core reference and explicit reuse

Independent Core V2 `ea861b2f873864c609451e13bcbcfa89691a5e45`, parent6b3ea4a, contains eight Verification-only paths. All eight frozen timing gates,512MiB child high-water RSS and14phase/3total repeatability gates pass on the named recorded loaded machine. One-cell TOTAL is51.555/54.158/51.680ms; cold worst898.884ms; paste worst81.311ms; max child HWM317259776bytes. Construction/admission, projection, diff and calculation work remain included.

Integration checked the raw SHA and all ten exact Core/Formula/harness/budget file hashes, including K's workbook blob `451b22a95cbcfac6e3e8b19551771db141bed64d`. Those ten files remain unchanged through the Word-only successors. Verification records reuse bindings; primary `CoreK-v2-reuse-ea70.json` independently confirms them. No Core profile is repeated for these test/doc/Word deltas. The original7d902 one-cell misses remain immutable history; no universal causal speedup, provider/Canvas/UI or whole-product claim is made.

## Actual repaired Word reference remains a memory MISS

Independent Word W2 `eb2c019f391660ca7198ac3354dce39405bc0db2`, parentccf1, contains exactly five Verification-only paths. Integration checked the raw assessment SHA and all17production plus7harness bindings against the measured source. See [current matrix](../verification/reports/criteria-phase-c-v3.json) and [actual Word assessment](../verification/reports/word-candidate-assessment-v2.json). Frozen v1.1 numeric budget SHA remains `dbcd9612017bf47ac7f00d43cea2225e79bc6eb4c5de3a256af4d99271bac40d`.

| Frozen Word gate |100pages,3fresh samples |300pages,3fresh samples |
| --- | --- | --- |
| Normal cold open |Worst378.3ms <=1000 |Worst1038.4ms <=3000 |
| Warm full native view/layout |Worst113.9ms <=250 |Worst354.1ms <=750 |
| Actual synchronous print DOM build |Worst35.7ms <=1000 |Worst96.7ms <=3000 |
| Printed native node delta |16201 each |48601 each; measured ratio2.99987655 <=3.5 |
| Observed aggregate owned RSS bytes |527810560 /591446016 /604405760; two exceed536870912 |717225984 /718061568 /799506432; all below1073741824 |

All six normal fresh-process samples complete without guard, console/page or cleanup failure; all actual selected glyph faces match the exact installed reference fonts. All phase repeatability gates pass. The original whole-source clone331601nodes/100pages and first3002GiB guard remain preserved, not discarded.

100preprint observed maxima are527810560/530055168/526008320bytes, all below512MiB. In the two failing samples the print-labelled polls reach591446016/604405760. The tag persists into CDP/deferred layout/readout, so it cannot isolate synchronous build allocation or prove a JS leak. Child PID roles beyond the owned root are not classified. JS heap rises from about38MB to61MB and CDP nodes from3356 to19557. Sample0 has no print-tagged RSS poll; its observed527810560 is not a proven print peak. RSS remains maximum200ms sampled aggregate/shared pages, not continuous/private physical HWM. No GC workaround, process change, target increase or identical heavy rerun was used.

All24 observed owned PIDs and port55260 were independently absent after cleanup. The performance slot was returned before offline assessment. Core evidence and old failed Word raw files remain unchanged.

## Actual PDF and corrected visual reading

The retained eight-page P2b PDF SHA is `d01522d3325e89879b546d2d1003d181c0be2278b1dbf0cbc81f2f7f3574ca16`. All eight pages have extracted content; the footnote body is on page2. All pages were rendered for review. Source/print character and geometry proof is separate from mere PDF page count and from physical paper/Office interoperability.

The initial reviewer claim of page5/6 near-top body/missing headers was a reading error and is **RETRACTED**. Exact original PNG hashes match both reviewers; header-region pixels are identical on pages2–7, SHA `e5aafeb97a32f2fcd839e8031d1e0c532dbc087ca29b48de05bf36f824fd4b34`, with ink at40–48px and no other ink above72px. Planner's byte-bound PDF check places header words at37.05pt and first body words at73.17pt. Primary `530-P2b-PDF-header-pixel-check.json` preserves the correction. The original files stay intact. No semantic blocker, fix or extra heavy diagnosis is based on that false finding.

## Remaining exact work and next owner

Execute Word Layout #530 owns the already approved supplemental four real native table fixtures and at most two supported reduced-zoom cases inside its leased Word spec/findings doc. These compare source-visible authored glyphs and geometry, repeated-header paint, native/selection, actual fonts/PDF and cleanup. Old B's2PASS/1pre-print UI failure/5NOTRUN remain separate. Candidate ac2652 was held **before any execution** when its owner found two test-method defects: generated CSS repeat headers are not text nodes, and a forced screen media override must be cleared before real PDF. Its unused lease is returned; it is not a product/test execution failure. The owner prepares an exact test/doc-only correction before the next finite six-case window.

Word #530 also performs read-only phase/PID/source lifetime decomposition of the residual100RSS miss. Planner owns any new precise semantic file/priority lease; no speculative memory patch or broadened source ownership is inferred. Verification #526 owns independent raw/assessments and any later explicitly leased profile. Integration owns exact intake, source-aware frozen graph/config/develop, aggregate checks and serial browser/performance resources.

All completed or held canonical leases are RETURNED. M0 remains OPEN; M1 #528 and M2 #529 remain WAIT_M0 planning. No release/alpha/physical IME/authenticated product acceptance, push/PR/deploy, old backlog/schedule restart, existing DB mutation, unrelated process stop or automatic Issue/Goal closure occurred. Primary main and the original four planning WIP hashes remain preserved. Commits use easylogic author and committer, no coauthor.

# Historical Phase C — first measured checkpoint

**M0 remains OPEN.** The normal large-Word layout defect is repaired, but actual Word memory and Sheet single-cell TOTAL miss the frozen targets. Planner assigned the measured source repairs to Word #530 and Core #523. Local develop remains `f4ed8eddafdca39290b4d9a7b8ec14eb1405907f`. The joined preparation branch is not an accepted Phase C develop checkpoint.

This current section supersedes only the named Phase B states below. Historical first failures, raw data, original acceptance and old checkpoints remain preserved. #522 owns integration and this receipt; #521/#520 acceptance stays Planner-owned.

## Exact intake and evidence binding

The measured and broadly checked source is `7d902bc69bf98b0dc6aaf681a24d34c7066703a1`, tree `300251a4c121e39c4df43690108669035adda08f`. It joins Core E `9e823ba320c3071fd11a495bfd2522044a6e7642`, Verification D `ccdaf138bd6ef7603b5319dc6c5dd14244620c48` and P through P4 `92ab8dd2345c726d700ee3ee2557b51d5a25f777`, Word W `522b25bd2477e0dde62c7dbf45271aaf182117e0`, and the approved Phase C routing. All deltas were checked against exact parents and leased paths. Integration authored no domain semantic repair.

Verification's evidence-only R `f6f9d3d8725942cdce6e855b0d0fe2de5842060d` preserves10owned files under verification, including the raw Word report, three raw Sheet children/summary, explicit assessments and current matrix. Integration independently checked both raw SHA-256 assessment bindings and all27 recorded source-file hashes against7d902. R changes no measured code or budget. See [current criteria](../verification/reports/criteria-phase-c-v1.json), [Word assessment](../verification/reports/word-candidate-assessment-v1.json) and [Sheet assessment](../verification/reports/sheet-candidate-assessment-v1.json).

Owner-only lint L `f8c39d2290f135f305ac7dce9668fb515fc6baa7` and cleanup successor C `4473ab9f29a1e7a8420739b113eab1f50a60969f` are joined after R. C corrects the failed-mount temporal-dead-zone defect found while reviewing L: actual diagnostic-module VM refusal first left the observer/prototypes unrestored, then passed after the initialized holder correction. Three scoped MJS files have0lint errors/warnings and parse checks pass. Historical measured source remains7d902; no guard/target/profile method changes are included in L/C. The separate full-startup guard revision is still Verification-owned work.

This receipt and matching latest multi-agent policy/routing sections are documentation only. The exact resulting head/tree is recorded after commit in primary `.omx/m0/integration-control.json`. No self-referential hash or code/profile rerun is needed for these text changes.

## Production cause and meaningful aggregate checks

At original f4, the full100-page fixture passed native admission and had matching native/DOM root and800paragraphs. Layout ran before asynchronous DOM commit with zero surfaces; actual renderer completion created the surface without a normal follow-up layout. One diagnostic post-commit render produced100pages. W ships completion-gated layout with finite3round convergence, root/generation/epoch/disposal retirement and composition settlement. It does not ship that diagnostic force. Physical OS IME remains unverified.

The production shared View change invalidates the earlier isolated-only reason for skipping broad checks. Integration ran the following batch with Node22.22.0/pnpm8.15.0 and frozen dependencies. Early production checks ran after W; exact packages/apps trees are unchanged from `67387da7ad47f6a1b3ae5a98a354866fbaee7812` through7d902/R/C. The standalone native and root checks below bind directly to7d902. No existing budget, exclusion or root dependency was changed.

| Check / primary log ID | Actual result | Boundary |
| --- | --- | --- |
| Full View,17 | 596PASS /3existingSKIP; exit0,137.228s | 50files,599cases; skips stay skipped. |
| Full Renderer,18b | 810PASS /4existingSKIP; exit0,45.808s | 108files. Initial18 unsupported --minWorkers CLI failure happened before tests and remains preserved; corrected Vitest4-supported command follows. |
| Word layout/measure/table pagination/print,19 | 99/99PASS; exit0,12.669s | Eight actual existing test files. |
| Canvas connector/layout/graph,20 | 192/192PASS; exit0,1.601s | Three existing directly affected files. |
| Actual Slides connector browser,21 | 21PASS /5FAIL /17NOTRUN; exit1,122.436s |43cases,120s global bound,2suite/teardown errors. No whole-suite green claim. |
| Exact five failed Slides assertions on f4,22 |5/5FAIL; exit1,51.307s | Same frozen graph/browser/viewport/per-case assertions, selected5only. No full43case repeat. |
| Standalone M0 strict/native,23 |28strict roots+imports0diagnostics;17nativefiles111/111PASS,0skip; exit0,12.035s | Actual Core/Formula/collaboration/store/independent guard checks. Not product/browser/performance acceptance. |
| Root pnpm preflight,24 | FAIL atlint; exit1,49.287s | Checks93/93, release30/30, npm14/14, docs4/4+coverage passed. Lint2760files537errors7381warnings,4new/increased diagnostics. Source/test types were short-circuited. |
| Root pnpm type-check,25 | exit0,134.675s;45projects checked | Three existing known-broken demo allowances retained. Not45zero-diagnostic projects. |
| Root pnpm type-check:tests,26 | exit0,195.121s;41targets1251/1251 | Actual existing diagnostic counts match unchanged budgets; View104/104 and Word7/7 are debt compliance, not zero diagnostics. |

Full stdout, exact argv/cwd/time/status and traces remain in `/Users/user/barocss-editor/.omx/m0/integration-logs/` and the sibling slide-impact artifacts. `522/slides-baseline-ui-v1` is a tracked baseline finding with readiness needs-triage and next owner Planner/source-test owner to scope. All five missing/hidden-control failures reproduce at f4, including connector.spec.ts47 missing insert-connector and1217 hidden clear control. This supports baseline attribution for those assertions, not acceptance of later steps or the17unrun cases. No force click, exclusions or unrelated UI edits were added.

Root first lint errors are Core workbook.test.ts38 unnecessary quote escape and Verification's unused import, unused map index and prefer-const. Exact fixes return to those owners. L/C address the latter three; the Core quote is assigned to the current Core candidate. Whole preflight has not been rerun or declared PASS. Required source/test types were run separately, rather than silently treated as covered by the failed chain.

## Frozen numerical observations and limits

[Reference budget v1.1](../verification/reports/reference-budget-v1.1.json) was frozen before these observations. Earlier Integration proposals are superseded. The recorded loaded M3 Max/36GiB workstation, Chromium145.0.7632.6,1280x900/DPR1, actual fonts, before/after load/memory/swap and exact source/input/runner hashes are retained. Absolute idle or zero allocated swap was not a gate. Three observations give worst-of-three/coarse nearest-rank p95, not a population tail. Repeatability requires phase CV<=0.25 OR spread<=10ms.

| Actual workload | Observed result | Frozen gate / disposition |
| --- | --- | --- |
| Normal Word100cold,3fresh samples |337.4 /322.4 /323ms |<=1000ms, timing and repeatability met. Actual native/root/surface800paragraphs/100pages correct; no forced cold render or method patch. |
| Word100warm full render |110.8 /101.7 /99.3ms |<=250ms, timing and repeatability met. |
| Word100print DOM build |65.6 /60.9 /64.7ms |<=1000ms, timing and repeatability met for synchronous construction only. |
| Word100owned aggregate RSS |1603551232 /1631666176 /1631027200bytes |All exceed536870912. Sample2 already562053120before print. Do not attribute all memory to print. |
| Word100native print-node delta |331601 in all3samples |Exactly100*(2514descendant elements+800text+1source root)+100page wrappers+1container. Full source cloning per page is demonstrated. |
| First Word300attempt |Cold1027.9ms, warm347.5ms, print537.3ms, sampledRSS2198929408bytes |First print readout crosses2GiB guard. Owned browser closed;2remaining samples and actual300postprint node counter NOTRUN. No300percentile or observed growth ratio. |
| Sheet exact10krows/100columns/50kcells/10kformulas |3fresh successful functional children |Headless actual Core/calculator only; no provider/Canvas/UI capacity. |
| Sheet cold TOTAL |1262.37 /1539.75 /1355.03ms |<=2000ms; met, includes construction/admission/projection/registration/calculation. |
| Sheet one-cell TOTAL |296.46 /462.17 /268.92ms |All exceed200ms; concrete Core projection/diff repair assigned. Dirty formula work visits1changedcell/1formula. |
| Sheet1000cell paste TOTAL |232.84 /324.97 /295.67ms |<=500ms; total gate met. Per-phase repeatability remains separate. |
| Sheet child high-water RSS |Max348602368bytes |<536870912; actual process high-water evidence. |

The other Sheet phase targets are met, but edit projection and paste diff fail the phase repeatability condition. The one-cell miss is preserved despite all three children exiting successfully. Total costs include event construction/admission and calculator registration/update; no cache cost is hidden outside these totals.

Word RSS is the maximum200ms sampled sum over owned processes, including shared resident pages; it is not proven continuous peak or private resident memory. Observed target/guard exceedances are valid. The current45s timer/RSS monitor starts after browser launch/connect, so startup is outside that guard; a separately reviewed method revision must fix this before the next profile. Native CDP global node deltas can theoretically undercount during unrelated GC; the100exact source accounting matches every observed delta. Source-derived300growth8.97x is only a prediction, not a measured ratio. Print DOM build excludes deferred native style/layout, PDF/spool and paper fidelity. These boundaries do not raise targets or erase failures.

Actual selected CDP glyph faces in all attempted samples match CoreText provenance: ArialMT5.01.2x SHA256 `525979822591a3447cfc49d943d6f7683508e25543407871c0ed8fed05fd2bd9`, AppleSDGothicNeo-Regular19.0d2e1 SHA256 `0452cde17bbdfe71106680879df943034a003c537c95a4137bab124b3cfa4b66`. No font redistribution occurred.

## Concrete next owners and preservation

Planner activated existing Word Layout under [#530](https://github.com/barocss/barocss-editor/issues/530) for page-local complete paint projections/indexing and existing Core [#523](https://github.com/barocss/barocss-editor/issues/523) for bounded private recent checkpoints with full canonical fallback. Both new managed branches start from7d902; E/W and old worktrees stay preserved. Exact leases and invariants are in those Issues and the appended Phase C routing. Verification #526 owns harness guard revision, independent evidence and the later frozen profiles. Integration owns serial graph/config/develop/runtime resources, exact intake, aggregate checks and browser/PDF correctness windows. Unit success is not performance or PDF acceptance.

Canonical old Word/model performance leases are RETURNED; raw copies remain unchanged. No identical heavy failure is retried. Next profiles require immutable repaired sources, reviewed guard method and a new finite source-bound Integration lease. No all-author ACK barrier or whole-repository helper checks are added. Matching latest human native-subagent policy sections are persisted in AGENTS.md/workflow after the fixed-source checks; parents remain accountable and helper write scopes are disjoint.

[M1 #528](https://github.com/barocss/barocss-editor/issues/528) and [M2 #529](https://github.com/barocss/barocss-editor/issues/529) now contain the exact proposed runtime/access/durability versus Sheet/Note handoff. Both remain WAIT_M0; no production package, service, migration, new role or runtime is activated by this report.

Primary main034a42c and all four original planning WIP hashes were rechecked unchanged after the checks. Commit author and committer remain easylogic <cyberuls@gmail.com>, no coauthor. No push/PR/deploy, existing DB mutation, unrelated process stop, old backlog/schedule restart, physical IME claim or automatic Issue/Goal closure occurred.

# Historical Phase B — bounded local decision pack v1

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

Model observations at historical F: peak RSS417,005,568bytes; canonical revision12,466,063bytes for10,152events; cold Core p50~866.34ms, initial calculation p50~66.49ms; single-edit Core projection p50~883.28ms and diff p50~543.22ms, separate from dirty calculation p50~0.047ms. Calculator dirty incrementality does not remove Core projection/diff costs. Raw samples/percentiles and source reuse proof through Q are retained; the typed-AST workload did not invoke Q's changed parser. The final native aggregate includes the existing2,000-cell correctness regression and its emitted micro-timing diagnostic. The separate10k-row/50k-cell profile and browser measurements were not rerun; the micro-timing is not a qualified performance budget.

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
