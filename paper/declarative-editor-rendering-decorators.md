# Declarative Editor Rendering - Decorators

## Scope
Decorators are overlay/widget trees rendered independently from the model reconcile. They enable auxiliary UI (comments, tooltips, highlights) without interfering with core updates.

## Model
```typescript
interface DecoratorModel {
  id: string;
  target: string; // data-bc-sid
  position: 'before'|'after'|'inside-start'|'inside-end'|'overlay'|'absolute';
  type: string; // template name
  data: any;
}
```

## Flow
1. Reconcile model into container (exclude decorators)
2. For each decorator: find target, create/reuse container, build VNode, reconcile per-decorator
3. Cleanup removed decorators by id

### Container Placement Logic
```pseudo
switch position:
  case 'before':  parent.insertBefore(container, target)
  case 'after':   parent.insertBefore(container, target.nextSibling)
  case 'inside-start': target.insertBefore(container, target.firstChild)
  case 'inside-end':   target.appendChild(container)
  case 'overlay':  container.style = absolute; target.appendChild(container)
  case 'absolute': container.style = absolute; root.appendChild(container)
```

## Placement
- before/after: sibling containers
- inside-start/inside-end: child containers
- overlay/absolute: absolutely positioned containers

## Measurement & Positioning
- Compute positions with read-only measurement helpers
- Apply styles after reconcile in a separate step
- Cache rects across frames to avoid thrash

## Example
```typescript
defineDecorator('tooltip', element('div', { className: 'tooltip' }, [data('text')]));
renderer.renderDecorators(container, [
  { id: 't1', target: 'para-1', position: 'overlay', type: 'tooltip', data: { text: 'Click to edit' } }
]);
```

References: paper/renderer-decorator-spec.md

## Pseudocode: Decorator Rendering
```pseudo
for each model in decorators:
  target = query(container, `[data-bc-sid="${model.target}"]`)
  if not target: continue
  host = getOrCreateContainer(container, target, model.position, model.sid)
  vnode = build(model.type, model.data)
  reconcile(prevById[model.sid], vnode, host, { excludeDecorators: false })
  prevById[model.sid] = vnode

// cleanup
for id in prevById.keys - ids(decorators):
  remove(`[data-decorator-sid="${id}"]`)
  delete prevById[id]
```
