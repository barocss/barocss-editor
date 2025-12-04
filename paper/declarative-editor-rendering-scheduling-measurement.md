# Declarative Editor Rendering - Scheduling & Measurement

## Scheduling
- Purpose: coalesce frequent render requests into a single frame/tick
- Modes: requestAnimationFrame, microtask, immediate
- Policy: caller decides; critical input can use microtask, general updates rAF

### Coalescing Guarantees
- Within a scheduling window, only the last `(prev,next)` pair per container is rendered
- Windows: frame-based (rAF) or microtask queue

Example (microtask coalescing):
```typescript
const sched = new ReconcileScheduler((prev, next, c) => render(prev, next, c), 'microtask');
let prev: any = null;
function update(model: any) {
  const next = build('doc', model);
  sched.enqueue(prev, next, container);
  prev = next;
}
```

## Measurement (Read-only)
- Use getBoundingClientRect / getClientRects via helpers
- Never mutate DOM during measure; cache as needed

```typescript
const rect = getElementRect(node);
const rects = getClientRectsOfNode(textNode);
const { x, y } = getScrollOffsets();
```

## Guidance
- Batch non-critical updates; avoid layout thrash
- Separate measure → mutate steps
- Keep overlay positioning outside core reconcile

