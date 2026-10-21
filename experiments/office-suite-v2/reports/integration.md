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
