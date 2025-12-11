# editor-view-dom Specification

This document is the technical specification for the `@barocss/editor-view-dom` package. Implementation and tests are based on this document.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Layer System](#2-layer-system)
3. [renderer-dom Integration](#3-renderer-dom-integration)
4. [Event Handler System](#4-event-handler-system)
5. [Decorator System](#5-decorator-system)
6. [skipNodes Feature](#6-skipnodes-feature)
7. [Keymap System](#7-keymap-system)
8. [Native Commands](#8-native-commands)
9. [Selection Management](#9-selection-management)
10. [Lifecycle](#10-lifecycle)
11. [Error Handling](#11-error-handling)
12. [Performance Requirements](#12-performance-requirements)

---

## 1. Architecture Overview

### 1.1 Roles and Responsibilities

`EditorViewDOM` acts as the bridge between `editor-core` and the browser DOM.

**Key responsibilities:**
- Render `editor-core` model data to DOM
- Convert user input (DOM events) into model changes
- Manage selection (DOM ↔ Model)
- Manage decorator system
- Manage layer system (5 layers)

### 1.2 Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EditorViewDOM                             │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Editor (editor-core)                              │    │
│  │  - getDocumentProxy() → Proxy<INode>              │    │
│  │  - exportDocument() → INode                        │    │
│  │  - dataStore.getAllDecorators() → Decorator[]     │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Event Handlers                                    │    │
│  │  - InputHandler (input, beforeinput, composition) │    │
│  │  - SelectionHandler (DOM ↔ Model)                 │    │
│  │  - MutationObserverManager (DOM change detection) │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  renderer-dom Integration                          │    │
│  │  - DOMRenderer (Content layer)                    │    │
│  │  - DOMRenderer (Decorator/Selection/Context/Custom)│    │
│  │  - RendererRegistry                                 │    │
│  └────────────────────────────────────────────────────┘    │
│                          │                                   │
│                          ▼                                   │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Layer System (5 layers)                           │    │
│  │  - content (contentEditable)                       │    │
│  │  - decorator, selection, context, custom            │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 1.3 Data Flow

#### Rendering Flow (Model → DOM)

```
Editor.getDocumentProxy() or external ModelData
    │
    ├─ ModelData format (uses sid, stype)
    │
    ▼
EditorViewDOM.render()
    │
    ├─ Collect decorator data (dataStore.getAllDecorators())
    │
    ▼
DOMRenderer.render(container, modelData, decorators, skipNodes)
    │
    ├─ VNodeBuilder: ModelData → VNode Tree
    ├─ Reconciler: VNode Tree → DOM diff (apply skipNodes)
    └─ DOMOperations: DOM update
    │
    ▼
layers.content (contentEditable)
```

#### Input Flow (DOM → Model)

```
User input (DOM events)
    │
    ├─ InputHandler.handleInput()
    │  └─ handle beforeInput event
    │
    ├─ MutationObserverManager
    │  └─ Detect DOM changes
    │
    ▼
InputHandler.handleTextContentChange()
    │
    ├─ SmartTextAnalyzer: DOM change → TextChange
    │
    ▼
Editor.executeTransaction()
    │
    ├─ model update
    │
    ▼
editor:content.change event
    │
    ▼
EditorViewDOM.render() (apply skipNodes)
```

### 1.4 Core Principles

- **Layer separation**: split UI into 5 independent layers
- **renderer-dom integration**: all rendering goes through `renderer-dom`
- **Event-driven**: convert DOM events into model changes
- **skipNodes protection**: nodes being edited are protected from external changes
- **Model-first**: model is always the Single Source of Truth

---

## 2. Layer System

### 2.1 Layer Structure

`EditorViewDOM` uses 5 independent layers:

```
Container (position: relative)
├─ Layer 1: Content (z-index: 1)
│  └─ contentEditable = true
│  └─ renderer-dom renders here
│
├─ Layer 2: Decorator (z-index: 10)
│  └─ layer category decorators
│
├─ Layer 3: Selection (z-index: 100)
│  └─ selection indicators
│
├─ Layer 4: Context (z-index: 200)
│  └─ tooltips, context menus
│
└─ Layer 5: Custom (z-index: 1000)
   └─ custom overlay
```

### 2.2 Layer Characteristics

| Layer | Z-Index | Position | Pointer Events | Purpose | Diff Included |
|-------|---------|----------|----------------|---------|---------------|
| **Content** | 1 | `relative` | ✅ Enabled | Editable content, text input | ✅ Yes |
| **Decorator** | 10 | `absolute` | ❌ Disabled* | Highlights, annotations, widgets | Layer: ✅ / Widget: ❌ |
| **Selection** | 100 | `absolute` | ❌ Disabled | Selection indicators, cursor | ❌ No |
| **Context** | 200 | `absolute` | ❌ Disabled | Context menus, tooltips | ❌ No |
| **Custom** | 1000 | `absolute` | ❌ Disabled | User-defined overlays | ❌ No |

*Some decorator elements (inline/block widgets) may enable pointer events

### 2.3 Layer Creation

Layers are automatically created in the `EditorViewDOM` constructor:

```typescript
const view = new EditorViewDOM(editor, {
  container: document.getElementById('editor-container'),
  layers: {
    contentEditable: {
      className: 'my-editor-content',
      attributes: { 'data-testid': 'editor' }
    },
    decorator: {
      className: 'my-decorators'
    },
    // ... other layer configs
  }
});
```

### 2.4 Layer Access

```typescript
view.layers.content      // HTMLElement - contentEditable layer
view.layers.decorator    // HTMLElement - decorator overlay layer
view.layers.selection    // HTMLElement - selection UI layer
view.layers.context      // HTMLElement - context UI layer
view.layers.custom       // HTMLElement - custom overlay layer
```

---

## 3. renderer-dom Integration

### 3.1 DOMRenderer Instances

`EditorViewDOM` uses multiple `DOMRenderer` instances:

- **`_domRenderer`**: for Content layer (Selection preservation enabled)
- **`_decoratorRenderer`**: for Decorator layer
- **`_selectionRenderer`**: for Selection layer
- **`_contextRenderer`**: for Context layer
- **`_customRenderer`**: for Custom layer

Each `DOMRenderer` maintains its own `prevVNodeTree`.

### 3.2 Rendering Flow

```typescript
// EditorViewDOM.render()
render(tree?: ModelData, options?: { sync?: boolean }): void {
  // 1. fetch model data
  const modelData = tree || this.editor.getDocumentProxy();
  
  // 2. collect decorator data
  const allDecorators = this.editor.dataStore.getAllDecorators();
  const decoratorData = allDecorators.map(d => convertToDecoratorData(d));
  
  // 3. prepare selection context
  const selectionContext = this.selectionHandler.getSelectionContext();
  
  // 4. render content layer (sync)
  this._domRenderer?.render(
    this.layers.content,
    modelData,
    decoratorData,
    undefined,
    selectionContext,
    { skipNodes: this._editingNodes.size > 0 ? this._editingNodes : undefined }
  );
  
  // 5. render other layers (after requestAnimationFrame)
  // ...
}
```

### 3.3 Data Format

**All data is in ModelData format (uses sid, stype):**

```typescript
{
  sid: 'doc-1',           // node identifier (required)
  stype: 'document',      // node type (required)
  content: [...],         // child node array
  text: '...',            // text content (optional)
  marks: [...],           // text marks
  attributes: {...}        // node attributes
}
```

**Use directly without conversion**: data is already ModelData, so pass to `renderer-dom` as-is.

### 3.4 Decorator Data Conversion

```typescript
function convertToDecoratorData(decorator: any): DecoratorData {
  return {
    sid: decorator.sid || decorator.id,
    stype: decorator.stype || decorator.type,
    category: decorator.category || 'inline',
    position: decorator.position, // 'before' | 'after' | 'inside'
    target: {
      sid: decorator.target.sid || decorator.target.nodeId,
      startOffset: decorator.target.startOffset,
      endOffset: decorator.target.endOffset
    },
    data: decorator.data || {}
  };
}
```

---

## 4. Event Handler System

### 4.1 InputHandler

**Role**: Handle user input (text input, IME composition)

**Key methods:**
- `handleInput(event: InputEvent)`: handle input event
- `handleBeforeInput(event: InputEvent)`: handle beforeInput event
- `handleTextContentChange(oldValue, newValue, target)`: called from MutationObserver to update model
- `handleCompositionStart/Update/End()`: handle IME composition

**Flow:**
```
DOM change (MutationObserver)
    │
    ▼
InputHandler.handleTextContentChange()
    │
    ├─ SmartTextAnalyzer: DOM change → TextChange
    │
    ▼
Editor.executeTransaction()
    │
    ├─ model update
    │
    ▼
editor:content.change event
    │
    ▼
EditorViewDOM.render() (apply skipNodes)
```

### 4.2 SelectionHandler

**Role**: Convert DOM Selection ↔ Model Selection

**Key methods:**
- `convertDOMSelectionToModel(sel: Selection)`: DOM → Model
- `convertModelSelectionToDOM(sel: ModelSelection)`: Model → DOM

**Behavior:**
- On `selectionchange`, convert DOM Selection to Model Selection
- On `editor:selection.model`, convert Model Selection to DOM Selection

### 4.3 MutationObserverManager

**Role**: Detect DOM changes

**Key features:**
- Detect text changes (`onTextChange`)
- Detect structural changes (`onStructureChange`)
- Detect attribute changes (`onAttributeChange`)

**Protection:**
- `_isRendering` flag ignores DOM changes during rendering (prevents infinite loop)

### 4.4 Event Listener Setup

```typescript
private setupEventListeners(): void {
  // Input events
  this.contentEditableElement.addEventListener('input', this.handleInput.bind(this));
  this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
  this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));
  this.contentEditableElement.addEventListener('paste', this.handlePaste.bind(this));
  this.contentEditableElement.addEventListener('drop', this.handleDrop.bind(this));
  
  // Composition events (IME)
  this.contentEditableElement.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
  this.contentEditableElement.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
  this.contentEditableElement.addEventListener('compositionend', this.handleCompositionEnd.bind(this));
  
  // Selection events
  document.addEventListener('selectionchange', this.handleSelectionChange.bind(this));
  
  // Focus events
  this.contentEditableElement.addEventListener('focus', this.handleFocus.bind(this));
  this.contentEditableElement.addEventListener('blur', this.handleBlur.bind(this));
}
```

---

## 5. Decorator System

### 5.1 Decorator Categories

1. **Layer Decorator**: CSS/overlay-only representation (included in diff)
2. **Inline Decorator**: DOM widgets inserted inside text (excluded from diff)
3. **Block Decorator**: DOM widgets inserted at block level (excluded from diff)

### 5.2 Decorator Managers

- **`DecoratorRegistry`**: Register decorator types and renderers
- **`DecoratorManager`**: Decorator CRUD
- **`RemoteDecoratorManager`**: Manage remote decorators
- **`PatternDecoratorConfigManager`**: Manage pattern-based decorator configs
- **`DecoratorGeneratorManager`**: Manage function-based decorator generation

### 5.3 Decorator Rendering

```typescript
// Add decorator
view.decoratorManager.add({
  id: 'highlight-1',
  category: 'layer',
  type: 'highlight',
  target: { nodeId: 'text-1', startOffset: 0, endOffset: 5 },
  data: { backgroundColor: 'yellow' }
});

// Decorator rendering is automatic on render()
view.render();
```

---

## 6. skipNodes Feature

### 6.1 Purpose

Protect nodes under user input from external changes (AI, collaboration).

### 6.2 How It Works

```typescript
// On input start
private _onInputStart(): void {
  const sids = this._getEditingNodeSids();
  sids.forEach(sid => this._editingNodes.add(sid));
}

// On input end (debounced)
private _onInputEnd(): void {
  if (this._inputEndDebounceTimer) {
    clearTimeout(this._inputEndDebounceTimer);
  }
  
  this._inputEndDebounceTimer = window.setTimeout(() => {
    this._editingNodes.clear();
    // Re-render without skipNodes to reflect latest model
    this.render();
  }, 300); // 300ms debounce
}
```

### 6.3 Apply to Rendering

```typescript
this._domRenderer?.render(
  this.layers.content,
  modelData,
  allDecorators,
  undefined,
  selectionContext,
  { skipNodes: this._editingNodes.size > 0 ? this._editingNodes : undefined }
);
```

### 6.4 Flow

```
1. User input starts  
   → _onInputStart() → add to editingNodes

2. External change occurs (AI, collaboration)  
   → model update (always)  
   → render({ skipNodes: editingNodes })  
   → skip DOM update (protect editing nodes)

3. User input ends  
   → _onInputEnd() → remove editingNodes (300ms debounce)  
   → render() (no skipNodes)  
   → DOM update (reflect latest model)
```

### 6.5 Relation to Handlers

**Key point**: `skipNodes` is a rendering concept; handlers update the model and are unaffected by `skipNodes`.

- **InputHandler**: Always updates model (independent of skipNodes)
- **SelectionHandler**: Only handles selection conversion (independent of skipNodes)
- **MutationObserverManager**: Only detects DOM changes (already protected by `_isRendering`)

---

## 7. Keymap System

### 7.1 Default keymap

```typescript
// Formatting
Ctrl+B / Cmd+B → toggleBold()
Ctrl+I / Cmd+I → toggleItalic()
Ctrl+U / Cmd+U → toggleUnderline()

// Editing
Enter → insertParagraph()
Shift+Enter → insertLineBreak()

// History
Ctrl+Z / Cmd+Z → historyUndo()
Ctrl+Y / Cmd+Y → historyRedo()
Ctrl+Shift+Z / Cmd+Shift+Z → historyRedo()

// Selection
Ctrl+A / Cmd+A → selectAll()
```

### 7.2 Register custom keymap

```typescript
view.keymapManager.register('Ctrl+Shift+h', () => {
  editor.executeCommand('heading.insert', { level: 2 });
});

view.keymapManager.register('Ctrl+/', () => {
  editor.executeCommand('comment.toggle');
});
```

---

## 8. Native Commands

### 8.1 Supported commands

```typescript
// Text insert/delete
view.insertText('Hello world');
view.insertParagraph();
view.deleteSelection();

// History
view.historyUndo();
view.historyRedo();

// Formatting
view.toggleBold();
view.toggleItalic();
view.toggleUnderline();
```

### 8.2 How it works

All Native Commands update the model via `editor-core` command system, then `render()` is called automatically.

---

## 9. Selection Management

### 9.1 DOM ↔ Model conversion

```typescript
// DOM Selection → Model Selection
const modelSelection = view.selectionHandler.convertDOMSelectionToModel(
  window.getSelection()
);

// Model Selection → DOM Selection
view.selectionHandler.convertModelSelectionToDOM({
  nodeId: 'text-1',
  startOffset: 0,
  endOffset: 5
});
```

### 9.2 Selection events

```typescript
// On DOM Selection change
view.on('editor:selection.change', (data) => {
  console.log('Model selection:', data.selection);
});

// On Model Selection change
editor.on('editor:selection.model', (sel) => {
  // Convert to DOM Selection and apply
});
```

---

## 10. Lifecycle

### 10.1 Initialization

```typescript
const view = new EditorViewDOM(editor, {
  container: document.getElementById('editor-container'),
  registry: getGlobalRegistry(),
  autoRender: true,
  initialTree: { ... } // optional
});
```

**Initialization order:**
1. Create layer structure
2. Initialize decorator system
3. Initialize event handlers
4. Configure keymap
5. Set up event listeners
6. Set up MutationObserver
7. Set up renderers
8. If `autoRender` is true and `initialTree` exists, render automatically

### 10.2 Rendering

```typescript
// Render entire document
view.render();

// Render with specific model data
view.render({
  sid: 'doc1',
  stype: 'document',
  content: [...]
});
```

### 10.3 Teardown

```typescript
view.destroy();
```

**Cleanup tasks:**
- Remove event listeners
- Disconnect MutationObserver
- Clean decorators
- Clean keymap
- Clean renderers

---

## 11. Error Handling

### 11.1 Rendering errors

```typescript
try {
  this._domRenderer?.render(...);
} catch (error) {
  console.error('[EditorViewDOM] Error rendering content:', error);
  // Even if content rendering fails, still try rendering decorators
}
```

### 11.2 Model validation

- Error if `stype` field is missing (required)
- Error if `sid` field is missing (required)
- Error if template for `stype` is not registered

### 11.3 Decorator conversion failure

Decorator conversion failure logs a warning and continues.

---

## 12. Performance Requirements

### 12.1 Rendering performance

- Rendering time < 100ms even for large documents (5000+ nodes)
- Maintain input-time performance via partial updates with `skipNodes`

### 12.2 Event handling performance

- Input event handling < 1ms
- Selection change handling < 16ms (60fps)

### 12.3 Memory usage

- Proxy-based lazy evaluation optimizes initial load time and memory footprint
- Independent `prevVNodeTree` per layer increases memory usage (necessary trade-off)

---

## References

- [renderer-dom specification](../../renderer-dom/docs/renderer-dom-spec.md)
- [renderer-dom integration spec](./renderer-dom-integration-spec.md)
- [skipNodes handlers integration guide](./skipnodes-handlers-integration.md)

