# DataStore Usage Scenarios

## 1. Overview

This document shows how to implement various scenarios using DataStore. Each scenario is based on real use cases and specifies the required operation classes and methods.

## 2. Basic Document Editing

### 2.1 Creating a New Document

#### Scenario: Start from an empty document and create a structured document

```typescript
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';

// 1. Initialize DataStore
const dataStore = new DataStore();
const schema = new Schema('document', {
  nodes: {
    document: { content: 'block+' },
    paragraph: { content: 'inline*' },
    'inline-text': { content: 'text*', marks: ['bold', 'italic'] }
  },
  marks: {
    bold: {},
    italic: {}
  }
});
dataStore.registerSchema(schema);

// 2. Create document structure
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
          text: 'Hello World',
          marks: [{ type: 'bold', range: [0, 5] }]
        }
      ]
    }
  ]
};

// 3. Store nested structure in DataStore
const createdDoc = dataStore.createNodeWithChildren(document, schema);
console.log('Document created:', createdDoc.sid);
```

**Operation class used**: `CoreOperations` (createNodeWithChildren)

### 2.2 Text Editing (Range-based)

#### Scenario: User inputs and edits text

```typescript
const r = (s: number, e: number) => ({ startNodeId: 'text-1', startOffset: s, endNodeId: 'text-1', endOffset: e });

// Text insertion (user types " Beautiful")
dataStore.insertText(r(5, 5), ' Beautiful');
// "Hello World" → "Hello Beautiful World"

// Text deletion (user selects "Beautiful " and deletes)
dataStore.deleteText(r(5, 15));
// "Hello Beautiful World" → "Hello World"

// Text replacement (user selects "World" and replaces with "Universe")
dataStore.replaceText(r(6, 11), 'Universe');
// "Hello World" → "Hello Universe"

// Text split (user presses Enter)
const newTextId = dataStore.splitTextNode('text-1', 5);
// "Hello World" → "Hello" + " World"

// Text merge (user presses Backspace)
const mergedId = dataStore.mergeTextNodes('text-1', 'text-2');
// "Hello" + " World" → "Hello World"
```

**Operation class used**: `SplitMergeOperations`

### 2.3 Formatting Application (Range-based)

#### Scenario: User selects text and applies formatting

```typescript
const mr = (s: number, e: number) => ({ startNodeId: 'text-1', startOffset: s, endNodeId: 'text-1', endOffset: e });

// Apply/remove/clear marks
dataStore.applyMark(mr(0, 5), { type: 'bold' });
dataStore.removeMark(mr(0, 5), 'bold');
dataStore.clearFormatting(mr(0, 11));

// Mark normalization (cleanup after editing)
dataStore.normalizeMarks('text-1');
```

**Operation class used**: `MarkOperations`

## 3. Advanced Document Manipulation

### 3.1 Node Move and Copy (includes collection/commit example)

#### Scenario: User drags a paragraph to move/copy to another location

```typescript
dataStore.begin();

// Move paragraph to another document (move)
dataStore.moveNode('paragraph-1', 'document-2', 2);

// Copy paragraph and paste to another location (create + parent update)
const copiedId = dataStore.copyNode('paragraph-1', 'document-2');

// Copy entire subtree (per-node create for each node + content/parent update)
const clonedId = dataStore.cloneNodeWithChildren('paragraph-1', 'document-3');

// Move multiple paragraphs in batch (move per item)
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);

const ops = dataStore.end();
// ops contains create/update/delete/move in order

// Apply to base after external processing (e.g., CRDT transmission)
dataStore.commit();
```

**Operation class used**: `ContentOperations`

### 3.2 Range-based Text/Mark Operations

#### Scenario: User selects text spanning multiple paragraphs and manipulates it

```typescript
const range = { startNodeId: 'text-1', startOffset: 5, endNodeId: 'text-3', endOffset: 10 };

// Delete text spanning multiple nodes
const deletedContent = dataStore.deleteText(range);

// Replace text spanning multiple nodes
dataStore.replaceText(range, 'New content from clipboard');

// Apply/remove marks spanning multiple nodes
dataStore.applyMark(range, { type: 'bold' });
dataStore.removeMark(range, 'bold');
```

**Operation class used**: `RangeOperations`

## 4. Search and Analysis

### 4.1 Conditional Search

#### Scenario: Find nodes in document that match specific conditions

```typescript
// Find all paragraphs
const paragraphs = dataStore.findNodesByType('paragraph');

// Find text with specific class
const boldTexts = dataStore.findNodesByAttribute('class', 'bold');

// Find nodes containing specific text
const helloNodes = dataStore.findNodesByText('Hello');

// Complex condition search (important paragraphs containing "urgent")
const urgentImportantParagraphs = dataStore.findNodes(node => 
  node.type === 'paragraph' && 
  node.attributes?.class === 'important' &&
  node.text?.includes('urgent')
);
```

**Operation class used**: `QueryOperations`

### 4.2 Hierarchy Analysis

#### Scenario: Analyze and navigate document structure

```typescript
// Get children of a node as object array
const children = dataStore.getNodeChildren('para-1');
children.forEach(child => {
  console.log(`Child: ${child.type} - ${child.text}`);
});

// Recursively get all descendant nodes of document
const allDescendants = dataStore.getNodeChildrenDeep('doc-1');

// Get path of a specific node (where it's located)
const path = dataStore.getNodePath('text-1');
console.log('Node path:', path); // ['doc-1', 'para-1', 'text-1']

// Get all ancestors of a specific node
const ancestors = dataStore.getAllAncestors('text-1');
ancestors.forEach(ancestor => {
  console.log(`Ancestor: ${ancestor.type}`);
});
```

**Operation class used**: `QueryOperations`, `UtilityOperations`

## 5. Data Management

### 5.1 Batch Operations

#### Scenario: Process multiple nodes at once

```typescript
// Create multiple paragraphs at once
const nodeIds = dataStore.addChildren('doc-1', [
  { id: 'para-1', type: 'paragraph', content: [] },
  { id: 'para-2', type: 'paragraph', content: [] },
  { id: 'para-3', type: 'paragraph', content: [] }
]);

// Delete multiple nodes at once
const results = dataStore.removeChildren('doc-1', ['para-1', 'para-2']);

// Move multiple nodes to different parent
dataStore.moveChildren('doc-1', 'doc-2', ['para-1', 'para-2'], 0);

// Change order of child nodes at once
dataStore.reorderChildren('doc-1', ['para-3', 'para-1', 'para-2']);
```

**Operation class used**: `ContentOperations`

### 5.2 Data Statistics and Analysis

#### Scenario: Analyze document state and collect statistics

```typescript
// Get total node count
const totalNodes = dataStore.getNodeCount();
console.log(`Total nodes: ${totalNodes}`);

// Mark statistics for a specific node
const markStats = dataStore.getMarkStatistics('text-1');
console.log(`Total marks: ${markStats.totalMarks}`);
console.log(`Overlapping marks: ${markStats.overlappingMarks}`);
console.log(`Empty marks: ${markStats.emptyMarks}`);

// Node relationship checks
const isChild = dataStore.isDescendant('text-1', 'para-1');
const isLeaf = dataStore.isLeafNode('text-1');
const isRoot = dataStore.isRootNode('doc-1');

console.log(`Is child: ${isChild}, Is leaf: ${isLeaf}, Is root: ${isRoot}`);
```

**Operation class used**: `UtilityOperations`, `MarkOperations`

## 6. Real-time Synchronization

### 6.1 Operation Event Subscription

#### Scenario: Real-time synchronization with CRDT system

```typescript
// Subscribe to all operation events
dataStore.onOperation((operation) => {
  console.log('Operation:', operation.type, operation.nodeId);
  
  // Send to CRDT system
  crdtSystem.applyOperation(operation);
});

// Subscribe only to specific operation types
dataStore.onOperation((operation) => {
  if (operation.type === 'create') {
    console.log('New node created:', operation.nodeId);
    // Update UI
    updateUI(operation.nodeId);
  }
}, 'create');

// Unsubscribe from operation events
const unsubscribe = dataStore.onOperation(handler);
dataStore.offOperation(unsubscribe);
```

### 6.3 Transaction/Overlay Usage Summary (with background)
- Why overlay: by collecting edits in transaction-local overlay and applying on commit instead of applying to base immediately:
  - Performance: COW copy (structural sharing) only for changed nodes → begin cost approaches O(1) even in large documents
  - Consistency: read path prioritizes overlay, so results are immediately consistent
  - Synchronization: atomic op batches collected via begin/end are easy to use as CRDT/network transmission units
  - Isolation: minimizes contention with external writes under global write lock
- Background theory (brief summary):
  - Copy-on-Write/Shadow Paging: copy on change, root switching on commit
  - MVCC snapshot: read consistency per transaction
  - Persistent data structures: copy only change paths via structural sharing
  - OverlayFS model: upper layer priority for reads, writes to upper layer

### 6.2 Apply External Changes

#### Scenario: Apply changes from another client

```typescript
// Apply operation received from external source
const externalOperation = {
  type: 'create',
  nodeId: 'external-node',
  node: { 
    id: 'external-node', 
    type: 'paragraph', 
    content: [],
    text: 'From another client'
  }
};

// Apply operation to DataStore
dataStore.setNode(externalOperation.node);

// Changes automatically emit events to update UI
```

## 7. Performance Optimization

### 7.1 Mark Normalization

#### Scenario: Clean up marks after document editing to improve performance

```typescript
// Normalize marks on individual node
dataStore.normalizeMarks('text-1');

// Normalize marks on entire document (run periodically)
const normalizedCount = dataStore.normalizeAllMarks();
console.log(`Normalized ${normalizedCount} nodes`);

// Remove empty marks
const removedCount = dataStore.removeEmptyMarks('text-1');
console.log(`Removed ${removedCount} empty marks`);
```

**Operation class used**: `MarkOperations`

### 7.2 Data Cloning and Backup

#### Scenario: Create and restore document backups

```typescript
// Clone entire DataStore (create backup)
const backupStore = dataStore.clone();

// Create snapshot (lighter backup)
const snapshot = dataStore.getAllNodesMap();

// Restore from snapshot (recover from backup)
const newStore = new DataStore();
newStore.restoreFromSnapshot(snapshot, 'doc-1', 1);

// Revert to specific point in time
const historicalSnapshot = getHistoricalSnapshot(timestamp);
dataStore.restoreFromSnapshot(historicalSnapshot, 'doc-1', 1);
```

**Operation class used**: `UtilityOperations`

## 8. Advanced Use Cases

### 8.1 Document Template System

#### Scenario: Create documents using pre-defined templates

```typescript
// Template definition
const documentTemplate = {
  id: 'template-doc',
  type: 'document',
  content: [
    {
      id: 'template-title',
      type: 'heading',
      content: [
        {
          id: 'template-title-text',
          type: 'inline-text',
          text: 'Untitled Document'
        }
      ]
    },
    {
      id: 'template-content',
      type: 'paragraph',
      content: [
        {
          id: 'template-content-text',
          type: 'inline-text',
          text: 'Start writing here...'
        }
      ]
    }
  ]
};

// Create new document from template
const newDoc = dataStore.createNodeWithChildren(documentTemplate, schema);

// Replace template nodes with actual usage nodes
const titleNode = dataStore.getNode('template-title-text');
if (titleNode) {
  titleNode.text = 'My New Document';
  dataStore.setNode(titleNode);
}
```

### 8.2 Collaborative Editing System

#### Scenario: Multiple users editing document simultaneously

```typescript
// User A's changes
const userAOperation = {
  type: 'update',
  nodeId: 'text-1',
  updates: { text: 'User A edited this' }
};

// User B's changes
const userBOperation = {
  type: 'insertText',
  nodeId: 'text-1',
  position: 5,
  text: 'User B added this'
};

// Manage operation order for conflict resolution
const operationQueue = [userAOperation, userBOperation];

// Apply sequentially
for (const operation of operationQueue) {
  dataStore.updateNode(operation.nodeId, operation.updates);
}
```

### 8.3 Document Version Management

#### Scenario: Track and manage document versions

```typescript
// Save current version
const currentVersion = dataStore.getVersion();
const currentSnapshot = dataStore.getAllNodesMap();

// Store in version history
versionHistory.set(currentVersion, {
  snapshot: currentSnapshot,
  timestamp: Date.now(),
  author: 'current-user'
});

// Revert to specific version
const targetVersion = 5;
const targetSnapshot = versionHistory.get(targetVersion);
if (targetSnapshot) {
  dataStore.restoreFromSnapshot(
    targetSnapshot.snapshot, 
    'doc-1', 
    targetVersion
  );
}
```

## 9. Debugging and Development

### 9.1 Data Structure Inspection

#### Scenario: Inspect and debug data structure during development

```typescript
// Print structure of all nodes
const allNodes = dataStore.getAllNodes();
allNodes.forEach(node => {
  console.log(`Node ${node.sid}:`, {
    type: node.type,
    text: node.text?.substring(0, 50),
    children: node.content?.length || 0,
    marks: node.marks?.length || 0
  });
});

// Detailed info for specific node
const nodeDetails = dataStore.getNodeWithChildren('para-1');
console.log('Node with children:', JSON.stringify(nodeDetails, null, 2));

// Node relationship checks
const path = dataStore.getNodePath('text-1');
const ancestors = dataStore.getAllAncestors('text-1');
const descendants = dataStore.getAllDescendants('para-1');

console.log('Path:', path);
console.log('Ancestors:', ancestors.map(n => n.sid));
console.log('Descendants:', descendants.map(n => n.sid));
```

### 9.2 Performance Monitoring

#### Scenario: Monitor application performance

```typescript
// Performance monitoring via operation events
let operationCount = 0;
const startTime = Date.now();

dataStore.onOperation((operation) => {
  operationCount++;
  
  if (operationCount % 100 === 0) {
    const elapsed = Date.now() - startTime;
    console.log(`Operations per second: ${operationCount / (elapsed / 1000)}`);
  }
});

// Memory usage monitoring
const nodeCount = dataStore.getNodeCount();
const memoryUsage = process.memoryUsage();
console.log(`Nodes: ${nodeCount}, Memory: ${memoryUsage.heapUsed / 1024 / 1024}MB`);
```

---

This document shows how to implement various scenarios using DataStore. For more detailed API information, see [DataStore API Reference](./datastore-api-reference.md).
