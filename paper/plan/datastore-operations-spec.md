# DataStore Operations Specification

## Mark Normalization

- normalizeMarks(nodeId)
  - Assigns full text range to marks without a range
  - Clamps ranges to [0, textLength], removes empty ranges
  - Removes duplicates by (type, attrs, range), merges overlapping marks with same (type, attrs), sorts by start position
  - After updateNode(false), synchronously reflects marks in local node

- normalizeAllMarks()
  - Only targets text-type nodes (`inline-text`/`text`)
  - Emits update only for changed nodes; returns count of normalized nodes

## Range-based Text Operations (Summary)

- ContentRange: { startNodeId, startOffset, endNodeId, endOffset }
- deleteText
  - Same node: remove substring + mark split/trim/shift
  - Multiple nodes: handle start/middle/end nodes separately; fallback to range iterator for complex cases
- insertText
  - Only allowed at caret (start==end); adjusts mark ranges (shift backward/extend span)
- replaceText
  - Same node: computed as remove+insert, includes mark adjustment
  - Multiple nodes: combines deleteText + insertText

## Content Operations Summary

- addChild
  - If child is an object, assign id and setNode; update parent.content via updateNode(false) then reflect locally
- removeChild
  - Remove from parent.content, update child.parentId to undefined
- moveNode
  - Remove from oldParent.content → insert into newParent.content → update child.parentId → emit move op
- reorderChildren
  - Replace parent.content with provided order; emit move sequence for items that changed position
- copyNode / cloneNodeWithChildren
  - Per-node create + parent update, no move; clone recursively copies subtree

## 1. Overview

DataStore functionality is modularized into 7 specialized operation classes. Each class handles a specific domain and operates independently via a reference to the DataStore instance. For atomic operation collection rules from a synchronization perspective, see chapter 6 of `datastore-spec.md`.

### 1.1 Query Operations: Performance vs Completeness Policy

QueryOperations uses two approaches to balance performance and completeness:

#### Using DocumentIterator (Performance-first)
- **findNodesByType**: efficient with type filtering
- **findChildrenByParentId**: efficient with direct access
- **findNodesByDepth**: efficient with depth limiting

#### Using Full Traversal (Completeness-first)
- **findNodes**: searches all nodes including orphans
- **findRootNodes**: treats orphans as roots
- **findNodesByAttribute**: attribute search (including orphans)
- **findNodesByText**: text search (including orphans)
- **searchText**: text search (including orphans)

This policy satisfies both requirements: finding orphans for data integrity checks, cleanup, and debugging, and general performance optimization.

## 2. CoreOperations

### 2.1 Purpose
Provides basic CRUD (Create, Read, Update, Delete) and handles schema validation and ID generation.

### 2.2 Main Methods

#### 2.2.1 setNode(node: INode, validate: boolean = true): void
```typescript
// Store node in DataStore
dataStore.setNode({
  id: 'text-1',
  type: 'inline-text',
  text: 'Hello World',
  parentId: 'para-1'
}, true); // validate=true performs schema validation
```

**Characteristics**:
- Optional schema validation
- Prevents duplicate IDs
- Emits operation events
- Auto-updates parent-child relationships

#### 2.2.2 getNode(nodeId: string): INode | undefined
```typescript
// Retrieve node
const node = dataStore.getNode('text-1');
if (node) {
  console.log(node.text); // "Hello World"
}
```

**Characteristics**:
- O(1) lookup performance
- Returns undefined for non-existent nodes

#### 2.2.3 deleteNode(nodeId: string): boolean
```typescript
// Delete node
const deleted = dataStore.deleteNode('text-1');
if (deleted) {
  console.log('Node deleted successfully');
}
```

**Characteristics**:
- Also deletes child nodes
- Auto-removes from parent’s content array
- Emits operation events

#### 2.2.4 updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null
```typescript
// Update node
const result = dataStore.updateNode('text-1', {
  text: 'Updated text',
  attributes: { class: 'highlight' }
});

if (result?.valid) {
  console.log('Update successful');
} else {
  console.log('Validation errors:', result?.errors);
}
```

**Characteristics**:
- Supports partial updates
- Prevents type changes
- Optional schema validation
- Provides detailed error information

#### 2.2.5 createNodeWithChildren(node: INode, schema?: Schema): INode
```typescript
// Create node with nested structure
const document = {
  id: 'doc-1',
  type: 'document',
  content: [
    {
      id: 'para-1',
      type: 'paragraph',
      content: [
        {
          id: 'text-1',
          type: 'inline-text',
          text: 'Hello World'
        }
      ]
    }
  ]
};

const createdDoc = dataStore.createNodeWithChildren(document, schema);
```

**Characteristics**:
- Auto-assigns IDs to nested objects
- Performs schema validation
- Creates all descendant nodes individually
- Ensures atomic operation

### 2.3 Internal Methods

#### 2.3.1 _setNodeInternal(node: INode): void
- Internal-only node storage method
- Stores directly without validation
- Emits operation events

#### 2.3.2 _createAllNodesRecursively(node: INode): void
- Recursively creates all nodes in nested structure
- Handles nodes with pre-assigned IDs

#### 2.3.3 _assignIdsRecursively(node: INode): void
- Assigns IDs to all objects in nested structure
- Uses Figma-style ID generation

## 3. QueryOperations

### 3.1 Purpose
Provides search, query, and filtering. Can find nodes by various conditions. Balances performance and completeness by combining DocumentIterator and full traversal appropriately.

### 3.2 Main Methods

#### 3.2.1 findNodes(predicate: (node: INode) => boolean): INode[]
- **Uses full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)

```typescript
// Complex condition search (including orphans)
const importantParagraphs = dataStore.findNodes(node => 
  node.type === 'paragraph' && 
  node.attributes?.class === 'important'
);
```

#### 3.2.2 findNodesByType(type: string): INode[]
- **Uses DocumentIterator**: efficient with type filtering
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: document traversal order (when root is set)

```typescript
// Search by type (performance optimized)
const paragraphs = dataStore.findNodesByType('paragraph');
const textNodes = dataStore.findNodesByType('inline-text');
```

#### 3.2.3 findNodesByAttribute(key: string, value: any): INode[]
- **Uses full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)

```typescript
// Search by attribute (including orphans)
const boldTexts = dataStore.findNodesByAttribute('class', 'bold');
const highlightedNodes = dataStore.findNodesByAttribute('highlighted', true);
```

#### 3.2.4 findNodesByText(text: string): INode[]
- **Uses full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)

```typescript
// Text search (including orphans)
const helloNodes = dataStore.findNodesByText('Hello');
const worldNodes = dataStore.findNodesByText('World');
```

#### 3.2.5 findChildrenByParentId(parentId: string): INode[]
- **Uses direct access**: directly accesses parent node’s content array
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: document traversal order (if parent is connected)

```typescript
// Returns child nodes as object array (performance optimized)
const children = dataStore.findChildrenByParentId('para-1');
children.forEach(child => {
  console.log(child.text);
});
```

#### 3.2.6 getNodeChildrenDeep(nodeId: string): INode[]
```typescript
// Recursively retrieve all descendant nodes
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');
```

#### 3.2.7 getNodeWithChildren(nodeId: string): INode | null
```typescript
// Returns node with all children in nested structure
const nodeWithChildren = dataStore.getNodeWithChildren('para-1');
console.log(nodeWithChildren.content); // INode[] array
```

#### 3.2.8 getAllNodesWithChildren(): INode[]
```typescript
// Returns all nodes in nested structure
const allNodes = dataStore.getAllNodesWithChildren();
```

### 3.3 Performance Optimization Strategies

#### 3.3.1 Using DocumentIterator
- **Type filtering**: efficient traversal with type filters in `findNodesByType`
- **Direct access**: directly accesses parent’s content array in `findChildrenByParentId`
- **Depth limiting**: prevents unnecessary traversal with depth limits in `findNodesByDepth`

#### 3.3.2 Using Full Traversal
- **Orphan search**: `findNodes`, `findNodesByAttribute`, `findNodesByText`, `searchText` include orphans
- **Data integrity**: all nodes must be searched during cleanup and debugging
- **Overlay-aware**: all methods reflect current state

#### 3.3.3 Method-specific Optimization Strategy
- **Performance-first**: use DocumentIterator for general searches
- **Completeness-first**: use full traversal for data integrity checks
- **Appropriate combination**: choose the right approach based on requirements

## 4. ContentOperations

### 4.1 Purpose
Manages parent-child relationships and provides node move, copy, and reorder functionality.

### 4.2 Main Methods

#### 4.2.1 addChild(parentId: string, child: INode | string, position?: number): string
```typescript
// Add child node
const childId = dataStore.addChild('para-1', {
  id: 'text-2',
  type: 'inline-text',
  text: 'New text'
}, 0); // Add at first position
```

#### 4.2.2 removeChild(parentId: string, childId: string): boolean
```typescript
// Remove child node
const removed = dataStore.removeChild('para-1', 'text-1');
```

#### 4.2.3 moveNode(nodeId: string, newParentId: string, position?: number): void
```typescript
// Move node
dataStore.moveNode('text-1', 'para-2', 1); // Move to second position in para-2
```

#### 4.2.4 copyNode(nodeId: string, newParentId?: string): string
```typescript
// Copy node
const copiedId = dataStore.copyNode('text-1', 'para-2');
```

#### 4.2.5 cloneNodeWithChildren(nodeId: string, newParentId?: string): string
```typescript
// Copy entire subtree
const clonedId = dataStore.cloneNodeWithChildren('para-1', 'doc-2');
```

#### 4.2.6 reorderChildren(parentId: string, childIds: string[]): void
```typescript
// Reorder child nodes
dataStore.reorderChildren('para-1', ['text-3', 'text-1', 'text-2']);
```

### 4.3 Batch Operations

#### 4.3.1 addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
```typescript
// Add multiple child nodes in batch
const childIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] }
]);
```

#### 4.3.2 removeChildren(parentId: string, childIds: string[]): boolean[]
```typescript
// Remove multiple child nodes in batch
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);
```

#### 4.3.3 moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
```typescript
// Move multiple child nodes in batch
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);
```

## 5. SplitMergeOperations

### 5.1 Purpose
Provides split/merge for text and blocks, supporting core text editor functionality.

### 5.2 Text Split/Merge (Basic)

#### 5.2.1 splitTextNode(nodeId: string, splitPosition: number): string
```typescript
// Split text node (Enter key)
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"
```

#### 5.2.2 mergeTextNodes(leftNodeId: string, rightNodeId: string): string
```typescript
// Merge text nodes (Backspace key)
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

#### 5.2.3 splitTextRange(nodeId: string, startPosition: number, endPosition: number): string
```typescript
// Split text range
const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);
// "Hello World" → "Hel" + "lo Wo" + "rld"
```

#### 5.2.4 autoMergeTextNodes(nodeId: string): string
```typescript
// Auto-merge (merge with adjacent text nodes on both sides)
const mergedId = dataStore.autoMergeTextNodes('text-2');
```

### 5.3 Block Split/Merge

#### 5.3.1 splitBlockNode(nodeId: string, splitPosition: number): string
```typescript
// Split block node
const newBlockId = dataStore.splitBlockNode('para-1', 2);
// Split after second child
```

#### 5.3.2 mergeBlockNodes(leftNodeId: string, rightNodeId: string): string
```typescript
// Merge block nodes
const mergedId = dataStore.mergeBlockNodes('para-1', 'para-2');
```

### 5.4 Text Editing (Delegates to RangeOperations)

#### 5.4.1 insertText(contentRange: ContentRange, text: string): string
```typescript
// Insert text at same position range
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 5 };
dataStore.insertText(range, ' Beautiful');
// "Hello World" → "Hello Beautiful World"
```

#### 5.4.2 deleteText(contentRange: ContentRange): string
```typescript
// Delete text range
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 11 };
dataStore.deleteText(range);
// "Hello World" → "Hello"
```

#### 5.4.3 replaceText(contentRange: ContentRange, newText: string): string
```typescript
// Replace text range
const range = { startNodeId: 'text-1', startOffset: 6, endNodeId: 'text-1', endOffset: 11 };
dataStore.replaceText(range, 'Universe');
// "Hello World" → "Hello Universe"
```

### 5.5 Mark Preservation

Marks are preserved correctly during split/merge:
- On split: mark ranges are adjusted automatically
- On merge: marks are merged correctly
- On insert/delete: mark ranges are updated automatically

## 6. MarkOperations

### 6.1 Purpose
Provides mark normalization, statistics, and optimization.

### 6.2 Mark Normalization/Application

#### 6.2.1 normalizeMarks(nodeId: string): void
```typescript
// Apply/remove/clean marks based on range
const range = { startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 };
dataStore.applyMark(range, { type: 'bold' });
dataStore.removeMark(range, 'bold');
dataStore.clearFormatting(range);
// Normalize marks on individual node
dataStore.normalizeMarks('text-1');
```

#### 6.2.2 normalizeAllMarks(): number
```typescript
// Normalize marks on all nodes
const normalizedCount = dataStore.normalizeAllMarks();
console.log(`Normalized ${normalizedCount} nodes`);
```

### 6.3 Mark Statistics

#### 6.3.1 getMarkStatistics(nodeId: string): MarkStatistics
```typescript
// Get mark statistics
const stats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${stats.totalMarks}`);
console.log(`Overlapping marks: ${stats.overlappingMarks}`);
console.log(`Empty marks: ${stats.emptyMarks}`);
```

#### 6.3.2 removeEmptyMarks(nodeId: string): number
```typescript
// Remove empty marks
const removedCount = dataStore.removeEmptyMarks('text-1');
console.log(`Removed ${removedCount} empty marks`);
```

### 6.4 Mark Optimization

#### 6.4.1 Duplicate Removal
- Merge marks with same type and range
- Remove unnecessary marks

#### 6.4.2 Overlap Handling
- Merge overlapping mark ranges
- Handle mark priority

#### 6.4.3 Range Normalization
- Remove empty-range marks
- Clean up range boundaries

## 7. RangeOperations

### 7.1 Purpose
Provides ContentRange-based text/mark manipulation. Ranges can span different text nodes; internally uses `createRangeIterator` to traverse node ranges.

### 7.2 Text Manipulation

#### 7.2.1 deleteText(range: ContentRange): string
```typescript
// Delete text in range (can span multiple nodes)
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-3', endOffset: 10 };
const deleted = dataStore.deleteText(range);
```

#### 7.2.2 insertText(range: ContentRange, text: string): string
```typescript
// Insert at single position (start==end)
const caret = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-1', endOffset: 5 };
dataStore.insertText(caret, ' Beautiful');
```

#### 7.2.3 replaceText(range: ContentRange, newText: string): string
```typescript
// Replace range, returns deleted text
const deleted = dataStore.replaceText(range, 'Universe');
```

#### 7.2.4 extractText(range: ContentRange): string
```typescript
// Extract range text (doesn't modify original)
const extracted = dataStore.extractText(range);
```

#### 7.2.5 copyText(range: ContentRange): string
```typescript
// Alias for extractText
const copied = dataStore.copyText(range);
```

#### 7.2.6 moveText(fromRange: ContentRange, toRange: ContentRange): string
```typescript
// Move text (delete then insert)
dataStore.moveText(
  { startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 },
  { startNodeId: 'text-2', startOffset: 0, endNodeId: 'text-2', endOffset: 0 }
);
```

#### 7.2.7 duplicateText(range: ContentRange): string
```typescript
// Duplicate and insert range text at end position
dataStore.duplicateText({ startNodeId: 'text-1', startOffset: 0, endNodeId: 'text-1', endOffset: 5 });
```

### 7.3 Mark Manipulation

#### 7.3.1 applyMark(range: ContentRange, mark: IMark): IMark
#### 7.3.2 removeMark(range: ContentRange, markType: string): number
#### 7.3.3 clearFormatting(range: ContentRange): number
#### 7.3.4 toggleMark(range: ContentRange, markType: string, attrs?): void
#### 7.3.5 constrainMarksToRange(range: ContentRange): number

### 7.4 Text Utilities

#### 7.4.1 findText(range: ContentRange, searchText: string): number
#### 7.4.2 getTextLength(range: ContentRange): number
#### 7.4.3 trimText(range: ContentRange): number
#### 7.4.4 normalizeWhitespace(range: ContentRange): string
#### 7.4.5 wrap(range: ContentRange, prefix: string, suffix: string): string
#### 7.4.6 unwrap(range: ContentRange, prefix: string, suffix: string): string
#### 7.4.7 replace(range: ContentRange, pattern: string|RegExp, replacement: string): number
#### 7.4.8 findAll(range: ContentRange, pattern: string|RegExp): Array<{ start: number; end: number }>
#### 7.4.9 indent(range: ContentRange, indent = '  '): string
#### 7.4.10 outdent(range: ContentRange, indent = '  '): string
#### 7.4.11 expandToWord(range: ContentRange): ContentRange
#### 7.4.12 expandToLine(range: ContentRange): ContentRange
#### 7.4.13 normalizeRange(range: ContentRange): ContentRange

## 8. UtilityOperations

### 8.1 Purpose
Provides utility functions for data analysis, cloning, relationship checks, etc.

### 8.2 Data Analysis

#### 8.2.1 getNodeCount(): number
```typescript
// Get total node count
const totalNodes = dataStore.getNodeCount();
```

#### 8.2.2 getAllNodes(): INode[]
```typescript
// Get all nodes
const allNodes = dataStore.getAllNodes();
```

#### 8.2.3 getAllNodesMap(): Map<string, INode>
```typescript
// Return Map of all nodes
const nodesMap = dataStore.getAllNodesMap();
```

### 8.3 Data Cloning

#### 8.3.1 clone(): DataStore
```typescript
// Clone entire DataStore
const clonedStore = dataStore.clone();
```

#### 8.3.2 restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void
```typescript
// Restore from snapshot
const newStore = new DataStore();
newStore.restoreFromSnapshot(snapshot, 'doc-1', 1);
```

### 8.4 Relationship Checks

#### 8.4.1 hasNode(nodeId: string): boolean
```typescript
// Check node existence
const exists = dataStore.hasNode('text-1');
```

#### 8.4.2 getChildCount(nodeId: string): number
```typescript
// Get child node count
const childCount = dataStore.getChildCount('para-1');
```

#### 8.4.3 isLeafNode(nodeId: string): boolean
```typescript
// Check if leaf node
const isLeaf = dataStore.isLeafNode('text-1');
```

#### 8.4.4 isRootNode(nodeId: string): boolean
```typescript
// Check if root node
const isRoot = dataStore.isRootNode('doc-1');
```

#### 8.4.5 isDescendant(nodeId: string, ancestorId: string): boolean
```typescript
// Check ancestor-descendant relationship
const isDescendant = dataStore.isDescendant('text-1', 'doc-1');
```

### 8.5 Path and Depth

#### 8.5.1 getNodePath(nodeId: string): string[]
```typescript
// Get node path
const path = dataStore.getNodePath('text-1');
// ['doc-1', 'para-1', 'text-1']
```

#### 8.5.2 getNodeDepth(nodeId: string): number
```typescript
// Get node depth
const depth = dataStore.getNodeDepth('text-1'); // 2
```

#### 8.5.3 getAllDescendants(nodeId: string): INode[]
```typescript
// Get all descendant nodes
const descendants = dataStore.getAllDescendants('doc-1');
```

#### 8.5.4 getAllAncestors(nodeId: string): INode[]
```typescript
// Get all ancestor nodes
const ancestors = dataStore.getAllAncestors('text-1');
```

### 8.6 Sibling Nodes

#### 8.6.1 getSiblings(nodeId: string): INode[]
```typescript
// Get sibling nodes
const siblings = dataStore.getSiblings('text-1');
```

#### 8.6.2 getSiblingIndex(nodeId: string): number
```typescript
// Get index among siblings
const index = dataStore.getSiblingIndex('text-1'); // 0, 1, 2...
```

## 9. Performance Considerations

### 9.1 Memory Usage
- Memory efficiency via ID-based references
- Flat storage instead of nested structures
- Minimizes unnecessary copies

### 9.2 Operation Complexity
- Most basic operations are O(1)
- Search operations are O(n) but optimized with indexing
- Complex queries improved with caching

### 9.3 Extensibility
- Easy to add new operation classes
- Extend functionality without modifying existing classes
- Independent testing and maintenance possible

---

This document covers detailed functionality for each operation class in DataStore. For actual usage examples, see [DataStore Usage Scenarios](./datastore-usage-scenarios.md).
