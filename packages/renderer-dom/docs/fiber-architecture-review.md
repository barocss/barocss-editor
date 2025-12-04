# Fiber 아키텍처 재검토

## React의 Reconciliation 구조

### React의 핵심 원칙

React는 **순수한 reconciliation 로직**만 담당하며, domain 지식을 가지지 않습니다:

1. **Key 기반 매칭 (Primary Strategy)**
   ```javascript
   // React는 key prop을 사용하여 요소를 식별
   <div key="item-1">Item 1</div>
   <div key="item-2">Item 2</div>
   
   // Reconciliation 시:
   // 1. 같은 key를 가진 요소를 찾아서 재사용
   // 2. key가 없거나 다르면 새로 생성
   ```

2. **Type + Index 기반 Fallback (Secondary Strategy)**
   ```javascript
   // key가 없는 경우, 같은 타입(태그)과 인덱스로 매칭
   // <div> → <div> (같은 인덱스) → 재사용
   // <div> → <span> (다른 타입) → 새로 생성
   ```

3. **Children 기준으로만 비교**
   ```javascript
   // React는 전역 검색을 하지 않음
   // 현재 부모의 children만 확인
   function reconcileChildren(parent, newChildren, prevChildren) {
     // parent.children 배열에서만 검색
     // 전역 querySelector 없음
   }
   ```

4. **Cross-parent Move 처리**
   ```javascript
   // React는 요소가 다른 부모로 이동하면:
   // 1. 이전 위치에서 제거 (unmount)
   // 2. 새 위치에서 생성 (mount)
   // 전역 검색으로 재사용하지 않음
   ```

### React의 Reconciliation 알고리즘

```javascript
// React의 reconciliation (의사 코드)
function reconcileChild(parent, newChild, prevChild, index) {
  // 1. Key 매칭 (가장 우선)
  if (newChild.key && prevChild?.key === newChild.key) {
    // 같은 key → 재사용
    return updateElement(prevChild.domElement, newChild);
  }
  
  // 2. Type + Index 매칭 (key가 없는 경우)
  if (!newChild.key && prevChild && 
      prevChild.type === newChild.type && 
      prevChild.index === index) {
    // 같은 타입 + 같은 인덱스 → 재사용
    return updateElement(prevChild.domElement, newChild);
  }
  
  // 3. 매칭 실패 → 새로 생성
  return createElement(newChild);
}
```

### React의 Domain 지식 분리

React는 **어떤 domain 개념도 모릅니다**:

```javascript
// React는 이런 것들을 모름:
// - "이것은 decorator다"
// - "이것은 mark wrapper다"
// - "이것은 특별한 컴포넌트다"

// React는 오직 다음만 확인:
// - key: 요소 식별자
// - type: 컴포넌트 타입 (함수, 클래스, 태그명)
// - props: 속성
// - children: 자식 요소들
```

### React의 전역 검색 부재

React는 **전역 검색을 하지 않습니다**:

```javascript
// React는 이런 것을 하지 않음:
// ❌ document.querySelectorAll('[key="item-1"]')
// ❌ parent.ownerDocument.querySelectorAll(...)

// React는 오직 다음만 확인:
// ✅ parent.children[index]
// ✅ prevChildren 배열에서 key로 찾기
```

## 우리 프로젝트와 React 비교

### 유사점

| 항목 | React | 우리 프로젝트 |
|------|------|--------------|
| Fiber 기반 아키텍처 | ✅ | ✅ |
| 우선순위 기반 스케줄링 | ✅ | ✅ |
| 비동기 렌더링 | ✅ | ✅ |
| Key 기반 매칭 | ✅ | ✅ (sid/decoratorSid) |

### 차이점

| 항목 | React | 우리 프로젝트 (현재) | 우리 프로젝트 (목표) |
|------|------|---------------------|-------------------|
| Domain 지식 | ❌ 없음 | ⚠️ 있음 (decoratorSid 직접 사용) | ❌ 없음 |
| 전역 검색 | ❌ 없음 | ⚠️ 있음 (querySelectorAll) | ❌ 없음 |
| Cross-parent Move | 새로 생성 | 전역 검색으로 재사용 | 새로 생성 |
| Children 기준 비교 | ✅ | ⚠️ 부분적 | ✅ |

## 문제점 분석

### 1. Domain 지식 누수 (Domain Knowledge Leakage)

#### 현재 문제

Fiber reconciler가 `mark`와 `decorator`라는 domain 개념을 직접 알고 있음:

```typescript
// fiber-reconciler.ts
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // decoratorSid가 다르면 재사용하지 않음
}

// fiber-tree.ts
if (!prevChildVNode && prevVNode?.children && childVNode.tag && !childVNode.decoratorSid) {
  // decorator VNode는 제외
}
```

#### 문제점

1. **책임 분리 위반**
   - Fiber는 VNodeBuilder가 만든 결과물을 그대로 reconcile만 해야 함
   - `decoratorSid`, `decoratorStype` 같은 domain 개념을 알면 안 됨
   - VNodeBuilder가 이미 올바른 VNode 구조를 만들었으므로, Fiber는 그 구조를 그대로 따라가면 됨

2. **유지보수성 저하**
   - Domain 로직이 변경되면 Fiber도 함께 수정해야 함
   - Fiber는 순수한 reconciliation 로직이어야 함

3. **테스트 복잡도 증가**
   - Domain 개념을 테스트해야 함
   - Fiber 자체의 로직 테스트가 어려워짐

#### 올바른 접근

Fiber는 VNode의 구조적 속성만 확인해야 함:
- `sid`: VNode 식별자 (어떤 domain인지 몰라도 됨)
- `tag`: DOM 태그명
- `attrs`: 속성
- `children`: 자식 VNode들

`decoratorSid`는 VNodeBuilder가 이미 올바르게 설정했으므로, Fiber는 그냥 `sid`처럼 사용하면 됨.

### 2. 전역 검색 문제 (Global Search Problem)

#### 현재 문제

```typescript
// fiber-reconciler.ts (line 301)
const allMatches = parent.ownerDocument?.querySelectorAll(
  `[data-bc-sid="${vnodeId}"], [data-decorator-sid="${vnodeId}"]`
) || [];

// host-finding.ts (line 130)
const allMatches = parent.ownerDocument?.querySelectorAll(
  `[data-bc-sid="${vnodeId}"], [data-decorator-sid="${vnodeId}"]`
) || [];
```

#### 문제점

1. **성능 문제**
   - 전체 문서를 검색하는 것은 비용이 큼
   - DOM 트리가 클수록 느려짐

2. **의도하지 않은 재사용**
   - 다른 부모 아래에 있는 요소를 재사용할 수 있음
   - 같은 `sid`를 가진 요소가 다른 위치에 있으면 잘못 매칭될 수 있음

3. **복잡도 증가**
   - `usedDomElements`로 이미 사용된 요소를 추적해야 함
   - 전역 검색이 실패했을 때의 fallback 로직이 복잡해짐

#### 올바른 접근

**Children 기준으로만 비교하고, 없으면 새로 만들기**

1. **현재 부모의 children만 확인**
   - `parent.children` 배열에서만 검색
   - `prevVNode.children`과 `vnode.children`을 비교

2. **매칭 실패 시 새로 생성**
   - 전역 검색 없이 바로 새 요소 생성
   - sid의 위치가 바뀌었으면 새로 만드는 것이 맞음

3. **단순한 로직**
   - 복잡한 `usedDomElements` 추적 불필요
   - 전역 검색 fallback 불필요

## 개선 방향

### 1. Domain 지식 제거

#### Before

```typescript
// decoratorSid를 직접 확인
if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
  // 재사용하지 않음
}
```

#### After

```typescript
// VNode의 식별자만 확인 (어떤 domain인지 몰라도 됨)
const vnodeId = vnode.sid || vnode.decoratorSid; // decoratorSid도 그냥 sid처럼 사용
const prevVNodeId = prevVNode?.sid || prevVNode?.decoratorSid;

if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // ID가 다르면 재사용하지 않음
}
```

또는 더 나은 방법:

```typescript
// VNode의 고유 식별자 추출 함수
function getVNodeId(vnode: VNode): string | undefined {
  return vnode.sid || vnode.decoratorSid; // domain 개념 없이 그냥 ID
}

// 사용
const vnodeId = getVNodeId(vnode);
const prevVNodeId = getVNodeId(prevVNode);
if (vnodeId && prevVNodeId && vnodeId !== prevVNodeId) {
  // ID가 다르면 재사용하지 않음
}
```

### 2. 전역 검색 제거

#### Before

```typescript
// 1. prevVNode.meta.domElement 확인
if (prevVNode?.meta?.domElement) {
  host = prevVNode.meta.domElement;
}

// 2. findHostForChildVNode로 찾기 (전역 검색 포함)
if (!host) {
  host = findHostForChildVNode(...);
}

// 3. 전역 검색 fallback
if (!host) {
  const allMatches = parent.ownerDocument?.querySelectorAll(...);
  // ...
}
```

#### After

```typescript
// 1. prevVNode.meta.domElement 확인 (가장 우선)
if (prevVNode?.meta?.domElement instanceof HTMLElement) {
  host = prevVNode.meta.domElement;
}

// 2. 현재 부모의 children에서만 찾기 (전역 검색 없음)
if (!host) {
  host = findHostInParentChildren(parent, vnode, prevVNode, childIndex);
}

// 3. 찾지 못하면 새로 생성 (전역 검색 없음)
if (!host) {
  host = createHostElement(parent, vnode, childIndex, ...);
}
```

#### findHostInParentChildren 구현

```typescript
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
        const prevId = getVNodeId(c);
        return prevId === vnodeId;
      }
    );
    
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      // prevChildVNode의 domElement가 현재 parent의 자식인지 확인
      const domEl = prevChildVNode.meta.domElement;
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

## 개선 효과

### 1. 단순성 (Simplicity)

- Domain 지식 제거로 Fiber 로직이 단순해짐
- 전역 검색 제거로 복잡한 추적 로직 불필요

### 2. 성능 (Performance)

- 전역 검색 제거로 DOM 쿼리 비용 감소
- Children만 확인하므로 빠름

### 3. 정확성 (Correctness)

- 의도하지 않은 재사용 방지
- Children 기준으로만 비교하므로 더 정확

### 4. 유지보수성 (Maintainability)

- Domain 로직 변경이 Fiber에 영향 없음
- Fiber는 순수한 reconciliation 로직만 담당

## 마이그레이션 계획

### Phase 1: Domain 지식 제거

1. `decoratorSid` 직접 참조 제거
2. `getVNodeId()` 함수로 통일
3. Domain 개념 없이 VNode 구조만 확인

### Phase 2: 전역 검색 제거

1. `querySelectorAll` 제거
2. `findHostInParentChildren` 구현
3. Children 기준으로만 비교

### Phase 3: 테스트 및 검증

1. 기존 테스트 통과 확인
2. 성능 측정
3. Edge case 테스트

## 예상되는 문제점

### 1. Cross-parent Move

**문제**: sid가 다른 부모로 이동한 경우

**현재**: 전역 검색으로 찾아서 재사용

**개선 후**: 새로 생성

**해결책**: 
- Cross-parent move는 드문 경우
- 새로 만드는 것이 더 안전하고 단순
- VNodeBuilder가 이미 올바른 구조를 만들었으므로, Fiber는 그대로 따라가면 됨

### 2. Mark Wrapper 재사용

**문제**: sid가 없는 mark wrapper 재사용

**해결책**: 
- 인덱스 + 태그 + 클래스로 매칭
- `findHostInParentChildren`에서 처리

## React와의 정렬 (Alignment with React)

### React의 원칙을 따르면

1. **Domain 지식 제거**
   - React처럼 순수한 reconciliation만 수행
   - `decoratorSid`를 `sid`처럼 일반적인 식별자로 취급

2. **전역 검색 제거**
   - React처럼 children 기준으로만 비교
   - Cross-parent move는 새로 생성

3. **단순한 매칭 전략**
   - Key (sid/decoratorSid) 기반 매칭
   - Type + Index 기반 fallback
   - 복잡한 추적 로직 불필요

### React 스타일의 개선된 코드

```typescript
// React 스타일의 reconciliation
function reconcileFiberNode(fiber: FiberNode, deps: FiberReconcileDependencies) {
  const vnode = fiber.vnode;
  const prevVNode = fiber.prevVNode;
  const parent = fiber.parent;
  
  // 1. Key 기반 매칭 (React의 key prop)
  const vnodeId = getVNodeId(vnode); // sid || decoratorSid (domain 개념 없음)
  const prevVNodeId = getVNodeId(prevVNode);
  
  let host: HTMLElement | null = null;
  
  // 1-1. prevVNode.meta.domElement 확인 (가장 우선)
  if (prevVNode?.meta?.domElement instanceof HTMLElement) {
    if (vnodeId && prevVNodeId && vnodeId === prevVNodeId) {
      host = prevVNode.meta.domElement;
    }
  }
  
  // 1-2. prevVNode.children에서 같은 key 찾기
  if (!host && prevVNode?.children && vnodeId) {
    const prevChildVNode = prevVNode.children.find(
      (c): c is VNode => {
        if (typeof c !== 'object' || c === null) return false;
        return getVNodeId(c) === vnodeId;
      }
    );
    if (prevChildVNode?.meta?.domElement instanceof HTMLElement) {
      const domEl = prevChildVNode.meta.domElement;
      // 현재 parent의 자식인지 확인 (전역 검색 없음)
      if (domEl.parentElement === parent) {
        host = domEl;
      }
    }
  }
  
  // 2. Type + Index 기반 Fallback (React 스타일)
  if (!host && prevVNode?.children) {
    const prevChild = prevVNode.children[fiber.index];
    if (prevChild && typeof prevChild === 'object') {
      const prevChildVNode = prevChild as VNode;
      // 같은 타입(태그) + 같은 인덱스
      if (prevChildVNode.tag === vnode.tag) {
        if (prevChildVNode.meta?.domElement instanceof HTMLElement) {
          const domEl = prevChildVNode.meta.domElement;
          if (domEl.parentElement === parent) {
            host = domEl;
          }
        }
      }
    }
  }
  
  // 3. 매칭 실패 → 새로 생성 (React 스타일)
  if (!host) {
    host = createHostElement(parent, vnode, fiber.index, deps);
  }
  
  // 4. DOM 업데이트
  updateHostElement(host, vnode, deps);
  
  // 5. meta.domElement 저장 (다음 reconciliation을 위해)
  vnode.meta = vnode.meta || {};
  vnode.meta.domElement = host;
}
```

## 결론

Fiber는 **React처럼 순수한 reconciliation 로직**이어야 하며:

1. **Domain 지식 제거** (React처럼)
   - `decoratorSid`를 일반적인 식별자로 취급
   - Domain 개념(mark, decorator)을 알면 안 됨

2. **전역 검색 제거** (React처럼)
   - Children 기준으로만 비교
   - Cross-parent move는 새로 생성

3. **단순한 매칭 전략** (React처럼)
   - Key (sid/decoratorSid) 기반 매칭
   - Type + Index 기반 fallback
   - 복잡한 추적 로직 불필요

이렇게 하면 React와 유사한 수준의 **단순하고, 빠르고, 정확한 reconciliation**이 가능합니다.

