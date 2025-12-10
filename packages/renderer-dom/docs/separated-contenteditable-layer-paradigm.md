# Separated ContentEditable Layer Paradigm: Complete Separation of Rendering and Editing through EditableSimulator

## Abstract

This paper proposes a new paradigm that introduces **EditableSimulator**, a new concept, to **completely separate the rendering area and ContentEditable layer** in order to solve fundamental problems of ContentEditable-based rich text editors.

**EditableSimulator** is a new tool concept that edits models externally, similar to design tools' sidebars or property panels. It copies the original structure as-is, combines it into an editable state, then applies ContentEditable. By leveraging transparency, it has the advantage that only cursor position and Selection need to be accurate, and the underlying structure doesn't need much attention.

Existing editors handle rendering and editing simultaneously in the ContentEditable area, facing complexity in Selection/Cursor management and dual state management problems. This paper proposes a method where a **transparent ContentEditable layer is overlaid on the rendering area** to handle only editing functionality, while actual rendering is handled model-based.

This approach maintains users' existing habits of typing text in specific areas with keyboards while fundamentally solving ContentEditable's problems.

**Keywords**: EditableSimulator, Separated ContentEditable Layer, Rendering-Edit Separation, Overlay ContentEditable, Transparent Input Layer, Rich Text Editor

---

## 1. Introduction

### 1.1 Problems with Existing Approaches

Existing ContentEditable-based editors:
- Rendering and editing occur in the same area
- ContentEditable directly modifies DOM
- Detect DOM changes with MutationObserver to synchronize model
- Dual state management (DOM ↔ Model)
- Complexity in Selection/Cursor management

### 1.2 New Perspective: EditableSimulator

**Core Idea**: Introduce a new tool concept called **EditableSimulator**.

**EditableSimulator** is:
- A tool that **only handles editable aspects** to enable simulation
- A new tool concept that **edits models externally**, like design tools' sidebars and property panels
- Copies original structure as-is, **combines into editable state**, then applies ContentEditable
- Leverages transparency so **only cursor position/Selection need to be accurate**, underlying structure doesn't need much attention

**Complete Separation of Rendering Area and ContentEditable Area**:

1. **Rendering Area**: Renders model-based without ContentEditable
2. **EditableSimulator (Edit Layer)**: Overlays transparent ContentEditable layer on rendering area
3. **Synchronization**: Converts edit layer input to model, reflects model changes to rendering area

This results in:
- Rendering area has unidirectional data flow (Model → DOM)
- EditableSimulator only handles input (keyboard/mouse → Model)
- Two areas completely separated, can solve each area's problems independently

### 1.3 Maintaining User Experience

Users still:
- Type text in specific areas with keyboard
- Click with mouse to move cursor
- Drag to select text

But internally:
- Rendering area and edit layer are separated
- Each area operates independently

---

## 2. Architecture

### 2.1 Overall Structure

```typescript
interface SeparatedEditorLayout {
  renderLayer: RenderLayer;        // Rendering area (no ContentEditable)
  editableSimulator: EditableSimulator;  // EditableSimulator (transparent ContentEditable)
  syncManager: SyncManager;        // Synchronization manager
}

class SeparatedContentEditableEditor {
  private layout: SeparatedEditorLayout;
  private model: DocumentModel;
  
  setup(): void {
    // 1. Set up rendering area (no ContentEditable)
    this.layout.renderLayer = new RenderLayer({
      container: this.container,
      model: this.model
    });
    
    // 2. Set up EditableSimulator (transparent ContentEditable)
    this.layout.editableSimulator = new EditableSimulator({
      container: this.container,
      renderLayer: this.layout.renderLayer,
      onInput: (text, offset) => this.handleInput(text, offset)
    });
    
    // 3. Set up synchronization manager
    this.layout.syncManager = new SyncManager({
      renderLayer: this.layout.renderLayer,
      editableSimulator: this.layout.editableSimulator,
      model: this.model
    });
  }
}
```

### 2.2 Layer Structure Diagram

```
┌─────────────────────────────────────────┐
│  Edit Layer (Transparent ContentEditable)│
│  - Exactly same structure as rendering area│
│  - Text identical within inline-text     │
│  - Set invisible (opacity: 0)          │
│  - Only cursor visible                  │
│  - Real-time synchronization            │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  Render Layer (Model-based Rendering)   │
│  - No ContentEditable                   │
│  - Model → DOM unidirectional data flow │
│  - Complete control possible            │
│  - Can render continuously              │
└─────────────────────────────────────────┘
```

**Core**: Edit layer has **exactly the same structure** as rendering area, so position calculation is not needed. Just make it transparent.

### 2.3 Real-time Synchronization

**Core Principle**: **Synchronize** edit layer and rendering area **in real-time**.

```typescript
class SyncManager {
  private renderLayer: RenderLayer;
  private editLayer: EditLayer;
  private model: DocumentModel;
  
  // Set up real-time synchronization
  setupRealtimeSync(): void {
    // 1. Edit layer → Model → Render layer (on input)
    this.editLayer.onInput((text, offset) => {
      // Update model
      this.model.insertText(offset, text);
      
      // Update render layer immediately
      this.renderLayer.render();
      
      // Re-synchronize edit layer content (same as render layer)
      this.editLayer.syncContentFromRender();
    });
    
    // 2. Model change → Render layer → Edit layer (on external change)
    this.model.onChange(() => {
      // Update render layer
      this.renderLayer.render();
      
      // Re-synchronize edit layer content (same as render layer)
      this.editLayer.syncContentFromRender();
      
      // Preserve cursor position
      this.editLayer.preserveCursorPosition();
    });
  }
}
```

**Synchronization Method**:
- Edit layer maintains **exactly the same structure** as render layer
- When render layer changes, edit layer updates to match immediately
- Position calculation unnecessary (structures are identical)

---

## 3. Implementation

### 3.1 Rendering Area (Render Layer)

```typescript
class RenderLayer {
  private container: HTMLElement;
  private model: DocumentModel;
  private renderer: DOMRenderer;
  
  setup(): void {
    // No ContentEditable
    this.container.contentEditable = 'false';
    
    // Model-based rendering
    this.renderer = new DOMRenderer(this.container);
  }
  
  render(): void {
    // Model → DOM unidirectional data flow
    this.renderer.render(this.model);
  }
  
  // Calculate cursor position (for edit layer synchronization)
  getCursorPosition(modelOffset: number): { x: number; y: number } {
    // Convert model offset to DOM position
    const textNode = this.findTextNodeAtOffset(modelOffset);
    const offsetInNode = modelOffset - textNode.startOffset;
    
    const range = document.createRange();
    range.setStart(textNode.domNode, offsetInNode);
    range.setEnd(textNode.domNode, offsetInNode);
    
    const rect = range.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    
    return {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top
    };
  }
  
  // Calculate text range (for Selection synchronization)
  getTextRange(startOffset: number, endOffset: number): DOMRect[] {
    // Convert model offset range to DOM position
    const ranges: DOMRect[] = [];
    // ... range calculation logic
    return ranges;
  }
}
```

### 3.2 Edit Layer

**Core**: Edit layer has **exactly the same structure** as render layer. Just make it transparent.

```typescript
class EditLayer {
  private container: HTMLElement;
  private editElement: HTMLElement; // Transparent ContentEditable
  private renderLayer: RenderLayer;
  private model: DocumentModel;
  
  setup(): void {
    // Edit layer container
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: auto;
      z-index: 10;
    `;
    
    // Transparent ContentEditable element
    // Created with exactly same structure as render layer
    this.editElement = this.cloneRenderStructure();
    this.editElement.contentEditable = 'true';
    
    // Set transparent (only cursor visible)
    this.editElement.style.cssText = `
      width: 100%;
      height: 100%;
      opacity: 0;  // Completely transparent
      color: transparent;  // Text also transparent
      background: transparent;
      caret-color: #000;  // Only cursor visible
      outline: none;
      pointer-events: auto;
    `;
    
    // Text within inline-text remains identical
    // (Same structure as render layer)
    
    this.container.appendChild(this.editElement);
    
    // Place edit layer on top of render layer
    this.renderLayer.container.appendChild(this.container);
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Set up real-time synchronization
    this.setupRealtimeSync();
  }
  
  // Clone render layer structure
  cloneRenderStructure(): HTMLElement {
    // Clone render layer's DOM structure
    const renderElement = this.renderLayer.container.cloneNode(true) as HTMLElement;
    
    // All text remains as-is (transparent but structure identical)
    // Text within inline-text remains identical
    
    return renderElement;
  }
  
  setupEventListeners(): void {
    // Input event
    this.editElement.addEventListener('input', (e) => {
      this.handleInput(e);
    });
    
    // Selection change event
    this.editElement.addEventListener('selectionchange', () => {
      this.handleSelectionChange();
    });
    
    // IME events
    this.editElement.addEventListener('compositionstart', (e) => {
      this.handleCompositionStart(e);
    });
    
    this.editElement.addEventListener('compositionend', (e) => {
      this.handleCompositionEnd(e);
    });
  }
  
  // Set up real-time synchronization
  setupRealtimeSync(): void {
    // Detect render layer changes
    const observer = new MutationObserver(() => {
      // Synchronize edit layer immediately when render layer changes
      this.syncContentFromRender();
    });
    
    observer.observe(this.renderLayer.container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // Synchronize content from render layer to edit layer
  syncContentFromRender(): void {
    // Clone render layer structure and apply to edit layer
    // Position calculation unnecessary (structures are identical)
    
    const renderHTML = this.renderLayer.container.innerHTML;
    
    // Apply same structure to edit layer
    this.editElement.innerHTML = renderHTML;
    
    // Set transparent (already set but reconfirm)
    this.makeTransparent(this.editElement);
    
    // Preserve cursor position
    this.preserveCursorPosition();
  }
  
  // Make all elements transparent (only cursor visible)
  makeTransparent(element: HTMLElement): void {
    // Traverse all child elements and set transparent
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        el.style.color = 'transparent';
        el.style.opacity = '0';
        el.style.background = 'transparent';
      }
    }
    
    // Only cursor visible
    element.style.caretColor = '#000';
  }
  
  // Preserve cursor position
  preserveCursorPosition(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Save current cursor position
    const range = selection.getRangeAt(0);
    const offset = this.getOffsetInEditLayer(range);
    
    // Restore cursor position after synchronization
    requestAnimationFrame(() => {
      this.setCursorOffset(offset);
    });
  }
  
  // Input handling (simplified)
  handleInput(event: InputEvent): void {
    // Convert edit layer changes to model
    const newText = this.editElement.textContent || '';
    const oldText = this.model.getText();
    
    // Calculate changes (simple diff)
    const changes = this.calculateChanges(oldText, newText);
    
    // Update model
    for (const change of changes) {
      if (change.type === 'insert') {
        this.model.insertText(change.offset, change.text);
      } else if (change.type === 'delete') {
        this.model.deleteText(change.offset, change.length);
      }
    }
    
    // Update render layer immediately (can render continuously)
    this.renderLayer.render();
    
    // Re-synchronize edit layer content (same as render layer)
    // Automatically handled by real-time synchronization
    this.syncContentFromRender();
  }
  
  // Calculate changes (simplified)
  calculateChanges(oldText: string, newText: string): Change[] {
    // Simple diff algorithm
    // Or use text-analyzer
    const changes: Change[] = [];
    
    // Detect minimal changes with LCS/LCP algorithm
    // ...
    
    return changes;
  }
  
  // Handle Selection change
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const editOffset = this.getOffsetInEditLayer(range);
    
    // Convert to model Selection
    const modelSelection = this.convertToModelSelection(editOffset);
    
    // Display Selection in render layer (optional)
    // this.renderLayer.renderSelection(modelSelection);
  }
  
  // IME handling
  handleCompositionStart(event: CompositionEvent): void {
    // IME composition start
    // Naturally handled since edit layer is ContentEditable
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    // IME composition end
    // Synchronize edit layer changes to model
    this.handleInput(event as any);
  }
}
```

### 3.3 Input Simplification

Since edit layer has exactly the same structure as render layer, input handling becomes simple:

```typescript
class EditLayer {
  // Simplified input handling
  handleInput(event: InputEvent): void {
    // Browser automatically handles since edit layer is ContentEditable
    // We only need to detect changes and convert to model
    
    // 1. Current state of edit layer
    const editText = this.editElement.textContent || '';
    
    // 2. Current state of model
    const modelText = this.model.getText();
    
    // 3. Calculate changes (simple diff)
    if (editText !== modelText) {
      const changes = this.calculateSimpleDiff(modelText, editText);
      
      // 4. Update model
      this.applyChangesToModel(changes);
      
      // 5. Update render layer (can render continuously)
      this.renderLayer.render();
      
      // 6. Re-synchronize edit layer (automatically handled)
      // Automatically becomes same as render layer due to real-time synchronization
    }
  }
  
  // Calculate simple diff
  calculateSimpleDiff(oldText: string, newText: string): Change[] {
    // Use text-analyzer or simple LCS algorithm
    // ...
  }
}
```

**Core**: Since edit layer has same structure as render layer, input handling is very simple. Browser automatically handles with ContentEditable, and we only need to detect changes and convert to model.

### 3.4 Display Cursor as Decorator in Render Layer

**Core Idea**: Make edit layer completely transparent and display cursor as **decorator in render layer**. This makes users see cursor as if it's in the render layer.

```typescript
class EditLayer {
  setup(): void {
    // Edit layer style - completely transparent
    this.editElement.style.cssText = `
      width: 100%;
      height: 100%;
      opacity: 0;  // Completely transparent
      color: transparent;  // Text transparent
      background: transparent;
      caret-color: transparent;  // Edit layer cursor also transparent
      outline: none;
      font-family: inherit;  // Same font as render layer
      font-size: inherit;
      line-height: inherit;
      padding: inherit;
      margin: inherit;
    `;
    
    // Edit layer cursor is not visible
    // Instead, display cursor as decorator in render layer
  }
  
  // Update cursor position on Selection change
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Convert edit layer cursor position to model offset
    const range = selection.getRangeAt(0);
    const modelOffset = this.convertToModelOffset(range);
    
    // Display cursor decorator in render layer
    this.renderLayer.showCursorDecorator(modelOffset);
    
    // Also display Selection in render layer
    if (!selection.isCollapsed) {
      const modelSelection = this.convertToModelSelection(range);
      this.renderLayer.renderSelection(modelSelection);
    }
  }
}
```

```typescript
class RenderLayer {
  private cursorDecorator: HTMLElement | null = null;
  
  // Display cursor decorator
  showCursorDecorator(modelOffset: number): void {
    // Remove existing cursor decorator
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
    }
    
    // Convert model offset to DOM position
    const position = this.getCursorPosition(modelOffset);
    
    // Create cursor decorator
    this.cursorDecorator = document.createElement('div');
    this.cursorDecorator.className = 'cursor-decorator';
    this.cursorDecorator.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: 2px;
      height: ${position.height}px;
      background: #000;
      pointer-events: none;
      z-index: 100;
      animation: blink 1s infinite;
    `;
    
    // Add cursor decorator to render layer
    this.container.appendChild(this.cursorDecorator);
  }
  
  // Remove cursor decorator
  hideCursorDecorator(): void {
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
      this.cursorDecorator = null;
    }
  }
  
  // Update cursor position (when edit layer cursor position changes)
  updateCursorDecorator(modelOffset: number): void {
    const position = this.getCursorPosition(modelOffset);
    
    if (this.cursorDecorator) {
      this.cursorDecorator.style.left = `${position.x}px`;
      this.cursorDecorator.style.top = `${position.y}px`;
      this.cursorDecorator.style.height = `${position.height}px`;
    } else {
      this.showCursorDecorator(modelOffset);
    }
  }
}
```

**Advantages**:
- ✅ **User Experience**: Users see cursor as if it's in render layer
- ✅ **Complete Separation**: Edit layer is completely transparent, so no text is visible regardless of input
- ✅ **Cursor Control**: Can fully control cursor as decorator (animation, styles, etc.)
- ✅ **Render Layer Independence**: Render layer operates completely independently from edit layer

**Operation Flow**:
1. User types text in edit layer
2. Edit layer is completely transparent, so text is not visible
3. Convert edit layer cursor position to model offset
4. Display cursor decorator in render layer
5. User sees cursor as if it's in render layer
6. Input text converted to model and displayed in render layer

---

## 4. Advantages

### 4.1 Complete Separation

- ✅ **Render Layer**: Model-based rendering without ContentEditable (unidirectional data flow)
- ✅ **Edit Layer**: Only handles input with ContentEditable (perfect IME support)
- ✅ **Independent Management**: Each area operates independently, making problem solving easier

### 4.2 Maintaining User Experience

- ✅ **Maintain Existing Habits**: Type text in specific areas with keyboard
- ✅ **Cursor Display**: Display cursor as decorator in render layer (users see cursor as if it's in render layer)
- ✅ **Complete Transparency**: Edit layer is completely transparent, so no text is visible regardless of input
- ✅ **IME Support**: ContentEditable naturally handles IME

### 4.3 Selection/Cursor Management Simplification

- ✅ **Render Layer**: Display Selection/Cursor as decorator (read-only)
- ✅ **Edit Layer**: Utilize browser Selection API (ContentEditable, completely transparent)
- ✅ **Synchronization**: Convert edit layer cursor position to model offset and display as decorator in render layer
- ✅ **Cursor Control**: Can fully control cursor as decorator (animation, styles, etc.)

### 4.4 Eliminating Dual State Management

- ✅ **Render Layer**: Model → DOM (unidirectional)
- ✅ **Edit Layer**: Input → Model (unidirectional)
- ✅ **Synchronization**: Edit Layer → Model → Render Layer (clear flow)

---

## 5. Challenges

### 5.1 Synchronization Complexity

**Problem**: Must synchronize render layer and edit layer

**Solutions**:
- Always synchronize edit layer text with model
- Update edit layer when model changes
- Calculate cursor position accurately for synchronization

### 5.2 Position Calculation Unnecessary ✅

**Core**: Edit layer has **exactly the same structure** as render layer, so position calculation is not needed.

**Reasons**:
- Edit layer clones render layer structure
- Text remains identical within inline-text
- Just make it transparent
- Cursor position automatically aligns since structures are identical

**Implementation**:
- Clone render layer DOM structure as-is
- Apply all styles identically (only set transparent)
- Maintain identical structure always through real-time synchronization

### 5.3 Performance

**Problem**: Managing two layers may cause performance overhead

**Solutions**:
- **Continuous Rendering Possible**: Render layer can render continuously (separated from edit layer)
- **Real-time Synchronization Optimization**: Detect only changes with MutationObserver
- **Structure Cloning Optimization**: Efficiently clone render layer structure
- **Virtualization**: Render only visible parts (optional)

### 5.4 Complex Layouts

**Problem**: Position calculation may be difficult in complex layouts (tables, images, etc.)

**Solutions**:
- Separate each block element into its own edit layer
- Or limit edit layer to text areas only

---

## 6. Implementation Details

### 6.1 Edit Layer Initialization

```typescript
class EditLayer {
  initialize(): void {
    // 1. Copy render layer text to edit layer
    const text = this.model.getText();
    this.editElement.textContent = text;
    
    // 2. Synchronize styles
    this.syncStyles();
    
    // 3. Set cursor position
    this.setCursorOffset(0);
  }
  
  syncStyles(): void {
    // Copy render layer styles to edit layer
    const renderStyles = window.getComputedStyle(this.renderLayer.container);
    
    this.editElement.style.fontFamily = renderStyles.fontFamily;
    this.editElement.style.fontSize = renderStyles.fontSize;
    this.editElement.style.lineHeight = renderStyles.lineHeight;
    this.editElement.style.padding = renderStyles.padding;
    this.editElement.style.margin = renderStyles.margin;
    // ... other styles
  }
}
```

### 6.2 Real-time Synchronization Implementation

```typescript
class SyncManager {
  // Set up real-time synchronization
  setupRealtimeSync(): void {
    // 1. Edit layer → Model → Render layer (on input)
    this.editLayer.onInput(() => {
      // Update model
      this.updateModelFromEditLayer();
      
      // Update render layer immediately (can render continuously)
      this.renderLayer.render();
      
      // Re-synchronize edit layer (same as render layer)
      this.editLayer.syncContentFromRender();
    });
    
    // 2. Model change → Render layer → Edit layer (on external change)
    this.model.onChange(() => {
      // Update render layer immediately
      this.renderLayer.render();
      
      // Real-time synchronization of edit layer
      this.editLayer.syncContentFromRender();
    });
    
    // 3. Detect render layer changes (MutationObserver)
    const observer = new MutationObserver(() => {
      // Synchronize edit layer immediately when render layer changes
      this.editLayer.syncContentFromRender();
    });
    
    observer.observe(this.renderLayer.container, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  
  // Update from edit layer to model
  updateModelFromEditLayer(): void {
    const editText = this.editLayer.getText();
    const modelText = this.model.getText();
    
    if (editText !== modelText) {
      const changes = this.calculateChanges(modelText, editText);
      this.applyChangesToModel(changes);
    }
  }
}
```

**Core**: Real-time synchronization maintains identical structure between edit layer and render layer always.

### 6.3 Cursor and Selection Display

```typescript
class RenderLayer {
  private cursorDecorator: HTMLElement | null = null;
  private selectionHighlights: HTMLElement[] = [];
  
  // Display cursor decorator
  showCursorDecorator(modelOffset: number): void {
    // Remove existing cursor decorator
    this.hideCursorDecorator();
    
    // Convert model offset to DOM position
    const position = this.getCursorPosition(modelOffset);
    
    // Create cursor decorator
    this.cursorDecorator = document.createElement('div');
    this.cursorDecorator.className = 'cursor-decorator';
    this.cursorDecorator.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: 2px;
      height: ${position.height}px;
      background: #000;
      pointer-events: none;
      z-index: 100;
      animation: blink 1s infinite;
    `;
    
    // Add cursor decorator to render layer
    this.container.appendChild(this.cursorDecorator);
  }
  
  // Remove cursor decorator
  hideCursorDecorator(): void {
    if (this.cursorDecorator) {
      this.cursorDecorator.remove();
      this.cursorDecorator = null;
    }
  }
  
  // Update cursor position
  updateCursorDecorator(modelOffset: number): void {
    const position = this.getCursorPosition(modelOffset);
    
    if (this.cursorDecorator) {
      this.cursorDecorator.style.left = `${position.x}px`;
      this.cursorDecorator.style.top = `${position.y}px`;
      this.cursorDecorator.style.height = `${position.height}px`;
    } else {
      this.showCursorDecorator(modelOffset);
    }
  }
  
  // Display Selection in render layer
  renderSelection(selection: ModelSelection): void {
    // Remove existing Selection
    this.clearSelection();
    
    // Convert model Selection to DOM position
    const ranges = this.getTextRange(selection.anchor, selection.focus);
    
    // Display Selection highlight
    for (const range of ranges) {
      const highlight = document.createElement('div');
      highlight.className = 'selection-highlight';
      highlight.style.cssText = `
        position: absolute;
        left: ${range.left}px;
        top: ${range.top}px;
        width: ${range.width}px;
        height: ${range.height}px;
        background: rgba(0, 0, 255, 0.2);
        pointer-events: none;
        z-index: 50;
      `;
      this.container.appendChild(highlight);
      this.selectionHighlights.push(highlight);
    }
  }
  
  // Remove Selection
  clearSelection(): void {
    for (const highlight of this.selectionHighlights) {
      highlight.remove();
    }
    this.selectionHighlights = [];
  }
}
```

**Core**: Display cursor and Selection as decorators in render layer so users don't feel the edit layer's existence and see it as editing directly in render layer.

### 6.4 IME Handling

```typescript
class EditLayer {
  handleCompositionStart(event: CompositionEvent): void {
    // IME composition start
    // Naturally handled since edit layer is ContentEditable
    // Edit layer is completely transparent, so composing text is not visible
    // Don't change render layer
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    // IME composition in progress
    // Only handled in edit layer (completely transparent, not visible)
    // Cursor decorator continues to update
    const modelOffset = this.getCurrentModelOffset();
    this.renderLayer.updateCursorDecorator(modelOffset);
    
    // Don't change render layer
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    // IME composition complete
    // Synchronize edit layer changes to model
    const newText = this.editElement.textContent || '';
    const oldText = this.model.getText();
    
    // Calculate changes and update model
    this.syncToModel(newText, oldText);
    
    // Update render layer (display composed text)
    this.renderLayer.render();
    
    // Re-synchronize edit layer
    this.syncContentFromRender();
    
    // Update cursor decorator
    const modelOffset = this.getCurrentModelOffset();
    this.renderLayer.updateCursorDecorator(modelOffset);
  }
}
```

**Core**: Even during IME composition, edit layer is completely transparent so composing text is not visible. Text is displayed in render layer only after composition completes.

---

## 7. EditableSimulator: Concept Definition

### 7.1 What is EditableSimulator?

**EditableSimulator** is a tool that overlays a transparent ContentEditable layer on the render layer to simulate editing functionality.

**Core Features**:
- **Only handles editable aspects**: Only handles editing functionality (input, cursor, Selection)
- **Clone original structure**: Copies render layer structure as-is and combines into editable state
- **Leverage transparency**: Completely transparent, so only cursor position/Selection need to be accurate, underlying structure doesn't need much attention
- **External editing tool**: New tool concept that edits models externally, like design tools' sidebars and property panels

### 7.2 Similarity to Design Tools

**Design Tools (Figma, Sketch, etc.)**:
- Left: Tree structure (document structure)
- Right: Property panel (selected element properties)
- Center: Canvas (render layer)

**EditableSimulator**:
- Render Layer: Model-based rendering (similar to canvas)
- EditableSimulator: Transparent edit layer (similar to external editing tool)
- Model: Central data structure (similar to tree structure)

**Difference**: Design tools edit models directly in property panel, but EditableSimulator **edits models through keyboard input**.

### 7.3 Structure Cloning Strategy

```typescript
class EditableSimulator {
  private renderLayer: RenderLayer;
  private editLayer: HTMLElement;
  
  // Copy original structure as-is and combine into editable state
  createEditableLayer(): HTMLElement {
    // 1. Clone render layer structure
    const cloned = this.renderLayer.container.cloneNode(true) as HTMLElement;
    
    // 2. Apply ContentEditable
    cloned.contentEditable = 'true';
    
    // 3. Set transparent
    cloned.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      color: transparent;
      background: transparent;
      caret-color: transparent;
      pointer-events: auto;
      z-index: 10;
    `;
    
    return cloned;
  }
  
  // Only cursor position/Selection need to be accurate, underlying structure doesn't matter much
  syncCursorAndSelection(): void {
    // Convert edit layer cursor position to model offset
    const modelOffset = this.getModelOffsetFromEditLayer();
    
    // Display cursor decorator in render layer
    this.renderLayer.showCursorDecorator(modelOffset);
    
    // Handle Selection the same way
    const selection = this.getSelectionFromEditLayer();
    if (selection) {
      this.renderLayer.renderSelection(selection);
    }
  }
}
```

**Core**: EditableSimulator **clones original structure** to make it editable, but actually **only cursor position and Selection need to be accurate**, underlying structure doesn't need to be completely identical. Since it's transparent, users don't notice differences in underlying structure.

### 7.4 Comparison with Existing Attempts

**Research Results So Far**:
- No direct identical attempts found
- Similar concepts include:
  - **WebView**: Technology to integrate web content into applications (different from rendering-edit separation)
  - **WYSIWYG Editors**: Directly use ContentEditable (rendering and editing not separated)
  - **Design Tool Property Panels**: Edit models externally (property editing, not keyboard input)

**EditableSimulator's Differentiators**:
- ✅ **Complete separation** of render layer and edit layer
- ✅ **Maintain user experience** with transparent edit layer
- ✅ **Natural editing** through keyboard input
- ✅ **Underlying structure doesn't need much attention** if only cursor position/Selection are accurate

---

## 8. EditableSimulator Synchronization Strategy

### 8.1 Core Synchronization Challenges

EditableSimulator synchronization must solve the following three core challenges:

1. **Structure Synchronization**: Clone render layer DOM structure to EditableSimulator
2. **Cursor/Selection Synchronization**: Display EditableSimulator cursor position as decorator in render layer
3. **Content Synchronization**: Convert EditableSimulator input to model, reflect model changes to render layer

### 8.2 Structure Cloning Strategy

#### 8.2.1 Full Clone vs Minimal Clone

**Full Clone**:
```typescript
class EditableSimulator {
  // Clone entire render layer structure as-is
  cloneRenderStructure(): HTMLElement {
    return this.renderLayer.container.cloneNode(true) as HTMLElement;
  }
}
```

**Advantages**:
- ✅ Cursor position calculation accurate since structure is completely identical
- ✅ Stable even in complex layouts

**Disadvantages**:
- ❌ Performance overhead (for large documents)
- ❌ Clones unnecessary elements too

**Minimal Clone**:
```typescript
class EditableSimulator {
  // Clone only text nodes and basic structure
  cloneRenderStructure(): HTMLElement {
    const cloned = document.createElement('div');
    
    // Extract and clone only text nodes
    const textNodes = this.extractTextNodes(this.renderLayer.container);
    for (const textNode of textNodes) {
      const span = document.createElement('span');
      span.textContent = textNode.textContent;
      cloned.appendChild(span);
    }
    
    return cloned;
  }
}
```

**Advantages**:
- ✅ Performance optimization
- ✅ Clone only necessary parts

**Disadvantages**:
- ❌ Structure may differ, making cursor position calculation complex
- ❌ May cause problems in complex layouts

**Recommended Strategy**: **Hybrid Approach**
- Use **full clone** by default to ensure accuracy
- For performance-critical cases, **minimal clone only text areas** and calculate cursor position by **referencing render layer's actual DOM position**

#### 8.2.2 Leveraging Transparency: Underlying Structure Need Not Be Completely Identical

**Core Insight**: Since EditableSimulator is completely transparent, **only cursor position and Selection need to be accurate**, underlying structure doesn't need to be completely identical.

```typescript
class EditableSimulator {
  // Only cursor position needs to be accurate, underlying structure doesn't matter much
  syncCursorAndSelection(): void {
    // 1. Convert EditableSimulator cursor position to model offset
    const modelOffset = this.getModelOffsetFromEditLayer();
    
    // 2. Convert model offset to render layer's actual DOM position
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    
    // 3. Display cursor decorator in render layer (using actual DOM position)
    this.renderLayer.showCursorDecorator(renderPosition);
    
    // Even if EditableSimulator's underlying structure differs from render layer
    // Cursor decorator is displayed at render layer's actual position, so no problem
  }
}
```

**Reasons**:
- EditableSimulator is transparent, so users don't see underlying structure
- Cursor decorator is displayed at render layer's actual DOM position
- Selection also uses render layer's actual DOM position

**Conclusion**: EditableSimulator's structure is used **only as a reference for cursor position calculation**, and actual display uses **render layer's DOM position**.

### 8.3 Cursor/Selection Synchronization Strategy

#### 8.3.1 Cursor Position Synchronization

**Method 1: Model Offset-based (Recommended)**
```typescript
class EditableSimulator {
  syncCursor(): void {
    // 1. Convert EditableSimulator cursor position to model offset
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const modelOffset = this.convertToModelOffset(range);
    
    // 2. Convert model offset to render layer DOM position
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    
    // 3. Display cursor decorator in render layer
    this.renderLayer.showCursorDecorator(renderPosition);
  }
  
  // Convert EditableSimulator DOM position to model offset
  convertToModelOffset(range: Range): number {
    // Traverse EditableSimulator text nodes and calculate offset
    // Assume structure is identical to render layer
    let offset = 0;
    const walker = document.createTreeWalker(
      this.editElement,
      NodeFilter.SHOW_TEXT
    );
    
    let node;
    while ((node = walker.nextNode())) {
      if (range.startContainer === node) {
        offset += range.startOffset;
        break;
      }
      offset += node.textContent?.length || 0;
    }
    
    return offset;
  }
}
```

**Method 2: Direct DOM Position Reference**
```typescript
class EditableSimulator {
  syncCursor(): void {
    // 1. Map EditableSimulator cursor position to corresponding position in render layer
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // 2. Map EditableSimulator text node to corresponding text node in render layer
    const renderTextNode = this.mapToRenderTextNode(range.startContainer);
    const renderOffset = range.startOffset;
    
    // 3. Calculate render layer's actual DOM position
    const renderPosition = this.calculateRenderPosition(renderTextNode, renderOffset);
    
    // 4. Display cursor decorator
    this.renderLayer.showCursorDecorator(renderPosition);
  }
  
  // Map EditableSimulator text node to render layer text node
  mapToRenderTextNode(editTextNode: Node): Text {
    // Assume EditableSimulator and render layer have identical structure
    // Find text node at same position
    const editPath = this.getNodePath(editTextNode, this.editElement);
    return this.findNodeByPath(editPath, this.renderLayer.container) as Text;
  }
}
```

**Recommended Strategy**: **Method 1 (Model Offset-based)** is more stable. Using model offset as an intermediate step allows accurate position calculation even if EditableSimulator and render layer structures differ.

#### 8.3.2 Selection Synchronization

```typescript
class EditableSimulator {
  syncSelection(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // 1. Convert EditableSimulator Selection to model Selection
    const anchorOffset = this.convertToModelOffset({
      container: range.startContainer,
      offset: range.startOffset
    });
    const focusOffset = this.convertToModelOffset({
      container: range.endContainer,
      offset: range.endOffset
    });
    
    // 2. Convert model Selection to render layer DOM position
    const renderRanges = this.renderLayer.getTextRange(anchorOffset, focusOffset);
    
    // 3. Display Selection highlight in render layer
    this.renderLayer.renderSelection(renderRanges);
  }
}
```

### 8.4 Content Synchronization Strategy

#### 8.4.1 Synchronization on Input (EditableSimulator → Model → Render Layer)

```typescript
class EditableSimulator {
  handleInput(event: InputEvent): void {
    // 1. Convert EditableSimulator changes to model
    const changes = this.calculateChanges(event);
    
    // 2. Update model
    this.model.applyChanges(changes);
    
    // 3. Update render layer
    this.renderLayer.render();
    
    // 4. Re-synchronize EditableSimulator (same as render layer)
    // ⚠️ Important: Save cursor position first
    const savedCursorOffset = this.getCurrentModelOffset();
    
    // 5. Re-synchronize EditableSimulator content
    this.syncContentFromRender();
    
    // 6. Restore cursor position
    this.restoreCursorPosition(savedCursorOffset);
  }
  
  // Synchronize render layer content to EditableSimulator
  syncContentFromRender(): void {
    // Method 1: Complete regeneration (simple but performance overhead)
    this.editElement.innerHTML = '';
    const cloned = this.renderLayer.container.cloneNode(true) as HTMLElement;
    this.editElement.appendChild(cloned);
    
    // Method 2: Update only differences (complex but performance optimized)
    // this.updateDiff(this.editElement, this.renderLayer.container);
  }
}
```

**Timing Considerations**:
- Immediate synchronization after input event may break IME composition
- Safe to synchronize after `compositionend`
- Normal input can be synchronized immediately

#### 8.4.2 Synchronization on External Model Change (Model → Render Layer → EditableSimulator)

```typescript
class EditableSimulator {
  handleModelChange(): void {
    // 1. Update render layer
    this.renderLayer.render();
    
    // 2. Save cursor position
    const savedCursorOffset = this.getCurrentModelOffset();
    
    // 3. Re-synchronize EditableSimulator content
    this.syncContentFromRender();
    
    // 4. Restore cursor position
    this.restoreCursorPosition(savedCursorOffset);
  }
  
  // Restore cursor position
  restoreCursorPosition(modelOffset: number): void {
    // Convert model offset to EditableSimulator DOM position
    const editPosition = this.convertToEditPosition(modelOffset);
    
    // Set Selection
    const range = document.createRange();
    range.setStart(editPosition.textNode, editPosition.offset);
    range.setEnd(editPosition.textNode, editPosition.offset);
    
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    
    // Also update cursor decorator in render layer
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    this.renderLayer.showCursorDecorator(renderPosition);
  }
}
```

### 8.5 Synchronization During IME Composition

**Core Principle**: Do not change EditableSimulator content during IME composition.

```typescript
class EditableSimulator {
  private isComposing: boolean = false;
  
  handleCompositionStart(): void {
    this.isComposing = true;
    // Stop synchronization during IME composition
  }
  
  handleCompositionUpdate(): void {
    // Only update cursor position (don't change content)
    const modelOffset = this.getCurrentModelOffset();
    const renderPosition = this.renderLayer.getCursorPosition(modelOffset);
    this.renderLayer.updateCursorDecorator(renderPosition);
  }
  
  handleCompositionEnd(): void {
    this.isComposing = false;
    
    // Synchronize only after composition completes
    this.handleInput({
      type: 'compositionend',
      data: this.getComposedText()
    } as InputEvent);
  }
  
  handleInput(event: InputEvent): void {
    // Skip synchronization if IME composition in progress
    if (this.isComposing) {
      return;
    }
    
    // Proceed with normal synchronization
    // ...
  }
}
```

### 8.6 Performance Optimization Strategies

#### 8.6.1 Debounced Synchronization

```typescript
class EditableSimulator {
  private syncTimer: number | null = null;
  
  scheduleSync(): void {
    // Delay synchronization to optimize performance during rapid consecutive input
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    
    this.syncTimer = window.setTimeout(() => {
      this.performSync();
      this.syncTimer = null;
    }, 16); // ~60fps
  }
}
```

**Note**: Cursor position must be updated immediately, so cursor synchronization is not delayed.

#### 8.6.2 Partial Synchronization

```typescript
class EditableSimulator {
  // Synchronize only changed parts
  syncPartial(changes: Change[]): void {
    for (const change of changes) {
      // Update only changed text nodes
      const editNode = this.findNodeByModelOffset(change.offset);
      const renderNode = this.renderLayer.findNodeByModelOffset(change.offset);
      
      // Update only corresponding node in EditableSimulator
      editNode.textContent = renderNode.textContent;
    }
  }
}
```

#### 8.6.3 Virtualization

```typescript
class EditableSimulator {
  // Clone only visible parts to EditableSimulator
  syncVisibleOnly(): void {
    const viewport = this.getViewport();
    const visibleNodes = this.getVisibleNodes(viewport);
    
    // Clone only visible nodes to EditableSimulator
    for (const node of visibleNodes) {
      this.cloneNodeToEditLayer(node);
    }
  }
}
```

#### 8.6.4 Magnifying Glass Approach

**Reference**: For detailed information on the magnifying glass approach, see [8.8 Magnifying Glass Approach: Partial EditableSimulator](#88-magnifying-glass-approach-partial-editablesimulator) section.

**Core**: Activate only a portion around the cursor as EditableSimulator to optimize performance.

### 8.7 Synchronization Strategy Comparison

| Strategy | Accuracy | Performance | Complexity | Recommended Use |
|------|--------|------|--------|----------|
| Full Clone | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | Default strategy |
| Minimal Clone | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | When performance critical |
| Model Offset-based | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | Recommended |
| Direct DOM Reference | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | When structure identical guaranteed |
| Debounced Sync | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | During rapid input |
| Partial Sync | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Large documents |
| **Magnifying Glass (Hybrid)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | **Large documents, recommended** |

**Recommended Combinations**:
- **MVP (Initial Implementation)**: **Full Clone + Model Offset-based + Immediate Sync** ⭐ **Recommended starting point**
- Performance Optimization: **Minimal Clone + Model Offset-based + Debounced Sync**
- Large Documents (after performance issues confirmed): **Magnifying Glass (Hybrid) + Model Offset-based**

**⚠️ Important**: 
- Since there are no reference implementations for the magnifying glass approach, it's recommended to **start with full EditableSimulator initially** and consider optimization when actual performance issues occur.
- **More Important Consideration**: Check if real-time decorator application during input is really necessary. If not, **EditableSimulator itself may not be needed** (see section 8.9).

### 8.8 Magnifying Glass Approach: Partial EditableSimulator

#### 8.8.1 Concept

**Core Idea**: Render only **a portion around the cursor** instead of the entire document as EditableSimulator. Like a magnifying glass, it enlarges only the area around the cursor position to make it editable.

**Advantages**:
- ✅ Performance Optimization: Don't clone entire document, reducing memory and CPU usage
- ✅ Fast Response: Manage only small area, improving synchronization speed
- ✅ Large Document Support: Maintain consistent performance regardless of document size

**Problems**:
- ❌ Issues with drag or area selection: Difficult to handle when Selection goes outside EditableSimulator area
- ❌ Long text input: Need to regenerate when cursor goes outside EditableSimulator area

#### 8.8.2 Hybrid Approach: Cursor vs Selection

**Solution**: Activate EditableSimulator **only when cursor exists**, and **when Selection exists**, deactivate EditableSimulator and use render layer directly.

```typescript
class EditableSimulator {
  private isActive: boolean = false;
  private viewport: HTMLElement | null = null; // Magnifying glass area
  
  // Activate/deactivate EditableSimulator based on Selection state
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // Deactivate EditableSimulator if no Selection
      this.deactivate();
      return;
    }
    
    const range = selection.getRangeAt(0);
    
    // If Selection exists (during drag)
    if (!range.collapsed) {
      // Deactivate EditableSimulator and use render layer directly
      this.deactivate();
      this.renderLayer.renderSelection(range);
      return;
    }
    
    // If only cursor exists (collapsed Selection)
    // Activate EditableSimulator (magnifying glass approach)
    this.activateAtCursor(range);
  }
  
  // Activate EditableSimulator at cursor position
  activateAtCursor(range: Range): void {
    // 1. Extract text nodes around cursor position
    const contextNodes = this.getContextNodes(range, {
      before: 100,  // 100 characters before cursor
      after: 100    // 100 characters after cursor
    });
    
    // 2. Create magnifying glass area
    this.viewport = this.createViewport(contextNodes);
    
    // 3. Activate EditableSimulator
    this.isActive = true;
    this.setupEditableSimulator(this.viewport);
  }
  
  // Deactivate EditableSimulator
  deactivate(): void {
    if (this.viewport) {
      this.viewport.remove();
      this.viewport = null;
    }
    this.isActive = false;
  }
  
  // Extract text nodes around cursor
  getContextNodes(range: Range, context: { before: number; after: number }): Node[] {
    const nodes: Node[] = [];
    const modelOffset = this.convertToModelOffset(range);
    
    // Text nodes before cursor
    const beforeNodes = this.renderLayer.getTextNodes(
      modelOffset - context.before,
      modelOffset
    );
    
    // Text nodes after cursor
    const afterNodes = this.renderLayer.getTextNodes(
      modelOffset,
      modelOffset + context.after
    );
    
    return [...beforeNodes, ...afterNodes];
  }
  
  // Create magnifying glass area
  createViewport(nodes: Node[]): HTMLElement {
    const viewport = document.createElement('div');
    viewport.className = 'editable-simulator-viewport';
    viewport.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      pointer-events: auto;
      z-index: 10;
    `;
    
    // Clone nodes and add to viewport
    for (const node of nodes) {
      const cloned = node.cloneNode(true);
      viewport.appendChild(cloned);
    }
    
    viewport.contentEditable = 'true';
    this.renderLayer.container.appendChild(viewport);
    
    return viewport;
  }
}
```

#### 8.8.3 Operation Flow

**Scenario 1: When only cursor exists**
```
1. User clicks text area
2. Selection is collapsed (only cursor)
3. EditableSimulator activated (around cursor only)
4. User input handled by EditableSimulator
5. After input complete, model update → render layer update
6. EditableSimulator re-synchronized (around cursor only)
```

**Scenario 2: Creating Selection by dragging**
```
1. User starts dragging text
2. Selection created (collapsed = false)
3. EditableSimulator immediately deactivated
4. Selection displayed directly in render layer (highlight)
5. After drag complete, Selection maintained (in render layer)
```

**Scenario 3: Input after drag**
```
1. Selection exists
2. User presses key (e.g., typing)
3. Selection deleted and replaced with input text
4. Selection changed to collapsed
5. EditableSimulator activated (around new cursor position)
```

#### 8.8.4 Regenerating EditableSimulator on Cursor Move

```typescript
class EditableSimulator {
  private lastCursorOffset: number = -1;
  
  handleCursorMove(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    if (!range.collapsed) return; // Ignore if Selection exists
    
    const currentOffset = this.convertToModelOffset(range);
    
    // Check if cursor went outside EditableSimulator area
    if (this.isOutOfViewport(currentOffset)) {
      // Regenerate EditableSimulator (around new cursor position)
      this.deactivate();
      this.activateAtCursor(range);
    }
    
    // Only update cursor position (within EditableSimulator)
    this.updateCursorInViewport(range);
    
    this.lastCursorOffset = currentOffset;
  }
  
  // Check if cursor is outside EditableSimulator area
  isOutOfViewport(offset: number): boolean {
    if (!this.viewport) return true;
    
    const viewportStart = this.getViewportStartOffset();
    const viewportEnd = this.getViewportEndOffset();
    
    return offset < viewportStart || offset > viewportEnd;
  }
}
```

#### 8.8.5 Advantages and Disadvantages Comparison

| Approach | Advantages | Disadvantages | When to Use |
|------|------|------|----------|
| Full EditableSimulator | ✅ Simple structure<br>✅ Easy Selection handling | ❌ Performance overhead<br>❌ Slow on large documents | Small documents, simple structure |
| Magnifying Glass (cursor only) | ✅ Performance optimized<br>✅ Large document support<br>✅ Fast response | ❌ Complex Selection handling<br>❌ Regeneration needed on cursor move | Large documents, performance critical |
| Hybrid (cursor/Selection separation) | ✅ Performance optimized<br>✅ Clear Selection handling<br>✅ Good user experience | ❌ Increased implementation complexity<br>❌ State management needed | **Recommended** |

#### 8.8.6 Implementation Considerations

**1. Cursor Position Tracking**
- Convert cursor position within EditableSimulator to model offset
- Convert model offset to render layer's actual DOM position to display cursor decorator

**2. Selection Handling**
- Immediately deactivate EditableSimulator when Selection starts
- Display Selection highlight directly in render layer
- Keep EditableSimulator deactivated even after Selection completes

**3. Input Handling**
- When input occurs with Selection, delete Selection and replace with input text
- Only cursor remains, so activate EditableSimulator

**4. Performance Optimization**
- Adjustable EditableSimulator area size (number of characters before/after cursor)
- Set regeneration threshold on cursor move (regenerate only when moved beyond certain distance)

#### 8.8.7 UX Considerations and Alternatives

**Problem**: EditableSimulator appearing and disappearing only in cursor mode may feel unnatural in user experience.

**Considerations**:
- EditableSimulator is completely transparent so not visually visible, but
- Removing EditableSimulator when Selection starts and recreating when only cursor remains may feel unnatural
- Performance issues or flickering may occur especially when quickly switching between cursor and Selection

**Alternative 1: Always Maintain EditableSimulator, Only Disable**

```typescript
class EditableSimulator {
  // Don't remove EditableSimulator, only disable
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    if (!range.collapsed) {
      // When Selection exists: Disable EditableSimulator (don't remove)
      this.disable();
      // Display Selection in render layer
      this.renderLayer.renderSelection(range);
    } else {
      // When only cursor exists: Activate EditableSimulator
      this.enable();
    }
  }
  
  disable(): void {
    // Set pointer-events to none to block input
    if (this.viewport) {
      this.viewport.style.pointerEvents = 'none';
    }
    this.isActive = false;
  }
  
  enable(): void {
    // Set pointer-events to auto to allow input
    if (this.viewport) {
      this.viewport.style.pointerEvents = 'auto';
    }
    this.isActive = true;
  }
}
```

**Advantages**:
- ✅ No performance overhead from removing/creating EditableSimulator
- ✅ Smooth transition
- ✅ Stable structure

**Disadvantages**:
- ❌ Still problematic if Selection goes outside EditableSimulator area
- ❌ Memory usage still exists

**Alternative 2: Include Selection Area in EditableSimulator**

```typescript
class EditableSimulator {
  // Expand EditableSimulator to include Selection area when Selection starts
  handleSelectionStart(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Expand EditableSimulator area to include Selection range
    const expandedRange = this.expandRangeToIncludeSelection(range);
    this.updateViewport(expandedRange);
  }
  
  expandRangeToIncludeSelection(range: Range): Range {
    const startOffset = this.convertToModelOffset({
      container: range.startContainer,
      offset: range.startOffset
    });
    const endOffset = this.convertToModelOffset({
      container: range.endContainer,
      offset: range.endOffset
    });
    
    // Add buffer space before and after Selection
    return {
      start: Math.max(0, startOffset - 100),
      end: endOffset + 100
    };
  }
}
```

**Advantages**:
- ✅ Selection can also be handled within EditableSimulator
- ✅ Don't need to remove EditableSimulator
- ✅ Natural transition

**Disadvantages**:
- ❌ EditableSimulator area becomes large if Selection is very long
- ❌ Possible performance overhead increase

**Alternative 3: Maintain Full EditableSimulator (when performance is not critical)**

```typescript
class EditableSimulator {
  // Maintain entire document as EditableSimulator
  // Handle both Selection and cursor in EditableSimulator
  setup(): void {
    // Clone entire render layer to create EditableSimulator
    this.editElement = this.renderLayer.container.cloneNode(true) as HTMLElement;
    this.editElement.contentEditable = 'true';
    // Set transparent
    this.makeTransparent();
  }
  
  // Handle Selection directly in EditableSimulator
  handleSelectionChange(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    // Reflect EditableSimulator's Selection to render layer
    const range = selection.getRangeAt(0);
    const modelSelection = this.convertToModelSelection(range);
    this.renderLayer.renderSelection(modelSelection);
  }
}
```

**Advantages**:
- ✅ Simplest structure
- ✅ Both Selection and cursor handled naturally
- ✅ No transition issues

**Disadvantages**:
- ❌ Performance issues on large documents
- ❌ Increased memory usage

#### 8.8.8 Recommended Strategy

**Research Results So Far**: No cases found implementing magnifying glass approach (partial EditableSimulator).

**Considerations**:
1. **User Experience**: Is EditableSimulator appearing and disappearing natural?
2. **Performance**: Can consistent performance be maintained even on large documents?
3. **Implementation Complexity**: Is implementation and maintenance difficult?

**Recommended Phased Approach**:

**Phase 1: Full EditableSimulator (MVP)**
- Simplest implementation
- Check if performance issues actually occur
- User experience testing

**Phase 2: Performance Optimization (if needed)**
- Introduce magnifying glass approach if performance issues confirmed
- Or apply Alternative 1 (only disable)

**Phase 3: Hybrid (Optimization)**
- Analyze actual usage patterns to select optimal strategy
- Adjust strategy based on frequency of cursor mode vs Selection mode usage

**Conclusion**: 
- **Recommend starting with full EditableSimulator initially**.
- Consider magnifying glass approach or other optimization strategies when actual performance issues occur.
- Since there are no reference implementations, it's important to validate through actual prototypes.

### 8.9 Is EditableSimulator Really Necessary?

#### 8.9.1 Core Question: Is Real-time Decorator Application During Input Necessary?

**User Suggestion**:
- Think of text moving backward each time a character is entered (cannot input forward)
- At input time, **keep only exposed decorators as-is**
- **Hide newly added decorators**
- Show them later when switching to view mode

**Core Goal**: The question of whether decorators can be applied in real-time during text input

#### 8.9.2 Re-examining Why EditableSimulator is Needed

**EditableSimulator's Main Purposes**:
1. ✅ **Input handling through ContentEditable** (IME support)
2. ✅ **Cursor position management**
3. ✅ **Selection management**
4. ❓ **Real-time decorator application during input** ← **Is this really necessary?**

**If decorators are not applied in real-time during input**:
- Could we use ContentEditable directly in render layer?
- The need for EditableSimulator may disappear

#### 8.9.3 Deferred Decorator Application Strategy

```typescript
class RenderLayer {
  private isEditing: boolean = false;
  private pendingDecorators: Decorator[] = [];
  
  // Start editing
  startEditing(): void {
    this.isEditing = true;
    this.pendingDecorators = [];
    
    // Switch render layer to ContentEditable
    this.container.contentEditable = 'true';
  }
  
  // During input: Keep only existing decorators, hide new decorators
  handleInput(event: InputEvent): void {
    // 1. Update model
    this.updateModel(event);
    
    // 2. Keep existing decorators as-is (already rendered)
    // 3. Store newly added decorators in pending (hidden)
    const newDecorators = this.calculateNewDecorators();
    this.pendingDecorators.push(...newDecorators);
    
    // 4. Update render layer (keep only existing decorators)
    this.render({
      skipNewDecorators: true,  // Don't render new decorators
      preserveExistingDecorators: true  // Preserve existing decorators
    });
  }
  
  // End editing (switch to view mode)
  endEditing(): void {
    this.isEditing = false;
    
    // Disable ContentEditable
    this.container.contentEditable = 'false';
    
    // Apply all pending decorators
    this.applyPendingDecorators();
    
    // Full re-render (include all decorators)
    this.render({
      includeAllDecorators: true
    });
  }
  
  // Apply pending decorators
  applyPendingDecorators(): void {
    for (const decorator of this.pendingDecorators) {
      this.addDecorator(decorator);
    }
    this.pendingDecorators = [];
  }
}
```

**Advantages**:
- ✅ EditableSimulator unnecessary
- ✅ Structure simplified
- ✅ Performance optimized (skip decorator calculation/rendering during input)
- ✅ Apply decorators all at once after input completes

**Disadvantages**:
- ❌ New decorators not visible during input
- ❌ Lack of real-time feedback

#### 8.9.4 Hybrid Approach: Selective Real-time Application

```typescript
class RenderLayer {
  private decoratorApplicationMode: 'realtime' | 'deferred' = 'deferred';
  
  // Apply fast decorators in real-time, defer slow decorators
  handleInput(event: InputEvent): void {
    this.updateModel(event);
    
    // Fast decorators (e.g., syntax highlighting) applied in real-time
    const fastDecorators = this.calculateFastDecorators();
    this.applyDecorators(fastDecorators);
    
    // Slow decorators (e.g., AI analysis, external API calls) deferred
    const slowDecorators = this.calculateSlowDecorators();
    this.pendingDecorators.push(...slowDecorators);
    
    this.render({
      includeFastDecorators: true,
      skipSlowDecorators: true
    });
  }
}
```

#### 8.9.5 EditableSimulator vs Direct ContentEditable Comparison

| Approach | EditableSimulator | Direct ContentEditable |
|------|-------------------|---------------------|
| **Structure Complexity** | ⭐⭐⭐⭐ (Complex) | ⭐⭐ (Simple) |
| **Performance** | ⭐⭐⭐ (Synchronization overhead) | ⭐⭐⭐⭐⭐ (No overhead) |
| **Decorator during input** | ✅ Real-time application possible | ⚠️ Deferred application possible |
| **IME Support** | ✅ Perfect | ✅ Perfect |
| **Selection Management** | ⭐⭐⭐ (Complex) | ⭐⭐⭐⭐ (Simple) |
| **Cursor Management** | ⭐⭐⭐ (Complex) | ⭐⭐⭐⭐⭐ (Browser default) |

#### 8.9.6 Recommended Strategy

**Core Question**: Is real-time decorator application during input really necessary?

**Recommendations by Scenario**:

1. **Real-time decorator application during input unnecessary**
   - ✅ **Use Direct ContentEditable** (EditableSimulator unnecessary)
   - ✅ Simple structure, performance optimized
   - ✅ Apply decorators after input completes

2. **Only some decorators need real-time application**
   - ✅ **Hybrid Approach**: Fast decorators real-time, slow decorators deferred
   - ✅ Use Direct ContentEditable
   - ✅ EditableSimulator unnecessary

3. **All decorators need real-time application**
   - ⚠️ **Consider EditableSimulator**
   - ⚠️ Accept performance overhead
   - ⚠️ Increased structure complexity

**Conclusion**:
- **If decorators are not applied in real-time during input, EditableSimulator is not needed.**
- Using ContentEditable directly in render layer and applying decorators after input completes may be simpler and more efficient.
- Choose based on actual requirements, but **basically recommend Direct ContentEditable**.

#### 8.9.7 Practical Examples Where Real-time Decorators are Needed

**Cases where real-time decorator application is useful**:

**1. Inline UI Components (e.g., Color Picker)**
```typescript
// User typing "#ff0000"
// → Color picker UI should appear immediately
const colorDecorator = {
  type: 'color-picker',
  pattern: /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g,
  // Must be displayed in real-time even during input
  showRealtime: true
};
```

**User Experience**:
- ✅ User can preview immediately when typing color code
- ✅ No need to wait for input completion
- ✅ Instant feedback

**2. Collaboration Editing Indicator (e.g., Another User Editing)**
```typescript
// Another user editing specific area
// → Must be displayed in real-time
const collaborationDecorator = {
  type: 'user-editing',
  userId: 'user-123',
  // Must be displayed in real-time even during input
  showRealtime: true
};
```

**User Experience**:
- ✅ Can immediately see another user's editing status
- ✅ Conflict prevention
- ✅ Real-time collaboration feedback

**3. AI Editing Indicator**
```typescript
// AI editing specific area
// → Must be displayed in real-time
const aiEditingDecorator = {
  type: 'ai-editing',
  status: 'processing',
  // Must be displayed in real-time even during input
  showRealtime: true
};
```

**4. Syntax Highlighting (Fast Feedback)**
```typescript
// Syntax highlighting during code input
// → Must be displayed in real-time
const syntaxDecorator = {
  type: 'syntax-highlight',
  language: 'javascript',
  // Must be displayed in real-time even during input
  showRealtime: true
};
```

#### 8.9.8 Real-time vs Deferred Decorator Classification

**Real-time Decorators (Need to display during input)**:
- ✅ **Inline UI Components** (color picker, date picker, etc.)
- ✅ **Collaboration Indicators** (another user editing)
- ✅ **AI Editing Indicators** (AI processing)
- ✅ **Syntax Highlighting** (fast feedback)
- ✅ **Error Indicators** (real-time validation)
- ✅ **Autocomplete Hints** (display during input)

**Deferred Decorators (Can display after input completes)**:
- ⏸️ **Link Previews** (sufficient after input completes)
- ⏸️ **Image Thumbnails** (sufficient after input completes)
- ⏸️ **Complex Analysis Results** (AI analysis, external API calls)
- ⏸️ **Statistics Information** (sufficient after input completes)

#### 8.9.9 Hybrid Strategy: Real-time + Deferred

```typescript
class RenderLayer {
  private realtimeDecorators: Decorator[] = [];
  private deferredDecorators: Decorator[] = [];
  
  // Handle during input
  handleInput(event: InputEvent): void {
    this.updateModel(event);
    
    // 1. Calculate and apply real-time decorators
    const realtime = this.calculateRealtimeDecorators();
    this.applyRealtimeDecorators(realtime);
    
    // 2. Store deferred decorators in pending
    const deferred = this.calculateDeferredDecorators();
    this.deferredDecorators.push(...deferred);
    
    // 3. Render (include only real-time decorators)
    this.render({
      includeRealtimeDecorators: true,
      skipDeferredDecorators: true
    });
  }
  
  // Handle after input completes
  endEditing(): void {
    // Apply all deferred decorators
    this.applyDeferredDecorators();
    
    // Full re-render
    this.render({
      includeAllDecorators: true
    });
  }
  
  // Classify real-time decorators
  calculateRealtimeDecorators(): Decorator[] {
    return this.decorators.filter(d => 
      d.showRealtime === true ||
      d.type === 'color-picker' ||
      d.type === 'user-editing' ||
      d.type === 'ai-editing' ||
      d.type === 'syntax-highlight' ||
      d.type === 'error'
    );
  }
  
  // Classify deferred decorators
  calculateDeferredDecorators(): Decorator[] {
    return this.decorators.filter(d => 
      d.showRealtime !== true &&
      d.type !== 'color-picker' &&
      d.type !== 'user-editing' &&
      d.type !== 'ai-editing' &&
      d.type !== 'syntax-highlight' &&
      d.type !== 'error'
    );
  }
}
```

#### 8.9.10 Re-evaluating EditableSimulator Necessity

**Cases where real-time decorators are needed**:

| Scenario | Real-time Needed | EditableSimulator Needed? |
|---------|------------|------------------------|
| Inline UI (color picker, etc.) | ✅ Needed | ⚠️ Consider |
| Collaboration Indicator | ✅ Needed | ⚠️ Consider |
| AI Editing Indicator | ✅ Needed | ⚠️ Consider |
| Syntax Highlighting | ✅ Needed | ⚠️ Consider |
| Error Indicator | ✅ Needed | ⚠️ Consider |
| Link Preview | ❌ Unnecessary | ❌ Unnecessary |
| Image Thumbnail | ❌ Unnecessary | ❌ Unnecessary |

**Conclusion**:
- **If many real-time decorators**: Consider EditableSimulator (but also possible with Direct ContentEditable)
- **If few real-time decorators**: Recommend Direct ContentEditable
- **Hybrid approach**: Apply only real-time decorators selectively, defer the rest

#### 8.9.11 Real-time Decorator Application in Direct ContentEditable

**Real-time decorator application possible even without EditableSimulator**:

```typescript
class RenderLayer {
  // Render layer is directly ContentEditable
  setup(): void {
    this.container.contentEditable = 'true';
  }
  
  // Apply real-time decorators during input
  handleInput(event: InputEvent): void {
    // 1. Update model
    this.updateModel(event);
    
    // 2. Calculate only real-time decorators
    const realtimeDecorators = this.calculateRealtimeDecorators();
    
    // 3. Re-render applying only real-time decorators
    // ⚠️ Important: Preserve existing text and only add/update decorators
    this.render({
      decorators: realtimeDecorators,
      preserveText: true,  // Preserve existing text
      updateDecoratorsOnly: true  // Only update decorators
    });
  }
  
  // Apply all decorators after input completes
  handleInputEnd(): void {
    // Apply all decorators
    this.render({
      decorators: this.allDecorators,
      includeDeferred: true
    });
  }
}
```

**Advantages**:
- ✅ EditableSimulator unnecessary
- ✅ Simple structure
- ✅ Real-time decorators also supported
- ✅ Performance optimized (apply only real-time decorators)

**Cautions**:
- ⚠️ Need to manage Selection/Cursor when updating DOM during input
- ⚠️ Be careful applying decorators during IME composition

#### 8.9.12 Final Recommended Strategy

**Recommendations by Scenario**:

1. **Many and complex real-time decorators**
   - ⚠️ Consider EditableSimulator (but Direct ContentEditable also possible)
   - ⚠️ Performance testing needed

2. **Few or simple real-time decorators** ⭐ **Recommended**
   - ✅ **Use Direct ContentEditable**
   - ✅ Apply only real-time decorators selectively
   - ✅ Simple structure, excellent performance

3. **No real-time decorators at all**
   - ✅ **Use Direct ContentEditable**
   - ✅ Apply decorators after input completes
   - ✅ Simplest structure

**Core Principles**:
- **Having many real-time decorators does not necessarily require EditableSimulator.**
- Real-time decorators can be applied selectively even in Direct ContentEditable.
- **Basically recommend Direct ContentEditable**, and consider EditableSimulator when actual performance issues occur.

#### 8.9.13 Text Splitting and Cursor Issues Due to Decorator/Mark

**Core Problem**: Text must be split for rendering based on Decorator/Mark, so cursor can become ambiguous when a specific area is inserted in the middle.

**Example**:
```typescript
// Initial state
text: "Hello World"
marks: [{ type: 'bold', range: [0, 5] }]

// Rendering result
<span><strong>Hello</strong> World</span>

// User typing after "Hello"
// → Cursor is between <strong>Hello</strong> and " World"
// → Text may split further if Decorator is added
```

**Problems**:
- Text splits when Decorator/Mark is added during input
- Text Node where cursor was may disappear or change
- Cursor position becomes ambiguous

#### 8.9.14 Text Node Pool + Lock Strategy

**Solution**: Use Text Node Pool concept to preserve text node where cursor currently is as much as possible, and protect that area with a lock during input.

**Strategy 1: sid-based Lock (Lock by sid)**

```typescript
class RenderLayer {
  private lockedTextNodes: Set<string> = new Set(); // locked sid set
  private currentCursorTextNodeSid: string | null = null;
  
  // Input start: Lock sid of text node where cursor is
  handleInputStart(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    
    // Find text node's sid
    const sid = this.getTextNodeSid(textNode);
    if (sid) {
      this.currentCursorTextNodeSid = sid;
      this.lockedTextNodes.add(sid);
    }
  }
  
  // On render: Preserve locked text nodes
  render(options?: RenderOptions): void {
    // Preserve locked text nodes without re-rendering
    const preservedNodes = this.preserveLockedTextNodes();
    
    // Re-render only remaining areas
    this.renderUnlockedAreas();
    
    // Re-insert locked text nodes
    this.restoreLockedTextNodes(preservedNodes);
  }
  
  // Input end: Release lock
  handleInputEnd(): void {
    if (this.currentCursorTextNodeSid) {
      this.lockedTextNodes.delete(this.currentCursorTextNodeSid);
      this.currentCursorTextNodeSid = null;
    }
  }
  
  // Preserve through Text Node Pool
  preserveLockedTextNodes(): Map<string, Text> {
    const preserved = new Map<string, Text>();
    
    for (const sid of this.lockedTextNodes) {
      const textNode = this.findTextNodeBySid(sid);
      if (textNode) {
        // Store in Text Node Pool
        this.textNodePool.preserve(sid, textNode);
        preserved.set(sid, textNode);
      }
    }
    
    return preserved;
  }
  
  // Re-insert locked text nodes
  restoreLockedTextNodes(preserved: Map<string, Text>): void {
    for (const [sid, textNode] of preserved) {
      // Get from Text Node Pool and re-insert
      const restored = this.textNodePool.get(sid);
      if (restored) {
        this.insertTextNode(restored);
      }
    }
  }
}
```

**Strategy 2: Apply Decorators After Detecting Input Idle**

```typescript
class RenderLayer {
  private inputTimer: number | null = null;
  private lastInputTime: number = 0;
  private readonly INPUT_IDLE_THRESHOLD = 500; // 500ms
  
  // During input
  handleInput(event: InputEvent): void {
    // 1. Record input time
    this.lastInputTime = Date.now();
    
    // 2. Reset timer
    if (this.inputTimer) {
      clearTimeout(this.inputTimer);
    }
    
    // 3. Update model
    this.updateModel(event);
    
    // 4. Don't apply real-time decorators (during input)
    // 5. Set input idle timer
    this.inputTimer = window.setTimeout(() => {
      this.handleInputIdle();
    }, this.INPUT_IDLE_THRESHOLD);
  }
  
  // Detect input idle
  handleInputIdle(): void {
    const timeSinceLastInput = Date.now() - this.lastInputTime;
    
    // Determine input has stopped
    if (timeSinceLastInput >= this.INPUT_IDLE_THRESHOLD) {
      // Can now safely apply decorators
      this.applyDeferredDecorators();
      
      // Release lock (input has stopped)
      this.handleInputEnd();
    }
  }
  
  // Consider applying decorators immediately on Space key input
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Space') {
      // Apply decorators after slight delay after Space input
      setTimeout(() => {
        this.applyDeferredDecorators();
      }, 100);
    }
  }
}
```

**Strategy 3: Text Node Pool and Lock Integration**

```typescript
class TextNodePool {
  private pool: Map<string, Text> = new Map();
  private locked: Set<string> = new Set();
  
  // Preserve Text Node (if locked)
  preserve(sid: string, textNode: Text): void {
    if (this.locked.has(sid)) {
      // Preserve only if locked
      this.pool.set(sid, textNode);
    }
  }
  
  // Get Text Node
  get(sid: string): Text | null {
    return this.pool.get(sid) || null;
  }
  
  // Set lock
  lock(sid: string): void {
    this.locked.add(sid);
  }
  
  // Release lock
  unlock(sid: string): void {
    this.locked.delete(sid);
    // Remove from pool after lock release (no longer need to preserve)
    this.pool.delete(sid);
  }
  
  // Check if text node is locked
  isLocked(sid: string): boolean {
    return this.locked.has(sid);
  }
}
```

#### 8.9.15 Integrated Strategy: Lock + Idle Detection

```typescript
class RenderLayer {
  private textNodePool: TextNodePool;
  private inputState: {
    isActive: boolean;
    cursorTextNodeSid: string | null;
    lastInputTime: number;
    idleTimer: number | null;
  } = {
    isActive: false,
    cursorTextNodeSid: null,
    lastInputTime: 0,
    idleTimer: null
  };
  
  // Input start
  handleInputStart(): void {
    this.inputState.isActive = true;
    this.inputState.lastInputTime = Date.now();
    
    // Lock sid of text node where cursor is
    const sid = this.getCurrentCursorTextNodeSid();
    if (sid) {
      this.inputState.cursorTextNodeSid = sid;
      this.textNodePool.lock(sid);
    }
  }
  
  // During input
  handleInput(event: InputEvent): void {
    // 1. Update input time
    this.inputState.lastInputTime = Date.now();
    
    // 2. Update model
    this.updateModel(event);
    
    // 3. Render while preserving locked text nodes
    this.render({
      preserveLockedTextNodes: true,
      skipNewDecorators: true  // Don't apply new decorators
    });
    
    // 4. Reset input idle timer
    this.resetIdleTimer();
  }
  
  // Detect input idle
  resetIdleTimer(): void {
    if (this.inputState.idleTimer) {
      clearTimeout(this.inputState.idleTimer);
    }
    
    this.inputState.idleTimer = window.setTimeout(() => {
      this.handleInputIdle();
    }, 500); // Consider stopped if no input for 500ms
  }
  
  // Handle input idle
  handleInputIdle(): void {
    // Input has stopped, so can safely apply decorators
    this.applyDeferredDecorators();
    
    // Release lock
    if (this.inputState.cursorTextNodeSid) {
      this.textNodePool.unlock(this.inputState.cursorTextNodeSid);
      this.inputState.cursorTextNodeSid = null;
    }
    
    this.inputState.isActive = false;
  }
  
  // Handle immediately on Space key input
  handleKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ' || event.key === 'Space') {
      // Apply decorators after slight delay after Space input
      setTimeout(() => {
        if (this.inputState.isActive) {
          this.handleInputIdle();
        }
      }, 100);
    }
  }
  
  // Preserve locked text nodes on render
  render(options?: RenderOptions): void {
    // Preserve locked text nodes
    if (options?.preserveLockedTextNodes) {
      this.preserveLockedTextNodes();
    }
    
    // Normal rendering
    // ...
    
    // Restore locked text nodes
    if (options?.preserveLockedTextNodes) {
      this.restoreLockedTextNodes();
    }
  }
}
```

#### 8.9.16 Advantages and Considerations

**Advantages**:
- ✅ **Cursor Stability**: Text node where cursor is preserved during input
- ✅ **Performance Optimization**: Skip decorator application during input for performance improvement
- ✅ **User Experience**: Automatically apply decorators when input stops
- ✅ **Flexibility**: Can apply decorators immediately with Space key, etc.

**Considerations**:
- ⚠️ **Lock Management**: Problems may occur if locks are not properly released
- ⚠️ **Timing**: Need to adjust input idle detection threshold
- ⚠️ **Complexity**: Increased complexity due to Text Node Pool and Lock management

**Recommended Settings**:
- Input idle threshold: 500ms (adjustable)
- On Space key input: Apply decorators after 100ms delay
- Lock release: On input idle detection or explicit release

#### 8.9.17 VNodeBuilder Integration Structure Design

**Core Requirements**:
- Don't add decorators when newly created if local lock is active
- Filter by comparing decorator creation date with sid's lock time
- Handle this logic in VNodeBuilder

**Structure Design**:

**1. Lock Information Management (EditorViewDOM/RenderLayer Level)**

```typescript
class EditorViewDOM {
  private lockManager: LockManager;
  
  // Lock information management
  private lockManager = {
    // sid → lock information mapping
    locks: new Map<string, LockInfo>(),
    
    // Set sid lock
    lock(sid: string): void {
      this.locks.set(sid, {
        sid,
        lockedAt: Date.now(),
        lockedBy: 'input' // 'input' | 'external' | 'manual'
      });
    },
    
    // Release sid lock
    unlock(sid: string): void {
      this.locks.delete(sid);
    },
    
    // Check if sid is locked
    isLocked(sid: string): boolean {
      return this.locks.has(sid);
    },
    
    // Get lock time
    getLockTime(sid: string): number | null {
      const lock = this.locks.get(sid);
      return lock ? lock.lockedAt : null;
    }
  };
}
```

**2. Decorator Creation Time Tracking**

```typescript
interface Decorator {
  sid: string;
  type: string;
  target: {
    sid: string;  // inline-text's sid
    startOffset: number;
    endOffset: number;
  };
  data: any;
  createdAt?: number;  // decorator creation time (added)
}

class DecoratorManager {
  // Record creation time when adding decorator
  add(decorator: Decorator): void {
    const decoratorWithTime: Decorator = {
      ...decorator,
      createdAt: Date.now()  // Record creation time
    };
    this.decorators.push(decoratorWithTime);
  }
}
```

**3. Pass Lock Information to VNodeBuilder (Context)**

```typescript
class EditorViewDOM {
  render(): void {
    // 1. Collect lock information
    const lockContext = this.collectLockContext();
    
    // 2. Pass to VNodeBuilder as context
    const vnode = this.vnodeBuilder.build(modelData, {
      decorators: this.decorators,
      lockContext: lockContext  // Pass lock information
    });
    
    // 3. Pass to DOMRenderer
    this.domRenderer.render(vnode, modelData, this.decorators, undefined, {
      lockContext: lockContext
    });
  }
  
  // Collect Lock Context
  collectLockContext(): LockContext {
    return {
      locks: Array.from(this.lockManager.locks.values()),
      isLocked: (sid: string) => this.lockManager.isLocked(sid),
      getLockTime: (sid: string) => this.lockManager.getLockTime(sid)
    };
  }
}
```

**4. Decorator Filtering in VNodeBuilder**

```typescript
class VNodeBuilder {
  build(data: ModelData, context?: BuildContext): VNode {
    const lockContext = context?.lockContext;
    
    // Filter decorators: Exclude decorators of locked sid
    const filteredDecorators = this.filterDecoratorsByLock(
      context?.decorators || [],
      lockContext
    );
    
    // Create VNode with filtered decorators
    return this.buildVNode(data, {
      ...context,
      decorators: filteredDecorators
    });
  }
  
  // Lock-based Decorator Filtering
  filterDecoratorsByLock(
    decorators: Decorator[],
    lockContext?: LockContext
  ): Decorator[] {
    if (!lockContext) {
      // Return all decorators if no lock information
      return decorators;
    }
    
    return decorators.filter(decorator => {
      // 1. Check decorator's target sid
      const targetSid = decorator.target?.sid;
      if (!targetSid) {
        // Pass if no target sid (pattern decorators, etc.)
        return true;
      }
      
      // 2. Check if that sid is locked
      if (!lockContext.isLocked(targetSid)) {
        // Pass if not locked
        return true;
      }
      
      // 3. If locked, compare creation time with lock time
      const lockTime = lockContext.getLockTime(targetSid);
      const decoratorCreatedAt = decorator.createdAt;
      
      if (!lockTime || !decoratorCreatedAt) {
        // Exclude safely if time information missing
        return false;
      }
      
      // 4. Pass if decorator created before lock (existing decorator)
      //    Exclude if decorator created after lock (new decorator)
      return decoratorCreatedAt < lockTime;
    });
  }
}
```

**5. Integrated Flow**

```typescript
// 1. Input start
handleInputStart(): void {
  const sid = this.getCurrentCursorTextNodeSid();
  if (sid) {
    this.lockManager.lock(sid);  // Lock sid
  }
}

// 2. Attempt to add decorator during input
addDecorator(decorator: Decorator): void {
  // Add decorator (record creation time)
  this.decoratorManager.add(decorator);
  
  // Render (VNodeBuilder automatically filters)
  this.render();
}

// 3. Filtering in VNodeBuilder
// - Exclude decorators of locked sid created after lock
// - Include decorators of locked sid created before lock (existing decorators)

// 4. Input idle
handleInputIdle(): void {
  // Release lock
  this.lockManager.unlock(this.inputState.cursorTextNodeSid);
  
  // Now all decorators can be applied
  this.render();
}
```

**6. Structure Diagram**

```
┌─────────────────────────────────────────┐
│  EditorViewDOM                          │
│  - LockManager (sid → lock time)       │
│  - DecoratorManager (decorator + time)  │
└─────────────────────────────────────────┘
           │
           │ context (lockContext)
           ▼
┌─────────────────────────────────────────┐
│  VNodeBuilder                           │
│  - filterDecoratorsByLock()            │
│  - decorator.createdAt < lock.lockedAt │
└─────────────────────────────────────────┘
           │
           │ filtered decorators
           ▼
┌─────────────────────────────────────────┐
│  DOMRenderer                            │
│  - VNode → DOM                          │
└─────────────────────────────────────────┘
```

**7. Implementation Example**

```typescript
// Lock Context interface
interface LockContext {
  locks: LockInfo[];
  isLocked(sid: string): boolean;
  getLockTime(sid: string): number | null;
}

interface LockInfo {
  sid: string;
  lockedAt: number;
  lockedBy: 'input' | 'external' | 'manual';
}

// VNodeBuilder BuildContext extension
interface BuildContext {
  decorators?: Decorator[];
  lockContext?: LockContext;
  // ... other context
}

// Usage example
const lockContext: LockContext = {
  locks: [
    { sid: 'text-1', lockedAt: 1000, lockedBy: 'input' }
  ],
  isLocked: (sid) => sid === 'text-1',
  getLockTime: (sid) => sid === 'text-1' ? 1000 : null
};

const decorators: Decorator[] = [
  {
    sid: 'decorator-1',
    target: { sid: 'text-1', startOffset: 0, endOffset: 5 },
    createdAt: 500  // Created before lock → include
  },
  {
    sid: 'decorator-2',
    target: { sid: 'text-1', startOffset: 5, endOffset: 10 },
    createdAt: 1500  // Created after lock → exclude
  },
  {
    sid: 'decorator-3',
    target: { sid: 'text-2', startOffset: 0, endOffset: 5 },
    createdAt: 2000  // Unlocked sid → include
  }
];

// Filtering result
// decorator-1: include (created before lock)
// decorator-2: exclude (created after lock)
// decorator-3: include (unlocked sid)
```

**8. Considerations**

**Advantages**:
- ✅ **Clear Separation of Responsibilities**: Lock management in EditorViewDOM, filtering in VNodeBuilder
- ✅ **Time-based Comparison**: Accurate filtering by comparing creation time with lock time
- ✅ **Preserve Existing Decorators**: Decorators created before lock are maintained
- ✅ **Extensibility**: Flexible information passing through Context

**Cautions**:
- ⚠️ **Time Synchronization**: Server time and client time may differ (consider only local decorators)
- ⚠️ **Performance**: Iterate through all decorators for comparison (optimization needed if many decorators)
- ⚠️ **Lock Release Timing**: Input idle detection must be accurate

**Optimization Approach**:
```typescript
// Manage only locked sids as Set for fast lookup
private lockedSids: Set<string> = new Set();

filterDecoratorsByLock(decorators: Decorator[], lockContext?: LockContext): Decorator[] {
  if (!lockContext || lockContext.locks.length === 0) {
    return decorators;  // Fast return if no locks
  }
  
  // Create locked sid Set (once only)
  const lockedSids = new Set(lockContext.locks.map(l => l.sid));
  const lockTimeMap = new Map(
    lockContext.locks.map(l => [l.sid, l.lockedAt])
  );
  
  // Filter (check only locked sids)
  return decorators.filter(decorator => {
    const targetSid = decorator.target?.sid;
    if (!targetSid || !lockedSids.has(targetSid)) {
      return true;  // Pass if sid not locked
    }
    
    const lockTime = lockTimeMap.get(targetSid);
    const createdAt = decorator.createdAt;
    
    return createdAt && lockTime && createdAt < lockTime;
  });
}
```

#### 8.9.18 Approach: Separating Inline Decorators as VNode Children

**Core Idea**: By separating inline decorators as separate children of VNode, text node structure doesn't change, ensuring stability during reconciliation.

**Problems with Current Structure**:
- Text nodes split when inline decorators are placed at same level as text
- Text node structure changes when decorators are added/removed
- Text nodes may become misaligned during reconciliation

**Proposed Structure**:

**1. VNode Structure Change**

```typescript
interface VNode {
  tag?: string;
  text?: string;
  children?: VNode[];  // Normal children (spans separated by marks, etc.)
  decorators?: VNode[];  // Inline decorator children (separated)
  // ... other properties
}
```

**2. Rendering Structure Considerations**

**Proposal 1: Separate Decorators into Separate Area (Place Above)**
```typescript
// Proposal 1: Place decorators in separate area above
<div>
  <!-- decorators: placed above text run -->
  <div class="decorators">
    <decorator-color>#ff0000</decorator-color>
  </div>
  
  <!-- children: only spans separated by marks -->
  <span>Hello</span>
  <span>World</span>
</div>
```
- ✅ Text node structure stable
- ❌ Decorator position separated from text may feel unnatural

**Proposal 2: Include Decorators Inside span (Original Position)**
```typescript
// Proposal 2: Include decorators inside span
<div>
  <span>Hello</span>
  <span>World <decorators /></span>  <!-- decorator inside span -->
</div>
```
- ✅ Decorator at original position (natural)
- ⚠️ Show decorator above when cursor exists, original position when not?
- ❌ Decorator position changing based on cursor presence may feel odd

**Proposal 3: Always Keep Decorators at Original Position**
```typescript
// Proposal 3: Always keep decorators at original position
<div>
  <span>Hello</span>
  <span>
    World
    <decorator-color>#ff0000</decorator-color>  <!-- always here -->
  </span>
</div>
```
- ✅ Decorator position consistent
- ⚠️ Text node structure may change (when decorators added/removed)

**Considerations**:
- Showing decorator above when cursor exists may feel odd in user experience
- Decorator position must be consistent so users don't get confused
- But text node structure stability is also important

**3. VNodeBuilder Implementation**

```typescript
class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[]): VNode {
    const text = data.text || '';
    const marks = data.marks || [];
    
    // 1. Create span children separated by marks
    const markChildren = this.buildMarkedRuns(text, marks);
    
    // 2. Create inline decorator children (separate)
    const decoratorChildren = this.buildInlineDecorators(decorators, data.sid);
    
    // 3. Create VNode
    return {
      tag: 'div',
      children: markChildren,  // only spans separated by marks
      decorators: decoratorChildren,  // decorators separate
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
  
  // Span children separated by marks
  buildMarkedRuns(text: string, marks: Mark[]): VNode[] {
    // Existing logic: separate text into spans based on marks
    // Example: "Hello World" + bold[0,5] → [<span><strong>Hello</strong></span>, <span> World</span>]
    return this.splitTextByMarks(text, marks);
  }
  
  // Inline decorator children (placed above)
  buildInlineDecorators(decorators: Decorator[], textSid: string): VNode[] {
    // Filter only inline decorators applied to this text node
    const inlineDecorators = decorators.filter(d => 
      d.category === 'inline' && 
      d.target?.sid === textSid
    );
    
    // Create Decorator VNode
    return inlineDecorators.map(decorator => ({
      tag: `decorator-${decorator.type}`,
      decoratorSid: decorator.sid,
      attrs: {
        'data-bc-decorator-sid': decorator.sid,
        'data-bc-target-sid': decorator.target.sid,
        'data-bc-start-offset': decorator.target.startOffset,
        'data-bc-end-offset': decorator.target.endOffset
      },
      // Render decorator component
      component: decorator.type,
      props: decorator.data
    }));
  }
}
```

**4. DOM Rendering Structure**

```typescript
// VNode → DOM conversion
function renderVNodeToDOM(vnode: VNode, container: HTMLElement): void {
  const element = document.createElement(vnode.tag || 'div');
  
  // 1. Place decorators above first
  if (vnode.decorators && vnode.decorators.length > 0) {
    const decoratorContainer = document.createElement('div');
    decoratorContainer.className = 'decorators';
    decoratorContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      pointer-events: none;
      z-index: 10;
    `;
    
    for (const decoratorVNode of vnode.decorators) {
      renderVNodeToDOM(decoratorVNode, decoratorContainer);
    }
    
    element.appendChild(decoratorContainer);
  }
  
  // 2. Place normal children (spans separated by marks)
  if (vnode.children) {
    for (const childVNode of vnode.children) {
      renderVNodeToDOM(childVNode, element);
    }
  }
  
  container.appendChild(element);
}
```

**5. Structure Comparison and Considerations**

**Existing Structure (has problems)**:
```
<div>
  <span>Hello</span>           <!-- text node 1 -->
  <decorator-color>#ff0000</decorator-color>  <!-- decorator -->
  <span>World</span>           <!-- text node 2 -->
</div>
```
- Text node order changes when decorators added/removed
- Text node matching difficult during reconciliation

**Proposed Structures**:

**Structure A: Separate Decorators into Separate Area Above**
```
<div>
  <div class="decorators">     <!-- decorator area (above) -->
    <decorator-color>#ff0000</decorator-color>
  </div>
  <span>Hello</span>           <!-- text node 1 -->
  <span>World</span>           <!-- text node 2 -->
</div>
```
- ✅ Decorator add/remove doesn't affect text nodes
- ✅ Text node structure always identical
- ❌ Decorator position separated from text may feel unnatural

**Structure B: Include Decorators Inside span**
```
<div>
  <span>Hello</span>
  <span>
    World
    <decorator-color>#ff0000</decorator-color>  <!-- inside span -->
  </span>
</div>
```
- ✅ Decorator at original position (natural)
- ⚠️ Change decorator position based on cursor presence? (may feel odd)
- ⚠️ Text node structure may change

**Structure C: Hybrid (needs consideration)**
```
<div>
  <span>Hello</span>
  <span>World</span>
  <!-- decorator managed separately but placed at original position with CSS -->
  <decorator-color style="position: absolute; ...">#ff0000</decorator-color>
</div>
```
- ✅ Text node structure stable
- ✅ Decorator placed at original position with CSS
- ⚠️ Position calculation complexity increases

**Considerations**:
- Showing decorator above when cursor exists may feel odd in user experience
- Decorator position must be consistent so users don't get confused
- Need balance between text node structure stability and natural decorator position

**Important Characteristics**:
- **Inline decorators have `contenteditable="false"`**: Not selection targets
- **Events can occur**: Click, hover, etc. are possible
- Structure design can differ by leveraging these characteristics

**Core Insight**: Since inline decorators have `contenteditable="false"`, **it may be okay to keep text nodes in a single row**.

**Reasons**:
- Decorators are not selection targets, so don't affect selection even if between text nodes
- Keeping text node structure in a single row is stable during reconciliation
- Decorators can be placed separately but displayed at desired position with CSS

**Proposed Structure**:
```typescript
// Keep text nodes in single row
<div>
  <span>Hello</span>
  <span>World</span>
  <!-- decorator placed separately, contenteditable="false" -->
  <decorator-color contenteditable="false">#ff0000</decorator-color>
</div>
```

**Advantages**:
- ✅ Text node structure always consistent in single row
- ✅ Decorator add/remove doesn't affect text node order
- ✅ Text node matching stable during reconciliation
- ✅ Decorators not selection targets, so don't affect selection

**Implementation**:
```typescript
class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[]): VNode {
    // 1. Span children separated by marks (keep in single row)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. Inline decorator children (add separately, contenteditable="false")
    const decoratorChildren = this.buildInlineDecorators(decorators, data.sid);
    
    // 3. Create VNode: include both marks and decorators in children
    // But decorators have contenteditable="false" so don't affect selection
    return {
      tag: 'div',
      children: [
        ...markChildren,  // spans separated by marks
        ...decoratorChildren  // decorators (contenteditable="false")
      ],
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
  
  buildInlineDecorators(decorators: Decorator[], textSid: string): VNode[] {
    const inlineDecorators = decorators.filter(d => 
      d.category === 'inline' && 
      d.target?.sid === textSid
    );
    
    return inlineDecorators.map(decorator => ({
      tag: `decorator-${decorator.type}`,
      decoratorSid: decorator.sid,
      attrs: {
        'contenteditable': 'false',  // Not a selection target
        'data-bc-decorator-sid': decorator.sid,
        'data-bc-target-sid': decorator.target.sid,
        'data-bc-start-offset': decorator.target.startOffset,
        'data-bc-end-offset': decorator.target.endOffset
      },
      component: decorator.type,
      props: decorator.data
    }));
  }
}
```

**Selection Behavior**:
- Only text nodes are selection targets, so selection naturally includes only text nodes even if decorators are between them
- Decorators have `contenteditable="false"` so not included in selection range
- When user drags, decorators are skipped and only text nodes are selected

**6. Advantages**

**Structural Stability**:
- ✅ Text node structure doesn't change
- ✅ Decorator add/remove doesn't affect text nodes
- ✅ Text node matching stable during reconciliation

**Position Management**:
- ✅ Decorators placed above text run with absolute position
- ✅ Text nodes naturally placed with relative position
- ✅ Decorator position adjustable with CSS

**Performance**:
- ✅ Easy to reuse text nodes
- ✅ Can update only decorators separately
- ✅ Minimize unnecessary DOM manipulation

**7. Implementation Considerations**

**Position Calculation**:
```typescript
// Align decorator position with text run's actual position
function calculateDecoratorPosition(
  decorator: Decorator,
  textRunElement: HTMLElement
): { top: number; left: number; width: number } {
  const rect = textRunElement.getBoundingClientRect();
  const containerRect = textRunElement.parentElement?.getBoundingClientRect();
  
  // Calculate text run's start position
  const startOffset = decorator.target.startOffset;
  const endOffset = decorator.target.endOffset;
  
  // Calculate decorator range within text run
  const range = document.createRange();
  // ... set range
  
  return {
    top: rect.top - (containerRect?.top || 0),
    left: range.getBoundingClientRect().left - (containerRect?.left || 0),
    width: range.getBoundingClientRect().width
  };
}
```

**Reconciliation Optimization**:
```typescript
class Reconciler {
  reconcileVNodeChildren(
    parent: HTMLElement,
    prevVNode: VNode,
    nextVNode: VNode
  ): void {
    // 1. Handle decorator children separately
    if (nextVNode.decorators) {
      this.reconcileDecorators(parent, prevVNode.decorators, nextVNode.decorators);
    }
    
    // 2. Handle normal children (text nodes)
    // Text node structure identical, so can match stably
    this.reconcileTextNodes(parent, prevVNode.children, nextVNode.children);
  }
  
  reconcileDecorators(
    parent: HTMLElement,
    prevDecorators: VNode[],
    nextDecorators: VNode[]
  ): void {
    // Reconcile only decorators separately
    // No effect on text nodes
  }
  
  reconcileTextNodes(
    parent: HTMLElement,
    prevChildren: VNode[],
    nextChildren: VNode[]
  ): void {
    // Text node structure identical, so can match stably
    // Works regardless of decorator add/remove
  }
}
```

**8. Integration with Lock Strategy**

```typescript
// Text node structure doesn't change even when lock is active
// Only need to filter decorators

class VNodeBuilder {
  buildInlineText(data: ModelData, decorators: Decorator[], lockContext?: LockContext): VNode {
    // 1. Span children separated by marks (always identical)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. Filter inline decorators (based on Lock)
    const filteredDecorators = this.filterDecoratorsByLock(decorators, lockContext);
    
    // 3. Create inline decorator children
    const decoratorChildren = this.buildInlineDecorators(filteredDecorators, data.sid);
    
    return {
      tag: 'div',
      children: markChildren,  // Always identical structure
      decorators: decoratorChildren  // Filtered based on Lock
    };
  }
}
```

**9. Text Node Single Row Maintenance Strategy (Recommended)**

**Core**: Since inline decorators have `contenteditable="false"`, it's possible to keep text nodes in a single row.

**Structure**:
```typescript
<div>
  <span>Hello</span>           <!-- text node 1 -->
  <span>World</span>           <!-- text node 2 -->
  <decorator-color contenteditable="false">#ff0000</decorator-color>  <!-- decorator -->
</div>
```

**Advantages**:
- ✅ **Text Node Structure Consistency**: Always maintained in single row, stable for reconciliation
- ✅ **Selection Stability**: Decorators not selection targets, so don't affect selection
- ✅ **Structure Simplification**: Complex position calculation unnecessary
- ✅ **Lock Strategy Integration**: Only need to filter decorators, text nodes always have identical structure

**Selection Behavior**:
- When user drags, decorators are skipped and only text nodes are selected
- Decorators have `contenteditable="false"` so not included in selection range
- Only text nodes are selection targets, providing natural selection experience

**⚠️ Important Problem: Decorators May Block Text During Input**

**Problem Scenario**:
```typescript
// Structure
<div>
  <span>Hello</span>
  <decorator-color contenteditable="false">#ff0000</decorator-color>
  <span>World</span>
</div>

// User typing after "Hello"
// → Text may be cut at decorator position since decorator is in the middle
// → Input may skip decorator and go before "World"
```

**Solution: Hide Decorators During Input State**

```typescript
class VNodeBuilder {
  buildInlineText(
    data: ModelData, 
    decorators: Decorator[],
    lockContext?: LockContext
  ): VNode {
    // 1. Span children separated by marks (keep in single row)
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // 2. Check input state
    const isInputActive = lockContext?.isLocked(data.sid) || false;
    
    // 3. Filter inline decorators
    // Exclude decorators during input (prevent text cutting)
    const filteredDecorators = isInputActive 
      ? []  // Exclude decorators during input
      : this.filterDecoratorsByLock(decorators, lockContext);
    
    // 4. Create inline decorator children
    const decoratorChildren = this.buildInlineDecorators(filteredDecorators, data.sid);
    
    // 5. Create VNode
    return {
      tag: 'div',
      children: [
        ...markChildren,  // spans separated by marks (always included)
        ...decoratorChildren  // decorators (empty array during input)
      ],
      attrs: {
        'data-bc-sid': data.sid
      }
    };
  }
}
```

**Input State Detection**:
```typescript
class EditorViewDOM {
  render(): void {
    // 1. Check input state (input active if locked sid exists)
    const lockContext = this.collectLockContext();
    const isInputActive = lockContext.locks.length > 0;
    
    // 2. Pass to VNodeBuilder
    const vnode = this.vnodeBuilder.build(modelData, {
      decorators: this.decorators,
      lockContext: lockContext,
      isInputActive: isInputActive  // Pass input state
    });
    
    // 3. Render
    this.domRenderer.render(vnode);
  }
}
```

**Operation Flow**:
1. **Input Start**: Lock sid → `isInputActive = true`
2. **During Input**: Exclude decorators → render only text nodes (prevent text cutting)
3. **Input Idle**: Release lock → `isInputActive = false`
4. **Input Complete**: Include decorators → full render

**Advantages**:
- ✅ **Prevent Text Cutting During Input**: No decorators, so input proceeds naturally
- ✅ **Display Decorators After Input Complete**: Decorators reappear when input stops
- ✅ **Text Node Structure Stability**: Text node structure remains identical even during input

**Implementation Example**:
```typescript
// VNode structure
{
  tag: 'div',
  children: [
    { tag: 'span', text: 'Hello' },  // text node 1
    { tag: 'span', text: 'World' },  // text node 2
    { 
      tag: 'decorator-color',
      attrs: { contenteditable: 'false' },
      decoratorSid: 'decorator-1'
    }  // decorator (not a selection target)
  ]
}

// DOM structure
<div>
  <span>Hello</span>
  <span>World</span>
  <decorator-color contenteditable="false">#ff0000</decorator-color>
</div>
```

**10. Decorator Handling Strategy During Input**

**Core Problem**: If decorators are between text nodes, text may be cut at decorator position during input.

**Solution**: Completely exclude decorators during input state.

```typescript
class VNodeBuilder {
  buildInlineText(
    data: ModelData, 
    decorators: Decorator[],
    lockContext?: LockContext
  ): VNode {
    const markChildren = this.buildMarkedRuns(data.text, data.marks);
    
    // Completely exclude decorators during input
    const isInputActive = lockContext?.isLocked(data.sid) || false;
    const decoratorChildren = isInputActive 
      ? []  // During input: exclude decorators (prevent text cutting)
      : this.buildInlineDecorators(
          this.filterDecoratorsByLock(decorators, lockContext),
          data.sid
        );
    
    return {
      tag: 'div',
      children: [
        ...markChildren,  // always included
        ...decoratorChildren  // empty array during input
      ]
    };
  }
}
```

**Operation Flow**:
1. **Input Start**: Lock sid → exclude decorators
2. **During Input**: Render only text nodes (no decorators)
3. **Input Idle**: Release lock → include decorators
4. **Input Complete**: Decorators reappear

**Advantages**:
- ✅ **Prevent Text Cutting During Input**: No decorators, so input proceeds naturally
- ✅ **Display Decorators After Input Complete**: Decorators reappear when input stops
- ✅ **Text Node Structure Stability**: Text node structure remains identical even during input

**11. Conclusion**

Core advantages of this approach:
- ✅ **Text Node Structure Stability**: Keep text nodes in single row regardless of decorator add/remove
- ✅ **Reconciliation Stability**: Text node matching always stable (always same order)
- ✅ **Selection Stability**: Decorators have `contenteditable="false"` so don't affect selection
- ✅ **Input Stability**: Exclude decorators during input to prevent text cutting
- ✅ **Structure Simplification**: Complex position calculation or separate area management unnecessary
- ✅ **Lock Strategy Integration**: Only need to filter decorators based on input state, text nodes always have identical structure

This approach prioritizes **structural stability** while leveraging **`contenteditable="false"` characteristics and input state detection** to maintain text nodes in a single row while ensuring both input stability and selection stability.

```typescript
class EditableSimulator {
  private config = {
    contextBefore: 100,    // 100 characters before cursor
    contextAfter: 100,     // 100 characters after cursor
    recreateThreshold: 50   // Regenerate when moved 50+ characters
  };
  
  // Detect cursor move and decide regeneration
  handleCursorMove(): void {
    const currentOffset = this.getCurrentModelOffset();
    const distance = Math.abs(currentOffset - this.lastCursorOffset);
    
    // Regenerate only when moved beyond threshold or went outside area
    if (distance > this.config.recreateThreshold || this.isOutOfViewport(currentOffset)) {
      this.deactivate();
      this.activateAtCursor(this.getCurrentRange());
    }
  }
}
```

---

## 9. Comparison with Existing Approaches

### 7.1 Existing ContentEditable-based Editors

**Approach**: Rendering and editing in the same area

**Problems**:
- ❌ Dual state management
- ❌ Complex Selection/Cursor management
- ❌ DOM and model synchronization issues

### 7.2 Separated ContentEditable Layer

**Approach**: Separation of render layer and edit layer

**Advantages**:
- ✅ Render Layer: Unidirectional data flow, can render continuously
- ✅ Edit Layer: Only handles input with ContentEditable, input handling simplified
- ✅ Complete separation enables independent management of each area
- ✅ Position calculation unnecessary (structures are identical)

**Disadvantages**:
- ⚠️ Real-time synchronization needed
- ⚠️ Structure cloning performance considerations needed
- ⚠️ Synchronization timing control needed

### 7.3 Model-Direct Editing (Pure)

**Approach**: Completely remove ContentEditable

**Advantages**:
- ✅ Complete control
- ✅ Unidirectional data flow

**Disadvantages**:
- ❌ IME support difficult
- ❌ Must implement all input handling directly

---

## 10. Use Cases

### 8.1 General Text Editing

- User types text with keyboard
- Edit layer receives input and converts to model
- Render layer renders model-based

### 8.2 Complex Layout Editing

- Complex layouts like tables, images, etc.
- Render with complete control in render layer
- Edit layer only applied to text areas

### 8.3 Multi-Document Editing

- Edit multiple documents simultaneously
- Separate edit layer for each document
- Render each document independently in render layer

---

## 11. Future Work

### 9.1 Performance Optimization

- Edit layer virtualization
- Minimize unnecessary synchronization
- Rendering optimization

### 9.2 Complex Layout Support

- Table editing support
- Image editing support
- Complex block element editing

### 9.3 Accessibility

- Screen reader compatibility
- Keyboard navigation
- ARIA attribute support

---

## 12. Conclusion

This paper proposed a new paradigm that **completely separates render layer and ContentEditable layer** to solve problems of ContentEditable-based rich text editors.

**Core Contributions**:
1. **EditableSimulator Concept Introduction**: New tool concept that edits models externally, like design tools' sidebars and property panels
2. **Complete Separation**: Independently manage render layer and edit layer
3. **Structure Cloning Strategy**: Copy original structure as-is and combine into editable state
4. **Leverage Transparency**: Only cursor position/Selection need to be accurate, underlying structure doesn't need much attention
5. **Maintain User Experience**: Maintain existing habits (keyboard input) as-is
6. **Cursor Decorator**: Display cursor as decorator in render layer so users see cursor as if it's in render layer
7. **Complete Transparency**: Edit layer is completely transparent, so no text is visible regardless of input
8. **Perfect IME Support**: ContentEditable layer naturally handles IME
9. **Unidirectional Data Flow**: Each area has clear data flow

**Advantages**:
- ✅ Render Layer: Model-based rendering without ContentEditable
- ✅ Edit Layer: Only handles input with ContentEditable
- ✅ Complete separation enables solving each area's problems independently

**Challenges**:
- ⚠️ **Real-time Synchronization**: Must synchronize edit layer and render layer in real-time
- ⚠️ Structure Cloning Performance: Must efficiently clone render layer structure
- ⚠️ Synchronization Timing: Need to control timing of rendering and synchronization

This approach presents a practical solution that maintains users' existing habits while fundamentally solving ContentEditable's problems.

---

## References

1. W3C. "ContentEditable". https://html.spec.whatwg.org/multipage/interaction.html#contenteditable
2. MDN. "Selection API". https://developer.mozilla.org/en-US/docs/Web/API/Selection
3. ProseMirror. "Document Model". https://prosemirror.net/docs/guide/#document
4. Figma. "How Figma Works". https://www.figma.com/blog/how-figma-works/

