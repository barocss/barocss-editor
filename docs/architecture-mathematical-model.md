# Barocss Architecture - Mathematical Model

## Overall architecture expressed as mathematical functions

### Basic function definitions

```
f_dsl : DSL Builder → Template
f_template : Template × Data → VNode
f_reconcile : VNode × VNode × Container → DOM
f_render : Model × Container → DOM
```

### Complete function definition

```
f_render = f_reconcile ∘ f_template ∘ f_dsl

render(model, container) = 
  let template = f_dsl(element(...))  // Define template with DSL
      vnode = f_template(template, model)
      dom = f_reconcile(prevVNode, vnode, container)
  in dom
```

### Complete pipeline

```
DSL Builders → Template → VNode → DOM
     ↓              ↓         ↓       ↓
element(...)   Template    VNode    <p>text</p>
data(...)          
when(...)
component(...)
```

## Type signatures of each function

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

**Mathematical properties:**
- **Pure Function**: Always produces same output for same input
- **Composable**: Can compose with other template functions
- **Idempotent**: Performs only pure transformations (no side effects)

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

**Mathematical properties:**
- **Referentially Transparent**: Same input produces same DOM state
- **Deterministic**: No non-deterministic operations (but has DOM side effects)
- **Commutative**: Results may differ by order (priority system)

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

**Mathematical properties:**
- **Associative**: Results are order-independent
- **Idempotent**: Same input produces same output
- **Minimal Change**: Performs only minimal operations of Δ(prev, next)

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

## Function composition

### Complete rendering pipeline

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

### Update scenario

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

## Mathematical property analysis

### 1. Function purity

```
f_template : Template × Data → VNode
  where ∀ input, ∄ (global state mutation)
  
f_reconcile : VNode × VNode × Container → DOM
  where ∃ (DOM side effect) but deterministic
```

**Meaning**: VNodeBuilder is a pure function, but DOMReconcile has side effects on the DOM.

### 2. Function consistency

```
∀ prev, next, container:
  f_reconcile(prev, next, container) ≡ f_reconcile(prev, next, container)
```

**Meaning**: Always guarantees the same output for the same input.

### 3. Function monotonicity

```
VNode₁ ⊆ VNode₂  ⇒  DOM₁ ⊆ DOM₂
```

**Meaning**: As VNode grows, DOM also grows (only additions possible).

### 4. Minimality - Children Reconcile

```
||f_children(prev, next, dom)| ≤ |prev| + |next|
```

**Meaning**: Children reconcile performs at most |prev| + |next| operations.

## Function relationship diagram

### Category Theory perspective

```
Template ──f_template──→ VNode ──f_reconcile──→ DOM
    ↑                           ↑                    ↑
    │                           │                    │
    └─────── isomorphic ────────┴────────────────────┘
```

### Function composition

```
f_render = f_reconcile ∘ (id × f_template)

where id × f_template : Template → VNode × VNode
```

## Mathematical proofs

### Lemma 1: Correctness of Children Reconcile

```
∀ prev, next, dom:
  let dom' = f_children(prev, next, dom)
  then dom'.childNodes.length ≤ max(|prev|, |next|) + |prev ∩ next|
```

**Proof**: Insert operations are at most |next| - |prev|, remove operations are at most |prev| - |next|,
          replacement operations are at most |prev ∩ next|, so the total does not exceed max(|prev|, |next|) + |prev ∩ next|.

### Lemma 2: Idempotence

```
∀ vnode, container:
  f_render(⊥, vnode, container) = 
    f_render(⊥, f_template(template, model), container)
```

**Proof**: First render and re-render produce the same result (assuming container initialization).

### Theorem 1: Consistency of overall function

```
∀ model, container:
  render(model, container) = f_reconcile(⊥, f_template(template, model), container)
```

**Proof**: render is the composition of f_reconcile and f_template.

## Performance analysis (time complexity)

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

## Functional programming perspective

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

## Expressing entire system as function

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

## Functional template builders in DSL package

The DSL package defines templates as functions:

### DSL Builder Functions

```
element : Tag × Attributes × Children → ElementTemplate
data : Path → DataTemplate
when : Condition × Then × Else → ConditionalTemplate
component : Name × Props × Children → ComponentTemplate
slot : Name → SlotTemplate
portal : Target × Children → PortalTemplate
```

### Type signatures

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

### Functional properties

```
element('p', { className: data('cls') }, [data('text')])
  ≡ compose(element('p', _, _), 
             partial(apply, [{ className: data('cls') }]), 
             partial(map, [data('text')]))

where compose : (b → c) × (a → b) → (a → c)
```

**Meaning**: Template builders are pure functions and composable.

### Registry registration

```
define(name, template) = {
  registry[name] = template
} in registry

f_template = registry[name] ∘ f_registry
```

## Core function summary

| Function | Type | Purity | Complexity |
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

## Conclusion

Barocss is composed of the following mathematical functions:

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

**Core mathematical properties:**
1. **Composition**: All functions are composable
2. **Determinism**: Always produces same output for same input
3. **Minimality**: Performs only minimal DOM changes
4. **Idempotence**: Same VNode produces same DOM
5. **Consistency**: Guarantees rendering result consistency
6. **Functional DSL**: Template builders defined as pure functions

### Complete layer structure

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
│ Template → VNode (packages/renderer-dom)                     │
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
