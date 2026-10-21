# Independent M0 verification — #526

This lane owns only `experiments/office-suite-v2/verification/**`. It does not accept
M0, the product, release, or the Office compatibility roadmap.

Analysis/scaffold: S `9b390602d90e07f496b7b699915b7d605582d8a4`.
Final correctness dependency Q `3f8354c6bb733bc597488d64c3bf41e5f650f6f8`; parent K.
K holds the checked Core/provider/prose/store dependencies. Q changes only the parser and its owner tests/manual.
Scale source F `b785fd65c6fae71c57b70650b06f69a68bea3070`; its Core/calculation/reference files are unchanged through Q; Q parser differs. The native-AST scale run did not invoke the parser.
Production Word files remain byte-identical to S. The runner checks those bytes
before execution and records their SHA-256 values independently of a later HEAD.
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
