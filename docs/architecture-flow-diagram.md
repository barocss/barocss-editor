# Barocss Architecture Flow Diagram

## 전체 아키텍처 플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Model Data                                   │
│  { stype: 'paragraph', text: 'Hello', className: 'active' }          │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      VNodeBuilder                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 1. Registry에서 템플릿 조회                                     │  │
│  │    template = registry.getTemplate('paragraph')              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 2. 템플릿 → VNode 변환                                         │  │
│  │    - tag: 'p'                                                  │  │
│  │    - text: 'Hello'                                            │  │
│  │    - attrs: { className: 'active' }                            │  │
│  │    - children: []                                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     VNode Tree                                       │
│  {                                                                   │
│    tag: 'p',                                                         │
│    text: 'Hello',                                                    │
│    attrs: { className: 'active' },                                   │
│    children: []                                                      │
│  }                                                                   │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DOMReconcile                                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 1: WIP Tree 생성                                          │  │
│  │  createWorkInProgressTree(nextVNode, prevVNode)               │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │ WIP {                                                   │    │  │
│  │  │   id: 'p-123',                                          │    │  │
│  │  │   type: 'element',                                      │    │  │
│  │  │   vnode: nextVNode,                                     │    │  │
│  │  │   previousVNode: prevVNode,                             │    │  │
│  │  │   domNode: <existing DOM node>,                         │    │  │
│  │  │   changes: ['insert'],                                  │    │  │
│  │  │   needsUpdate: true                                     │    │  │
│  │  │ }                                                        │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 2: 변경사항 감지 및 우선순위 할당                           │  │
│  │  detectChangesAndAssignPriority()                          │  │
│  │  - changes: ['insert', 'attrs', 'text', 'children']         │  │
│  │  - priority: IMMEDIATE / HIGH / NORMAL / LOW / IDLE         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 3: 우선순위별 처리                                        │  │
│  │  processByPriority(context, processWorkInProgress)          │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │ processWorkInProgress(wip):                        │    │  │
│  │  │   switch (wip.type) {                              │    │  │
│  │  │     case 'element':                                 │    │  │
│  │  │       processElementNode(wip)                       │    │  │
│  │  │       - createElement()                            │    │  │
│  │  │       - setAttributes()                            │    │  │
│  │  │       - processTextContent()                      │    │  │
│  │  │       - updateChildren()                           │    │  │
│  │  │       break;                                       │    │  │
│  │  │     case 'component':                              │    │  │
│  │  │       ComponentManager.processComponentNode()     │    │  │
│  │  │       break;                                       │    │  │
│  │  │     case 'portal':                                 │    │  │
│  │  │       PortalManager.processPortalNode()           │    │  │
│  │  │       break;                                       │    │  │
│  │  │   }                                                 │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 4: DOM 업데이트 실행                                     │  │
│  │  executeDOMUpdates(container, finalizeDOMUpdate)            │  │
│  │                                                              │  │
│  │  ┌────────────────────────────────────────────────────┐    │  │
│  │  │ finalizeDOMUpdate(wip):                            │    │  │
│  │  │   if (wip.domNode.parentNode === parent) {        │    │  │
│  │  │     // Already in DOM, skip                        │    │  │
│  │  │     return;                                        │    │  │
│  │  │   }                                                │    │  │
│  │  │   parent.appendChild(wip.domNode);                 │    │  │
│  │  │                                                     │    │  │
│  │  └────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DOM                                        │
│                    <p class="active">Hello</p>                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Children Reconcile 상세 플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                     updateChildren(wip)                              │
│                                                                      │
│  prevChildren (from DOM)    nextChildren (from VNode)              │
│  ┌─────────────────┐        ┌──────────────────┐                  │
│  │ [{tag:'p', ...} │ ←→     │ [{tag:'p', ...}, │                  │
│  │  ]              │        │  {tag:'p', ...}  │                  │
│  └─────────────────┘        └──────────────────┘                  │
│                                                                      │
│  reconcileChildren(wip, prevChildren, nextChildren)                 │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│               React-style Reconciliation Loop                       │
│                                                                      │
│  domIndex = 0, prevIndex = 0, nextIndex = 0                         │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Loop: while (prevIndex < prevChildren.length ||              │  │
│  │         nextIndex < nextChildren.length)                     │  │
│  │                                                               │  │
│  │  Case 1: !nextChild                                          │  │
│  │    → Remove DOM node                                          │  │
│  │                                                               │  │
│  │  Case 2: !prevChild                                          │  │
│  │    → Create new DOM node                                      │  │
│  │    → insertBefore(newNode, referenceNode)                    │  │
│  │    → childWip.domNode = newNode  ⭐ 중요                     │  │
│  │                                                               │  │
│  │  Case 3: isSameNode(prevChild, nextChild)                    │  │
│  │    → Skip (already in DOM)                                   │  │
│  │                                                               │  │
│  │  Case 4: Different nodes                                     │  │
│  │    → replaceChild(oldNode, newNode)                         │  │
│  │    → childWip.domNode = newNode  ⭐ 중요                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    finalizeDOMUpdate(childWip)                       │
│                                                                      │
│  isAlreadyInDOM = childWip.domNode.parentNode === parent            │
│                                                                      │
│  if (isAlreadyInDOM) {                                               │
│    // Already in DOM, skip append                                   │
│    return;                                                            │
│  }                                                                    │
│                                                                      │
│  parent.appendChild(childWip.domNode);                               │
└─────────────────────────────────────────────────────────────────────┘
```

## 컴포넌트 처리 플로우

```
┌─────────────────────────────────────────────────────────────────────┐
│                     VNode with Component                             │
│  {                                                                   │
│    component: {                                                      │
│      name: 'Button',                                                 │
│      props: { onClick: handleClick },                                │
│      state: { count: 0 }                                             │
│    }                                                                 │
│  }                                                                   │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│              processComponentNode(wip)                               │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ ComponentManager.processComponentNode(wip, context)           │  │
│  │                                                               │  │
│  │  if (instance exists) {                                      │  │
│  │    updateComponent(prevVNode, nextVNode, ...)               │  │
│  │    - hasPropsChanged?                                         │  │
│  │    - component.update?(instance, prevProps, nextProps)       │  │
│  │    - reconcile component children                             │  │
│  │  } else {                                                     │  │
│  │    mountComponent(nextVNode, ...)                            │  │
│  │    - create component instance                               │  │
│  │    - call component.init()                                   │  │
│  │    - render component template                               │  │
│  │    - reconcile component content                              │  │
│  │  }                                                            │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Component Instance DOM                              │
│              <button onClick={...}>Click me</button>                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Update 시나리오

```
┌─────────────────────────────────────────────────────────────────────┐
│                 First Render                                         │
│  renderer.render(container, model)                                    │
│    ↓                                                                 │
│  Model → VNode → DOM                                                │
│    ↓                                                                 │
│  DOM: <div><p>Old</p></div>                                         │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            │ model.text = 'New'
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Second Render                                        │
│  renderer.render(container, model)                                  │
│    ↓                                                                 │
│  prevVNode: { tag: 'p', text: 'Old' }                               │
│  nextVNode: { tag: 'p', text: 'New' }                              │
│    ↓                                                                 │
│  detectChanges(prevVNode, nextVNode)                                 │
│    → changes: ['text']                                              │
│    ↓                                                                 │
│  processElementNode(wip)                                            │
│    if (changes.includes('text')) {                                 │
│      targetDomNode.textContent = 'New'                              │
│    }                                                                 │
│    ↓                                                                 │
│  finalizeDOMUpdate(wip)                                              │
│    isAlreadyInDOM: true → skip                                      │
│    ↓                                                                 │
│  DOM: <div><p>New</p></div>                                         │
└─────────────────────────────────────────────────────────────────────┘
```

## 핵심 개념

### 1. VNodeBuilder (DSL → VNode)
- Template registry 조회
- Data binding (data(), className, style 등)
- Component resolution
- Conditional rendering (build time)
- DSL → VNode 변환만 담당

### 2. DOMReconcile (VNode → DOM)
- VNode 차이 감지
- WIP 트리 생성 및 관리
- 우선순위 기반 처리
- 최소 DOM 변경 적용
- DOM의 실제 상태만 담당

### 3. Children Reconcile
- React-style reconciliation
- DOM 노드 재사용
- Index 기반 매칭
- WIP의 domNode 설정 필수

### 4. WIP 패턴
- 변경사항을 일괄 처리
- 우선순위 기반 처리
- 불필요한 DOM 조작 최소화

