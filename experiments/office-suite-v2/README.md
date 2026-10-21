# Office v2 M0 experiment

Scope: `office-v2-m0/integration-v1`, [#522](https://github.com/barocss/barocss-editor/issues/522), parent [#521](https://github.com/barocss/barocss-editor/issues/521). This directory is an isolated risk prototype. It is outside the root pnpm workspace and does not register a production engine. Its scaffold has no workbook, formula, collaboration binding or domain contract implementation.

## Fixed environment and dependency graph

- Node **22.22.0**, pnpm **8.15.0**.
- Yjs **13.6.29** is the first low-level primitive candidate. Loading it is not adoption or domain acceptance.
- TypeScript **5.9.3**, Node declarations **22.20.2**, both present in the root baseline lock. Node 22 declarations support the built-in `node:sqlite` API requested by Collaboration. SQLite remains an experimental Node API; its scaffold availability check does not open a database.
- The committed standalone `pnpm-lock.yaml` fixes transitive versions and integrity. The root manifest, workspace and lock are unchanged. Use `--ignore-workspace` for every pnpm invocation here.

```sh
export PATH=/Users/user/.nvm/versions/node/v22.22.0/bin:$PATH
cd /absolute/path/to/your/worktree/experiments/office-suite-v2
node --version
pnpm --version
```

Integration alone installs or changes this graph:

```sh
pnpm --ignore-workspace install --frozen-lockfile --ignore-scripts
```

Author worktrees use the **same frozen dependencies**, with no concurrent installer or author manifest edits. After confirming that the author's manifest/lock match scaffold S, link the installed directory reported by `/Users/user/barocss-editor/.omx/m0/integration-control.json` into the author's experiment. Create the link only when the destination does not already exist. Integration can instead prepare a separate installation from the identical frozen lock if isolation is needed. Do not install at the repository root or run a moving `pnpm dlx` tool.

```sh
ln -s /absolute/S/worktree/experiments/office-suite-v2/node_modules node_modules
```

## Targeted checks

The native Node runner executes erasable TypeScript with `--experimental-strip-types --test`. There is no additional test framework, transpiler or code-generation stage. Use explicit `.ts` imports and `import type` for types. Enums, parameter properties, runtime namespaces and JSX need a later agreed runner change; do not add a private transform. Strict type checks use the same compiler configuration and include imported dependencies. Every reported diagnostic fails the check; there is no experiment debt allowance.

Authors run only their changed files and directly affected contracts. Paths are relative to this experiment and may name a file or directory. Examples for files that will be supplied by their named owners:

```sh
pnpm --ignore-workspace type-check -- src/contracts.ts src/workbook.ts test/workbook.test.ts test/structure.test.ts
pnpm --ignore-workspace test -- test/workbook.test.ts test/structure.test.ts

pnpm --ignore-workspace type-check -- src/formula.ts src/references.ts src/calculation.ts test/formula.test.ts test/references.test.ts test/calculation.test.ts
pnpm --ignore-workspace test -- test/formula.test.ts test/references.test.ts test/calculation.test.ts

pnpm --ignore-workspace type-check -- src/collaboration.ts src/prose.ts src/durable-store.ts test/collaboration.test.ts test/prose.test.ts test/recovery.test.ts
pnpm --ignore-workspace test -- test/collaboration.test.ts test/prose.test.ts test/recovery.test.ts

pnpm --ignore-workspace type-check -- verification
pnpm --ignore-workspace test -- verification
```

Selectors are literal paths, not shell globs. Missing inputs, selectors with no matching tests and empty runs fail. Type-check selectors compile their imports too; they cannot hide a dependent contract error. `test` discovers `*.test.ts` and `*.spec.ts`. With no selectors, check roots are `src`, `test`, `scripts` and `verification`; missing optional roots are not invented. Headless M0 TypeScript uses ES2023/NodeNext plus DOM declarations because Yjs's public XML types refer to browser types. `skipLibCheck` remains false: declaration errors are checked. DOM declarations do not supply a DOM at runtime. Agree a scoped config/runner change with Integration before introducing browser or TSX modules.

Integration's combined M0 entry is:

```sh
pnpm --ignore-workspace check
```

At scaffold S this checks only the scaffold's own TypeScript/runtime/dependency smoke tests. It is not the M0 suite acceptance. Native SQLite tests must use disposable storage. Do not open an existing product database. Browser work needs an Integration-issued isolated port/context lease; none is allocated by the scaffold.

## Ownership, integration and evidence

Core [#523](https://github.com/barocss/barocss-editor/issues/523) owns `src/contracts.ts`, workbook implementation and its tests/manual. Core publishes immutable contracts-only C before Formula [#524](https://github.com/barocss/barocss-editor/issues/524) or Collaboration [#525](https://github.com/barocss/barocss-editor/issues/525) implements against it. Verification [#526](https://github.com/barocss/barocss-editor/issues/526) owns `verification/**`. Full path leases and original acceptance are in [the execution plan](../../.dev/plans/office-suite-v2/20-m0-execution.md).

Integration alone owns this manifest, lock, tsconfig, scripts and aggregate report. Hand off exact parent/head/tree, owned paths, targeted checks, first failures and remaining criteria. Integration serializes immutable owned deltas and returns semantic failures to their file owner. It does not copy a domain contract into another lane or silently repair domain behavior.

The latest human policy requires targeted author checks. Integration schedules broad/full repository checks for a meaningful combined batch when combined source, dependencies, interfaces or release risk requires it. The isolated scaffold does not change production packages, root dependencies or budgets, so a whole-repository baseline is NOT RUN at S. A later production seam or shared dependency change needs affected root checks and, when warranted, the unchanged full preflight. Final integration and release gates remain required. Prototype success is separate from actual Office authorization, durability, product and release acceptance.

See [the integration receipt](reports/integration.md). Local full logs and exact scaffold SHA/tree are in the primary checkout's ignored `.omx/m0/` control directory. Historical WIP, Draft PR #519, schedules, databases and unrelated processes remain outside this scope.
