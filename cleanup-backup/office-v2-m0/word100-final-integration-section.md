## Word100 memory outcome #537 — 2026-10-22

**PASS: the unchanged Word100 memory gate is met in all three fresh samples.**
This completes the delegated cause-analysis, structural-repair and qualification
outcome. M0/alpha, local develop integration and release remain separate.

Measured HEAD `36b0fa98447d1f1b43c42066c88ec975f96f6c93`, tree
`566bcdfbd902946ef68f6af92ceee14db89f7aee`, managed root
`537-word100-integration`, branch `codex/537-word100-integration`.
Production equals author source `174595dd`; its predecessor `4961f4c1`
contains the bounded-copy and UI-free navigation changes. Integration `7a956c3d`
removes one genuinely resolved lint-baseline occurrence; `64885376` and
`36b0fa98` reconcile two immutable test-navigation deltas once. Every commit uses
easylogic as author and committer, with no coauthor.

The baseline phase/PID diagnostic confirms that the renderer supplies the main
process increase. Statistical JS stacks expose admission serialization, context
construction, repeated subtree copies and style-resolution iteration. Actual
committed census on source `4961f4c1` has 3315 Fibers and 6629 tagged VNodes,
versus 14840 VNodes on the preserved baseline. Actual JavaScript responses fall
from 630/16721310 transformed bytes to 490/11110950. Native memory-infra dumps
show BlinkGC committed/free-pool capacity alongside V8, malloc and script data.
These observations establish bounded work and process/bucket contributions;
they do not isolate each change's RSS savings or establish a retained leak.
Diagnostic sampling/tracing and its added tracing process are excluded from H7.

Mixed primitive/fragment order tests exposed earlier mount defects and later
candidate failures. Both REDs remain preserved. The final renderer places
literal text after its concrete shared host commits and uses actual anchors.
Seven new commit cases pass. The existing bookmark/caption browser specs were
updated only to open current tools through real menus; all semantic assertions
remain intact. The two failed obsolete-navigation runs remain FAIL.

- Fresh final Renderer: 20 files, 151 PASS and one existing SKIP; View: 6 files,
  69 PASS; Word print/navigation: 7 files, 39 PASS; independent native checks:
  8 PASS. No failed case is waived.
- Literal full `pnpm preflight` on `4961f4c1`: exit0,459.278s. It keeps 45 source
  targets/3 existing known-broken and all fixed test-type debt rows (1251 total).
  Subsequent renderer source/test checks and Word app test-type guards pass.
  Final root lint initially fails only because errors decreased533→532, with
  7381 existing warnings and zero new/increased diagnostics. Unchanged
  `pnpm lint --adopt` exits0 and removes exactly one old unused-parameter entry.
  No rule or threshold increases. The full command is not claimed to have run
  again on the final head; unaffected stages are explicitly reused.
- Actual print browser: 14 PASS/0 skip/retry/flaky at `7a956c3d`,65.539s.
  Actual bookmark/caption browser: 5 PASS/0 skip/retry/flaky at `36b0fa98`,
  22.762s. Only test navigation/docs changed between these heads; implementation
  source and actual aliases are byte-identical. Print was not repeated.

One unmodified H7 window ran 3 fresh100 and 3 fresh300 samples, exit0,22.154s.
Fixture, media, actual CoreText font identities/version/hashes, original seven
harness hashes, no-forced-GC policy, guards and reference budget remain fixed.

| Profile | Peak sampled owned aggregate RSS, bytes | MiB | Result |
| --- | --- | --- | --- |
| 100 pages | 518619136 /515047424 /481984512 | 494.59375 /491.1875 /459.65625 | 3/3 PASS <=512 |
| 300 pages | 843366400 /847101952 /843071488 | 804.296875 /807.859375 /804.015625 | 3/3 PASS <=1024 |

Worst-of-three open/render/print timings:100 pages305.5/100.5/24.3ms;
300 pages989.6/345.3/66.8ms. All original targets, phase repeatability,
actual fonts and guards pass. Printed node deltas4501/13501 have ratio2.99956,
within3.5. This is 200ms sampled owned-process aggregate RSS including shared
pages, not private bytes/continuous HWM or a population-tail guarantee.

Original raw: `verification/reports/word-performance-2026-10-22T14-21-28-061Z/report.json`,
134876 bytes, SHA256 `16a8fe3ceb2e3fb30d9178eb47887945b5a14d466a4d040f915cf62a0473a856`.
Primary copy/assessment: `.omx/m0/word100-normal-qualification-v1/`, assessment
SHA256 `8d76344f7ef7ade87d21536814d069d234ebd52476ef3dbeff3cccd3e6646794`.
Before/after1215 source/manifest/guard/harness files and654 actual aliases
(244 workspace-source links) are identical, including new bookmark navigation
and renderer paths outside the original curated17. This is a source superset,
not a claim that every file dynamically loaded. All24 observed browser PIDs
and private ports55260/55261 are absent; the lease is returned.

The old Word100 failure raw, native diagnostic/REDs, user tabs, five existing
55262–55266 producers/data/operatorOFF setting, account receipt, four primary
planning-file hashes/WIP, primary HEAD034a42c and local develop f4ed8edd are
preserved. No files/caches were deleted, despite a transient disk-write failure.
The conditional style-resolver scope remains inactive. No unchanged retry,
extra source optimization, push/PR/deploy, schedule/model change or automatic
Issue/Goal closure follows this qualified result.

---

