# Editing Operations Document

## Overview

This document lists all editing operations that need to be handled in a contenteditable-based editor and organizes processing strategies and model update methods for each operation.

## Editing Operation Categories

### 1. Text Input

#### 1.1 General Text Input
- **Event**: `input` (InputEvent)
- **MutationObserver**: Detects `characterData` changes
- **Current Processing Method**:
  - MutationObserver detects DOM changes
  - `handleTextContentChange` calls `handleEfficientEdit`
  - Compare model text and DOM text to update only differences
  - Automatically adjust Marks/Decorators ranges
- **Model Update Strategy**:
  - Update text with `dataStore.updateNode`
  - Adjust Marks ranges with `dataStore.marks.setMarks`
  - Emit `editor:content.change` event

#### 1.2 IME Input (Korean, Japanese, etc.)
- **Event**: `compositionstart`, `compositionupdate`, `compositionend`
- **MutationObserver**: Detects DOM changes even during composition
- **Current Processing Method**:
  - Track composition state with `isComposing` flag
  - Store changes during composition in `pendingTextNodeId`
  - Call `commitPendingImmediate` with 100ms debouncing
  - Immediately commit on `compositionend`
- **Model Update Strategy**:
  - Real-time model updates even during composition (with debouncing)
  - Reconstruct text directly from DOM and compare with model
  - Use same update logic as general text input

### 2. Deletion

#### 2.1 Backspace
- **Event**: `keydown` (key === 'Backspace')
- **Current Processing Method**:
  - Allow browser default behavior
  - MutationObserver detects DOM changes
  - Process same as general text input
- **Model Update Strategy**:
  - Call `handleTextContentChange` after MutationObserver detects changes
  - Analyze text differences to remove only deleted parts from model
  - Automatically adjust Marks ranges

#### 2.2 Delete
- **Event**: `keydown` (key === 'Delete')
- **Current Processing Method**:
  - Allow browser default behavior
  - MutationObserver detects DOM changes
  - Process same as Backspace
- **Model Update Strategy**:
  - Same as Backspace

#### 2.3 Selection Deletion
- **Event**: `keydown` (Backspace/Delete + selection)
- **Current Processing Method**:
  - Browser deletes selected area
  - MutationObserver detects DOM changes
- **Model Update Strategy**:
  - Calculate deleted text range
  - Update each node if spanning multiple nodes
  - Adjust Marks ranges

### 3. Line Break

#### 3.1 Enter Key
- **Event**: `keydown` (key === 'Enter')
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Create new paragraph node
  - Split current paragraph at cursor position
  - Move cursor to new paragraph
- **Model Update Strategy**:
  - Insert new paragraph with `dataStore.insertNode`
  - Split current paragraph text and assign to new paragraph
  - Emit `editor:content.change` event

#### 3.2 Shift+Enter (soft break)
- **Event**: `keydown` (key === 'Enter' + shiftKey)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Insert `<br>` tag or create line-break node
- **Model Update Strategy**:
  - Insert line-break marker within inline-text node
  - Or create separate line-break node

### 4. Copy/Paste

#### 4.1 Copy
- **Event**: `copy` (ClipboardEvent)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Extract selected area from model
  - Save to clipboard in HTML/text format
  - Include custom data format (marks, decorators, etc.)
- **Model Update Strategy**:
  - Serialize selected nodes from model
  - Convert to HTML format
  - Save with clipboard API

#### 4.2 Paste
- **Event**: `paste` (ClipboardEvent)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Parse clipboard data (HTML/text)
  - Convert to model format
  - Insert at cursor position
  - Apply Marks/Decorators
- **Model Update Strategy**:
  - Parse HTML to create model node tree
  - Insert nodes with `dataStore.insertNode`
  - Preserve existing Marks or apply new Marks
  - Emit `editor:content.change` event

#### 4.3 Cut
- **Event**: `cut` (ClipboardEvent)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Combine copy + delete
  - Save selected area to clipboard
  - Delete selected area
- **Model Update Strategy**:
  - Execute copy logic
  - Execute delete logic

### 5. Selection

#### 5.1 Mouse Drag Selection
- **Event**: `mousedown`, `mousemove`, `mouseup`
- **Current Processing Method**:
  - Use browser default behavior
  - Detect selection changes with `selectionchange` event
  - Convert to model selection in `DOMSelectionHandler`
- **Model Update Strategy**:
  - Convert DOM Selection to model coordinates
  - Call `editor.updateSelection`
  - Emit `editor:selection.change` event

#### 5.2 Keyboard Selection (Shift+Arrow, Shift+Home/End, etc.)
- **Event**: `keydown` (Shift + Arrow/Home/End/PageUp/PageDown)
- **Current Processing Method**:
  - Use browser default behavior
  - Detect selection changes with `selectionchange` event
- **Model Update Strategy**:
  - Same as mouse drag selection

#### 5.3 Select All
- **Event**: `keydown` (Ctrl/Cmd+A)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Select entire document
  - Emit `editor:selection.change` event
- **Model Update Strategy**:
  - Select start and end of root node
  - Call `editor.updateSelection`

### 6. Formatting

#### 6.1 Bold
- **Event**: `keydown` (Ctrl/Cmd+B) or toolbar button
- **Current Processing Method**:
  - Process with `editor:command.execute` event
  - Add/remove Bold mark
- **Model Update Strategy**:
  - Add `bold` mark to selected text range
  - Call `dataStore.marks.setMarks`
  - Emit `editor:content.change` event

#### 6.2 Italic
- **Event**: `keydown` (Ctrl/Cmd+I) or toolbar button
- **Current Processing Method**: Same as Bold
- **Model Update Strategy**: Same as Bold

#### 6.3 Underline
- **Event**: `keydown` (Ctrl/Cmd+U) or toolbar button
- **Current Processing Method**: Not implemented
- **Model Update Strategy**: Same as Bold

#### 6.4 Other Formatting
- StrikeThrough, Superscript, Subscript, etc.
- **Model Update Strategy**: All handled as Marks

### 7. Structural Changes

#### 7.1 Heading Conversion
- **Event**: `keydown` (Ctrl/Cmd+Alt+1/2/3) or toolbar
- **Current Processing Method**:
  - Process with `editor:command.execute` event
  - Convert paragraph to heading
- **Model Update Strategy**:
  - Change current node's `stype`
  - Update node type with `dataStore.updateNode`
  - Emit `editor:content.change` event

#### 7.2 List
- **Event**: `keydown` or toolbar
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Convert paragraph to list-item
  - Create list node and add list-item
- **Model Update Strategy**:
  - Change node type
  - Reconstruct parent-child relationships
  - Emit `editor:content.change` event

#### 7.3 Blockquote
- **Event**: Toolbar
- **Current Processing Method**: Not implemented
- **Model Update Strategy**: Same as Heading

### 8. Undo/Redo

#### 8.1 Undo
- **Event**: `keydown` (Ctrl/Cmd+Z)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Restore previous state from history stack
  - Revert entire model to previous state
- **Model Update Strategy**:
  - History management system needed
  - Save snapshot for each editing operation
  - Restore snapshot on Undo
  - Emit `editor:content.change` event

#### 8.2 Redo
- **Event**: `keydown` (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)
- **Current Processing Method**: Not implemented
- **Model Update Strategy**: Same as Undo (opposite direction)

### 9. Drag and Drop

#### 9.1 Text Drag
- **Event**: `dragstart`, `drag`, `dragend`, `drop`
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Save selected text when drag starts
  - Insert text at drop position
  - Delete text from original position
- **Model Update Strategy**:
  - Drag start: Extract selected nodes
  - Drop: Insert nodes at new position
  - Delete nodes from original position
  - Emit `editor:content.change` event

#### 9.2 External File Drop
- **Event**: `drop` (file)
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Check file type (image, text, etc.)
  - Image: Create image node
  - Text: Convert to text node
- **Model Update Strategy**:
  - Create appropriate node based on file type
  - Call `dataStore.insertNode`
  - Emit `editor:content.change` event

### 10. Other Editing Operations

#### 10.1 Tab
- **Event**: `keydown` (key === 'Tab')
- **Current Processing Method**: Not implemented
- **Required Processing**:
  - Indent/outdent in list
  - Or insert tab character in general text
- **Model Update Strategy**:
  - List context: Change list-item level
  - General text: Insert tab character

#### 10.2 Home/End
- **Event**: `keydown` (key === 'Home'/'End')
- **Current Processing Method**: Browser default behavior
- **Required Processing**:
  - Move cursor to start/end of line
  - Update model selection

#### 10.3 PageUp/PageDown
- **Event**: `keydown` (key === 'PageUp'/'PageDown')
- **Current Processing Method**: Browser default behavior
- **Required Processing**:
  - Page-level scroll and cursor movement
  - Update model selection

## Model Update Strategy

### Common Principles

1. **DOM-First**: 
   - All editing operations are reflected in DOM first
   - MutationObserver detects DOM changes
   - Synchronize DOM changes to model

2. **Efficient Updates**:
   - Do not reconstruct entire model
   - Update only changed parts
   - Use `handleEfficientEdit` to calculate only text differences

3. **Automatic Marks Range Adjustment**:
   - Automatically adjust Marks ranges on text insert/delete
   - Preserve Marks at cursor position

4. **Event-Based**:
   - All model changes emit `editor:content.change` event
   - Rendering handled in event listeners

### Update Patterns

#### Pattern 1: Text Changes (Input, Deletion)
```typescript
1. MutationObserver detects
2. Call handleTextContentChange
3. Calculate text differences with handleEfficientEdit
4. Update text with dataStore.updateNode
5. Adjust Marks ranges with dataStore.marks.setMarks
6. Emit editor:content.change event
```

#### Pattern 2: Structural Changes (Enter, Formatting)
```typescript
1. Process keydown event
2. Emit editor:command.execute event
3. Change model in Command Handler
4. Call dataStore.insertNode/updateNode/deleteNode
5. Emit editor:content.change event
```

#### Pattern 3: Copy/Paste
```typescript
1. Process paste event
2. Parse clipboard data
3. Create model node tree
4. Insert with dataStore.insertNode
5. Emit editor:content.change event
```

## Implementation Priority

### Phase 1: Basic Editing (Complete)
- ✅ Text input (general, IME)
- ✅ Backspace/Delete
- ✅ Selection (mouse, keyboard)

### Phase 2: Essential Editing (In Progress)
- ✅ Ensure model updates during IME composition (removed composing check)
- ⬜ Enter (line break)
- ⬜ Copy/paste
- ⬜ Formatting (Bold, Italic, etc.)

### Phase 3: Advanced Editing
- ⬜ Undo/Redo
- ⬜ Drag and drop
- ⬜ Structural changes (list, Blockquote, etc.)

### Phase 4: Optimization
- ⬜ History management optimization
- ⬜ Large document handling
- ⬜ Performance optimization

## Notes

- All editing operations are processed **asynchronously**
- MutationObserver can be optimized with **batch processing**
- Model updates are processed **transaction-based** (future implementation)
- Rendering is optimized with **diff algorithm**

