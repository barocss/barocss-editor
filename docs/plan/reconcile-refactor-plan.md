# Reconcile Refactor Plan

## 현재 문제점

1. **중복 Finalize**: `reconcileChildrenWithKeys`와 `work-in-progress-manager` 모두에서 `finalizeDOMUpdate` 호출
2. **Build 단계에서 DOM 접근**: `KeyBasedReconciler`가 DOM을 직접 조회하여 재사용 시도
3. **Process 단계에서 DOM 조작**: `updateChildren`이 `reconcileChildrenWithKeys`를 호출하고 그것이 즉시 finalize 실행
4. **텍스트 처리 분산**: 여러 곳에서 `textContent` 설정

## 올바른 단계 분리

### Phase 1: Build (WIP 트리 생성)
- **목적**: prevVNode와 nextVNode만 비교하여 WIP 트리 구성
- **조건**: DOM 접근 금지, DOM 조작 금지
- **출력**: 완성된 WIP 트리 (parent/children 연결, orderIndex 부여, toDelete 마킹)

### Phase 2: Process (변경 감지)
- **목적**: 각 WIP의 previousVNode와 vnode 비교하여 needsUpdate 설정
- **조건**: DOM 접근 금지, DOM 조작 금지
- **출력**: needsUpdate 플래그가 설정된 WIP 트리

### Phase 3: Finalize (DOM 조작)
- **목적**: WIP 트리를 순회하며 실제 DOM 생성/수정/삭제
- **조건**: 유일한 DOM 접근/조작 지점
- **입력**: 완성된 WIP 트리 (orderIndex 정렬된 children)

## 수정 사항

### 1. KeyBasedReconciler.reconcileChildren
- **현재**: DOM 조회로 재사용 시도, `processWorkInProgress` 호출
- **수정**: DOM 접근 제거, WIP 생성만, `orderIndex` 부여

### 2. reconcileChildrenWithKeys
- **현재**: `finalizeDOMUpdate` 직접 호출
- **수정**: WIP 반환만, finalize는 제거

### 3. updateChildren
- **현재**: `reconcileChildrenWithKeys` 호출하여 즉시 finalize
- **수정**: `reconcileChildrenWithKeys` 호출하여 WIP만 받고, 그것을 `wip.children`에 연결

### 4. work-in-progress-manager.executeDOMUpdates
- **현재**: 이미 올바름 (children을 orderIndex로 정렬 후 finalize)
- **확인**: reconcileChildrenWithKeys에서 생성된 WIP들이 트리에 포함되는지 확인

## 구현 순서

1. KeyBasedReconciler 수정: DOM 접근 제거, WIP 생성만
2. reconcileChildrenWithKeys 수정: finalize 제거, WIP 반환만
3. updateChildren 수정: 반환된 WIP를 wip.children에 연결
4. 텍스트 처리 통합: finalize 단계에서만 처리

