# Barocss Architecture - Design Principles

## 핵심 설계 원칙

### 1. VNode vs Reconcile 분리 원칙 ⭐

**가장 중요한 아키텍처 원칙**: VNode는 reconcile에서 동적으로 판단되지 않습니다.

#### VNode Build (VNodeBuilder 역할)
```typescript
// VNodeBuilder는 VNode를 생성만 담당
build(nodeType: string, data: ModelData): VNode {
  const template = this.registry.getTemplate(nodeType);
  const vnode = this._buildElement(template, data);
  return vnode;
}
```

**역할**: "무엇을 렌더링할지" 결정 (Template → VNode)
**시점**: Render 전에 완료
**결과**: 완성된 VNode tree

#### Reconcile (DOMReconcile 역할)
```typescript
// DOMReconcile은 이미 만들어진 VNode를 받아서 처리
reconcile(prevVNode: VNode | null, nextVNode: VNode | null, 
          container: HTMLElement, context: ReconcileContext): void {
  // 1. WIP 트리 생성 (nextVNode는 이미 완성됨)
  const wipTree = this.createWorkInProgressTree(nextVNode, container, prevVNode);
  
  // 2. 변경사항 감지
  this.workInProgressManager.detectChangesAndAssignPriority(prevVNode, nextVNode);
  
  // 3. DOM 업데이트
  this.processByPriority(context);
}
```

**역할**: "어떻게 DOM을 업데이트할지" 결정 (VNode → DOM)
**시점**: Render 중
**결과**: DOM 변경사항 적용

### 2. 단방향 데이터 흐름

```
Build Phase (VNode 생성)
  ↓
DSL → VNodeBuilder → VNode Tree
  ↓
Reconcile Phase (DOM 업데이트)
  ↓
VNode Tree → DOMReconcile → DOM
```

**핵심**: VNode와 DOM 업데이트는 완전히 분리된 단계

### 3. 책임 분리 (Separation of Concerns)

#### VNodeBuilder의 책임
- ✅ Template lookup 및 해석
- ✅ Data binding
- ✅ Component resolution
- ✅ 조건부 로직 평가 (`when` 등)
- ✅ VNode tree 생성
- ❌ DOM 조작 없음
- ❌ 이전 상태 기억 없음

#### DOMReconcile의 책임
- ✅ VNode 차이 계산
- ✅ 변경 최소화
- ✅ DOM 조작
- ✅ State 관리 (Component lifecycle)
- ❌ VNode 생성 없음
- ❌ Template 해석 없음

### 4. 단방향 흐름의 장점

#### 예측 가능성
```typescript
// 항상 VNode가 먼저 완성됨
const vnode = builder.build('paragraph', data);  // 완성됨
reconcile(prevVNode, vnode, container, context); // 이미 완성된 VNode 사용
```

#### 테스트 용이성
```typescript
// VNodeBuilder 테스트
describe('VNodeBuilder', () => {
  it('should build VNode from template', () => {
    const vnode = builder.build('paragraph', { text: 'Hello' });
    expect(vnode.tag).toBe('p');
    expect(vnode.text).toBe('Hello');
  });
});

// DOMReconcile 테스트
describe('DOMReconcile', () => {
  it('should update DOM from VNode changes', () => {
    const prevVNode = { tag: 'p', text: 'Old' };
    const nextVNode = { tag: 'p', text: 'New' };
    
    reconcile(prevVNode, nextVNode, container, context);
    
    expect(container.textContent).toBe('New');
  });
});
```

#### 순수성 보장
```typescript
// VNodeBuilder는 항상 순수 함수
const vnode = builder.build(type, data);
const vnode2 = builder.build(type, data);
expect(vnode).toEqual(vnode2);  // 항상 동일
```

### 5. 상태 관리 분리

#### VNodeBuilder: Side-effect Free
```typescript
// VNodeBuilder는 상태를 변경하지 않음
build(nodeType: string, data: ModelData): VNode {
  // Template lookup만 수행
  // State mutation 없음
  // DOM 조작 없음
}
```

#### DOMReconcile: State Management
```typescript
// DOMReconcile만 상태를 관리
reconcile(prevVNode, nextVNode, container, context) {
  // Component lifecycle
  this.componentManager.updateComponent(...);
  
  // DOM state tracking
  this.workInProgressManager.trackDOMState(wip);
}
```

### 6. 실전 예제

#### 잘못된 설계 (Reconcile에서 VNode 판단)
```typescript
// ❌ 나쁜 설계
reconcile(prevVNode, nextVNode, container, context) {
  const template = this.registry.getTemplate(nextVNode.type);  // ❌ reconcile에서 템플릿 해석
  const computedVNode = this.buildVNode(template, data);      // ❌ reconcile에서 VNode 생성
  
  // ... DOM 업데이트
}
```

**문제점**:
- 책임이 섞임
- 테스트 어려움
- 예측 불가능
- 상태 관리 복잡

#### 올바른 설계 (현재 구조)
```typescript
// ✅ 좋은 설계

// Step 1: VNode 생성 (Render 전)
const vnode = builder.build('paragraph', { text: 'Hello' });
// → 완성된 VNode tree

// Step 2: Reconcile (Render 중)
reconcile(prevVNode, vnode, container, context);
// → VNode 차이만 계산하여 DOM 업데이트
```

**장점**:
- 명확한 책임 분리
- 테스트 용이
- 예측 가능
- 순수 함수 보장

### 7. 전체 파이프라인

```
┌─────────────────────────────────────────────┐
│ 1. Build Phase (VNodeBuilder)             │
│  - "무엇을 렌더링할지" 결정                  │
│  - Template → VNode                         │
│  - 순수 함수, side-effect 없음              │
└────────────────────┬────────────────────────┘
                     │
                     ▼ 완성된 VNode
┌─────────────────────────────────────────────┐
│ 2. Reconcile Phase (DOMReconcile)          │
│  - "어떻게 업데이트할지" 결정               │
│  - VNode → DOM                             │
│  - 상태 관리, DOM 조작                      │
└────────────────────┬────────────────────────┘
                     │
                     ▼ 최종 DOM
```

### 8. 수학적 표현

```
// Build Phase (순수 함수)
f_template : Template × Data → VNode

// Reconcile Phase (상태를 가진 함수)
f_reconcile : VNode × VNode × Container × State → DOM

// 전체 파이프라인
render = f_reconcile ∘ f_template

where:
  f_template has no side effects (pure)
  f_reconcile has side effects (impure but deterministic)
```

### 9. 실전 시나리오

```typescript
// 시나리오: 텍스트 업데이트

// 1. Build Phase: VNode 생성
const prevVNode = builder.build('paragraph', { text: 'Old' });
// → { tag: 'p', text: 'Old' }

const nextVNode = builder.build('paragraph', { text: 'New' });
// → { tag: 'p', text: 'New' }

// 2. Reconcile Phase: DOM 업데이트
reconcile(prevVNode, nextVNode, container, context);
// → detectChanges(): ['text']
// → processElementNode(): domNode.textContent = 'New'
// → finalizeDOMUpdate(): 이미 DOM에 있음, skip append

// 결과: <p>Old</p> → <p>New</p>
// (전체 재생성 없이 텍스트만 변경)
```

### 10. 핵심 원칙 요약

1. **분리**: VNode 생성과 DOM 업데이트는 완전히 분리
2. **단방향**: Build → Reconcile 순서 보장
3. **순수성**: VNodeBuilder는 순수 함수
4. **예측 가능**: VNode는 항상 먼저 완성됨
5. **책임 명확**: 각 레이어의 역할이 분명함
6. **테스트 용이**: 각 레이어를 독립적으로 테스트 가능

## 이 원칙이 중요한 이유

### 1. 디버깅 용이성
- VNode 문제는 Build Phase에서 찾기
- DOM 문제는 Reconcile Phase에서 찾기

### 2. 성능 최적화
- VNode 생성은 캐싱 가능 (순수 함수)
- Reconcile은 변경된 부분만 처리

### 3. 유지보수성
- 각 레이어의 책임이 명확
- 변경 영향 범위가 제한적

### 4. 확장성
- 새로운 템플릿 타입 추가 → VNodeBuilder만 수정
- 새로운 DOM 조작 추가 → DOMReconcile만 수정

## 결론

**Barocss의 핵심 설계 원칙**: VNode는 reconcile에서 동적으로 판단되지 않습니다.

이것은:
- **분리의 원칙** (Separation of Concerns)
- **단방향 데이터 흐름** (Unidirectional Data Flow)  
- **순수 함수 우선** (Pure Functions First)
- **책임의 명확성** (Clear Responsibilities)

를 보장합니다.

