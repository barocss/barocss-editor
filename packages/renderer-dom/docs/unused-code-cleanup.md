# 사용되지 않는 코드 정리 계획

## 현재 상태

### 사용되지 않는 코드

1. **`reconcileVNodeChildren` 메서드** (`reconciler.ts` 464번 라인)
   - Fiber reconcile로 완전히 전환되어 더 이상 호출되지 않음
   - `processChildVNode`의 `reconcileFunction` 파라미터로만 전달됨
   - 하지만 `processChildVNode`는 `reconcileVNodeChildren` 내부에서만 호출됨
   - 따라서 순환 참조로 인해 실제로 호출되지 않음

2. **`processChildVNode` 함수** (`child-processing.ts`)
   - `reconcileVNodeChildren` 내부에서만 사용됨
   - 하지만 `reconcileVNodeChildren`이 호출되지 않으므로 실제로 사용되지 않음
   - 다만 유틸리티 함수로 테스트가 있으므로, 제거 전에 확인 필요

### 정리 계획

1. **테스트 주석 업데이트** ✅
   - `reconciler-update-flow.test.ts`에서 `reconcileVNodeChildren` 언급을 `Fiber reconcile`로 변경

2. **코드 제거 검토**
   - `reconcileVNodeChildren` 메서드 제거 고려
   - `processChildVNode` 함수는 유틸리티로 유지할지 검토 필요
   - 하지만 실제로 사용되지 않는다면 제거 고려

3. **테스트 코드 정리**
   - `reconcile-utils-child-processing.test.ts`는 유틸리티 함수 테스트이므로 유지 가능
   - 하지만 실제로 사용되지 않는다면 의미가 없을 수 있음

### 주의사항

- `processChildVNode`는 다른 곳에서 사용될 수 있으므로, 전체 코드베이스에서 사용 여부를 확인해야 함
- 제거 전에 모든 테스트가 통과하는지 확인 필요

