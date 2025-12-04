# Reconciler 동작 분석 및 검증

## 문제 상황

1. **`VNodeBuilder.build`가 각 `inline-text` 노드마다 두 번씩 호출됨**
   - 로그에서 `[VNodeBuilder.build] START: nodeType=inline-text, sid=text-h1`이 두 번씩 나타남
   - 이는 불필요한 중복 호출로 성능 저하를 야기할 수 있음

2. **`MutationObserver`가 변경되지 않은 텍스트에 대해 `onTextChange`를 발생시킴**
   - 예: `oldText: '. ', newText: '. '` (동일한 텍스트)
   - 이는 reconcile이 제대로 작동하지 않는다는 신호

3. **Reconcile 검증이 없음**
   - 현재 로그만으로는 reconcile이 제대로 작동하는지 검증할 수 없음
   - DOM이 실제로 변경되었는지, 변경되지 않았는지 확인할 방법이 없음

## 현재 Reconcile 흐름

```
DOMRenderer.render()
  └─> builder.build() [1차 호출: 전체 VNode 트리 생성]
  └─> reconciler.reconcile()
      └─> reconcileVNodeChildren()
          ├─> updateComponent() [__isReconciling이 false일 때만]
          │   └─> buildFromElementTemplate() [2차 호출: 컴포넌트 내부 VNode 생성]
          │       └─> builder.build() [2차 호출]
          └─> reconcileVNodeChildren() [재귀 호출]
              └─> __isReconciling: true로 설정되어 updateComponent 건너뜀
```

## `build`가 두 번 호출되는 이유

### 시나리오 1: `updateComponent`가 호출되는 경우

1. **첫 번째 호출**: `DOMRenderer.render()` → `builder.build()` (전체 VNode 트리 생성)
2. **두 번째 호출**: `reconcileVNodeChildren()` → `updateComponent()` → `buildFromElementTemplate()` → `builder.build()` (컴포넌트 내부 VNode 생성)

**문제**: `updateComponent`가 호출되지 않는다면 이 시나리오는 해당 없음

### 시나리오 2: `mountComponent`가 호출되는 경우

1. **첫 번째 호출**: `DOMRenderer.render()` → `builder.build()` (전체 VNode 트리 생성)
2. **두 번째 호출**: `reconcileVNodeChildren()` → `mountComponent()` → `buildFromElementTemplate()` → `builder.build()` (컴포넌트 내부 VNode 생성)

**문제**: 로그에 `[ComponentManager.mountComponent]`가 나타나지만, `build`가 두 번 호출되는 것은 `mountComponent` 내부에서 `buildFromElementTemplate`이 호출되기 때문

### 시나리오 3: `reconcileVNodeChildren` 재귀 호출

1. **첫 번째 호출**: `DOMRenderer.render()` → `builder.build()` (전체 VNode 트리 생성)
2. **두 번째 호출**: `reconcileVNodeChildren()` 재귀 호출에서 다시 `build`가 호출됨

**문제**: `reconcileVNodeChildren`은 VNode를 받아서 DOM을 업데이트하는 것이지, 새로운 VNode를 생성하지 않음. 따라서 이 시나리오는 불가능

## 실제 문제 분석

로그를 보면:
- `[Reconciler.reconcile] Calling reconcileVNodeChildren...` 이후
- 각 `inline-text` 노드마다 `[VNodeBuilder.build] START: nodeType=inline-text, sid=text-h1`이 두 번씩 나옴
- 하지만 `[ComponentManager.updateComponent]` 로그가 없음

**추정**: `mountComponent`가 호출될 때 `buildFromElementTemplate`이 호출되면서 `build`가 다시 호출되는 것으로 보임

## Reconcile 검증 방법

### 1. DOM 변경 추적

```typescript
// reconcile 전후 DOM 상태 비교
const beforeDOM = container.innerHTML;
reconciler.reconcile(container, vnode, model);
const afterDOM = container.innerHTML;

if (beforeDOM === afterDOM) {
  console.log('[Reconcile] ✅ DOM 변경 없음 (정상)');
} else {
  console.log('[Reconcile] ⚠️ DOM 변경됨:', {
    before: beforeDOM.substring(0, 100),
    after: afterDOM.substring(0, 100)
  });
}
```

### 2. Text Node 재사용 확인

```typescript
// reconcile 전후 Text Node 참조 비교
const textNodesBefore = Array.from(container.querySelectorAll('*'))
  .flatMap(el => Array.from(el.childNodes).filter(n => n.nodeType === 3));
const textNodeRefsBefore = new Set(textNodesBefore);

reconciler.reconcile(container, vnode, model);

const textNodesAfter = Array.from(container.querySelectorAll('*'))
  .flatMap(el => Array.from(el.childNodes).filter(n => n.nodeType === 3));
const textNodeRefsAfter = new Set(textNodesAfter);

// 재사용된 Text Node 확인
const reused = textNodesAfter.filter(n => textNodeRefsBefore.has(n));
console.log('[Reconcile] Text Node 재사용:', {
  before: textNodesBefore.length,
  after: textNodesAfter.length,
  reused: reused.length
});
```

### 3. 불필요한 DOM 업데이트 감지

```typescript
// textContent 변경 전후 비교
const observer = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    if (mutation.type === 'characterData') {
      const oldText = mutation.oldValue;
      const newText = (mutation.target as Text).textContent;
      if (oldText === newText) {
        console.warn('[Reconcile] ⚠️ 불필요한 textContent 업데이트:', {
          oldText,
          newText,
          node: mutation.target
        });
      }
    }
  });
});

observer.observe(container, {
  characterData: true,
  characterDataOldValue: true,
  subtree: true
});
```

## 해결 방안

### 1. `build` 중복 호출 방지

- `__isReconciling` 플래그를 `mountComponent`와 `updateComponent` 모두에서 확인
- `buildFromElementTemplate` 호출 전에 `__isReconciling` 확인

### 2. Text Node 재사용 최적화

- `reconcileVNodeChildren`에서 Text Node를 찾을 때 `sid` 기반으로 매칭
- Text Node가 이미 존재하고 내용이 동일하면 재사용

### 3. Reconcile 검증 테스트 추가

- DOM 변경 추적 테스트
- Text Node 재사용 테스트
- 불필요한 DOM 업데이트 감지 테스트

## 다음 단계

1. **로그 분석 강화**: `build`가 두 번 호출되는 정확한 경로 추적
2. **검증 로직 추가**: reconcile 전후 DOM 상태 비교
3. **최적화**: 불필요한 `build` 호출 제거
4. **테스트 작성**: reconcile 동작 검증 테스트

