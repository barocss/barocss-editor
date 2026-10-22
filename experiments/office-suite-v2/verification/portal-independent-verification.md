---
work_id: office-v2-m0/verification-v1
artifact_type: verification_record
status: ready_for_build
owner_role: Execute Verification
source_request: Resume M0 fixes and independent verification after explicit human hold release.
last_updated: 2026-10-22
---

# Independent portal lifecycle verification — #526

Base: `7eca44213c9b9609c88b635dcfc0ee8412a7e21d`.
Branch: `codex/526-portal-independent-verification`.
Scope: this record, `portal-independent.test.ts`, `portal-vitest.config.ts`, `portal-tsconfig.json`,
`logs/portal-independent-*` and `reports/portal-independent-*` in this directory.
Production renderer paths are read-only. Integration owns source adoption,
actual browser/process resources and heavyweight performance qualification.

The eight independent cases observe actual DOMRenderer output and public
completion callbacks: repeated text/attribute updates and DOM identity; target
movement; removal/disposal; two renderer owners; async supersession; cancellation
after partial actual work; callback reentrancy; and disposal with stale queued
callbacks followed by renderer reuse. Only actual scheduler timing is controlled.
No alternate tree, copied renderer or private portal map serves as the oracle.

The initial run is a baseline on the unchanged source. Preserve its first
failures. Repeat these exact assertions on an immutable renderer successor.
JSDOM tests are native software checks, not actual browser or RSS proof. Existing
Word W5 RSS failure, sampled-RSS definition, fixed v1.1 budgets, font binding and
100/300-page fixtures remain unchanged. No forced GC or unchanged heavy rerun.

Command from the repository root with Node 22.22.0 and the Integration frozen graph:

```sh
pnpm exec vitest run --config experiments/office-suite-v2/verification/portal-vitest.config.ts
pnpm exec tsc --project experiments/office-suite-v2/verification/portal-tsconfig.json --noEmit
```

No result is claimed until raw output and source/environment bindings are recorded.

## Baseline result

The frozen final assertions on `7eca4421` produced **4 PASS / 4 FAIL**. The
failures are duplicate portal content (4 instead of 1), changed host identity on
target movement, stale text after async supersession, and an owned host surviving
partial cancellation followed by removal. Raw output, pre/post test hashes and
renderer tree are in `reports/portal-independent-parent.json` and the named logs.

The first invocation ran zero tests because this verification directory had no
root DSL dependency. A verification-only source alias fixed resolution. Its raw
failure remains `logs/portal-independent-parent-first.json`. The first real
4/4 run remains `portal-independent-parent-after-resolution.json`; final run adds
two non-vacuous initial-host assertions and records hashes before/after execution.

An initial type-check invocation used the standalone NodeNext configuration and
reported 8 diagnostics, including a Vite/Rollup declaration mismatch. The final
two-file check inherits the existing DOM renderer's Bundler project unchanged,
not a new or increased budget: **exit 0**, as did the scoped ESLint check. These
are harness checks, not renderer successor acceptance. No browser or RSS run.

The successor verifier strengthens this baseline with primitive/nested Text node
identity and explicit re-edit after cancellation. The preserved baseline reaches
its earlier duplicate/cleanup failures before those additional assertions. Their
candidate execution must be reported separately; no baseline failure was removed.
