# Barocss Architecture - Mathematical Model

## 수학 함수로 표현한 전체 아키텍처

### 기본 함수 정의

```
f_dsl : DSL Builder → Template
f_template : Template × Data → VNode
f_reconcile : VNode × VNode × Container → DOM
f_render : Model × Container → DOM
```

### 완전한 함수 정의

```
f_render = f_reconcile ∘ f_template ∘ f_dsl

render(model, container) = 
  let template = f_dsl(element(...))  // DSL로 템플릿 정의
      vnode = f_template(template, model)
      dom = f_reconcile(prevVNode, vnode, container)
  in dom
```

### 전체 파이프라인

```
DSL Builders → Template → VNode → DOM
     ↓              ↓         ↓       ↓
element(...)   Template    VNode    <p>text</p>
data(...)          
when(...)
component(...)
```

## 각 함수의 타입 시그니처

### 1. VNodeBuilder: `f_template`

```
f_template : Template × Data → VNode

f_template(template, data) = {
  tag: resolve(template.tag, data),
  attrs: map(λ attr → evaluate(attr, data), template.attributes),
  children: flatMap(λ child → f_template(child, data), template.children),
  component: if (isComponent(template)) then buildComponent(template, data) else null
}
```

**수학적 특성**:
- **Pure Function**: 같은 입력에 대해 항상 같은 출력
- **Composable**: 다른 템플릿 함수와 합성 가능
- **Idempotent**: 순수 변환만 수행 (side effect 없음)

### 2. DOMReconcile: `f_reconcile`

```
f_reconcile : VNode × VNode × Container → DOM

f_reconcile(prev, next, container) = {
  wip = createWIP(prev, next, container),
  changes = detectChanges(prev, next),
  priority = assignPriority(changes),
  dom = processByPriority(wip, changes, priority),
  result = finalize(dom, container)
} in result
```

**수학적 특성**:
- **Referentially Transparent**: 입력이 같으면 같은 DOM 상태 생성
- **Deterministic**: non-deterministic operation 없음 (단, DOM side effect 있음)
- **Commutative**: 순서에 따라 결과가 달라질 수 있음 (우선순위 시스템)

### 3. Children Reconcile: `f_children`

```
f_children : [VNode] × [VNode] × DOMNode → DOMNode

f_children(prevChildren, nextChildren, domNode) = {
  let domIndex = 0, prevIndex = 0, nextIndex = 0
  while (prevIndex < length(prevChildren) ∨ nextIndex < length(nextChildren)) {
    case (prevChildren[prevIndex], nextChildren[nextIndex]) of
      (⊥, next) → insert(next, domNode, domIndex); nextIndex++
      (prev, ⊥) → remove(domIndex, domNode); prevIndex++
      (prev, next) where prev = next → skip(); domIndex++  
      (prev, next) → replace(domIndex, domNode, next); domIndex++
  }
} in domNode
```

**수학적 특성**:
- **Associative**: 결과는 순서에 독립적
- **Idempotent**: 같은 입력에 대해 같은 출력
- **Minimal Change**: Δ(prev, next)의 최소 연산만 수행

### 4. Change Detection: `detectChanges`

```
detectChanges : VNode × VNode → Set(Change)

detectChanges(prev, next) = {
  tagChanged := (prev.tag ≠ next.tag),
  textChanged := (prev.text ≠ next.text),
  attrsChanged := (prev.attrs ≠ next.attrs),
  styleChanged := (prev.style ≠ next.style),
  childrenChanged := detectChildren(prev.children, next.children)
} in { tagChanged ? 'tag' : ∅,
       textChanged ? 'text' : ∅,
       attrsChanged ? 'attrs' : ∅,
       styleChanged ? 'style' : ∅,
       childrenChanged ? 'children' : ∅ }
```

### 5. Priority Assignment: `assignPriority`

```
assignPriority : Set(Change) × VNode → Priority

assignPriority(changes, vnode) = {
  if 'tag' ∈ changes ∨ 'component' ∈ changes
    then IMMEDIATE
  else if 'children' ∈ changes
    then HIGH
  else if 'attrs' ∈ changes ∨ 'style' ∈ changes
    then NORMAL
  else if 'text' ∈ changes
    then LOW
  else IDLE
}
```

## 함수 합성 (Composition)

### 전체 렌더링 파이프라인

```
render = finalize ∘ process ∘ detect ∘ createWIP ∘ f_template

render(model, container) = 
  let template = registry.lookup(model.stype)
      vnode = f_template(template, model)
      wip = createWIP(null, vnode, container)
      changes = detectChanges(null, vnode)
      priority = assignPriority(changes)
      dom = processByPriority(wip, changes, priority)
      result = finalizeDOMUpdate(dom, container)
  in result
```

### Update 시나리오

```
update(prevModel, nextModel, container) =
  let prevVNode = f_template(lookup(prevModel.stype), prevModel)
      nextVNode = f_template(lookup(nextModel.stype), nextModel)
      wip = createWIP(prevVNode, nextVNode, container)
      changes = detectChanges(prevVNode, nextVNode)
      priority = assignPriority(changes)
      dom = processByPriority(wip, changes, priority)
      result = finalizeDOMUpdate(dom, container)
  in result
```

## 수학적 특성 분석

### 1. 함수의 순수성 (Purity)

```
f_template : Template × Data → VNode
  where ∀ input, ∄ (global state mutation)
  
f_reconcile : VNode × VNode × Container → DOM
  where ∃ (DOM side effect) but deterministic
```

**의미**: VNodeBuilder는 순수 함수지만, DOMReconcile은 DOM에 side effect를 가합니다.

### 2. 함수의 일관성 (Consistency)

```
∀ prev, next, container:
  f_reconcile(prev, next, container) ≡ f_reconcile(prev, next, container)
```

**의미**: 같은 입력에 대해 항상 같은 출력을 보장합니다.

### 3. 함수의 단조성 (Monotonicity)

```
VNode₁ ⊆ VNode₂  ⇒  DOM₁ ⊆ DOM₂
```

**의미**: VNode가 커지면 DOM도 커집니다 (추가만 가능).

### 4. 최소성 (Minimality) - Children Reconcile

```
|f_children(prev, next, dom)| ≤ |prev| + |next|
```

**의미**: Children reconcile는 최대 prev + next만큼의 연산만 수행합니다.

## 함수 관계 다이어그램

### Category Theory 관점

```
Template ──f_template──→ VNode ──f_reconcile──→ DOM
    ↑                           ↑                    ↑
    │                           │                    │
    └─────── isomorphic ────────┴────────────────────┘
```

### Function Composition

```
f_render = f_reconcile ∘ (id × f_template)

where id × f_template : Template → VNode × VNode
```

## 수학적 증명

### 보조정리 1: Children Reconcile의 Correctness

```
∀ prev, next, dom:
  let dom' = f_children(prev, next, dom)
  then dom'.childNodes.length ≤ max(|prev|, |next|) + |prev ∩ next|
```

**증명**: insert 연산은 최대 |next| - |prev|, remove 연산은 최대 |prev| - |next|,
           교체 연산은 최대 |prev ∩ next|이므로, 전체는 max(|prev|, |next|) + |prev ∩ next|를 넘지 않는다.

### 보조정리 2: Idempotence

```
∀ vnode, container:
  f_render(⊥, vnode, container) = 
    f_render(⊥, f_template(template, model), container)
```

**증명**: 첫 렌더링과 재렌더링이 같은 결과를 생성한다 (단, container 초기화 가정).

### 정리 1: 전체 함수의 일관성

```
∀ model, container:
  render(model, container) = f_reconcile(⊥, f_template(template, model), container)
```

**증명**: render는 f_reconcile과 f_template의 합성이다.

## 성능 분석 (시간 복잡도)

### VNodeBuilder: O(|template|)

```
T_template(n) = O(n)
  where n = |template.nodes| + |template.children|
```

### DOMReconcile: O(|vnode| × log(|vnode|))

```
T_reconcile(n) = 
  O(n) for WIP tree creation +
  O(n) for change detection +
  O(n log n) for priority-based processing +
  O(n) for DOM updates
  
  = O(n log n)
```

### Children Reconcile: O(|prev| + |next|)

```
T_children(p, n) = O(p + n)
  where p = |prev|, n = |next|
```

## 함수형 프로그래밍 관점

### Functor Law

```
f_template(map(λ x → f(x), data)) ≡ map(f_template(template, _), data)
```

### Natural Transformation

```
τ : Template → VNode

τ(template₁ ∘ template₂) = τ(template₁) ∘ τ(template₂)
```

### Monad (for Component State)

```
Component ∷ * → *
  where Component[State] = (state: State) → VNode
```

## 전체 시스템을 함수로 표현

```
System : Model × Time → DOM

System(model, t) = {
  if t = 0 then
    f_render(model, createContainer())
  else
    let prevVNode = System(model, t - 1)
        nextVNode = f_template(lookup(model), model)
        dom = f_reconcile(prevVNode, nextVNode, getContainer())
    in dom
}
```

## DSL 패키지의 함수형 템플릿 빌더

DSL 패키지는 템플릿을 함수로 정의합니다:

### DSL Builder Functions

```
element : Tag × Attributes × Children → ElementTemplate
data : Path → DataTemplate
when : Condition × Then × Else → ConditionalTemplate
component : Name × Props × Children → ComponentTemplate
slot : Name → SlotTemplate
portal : Target × Children → PortalTemplate
```

### 타입 시그니처

```
element(tag, attrs, children) = {
  type: 'element',
  tag: Tag,
  attributes: Attrs,
  children: Children
}

data(path) = {
  type: 'data',
  path: String,
  getter: λ d → resolve(path, d),
  defaultValue: any
}

when(condition, then, else) = {
  type: 'conditional',
  condition: λ d → Boolean,
  template: then,
  elseTemplate: else
}

component(name, props, children) = {
  type: 'component',
  name: String,
  props: Props,
  children: Children
}
```

### 함수형 특성

```
element('p', { className: data('cls') }, [data('text')])
  ≡ compose(element('p', _, _), 
             partial(apply, [{ className: data('cls') }]), 
             partial(map, [data('text')]))

where compose : (b → c) × (a → b) → (a → c)
```

**의미**: 템플릿 빌더는 순수 함수이고, 합성 가능합니다.

### Registry에 등록

```
define(name, template) = {
  registry[name] = template
} in registry

f_template = registry[name] ∘ f_registry
```

## 핵심 함수 정리

| 함수 | 타입 | 순수성 | 복잡도 |
|------|------|--------|--------|
| `element` (DSL) | `Tag × Attrs × Children → Template` | Pure | O(1) |
| `data` (DSL) | `Path → Template` | Pure | O(1) |
| `when` (DSL) | `Condition × Then × Else → Template` | Pure | O(1) |
| `f_template` | `Template × Data → VNode` | Pure | O(n) |
| `f_reconcile` | `VNode × VNode × Container → DOM` | Impure* | O(n log n) |
| `f_children` | `[VNode] × [VNode] × DOMNode → DOMNode` | Impure* | O(p+n) |
| `detectChanges` | `VNode × VNode → Set(Change)` | Pure | O(n) |
| `assignPriority` | `Set(Change) × VNode → Priority` | Pure | O(1) |

*Impure with side effects but deterministic

## 결론

Barocss는 다음과 같은 수학 함수로 구성됩니다:

```
render = finalize ∘ process ∘ detect ∘ createWIP ∘ f_template ∘ f_dsl

where:
  f_dsl : Builder → Template (pure)
  f_template : Template × Data → VNode (pure)
  detect : VNode × VNode → Set(Change) (pure)
  createWIP : VNode × VNode → WIP (pure)
  process : WIP × Changes → DOM (impure, deterministic)
  finalize : DOM × Container → DOM (impure, deterministic)
```

**핵심 수학 특성**:
1. **Composition**: 모든 함수는 합성 가능
2. **Determinism**: 같은 입력에 대해 항상 같은 출력
3. **Minimality**: 최소한의 DOM 변경만 수행
4. **Idempotence**: 같은 VNode는 같은 DOM 생성
5. **Consistency**: 렌더링 결과 일관성 보장
6. **Functional DSL**: 템플릿 빌더는 순수 함수로 정의

### 전체 레이어 구조

```
┌─────────────────────────────────────────────────────────────┐
│ DSL Layer (packages/dsl)                                      │
│  - element, data, when, component, slot, portal             │
│  - Pure functions, composable, side-effect free             │
│  - Output: Template                                          │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ Template → VNode (packages/vnode)                            │
│  - VNodeBuilder: Template × Data → VNode                   │
│  - Pure function, deterministic                             │
│  - Output: VNode Tree                                        │
└────────────────────┬──────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│ VNode → DOM (packages/renderer-dom)                          │
│  - DOMReconcile: VNode × VNode → DOM                       │
│  - Impure (DOM side effects) but deterministic             │
│  - Output: DOM                                               │
└─────────────────────────────────────────────────────────────┘
```

