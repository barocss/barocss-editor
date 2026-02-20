---
"@barocss/editor-view-dom": patch
"@barocss/renderer-dom": patch
"@barocss/model": patch
---

Fix DOM change classifier (C1/C2/C3/C4) and layer decorator removal.

- **Classifier**: C1 skips when selection or inputHint spans multiple inline-text (C2), or when childList adds C4-like nodes (e.g. anchor); C2 supports inputHint-only path when DOM selection is empty; C3 test adds p2 to nodeMap; C2 test expectation and selection clear for InputHint test.
- **Layer decorator**: Call _renderLayers even when allDecorators is empty so removed decorators are cleared; clear decorator layer DOM when decoratorLayerModels is empty.
- **Tests**: dom-change-classifier (4), layer-decorator "removes" (1); model transaction tests use mock updateSelection.
