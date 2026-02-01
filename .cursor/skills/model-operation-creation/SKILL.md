---
name: model-operation-creation
description: Add a new model operation with DSL and exec tests. Use when creating a new operation in packages/model (operation + operations-dsl + test/operations), or when asked how to add operations to the model.
---

# Model Operation Creation

When adding a new operation, implement **operation**, **DSL**, and **exec test** as one set, then run tests to verify.

## Workflow

1. **Operation** — Implement in `packages/model/src/operations/<name>.ts` with `defineOperation`.
2. **DSL** — Add descriptor builder in `packages/model/src/operations-dsl/<name>.ts` with `defineOperationDSL`.
3. **Registration** — Add import in `register-operations.ts`, export in `operations-dsl/index.ts`.
4. **Test** — In `packages/model/test/operations/<name>.exec.test.ts`, build descriptor via DSL and verify with `globalOperationRegistry.get('<name>').execute(...)`.
5. **Run** — `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts`

## File locations

| Role | Path |
|------|------|
| Operation | `packages/model/src/operations/<opName>.ts` |
| DSL | `packages/model/src/operations-dsl/<opName>.ts` |
| Registration | `packages/model/src/operations/register-operations.ts` (one import line) |
| DSL export | `packages/model/src/operations-dsl/index.ts` (one export line) |
| Exec test | `packages/model/test/operations/<opName>.exec.test.ts` |

## Operation (defineOperation)

- **Return type**: `void` or `{ ok?, data?, inverse?, selectionAfter? }`. Must match `OperationResult` in `define-operation.ts`.
- **selectionAfter**: Return when moving the caret. `nodeId` must be a **text node** (inline-text) id. Do not use a block id (blocks have no offset). When creating only a new block, add one empty inline-text node inside and use its id for `selectionAfter.nodeId`.
- **$alias**: Put a string in datastore `attributes.$alias` for a newly created node to reference it later; the transaction uses `resolveAlias(alias)` to get the real id. You can put an alias in `selectionAfter.nodeId`; the transaction resolves it then calls `setCaret`.
- **context**: `TransactionContext` — `dataStore`, `schema`, `selection` (current/before), `lastCreatedBlock`, etc. Selection-based operations interpret position via `context.selection.current`.
- **inverse**: Return undo operation descriptor `{ type, payload }` and the transaction records it.

## DSL (defineOperationDSL)

- **Shape**: `defineOperationDSL((...args) => ({ type: '<opName>', payload: { ... } }), { atom?, category? })`.
- **payload**: Same shape as `operation.payload` used in `execute(operation, context)`. Optional args are only in DSL; add to payload when present (e.g. `...(x != null && { x })`).
- **Types**: Export `type` and `payload` types via an `Operation` interface for reuse in tests and callers.

## Exec test pattern

- **setup**: In `beforeEach`, create `context` with `Schema`, `DataStore`, `SelectionManager`, `createTransactionContext`.
- **run**: Get definition via `globalOperationRegistry.get('<opName>')`, then call `op.execute({ type: '<opName>', payload: dsl.payload }, context)`. Build descriptor with DSL and pass `.payload` only, or pass `{ type, payload: dsl.payload }`.
- **assert**: Assert expected values on return (`ok`, `data`, `selectionAfter`, `context.lastCreatedBlock`, etc.). For selection-based ops, set caret before test with `context.selection.setCaret(nodeId, offset)`.
- **DSL unit test**: `expect(dsl()).toEqual({ type: '<opName>', payload: { ... } })` to verify payload shape per args.

## Checklist

- [ ] defineOperation in `operations/<name>.ts`, import in `register-operations.ts`
- [ ] defineOperationDSL in `operations-dsl/<name>.ts`, export in `operations-dsl/index.ts`
- [ ] In `test/operations/<name>.exec.test.ts`: load register-operations, create context, call execute via DSL, assert result
- [ ] If using selectionAfter, `nodeId` must be a text node id (add empty inline-text node if needed)
- [ ] Run `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts` and ensure it passes
- [ ] **Browser/E2E**: If an extension command uses this operation, add E2E spec in `apps/editor-react/tests/` and run `pnpm test:e2e:react` (validates datastore → model → operation → extension → editor-view)
