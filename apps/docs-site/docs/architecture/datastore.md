# @barocss/datastore

The DataStore package provides transactional, schema-aware node storage with a normalized data structure. It's the single source of truth for your document data.

## Purpose

Transactional node storage with schema awareness and efficient data management. All document changes go through the DataStore.

## Key Exports

- `DataStore` - Main storage class
- `RangeOperations` - Text range operations
- `DecoratorOperations` - Decorator management

## Basic Usage

```typescript
import { DataStore } from '@barocss/datastore';

// Create DataStore with schema
const dataStore = new DataStore(undefined, schema);

// Create a node
dataStore.createNode({ 
  sid: 'p1', 
  stype: 'paragraph', 
  content: [] 
});

// Update a node
dataStore.updateNode('p1', {
  text: 'Updated text'
});

// Get a node
const node = dataStore.getNode('p1');
```

## Core Features

### Transactional Overlay (Copy-on-Write)

DataStore uses a Copy-on-Write (COW) overlay mechanism for efficient transactions:

```typescript
// Begin transaction (creates empty overlay)
dataStore.begin();

// Make changes (only modified nodes are copied)
dataStore.createNode({ sid: 'p1', stype: 'paragraph', content: [] });
dataStore.updateNode('p1', { text: 'Hello' });

// End transaction (returns collected operations)
const operations = dataStore.end();

// Commit (applies changes to base in order: create → update → move → delete)
dataStore.commit();

// Or rollback (discards overlay without applying)
dataStore.rollback();
```

**How it works:**
1. **begin()**: Creates empty overlay (O(1) - no copying)
2. **Read**: Checks overlay → base (only modified nodes in overlay)
3. **Write**: Clones from base to overlay only when needed (COW)
4. **end()**: Returns collected operations
5. **commit()**: Applies operations to base in deterministic order
6. **rollback()**: Discards overlay

**Benefits:**
- O(1) transaction start (no copying on begin)
- Memory efficient (only modified nodes duplicated)
- Atomic operations (all or nothing)
- Operation history (for collaboration)

### Schema Validation

All operations are validated against the schema:

```typescript
// ✅ Valid - 'paragraph' is in schema
dataStore.createNode({ sid: 'p1', stype: 'paragraph', content: [] });

// ❌ Invalid - 'invalid-node' is not in schema
dataStore.createNode({ sid: 'n1', stype: 'invalid-node', content: [] });
// Throws validation error
```

### Normalized Storage

Data is stored in a normalized structure for efficiency:

```typescript
// Nodes are stored by ID, not nested
// This makes updates and lookups fast
const node = dataStore.getNode('p1');  // O(1) lookup
```

### Lock System

Global write lock prevents concurrent write conflicts:

```typescript
// Acquire lock
const lockId = await dataStore.acquireLock('transaction-execution');

try {
  // Perform operations
  dataStore.begin();
  // ... operations ...
  dataStore.commit();
} finally {
  // Always release lock
  dataStore.releaseLock(lockId);
}
```

**Lock features:**
- FIFO queue for waiting transactions
- Timeout support (prevents deadlocks)
- Lock statistics tracking
- Automatic timeout handling

### SID System

Stable ID (SID) system for node identification:

```typescript
// SID format: sessionId:globalCounter
// Example: '0:1', '1:5'

// SID ensures:
// - Same node = same SID across sessions
// - O(1) node lookup
// - Consistent references for collaboration
```

**SID benefits:**
- Consistent node references
- O(1) lookup performance
- Collaboration support (same node = same SID)
- Stable across sessions

### Operation Events

DataStore emits operations for collaboration:

```typescript
// Listen to operations
dataStore.onOperation((operation) => {
  // operation: AtomicOperation
  // Send to collaboration backend
  collaborationAdapter.sendOperation(operation);
});

// Operations are emitted after commit
// Format: { type: 'create' | 'update' | 'delete' | 'move', ... }
```

## Common Operations

### Node Operations

```typescript
// Create
dataStore.createNode({ sid: 'p1', stype: 'paragraph', content: [] });

// Read
const node = dataStore.getNode('p1');

// Update
dataStore.updateNode('p1', { text: 'New text' });

// Delete
dataStore.deleteNode('p1');
```

### Text Range Operations

```typescript
import { RangeOperations } from '@barocss/datastore';

// Insert text at position
RangeOperations.insertText(dataStore, 'text-1', 5, 'Hello');

// Delete text range
RangeOperations.deleteText(dataStore, 'text-1', 0, 5);
```

## When to Use

- **Document Storage**: All document data is stored in DataStore
- **Model Operations**: All model changes go through DataStore
- **Transaction Management**: Use transactions for atomic operations

## Integration

DataStore is used by:

- **Editor**: All commands operate on DataStore
- **Model Package**: Transaction DSL uses DataStore
- **Renderer**: Reads from DataStore for rendering

## Related

- [Core Concepts: Schema & Model](../concepts/schema-and-model) - Understanding the model
- [Model Package](./model) - High-level operations on DataStore
- [Editor Core Package](./editor-core) - How editor uses DataStore
