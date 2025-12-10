# Selection System Specification

## Overview

The Selection system is a core feature in Barocss Editor that allows selecting and manipulating specific parts of a document. This document covers Selection management at the Model level and bidirectional conversion between DOM ↔ Model.

### Key Principles

- **Model-centric**: Selection state is managed at the Model level
- **DOM Separation**: DOM manipulation is handled in editor-view-dom
- **Bidirectional Conversion**: Automatic conversion between DOM Selection ↔ Model Selection
- **Text Run Index**: Accurate position mapping in nested mark structures
- **Safe Validation**: Safely handle elements that exist in DOM but not in Model

## Core Concepts

### 1. Model Selection Structure

```typescript
// Selection representation at Model level
interface ModelSelection {
  anchorId: string;      // Selection start point node ID
  anchorOffset: number;  // Selection start point offset
  focusId: string;       // Selection end point node ID  
  focusOffset: number;   // Selection end point offset
}

// SelectionManager Basic API
class SelectionManager {
  getCurrentSelection(): ModelSelection | null;
  setSelection(selection: ModelSelection | null): void;
  clearSelection(): void;
  isEmpty(): boolean;
  isInNode(nodeId: string): boolean;
  isAtPosition(nodeId: string, position: number): boolean;
  isInRange(nodeId: string, start: number, end: number): boolean;
  overlapsWith(nodeId: string, start: number, end: number): boolean;
}
```


### 2. DOM ↔ Model Conversion System

#### 2.1 DOMSelectionHandler

```typescript
interface DOMSelectionHandler {
  handleSelectionChange(): void;
  convertDOMSelectionToModel(selection: Selection): any;
  convertModelSelectionToDOM(modelSelection: any): void;
}

// DOM Selection → Model Selection conversion
convertDOMSelectionToModel(selection: Selection): ModelSelection {
  // 1. Find element with data-bc-sid attribute
  // 2. Calculate accurate offset using Text Run Index  
  // 3. Verify node exists in Model
  // 4. Create Model Selection object
}

// Model Selection → DOM Selection conversion
convertModelSelectionToDOM(modelSelection: ModelSelection): void {
  // 1. Identify text container (data-text-container="true")
  // 2. Find DOM Text node using Text Run Index
  // 3. Map accurate offset using Binary Search
  // 4. Create DOM Range and apply selection
}
```

#### 2.2 Text Run Index System

A system for accurate DOM ↔ Model position mapping in nested mark structures.

```typescript
interface TextRun {
  domTextNode: Text;        // DOM Text node
  start: number;            // Start offset
  end: number;              // End offset (exclusive)
}

interface ContainerRuns {
  runs: TextRun[];          // Text Run array
  total: number;            // Total text length
  byNode?: Map<Text, { start: number; end: number }>; // O(1) reverse mapping
}

// Create Text Run Index
function buildTextRunIndex(container: Element): ContainerRuns {
  // 1. Traverse all Text nodes in container
  // 2. Calculate offset by accumulating each Text node's length
  // 3. Support O(1) reverse mapping with byNode Map
}

// Efficient offset conversion using Binary Search
function binarySearchRun(runs: TextRun[], targetOffset: number): number {
  // Find appropriate Text Run with O(log n) time complexity
}
```

#### 2.3 Model Validation and Safety

```typescript
// Check if node actually exists in Model
private nodeExistsInModel(nodeId: string): boolean {
  try {
    if (this.editor.dataStore) {
      const node = this.editor.dataStore.getNode(nodeId);
      return node !== null && node !== undefined;
    }
    return true; // Default value when dataStore doesn't exist
  } catch (error) {
    console.warn('[SelectionHandler] Error checking node existence:', error);
    return false;
  }
}

// Handle elements that exist in DOM but not in Model
if (!this.nodeExistsInModel(startNodeId) || !this.nodeExistsInModel(endNodeId)) {
  console.warn('[SelectionHandler] Node does not exist in model:', {
    startNodeId,
    endNodeId,
    startExists: this.nodeExistsInModel(startNodeId),
    endExists: this.nodeExistsInModel(endNodeId)
  });
  return { type: 'none' }; // Safely clear selection
}
```

#### 2.4 Selection Direction Detection

```typescript
// Determine Selection direction (forward/backward)
private determineSelectionDirection(
  selection: Selection, 
  startNode: Element, 
  endNode: Element, 
  startOffset: number, 
  endOffset: number
): 'forward' | 'backward' {
  // Selection within same node
  if (startNode === endNode) {
    return startOffset <= endOffset ? 'forward' : 'backward';
  }
  
  // Cross-node selection: Determine direction based on anchor/focus nodes
  const anchorNode = this.findBestContainer(selection.anchorNode);
  const focusNode = this.findBestContainer(selection.focusNode);
  
  if (anchorNode === startNode && focusNode === endNode) {
    return 'forward';
  } else if (anchorNode === endNode && focusNode === startNode) {
    return 'backward';
  }
  
  // Fallback: Compare DOM document position
  return startNode.compareDocumentPosition(endNode) & Node.DOCUMENT_POSITION_FOLLOWING 
    ? 'forward' : 'backward';
}
```

### 3. PositionBasedSelectionManager (Advanced Features)

An advanced system used when complex Position-based Selection management is needed.

```typescript
// Position-based Selection type
interface PositionBasedSelection {
  id: string;
  type: 'text' | 'node' | 'cross-node' | 'multi-node' | 'document';
  startPosition: Position;
  endPosition?: Position;
  nodeSelections: NodeSelection[];
  documentId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

interface Position {
  id: string;
  absolute: number;           // Absolute position
  nodeOffset: number;         // Offset within node
  nodeId: string;             // Node ID
  path: string[];             // Path
  parentId?: string;          // Parent node ID
  siblingIndex?: number;      // Sibling node index
  documentVersion: number;    // Document version
  lastUpdated: Date;          // Last update
  isInvalidated: boolean;     // Invalidation status
  invalidationReason?: string; // Invalidation reason
  isValid: boolean;           // Validity
  type: 'text' | 'anchor' | 'focus'; // Type
  timestamp: Date;            // Creation time
  metadata?: Record<string, any>; // Metadata
  references: {               // Reference tracking
    highlights: string[];
    decorations: string[];
    selections: string[];
  };
}

// Integrated Selection API
class PositionBasedSelectionManager {
  // Integrated text selection (automatic detection of single node or Cross Node)
  selectRange(
    startNodeId: string, 
    startOffset: number, 
    endNodeId: string, 
    endOffset: number
  ): string {
    // Automatically detect if same node and create appropriate Selection type
  }

  // Convenience methods
  selectTextRange(nodeId: string, startOffset: number, endOffset: number): string;
  selectCrossNode(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string;
  selectAbsoluteRange(startOffset: number, endOffset: number): string;
  selectNode(nodeId: string): string;

  // Selection management
  getCurrentSelection(): PositionBasedSelection | null;
  getSelectedText(): string;
  getSelectedNodes(): INode[];
  clearSelection(): void;
  validateSelection(): boolean;

  // History management
  getSelectionHistory(): PositionBasedSelection[];
  undoSelection(): boolean;
  restoreSelection(selection: PositionBasedSelection): void;
}
```

### 4. Usage Examples

#### 4.1 Basic Selection Usage

```typescript
// 1. Basic SelectionManager usage
const selectionManager = new SelectionManager({ dataStore });

// Set Selection
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1', 
  focusOffset: 5
});

// Check Selection state
const currentSelection = selectionManager.getCurrentSelection();
console.log(currentSelection); // { anchorId: 'text-1', anchorOffset: 0, focusId: 'text-1', focusOffset: 5 }

// Check if Selection is in specific node
const isInNode = selectionManager.isInNode('text-1'); // true

// Check if Selection is at specific position (collapsed)
const isAtPosition = selectionManager.isAtPosition('text-1', 3); // false

// Check if Selection is in specific range
const isInRange = selectionManager.isInRange('text-1', 0, 10); // true
```

#### 4.2 DOM ↔ Model Conversion Usage

```typescript
// 1. DOM Selection → Model Selection conversion
const domSelection = window.getSelection();
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);

console.log(modelSelection);
// {
//   type: 'range',
//   startNodeId: 'text-1',
//   startOffset: 0,
//   endNodeId: 'text-1', 
//   endOffset: 5,
//   direction: 'forward'
// }

// 2. Model Selection → DOM Selection conversion
const modelSelection = {
  type: 'text',
  anchor: { nodeId: 'text-1', offset: 0 },
  focus: { nodeId: 'text-1', offset: 5 }
};

selectionHandler.convertModelSelectionToDOM(modelSelection);
// The range is selected in DOM
```

#### 4.3 PositionCalculator Usage

```typescript
// 1. Use position conversion utility
const calculator = new PositionCalculator(dataStore);

// Convert nodeId + offset to absolute position
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);

// Convert absolute position to nodeId + offset
const nodePos = calculator.findNodeByAbsolutePosition(absolutePos);

// Calculate node path
const path = calculator.getNodePath('text-1'); // ['doc-1', 'para-1', 'text-1']

// Query parent ID and sibling order
const parentId = calculator.getParentId('text-1');
const siblingIndex = calculator.getSiblingIndex('text-1');

// Calculate distance between nodes
const distance = calculator.calculateDistance('text-1', 'text-2');
```

## 2. SelectionManager Usage Guide

### 2.1 When to Use Which SelectionManager?

#### **Basic SelectionManager (editor-core)**
- **When to use**: When basic Selection management is needed in Editor class
- **Characteristics**: Simple `ModelSelection` interface (anchorId, anchorOffset, focusId, focusOffset)
- **Use cases**: 
  - Pure Model-level Selection management separated from DOM
  - Basic selection state checking and setting
  - Editor's basic Selection functionality

```typescript
// Use basic SelectionManager in Editor
const editor = new Editor({ dataStore });
const selection = editor.selectionManager.getCurrentSelection();

// Check basic Selection state
if (selection) {
  console.log(`Selected range: ${selection.anchorId}:${selection.anchorOffset} ~ ${selection.focusId}:${selection.focusOffset}`);
}
```

#### **PositionCalculator (model)**
- **When to use**: When position conversion is needed
- **Characteristics**: Conversion utility between absolute position and nodeId + offset
- **Use cases**:
  - DOM ↔ Model position conversion
  - Node path calculation
  - Parent-child relationship lookup
  - Distance calculation between nodes

```typescript
// When position conversion is needed
const calculator = new PositionCalculator(dataStore);

// Convert absolute position received from DOM to Model coordinates
const domAbsolutePosition = 15;
const modelPosition = calculator.findNodeByAbsolutePosition(domAbsolutePosition);

// Convert Model coordinates to DOM absolute position
const backToDomPosition = calculator.calculateAbsolutePosition(
  modelPosition.nodeId, 
  modelPosition.offset
);

// Query node structure information
const path = calculator.getNodePath('text-1');
const parentId = calculator.getParentId('text-1');
```

### 2.2 Absolute Coordinates vs Model Selection Conversion Scenarios

#### **When to Use Absolute Coordinates?**

1. **When ProseMirror-style API is needed**
   ```typescript
   // Selection based on absolute position (similar to ProseMirror)
   const selection = positionManager.selectAbsoluteRange(10, 20);
   ```

2. **When Cross-node Selection is needed**
   ```typescript
   // Selection spanning multiple nodes
   const selection = positionManager.selectRange('text-1', 5, 'text-2', 3);
   ```

3. **When Selection history is needed**
   ```typescript
   // Selection history management
   const history = positionManager.getSelectionHistory();
   const undone = positionManager.undoSelection();
   ```

4. **When complex Position tracking is needed**
   ```typescript
   // Track dynamic changes with Position object
   const selection = positionManager.getCurrentSelection();
   console.log(selection.startPosition.absolute); // Absolute position
   console.log(selection.startPosition.path);     // Node path
   ```

#### **When to Use Model Selection?**

1. **Basic selection state management**
   ```typescript
   // Simple selection state checking
   const selection = selectionManager.getCurrentSelection();
   if (selection) {
     console.log(`Selected node: ${selection.anchorId}`);
   }
   ```

2. **Basic integration with DOM**
   ```typescript
   // Conversion between DOM Selection and Model Selection
   const domSelection = window.getSelection();
   const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
   ```

3. **Editor's basic functionality**
   ```typescript
   // Editor's basic Selection functionality
   editor.selectionManager.setSelection({
     anchorId: 'text-1',
     anchorOffset: 0,
     focusId: 'text-1',
     focusOffset: 5
   });
   ```

### 2.3 Absolute Coordinates ↔ Model Selection Conversion Scenarios

#### **Absolute Coordinates → Model Selection Conversion**

```typescript
// 1. Convert absolute position to nodeId + offset
const positionCalculator = new PositionCalculator(dataStore);
const nodePos = positionCalculator.findNodeByAbsolutePosition(10);

// 2. Convert to Model Selection
const modelSelection: ModelSelection = {
  anchorId: nodePos.nodeId,
  anchorOffset: nodePos.offset,
  focusId: nodePos.nodeId,
  focusOffset: nodePos.offset + 5
};

// 3. Set in SelectionManager
selectionManager.setSelection(modelSelection);
```

#### **Model Selection → Absolute Coordinates Conversion**

```typescript
// 1. Extract nodeId + offset from Model Selection
const selection = selectionManager.getCurrentSelection();
if (selection) {
  // 2. Convert to absolute position
  const anchorAbsolute = positionCalculator.calculateAbsolutePosition(
    selection.anchorId, 
    selection.anchorOffset
  );
  const focusAbsolute = positionCalculator.calculateAbsolutePosition(
    selection.focusId, 
    selection.focusOffset
  );
  
  // 3. Select based on absolute position
  positionManager.selectAbsoluteRange(anchorAbsolute, focusAbsolute);
}
```

### 2.4 Real-world Usage Scenarios

#### **Scenario 1: Basic Text Editing**
```typescript
// Use basic SelectionManager in Editor
const editor = new Editor({ dataStore });

// Convert DOM → Model when user selects text
editor.on('selectionchange', () => {
  const domSelection = window.getSelection();
  const modelSelection = editor.selectionHandler.convertDOMSelectionToModel(domSelection);
  editor.selectionManager.setSelection(modelSelection);
});

// Use Model Selection for text editing
const selection = editor.selectionManager.getCurrentSelection();
if (selection) {
  // Apply mark to selected text
  editor.executeCommand('bold');
}
```

#### **Scenario 2: Complex Document Manipulation**
```typescript
// When complex Selection management is needed
const positionManager = new PositionBasedSelectionManager(dataStore);

// Selection spanning multiple nodes
const selectionId = positionManager.selectRange('text-1', 5, 'text-2', 3);

// Manipulate selected text
const selectedText = positionManager.getSelectedText();
const selectedNodes = positionManager.getSelectedNodes();

// History management
const history = positionManager.getSelectionHistory();
```

#### **Scenario 3: ProseMirror-style API**
```typescript
// Absolute position-based API similar to ProseMirror
const positionManager = new PositionBasedSelectionManager(dataStore);

// Selection based on absolute position
const selection = positionManager.selectAbsoluteRange(10, 20);

// Text insertion based on absolute position
const position = positionCalculator.findNodeByAbsolutePosition(15);
if (position) {
  // Insert text at that position
  editor.executeCommand('insertText', { 
    nodeId: position.nodeId, 
    offset: position.offset, 
    text: 'Hello' 
  });
}
```

## 3. Implementation Status

### ✅ Completed Features

#### **1. Basic SelectionManager**
- **ModelSelection Interface**: Simple anchor/focus-based Selection representation
- **Basic API**: `getCurrentSelection()`, `setSelection()`, `clearSelection()`, etc.
- **State Checking**: `isEmpty()`, `isInNode()`, `isAtPosition()`, `isInRange()`, etc.
- **Overlap Check**: Check Selection overlap with `overlapsWith()` method

#### **2. DOM ↔ Model Conversion System**
- **DOMSelectionHandler**: Bidirectional conversion between DOM Selection and Model Selection
- **convertDOMSelectionToModel()**: Convert browser selection to model coordinates
- **convertModelSelectionToDOM()**: Convert model coordinates to browser selection
- **Model Validation**: Safely handle elements that exist in DOM but not in Model
- **Selection Direction Detection**: Provide forward/backward direction information

#### **3. Text Run Index System**
- **Nested Mark Structure Support**: Accurate position mapping in complex mark structures
- **Binary Search**: Efficient offset conversion with O(log n) time complexity
- **O(1) Reverse Mapping**: Fast DOM Text node lookup with `byNode` Map
- **Container-based Indexing**: Identify text containers with `data-text-container="true"` attribute

#### **4. PositionBasedSelectionManager (Advanced Features)**
- **Integrated selectRange() API**: Automatic detection of single node vs Cross Node
- **Convenience Methods**: `selectTextRange()`, `selectCrossNode()`, `selectAbsoluteRange()`, etc.
- **Selection Management**: Selection lookup, validation, history management
- **Position-based**: Track dynamic changes with complex Position objects

#### **5. Performance Optimization**
- **Drag Detection**: Track drag state based on mouse events
- **Debouncing**: Optimization for normal selection (16ms), during drag (100ms)
- **Drag End**: Immediate selection processing to ensure accurate final state

### 🆕 Latest Implementation Features (2024 Update)

#### **Model Selection to DOM Selection Conversion**
- **Implementation**: Added `convertModelSelectionToDOM` method to `DOMSelectionHandler`
- **Supported Types**: `text`, `node`, `none` Selection types
- **Core Algorithm**:
  1. Identify text container (`data-text-container="true"`)
  2. Map DOM Text nodes using Text Run Index
  3. Efficient offset conversion with Binary Search
  4. Create DOM Range and set accurate selection range

#### **Safe Model Validation**
- **nodeExistsInModel()**: Check if node actually exists in Model
- **Safe Conversion**: Return `{ type: 'none' }` for elements that exist in DOM but not in Model
- **Consistency Maintenance**: Ensure synchronization state between Model and DOM

#### **Selection Direction Information**
- **Implementation**: Determine direction with `determineSelectionDirection` method
- **Algorithm**: 
  - Within same node: `startOffset <= endOffset ? 'forward' : 'backward'`
  - Cross-node: Determine direction based on anchor/focus nodes
  - Fallback: Compare DOM document position

### 🚧 Planned Future Implementation
- **Highlight System**: Text highlighting functionality
- **Decoration System**: Decorative features like underline, background color, etc.
- **User-friendly API**: SimplePositionManager, UserFriendlyPositionManager
- **Performance Optimization**: Optimization for large document processing

## 3. Conclusion

The Selection system has been completely redesigned with a simple Model-centric structure.

### 🎯 Key Advantages:

1. **Simplicity**: Simple Selection representation with `ModelSelection` interface
2. **DOM Separation**: Selection management only at Model level, DOM manipulation handled in editor-view-dom
3. **Bidirectional Conversion**: Perfect synchronization with automatic DOM ↔ Model Selection conversion
4. **Safety**: Safe conversion processing through Model validation
5. **Performance Optimization**: Efficient position mapping with Text Run Index and Binary Search
6. **Direction Information**: Clarify Selection meaning with forward/backward direction information
7. **Drag Optimization**: Smooth user experience with debouncing
8. **Advanced Features**: Support complex Selection management with PositionBasedSelectionManager

### 🚀 Usage:

```typescript
// 1. Basic SelectionManager (Recommended)
const selectionManager = new SelectionManager({ dataStore });
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// 2. DOM ↔ Model conversion
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
selectionHandler.convertModelSelectionToDOM(modelSelection);

// 3. Advanced PositionBasedSelectionManager
const positionManager = new PositionBasedSelectionManager(dataStore);
positionManager.selectRange('text-1', 0, 'text-2', 5); // Automatic detection
```

### 🆕 Latest Features Usage:

```typescript
// Include Selection Direction information
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);
console.log(modelSelection.direction); // 'forward' | 'backward'

// Drag optimization (automatically applied)
// - Normal selection: 16ms debouncing
// - During drag: 100ms debouncing  
// - Drag end: Immediate processing

// Accurate position mapping with Text Run Index
// - Accurate offset conversion even in nested mark structures
// - Fast performance with O(log n) Binary Search
```

## 4. Integration Direction and Recommendations

### 4.1 Current Structure Issues

1. **Duplicated Features**: Two SelectionManagers provide similar functionality
2. **Lack of Consistency**: Different SelectionManagers used in Editor and Transaction
3. **Complexity**: Confusion for developers about which to use
4. **Maintenance**: Burden of managing two classes

### 4.2 Recommended Integration Direction

#### **Option 1: Integration (Recommended)**
```typescript
// Integrate Position features into SelectionManager
class SelectionManager {
  private _basicSelection: ModelSelection | null = null;
  private _positionManager?: PositionBasedSelectionManager;
  
  // Basic features (always available)
  getCurrentSelection(): ModelSelection | null {
    return this._basicSelection;
  }
  
  setSelection(selection: ModelSelection | null): void {
    this._basicSelection = selection;
  }
  
  // Advanced features (activate PositionManager when needed)
  selectRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string {
    if (!this._positionManager) {
      this._positionManager = new PositionBasedSelectionManager(this._dataStore);
    }
    return this._positionManager.selectRange(startNodeId, startOffset, endNodeId, endOffset);
  }
  
  selectAbsoluteRange(startOffset: number, endOffset: number): string {
    if (!this._positionManager) {
      this._positionManager = new PositionBasedSelectionManager(this._dataStore);
    }
    return this._positionManager.selectAbsoluteRange(startOffset, endOffset);
  }
  
  getSelectionHistory(): PositionBasedSelection[] {
    if (!this._positionManager) {
      return [];
    }
    return this._positionManager.getSelectionHistory();
  }
  
  undoSelection(): boolean {
    if (!this._positionManager) {
      return false;
    }
    return this._positionManager.undoSelection();
  }
}
```

#### **Advantages**
- **Simplicity**: Provide all features with one SelectionManager
- **Consistency**: Use same API in Editor and Transaction
- **Progressive Usage**: Can use from basic to advanced features step by step
- **Maintenance**: Reduced complexity by managing one class
- **Performance**: Create PositionManager only when needed

#### **Usage Example**
```typescript
// Use integrated SelectionManager in Editor
const editor = new Editor({ dataStore });

// Basic features (always available)
const selection = editor.selectionManager.getCurrentSelection();
editor.selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// Advanced features (automatically activated when needed)
const selectionId = editor.selectionManager.selectRange('text-1', 0, 'text-2', 3);
const absoluteSelection = editor.selectionManager.selectAbsoluteRange(10, 20);
const history = editor.selectionManager.getSelectionHistory();
```

### 4.3 Implementation Steps

1. **Step 1**: Fix and stabilize PositionBasedSelectionManager tests
2. **Step 2**: Integrate Position features into SelectionManager
3. **Step 3**: Use integrated SelectionManager in Editor
4. **Step 4**: Remove existing PositionBasedSelectionManager (optional)

## 5. Conclusion

The Selection system has now been completely redesigned with a simple and safe Model-centric structure, providing user-friendly, powerful, and performance-optimized Selection functionality.

### Key Advantages

1. **Simplicity**: Simple Selection management at Model level
2. **DOM Separation**: Clear separation between DOM manipulation and Model state
3. **Bidirectional Conversion**: Developer convenience with automatic DOM ↔ Model conversion
4. **Safety**: Safe handling of DOM-Model mismatch situations through Model validation
5. **Performance**: Efficient processing with Text Run Index and drag optimization
6. **Direction Information**: Understand user intent with Selection direction information
7. **Drag Optimization**: Performance improvement with debouncing during drag
8. **Advanced Features**: Support complex Selection management with PositionBasedSelectionManager
9. **Integration**: Provide all features with one SelectionManager (after integration)

### Usage Patterns

- **Basic Usage**: Simple Selection management with `SelectionManager`
- **DOM Integration**: Automatic conversion with `DOMSelectionHandler`
- **Advanced Usage**: Complex Selection management with `PositionBasedSelectionManager` (before integration)
- **Integrated Usage**: Use all features with integrated `SelectionManager` (after integration)
- **Performance Optimization**: Utilize drag detection and debouncing
