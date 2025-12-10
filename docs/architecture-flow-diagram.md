# Barocss Architecture Flow Diagram

## Overall Architecture Flow

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
│  │ 1. Look up template from Registry                             │  │
│  │    template = registry.getTemplate('paragraph')              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 2. Template → VNode conversion                               │  │
│  │    - tag: 'p'                                                 │  │
│  │    - text: 'Hello'                                           │  │
│  │    - attrs: { className: 'active' }                           │  │
│  │    - children: []                                             │  │
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
│  │ Step 1: Create WIP Tree                                       │  │
│  │  createWorkInProgressTree(nextVNode, prevVNode)               │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │ WIP {                                                 │    │  │
│  │  │   id: 'p-123',                                        │    │  │
│  │  │   type: 'element',                                    │    │  │
│  │  │   vnode: nextVNode,                                   │    │  │
│  │  │   previousVNode: prevVNode,                          │    │  │
│  │  │   domNode: <existing DOM node>,                       │    │  │
│  │  │   changes: ['insert'],                                │    │  │
│  │  │   needsUpdate: true                                   │    │  │
│  │  │ }                                                      │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 2: Detect changes and assign priority                  │  │
│  │  detectChangesAndAssignPriority()                          │  │
│  │  - changes: ['insert', 'attrs', 'text', 'children']         │  │
│  │  - priority: IMMEDIATE / HIGH / NORMAL / LOW / IDLE         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Step 3: Process by priority                                  │  │
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
│  │ Step 4: Execute DOM updates                                  │  │
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
│                    <p class="active">Hello</p>                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Children Reconcile Detailed Flow

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
│  │    → childWip.domNode = newNode  ⭐ Important                │  │
│  │                                                               │  │
│  │  Case 3: isSameNode(prevChild, nextChild)                    │  │
│  │    → Skip (already in DOM)                                   │  │
│  │                                                               │  │
│  │  Case 4: Different nodes                                     │  │
│  │    → replaceChild(oldNode, newNode)                         │  │
│  │    → childWip.domNode = newNode  ⭐ Important                │  │
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
│    return;                                                           │
│  }                                                                    │
│                                                                      │
│  parent.appendChild(childWip.domNode);                               │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Processing Flow

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

## Update Scenario

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

## Core Concepts

### 1. VNodeBuilder (DSL → VNode)
- Template registry lookup
- Data binding (data(), className, style, etc.)
- Component resolution
- Conditional rendering (build time)
- Only responsible for DSL → VNode conversion

### 2. DOMReconcile (VNode → DOM)
- VNode difference detection
- WIP tree creation and management
- Priority-based processing
- Apply minimal DOM changes
- Only responsible for actual DOM state

### 3. Children Reconcile
- React-style reconciliation
- DOM node reuse
- Index-based matching
- Must set WIP's domNode

### 4. WIP Pattern
- Batch process changes
- Priority-based processing
- Minimize unnecessary DOM manipulation
