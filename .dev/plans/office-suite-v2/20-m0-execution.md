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
