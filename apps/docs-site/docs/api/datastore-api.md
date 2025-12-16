# DataStore API

The DataStore API provides the core storage layer for managing nodes, transactions, and schema validation.

## DataStore Class

The main storage class that manages nodes with transactional overlay and lock support.

### Constructor

```typescript
new DataStore(rootNodeId?: string, schema?: Schema, sessionId?: number)
```

**Parameters:**
- `rootNodeId?: string` - Optional root node ID
- `schema?: Schema` - Optional schema for validation
- `sessionId?: number` - Optional session ID (default: 0)

**Example:**
```typescript
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';

const schema = createSchema('my-doc', { /* ... */ });
const dataStore = new DataStore(undefined, schema, 0);
```

### Properties

#### `core: CoreOperations`
Core operations instance (read-only).

#### `query: QueryOperations`
Query operations instance (read-only).

#### `content: ContentOperations`
Content operations instance (read-only).

#### `splitMerge: SplitMergeOperations`
Split/merge operations instance (read-only).

#### `marks: MarkOperations`
Mark operations instance (read-only).

#### `decorators: DecoratorOperations`
Decorator operations instance (read-only).

#### `utility: UtilityOperations`
Utility operations instance (read-only).

#### `range: RangeOperations`
Range operations instance (read-only).

#### `serialization: SerializationOperations`
Serialization operations instance (read-only).

### Core Methods

#### `getNode(nodeId: string): INode | undefined`

Gets a node by ID (overlay-aware).

**Parameters:**
- `nodeId: string` - Node ID (supports alias)

**Returns:**
- `INode | undefined` - Node or `undefined`

**Read Path:**
1. Check `deletedNodeIds` → return `undefined` if deleted
2. Check `overlayNodes` → return overlay version if exists
3. Fallback to `baseNodes` → return base version

**Example:**
```typescript
const node = dataStore.getNode('text-1');
```

#### `setNode(node: INode, validate?: boolean): void`

Sets a node (creates or updates).

**Parameters:**
- `node: INode` - Node to set (assigns `sid` if missing)
- `validate?: boolean` - Whether to validate (default: `true`)

**Behavior:**
- Assigns `sid` if missing using `generateId()`
- Validates against schema if `validate=true` and schema exists
- Converts object children in content to IDs recursively
- Overlay-aware: writes go to overlay if transaction active
- Emits `'create'` or `'update'` operation event

**Example:**
```typescript
dataStore.setNode({
  sid: 'p1',
  stype: 'paragraph',
  text: 'Hello',
  content: []
});
```

#### `updateNode(nodeId: string, updates: Partial<INode>, validate?: boolean): { valid: boolean; errors: string[] } | null`

Updates a node with partial changes.

**Parameters:**
- `nodeId: string` - Node ID to update
- `updates: Partial<INode>` - Partial node data to apply
- `validate?: boolean` - Whether to validate (default: `true`)

**Returns:**
- Validation result: `{ valid: boolean; errors: string[] }` or `null`

**Behavior:**
- Merges fields (attributes shallow-merge)
- No-op suppression: skips if all fields are unchanged
- Validates against schema if `validate=true` and not content update
- Content updates bypass validation (IDs only)
- Overlay-aware: writes go to overlay if transaction active
- Emits `'update'` operation event

**Example:**
```typescript
const result = dataStore.updateNode('text-1', { 
  text: 'Updated text' 
});
```

#### `deleteNode(nodeId: string): boolean`

Deletes a node.

**Parameters:**
- `nodeId: string` - Node ID to delete

**Returns:**
- `boolean` - `true` if deleted, `false` if node not found

**Behavior:**
- Cannot delete root node (throws error)
- Removes node from parent's content array
- Emits `'delete'` operation event
- Overlay-aware

**Example:**
```typescript
const deleted = dataStore.deleteNode('node-1');
```

#### `createNodeWithChildren(node: INode, schema?: Schema): INode`

Creates a node with all its children recursively.

**Parameters:**
- `node: INode` - Node with nested children (objects)
- `schema?: Schema` - Optional schema for validation

**Returns:**
- `INode` - Created node with assigned IDs

**Behavior:**
- Recursively creates all child nodes
- Assigns IDs to all nodes
- Converts object children to ID arrays
- Validates against schema
- Overlay-aware

**Example:**
```typescript
const root = dataStore.createNodeWithChildren({
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

---

## Transaction Management

### Transaction Overlay (Copy-on-Write)

DataStore uses a transactional overlay system for atomic operations.

#### `begin(): void`

Starts a transaction (activates overlay).

**Behavior:**
- Initializes overlay if not exists
- Activates overlay state
- All subsequent writes go to overlay
- Initializes overlay alias map

**Example:**
```typescript
dataStore.begin();
// All writes now go to overlay
dataStore.setNode(node);
```

#### `end(): AtomicOperation[]`

Ends transaction collection and returns operations.

**Returns:**
- `AtomicOperation[]` - Array of collected operations

**Behavior:**
- Returns snapshot of collected operations
- Overlay remains active until `commit()` or `rollback()`
- Does not apply changes to base

**Example:**
```typescript
dataStore.begin();
dataStore.setNode(node1);
dataStore.setNode(node2);
const operations = dataStore.end();
// operations: [{ type: 'create', nodeId: '...', ... }, ...]
```

#### `commit(): void`

Commits transaction to base storage.

**Behavior:**
- Applies overlay operations to base in order: create → update → move → delete
- Merges fields for update operations (shallow-merge attributes)
- Applies overlay root change if present
- Clears overlay and alias map
- Operations are now permanent

**Example:**
```typescript
dataStore.begin();
dataStore.setNode(node);
dataStore.end();
dataStore.commit(); // Changes are now permanent
```

#### `rollback(): void`

Rolls back transaction.

**Behavior:**
- Discards overlay state
- Clears overlay and alias map
- No events emitted

**Example:**
```typescript
dataStore.begin();
dataStore.setNode(node);
dataStore.rollback(); // Changes discarded
```

#### `getCollectedOperations(): AtomicOperation[]`

Gets currently collected operations (without ending transaction).

**Returns:**
- `AtomicOperation[]` - Array of collected operations

**Example:**
```typescript
dataStore.begin();
dataStore.setNode(node);
const ops = dataStore.getCollectedOperations();
// ops: [{ type: 'create', ... }]
```

---

## Lock System

DataStore uses a global lock system to prevent concurrent modifications.

#### `acquireLock(ownerId?: string): Promise<string>`

Acquires a global write lock.

**Parameters:**
- `ownerId?: string` - Owner identifier (default: 'unknown')

**Returns:**
- `Promise<string>` - Lock ID

**Behavior:**
- Waits if lock is already held
- Returns lock ID on acquisition
- Times out after 5 seconds (default)
- Queues requests if lock is busy

**Example:**
```typescript
const lockId = await dataStore.acquireLock('my-transaction');
try {
  // Perform operations
} finally {
  dataStore.releaseLock(lockId);
}
```

#### `releaseLock(lockId?: string): void`

Releases a global write lock.

**Parameters:**
- `lockId?: string` - Lock ID to release (optional, releases current lock if not provided)

**Behavior:**
- Releases lock
- Processes next queued request if any

**Example:**
```typescript
const lockId = await dataStore.acquireLock();
// ... operations ...
dataStore.releaseLock(lockId);
```

#### `getLockStats(): LockStats`

Gets lock statistics.

**Returns:**
```typescript
{
  totalAcquisitions: number;
  totalReleases: number;
  totalTimeouts: number;
  averageWaitTime: number;
}
```

**Example:**
```typescript
const stats = dataStore.getLockStats();
console.log('Lock stats:', stats);
```

---

## Schema Management

#### `registerSchema(schema: Schema): void`

Registers a schema.

**Parameters:**
- `schema: Schema` - Schema to register

**Example:**
```typescript
const schema = createSchema('my-doc', { /* ... */ });
dataStore.registerSchema(schema);
```

#### `setActiveSchema(schema: Schema): void`

Sets the active schema.

**Parameters:**
- `schema: Schema` - Schema to activate

**Behavior:**
- Sets as active schema
- Registers schema if not already registered

**Example:**
```typescript
dataStore.setActiveSchema(schema);
```

#### `getActiveSchema(): Schema | undefined`

Gets the active schema.

**Returns:**
- `Schema | undefined` - Active schema or `undefined`

**Example:**
```typescript
const schema = dataStore.getActiveSchema();
```

#### `validateNode(node: INode, schema?: Schema): { valid: boolean; errors: string[] }`

Validates a node against schema.

**Parameters:**
- `node: INode` - Node to validate
- `schema?: Schema` - Optional schema (uses active schema if not provided)

**Returns:**
- `{ valid: boolean; errors: string[] }` - Validation result

**Example:**
```typescript
const result = dataStore.validateNode(node);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
}
```

---

## Node Management

#### `getRootNode(): INode | undefined`

Gets the root node.

**Returns:**
- `INode | undefined` - Root node or `undefined`

**Behavior:**
- If `rootNodeId` not set, infers and sets first node
- Returns root node of current context (including overlay)

**Example:**
```typescript
const root = dataStore.getRootNode();
```

#### `setRootNodeId(nodeId: string): void`

Sets the root node ID.

**Parameters:**
- `nodeId: string` - Root node ID

**Behavior:**
- Applied immediately when overlay is inactive
- `setRoot()` reflects in overlay when overlay is active

#### `setRoot(rootId: string): void`

Sets root based on transaction overlay.

**Parameters:**
- `rootId: string` - Root node ID

**Behavior:**
- When overlay is active: reflected in overlay, applied on `commit()`
- When overlay is inactive: immediately reflected in base

#### `getRootNodeId(): string | undefined`

Gets the root node ID.

**Returns:**
- `string | undefined` - Root node ID or `undefined`

---

## ID Generation

#### `generateId(): string`

Generates a unique node ID (Figma style).

**Returns:**
- `string` - Unique ID (format: `sessionId:counter`, e.g., `'0:1'`, `'0:2'`)

**Example:**
```typescript
const id = dataStore.generateId();
// '0:1', '0:2', etc.
```

#### `getSessionId(): number`

Gets the current session ID.

**Returns:**
- `number` - Session ID

#### `setSessionId(sessionId: number): void`

Sets the session ID.

**Parameters:**
- `sessionId: number` - New session ID

**Example:**
```typescript
dataStore.setSessionId(1);
dataStore.generateId(); // '1:1', '1:2', ...
```

---

## Alias System

Aliases provide temporary names for nodes during transactions.

#### `setAlias(alias: string, id: string): void`

Registers an alias (overlay-scoped).

**Parameters:**
- `alias: string` - Alias name
- `id: string` - Node ID

**Behavior:**
- Alias must be unique within overlay scope
- Throws error if duplicate registration with different ID
- Cleared on `commit()` or `rollback()`

**Example:**
```typescript
dataStore.begin();
dataStore.setAlias('new-paragraph', 'p-123');
// Use alias in operations
dataStore.getNode('new-paragraph'); // Returns node with ID 'p-123'
```

#### `resolveAlias(idOrAlias: string): string`

Resolves alias to actual ID.

**Parameters:**
- `idOrAlias: string` - Alias or actual ID

**Returns:**
- `string` - Actual node ID

**Example:**
```typescript
dataStore.setAlias('my-node', 'node-1');
const actualId = dataStore.resolveAlias('my-node'); // 'node-1'
```

#### `deleteAlias(alias: string): void`

Removes an alias mapping.

**Parameters:**
- `alias: string` - Alias to remove

#### `clearAliases(): void`

Clears all alias mappings.

#### `getAliases(): ReadonlyMap<string, string>`

Gets all aliases as read-only map.

**Returns:**
- `ReadonlyMap<string, string>` - Alias map

---

## Query Methods

Query methods delegate to `QueryOperations`. See [DataStore Operations API](./datastore-operations#queryoperations) for details.

#### `findNodes(predicate: (node: INode) => boolean): INode[]`

Finds nodes matching a predicate.

#### `findNodesByType(stype: string): INode[]`

Finds nodes by schema type.

#### `findNodesByAttribute(key: string, value: any): INode[]`

Finds nodes by attribute value.

#### `findNodesByText(text: string): INode[]`

Finds nodes containing text.

#### `findChildrenByParentId(parentId: string): INode[]`

Gets direct children of a node.

#### `findRootNodes(): INode[]`

Finds all root nodes.

#### `getNodeChildren(nodeId: string): INode[]`

Gets direct children as object array.

#### `getNodeChildrenDeep(nodeId: string): INode[]`

Gets all descendants recursively.

#### `getNodeWithChildren(nodeId: string): INode | null`

Gets node with children as object array.

#### `getAllNodesWithChildren(): INode[]`

Gets all nodes with children as object arrays.

#### `searchText(query: string): INode[]`

Searches for nodes containing text.

---

## Utility Methods

Utility methods delegate to `UtilityOperations`. See [DataStore Operations API](./datastore-operations#utilityoperations) for details.

#### `getChildren(nodeId: string): INode[]`

Gets direct children.

#### `getParent(nodeId: string): INode | undefined`

Gets parent node.

#### `getSiblings(nodeId: string): INode[]`

Gets sibling nodes.

#### `getSiblingIndex(nodeId: string): number`

Gets sibling index.

#### `getPreviousSibling(nodeId: string): string | null`

Gets previous sibling ID.

#### `getNextSibling(nodeId: string): string | null`

Gets next sibling ID.

#### `getFirstChild(nodeId: string): string | null`

Gets first child ID.

#### `getLastChild(nodeId: string): string | null`

Gets last child ID.

#### `getCommonAncestor(nodeId1: string, nodeId2: string): string | null`

Gets common ancestor of two nodes.

#### `getDistance(nodeId1: string, nodeId2: string): number`

Calculates distance between two nodes.

#### `getNodePath(nodeId: string): string[]`

Gets node path from root.

#### `getNodeDepth(nodeId: string): number`

Gets node depth.

#### `isDescendant(nodeId: string, ancestorId: string): boolean`

Checks if node is descendant of ancestor.

#### `getAllDescendants(nodeId: string): INode[]`

Gets all descendants.

#### `getAllAncestors(nodeId: string): INode[]`

Gets all ancestors.

#### `getNodeCount(): number`

Gets total node count.

#### `clone(): DataStore`

Clones DataStore instance.

#### `hasNode(nodeId: string): boolean`

Checks if node exists.

#### `getChildCount(nodeId: string): number`

Gets child count.

#### `isLeafNode(nodeId: string): boolean`

Checks if node is leaf.

#### `isRootNode(nodeId: string): boolean`

Checks if node is root.

#### `isEditableNode(nodeId: string): boolean`

Checks if node is editable.

#### `compareDocumentOrder(nodeId1: string, nodeId2: string): number`

Compares document order of two nodes.

#### `getNextNode(nodeId: string): string | null`

Gets next node in document order.

#### `getPreviousNode(nodeId: string): string | null`

Gets previous node in document order.

---

## Content Operations

Content operations delegate to `ContentOperations`. See [DataStore Operations API](./datastore-operations#contentoperations) for details.

#### `addChild(parentId: string, child: INode | string, position?: number): string`

Adds a child to parent.

#### `removeChild(parentId: string, childId: string): boolean`

Removes a child from parent.

#### `moveNode(nodeId: string, newParentId: string, position?: number): void`

Moves a node to new parent.

#### `reorderChildren(parentId: string, childIds: string[]): void`

Reorders children.

#### `copyNode(nodeId: string, newParentId?: string): string`

Copies a node.

#### `cloneNodeWithChildren(nodeId: string, newParentId?: string): string`

Clones a node with all children.

#### `moveBlockUp(nodeId: string): boolean`

Moves block up.

#### `moveBlockDown(nodeId: string): boolean`

Moves block down.

#### `transformNode(nodeId: string, newType: string, newAttrs?: Record<string, any>): { valid: boolean; errors: string[]; newNodeId?: string }`

Transforms a node to different type.

---

## Range Operations

Range operations delegate to `RangeOperations`. See [DataStore Operations API](./datastore-operations#rangeoperations) for details.

#### `insertText(contentRange: ModelSelection, text: string): string`

Inserts text at range.

#### `deleteText(contentRange: ModelSelection): string`

Deletes text in range.

#### `replaceText(contentRange: ModelSelection, newText: string): string`

Replaces text in range.

#### `extractText(contentRange: ModelSelection): string`

Extracts text from range.

#### `applyMark(contentRange: ModelSelection, mark: IMark): IMark`

Applies mark to range.

#### `removeMark(contentRange: ModelSelection, markType: string): number`

Removes mark from range.

#### `toggleMark(contentRange: ModelSelection, markType: string, attrs?: Record<string, any>): void`

Toggles mark on/off.

#### `clearFormatting(contentRange: ModelSelection): number`

Clears all formatting.

---

## Mark Operations

Mark operations delegate to `MarkOperations`. See [DataStore Operations API](./datastore-operations#markoperations) for details.

#### `normalizeMarks(nodeId: string): void`

Normalizes marks for a node.

#### `normalizeAllMarks(): number`

Normalizes marks for all nodes.

#### `getMarkStatistics(nodeId: string): MarkStatistics`

Gets mark statistics.

#### `removeEmptyMarks(nodeId: string): number`

Removes empty marks.

---

## Split/Merge Operations

Split/merge operations delegate to `SplitMergeOperations`. See [DataStore Operations API](./datastore-operations#splitmergeoperations) for details.

#### `splitTextNode(nodeId: string, splitPosition: number): string`

Splits a text node.

#### `mergeTextNodes(leftNodeId: string, rightNodeId: string): string`

Merges two text nodes.

#### `splitBlockNode(nodeId: string, splitPosition: number): string`

Splits a block node.

#### `mergeBlockNodes(leftNodeId: string, rightNodeId: string): string`

Merges two block nodes.

---

## Serialization

#### `serializeRange(range: ModelSelection): INode[]`

Serializes selection range to INode array.

**Parameters:**
- `range: ModelSelection` - Selection range

**Returns:**
- `INode[]` - Array of nodes in range

**Example:**
```typescript
const nodes = dataStore.serializeRange({
  startNodeId: 'text-1',
  startOffset: 0,
  endNodeId: 'text-1',
  endOffset: 5
});
```

#### `deserializeNodes(nodes: INode[], targetParentId: string, targetPosition?: number): string[]`

Deserializes INode array and inserts at position.

**Parameters:**
- `nodes: INode[]` - Array of nodes to insert
- `targetParentId: string` - Target parent ID
- `targetPosition?: number` - Optional position

**Returns:**
- `string[]` - Array of inserted node IDs

**Example:**
```typescript
const nodeIds = dataStore.deserializeNodes(nodes, 'parent-1', 0);
```

---

## Document Management

#### `saveDocumentInternal(document: Document, validate?: boolean): { valid: boolean; errors: string[] }`

Saves a document internally.

**Parameters:**
- `document: Document` - Document to save
- `validate?: boolean` - Whether to validate (default: `true`)

**Returns:**
- `{ valid: boolean; errors: string[] }` - Validation result

#### `getDocument(documentId: string): Document | undefined`

Gets a document.

**Parameters:**
- `documentId: string` - Document ID (or 'root')

**Returns:**
- `Document | undefined` - Document or `undefined`

#### `updateDocument(documentId: string, updates: Partial<Document>, validate?: boolean): { valid: boolean; errors: string[] }`

Updates a document.

**Parameters:**
- `documentId: string` - Document ID
- `updates: Partial<Document>` - Updates to apply
- `validate?: boolean` - Whether to validate (default: `true`)

**Returns:**
- `{ valid: boolean; errors: string[] }` - Validation result

#### `deleteDocument(documentId: string): boolean`

Deletes a document.

**Parameters:**
- `documentId: string` - Document ID

**Returns:**
- `boolean` - `true` if deleted

**Behavior:**
- Cannot delete root document (throws error)

#### `getAllDocuments(): Document[]`

Gets all documents.

**Returns:**
- `Document[]` - Array of documents

---

## Version Management

#### `getVersion(): number`

Gets current version.

**Returns:**
- `number` - Version number

#### `setVersion(version: number): void`

Sets version.

**Parameters:**
- `version: number` - New version

---

## Operation Events

#### `emitOperation(operation: AtomicOperation): void`

Emits an operation event.

**Parameters:**
- `operation: AtomicOperation` - Operation to emit

**Behavior:**
- Records in overlay if overlay active
- Emits `'operation'` event

#### `onOperation(callback: (operation: AtomicOperation) => void): void`

Subscribes to operation events.

**Parameters:**
- `callback: Function` - Callback function

**Example:**
```typescript
dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
});
```

#### `offOperation(callback: (operation: AtomicOperation) => void): void`

Unsubscribes from operation events.

**Parameters:**
- `callback: Function` - Callback function to remove

---

## Internal Methods

#### `getNodes(): Map<string, INode>`

Gets internal nodes map (read-only).

**Returns:**
- `Map<string, INode>` - Nodes map

#### `setNodes(nodes: Map<string, INode>): void`

Sets internal nodes map (internal use).

**Parameters:**
- `nodes: Map<string, INode>` - Nodes map

#### `clear(): void`

Clears all nodes.

**Behavior:**
- Clears nodes map
- Resets root node ID
- Resets version to 1

#### `restoreFromSnapshot(nodes: Map<string, INode>, rootNodeId?: string, version?: number): void`

Restores from snapshot.

**Parameters:**
- `nodes: Map<string, INode>` - Nodes map
- `rootNodeId?: string` - Root node ID
- `version?: number` - Version (default: 1)

---

## Complete Example

```typescript
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';

// Create schema
const schema = createSchema('article', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// Create DataStore
const dataStore = new DataStore(undefined, schema, 0);

// Set active schema
dataStore.setActiveSchema(schema);

// Acquire lock
const lockId = await dataStore.acquireLock('my-transaction');

try {
  // Begin transaction
  dataStore.begin();
  
  // Create nodes
  const paragraph = dataStore.createNodeWithChildren({
    stype: 'paragraph',
    content: [
      { stype: 'inline-text', text: 'Hello World' }
    ]
  });
  
  const document = dataStore.createNodeWithChildren({
    stype: 'document',
    content: [paragraph.sid!]
  });
  
  // Set root
  dataStore.setRoot(document.sid!);
  
  // End transaction
  const operations = dataStore.end();
  
  // Commit
  dataStore.commit();
  
  console.log('Document created:', document.sid);
  console.log('Operations:', operations);
} finally {
  // Release lock
  dataStore.releaseLock(lockId);
}

// Query nodes
const paragraphs = dataStore.findNodesByType('paragraph');
const root = dataStore.getRootNode();

// Listen to operations
dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
});
```

---

## Related

- [DataStore Operations API](./datastore-operations) - Complete operation reference
- [Architecture: DataStore](../architecture/datastore) - DataStore architecture
- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Schema and model concepts
