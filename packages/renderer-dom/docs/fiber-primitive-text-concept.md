# Fiber에서 Primitive Text 처리 개념

## React의 Primitive Text 처리 방식

### 1. React의 기본 원칙
- **Primitive text (string/number)는 Fiber로 변환되지 않습니다**
- Primitive text는 부모 element의 children을 reconcile할 때 직접 TextNode로 렌더링됩니다
- React는 children 배열을 순회하면서 primitive text와 element를 모두 **순서대로** 처리합니다

### 2. React의 처리 순서
```jsx
<div>
  Hello          {/* primitive text - TextNode로 렌더링 */}
  <span>World</span>  {/* element - Fiber로 처리 */}
  !              {/* primitive text - TextNode로 렌더링 */}
</div>
```

React는 다음과 같이 처리합니다:
1. children 배열을 순회: `['Hello', <span>World</span>, '!']`
2. 각 child를 순서대로 처리:
   - `'Hello'` → TextNode 생성
   - `<span>World</span>` → Fiber 생성 및 reconcile
   - `'!'` → TextNode 생성
3. DOM 순서: `[Text('Hello'), Element(<span>), Text('!')]`

## 현재 우리 코드의 문제점

### 1. Fiber 트리 구조
- Fiber 트리는 **VNode만 포함**하므로 primitive text는 Fiber로 변환되지 않음 (올바름)
- 하지만 primitive text는 `vnode.children`에 포함되어 있음

### 2. 처리 순서 문제
현재 `reconcileFiberNode`에서:
1. 먼저 primitive text를 처리 (vnode.children 순회)
2. 그 다음 VNode children이 Fiber로 처리됨 (FiberScheduler가 자동으로)

**문제**: primitive text를 처리할 때, VNode children이 아직 DOM에 추가되지 않았을 수 있어서 위치 계산이 어긋날 수 있음

### 3. 위치 계산 문제
- `childIndex`는 VNode children 배열에서의 인덱스
- 하지만 DOM childNodes는 이미 element children이 추가되었을 수 있음
- 예: `vnode.children = ['A', VNode1, 'B']`
  - childIndex 0: 'A' (text)
  - childIndex 1: VNode1 (element) - 이미 Fiber로 처리되어 DOM에 추가됨
  - childIndex 2: 'B' (text)
  - DOM: `[Element(VNode1)]` (아직 'A'와 'B'가 없음)

## 해결 방법

### React의 접근 방식 적용
1. **Primitive text는 VNode children과 함께 순서대로 처리되어야 함**
2. 하지만 Fiber에서는 VNode children은 Fiber로 처리되므로, primitive text는 별도로 처리해야 함
3. **핵심**: primitive text를 처리할 때, VNode children의 순서를 고려하여 올바른 위치에 배치해야 함

### 올바른 처리 순서
1. `reconcileFiberNode`에서:
   - 먼저 host element 생성/업데이트
   - 그 다음 **모든 children을 순서대로 처리**:
     - Primitive text: 직접 TextNode로 처리
     - VNode: Fiber로 처리 (FiberScheduler가 자동으로)
   - 하지만 Fiber는 비동기이므로, primitive text는 VNode children이 처리된 후에 처리해야 함

### 대안: React처럼 순차 처리
React는 children 배열을 순회하면서 primitive text와 element를 모두 순서대로 처리합니다.
우리도 비슷하게:
1. `vnode.children`을 순회
2. 각 child를 순서대로 처리:
   - Primitive text: 즉시 TextNode로 처리
   - VNode: Fiber로 처리 (하지만 Fiber는 비동기이므로 순서 보장이 어려움)

### 최종 해결책
**Primitive text는 VNode children이 모두 처리된 후에 처리해야 합니다.**
하지만 이는 Fiber의 비동기 특성 때문에 어렵습니다.

**더 나은 방법**: Primitive text를 처리할 때, VNode children의 순서를 고려하여 올바른 위치를 계산해야 합니다.

1. `vnode.children`을 순회하면서:
   - Primitive text의 경우, 그 앞에 있는 VNode children의 개수를 세어서 DOM 위치를 계산
   - 예: `['A', VNode1, 'B']`에서 'B'를 처리할 때:
     - 앞에 VNode children이 1개 있으므로, DOM에서 첫 번째 element 다음에 배치

2. 또는 더 간단하게:
   - Primitive text를 처리할 때, `childIndex`를 사용하여 DOM 위치를 계산
   - 하지만 `childIndex`는 VNode children 배열에서의 인덱스이므로, DOM childNodes 배열에서의 인덱스와 다를 수 있음
   - 따라서 VNode children 배열에서 primitive text의 실제 위치를 계산해야 함

## 구현 전략

### 방법 1: Primitive text를 나중에 처리
1. `reconcileFiberNode`에서 VNode children을 먼저 Fiber로 처리
2. 모든 VNode children이 처리된 후 primitive text 처리
3. 문제: Fiber는 비동기이므로 완료 시점을 알기 어려움

### 방법 2: Primitive text를 올바른 위치에 배치
1. `vnode.children`을 순회하면서 primitive text 처리
2. 각 primitive text의 위치를 계산:
   - 그 앞에 있는 VNode children의 개수를 세어서 DOM 위치 계산
   - 예: `['A', VNode1, 'B']`에서:
     - 'A': 앞에 VNode 0개 → DOM index 0
     - 'B': 앞에 VNode 1개 → DOM에서 첫 번째 element 다음

### 방법 3: React처럼 순차 처리 (권장)
1. `vnode.children`을 순회하면서 모든 children을 순서대로 처리
2. Primitive text는 즉시 TextNode로 처리
3. VNode는 Fiber로 처리하되, primitive text의 위치를 고려하여 배치

**하지만 Fiber는 비동기이므로 순서 보장이 어렵습니다.**

### 최종 권장 방법
**Primitive text를 처리할 때, VNode children의 순서를 고려하여 올바른 위치를 계산합니다.**

1. `vnode.children`을 순회하면서 primitive text 처리
2. 각 primitive text의 위치 계산:
   - 그 앞에 있는 VNode children의 개수 = `elementCount`
   - DOM에서 `elementCount`번째 element 다음에 배치
   - 예: `['A', VNode1, 'B']`에서:
     - 'A': elementCount = 0 → 첫 번째 element 앞 (또는 첫 번째 위치)
     - 'B': elementCount = 1 → 첫 번째 element 다음

3. DOM childNodes를 순회하면서:
   - Element node를 만나면 `elementCount` 증가
   - Text node를 만나면 해당 위치의 text node 재사용 또는 업데이트

