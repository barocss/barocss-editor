# Reconciler vs React Reconciliation 비교 분석

## 개요

이 문서는 우리의 Reconciler 구현이 React의 Reconciliation 알고리즘과 어떻게 비교되는지 분석합니다.

---

## React Reconciliation 핵심 개념

### 1. Diffing Algorithm (비교 알고리즘)

React는 두 가지 주요 전략을 사용합니다:

1. **Key-based Matching**: `key` prop을 사용하여 요소를 식별
2. **Type-based Matching**: 같은 타입의 요소를 재사용
3. **Index-based Fallback**: key가 없으면 인덱스로 매칭

### 2. Reconciliation 단계

```
1. Element Type 비교
   - 다른 타입 → Unmount old, Mount new
   - 같은 타입 → Update props

2. Key 비교 (같은 타입일 때)
   - 같은 key → Update
   - 다른 key → Unmount old, Mount new

3. Children 재귀 처리
   - 같은 key의 children → 재귀 reconcile
   - 다른 key의 children → Unmount/Mount
```

### 3. 최적화 전략

- **Element 재사용**: 같은 key/type이면 DOM 요소 재사용
- **Props diffing**: 변경된 props만 업데이트
- **Batching**: 여러 업데이트를 배치로 처리

---

## 우리 Reconciler 구현

### 1. Matching 전략

우리는 React보다 더 정교한 매칭 전략을 사용합니다:

#### 전략 1: SID 기반 매칭 (최우선)
```typescript
// Component/Decorator는 SID로 고유하게 식별
if (childVNode.sid) {
  host = parent.querySelector(`[data-bc-sid="${childVNode.sid}"]`);
}
```
**React 비교**: React의 `key`와 유사하지만, 우리는 항상 SID를 사용 (key는 optional)

#### 전략 2: Type-based Matching + Index
```typescript
// SID가 없으면 같은 타입(tag) + 같은 인덱스로 매칭
const prevChild = prevChildVNodes[childIndex];
if (prevChild && prevChild.tag === childVNode.tag) {
  host = prevChild.meta.domElement;
}
```
**React 비교**: React와 동일 - key가 없으면 type(tag) + index로 매칭

#### 전략 3: Index-based Fallback
```typescript
// 마지막 수단: 같은 인덱스의 같은 태그 재사용 (DOM에서 직접 찾기)
if (childIndex < parent.children.length) {
  const candidate = parent.children[childIndex];
  if (candidate.tagName === childVNode.tag) {
    host = candidate;
  }
}
```
**React 비교**: React와 동일 - key가 없으면 인덱스로 매칭 (React는 경고 표시하지만 우리는 조용히 처리)

### 2. Reconciliation 단계

우리의 단계는 React와 유사하지만 더 세분화되어 있습니다:

```
1. Pre-clean (우리만의 최적화)
   - 예상되지 않는 요소를 미리 제거
   - React는 이 단계가 없음 (reconcile 중에 처리)

3. 각 Child 처리
   a. Primitive text → Text node
   b. Text-only VNode → Text node
   c. Portal VNode → 외부 타겟에 렌더링
   d. Element VNode:
      - Host 찾기 (SID → 구조 → 인덱스)
      - Host 생성/업데이트
      - Attributes/Styles 업데이트
      - Text content 처리
      - 재귀 reconcile

4. 순서 정렬 (reorder)
   - nextDomChildren 순서대로 DOM 재배치

5. Meta 전송
   - prevVNode.meta → nextVNode.meta (DOM 요소 참조 보존)

6. Stale 제거
   - keep Set에 없는 요소 제거
```

### 3. 최적화 전략

#### Element 재사용
```typescript
// React와 동일: 같은 SID/key면 DOM 요소 재사용
if (host) {
  // Update existing
} else {
  // Create new
}
```

#### Props Diffing
```typescript
// React와 동일: prevVNode와 nextVNode를 비교하여 변경된 부분만 업데이트
dom.updateAttributes(host, prevVNode?.attrs, nextVNode.attrs);
dom.updateStyles(host, prevVNode?.style, nextVNode.style);
```

#### Text Node 재사용 (우리만의 최적화)
```typescript
// React는 텍스트 노드를 항상 재사용하지만, 우리는 명시적으로 처리
const existingTextNode = parent.firstChild;
if (existingTextNode && existingTextNode.nodeType === 3) {
  if (existingTextNode.textContent !== expectedText) {
    existingTextNode.textContent = expectedText;  // 내용만 변경
  }
  return existingTextNode;  // 재사용
}
```
**목적**: MutationObserver 트리거 최소화

---

## 주요 차이점

### 1. Key vs SID

| React | 우리 |
|------|------|
| `key` prop (optional) | `sid` (항상 존재) |
| key가 없으면 인덱스 사용 (경고) | SID가 없으면 type(tag) + index 사용 |
| key는 개발자가 설정 | SID는 시스템이 자동 생성 |

**장점 (우리)**:
- SID는 항상 존재하므로 더 안정적인 매칭
- React와 동일한 매칭 전략 (key → type → index)

**단점 (우리)**:
- SID 생성/관리 오버헤드

### 2. Pre-clean 단계

| React | 우리 |
|------|------|
| 없음 | `removeStaleEarly` 단계 존재 |
| reconcile 중에 stale 제거 | reconcile 전에 미리 제거 |

**장점 (우리)**:
- reconcile 중 충돌 방지
- 더 명확한 단계 분리

**단점 (우리)**:
- 추가 DOM 조작 (하지만 필요함)

### 3. Text Node 처리

| React | 우리 |
|------|------|
| 항상 재사용 | 명시적으로 재사용 처리 |
| MutationObserver 고려 없음 | MutationObserver 트리거 최소화 |

**장점 (우리)**:
- MutationObserver 최적화
- 더 세밀한 제어

### 4. Portal 처리

| React | 우리 |
|------|------|
| `ReactDOM.createPortal` | `handlePortalVNode` |
| Portal은 children에 포함 | Portal은 null 반환 (children에서 제외) |

**차이점**:
- React는 Portal을 children으로 처리하지만, 우리는 별도로 처리

### 5. Meta 전송

| React | 우리 |
|------|------|
| 없음 | `transferMetaFromPrevToNext` |
| Fiber node에 참조 저장 | VNode.meta.domElement에 참조 저장 |

**장점 (우리)**:
- DOM 요소 참조를 명시적으로 보존
- 다음 렌더링에서 재사용 용이

---

## React Reconciliation 원칙 준수 여부

### ✅ Element Type 비교
- **React**: 다른 타입이면 Unmount/Mount
- **우리**: 태그 변경 시 교체 (`reconcile` line 98-106)
```typescript
if (currentTag !== desiredTag) {
  const replacement = this.dom.createSimpleElement(desiredTag, container);
  container.replaceChild(replacement, host);
  host = replacement;
}
```

### ✅ Key-based Matching
- **React**: 같은 key면 Update
- **우리**: 같은 SID면 Update (`findHostForChildVNode` - SID 기반 매칭)

### ✅ Props Diffing
- **React**: 변경된 props만 업데이트
- **우리**: 변경된 attrs/styles만 업데이트
```typescript
dom.updateAttributes(host, prevVNode?.attrs, nextVNode.attrs);
dom.updateStyles(host, prevVNode?.style, nextVNode.style);
```

### ✅ Children 재귀 처리
- **React**: 재귀적으로 children reconcile
- **우리**: `reconcileVNodeChildren` 재귀 호출

### ✅ Element 재사용
- **React**: 같은 key/type이면 DOM 요소 재사용
- **우리**: 같은 SID/type이면 DOM 요소 재사용 (React와 동일)

### ✅ Index-based Fallback
- **React**: key가 없으면 인덱스 사용 (경고)
- **우리**: SID가 없으면 type(tag) + index 사용 (경고 없음, React와 동일한 로직)

---

## 우리만의 추가 기능

### 1. Type-based Matching
- SID가 없는 요소는 type(tag) + index로 매칭
- React와 동일한 전략

### 2. Pre-clean 단계
- 예상되지 않는 요소를 미리 제거
- React는 이 단계가 없음

### 3. Text Node 재사용 최적화
- MutationObserver 트리거 최소화를 위한 명시적 처리
- React는 이 최적화가 없음

### 4. Meta 전송
- DOM 요소 참조를 명시적으로 보존
- React는 Fiber node에 저장하지만, 우리는 VNode.meta에 저장

### 5. Portal 별도 처리
- Portal을 children에서 제외하고 별도로 처리
- React는 Portal을 children으로 처리

---

## 성능 비교

### React Reconciliation
- **시간 복잡도**: O(n) (n = children 수)
- **최적화**: Key 기반 매칭, Props diffing

### 우리 Reconciler
- **시간 복잡도**: O(n) (n = children 수)
- **최적화**: 
  - SID 기반 매칭 (O(1))
  - 구조적 매칭 (O(1) - 캐시된 경우)
  - 인덱스 기반 fallback (O(1))
  - Pre-clean (O(n))
  - Text Node 재사용

**결론**: 시간 복잡도는 동일하지만, 우리는 더 많은 최적화를 수행

---

## 개선 가능한 부분

### 1. React의 Fiber Architecture
- **React**: Fiber node로 작업을 분할하고 우선순위 조정
- **우리**: 동기적으로 처리
- **개선 방안**: 비동기 reconcile 도입 (선택적)

### 2. React의 Batching
- **React**: 여러 업데이트를 배치로 처리
- **우리**: 각 업데이트를 즉시 처리
- **개선 방안**: 업데이트 배칭 도입 (선택적)

### 3. React의 Suspense
- **React**: 비동기 컴포넌트를 위한 Suspense
- **우리**: 없음
- **개선 방안**: 필요 시 도입

---

## 결론

### ✅ React Reconciliation 원칙 준수
- Element Type 비교 ✅
- Key-based Matching (SID 기반) ✅
- Props Diffing ✅
- Children 재귀 처리 ✅
- Element 재사용 ✅

### 🎯 우리만의 추가 기능
- Pre-clean 단계 (예상되지 않는 요소를 미리 제거)
- Text Node 재사용 최적화 (MutationObserver 트리거 최소화)
- Meta 전송 (DOM 요소 참조 보존)
- Portal 별도 처리

### 📊 성능
- 시간 복잡도: O(n) (React와 동일)
- 추가 최적화: Pre-clean, Text Node 재사용

### 🔄 개선 가능한 부분
- 비동기 reconcile (Fiber Architecture)
- 업데이트 배칭
- Suspense 지원

---

## 참고 자료

- [React Reconciliation](https://react.dev/learn/preserving-and-resetting-state)
- [React Fiber Architecture](https://github.com/acdlite/react-fiber-architecture)
- [Reconciler 상세 흐름](./reconciler-detailed-flow.md)
- [Reconciler 논리적 오류](./reconciler-logical-issues.md)

