# Reconciler Text VNode 처리 문제 분석

## 문제 상황

VNode가 올바르게 생성되었지만, DOM 렌더링 시 예상과 다르게 동작합니다.

### 예상 동작
- VNode: `{ text: "Hello World" }` (tag 없음)
- DOM: `<span class="text">Hello World</span>` (text node가 span 안에)

### 실제 동작
- VNode: `{ text: "Hello World" }` (tag 없음)
- DOM: `<span class="text"></span>` + `<div>Hello World</div>` (div가 밖에 생성됨)

## 원인 분석

### 1. VNode 생성 단계 (정상 동작)

VNodeBuilder는 올바르게 VNode를 생성합니다:

```typescript
// inline-text 모델의 VNode 구조
{
  tag: 'span',
  sid: 'text-14',
  stype: 'inline-text',
  text: undefined,  // 부모 vnode에는 text가 없음
  children: [
    {
      text: "Hello World",  // children에 text vnode가 있음
      children: []
    }
  ]
}
```

### 2. Reconciler 처리 단계 (문제 발생)

`reconcileVNodeChildren` 함수에서 children을 처리할 때:

```typescript:433:444:packages/renderer-dom/src/reconcile/reconciler.ts
for (const child of childVNodes) {
  if (typeof child === 'string' || typeof child === 'number') {
    // 텍스트 노드: 기존 첫 텍스트 노드가 있으면 갱신, 없으면 추가
    const tn = parent.firstChild && parent.firstChild.nodeType === 3 ? parent.firstChild : null;
    const doc = parent.ownerDocument || document;
    if (tn) {
      tn.textContent = String(child);
    } else {
      parent.appendChild(doc.createTextNode(String(child)));
    }
    continue;
  }
  // Element VNode → DOM (태그가 맞지 않으면 교체)
  const childVNode = child as VNode;
```

**문제점:**
- `{ text: "Hello World" }` 같은 VNode 객체는 `typeof child === 'string' || typeof child === 'number'` 조건을 통과하지 못합니다.
- 따라서 `childVNode = child as VNode`로 처리되어 Element로 간주됩니다.

### 3. DOM Element 생성 (문제 발생)

```typescript:502:503:packages/renderer-dom/src/reconcile/reconciler.ts
if (!host) {
  host = this.dom.createSimpleElement(String(childVNode.tag || 'div'), parent);
```

**문제점:**
- `childVNode.tag`가 `undefined`이므로 기본값 `'div'`가 사용됩니다.
- 결과적으로 `<div>` 요소가 생성됩니다.

### 4. Text Content 설정 (실행되지만 이미 늦음)

```typescript:616:622:packages/renderer-dom/src/reconcile/reconciler.ts
// Set/Update text content when this VNode represents a leaf text node
if (childVNode.text !== undefined && (!childVNode.children || childVNode.children.length === 0)) {
  // Replace all children with a single text node
  const doc = host.ownerDocument || document;
  while (host.firstChild) host.removeChild(host.firstChild);
  host.appendChild(doc.createTextNode(String(childVNode.text)));
}
```

**문제점:**
- 이 코드는 실행되지만, 이미 `<div>` 요소가 생성된 후입니다.
- 결과적으로 `<div>Hello World</div>`가 생성되어 부모 요소 밖에 추가됩니다.

## 해결 방안

### 방안 1: Text VNode를 먼저 체크

`reconcileVNodeChildren` 함수에서 children을 처리하기 전에 text-only VNode를 먼저 체크:

```typescript
for (const child of childVNodes) {
  // Text-only VNode 체크 (tag가 없고 text만 있는 경우)
  if (typeof child === 'object' && child !== null && 
      !child.tag && child.text !== undefined && 
      (!child.children || child.children.length === 0)) {
    // 텍스트 노드로 직접 처리
    const doc = parent.ownerDocument || document;
    const textNode = doc.createTextNode(String(child.text));
    parent.appendChild(textNode);
    continue;
  }
  
  if (typeof child === 'string' || typeof child === 'number') {
    // 기존 로직...
  }
  
  // Element VNode 처리...
}
```

### 방안 2: createSimpleElement에서 text-only VNode 처리

`createSimpleElement` 호출 전에 text-only VNode인지 확인:

```typescript
if (!host) {
  // Text-only VNode인 경우 DOM element를 생성하지 않고 text node만 추가
  if (!childVNode.tag && childVNode.text !== undefined && 
      (!childVNode.children || childVNode.children.length === 0)) {
    const doc = parent.ownerDocument || document;
    const textNode = doc.createTextNode(String(childVNode.text));
    parent.appendChild(textNode);
    continue; // 다음 child로
  }
  
  host = this.dom.createSimpleElement(String(childVNode.tag || 'div'), parent);
  // ...
}
```

## 현재 상태

- ✅ VNode 생성: 정상 동작
- ✅ Reconciler 처리: text-only VNode를 text node로 직접 처리 (수정 완료)

## 수정 내용

### 1. VNode 빌더 수정
- `data('text')`가 처리된 경우를 추적하는 `hasDataTextProcessed` 플래그 추가
- `data('text')`가 처리된 경우 단일 텍스트 child를 부모의 `text`로 collapse하지 않음

### 2. Reconciler 수정
- `reconcileVNodeChildren`에서 text-only VNode를 먼저 체크하여 text node로 직접 처리
- `reorder`와 `removeStale` 함수가 Text 노드도 처리할 수 있도록 수정

## 테스트 결과

### 통과한 테스트
- ✅ `test/core/vnode-data-text-concept.test.ts` - 통과
- ✅ `test/core/vnode-builder-verification.test.ts` - 통과
- ✅ `test/core/reconciler-update-flow.test.ts` - 통과
- ✅ `test/core/vnode-builder-edge-cases.test.ts` - 통과
- ✅ `test/core/vnode-builder-performance.test.ts` - 통과
- ✅ `test/core/vnode-builder-dsl-functions.test.ts` - 통과
- ✅ `test/core/vnode-builder-function-component.test.ts` - 통과
- ✅ `test/core/vnode-builder-portal.test.ts` - 통과
- ✅ `test/core/vnode-full-document.test.ts` - 통과
- ✅ `test/core/vnode-structure-snapshot.test.ts` - 통과
- ✅ `test/core/dom-renderer-multiple-render.test.ts` - 5/6 통과

### 실패한 테스트
- ❌ `test/core/dom-renderer-multiple-render.test.ts` - 1개 실패 (decorator 중복 문제)
- ❌ `test/core/mark-decorator-complex.test.ts` - 16개 실패 (mark VNode의 children 처리 문제)

### 남은 문제

1. **Decorator 중복 문제**: decorator VNode의 text content가 중복되는 경우
2. **Mark VNode children 처리**: mark VNode의 children에 있는 text VNode가 제대로 처리되지 않는 경우

이 문제들은 text-only VNode 처리와는 별개의 문제로 보이며, mark/decorator VNode의 children 처리 로직을 추가로 확인해야 합니다.

