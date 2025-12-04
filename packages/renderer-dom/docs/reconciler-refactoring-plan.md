# Reconciler 리팩토링 계획

## 목표

React의 Reconciliation 알고리즘을 정확히 따르도록 수정:
1. **vnode.text 제거**: VNodeBuilder 결과물을 그대로 reconcile
2. **구조적 매칭 제거**: vnodeStructureMatches 사용 제거
3. **React 매칭 전략 적용**: key(sid) → type(tag) → index 순서로 매칭

---

## React Reconciliation 매칭 전략

### 1. Key-based Matching (최우선)
- 같은 key면 같은 요소로 간주
- 우리: sid 또는 decoratorSid 사용

### 2. Type-based Matching
- 같은 key가 없으면 타입(tag) 비교
- 다른 타입이면 unmount/mount
- 같은 타입이면 update

### 3. Index-based Fallback
- key가 없고 같은 인덱스에 같은 타입이면 재사용
- React는 경고 표시하지만 우리는 조용히 처리

---

## 수정 사항

### 1. vnode.text 제거

**제거할 코드**:
- `handleVNodeTextProperty` 호출 제거
- `vnode.text` 체크 및 처리 로직 제거
- `handleTextVNodeInChildren` 제거 또는 수정
- `updateHostTextContent`에서 vnode.text 관련 로직 제거

**파일**:
- `reconciler.ts`: `handleVNodeTextProperty` 호출 제거
- `child-processing.ts`: vnode.text 관련 로직 제거
- `text-node-handlers.ts`: `handleVNodeTextProperty` 함수는 유지하되 사용하지 않음

### 2. 구조적 매칭 제거

**제거할 코드**:
- `vnodeStructureMatches` 함수 사용 제거
- `findHostForChildVNode`에서 구조적 매칭 로직 제거
- `findPrevChildVNode`에서 구조적 매칭 로직 제거
- `transferMetaFromPrevToNext`에서 구조적 매칭 로직 제거

**파일**:
- `host-finding.ts`: 구조적 매칭 제거, React 스타일로 변경
- `meta-utils.ts`: 구조적 매칭 제거

### 3. React 매칭 전략 적용

**변경 사항**:
```typescript
// 현재: SID → 구조적 매칭 → 인덱스
// 변경: SID → Type → Index

function findHostForChildVNode(...) {
  // 1. Key (SID) 기반 매칭
  if (childVNode.sid || childVNode.decoratorSid) {
    // SID로 찾기
  }
  
  // 2. Type (tag) + Index 기반 매칭
  // 같은 인덱스에 같은 타입이면 재사용
  const prevChild = prevChildVNodes[childIndex];
  if (prevChild && typeof prevChild === 'object') {
    const prevChildVNode = prevChild as VNode;
    // 같은 타입인지 확인
    if (prevChildVNode.tag === childVNode.tag) {
      // prevChildVNode.meta.domElement 사용
    }
  }
  
  // 3. Index 기반 fallback (같은 인덱스의 같은 타입)
  // 이미 위에서 처리됨
}
```

---

## 단계별 수정 계획

### Step 1: vnode.text 제거
1. `reconcileVNodeChildren`에서 `handleVNodeTextProperty` 호출 제거
2. `processChildVNode`에서 vnode.text 관련 로직 제거
3. `child-processing.ts`에서 text-only VNode 처리 제거 (VNodeBuilder가 이미 처리)

### Step 2: 구조적 매칭 제거
1. `host-finding.ts`에서 `vnodeStructureMatches` 사용 제거
2. `findHostForChildVNode`를 React 스타일로 변경
3. `findPrevChildVNode`를 React 스타일로 변경
4. `meta-utils.ts`에서 구조적 매칭 제거

### Step 3: React 매칭 전략 적용
1. Key (SID) 기반 매칭 유지
2. Type (tag) + Index 기반 매칭 추가
3. Index 기반 fallback 정리

---

## 테스트 수정 필요

다음 테스트들이 수정이 필요할 수 있습니다:
- `reconcile-utils-child-processing.test.ts`: vnode.text 관련 테스트 제거
- `reconcile-utils-host-finding.test.ts`: 구조적 매칭 테스트 제거
- `reconcile-utils-vnode-utils.test.ts`: vnodeStructureMatches 테스트 제거 또는 수정

