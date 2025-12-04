# Key 기반 Children Reconcile 알고리즘 분석

## 현재 구현 개요

현재 `@barocss/reconcile` 패키지의 `ChildrenReconciler`는 다음과 같은 알고리즘을 사용합니다:

### 1. Build Phase: Children 매칭 및 WIP 생성

#### 1.1 Key 기반 매칭 (Keyed Children)

```typescript
// ChildrenReconciler.reconcileChildren() (line 49-55)
if (nextChild.key) {
  // Keyed match: find by key
  const idx = prevChildren.findIndex(pc => 
    pc && 
    pc.key === nextChild.key && 
    !matchedPrevIndices.has(prevChildren.indexOf(pc))
  );
  if (idx >= 0) {
    prevMatch = prevChildren[idx];
    prevMatchIndex = idx;
  }
}
```

**동작 방식:**
- `nextChildren`를 순회하며 각 `nextChild`의 `key`로 `prevChildren`에서 매칭을 찾습니다
- 매칭된 `prevChild`는 `matchedPrevIndices`에 추가되어 중복 매칭을 방지합니다
- 매칭 성공 시 `prevMatch`를 설정하고, WIP를 생성합니다

**특징:**
- 단순한 `findIndex()` 기반 검색
- 순서와 무관하게 key만으로 매칭
- O(n*m) 시간 복잡도 (n: nextChildren.length, m: prevChildren.length)

#### 1.2 WIP 생성 및 Index 설정

```typescript
// line 237-240
const childWIP = options.createWIP(nextChild as VNode, parentWip, prevMatch);
childWIP.desiredIndex = i;  // nextChildren에서의 index
childWIP.orderIndex = i;    // 같은 값
childWIP.parent = parentWip;
```

**문제점:**
- `desiredIndex`와 `orderIndex`가 같은 값(`i`)으로 설정됨
- 실제 DOM에서의 위치와 관계없이 `nextChildren`의 순서만 기록됨
- key 기반 매칭으로 다른 순서의 노드와 매칭되어도 `desiredIndex`는 새 순서를 따름

### 2. Execute Phase: 순서 정렬 및 Finalize

#### 2.1 Children 정렬

```typescript
// WorkInProgressManager.executeUpdates() (line 346-349)
for (const [parent, children] of byParent.entries()) {
  const ordered = children
    .filter(c => !c.toDelete)
    .sort((a, b) => 
      (a.desiredIndex ?? a.orderIndex ?? 0) - 
      (b.desiredIndex ?? b.orderIndex ?? 0)
    );
  
  for (const child of ordered) {
    if (child.targetNode !== undefined) {
      finalize(child, context);
    }
  }
}
```

**동작 방식:**
- 각 parent의 children을 `desiredIndex` (또는 `orderIndex`)로 정렬
- 정렬된 순서대로 `finalize()` 호출

**문제점:**
- 정렬은 하지만, 실제 DOM에서의 현재 위치와 비교하지 않음
- 이미 DOM에 있는 노드의 실제 위치를 고려하지 않음

### 3. Finalize Phase: DOM 업데이트

#### 3.1 Previous Sibling 찾기

```typescript
// dom-operations.ts finalizeDOMUpdate() (line 744-812)
let prevSiblingDom: Node | null | undefined;
if (!prevSiblingDom && wip.parent && 'children' in wip.parent) {
  const parentChildren = (wip.parent as any).children as any[];
  const currentIndex = wip.desiredIndex ?? wip.orderIndex ?? -1;
  
  // Sort siblings by desiredIndex/orderIndex
  const sortedSiblings = parentChildren
    .filter((s: any) => s.domNode && !(s as any)?.toDelete)
    .sort((a: any, b: any) => {
      const aIndex = a.desiredIndex ?? a.orderIndex ?? -1;
      const bIndex = b.desiredIndex ?? b.orderIndex ?? -1;
      return aIndex - bIndex;
    });
  
  // Find the sibling that should be before current node
  let lastPrevSibling: any = null;
  for (let i = 0; i < sortedSiblings.length; i++) {
    const sibling = sortedSiblings[i];
    const siblingIndex = sibling.desiredIndex ?? sibling.orderIndex ?? -1;
    if (siblingIndex < currentIndex) {
      lastPrevSibling = sibling;
    } else {
      break;
    }
  }
  
  if (lastPrevSibling?.domNode) {
    prevSiblingDom = lastPrevSibling.domNode as Node;
  }
}
```

**동작 방식:**
- `wip.parent.children`에서 이미 finalize된 siblings를 찾음
- `desiredIndex`/`orderIndex`로 정렬하여 `currentIndex`보다 작은 마지막 sibling을 찾음
- 그 sibling의 `domNode.nextSibling`을 `ref`로 사용

**문제점:**
- 이미 finalize된 siblings의 순서를 보장하지 않음
- `sortedSiblings`는 WIP 객체를 정렬하지만, 실제 DOM 순서와 다를 수 있음
- `prevSiblingDom`을 찾는 시점에 이미 다른 siblings가 DOM에 삽입/이동되었을 수 있음

#### 3.2 DOM 삽입/재배치

```typescript
// dom-operations.ts finalizeDOMUpdate() (line 871-928)
const ref = prevSiblingDom ? (prevSiblingDom.nextSibling) : parent.firstChild;

if (ref) {
  if (wip.domNode === ref) {
    // Skip if ref is self
  } else if (wip.domNode.parentNode !== parent) {
    // Insert if not in parent
    parent.insertBefore(wip.domNode, ref);
  } else if (wip.domNode.parentNode === parent) {
    // Reorder if in wrong position
    const currentNextSibling = wip.domNode.nextSibling;
    if (currentNextSibling !== ref) {
      parent.insertBefore(wip.domNode, ref);
    }
  }
}
```

**동작 방식:**
- `prevSiblingDom.nextSibling`을 `ref`로 사용
- `wip.domNode`가 `parent`에 없으면 삽입, 있으면 재배치

**문제점:**
- `ref` 계산이 이미 변경된 DOM 상태를 참조할 수 있음
- `insertBefore(wip.domNode, ref)`가 실행될 때 `ref`가 이미 이동했을 수 있음
- DOM 상태와 WIP 상태의 불일치

## 핵심 문제점

### 1. 순차적 Finalize의 한계

현재 알고리즘은:
1. Build Phase에서 모든 WIP 생성 (순서 무관)
2. Execute Phase에서 `desiredIndex`로 정렬
3. 정렬된 순서대로 순차적으로 `finalize()` 호출

**문제:**
- A → B → C 순서로 finalize할 때:
  - A를 finalize하면 DOM에 A가 추가됨
  - B를 finalize할 때 `prevSiblingDom`은 A를 찾지만, A가 이미 DOM에 있으므로 정상 동작
  - C를 finalize할 때도 마찬가지로 동작

**하지만 순서 변경 시:**
- 원래: Item1(0), Item2(1), Item3(2)
- 변경: Item3(0), Item2(1), Item1(2)
- Item3(desiredIndex: 0)을 finalize → DOM에 Item3 추가
- Item2(desiredIndex: 1)를 finalize → `prevSiblingDom`을 찾을 때, 이미 finalize된 siblings 중 `desiredIndex < 1`인 것은 Item3만 있음
- 하지만 Item3의 `domNode`가 이미 DOM에 있고, `prevSiblingDom.nextSibling`이 올바른 위치가 아닐 수 있음

### 2. Key 기반 매칭과 순서 보장의 불일치

**현재 로직:**
- Key로 매칭 → 순서와 무관하게 매칭
- `desiredIndex`는 `nextChildren`의 순서 (새로운 순서)
- `prevMatch`는 `prevChildren`의 순서 (기존 순서)

**문제:**
- 매칭된 `prevMatch`의 DOM 노드는 기존 위치에 있음
- 하지만 `desiredIndex`는 새 순서를 따름
- DOM 재배치 시점에 기존 위치에서 새 위치로 이동해야 함

### 3. PrevSiblingDom 계산의 신뢰성 문제

**현재 로직:**
```typescript
const sortedSiblings = parentChildren
  .filter((s: any) => s.domNode && !(s as any)?.toDelete)
  .sort((a: any, b: any) => {
    const aIndex = a.desiredIndex ?? a.orderIndex ?? -1;
    const bIndex = b.desiredIndex ?? b.orderIndex ?? -1;
    return aIndex - bIndex;
  });
```

**문제:**
- `parentChildren`은 WIP 객체 배열 (아직 finalize 중인 상태)
- `sortedSiblings`는 `desiredIndex`로 정렬하지만, 실제 DOM 순서와 다를 수 있음
- `lastPrevSibling.domNode`가 이미 DOM에 있지만, 그 위치가 올바른지 보장하지 않음

## 개선 방향

### 방안 1: 실제 DOM 순서 기반 Insert Position 계산

현재 WIP 기반 정렬 대신, 실제 DOM에서의 위치를 계산:

```typescript
// 의사코드
function findInsertPosition(wip, parent) {
  const desiredIndex = wip.desiredIndex;
  
  // 실제 DOM에서 desiredIndex 위치를 찾기
  const parentDom = parent.domNode;
  const children = Array.from(parentDom.children);
  
  // desiredIndex보다 작은 desiredIndex를 가진 siblings 중
  // 실제 DOM에서 가장 뒤에 있는 것을 찾기
  let ref = null;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    // child에 해당하는 WIP 찾기
    const childWip = findWipByDomNode(child);
    if (childWip && childWip.desiredIndex < desiredIndex) {
      // 이 child 다음에 삽입
      ref = child.nextSibling;
    } else if (childWip && childWip.desiredIndex >= desiredIndex) {
      // 이 child 앞에 삽입해야 함
      ref = child;
      break;
    }
  }
  
  return ref || parentDom.firstChild;
}
```

### 방안 2: Diff 기반 순서 변경 감지 및 최적화

React의 diff 알고리즘처럼, 실제 이동이 필요한 노드만 재배치:

```typescript
// 의사코드
function calculateMoves(prevChildren, nextChildren) {
  // Key → prevIndex 매핑
  const keyToPrevIndex = new Map();
  prevChildren.forEach((child, i) => {
    if (child.key) {
      keyToPrevIndex.set(child.key, i);
    }
  });
  
  // nextChildren 순서에서 실제 이동이 필요한 노드 찾기
  const moves = [];
  let lastIndex = 0;
  
  for (let i = 0; i < nextChildren.length; i++) {
    const nextChild = nextChildren[i];
    if (!nextChild.key) continue;
    
    const prevIndex = keyToPrevIndex.get(nextChild.key);
    if (prevIndex === undefined) {
      // 새 노드
      continue;
    }
    
    if (prevIndex < lastIndex) {
      // 이동 필요 (왼쪽으로 이동)
      moves.push({
        key: nextChild.key,
        from: prevIndex,
        to: i
      });
    }
    
    lastIndex = Math.max(lastIndex, prevIndex);
  }
  
  return moves;
}
```

### 방안 3: Batch 재배치

모든 children을 한 번에 재배치:

```typescript
// 의사코드
function finalizeChildrenInOrder(parent, children) {
  // 1. 모든 children을 desiredIndex로 정렬
  const ordered = children
    .filter(c => !c.toDelete)
    .sort((a, b) => (a.desiredIndex ?? 0) - (b.desiredIndex ?? 0));
  
  // 2. 실제 DOM 순서와 비교
  const parentDom = parent.domNode;
  const domChildren = Array.from(parentDom.children);
  
  // 3. 순서가 다르면 한 번에 재배치
  const needsReorder = ordered.some((wip, i) => {
    const domChild = domChildren[i];
    return domChild !== wip.domNode;
  });
  
  if (needsReorder) {
    // DocumentFragment에 순서대로 추가
    const fragment = document.createDocumentFragment();
    for (const wip of ordered) {
      if (wip.domNode && wip.domNode.parentNode === parentDom) {
        fragment.appendChild(wip.domNode);
      }
    }
    parentDom.appendChild(fragment);
  }
}
```

## 결론

현재 알고리즘의 핵심 문제는:
1. **순차적 finalize**와 **DOM 상태 변화**의 불일치
2. **WIP 기반 정렬**과 **실제 DOM 순서**의 불일치
3. **Key 기반 매칭**과 **순서 보장**의 분리

개선을 위해서는:
- 실제 DOM 순서를 참조하여 insert position 계산
- 또는 모든 children을 한 번에 재배치하는 batch 방식 고려
- 또는 React의 diff 알고리즘처럼 실제 이동이 필요한 경우만 재배치

다음 단계로 **방안 1 (실제 DOM 순서 기반)**을 구현해보는 것을 제안합니다.

