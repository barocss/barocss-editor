# Absolute Position Specification

## 1. Overview

Absolute Position is a **character index** when treating the entire document as one continuous text in Barocss Editor. It is similar to ProseMirror’s Position concept but designed for Barocss’s hierarchical document structure.

### 1.1 Purpose
- **Accurate selection**: handle selection at node boundaries precisely
- **Structure preservation**: maintain hierarchical structure information
- **Extensibility**: support future features like highlights, decorations, collaborative editing
- **Compatibility**: align with ProseMirror-style approaches for interoperability

## 2. Absolute Position Definition

### 2.1 Basic Concept

```typescript
// Absolute Position is an integer starting from 0
// Includes both node boundaries and text characters
type AbsolutePosition = number;  // 0, 1, 2, 3, ...

// Example: document structure
// doc-1
//   ├── para-1
//   │   └── text-1 (text: "Hello")
//   └── para-2
//       └── text-2 (text: "World")

// Absolute Position mapping (including node boundaries):
// 0: doc-1 start
// 1: para-1 start
// 2: H (text-1, 0th char)
// 3: e (text-1, 1st char)
// 4: l (text-1, 2nd char)
// 5: l (text-1, 3rd char)
// 6: o (text-1, 4th char)
// 7: para-1 end
// 8: para-2 start
// 9: W (text-2, 0th char)
// 10: o (text-2, 1st char)
// 11: r (text-2, 2nd char)
// 12: l (text-2, 3rd char)
// 13: d (text-2, 4th char)
// 14: para-2 end
// 15: doc-1 end
```

### 2.2 Calculation Rules

1. **Document traversal**: depth-first traversal (DFS) from root
2. **Include all nodes**: both text and container nodes
3. **Include node boundaries**: assign an index to each node’s start and end
4. **Sequential indexing**: assign indices sequentially from 0 in document order
5. **Selectability**: maintain boundaries so empty nodes are selectable

### 2.3 Calculation Algorithm

```typescript
function calculateAbsolutePosition(nodeId: string, offset: number): number {
  let absoluteOffset = 0;
  
  const traverse = (currentNodeId: string): boolean => {
    const node = document.getNode(currentNodeId);
    if (!node) return false;

    // If current node is the target
    if (node.sid === nodeId) {
      absoluteOffset += offset;
      return true;
    }

    // Add node start position (1)
    absoluteOffset += 1;

    // If text node, add text length
    if (node.text) {
      absoluteOffset += node.text.length;
    }

    // If container, traverse children
    if (node.content) {
      for (const childId of node.content) {
        if (traverse(childId)) return true;
      }
    }

    // Add node end position (1)
    absoluteOffset += 1;

    return false;
  };

  traverse(document.sid);
  return absoluteOffset;
}
```

### 2.4 Reverse Conversion Algorithm

```typescript
function findNodeByAbsolutePosition(absoluteOffset: number): { nodeId: string; offset: number } | null {
  let currentOffset = 0;
  
  const traverse = (nodeId: string): { nodeId: string; offset: number } | null => {
    const node = document.getNode(nodeId);
    if (!node) return null;

    // Check node start position
    if (currentOffset === absoluteOffset) {
      return { nodeId, offset: 0 }; // node start
    }
    currentOffset += 1;

    // If text node
    if (node.text) {
      const nodeLength = node.text.length;
      if (currentOffset + nodeLength > absoluteOffset) {
        return {
          nodeId,
          offset: Math.max(0, absoluteOffset - currentOffset)
        };
      }
      currentOffset += nodeLength;
    }

    // If container, traverse children
    if (node.content) {
      for (const childId of node.content) {
        const result = traverse(childId);
        if (result) return result;
      }
    }

    // Check node end position
    if (currentOffset === absoluteOffset) {
      return { nodeId, offset: node.text ? node.text.length : 0 }; // node end
    }
    currentOffset += 1;

    return null;
  };

  return traverse(document.sid);
}
```

## 3. Characteristics of Absolute Position

### 3.1 Advantages

1. **Accurate selection**: precise handling at node boundaries
2. **Structure preservation**: maintains hierarchical structure
3. **Empty node selection**: enables selection of nodes without text
4. **ProseMirror compatibility**: aligns with ProseMirror for interoperability
5. **Extensibility**: supports future features like highlights, decorations

### 3.2 Disadvantages

1. **Complexity**: node boundary calculation is complex
2. **Performance**: calculation overhead in large documents
3. **Learning curve**: may be harder for developers to understand

### 3.3 Comparison with Other Editors

| Editor | Position Method | Structure Info | Selection Method |
|--------|----------------|----------------|-------------------|
| **ProseMirror** | Includes node boundaries | ✅ | Precise boundaries |
| **Word** | Character-based | ❌ | Simple range |
| **Google Docs** | Hybrid | ✅ | Structure + text |
| **Notion** | Block-based | ✅ | Block unit |
| **Obsidian** | Line-based | ❌ | Line + character |
| **Barocss** | Includes node boundaries | ✅ | Precise boundaries |

## 4. Usage Examples

### 4.1 Basic Usage

```typescript
import { PositionCalculator } from '@barocss/model';

const calculator = new PositionCalculator(document);

// Convert nodeId + offset to absolute position
const absolutePos = calculator.calculateAbsolutePosition('text-1', 3);
console.log(absolutePos); // 5 (para-1 start + text-1 start + 3)

// Convert absolute position to nodeId + offset
const nodePos = calculator.findNodeByAbsolutePosition(5);
console.log(nodePos); // { nodeId: 'text-1', offset: 3 }
```

### 4.2 Usage with Selection

```typescript
import { PositionBasedSelectionManager } from '@barocss/model';

const selectionManager = new PositionBasedSelectionManager(document, positionTracker);

// Select based on absolute positions
const selectionId = selectionManager.selectAbsoluteRange(2, 7);
// Selects text-1 characters 0-5

// Select a node
const nodeSelectionId = selectionManager.selectNode('para-1');
// Can select empty paragraph
```

### 4.3 Serialization and Update Rules Summary

Recommended serialization format:

```json
{
  "type": "absolute-range",
  "start": 12,
  "end": 23,
  "version": 3
}
```

Update rules (summary):

- Text insertion: if insertion absolute position ≤ position, add length to that position
- Text deletion: positions before deletion remain; positions after subtract length; positions inside are invalidated
- Node insertion/deletion: if insertion/deletion is before position, adjust absolute value; if same node is deleted, invalidate
- Node move: adjust absolute value by move amount based on boundary-inclusive calculation

### 4.4 Complex Document Structure

```typescript
// Example: complex document structure
const complexDocument = {
  id: 'doc-1',
  type: 'document',
  content: ['section-1', 'section-2']
};

// section-1 > para-1 > text-1("Hello") + para-2 > text-2("World")
// section-2 > para-3 > text-3("Test")

// Absolute Position mapping:
// 0: doc-1 start
// 1: section-1 start
// 2: para-1 start
// 3: H, 4: e, 5: l, 6: l, 7: o
// 8: para-1 end
// 9: para-2 start
// 10: W, 11: o, 12: r, 13: l, 14: d
// 15: para-2 end
// 16: section-1 end
// 17: section-2 start
// 18: para-3 start
// 19: T, 20: e, 21: s, 22: t
// 23: para-3 end
// 24: section-2 end
// 25: doc-1 end
```

## 5. Performance Considerations

### 5.1 Computational Complexity

- **Time complexity**: O(N) — proportional to number of nodes
- **Space complexity**: O(1) — constant space
- **Optimization**: can improve with caching, incremental updates

### 5.2 Optimization Strategies

1. **Caching**: cache frequently used position calculations
2. **Incremental updates**: recompute only changed parts
3. **Lazy calculation**: compute only when needed
4. **Indexing**: build indices for frequently accessed nodes

## 6. Implementation Status

### 6.1 Completed Features

- ✅ PositionCalculator class implemented
- ✅ calculateAbsolutePosition method
- ✅ findNodeByAbsolutePosition method
- ✅ PositionBasedSelectionManager integration
- ✅ Unit tests written
- ✅ Usage examples written

### 6.2 Future Plans

- 🔄 Position caching system
- 🔄 Incremental update optimization
- 🔄 User-friendly API additions
- 🔄 Performance benchmarks

## 7. Conclusion

Barocss’s Absolute Position system is designed in a **ProseMirror-like manner** to provide accurate selection and structure preservation. By including node boundaries, it enables selection of empty nodes and establishes an extensible foundation for future features like highlights, decorations, and collaborative editing.

This system prioritizes **accuracy and extensibility** over simplicity, supporting Barocss Editor’s core goal of precise document editing.

## 8. Operation Payload Convention (Absolute-based)

### 8.1 Key Convention

- Single position: `pos`
- Range: `start`, `end`
- Move: `from`, `to`

All coordinates are Absolute Positions (integers) and are normalized to node/offset inside operations.

### 8.2 Mapping Behavior

- `pos` → compute `{ nodeId, offset }` via `resolveAbsolute(pos)`, then apply existing logic
- `start/end` → compute start/end node and offset via `resolveAbsolute(start|end)`, then apply existing logic
- `from/to` → interpret absolute coordinates as node IDs to determine move source/target

### 8.3 Usage Examples

```ts
// Text insertion
applyOperation('text.insert', { pos: 42, text: 'Hello' }, ctx);

// Replace selected text
applyOperation('text.replaceSelection', { start: 10, end: 25, text: 'MID' }, ctx);

// Delete text range
applyOperation('text.deleteRange', { start: 100, end: 120 }, ctx);

// Split text
applyOperation('text.splitAtSelection', { pos: 77 }, ctx);

// Split block
applyOperation('block.splitAtSelection', { pos: 130 }, ctx);

// Wrap adjacent siblings
applyOperation('block.wrapAdjacentSiblings', { start: 200, end: 260, wrapperType: 'section', wrapperAttrs: { class: 'range' } }, ctx);

// Move node (before/after)
applyOperation('node.moveBefore', { from: 300, to: 280 }, ctx);
applyOperation('node.moveAfter', { from: 300, to: 320 }, ctx);

// Split/merge list items
applyOperation('list.splitItem', { pos: 410 }, ctx);
applyOperation('list.mergeWithNextItem', { pos: 512 }, ctx);
applyOperation('list.mergeWithPrevItem', { pos: 512 }, ctx);
```

### 8.4 Validation Principles Summary

- If normalization fails, return a validity error (e.g., `absolute position out of bounds`).
- After normalization, follow existing node/offset-based validation logic.
