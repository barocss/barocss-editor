# Component 업데이트 플로우

## Abstract

본 문서는 Component 상태 변경 시 전체 재렌더링을 통한 일관성 있는 업데이트 플로우를 설명합니다. 

**핵심 원칙**: 
- **Model + Props + State = 하나의 "문서"**: 이 세 가지가 합쳐져서 완전한 문서를 구성
- 항상 최상위부터 전체 VNode 트리를 빌드
- 전체 VNode 트리를 reconcile하여 DOM에 적용
- 컴포넌트 하나만 업데이트하지 않음

Component 내부 state 변경 시 `changeState` 이벤트를 통해 `DOMRenderer`가 **최상위부터 전체 VNode 트리를 다시 빌드**하고, `updateComponent`에서는 이미 빌드된 `nextVNode`를 재사용하여 중복 빌드를 방지합니다.

## 1. 전체 플로우 개요

```
Component State 변경
  ↓
BaseComponentState.set()
  ↓
ComponentManager.emit('changeState')
  ↓
DOMRenderer (changeState 이벤트 리스너)
  ↓
DOMRenderer.render() (최상위부터 전체 재렌더링)
  ↓
VNodeBuilder.build() (최상위부터 전체 VNode 트리 빌드, Component state 포함)
  ↓
Reconciler.reconcile() (전체 VNode 트리 reconcile)
  ↓
ComponentManager.updateComponent() (각 컴포넌트에 대해 호출)
  ↓
nextVNode 재사용 (중복 빌드 없음)
```

**중요**: 
- ✅ 항상 최상위부터 전체 VNode 트리를 빌드
- ✅ 전체 VNode 트리를 reconcile하여 DOM에 적용
- ❌ 컴포넌트 하나만 업데이트하지 않음

## 2. 상세 플로우

### 2.1 Component State 변경

Component 내부에서 state를 변경하는 방법:

```typescript
// 방법 1: BaseComponentState.set() 사용
class MyComponentState extends BaseComponentState {
  increment() {
    this.set({ count: this.get('count') + 1 });
  }
}

// 방법 2: ComponentContext.setState() 사용
const MyComponent = (props, ctx) => {
  return element('div', [
    element('button', {
      onClick: () => ctx.setState({ count: (ctx.getState('count') || 0) + 1 })
    }, ['Increment'])
  ]);
};
```

### 2.2 BaseComponentState.set() → changeState 이벤트

**파일**: `packages/renderer-dom/src/state/base-component-state.ts`

```typescript
set(patch: Record<string, any>): void {
  if (!patch) return;
  Object.assign(this.data, patch);
  
  // Emit changeState event if componentManager and sid are available
  if (this.componentManager && this.sid) {
    this.componentManager.emit('changeState', this.sid, {
      state: this.snapshot(),
      patch: patch
    });
  }
}
```

**동작**:
1. Component state 데이터 업데이트
2. `ComponentManager.emit('changeState', sid, data)` 호출

### 2.3 ComponentManager.emit() → DOMRenderer 리스너

**파일**: `packages/renderer-dom/src/dom-renderer.ts`

```typescript
constructor(registry?: RendererRegistry, _options?: DOMRendererOptions) {
  // ...
  
  // 상태 변경 이벤트 수신 → 전체 재렌더 (모델은 동일, 상태만 변경됨)
  this.componentManager.on('changeState', (_sid: string) => {
    if (!this.rootElement || !this.lastModel) return;
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    queueMicrotask(() => {
      this.renderScheduled = false;
      try {
        this.render(this.rootElement as HTMLElement, this.lastModel as ModelData, this.lastDecorators || [], this.lastRuntime || undefined);
      } catch {}
    });
  });
}
```

**동작**:
1. `changeState` 이벤트 수신
2. `renderScheduled` 플래그로 중복 스케줄링 방지
3. `queueMicrotask`로 다음 이벤트 루프에서 전체 재렌더링 실행
4. `lastModel`, `lastDecorators`, `lastRuntime` 사용 (모델은 동일, 상태만 변경)

### 2.4 DOMRenderer.render() → 전체 VNode 트리 빌드

**파일**: `packages/renderer-dom/src/dom-renderer.ts`

```typescript
render(
  container: HTMLElement,
  model: ModelData,
  decorators: Decorator[] = [],
  runtime?: Record<string, any>,
  selection?: { 
    textNode?: Text; 
    restoreSelection?: (textNode: Text, offset: number) => void;
    model?: { sid: string; modelOffset: number };
  }
): void {
  // Store for later use
  this.rootElement = container;
  this.lastModel = model;
  this.lastDecorators = decorators;
  this.lastRuntime = runtime || null;
  
  // Build complete VNode tree from model
  const vnode = this.builder.build(model.stype, model, { 
    decorators,
    selectionContext: selection?.model
  } as unknown as VNodeBuildOptions);
  
  // Reconcile VNode tree to container
  const selectionContext = this.selectionTextNodePool
    ? { ...(selection || {}), pool: this.selectionTextNodePool }
    : undefined;
  this.reconciler.reconcile(container, vnode, model, runtime, decorators, selectionContext as any);
}
```

**동작**:
1. `VNodeBuilder.build()` 호출하여 전체 VNode 트리 빌드
2. `VNodeBuilder`는 `componentStateProvider`를 통해 Component state에 접근
3. Component state가 반영된 VNode 트리 생성
4. `Reconciler.reconcile()` 호출하여 DOM 업데이트

### 2.5 VNodeBuilder.build() → Component State 접근

**파일**: `packages/renderer-dom/src/vnode/factory.ts`

```typescript
private _getComponentStateForBuild(template: ComponentTemplate, data: ModelData, props: Record<string, any>): Record<string, any> {
  if (!this.componentStateProvider) {
    return {};
  }
  
  // Create temporary VNode to get component state
  const tempVNode: VNode = {
    stype: template.stype,
    sid: data.sid,
    // ...
  };
  
  return this.componentStateProvider.getComponentStateByVNode(tempVNode);
}
```

**동작**:
1. Component 템플릿 빌드 시 `componentStateProvider`를 통해 state 조회
2. Component state를 `dataForBuild`에 포함
3. Component 템플릿 함수 호출 시 state가 반영된 context 전달

### 2.6 Reconciler.reconcile() → Component 업데이트

**파일**: `packages/renderer-dom/src/reconcile/reconciler.ts`

```typescript
private reconcileVNodeChildren(parent: HTMLElement, prevVNode: VNode | undefined, nextVNode: VNode, context?: any, isRecursive: boolean = false): void {
  // ...
  
  for (let childIndex = 0; childIndex < childVNodes.length; childIndex++) {
    const childVNode = childVNodes[childIndex];
    
    // Component VNode인 경우 updateComponent 호출
    if (!isDecorator && childVNode.stype) {
      const isReconciling = !!(context as any)?.__isReconciling;
      
      if (!isReconciling) {
        try { 
          this.components.updateComponent(prevChildVNode || {} as VNode, childVNode, host, context || ({} as any)); 
        } catch (error) {
          console.error(`[Reconciler] Error updating component ${childVNode.stype} (sid: ${childVNode.sid}):`, error);
          throw error;
        }
      }
    }
  }
}
```

**동작**:
1. VNode 트리를 순회하며 Component VNode 발견
2. `ComponentManager.updateComponent()` 호출
3. `__isReconciling` 플래그로 재귀 호출 방지

### 2.7 ComponentManager.updateComponent() → nextVNode 재사용

**파일**: `packages/renderer-dom/src/component-manager.ts`

```typescript
public updateComponent(prevVNode: VNode, nextVNode: VNode, container: HTMLElement, context: ReconcileContext, wip: DOMWorkInProgress): void {
  // __isReconciling 플래그가 설정되어 있으면 updateComponent를 건너뜀
  const isReconciling = !!(context as any)?.__isReconciling;
  if (isReconciling) {
    // DOM 속성만 업데이트 (build 없이)
    if (nextVNode.attrs) {
      const dom = (context as any)?.dom;
      if (dom && container) {
        dom.updateAttributes(container, prevVNode?.attrs, nextVNode.attrs);
      }
    }
    return;
  }
  
  // ...
  
  // 일관성 있는 전체 빌드 패턴:
  // VNodeBuilder가 이미 전체 VNode 트리를 빌드했으므로, updateComponent에서는 nextVNode를 그대로 재사용
  // Component state 변경 시 changeState 이벤트 → DOMRenderer.render() 전체 재렌더링
  // 따라서 nextVNode는 이미 DOMRenderer.render()에서 state를 반영해서 빌드되었음
  // updateComponent에서는 buildFromElementTemplate을 호출하지 않고 nextVNode를 재사용
  const prevVNodeForReconcile = prevVNode || instance.vnode || {} as VNode;
  const nextVNodeForReconcile = nextVNode;
  
  // nextVNode가 없거나 비어있는 경우는 VNodeBuilder의 책임이므로 여기서 처리하지 않음
  // 만약 nextVNode가 비어있다면 VNodeBuilder.build()에서 문제가 발생한 것이므로 에러를 발생시켜야 함
  if (!nextVNodeForReconcile) {
    console.error(`[ComponentManager.updateComponent] nextVNode is missing for component ${componentId}. This should not happen if VNodeBuilder.build() is working correctly.`);
  }
  
  // Reconcile nextVNode to DOM
  const reconcileFunc = (context as any).reconcile;
  if (reconcileFunc) {
    const reconcileContext = {
      ...context,
      parent: instance.element,
      data: instance.state,
      __internal: true,
      prevVNode: prevVNodeForReconcile,
      __isReconciling: true  // 재귀 호출 방지
    } as any;
    reconcileFunc(nextVNodeForReconcile as any, instance.element, reconcileContext);
    instance.vnode = nextVNodeForReconcile;
  }
}
```

**핵심 로직**:
1. **`nextVNode`는 항상 `VNodeBuilder.build()`에서 이미 빌드되었으므로 그대로 재사용**
2. **`buildFromElementTemplate`을 호출하지 않음** (중복 빌드 방지)
3. `reconcileFunc`를 호출하여 DOM 업데이트
4. `__isReconciling` 플래그로 재귀 호출 방지

**중요**: `VNodeBuilder`가 전체 VNode 트리를 빌드하는 책임을 가지므로, `updateComponent`에서 다시 빌드할 필요가 없습니다. 이는 일관성 있는 전체 빌드 패턴을 보장합니다.

## 3. 일관성 있는 전체 빌드 패턴

### 3.1 핵심 원칙

**모든 업데이트는 전체 빌드 패턴을 따릅니다:**

1. **Component state 변경** → `changeState` 이벤트 → `DOMRenderer.render()` 전체 재렌더링
2. **Model 변경** → `DOMRenderer.render()` 직접 호출
3. **Props 변경** → `DOMRenderer.render()` 직접 호출

### 3.2 중복 빌드 방지

**이전 구조 (일관성 없음)**:
- Component state 변경 → 전체 재렌더링
- `updateComponent`에서 `stateChanged` 체크 후 다시 빌드 (중복)

**현재 구조 (일관성 있음)**:
- Component state 변경 → 전체 재렌더링
- `updateComponent`에서 `nextVNode` 재사용 (중복 없음)

### 3.3 예외 케이스 제거

**이전 구조**: `nextVNode`가 없거나 children이 없을 때 `buildFromElementTemplate` 호출

**현재 구조**: `VNodeBuilder`가 전체 VNode 트리를 빌드하는 책임을 가지므로, `updateComponent`에서는 `nextVNode`를 그대로 재사용합니다. `nextVNode`가 비어있는 경우는 `VNodeBuilder.build()`에서 문제가 발생한 것이므로 에러를 로깅합니다.

## 4. 성능 최적화

### 4.1 renderScheduled 플래그

```typescript
if (this.renderScheduled) return;
this.renderScheduled = true;
queueMicrotask(() => {
  this.renderScheduled = false;
  // ...
});
```

**목적**: 빠른 연속 state 변경 시 중복 렌더링 방지

### 4.2 queueMicrotask 사용

**목적**: 
- 동기적 state 변경들을 배치 처리
- 다음 이벤트 루프에서 한 번만 렌더링

### 4.3 Text Node Pool 재사용

**목적**: 
- DOM Text Node 재사용으로 Selection 안정성 보장
- 불필요한 DOM 생성/삭제 방지

## 5. 테스트 커버리지

### 5.1 관련 테스트 파일

1. **`test/components/component-rerender.test.ts`**
   - Component 재렌더링 기본 테스트
   - `setState` 호출 시 state 업데이트 검증
   - 여러 Component 인스턴스의 독립적인 state 관리 검증

2. **`test/core/reconciler-component-state-integration.test.ts`**
   - `changeState` 이벤트와 수동 업데이트 테스트
   - ComponentManager.emit('changeState') 시뮬레이션
   - 전체 재렌더링 후 DOM 업데이트 검증

3. **`test/core/reconciler-component-updatebysid.test.ts`**
   - Component 업데이트 테스트 (updateBySid 메서드)

4. **`test/core/reconciler-verification.test.ts`**
   - Component 업데이트 검증 테스트
   - Component 마운트/언마운트/속성 변경 검증

### 5.2 테스트 커버리지 분석

**현재 커버리지**:
- ✅ Component state 변경 (`setState`)
- ✅ Component 재렌더링
- ✅ 여러 Component 인스턴스의 독립적인 state
- ✅ `changeState` 이벤트 시뮬레이션
- ✅ Component 마운트/언마운트
- ✅ Component 속성 변경

**부족한 테스트**:
- ❌ `changeState` 이벤트가 자동으로 `DOMRenderer.render()`를 트리거하는지 검증
- ❌ `updateComponent`에서 `nextVNode` 재사용 검증
- ❌ `renderScheduled` 플래그로 중복 렌더링 방지 검증
- ❌ `queueMicrotask`를 통한 배치 처리 검증

### 5.3 권장 추가 테스트

다음 테스트 케이스를 추가하는 것을 권장합니다:

```typescript
describe('Component State Change Flow', () => {
  it('should trigger full re-render on changeState event', () => {
    const renderer = new DOMRenderer(registry);
    const container = document.createElement('div');
    
    // Initial render
    const model = { sid: 'comp-1', stype: 'counter', count: 0 };
    renderer.render(container, model);
    
    // Simulate state change
    const componentManager = (renderer as any).componentManager;
    const renderSpy = vi.spyOn(renderer, 'render');
    
    componentManager.emit('changeState', 'comp-1', { state: { count: 1 } });
    
    // Should trigger render after microtask
    await new Promise(resolve => queueMicrotask(resolve));
    expect(renderSpy).toHaveBeenCalled();
  });
  
  it('should reuse nextVNode in updateComponent', () => {
    // Test that updateComponent reuses nextVNode instead of rebuilding
  });
  
  it('should prevent duplicate renders with renderScheduled flag', () => {
    // Test that rapid state changes only trigger one render
  });
});
```

## 6. 요약

1. **Component state 변경**은 항상 `changeState` 이벤트를 통해 전체 재렌더링을 트리거합니다.
2. **DOMRenderer.render()**는 전체 VNode 트리를 다시 빌드하며, Component state를 반영합니다.
3. **ComponentManager.updateComponent()**는 이미 빌드된 `nextVNode`를 재사용하여 중복 빌드를 방지합니다.
4. 이 패턴은 **일관성 있는 전체 빌드**를 보장하며, 모든 업데이트가 동일한 플로우를 따릅니다.

