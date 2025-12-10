# DataStore API Reference

This document summarizes public API signatures and key behaviors. For detailed policies, see `datastore-spec.md`.

## Transaction (Collection)

- begin(): void
- getCollectedOperations(): AtomicOperation[]
- end(): AtomicOperation[]
- commit(): void
- rollback(): void

## Core/Utility

- setNode(node: INode, validate = true): void
- updateNode(nodeId: string, updates: Partial<INode>, validate = true): { valid: true; errors: [] } | { valid: false; errors: string[] }
- deleteNode(nodeId: string): boolean
- getNode(nodeId: string): INode | undefined
- createNodeWithChildren(node: INode, schema?: Schema): INode
- getAllNodes(): INode[]
- getAllNodesMap(): Map<string, INode>
- getRootNode(): INode | undefined
- getRootNodeId(): string | undefined
- setRoot(rootId: string): void
- setRootNodeId(nodeId: string): void

## Content

- addChild(parentId: string, child: INode | string, position?: number): string
- removeChild(parentId: string, childId: string): boolean
- moveNode(nodeId: string, newParentId: string, position?: number): void
- reorderChildren(parentId: string, childIds: string[]): void
- addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
- removeChildren(parentId: string, childIds: string[]): boolean[]
- moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
- copyNode(nodeId: string, newParentId?: string): string
- cloneNodeWithChildren(nodeId: string, newParentId?: string): string

## Marks/Range(Text)

- normalizeMarks(nodeId: string): void
- normalizeAllMarks(): number
- getMarkStatistics(nodeId: string): { totalMarks: number; markTypes: Record<string, number>; overlappingMarks: number; emptyMarks: number }
- removeEmptyMarks(nodeId: string): number

- deleteText(range: ContentRange): string
- extractText(range: ContentRange): string
- insertText(range: ContentRange, text: string): string
- replaceText(range: ContentRange, newText: string): string
- copyText(range: ContentRange): string
- moveText(fromRange: ContentRange, toRange: ContentRange): string
- duplicateText(range: ContentRange): string
- applyMark(range: ContentRange, mark: IMark): IMark
- toggleMark(range: ContentRange, markType: string, attrs?: Record<string, any>): void
- removeMark(range: ContentRange, markType: string): number
- clearFormatting(range: ContentRange): number
- constrainMarksToRange(range: ContentRange): number
- findText(range: ContentRange, searchText: string): number
- getTextLength(range: ContentRange): number
- trimText(range: ContentRange): number
- normalizeWhitespace(range: ContentRange): string
- wrap(range: ContentRange, prefix: string, suffix: string): string
- unwrap(range: ContentRange, prefix: string, suffix: string): string
- replace(range: ContentRange, pattern: string | RegExp, replacement: string): number
- findAll(range: ContentRange, pattern: string | RegExp): Array<{ start: number; end: number }>
- expandToWord(range: ContentRange): ContentRange
- expandToLine(range: ContentRange): ContentRange
- normalizeRange(range: ContentRange): ContentRange

## Iterators & Visitors

- createDocumentIterator(options?: DocumentIteratorOptions): DocumentIterator
- createRangeIterator(startNodeId: string, endNodeId: string, options?: { includeStart?: boolean; includeEnd?: boolean; filter?: any; customFilter?: (nodeId: string, node: any) => boolean }): any

- traverse(visitor: DocumentVisitor, options?: VisitorTraversalOptions): { visitedCount: number; skippedCount: number; stopped: boolean }
- traverse(visitors: DocumentVisitor[], options?: VisitorTraversalOptions): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>
- traverse(...visitors: DocumentVisitor[]): Array<{ visitor: DocumentVisitor; result: { visitedCount: number; skippedCount: number; stopped: boolean } }>

This document provides a brief summary of DataStore’s public API. For detailed behavior/design, see `datastore-spec.md`.

## Collection (Lightweight Transaction)
- `begin(): void`
- `getCollectedOperations(): AtomicOperation[]`
- `end(): AtomicOperation[]`
- `commit(): void`
- `rollback(): void`

### Notes
- normalizeWhitespace, trimText: when called repeatedly on the same range with no content change, they do not emit update operations.

## Content
- `addChild(parentId, child, position?) → string`
- `removeChild(parentId, childId) → boolean`
- `reorderChildren(parentId, childIds) → void`
- `moveNode(nodeId, newParentId, position?) → void`
- `moveChildren(fromParentId, toParentId, childIds, position?) → void`
- `copyNode(nodeId, newParentId?) → string`
- `cloneNodeWithChildren(nodeId, newParentId?) → string`

## Range/Text/Mark
- Text: `deleteText`, `extractText`, `insertText`, `replaceText`, `copyText`, `moveText`, `duplicateText`
- Marks: `applyMark`, `removeMark`, `clearFormatting`, `toggleMark`, `constrainMarksToRange`
- Search/normalization: `findText`, `getTextLength`, `trimText`, `normalizeWhitespace`, `wrap`, `unwrap`, `replace`, `findAll`, `expandToWord`, `expandToLine`, `normalizeRange`

## Core/Utility
- Core: `setNode`, `updateNode`, `deleteNode`, `getNode`, `createNodeWithChildren`
- Utility: `getAllNodes`, `getAllNodesMap`, `getRootNodeId`, `getNodePath`, `getNodeDepth`, `compareDocumentOrder`, `getNextNode`, `getPreviousNode`, `createDocumentIterator`, `createRangeIterator`, `traverse`

## Operation Types (JSON)
Single op: `{ type, nodeId, timestamp, parentId?, position?, data? }`
Batch: `{ sessionId, version, operations: Operation[] }`

## 1. Overview

This document is a systematic reference of all DataStore APIs, including method signatures, parameters, return values, and usage examples.

## 2. DataStore Class

### 2.1 Constructor

```typescript
constructor(rootNodeId?: string, schema?: Schema, sessionId?: number)
```

**Parameters**:
- `rootNodeId` (optional): root node ID
- `schema` (optional): default schema
- `sessionId` (optional): session ID (default: 0)

**Example**:
```typescript
const dataStore = new DataStore();
const dataStoreWithSchema = new DataStore('doc-1', schema, 1);
```

### 2.2 Operation Class Accessors

```typescript
// Accessors for each operation class
readonly core: CoreOperations;
readonly query: QueryOperations;
readonly content: ContentOperations;
readonly splitMerge: SplitMergeOperations;
readonly marks: MarkOperations;
readonly multiNodeRange: MultiNodeRangeOperations;
readonly utility: UtilityOperations;
```

## 3. CoreOperations

### 3.1 setNode

```typescript
setNode(node: INode, validate: boolean = true): void
```

**Description**: Stores a node in DataStore.

**Parameters**:
- `node`: node to store
- `validate`: whether to validate against schema (default: true)

**Example**:
```typescript
dataStore.setNode({
  id: 'text-1',
  type: 'inline-text',
  text: 'Hello World'
}, true);
```

### 3.2 getNode

```typescript
getNode(nodeId: string): INode | undefined
```

**Description**: Retrieves a node by ID.

**Parameters**:
- `nodeId`: node ID to retrieve

**Returns**: node object or undefined

**Example**:
```typescript
const node = dataStore.getNode('text-1');
if (node) {
  console.log(node.text);
}
```

### 3.3 deleteNode

```typescript
deleteNode(nodeId: string): boolean
```

**Description**: Deletes a node.

**Parameters**:
- `nodeId`: node ID to delete

**Returns**: whether deletion succeeded

**Example**:
```typescript
const deleted = dataStore.deleteNode('text-1');
```

### 3.4 updateNode

```typescript
updateNode(nodeId: string, updates: Partial<INode>, validate: boolean = true): { valid: boolean; errors: string[] } | null
```

**Description**: Updates a node.

**Parameters**:
- `nodeId`: node ID to update
- `updates`: properties to update
- `validate`: whether to validate against schema

**Returns**: validation result or null (if node doesn’t exist)

**Example**:
```typescript
const result = dataStore.updateNode('text-1', {
  text: 'Updated text',
  attributes: { class: 'highlight' }
});
```

### 3.5 createNodeWithChildren

```typescript
createNodeWithChildren(node: INode, schema?: Schema): INode
```

**Description**: Creates a node with nested structure.

**Parameters**:
- `node`: node to create (with nested structure)
- `schema`: schema to use

**Returns**: created node

**Example**:
```typescript
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

## 4. QueryOperations

### 4.1 findNodes

```typescript
findNodes(predicate: (node: INode) => boolean): INode[]
```

**Description**: Finds all nodes matching a condition.

**Parameters**:
- `predicate`: search condition function

**Returns**: array of matching nodes

**Example**:
```typescript
const paragraphs = dataStore.findNodes(node => node.type === 'paragraph');
```

### 4.2 findNodesByType

```typescript
findNodesByType(type: string): INode[]
```

**Description**: Finds nodes of a specific type.

**Parameters**:
- `type`: node type

**Returns**: array of nodes of that type

**Example**:
```typescript
const textNodes = dataStore.findNodesByType('inline-text');
```

### 4.3 findNodesByAttribute

```typescript
findNodesByAttribute(key: string, value: any): INode[]
```

**Description**: Finds nodes with a specific attribute. Uses full traversal including orphan nodes.

**Parameters**:
- `key`: attribute key
- `value`: attribute value

**Returns**: array of matching nodes (including orphans)

**Characteristics**:
- **Full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)

**Example**:
```typescript
const boldNodes = dataStore.findNodesByAttribute('class', 'bold');
```

### 4.4 findNodesByText

```typescript
findNodesByText(text: string): INode[]
```

**Description**: Finds nodes containing specific text. Uses full traversal including orphan nodes.

**Parameters**:
- `text`: text to search for

**Returns**: array of nodes containing that text (including orphans)

**Characteristics**:
- **Full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)

**Example**:
```typescript
const helloNodes = dataStore.findNodesByText('Hello');
```

### 4.5 findChildrenByParentId

```typescript
findChildrenByParentId(parentId: string): INode[]
```

**Description**: Returns direct children of a node as an object array. Optimized for performance via direct access.

**Parameters**:
- `parentId`: parent node ID

**Returns**: array of child nodes

**Characteristics**:
- **Direct access**: directly accesses parent node’s content array
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: document traversal order (if parent is connected)

**Example**:
```typescript
const children = dataStore.findChildrenByParentId('para-1');
```

### 4.6 getNodeChildrenDeep

```typescript
getNodeChildrenDeep(nodeId: string): INode[]
```

**Description**: Recursively retrieves all descendant nodes of a node.

**Parameters**:
- `nodeId`: parent node ID

**Returns**: array of all descendant nodes

**Example**:
```typescript
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');
```

### 4.7 getNodeWithChildren

```typescript
getNodeWithChildren(nodeId: string): INode | null
```

**Description**: Returns a node with all children in nested structure.

**Parameters**:
- `nodeId`: node ID

**Returns**: node with nested structure or null

**Example**:
```typescript
const nodeWithChildren = dataStore.getNodeWithChildren('para-1');
```

### 4.8 getAllNodesWithChildren

```typescript
getAllNodesWithChildren(): INode[]
```

**Description**: Returns all nodes in nested structure.

**Returns**: array of nested structures for all nodes

**Example**:
```typescript
const allNodes = dataStore.getAllNodesWithChildren();
```

### 4.9 searchText

```typescript
searchText(query: string): INode[]
```

**Description**: Searches nodes by text content (case-insensitive). Uses full traversal including orphan nodes.

**Parameters**:
- `query`: text to search for (case-insensitive)

**Returns**: array of nodes containing that text (including orphans)

**Characteristics**:
- **Full traversal**: searches all nodes including orphans
- **Overlay-aware**: reflects current state (including overlay changes)
- **Order**: Map iteration order (not guaranteed)
- **Case-insensitive**: converts both query and node text to lowercase for comparison

**Example**:
```typescript
const helloNodes = dataStore.searchText('hello world');
```

## 5. ContentOperations

### 5.1 addChild

```typescript
addChild(parentId: string, child: INode | string, position?: number): string
```

**Description**: Adds a child to a parent node.

**Parameters**:
- `parentId`: parent node ID
- `child`: child to add (node object or ID)
- `position`: insertion position (default: append to end)

**Returns**: ID of added child

**Example**:
```typescript
const childId = dataStore.addChild('para-1', {
  id: 'text-2',
  type: 'inline-text',
  text: 'New text'
}, 0);
```

### 5.2 removeChild

```typescript
removeChild(parentId: string, childId: string): boolean
```

**Description**: Removes a child from a parent node.

**Parameters**:
- `parentId`: parent node ID
- `childId`: child ID to remove

**Returns**: whether removal succeeded

**Example**:
```typescript
const removed = dataStore.removeChild('para-1', 'text-1');
```

### 5.3 moveNode

```typescript
moveNode(nodeId: string, newParentId: string, position?: number): void
```

**Description**: Moves a node to a different parent.

**Parameters**:
- `nodeId`: node ID to move
- `newParentId`: new parent ID
- `position`: new position (default: append to end)

**Example**:
```typescript
dataStore.moveNode('text-1', 'para-2', 1);
```

### 5.4 copyNode

```typescript
copyNode(nodeId: string, newParentId?: string): string
```

**Description**: Copies a node.

**Parameters**:
- `nodeId`: node ID to copy
- `newParentId`: new parent ID (default: original parent)

**Returns**: ID of copied node

**Example**:
```typescript
const copiedId = dataStore.copyNode('text-1', 'para-2');
```

### 5.5 cloneNodeWithChildren

```typescript
cloneNodeWithChildren(nodeId: string, newParentId?: string): string
```

**Description**: Copies a node and all its descendants.

**Parameters**:
- `nodeId`: node ID to copy
- `newParentId`: new parent ID

**Returns**: ID of copied node

**Example**:
```typescript
const clonedId = dataStore.cloneNodeWithChildren('para-1', 'doc-2');
```

### 5.6 reorderChildren

```typescript
reorderChildren(parentId: string, childIds: string[]): void
```

**Description**: Reorders child nodes.

**Parameters**:
- `parentId`: parent node ID
- `childIds`: array of child IDs in new order

**Example**:
```typescript
dataStore.reorderChildren('para-1', ['text-3', 'text-1', 'text-2']);
```

### 5.7 addChildren

```typescript
addChildren(parentId: string, children: (INode | string)[], position?: number): string[]
```

**Description**: Adds multiple child nodes in batch.

**Parameters**:
- `parentId`: parent node ID
- `children`: children to add
- `position`: insertion position

**Returns**: array of IDs of added children

**Example**:
```typescript
const childIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] }
]);
```

### 5.8 removeChildren

```typescript
removeChildren(parentId: string, childIds: string[]): boolean[]
```

**Description**: Removes multiple child nodes in batch.

**Parameters**:
- `parentId`: parent node ID
- `childIds`: array of child IDs to remove

**Returns**: array of removal success status for each child

**Example**:
```typescript
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);
```

### 5.9 moveChildren

```typescript
moveChildren(fromParentId: string, toParentId: string, childIds: string[], position?: number): void
```

**Description**: Moves multiple child nodes in batch.

**Parameters**:
- `fromParentId`: original parent ID
- `toParentId`: new parent ID
- `childIds`: array of child IDs to move
- `position`: new position

**Example**:
```typescript
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);
```

## 6. SplitMergeOperations

### 6.1 splitTextNode

```typescript
splitTextNode(nodeId: string, splitPosition: number): string
```

**Description**: Splits a text node at the specified position.

**Parameters**:
- `nodeId`: text node ID to split
- `splitPosition`: split position

**Returns**: ID of newly created right node

**Example**:
```typescript
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"
```

### 6.2 mergeTextNodes

```typescript
mergeTextNodes(leftNodeId: string, rightNodeId: string): string
```

**Description**: Merges two text nodes.

**Parameters**:
- `leftNodeId`: left node ID
- `rightNodeId`: right node ID

**Returns**: ID of merged node (left node)

**Example**:
```typescript
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

### 6.3 splitBlockNode

```typescript
splitBlockNode(nodeId: string, splitPosition: number): string
```

**Description**: Splits a block node at the specified position.

**Parameters**:
- `nodeId`: block node ID to split
- `splitPosition`: split position (child index)

**Returns**: ID of newly created right node

**Example**:
```typescript
const newBlockId = dataStore.splitBlockNode('para-1', 2);
```

### 6.4 mergeBlockNodes

```typescript
mergeBlockNodes(leftNodeId: string, rightNodeId: string): string
```

**Description**: Merges two block nodes.

**Parameters**:
- `leftNodeId`: left node ID
- `rightNodeId`: right node ID

**Returns**: ID of merged node (left node)

**Example**:
```typescript
const mergedId = dataStore.mergeBlockNodes('para-1', 'para-2');
```

### 6.5 splitTextRange

```typescript
splitTextRange(nodeId: string, startPosition: number, endPosition: number): string
```

**Description**: Splits a specific range of a text node.

**Parameters**:
- `nodeId`: text node ID to split
- `startPosition`: start position
- `endPosition`: end position

**Returns**: ID of middle node created

**Example**:
```typescript
const middleNodeId = dataStore.splitTextRange('text-1', 3, 8);
// "Hello World" → "Hel" + "lo Wo" + "rld"
```

### 6.6 autoMergeTextNodes

```typescript
autoMergeTextNodes(nodeId: string): string
```

**Description**: Automatically merges a node with adjacent text nodes on both sides.

**Parameters**:
- `nodeId`: center node ID

**Returns**: ID of merged node

**Example**:
```typescript
const mergedId = dataStore.autoMergeTextNodes('text-2');
```

### 6.7 insertText

```typescript
insertText(nodeId: string, position: number, text: string): string
```

**Description**: Inserts text into a text node.

**Parameters**:
- `nodeId`: text node ID
- `position`: insertion position
- `text`: text to insert

**Returns**: ID of modified node

**Example**:
```typescript
const newTextId = dataStore.insertText('text-1', 5, ' Beautiful');
// "Hello World" → "Hello Beautiful World"
```

### 6.8 deleteTextRange

```typescript
deleteTextRange(nodeId: string, startPosition: number, endPosition: number): string
```

**Description**: Deletes a specific range from a text node.

**Parameters**:
- `nodeId`: text node ID
- `startPosition`: start position
- `endPosition`: end position

**Returns**: ID of modified node

**Example**:
```typescript
const newTextId = dataStore.deleteTextRange('text-1', 5, 11);
// "Hello World" → "Hello"
```

### 6.9 replaceTextRange

```typescript
replaceTextRange(nodeId: string, startPosition: number, endPosition: number, newText: string): string
```

**Description**: Replaces a specific range in a text node with new text.

**Parameters**:
- `nodeId`: text node ID
- `startPosition`: start position
- `endPosition`: end position
- `newText`: new text to replace with

**Returns**: replaced original text

**Example**:
```typescript
const replacedText = dataStore.replaceTextRange('text-1', 6, 11, 'Universe');
// "Hello World" → "Hello Universe"
// Returns: "World"
```

## 7. MarkOperations

### 7.1 normalizeMarks

```typescript
normalizeMarks(nodeId: string): void
```

**Description**: Normalizes marks on a node.

**Parameters**:
- `nodeId`: node ID to normalize

**Example**:
```typescript
dataStore.normalizeMarks('text-1');
```

### 7.2 normalizeAllMarks

```typescript
normalizeAllMarks(): number
```

**Description**: Normalizes marks on all nodes.

**Returns**: number of normalized nodes

**Example**:
```typescript
const normalizedCount = dataStore.normalizeAllMarks();
```

### 7.3 getMarkStatistics

```typescript
getMarkStatistics(nodeId: string): {
  totalMarks: number;
  markTypes: Record<string, number>;
  overlappingMarks: number;
  emptyMarks: number;
}
```

**Description**: Retrieves mark statistics for a node.

**Parameters**:
- `nodeId`: node ID to get statistics for

**Returns**: mark statistics object

**Example**:
```typescript
const stats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${stats.totalMarks}`);
```

### 7.4 removeEmptyMarks

```typescript
removeEmptyMarks(nodeId: string): number
```

**Description**: Removes empty marks from a node.

**Parameters**:
- `nodeId`: node ID to remove empty marks from

**Returns**: number of marks removed

**Example**:
```typescript
const removedCount = dataStore.removeEmptyMarks('text-1');
```

## 8. MultiNodeRangeOperations

### 8.1 deleteMultiNodeRange

```typescript
deleteMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string
```

**Description**: Deletes text spanning multiple nodes.

**Parameters**:
- `startNodeId`: start node ID
- `startOffset`: start offset
- `endNodeId`: end node ID
- `endOffset`: end offset

**Returns**: ID of deleted content

**Example**:
```typescript
const deletedContent = dataStore.deleteMultiNodeRange('text-1', 5, 'text-3', 10);
```

### 8.2 insertTextAtMultiNodeRange

```typescript
insertTextAtMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, text: string): void
```

**Description**: Inserts text at a position spanning multiple nodes.

**Parameters**:
- `startNodeId`: start node ID
- `startOffset`: start offset
- `endNodeId`: end node ID
- `endOffset`: end offset
- `text`: text to insert

**Example**:
```typescript
dataStore.insertTextAtMultiNodeRange('text-1', 5, 'text-3', 10, 'New content');
```

### 8.3 extractMultiNodeRange

```typescript
extractMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): string
```

**Description**: Extracts text spanning multiple nodes.

**Parameters**:
- `startNodeId`: start node ID
- `startOffset`: start offset
- `endNodeId`: end node ID
- `endOffset`: end offset

**Returns**: ID of extracted text

**Example**:
```typescript
const extractedText = dataStore.extractMultiNodeRange('text-1', 0, 'text-3', 5);
```

### 8.4 applyMarkToMultiNodeRange

```typescript
applyMarkToMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, mark: IMark): void
```

**Description**: Applies a mark to a range spanning multiple nodes.

**Parameters**:
- `startNodeId`: start node ID
- `startOffset`: start offset
- `endNodeId`: end node ID
- `endOffset`: end offset
- `mark`: mark to apply

**Example**:
```typescript
dataStore.applyMarkToMultiNodeRange('text-1', 0, 'text-3', 5, {
  type: 'bold',
  range: [0, 20]
});
```

### 8.5 removeMarkFromMultiNodeRange

```typescript
removeMarkFromMultiNodeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number, markType: string): void
```

**Description**: Removes a mark from a range spanning multiple nodes.

**Parameters**:
- `startNodeId`: start node ID
- `startOffset`: start offset
- `endNodeId`: end node ID
- `endOffset`: end offset
- `markType`: mark type to remove

**Example**:
```typescript
dataStore.removeMarkFromMultiNodeRange('text-1', 0, 'text-3', 5, 'bold');
```

## 9. UtilityOperations

### 9.1 getNodeCount

```typescript
getNodeCount(): number
```

**Description**: Retrieves total node count.

**Returns**: node count

**Example**:
```typescript
const totalNodes = dataStore.getNodeCount();
```

### 9.2 clone

```typescript
clone(): DataStore
```

**Description**: Clones DataStore.

**Returns**: cloned DataStore instance

**Example**:
```typescript
const clonedStore = dataStore.clone();
```

### 9.3 getAllNodes

```typescript
getAllNodes(): INode[]
```

**Description**: Retrieves all nodes.

**Returns**: array of all nodes

**Example**:
```typescript
const allNodes = dataStore.getAllNodes();
```

### 9.4 getAllNodesMap

```typescript
getAllNodesMap(): Map<string, INode>
```

**Description**: Returns a Map of all nodes.

**Returns**: node Map

**Example**:
```typescript
const nodesMap = dataStore.getAllNodesMap();
```

### 9.5 hasNode

```typescript
hasNode(nodeId: string): boolean
```

**Description**: Checks if a node exists.

**Parameters**:
- `nodeId`: node ID to check

**Returns**: existence status

**Example**:
```typescript
const exists = dataStore.hasNode('text-1');
```

### 9.6 getChildCount

```typescript
getChildCount(nodeId: string): number
```

**Description**: Retrieves child count of a node.

**Parameters**:
- `nodeId`: parent node ID

**Returns**: child count

**Example**:
```typescript
const childCount = dataStore.getChildCount('para-1');
```

### 9.7 isLeafNode

```typescript
isLeafNode(nodeId: string): boolean
```

**Description**: Checks if a node is a leaf node.

**Parameters**:
- `nodeId`: node ID to check

**Returns**: whether it’s a leaf node

**Example**:
```typescript
const isLeaf = dataStore.isLeafNode('text-1');
```

### 9.8 isRootNode

```typescript
isRootNode(nodeId: string): boolean
```

**Description**: Checks if a node is the root node.

**Parameters**:
- `nodeId`: node ID to check

**Returns**: whether it’s the root node

**Example**:
```typescript
const isRoot = dataStore.isRootNode('doc-1');
```

### 9.9 isDescendant

```typescript
isDescendant(nodeId: string, ancestorId: string): boolean
```

**Description**: Checks if a node is a descendant of another node.

**Parameters**:
- `nodeId`: node ID to check
- `ancestorId`: ancestor node ID

**Returns**: whether it’s a descendant

**Example**:
```typescript
const isDescendant = dataStore.isDescendant('text-1', 'doc-1');
```

### 9.10 getNodePath

```typescript
getNodePath(nodeId: string): string[]
```

**Description**: Retrieves the path of a node.

**Parameters**:
- `nodeId`: node ID to get path for

**Returns**: path array (from root to the node)

**Example**:
```typescript
const path = dataStore.getNodePath('text-1');
// ['doc-1', 'para-1', 'text-1']
```

### 9.11 getNodeDepth

```typescript
getNodeDepth(nodeId: string): number
```

**Description**: Retrieves the depth of a node.

**Parameters**:
- `nodeId`: node ID to get depth for

**Returns**: depth (root is 0)

**Example**:
```typescript
const depth = dataStore.getNodeDepth('text-1'); // 2
```

### 9.12 getAllDescendants

```typescript
getAllDescendants(nodeId: string): INode[]
```

**Description**: Retrieves all descendants of a node.

**Parameters**:
- `nodeId`: parent node ID

**Returns**: array of all descendant nodes

**Example**:
```typescript
const descendants = dataStore.getAllDescendants('doc-1');
```

### 9.13 getAllAncestors

```typescript
getAllAncestors(nodeId: string): INode[]
```

**Description**: Retrieves all ancestors of a node.

**Parameters**:
- `nodeId`: node ID to get ancestors for

**Returns**: array of all ancestor nodes

**Example**:
```typescript
const ancestors = dataStore.getAllAncestors('text-1');
```

### 9.14 getSiblings

```typescript
getSiblings(nodeId: string): INode[]
```

**Description**: Retrieves sibling nodes of a node.

**Parameters**:
- `nodeId`: node ID to get siblings for

**Returns**: array of sibling nodes

**Example**:
```typescript
const siblings = dataStore.getSiblings('text-1');
```

### 9.15 getSiblingIndex

```typescript
getSiblingIndex(nodeId: string): number
```

**Description**: Retrieves the index of a node among its siblings.

**Parameters**:
- `nodeId`: node ID to get index for

**Returns**: index among siblings (0-based)

**Example**:
```typescript
const index = dataStore.getSiblingIndex('text-1'); // 0, 1, 2...
```

### 9.16 restoreFromSnapshot

```typescript
restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version: number = 1): void
```

**Description**: Restores DataStore from a snapshot.

**Parameters**:
- `nodes`: node Map
- `rootNodeId`: root node ID
- `version`: version number

**Example**:
```typescript
dataStore.restoreFromSnapshot(snapshot, 'doc-1', 1);
```

## 10. Event System

### 10.1 onOperation

```typescript
onOperation(callback: (operation: AtomicOperation) => void, operationType?: string): () => void
```

**Description**: Subscribes to operation events.

**Parameters**:
- `callback`: event callback function
- `operationType`: subscribe to specific type only (optional)

**Returns**: unsubscribe function

**Example**:
```typescript
const unsubscribe = dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
});
```

### 10.2 offOperation

```typescript
offOperation(callback: (operation: AtomicOperation) => void): void
```

**Description**: Unsubscribes from operation events.

**Parameters**:
- `callback`: callback function to unsubscribe

**Example**:
```typescript
dataStore.offOperation(handler);
```

## 11. Schema Management

### 11.1 registerSchema

```typescript
registerSchema(schema: Schema): void
```

**Description**: Registers a schema.

**Parameters**:
- `schema`: schema to register

**Example**:
```typescript
dataStore.registerSchema(schema);
```

### 11.2 setActiveSchema

```typescript
setActiveSchema(schema: Schema): void
```

**Description**: Sets the active schema.

**Parameters**:
- `schema`: schema to activate

**Example**:
```typescript
dataStore.setActiveSchema(schema);
```

### 11.3 getActiveSchema

```typescript
getActiveSchema(): Schema | undefined
```

**Description**: Retrieves the active schema.

**Returns**: active schema or undefined

**Example**:
```typescript
const activeSchema = dataStore.getActiveSchema();
```

### 11.4 validateNode

```typescript
validateNode(node: INode, schema?: Schema): ValidationResult
```

**Description**: Validates a node against a schema.

**Parameters**:
- `node`: node to validate
- `schema`: schema to use (default: active schema)

**Returns**: validation result

**Example**:
```typescript
const result = dataStore.validateNode(node, schema);
if (!result.valid) {
  console.log('Validation errors:', result.errors);
}
```

---

This API reference covers all public methods of DataStore. For more detailed usage examples, see [DataStore Usage Scenarios](./datastore-usage-scenarios.md).
