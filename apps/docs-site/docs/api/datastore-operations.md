# DataStore Operations API

DataStore operations are low-level operations that directly manipulate the DataStore with overlay and lock support. They are organized into logical classes.

## Overview

DataStore operations are grouped into the following classes:

- **CoreOperations**: Basic CRUD operations (setNode, getNode, deleteNode, etc.)
- **ContentOperations**: Parent-child relationship management (addChild, removeChild, moveNode, etc.)
- **RangeOperations**: Text range operations (insertText, deleteText, replaceText, etc.)
- **MarkOperations**: Mark management (normalizeMarks, addMark, removeMark, etc.)
- **QueryOperations**: Node querying and searching
- **SplitMergeOperations**: Node splitting and merging
- **DecoratorOperations**: Decorator management
- **UtilityOperations**: Utility functions (editable node detection, traversal, etc.)
- **SerializationOperations**: Serialization and deserialization

## Usage Pattern

All DataStore operations are accessed through the DataStore instance:

```typescript
import { DataStore } from '@barocss/datastore';

const dataStore = new DataStore();

// Operations are accessed via dataStore properties
dataStore.core.setNode(node);
dataStore.content.addChild(parentId, child);
dataStore.range.insertText(range, 'Hello');
dataStore.mark.normalizeMarks(nodeId);
dataStore.query.findNodesByType('paragraph');
dataStore.splitMerge.splitTextNode('text-1', 5);
dataStore.utility.getPreviousEditableNode('text-1');
```

**Note**: DataStore operations automatically use overlay when a transaction is active (via `dataStore.begin()`).

## Operation Categories

### When to Use Each Class

| Task | Use This Class | Example |
|------|----------------|---------|
| Create/Read/Update/Delete nodes | `CoreOperations` | `dataStore.core.setNode()`, `dataStore.core.getNode()` |
| Manage parent-child relationships | `ContentOperations` | `dataStore.content.addChild()`, `dataStore.content.moveNode()` |
| Manipulate text ranges | `RangeOperations` | `dataStore.range.insertText()`, `dataStore.range.deleteText()` |
| Manage marks | `MarkOperations` | `dataStore.mark.normalizeMarks()`, `dataStore.mark.toggleMark()` |
| Query/search nodes | `QueryOperations` | `dataStore.query.findNodesByType()`, `dataStore.query.searchText()` |
| Split/merge nodes | `SplitMergeOperations` | `dataStore.splitMerge.splitTextNode()`, `dataStore.splitMerge.mergeTextNodes()` |
| Utility functions | `UtilityOperations` | `dataStore.utility.getParent()`, `dataStore.utility.isLeafNode()` |
| Decorator management | `DecoratorOperations` | See [Decorators Guide](../concepts/decorators) |
| Serialization | `SerializationOperations` | See DataStore README |

---

## CoreOperations

Basic CRUD operations for nodes.

### `setNode(node: INode, validate?: boolean): void`

Creates or updates a node in DataStore.

**Parameters:**
- `node`: Node to set (assigns `sid` if missing)
- `validate`: Whether to validate against schema (default: `true`)

**Behavior:**
- Assigns `sid` if missing using `DataStore.generateId()`
- Validates against schema if `validate=true` and schema exists
- Converts object children in content to IDs recursively
- Overlay-aware: writes go to overlay if transaction active
- Emits `'create'` or `'update'` operation event

**Example:**
```typescript
dataStore.core.setNode({
  sid: 'p1',
  stype: 'paragraph',
  text: 'Hello',
  content: []
});
```

### `getNode(nodeId: string): INode | undefined`

Retrieves a node by ID.

**Parameters:**
- `nodeId`: Node ID (SID)

**Returns:**
- `INode | undefined`: Node if found, `undefined` otherwise

**Read Path:**
1. Check `deletedNodeIds` → return `undefined` if deleted
2. Check `overlayNodes` → return overlay version if exists
3. Fallback to `baseNodes` → return base version

**Example:**
```typescript
const node = dataStore.core.getNode('text-1');
```

### `deleteNode(nodeId: string): boolean`

Deletes a node from DataStore.

**Parameters:**
- `nodeId`: Node ID to delete

**Returns:**
- `boolean`: `true` if deleted, `false` if node not found

**Behavior:**
- Cannot delete root node (throws error)
- Removes node from parent's content array
- Emits `'delete'` operation event
- Overlay-aware

**Example:**
```typescript
const deleted = dataStore.core.deleteNode('node-1');
```

### `updateNode(nodeId: string, updates: Partial<INode>, validate?: boolean): { valid: boolean; errors: string[] } | null`

Updates a node with partial changes.

**Parameters:**
- `nodeId`: Node ID to update
- `updates`: Partial node data to apply
- `validate`: Whether to validate (default: `true`)

**Returns:**
- Validation result: `{ valid: boolean; errors: string[] }` or `null`

**Behavior:**
- Merges fields (attributes shallow-merge)
- Validates against schema if `validate=true`
- Overlay-aware: writes go to overlay if transaction active
- Emits `'update'` operation event

**Example:**
```typescript
const result = dataStore.core.updateNode('text-1', { 
  text: 'Updated text' 
});
```

### `createNodeWithChildren(node: INode, schema?: Schema): INode`

Creates a node with all its children recursively.

**Parameters:**
- `node`: Node with nested children (objects)
- `schema`: Optional schema for validation

**Returns:**
- `INode`: Created node with assigned IDs

**Behavior:**
- Recursively creates all child nodes
- Assigns IDs to all nodes
- Converts object children to ID arrays
- Overlay-aware

**Example:**
```typescript
const root = dataStore.core.createNodeWithChildren({
  stype: 'document',
  content: [
    {
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'Hello' }
      ]
    }
  ]
});
```

### `transformNode(nodeId: string, newType: string, newAttrs?: Record<string, any>): { valid: boolean; errors: string[]; newNodeId?: string }`

Transforms a node to a different type.

**Parameters:**
- `nodeId`: Node ID to transform
- `newType`: New schema type (`stype`)
- `newAttrs`: Optional new attributes

**Returns:**
- Validation result with optional `newNodeId`

**Example:**
```typescript
const result = dataStore.core.transformNode('p1', 'heading', { level: 1 });
```

---

## ContentOperations

Manages parent-child relationships and content ordering.

### `addChild(parentId: string, child: INode | string, position?: number): string`

Adds a child node to a parent's content array.

**Parameters:**
- `parentId`: Parent node ID
- `child`: Child node (object) or child ID (string)
- `position`: Insert position (default: end)

**Returns:**
- `string`: Child node ID

**Behavior:**
- Creates child if object provided (assigns ID if missing)
- Inserts child ID at position in parent's content array
- Updates child's `parentId`
- Emits `'update'` for parent
- Overlay-aware

**Example:**
```typescript
// Add existing node
const childId = dataStore.content.addChild('parent-1', 'child-1', 0);

// Create and add new node
const newChildId = dataStore.content.addChild('parent-1', {
  stype: 'paragraph',
  text: 'New paragraph'
}, 0);
```

### `removeChild(parentId: string, childId: string): boolean`

Removes a child from parent's content array.

**Parameters:**
- `parentId`: Parent node ID
- `childId`: Child node ID to remove

**Returns:**
- `boolean`: `true` if removed, `false` if not found

**Behavior:**
- Removes child ID from parent's content array
- Clears child's `parentId`
- Emits `'update'` for parent
- Overlay-aware

**Example:**
```typescript
const removed = dataStore.content.removeChild('parent-1', 'child-1');
```

### `moveNode(nodeId: string, newParentId: string, position?: number): boolean`

Moves a node to a new parent.

**Parameters:**
- `nodeId`: Node ID to move
- `newParentId`: New parent node ID
- `position`: Position in new parent (default: end)

**Returns:**
- `boolean`: `true` if moved, `false` if failed

**Behavior:**
- Removes from old parent's content array
- Adds to new parent's content array at position
- Updates node's `parentId`
- Emits `'move'` operation event
- Overlay-aware

**Example:**
```typescript
const moved = dataStore.content.moveNode('node-1', 'new-parent-1', 0);
```

### `reorderChildren(parentId: string, childIds: string[]): void`

Reorders children in a parent's content array.

**Parameters:**
- `parentId`: Parent node ID
- `childIds`: New order of child IDs

**Behavior:**
- Updates parent's content array with new order
- Validates all child IDs exist
- Emits `'update'` for parent
- Overlay-aware

**Example:**
```typescript
dataStore.content.reorderChildren('parent-1', ['child-3', 'child-1', 'child-2']);
```

---

## RangeOperations

Text range operations for manipulating text content within ranges.

### `insertText(contentRange: ModelSelection, text: string): string`

Inserts text at the specified range position.

**Parameters:**
- `contentRange`: Range where to insert (start=end for insertion point)
- `text`: Text to insert

**Returns:**
- `string`: Inserted text

**Behavior:**
- Inserts text at range position
- Updates marks to reflect insertion
- Uses `updateNode()` (overlay-aware)
- Handles single-node and multi-node ranges

**Example:**
```typescript
const inserted = dataStore.range.insertText({
  startNodeId: 'text-1',
  startOffset: 5,
  endNodeId: 'text-1',
  endOffset: 5
}, 'Hello');
```

### `deleteText(contentRange: ModelSelection): string`

Deletes text in the specified range.

**Parameters:**
- `contentRange`: Range to delete

**Returns:**
- `string`: Deleted text

**Behavior:**
- Fast-path for same-node deletion
- Multi-node: trims start node, clears middle nodes, trims end node
- Updates marks to reflect deletion (split/trim/shift)
- Uses `updateNode()` (overlay-aware)

**Example:**
```typescript
const deleted = dataStore.range.deleteText({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});
```

### `replaceText(contentRange: ModelSelection, newText: string): string`

Replaces text in the specified range.

**Parameters:**
- `contentRange`: Range to replace
- `newText`: New text

**Returns:**
- `string`: Replaced text (old text)

**Behavior:**
- Deletes old text and inserts new text
- Updates marks appropriately
- Uses `updateNode()` (overlay-aware)

**Example:**
```typescript
const replaced = dataStore.range.replaceText({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
}, 'New text');
```

### `extractText(contentRange: ModelSelection): string`

Extracts text from range without modifying nodes.

**Parameters:**
- `contentRange`: Range to extract

**Returns:**
- `string`: Extracted text

**Behavior:**
- Read-only operation (does not modify nodes)
- Uses DocumentIterator to traverse range
- Concatenates text from all nodes

**Example:**
```typescript
const extracted = dataStore.range.extractText({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-3',
  endOffset: 10
});
```

### `applyMark(contentRange: ModelSelection, mark: IMark): IMark`

Applies a mark to the specified range.

**Parameters:**
- `contentRange`: Range to apply mark
- `mark`: Mark to apply

**Returns:**
- `IMark`: Applied mark

**Behavior:**
- Adds mark to nodes in range
- Merges with existing marks
- Updates marks via `updateNode()` (overlay-aware)

**Example:**
```typescript
const mark = dataStore.range.applyMark({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
}, {
  type: 'bold',
  range: [0, 5]
});
```

### `removeMark(contentRange: ModelSelection, markType: string): number`

Removes a mark type from the specified range.

**Parameters:**
- `contentRange`: Range to remove mark
- `markType`: Mark type to remove

**Returns:**
- `number`: Number of marks removed

**Example:**
```typescript
const removed = dataStore.range.removeMark({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
}, 'bold');
```

### `toggleMark(contentRange: ModelSelection, markType: string, attrs?: Record<string, any>): void`

Toggles a mark on/off in the specified range.

**Parameters:**
- `contentRange`: Range to toggle mark
- `markType`: Mark type to toggle
- `attrs`: Optional mark attributes

**Behavior:**
- Adds mark if not present
- Removes mark if present
- Uses `updateNode()` (overlay-aware)

**Example:**
```typescript
dataStore.range.toggleMark({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
}, 'bold');
```

---

## MarkOperations

Mark management and normalization.

### `normalizeMarks(nodeId: string): void`

Normalizes marks for a node.

**Behavior:**
- Assigns full-range to marks missing range
- Clamps ranges to `[0, textLength]`
- Drops empty/invalid ranges
- Removes duplicates by `(type, attrs, range)`
- Merges overlapping marks with identical `(type, attrs)`
- Sorts by start position
- Persists via `updateNode()` (overlay-aware)

**Example:**
```typescript
dataStore.mark.normalizeMarks('text-1');
```

### `normalizeAllMarks(): number`

Normalizes marks for all nodes in DataStore.

**Returns:**
- `number`: Number of nodes normalized

**Example:**
```typescript
const count = dataStore.mark.normalizeAllMarks();
```

### `setMarks(nodeId: string, marks: IMark[], replace?: boolean): void`

Sets marks for a node.

**Parameters:**
- `nodeId`: Node ID
- `marks`: Array of marks to set
- `replace`: Whether to replace existing marks (default: `true`)

**Behavior:**
- Replaces or merges marks based on `replace` flag
- Uses `updateNode()` (overlay-aware)

**Example:**
```typescript
dataStore.mark.setMarks('text-1', [
  { type: 'bold', range: [0, 5] },
  { type: 'italic', range: [2, 7] }
]);
```

### `removeMark(nodeId: string, markType: string, range?: [number, number]): number`

Removes a mark type from a node.

**Parameters:**
- `nodeId`: Node ID
- `markType`: Mark type to remove
- `range`: Optional range to remove from

**Returns:**
- `number`: Number of marks removed

**Example:**
```typescript
const removed = dataStore.mark.removeMark('text-1', 'bold', [0, 5]);
```

### `updateMark(nodeId: string, markType: string, attrs: Record<string, any>, range?: [number, number]): number`

Updates attributes of a mark type.

**Parameters:**
- `nodeId`: Node ID
- `markType`: Mark type to update
- `attrs`: New attributes
- `range`: Optional range to update

**Returns:**
- `number`: Number of marks updated

**Example:**
```typescript
const updated = dataStore.mark.updateMark('text-1', 'link', { href: 'https://example.com' });
```

### `toggleMark(nodeId: string, markType: string, attrs?: Record<string, any>, range?: [number, number]): void`

Toggles a mark on/off for a node.

**Parameters:**
- `nodeId`: Node ID
- `markType`: Mark type to toggle
- `attrs`: Optional mark attributes
- `range`: Optional range to toggle

**Example:**
```typescript
dataStore.mark.toggleMark('text-1', 'bold', undefined, [0, 5]);
```

---

## QueryOperations

Node querying and searching.

### `findNodes(predicate: (node: INode) => boolean): INode[]`

Finds nodes matching a predicate.

**Parameters:**
- `predicate`: Function that returns `true` for matching nodes

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const nodes = dataStore.query.findNodes(node => node.stype === 'paragraph');
```

### `findNodesByType(stype: string): INode[]`

Finds nodes by schema type.

**Parameters:**
- `stype`: Schema type to find

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const paragraphs = dataStore.query.findNodesByType('paragraph');
```

### `findNodesByAttribute(key: string, value: any): INode[]`

Finds nodes by attribute value.

**Parameters:**
- `key`: Attribute key
- `value`: Attribute value

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const headings = dataStore.query.findNodesByAttribute('level', 1);
```

### `findNodesByText(text: string): INode[]`

Finds nodes containing text.

**Parameters:**
- `text`: Text to search for

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const nodes = dataStore.query.findNodesByText('Hello');
```

### `getNodeChildren(nodeId: string): INode[]`

Gets direct children of a node.

**Parameters:**
- `nodeId`: Parent node ID

**Returns:**
- `INode[]`: Array of child nodes

**Example:**
```typescript
const children = dataStore.query.getNodeChildren('parent-1');
```

### `getNodeChildrenDeep(nodeId: string): INode[]`

Gets all descendants of a node (recursive).

**Parameters:**
- `nodeId`: Parent node ID

**Returns:**
- `INode[]`: Array of all descendant nodes

**Example:**
```typescript
const allDescendants = dataStore.query.getNodeChildrenDeep('parent-1');
```

---

## SplitMergeOperations

Node splitting and merging operations.

### `splitTextNode(nodeId: string, splitPosition: number): string`

Splits a text node at the specified position.

**Parameters:**
- `nodeId`: Text node ID to split
- `splitPosition`: Position to split at

**Returns:**
- `string`: ID of the new right node

**Behavior:**
- Creates new node with text after split position
- Updates original node with text before split position
- Preserves marks appropriately (splits mark ranges)
- Updates parent's content array
- Overlay-aware

**Example:**
```typescript
const rightNodeId = dataStore.splitMerge.splitTextNode('text-1', 5);
// Original: 'Hello World' → Left: 'Hello', Right: ' World'
```

### `mergeTextNodes(leftNodeId: string, rightNodeId: string): string`

Merges two adjacent text nodes.

**Parameters:**
- `leftNodeId`: Left node ID
- `rightNodeId`: Right node ID

**Returns:**
- `string`: ID of merged node (left node ID)

**Behavior:**
- Concatenates text from both nodes
- Merges marks (adjusts ranges)
- Removes right node
- Updates parent's content array
- Overlay-aware

**Example:**
```typescript
const mergedId = dataStore.splitMerge.mergeTextNodes('text-1', 'text-2');
// Left: 'Hello', Right: ' World' → Merged: 'Hello World'
```

### `splitBlockNode(nodeId: string, splitPosition: number): string`

Splits a block node at the specified position.

**Parameters:**
- `nodeId`: Block node ID to split
- `splitPosition`: Position in content array to split at

**Returns:**
- `string`: ID of the new right node

**Behavior:**
- Creates new block with children after split position
- Updates original block with children before split position
- Updates parent's content array
- Overlay-aware

**Example:**
```typescript
const rightNodeId = dataStore.splitMerge.splitBlockNode('block-1', 2);
// Original: [child-1, child-2, child-3, child-4]
// Left: [child-1, child-2], Right: [child-3, child-4]
```

### `mergeBlockNodes(leftNodeId: string, rightNodeId: string): string`

Merges two adjacent block nodes.

**Parameters:**
- `leftNodeId`: Left block node ID
- `rightNodeId`: Right block node ID

**Returns:**
- `string`: ID of merged node (left node ID)

**Behavior:**
- Merges children from both blocks
- Removes right node
- Updates parent's content array
- Overlay-aware

**Example:**
```typescript
const mergedId = dataStore.splitMerge.mergeBlockNodes('block-1', 'block-2');
// Left: [child-1, child-2], Right: [child-3, child-4]
// Merged: [child-1, child-2, child-3, child-4]
```

### `autoMergeTextNodes(nodeId: string): string`

Automatically merges adjacent text nodes if they can be merged.

**Parameters:**
- `nodeId`: Node ID to check

**Returns:**
- `string`: ID of merged node or original node ID

**Behavior:**
- Checks if node can be merged with next sibling
- Merges if same type and no marks
- Overlay-aware

**Example:**
```typescript
const mergedId = dataStore.splitMerge.autoMergeTextNodes('text-1');
```

### `insertText(nodeId: string, position: number, text: string): string`

Inserts text at a position in a text node (single-node operation).

**Parameters:**
- `nodeId`: Text node ID
- `position`: Position to insert at
- `text`: Text to insert

**Returns:**
- `string`: Inserted text

**Behavior:**
- Single-node text insertion
- Updates marks appropriately
- Overlay-aware

**Example:**
```typescript
const inserted = dataStore.splitMerge.insertText('text-1', 5, 'Hello');
```

### `deleteTextRange(nodeId: string, startPosition: number, endPosition: number): string`

Deletes text in a range within a single node.

**Parameters:**
- `nodeId`: Text node ID
- `startPosition`: Start position
- `endPosition`: End position

**Returns:**
- `string`: Deleted text

**Behavior:**
- Single-node text deletion
- Updates marks appropriately
- Overlay-aware

**Example:**
```typescript
const deleted = dataStore.splitMerge.deleteTextRange('text-1', 0, 5);
```

### `replaceTextRange(nodeId: string, startPosition: number, endPosition: number, newText: string): string`

Replaces text in a range within a single node.

**Parameters:**
- `nodeId`: Text node ID
- `startPosition`: Start position
- `endPosition`: End position
- `newText`: New text

**Returns:**
- `string`: Replaced text (old text)

**Behavior:**
- Single-node text replacement
- Updates marks appropriately
- Overlay-aware

**Example:**
```typescript
const replaced = dataStore.splitMerge.replaceTextRange('text-1', 0, 5, 'New');
```

---

## QueryOperations

Node querying and searching operations.

### `findNodes(predicate: (node: INode) => boolean): INode[]`

Finds nodes matching a predicate (includes orphaned nodes).

**Parameters:**
- `predicate`: Function that returns `true` for matching nodes

**Returns:**
- `INode[]`: Array of matching nodes

**Behavior:**
- Iterates through ALL nodes (including orphaned)
- Overlay-aware
- Order not guaranteed

**Example:**
```typescript
const nodes = dataStore.query.findNodes(node => node.stype === 'paragraph');
```

### `findNodesByType(stype: string): INode[]`

Finds nodes by schema type (uses DocumentIterator for performance).

**Parameters:**
- `stype`: Schema type to find

**Returns:**
- `INode[]`: Array of matching nodes

**Behavior:**
- Uses DocumentIterator with type filter
- Order follows document traversal
- More efficient than `findNodes()`

**Example:**
```typescript
const paragraphs = dataStore.query.findNodesByType('paragraph');
```

### `findNodesByAttribute(key: string, value: any): INode[]`

Finds nodes by attribute value.

**Parameters:**
- `key`: Attribute key
- `value`: Attribute value

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const headings = dataStore.query.findNodesByAttribute('level', 1);
```

### `findNodesByText(text: string): INode[]`

Finds nodes containing text.

**Parameters:**
- `text`: Text to search for

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const nodes = dataStore.query.findNodesByText('Hello');
```

### `findChildrenByParentId(parentId: string): INode[]`

Gets direct children of a node.

**Parameters:**
- `parentId`: Parent node ID

**Returns:**
- `INode[]`: Array of direct child nodes

**Example:**
```typescript
const children = dataStore.query.findChildrenByParentId('parent-1');
```

### `getNodeChildren(nodeId: string): INode[]`

Gets direct children (alias for `findChildrenByParentId`).

**Example:**
```typescript
const children = dataStore.query.getNodeChildren('parent-1');
```

### `getNodeChildrenDeep(nodeId: string): INode[]`

Gets all descendants recursively.

**Parameters:**
- `nodeId`: Parent node ID

**Returns:**
- `INode[]`: Array of all descendant nodes

**Example:**
```typescript
const allDescendants = dataStore.query.getNodeChildrenDeep('parent-1');
```

### `findRootNodes(): INode[]`

Finds all root nodes (nodes without parent).

**Returns:**
- `INode[]`: Array of root nodes

**Example:**
```typescript
const roots = dataStore.query.findRootNodes();
```

### `searchText(query: string): INode[]`

Searches for nodes containing text (full-text search).

**Parameters:**
- `query`: Search query

**Returns:**
- `INode[]`: Array of matching nodes

**Example:**
```typescript
const results = dataStore.query.searchText('Hello World');
```

---

## UtilityOperations

Utility functions for node operations and traversal.

### `hasNode(nodeId: string): boolean`

Checks if a node exists.

**Parameters:**
- `nodeId`: Node ID to check

**Returns:**
- `boolean`: `true` if node exists

**Example:**
```typescript
const exists = dataStore.utility.hasNode('node-1');
```

### `getChildCount(nodeId: string): number`

Gets the number of direct children.

**Parameters:**
- `nodeId`: Parent node ID

**Returns:**
- `number`: Number of direct children

**Example:**
```typescript
const count = dataStore.utility.getChildCount('parent-1');
```

### `isLeafNode(nodeId: string): boolean`

Checks if a node is a leaf (no children).

**Parameters:**
- `nodeId`: Node ID to check

**Returns:**
- `boolean`: `true` if leaf node

**Example:**
```typescript
const isLeaf = dataStore.utility.isLeafNode('text-1');
```

### `isRootNode(nodeId: string): boolean`

Checks if a node is the root node.

**Parameters:**
- `nodeId`: Node ID to check

**Returns:**
- `boolean`: `true` if root node

**Example:**
```typescript
const isRoot = dataStore.utility.isRootNode('document-1');
```

### `getChildren(nodeId: string): INode[]`

Gets direct children nodes.

**Parameters:**
- `nodeId`: Parent node ID

**Returns:**
- `INode[]`: Array of child nodes

**Example:**
```typescript
const children = dataStore.utility.getChildren('parent-1');
```

### `getParent(nodeId: string): INode | undefined`

Gets the parent node.

**Parameters:**
- `nodeId`: Child node ID

**Returns:**
- `INode | undefined`: Parent node or `undefined`

**Example:**
```typescript
const parent = dataStore.utility.getParent('child-1');
```

### `getSiblings(nodeId: string): INode[]`

Gets sibling nodes (same parent).

**Parameters:**
- `nodeId`: Node ID

**Returns:**
- `INode[]`: Array of sibling nodes

**Example:**
```typescript
const siblings = dataStore.utility.getSiblings('node-1');
```

### `getPreviousSibling(nodeId: string): string | null`

Gets the previous sibling node ID.

**Parameters:**
- `nodeId`: Node ID

**Returns:**
- `string | null`: Previous sibling ID or `null`

**Example:**
```typescript
const prevSibling = dataStore.utility.getPreviousSibling('node-2');
```

### `getNextSibling(nodeId: string): string | null`

Gets the next sibling node ID.

**Parameters:**
- `nodeId`: Node ID

**Returns:**
- `string | null`: Next sibling ID or `null`

**Example:**
```typescript
const nextSibling = dataStore.utility.getNextSibling('node-1');
```

### `getPreviousEditableNode(nodeId: string): string | null`

Gets the previous editable node in document order.

**Parameters:**
- `nodeId`: Current node ID

**Returns:**
- `string | null`: Previous editable node ID or `null`

**Behavior:**
- Skips non-editable nodes (blocks, documents)
- Returns only editable nodes (text, inline)

**Example:**
```typescript
const prevNode = dataStore.utility.getPreviousEditableNode('text-3');
```

### `getNextEditableNode(nodeId: string): string | null`

Gets the next editable node in document order.

**Parameters:**
- `nodeId`: Current node ID

**Returns:**
- `string | null`: Next editable node ID or `null`

**Example:**
```typescript
const nextNode = dataStore.utility.getNextEditableNode('text-1');
```

---

## DecoratorOperations

Decorator management operations.

### `adjustRanges(...)`

Adjusts decorator ranges after text changes.

**Note**: See [Decorators Guide](../concepts/decorators) for detailed documentation.

---

## SerializationOperations

Serialization and deserialization operations.

**Note**: See DataStore README for detailed documentation.

---

## Overlay and Lock Behavior

All DataStore operations automatically respect:

1. **Overlay**: When `dataStore.begin()` is called, all writes go to overlay
2. **Lock**: Operations should be executed within a lock (acquired via `acquireLock()`)

**Example with Transaction:**
```typescript
// Lock and overlay are managed by TransactionManager
const result = await transaction(editor, [
  ...control('text-1', [
    insertText(5, 'Hello')
  ])
]).commit();

// Internally:
// 1. acquireLock()
// 2. begin() (overlay)
// 3. RangeOperations.insertText() → updateNode() → overlay
// 4. end() (get operations)
// 5. commit() (apply to base)
// 6. releaseLock()
```

---

## Related

- [Operations Overview](./operations-overview) - Understanding the operation hierarchy
- [Model Operations API](./model-operations) - Model layer operations
- [Model Operation DSL API](./model-operation-dsl) - DSL helpers
- [Operation Selection Guide](./operation-selection-guide) - How to choose operations
