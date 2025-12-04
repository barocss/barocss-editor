# Declarative Editor Rendering - Case Studies

## Case 1: Large Document (10k blocks) with Live Typing

Goal: keep typing latency low while reordering blocks occasionally.

Approach:
- Use keys on blocks (`data-bc-sid=block.sid`)
- rAF scheduler for non-critical updates; microtask for input echo
- Avoid rebuilding stable subtrees

Pseudocode:
```pseudo
onInput(textChange):
  applyToModel(change)
  next = build('doc', model)
  schedMicrotask.enqueue(prev, next, container)
  prev = next

onReorder(blockIds):
  model.blocks = reorder(model.blocks, blockIds)
  next = build('doc', model)
  schedRAF.enqueue(prev, next, container)
  prev = next
```

Evaluation:
- Typing path stays responsive; reorder is batched per frame
- Minimal DOM due to keyed reuse of blocks

## Case 2: IME Composition + Selection Preserve

Goal: do not break IME; keep selection stable during updates.

Approach:
- Upper layer manages IME; renderer exposes optional selection-preserve flag
- Skip mutating text nodes under active composition region

Pseudocode:
```pseudo
render(prev, next, container, { preserveSelection: true })
```

Evaluation:
- IME flow remains intact; selection restores after reconcile

## Case 3: Overlays at Scale (hundreds of decorators)

Goal: render annotations and tooltips without impacting model reconcile.

Approach:
- Model reconcile excludes decorators
- Render decorators per-target; batch with rAF

Pseudocode:
```pseudo
batchDecorators(models):
  requestAnimationFrame(() => renderDecorators(container, models))
```

Evaluation:
- Core stays fast; overlays update independently

## Case 4: External Component (Markdown Editor)

Goal: integrate third-party editor widget.

Approach:
- External component with `mount/update/unmount`, `managesDOM=true`
- Keyed usage for stable reuse

Pseudocode:
```pseudo
define('md-editor', { mount, update, unmount, managesDOM: true })

view = element('div', [ component('md-editor', { content, onChange }) ])
```

Evaluation:
- Widget lifecycle isolated; renderer preserves host area
