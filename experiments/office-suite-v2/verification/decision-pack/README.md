# M0 decision pack v1 — current source 4dc191bc

This is the current #526 evidence package for the ten original #521 criteria.
It replaces the current-decision role of the old `criteria.json`, Phase C tables
and the old status paragraph in the parent README. Their failures and raw results
remain unchanged. The pack is **ready for Planner review**, not whole-M0 acceptance,
an M1/M2 activation, a release or a local `develop` merge receipt.

Scope ID: `office-v2-m0/decision-pack-v1`. Owner: Execute Verification,
chat `01a15eca-e1d3-7910-9aa1-d590162dbf18`. Sole writes are `verification/**`.
Human source: Planner actual user message `01a16457-618b-7142-b1f9-46365273b52c`
on 2026-10-23 Asia/Seoul: continue the next large M0 tasks, do not repeat completed
checks and preserve existing screens. Base is
`4dc191bc442c260ab320f3d8a229fe2c3db98d9f`, tree
`9f36d320aff6780f86216bff5c9217114cf20634`; new isolated author branch is
`codex/526-m0-decision-pack`. No previous root, native Office app, browser, server,
database, user document or schedule was changed by this reconciliation.

## Current original-criterion mapping

| #521 | Evidence disposition | Exact boundary |
| --- | --- | --- |
| 1 — Native workbook/reference/formula/copy-cut | Bounded evidence complete | Two native sheets, identity references, SUM/IF, range/structure and atomic cell relocation. Larger functions/general axis moves are excluded. |
| 2 — Concurrent structure/inputs and convergence | Bounded evidence complete | Real SheetReplica/Core arrival permutations, valid native data and retained alternatives. No full-provider capacity claim. |
| 3 — Session Undo and A-row/B-edit case | Bounded evidence complete | Recoverable `UNDO_CONFLICT` preserves B. This is a safe refusal, not successful row removal. |
| 4 — Prose and unsupported block policy | Bounded evidence complete | Y.Text characters/marks/newlines/split/join/anchors/session Undo. Paragraph move/delete explicitly refuse. Complete Note blocks are future work. |
| 5 — ACK loss/retry/restart/admission | Bounded evidence complete | Native SQLite/new-process proof; later controlled WS and actual local-account OIDC/PG receipts remain separate layers. Account recovery includes manual Retry. |
| 6 — General moves/merges | Refusal policy complete | Features remain `UNSUPPORTED`; supported copy/cut cell relocation is a separate API. M3 must define new semantics before support. |
| 7 — Corpus/compatibility/retention/readers | Evidence complete with declared loss | Four CC0 fixtures, bounded DOCX import/export/reopen and historical Office16.114 readers. See feature dispositions; known losses remain failures. |
| 8 — Word100/300 and Sheet10k reference | Current frozen gates pass | Exact-source, named loaded reference; Word sampled aggregate RSS and headless Sheet model only. |
| 9 — Versioned decisions and next-stage contracts | Delivered for review | Native/checkpoint schemas, binding choice, risks, budgets and exact inactive #528/#529 ownership. Final integration remains an owner input; existing Slides baseline disposition is recorded. |
| 10 — Prototype/product evidence boundaries | Recorded explicitly | Controlled native/WS and genuine local accounts are distinct. No automatic M1/M2/alpha/release acceptance. |

The machine-readable current matrix is
`../reports/m0-decision-pack-v1/current-matrix.json`. Original criterion wording
and clause-by-clause findings are in `criteria-v1.json`.

## Source-bound evidence reuse

No completed product test or measurement was repeated for this package.

| Evidence | Original source | Current binding |
| --- | --- | --- |
| Native correctness, 126 PASS / 0 FAIL / 0 skip, strict28 roots0 | `6b3ea4a0669c0796a58711ff01932f5a71b50962` | Eight native modules, eight owner tests and five independent adverse files match exactly. Current Core is the newer7032282c family, not historical K/Q workbook bytes. |
| Sheet10k frozen v1.1 | `6b3ea4a…` | All ten named source/harness/budget hashes match. |
| Word six normal samples | `36b0fa98447d1f1b43c42066c88ec975f96f6c93` | All1,215 recorded qualification inputs match4dc. Closure is a source superset, not a claim every file dynamically loaded. |
| Real account Sheet/ACL/recovery | `7eca44213c9b9609c88b635dcfc0ee8412a7e21d` | All299 Integration-named production paths match; all29 recorded artifact hashes match. This is not an exhaustive dynamic graph claim. |
| Controlled WS | `d7277c0098f39a59e87ca277090404f0dc1976bf` | Original raw hash retained. There are46 later source additions/changes; the old whole WS UI is not relabeled as current unchanged source. |
| DOCX adapter baseline | `1d443e47f39d9e6009a7f0ae8724d7cc9f9e05da` | Two codec files match; historical import/export/reopen is reused without a new current-app or Office-reader run. |

Exact entries are in `../reports/m0-decision-pack-v1/source-bindings.json`.
The evidence index records original location, bytes and SHA256. Small external
authoritative receipts, normal raw data and source manifests retain their exact
payload bytes in the package's `evidence/` directory. The two raw ANSI Slides logs
use lossless gzip with separate stored and decoded hashes; their original trailing
spaces are preserved. Existing corpus/native-reader/raw
files stay at their original repository paths. Large supplementary browser/account
artifacts stay at the exact original paths/hashes named by their preserved receipts;
the builder checked the20 Word and29 account receipt artifacts without rerunning them.
The additional current Integration binding records1,215 same Word inputs and654
actual aliases, including244 workspace aliases in its new isolated root. It is
source/graph preparation evidence, not another normal browser/performance run.

## Performance decision

| Reference | Recorded results | Unchanged limit |
| --- | --- | --- |
| Word100 sampled owned aggregate RSS, MiB | 494.59375 / 491.1875 / 459.65625 | 512 |
| Word300 sampled owned aggregate RSS, MiB | 804.296875 / 807.859375 / 804.015625 | 1,024 |
| Word100 worst open / warm / print, ms | 305.5 / 100.5 / 24.30 | 1,000 / 250 / 1,000 |
| Word300 worst open / warm / print, ms | 989.60 / 345.30 / 66.80 | 3,000 / 750 / 3,000 |
| Sheet cold total / one-cell total / paste1,000 total, ms | 898.884 / 54.158 / 81.311 | 2,000 / 200 / 500 |
| Sheet fresh-child high-water RSS, bytes | 317259776 / 314245120 / 316096512 | 536870912 |

Word fonts, native page counts, timing/repeatability and printed node-growth gates
also pass. Three fresh observations give a coarse nearest-rank p95/worst-of-three,
not a population tail. Word RSS is a200ms sampled owned-process aggregate including
shared pages, not private bytes or continuous high water. Sheet is the named
10,000-row/100-column/50,000-populated/10,000-formula native model; it does not
qualify provider/Canvas/scroll/input performance. Reference: Apple M3 Max,
14 logical CPUs/36GiB, Darwin24.6, Node22.22, Chromium145.0.7632.6; exact fonts,
browser and ambient observations remain in raw data. No per-change RSS causality
or universal capacity is inferred. Budgets were frozen before measurements.

## File capability decision

`file-capabilities-v1.json` is the missing feature disposition manifest. It adds
no file adapter. Original fixture inventory remains `../corpus/manifest.json`.

| Format/profile | Demonstrated behavior | Remaining limitation and owner stage |
| --- | --- | --- |
| DOCX basic body/table | Import/export/reopen preserves imported body,76 rows/151 cells and horizontal gridSpan; no intervening edit exercised | No full edit/save or fidelity acceptance; M4 declared profile. |
| DOCX numbering/image/header/footer/footnote | Original includes them; current exported copy loses the parts/references | Full-feature round trip remains FAIL. M4 codec support or explicit refusal/loss/new-copy workflow. |
| XLSX1900/1904 | Excel16.114 reads exact original files, two sheets/date-system flags and bounded values/formulas | Cached values are hand-authored. Product exchange/recalc/visual fidelity unverified; M3. |
| PPTX original | PowerPoint16.114 opens one exact synthetic slide; title/image region observed | Group/theme/layout inventory is not fidelity proof. Product adapter/round trip unverified; M4. |
| Original files | All four synthetic byte hashes unchanged | Artifact retention only; no product original-retention, product read-only/refusal or lossy-new-copy UX acceptance. |

Reader versions are historical recorded versions, not a new installed-version
check. Old Word AppleScript timeout and later native open are separate receipts.
Warned DOCX features not individually present in this corpus have no invented
per-feature result. Native Office application windows were not touched here.

The separate historical Slides UI suite is **21 PASS / 5 FAIL / 17 NOT RUN**,
with two suite errors. The five failed control/visibility assertions also fail
on the fixed f4 baseline. `slides-baseline-disposition` and the exact original
command/log snapshots preserve those results. This does not accept later steps
or the17 unrun cases. The original M0 synthetic PPTX/reader baseline and the new
Slides UI/connector repair assignment are separate outcomes. No new full-M4 gate
or permission to adopt held source is inferred from the baseline disposition.

## Architecture and next-stage input

The decision remains our own sparse Sheet commands/events/typed AST/reference and
calculation model, with Yjs13.6.29 as demonstrated granular transport primitive.
`WorkbookContext` binds document/workbook/generation and contract/engine/schema/
adapter versions. Every `WorkbookEvent` includes that context, immutable event ID,
actor/session, causal dependencies and command. The derived projection/formula text/
calculation cache is not a second writer. Uncommitted draft and original pending
packet bytes are retained user intent, not reconstructible from committed events.

Native updates, admission, per-original update ID/hash/sequence/frontier receipts
and checkpoint+accepted-tail replay remain the persistence contract. A broadcast
is not durable save. Lost ACK, exact retry, later unsent draft and late ACK remain
different states. No original packet identity is silently recreated on resume.

Exact inactive owner/path tables and interface inputs are in `criteria-v1.json`.
They match existing [M1 #528](https://github.com/barocss/barocss-editor/issues/528)
and [M2 #529](https://github.com/barocss/barocss-editor/issues/529):

- M1: Runtime owns the common host/lifecycle; Core and Formula own adopted domain
  packages; Collaboration owns domain admission/native update/receipt/checkpoint
  service; Integration alone wires shared registrations/migrations/runtime;
  Verification owns real same-candidate account/service/recovery evidence.
- M2: Sheet View owns Canvas/DOM input/accessibility; Prose owns a declared complete
  Note codec/binding; Runtime/Collaboration reuse qualified common contracts;
  Integration owns entry/route registration; Verification owns user journeys.
- Existing M0 actual-account evidence is useful input, not common-runtime adoption,
  complete Note, durable assets, backup/restore or whole-product acceptance.

General moves/merges, broader functions/XLSX/grid behavior belong to declared M3
work. Word/Slides format fidelity and complete product behavior belong to M4.
New work needs exact adopted base/blobs, current owner/file/interface scope and
acceptance; these proposed paths do not activate a role, migration or M1/M2 code.

## Checks, preserved failures and final handoff

Only source/evidence integrity commands were run here:

```sh
python3 experiments/office-suite-v2/verification/decision-pack/build.py --evidence-root /Users/user/barocss-editor/.omx/m0
python3 experiments/office-suite-v2/verification/decision-pack/verify.py --verify-originals
git diff --check
```

The first builder failed before writing outputs because it read an Integration
sidecar's SHA field under the wrong key. The actual source hash was unchanged;
the builder now consumes explicit `currentSHA256` and checks both Git blobs.
`logs/m0-decision-pack-build-first.txt` remains unchanged. Read-only peer review
also corrected an untested “editable” classification, the required event context
field and the distinction between derived state and uncommitted user intent.
These are package corrections, not product failures or newly repeated tests.
The first follow-up staged whitespace check rejected the original ANSI Slides
logs' trailing spaces. Their bytes were not normalized: the package now stores
lossless gzip and verifies both compressed and original decoded hashes. Original
logs remain untouched, and the final ordinary whitespace check passes.

All old Core/Formula first failures, DOCX feature loss, Word zero-page/guard/RSS
misses, portal failures and account/harness interruptions remain in their original
receipts. Current Word PASS replaces their current-decision role; it does not
rewrite those observations, prove an allocation owner or convert a diagnostic
failure into PASS. Fullpreflight at4961 plus source-bound affected guards is the
existing qualification ledger; no fresh fullpreflight on4dc is claimed.

Integration must intake the immutable verification delta once, preserve current
source groups or explicitly record affected changes, and add its final integration/
ancestry receipt. Planner routes the separately assigned Slides UI/connector
repair and any necessary changed-source proof; its old baseline is already
recorded here. This pack does not
require repeating unaffected Word/Sheet/account/Office runs or silently making
all Slides product behavior an original M0 gate. Planner owns the final whole-M0
decision and any later activation. No Issue is closed automatically.
