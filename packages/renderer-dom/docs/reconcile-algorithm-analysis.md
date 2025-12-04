# Reconcile 알고리즘 구조 분석

## 현재 매칭 우선순위

### 1. `createFiberTree`에서 자식 노드 매칭

```typescript
// 1순위: sid로 매칭 (getVNodeId)
if (childId && prevVNode?.children) {
  prevChildVNode = prevVNode.children.find(
    (c): c is VNode => {
      const prevId = getVNodeId(c);
      return prevId === childId;
    }
  );
}

// 2순위: 인덱스로 매칭 (같은 인덱스의 prevChildVNode)
if (!prevChildVNode) {
  const candidate = prevVNode?.children?.[i];
  if (candidate && candidate.tag === childVNode.tag) {
    prevChildVNode = candidate;
  }
}

// 3순위: tag로 매칭 (ID가 없는 경우, 같은 tag 찾기)
if (!prevChildVNode && prevVNode?.children && childVNode.tag) {
  for (let j = i; j < prevVNode.children.length; j++) {
    const candidate = prevVNode.children[j];
    if (candidate.tag === childVNode.tag && !getVNodeId(candidate)) {
      prevChildVNode = candidate;
      break;
    }
  }
}
```

### 2. `reconcile`에서 prevVNode 가져오기

```typescript
// sid로만 찾음
let prevVNode = this.prevVNodeTree.get(String(sid));
```

## 문제점

1. **`reconcile`에서 `prevVNode`를 `sid`로만 찾음**
   - `prevVNodeTree`는 `sid → prevVNode` 맵
   - 하지만 `text-bold-italic` 노드의 경우, 이 노드 자체의 `prevVNode`는 저장되어 있어야 함
   - 로그에서 `hasPrevVNode: false`가 나오는 것은 `createFiberTree`에서 `prevVNode`가 `undefined`라는 의미

2. **`rootVNode` 변경 시 `prevVNode`도 변경**
   ```typescript
   if (prevVNode) {
     const prevFirstEl = findFirstElementVNode(prevVNode);
     if (prevFirstEl) {
       prevVNode = { ...(prevFirstEl as any) } as VNode;
     }
   }
   ```
   - 이때 `prevVNode.children`이 제대로 전달되지 않을 수 있음

3. **매칭 우선순위가 일관되지 않음**
   - `createFiberTree`에서는: sid > index > tag
   - 하지만 `reconcile`에서는: sid만 사용

## 해결 방안

1. **`prevVNode` 저장 시점 확인**
   - `reconcile` 완료 후 `prevVNodeTree.set(String(sid), cloned)`로 저장
   - 하지만 `text-bold-italic` 노드의 경우, 이 노드가 렌더링될 때 `prevVNode`가 저장되어야 함

2. **`prevVNode` 전달 경로 확인**
   - `reconcile` → `reconcileWithFiber` → `createFiberTree`
   - `prevVNode`가 제대로 전달되는지 확인 필요

3. **매칭 로직 개선**
   - `createFiberTree`에서 `prevVNode`가 없을 때도 자식 노드 매칭 시도
   - 또는 `prevVNodeTree`에서 자식 노드의 `prevVNode`를 찾는 로직 추가

