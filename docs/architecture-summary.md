# Barocss Architecture - 간단 요약

## 핵심 구조

```
Model → DSL → VNodeBuilder → VNode → DOMReconcile → DOM
         ↑
     element, data, when, component, slot, portal
```

## 전체 파이프라인

```
1. DSL Layer (packages/dsl)
   └─ element('p', {...}, [data('text')]) → Template

2. VNode Builder (packages/vnode)  
   └─ Template × Data → VNode

3. DOM Reconcile (packages/renderer-dom)
   └─ VNode × VNode → DOM
```

## 각 레이어의 역할

### 1. DSL Layer (packages/dsl)
**역할**: 함수형 템플릿 정의

- `element()` - HTML 요소 템플릿
- `data()` - 데이터 바인딩  
- `when()` - 조건부 렌더링
- `component()` - 컴포넌트 템플릿
- `slot()` - 슬롯 템플릿
- `portal()` - Portal 템플릿

모든 빌더는 순수 함수 (Pure Functions)

**입력**: Builder parameters
**출력**: Template

### 2. VNodeBuilder (packages/vnode)
**역할**: DSL 템플릿을 VNode로 변환

- Registry에서 템플릿 조회
- Data binding (data(), className, style)
- Component resolution
- Conditional rendering (build time)
- `when()` 조건은 build time에 평가되어 일반 VNode로 변환

**입력**: Template × Model data
**출력**: VNode tree

### 3. DOMReconcile (packages/renderer-dom)
**역할**: VNode 차이를 DOM 변경으로 변환

- WIP 트리 생성 및 관리
- 변경사항 감지 (tag, attrs, children)
- 우선순위 기반 처리
- 최소 DOM 변경 적용
- Children reconcile (React-style)

**입력**: prevVNode, nextVNode
**출력**: DOM updates

## Reconcile의 4단계

```typescript
reconcile(prevVNode, nextVNode, container, context) {
  // 1. WIP Tree 생성
  const wipTree = createWorkInProgressTree(nextVNode, prevVNode);
  
  // 2. 변경사항 감지 및 우선순위 할당
  detectChangesAndAssignPriority(prevVNode, nextVNode);
  
  // 3. 우선순위별 처리
  processByPriority(context, processWorkInProgress);
  
  // 4. DOM 업데이트 실행
  executeDOMUpdates(container, finalizeDOMUpdate);
}
```

## Children Reconcile 핵심

```typescript
// DOM을 직접 조작하는 reconciliation
reconcileChildren(wip, prevChildren, nextChildren) {
  while (prevIndex < prevChildren.length || nextIndex < nextChildren.length) {
    if (!prevChild) {
      // 새 자식 추가
      const newNode = createNewDOMNode(nextChild);
      domNode.insertBefore(newNode, referenceNode);
      
      // 중요: child WIP의 domNode 설정
      wip.children[nextIndex].domNode = newNode;
    } else if (isSameNode(prevChild, nextChild)) {
      // 동일한 노드 - skip
    } else {
      // 노드 교체
      const newNode = createNewDOMNode(nextChild);
      domNode.replaceChild(newNode, oldNode);
      wip.children[nextIndex].domNode = newNode;
    }
  }
}
```

**핵심 규칙**: reconcile에서 생성/교체된 DOM 노드를 child WIP의 `domNode`에 설정해야 중복 append를 방지할 수 있음

## 주요 클래스

| 클래스/함수 | 레이어 | 역할 |
|-----------|--------|------|
| `element, data, when, component` | **DSL** | 템플릿 빌더 (순수 함수) |
| `VNodeBuilder` | **VNode** | DSL 템플릿 → VNode 변환 |
| `DOMReconcile` | **Renderer** | VNode → DOM reconcile orchestration |
| `WorkInProgressManager` | **Renderer** | WIP 트리 생성 및 관리 |
| `ChangeDetection` | **Renderer** | 변경사항 감지 |
| `DOMProcessor` | **Renderer** | DOM 조작 (insert/update/remove) |
| `ComponentManager` | **Renderer** | 컴포넌트 라이프사이클 |
| `PortalManager` | **Renderer** | Portal 렌더링 |
| `DOMOperations` | **Renderer** | DOM 생성/수정 유틸리티 |

## 핵심 규칙

1. **DSL 빌더**는 순수 함수로 템플릿을 정의
2. **VNodeBuilder**는 템플릿과 데이터를 VNode로 변환만 담당
3. **DOMReconcile**은 VNode 차이를 DOM 변경으로 변환
4. **WIP 패턴**으로 실제 변경을 일괄 처리
5. **children reconcile**에서 생성된 DOM 노드는 child WIP의 domNode에 설정 필수
6. **finalizeDOMUpdate**에서 중복 append 방지 (`isAlreadyInDOM` 체크)

## 파일 구조

```
packages/
├─ schema/              # Schema 정의
├─ dsl/                 # DSL Layer ⭐
│  ├─ template-builders.ts  # element, data, when, component
│  ├─ types.ts             # Template types
│  └─ registry.ts          # Template registry
├─ vnode/              # VNodeBuilder
│  └─ factory.ts       # DSL Template → VNode 변환
├─ model/              # Model 데이터
├─ renderer-dom/
│  ├─ dom-renderer.ts           # High-level wrapper
│  ├─ dom-reconcile.ts          # Main reconcile
│  ├─ work-in-progress.ts       # WIP interfaces
│  ├─ work-in-progress-manager.ts
│  ├─ change-detection.ts       # Change detection
│  ├─ dom-processor.ts          # DOM manipulation
│  ├─ component-manager.ts      # Component lifecycle
│  ├─ portal-manager.ts        # Portal rendering
│  └─ dom-operations.ts        # DOM utilities
└─ datastore/         # Data management
```

## 사용 예제

자세한 예제는 [`architecture-practical-examples.md`](./architecture-practical-examples.md) 참고

### Basic Render
```typescript
// DSL 템플릿 정의
define('paragraph', element('p', {}, [data('text')]));

// Render
const renderer = new DOMRenderer();
const model = { stype: 'paragraph', text: 'Hello' };
renderer.render(container, model);
// 결과: <p>Hello</p>
```

### Update (Reconcile 자동)
```typescript
model.text = 'New';
renderer.render(container, model);
// 결과: <p>New</p> (전체 재생성 없이 텍스트만 변경)
```

### 복잡한 템플릿
```typescript
define('article', element('article',
  { className: data('className') },
  [
    when(
      (d) => d('published') === true,
      element('span', {}, ['Published'])
    ),
    element('h1', {}, [data('title')]),
    component('author', { name: data('author') })
  ]
));
```

## 관련 문서

- [`architecture-design-principles.md`](./architecture-design-principles.md) - **핵심 설계 원칙** ⭐
- [`architecture-reconcile-algorithm.md`](./architecture-reconcile-algorithm.md) - **Reconcile 알고리즘 상세** ⭐
- [`architecture-practical-examples.md`](./architecture-practical-examples.md) - 실제 사용 예제
- [`architecture-mathematical-model.md`](./architecture-mathematical-model.md) - 수학적 모델
- [`architecture-flow-diagram.md`](./architecture-flow-diagram.md) - 플로우 다이어그램
- [`architecture-reconcile-overview.md`](./architecture-reconcile-overview.md) - 전체 개요

