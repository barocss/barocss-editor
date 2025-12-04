# Reconcile에서 sid 사용 분석

## 문제 제기

**질문:** `sid`는 에디터 모델을 위한 것인데, 왜 reconcile에서 계속 `sid` 개념을 사용하는가?

## 현재 구조 분석

### 1. `sid`의 역할

#### 에디터 모델에서의 `sid`
- **목적**: 에디터 모델의 고유 식별자
- **사용처**: 
  - 모델 데이터 구조에서 각 노드를 식별
  - DOM 요소에 `data-bc-sid` 속성으로 저장
  - 에디터에서 특정 노드를 찾을 때 사용

#### Reconcile에서의 `sid`
- **목적**: React의 `key` prop과 유사한 역할
- **사용처**:
  1. **prevVNode 저장/조회**: `prevVNodeTree: Map<string, VNode>`에서 `sid`를 키로 사용
  2. **DOM 요소 매칭**: `findHostForChildVNode`에서 `sid`로 이전 DOM 요소 찾기
  3. **VNode 매칭**: `findPrevChildVNode`에서 `sid`로 이전 VNode 찾기

### 2. 현재 구현의 문제점

#### 문제 1: `sid`가 없는 VNode는 추적 불가

```typescript
// packages/renderer-dom/src/reconcile/reconciler.ts
private prevVNodeTree: Map<string, VNode> = new Map()

// prevVNode 가져오기
const prevVNode = this.prevVNodeTree.get(String(sid));

// prevVNode 저장
if (sid) {
  this.prevVNodeTree.set(String(sid), cloned);
}
```

**문제:**
- `sid`가 없으면 `prevVNodeTree`에 저장/조회 불가
- mark wrapper처럼 `sid`가 없는 VNode는 이전 상태를 추적할 수 없음
- 결과: `prevVNode`가 `undefined`가 되어 재사용 불가

#### 문제 2: `sid` 기반 매칭만 사용

```typescript
// packages/renderer-dom/src/reconcile/fiber/fiber-reconciler.ts
// prevVNodeTree에 현재 VNode 스냅샷 저장 (sid 단위 추적)
if (deps.prevVNodeTree && vnode.sid) {
  deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
}
```

**문제:**
- `vnode.sid`가 없으면 저장되지 않음
- mark wrapper는 `sid`가 없으므로 저장되지 않음
- 다음 렌더링에서 `prevVNode`를 찾을 수 없음

#### 문제 3: `findHostForChildVNode`의 Strategy 1이 `sid`에 의존

```typescript
// packages/renderer-dom/src/reconcile/utils/host-finding.ts
const vnodeId = getVNodeId(childVNode); // sid || decoratorSid
if (vnodeId) {
  // Strategy 1: Key-based matching
  // ...
}
```

**문제:**
- `sid`와 `decoratorSid`가 모두 없으면 Strategy 1 실패
- mark wrapper는 둘 다 없으므로 Strategy 2, 3에만 의존
- Strategy 2는 `prevChildVNodes`가 필요하지만, `prevVNode`가 없으면 `prevChildVNodes`도 비어있음

### 3. 왜 `sid`를 사용하는가?

#### React의 `key` prop과의 유사성

React에서는:
```jsx
{items.map(item => <Item key={item.id} />)}
```

우리 시스템에서는:
```typescript
// VNode에 sid가 있으면 이를 key로 사용
const prevVNode = prevVNodeTree.get(sid);
```

**장점:**
- 같은 `sid`를 가진 VNode는 항상 같은 DOM 요소로 매칭
- 순서가 바뀌어도 올바르게 매칭
- 성능 최적화 (O(1) 조회)

**단점:**
- `sid`가 없는 VNode는 추적 불가
- mark wrapper처럼 동적으로 생성되는 VNode는 `sid`가 없음

### 4. 해결 방안

#### 방안 1: `sid`가 없는 VNode도 추적 가능하도록 개선

**현재:**
```typescript
// sid가 있을 때만 저장
if (deps.prevVNodeTree && vnode.sid) {
  deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
}
```

**개선:**
```typescript
// sid가 없어도 구조 기반으로 추적
if (deps.prevVNodeTree) {
  if (vnode.sid) {
    // sid가 있으면 sid로 저장
    deps.prevVNodeTree.set(String(vnode.sid), cloneVNodeTree(vnode));
  } else {
    // sid가 없으면 부모의 sid + 인덱스로 저장
    const parentSid = fiber.parentFiber?.vnode?.sid;
    if (parentSid) {
      const key = `${parentSid}:${fiber.index}`;
      deps.prevVNodeTree.set(key, cloneVNodeTree(vnode));
    }
  }
}
```

**문제점:**
- 부모의 `sid`도 없을 수 있음
- 인덱스가 바뀌면 매칭 실패

#### 방안 2: `prevVNode`를 Fiber 트리 구조로 저장

**현재:**
```typescript
// sid 단위로만 저장
prevVNodeTree: Map<string, VNode>
```

**개선:**
```typescript
// 전체 VNode 트리를 저장
prevVNodeTree: VNode | undefined

// 조회 시 재귀적으로 탐색
function findPrevVNode(vnode: VNode, prevVNodeTree: VNode | undefined): VNode | undefined {
  if (!prevVNodeTree) return undefined;
  
  // sid로 매칭
  if (vnode.sid && prevVNodeTree.sid === vnode.sid) {
    return prevVNodeTree;
  }
  
  // children에서 재귀적으로 찾기
  if (prevVNodeTree.children) {
    for (const prevChild of prevVNodeTree.children) {
      if (typeof prevChild === 'object') {
        const found = findPrevVNode(vnode, prevChild);
        if (found) return found;
      }
    }
  }
  
  return undefined;
}
```

**장점:**
- `sid`가 없어도 구조 기반으로 찾을 수 있음
- 전체 트리 구조를 유지

**단점:**
- 성능 저하 (재귀 탐색)
- 복잡도 증가

#### 방안 3: `prevVNode`를 `fiber.prevVNode`에서 직접 가져오기 (현재 방식 개선)

**현재:**
```typescript
// reconcileFiberNode에서
const prevVNode = fiber.prevVNode; // createFiberTree에서 설정됨
const prevChildVNodes: (VNode | string | number)[] = prevVNode?.children || [];
```

**문제:**
- `fiber.prevVNode`가 `undefined`이면 `prevChildVNodes`가 비어있음
- `createFiberTree`에서 `prevChildVNode`를 찾지 못하면 `prevVNode`가 `undefined`

**개선:**
- `createFiberTree`에서 `prevChildVNode` 찾기 로직 개선 (이미 완료)
- `findHostForChildVNode`의 Strategy 3 개선 (이미 완료)

#### 방안 4: `sid`를 reconcile 전용으로 분리

**개념:**
- `sid`: 에디터 모델 식별자 (변경 불가)
- `reconcileKey`: reconcile 전용 식별자 (동적 생성 가능)

**구현:**
```typescript
interface VNode {
  sid?: string; // 에디터 모델 식별자
  reconcileKey?: string; // reconcile 전용 식별자
}

// reconcileKey 생성
function generateReconcileKey(vnode: VNode, parentKey?: string, index?: number): string {
  if (vnode.sid) return vnode.sid;
  if (vnode.decoratorSid) return `decorator:${vnode.decoratorSid}`;
  if (parentKey && index !== undefined) return `${parentKey}:${index}`;
  return `anonymous:${vnode.tag}:${index}`;
}
```

**장점:**
- `sid`와 reconcile 식별자를 분리
- 모든 VNode에 reconcile 식별자 부여 가능

**단점:**
- 구조 변경 필요
- 복잡도 증가

## 권장 해결 방안

### 단기 해결책 (현재 진행 중)

1. **`createFiberTree`에서 `prevChildVNode` 찾기 개선** ✅
   - 태그와 클래스로 매칭 시도
   - 인덱스 매칭 실패 시에도 찾을 수 있도록

2. **`findChildHost`에서 모든 자식 요소 순회** ✅
   - `childIndex` 위치에서 찾지 못하면 전체 순회
   - 클래스 매칭으로 mark wrapper 찾기

3. **`handlePrimitiveTextChild`에서 기존 텍스트 노드 재사용** ✅
   - `childIndex` 위치에 없으면 모든 텍스트 노드 확인

### 장기 해결책

1. **`prevVNodeTree` 구조 개선**
   - `sid`가 없는 VNode도 추적 가능하도록
   - 부모-자식 관계를 유지한 트리 구조로 저장

2. **`reconcileKey` 개념 도입**
   - `sid`와 분리된 reconcile 전용 식별자
   - 모든 VNode에 부여 가능

## 결론

**현재 문제:**
- `sid`는 에디터 모델 식별자이지만, reconcile에서도 `key`처럼 사용
- `sid`가 없는 VNode (mark wrapper 등)는 추적 불가
- `prevVNodeTree`가 `sid` 기반이므로 `sid`가 없으면 저장/조회 불가

**해결 방향:**
1. 단기: `sid`가 없어도 구조 기반으로 매칭 (진행 중)
2. 장기: `sid`와 reconcile 식별자를 분리하거나, 전체 트리 구조로 `prevVNode` 저장

**핵심 인사이트:**
- `sid`는 에디터 모델의 식별자이지만, reconcile에서는 React의 `key`처럼 사용됨
- `sid`가 없는 VNode는 다른 방식으로 추적해야 함
- 현재는 구조 기반 매칭 (태그, 클래스, 인덱스)으로 보완 중

## 실제 문제 발견

로그 분석 결과:
- `prevVNode 저장` 시점: `rootVNodeChildren`에 mark wrapper가 포함됨 ✅
- `clonedChildren`에도 mark wrapper가 포함됨 ✅
- 하지만 `createFiberTree`에서: `prevVNodeExists: false` ❌

**핵심 문제:**
- `createFiberTree`가 mark wrapper Fiber를 생성할 때, 부모 VNode (`text-1`)의 `prevVNode`를 사용해야 함
- 하지만 `prevVNode`가 `undefined`로 전달됨
- 이는 `reconcileWithFiber`에 전달되는 `prevVNode`가 `undefined`이거나, `createFiberTree`에서 `prevVNode.children`을 올바르게 사용하지 못하는 것

**확인 필요:**
1. `reconciler.reconcile`에서 `prevVNode`를 올바르게 가져오는가?
2. `reconcileWithFiber`에 `prevVNode`가 올바르게 전달되는가?
3. `createFiberTree`에서 `prevVNode.children`에 mark wrapper가 있는가?
