# @barocss/renderer-dom

## 1.0.2

### Patch Changes

- b2be06d: Fix DOM change classifier (C1/C2/C3/C4) and layer decorator removal.

  - **Classifier**: C1 skips when selection or inputHint spans multiple inline-text (C2), or when childList adds C4-like nodes (e.g. anchor); C2 supports inputHint-only path when DOM selection is empty; C3 test adds p2 to nodeMap; C2 test expectation and selection clear for InputHint test.
  - **Layer decorator**: Call \_renderLayers even when allDecorators is empty so removed decorators are cleared; clear decorator layer DOM when decoratorLayerModels is empty.
  - **Tests**: dom-change-classifier (4), layer-decorator "removes" (1); model transaction tests use mock updateSelection.

- Updated dependencies [6aa573f]
  - @barocss/dsl@1.1.0

## 1.0.1

### Patch Changes

- 99009d6: **Editor view IME composition stability**

  - Improve IME composition handling in DOM and React editor views: use `beforeinput` composition state and `keydown 229` compatibility path instead of explicit composition event listeners.
  - Stabilize selection/transaction behavior: selection-after resolution, history, and extension commands aligned with editor spec.
  - Add regression tests for post-composition sync timing, keydown 229, and selection application flow.
  - Docs: editor spec, input-selection stability matrix, React component rendering.

- Updated dependencies [99009d6]
  - @barocss/dsl@1.0.1
