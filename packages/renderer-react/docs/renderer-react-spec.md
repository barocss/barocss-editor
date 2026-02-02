# renderer-react Specification

This document defines the spec for `@barocss/renderer-react`: goals, concepts, differences from renderer-dom, selection/mark behavior, test strategy, and implementation plan.

**Status**: Phase 1–3 implemented and covered by tests (Vitest). See §8.4 Checklist and §9 Implementation Plan.

---

## Table of Contents

1. [Goals and Scope](#1-goals-and-scope)
2. [Concepts](#2-concepts)
3. [Difference from renderer-dom](#3-difference-from-renderer-dom)
4. [Selection Considerations](#4-selection-considerations)
5. [Mark Rendering](#5-mark-rendering)
6. [API Contract](#6-api-contract)
7. [Out of Scope (Current vs Future)](#7-out-of-scope-current-vs-future)
8. [Test Strategy and Required Tests](#8-test-strategy-and-required-tests)
9. [Implementation Plan](#9-implementation-plan)
10. [Prohibited / Careful Practices](#10-prohibited--careful-practices)

---

## 1. Goals and Scope

### 1.1 Goals

- **Same input as renderer-dom**: `RendererRegistry` + `ModelData`. Templates are defined with the same DSL (`define`, `element`, `slot`, `data`, `attr`, `defineMark`). Child functions `(d) => element(...)` are supported; `when()` and `each()` are not (see §7).
- **React-only output**: Produce `ReactNode` directly. No VNode; no DOM reconciliation inside this package.
- **No dependency on renderer-dom**: Depends only on `@barocss/dsl`. React is a peer dependency.
- **Parity where meaningful**: Element/slot/data and marks should behave like renderer-dom’s semantics (same template → equivalent structure). Reconciliation and selection are the responsibility of React and the view layer, not renderer-react.

### 1.2 Scope

| In scope | Out of scope (view / other packages) |
|----------|--------------------------------------|
| ModelData → ReactNode from registry + stype | DOM reconciliation, fiber, commit phase |
| element / slot / data resolution | Selection preservation (editor-view-react or app) |
| Marks: splitTextByMarks + getMarkRenderer → wrapped elements | Component state (mount/update/unmount) — future |
| Decorators: inline/block/layer in same tree (build(model, decorators), defineDecorator) | Portals |
| data-bc-sid, data-bc-stype on root of each node | Component state (mount/update/unmount) — future |
| External/contextual component stub (placeholder or thin bridge) | Portals |
| Key stability (sid as key) for React reconciliation | Actual DOM selection restore |

---

## 2. Concepts

### 2.1 Pipeline

```
ModelData + RendererRegistry
    → buildToReact(registry, model.stype, model)
    → ReactNode tree (React.createElement)
```

- **No VNode**: React’s own virtual tree is the only intermediate representation.
- **Same DSL**: `element`, `slot('content')`, `data('text')`, `data('path')`, attribute bindings. Resolved the same way as renderer-dom’s builder for element/slot/data.
- **Node identity**: Every node that has `model.sid` is rendered with `key={model.sid}` and `data-bc-sid`, `data-bc-stype` so that:
  - React can reconcile by identity.
  - The view layer can map ModelSelection (sid + offset) to DOM when applying selection.

### 2.2 Identity and Keys

- **key**: Use `(model as any).sid` for the React `key` of the top-level element for each model node. Required for stable reconciliation and to avoid unnecessary re-mounts that would disturb selection.
- **data-bc-sid / data-bc-stype**: Attached to the root DOM element of each node so that:
  - View layer can resolve `sid` → DOM node for selection application.
  - Debugging and tests can assert on structure.

### 2.3 Template Resolution

- **Lookup**: `registry.get(nodeType)` returns the definition (from `define()` or `registerComponent()`). If not found or no template, throw a clear error.
- **Element template**: `element(tag, attrs, children)` → `React.createElement(tag, props, ...children)` with children resolved recursively (slot → model.content, data → text/marks, function children flattened).
- **Contextual component**: If template is a function `(props, model, context)`, call it with a minimal context stub (registry, getState/setState no-ops or minimal impl) and use the returned `ElementTemplate` for building. Custom context can be passed via `options.contextStub`.
- **External component (managesDOM)**: Renders a placeholder div with `data-bc-sid`, `data-bc-stype`, and `className: 'react-renderer-external-placeholder'`. Full lifecycle is out of scope.

---

## 3. Difference from renderer-dom

| Aspect | renderer-dom | renderer-react |
|--------|--------------|----------------|
| **Intermediate representation** | VNode tree | None (direct React tree) |
| **Reconciliation** | Custom fiber: render phase + commit phase, sid-based matching | React’s own reconciliation (key = sid) |
| **Selection** | Optional selection context + TextNodePool; restore after commit | No selection logic; view must apply selection after render (e.g. editor-view-react) |
| **Marks** | VNodeBuilder splits text by marks, builds mark wrappers; reconciler commits | splitTextByMarks + getMarkRenderer; build mark wrappers with React.createElement |
| **Decorators** | VNode decorator metadata, pattern/custom decorators, layer rendering | Same: `build(model, decorators)`, inline/block/layer in same tree (defineDecorator) |
| **Component state** | ComponentManager, mount/update/unmount, state registry | Stub or minimal; full state can be added later |
| **Portals** | Portal handler in reconciler | Out of scope initially |
| **Dependencies** | dsl, text-run-index, etc. | dsl only (+ React peer) |

**Summary**: renderer-react is “DSL → React” only. No VNode, no DOM reconciliation, no selection preservation inside the package. Parity is in “same model + same registry → same logical structure (elements, slots, data, marks)”. Stability (keys, data-bc-sid) is so that the view layer and React can keep DOM stable and apply selection correctly.

---

## 4. Selection Considerations

### 4.1 Why It Matters

- On every React re-render, the content tree may be replaced or updated. If nodes are re-mounted (e.g. missing or changing keys), DOM selection can be lost or shifted.
- The view layer (e.g. editor-view-react) is responsible for applying ModelSelection to DOM after content or selection changes. It uses `data-bc-sid` and offset to find the correct text node and offset.

### 4.2 What renderer-react Must Do

1. **Stable keys**: Use `model.sid` as React `key` for the root element of each model node so that React reuses DOM when the same node is still present.
2. **Stable attributes**: Emit `data-bc-sid` and `data-bc-stype` on the root element of each node so the view layer can resolve selection (sid → element, then offset in text).
3. **No arbitrary remounts**: Avoid changing keys or structure in a way that would force React to remount nodes that are still the same logical node (same sid). For example, do not use array index as key when sid is available.

### 4.3 What renderer-react Does Not Do

- It does **not** receive or apply selection context.
- It does **not** preserve or restore DOM selection. That is the responsibility of editor-view-react (or the app) after render: e.g. subscribe to `editor:selection.model` and apply selection after `editor:content.change` and after React has committed (e.g. in requestAnimationFrame or useEffect).

### 4.4 View-Layer Checklist (editor-view-react / app)

- After content change: update document snapshot and let React re-render; then apply current ModelSelection to DOM (e.g. convert model selection to DOM range and set range on selection).
- Optionally set `skipApplyModelSelectionToDOM` during a render or batch to avoid fighting with React.
- Use the same registry and model shape as editor-view-dom so that sid/stype semantics are consistent.

---

## 5. Mark Rendering

### 5.1 Semantics (Same as renderer-dom)

- Marks apply to **text** only. Model has `marks: Array<{ stype: string; range?: [number, number]; attrs?: Record<string, unknown> }>`.
- **range**: `[start, end]` in character offsets. Omitted or global marks apply to the whole text.
- Multiple marks can overlap; text is split into **runs** at boundaries, and each run gets the set of mark types that cover it.

### 5.2 Algorithm

1. **splitTextByMarks(text, marks)**  
   - Input: `text: string`, `marks` array.  
   - Output: `TextRun[]` where each run has `{ start, end, text, types?: string[] }`.  
   - Boundaries: 0, text.length, and all range start/end clamped to [0, text.length].  
   - For each run, collect all mark types that overlap that range (global marks + ranged marks overlapping [start, end]).

2. **getMarkRenderer(markType)**  
   - Registry returns a template for the mark (e.g. from `defineMark('bold', element('strong', {}, ...))`).  
   - Template can be ElementTemplate or ComponentTemplate; resolve to an element (tag + attrs) for wrapping.

3. **buildMarkRunToReact(registry, run, model, keyBase)**  
   - Inner content: run.text (string).  
   - For each type in `run.types` (innermost to outermost), get mark template, resolve to element, wrap: `createElement(tag, { ...attrs, key }, inner)`.  
   - Result: one React node (possibly nested elements) for that run.

4. **Integration in processChildren**  
   - When processing `data('text')` (or equivalent data path that yields text):  
     - If `model.marks` exists and is non-empty, call `splitTextByMarks(text, model.marks)` and then for each run either push `run.text` (no marks) or `buildMarkRunToReact(...)` (with marks).  
     - Otherwise push the text string.

### 5.3 Rules

- Mark templates are resolved via `registry.getMarkRenderer(markType)`. If a mark type has no registered template, that mark is skipped for wrapping (text still rendered).
- Keys for mark wrappers must be stable (e.g. `${keyBase}_${markType}_${i}`) so React does not remount unnecessarily.
- Do not add or assume classes like `mark-{stype}` unless the user’s template includes them; use only the template’s tag and attributes.

---

## 6. API Contract

### 6.1 ReactRenderer

```ts
class ReactRenderer {
  constructor(registry?: RendererRegistry, options?: ReactRendererOptions);
  getRegistry(): RendererRegistry;
  build(model: ModelData): ReactNode;
}
```

- **build(model)**  
  - Requires `model.stype`.  
  - Calls `buildToReact(registry, model.stype, model)`.  
  - Returns a single ReactNode (or null if unsupported template).

### 6.2 buildToReact

```ts
function buildToReact(
  registry: RendererRegistry,
  nodeType: string,
  model: ModelData,
  options?: { contextStub?: Partial<ComponentContext> }
): ReactNode;
```

- **registry**: Same registry used by renderer-dom (define/element/slot/data/defineMark).
- **nodeType**: Usually `model.stype`.
- **model**: Full model node (sid, stype, content, text, marks, attributes, etc.).
- **contextStub**: Optional; used when resolving contextual components. If not provided, a minimal stub is used (getState/setState no-ops, registry getComponent only).

### 6.3 Exports

- `ReactRenderer`, `buildToReact`, `ReactRendererOptions`.
- Mark utils (`splitTextByMarks`, `TextRun`, `TextMark`) can be exported for tests or shared use.

---

## 7. Out of Scope (Current vs Future)

| Feature | Current | Future |
|---------|---------|--------|
| Decorators (inline/block/layer) | Implemented: `build(model, decorators)`, same tree as content (defineDecorator) | Pattern/custom decorator generators (future) |
| Component state (mount/update/unmount) | Stub only | ComponentManager-like state in React (e.g. useRef/useState per sid) |
| Portals | No | Optional portal(target, node) support |
| when() / each() | **Not supported**. Templates with `when()` or `each()` do not throw; conditional/iterated content is not rendered (processChildren does not handle `type === 'conditional'` or `type === 'each'`). | Add if parity with renderer-dom is required. |
| Selection preservation inside renderer | No | Never; stays in view layer |

---

## 8. Test Strategy and Required Tests

### 8.1 Principles

- **Spec-first**: Tests assert behavior described in this spec (identity, keys, marks, slot expansion, data resolution).
- **No implementation detail**: Prefer asserting on output structure (e.g. React tree shape, presence of key/data-bc-sid) rather than internal functions.
- **Parity**: Where possible, use the same model + registry as renderer-dom tests and assert equivalent structure (e.g. same nesting, same marks on text).

### 8.2 Required Test Categories

1. **Unit: buildToReact / ReactRenderer.build**
   - Model with stype only (minimal node): returns one element with correct tag, key, data-bc-sid, data-bc-stype.
   - Model with content: slot('content') expands to children; each child has correct key and data-bc-*.
   - Model with text and no marks: data('text') produces text node (or wrapped in span if that’s the template).
   - Model with text and marks: splitTextByMarks + getMarkRenderer produce correct wrapper elements (strong, em, etc.) and keys.
   - Missing stype or unregistered stype: throws with clear message.
   - Contextual component: receives minimal context, returns element template, build produces React node.

2. **Unit: splitTextByMarks (utils/marks)**
   - Empty text / no marks: returns [] or single run.
   - Global mark only: single run with that type.
   - Single range mark: boundaries correct, run.types correct.
   - Overlapping marks: multiple runs, each run has correct types.
   - Clamp: range beyond [0, len] clamped.

3. **Integration: React tree shape**
   - Given a document model (document > paragraph > inline-text with marks), assert root has key and data-bc-sid; children are present; text runs with marks are wrapped (e.g. strong/em).

4. **Integration: editor-view-react (in app or package)**
   - Document renders without error.
   - After content change, React updates; selection can be applied by view layer (manual or automated test that applies model selection and reads back DOM selection).

### 8.3 Test Environment

- **React Test Renderer** (or similar) to get a tree from `renderer.build(model)` and assert on node types, props (key, data-bc-sid, data-bc-stype), and children.
- **Vitest** for unit tests; optional React Testing Library or editor-react E2E for integration.

### 8.4 Checklist (Concrete)

- [x] ReactRenderer(registry).build(model) returns ReactNode when model.stype is defined and registered.
- [x] build(model) throws when model.stype is missing or not registered.
- [x] Root element has key = model.sid and data-bc-sid, data-bc-stype.
- [x] slot('content') expands model.content; each child built with buildToReact(registry, child.stype, child).
- [x] data('text') with no marks renders text (or single span with text).
- [x] data('text') with marks renders split runs; runs with types use getMarkRenderer and wrap with correct tag.
- [x] splitTextByMarks: global mark, single range, overlapping ranges, clamp; range with end ≤ start skipped.
- [x] Unregistered mark type: that mark is skipped (no wrapper), text still present.
- [x] Contextual component receives context stub and returns element; build outputs correct React node.
- [x] options.contextStub passed to buildToReact is used for contextual component.
- [x] data(path, defaultValue) and attr(key, defaultValue) use defaultValue when value is null/undefined.
- [x] defineMark with ComponentTemplate (component returns element) wraps text run in that element.
- [x] managesDOM template renders placeholder div with data-bc-sid, data-bc-stype.
- [x] buildToReact returns null when ComponentTemplate’s component() returns non-element.
- [x] when() / each() in template: build does not throw; conditional/iterated content is not rendered.

---

## 9. Implementation Plan

### Phase 1: Spec and test harness — Done

- [x] Write this spec (renderer-react-spec.md).
- [x] Add `test:run` script and vitest config to renderer-react.
- [x] Add tests for splitTextByMarks (empty text, no marks, global/single range/overlapping/clamp, invalid range).
- [x] Add tests for buildToReact and ReactRenderer.build (minimal node, slot, data, marks, stype validation, contextual, attributes, deep tree, integration with marks).

### Phase 2: Parity and stability — Done

- [x] All nodes use `key={model.sid}` and `data-bc-sid` / `data-bc-stype`.
- [x] Mark rendering aligned with splitTextByMarks + getMarkRenderer (ElementTemplate and ComponentTemplate); mark run keys `${sid}_r${ri}_${markType}_${i}`.
- [x] Minimal context stub for contextual components; options.contextStub overridable.

### Phase 3: Gaps and edge cases — Done

- [x] ExternalComponent (managesDOM): placeholder div with data-bc-sid, data-bc-stype, className.
- [x] when() / each(): documented as unsupported; build does not throw; conditional/iterated content not rendered.
- [x] Error messages: missing stype → ReactRenderer throws "model must have stype property"; unregistered nodeType → buildToReact throws "No renderer for node type '...'. Register with define()."

### Phase 4: Integration and selection — Future

- [ ] editor-view-react: after content change, apply model selection in a stable way (e.g. useEffect + requestAnimationFrame).
- [ ] Optional E2E in editor-react: type, change selection, assert DOM selection or cursor position.

### Phase 5: Optional extensions — Future

- [x] Decorators: `build(model, decorators)`; inline/block/layer in same tree (defineDecorator).
- [ ] Component state: define API (e.g. state registry per sid) and implement with React state/refs.

---

## 10. Prohibited / Careful Practices

- **Do not** use array index as React key when `model.sid` is available.
- **Do not** add selection preservation logic inside renderer-react; it belongs in the view layer.
- **Do not** depend on renderer-dom or VNode types in renderer-react.
- **Do not** mutate model or registry inside buildToReact.
- **Be careful** with contextual component context: provide a minimal stub so that templates that call context.getState/setState do not throw; actual state persistence can be added later.
- **Be careful** with mark keys: ensure keys are unique per run (e.g. sid + run index + mark type) so that React does not reuse the wrong wrapper when content changes.
