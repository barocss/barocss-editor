# @barocss/renderer-react

React renderer for Barocss DSL. **DSL → React directly** (no VNode). Same `ModelData` + `RendererRegistry` (DSL templates) as **renderer-dom**, but interprets templates and produces a **React** tree without going through renderer-dom or VNode.

## Usage

```ts
import { ReactRenderer } from '@barocss/renderer-react';
import { define, element, slot, data, getGlobalRegistry } from '@barocss/dsl';

const registry = getGlobalRegistry();
define('document', element('div', { className: 'document' }, [slot('content')]));
define('paragraph', element('p', { className: 'paragraph' }, [slot('content')]));
define('inline-text', element('span', {}, [data('text')]));

const renderer = new ReactRenderer(registry);
const reactNode = renderer.build(model); // ModelData → ReactNode
```

## How it works

- **Input**: Same as renderer-dom — `RendererRegistry` (from `define(...)`) and `ModelData` (document tree with `sid`, `stype`, `content`, `text`, `marks`, etc.).
- **Pipeline**: **DSL only**. `buildToReact(registry, model.stype, model)` reads the template via `registry.get(nodeType)`, walks element/slot/data (and attr/data bindings, function children), and calls `React.createElement` to build the tree. No VNode, no dependency on renderer-dom.
- **Output**: `ReactNode` (usable with JSX or `createRoot().render()`).
- **Bundle**: `react` and `react-dom` are **not** included in the build output; they are peer dependencies. The host app must provide them.

## Supported DSL

| Feature | Supported |
|--------|-----------|
| `element(tag, attrs, children)` | Yes; dynamic tag `(d) => string`, `data(path)`, `attr(key)`, `className`/`style` from model. |
| `slot('content')` | Yes; expands to `model.content` children. |
| `data('text')`, `data(path, defaultValue)`, `data(getter)` | Yes; marks applied only for `data('text')` (or getter yielding string) when `model.marks` exists. |
| `attr(key)`, `attr(key, defaultValue)` | Yes; resolves to `model.attributes[key]`. |
| Child as function `(d) => element(...)` | Yes; flattened and built. |
| `defineMark(type, template)` | Yes; template can be ElementTemplate or ComponentTemplate (component returns element). |
| Contextual component (template as function) | Yes; minimal context stub; override via `options.contextStub`. |
| External component (`managesDOM`) | Yes; placeholder div with `data-bc-sid`, `data-bc-stype`. |
| `when()` / `each()` | **No**; build does not throw but conditional/iterated content is not rendered. |

## API

- **`ReactRenderer(registry?, options?)`**
  - `registry`: Optional; if omitted, uses `getGlobalRegistry()` from `@barocss/dsl`.
  - `options.name`: Debug name.

- **`renderer.getRegistry()`**  
  Returns the `RendererRegistry` passed to the constructor.

- **`renderer.build(model)`**  
  Returns `ReactNode` (or `null` if template resolves to non-element).
  - `model`: Must have `stype`; typically `sid`, `content`, `text`, `marks`, `attributes` as needed by templates.

- **`buildToReact(registry, nodeType, model, options?)`**  
  Exported for advanced use: builds a single node (and its children) to `ReactNode`.
  - `options.contextStub`: Optional partial `ComponentContext` for contextual components.

**Exports**: `ReactRenderer`, `buildToReact`, `ReactRendererOptions`.

## Identity and selection

Every node is rendered with `key={model.sid}` and `data-bc-sid`, `data-bc-stype` on its root element so that React reconciles by identity and the view layer (e.g. editor-view-react) can map model selection (sid + offset) to DOM. Selection preservation is **not** implemented in this package; it is the view layer’s responsibility.

## Testing

Unit tests (Vitest) are in `packages/renderer-react/test/`:

```bash
pnpm --filter @barocss/renderer-react test:run
```

Tests cover: buildToReact / ReactRenderer.build, slot expansion, data/text and marks (including overlapping, unregistered mark), attributes (including attr, className object, style), contextual component and contextStub, managesDOM placeholder, defineMark with ComponentTemplate, when()/each() unsupported, splitTextByMarks (empty, global, range, overlap, clamp, invalid range), and full document tree with marks.

To run the React app that uses the renderer (read-only document):

```bash
pnpm --filter @barocss/editor-react dev
```

## See also

- **packages/renderer-react/docs/renderer-react-spec.md** — Full spec: concepts, difference from renderer-dom, selection, marks, test checklist, implementation plan.
- **docs/renderer-react-and-editor-react.md** — Design and editor-react app plan.
- **packages/renderer-dom** — DOM renderer (VNode + Reconciler); separate pipeline.
- **packages/dsl** — DSL types and `RendererRegistry`.
