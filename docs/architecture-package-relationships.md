# Architecture: Package Relationships (DSL, VNode, Renderer-DOM)

## 개요

이 문서는 새로운 아키텍처에서 `@barocss/dsl`, `@barocss/vnode`, `@barocss/renderer-dom` 패키지 간의 관계와 책임 분리를 설명합니다.

## 핵심 아키텍처 원칙

```
Model (stype) + Decorators → DOMRenderer.build() → VNode → DOMRenderer.render() → DOM
```

**중요한 변화:**
- Build 로직이 `renderer-dom`으로 이동
- Component state는 Build 시점에 반영됨
- DSL은 Registry에 등록되어 있고, `model.stype`으로 조회됨

## 패키지 역할 분리

### 1. `@barocss/dsl` - Template Definition Layer

**역할:**
- DSL 템플릿 정의 (ElementTemplate, ComponentTemplate 등)
- Registry 시스템 (템플릿 등록 및 조회)
- Template 빌더 함수 (`element()`, `component()`, `data()` 등)

**책임:**
- ✅ 템플릿 구조 정의
- ✅ Registry에 템플릿 등록
- ✅ 템플릿 조회 API 제공
- ❌ VNode 생성 (역할 없음)
- ❌ DOM 조작 (역할 없음)

**예시:**
```typescript
import { renderer, element, component } from '@barocss/dsl';

// 템플릿 정의 및 등록
// ElementTemplate이 자동으로 ComponentTemplate으로 변환됨
define('paragraph', element('p', {}, [
  data('text')
]));
// 내부적으로는: define('paragraph', (props, ctx) => element('p', {}, [data('text')]))

// Component는 내부 state와 외부 data 두 가지로 맵핑됨
define('button', (props, context) => {
  // 1차: 내부 state로 초기 렌더링 (context.state 사용)
  // 2차: 외부 data로 재맵핑 (props/model 사용)
  const label = context.state?.label || props.label || data('label');
  return element('button', { onClick: props.onClick }, [label]);
});
```

**중요**: `define()` 함수는 모든 템플릿을 자동으로 컴포넌트로 변환합니다:
- `ElementTemplate` → `ComponentTemplate` (자동 변환)
- 모든 renderer가 컴포넌트로 일원화되어 빌드 과정이 단순화됨

**Component의 이중 맵핑 특성:**
- **1차 맵핑 (초기)**: Component 내부 state (`context.state`)로 렌더링
- **2차 맵핑 (업데이트)**: 외부 Model data (`props`, `model`)로 재맵핑
- Component는 내부 state와 외부 data 모두를 처리할 수 있어야 함

### 2. `@barocss/vnode` - ~~Virtual Node Types & Utilities~~ (renderer-dom에 통합)

**역할:** (renderer-dom 패키지 내부로 이동됨)
- VNode 타입 정의
- VNode 관련 유틸리티 함수
- Decorator 타입 및 처리 로직
- VNodeBuilder (ComponentManager 주입 가능)

**책임:**
- ✅ VNode 인터페이스 정의 (`renderer-dom/src/vnode/types.ts`)
- ✅ VNode 타입 가드 함수 (`renderer-dom/src/vnode/utils/vnode-guards.ts`)
- ✅ Decorator 타입 및 처리 (`renderer-dom/src/vnode/decorator/`)
- ✅ VNodeBuilder (`renderer-dom/src/vnode/factory.ts`) - ComponentManager 주입 가능
- ✅ VNode → DOM Reconcile
- ✅ DOM 조작

**변경 사유:**
- Component state를 Build 시점에 참조해야 함
- ComponentManager가 renderer-dom에 있어서 Build 로직도 같은 패키지에 있어야 함
- 구조 단순화 및 의존성 정리

**예시:**
```typescript
import { VNode, DecoratorData, VNodeBuilder } from '@barocss/renderer-dom';

// 타입만 제공
const vnode: VNode = {
  tag: 'div',
  attrs: { 'data-bc-sid': 'node-1' },
  children: []
};

// 타입 가드
if (isComponent(vnode)) {
  // component 처리
}
```

### 3. `@barocss/renderer-dom` - DOM Rendering Layer

**역할:**
- Model + Decorators → VNode 빌드
- VNode → DOM Reconcile
- Component state 관리
- DOM 조작

**책임:**
- ✅ Build: `model.stype`으로 DSL 조회 → VNode 생성
- ✅ Component state 관리 (ComponentManager)
- ✅ Decorator 처리 (DecoratorManager)
- ✅ VNode → DOM Reconcile
- ✅ DOM 조작 및 업데이트

**핵심 구조:**
```typescript
class DOMRenderer {
  // Managers
  private componentManager: ComponentManager;  // Component state 관리
  private vnodeBuilder: VNodeBuilder;          // VNode 빌드 (ComponentManager 주입됨)
  
  // 마지막 빌드 시점의 입력 저장
  private lastModel: Model | null = null;
  private lastDecorators: Decorator[] | null = null;
  
  constructor(registry?: RendererRegistry) {
    this.componentManager = new ComponentManager(...);
    // VNodeBuilder에 ComponentManager 주입
    this.vnodeBuilder = new VNodeBuilder(registry, {
      componentManager: this.componentManager
    });
  }
  
  // Build: Model + Decorators → VNode (Component state 반영)
  build(model: Model, decorators: Decorator[]): VNode {
    // 1. model.stype으로 Registry에서 DSL 템플릿 조회
    // 2. VNodeBuilder.build() 호출 (내부에서 ComponentManager의 state 참조)
    // 3. Decorator 적용
    // 4. 저장 (자동 재빌드용)
    this.lastModel = model;
    this.lastDecorators = decorators;
    return this.vnodeBuilder.build(model.stype, model, { decorators });
  }
  
  // Render: VNode → DOM (Reconcile만 수행)
  render(container: HTMLElement, vnode: VNode): HTMLElement {
    // 기존 reconcile 로직
  }
  
  // Component state 변경 시 자동 재빌드
  private rerender(): void {
    if (this.lastModel && this.lastDecorators) {
      const newVnode = this.build(this.lastModel, this.lastDecorators);
      if (this.rootElement) {
        this.render(this.rootElement, newVnode);
      }
    }
  }
}
```

**VNodeBuilder 구조:**
```typescript
class VNodeBuilder {
  private componentManager?: ComponentManager;  // 주입 가능
  
  constructor(
    registry?: RendererRegistry,
    options?: { componentManager?: ComponentManager }
  ) {
    this.componentManager = options?.componentManager;
  }
  
  // Build 시점에 Component state 참조
  private _buildComponent(...): VNode {
    const componentId = generateComponentId(...);
    // ComponentManager에서 기존 state 가져오기
    const existingState = this.componentManager?.getComponentState(componentId) || {};
    const ctx = this._makeContext(componentId, existingState, props, {});
    // ...
  }
}
```

## 데이터 흐름

### 1. 초기 렌더링

```
[Editor/Application Layer]
  ↓
  model: { stype: 'paragraph', sid: 'p1', text: 'Hello' }
  decorators: [{ target: { nodeId: 'p1' }, ... }]
  ↓
[DOMRenderer.build(model, decorators)]
  ├─ TemplateManager: Registry.get(model.stype) → DSL 템플릿 조회
  ├─ ComponentManager: 기존 state 참조 (없으면 {})
  ├─ DecoratorManager: Decorator 적용
  └─ VNode 생성 (Component state 반영됨)
  ↓
[DOMRenderer.render(container, vnode)]
  ├─ DOMReconcile: VNode → DOM 변환
  └─ ComponentManager: Component 마운트 (필요시)
  ↓
[DOM]
```

### 2. Component State 변경 (내부 State 맵핑)

```
[Component.setState({ count: 1 })]
  ↓
[ComponentManager.setState()]
  ├─ 내부 State 업데이트
  └─ onRerenderCallback() 호출
  ↓
[DOMRenderer.rerender()]
  ├─ 저장된 lastModel, lastDecorators 사용
  ├─ DOMRenderer.build(lastModel, lastDecorators)
  │   ├─ ComponentManager의 새 state 참조 (내부 state)
  │   └─ Model data도 함께 전달 (외부 data)
  │   └─ Component template 함수가 두 가지 모두 처리
  └─ DOMRenderer.render(rootElement, newVnode)
  ↓
[DOM 업데이트]
```

**특징:**
- Component는 내부 state 변경 시에도 전체 재빌드
- Template 함수에서 `context.state` (내부)와 `props` (외부) 모두 접근 가능

### 3. Model 변경 (외부 Data 맵핑)

```
[Model 변경 (사용자 입력 등)]
  ↓
[Editor/Application Layer]
  ├─ 새 model 생성
  └─ decorators 업데이트 (필요시)
  ↓
[DOMRenderer.build(newModel, newDecorators)]
  ├─ ComponentManager의 기존 state 유지 (내부 state)
  ├─ 새 Model data 전달 (외부 data)
  └─ Component template 함수가 두 가지 모두 처리
  ↓
[DOMRenderer.render(container, vnode)]
  └─ (위와 동일)
```

**특징:**
- Model 변경 시에도 Component 내부 state는 유지됨
- Template 함수에서 `context.state` (내부)와 `modelData` (외부) 모두 접근 가능
- 두 가지 데이터 소스를 모두 반영한 VNode 생성

## 주요 특징

### 1. Build 시점의 Component State 반영

**문제:**
- 기존에는 Component state가 마운트 시점에만 생성됨
- Build 시점에는 state가 없어서 decorator 적용 불가

**해결:**
- `ComponentManager`가 `DOMRenderer` 내부에 있음
- Build 시점에 기존 Component state를 참조 가능
- Decorator가 Component 내부 children에도 적용 가능

**Component의 이중 맵핑:**
Component는 두 가지 데이터 소스를 처리합니다:

1. **내부 State (초기 렌더링)**:
   ```typescript
   // Component 내부 state로 렌더링
   const componentId = generateComponentId(vnode);
   const existingState = componentManager.getState(componentId) || {};
   const ctx = makeContext(componentId, existingState, props, {});
   const elementTemplate = component.template(props, ctx);
   ```

2. **외부 Data (Model 변경 시 재맵핑)**:
   ```typescript
   // Model data로 재맵핑
   const ctx = makeContext(componentId, existingState, modelData, {});
   const elementTemplate = component.template(modelData, ctx);
   const vnode = buildElement(elementTemplate, modelData, { decorators });
   ```

**Build 시점 처리:**
```typescript
// Build 시점: 내부 state와 외부 data 모두 반영
const componentId = generateComponentId(vnode);
const existingState = componentManager.getState(componentId) || {};
const ctx = makeContext(componentId, existingState, props, {});
const elementTemplate = component.template(props, ctx);
const vnode = buildElement(elementTemplate, props, { decorators });
```

### 2. 자동 재빌드 메커니즘

**동작:**
- `build()` 호출 시 `model`, `decorators` 저장
- Component state 변경 시 `rerender()` 자동 호출
- 저장된 `model`, `decorators`로 재빌드

**장점:**
- 상위 레이어에서 매번 `model`, `decorators` 전달 불필요
- Component state 변경 시 자동 업데이트
- DSL, Model, Decorators는 불변 (Component state만 변경)

### 3. Registry 기반 템플릿 조회

**동작:**
- `model.stype`으로 Registry에서 DSL 템플릿 조회
- 별도로 DSL을 전달할 필요 없음

**예시:**
```typescript
// Registry에 등록된 템플릿
renderer('paragraph', element('p', {}, [data('text')]));

// Build 시
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const vnode = domRenderer.build(model, decorators);
// → Registry.get('paragraph')로 템플릿 조회
```

## 패키지 간 의존성

```
┌─────────────────┐
│  @barocss/dsl   │ (독립적)
└─────────────────┘
        ↑
        │ (Registry + 타입)
        │
┌─────────────────┐
│ renderer-dom     │
│  ├─ vnode/       │ (내부 모듈)
│  │  ├─ types.ts  │
│  │  ├─ factory.ts│ (VNodeBuilder)
│  │  └─ decorator/│
│  ├─ component-manager.ts│
│  └─ dom-renderer.ts│
└─────────────────┘
        ↑
        │ (사용)
        │
┌─────────────────┐
│ editor-view-dom │ (최상위 레이어)
└─────────────────┘
```

**의존성 방향:**
- `dsl` → 독립적 (다른 패키지에 의존 없음)
- `renderer-dom` → `dsl` (Registry + 타입)
- `renderer-dom` → `reconcile` (Reconcile 알고리즘)
- `editor-view-dom` → `renderer-dom`

**변경 사항:**
- ~~`@barocss/vnode` 패키지 제거~~ (renderer-dom 내부로 통합)
- VNode 타입/유틸리티는 `renderer-dom`에서 export
- VNodeBuilder는 `renderer-dom` 내부 모듈로 이동

## API 사용 예시

### 기본 사용

```typescript
import { DOMRenderer } from '@barocss/renderer-dom';
import { getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
const domRenderer = new DOMRenderer(registry);

// 초기 빌드 + 렌더
const model = { stype: 'paragraph', sid: 'p1', text: 'Hello' };
const decorators = [{ target: { nodeId: 'p1' }, type: 'highlight' }];

const vnode = domRenderer.build(model, decorators);
domRenderer.render(container, vnode);
```

### Component State 변경

```typescript
// Component 내부에서
setState({ count: 1 });

// → ComponentManager가 자동으로:
// 1. State 업데이트
// 2. onRerenderCallback() 호출
// 3. DOMRenderer.rerender() 실행
// 4. 저장된 model, decorators로 재빌드
// 5. 자동 렌더링
```

### Model 변경 (사용자 입력)

```typescript
// Model 변경
const newModel = { stype: 'paragraph', sid: 'p1', text: 'Updated' };

// 새로 빌드 + 렌더
const newVnode = domRenderer.build(newModel, decorators);
domRenderer.render(container, newVnode);
```

## React와의 비교

### React
```
JSX → Virtual DOM → Reconcile → DOM
```

### Barocss (새 구조)
```
Model (stype) + Decorators 
  → DOMRenderer.build() (Component state 반영)
  → VNode
  → DOMRenderer.render() (Reconcile)
  → DOM
```

**차이점:**
- React: JSX가 직접 Virtual DOM 생성
- Barocss: Model.stype으로 DSL 조회 → Component state 반영 → VNode 생성
- Barocss: Decorator 개념 추가 (React에는 없음)
- Barocss: Component state가 Build 시점에 반영됨

## 정리

### 각 패키지의 핵심 책임

| 패키지 | Build | Render | Component State | Decorator |
|--------|-------|--------|-----------------|-----------|
| `dsl` | 템플릿 정의 | ❌ | ❌ | ❌ |
| ~~`vnode`~~ | ~~❌~~ | ~~❌~~ | ~~❌~~ | ~~타입만~~ |
| `renderer-dom` | ✅ | ✅ | ✅ | ✅ |

**변경:**
- `vnode` 패키지는 `renderer-dom` 내부 모듈로 통합됨
- VNode 타입/유틸리티는 `renderer-dom`에서 export

### 핵심 원칙

1. **DSL은 Registry에 등록**: `model.stype`으로 조회
2. **Build는 renderer-dom에서**: Component state 반영 가능
3. **VNode는 순수 타입**: 빌드 로직 없음
4. **자동 재빌드**: 저장된 model, decorators로 재사용

이 구조로 Component state와 Decorator를 모두 반영한 완전한 VNode를 생성할 수 있습니다.

