# Declarative Editor Rendering - Architecture

## Abstract
We present a renderer-centric architecture for editors that separates pure rendering from editing policies. The core is a single-path reconcile over a VNode tree, augmented by a DSL for template authoring, a component model (context vs external), and a decorator layer for overlays.

## 1. Goals
- Predictable, minimal DOM updates (single reconcile path)
- Declarative templates and clear data flow (model → template → VNode → DOM)
- Strict separation of concerns: rendering vs editing/input
- Extensibility: components for integration, decorators for overlays
- Flexible editing composition: bind editing policies to the model and templates to drastically reduce effort when building new editors
- 1:1 model-to-render mapping: `type`-driven templates eliminate bespoke render logic so authors focus on modeling, not DOM details

## 2. Model → VNode → DOM
- Input: model data (plain objects)
- Templates: defined via the DSL, resolved via a registry
- Build: a VNode tree representing desired DOM
- Reconcile: diff prev/next VNode and update DOM minimally

## 3. VNode Model (Conceptual)
- tag, attrs, style, text, children
- component?: { name: string; props: Record<string, any> }
- special markers: `data-bc-sid` (keys), `data-decorator` (exclusion), namespaces

### 3.1 Data Structures (Normative)
```pseudo
type Attrs = Map<string, string|number|boolean>
type Style = Map<string, string|number>

record VNode {
  tag?: string            // omitted for text and special nodes
  attrs?: Attrs           // includes className → normalized to class
  style?: Style           // kebab or camel accepted; renderer normalizes
  text?: string           // text-only node when tag is absent
  children?: VNode[]      // empty or omitted when text is set
  component?: { name: string, props: Map<string, any> }
  when?: { condition: (data)=>bool, template: Template }
}

record Template { /* DSL-emitted structure; converted into VNode */ }
```

## 4. Reconcile Core
- Single function processes text/elements/components/when-nodes uniformly
- Keyed child matching (`data-bc-sid`) enables move/reuse
- Exclusion: decorators/widgets bypass model reconcile
- Namespace-aware DOM creation (HTML/SVG/MathML)

References: packages/renderer-dom/src/reconcile.ts

### 4.1 Correctness Invariants
- Structural type safety: if `data-bc-stype` changes, node is replaced (no unsafe reuse)
- Key identity: nodes with identical keys represent the same logical entity across renders
- Event idempotence: attribute/event updates are applied only when changed
- Error isolation: failures are localized to the current node

### 4.2 State Machine (Node-Level)
```pseudo
states: Absent → Inserted → Updated* → Removed
transitions:
  Absent→Inserted: prev=null, next!=null → create+attach
  Inserted→Updated: prev, next compatible → diff attrs/style/text; children reconcile
  Inserted→Removed: next=null → detach
  Updated→Removed: next=null → detach
  Updated→Updated: compatible → repeat diff
  Inserted/Updated→Replaced: incompatible (tag/type/component/when) → replace

compatibility rules:
  - same tag and role (element vs component vs when)
  - for components: same component.name
  - for when: both when-present
  - optional: same data-bc-stype when present
```

### 4.2 Complexity
- Let n be number of children on a level and d the depth of the tree
- Attribute/style/text updates: O(1) per node (bounded key set)
- Children reconcile: O(n) per level with keyed lookup maps
- Overall: O(N) for typical updates, where N is the number of visited nodes

### 4.3 Attribute & Style Update Rules
```pseudo
for each key in union(keys(prev.attrs), keys(next.attrs)):
  if value differs:
    if key startsWith 'on' and value is function:
      remove old listener; add new listener; continue
    if key == 'className': setAttribute('class', tokens(value))
    else if value == null: removeAttribute(key)
    else setAttribute(key, String(value))

for each styleKey in union(prev.style, next.style):
  if changed:
    toKebab = camelToKebab(styleKey)
    if value==null: element.style.removeProperty(toKebab)
    else element.style.setProperty(toKebab, String(value))
```

## 5. Responsibilities & Boundaries
- In scope: VNode building, DOM updates, keys, namespaces, error isolation
- Out of scope: event gating, IME/input policy, selection semantics, editing commands
- Upper layers (e.g., editor-view-dom) decide policies and when to render

## 6. Layers
- DSL: author templates (element/data/slot/when/each/component/define)
- Components: context (declarative) vs external (imperative integration)
- Decorators: overlay/widget trees, rendered independently
- Utilities: scheduler (batching), measurement (read-only)

### 6.0 Registry (Resolution & Compatibility)
- Global registry stores templates (`define`) and decorators (`defineDecorator`), keyed by names/types
- Resolution: `element(name)` and `component(name)` fetch registered templates; `slot(field)` renders arrays by resolving each item's `type`
- Compatibility: consistent normalization and versioned entries enable cross-package reuse without tight coupling

### 6.1 Editing Integration (Composition Over Coupling)
- Model-driven: editing commands mutate the model; templates defined via `define()` and `slot()` auto-map `type` to view without bespoke render functions
- Renderer-agnostic policies: input handling, IME gating, and command routing live above the renderer (e.g., in `editor-view-*`), not inside reconcile
- Components for input: contextual components encapsulate local state and event handlers without leaking lifecycle into the renderer
- Decorators for overlays: selections, carets, highlights render as separate trees, avoiding interference with content reconcile
- Outcome: creating a new editor involves modeling data and declaring templates; editing behavior composes via policies/components/decorators rather than custom rendering logic

### 6.2 Decorator Semantics (Normative)
- Isolation: decorator VNodes are excluded from content reconcile; content identity and keys are unaffected by decorator updates
- Lifecycle: decorator mount/update/unmount do not mutate the content DOM subtree; overlays attach to a separate root or a reserved layer
- Event policy: input/IME and command handling target content; decorators may listen for pointer/keyboard events only for visualization (e.g., hover highlight) and must not commit model changes directly
- Scheduling: content reconcile runs first; decorators may depend on post-layout measurement and are updated afterward using measurement utilities
- Definition: decorators are registered via `defineDecorator(name, template)`; they share the same declarative surface as content templates but are tagged for exclusion during content reconcile

## 7. Error Handling
- Best-effort reconcile: report and continue
- Callers collect diagnostics; no global abort on local failure

### 7.1 Error Taxonomy
- insert/remove/replace/update/children phases
- Namespace/attribute errors vs logical mismatches
- Reporting policy: warn and continue unless instructed otherwise by the caller

## 8. Performance
- Keyed reuse and minimal mutations
- Scheduler for batching frequent updates
- Exclusion of overlays simplifies the core

### 8.1 Hot Path Guidance
- Hoist invariant subtrees outside the render loop
- Prefer stable keys derived from domain identifiers
- Avoid synchronous measurement inside reconcile; measure beforehand

### 8.2 Memory & GC
- Avoid accumulating detached nodes: call unmount hooks for external components
- Clear per-reconcile maps after use (child key maps, DOM maps)
- Reuse arrays/objects in builders where possible (pooling)

## 9. Comparison (Conceptual)
- Alignment with virtual DOM approaches but with explicit decorator exclusion and editor-oriented layering
- More explicit boundaries than general UI frameworks re: input/IME policy

## 10. Conclusion
A renderer that is narrowly focused on pure DOM synchronization, combined with a DSL, component abstractions, and decorator layering, provides a robust foundation for complex editors.

## Appendix: Core Reconcile Pseudocode

Reconcile (single node):
```pseudo
function reconcile(prev, next, container, ctx):
  if prev == null and next == null: return
  if prev == null: insert(next); return
  if next == null: remove(prev); return

  if isDecorator(next) and ctx.excludeDecorators: return

  if bothText(prev, next):
    updateText(container, next.text); return

  if whenMismatch(prev, next) or componentMismatch(prev, next) or tagMismatch(prev, next):
    replace(prev, next); return

  updateAttrsStylesText(container, prev, next)
  reconcileChildren(prev.children, next.children, getElement(container), ctx)
```

Keyed children:
```pseudo
function reconcileChildren(prevList, nextList, parent, ctx):
  prevMap = indexByKey(filter(prevList))
  domMap  = indexDomByKey(parent)
  for i, next in enumerate(nextList):
    key = keyOf(next)
    if key exists in prevMap and domMap:
      moveIfNeeded(domMap[key], position=i)
      reconcile(prevMap[key], next, parent, childCtx(i))
    else if key is null:
      reconcile(prevList[i], next, parent, childCtx(i))
    else:
      insertAt(next, parent, i)
  removeStale(prevMap - keys(nextList))
```
