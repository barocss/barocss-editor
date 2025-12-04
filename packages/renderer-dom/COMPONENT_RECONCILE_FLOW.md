## DOMRenderer Component Reconciliation Architecture

This document describes how contextual/external components are rendered and updated during reconciliation in `@barocss/renderer-dom`, with emphasis on state preservation and children reordering.

### 1) Responsibilities: Build vs Reconcile
- Build (VNodeBuilder)
  - For components, returns a wrapper VNode (host descriptor) that represents the component as an opaque node:
    - `tag: 'div'`
    - `attrs: { 'data-bc-stype': 'component', 'data-bc-component': '<name>', 'data-bc-sid'?: '<id>' }`
    - `component: { name: string, props?: Record<string, any> }`
  - Does not execute component templates at build-time (prevents state loss/duplication and keeps component atomic at reconcile time).

- Reconcile (DOMReconcile + ComponentManager)
  - Treats the component VNode as an opaque unit when adjusting the parent’s children (host node moves, but inner structure is managed separately).
  - Mounts/updates/unmounts components via ComponentManager using the host element.

Sequence (high-level)
```
Editor(build+render)
  → DOMRenderer.build(model)
    → VNodeBuilder: returns component wrapper VNode (no inner execution)
  → DOMRenderer.render(container, vnode)
    → DOMReconcile.reconcile(prev, next, container, ctx)
      → on component WIP: ComponentManager.mount/update → (re)build inner VNode → reconcile(innerPrev, innerNext, host)
```

### 2) Component Mount (insert)
1. DOMReconcile processes a component WIP with `changes` including `insert`.
2. A host HTMLElement is created from the wrapper VNode’s tag/attrs and appended to the parent container.
3. ComponentManager.mountComponent is called:
   - An instance is created `{ id, name, props, state, element, mounted }` and stored in an instance map keyed by `id`.
   - A live component context is provided (`initState`, `getState`, `setState`, `toggleState`).
   - The component template is executed with (props, ctx) to produce an ElementTemplate.
   - The ElementTemplate is built into an internal VNode.
   - A recursive reconcile is called with `reconcile(null, internalVNode, host, ctx)` to render the component contents into its host element.

Mount pseudocode
```ts
// on component insert
const host = createHostFromWrapperVNode(vnode);
append(parent, host);
const instance = ensureInstance(vnode); // id from data-bc-sid or derived
const ctx = makeContext(instance);
const elementTemplate = component.template(instance.props, ctx);
const innerVNode = builder.buildFromElementTemplate(elementTemplate, instance.props);
reconcile(null, innerVNode, host, ctx);
```

Identity and instance id:
- Priority for instance id: `data-bc-sid` if present; otherwise a stable fallback can be derived from `(name, props)` hashing to avoid accidental collisions.
- The instance map preserves component state across reorders/moves.

### 3) Component Update (same component)
1. When the parent reconciles, component wrapper VNodes are matched (by key when present; otherwise by exact attributes such as `data-bc-stype`, `data-bc-component`, and ideally `data-bc-sid`).
2. If matched (no type/name change), ComponentManager.updateComponent is used:
   - Previous and next templates are executed with previous/next state snapshots.
   - Both are built into `prevInternalVNode`/`nextInternalVNode`.
   - A nested reconcile updates only the host’s contents: `reconcile(prevInternalVNode, nextInternalVNode, host, ctx)`.
3. If the component name or stype changes, the component is replaced (unmount previous, mount next).

Update pseudocode
```ts
// same component (name/stype equal)
const prevState = instance.lastRenderedState ?? clone(instance.state);
const prevTemplate = component.template(prevProps, ctxWith(prevState));
const nextTemplate = component.template(nextProps, ctxWith(instance.state));
const prevInner = builder.buildFromElementTemplate(prevTemplate, prevProps);
const nextInner = builder.buildFromElementTemplate(nextTemplate, nextProps);
reconcile(prevInner, nextInner, host, ctx);
instance.lastRenderedState = clone(instance.state);
```

### 4) Component Unmount (remove/replace)
- ComponentManager.unmountComponent cleans up the instance, calls `component.unmount` when applicable, and removes the host element if appropriate.

### 5) setState → Full Rerender Contract
- `ctx.setState(partial)` merges state into the instance.
- ComponentManager triggers `onRerenderCallback()` which `DOMRenderer` wires to perform a full top-level build and reconcile.
- During the next reconcile, the component is recognized as the same instance (by id) and only host-internal DOM is updated.

setState pseudocode
```ts
ctx.setState = (patch) => {
  instance.state = { ...instance.state, ...patch };
  onRerenderCallback?.(); // DOMRenderer wires this to: rebuild(rootModel) + reconcile
};
```

### 6) Children Reordering and State Preservation
To ensure stateful components are not remounted during parent children changes:
- Treat component nodes as opaque at the parent level (do not inspect their internals when matching children).
- Matching order:
  1. Key (when provided on element/component): preserves identity across moves.
  2. Exact attributes for components (`data-bc-stype`, `data-bc-component`, `data-bc-sid` when present).
  3. Avoid relying solely on positional match for stateful components. If keys are absent, prefer attribute-based exact match first to reduce unnecessary replacements.

Guideline:
- For dynamic lists of components, specify a stable `key` (or stable `data-bc-sid`) to guarantee identity across insertions/removals/reorders.

Matching priority (parent reconciler)
```
1. key (if provided)
2. for component wrappers: exact match on
   - data-bc-stype === 'component'
   - data-bc-component === name
   - data-bc-sid (when present)
3. position-based only as last resort
```

### 7) External Components
- External components (`managesDOM === true` or explicit `type: 'external'`) mount into the host using their own `mount(props, container)` lifecycle and are considered opaque; reconcile avoids touching their inner DOM.
- Updates call the external `update` when available; otherwise a replace may occur based on props/type deltas.

### 8) Error Handling Considerations
- Host creation and nested reconcile must succeed; otherwise a visible placeholder can be inserted for diagnostics.
- Ensure the nested reconcile uses the host as the container, not the parent, to avoid “append/skip” mismatches.

Common pitfalls
- Executing component templates during Build causes double render and state loss. Always execute at mount/update in reconcile.
- Using real DOM traversal for sibling calculation at parent level can disturb component hosts; prefer WIP ordering.
- Missing `reconcile` function on context for nested renders leads to placeholders staying in the host.

### 9) Invariants and Rationale
- Component wrapper VNode is the single source of truth for identity at the parent level.
- Component internal tree is rendered via nested reconcile rooted at the host, preventing parent list operations from disturbing component internals.
- `setState` never mutates DOM directly; it only schedules a new top-level reconcile that re-enters the component update path.

### 10) Practical Tips
- Prefer explicit keys on repeated components for predictable moves.
- Keep `data-bc-sid` stable to minimize accidental remounts.
- Ensure component wrapper VNodes always include `data-bc-stype: 'component'` and `data-bc-component: '<name>'` so the reconciler can match them reliably.

Minimal end-to-end example
```ts
// build & initial render
const vnode = renderer.build(model, decorators);
renderer.render(container, vnode);

// inside a contextual component template
define('counter', (props, ctx) => {
  ctx.initState({ count: 0 });
  return element('div', [ data(() => String(ctx.state.count)) ]);
});

// user interaction inside component
// ctx.setState({ count: ctx.state.count + 1 })
// → ComponentManager performs local (host-scoped) nested reconcile without full rerender
```


