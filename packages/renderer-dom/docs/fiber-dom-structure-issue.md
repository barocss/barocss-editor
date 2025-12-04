# Fiber DOM 구조 오류 분석

## 문제 현상

테스트에서 DOM 구조가 예상과 다르게 렌더링됨:

**Expected:**
```html
<div class="document" data-bc-sid="doc-1" data-bc-stype="document">
  <h1 class="heading" data-bc-sid="h1-1" data-bc-stype="heading">
    <span class="text" data-bc-sid="text-1" data-bc-stype="inline-text">제목입니다</span>
  </h1>
  ...
</div>
```

**Received:**
```html
<div class="document" data-bc-sid="doc-1">
  <h1 class="heading" data-bc-sid="h1-1">
    <span class="text" data-bc-sid="text-1">
      <div>제목입니다</div>  <!-- ❌ 텍스트가 <div>로 감싸져 있음 -->
    </span>
  </h1>
  <p class="paragraph" data-bc-sid="p-1">
    <span class="text" data-bc-sid="text-2"></span>  <!-- ❌ 비어있음 -->
  </p>
  <div>첫 번째 단락입니다.</div>  <!-- ❌ 텍스트가 밖에 <div>로 렌더링됨 -->
  ...
</div>
```

## 원인 분석

### 1. React Fiber는 비동기로 동작

React Fiber는 기본적으로 **비동기**로 동작합니다:
- `createRoot().render()`는 동기 함수지만, 내부적으로는 비동기 처리
- `flushSync()`를 사용하면 동기로 강제할 수 있음
- 브라우저에 yield하여 UI 응답성 유지

### 2. DOM 구조 오류의 원인

#### 문제 1: 자식 Fiber의 parent가 잘못 설정됨

`createFiberTree`에서 자식 Fiber를 생성할 때:
```typescript
const childFiber = createFiberTree(
  parent, // ❌ 항상 root container로 설정됨
  childVNode,
  ...
);
```

**해결**: `reconcileFiberNode`에서 host 생성 후 자식 Fiber들의 `parent`를 업데이트
```typescript
// 4-1. 직접 자식 Fiber들의 parent를 현재 host로 업데이트
let childFiber = fiber.child;
while (childFiber) {
  childFiber.parent = host; // ✅ 부모 Fiber의 DOM element로 업데이트
  childFiber = childFiber.sibling;
}
```

#### 문제 2: vnode.text 처리 순서

`vnode.text`가 있는 VNode는 `handleVNodeTextProperty`로 처리되어야 하는데, 현재는 자식 Fiber 처리 후에 확인됨.

**해결**: `vnode.text` 처리를 host 생성 직후로 이동 (자식 Fiber 처리 전)

#### 문제 3: Primitive text 처리

Primitive text (string/number)가 `<div>`로 감싸져 렌더링됨.

**원인**: `processPrimitiveTextChildren`에서 직접 DOM 조작 대신 `handlePrimitiveTextChild`를 사용해야 함

**해결**: `handlePrimitiveTextChild`를 사용하여 올바른 위치에 텍스트 노드 생성/업데이트

## 수정 사항

1. ✅ 자식 Fiber들의 `parent`를 부모 Fiber의 DOM element로 업데이트
2. ✅ `vnode.text` 처리를 host 생성 직후로 이동
3. ✅ `processPrimitiveTextChildren`에서 `handlePrimitiveTextChild` 사용

## 추가 확인 필요

- `data-bc-stype` 속성이 누락됨 (의도된 변경인지 확인)
- 텍스트가 여전히 `<div>`로 감싸져 렌더링되는 문제 (추가 디버깅 필요)

