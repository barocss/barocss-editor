# Word memory diagnostic v1

One authorized diagnostic completed. Existing qualification remains unchanged.

Source: 6e3bcc03a5e2cb1f50fe7291e582aa92e85f659e; tree: 0fe8be1c63531c2b3eaa9f02fcdb076f652a3d0f. The17 O production and7 normal harness hashes, actual font identity and frozen budget match. Protocol was committed at8235bc847b3b0399e2ac3147bace620d065d8586 before data; SHA256 4d3b64fbb37389010b138fd4899c038bc1e06595d36ba45ab92858222525dc54. Raw: reports/word-memory-diagnostic-2026-10-21T23-06-26-563Z/report.json; SHA256 b6a6ca09f07d104df6252b6b694d2727d26091572d09c8a8cb3ab80635505ef8. Exact bytes, Total heaps, PID roles, timestamps and skews are in the raw and assessment JSON.

One fresh100page/800paragraph browser;1280x900,DPR1,Chromium145.0.7632.6. All11seams/22readsets completed,99 per-read brackets including process metadata. Wall15434.57ms. All4owned PIDs49168/49205/49206/49218 and55260 were absent after cleanup. Slot returned before analysis. No retry.

Values below are MiB (1048576bytes) except native node counts. Each cell lists sequential before/after reads, not simultaneous observations or phase-exclusive allocation. Page and CDP heap scopes differ.

| Seam | Owned RSS MiB | Page used MiB | CDP used MiB | Native nodes |
| --- | --- | --- | --- | --- |
| 1. module-ready-before-dom-css | 323.39 / 323.80 | 36.77 / 36.81 | 20.09 / 20.10 | 39 / 39 |
| 2. module-ready-after-dom-css | 306.23 / 306.23 | 36.82 / 36.84 | 20.12 / 20.14 | 39 / 39 |
| 3. combined-native-open-layout-and-inventory | 442.77 / 433.09 | 53.65 / 53.67 | 36.68 / 36.69 | 3356 / 3356 |
| 4. after-actual-font-query | 431.09 / 422.47 | 53.77 / 53.78 | 36.79 / 36.81 | 3356 / 3356 |
| 5. after-full-warm-native-completion-before-print | 416.89 / 416.91 | 65.91 / 65.92 | 48.93 / 48.95 | 3356 / 3356 |
| 6. immediate-print-return | 426.63 / 436.06 | 67.68 / 67.70 | 50.70 / 50.71 | 7857 / 7857 |
| 7. after-explicit-geometry-readout-and-three-raf | 436.30 / 436.39 | 68.00 / 68.02 | 50.84 / 50.85 | 7857 / 7857 |
| 8. after-clearPrint | 441.19 / 428.25 | 68.05 / 68.07 | 50.89 / 50.91 | 7857 / 7857 |
| 9. after-runtime-dispose | 419.48 / 412.33 | 68.13 / 68.15 | 50.97 / 50.99 | 7857 / 7857 |
| 10. after-dom-css-release-before-diagnostic-gc | 399.55 / 372.52 | 68.17 / 68.18 | 51.01 / 51.02 | 7857 / 7857 |
| 11. after-one-final-diagnostic-gc | 296.72 / 296.75 | 36.41 / 36.43 | 19.70 / 19.74 | 31 / 31 |

- In this instrumented run, combined native open raises both heap series and owned RSS. Its admission/mount/layout/inventory boundary is combined; no allocation subphase attribution is available.
- Warm native render completion adds about12.7MB in both separately recorded heap series while native nodes remain3356 and CDP LayoutCount remains3. Owned RSS decreases across these delayed readsets. JS heap growth does not explain exact RSS bytes.
- Synchronous print adds about1.85MB in CDP used heap and4501 native nodes; the inline page return shows about1.87MB versus warm inline return. Later readsets show layout already advanced3to4 before deferred geometry reads. They do not isolate synchronous build from asynchronous browser layout.
- Print DOM is screen-visible block/static/visible (copy flex); matchMedia(print) remainsfalse. This is screen-media print-DOM construction, not actual print-media behavior or proof of the preprint RSS cause.
- clearPrint and dispose remove live native surfaces/pages; global native nodes remain7857 until final observer-release/oneGC sequence. After that they are31, with15listeners and CDP used heap about20.7MB. This is consistent with collectable transient objects under this intervention, not proof of a leak, absence of a leak, or natural cleanup timing.
- The smallest justified next source review boundary is the existing warm api.render(100) -> runtime.view.render() -> native content/reconciliation and Word layout completion before print. No Map/cache type or particular allocation owner is identified. Production edits require Planner/source-owner routing; no optimization is authorized here.

Limits:

- One fresh diagnostic;11seams x2 sequential readsets, not atomic paired measurements. Pair totals and individual read timestamps are retained. Observer/readout delays alter GC and host scheduling.
- Page performance.memory and CDP Performance heap series differ by about17to18MB even at module-ready. Keep them separate. Their exact context/overhead accounting is unproven; do not subtract either from owned RSS to derive native memory.
- Host swap-in5177344bytes,swap-out0,free-pressure44to37percent and load changes confound residency interpretation. The sampled diagnostic RSS max464273408 is not a new qualification sample or continuous HWM.
- Font queries,DOM/CSS/Performance observers,numeric snapshots,geometry/style reads and finalGC perturb the run. ThreeRAF is not paint completion. No heap snapshot/allocation trace exists.
- Normal O Word100 RSS577470464/598196224/575438848 versus536870912 remainsFAIL all3. Existing Corev2 and normal Word300 evidence remains source-bound. M0 remainsOPEN. No normal rerun,Core rerun,threshold change or automatic retry.

The normal O three-sample100page RSS failure remains authoritative. This diagnostic does not qualify latency, RSS, release or whole M0.

Closest adjacent readsets (previous seam second -> next seam first) show warm CDP used heap +12,711,252B, page used +12,714,319B, nodes +0, owned RSS -5,849,088B; print CDP +1,834,712B, page +1,841,629B, nodes +4,501, owned RSS +10,190,848B. The print second readset RSS then rises another9,895,936B. These are separately timestamped observations, not exclusive allocation totals. Last-to-last differences are separately labelled in JSON. Inline font-to-warm heap +12,714,777B and warm-to-print +1,868,387B include the intervening collection work.

CDP LayoutDuration rises0.059086s ->0.086372s (27.286ms) by the first print readset; it remains0.086372s through the later explicit readout. This locates observed browser layout before that readout, without identifying a synchronous call or paint completion. Readsets span102.143–551.818ms; full pairs380.054–765.469ms. A read-only native helper independently checked arithmetic and interpretation; it ran no tests/browser and made no file edits.
