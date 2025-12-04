# Fiber 개선 계획

## 핵심 원칙

**Reconciler는 domain을 몰라도 동작해야 함**

- Fiber는 VNodeBuilder가 만든 결과물을 그대로 reconcile만 수행
- `decoratorSid`, `decoratorStype` 같은 domain 개념을 직접 알면 안 됨
- React처럼 순수한 reconciliation 로직만 담당

## 현재 문제점 정리

### 1. Domain 지식 누수 (Domain Knowledge Leakage)

#### 문제가 있는 파일들

**1. `fiber-reconciler.ts`**
- Line 140-151: `decoratorSid`, `decoratorStype` 직접 확인
- Line 228-233: `decoratorSid` 비교 로직
- Line 300-315: `isDecoratorVNode` 체크 및 `decoratorSid` 비교

**2. `fiber-tree.ts`**
- Line 67-68: `decoratorSid` 직접 사용
- Line 83-88: `!childVNode.decoratorSid` 조건문
- Line 107-113: `decoratorSid`, `decoratorStype` 직접 확인

**3. `host-finding.ts`**
- Line 41-43: `isDecoratorVNode = !!childVNode.decoratorSid`
- Line 53-57: `decoratorSid` 직접 비교
- Line 84-95: `decoratorSid` 조건문
- Line 138-144: `decoratorSid` 비교

**4. `host-management.ts`**
- Line 201-211: `decoratorSid`, `decoratorStype` 등 직접 사용 (이건 DOM 속성 설정이므로 OK)
- Line 351-362: `decoratorSid`, `decoratorStype` 등 직접 사용 (이건 DOM 속성 설정이므로 OK)

**참고**: `host-management.ts`의 `decoratorSid` 사용은 DOM 속성 설정이므로 문제 없음. VNode의 속성을 그대로 DOM에 반영하는 것은 정상적인 동작.

### 2. 전역 검색 문제 (Global Search Problem)

#### 문제가 있는 파일들

**1. `fiber-reconciler.ts`**
- Line 301-318: `parent.ownerDocument?.querySelectorAll` 사용

**2. `host-finding.ts`**
- Line 130-148: `parent.ownerDocument?.querySelectorAll` 사용

**3. `host-management.ts`**
- Line 124-136: `parent.ownerDocument.querySelectorAll` 사용

## 개선 계획

### Phase 1: Domain 지식 제거

#### 1.1 `getVNodeId()` 함수 통일

**현재**: 여러 곳에서 `vnode.sid || vnode.decoratorSid` 반복

**개선**: 
- `getVNodeId()` 함수를 모든 곳에서 사용
- Domain 개념 없이 "VNode 식별자"로만 취급

**파일**: `host-finding.ts`, `fiber-reconciler.ts`, `fiber-tree.ts`, `dom-utils.ts`

#### 1.2 `decoratorSid` 직접 참조 제거

**현재**:
```typescript
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // 재사용하지 않음
}
```

**개선**:
```typescript
const vnodeId = getVNodeId(vnode);
const prevVNodeId = getVNodeId(prevVNode);
if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // ID가 다르면 재사용하지 않음
}
```

**파일**: `fiber-reconciler.ts` (Line 140-151, 228-233, 300-315)

#### 1.3 `isDecoratorVNode` 체크 제거

**현재**:
```typescript
const isDecoratorVNode = !!childVNode.decoratorSid;
if (isDecoratorVNode) {
  // decorator 특별 처리
}
```

**개선**: 
- `isDecoratorVNode` 체크 제거
- `getVNodeId()`로 통일된 ID 비교만 수행

**파일**: `host-finding.ts` (Line 41-43, 53-57, 84-95, 138-144)

#### 1.4 `decoratorSid` 조건문 제거

**현재**:
```typescript
if (!childVNode.decoratorSid) {
  // decorator가 아닌 경우만 처리
}
```

**개선**:
- 조건문 제거 또는 `getVNodeId()` 기반으로 변경
- Domain 개념 없이 구조적 속성만 확인

**파일**: `fiber-tree.ts` (Line 83-88)

### Phase 2: 전역 검색 제거

#### 2.1 `findHostInParentChildren()` 함수 구현

**새 함수**: `host-finding.ts`에 추가

```typescript
/**
 * Find host element in parent's children only (no global search)
 * React-style: children 기준으로만 비교
 */
function findHostInParentChildren(
  parent: HTMLElement,
  vnode: VNode,
  prevVNode: VNode | undefined,
  childIndex: number
): HTMLElement | null {
  const vnodeId = getVNodeId(vnode);
  
  // 1. prevVNode.children에서 같은 ID를 가진 VNode 찾기
  if (prevVNode?.children && vnodeId) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        return getVNodeId(c) === vnodeId;
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // 현재 parent의 자식인지 확인
      if (domEl.parentElement === parent) {
        return domEl;
      }
    }
  }
  
  // 2. parent.children에서 같은 ID를 가진 요소 찾기
  if (vnodeId) {
    const children = Array.from(parent.children);
    for (const child of children) {
      const childEl = child as HTMLElement;
      const childSid = childEl.getAttribute('data-bc-sid');
      const childDecoratorSid = childEl.getAttribute('data-decorator-sid');
      if (childSid === vnodeId || childDecoratorSid === vnodeId) {
        return childEl;
      }
    }
  }
  
  // 3. 인덱스 기반 매칭 (mark wrapper 등 sid가 없는 경우)
  if (childIndex < parent.children.length) {
    const candidate = parent.children[childIndex] as HTMLElement;
    if (candidate && candidate.tagName.toLowerCase() === (vnode.tag || '').toLowerCase()) {
      // 클래스 매칭 (mark wrapper)
      if (vnode.attrs?.class || vnode.attrs?.className) {
        const vnodeClasses = normalizeClasses(vnode.attrs.class || vnode.attrs.className);
        const candidateClasses = candidate.className ? candidate.className.split(/\s+/).filter(Boolean) : [];
        if (vnodeClasses.every(cls => candidateClasses.includes(cls))) {
          return candidate;
        }
      } else {
        return candidate;
      }
    }
  }
  
  return null;
}
```

#### 2.2 `fiber-reconciler.ts` 전역 검색 제거

**현재** (Line 283-319):
```typescript
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

**개선**:
```typescript
// 전역 검색 제거
// findHostInParentChildren으로 대체하거나, 바로 새로 생성
if (!host) {
  host = findHostInParentChildren(parent, vnode, prevVNode, fiber.index);
}
if (!host) {
  host = createHostElement(parent, vnode, fiber.index, deps);
}
```

#### 2.3 `host-finding.ts` 전역 검색 제거

**현재** (Line 126-148):
```typescript
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

**개선**:
- 전역 검색 제거
- `findHostInParentChildren` 사용 또는 바로 null 반환

#### 2.4 `host-management.ts` 전역 검색 제거

**현재** (Line 122-136):
```typescript
if (!existingHost && parent.ownerDocument) {
  const allMatches = parent.ownerDocument.querySelectorAll(...);
  // ...
}
```

**개선**:
- 전역 검색 제거
- `parent.children`에서만 검색

### Phase 3: `usedDomElements` 추적 제거

전역 검색을 제거하면 `usedDomElements` 추적도 불필요해짐.

**제거 대상**:
- `fiber-reconciler.ts` (Line 286-296)
- `host-finding.ts` (여러 곳)
- `host-management.ts` (여러 곳)

### Phase 4: 테스트 및 검증

1. 기존 테스트 통과 확인
2. 성능 측정 (전역 검색 제거 전후)
3. Edge case 테스트

## 개선 순서

### Step 1: `getVNodeId()` 통일
1. 모든 파일에서 `getVNodeId()` 사용 확인
2. `vnode.sid || vnode.decoratorSid` 직접 사용 제거

### Step 2: Domain 지식 제거 (fiber-reconciler.ts)
1. Line 140-151: `decoratorSid` 직접 참조 제거
2. Line 228-233: `decoratorSid` 비교 로직 제거
3. Line 300-315: `isDecoratorVNode` 체크 제거

### Step 3: Domain 지식 제거 (fiber-tree.ts)
1. Line 67-68: `getVNodeId()` 사용
2. Line 83-88: `decoratorSid` 조건문 제거
3. Line 107-113: `decoratorSid` 직접 참조 제거

### Step 4: Domain 지식 제거 (host-finding.ts)
1. Line 41-43: `isDecoratorVNode` 제거
2. Line 53-57: `decoratorSid` 비교 제거
3. Line 84-95: `decoratorSid` 조건문 제거
4. Line 138-144: `decoratorSid` 비교 제거

### Step 5: `findHostInParentChildren()` 구현
1. `host-finding.ts`에 새 함수 추가
2. React 스타일의 children 기준 매칭 구현

### Step 6: 전역 검색 제거
1. `fiber-reconciler.ts` 전역 검색 제거
2. `host-finding.ts` 전역 검색 제거
3. `host-management.ts` 전역 검색 제거

### Step 7: `usedDomElements` 제거
1. 모든 `usedDomElements` 파라미터 제거
2. 관련 추적 로직 제거

### Step 8: 테스트 및 검증
1. 모든 테스트 통과 확인
2. 성능 측정
3. 문서 업데이트

## 예상되는 문제점

### 1. Cross-parent Move

**현재**: 전역 검색으로 재사용

**개선 후**: 새로 생성

**해결책**: 
- React처럼 새로 생성하는 것이 맞음
- VNodeBuilder가 이미 올바른 구조를 만들었으므로, Fiber는 그대로 따라가면 됨

### 2. Mark Wrapper 재사용

**현재**: 전역 검색 + 복잡한 추적

**개선 후**: `findHostInParentChildren`에서 인덱스 + 태그 + 클래스로 매칭

**해결책**: 
- `findHostInParentChildren`의 Strategy 3에서 처리
- 더 단순하고 정확함

## 성공 기준

1. ✅ Domain 지식 완전 제거
   - `decoratorSid` 직접 참조 없음
   - `isDecoratorVNode` 체크 없음
   - Domain 개념 없이 VNode 구조만 확인

2. ✅ 전역 검색 완전 제거
   - `querySelectorAll` 사용 없음
   - Children 기준으로만 비교

3. ✅ 모든 테스트 통과
   - 기존 테스트 모두 통과
   - 성능 개선 확인

4. ✅ 코드 단순화
   - `usedDomElements` 추적 불필요
   - 복잡한 fallback 로직 제거

