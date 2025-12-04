# Declarative Editor Rendering - Comparison (Conceptual)

## Virtual DOM Libraries
- Similarities: VNode tree, diff/reconcile, keys for stability
- Differences: explicit decorator exclusion, editor-layered boundaries (no IME/input policy inside renderer)

## UI Frameworks
- Renderer is intentionally narrow: no component lifecycle hooks in context components beyond state and events
- External components exist for imperative integration rather than mixing concerns

## Editors
- Many editors tie input/selection policy into renderers; here, policies live in `editor-view-dom`
- Declarative renderer plus independent decorator layer improves predictability and testability
