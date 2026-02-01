# renderer-react and editor-react Design

## Goals

- **renderer-react**: Render templates defined with the DSL (`define`, `element`, `slot`, `data`, etc.) using **React only**. Input is the same as renderer-dom: `RendererRegistry` + `ModelData`.
- **editor-react**: An app (for testing/validation) that renders editor content with renderer-react and behaves like renderer-dom for editing (contenteditable, selection, input).

## Architecture

- **renderer-dom**: DOM-based. VNode is an intermediate representation for “writing on top of DOM in a React-like way.” Pipeline: `DSL → VNodeBuilder → VNode → Reconciler → DOM`.
- **renderer-react**: React-based. React already has a virtual tree, so VNode is unnecessary. **DSL → ReactBuilder → ReactNode** directly.

```
DSL (define, element, slot, data, ...)
        ↓
RendererRegistry (nodeType → RendererDefinition)
        ↓
renderer-dom:  ModelData → VNodeBuilder → VNode → Reconciler → DOM
renderer-react: ModelData → buildToReact(registry, stype, model) → ReactNode  (no VNode)
```

- **renderer-react**: Does not depend on `@barocss/renderer-dom`. Uses only `@barocss/dsl`. It fetches templates from the registry, interprets element/slot/data, and builds a React tree directly with `React.createElement`.
- **Editing**: Similar to editor-view-dom—contenteditable plus selection/input handling. The editor-react app is validated first as **read-only** or a **simple contenteditable wrapper**; then, if needed, it can be extended with editor-view-react (or by reusing the same input layer as editor-view-dom).

## Package Roles

| Package | Role |
|--------|------|
| **packages/renderer-react** | `ReactRenderer(registry).build(model)` → `ReactNode`. Interprets DSL templates and produces only a React tree (no VNode, no renderer-dom). **react/react-dom are not bundled** (peerDependencies, external at build time). |
| **packages/editor-view-react** | (Optional) React counterpart of editor-view-dom. View layer that wraps React tree + contenteditable/selection/input in a React-friendly way. |
| **apps/editor-react** | Vite + React app. Renders a document with the same schema/define/initialTree using ReactRenderer, and tests renderer-react behavior. |

## renderer-react API

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

- **ReactRenderer options**: `name?` (for debugging). Decorator/context can be extended later.
- **Internals**: `buildToReact(registry, model.stype, model)` — resolves element/slot/data/attr and calls `React.createElement`.

## File Structure

```
packages/renderer-react/
  package.json
  tsconfig.json
  src/
    index.ts
    react-renderer.ts   # ReactRenderer class
    build-to-react.ts  # DSL → ReactNode (element/slot/data resolution)

apps/editor-react/
  package.json
  index.html
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx            # registry + initialTree + ReactRenderer.build
```

## editor-view-react (Optional)

- **editor-view-dom**: DOM layer. DOMRenderer + contenteditable + selection/input events.
- **editor-view-react**: If needed, a React counterpart package similar to editor-view-dom.
  - **Role**: Expose React tree (renderer-react) + contenteditable/selection/input as React components/hooks.
  - **Dependencies**: `@barocss/editor-core`, `@barocss/renderer-react`, `react`, `react-dom`, etc. Shares the same Editor/DataStore/Registry model as editor-view-dom.
  - **When to implement**: When the editor-react app needs editing (not just read-only), or when the editor must be used as a component in a React app.

## Relation to Editing

- **renderer-dom**: The Reconciler patches the contenteditable DOM. Selection/input are handled by editor-view-dom via DOM events.
- **renderer-react**: React renders the tree, so for editing either (1) put the React tree inside a contenteditable container and use DOM selection/input as-is, or (2) add a React-friendly input layer in **editor-view-react**. The first approach assumes reusing the same input model (1) as the baseline.
