# editor-view-react Specification

This document defines the spec for `@barocss/editor-view-react`: goals, architecture, API, context, layers, selection/input flow, DOM sync, and test strategy.

---

## Table of Contents

1. [Goals and Scope](#1-goals-and-scope)
2. [Architecture](#2-architecture)
3. [API Contract](#3-api-contract)
4. [Context and View State](#4-context-and-view-state)
5. [Layers](#5-layers)
6. [Content Layer and Renderer](#6-content-layer-and-renderer)
7. [Selection Flow](#7-selection-flow)
8. [Input and DOM Sync](#8-input-and-dom-sync)
9. [MutationObserver](#9-mutationobserver)
10. [Test Strategy and Required Tests](#10-test-strategy-and-required-tests)
11. [Out of Scope and Future](#11-out-of-scope-and-future)

---

## 1. Goals and Scope

### 1.1 Goals

- **React view layer for Barocss Editor**: Renders the editor document with **renderer-react** (DSL → ReactNode) and re-renders on `editor:content.change`. React counterpart of **editor-view-dom**.
- **Same Editor/DataStore model**: Uses `Editor` from `@barocss/editor-core` (getDocumentProxy, on/off for events). Same registry and model shape as editor-view-dom for sid/stype semantics.
- **Selection and input**: DOM selection ↔ model selection via `ReactSelectionHandler`; beforeinput/keydown and DOM mutations via `ReactInputHandler` and `ReactMutationObserverManager`. No dependency on editor-view-dom.

### 1.2 Scope

| In scope | Out of scope |
|----------|--------------|
| EditorView composite, EditorViewContentLayer, EditorViewLayer | Full E2E typing tests (apps/editor-react) |
| EditorViewContext (editor, selectionHandler, inputHandler, mutationObserverManager, viewState) | Decorator/selection overlay rendering (layer slots only) |
| ReactRenderer + contenteditable div, editor:content.change subscription | renderer-react internals |
| editor:selection.model → convertModelSelectionToDOM (requestAnimationFrame) | editor-core selection internals |
| selectionchange → convertDOMSelectionToModel → editor.updateSelection | DOM reconciliation (React) |
| beforeinput/keydown → commands (replaceText, insertParagraph, etc.) | Command implementations (extensions) |
| MutationObserver → C1 classification → replaceText / structural commands | when()/each() in templates |
| data-bc-sid, data-bc-stype on content (from renderer-react) | Portals, decorator DOM |

---

## 2. Architecture

### 2.1 Pipeline

```
Editor (editor-core)
    ↓
EditorViewContextProvider
    → viewStateRef (isModelDrivenChange, isRendering, isComposing, skipNextRenderFromMO, skipApplyModelSelectionToDOM)
    → ReactSelectionHandler(editor, getContentEditableElement)
    → ReactInputHandler(editor, selectionHandler, viewStateRef)
    → createMutationObserverManager(mutations => inputHandler.handleDomMutations(mutations))
    → setContentEditableElement(el) — connect/disconnect observer
    ↓
EditorView (composite)
    → EditorViewContentLayer (contenteditable, ReactRenderer.build(documentSnapshot), editor:content.change, editor:selection.model)
    → EditorView.DecoratorLayer | SelectionLayer | ContextLayer | CustomLayer (EditorViewLayer overlay)
```

### 2.2 Dependencies

- **@barocss/dsl**: RendererRegistry, getGlobalRegistry.
- **@barocss/editor-core**: Editor, fromDOMSelection.
- **@barocss/renderer-react**: ReactRenderer.
- **@barocss/shared**: getKeyString.
- **@barocss/text-analyzer**: analyzeTextChanges.
- **@barocss/text-run-index**: buildTextRunIndex, binarySearchRun, ContainerRuns.
- **react**, **react-dom**: Context, hooks, DOM refs.

No dependency on **editor-view-dom** or **renderer-dom**.

### 2.3 Data Flow

- **Content**: editor.getDocumentProxy() → documentSnapshot state → ReactRenderer.build(model) → contenteditable div children. On editor:content.change → setDocumentSnapshot(e.content ?? getDocumentProxy()).
- **Selection (model → DOM)**: editor:selection.model → skipApplyModelSelectionToDOM check → requestAnimationFrame ×2 → selectionHandler.convertModelSelectionToDOM(sel).
- **Selection (DOM → model)**: document selectionchange → selectionHandler.handleSelectionChange → convertDOMSelectionToModel → editor.updateSelection(modelSelection).
- **Input**: contenteditable receives input → beforeinput/keydown captured (if wired) → ReactInputHandler runs commands; or MutationObserver → handleDomMutations → C1 classify → replaceText.

---

## 3. API Contract

### 3.1 Exports

| Export | Type | Description |
|--------|------|-------------|
| EditorView | Component | Composite view; provides EditorViewContextProvider and content + overlay layers. |
| EditorViewContentLayer | Component | Renders document with ReactRenderer in contenteditable div. Must be inside EditorViewContext. |
| EditorViewLayer | Component | Overlay layer wrapper (layer prop: decorator \| selection \| context \| custom). |
| EditorViewContextProvider | Component | Provides editor, viewStateRef, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement. |
| useEditorViewContext | Hook | Returns EditorViewContextValue; throws if not inside Provider. |
| useOptionalEditorViewContext | Hook | Returns value or null. |
| createMutationObserverManager | Function | (onMutations) => ReactMutationObserverManager. |
| Types | — | EditorViewOptions, EditorViewProps, EditorViewContentLayerOptions, EditorViewLayerOptions, EditorViewLayersConfig, EditorViewLayerType, EditorViewViewState, EditorViewContextValue, ReactMutationObserverManager. |

### 3.2 EditorView Props

- **editor**: Editor (required).
- **options**: Optional.
  - **registry**: RendererRegistry (for content layer).
  - **className**: string (root container).
  - **layers**: EditorViewLayersConfig — content?, decorator?, selection?, context?, custom? (each optional; presence enables that layer).
- **children**: ReactNode (rendered inside CustomLayer when layers.custom or children present).

### 3.3 EditorViewContentLayer Props

- **options**: Optional.
  - **registry**: RendererRegistry (default getGlobalRegistry()).
  - **className**: string (contenteditable wrapper).
  - **editable**: boolean (default true).

Editor is taken from EditorViewContext only.

### 3.4 EditorViewLayer Props

- **layer**: 'decorator' | 'selection' | 'context' | 'custom'.
- **className**: Optional string.
- **style**: Optional React.CSSProperties.
- **children**: Optional ReactNode.

Default classNames and zIndex per layer: decorator (barocss-editor-decorators, 10), selection (barocss-editor-selection, 100), context (barocss-editor-context, 200), custom (barocss-editor-custom, 1000). Position absolute, pointer-events: none.

### 3.5 EditorView Static Subcomponents

- **EditorView.ContentLayer** = EditorViewContentLayer.
- **EditorView.Layer** = EditorViewLayer (generic; pass layer prop).
- **EditorView.DecoratorLayer**, **EditorView.SelectionLayer**, **EditorView.ContextLayer**, **EditorView.CustomLayer** = overlay layers with fixed layer type.

---

## 4. Context and View State

### 4.1 EditorViewContextValue

- **editor**: Editor.
- **viewStateRef**: MutableRefObject<EditorViewViewState>.
- **selectionHandler**: ReactSelectionHandler.
- **inputHandler**: ReactInputHandler.
- **mutationObserverManager**: ReactMutationObserverManager.
- **setContentEditableElement**: (el: HTMLElement | null) => void.

### 4.2 EditorViewViewState

- **isModelDrivenChange**: boolean.
- **isRendering**: boolean.
- **isComposing**: boolean.
- **skipNextRenderFromMO**: boolean — when true, next editor:content.change (from model commit during MO C1) must not trigger refresh (data-only update).
- **skipApplyModelSelectionToDOM**: boolean — when true, editor:selection.model must not call convertModelSelectionToDOM (selection came from DOM input; leave DOM selection as-is).

### 4.3 Lifecycle

- EditorViewContextProvider creates viewStateRef, contentEditableRef, selectionHandler (useMemo), inputHandler (useMemo), mutationObserverManager (useMemo), setContentEditableElement (useCallback). Subscribes to document selectionchange for selectionHandler.handleSelectionChange.
- EditorViewContentLayer: on mount/update calls setContentEditableElement(contentRef.current); on unmount setContentEditableElement(null). Subscribes to editor:content.change and editor:selection.model.

---

## 5. Layers

### 5.1 Content Layer

- Single contenteditable div. data-bc-layer="content", data-testid="editor-content".
- Renders documentSnapshot via ReactRenderer.build(model). Subscribes to editor:content.change to update documentSnapshot.
- Ref passed to setContentEditableElement so MutationObserver and selection resolution use the same root.

### 5.2 Overlay Layers

- **decorator**, **selection**, **context**, **custom**: Each is a div with position absolute, full inset, pointer-events: none, data-bc-layer={layer}. Used for overlays (decorators, selection highlight, context menu, custom UI). No built-in content; custom accepts children.

### 5.3 Conditional Rendering in EditorView

- Content layer always rendered (with merged options from options.layers?.content).
- DecoratorLayer rendered if options.layers?.decorator is truthy.
- SelectionLayer rendered if options.layers?.selection is truthy.
- ContextLayer rendered if options.layers?.context is truthy.
- CustomLayer rendered if options.layers?.custom is truthy or children is provided. Children rendered inside CustomLayer.

---

## 6. Content Layer and Renderer

### 6.1 Document Snapshot

- Initial state: editor.getDocumentProxy?.() ?? null.
- On editor:content.change: setDocumentSnapshot(e?.content ?? editor.getDocumentProxy?.() ?? null).
- If documentSnapshot is null or has no stype, content layer renders null (empty div).

### 6.2 ReactRenderer

- useMemo(() => new ReactRenderer(registry ?? getGlobalRegistry()), [registry]).
- content = useMemo(() => documentSnapshot != null && model.stype ? renderer.build(model) : null, [documentSnapshot, renderer]).
- Same registry and model shape as renderer-dom for parity (sid, stype, content, text, marks).

### 6.3 Contenteditable

- contentEditable={editable} (default true). suppressContentEditableWarning. className and options from props.

---

## 7. Selection Flow

### 7.1 DOM → Model

- **selectionchange** (document): selectionHandler.handleSelectionChange(). If not programmatic and selection inside contentEditable, convertDOMSelectionToModel(selection) → editor.updateSelection(modelSelection).
- **convertDOMSelectionToModel**: Uses data-bc-sid nodes and text-run-index (buildTextRunIndex, offset conversion) to produce ModelSelection (none | range | node). Skips nodes with data-devtool.

### 7.2 Model → DOM

- **editor:selection.model**: If !skipApplyModelSelectionToDOM, requestAnimationFrame ×2 then selectionHandler.convertModelSelectionToDOM(sel). Converts model range to DOM range and sets selection.

### 7.3 ReactSelectionHandler

- **isSelectionInsideEditableText(domSelection?)**: Returns true if selection is entirely inside inline-text nodes (data-bc-sid + model.stype === 'inline-text').
- **setProgrammaticChange(value)**: When true, handleSelectionChange no-ops (avoids feedback loop when applying model selection to DOM).
- **convertModelSelectionToDOM**: Resolves sid + offset to DOM node + offset; uses text-run-index and buildTextRunIndex. Sets window.getSelection() range.

---

## 8. Input and DOM Sync

### 8.1 ReactInputHandler

- **beforeinput / keydown**: Dispatches to replaceText, insertParagraph, deleteContentBackward, etc., based on inputType and key. Uses selectionHandler for current model selection and isSelectionInsideEditableText.
- **setComposing(isComposing)**: Updates viewStateRef.current.isComposing (and viewState for consumers).
- **syncFocusedTextNodeAfterComposition**: After compositionend, reconstructs DOM text of focused inline-text node, compares to model; if different, executeCommand('replaceText', …) and update model selection; sets skipApplyModelSelectionToDOM during apply.

### 8.2 handleDomMutations

- MutationObserver batches mutations (setTimeout 0) then calls inputHandler.handleDomMutations(mutations).
- **classifyDomChangeC1(mutations, options)**: If mutations are confined to a single inline-text node (data-bc-sid, stype === 'inline-text') and no block-like nodes added/removed, returns ClassifiedChangeC1 { nodeId, prevText, newText, … }. Otherwise UNKNOWN.
- **C1 path**: replaceText command with range and text from classification. Optionally skipNextRenderFromMO to avoid double refresh.
- **Structural / UNKNOWN**: Can trigger other commands or no-op; behavior is implementation-specific.

### 8.3 DOM Sync Utilities (dom-sync)

- **findClosestInlineTextNode(node)**: Walk up to find Element with data-bc-sid (any; caller checks model stype if needed).
- **reconstructModelTextFromDOM(inlineTextNode)**: buildTextRunIndex(inner text runs) and concatenate text. Used for C1 newText and syncFocusedTextNodeAfterComposition.
- **classifyDomChangeC1**: Ported from editor-view-dom C1; uses editor, selection, modelSelection, inputHint, isComposing.

---

## 9. MutationObserver

### 9.1 ReactMutationObserverManager

- **setup(contentEditableElement)**: Disconnect previous observer; create MutationObserver with observe(..., { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-bc-edit', 'data-bc-value', 'data-bc-sid', 'data-bc-stype'], characterDataOldValue: true, attributeOldValue: true }). On mutation, push to pending; setTimeout(0) then invoke onMutations(pending) and clear pending.
- **disconnect()**: Disconnect observer, clear timer and pending.

### 9.2 Wiring

- EditorViewContextProvider creates manager with onMutations = (mutations) => inputHandler.handleDomMutations(mutations).
- EditorViewContentLayer sets ref → setContentEditableElement(el). Context setContentEditableElement: on change, disconnect from old element, assign ref, setup(new element).

---

## 10. Test Strategy and Required Tests

### 10.1 Principles

- **Spec-first**: Tests assert behavior described in this spec (context, layers, selection/input wiring, DOM sync).
- **Unit where possible**: ReactSelectionHandler, ReactInputHandler, createMutationObserverManager, classifyDomChangeC1, findClosestInlineTextNode, reconstructModelTextFromDOM can be tested with mocks.
- **Integration**: EditorView mount with mock Editor (getDocumentProxy, on/off), assert content layer renders, context provides handlers, layers render when configured.

### 10.2 Required Test Categories

1. **EditorViewContextProvider**
   - Provides editor, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement, viewStateRef.
   - useEditorViewContext throws when outside Provider; useOptionalEditorViewContext returns null.

2. **EditorView**
   - Renders content layer with merged options (registry, className, editable).
   - Renders overlay layers only when options.layers?.decorator etc. are set.
   - Renders children inside CustomLayer when layers.custom or children present.
   - Root div has data-editor-view="true", position relative.

3. **EditorViewContentLayer**
   - Subscribes to editor:content.change; documentSnapshot updates; renderer.build called with snapshot.
   - Subscribes to editor:selection.model; when !skipApplyModelSelectionToDOM, convertModelSelectionToDOM called (e.g. in rAF).
   - setContentEditableElement called with ref on mount and null on unmount.
   - contenteditable div has data-bc-layer="content", data-testid="editor-content".

4. **EditorViewLayer**
   - Renders div with data-bc-layer={layer}, position absolute, pointer-events none, correct default className and zIndex per layer type.

5. **ReactSelectionHandler**
   - convertDOMSelectionToModel with mock Editor and DOM (data-bc-sid nodes) returns expected ModelSelection.
   - isSelectionInsideEditableText returns true/false for selection inside/outside inline-text.
   - setProgrammaticChange(true) causes handleSelectionChange to skip updateSelection.

6. **ReactMutationObserverManager**
   - setup(element) observes element; disconnect() stops observing. Callback invoked with batched mutations (setTimeout 0).

7. **dom-sync**
   - findClosestInlineTextNode returns closest element with data-bc-sid.
   - reconstructModelTextFromDOM returns concatenated text from text runs.
   - classifyDomChangeC1 returns C1 or null for given mutations and options.

### 10.3 Test Environment

- **Vitest** for unit tests. **React Testing Library** (or @testing-library/react) for component tests if needed. JSDOM for DOM/selection tests.
- Mock Editor: getDocumentProxy(), on(), off(), updateSelection(), executeCommand(), dataStore.getNode().

---

## 11. References and analysis

- **React editing view analysis**: `packages/renderer-react/docs/editing-view-react-analysis.md` — comparison with ProseMirror/Lexical/TipTap, risks (cursor, IME, reconciliation), and improvements (skipNextRenderFromMO, E2E).

---

## 12. Out of Scope and Future

| Feature | Current | Future |
|---------|---------|--------|
| Decorator DOM rendering | Layer slot only; no built-in decorator DOM | Optional decorator list and overlay DOM |
| E2E typing/selection in app | Manual or apps/editor-react E2E | Playwright E2E for editor-react |
| when()/each() in templates | Handled by renderer-react (unsupported) | — |
| IME composition edge cases | syncFocusedTextNodeAfterComposition; composition state in viewState | More tests and edge cases |
| Portal / overlay positioning | Layers are absolute full-size | Fine-grained positioning if needed |

---

## Checklist (Concrete)

- [x] EditorViewContextProvider provides editor, viewStateRef, selectionHandler, inputHandler, mutationObserverManager, setContentEditableElement.
- [x] useEditorViewContext throws outside Provider; useOptionalEditorViewContext returns null outside.
- [x] EditorView renders content layer; overlay layers only when options.layers.* set; children in CustomLayer.
- [x] EditorViewContentLayer subscribes to editor:content.change and editor:selection.model; setContentEditableElement(ref) on mount/unmount (implementation; see SPEC_VERIFICATION.md).
- [x] EditorViewLayer renders with data-bc-layer, position absolute, pointer-events none, default classNames/zIndex.
- [x] ReactSelectionHandler isSelectionInsideEditableText / setProgrammaticChange behave as spec (convertDOMSelectionToModel covered by implementation).
- [x] ReactMutationObserverManager setup/disconnect and batch callback.
- [x] findClosestInlineTextNode, reconstructModelTextFromDOM behave as spec (classifyDomChangeC1 implementation verified; optional unit test).
