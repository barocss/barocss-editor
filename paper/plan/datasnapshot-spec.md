# DataSnapshot Structure Specification

## 1. Overview

DataSnapshot is a core component of the Barocss Transaction system, implementing the Immutable State pattern. It provides an isolated workspace by deep-copying the current state of DataStore, ensuring transaction atomicity.

## 2. Core Concepts

### 2.1 Immutable State Pattern
- **Principle**: work with snapshots instead of mutating original data
- **Benefits**: safe rollback, concurrency control, predictable behavior
- **Implementation**: complete isolation via deep copy

### 2.2 Snapshot Isolation
- **Isolation**: workspace completely separate from original DataStore
- **Independence**: changes in snapshot don’t affect the original
- **Atomicity**: all operations succeed or all fail

### 2.3 Change Tracking
- **Tracking**: track all changes made in the snapshot
- **Validation**: validate each change
- **Commit**: apply to original only on success

## 3. Architecture

### 3.1 Core Components

```
DataStoreSnapshot
├── _nodes: Map<string, INode>
├── _documents: Map<string, Document>
├── _rootNodeId: string | undefined
├── _version: number
├── _originalStore: DataStore
└── _changes: ChangeRecord[]

ChangeRecord
├── type: 'create' | 'update' | 'delete'
├── nodeId: string
├── oldData?: INode
├── newData?: INode
└── timestamp: Date
```

### 3.2 Data Flow

```
1. Create DataStoreSnapshot
   ↓
2. Deep copy original DataStore
   ↓
3. Apply operations
   ↓
4. Run validation
   ↓
5. On success: apply to original
   On failure: discard snapshot
```

## 4. DataStoreSnapshot Class

### 4.1 Basic Structure

```typescript
class DataStoreSnapshot {
  private _nodes: Map<string, INode> = new Map();
  private _documents: Map<string, Document> = new Map();
  private _rootNodeId: string | undefined;
  private _version: number;
  private _originalStore: DataStore;
  private _changes: ChangeRecord[] = [];

  constructor(originalStore: DataStore) {
    this._originalStore = originalStore;
    this._version = originalStore.getVersion();
    this._rootNodeId = originalStore.getRootNodeId();
    
    // Copy all nodes from original DataStore
    this._copyNodesFromOriginal();
    
    // Copy all documents from original DataStore
    this._copyDocumentsFromOriginal();
  }
}
```

### 4.2 Snapshot Creation

```typescript
// Copy nodes from original DataStore
private _copyNodesFromOriginal(): void {
  const originalNodes = this._originalStore.getAllNodesMap();
  for (const [id, node] of originalNodes) {
    this._nodes.set(id, this._deepCloneNode(node));
  }
}

// Copy documents from original DataStore
private _copyDocumentsFromOriginal(): void {
  const originalDocuments = this._originalStore.getAllDocuments();
  for (const doc of originalDocuments) {
    this._documents.set(doc.sid!, this._deepCloneDocument(doc));
  }
}

// Deep clone node
private _deepCloneNode(node: INode): INode {
  const cloned = JSON.parse(JSON.stringify(node));
  
  // Restore Date fields as Date objects
  if (cloned.createdAt) {
    cloned.createdAt = new Date(cloned.createdAt);
  }
  if (cloned.updatedAt) {
    cloned.updatedAt = new Date(cloned.updatedAt);
  }
  
  return cloned;
}

// Deep clone document
private _deepCloneDocument(document: Document): Document {
  const cloned = JSON.parse(JSON.stringify(document));
  
  // Restore Date fields as Date objects
  if (cloned.createdAt) {
    cloned.createdAt = new Date(cloned.createdAt);
  }
  if (cloned.updatedAt) {
    cloned.updatedAt = new Date(cloned.updatedAt);
  }
  
  return cloned;
}
```

## 5. Operation Application

### 5.1 Operation Execution

```typescript
// Apply operation
applyOperation(operation: TransactionOperation): ValidationResult | null {
  try {
    switch (operation.type) {
      case 'create':
        return this._createNode(operation.data as INode);
      case 'update':
        return this._updateNode(operation.nodeId!, operation.data as Partial<INode>);
      case 'delete':
        return this._deleteNode(operation.nodeId!);
      case 'createDocument':
        return this._createDocument(operation.data as Document);
      case 'updateDocument':
        return this._updateDocument(operation.documentId!, operation.data as Partial<Document>);
      case 'deleteDocument':
        return this._deleteDocument(operation.documentId!);
      default:
        return { valid: false, errors: [`Unknown operation type: ${operation.type}`] };
    }
  } catch (error) {
    return {
      valid: false,
      errors: [`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}
```

### 5.2 Node Operations

#### 5.2.1 Node Creation

```typescript
private _createNode(node: INode): ValidationResult | null {
  // Check for duplicate node ID
  if (this._nodes.has(node.sid)) {
    return { valid: false, errors: [`Node with id '${node.sid}' already exists`] };
  }
  
  // Validate node
  const validation = IntegrityValidator.validateNode(node);
  if (!validation.valid) {
    return validation;
  }
  
  // Store node
  this._nodes.set(node.sid, this._deepCloneNode(node));
  
  // Record change
  this._recordChange('create', node.sid, undefined, node);
  
  return null; // success
}
```

#### 5.2.2 Node Update

```typescript
private _updateNode(nodeId: string, updates: Partial<INode>): ValidationResult | null {
  const existingNode = this._nodes.get(nodeId);
  if (!existingNode) {
    return { valid: false, errors: [`Node with id '${nodeId}' not found`] };
  }
  
  // Create updated node
  const updatedNode = { ...existingNode, ...updates, updatedAt: new Date() };
  
  // Validate node
  const validation = IntegrityValidator.validateNode(updatedNode);
  if (!validation.valid) {
    return validation;
  }
  
  // Update node
  this._nodes.set(nodeId, updatedNode);
  
  // Record change
  this._recordChange('update', nodeId, existingNode, updatedNode);
  
  return null; // success
}
```

#### 5.2.3 Node Deletion

```typescript
private _deleteNode(nodeId: string): ValidationResult | null {
  const existingNode = this._nodes.get(nodeId);
  if (!existingNode) {
    return { valid: false, errors: [`Node with id '${nodeId}' not found`] };
  }
  
  // Delete node
  this._nodes.delete(nodeId);
  
  // Record change
  this._recordChange('delete', nodeId, existingNode, undefined);
  
  return null; // success
}
```

### 5.3 Document Operations

#### 5.3.1 Document Creation

```typescript
private _createDocument(document: Document): ValidationResult | null {
  // Check for duplicate document ID
  if (this._documents.has(document.sid)) {
    return { valid: false, errors: [`Document with id '${document.sid}' already exists`] };
  }
  
  // Validate document
  const validation = IntegrityValidator.validateDocument(document);
  if (!validation.valid) {
    return validation;
  }
  
  // Treat document as root node
  if (document.sid && !this._nodes.has(document.sid)) {
    // Handle content as INode[]
    let contentIds: string[] = [];
    if (document.content && Array.isArray(document.content)) {
      // Store each node and collect IDs
      for (const node of document.content) {
        this._nodes.set(node.sid, this._deepCloneNode(node));
        contentIds.push(node.sid);
      }
    } else if (document.contentIds) {
      contentIds = document.contentIds;
    }

    const rootNode: INode = {
      id: document.sid,
      type: 'document',
      content: contentIds,
      attributes: {
        ...document.attributes,
        schema: document.schema || {}
      },
      metadata: document.metadata || {},
      version: document.version || 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this._nodes.set(document.sid, rootNode);
    this._rootNodeId = document.sid;
  }
  
  // Store document
  this._documents.set(document.sid, this._deepCloneDocument(document));
  
  return null; // success
}
```

#### 5.3.2 Document Update

```typescript
private _updateDocument(documentId: string, updates: Partial<Document>): ValidationResult | null {
  const rootNode = this._nodes.get(documentId);
  if (!rootNode) {
    return { valid: false, errors: [`Document with id '${documentId}' not found`] };
  }

  // Handle content update
  if (updates.content && Array.isArray(updates.content)) {
    // Optionally delete existing content nodes
    if (rootNode.content) {
      for (const childId of rootNode.content) {
        this._nodes.delete(childId);
      }
    }

    // Document.content is INode[], so store each node and convert to contentIds
    const contentIds: string[] = [];
    for (const node of updates.content) {
      // Store node
      this._nodes.set(node.sid, this._deepCloneNode(node));
      contentIds.push(node.sid);
    }
    updates.content = contentIds; // set content as ID array
  }

  const updatedNode = { ...rootNode, ...updates, updatedAt: new Date() };
  this._nodes.set(documentId, updatedNode);
  
  return null; // success
}
```

#### 5.3.3 Document Deletion

```typescript
private _deleteDocument(documentId: string): ValidationResult | null {
  const rootNode = this._nodes.get(documentId);
  if (!rootNode) {
    return { valid: false, errors: [`Document with id '${documentId}' not found`] };
  }
  
  // Delete document
  this._nodes.delete(documentId);
  this._documents.delete(documentId);
  
  // Clear root node ID
  if (this._rootNodeId === documentId) {
    this._rootNodeId = undefined;
  }
  
  return null; // success
}
```

## 6. Change Tracking

### 6.1 ChangeRecord Interface

```typescript
interface ChangeRecord {
  type: 'create' | 'update' | 'delete';
  nodeId: string;
  oldData?: INode;
  newData?: INode;
  timestamp: Date;
}
```

### 6.2 Recording Changes

```typescript
private _recordChange(
  type: 'create' | 'update' | 'delete',
  nodeId: string,
  oldData?: INode,
  newData?: INode
): void {
  this._changes.push({
    type,
    nodeId,
    oldData: oldData ? this._deepCloneNode(oldData) : undefined,
    newData: newData ? this._deepCloneNode(newData) : undefined,
    timestamp: new Date()
  });
}
```

### 6.3 Querying Changes

```typescript
// Get all changes
getChanges(): ChangeRecord[] {
  return [...this._changes];
}

// Get changes for a specific node
getNodeChanges(nodeId: string): ChangeRecord[] {
  return this._changes.filter(change => change.nodeId === nodeId);
}

// Change statistics
getChangeStats(): { total: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  
  for (const change of this._changes) {
    byType[change.type] = (byType[change.type] || 0) + 1;
  }
  
  return {
    total: this._changes.length,
    byType
  };
}
```

## 7. Restoring to Original DataStore

### 7.1 Restore Method

```typescript
// Restore to original DataStore
restoreTo(store: DataStore): void {
  // Clear existing DataStore
  store.clear();
  
  // Restore from snapshot nodes
  for (const [id, node] of this._nodes) {
    store.setNode(node);
  }
  
  // Restore from snapshot documents
  for (const [id, doc] of this._documents) {
    store.saveDocument(doc, false); // skip validation
  }
  
  // Set root node ID
  if (this._rootNodeId) {
    store.setRootNodeId(this._rootNodeId);
  }
  
  // Increment version
  store.version = this._version + 1;
}
```

### 7.2 Discarding Snapshot

```typescript
// Discard snapshot
discard(): void {
  this._nodes.clear();
  this._documents.clear();
  this._changes = [];
  this._rootNodeId = undefined;
  this._version = 0;
}
```

## 8. Validation System

### 8.1 Validator Class Integration

DataSnapshot uses the `Validator` class from `@barocss/schema` for comprehensive validation.

#### Structural Validation

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

// Validate node structure
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.error('Node structure validation failed:', nodeValidation.errorCodes);
}

// Validate document structure
const documentValidation = Validator.validateDocumentStructure(document);
if (!documentValidation.valid) {
  console.error('Document structure validation failed:', documentValidation.errorCodes);
}
```

#### Schema-based Validation

```typescript
// Schema-based validation if schema exists
if (schema) {
  const schemaValidation = Validator.validateNode(schema, node);
  if (!schemaValidation.valid) {
    console.error('Schema validation failed:', schemaValidation.errorCodes);
  }
}
```

#### Error Code Usage

```typescript
// Safe error handling
const result = Validator.validateNodeStructure(node);
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // Handle missing text content
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // Handle unknown node type
  }
}
```

### 8.2 Snapshot Validation

```typescript
// Validate entire snapshot
validateSnapshot(): ValidationResult {
  const errors: string[] = [];
  const errorCodes: string[] = [];
  
  // Validate all nodes
  for (const [id, node] of this._nodes) {
    // 1. Structural validation
    const structuralValidation = Validator.validateNodeStructure(node);
    if (!structuralValidation.valid) {
      errors.push(...structuralValidation.errors.map(err => `Node ${id}: ${err}`));
      if (structuralValidation.errorCodes) {
        errorCodes.push(...structuralValidation.errorCodes);
      }
    }
    
    // 2. Schema-based validation (if schema exists)
    const schema = this.getSchema();
    if (schema) {
      const schemaValidation = Validator.validateNode(schema, node);
      if (!schemaValidation.valid) {
        errors.push(...schemaValidation.errors.map(err => `Node ${id}: ${err}`));
        if (schemaValidation.errorCodes) {
          errorCodes.push(...schemaValidation.errorCodes);
        }
      }
    }
  }
  
  // Validate all documents
  for (const [id, doc] of this._documents) {
    // 1. Document structure validation
    const documentValidation = Validator.validateDocumentStructure(doc);
    if (!documentValidation.valid) {
      errors.push(...documentValidation.errors.map(err => `Document ${id}: ${err}`));
      if (documentValidation.errorCodes) {
        errorCodes.push(...documentValidation.errorCodes);
      }
    }
    
    // 2. Schema-based document validation (if schema exists)
    const schema = this.getSchema();
    if (schema) {
      const schemaDocumentValidation = Validator.validateDocument(schema, doc);
      if (!schemaDocumentValidation.valid) {
        errors.push(...schemaDocumentValidation.errors.map(err => `Document ${id}: ${err}`));
        if (schemaDocumentValidation.errorCodes) {
          errorCodes.push(...schemaDocumentValidation.errorCodes);
        }
      }
    }
  }
  
  // Reference integrity validation
  const referenceValidation = this._validateReferences();
  if (!referenceValidation.valid) {
    errors.push(...referenceValidation.errors);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

### 8.3 Reference Integrity Validation

```typescript
private _validateReferences(): ValidationResult {
  const errors: string[] = [];
  
  for (const [id, node] of this._nodes) {
    // Validate parentId reference
    if (node.parentId && !this._nodes.has(node.parentId)) {
      errors.push(`Node ${id} references non-existent parent ${node.parentId}`);
    }
    
    // Validate content references
    if (node.content) {
      for (const childId of node.content) {
        if (!this._nodes.has(childId)) {
          errors.push(`Node ${id} references non-existent child ${childId}`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
```

## 9. Performance Optimization

### 9.1 Lazy Copy

```typescript
class LazyDataStoreSnapshot extends DataStoreSnapshot {
  private _copiedNodes = new Set<string>();
  private _copiedDocuments = new Set<string>();

  constructor(originalStore: DataStore) {
    super(originalStore);
    // Start empty initially
    this._nodes.clear();
    this._documents.clear();
  }

  // Lazy copy on node access
  getNode(nodeId: string): INode | undefined {
    if (!this._copiedNodes.has(nodeId)) {
      const originalNode = this._originalStore.getNode(nodeId);
      if (originalNode) {
        this._nodes.set(nodeId, this._deepCloneNode(originalNode));
        this._copiedNodes.add(nodeId);
      }
    }
    
    return this._nodes.get(nodeId);
  }

  // Lazy copy on document access
  getDocument(documentId: string): Document | undefined {
    if (!this._copiedDocuments.has(documentId)) {
      const originalDoc = this._originalStore.getDocument(documentId);
      if (originalDoc) {
        this._documents.set(documentId, this._deepCloneDocument(originalDoc));
        this._copiedDocuments.add(documentId);
      }
    }
    
    return this._documents.get(documentId);
  }
}
```

### 9.2 Memory Usage Monitoring

```typescript
class MemoryOptimizedSnapshot extends DataStoreSnapshot {
  private _maxMemoryUsage: number = 100 * 1024 * 1024; // 100MB
  private _currentMemoryUsage: number = 0;

  // Check memory usage
  checkMemoryUsage(): { current: number; max: number; percentage: number } {
    const percentage = (this._currentMemoryUsage / this._maxMemoryUsage) * 100;
    
    return {
      current: this._currentMemoryUsage,
      max: this._maxMemoryUsage,
      percentage
    };
  }

  // Update memory usage
  private _updateMemoryUsage(): void {
    this._currentMemoryUsage = this._estimateMemoryUsage();
    
    if (this._currentMemoryUsage > this._maxMemoryUsage) {
      this._cleanupUnusedData();
    }
  }

  // Estimate memory usage
  private _estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (const [id, node] of this._nodes) {
      totalSize += JSON.stringify(node).length;
    }
    
    for (const [id, doc] of this._documents) {
      totalSize += JSON.stringify(doc).length;
    }
    
    return totalSize;
  }

  // Clean up unused data
  private _cleanupUnusedData(): void {
    // Find unused nodes
    const unusedNodes = this._findUnusedNodes();
    
    // Delete nodes
    for (const nodeId of unusedNodes) {
      this._nodes.delete(nodeId);
    }
    
    // Recalculate memory usage
    this._updateMemoryUsage();
  }
}
```

## 10. Cost/Lazy Copy Notes (Summary)

- Full copy cost: O(N) node/document serialization cost. Initial snapshot cost can be high for large documents.
- Lazy copy point: copy individual items on `getNode`/`getDocument` access. Reduces initial cost; variance depends on access patterns.
- Recommendation: default to eager snapshot; consider `LazyDataStoreSnapshot` if performance issues are measured.

## 11. Test Strategy

### 11.1 Unit Tests

```typescript
describe('DataStoreSnapshot Tests', () => {
  let dataStore: DataStore;
  let snapshot: DataStoreSnapshot;

  beforeEach(() => {
    dataStore = new DataStore('test-session');
    snapshot = new DataStoreSnapshot(dataStore);
  });

  describe('Snapshot Creation', () => {
    it('should create a snapshot with all nodes', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      
      const newSnapshot = new DataStoreSnapshot(dataStore);
      expect(newSnapshot.getNode(node.sid)).toBeDefined();
    });

    it('should create independent copies', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      
      const newSnapshot = new DataStoreSnapshot(dataStore);
      const snapshotNode = newSnapshot.getNode(node.sid);
      
      expect(snapshotNode).not.toBe(node); // different object
      expect(snapshotNode).toEqual(node); // same content
    });
  });

  describe('Operation Application', () => {
    it('should apply create operation', () => {
      const node = createTestNode();
      const operation: TransactionOperation = {
        type: 'create',
        nodeId: node.sid,
        data: node
      };
      
      const result = snapshot.applyOperation(operation);
      expect(result).toBeNull(); // success
      expect(snapshot.getNode(node.sid)).toBeDefined();
    });

    it('should apply update operation', () => {
      const node = createTestNode();
      dataStore.saveNode(node);
      const newSnapshot = new DataStoreSnapshot(dataStore);
      
      const operation: TransactionOperation = {
        type: 'update',
        nodeId: node.sid,
        data: { text: 'Updated' }
      };
      
      const result = newSnapshot.applyOperation(operation);
      expect(result).toBeNull(); // success
      expect(newSnapshot.getNode(node.sid)?.text).toBe('Updated');
    });
  });
});
```

### 11.2 Integration Tests

```typescript
describe('DataStoreSnapshot Integration Tests', () => {
  let dataStore: DataStore;
  let snapshot: DataStoreSnapshot;

  beforeEach(() => {
    dataStore = new DataStore('test-session');
    snapshot = new DataStoreSnapshot(dataStore);
  });

  it('should restore changes to original store', () => {
    const node = createTestNode();
    const operation: TransactionOperation = {
      type: 'create',
      nodeId: node.sid,
      data: node
    };
    
    // Apply changes to snapshot
    snapshot.applyOperation(operation);
    
    // Restore to original
    snapshot.restoreTo(dataStore);
    
    // Verify changes are reflected in original
    expect(dataStore.getNode(node.sid)).toBeDefined();
  });

  it('should maintain data integrity during complex operations', () => {
    const document = createComplexDocument();
    dataStore.saveDocument(document);
    
    const newSnapshot = new DataStoreSnapshot(dataStore);
    
    // Perform multiple operations
    const operations = [
      { type: 'create', nodeId: 'node-1', data: createTestNode() },
      { type: 'update', nodeId: 'node-1', data: { text: 'Updated' } },
      { type: 'delete', nodeId: 'node-1' }
    ];
    
    for (const operation of operations) {
      const result = newSnapshot.applyOperation(operation);
      expect(result).toBeNull(); // success
    }
    
    // Verify data integrity
    const validation = newSnapshot.validateSnapshot();
    expect(validation.valid).toBe(true);
  });
});
```

## 12. Extension Plans

### 12.1 Planned Features

- **Incremental snapshots**: track only changed parts
- **Compressed snapshots**: optimize memory usage
- **Distributed snapshots**: snapshots across multiple DataStores
- **Snapshot history**: snapshot version management

### 12.2 Advanced Features

- **Snapshot merge**: merge multiple snapshots
- **Snapshot split**: split large snapshots
- **Snapshot compression**: compress old snapshots
- **Snapshot replication**: replicate snapshots

---

This spec is based on the current implementation of the Barocss DataSnapshot system and includes future extension plans and improvements.

## 13. Update Notes (Final Implementation)
- Snapshots apply only basic operations (create/update/delete/createDocument/updateDocument/deleteDocument) directly.
- Custom operations are executed in TransactionManager, then translated to basic operations for snapshot application.
- Validation focuses on integrity; if a root schema exists, minimal type validation is performed as a supplement.
- Atomic commit via `restoreTo(DataStore)`; discard snapshot on failure.
