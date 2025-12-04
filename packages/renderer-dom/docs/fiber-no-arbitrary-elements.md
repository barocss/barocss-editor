# Fiber에서 임의 요소 생성 금지

## 원칙

**VNodeBuilder가 VNode를 만들고, Fiber Reconciler는 그 결과물만 처리해야 함**

Fiber Reconciler는:
- ✅ VNodeBuilder가 만든 VNode 구조를 그대로 DOM으로 변환
- ❌ 임의로 `<div>`나 다른 요소를 생성하면 안 됨

## 현재 문제
ㅔ서 제댈
Received HTML에서 텍스트가 `<div>`로 감싸져 있음:
```html
<span class="text" data-bc-sid="text-1">
  <div>제목입니다</div>  <!-- ❌ Fiber에서 임의로 생성됨 -->
</span>
```

## 원인 분석

### 1. `createHostElement`에서 기본값 `'div'` 사용

```typescript
const host = dom.createSimpleElement(String(childVNode.tag || 'div'), parent);
```

**문제**: `vnode.tag`가 없으면 `'div'`를 기본값으로 사용
- VNodeBuilder가 `tag`를 제공하지 않은 경우에만 발생해야 함
- 하지만 `vnode.text`가 있는 VNode는 `tag`가 있어야 함

### 2. `vnode.text` 처리 순서

`vnode.text`가 있는 VNode는:
1. `createFiberTree`에서 자식 Fiber를 생성하지 않음 (수정 완료)
2. `reconcileFiberNode`에서 host 생성 후 `handleVNodeTextProperty`로 처리

**문제**: `vnode.text`가 있는 VNode가 자식 Fiber로 처리되고 있을 수 있음

## 해결 방안

### 1. `createFiberTree`에서 `vnode.text` 체크 (완료)

```typescript
// IMPORTANT: vnode.text가 있고 children이 비어있으면 자식 Fiber를 생성하지 않음
if (vnode.text !== undefined && (!vnode.children || vnode.children.length === 0)) {
  return fiber;
}
```

### 2. `reconcileFiberNode`에서 `vnode.text` 처리 확인

`vnode.text`가 있는 VNode는:
- Host 생성 후 `handleVNodeTextProperty`로 처리
- 자식 Fiber 처리 전에 `return`하여 종료

### 3. `createHostElement`에서 `tag` 검증

`vnode.tag`가 없으면 에러를 발생시키거나, 최소한 로그를 남겨야 함:
```typescript
if (!childVNode.tag) {
  console.warn('[Fiber] VNode without tag:', childVNode);
  // 기본값 'div' 사용 (하지만 이는 VNodeBuilder 문제를 나타냄)
}
```

## 해결 완료

### 수정 사항

1. ✅ `reconcileFiberNode`에서 `vnode.tag`가 없으면 텍스트 노드로 처리
   - `createHostElement`를 호출하기 전에 분기 처리
   - `handleTextOnlyVNode`를 사용하여 텍스트 노드 생성

2. ✅ `createHostElement`에 경고 추가
   - `tag`가 없으면 경고 로그 출력 (VNodeBuilder 문제를 나타냄)

### 결과

Received HTML에서 텍스트가 올바르게 렌더링됨:
```html
<span class="text" data-bc-sid="text-1">제목입니다</span>
```

`<div>`로 감싸지지 않고 텍스트 노드로 올바르게 처리됨.

