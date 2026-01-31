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

- **Input**: Same as renderer-dom — `RendererRegistry` (from `define(...)`) and `ModelData` (document tree with `sid`, `stype`, `content`, etc.).
- **Pipeline**: **DSL only**. `buildToReact(registry, model.stype, model)` reads the template from the registry, walks element/slot/data (and attr/data bindings), and calls `React.createElement` to build the tree. No VNode, no dependency on renderer-dom.
- **Output**: `ReactNode` (usable with JSX or `createRoot().render()`).
- **Bundle**: `react` and `react-dom` are **not** included in the build output; they are peer dependencies. The host app must provide them.

## API

- **`ReactRenderer(registry?, options?)`**  
  - `registry`: Optional; if omitted, uses `getGlobalRegistry()` from `@barocss/dsl`.  
  - `options.name`: Debug name.

- **`renderer.build(model)`**  
  Returns `ReactNode`.  
  - `model`: Must have `stype` (and usually `sid`, `content`).

- **`buildToReact(registry, nodeType, model, options?)`**  
  Exported for advanced use: builds a single node (and its children) to `ReactNode`.

## Testing

Use **apps/editor-react** to run a small React app that renders a document with `ReactRenderer` (read-only). From repo root:

```bash
pnpm --filter @barocss/editor-react dev
```

## See also

- **docs/renderer-react-and-editor-react.md** — Design and editor-react app plan.
- **packages/renderer-dom** — DOM renderer (VNode + Reconciler); separate pipeline.
- **packages/dsl** — DSL types and `RendererRegistry`.
