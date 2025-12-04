# findHostXXX 함수 문제 분석

## 문제 제기

**질문:** 왜 VNode의 최종 결과물에 element를 저장해서 가지고 있지 않고, `findHostXXX` 함수로 계속 찾는가?

## 현재 구조의 문제점

### 1. 중복된 찾기 로직

**현재 흐름:**
1. `createFiberTree`에서 `prevChildVNode`를 찾아서 `fiber.prevVNode`에 저장 ✅
2. `reconcileFiberNode`에서 `prevVNode?.children`에서 `prevChildVNodes` 배열을 만듦
3. `findHostForChildVNode`를 호출해서 **다시 찾음** ❌

**문제:**
- `fiber.prevVNode.meta.domElement`가 이미 있는데도 다시 찾음
- `findHostForChildVNode`는 `prevChildVNodes` 배열에서 다시 찾으려고 시도
- 하지만 `fiber.prevVNode`는 이미 `createFiberTree`에서 찾은 결과

### 2. 왜 이렇게 복잡한가?

**현재 코드:**
```typescript
// reconcileFiberNode에서
const prevChildVNodes: (VNode | string | number)[] = prevVNode?.children || [];
const prevChildToElement = new Map<VNode | string | number, HTMLElement | Text>();

// prevVNode의 children에서 DOM 요소 참조 수집
for (const prevChild of prevChildVNodes) {
  if (typeof prevChild === 'object' && prevChild?.meta?.domElement) {
    prevChildToElement.set(prevChild, prevChild.meta.domElement);
  }
}

// findHostForChildVNode 호출
host = findHostForChildVNode(
  parent,
  vnode,
  fiber.index,
  prevChildVNodes,  // ❌ 이미 fiber.prevVNode에 있는데 다시 찾음
  prevChildToElement,
  usedDomElements
);
```

**문제:**
- `fiber.prevVNode`는 이미 `createFiberTree`에서 찾은 결과
- `fiber.prevVNode.meta.domElement`가 이미 있을 수 있음
- 하지만 `findHostForChildVNode`는 `prevChildVNodes` 배열에서 다시 찾으려고 시도

### 3. 올바른 접근 방법

**제안:**
```typescript
// reconcileFiberNode에서
// fiber.prevVNode.meta.domElement를 먼저 확인
if (fiber.prevVNode?.meta?.domElement && fiber.prevVNode.meta.domElement instanceof HTMLElement) {
  host = fiber.prevVNode.meta.domElement;
} else {
  // fallback: findHostForChildVNode 사용
  host = findHostForChildVNode(...);
}
```

**또는 더 간단하게:**
```typescript
// reconcileFiberNode에서
// fiber.prevVNode가 있으면 그 domElement를 사용
if (fiber.prevVNode?.meta?.domElement instanceof HTMLElement) {
  host = fiber.prevVNode.meta.domElement;
} else {
  // prevVNode가 없거나 domElement가 없으면 새로 생성
  host = createHostElement(...);
}
```

## 핵심 인사이트

### VNode에 이미 정보가 있음

1. **`fiber.prevVNode`**: `createFiberTree`에서 이미 찾은 이전 VNode
2. **`fiber.prevVNode.meta.domElement`**: 이전 렌더링에서 저장된 DOM 요소 참조
3. **`fiber.vnode`**: 현재 VNode

### findHostXXX 함수의 역할 재정의

**현재:**
- `findHostForChildVNode`: `prevChildVNodes` 배열에서 찾기
- 복잡한 매칭 로직 (sid, decoratorSid, 인덱스, 태그, 클래스 등)

**제안:**
- `fiber.prevVNode.meta.domElement`를 먼저 확인
- 없을 때만 `findHostForChildVNode` 사용 (fallback)
- `findHostForChildVNode`는 정말 찾을 수 없을 때만 사용

## 해결 방안

### ✅ 적용된 해결책: fiber.prevVNode.meta.domElement 우선 사용

```typescript
// reconcileFiberNode에서
let host: HTMLElement | null = null;

// 1. fiber.prevVNode.meta.domElement를 먼저 확인
// IMPORTANT: findHostXXX 함수로 다시 찾는 것보다 이미 저장된 정보를 사용하는 것이 더 효율적
if (prevVNode?.meta?.domElement instanceof HTMLElement) {
  // IMPORTANT: decoratorSid가 있는 경우, 정확히 같은 decoratorSid를 가진 경우에만 재사용
  if (vnode.decoratorSid && prevVNode.decoratorSid !== vnode.decoratorSid) {
    // decoratorSid가 다르면 재사용하지 않음
  } else {
    // prevVNode.meta.domElement를 바로 사용
    host = prevVNode.meta.domElement;
  }
}

// 2. host를 찾지 못했으면 findHostForChildVNode 사용 (fallback)
if (!host) {
  host = findHostForChildVNode(...);
}

// 3. 여전히 없으면 새로 생성
if (!host) {
  host = createHostElement(...);
}
```

**결과:**
- ✅ 테스트 통과
- ✅ mark wrapper 재사용 성공
- ✅ 불필요한 `findHostXXX` 호출 감소

### 방안 2: findHostForChildVNode 간소화

`findHostForChildVNode`는 `fiber.prevVNode`가 없을 때만 사용하도록 변경

### 방안 3: prevChildVNodes 배열 대신 fiber.prevVNode 사용

`reconcileFiberNode`에서 `prevChildVNodes` 배열을 만들지 않고, `fiber.prevVNode`를 직접 사용

## 결론

**현재 문제:**
- `fiber.prevVNode.meta.domElement`가 이미 있는데도 `findHostForChildVNode`로 다시 찾음
- 불필요한 복잡성과 중복 로직

**해결 방향:**
1. `fiber.prevVNode.meta.domElement`를 먼저 확인
2. 없을 때만 `findHostForChildVNode` 사용 (fallback)
3. `findHostForChildVNode`는 정말 찾을 수 없을 때만 사용

**핵심:**
- VNode에 이미 정보가 있으면 그걸 사용
- `findXXX` 함수는 정말 필요할 때만 사용 (fallback)

