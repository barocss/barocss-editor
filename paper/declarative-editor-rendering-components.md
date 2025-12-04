# Declarative Editor Rendering - Components

## Scope
Components are the extensibility points of the renderer. There are two kinds:
- Context components: declarative, render with props/state from a context
- External components: imperative integrations with `mount/update/unmount`

This chapter complements the DSL: it increases reuse when plain `element` structure is not expressive enough or when integrating external systems.

## Context Components
- Pure functions `(props, context) => template`
- `context`: `state`, `setState`, `initState`, `emit`, etc.
- Ideal for UI bound to model data without direct DOM management

Example:
```typescript
registry.registerContextComponent('counter', (props, ctx) => {
  ctx.initState({ count: 0 });
  return element('button', { onClick: () => ctx.setState({ count: ctx.state.count + 1 }) }, [text(`${ctx.state.count}`)]);
});
```

## External Components
- Provide `mount(container, props) → HTMLElement`
- Optional `update(element, prevProps, nextProps)` and `unmount(element)`
- `managesDOM` indicates ownership of child DOM
- Suitable for editors/canvas/video players/3rd-party widgets

Example:
```typescript
registry.registerComponent('markdown-editor', {
  mount(container, props) { /* init and return root element */ },
  update(el, prev, next) { /* update only when props change */ },
  unmount(el) { /* cleanup */ },
  managesDOM: true
});
```

### State Management (Context)
```pseudo
ctx.state: Record<string, any>
ctx.initState(initial)  // once per instance
ctx.setState(partial)   // merges and triggers partial re-render
ctx.getState(key)       // get specific state value
ctx.toggleState(key)    // toggle boolean state
```

## Lifecycle (Conceptual)
1. Mount: first render → `mount` or function execution
2. Update: on props/state change → re-render or `update`
3. Unmount: detach and cleanup

Policy:
- managesDOM=false → renderer reconciles children
- managesDOM=true → renderer preserves area; component updates its own subtree

## Guidance
- Prefer context components for most editor UI
- Use external components only when imperative control is necessary

Integration with the DSL:
- Use `component(name, props, children?)` within templates to compose complex UIs.
- Combine with `slot(name)` to pass structured children from the model.
- External components should set `managesDOM=true` when they own their subtree to avoid reconcile conflicts.

## Design Trade-offs
- Simplicity vs power: context components avoid lifecycle hooks to stay predictable
- Interop: external components bridge to rich widgets without leaking policies into the renderer
- Testability: declarative components are easier to snapshot and diff

References: paper/renderer-component-spec.md

## Pseudocode: Lifecycle Semantics
```pseudo
// Context component
render(props, ctx):
  if not ctx.state._initialized and initialState exists:
    ctx.initState(initialState)
  return template(props, ctx)

// External component
mount(container, props) → element
update(element, prevProps, nextProps) // only when needed
unmount(element) // release resources

policy:
  managesDOM=false → reconcile children under element
  managesDOM=true  → renderer does not touch children
```
