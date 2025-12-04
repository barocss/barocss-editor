# Reconcile 테스트 체크리스트 (Fiber 전환 후)

## 테스트 목록

### ✅ 이미 Fiber 대응 완료
- [x] `reconcile-root-basic.test.ts` - waitForFiber 추가됨
- [x] `reconciler-component-updatebysid.test.ts` - waitForFiber 추가됨
- [x] `reconciler-update-flow.test.ts` - waitForFiber 추가됨
- [x] `reconciler-advanced-cases.test.ts` - waitForFiber 추가됨

### 🔍 검증 필요 (Fiber 비동기 처리 확인)
- [x] `reconciler-verification.test.ts` - 일부 수정 완료 (38 failed, 52 passed)
- [x] `reconciler-complex-scenarios.test.ts` - 일부 수정 완료 (8 failed) - DOM 구조 문제 발견
- [x] `reconciler-lifecycle.test.ts` - 일부 수정 완료 (4 failed, 2 passed)
- [ ] `reconciler-errors.test.ts`
- [ ] `reconciler-portal.test.ts`
- [ ] `reconciler-prevvnode-nextvnode.test.ts`
- [ ] `reconciler-text-vnode.test.ts`
- [ ] `reconciler-performance.test.ts`
- [ ] `reconciler-mark-wrapper-reuse.test.ts`
- [ ] `reconciler-component-state-integration.test.ts`
- [ ] `reconciler-selection-pool.behavior.test.ts`
- [ ] `reconciler-selection-preservation.test.ts`

### ⚠️ 발견된 문제
1. **DOM 구조 오류**: `reconciler-complex-scenarios.test.ts`에서 DOM 구조가 예상과 다르게 렌더링됨
   - 원인: Fiber 비동기 처리로 인한 순서 문제 또는 reorder 로직 문제 가능
   - 해결 필요: `reconcileVNodesToDOM`의 reorder 로직 확인

### 🧪 Fiber 전용 테스트
- [x] `fiber-reconciler.test.ts` - Fiber 구조 테스트
- [x] `fiber-scheduler.test.ts` - Fiber 스케줄러 테스트
- [x] `fiber-tree.test.ts` - Fiber 트리 생성 테스트
- [x] `reconciler-fiber-integration.test.ts` - Fiber 통합 테스트

### 🔧 유틸리티 테스트 (Fiber와 직접 관련 없음)
- [ ] `reconcile-utils-host-management.test.ts`
- [ ] `reconcile-utils-text-node-handlers.test.ts`
- [ ] `reconcile-utils-portal-handler.test.ts`
- [ ] `reconcile-utils-host-finding.test.ts`
- [ ] `reconcile-utils-meta-utils.test.ts`
- [ ] `reconcile-utils-vnode-utils.test.ts`
- [ ] `reconcile-utils-dom-utils.test.ts`
- [ ] `reconcile-utils-pre-clean.test.ts` (제거됨 - 사용 안 함)

## 검증 항목

각 테스트에서 확인해야 할 사항:

1. **비동기 처리 확인**
   - `renderer.render()` 또는 `reconciler.reconcile()` 호출 후
   - `await waitForFiber()` 추가 필요 여부 확인

2. **DOM 업데이트 타이밍**
   - DOM 조작 후 즉시 확인하는 경우 → `waitForFiber()` 필요
   - 이미 충분한 시간이 지난 후 확인하는 경우 → 불필요할 수 있음

3. **테스트 실패 원인 분석**
   - Fiber 비동기 처리로 인한 타이밍 이슈인지
   - 실제 로직 오류인지 구분

## 실행 순서

1. 각 테스트 파일 실행
2. 실패한 테스트 분석
3. `waitForFiber()` 추가 또는 로직 수정
4. 재실행하여 통과 확인

