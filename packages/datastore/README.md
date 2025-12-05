# @barocss/datastore

Transactional, schema-aware node store for managing document structure with normalized `INode` and `IMark` using `sid` (stable ID) and `stype` (schema type).

## Architecture

```mermaid
graph TB
    subgraph "DataStore"
        A["Node Storage<br/>Map&lt;sid, INode&gt;"]
        B["Content Operations<br/>Parent-Child"]
        C["Transaction Manager<br/>Begin/Commit/Rollback"]
        D["Schema Validation"]
        E["Transactional Overlay<br/>Copy-on-Write"]
        F["Lock System<br/>Global Write Lock"]
    end
    
    G["Schema"] --> D
    A --> B
    C --> E
    E --> A
    D --> A
    F --> C
    
    H["Model Operations"] --> C
    C --> I["DataStore State"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
    style E fill:#fff9c4
    style F fill:#fce4ec
    style G fill:#e0f2f1
    style H fill:#e0f2f1
    style I fill:#f1f8e9
```

## Memory Storage Structure & SID System

```mermaid
graph TB
    subgraph "Memory Storage"
        A["Map&lt;string, INode&gt;<br/>Key: sid<br/>Value: INode"]
        B["Node Lookup<br/>O(1) Access"]
    end
    
    subgraph "SID Generation"
        C["Session ID<br/>_sessionId: number"]
        D["Global Counter<br/>_globalCounter: number"]
        E["SID Format<br/>sessionId:counter<br/>e.g., '0:1', '1:5'"]
    end
    
    subgraph "Node Structure"
        F["INode<br/>sid: '0:1'<br/>stype: 'paragraph'<br/>text: 'Hello'<br/>content: ['0:2']<br/>parentId: '0:0'"]
    end
    
    subgraph "Collaborative Editing"
        G["Session A<br/>sessionId: 0"]
        H["Session B<br/>sessionId: 1"]
        I["Operation Broadcast<br/>AtomicOperation"]
        J["SID Consistency<br/>Same node = Same sid"]
    end
    
    C --> E
    D --> E
    E --> A
    A --> B
    A --> F
    
    G --> I
    H --> I
    I --> J
    J --> A
    
    style A fill:#e1f5ff
    style E fill:#fff4e1
    style F fill:#e8f5e9
    style I fill:#f3e5f5
    style J fill:#fce4ec
```

### Key Concepts

- **Memory Storage**: Nodes are stored in a `Map<string, INode>` where the key is the `sid` (stable ID), providing O(1) lookup performance
- **SID Format**: `sessionId:globalCounter` (e.g., `"0:1"`, `"1:5"`)
  - `sessionId`: Unique identifier for each DataStore instance/session
  - `globalCounter`: Static counter that increments for each new node
- **Collaborative Editing**: SID ensures nodes can be consistently referenced across multiple sessions
  - Same node always has the same SID across all sessions
  - Operations are broadcast with SID references
  - Conflict resolution uses SID to identify target nodes

## Collaborative Editing Integration

```mermaid
graph TB
    subgraph "Local Session A"
        A1["DataStore A<br/>sessionId: 0"]
        A2["User Input"]
        A3["Local Operations"]
        A4["TransactionalOverlay<br/>COW Operations"]
        A5["emitOperation<br/>AtomicOperation"]
    end
    
    subgraph "Local Session B"
        B1["DataStore B<br/>sessionId: 1"]
        B2["User Input"]
        B3["Local Operations"]
        B4["TransactionalOverlay<br/>COW Operations"]
        B5["emitOperation<br/>AtomicOperation"]
    end
    
    subgraph "Operation Structure"
        C1["AtomicOperation<br/>type: create|update|delete|move<br/>nodeId: sid<br/>data: INode snapshot<br/>timestamp: number<br/>parentId?: string<br/>position?: number"]
    end
    
    subgraph "Collaboration Layer"
        D1["Operation Broadcast<br/>CollaborationMessage"]
        D2["OT/CRDT Server<br/>Ordering & Transform"]
        D3["Conflict Resolution<br/>User > AI Priority"]
    end
    
    subgraph "Remote Sync"
        E1["onOperation Callback<br/>Receive Remote Ops"]
        E2["Apply to Local DataStore<br/>Merge with SID"]
        E3["Update Map&lt;sid, INode&gt;<br/>Maintain Consistency"]
    end
    
    A2 --> A3
    A3 --> A4
    A4 --> A5
    A5 --> C1
    
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> C1
    
    C1 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> E1
    
    E1 --> E2
    E2 --> E3
    E3 --> A1
    E3 --> B1
    
    style A1 fill:#e1f5ff
    style B1 fill:#e1f5ff
    style C1 fill:#fff4e1
    style D1 fill:#e8f5e9
    style D2 fill:#f3e5f5
    style D3 fill:#fce4ec
    style E1 fill:#fff9c4
    style E2 fill:#e0f2f1
    style E3 fill:#f1f8e9
```

### Collaborative Editing Flow

1. **Local Operations**
   - User input triggers local operations in DataStore
   - Operations are collected in `TransactionalOverlay` (Copy-on-Write)
   - Each operation emits `AtomicOperation` event via `emitOperation()`

2. **AtomicOperation Structure**
   ```typescript
   interface AtomicOperation {
     type: 'create' | 'update' | 'delete' | 'move';
     nodeId: string;        // SID reference
     data?: any;            // Node snapshot
     timestamp: number;
     parentId?: string;     // SID reference
     position?: number;
   }
   ```

3. **Operation Broadcast**
   - Operations are wrapped in `CollaborationMessage` and sent to server
   - Server applies OT/CRDT transformations for ordering
   - Conflict resolution follows priority: User > AI

4. **Remote Synchronization**
   - Remote operations received via `onOperation()` callback
   - Operations are applied to local DataStore using SID references
   - `Map<sid, INode>` is updated maintaining consistency across sessions

### Key Integration Points

- **SID Consistency**: All sessions reference the same node using the same SID
- **Operation Events**: `emitOperation()` / `onOperation()` for operation lifecycle
- **Transactional Overlay**: COW mechanism ensures atomic operations
- **Conflict Resolution**: Operation-level conflict resolution, not node-level

### Collaboration Adapters

For production use, consider using collaboration adapter packages which provide ready-to-use adapters for popular CRDT/OT libraries:

- **[@barocss/collaboration-yjs](../collaboration-yjs/README.md)**: Yjs WebSocket-based real-time collaboration
- **[@barocss/collaboration-automerge](../collaboration-automerge/README.md)**: Automerge conflict-free replicated data types
- **[@barocss/collaboration-yorkie](../collaboration-yorkie/README.md)**: Yorkie self-hosted or cloud-based collaboration
- **[@barocss/collaboration-liveblocks](../collaboration-liveblocks/README.md)**: Liveblocks managed collaboration infrastructure

All adapters are built on top of [`@barocss/collaboration`](../collaboration/README.md) which provides the core interfaces and base adapter.

#### Quick Integration Example

All adapters follow the same pattern: create the adapter, connect it to DataStore, and operations will automatically sync:

```typescript
import { DataStore } from '@barocss/datastore';
import { YjsAdapter } from '@barocss/collaboration-yjs';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// 1. Create DataStore
const dataStore = new DataStore();

// 2. Set up collaboration backend (example: Yjs)
const ydoc = new Y.Doc();
const provider = new WebsocketProvider('ws://localhost:1234', 'room-id', ydoc);

// 3. Create and connect adapter
const adapter = new YjsAdapter({
  ydoc,
  config: { clientId: 'user-1' }
});

await adapter.connect(dataStore);

// 4. Operations are now automatically synced!
// - Local operations → sent to backend via adapter
// - Remote operations → applied to DataStore via adapter
```

#### How It Works

1. **Local Operations**: When DataStore emits operations via `emitOperation()`, the adapter captures them and sends to the collaboration backend
2. **Remote Operations**: When the backend receives operations from other clients, the adapter applies them to DataStore using `applyOperationToDataStore()` (which temporarily disables operation listeners to prevent circular updates)
3. **SID Consistency**: All clients use the same SID for the same node, ensuring consistent references across sessions

#### Choosing an Adapter

- **Yjs**: Best for WebSocket-based real-time collaboration with self-hosted or cloud servers
- **Automerge**: Best for peer-to-peer collaboration or when you need immutable document history
- **Yorkie**: Best for self-hosted or cloud-based collaboration with built-in presence features
- **Liveblocks**: Best for managed infrastructure with built-in authentication and presence

See individual adapter READMEs for detailed setup instructions and examples.

## Transactional Overlay (Copy-on-Write)

DataStore uses a Copy-on-Write (COW) overlay mechanism to provide efficient transactional operations without copying the entire document state.

### Architecture

```mermaid
graph TB
    subgraph "Base Layer (Read-Only)"
        A["baseNodes<br/>Map&lt;sid, INode&gt;<br/>Original State"]
    end
    
    subgraph "Overlay Layer (COW)"
        B["overlayNodes<br/>Map&lt;sid, INode&gt;<br/>Modified Nodes"]
        C["deletedNodeIds<br/>Set&lt;sid&gt;<br/>Deleted Nodes"]
        D["touchedParents<br/>Set&lt;sid&gt;<br/>Parents with Content Changes"]
        E["opBuffer<br/>AtomicOperation[]<br/>Operation History"]
    end
    
    subgraph "Read Path"
        F["getNode(id)"]
        G{"deletedNodeIds<br/>has(id)?"}
        H{"overlayNodes<br/>has(id)?"}
        I["Return overlay"]
        J["Return base"]
        K["Return undefined"]
    end
    
    subgraph "Write Path"
        L["updateNode/createNode"]
        M["Clone from base<br/>if needed"]
        N["Apply changes"]
        O["Store in overlay"]
    end
    
    A --> F
    B --> F
    C --> F
    
    F --> G
    G -->|yes| K
    G -->|no| H
    H -->|yes| I
    H -->|no| J
    
    L --> M
    M --> N
    N --> O
    O --> B
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#fce4ec
    style D fill:#e8f5e9
    style E fill:#f3e5f5
```

### How It Works

1. **Transaction Begin**: `begin()` initializes an empty overlay without copying base nodes
2. **Read Operations**: `getNode()` checks in order:
   - `deletedNodeIds` → returns `undefined` if deleted
   - `overlayNodes` → returns overlay version if modified
   - `baseNodes` → returns original version (fallback)
3. **Write Operations**: Changes are written to overlay using COW:
   - If node exists in overlay → use overlay version
   - If node exists only in base → clone from base to overlay
   - Apply changes to cloned node
   - Store in overlay
4. **Transaction End**: `end()` returns collected operations (overlay remains active)
5. **Commit**: `commit()` applies overlay changes to base in deterministic order:
   - `create` → `update` → `move` → `delete`
   - Clears overlay after application
6. **Rollback**: `rollback()` discards overlay without applying changes

### Transaction Lifecycle

```mermaid
sequenceDiagram
    participant Client
    participant DataStore
    participant Overlay
    participant Base
    
    Client->>DataStore: begin()
    DataStore->>Overlay: begin()
    Note over Overlay: Initialize empty overlay
    
    Client->>DataStore: updateNode(id, changes)
    DataStore->>Overlay: Check if node in overlay
    alt Node in overlay
        Overlay-->>DataStore: Use overlay node
    else Node only in base
        DataStore->>Base: getNode(id)
        Base-->>DataStore: Original node
        DataStore->>Overlay: Clone to overlay
    end
    DataStore->>Overlay: Apply changes
    DataStore->>Overlay: Store in overlayNodes
    DataStore->>Overlay: Record operation in opBuffer
    
    Client->>DataStore: end()
    DataStore->>Overlay: getCollectedOperations()
    Overlay-->>Client: Return operations array
    
    Client->>DataStore: commit()
    DataStore->>Overlay: Get operations
    DataStore->>Base: Apply operations in order
    Note over Base: create → update → move → delete
    DataStore->>Overlay: rollback()
    Note over Overlay: Clear overlay state
```

### Benefits

- **O(1) Transaction Start**: No copying of base nodes on `begin()`
- **Memory Efficient**: Only modified nodes are duplicated
- **Atomic Operations**: All changes are collected and applied atomically
- **Rollback Support**: Discard changes without affecting base state
- **Operation History**: All operations are recorded for sync/collaboration

### Usage

```typescript
// Begin transaction
dataStore.begin();

try {
  // All operations are written to overlay
  dataStore.updateNode('node-1', { text: 'Updated' });
  dataStore.createNode({ stype: 'paragraph', text: 'New' });
  
  // Get collected operations (overlay still active)
  const operations = dataStore.end();
  
  // Commit overlay to base
  dataStore.commit();
} catch (error) {
  // Rollback discards overlay
  dataStore.rollback();
}
```

## Lock System

DataStore provides a global write lock to prevent concurrent write conflicts during transactions.

### Architecture

```mermaid
graph TB
    subgraph "Lock Manager"
        A["Current Lock<br/>lockId, ownerId, acquiredAt"]
        B["Transaction Queue<br/>Waiting Transactions"]
        C["Lock Statistics<br/>Acquisitions, Timeouts, Wait Time"]
    end
    
    subgraph "Lock Acquisition"
        D["acquireLock(ownerId)"]
        E{"Lock<br/>Available?"}
        F["Immediate Acquisition"]
        G["Queue Entry"]
        H["Wait for Release"]
    end
    
    subgraph "Lock Release"
        I["releaseLock(lockId)"]
        J["Clear Current Lock"]
        K["Grant to Next<br/>in Queue"]
    end
    
    D --> E
    E -->|Yes| F
    E -->|No| G
    G --> H
    H --> K
    
    I --> J
    J --> K
    
    F --> A
    K --> A
    A --> C
    B --> C
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style F fill:#f3e5f5
    style G fill:#fce4ec
```

### How It Works

1. **Lock Acquisition**: `acquireLock(ownerId)` attempts to acquire the global write lock
   - If available → immediately granted
   - If busy → added to queue, waits for current lock release
   - Returns a unique `lockId` for the acquired lock

2. **Lock Queue**: Multiple transactions can wait in a FIFO queue
   - Each queued transaction has a timeout (default: 5 seconds)
   - Timeout rejects the promise if lock not acquired in time

3. **Lock Release**: `releaseLock(lockId)` releases the current lock
   - Validates `lockId` matches current lock (optional)
   - Grants lock to next transaction in queue
   - Updates statistics

4. **Lock Timeout**: Automatic timeout prevents deadlocks
   - Queue timeout: 5 seconds (rejects if not acquired)
   - Lock timeout: 50 seconds (force releases if held too long)

### Usage

```typescript
// Acquire lock
const lockId = await dataStore.acquireLock('transaction-1');

try {
  // Perform operations with exclusive access
  dataStore.begin();
  dataStore.updateNode('node-1', { text: 'Updated' });
  dataStore.commit();
} finally {
  // Always release lock
  dataStore.releaseLock(lockId);
}
```

### Lock Statistics

```typescript
const stats = dataStore.getLockStats();
// {
//   totalAcquisitions: number,
//   totalReleases: number,
//   totalTimeouts: number,
//   averageWaitTime: number,
//   queueLength: number,
//   isLocked: boolean,
//   currentLock: { lockId, ownerId, acquiredAt } | null,
//   queue: Array<{ lockId, ownerId }>
// }
```

### Lock Methods

```typescript
// Acquire lock (returns Promise<string>)
const lockId = await dataStore.acquireLock('owner-id');

// Release lock
dataStore.releaseLock(lockId);

// Check if locked
const isLocked = dataStore.isLocked();

// Get current lock info
const lockInfo = dataStore.getCurrentLock();
// { lockId: string, ownerId: string, acquiredAt: number } | null

// Get queue length
const queueLength = dataStore.getQueueLength();

// Get lock statistics
const stats = dataStore.getLockStats();
```

### Best Practices

1. **Always Release**: Use try/finally to ensure lock is released
2. **Timeout Handling**: Handle timeout errors appropriately
3. **Owner ID**: Use meaningful owner IDs for debugging
4. **Lock Scope**: Keep lock scope minimal (only during critical sections)

## Overview

`@barocss/datastore` provides a normalized, transactional data store for document nodes. It manages:

- **Node Storage**: Normalized node storage with `sid` (stable ID) and `stype` (schema type)
- **Schema Validation**: Schema-aware operations with validation
- **Transactions**: Atomic operations with rollback support via Copy-on-Write overlay
- **Transactional Overlay**: Efficient COW mechanism that only duplicates modified nodes
- **Lock System**: Global write lock with queue for concurrent transaction management
- **Content Management**: Parent-child relationships and content ordering
- **Mark Management**: Text marks (bold, italic, etc.) with range tracking
- **Operation Events**: `emitOperation()` / `onOperation()` for collaboration integration

## Installation

```bash
pnpm add @barocss/datastore
```

## Basic Usage

### Creating a DataStore

```typescript
import { DataStore } from '@barocss/datastore';
import { createSchema } from '@barocss/schema';
import type { INode } from '@barocss/datastore';

// Create schema
const schema = createSchema('basic-doc', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  }
});

// Create DataStore with schema
const dataStore = new DataStore();
dataStore.registerSchema(schema);

// Create document tree
const root = dataStore.createNodeWithChildren({
  stype: 'document',
  content: [
    {
      stype: 'paragraph',
      content: [
        { stype: 'inline-text', text: 'Hello, World!' }
      ]
    }
  ]
} as INode);

dataStore.setRootNodeId(root.sid!);
```

### Node Operations

```typescript
// Get node
const node = dataStore.getNode('text-1');

// Update node
dataStore.updateNode('text-1', { text: 'Updated text' });

// Create node
const newNode = dataStore.createNode({
  stype: 'paragraph',
  content: []
});

// Delete node
dataStore.deleteNode('node-id');
```

### Content Operations

```typescript
// Add child
dataStore.content.addChild('parent-id', childNode, 0);

// Remove child
dataStore.content.removeChild('parent-id', 'child-id');

// Move node
dataStore.content.moveNode('node-id', 'new-parent-id', 0);

// Reorder children
dataStore.content.reorderChildren('parent-id', ['child-1', 'child-2', 'child-3']);
```

### Block Operations

```typescript
// Move block up/down
dataStore.moveBlockUp('block-id');
dataStore.moveBlockDown('block-id');

// Transform node type
dataStore.transformNode('node-id', 'heading', { level: 1 });
```

### Transactions

Transactions use a Copy-on-Write overlay mechanism for efficient atomic operations:

```typescript
// Begin transaction (initializes overlay)
dataStore.begin();

try {
  // All operations are written to overlay (not base)
  dataStore.updateNode('text-1', { text: 'New text' });
  dataStore.content.addChild('parent-id', newNode, 0);
  
  // End transaction (returns collected operations)
  const operations = dataStore.end();
  
  // Commit applies overlay to base
  dataStore.commit();
} catch (error) {
  // Rollback discards overlay without affecting base
  dataStore.rollback();
}
```

### Transactions with Lock

For concurrent access, use the lock system:

```typescript
// Acquire lock before transaction
const lockId = await dataStore.acquireLock('transaction-1');

try {
  dataStore.begin();
  dataStore.updateNode('text-1', { text: 'New text' });
  dataStore.commit();
} catch (error) {
  dataStore.rollback();
} finally {
  // Always release lock
  dataStore.releaseLock(lockId);
}
```

## API Reference

### DataStore Class

#### Constructor
```typescript
new DataStore(rootNodeId?: string, schema?: Schema)
```

#### Methods

**Node Management**
- `getNode(nodeId: string): INode | null` - Get node by ID
- `setNode(node: INode, validate?: boolean): void` - Set/update node
- `createNode(node: INode): INode` - Create new node (assigns sid)
- `createNodeWithChildren(node: INode): INode` - Create node with children
- `updateNode(nodeId: string, updates: Partial<INode>, validate?: boolean): void` - Update node
- `deleteNode(nodeId: string): void` - Delete node
- `transformNode(nodeId: string, newType: string, newAttrs?: Record<string, any>): ValidationResult` - Transform node type

**Content Management**
- `content.addChild(parentId: string, child: INode, position?: number): void` - Add child
- `content.removeChild(parentId: string, childId: string): boolean` - Remove child
- `content.moveNode(nodeId: string, newParentId: string, position?: number): void` - Move node
- `content.reorderChildren(parentId: string, childIds: string[]): void` - Reorder children
- `content.moveBlockUp(nodeId: string): boolean` - Move block up
- `content.moveBlockDown(nodeId: string): boolean` - Move block down

**Schema Management**
- `registerSchema(schema: Schema): void` - Register schema
- `getActiveSchema(): Schema | null` - Get active schema
- `setSchema(schema: Schema): void` - Set active schema

**Transaction Management**
- `begin(): void` - Begin transaction (initializes overlay)
- `end(): AtomicOperation[]` - End transaction (returns collected operations)
- `commit(): void` - Commit transaction (applies overlay to base)
- `rollback(): void` - Rollback transaction (discards overlay)
- `getCollectedOperations(): AtomicOperation[]` - Get collected operations

**Lock Management**
- `acquireLock(ownerId?: string): Promise<string>` - Acquire global write lock
- `releaseLock(lockId?: string): void` - Release global write lock
- `isLocked(): boolean` - Check if lock is currently held
- `getCurrentLock(): { lockId: string; ownerId: string; acquiredAt: number } | null` - Get current lock info
- `getQueueLength(): number` - Get number of transactions waiting in queue
- `getLockStats(): LockStats` - Get lock statistics

**Document Management**
- `setRootNodeId(nodeId: string): void` - Set root node
- `getRootNodeId(): string | null` - Get root node ID
- `getRootNode(): INode | null` - Get root node

**Serialization**
- `serializeRange(startNodeId: string, startOffset: number, endNodeId: string, endOffset: number): SerializedRange` - Serialize range
- `deserializeNodes(serialized: SerializedRange): INode[]` - Deserialize nodes

## Types

### INode
```typescript
interface INode {
  sid?: string;           // Stable ID (assigned by DataStore)
  stype: string;          // Schema type
  text?: string;          // Text content (for text nodes)
  attributes?: Record<string, any>;  // Node attributes
  content?: string[];     // Child node IDs
  parentId?: string;      // Parent node ID
  marks?: IMark[];        // Text marks
}
```

### IMark
```typescript
interface IMark {
  type: string;           // Mark type (bold, italic, etc.)
  range: [number, number]; // Text range [start, end]
  attrs?: Record<string, any>;  // Mark attributes
}
```

### AtomicOperation
```typescript
interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;        // SID reference
  data?: any;            // Node snapshot
  timestamp: number;
  parentId?: string;     // SID reference
  position?: number;     // Position in parent content
}
```

### LockStats
```typescript
interface LockStats {
  totalAcquisitions: number;    // Total number of lock acquisitions
  totalReleases: number;        // Total number of lock releases
  totalTimeouts: number;        // Total number of timeout errors
  averageWaitTime: number;      // Average wait time in milliseconds
  queueLength: number;          // Current queue length
  isLocked: boolean;            // Whether lock is currently held
  currentLock: {                // Current lock info (null if unlocked)
    lockId: string;
    ownerId: string;
    acquiredAt: number;
  } | null;
  queue: Array<{                // Queued transactions
    lockId: string;
    ownerId: string;
  }>;
}
```

## Advanced Features

### Drop Behavior

Define custom drop behavior for draggable nodes:

```typescript
import { defineDropBehavior } from '@barocss/datastore';

defineDropBehavior('image', {
  canDrop: (source, target) => {
    return target.stype === 'paragraph';
  },
  onDrop: (source, target, position) => {
    // Custom drop logic
  }
});
```

### Performance Optimization

#### Batch Operations with Overlay

The Copy-on-Write overlay allows efficient batching:

```typescript
// Begin transaction (O(1) - no copying)
dataStore.begin();

// Multiple operations (only modified nodes are duplicated)
dataStore.updateNode('node-1', { text: 'Updated' });
dataStore.updateNode('node-2', { text: 'Updated' });
dataStore.createNode({ stype: 'paragraph', text: 'New' });

// End returns operations, commit applies atomically
const operations = dataStore.end();
dataStore.commit(); // All changes applied in one go
```

#### Benefits

- **O(1) Transaction Start**: No copying on `begin()`
- **Memory Efficient**: Only modified nodes are duplicated
- **Atomic Commit**: All changes applied together
- **Operation Collection**: All operations collected for sync/collaboration

## Testing

```bash
cd packages/datastore
pnpm test:run
```

## License

MIT

