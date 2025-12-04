# 전체 상향식 렌더링 패턴 (Full Top-Down Render Pattern)

## Abstract

본 문서는 렌더링 시스템의 핵심 원칙을 설명합니다: **항상 최상위부터 전체 VNode 트리를 빌드하고, 전체를 reconcile하여 DOM에 적용합니다**. 개별 컴포넌트만 업데이트하는 것이 아니라, 컴포넌트 상태가 변경되면 항상 최상위부터 다시 빌드하는 개념입니다.

## 핵심 개념: Model + Props + State = 문서

**중요**: `model`, `props`, `state`가 모두 합쳐진 것이 하나의 **"문서"**입니다.

- **Model**: 기본 데이터 구조 (문서의 구조와 내용)
- **Props**: 컴포넌트에 전달되는 속성 (문서의 일부)
- **State**: 컴포넌트 내부 상태 (문서의 일부)

이 세 가지가 합쳐져서 하나의 완전한 "문서"를 구성하며, 이 문서를 기반으로 `VNodeBuilder`가 전체 VNode 트리를 빌드합니다.

## 1. 핵심 원칙

### 1.1 항상 최상위부터 전체 빌드

```
Component State 변경
  ↓
DOMRenderer.render() 호출
  ↓
VNodeBuilder.build() → 최상위부터 전체 VNode 트리 빌드
  ↓
Reconciler.reconcile() → 전체 VNode 트리를 순회하며 DOM 업데이트
```

**중요**: 
- ❌ 컴포넌트 하나만 다시 업데이트하지 않음
- ✅ 항상 최상위부터 전체 VNode 트리를 다시 빌드
- ✅ 전체 VNode 트리를 reconcile하여 DOM에 적용

### 1.2 컴포넌트 상태 변경 시 전체 재렌더링

```typescript
// Component State 변경
BaseComponentState.set() 
  ↓
ComponentManager.emit('changeState')
  ↓
DOMRenderer (changeState 이벤트 리스너)
  ↓
DOMRenderer.render() → 전체 재렌더링 (최상위부터)
  ↓
VNodeBuilder.build() → 전체 VNode 트리 빌드
  ↓
Reconciler.reconcile() → 전체 VNode 트리 reconcile
```

## 2. 플로우 상세

### 2.1 DOMRenderer.render() - 최상위 빌드

**파일**: `packages/renderer-dom/src/dom-renderer.ts`

```typescript
render(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { ... }
): void {
  // Build complete VNode tree from model
  // 항상 최상위부터 전체 VNode 트리를 빌드
  const vnode = this.builder.build(model.stype, model, { 
    decorators,
    selectionContext: selection?.model
  } as unknown as VNodeBuildOptions);
  
  // Reconcile VNode tree to container
  // 전체 VNode 트리를 reconcile하여 DOM에 적용
  this.reconciler.reconcile(container, vnode, model, runtime, decorators, selectionContext as any);
}
```

**동작**:
1. `VNodeBuilder.build()`를 호출하여 **최상위부터 전체 VNode 트리**를 빌드
2. `Reconciler.reconcile()`을 호출하여 **전체 VNode 트리**를 DOM에 적용

### 2.2 VNodeBuilder.build() - 전체 트리 빌드

**파일**: `packages/renderer-dom/src/vnode/factory.ts`

```typescript
build(nodeType: string, data: ModelData = {}, options?: VNodeBuildOptions): VNode {
  // 최상위 노드부터 시작하여 전체 트리를 재귀적으로 빌드
  // data에는 model + props + state가 모두 포함됨 (하나의 "문서")
  const renderer = this.registry.get(nodeType);
  const vnode = this._buildElement(renderer.template, data, options);
  // children도 재귀적으로 빌드
  return vnode;
}
```

**동작**:
1. 최상위 노드부터 시작
2. `data`에는 model + props + state가 모두 포함됨 (하나의 "문서")
3. children을 재귀적으로 빌드하여 전체 트리 구성
4. Component state도 포함하여 빌드

### 2.3 Reconciler.reconcile() - 전체 트리 reconcile

**파일**: `packages/renderer-dom/src/reconcile/reconciler.ts`

```typescript
reconcile(
  container: HTMLElement,
  vnode: VNode,
  model: ModelData,
  runtime?: RuntimeCtx,
  decorators?: Decorator[],
  selectionContext?: any
): void {
  // 전체 VNode 트리를 순회하며 DOM에 적용
  this.reconcileVNodeChildren(container, undefined, vnode, context);
}
```

**동작**:
1. 최상위 VNode부터 시작
2. children을 재귀적으로 순회하며 DOM 업데이트
3. 각 컴포넌트에 대해 `updateComponent` 호출 (이미 빌드된 VNode 재사용)

### 2.4 ComponentManager.updateComponent() - 빌드된 VNode 재사용

**파일**: `packages/renderer-dom/src/component-manager.ts`

```typescript
public updateComponent(prevVNode: VNode, nextVNode: VNode, ...): void {
  // nextVNode는 이미 VNodeBuilder.build()에서 빌드되었으므로 그대로 재사용
  // buildFromElementTemplate을 호출하지 않음 (중복 빌드 방지)
  const nextVNodeForReconcile = nextVNode;
  
  // reconcileFunc를 호출하여 DOM 업데이트
  reconcileFunc(nextVNodeForReconcile, instance.element, reconcileContext);
}
```

**동작**:
1. `nextVNode`는 이미 `VNodeBuilder.build()`에서 빌드되었으므로 재사용
2. `buildFromElementTemplate`을 호출하지 않음 (중복 빌드 방지)
3. `reconcileFunc`를 호출하여 DOM 업데이트

## 3. 왜 전체 빌드인가?

### 3.1 일관성 보장

- **전체 빌드**: 모든 컴포넌트가 동일한 시점의 state를 반영
- **부분 업데이트**: 일부 컴포넌트만 업데이트하면 state 불일치 가능

### 3.2 단순성

- **전체 빌드**: 단순한 플로우, 예측 가능한 동작
- **부분 업데이트**: 복잡한 의존성 관리, 예측 어려운 동작

### 3.3 성능 최적화

- **전체 빌드**: VNode 재사용으로 불필요한 DOM 조작 최소화
- **Text Node Pool**: Selection 안정성 보장

## 4. 컴포넌트 상태 변경 시나리오

### 4.1 시나리오: Counter 컴포넌트 클릭

```
1. 사용자가 Counter 컴포넌트의 버튼 클릭
   ↓
2. Component State 변경 (count: 0 → 1)
   ↓
3. BaseComponentState.set() → ComponentManager.emit('changeState')
   ↓
4. DOMRenderer (changeState 이벤트 리스너)
   ↓
5. DOMRenderer.render() 호출
   - lastModel 사용 (모델은 동일, 상태만 변경)
   ↓
6. VNodeBuilder.build() → 최상위부터 전체 VNode 트리 빌드
   - Model + Props + State가 합쳐진 "문서"를 기반으로 빌드
   - Counter 컴포넌트의 state(count: 1) 반영
   ↓
7. Reconciler.reconcile() → 전체 VNode 트리 reconcile
   - Counter 컴포넌트의 DOM 업데이트
   - 다른 컴포넌트는 변경사항 없으면 재사용
```

**핵심**: Model + Props + State = 하나의 "문서"
- State가 변경되면 → 전체 "문서"를 다시 빌드
- 전체 "문서"를 기반으로 VNode 트리 생성

### 4.2 핵심 포인트

- ✅ **최상위부터 전체 빌드**: `VNodeBuilder.build()`가 최상위부터 전체 트리 빌드
- ✅ **전체 reconcile**: `Reconciler.reconcile()`이 전체 트리 순회
- ❌ **부분 업데이트 없음**: 개별 컴포넌트만 업데이트하지 않음

## 5. 코드 예시

### 5.1 전체 빌드 플로우

```typescript
// 1. Component State 변경
component.setState({ count: 1 });

// 2. changeState 이벤트 발생
componentManager.emit('changeState', 'counter-1', { state: { count: 1 } });

// 3. DOMRenderer.render() 호출 (최상위부터 전체 빌드)
domRenderer.render(container, lastModel, lastDecorators, lastRuntime);

// 4. VNodeBuilder.build() → 전체 VNode 트리 빌드
const vnode = builder.build('document', model, { decorators });

// 5. Reconciler.reconcile() → 전체 VNode 트리 reconcile
reconciler.reconcile(container, vnode, model, runtime, decorators);

// 6. ComponentManager.updateComponent() → 빌드된 VNode 재사용
updateComponent(prevVNode, nextVNode, container, context);
// nextVNode는 이미 빌드되었으므로 재사용
```

## 6. 요약

1. **Model + Props + State = 하나의 "문서"**: 이 세 가지가 합쳐져서 완전한 문서를 구성
2. **항상 최상위부터 전체 빌드**: `VNodeBuilder.build()`가 최상위부터 전체 VNode 트리 빌드
3. **전체 reconcile**: `Reconciler.reconcile()`이 전체 VNode 트리를 순회하며 DOM 업데이트
4. **컴포넌트 하나만 업데이트하지 않음**: 항상 최상위부터 전체 재렌더링
5. **Component State 변경 시**: `changeState` 이벤트 → `DOMRenderer.render()` → 전체 "문서" 재빌드
6. **updateComponent의 역할**: 이미 빌드된 `nextVNode`를 재사용하여 DOM 업데이트 (중복 빌드 없음)

이 패턴은 **일관성, 단순성, 예측 가능성**을 보장합니다.

