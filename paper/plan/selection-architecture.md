# SelectionManager Architecture

## Overview

Barocss Editor provides a simple and efficient selection management system:

1. **Basic SelectionManager** (`editor-core`): basic selection management used by Editor class
2. **PositionCalculator** (`model`): utility for converting between absolute positions and nodeId + offset

## Architecture Structure

### 1. Basic SelectionManager (editor-core)

**File**: `packages/editor-core/src/selection-manager.ts`

**Purpose**: basic selection management in Editor class

**Interface**: `ModelSelection`
```typescript
interface ModelSelection {
  anchorId: string;
  anchorOffset: number;
  focusId: string;
  focusOffset: number;
}
```

**Key features**:
- Selection state management (set, get, clear)
- Selection state checks (empty, position within specific node, etc.)
- Selection direction check (forward/backward)
- Get selected text
- Pure Model-level management completely separate from DOM

**Usage example**:
```typescript
import { SelectionManager } from '@barocss/editor-core';

const selectionManager = new SelectionManager({ dataStore });

// Set selection
selectionManager.setSelection({
  anchorId: 'text-1',
  anchorOffset: 0,
  focusId: 'text-1',
  focusOffset: 5
});

// Get selection
const currentSelection = selectionManager.getCurrentSelection();
```

### 2. PositionCalculator (model)

**File**: `packages/model/src/position.ts`

**Purpose**: utility for converting between absolute positions and nodeId + offset

**Key features**:
- Convert absolute position to nodeId + offset
- Convert nodeId + offset to absolute position
- Calculate node path
- Get parent ID and sibling order
- Calculate distance between nodes

**Usage example**:
```typescript
import { PositionCalculator } from '@barocss/model';

const calculator = new PositionCalculator(dataStore);

// Convert nodeId + offset to absolute position
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);

// Convert absolute position to nodeId + offset
const nodePos = calculator.findNodeByAbsolutePosition(absolutePos);

// Calculate node path
const path = calculator.getNodePath('text-1'); // ['doc-1', 'para-1', 'text-1']

// Get parent ID
const parentId = calculator.getParentId('text-1'); // 'para-1'

// Get sibling order
const siblingIndex = calculator.getSiblingIndex('text-1'); // 0
```

## Usage Scenarios

### Basic Editor Usage
```typescript
// Use basic SelectionManager in Editor class
const editor = new Editor({ dataStore });
const selection = editor.selectionManager.getCurrentSelection();

if (selection) {
  console.log(`Selected range: ${selection.anchorId}:${selection.anchorOffset} ~ ${selection.focusId}:${selection.focusOffset}`);
}
```

### When Position Calculation is Needed
```typescript
// When position conversion is needed
const calculator = new PositionCalculator(dataStore);

// Convert absolute position from DOM to Model coordinates
const domAbsolutePosition = 15;
const modelPosition = calculator.findNodeByAbsolutePosition(domAbsolutePosition);

// Convert Model coordinates to DOM absolute position
const backToDomPosition = calculator.calculateAbsolutePosition(
  modelPosition.nodeId, 
  modelPosition.offset
);

// Get node structure information
const path = calculator.getNodePath('text-1');
const parentId = calculator.getParentId('text-1');
const siblingIndex = calculator.getSiblingIndex('text-1');
```

### Usage in Transaction
```typescript
// Use SelectionManager in Transaction
const transactionContext = createTransactionContext(
  dataStore,
  selectionManager, // SelectionManager from editor-core
  schema
);

// Execute transaction
const result = await transaction(editor, [
  create(node('paragraph', {}, [textNode('inline-text', 'Hello World')]))
]).commit();
```

## DOM ↔ Model Conversion

### DOMSelectionHandler (editor-view-dom)
Handles conversion between DOM Selection and Model Selection.

```typescript
// Convert DOM Selection → Model Selection
const domSelection = window.getSelection();
const modelSelection = selectionHandler.convertDOMSelectionToModel(domSelection);

// Convert Model Selection → DOM Selection
selectionHandler.convertModelSelectionToDOM(modelSelection);
```

## File Structure

```
packages/
├── editor-core/
│   └── src/
│       └── selection-manager.ts          # Basic SelectionManager
├── model/
│   └── src/
│       ├── position.ts                   # PositionCalculator utility
│       └── create-transaction-context.ts # Use SelectionManager in Transaction
└── editor-view-dom/
    └── src/
        └── dom-selection-handler.ts      # DOM ↔ Model conversion
```

## Benefits

### 1. Simple Structure
- **Basic SelectionManager**: basic selection functionality for Editor
- **PositionCalculator**: position conversion utility

### 2. Performance Optimization
- Basic functionality uses lightweight `ModelSelection`
- Position conversion uses `PositionCalculator` only when needed

### 3. Flexibility
- Editor uses only basic SelectionManager
- Use PositionCalculator when position conversion is needed

### 4. Compatibility
- Existing Editor code works without changes
- Position conversion functionality is optional

## Conclusion

The current architecture provides the following benefits:

1. **Simplicity**: basic Editor users only use simple `ModelSelection`
2. **Utility**: use `PositionCalculator` when position conversion is needed
3. **Performance**: use appropriate functionality as needed
4. **Maintainability**: clear separation of responsibilities for each feature

This structure enables developers to efficiently use basic selection management and position conversion functionality.
