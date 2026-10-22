# Independent M0 verification — #526

This lane owns only `experiments/office-suite-v2/verification/**`. It does not accept
M0, the product, release, or the Office compatibility roadmap.

Latest source-bound state: `reports/criteria-phase-c-v4.json`. Core v2 meets its
bounded reference targets. Word O meets latency/node-growth targets but misses
100page RSS in all three samples. Whole M0 remains OPEN. The S/Q/F receipt below is
retained history; later Phase C sections record the actual production successors.

Analysis/scaffold: S `9b390602d90e07f496b7b699915b7d605582d8a4`.
Final correctness dependency Q `3f8354c6bb733bc597488d64c3bf41e5f650f6f8`; parent K.
K holds the checked Core/provider/prose/store dependencies. Q changes only the parser and its owner tests/manual.
Scale source F `b785fd65c6fae71c57b70650b06f69a68bea3070`; its Core/calculation/reference files are unchanged through Q; Q parser differs. The native-AST scale run did not invoke the parser.
At the original V receipt, production Word files were byte-identical to S. The
original runner checked those bytes and recorded their SHA-256 independently of
a later HEAD. Current Phase C methods bind their separately recorded exact source.
Node22.22.0, pnpm8.15.0, frozen standalone dependencies supplied by Integration.

## Reproduce the owned correctness checks

From `experiments/office-suite-v2` with Node22.22.0 first in PATH:

```sh
pnpm --ignore-workspace type-check -- verification
pnpm --ignore-workspace test -- verification
python3 verification/corpus/test_corpus.py
```

The TypeScript tests import the actual delivered `ProseReplica`,
`DisposableDurableStore`, `PendingUpdates` and validators. They do not implement a
parallel prose/store engine. SQLite uses only directories created by the actual
store's disposable factory. Tests close and remove only their own directories.
ACK-loss recovery includes a new Node process reading the real persisted SQLite
state, then idempotent retry and checkpoint plus later update replay.
The current-access/session callbacks are controlled server seams, not real Office
identity or OIDC acceptance. Real Sheet binding probes now separately verify authenticated native event identity
and admitted-body tamper refusal. Additional raw deletion/hidden collision forms
remain owner evidence and are not relabeled as independent Verification probes.

`profiles.ts` describes the exact Sheet10k/100/50k/10k workload. It is input data,
not a model, calculator or oracle. `sheet-scale.mjs` imports actual Core and Formula. It ran three fresh child
processes with a60second/768MiB bound per sample. All three completed. Raw per-phase
samples, nearest-rank percentiles, memory and cumulative calculation counters are
in `reports/sheet-scale*.json`. Peak observed RSS was417,005,568bytes. Canonical
revision length was12,466,063bytes for10,152native events. Cold projection p50 was
866.34ms, initial calculation p50 was66.49ms, single edit Core projection p50 was
883.28ms and Core diff p50 was543.22ms; the subsequent dirty calculation p50 was
0.047ms. These costs are distinct. A one-cell input change visited one changed
cell and evaluated one dependent formula. A1,000-cell paste evaluated250formulas.
No whole-workbook rescan by the calculator is inferred from native projection cost.
The initial50,000-cell registration and40,000dependency edges are recorded.
This is observational model evidence, not a frozen budget or interactive timing.
It bypasses SheetReplica/provider/durability, whose historical H all-prior-event dependency growth was corrected by owner K.
An independent bounded check verifies40sequential appends use40edges and a
three-offline-branch join uses three heads; full10k provider scale is NOT RUN.

The independent25-case source set now imports genuine Core, Formula, SheetReplica,
ProseReplica and durable store. It checks native arrival-order permutations;
value/formula alternatives; same-position inserts; delete/formula/REF agreement;
copy versus cross-sheet cut; session undo; structural conflict preservation;
current access; ACK loss/replay; late ACK; and actual server identity/body-tamper
refusal. No Yjs primitive is imported by Verification. The admitted-body attack
changes a unique equal-length UTF-8 marker in actual provider bytes and requires
a specific semantic admission refusal, not a generic parse failure.

## Corpus and compatibility boundary

`corpus/generate.py` uses only the Python standard library. It produces deterministic
ZIP packages with fixed member timestamps. Content and the2x2 PNG are synthetic
CC0, with no font/media/document copied from a third party.

- DOCX: Korean/Latin, numbered list, merged76-row table, image, header/footer/footnote.
- XLSX1900/1904: two sheets, typed values, date serial, errors, mixed/cross-sheet
  references, SUM/IF/arithmetic, merge and styles. Cached formula values are
  hand-authored fixture data; reading them is not independently proven recalc.
- PPTX: text, rectangle, grouped PNG and a complete internal layout/master/theme chain.

OPC/XML checks prove fixture integrity only. `reports/docx-semantic-parts.json`
records actual package losses after the real current DOCX importer/exporter;
`word-smoke.json` includes native model counts, full warnings and text comparison.
Current DOCX loses image, list numbering, header/footer and footnote parts. The
basic table and horizontal gridSpan survive this fixture. Original-file retention
means our corpus bytes remain unchanged; no product original-retention workflow
is accepted by this observation.

Actual local Microsoft Excel16.114 opened both synthetic XLSX files and returned
two sheets, the correct date-system flags and values75/28/7/9. Exact scripts,
stdout, timestamps, hashes and bounded assertions are in the native Excel reports.
No exported product XLSX or recalculation-after-edit claim follows.
Microsoft Word16.114 actually opened our source fixture and the current product's
export. CUA AX/screenshot receipts identify both exact paths and bytes. Original
header/footer/image/footnote nodes are visible; the current export lacks them.
The first Word AppleScript observation timed out; it remains recorded separately.
CUA then confirmed the open and closed only our two fixture windows, without save.
PowerPoint16.114 opened the synthetic PPTX as one slide; screenshot shows the
Korean/Latin title and an image region. Detailed grouping/fidelity remains unverified.
No third-party cloud service, paid service, actual user document or account was used.
No full Microsoft Office interoperability acceptance is asserted.

## Word baseline runner and first failures

`word-runner.mjs` loads Integration's pinned Vite5.4.21/Playwright1.58.0. Its
verification-owned browser entry imports the actual `mountWordRuntime` and current
native renderer, measurement, pagination, print and DOCX modules. No renderer or
layout implementation is copied. Integration owns dependency installation.

The only allowed server bind is127.0.0.1:55260, with a fresh browser context per
sample and external requests blocked. Chromium is145.0.7632.6, device scale1,
1280x900 viewport, AppleM3Max/14logical CPUs/36GiB memory/macOS Darwin24.6.0.
The runner checks production source against S and records runner/source hashes.
Do not invoke it concurrently with another listener or outside an Integration
lease. Example, after a newly granted quiet lease:

```sh
M0_WORD_ROOT=/absolute/Integration/worktree \
M0_QUIET_RECEIPT=/absolute/current/quiet-window.json \
M0_SAMPLES=3 node verification/word-runner.mjs
```

The workload is8 synthetic Korean/Latin paragraphs per page group, with explicit
`pageBreakBefore` boundaries for100/300groups. Source content grows linearly. It is
an explicit-break workload, not proof for unrestricted naturally paginated prose.
Statistics use nearest-rank percentiles and retain raw samples. Three observations
would give coarse tail estimates, not a stable population p99.

One-page smoke passed actual open/layout/render/print-DOM construction. Harness
setup failures (Vite CJS API, React prebundle, CDP CSS domain) are retained in logs;
none was repaired in production code.

The first100-page attempt failed: no stable page output within45seconds. The
bounded diagnostic observed800actual paragraphs,2414root elements, zero sheets
and an empty layout map. No successful100-page latency/memory/print samples exist.
300pages is NOT RUN. Environment versus product/harness cause is UNKNOWN.
The host had load average226+ on14logical CPUs despite M0 lanes holding heavy
checks; Planner qualified the window as unsuitable for budgets and released it.
No identical heavy rerun, timeout relaxation, new300-page run or unrelated process
stop followed that decision. The bounded already-active diagnostic finished and
closed its own browser/server. A later tiny discriminator used the SAME fixture
pattern truncated before mount to16paragraphs/two groups: actual native schema
admission passed, document model/DOM root agreed, the sole surface ID matched the
model, and two sheets/layout pages appeared without page/console errors. Its
Vite all-HTML scan also emitted an unrelated missing-alias warning, preserved in
the log. Thus tiny root/observer wiring works; the100page schema/surface/root
state was not fully captured, and neither cause nor100page capacity is settled.
See `word-tiny-diagnostic.json`. Numerical budgets are NOT FROZEN.

The smoke's CDP font query returned an empty list: exact chosen fallback/font
file versions are NOT VERIFIED. Browser-declared font family is recorded. Font
provenance is a remaining prerequisite for a qualified reference-machine run.
Print measurement times only actual `createPrintPages.build()` DOM construction,
not PDF layout, OS spool, or paper fidelity. Headless Sheet does not measure
Canvas, scrolling, keystroke-to-paint or physical IME.

See `reports/criteria.json` for PASS/FAIL/NOT RUN boundaries and source/log bindings.

## Exact phase handoff

Final parent Q: `3f8354c6bb733bc597488d64c3bf41e5f650f6f8`. At K, the
then-current suite passed24/24 with no skips, strict9roots/imports0diagnostics.
The added arithmetic case first failed on K as documented. After Q, only the
directly affected Formula adverse file was rerun:4/4PASS, strict1root/imports
0diagnostics. K non-Formula evidence is reused under the bounded parser-only
change. No fresh full25-case Q execution is claimed. Corpus integrity3/3. Node syntax
checks cover all five measured/probe MJS files. Root preflight/build is NOT RUN;
Integration alone owns aggregate and broader checks. No production semantic fix,
root/config/lock change, push, PR, deployment, schedule, existing product database
write, or unrelated process stop was performed. Only this subtree is committed.
M0 remains OPEN because required Word100/300 performance, qualified font
provenance/numerical budgets and the complete decision pack are unfinished.
Actual Office product/authenticated multi-account lifecycle acceptance belongs
to M1/M2 and is a separate state, not an extra M0 prerequisite.

## Focused arithmetic successor

Planner identified the F/K exponent-binding mismatch. Verification independently
reproduced `=-2^2` as-4 instead of4; the exact first failing K log is retained.
The expected4and64for `=-2^2` and `=2^3^2` are inferred from the official
[Microsoft Excel operator table](https://support.microsoft.com/en-us/excel/calculation-operators-and-precedence-in-excel),
read2026-10-21: negation precedes exponentiation, and equal-precedence operators
evaluate left-to-right. This is a narrow reference rule, not a copied engine or
Microsoft Office execution of these new cases. Formula owns the correction.
The earlier native Excel fixture reads did not cover these operator cases.
No heavy scale repeat is needed for this parser-only correction: the measured
headless workload constructs native SUM/range ASTs and does not invoke the parser.

Q focused arithmetic validation passed both4and64 expectations. The original K
failure stays in `logs/formula-exponent-K-first-failure.json`; the passing source
is bound to Q in `logs/formula-adverse-final-Q.txt`. Heavy scale raw data remains
F observational evidence. It is not final-Q capacity or numerical-budget acceptance.

## Phase C: confirmed completion cause and frozen reference budget v1.1

The original V and45second failure remain immutable. At diagnostic D
`ccdaf138bd6ef7603b5319dc6c5dd14244620c48`, actual full100fixture admission
passed; model/DOM root and800paragraph surface were correct. The actual first
layout callbacks ran before async DOM completion, then were not resumed after
that completion. One explicitly diagnostic post-commit render produced100pages.
This now demonstrates the source scheduling cause; it is not a performance pass
or a shipped workaround. `reports/word-phase-c-diagnostic.json` retains the
ordered callbacks, exact source/harness hashes and normal0page versus controlled
100page observations. Word Layout#527 owns the production view correction.

The paragraph's actual text-bearing span uses ArialMT and
AppleSDGothicNeo-Regular according to CDP glyph counts. CoreText resolves each
exact face to its installed version/file SHA-256, recorded in that report. Font
bytes are not redistributed. Later reference measurements must match these
actual faces/version hashes, not merely a CSS family string.

`reports/reference-budget-v1.1.json` is the ONE Planner-frozen target/method
record, committed BEFORE fixed E/W measurements. Earlier Integration looser
draft values are not adopted. Targets and observed results remain separate.
Three fresh sequential samples, complete normal page output, exact source/font
identity, raw load/swap/memory and phase repeatability qualify a recorded loaded
reference; absolute host idleness is not required. Repeatability uses CV<=0.25
OR absolute max-minus-min<=10ms. Report worst-of-three/coarse nearest-rank p95;
three samples do not establish a population tail. A target miss stays a miss.

New Word performance harness never forces cold layout or patches a method. The
source-bound W completion flags are READ ONLY to observe actual content/layout
completion plus3stable frames, including warm full-render timing. It starts a
fresh loopback browser server/context per sample. The RSS guard sums only that
owned PID tree, samples200ms, and kills only its own browser if2GiB is exceeded.
Cold10second/print15second/sample45second guards stop remaining heavy samples
on the first failure. Current print source still clones the whole document per
page; measure its node/heap growth before any separately leased repair.
Print-DOM generation remains distinct from PDF/paper fidelity.

Core E may move validation work into event construction. The new profile will
therefore report construction/admission and TOTAL cold/edit/paste costs beside
projection/diff/calculation phases, with both original phase and new v1.1 total
gates. No hidden admission-cost shift can become a claimed latency win.

Printed growth is measured with the actual native CDP DOM node counter delta
before/after print construction. The driver does not walk millions of printed
nodes in JavaScript and thereby inflate its own memory observation. Source
element/text counts and actual print page-container count remain separate.
The frozen3.5growth target applies to actual printed DOM nodes; no limit changes.

## Phase C candidate observations: memory and edit-total failures

Current bounded states are in `reports/criteria-phase-c-v1.json`. The earlier
`reports/criteria.json`, F workload and initial Word failure remain historical.
Measured candidate is `7d902bc69bf98b0dc6aaf681a24d34c7066703a1`, with E and W.
Integration's root qualification was pending during this explicitly leased
candidate window. Neither a completed workload nor an individual met target
accepts M0 or full product capacity.

Word raw evidence is
`reports/word-performance-2026-10-21T16-01-52-773Z/report.json`; its independently
derived target assessment is `reports/word-candidate-assessment-v1.json`.
Three fresh100page samples produced correct800paragraphs, root/surface and
actual pages without forced cold rendering. Worst-of-three cold337.4ms,
full-native warm110.8ms and synchronous print-DOM build65.6ms meet their
respective frozen targets and repeatability. Actual CDP faces and CoreText
version/file hashes match D in all attempted samples.

Finding `526/word-print-resource-v1` remains FAIL.100page owned aggregate RSS
maximum sample was1,631,666,176bytes versus536,870,912target. Each measured printed DOM
delta is331,601nodes:100copies of3,315source nodes plus100page wrappers and
one container. The actual print source clones the entire document per sheet.
The second sample already exceeded512MiB before print; do not attribute all RSS
to printing. JS heap decreases after print while native DOM and cumulative
layout duration grow. This does not establish a JS heap leak. Synchronous DOM
build time excludes deferred browser layout and PDF/paper fidelity.

The first300page sample produced correct2,400paragraphs and300pages, cold
1,027.9ms and full-native warm347.5ms. After print-DOM construction537.3ms,
owned aggregate RSS reached2,198,929,408bytes and the2GiBguard killed only the
owned browser. Post-print300node/heap counters were unavailable; the two
remaining300samples were NOT RUN. No measured300/100growth ratio or qualified
300percentile is claimed. All four owned browser roots and55260listener were
confirmed absent after cleanup. Planner must assign a production print repair
scope before source edits. No identical heavy repeat was run.

Core raw evidence is `reports/sheet-scale-2026-10-21T16-05-01-114Z-summary.json`
and its three child files; assessment is `reports/sheet-candidate-assessment-v1.json`.
All three fresh native processes completed the exact10k-by100/50kpopulated/
10kformula workload and invariants without guard failure. Frozen original
projection/diff/calculation, cold TOTAL1,539.75ms, paste TOTAL324.97ms and peak
RSS348,602,368bytes meet their targets. Finding `526/core-edit-total-v1` FAILS:
one-cell TOTAL296.46/462.17/268.92ms all exceed200ms. Actual projection
204.42–381.67ms plus diff64.08–79.96ms dominate; admission and dirty formula
work remain small. Actual dirty statistics visit one changed cell/evaluate one
formula; paste visits1,000changed cells/evaluates250formulas.

Core edit projection and paste diff individually fail the frozen per-phase
repeatability rule. Total gates are repeatable, including the failed edit gate.
All raw host load, memory and swap counters remain recorded. No absolute idle
requirement or raised threshold is introduced. The headless result does not
measure provider, Canvas, scrolling or keystroke latency. Core owns any next
semantic repair. Verification changed only evidence under its existing subtree.

Word memory is the maximum of200ms owned-process RSS samples, including shared
pages; short peaks can be missed. The45second wall timer and RSS polling begin
after browser launch/connect, so startup is not bounded by that timer. Cold-open
timing excludes browser/module startup. CDP global node deltas can undercount
when other nodes are collected; the100page exact clone accounting nevertheless
matches all three observed deltas. These limitations remain explicit and do not
remove the observed target and guard exceedances.

Frozen Word latency assessment uses browser-inner `performance.now` durations.
Cold includes schema admission/mount/fonts/native completion plus3stable frames;
warm includes actual render/native completion plus3stable frames. Runner wall
phase wrappers also remain raw and in the assessment: first100cold349.03ms,
warm163.40ms, print89.11ms versus inner337.4/110.8/65.6ms. Wrappers include
Playwright transport/scheduling/result transfer and returned result inventory.
They are separate observations; no target basis changed after measurement.

## Next-source measurement method: word-wall-v3

Before any repaired-source measurements, method revision `word-wall-v3` starts
the existing45second sample wall guard before fresh browser launch. It covers
launch, connect, navigation, native work and browser readout with one deadline.
Playwright launch/connect also receive the remaining wall time. A browser handle
returned after expiry is retired; it cannot start a subsequent sample. Owned
browser/server cleanup is separately bounded at5seconds. Close promises all
settle or reach that deadline; an early close rejection cannot discard another
pending owned handle. A final5second cleanup covers Vite and any retained
handles. Cleanup failure is recorded as FAIL and stops the sequence. Host
pressure readout is separate from browser work: each of its three commands has
a1second SIGKILL timeout. Missing post-sample readout is recorded as FAIL with
unknown swap deltas and stops further samples. The200ms RSS poll begins
when the owned launch PID becomes available; it remains sampled aggregate RSS,
including shared pages, with no precise continuous high-water claim.

This is an explicit harness-method correction before new data. All numerical
v1.1targets/guards, original R raw files, source bindings and prior first failure
remain unchanged. The historical R window did not bound browser startup; the
new method cannot retroactively qualify it. Current performance leases were
returned. No repaired-source profile is authorized by this method commit alone.
Guard settlement also checks the monotonic deadline, so a synchronous task
cannot outrun the expiry callback and turn a late result into PASS.

## Repaired Core K: qualified bounded reference result

Current Core-only states are in `reports/criteria-phase-c-v2.json`. Independent
source is `6b3ea4a0669c0796a58711ff01932f5a71b50962`, tree
`f37c61a3595412ca2694b90e2f70c0af19e2173f`, after Integration's root preflight
exit0,126native cases/strict0 and19print unit cases. Root debt allowances remain
those reported by Integration. This window does not qualify repaired Word.

Three fresh actual Core/Formula processes completed the same named10krows/
100columns/50kpopulated/10kformulas workload. Raw child files and summary are
`reports/sheet-scale-2026-10-21T20-44-45-509Z-*`; the exact assessment is
`reports/sheet-candidate-assessment-v2.json`. All eight frozen timing gates,
512MiBRSS target,14phase repeatability checks and three total repeatability
checks PASS under the original v1.1rule. One-cell TOTAL51.555/54.158/51.680ms
meets200ms; cold TOTAL worst898.884ms meets2,000ms; paste TOTAL worst81.311ms
meets500ms. Fresh-child process RSS high-water maximum317,259,776bytes meets
536,870,912bytes. Construction/admission costs remain included. No cache cost
was excluded or target changed.

Dirty formula CV is0.486, but its0.076ms spread meets the original10ms absolute
noise floor. This is the frozen rule, not a later exception. Actual dirty work
is one changed cell/one formula; paste is1,000changed cells/250formulas. Raw
before/after load, memory and swap remain recorded; no absolute-idle claim is
made. The old7d902failures and all raw evidence remain unchanged. These two
recorded windows have different ambient pressure and do not prove a universal
or controlled causal speedup.

The workbook blob is `451b22a95cbcfac6e3e8b19551771db141bed64d`, identical to
the author K candidate `7032282cab3350867e06fe9ba716a136c826eebf`. Assessment
records all ten source/harness/budget SHA-256 bindings and Node/OS/CPU metadata
for explicit reuse on an unrelated Word-only join. It does not transfer this
result to changed model bytes or claim provider/Canvas/scroll/keystroke/UI
capacity. The Core-only performance slot was returned immediately after three
children completed. No duplicate profile ran. Repaired Word browser/PDF and
100/300-page profile, and the whole M0 decision, remain separate and pending.

## Word P2b candidate: linear node growth, residual100RSS miss

Latest current matrix is `reports/criteria-phase-c-v3.json`. Candidate source is
`ccf1ffd0353eccbdc23b922e54973fb0919b81a4`, tree
`3c4b0234375c1f944960e0f72f982530c62e79f3`. The issued window explicitly allows
candidate metrics while supplemental native print proof remains separate.
Raw evidence is `reports/word-performance-2026-10-21T21-03-18-829Z/report.json`;
assessment is `reports/word-candidate-assessment-v2.json`. G wall-v3 method and
all numerical v1.1targets remain unchanged. Core v2's ten exact source/harness/
budget bindings remain identical and are reused; no Core profile ran again.

All six fresh normal browser samples completed: three100pages then three300.
All actual pages/paragraphs/root/surface/native completion counts were correct;
CDP text-child faces and CoreText versions/file hashes matched. No forced cold
render, console/page error, guard failure or cleanup failure occurred. All six
timing gates and repeatability pass. Worst-of-three browser-inner cold/warm/
synchronous print-DOM times are378.3/113.9/35.7ms for100 and
1,038.4/354.1/96.7ms for300. Runner wall wrappers remain distinct and raw.

Actual printed node deltas are16,201in each100sample and48,601in each300sample.
The measured ratio2.99987655083passes3.5. This replaces the missing current
300node observation; it does not erase the original R2GiBguard failure.

Finding `526/word100-rss-v2` FAILS:100sampled owned aggregate RSS is
527,810,560/591,446,016/604,405,760bytes; samples1and2 exceed536,870,912bytes.
300RSS717,225,984/718,061,568/799,506,432bytes meets1,073,741,824bytes. No
threshold increase or identical heavy repeat follows. All100preprint sampled
maxima are below512MiB in this window. The old Rpreprint miss remains historical.

For the failing100samples, the warm-labelled maximum is530,055,168/526,008,320
bytes and print-labelled maximum591,446,016/604,405,760. The raw label includes
post-build CDP heap/node readout until the next driver stage; it does not
separate synchronous construction from deferred browser layout/readout. The
assessment keeps each peak's exact PID/parent/RSS and phase maxima, plus actual
before/open/postprint JS heap/node metrics. It does not classify unobserved
process roles or assign every shared RSS page to one cause. JS heap growth
from about38MB after open to61MB after print is not proof of a leak.

The200ms poll can miss short peaks.100sample0 has no print-labelled RSS poll;
its lower recorded maximum is not a continuous print high-water proof. All six
owned browser roots and55260listener were independently confirmed absent after
cleanup; the expensive slot was returned immediately before offline assessment.
Actual raw font, source, harness and host pressure bindings remain available.

Integration retracted its separate PDF visual finding after an exact pixel-hash
comparison. This performance run does not independently accept PDF fidelity.
The actual remaining gates are100RSS and supplemental native print proof;
whole M0 remains OPEN under Planner. No source engine or measured fixture was
changed by Verification.

## Word O one affected profile:100RSS remains above target

Measured source is `4579f1030174bf87e4679888458d5631a35fe492`, tree
`146248459a5faed173600965dbe04dfa5b7c2143`. The actual production delta from
P2b is the bounded unique-ID traversal change in `print-pages.ts`. Snapshot,
typography, workload, G method, flags and GC policy are unchanged. Integration
reported root39O,23unit cases, O8A and S6actualnative40source proof before this
one affected profile. Those bounded receipts remain separate from this run.

Raw `reports/word-performance-2026-10-21T21-28-14-216Z/report.json` and
`reports/word-candidate-assessment-v3.json` retain all six fresh normal samples.
All six timing and repeatability gates meet frozen v1.1. Worst-of-three inner
cold/warm/print-DOM times are368.7/112.6/29.0ms for100pages and
1,087.3/368.3/79.3ms for300. Actual fonts/pages/root/surface/paragraphs match;
no console/page, resource/time guard or cleanup failure occurred. All24observed
owned PIDs and55260listener were absent after cleanup. The expensive slot was
returned immediately, before offline assessment. No duplicate profile ran.

Actual native CDP node deltas are4,501in each100sample and13,501in each300sample,
ratio2.9995556543, below3.5. These are the frozen global-counter deltas, which
can include disconnected/collected nodes; no separate printed-tree traversal or
causal memory-byte proof is invented. The recorded lower counts do not erase
the remaining memory miss or claim a controlled cross-window speedup.

Finding `526/word100-rss-v3` FAILS in all three100samples:
577,470,464/598,196,224/575,438,848bytes versus536,870,912target. The preprint
sampled maxima are525,942,784/570,408,960/575,438,848. Samples1and2 already
exceed the target during full native view/layout completion before print.
Current O100sample2 has no print-tagged poll; its maximum is warm-labelled.
This is distinct from historical P2b100sample0's missing print poll. Missing
polls are not fabricated and neither is a precise print peak or print-only cause.

All300sampled maxima806,305,792/799,784,960/804,552,704bytes meet1GiB; each
has a print-labelled maximum. The label still covers post-build CDP readout and
deferred layout. RSS remains a200ms sampled sum including shared pages, not
continuous HWM or precise physical memory. The assessment preserves phase/PID
maxima and before/open/postprint heap/DOM plus actual fonts/host pressure.
No JS leak is inferred from heap growth.

All17production and7measured harness files are hash-bound. Core v2's ten exact
bindings are reused unchanged; no Core profile ran. Original R and P2b raw and
failures remain intact. No target increase, semantic edit or identical heavy
retry follows. Planner must decide the residual resource disposition; whole M0
remains OPEN. Source-level print proof is bounded and does not accept product
release or full PDF fidelity.

## ONE bounded memory diagnostic v1 — prepared before data

Planner authorized one diagnostic, not another qualification profile or source
optimization. Protocol: `reports/word-memory-diagnostic-protocol-v1.json`.
New `word-memory-diagnostic-runner.mjs`, browser wrapper, HTML entry and timed
record helper reuse the unchanged `window.m0WordPerformance` implementation.
Production remains the exact17file O closure; all7normal harness hashes,
reference font report and frozen budget remain checked. No media override,
fixture reduction, alternate engine/bootstrap or production method patch occurs.

The protocol is committed before data. Exactly one fresh100page/800paragraph
browser attempt is allowed, after Integration issues a new diagnostic-kind
serialized lease. An exclusive ignored `.cache/word-memory-diagnostic-v1-attempt.json`
claim prevents an automatic second attempt. This preparation performs no actual
browser diagnostic. Its result can never qualify a normal performance target.

Eleven named seams have two sequential read sets each: module-ready before and
after DOM/CSS enable; combined existing open/layout/source inventory; actual
font query; full warm/native completion before print; immediate print return;
explicit deferred geometry/style readout and3RAFcallbacks; clearPrint; dispose;
DOM/CSS observer release; and one final diagnostic-only GC. The existing open
API combines fixture/admission/mount/fonts/stable frames and TreeWalker inventory;
an independent admission allocation boundary is not invented. Font query and
warm render remain separate. Inline print-return page heap precedes diagnostic
computed-style reads. Geometry/style readout can force browser layout and three
RAFcallbacks do not establish paint completion.

Every read persists RUNNING start before IO, then completion or failed/aborted
end/error. Paired page Used/Total JS heap, CDP metrics/native DOM counters and
owned PID/parent/RSS have UTC/monotonic brackets and collection skew. Reads are
not atomic. Missing heap metrics remain unavailable, never zero. Pinned
Playwright1.58 protocol types are hash-checked. Optional SystemInfo roles join
only on exact reported PID with a matching browser root; other roles stay
unavailable. Store numeric/string JSON records, not persistent DOM handles.

`matchMedia('print')` is observed without changing media. Effective display,
position and overflow for representative container/page/copy and stylesheet
rule-presence booleans are read only at the deferred seam. A screen-media
print-DOM build is distinguished from actual print media; it does not explain
the preprint RSS miss by itself. DOM/CSS/Performance observation, font queries,
pairing and readout are explicit diagnostic interventions. Final observer-release
and GC values do not prove a leak or qualify a budget.

The45second wall starts before fresh browser launch; cold10seconds, print15,
2GiBowned aggregate RSS and200mspolling remain fail-closed. Phase settlement also
checks the monotonic deadline. An actual crossing RSS/PID table is saved before
failure. Owned cleanup is bounded5seconds. Ambient pressure commands have1second
timeouts, PID `ps`1.5seconds, and CoreText font metadata5seconds; the full wall
still applies. First failure stops the attempt, preserves partial reads and
leaves later seams NOT RUN. No full heap snapshot, heavy trace, Core rerun,
unrelated process stop or normal v1.1change is authorized.

Integration must provide `M0_WORD_MEMORY_DIAGNOSTIC_LEASE` with status `granted`,
kind `diagnostic-word-memory-v1`, `max_runs:1`, port55260, exact source head/root,
browser executable, finite deadline and SHA-256 of the committed protocol file.
The source pin must contain the committed diagnostic harness and unchanged O
production. Old diagnostic/performance leases do not satisfy this contract.
After the one run, report which observed phase grows, what remains unidentifiable
and the smallest source boundary justified by data. Whole M0 remains OPEN.

## ONE memory diagnostic v1 — completed, qualification unchanged

Raw: `reports/word-memory-diagnostic-2026-10-21T23-06-26-563Z/report.json`.
Assessment: `reports/word-memory-diagnostic-assessment-v1.json` and readable
`reports/word-memory-diagnostic-v1.md`. Current matrix:
`reports/criteria-phase-c-v5.json`; prior matrices remain intact.

The source was clean `6e3bcc03a5e2cb1f50fe7291e582aa92e85f659e`, with the same17
O production and7normal harness files. One fresh100/800 run completed all11seams
and22sequential readsets in15.435seconds. Actual font identity matched. All4owned
PIDs and55260 were absent after cleanup; the slot was returned before analysis.
Raw SHA256: `b6a6ca09f07d104df6252b6b694d2727d26091572d09c8a8cb3ab80635505ef8`.

In this instrumented run, adjacent readsets show about12.7MBused JS heap growth
at warm/native completion and about1.8MBat print. Nodes stay3356through warm and
rise4501at print. RSS falls during warm despite the heap rise. Page heap and CDP
heap differ by about17–18MB and remain separate series. Screen media staysfalse;
print container/page are block/static/visible and copy isflex. Final disposal,
observer release and oneGC reduce global nodes to31; this does not prove a leak
or its absence. The next justified read-only source boundary is the existing
warm `view.render` content/reconciliation and native layout completion path.
No particular cache, allocation owner or source fix is established.

Diagnostic observation delays and host swap-in affect interpretation. The
observed diagnostic RSS maximum464273408bytes does not replace the normal O
Word100failure at577470464/598196224/575438848bytes. Frozen budget, normal method,
Corev2 evidence and original first failures remain unchanged. No retry or
production optimization follows. Whole M0 remains OPEN.

## Renderer531 normal window — Word evidence v4

Measured source `ee61af6f66f74f84708e0e434077122d91394cf6`, tree
`342b1cdd7f7c8eb898c34852e24ea34ae3767e62`, after Integration's source checks
and actual A8/S6 browser14. This source changes exactly3renderer files from O;
the other14production bindings,7normal harness files, actual fonts, Core10
bindings and frozen v1.1 budget remain unchanged. No diagnostic wrapper,
media override or GC ran. One authorized normal window completed100x3/300x3.

Raw: `reports/word-performance-2026-10-21T23-45-36-459Z/report.json`.
SHA256: `a30efe793b0a163d720454424d229d50fd992b68a23c99dd20039b583228f7ca`.
Assessment: `reports/word-candidate-assessment-v4.json`; current matrix:
`reports/criteria-phase-c-v6.json`. The prior matrices/raw remain intact.

| Profile | Cold ms, all3 | Warm ms, all3 | Print build ms, all3 | Sampled owned RSS bytes, all3 |
| --- | --- | --- | --- | --- |
| 100pages | 316.5 / 308.8 / 309.1 | 95.9 / 95.1 / 103.4 | 25.2 / 26.0 / 25.4 | 597786624 / 590364672 / 545865728 |
| 300pages | 1000.5 / 984.7 / 976.8 | 335.6 / 345.3 / 329.1 | 71.3 / 71.1 / 68.9 | 803897344 / 812335104 / 797818880 |

All timing targets/repeatability, actual fonts/native counts, printed node growth
and300RSS meet frozen v1.1. Printed CDP deltas stay4501/13501, ratio2.99955565.
All3of100RSS exceed536870912bytes. Its preprint sampled maxima are
524025856/525467648/545865728; sample2already exceeds before print and has no
print-tagged RSS poll. It is not a measured print peak. Source labels span
readout/deferred work; the original method does not isolate warm/print allocation.
Raw CDP heaps are retained separately and have no new intermediate seam.

Actual normal run exited0 with no phase/resource/console/page/cleanup error;
product RSS qualification stillFAILS. All24observed owned PIDs and55260 were
absent after bounded cleanup. The slot was returned before offline analysis.
No identical retry or Core profile follows. Source-object retention regression
proof and this sampled RSS result address different properties; no causal
RSS saving or universal speedup is claimed. Prior R/P2b/O failures remain intact.
Portal text/title baselineFAIL and combined async portal cleanupNOT VERIFIED
remain separate. Whole M0 remains OPEN.

## Native memory attribution v1 — preparation only

Protocol: `reports/word-native-memory-attribution-protocol-v1.json`.
New runner/browser/HTML and record helper/tests use the unique
`word-native-memory-attribution-*` prefix. Existing O diagnostic, normal7harness,
guards, frozen v1.1, raw data and first failures remain read-only. No browser
diagnostic has run. The new files are committed before any measurement.

The reference is the17production-file ee61renderer531 closure. At execution,
verify it against the actual Integration lease source root and immutable pin,
including HEAD/tree/clean state. The author branch can retain older O renderer
bytes; it is a harness/evidence producer, not the measured source checkout.

One fresh100page/800paragraph browser is proposed, Chromium145,1280x900,DPR1,
same actual font identity. Eight seams have two sequential timestamped readsets:
module baseline; combined cold open; actual-font query; warm completion; inline
print return; deferred geometry/3RAF; clearPrint; dispose. The public normal API
is imported. Cold includes fixture/admission/mount, document.fonts.ready, native
stable completion and source inventory. Only the later font QUERY is outside
the native sampling windows. There is no admission-only allocation seam.

Page used/total heap, CDP Performance, Runtime.getHeapUsage's usedSize/totalSize/
embedderHeapUsedSize/backingStorageSize, native DOM counters and owned PID RSS
remain separate series. Runtime values are isolate totals. Missing fields stay
null/unavailable; actual numeric0 stays0. No sum or RSS subtraction derives
native/live/resident bytes. Native samples have size/total/stack and module
metadata, no PID/time/free/live/resident fields. Preserve unresolved strings
and addresses. The page-target native profile is never automatically attributed
to a renderer PID from browser-level SystemInfo/RSS roles.

Exactly3native windows use samplingInterval131072,suppressRandomness:false:
start -> existing cold/warm/print API+completion -> inline numeric return edge ->
paired observations -> getSamplingProfile -> finally stopSampling. Stop returns
an empty acknowledgement, not a profile. Each window includes allocation and
scheduling effects of the observations and capture. Print sampling closes before
deferred geometry. No GC, pressure simulation, purge, cache clear, JS allocation
sampler, full heap snapshot, heavy trace, vmmap attach or source fix is allowed.

Only verified structured CDP code-32601 for the requested command becomes
UNAVAILABLE. Playwright may expose only a message; that case fails and stops.
No parameter fallback or retry occurs. Missing start closes mayBeActive=false;
missing get still requires current stop, then future sampler starts are skipped.
The public API/readsets continue once. Supported empty profiles remain supported,
not proof of zero allocation. Other monitor/schema/clock/console/lease errors
preserve the first failure and stop. Optional exact process roles are unavailable
only on verified method absence or root ID mismatch; other role errors stop.

Full wall45s begins before launch;10scold/15sprint/2GiBownedRSS/200mspolls remain.
Each sampler command has a5smaximum and remaining wall limit, with dispatch and
settlement checks. At most3full JSON profile responses may be retained,16MiBeach,
32MiBtotal. These are POST-materialization/serialization acceptance/storage caps,
not backend/network/preallocation bounds. Preserve within-limit malformed bodies
once; oversized bodies are omitted with byte count/SHA/error retained.

Cleanup has a separate5stotal budget after wall or lease expiry. An uncertain
start gets one stop attempt before owned kill; stopAttempted is set only at
actual dispatch. A failed dispatched stop is not retried. A stop can exhaust
the entire cleanup budget; the deadline triggers owned kill and records cleanup
unconfirmed. Any failed run kills the owned browser, including a pending start
that can settle late. A known2GiBRSS crossing first saves the actual PID table,
then urgently kills from the common RSS read path. No unrelated process stops.

Future execution requires a NEW `M0_WORD_NATIVE_MEMORY_ATTRIBUTION_LEASE`, kind
`diagnostic-word-native-memory-attribution-v1`, max_runs1,port55260, exact clean
source head/tree/root, browser executable, finite future deadline and committed
protocol SHA256. A new ignored exclusive claim prevents a second attempt; old
leases/claims cannot authorize this run. Integration reviews immutable code and
targeted negative checks before granting its serialized runtime window.
Normal Word100 all3RSS failures, portal baseline failure, async portal unknowns
and whole M0 OPEN remain unchanged, even if this diagnostic does not reproduce
RSS pressure. This preparation makes no performance qualification claim.

## Native memory attribution v1 — completed, attribution unresolved

Raw: `reports/word-native-memory-attribution-2026-10-22T00-07-23-936Z/report.json`.
Raw SHA256: `b39cf30726c32f71846b4e6509fe5cef6268d1359d64834a574de93406ab78d5`.
Assessment: `reports/word-native-memory-attribution-assessment-v1.json`;
current matrix: `reports/criteria-phase-c-v7.json`. Normal qualification remains
bound to ee61/W4; the diagnostic source is separately bound to
`6e7be70e0150e43f76587a8b9fb0a54c11ea8ef9`, tree
`349324d5ff912dab82687785d58055feaadb5c7c`, with the same17production hashes.

One fresh100/800 run completed8seams/16readsets,33recorder commands and3native
start/get/stop sequences in6.802seconds. Runtime four fields were available in
all16readsets. All3native profiles were SUPPORTED EMPTY: samples[]/modules[],
39JSONbytes each/117total. The full responses remain in the raw file. Empty
does not mean unsupported or zero allocations. No native allocation stack or
module attribution was obtained. All3stops acknowledged; no sampler remained
active. All4owned PIDs and55260 were absent after bounded cleanup, and the slot
was returned before analysis. No retry or forced GC occurred.

Closest adjacent readsets (previous second -> next first) show:

| Interval | Runtime JS used bytes | Allocated JS heap bytes | Embedder GC heap used bytes | Backing bytes | Sampled owned RSS bytes |
| --- | --- | --- | --- | --- | --- |
| Baseline -> combined cold | +17340404 | +41271296 | +55788360 | +281151 | +139853824 |
| Font query -> warm | -3856420 | +11534336 | -50352320 | -135983 | +45694976 |
| Warm -> print | +1848576 | +262144 | +15562184 | +6892 | -20496384 |

These are separate counters and delayed observations, not a memory equation or
pure function allocations. The earlier diagnostic's warm used-heap increase did
not repeat here. There is no observed GC event to explain the decreases. Readsets
span51.993–202.644ms; pairs118.985–289.942ms. Native profile scope has no PID;
no renderer-PID, function, file, lifetime or native resident-byte cause is proven.
No new source repair is justified by these empty profiles and counter movements.

Sampled diagnostic RSS maximum534102016bytes does not qualify512MiB or erase
W4's normal100RSS failures597786624/590364672/545865728. Global swap-in57131008B,
swap-out0 and pressurefree51->46percent are ambient, not browser-owned attribution.
clearPrint/dispose remove attached native state while global nodes remain7857;
that single cleanup observation does not establish a leak. Existing normal/Core
evidence, original failures, portal limits and M0 OPEN remain unchanged.
