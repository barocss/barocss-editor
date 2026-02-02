# Editor View Layers Specification

This document defines the five layers used by editor-view-dom and editor-view-react: content, decorator, selection, context, and custom. It describes how `layerTarget` routes decorators to layers and how each layer is intended to be used.

---

## 1. Layer Overview

| Layer      | data-bc-layer | Purpose |
|-----------|----------------|---------|
| content   | content        | Document + inline/block decorators (content flow). Single contenteditable root. |
| decorator | decorator      | Overlay decorators (e.g. comment bubbles, floating annotations). |
| selection | selection      | Selection/cursor indicators (range highlight, caret). |
| context   | context        | Context UI (tooltips, autocomplete, menus). |
| custom    | custom         | App-defined overlay + optional children. |

All overlay layers (decorator, selection, context, custom) are positioned absolute over the content layer, with `pointer-events: none` by default so the content layer receives input. Default z-index: decorator 10, selection 100, context 200, custom 1000.

---

## 2. layerTarget and Routing

Decorators have an optional `layerTarget?: 'content' | 'decorator' | 'selection' | 'context' | 'custom'`.

- **content** (default for inline/block): Rendered inside the content layer in the document tree (inline/block slots). Do not render in overlay layers.
- **decorator**: Rendered only in the decorator overlay layer (e.g. comment popover, annotation).
- **selection**: Rendered only in the selection overlay layer (e.g. cursor div, range highlight).
- **context**: Rendered only in the context overlay layer (e.g. tooltip, autocomplete popup).
- **custom**: Rendered only in the custom overlay layer (e.g. custom floating UI).

When `layerTarget` is omitted, inline/block decorators default to content; layer-category decorators default to decorator (editor-view-dom DecoratorPrebuilder). In editor-view-react, overlay content is built with `ReactRenderer.buildOverlayDecorators(decorators)` per layer, with decorators filtered by `layerTarget === layer`.

---

## 3. Content Layer

- **Role**: Document body and inline/block decorators that participate in the content flow.
- **Rendering**: Single contenteditable div. Document model is rendered via ReactRenderer.build(model, decorators). Inline and block decorators (and layer decorators with layerTarget content) are rendered in the same tree (before/after/overlay slots).
- **Usage**: No app code; view manages document and decorators internally.

---

## 4. Decorator Layer

- **Role**: Overlay decorators that float above content (e.g. comment bubbles, annotations) without being part of the content flow.
- **Usage**: Add a decorator with `category: 'layer'` and `layerTarget: 'decorator'` (or omit layerTarget for layer category). The view renders it in the decorator overlay via buildOverlayDecorators. Position/size can be set in decorator.data (e.g. data.position for absolute coordinates).

---

## 5. Selection Layer

- **Role**: Visual representation of the current selection or cursor (caret, range highlight).
- **Usage**: Add decorators with `layerTarget: 'selection'`. Typical use: cursor (collapsed range) or range highlight. In editor-view-dom tests, the selection layer is also used by appending DOM (e.g. a cursor div) directly to `view.layers.selection`. In editor-view-react, selection visuals are driven by decorators with layerTarget 'selection' rendered via buildOverlayDecorators. Future: model selection could be mapped to one or more selection-layer decorators by the view or app.

---

## 6. Context Layer

- **Role**: Contextual UI that appears near the selection or a target (tooltips, autocomplete, inline menus).
- **Usage**: Add decorators with `layerTarget: 'context'`. Example: tooltip decorator with data.text, or autocomplete popup. Position in data.position. In editor-view-dom tests, context layer is used for tooltips and autocomplete popup.

---

## 7. Custom Layer

- **Role**: App-defined overlay content plus optional React children.
- **Usage**:
  - **Decorators**: Add decorators with `layerTarget: 'custom'`; they are rendered in the custom overlay.
  - **Children**: Pass children to EditorView; they are rendered inside the custom layer after the overlay decorators. Use for custom UI (floating buttons, panels) that are not driven by the decorator model.

---

## 8. Parity with editor-view-dom

- editor-view-dom: Content layer uses DOMRenderer.render(); overlay layers use DecoratorPrebuilder to build DecoratorModels, split by layerTarget, then _decoratorRenderer/_selectionRenderer/_contextRenderer/_customRenderer.renderChildren(layerElement, models).
- editor-view-react: Content layer uses ReactRenderer.build(model, decorators); overlay layers use EditorViewOverlayLayerContent per layer, which filters decorators by layerTarget and calls ReactRenderer.buildOverlayDecorators(filtered). Same layerTarget semantics and layer order (content, then decorator, selection, context, custom).

---

## 9. References

- editor-view-dom: `packages/editor-view-dom/src/editor-view-dom.ts` (_renderLayers, layerTarget switch), `packages/editor-view-dom/docs/decorator-guide.md`, `packages/editor-view-dom/test/core/layered-api.test.ts`, `packages/editor-view-dom/test/integration/pattern-custom-decorator-render.test.ts`.
- editor-view-react: EditorViewOverlayLayerContent, EditorView.tsx (DecoratorLayerSlot, SelectionLayerSlot, ContextLayerSlot, CustomLayerSlot), editor-view-react-spec.md (Layers section).

---

## 10. Decorator improvements (future)

Possible improvements to align behavior and reduce drift:

| Item | Description |
|------|-------------|
| **Decorator range adjustment on text edit** | When the user types, inline decorator ranges (startOffset/endOffset) should be adjusted so they stay correct. editor-view-dom computes `adjustedDecorators` in handleEfficientEdit (via dataStore.decorators.adjustRanges or edit-position-converter) but applying them back to DecoratorManager is still TODO. editor-view-react does not yet run any adjust step after replaceText. Adding this in both views would keep decorators in sync with content. |
| **Single Decorator type source** | Decorator is defined in editor-view-dom, shared, and renderer-react. Unifying on shared (and re-exporting or extending in the other packages) would avoid drift. |
| **ref.updateDecorator(id, updates)** | editor-view-dom exposes updateDecorator(id, updates). editor-view-react ref currently has addDecorator, removeDecorator, getDecorators; adding updateDecorator would call DecoratorManager.update for parity. |
| **Optional DecoratorRegistry in editor-view-react** | editor-view-dom uses DecoratorRegistry for validation and default values when adding decorators. editor-view-react uses DecoratorManager without a validator; an optional registry would allow the same validation/defaults. |
| **Remote / Pattern / Generator** | editor-view-react provides RemoteDecoratorManager, PatternDecoratorConfigManager, and DecoratorGeneratorManager via ref. Merged decorators (local + remote + pattern-from-model + generator-from-model) are used for content and overlay rendering. |
