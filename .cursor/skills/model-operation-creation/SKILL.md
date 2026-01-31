---
name: model-operation-creation
description: Add a new model operation with DSL and exec tests. Use when creating a new operation in packages/model (operation + operations-dsl + test/operations), or when asked how to add operations to the model.
---

# Model Operation Creation

새 operation을 추가할 때 **operation 구현**, **DSL**, **exec 테스트**를 한 세트로 만들고, 테스트를 실행해 검증한다.

## Workflow

1. **Operation** — `packages/model/src/operations/<name>.ts` 에 `defineOperation` 으로 구현.
2. **DSL** — `packages/model/src/operations-dsl/<name>.ts` 에 `defineOperationDSL` 로 descriptor 빌더.
3. **등록** — `register-operations.ts` 에 import 추가, `operations-dsl/index.ts` 에 export 추가.
4. **테스트** — `packages/model/test/operations/<name>.exec.test.ts` 에서 DSL로 descriptor 만들고 `globalOperationRegistry.get('<name>').execute(...)` 로 실행 검증.
5. **실행** — `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts`

## File locations

| 역할 | 경로 |
|------|------|
| Operation 구현 | `packages/model/src/operations/<opName>.ts` |
| DSL | `packages/model/src/operations-dsl/<opName>.ts` |
| 등록 | `packages/model/src/operations/register-operations.ts` (import 한 줄) |
| DSL export | `packages/model/src/operations-dsl/index.ts` (export 한 줄) |
| Exec 테스트 | `packages/model/test/operations/<opName>.exec.test.ts` |

## Operation 구현 (defineOperation)

- **반환 타입**: `void` 또는 `{ ok?, data?, inverse?, selectionAfter? }`. `define-operation.ts` 의 `OperationResult` 타입에 맞춘다.
- **selectionAfter**: 캐럿을 옮길 때 반환. `nodeId` 는 **반드시 text node**(inline-text) id. block은 offset을 가지지 않으므로 block id를 주면 안 된다. 새 블록만 만드는 경우, 블록 안에 빈 inline-text 노드를 하나 넣고 그 id를 `selectionAfter.nodeId` 로 쓴다.
- **$alias**: 새로 만든 노드 id를 나중에 참조할 때 datastore `attributes.$alias` 에 문자열을 넣으면, transaction 쪽에서 `resolveAlias(alias)` 로 실제 id를 얻는다. `selectionAfter.nodeId` 에 alias를 넣어도 transaction이 resolve 후 `setCaret` 한다.
- **context**: `TransactionContext` — `dataStore`, `schema`, `selection`(current/before), `lastCreatedBlock` 등. selection 기반 오퍼레이션은 `context.selection.current` 로 위치를 해석한다.
- **inverse**: 되돌리기용 operation descriptor `{ type, payload }` 를 반환하면 transaction이 기록한다.

## DSL 구현 (defineOperationDSL)

- **형태**: `defineOperationDSL((...args) => ({ type: '<opName>', payload: { ... } }), { atom?, category? })`.
- **payload**: operation의 `execute(operation, context)` 에서 쓰는 `operation.payload` 와 동일한 형태. optional 인자는 DSL 인자로만 받고, 있을 때만 payload에 넣는다 (예: `...(x != null && { x })`).
- **타입**: `Operation` 인터페이스로 `type`과 `payload` 타입을 export 해두면 테스트/호출부에서 재사용 가능.

## Exec 테스트 패턴

- **setup**: `beforeEach` 에서 `Schema`, `DataStore`, `SelectionManager`, `createTransactionContext` 로 `context` 생성.
- **실행**: `globalOperationRegistry.get('<opName>')` 로 정의 조회 후 `op.execute({ type: '<opName>', payload: dsl.payload }, context)` 호출. descriptor는 DSL 함수로 만든 뒤 `.payload` 만 넘겨도 되고, `{ type, payload: dsl.payload }` 로 넘긴다.
- **검증**: 반환값의 `ok`, `data`, `selectionAfter`, `context.lastCreatedBlock` 등 기대값 단언. selection 기반이면 테스트 전에 `context.selection.setCaret(nodeId, offset)` 으로 캐럿을 세팅.
- **DSL 단위 테스트**: `expect(dsl()).toEqual({ type: '<opName>', payload: { ... } })` 로 인자별 payload 형태 검증.

## 체크리스트

- [ ] `operations/<name>.ts` 에 defineOperation, `register-operations.ts` 에 import
- [ ] `operations-dsl/<name>.ts` 에 defineOperationDSL, `operations-dsl/index.ts` 에 export
- [ ] `test/operations/<name>.exec.test.ts` 에서 register-operations 로드, context 생성, DSL로 execute 호출 후 결과 단언
- [ ] selectionAfter를 쓸 경우 `nodeId` 는 text node id (필요하면 빈 inline-text 노드 추가)
- [ ] `pnpm --filter @barocss/model test -- test/operations/<name>.exec.test.ts` 로 통과 확인
- [ ] **브라우저 기능 테스트**: extension에서 해당 operation을 쓰는 command가 있으면 `apps/editor-react/tests/` 에 E2E 스펙 추가 후 `pnpm test:e2e:react` 로 통과 확인 (datastore → model → operation → extension → editor-view 전체 경로 검증)
