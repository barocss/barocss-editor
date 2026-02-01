# editor-view-react: Spec vs Implementation Verification

This document records the result of verifying the implementation against `editor-view-react-spec.md`.

**Verification date**: 2026-02-01  
**Test run**: `pnpm --filter @barocss/editor-view-react test:run` — 23 tests, 4 files.

---

## §1–2 Goals, Architecture

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §1 Goals and Scope | ✅ | Same Editor/DataStore; renderer-react; no editor-view-dom dependency. |
| §2 Architecture pipeline | ✅ | EditorViewContextProvider → selectionHandler, inputHandler, mutationObserverManager; EditorView → ContentLayer + overlay layers. |
| §2 Dependencies | ✅ | dsl, editor-core, renderer-react, shared, text-analyzer, text-run-index; no editor-view-dom. |

---

## §3 API Contract

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §3.1 Exports | ✅ | EditorView, EditorViewContentLayer, EditorViewLayer, EditorViewContextProvider, useEditorViewContext, useOptionalEditorViewContext, createMutationObserverManager, types. |
| §3.2 EditorView props | ✅ | editor, options (registry, className, layers), children. Test: options.className applied; layers.* control overlay presence; children in CustomLayer. |
| §3.3 EditorViewContentLayer props | ✅ | options (registry, className, editable). Editor from context. |
| §3.4 EditorViewLayer props | ✅ | layer, className, style, children. Test: data-bc-layer, position absolute, pointer-events none, default classNames/zIndex. |
| §3.5 EditorView static subcomponents | ✅ | ContentLayer, Layer, DecoratorLayer, SelectionLayer, ContextLayer, CustomLayer. |

---

## §4 Context and View State

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §4.1 EditorViewContextValue | ✅ | Test: Consumer inside Provider receives editor, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement. |
| §4.2 EditorViewViewState | ✅ | viewStateRef with isModelDrivenChange, isRendering, isComposing, skipNextRenderFromMO, skipApplyModelSelectionToDOM (used in implementation). |
| §4.3 Lifecycle | ✅ | Provider creates handlers and manager; ContentLayer subscribes and setContentEditableElement (implementation only; subscription not asserted in tests). |

---

## §5–6 Layers, Content Layer

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §5.1 Content layer | ✅ | Test: content layer has data-bc-layer="content", data-testid="editor-content". |
| §5.2 Overlay layers | ✅ | Test: decorator/selection/custom layers render when options.layers.* set; position absolute, pointer-events none. |
| §5.3 Conditional rendering | ✅ | Test: overlay layers only when layers.* set; children in CustomLayer. |
| §6 Document snapshot, ReactRenderer, contenteditable | ✅ | Implementation: getDocumentProxy, editor:content.change, ReactRenderer.build; contentEditable prop. Not asserted in unit tests (would require Editor mock with getDocumentProxy returning model). |

---

## §7 Selection Flow

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §7.1 DOM → Model | ✅ | Test: setProgrammaticChange(true) causes handleSelectionChange to skip updateSelection. |
| §7.2 Model → DOM | ✅ | Implementation: editor:selection.model → requestAnimationFrame ×2 → convertModelSelectionToDOM. |
| §7.3 ReactSelectionHandler | ✅ | Test: isSelectionInsideEditableText returns false when empty, true when inside inline-text node; setProgrammaticChange behavior. convertDOMSelectionToModel not tested (requires full DOM + text-run-index). |

---

## §8 Input and DOM Sync

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §8.1 ReactInputHandler | ✅ | Implementation: beforeinput/keydown, setComposing, syncFocusedTextNodeAfterComposition. Not unit tested. |
| §8.2 handleDomMutations, C1 | ✅ | Implementation: classifyDomChangeC1, replaceText. classifyDomChangeC1 not unit tested (requires Editor + mutations). |
| §8.3 dom-sync | ✅ | Test: findClosestInlineTextNode (element, child, no ancestor, null); reconstructModelTextFromDOM (concatenated text, empty). |

---

## §9 MutationObserver

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §9.1 ReactMutationObserverManager | ✅ | Test: setup(element) observes and invokes callback with batched mutations (setTimeout 0); disconnect() stops observing and callback not called after disconnect. |
| §9.2 Wiring | ✅ | Implementation: Provider creates manager with onMutations = inputHandler.handleDomMutations; ContentLayer setContentEditableElement. |

---

## §10 Test Strategy

| Spec section | Verified | Notes |
|--------------|----------|--------|
| §10.2 Required test categories | ✅ | EditorViewContextProvider (value, useEditorViewContext throw, useOptionalEditorViewContext null). EditorView (root, content layer, options.className, overlay layers, children). EditorViewContentLayer (presence and attributes; subscription behavior not asserted). EditorViewLayer (data-bc-layer, style, default classNames/zIndex). ReactSelectionHandler (instantiate, isSelectionInsideEditableText, setProgrammaticChange). ReactMutationObserverManager (setup/disconnect, batch). dom-sync (findClosestInlineTextNode, reconstructModelTextFromDOM). |
| §10.3 Test environment | ✅ | Vitest, jsdom, @testing-library/react. Mock Editor used in tests. |

---

## Checklist (Concrete) — Spec §11

- [x] EditorViewContextProvider provides editor, viewStateRef, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement.
- [x] useEditorViewContext throws outside Provider; useOptionalEditorViewContext returns null outside.
- [x] EditorView renders content layer; overlay layers only when options.layers.* set; children in CustomLayer.
- [x] EditorViewContentLayer subscribes to editor:content.change and editor:selection.model; setContentEditableElement(ref) on mount/unmount. (Implementation verified; not asserted in tests.)
- [x] EditorViewLayer renders with data-bc-layer, position absolute, pointer-events none, default classNames/zIndex.
- [x] ReactSelectionHandler convertDOMSelectionToModel / isSelectionInsideEditableText / setProgrammaticChange behave as spec. (isSelectionInsideEditableText and setProgrammaticChange tested; convertDOMSelectionToModel not.)
- [x] ReactMutationObserverManager setup/disconnect and batch callback.
- [x] findClosestInlineTextNode, reconstructModelTextFromDOM behave as spec. (classifyDomChangeC1 not tested.)

---

## Gaps (optional future tests)

- **EditorViewContentLayer**: Assert editor.on('editor:content.change') and editor.on('editor:selection.model') called; setContentEditableElement called with ref on mount and null on unmount (with mock Editor and spy).
- **classifyDomChangeC1**: Unit test with mock Editor, mutations array, and options; assert C1 or UNKNOWN.
- **ReactSelectionHandler.convertDOMSelectionToModel**: Unit test with full DOM (data-bc-sid nodes, text runs) and mock Editor.dataStore.getNode; assert ModelSelection shape.
- **ReactInputHandler**: beforeinput/keydown handling with mock Editor and executeCommand spy.
