# Model-Direct Editing Paradigm: Rich Text Editor Design Without ContentEditable

## Abstract

This paper analyzes the fundamental limitations of ContentEditable-based rich text editors and proposes the **Model-Direct Editing Paradigm**. Existing editors introduce complex workaround mechanisms (Text Node Pool, Selection restoration, etc.) to solve ContentEditable's Selection/Cursor handling difficulties, but these are not fundamental solutions.

This paper proposes **completely removing ContentEditable** and a new editing interface that **directly converts user input to model changes**, just as AI directly changes the model. This converts keyboard/mouse input to model change events without going through ContentEditable, fundamentally eliminating the complexity of Selection/Cursor management.

**Keywords**: Model-Direct Editing, ContentEditable Alternative, Rich Text Editor, Selection Management, Cursor Handling, Direct Manipulation

---

## 1. Introduction

### 1.1 Fundamental Problems of ContentEditable

ContentEditable-based rich text editors face the following fundamental problems:

1. **Complexity of Selection/Cursor Handling**
   - Browser Selection API maintains direct references to DOM Nodes
   - Selection easily breaks when DOM changes
   - Complex workaround mechanisms needed (Text Node Pool, Selection restoration, etc.)

2. **Dual State Management**
   - Must synchronize DOM state and model state
   - DOM → model conversion via MutationObserver
   - Model → DOM rendering
   - Bugs occur when synchronization fails

3. **IME (Input Method Editor) Compatibility**
   - Complex handling of composition-based input like Hangul, Japanese
   - Timing issues between composition events and DOM changes
   - Different behavior across browsers

4. **Accessibility Issues**
   - Compatibility with screen readers
   - Keyboard navigation
   - Reduced accessibility in complex DOM structures

### 1.2 Limitations of Existing Solutions

Existing editors have introduced various workaround mechanisms to solve ContentEditable's problems:

- **Text Node Pool**: Preserve Text Nodes with Selection to ensure Selection stability
- **Selection restoration**: Restore Selection after DOM updates
- **MutationObserver**: Detect DOM changes to synchronize model
- **Per-Character Rendering**: Render each character as separate DOM element to improve Selection stability

However, these approaches are all **workarounds for ContentEditable's fundamental problems**, not fundamental solutions.

### 1.3 New Perspective: Human vs AI Editing Approaches

**AI's Editing Approach**:
- Does not use ContentEditable
- Directly changes model (insert, delete, update)
- Selection/Cursor expressed as model offset
- DOM is simply rendering result of model

**Human's Editing Approach (Current)**:
- Receives keyboard/mouse input through ContentEditable
- Browser directly changes DOM
- MutationObserver detects DOM changes to synchronize model
- Selection/Cursor depends on browser Selection API

**Core Question**: What if humans could also directly edit the model like AI?

---

## 2. Problem Statement

### 2.1 Why ContentEditable is Needed

ContentEditable is used **to allow users to directly input and edit text with keyboard/mouse**. However, this is not the **only reason** to use ContentEditable.

### 2.2 Actual Role of ContentEditable

ContentEditable serves the following roles:

1. **Receive keyboard input**: When user presses a key, browser inserts text into DOM
2. **Handle mouse clicks**: Place cursor at click position
3. **Text selection**: Select text range by dragging
4. **IME input**: Handle composition-based input

However, all these features **can be implemented without ContentEditable**:

- **Keyboard input**: Can receive via `keydown`, `keypress`, `input` events
- **Mouse clicks**: Can calculate position via `click`, `mousedown` events
- **Text selection**: Can implement via `mousedown`, `mousemove`, `mouseup` events
- **IME input**: Can handle via `compositionstart`, `compositionupdate`, `compositionend` events

### 2.3 The Real Problem with ContentEditable

The real problem with ContentEditable is that **the browser directly changes the DOM**:

1. User presses a key
2. Browser inserts text into DOM
3. Editor detects DOM changes via MutationObserver
4. Editor updates model
5. Editor re-renders DOM

This process causes **dual state management** and **synchronization problems**.

---

## 3. Proposed Solution: Model-Direct Editing Paradigm

### 3.1 Core Idea

**Completely remove ContentEditable** and **directly convert user input to model changes**:

1. User presses a key
2. Editor receives input event
3. Editor **directly changes model** (insert, delete, update)
4. Editor renders DOM (unidirectional data flow)

This results in:
- **Selection/Cursor managed as model offset** (browser Selection API unnecessary)
- **DOM is rendering result of model** (unidirectional data flow)
- **Synchronization problems eliminated** (single source of truth)

### 3.2 Unifying AI vs Human Editing Approaches

**AI's Editing Approach**:
```typescript
// AI directly changes model
editor.insertText(modelOffset, "Hello");
editor.deleteText(modelOffset, 5);
editor.applyMark(modelOffset, 5, "bold");
```

**Human's Editing Approach (Proposed)**:
```typescript
// Humans also directly change model (convert keyboard input to model changes)
handleKeydown(event: KeyboardEvent) {
  const modelOffset = this.getCursorOffset(); // Model offset
  if (event.key === 'a') {
    this.editor.insertText(modelOffset, 'a'); // Direct model change
  }
}
```

**Difference**: AI changes model programmatically, while humans convert keyboard/mouse input to model changes.

### 3.3 Editing Interface Without ContentEditable

```typescript
class ModelDirectEditor {
  private model: Model;
  private cursorOffset: number = 0; // Model offset
  
  // Handle keyboard input without ContentEditable
  handleKeydown(event: KeyboardEvent): void {
    event.preventDefault(); // Prevent browser default behavior
    
    if (event.key.length === 1) {
      // General character input
      this.model.insertText(this.cursorOffset, event.key);
      this.cursorOffset += event.key.length;
    } else if (event.key === 'Backspace') {
      // Backspace
      if (this.cursorOffset > 0) {
        this.model.deleteText(this.cursorOffset - 1, 1);
        this.cursorOffset -= 1;
      }
    } else if (event.key === 'ArrowLeft') {
      // Left arrow
      this.cursorOffset = Math.max(0, this.cursorOffset - 1);
    } else if (event.key === 'ArrowRight') {
      // Right arrow
      this.cursorOffset = Math.min(this.model.getLength(), this.cursorOffset + 1);
    }
    
    // Render DOM after model change
    this.render();
    // Update cursor position
    this.updateCursor();
  }
  
  // Handle mouse clicks without ContentEditable
  handleClick(event: MouseEvent): void {
    const domOffset = this.getOffsetFromPoint(event.clientX, event.clientY);
    const modelOffset = this.convertDOMOffsetToModel(domOffset);
    this.cursorOffset = modelOffset;
    this.updateCursor();
  }
  
  // Handle text selection without ContentEditable
  handleMouseDown(event: MouseEvent): void {
    this.selectionStart = this.getOffsetFromPoint(event.clientX, event.clientY);
  }
  
  handleMouseMove(event: MouseEvent): void {
    if (this.selectionStart !== null) {
      const selectionEnd = this.getOffsetFromPoint(event.clientX, event.clientY);
      this.selectionRange = { start: this.selectionStart, end: selectionEnd };
      this.renderSelection();
    }
  }
  
  handleMouseUp(event: MouseEvent): void {
    // Selection complete
  }
  
  // IME input handling
  handleCompositionStart(event: CompositionEvent): void {
    this.isComposing = true;
    this.compositionText = '';
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    this.compositionText = event.data;
    // Temporarily display text being composed
    this.renderComposition();
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    // Insert completed composition text into model
    this.model.insertText(this.cursorOffset, event.data);
    this.cursorOffset += event.data.length;
    this.render();
  }
  
  // Update cursor position (display cursor in DOM)
  updateCursor(): void {
    const cursorElement = this.getCursorElement();
    const position = this.getCursorPosition(this.cursorOffset);
    cursorElement.style.left = `${position.x}px`;
    cursorElement.style.top = `${position.y}px`;
  }
}
```

### 3.4 Model-based Selection/Cursor Management

```typescript
interface ModelSelection {
  anchor: number;  // Model offset
  focus: number;   // Model offset
}

class ModelDirectEditor {
  private selection: ModelSelection | null = null;
  private cursorOffset: number = 0;
  
  // Selection managed as model offset
  getSelection(): ModelSelection | null {
    return this.selection;
  }
  
  setSelection(anchor: number, focus: number): void {
    this.selection = { anchor, focus };
    this.renderSelection();
  }
  
  // Cursor managed as model offset
  getCursorOffset(): number {
    return this.cursorOffset;
  }
  
  setCursorOffset(offset: number): void {
    this.cursorOffset = offset;
    this.updateCursor();
  }
  
  // Display Selection in DOM
  renderSelection(): void {
    if (!this.selection) return;
    
    // Convert model offset to DOM position
    const startPos = this.getDOMPosition(this.selection.anchor);
    const endPos = this.getDOMPosition(this.selection.focus);
    
    // Visually display Selection
    this.highlightSelection(startPos, endPos);
  }
  
  // Display Cursor in DOM
  updateCursor(): void {
    const position = this.getDOMPosition(this.cursorOffset);
    this.cursorElement.style.left = `${position.x}px`;
    this.cursorElement.style.top = `${position.y}px`;
  }
}
```

---

## 4. Implementation Strategy

### 4.1 Keyboard Input Handling

```typescript
class ModelDirectEditor {
  private container: HTMLElement;
  
  setup(): void {
    // Receive keyboard events without ContentEditable
    this.container.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.container.setAttribute('tabindex', '0'); // Make focusable
  }
  
  handleKeydown(event: KeyboardEvent): void {
    // Prevent browser default behavior (no ContentEditable)
    event.preventDefault();
    
    const key = event.key;
    const modelOffset = this.cursorOffset;
    
    if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      // General character input
      this.model.insertText(modelOffset, key);
      this.cursorOffset += key.length;
    } else if (key === 'Backspace') {
      // Backspace
      if (modelOffset > 0) {
        this.model.deleteText(modelOffset - 1, 1);
        this.cursorOffset -= 1;
      }
    } else if (key === 'Delete') {
      // Delete key
      if (modelOffset < this.model.getLength()) {
        this.model.deleteText(modelOffset, 1);
      }
    } else if (key === 'ArrowLeft') {
      // Left arrow
      this.cursorOffset = Math.max(0, modelOffset - 1);
    } else if (key === 'ArrowRight') {
      // Right arrow
      this.cursorOffset = Math.min(this.model.getLength(), modelOffset + 1);
    } else if (key === 'ArrowUp') {
      // Up arrow (line movement)
      this.cursorOffset = this.moveCursorUp(modelOffset);
    } else if (key === 'ArrowDown') {
      // Down arrow (line movement)
      this.cursorOffset = this.moveCursorDown(modelOffset);
    } else if (key === 'Enter') {
      // Enter key (line break)
      this.model.insertText(modelOffset, '\n');
      this.cursorOffset += 1;
    }
    
    // Render after model change
    this.render();
    this.updateCursor();
  }
}
```

### 4.2 Mouse Input Handling

```typescript
class ModelDirectEditor {
  private isSelecting: boolean = false;
  private selectionStart: number | null = null;
  
  setup(): void {
    this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
  }
  
  handleMouseDown(event: MouseEvent): void {
    // Calculate model offset at click position
    const modelOffset = this.getModelOffsetFromPoint(event.clientX, event.clientY);
    
    if (event.shiftKey && this.selection) {
      // Shift + click: Extend selection
      this.setSelection(this.selection.anchor, modelOffset);
    } else {
      // Normal click: Move cursor
      this.cursorOffset = modelOffset;
      this.selection = null;
      this.isSelecting = true;
      this.selectionStart = modelOffset;
    }
    
    this.updateCursor();
    this.renderSelection();
  }
  
  handleMouseMove(event: MouseEvent): void {
    if (this.isSelecting && this.selectionStart !== null) {
      // During drag: Update selection
      const modelOffset = this.getModelOffsetFromPoint(event.clientX, event.clientY);
      this.setSelection(this.selectionStart, modelOffset);
    }
  }
  
  handleMouseUp(event: MouseEvent): void {
    this.isSelecting = false;
  }
  
  // Convert DOM coordinates to model offset
  getModelOffsetFromPoint(x: number, y: number): number {
    // Find nearest text position in DOM
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return 0;
    
    // Convert DOM position to model offset
    return this.convertDOMPositionToModel(range.startContainer, range.startOffset);
  }
}
```

### 4.3 IME Input Handling

```typescript
class ModelDirectEditor {
  private isComposing: boolean = false;
  private compositionText: string = '';
  private compositionOffset: number = 0;
  
  setup(): void {
    this.container.addEventListener('compositionstart', (e) => this.handleCompositionStart(e));
    this.container.addEventListener('compositionupdate', (e) => this.handleCompositionUpdate(e));
    this.container.addEventListener('compositionend', (e) => this.handleCompositionEnd(e));
  }
  
  handleCompositionStart(event: CompositionEvent): void {
    this.isComposing = true;
    this.compositionText = '';
    this.compositionOffset = this.cursorOffset;
    
    // Store position to temporarily display text being composed
  }
  
  handleCompositionUpdate(event: CompositionEvent): void {
    this.compositionText = event.data;
    
    // Temporarily render text being composed
    this.renderComposition(this.compositionOffset, this.compositionText);
  }
  
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    
    // Insert completed composition text into model
    if (this.compositionText) {
      this.model.insertText(this.compositionOffset, this.compositionText);
      this.cursorOffset = this.compositionOffset + this.compositionText.length;
    }
    
    // Remove composition text and render normally
    this.clearComposition();
    this.render();
    this.updateCursor();
  }
  
  // Temporarily display text being composed
  renderComposition(offset: number, text: string): void {
    // Display composition text with highlight
    const compositionElement = this.createCompositionElement(text);
    const position = this.getDOMPosition(offset);
    compositionElement.style.position = 'absolute';
    compositionElement.style.left = `${position.x}px`;
    compositionElement.style.top = `${position.y}px`;
    this.container.appendChild(compositionElement);
  }
}
```

### 4.4 Cursor and Selection Visualization

```typescript
class ModelDirectEditor {
  private cursorElement: HTMLElement;
  private selectionOverlay: HTMLElement;
  
  setup(): void {
    // Create cursor element
    this.cursorElement = document.createElement('div');
    this.cursorElement.className = 'editor-cursor';
    this.cursorElement.style.cssText = `
      position: absolute;
      width: 2px;
      height: 1.2em;
      background: #000;
      pointer-events: none;
      animation: blink 1s infinite;
    `;
    this.container.appendChild(this.cursorElement);
    
    // Create selection overlay
    this.selectionOverlay = document.createElement('div');
    this.selectionOverlay.className = 'editor-selection';
    this.selectionOverlay.style.cssText = `
      position: absolute;
      background: rgba(0, 0, 255, 0.2);
      pointer-events: none;
    `;
    this.container.appendChild(this.selectionOverlay);
  }
  
  // Update cursor position
  updateCursor(): void {
    const position = this.getDOMPosition(this.cursorOffset);
    this.cursorElement.style.left = `${position.x}px`;
    this.cursorElement.style.top = `${position.y}px`;
    this.cursorElement.style.height = `${position.height}px`;
  }
  
  // Display selection
  renderSelection(): void {
    if (!this.selection) {
      this.selectionOverlay.style.display = 'none';
      return;
    }
    
    const startPos = this.getDOMPosition(this.selection.anchor);
    const endPos = this.getDOMPosition(this.selection.focus);
    
    // Calculate selection area
    if (startPos.y === endPos.y) {
      // Same line
      this.selectionOverlay.style.left = `${startPos.x}px`;
      this.selectionOverlay.style.top = `${startPos.y}px`;
      this.selectionOverlay.style.width = `${endPos.x - startPos.x}px`;
      this.selectionOverlay.style.height = `${startPos.height}px`;
    } else {
      // Multiple lines (complex calculation needed)
      // ...
    }
    
    this.selectionOverlay.style.display = 'block';
  }
  
  // Convert model offset to DOM position
  getDOMPosition(modelOffset: number): { x: number; y: number; height: number } {
    // Convert model offset to DOM text position
    // Calculate accurate position using text layout information
    const textNode = this.findTextNodeAtOffset(modelOffset);
    const offsetInNode = modelOffset - textNode.startOffset;
    
    // Calculate accurate position using Range API
    const range = document.createRange();
    range.setStart(textNode.domNode, offsetInNode);
    range.setEnd(textNode.domNode, offsetInNode);
    
    const rect = range.getBoundingClientRect();
    const containerRect = this.container.getBoundingClientRect();
    
    return {
      x: rect.left - containerRect.left,
      y: rect.top - containerRect.top,
      height: rect.height
    };
  }
}
```

---

## 5. Advantages and Challenges

### 5.1 Advantages

#### 5.1.1 Simplified Selection/Cursor Management

- **Model-based management**: Selection/Cursor managed as model offset, no need for complex DOM references
- **Remove browser dependency**: Does not depend on browser Selection API
- **Consistency guaranteed**: Same behavior across all browsers

#### 5.1.2 Unidirectional Data Flow

- **Single source of truth**: Model is the only state source
- **Eliminate synchronization problems**: No need to synchronize between DOM and model
- **Predictable behavior**: Simple flow of model change → DOM rendering

#### 5.1.3 Performance Improvement

- **Remove unnecessary DOM manipulation**: MutationObserver unnecessary
- **Optimized rendering**: Only need to render model changes
- **Memory efficiency**: Complex mechanisms like Text Node Pool unnecessary

#### 5.1.4 Improved Accessibility

- **Complete control**: Can fully control visual representation of cursor/Selection
- **Screen reader compatibility**: Can improve accessibility with ARIA attributes
- **Keyboard navigation**: Can directly implement all keyboard behaviors

### 5.2 Challenges

#### 5.2.1 Fundamental Limitations of IME ⚠️

**Biggest problem**: Fully implementing IME without ContentEditable is **nearly impossible**.

**Features IME provides**:
1. **Visual display of text being composed**: Browser handles automatically
   - Shows composition process for Hangul input: "ㅎㅏㄴ" → "한"
   - Shows conversion process for Japanese input: hiragana → kanji
   - This is handled by cooperation between OS-level IME engine and browser

2. **IME candidate word selection UI**: Provided at OS level
   - Kanji candidate list
   - Word suggestion list
   - Browser automatically displays this for ContentEditable elements

3. **Automatic cursor position adjustment**: Browser automatically adjusts to length of text being composed
   - Cursor automatically moves when composed text becomes longer
   - Cursor position restored when composition is cancelled

4. **Composition cancel/completion handling**: Handled by cooperation between browser and OS
   - ESC key cancels composition
   - Enter key completes composition

**Problems**:
- Cannot directly implement these features without ContentEditable
- Cannot reproduce all IME features with composition events alone
- Cannot integrate with OS-level IME UI
- User experience significantly degraded

**Conclusion**: **ContentEditable is essential** for IME input.

#### 5.2.2 Complex Implementation

- **All input handling**: Must directly handle all inputs: keyboard, mouse, IME, etc.
- **Cursor/Selection visualization**: Need to implement DOM position calculation and visual representation
- **Text layout**: Need layout information for accurate cursor position calculation

#### 5.2.3 Browser Compatibility

- **Text input**: Difficulty handling special character input in some browsers
- **Accessibility**: Need to verify compatibility with screen readers

#### 5.2.4 User Experience

- **Existing habits**: Users are familiar with ContentEditable
- **Copy/paste**: Need integration with Clipboard API
- **Drag and drop**: Need to implement additional features like file drop

### 5.3 Hybrid Approach: Use ContentEditable Only for IME

Considering IME limitations, a **hybrid approach** is most practical. However, there are **technical constraints**:

#### 5.3.0 Technical Constraints: Difficulty of Using ContentEditable Only for IME ⚠️

**Problems**:
1. **compositionstart is already too late**: When `compositionstart` event occurs, IME has already started. Moving focus at this point may already be too late.
2. **IME starts from focused element**: IME starts from currently focused element. IME may not work properly in non-ContentEditable elements.
3. **IME UI position**: IME candidate word selection UI is displayed near the focused ContentEditable element. If focus is on a hidden element, UI may be displayed in wrong location.

**Conclusion**: Handling IME only in a separate ContentEditable element is **technically difficult**.

#### 5.3.1 Practical Approach: Keep Main Area as ContentEditable but Block General Input

The most practical method is **keeping the main editing area itself as ContentEditable, but blocking general input with preventDefault and handling with model-direct editing**:

```typescript
class HybridEditor {
  private container: HTMLElement;
  private isComposing: boolean = false;
  
  setup(): void {
    // Main editing area: Activate ContentEditable (needed for IME)
    this.container.contentEditable = 'true';
    
    // Block general input with preventDefault and handle with model-direct editing
    this.setupModelDirectEditing();
    
    // IME input handled naturally in ContentEditable
    this.setupIMEHandling();
  }
  
  setupModelDirectEditing(): void {
    // Handle general keyboard input
    this.container.addEventListener('keydown', (e) => {
      // If IME composing, leave to ContentEditable
      if (this.isComposing) {
        return; // Let ContentEditable handle
      }
      
      // Block general input with preventDefault and handle with model-direct editing
      if (this.isNormalInput(e)) {
        e.preventDefault();
        this.handleKeydown(e);
      }
    });
    
    // Ignore input event (already handled with model-direct editing)
    this.container.addEventListener('input', (e) => {
      if (!this.isComposing) {
        e.preventDefault();
        // Already handled with model-direct editing, so ignore
      }
    });
  }
  
  setupIMEHandling(): void {
    // IME composition start: Let ContentEditable handle
    this.container.addEventListener('compositionstart', (e) => {
      this.isComposing = true;
      // ⚠️ Important: Must prevent DOM changes during IME composition
      this.pauseRendering = true; // Pause rendering
      // Let ContentEditable handle IME
    });
    
    // IME composition in progress: ContentEditable handles
    this.container.addEventListener('compositionupdate', (e) => {
      // ContentEditable displays text being composed
      // ⚠️ Important: Changing DOM at this point may break IME
      // Optionally reflect to model (but do not change DOM)
    });
    
    // IME composition complete: Synchronize completed text from ContentEditable to model
    this.container.addEventListener('compositionend', (e) => {
      this.isComposing = false;
      
      // Synchronize ContentEditable changes to model
      this.syncDOMToModel();
      
      // Resume rendering
      this.pauseRendering = false;
      
      // Initialize ContentEditable (re-render based on model)
      this.render();
    });
  }
  
  // Check if IME is composing when rendering
  render(): void {
    // ⚠️ Important: Do not render during IME composition
    if (this.isComposing || this.pauseRendering) {
      return; // Skip rendering to prevent IME from breaking
    }
    
    // Normal rendering
    // ...
  }
  
  isNormalInput(event: KeyboardEvent): boolean {
    // Check if it's general input, not IME
    const key = event.key;
    
    // Leave arrow keys, function keys, etc. to ContentEditable (optional)
    if (key.startsWith('Arrow') || key === 'Home' || key === 'End') {
      return false; // ContentEditable handles
    }
    
    // General character input
    if (key.length === 1 && !event.ctrlKey && !event.metaKey) {
      return true; // Model-direct editing
    }
    
    // Backspace, Delete, etc.
    if (key === 'Backspace' || key === 'Delete') {
      return true; // Model-direct editing
    }
    
    return false;
  }
  
  syncDOMToModel(): void {
    // Synchronize text entered via IME in ContentEditable to model
    const domText = this.container.textContent || '';
    const modelText = this.model.getText();
    
    if (domText !== modelText) {
      // Detect text changes and update model
      // (use MutationObserver or text-analyzer)
      this.applyTextChanges(domText, modelText);
    }
  }
}
```

**Advantages**:
- ✅ IME works naturally in ContentEditable
- ✅ General input handled with model-direct editing (optional)
- ✅ IME UI displayed in correct location

**Disadvantages**:
- ⚠️ Main area is ContentEditable, so some problems may still occur
- ⚠️ Need logic to distinguish general input and IME input
- ⚠️ Need DOM and model synchronization (when IME input occurs)

#### 5.3.2 Prevent DOM Changes During IME Composition ⚠️

**Core problem**: Changing DOM during IME input can break IME.

**Scenario**:
1. User is entering Hangul (IME composition in progress)
2. Model is updated elsewhere (e.g., collaborative editing, autocomplete, etc.)
3. Rendering occurs and DOM changes
4. **IME breaks** ❌

**Solution**:

```typescript
class HybridEditor {
  private isComposing: boolean = false;
  private pendingRenders: (() => void)[] = []; // Pending renders
  
  setupIMEHandling(): void {
    this.container.addEventListener('compositionstart', () => {
      this.isComposing = true;
      // Pause rendering during IME composition
    });
    
    this.container.addEventListener('compositionend', () => {
      this.isComposing = false;
      
      // Execute pending renders
      this.flushPendingRenders();
    });
  }
  
  render(): void {
    // ⚠️ Important: Do not render during IME composition
    if (this.isComposing) {
      // Add render to queue
      this.pendingRenders.push(() => {
        // Actual rendering logic
        this.doRender();
      });
      return;
    }
    
    // Normal rendering
    this.doRender();
  }
  
  flushPendingRenders(): void {
    // Execute pending renders after IME composition completes
    while (this.pendingRenders.length > 0) {
      const renderFn = this.pendingRenders.shift();
      renderFn?.();
    }
  }
}
```

**Notes**:
- **Must never change DOM during IME composition**
- Other components or events can also trigger rendering, so must check IME state in all rendering paths
- Model updates are possible, but DOM rendering only after IME composition completes

#### 5.3.3 Alternative: Always Use ContentEditable but Maximize Model-Direct Editing

Another approach is **always using ContentEditable, but handling general input with model-direct editing**:

```typescript
class HybridEditor {
  private container: HTMLElement;
  
  setup(): void {
    // Always activate ContentEditable (for IME)
    this.container.contentEditable = 'true';
    
    // Handle all input with model-direct editing
    this.container.addEventListener('keydown', (e) => {
      e.preventDefault(); // Prevent browser default behavior
      this.handleKeydown(e); // Model-direct editing
    });
    
    // Ignore input event
    this.container.addEventListener('input', (e) => {
      e.preventDefault();
    });
    
    // Let ContentEditable handle IME
    this.container.addEventListener('compositionstart', () => {
      // Disable model-direct editing during IME composition
      // ContentEditable handles IME
    });
    
    this.container.addEventListener('compositionend', (e) => {
      // Reflect IME-completed text to model
      const text = e.data;
      this.model.insertText(this.cursorOffset, text);
      this.cursorOffset += text.length;
      
      // Initialize ContentEditable and render based on model
      this.render();
    });
  }
}
```

This method is a hybrid approach that **handles all input with model-direct editing, but leaves only IME to ContentEditable**.

#### 5.3.4 Dynamic ContentEditable Switching (Alternative)

```typescript
class HybridEditor {
  private container: HTMLElement;
  private useContentEditable: boolean = false;
  
  setup(): void {
    // Default to model-direct editing mode
    this.container.contentEditable = 'false';
    this.setupModelDirectEditing();
    
    // Switch to ContentEditable when IME detected
    this.container.addEventListener('compositionstart', () => {
      this.switchToContentEditable();
    });
    
    this.container.addEventListener('compositionend', () => {
      this.switchToModelDirectEditing();
    });
  }
  
  switchToContentEditable(): void {
    if (this.useContentEditable) return;
    
    this.useContentEditable = true;
    this.container.contentEditable = 'true';
    
    // Reflect current model state to DOM
    this.syncModelToDOM();
    
    // Restore selection
    this.restoreSelection();
  }
  
  switchToModelDirectEditing(): void {
    if (!this.useContentEditable) return;
    
    // Synchronize DOM changes to model
    this.syncDOMToModel();
    
    this.useContentEditable = false;
    this.container.contentEditable = 'false';
    
    // Switch to model-direct editing mode
    this.setupModelDirectEditing();
  }
  
  syncDOMToModel(): void {
    // Synchronize changes from ContentEditable to model
    const domText = this.container.textContent || '';
    const modelText = this.model.getText();
    
    if (domText !== modelText) {
      // Detect text changes and update model
      this.applyTextChanges(domText, modelText);
    }
  }
  
  syncModelToDOM(): void {
    // Reflect model state to DOM
    this.render();
  }
}
```

#### 5.3.5 Hidden Element for IME Only (Not Recommended)

```typescript
class HybridEditor {
  private imeProxy: HTMLElement;
  
  setup(): void {
    // Main editing area: Model-direct editing
    this.container.contentEditable = 'false';
    
    // IME-only proxy element (completely hidden)
    this.imeProxy = document.createElement('div');
    this.imeProxy.contentEditable = 'true';
    this.imeProxy.style.cssText = `
      position: fixed;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(this.imeProxy);
    
    // Redirect to proxy on IME input
    this.setupIMERedirect();
  }
  
  setupIMERedirect(): void {
    // Detect IME start in main area
    this.container.addEventListener('compositionstart', (e) => {
      // Move focus to proxy element
      this.imeProxy.focus();
      
      // Handle IME in proxy
      this.imeProxy.addEventListener('compositionend', (e) => {
        const text = e.data;
        
        // Insert into model
        this.model.insertText(this.cursorOffset, text);
        this.cursorOffset += text.length;
        
        // Initialize proxy
        this.imeProxy.textContent = '';
        
        // Return focus to main area
        this.container.focus();
        
        // Render
        this.render();
      }, { once: true });
    });
  }
}
```

#### 5.3.6 Advantages and Disadvantages of Hybrid Approach

**Advantages**:
- ✅ Can utilize all IME features
- ✅ General input leverages advantages of model-direct editing
- ✅ Simplified Selection/Cursor management (complex only during IME input)

**Disadvantages**:
- ⚠️ Need logic to switch between two modes
- ⚠️ ContentEditable problems occur only during IME input
- ⚠️ **Prohibit DOM changes during IME composition**: Changing DOM during IME input can break IME
- ⚠️ Increased implementation complexity

**Conclusion**: 
- **Technical constraints**: Handling IME only in a separate ContentEditable element is difficult.
- **Practical solution**: Most practical approach is keeping main area as ContentEditable, but handling general input with model-direct editing and leaving only IME to ContentEditable.
- **Trade-off**: Sacrifice advantages of complete model-direct editing, but guarantee IME support.

---

## 6. IME Processing Strategy Comparison

### 6.1 Complete ContentEditable Removal (Impractical)

**Approach**: Completely remove ContentEditable and handle IME only with Composition events

**Problems**:
- ❌ Cannot integrate with OS-level IME UI
- ❌ Must directly implement visual display of text being composed
- ❌ Must directly implement candidate word selection UI
- ❌ Must directly implement automatic cursor position adjustment
- ❌ User experience significantly degraded

**Conclusion**: **Impractical** - Cannot be used for languages requiring IME support (Hangul, Japanese, Chinese, etc.)

### 6.2 Hybrid Approach (Recommended)

**Approach**: 
- Main area: Activate ContentEditable (needed for IME)
- General input: Block with preventDefault and handle with model-direct editing
- IME input: ContentEditable handles naturally

**Advantages**:
- ✅ Can utilize all IME features
- ✅ IME UI displayed in correct location
- ✅ General input leverages advantages of model-direct editing (optional)

**Disadvantages**:
- ⚠️ Main area is ContentEditable, so some problems may still occur
- ⚠️ Need logic to distinguish general input and IME input
- ⚠️ Need DOM and model synchronization (when IME input occurs)
- ⚠️ **Prohibit DOM changes during IME composition**: If model is updated elsewhere during IME input and rendering occurs, IME may break. Must check IME state in all rendering paths.
- ⚠️ Cannot fully utilize advantages of complete model-direct editing

**Conclusion**: **Recommended** - Most practical approach when IME support is needed. Sacrifice advantages of complete model-direct editing, but guarantee IME support.

### 6.3 Complete ContentEditable Usage (Existing Approach)

**Approach**: Handle all input with ContentEditable

**Advantages**:
- ✅ Perfect IME support
- ✅ Utilize browser native features

**Disadvantages**:
- ❌ Complex Selection/Cursor management
- ❌ Dual state management
- ❌ Synchronization problems

**Conclusion**: Existing approach - Accepts all problems of ContentEditable

---

## 7. ProseMirror's IME Processing Approach

ProseMirror is a ContentEditable-based editor actually in use. Let's examine how it handles DOM change problems during IME input.

### 7.1 ProseMirror's IME Protection Strategy

**Core principle**: **Do not change DOM while IME input is in progress**

ProseMirror uses the following strategies:

1. **Prohibit DOM changes during IME composition**
   - Detect IME composition start in `compositionstart` event
   - Do not change DOM around cursor during IME composition
   - Especially in Chrome browser, if DOM changes occur during IME input, problems like text duplication can occur

2. **Delay model updates**
   - Completely block model transactions during IME composition
   - Store changes in pending
   - Reflect composition-completed text to model in `compositionend` event

3. **Pause rendering**
   - Skip rendering during IME composition
   - Do not perform DOM rendering even if model is updated elsewhere

### 7.2 ProseMirror-Style Implementation Example

```typescript
class ProseMirrorStyleEditor {
  private isComposing: boolean = false;
  private pendingChanges: Array<{ textNodeId: string; oldText: string; newText: string }> = [];
  
  setupIMEHandling(): void {
    // IME composition start
    this.container.addEventListener('compositionstart', () => {
      this.isComposing = true;
      // Completely block DOM changes during IME composition
    });
    
    // Detect text changes in MutationObserver
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          this.handleTextContentChange(mutation);
        }
      }
    });
  }
  
  handleTextContentChange(mutation: MutationRecord): void {
    const oldText = mutation.oldValue || '';
    const newText = (mutation.target as Text).data;
    const textNodeId = this.resolveTextNodeId(mutation.target);
    
    // ⚠️ Important: Completely block model transactions during composition and leave to browser
    if (this.isComposing) {
      // Store composition changes in pending
      this.pendingChanges.push({
        textNodeId,
        oldText,
        newText
      });
      // Guard against missing composition end: commit after 400ms of no input
      if (this.pendingTimer) clearTimeout(this.pendingTimer);
      this.pendingTimer = setTimeout(() => {
        this.commitPendingChanges();
      }, 400);
      return; // Block model update
    }
    
    // Only update model when not composing
    this.applyTextChanges(textNodeId, oldText, newText);
  }
  
  // IME composition complete
  handleCompositionEnd(event: CompositionEvent): void {
    this.isComposing = false;
    
    // Reflect pending changes to model
    this.commitPendingChanges();
  }
  
  commitPendingChanges(): void {
    // Reflect all pending changes to model
    for (const change of this.pendingChanges) {
      this.applyTextChanges(change.textNodeId, change.oldText, change.newText);
    }
    this.pendingChanges = [];
  }
  
  // Check if IME is composing when rendering
  render(): void {
    // ⚠️ Important: Do not render during IME composition
    if (this.isComposing) {
      return; // ProseMirror uses same strategy
    }
    
    // Normal rendering
    // ...
  }
}
```

### 7.3 ProseMirror's Limitations

ProseMirror is also not perfect:

1. **Chrome Browser Problems**
   - In Chrome, if DOM changes occur during IME input, problems like text duplication can occur
   - ProseMirror completely blocks DOM changes during IME composition to prevent this

2. **Rendering Delay**
   - Does not render even if model is updated elsewhere during IME composition
   - All changes are reflected only after composition completes

3. **Selection Management Complexity**
   - Still uses ContentEditable, so Selection management is complex
   - Needs mechanisms like Text Node Pool

### 7.4 Implications

ProseMirror's approach is similar to the hybrid approach proposed in this paper:

- ✅ **Prohibit DOM changes during IME composition**: Same as this paper's proposal
- ✅ **Pause rendering**: Same as this paper's proposal
- ⚠️ **Still uses ContentEditable**: Not complete model-direct editing

**Differences**:
- ProseMirror: Handles all input with ContentEditable
- This paper's proposal: General input with model-direct editing, only IME with ContentEditable

---

## 8. Comparison with Existing Approaches

### 8.1 ContentEditable-based Editors

**Advantages**:
- Utilize browser native features
- Relatively simple implementation

**Disadvantages**:
- Complex Selection/Cursor management
- Dual state management
- Synchronization problems

### 8.2 Model-Direct Editing (Pure)

**Advantages**:
- Simple Selection/Cursor management
- Unidirectional data flow
- Complete control

**Disadvantages**:
- Need to directly implement all input handling
- Complex implementation

### 8.3 Hybrid Approach (Recommended)

**Advantages**:
- Use ContentEditable as needed
- Can migrate gradually

**Disadvantages**:
- Must support both approaches
- Increased complexity

---

## 9. Implementation Example

### 9.1 Basic Structure (Hybrid)

```typescript
class ModelDirectEditor {
  private model: Model;
  private cursorOffset: number = 0;
  private selection: ModelSelection | null = null;
  private container: HTMLElement;
  private renderer: DOMRenderer;
  
  constructor(container: HTMLElement) {
    this.container = container;
    this.model = new Model();
    this.renderer = new DOMRenderer(container);
    this.setup();
  }
  
  setup(): void {
    // Disable ContentEditable
    this.container.contentEditable = 'false';
    this.container.setAttribute('tabindex', '0');
    
    // Register event listeners
    this.container.addEventListener('keydown', (e) => this.handleKeydown(e));
    this.container.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.container.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.container.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.container.addEventListener('compositionstart', (e) => this.handleCompositionStart(e));
    this.container.addEventListener('compositionupdate', (e) => this.handleCompositionUpdate(e));
    this.container.addEventListener('compositionend', (e) => this.handleCompositionEnd(e));
    
    // Setup cursor and Selection visualization
    this.setupVisualization();
  }
  
  // Render after model change
  render(): void {
    this.renderer.render(this.model);
    this.updateCursor();
    this.renderSelection();
  }
}
```

### 9.2 Usage Example

```typescript
// Create editor
const editor = new ModelDirectEditor(document.getElementById('editor'));

// Directly change model (like AI)
editor.model.insertText(0, 'Hello');
editor.model.insertText(5, ' World');
editor.model.applyMark(0, 11, 'bold');

// User input (keyboard)
// When user presses 'a' key
// → Direct model change in handleKeydown
// → Call render()
// → Update cursor position

// Selection management
editor.setSelection(0, 5); // Select "Hello"
editor.setCursorOffset(11); // Move cursor to end
```

---

## 10. Alternative Paradigm: Graphic Editor Style Document Composition

### 10.1 New Perspective: Document Editing vs Document Composition

Existing ContentEditable-based editors take a **document editing** perspective:
- Users directly input and modify text
- Browser directly changes DOM through ContentEditable
- Complexity of Selection/Cursor management

However, there is also a perspective of **composing documents like graphic editors (Figma, Sketch, etc.)**:
- Left: Tree structure (document structure)
- Right: Properties panel (properties of selected element)
- Center: Large board in billboard form that can edit multiple documents

This approach can **completely bypass** ContentEditable's problems.

### 10.2 Graphic Editor-Style Document Editor

```typescript
interface DocumentEditorLayout {
  leftPanel: DocumentTree;      // Document structure tree
  centerPanel: Canvas;          // Billboard-style editing area
  rightPanel: PropertyPanel;    // Properties of selected element
}

class GraphicStyleDocumentEditor {
  private layout: DocumentEditorLayout;
  private model: DocumentModel;
  
  setup(): void {
    // Left: Document structure tree
    this.layout.leftPanel = new DocumentTree({
      model: this.model,
      onSelect: (nodeId) => this.selectNode(nodeId)
    });
    
    // Center: Billboard-style editing area
    this.layout.centerPanel = new Canvas({
      model: this.model,
      onSelect: (nodeId) => this.selectNode(nodeId),
      onDrag: (nodeId, position) => this.moveNode(nodeId, position)
    });
    
    // Right: Properties panel
    this.layout.rightPanel = new PropertyPanel({
      selectedNode: this.selectedNode,
      onUpdate: (properties) => this.updateNodeProperties(properties)
    });
  }
  
  selectNode(nodeId: string): void {
    this.selectedNode = this.model.getNode(nodeId);
    this.layout.rightPanel.update(this.selectedNode);
    this.layout.centerPanel.highlight(nodeId);
  }
  
  updateNodeProperties(properties: Record<string, any>): void {
    // Direct model change (no ContentEditable)
    this.model.updateNode(this.selectedNode.id, properties);
    this.layout.centerPanel.render();
  }
}
```

### 10.3 Billboard-Style Editing Area

```typescript
class Canvas {
  private container: HTMLElement;
  private model: DocumentModel;
  private zoom: number = 1.0;
  private pan: { x: number; y: number } = { x: 0, y: 0 };
  
  setup(): void {
    // No ContentEditable
    this.container.contentEditable = 'false';
    
    // Large editing area in billboard form
    this.container.style.cssText = `
      width: 100%;
      height: 100%;
      overflow: auto;
      position: relative;
      background: #f5f5f5;
    `;
    
    // Enable multi-document editing
    this.setupMultiDocumentEditing();
  }
  
  render(): void {
    // Model-based rendering (unidirectional data flow)
    const documents = this.model.getDocuments();
    
    for (const doc of documents) {
      const docElement = this.renderDocument(doc);
      docElement.style.position = 'absolute';
      docElement.style.left = `${doc.position.x}px`;
      docElement.style.top = `${doc.position.y}px`;
      this.container.appendChild(docElement);
    }
  }
  
  renderDocument(doc: Document): HTMLElement {
    // Render document (no ContentEditable)
    const docElement = document.createElement('div');
    docElement.className = 'document';
    docElement.style.cssText = `
      width: ${doc.width}px;
      min-height: ${doc.height}px;
      background: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      padding: 40px;
    `;
    
    // Render document content
    const content = this.renderContent(doc.content);
    docElement.appendChild(content);
    
    return docElement;
  }
  
  renderContent(content: ContentNode[]): HTMLElement {
    const contentElement = document.createElement('div');
    
    for (const node of content) {
      if (node.type === 'text') {
        // Text node: Render without ContentEditable
        const textElement = this.renderTextNode(node);
        contentElement.appendChild(textElement);
      } else if (node.type === 'heading') {
        // Heading node
        const headingElement = this.renderHeading(node);
        contentElement.appendChild(headingElement);
      }
      // ...
    }
    
    return contentElement;
  }
  
  renderTextNode(node: TextNode): HTMLElement {
    const textElement = document.createElement('div');
    textElement.textContent = node.text;
    textElement.setAttribute('data-node-id', node.id);
    
    // Select on click
    textElement.addEventListener('click', () => {
      this.selectNode(node.id);
    });
    
    // Enter edit mode on double click
    textElement.addEventListener('dblclick', () => {
      this.enterEditMode(node.id);
    });
    
    return textElement;
  }
  
  enterEditMode(nodeId: string): void {
    // Edit mode: Show inline editor
    const node = this.model.getNode(nodeId);
    const editor = new InlineEditor({
      node,
      onSave: (text) => {
        // Direct model change
        this.model.updateNode(nodeId, { text });
        this.render();
      }
    });
    
    editor.show();
  }
}
```

### 10.4 Inline Editor (Optional ContentEditable)

```typescript
class InlineEditor {
  private node: TextNode;
  private editor: HTMLElement;
  
  show(): void {
    // Use ContentEditable only in edit mode
    this.editor = document.createElement('div');
    this.editor.contentEditable = 'true';
    this.editor.textContent = this.node.text;
    
    // Update model on edit completion
    this.editor.addEventListener('blur', () => {
      const newText = this.editor.textContent || '';
      this.onSave(newText);
      this.hide();
    });
    
    // Cancel with ESC key
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.hide();
      }
    });
    
    // Display at node position
    const nodeElement = document.querySelector(`[data-node-id="${this.node.id}"]`);
    nodeElement?.replaceWith(this.editor);
    this.editor.focus();
  }
  
  hide(): void {
    // Exit edit mode
    this.editor.remove();
  }
}
```

### 10.5 Advantages

1. **Completely Bypass ContentEditable Problems**
   - Do not use ContentEditable during general editing
   - Use selectively only in inline edit mode
   - Eliminate Selection/Cursor management complexity

2. **Document Structure Visualization**
   - Clearly display document structure as tree structure
   - Easy to understand hierarchical structure

3. **Multi-Document Editing**
   - Can edit multiple documents simultaneously
   - Freely arrange in billboard form

4. **Property-Based Editing**
   - Clearly display properties of selected element
   - Property changes handled as direct model changes

5. **Easy Integration with AI**
   - AI can directly change model
   - Humans can also change model through properties panel

### 10.6 Disadvantages

1. **Difference from Existing Habits**
   - Users are familiar with existing editors
   - Learning curve exists

2. **Inconvenience of Text Input**
   - Need to enter edit mode by double-clicking
   - Continuous text input may be inconvenient

3. **Complex Implementation**
   - Need multiple components: tree, canvas, properties panel, etc.
   - Layout management complex

### 10.7 Hybrid Approach

Can combine general text editing and graphic editor style:

```typescript
class HybridDocumentEditor {
  private mode: 'text' | 'graphic' = 'text';
  
  setMode(mode: 'text' | 'graphic'): void {
    this.mode = mode;
    
    if (mode === 'text') {
      // General text editing mode
      this.showTextEditor();
    } else {
      // Graphic editor style mode
      this.showGraphicEditor();
    }
  }
  
  showTextEditor(): void {
    // ContentEditable-based text editor
    // (Hybrid approach: general input with model-direct editing, only IME with ContentEditable)
  }
  
  showGraphicEditor(): void {
    // Graphic editor style editor
    // (Almost no ContentEditable usage)
  }
}
```

### 10.8 Implications

Graphic editor style approach:
- ✅ Completely bypasses ContentEditable problems
- ✅ Visually represents document structure
- ✅ Unifies AI and human editing approaches
- ⚠️ Difference from existing user habits
- ⚠️ Inconvenience of continuous text input

**Conclusion**: By shifting perspective from "editing" documents to "composing" them, we can fundamentally solve ContentEditable's problems. Particularly useful when dealing with complex document structures or when multi-document editing is needed.

---

## 11. Future Work

### 11.1 Complete Implementation

- Support all keyboard shortcuts
- Complete copy/paste implementation
- Drag and drop support
- Complete accessibility support

### 11.2 Performance Optimization

- Virtual scrolling
- Rendering optimization
- Memory management

### 11.3 User Experience Improvement

- Cursor animation
- Improved Selection visualization
- Improved IME input experience

---

## 12. Conclusion

This paper analyzed the fundamental limitations of ContentEditable-based rich text editors and proposed the **Model-Direct Editing Paradigm**.

**Core Finding**: When IME (Input Method Editor) support is needed, completely removing ContentEditable is **impractical**. IME is a complex system requiring cooperation between OS level and browser, and directly implementing it is nearly impossible.

**Proposed Solution**: Propose a **hybrid approach**:
- **General input**: Model-direct editing without ContentEditable (simplified Selection/Cursor management)
- **IME input**: Use ContentEditable (IME-only element or dynamic switching)

This approach can support all IME features while leveraging advantages of general input.

**Core Contributions**:
1. **Analysis of ContentEditable's fundamental problems**: Complexity of Selection/Cursor handling and dual state management problems
2. **Clarification of IME limitations**: Analysis that completely implementing IME without ContentEditable is impractical
3. **Hybrid paradigm proposal**: Model-direct editing for general input, ContentEditable only for IME input
4. **Implementation strategy presentation**: Methods for IME-only element or dynamic ContentEditable switching
5. **ProseMirror comparative analysis**: Analysis of IME processing approach of actually used editor
6. **Graphic editor style alternative proposal**: Shift perspective from "editing" documents to "composing" them

**Final Proposal**:
- **Short-term**: Hybrid approach (model-direct editing for general input, ContentEditable only for IME)
- **Long-term**: Graphic editor style document composer (almost no ContentEditable usage)

These approaches present practical solutions that can minimize or completely bypass ContentEditable's limitations.

---

## References

1. W3C. "ContentEditable". https://html.spec.whatwg.org/multipage/interaction.html#contenteditable
2. MDN. "Selection API". https://developer.mozilla.org/en-US/docs/Web/API/Selection
3. ProseMirror. "Document Model". https://prosemirror.net/docs/guide/#document
4. Slate.js. "Architecture". https://docs.slatejs.org/concepts/architecture
5. Draft.js. "Overview". https://draftjs.org/docs/overview

