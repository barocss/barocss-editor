# Model Traversal API List

List of utility functions for model traversal and navigation.

## Table of Contents

1. [Basic Lookup Functions](#basic-lookup-functions)
2. [Hierarchical Structure Navigation](#hierarchical-structure-navigation)
3. [Sibling Node Navigation](#sibling-node-navigation)
4. [Document Order Traversal](#document-order-traversal)
5. [Conditional Search](#conditional-search)
6. [Tree Traversal](#tree-traversal)
7. [Status Check](#status-check)
8. [Statistics and Information](#statistics-and-information)
9. [Range Queries](#range-queries)

---

## Basic Lookup Functions

### `hasNode(nodeId: string): boolean`
- **Description**: Check if node exists
- **Returns**: `true` if node exists, `false` otherwise
- **Complexity**: O(1)

### `getNode(nodeId: string): INode | undefined`
- **Description**: Lookup node (DataStore basic method)
- **Returns**: Node object or `undefined`
- **Complexity**: O(1)

### `getRootNode(): INode | undefined`
- **Description**: Lookup root node (DataStore basic method)
- **Returns**: Root node object or `undefined`
- **Complexity**: O(1)

---

## Hierarchical Structure Navigation

### `getParent(nodeId: string): INode | undefined`
- **Description**: Lookup parent node
- **Returns**: Parent node object or `undefined` (root node or no parent)
- **Complexity**: O(1)

### `getChildren(nodeId: string): INode[]`
- **Description**: Lookup direct child nodes
- **Returns**: Array of child nodes (direct children only, nested descendants excluded)
- **Complexity**: O(n) (n = number of children)

### `getFirstChild(nodeId: string): string | null`
- **Description**: Lookup first child node
- **Returns**: First child node ID or `null` (no children)
- **Complexity**: O(1)

### `getLastChild(nodeId: string): string | null`
- **Description**: Lookup last child node
- **Returns**: Last child node ID or `null` (no children)
- **Complexity**: O(1)

### `getChildCount(nodeId: string): number`
- **Description**: Lookup direct child node count
- **Returns**: Number of child nodes (0 or more)
- **Complexity**: O(1)

### `getAllDescendants(nodeId: string): INode[]`
- **Description**: Lookup all descendant nodes (recursive)
- **Returns**: Array of descendant nodes (direct children + all nested descendants)
- **Complexity**: O(n) (n = number of descendants)

### `getAllAncestors(nodeId: string): INode[]`
- **Description**: Lookup all ancestor nodes (up to root)
- **Returns**: Array of ancestor nodes (parent → root order)
- **Complexity**: O(d) (d = depth)

### `getNodePath(nodeId: string): string[]`
- **Description**: Lookup node path (from root to current node)
- **Returns**: Array of node IDs (root → current node order)
- **Complexity**: O(d) (d = depth)

### `getNodeDepth(nodeId: string): number`
- **Description**: Lookup node depth (root = 0)
- **Returns**: Depth value (0 or more)
- **Complexity**: O(d) (d = depth)

### `isDescendant(nodeId: string, ancestorId: string): boolean`
- **Description**: Check if node is descendant of specific ancestor
- **Returns**: `true` if descendant, `false` otherwise
- **Complexity**: O(d) (d = depth)

### `getCommonAncestor(nodeId1: string, nodeId2: string): string | null`
- **Description**: Find common ancestor of two nodes (Lowest Common Ancestor)
- **Returns**: Common ancestor node ID or `null` (no common ancestor)
- **Complexity**: O(d) (d = depth)
- **Note**: Returns that ancestor if one node is ancestor of the other

### `getDistance(nodeId1: string, nodeId2: string): number`
- **Description**: Calculate distance between two nodes
- **Returns**: Distance between two nodes (sum of paths to common ancestor), or `-1` if none
- **Complexity**: O(d) (d = depth)
- **Note**: Returns `0` if same node, `-1` if no common ancestor

---

## Sibling Node Navigation

### `getSiblings(nodeId: string): INode[]`
- **Description**: Lookup all sibling nodes (excluding self)
- **Returns**: Array of sibling nodes
- **Complexity**: O(n) (n = number of siblings)

### `getSiblingIndex(nodeId: string): number`
- **Description**: Lookup index among sibling nodes
- **Returns**: Index (0-based, -1 if not found)
- **Complexity**: O(n) (n = number of siblings)

### `getPreviousSibling(nodeId: string): string | null`
- **Description**: Lookup previous sibling node with same parent
- **Returns**: Previous sibling node ID or `null` (first sibling or none)
- **Complexity**: O(n) (n = number of siblings)

### `getNextSibling(nodeId: string): string | null`
- **Description**: Lookup next sibling node with same parent
- **Returns**: Next sibling node ID or `null` (last sibling or none)
- **Complexity**: O(n) (n = number of siblings)

### `getFirstSibling(nodeId: string): string | null`
- **Description**: Lookup first sibling node with same parent
- **Returns**: First sibling node ID or `null` (no siblings or none)
- **Complexity**: O(1)

### `getLastSibling(nodeId: string): string | null`
- **Description**: Lookup last sibling node with same parent
- **Returns**: Last sibling node ID or `null` (no siblings or none)
- **Complexity**: O(1)

---

## Document Order Traversal

### `getNextNode(nodeId: string): string | null`
- **Description**: Lookup next node in document order (child first, sibling, parent's sibling order)
- **Returns**: Next node ID or `null` (last node)
- **Complexity**: O(1) ~ O(d) (d = depth)

**Behavior**:
1. If child nodes exist, return first child
2. If sibling nodes exist, return next sibling
3. Find parent's next sibling (recursive)
4. Return `null` if none

### `getPreviousNode(nodeId: string): string | null`
- **Description**: Lookup previous node in document order (sibling's last descendant, parent order)
- **Returns**: Previous node ID or `null` (first node)
- **Complexity**: O(1) ~ O(d) (d = depth)

**Behavior**:
1. If previous sibling node exists, return that sibling's last descendant
2. Return parent node
3. Return `null` if none

### `compareDocumentOrder(nodeId1: string, nodeId2: string): number`
- **Description**: Compare document order of two nodes
- **Returns**: 
  - `-1`: nodeId1 is before nodeId2
  - `0`: same node
  - `1`: nodeId1 is after nodeId2
- **Complexity**: O(d) (d = depth)

---

## Conditional Search

### `find(predicate: (nodeId: string, node: INode) => boolean): string | null`
- **Description**: Find first node matching condition
- **Returns**: Node ID or `null` (not found)
- **Complexity**: O(n) (n = total number of nodes)

### `findAll(predicate: (nodeId: string, node: INode) => boolean): string[]`
- **Description**: Find all nodes matching condition
- **Returns**: Array of node IDs
- **Complexity**: O(n) (n = total number of nodes)

---

## Tree Traversal

### `createDocumentIterator(options?: DocumentIteratorOptions): DocumentIterator`
- **Description**: Create Iterator for document traversal
- **Returns**: `DocumentIterator` instance
- **Options**:
  - `startNodeId`: Start node ID (default: root)
  - `reverse`: Whether to traverse in reverse
  - `maxDepth`: Maximum depth limit
  - `filter`: Type filter
  - `customFilter`: Custom filter
  - `shouldStop`: Stop condition
  - `range`: Traversal range limit

**Usage example**:
```typescript
const iterator = dataStore.createDocumentIterator({
  filter: { type: 'inline-text' },
  maxDepth: 3
});

for (const nodeId of iterator) {
  const node = dataStore.getNode(nodeId);
  // Process...
}
```

### `traverse(visitor: DocumentVisitor, options?: VisitorTraversalOptions): TraversalResult`
- **Description**: Document traversal using Visitor pattern
- **Returns**: Traversal result (`visitedCount`, `skippedCount`, `stopped`)
- **Visitor interface**:
  - `enter?(nodeId: string, node: INode, context?: any): void`
  - `visit(nodeId: string, node: INode, context?: any): void | boolean`
  - `exit?(nodeId: string, node: INode, context?: any): void`
  - `shouldVisitChildren?(nodeId: string, node: INode): boolean`

**Usage example**:
```typescript
const result = dataStore.traverse({
  visit: (nodeId, node) => {
    console.log(`Visiting: ${nodeId}`);
    return true; // Continue traversal
  },
  shouldVisitChildren: (nodeId, node) => {
    return node.stype !== 'inline-text'; // Skip children of inline-text
  }
});
```

---

## Status Check

### `isRootNode(nodeId: string): boolean`
- **Description**: Check if root node
- **Returns**: `true` if root node, `false` otherwise
- **Complexity**: O(1)

### `isLeafNode(nodeId: string): boolean`
- **Description**: Check if leaf node (node with no children)
- **Returns**: `true` if leaf node, `false` otherwise
- **Complexity**: O(1)

---

## Statistics and Information

### `getNodeCount(): number`
- **Description**: Lookup total node count
- **Returns**: Number of nodes
- **Complexity**: O(1)

### `getAllNodes(): INode[]`
- **Description**: Lookup all nodes
- **Returns**: Array of nodes
- **Complexity**: O(n) (n = total number of nodes)

### `getAllNodesMap(): Map<string, INode>`
- **Description**: Lookup all nodes as Map
- **Returns**: Node Map (ID → node)
- **Complexity**: O(n) (n = total number of nodes)

### `getStats(): NodeStats`
- **Description**: Lookup node statistics
- **Returns**: Statistics object
  - `total`: Total number of nodes
  - `byType`: Number of nodes by type
  - `byDepth`: Number of nodes by depth
- **Complexity**: O(n) (n = total number of nodes)

---

## Range Queries

### `getNodesInRange(): string[]`
- **Description**: Lookup nodes in range (based on set range)
- **Returns**: Array of node IDs
- **Complexity**: O(n) (n = number of nodes in range)

### `getRangeNodeCount(): number`
- **Description**: Lookup node count in range
- **Returns**: Number of nodes
- **Complexity**: O(n) (n = number of nodes in range)

### `getRangeInfo(): RangeInfo | null`
- **Description**: Lookup range information
- **Returns**: Range information object or `null`
  - `start`: Start node ID
  - `end`: End node ID
  - `includeStart`: Whether to include start node
  - `includeEnd`: Whether to include end node
- **Complexity**: O(1)

---

## Function Classification Summary

### ✅ Implementation Complete
- ✅ Basic lookup functions (hasNode, getNode, getRootNode)
- ✅ Hierarchical structure navigation (getParent, getChildren, getFirstChild, getLastChild, getAllDescendants, getAllAncestors, getNodePath, getNodeDepth, isDescendant, getCommonAncestor, getDistance)
- ✅ Sibling node navigation (getSiblings, getSiblingIndex, getPreviousSibling, getNextSibling, getFirstSibling, getLastSibling)
- ✅ Document order traversal (getNextNode, getPreviousNode, compareDocumentOrder)
- ✅ Conditional search (find, findAll)
- ✅ Tree traversal (createDocumentIterator, traverse)
- ✅ Status check (isRootNode, isLeafNode)
- ✅ Statistics and information (getNodeCount, getAllNodes, getAllNodesMap, getStats)
- ✅ Range queries (getNodesInRange, getRangeNodeCount, getRangeInfo)

### ✅ Recently Added Functions
- ✅ `getFirstChild` - Lookup first child node
- ✅ `getLastChild` - Lookup last child node
- ✅ `getFirstSibling` - Lookup first sibling node
- ✅ `getLastSibling` - Lookup last sibling node
- ✅ `getCommonAncestor` - Find common ancestor of two nodes
- ✅ `getDistance` - Calculate distance between two nodes

### 🔄 Areas for Improvement
- [ ] Performance optimization: Improve O(n) complexity of sibling navigation functions to O(1) (index caching)

---

## Usage Examples

### Sibling Node Navigation
```typescript
// Find previous sibling
const prevSiblingId = dataStore.getPreviousSibling('text-2');
if (prevSiblingId) {
  const prevSibling = dataStore.getNode(prevSiblingId);
  console.log('Previous sibling:', prevSibling);
}

// Find next sibling
const nextSiblingId = dataStore.getNextSibling('text-2');
if (nextSiblingId) {
  const nextSibling = dataStore.getNode(nextSiblingId);
  console.log('Next sibling:', nextSibling);
}

// Find first sibling
const firstSiblingId = dataStore.getFirstSibling('text-2');
if (firstSiblingId) {
  const firstSibling = dataStore.getNode(firstSiblingId);
  console.log('First sibling:', firstSibling);
}

// Find last sibling
const lastSiblingId = dataStore.getLastSibling('text-2');
if (lastSiblingId) {
  const lastSibling = dataStore.getNode(lastSiblingId);
  console.log('Last sibling:', lastSibling);
}
```

### Child Node Navigation
```typescript
// Find first child
const firstChildId = dataStore.getFirstChild('paragraph-1');
if (firstChildId) {
  const firstChild = dataStore.getNode(firstChildId);
  console.log('First child:', firstChild);
}

// Find last child
const lastChildId = dataStore.getLastChild('paragraph-1');
if (lastChildId) {
  const lastChild = dataStore.getNode(lastChildId);
  console.log('Last child:', lastChild);
}
```

### Common Ancestor and Distance Calculation
```typescript
// Find common ancestor
const commonAncestorId = dataStore.getCommonAncestor('text-1', 'text-3');
if (commonAncestorId) {
  const commonAncestor = dataStore.getNode(commonAncestorId);
  console.log('Common ancestor:', commonAncestor);
}

// Calculate distance between two nodes
const distance = dataStore.getDistance('text-1', 'text-3');
console.log('Distance:', distance); // Sum of paths to common ancestor
```

### Document Order Traversal
```typescript
// Find next node (child first)
let currentNodeId = 'paragraph-1';
while (currentNodeId) {
  const node = dataStore.getNode(currentNodeId);
  console.log('Current node:', node);
  currentNodeId = dataStore.getNextNode(currentNodeId);
}
```

### Conditional Search
```typescript
// Find node of specific type
const textNodeId = dataStore.find((nodeId, node) => {
  return node.stype === 'inline-text' && node.text?.includes('hello');
});

// Find all text nodes
const textNodeIds = dataStore.findAll((nodeId, node) => {
  return node.stype === 'inline-text';
});
```

### Tree Traversal
```typescript
// Use Iterator
const iterator = dataStore.createDocumentIterator({
  filter: { type: 'inline-text' },
  maxDepth: 2
});

for (const nodeId of iterator) {
  const node = dataStore.getNode(nodeId);
  console.log('Visiting:', nodeId, node);
}

// Use Visitor pattern
dataStore.traverse({
  enter: (nodeId, node) => {
    console.log('Entering:', nodeId);
  },
  visit: (nodeId, node) => {
    console.log('Visiting:', nodeId);
    return true; // Continue traversal
  },
  exit: (nodeId, node) => {
    console.log('Exiting:', nodeId);
  }
});
```
