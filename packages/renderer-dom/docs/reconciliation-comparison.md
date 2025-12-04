# React Reconciliation vs Current Implementation

## 시나리오: 텍스트와 요소가 섞인 children

### 실제 VNode 구조
```
<span class="text" data-bc-sid="text-1">
  children: [
    { tag: 'span', children: [{ tag: '#text', text: 'This' }] },      // index 0
    { tag: 'span', className: 'highlight-decorator', ... },          // index 1 (decorator)
    { tag: 'span', children: [{ tag: '#text', text: 'hted' }] },      // index 2
    { tag: 'span', className: 'comment-decorator', ... },             // index 3 (decorator)
    { tag: 'span', children: [{ tag: '#text', text: 'ted text' }] } // index 4
  ]
</span>
```

**중요**: 모든 children이 VNode입니다. span과 text가 형제가 아니라, span의 children으로 들어가 있습니다.

## React 방식

### 1. Fiber Tree 생성
```
RootFiber
  └─ child: Fiber0 (span with text "This", index=0)
      └─ sibling: Fiber1 (span highlight-decorator, index=1)
          └─ sibling: Fiber2 (span with text "hted", index=2)
              └─ sibling: Fiber3 (span comment-decorator, index=3)
                  └─ sibling: Fiber4 (span with text "ted text", index=4)
```

**중요**: React는 모든 VNode를 Fiber로 변환합니다. 모든 children이 VNode이므로 모두 Fiber로 변환됩니다.

### 2. Reconciliation 순서 (child -> sibling)
```
1. reconcile Fiber0 (span, index=0)
   - DOM: <span>This</span>
   - parent.appendChild(<span>This</span>)
   - parent.childNodes = [<span>This</span>]

2. reconcile Fiber1 (#text, index=1)
   - 이전 형제: Fiber0.domElement = <span>This</span>
   - referenceNode = Fiber0.domElement.nextSibling = null
   - DOM: "is highlig"
   - parent.insertBefore("is highlig", null) = appendChild
   - parent.childNodes = [<span>This</span>, "is highlig"]

3. reconcile Fiber2 (span, index=2)
   - 이전 형제: Fiber1.domElement = "is highlig"
   - referenceNode = Fiber1.domElement.nextSibling = null
   - DOM: <span>hted</span>
   - parent.insertBefore(<span>hted</span>, null) = appendChild
   - parent.childNodes = [<span>This</span>, "is highlig", <span>hted</span>]

4. reconcile Fiber3 (#text, index=3)
   - 이전 형제: Fiber2.domElement = <span>hted</span>
   - referenceNode = Fiber2.domElement.nextSibling = null
   - DOM: "and commen"
   - parent.insertBefore("and commen", null) = appendChild
   - parent.childNodes = [<span>This</span>, "is highlig", <span>hted</span>, "and commen"]

5. reconcile Fiber4 (span, index=4)
   - 이전 형제: Fiber3.domElement = "and commen"
   - referenceNode = Fiber3.domElement.nextSibling = null
   - DOM: <span>ted text</span>
   - parent.insertBefore(<span>ted text</span>, null) = appendChild
   - parent.childNodes = [<span>This</span>, "is highlig", <span>hted</span>, "and commen", <span>ted text</span>]
```

**핵심**: 
- 모든 노드가 Fiber로 변환됨
- Fiber sibling 관계 = VNode children 순서
- 이전 형제 Fiber.domElement.nextSibling을 referenceNode로 사용

## 현재 구현 방식

### 1. Fiber Tree 생성
```
RootFiber
  └─ child: Fiber0 (span with text "This", index=0)
      └─ sibling: Fiber1 (span highlight-decorator, index=1)
          └─ sibling: Fiber2 (span with text "hted", index=2)
              └─ sibling: Fiber3 (span comment-decorator, index=3)
                  └─ sibling: Fiber4 (span with text "ted text", index=4)
```

**현재 구현**: 모든 VNode children이 Fiber로 변환됩니다. 하지만 문제는 이전 형제를 찾는 로직에 있습니다.

### 2. Reconciliation 순서

#### Step 1: reconcile Fiber0 (span, index=0)
```
- DOM: <span>This</span>
- createHostElement에서 parent.appendChild(<span>This</span>)
- vnode.meta.domElement = <span>This</span>
- fiber.domElement = <span>This</span>
- parent.childNodes = [<span>This</span>]
```

#### Step 2: reconcile Fiber1 (span highlight-decorator, index=1) - 문제 발생!
```
현재 로직:
- fiber.index = 1
- 이전 형제 찾기: fiber.index - 1 = 0
- parentFiber.vnode.children[0] = { tag: 'span', children: [...] }
- prevSiblingVNode.meta.domElement를 찾으려고 시도
- 하지만 VNode children 배열을 역순으로 순회하면서 찾는 로직이 문제
- prevSiblingVNode.meta.domElement가 아직 설정되지 않았을 수 있음
- referenceNode를 찾을 수 없음
- referenceNode = actualParent.firstChild = <span>This</span>
- DOM: <span class="highlight-decorator">...</span>
- parent.insertBefore(<span class="highlight-decorator">...</span>, <span>This</span>)
- parent.childNodes = [<span class="highlight-decorator">...</span>, <span>This</span>] ❌ 순서가 뒤바뀜!
```

#### Step 3: reconcile Fiber2 (span with text "hted", index=2)
```
현재 로직:
- fiber.index = 2
- 이전 형제 찾기: fiber.index - 1 = 1
- parentFiber.vnode.children[1] = { tag: 'span', className: 'highlight-decorator' }
- prevSiblingVNode.meta.domElement를 찾으려고 시도
- 하지만 이미 잘못된 순서로 DOM이 구성됨
- referenceNode 계산이 잘못됨
- 결과: <span class="highlight-decorator">...</span>, <span>This</span>, <span>hted</span> ❌
```

**문제**: 이전 형제 VNode의 `meta.domElement`가 아직 설정되지 않았을 수 있습니다. Fiber scheduler는 child -> sibling 순서로 처리하므로, 이전 형제는 이미 reconcile되었을 것입니다. 하지만 `meta.domElement`는 `reconcileFiberNode`에서 설정되므로, 이전 형제 Fiber의 `domElement`를 직접 참조해야 합니다.

## 근본적인 문제

### 1. 이전 형제 찾기 로직의 문제
- 현재 로직: VNode children 배열을 역순으로 순회하여 `prevSiblingVNode.meta.domElement`를 찾음
- 문제: `meta.domElement`는 `reconcileFiberNode`에서 설정되지만, Fiber scheduler는 child -> sibling 순서로 처리하므로, 이전 형제는 이미 reconcile되었을 것입니다.
- 하지만 `meta.domElement`가 아직 설정되지 않았을 수 있음 (비동기 처리 때문일 수 있음)

### 2. Fiber sibling 관계와 VNode children 순서
- 모든 VNode children이 Fiber로 변환되므로, Fiber sibling 관계 = VNode children 순서
- 하지만 이전 형제 Fiber를 찾는 로직이 잘못되었을 수 있음

### 3. domElement 설정 시점
- `fiber.domElement`는 `reconcileFiberNode`에서 설정됨
- `vnode.meta.domElement`도 `reconcileFiberNode`에서 설정됨
- Fiber scheduler는 child -> sibling 순서로 처리하므로, 이전 형제 Fiber의 `domElement`는 이미 설정되어 있어야 함
- 하지만 현재 로직은 VNode children 배열을 순회하여 `meta.domElement`를 찾으려고 시도함

## 해결 방안

### 옵션 1: 이전 형제 Fiber를 직접 찾기 (권장)
- VNode children 배열을 순회하는 대신, 이전 형제 Fiber를 직접 찾기
- `fiber.parentFiber.child`부터 시작하여 `fiber.index - 1`번째 sibling 찾기
- 이전 형제 Fiber의 `domElement.nextSibling`을 referenceNode로 사용
- Fiber scheduler는 child -> sibling 순서로 처리하므로, 이전 형제는 이미 reconcile되었을 것

### 옵션 2: DOM에서 직접 referenceNode 찾기
- `parent.childNodes`를 순회하여 `fiber.index` 위치에 해당하는 노드 찾기
- 이미 추가된 노드들을 기준으로 referenceNode 계산
- 하지만 이 방법은 DOM 상태에 의존하므로, 순서가 잘못되면 문제가 발생할 수 있음

### 옵션 3: VNode children 배열 기준으로 referenceNode 계산 (현재 방식, 문제 있음)
- 이전 형제 VNode를 찾아서 그 `meta.domElement`를 참조
- 하지만 `meta.domElement`가 아직 설정되지 않았을 수 있음

## 권장 해결책

**옵션 1 (이전 형제 Fiber를 직접 찾기)**을 권장합니다:
1. 모든 VNode children이 이미 Fiber로 변환되어 있음
2. Fiber sibling 관계 = VNode children 순서
3. 이전 형제 Fiber를 직접 찾아서 `domElement.nextSibling`을 referenceNode로 사용
4. Fiber scheduler는 child -> sibling 순서로 처리하므로, 이전 형제는 이미 reconcile되었을 것

이렇게 하면 React의 검증된 방식을 따를 수 있고, 복잡한 예외 처리가 필요 없습니다.

