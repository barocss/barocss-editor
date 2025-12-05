# Model Transaction Integration with DataStore Lock & Overlay

This document explains how `@barocss/model` transactions integrate with DataStore's lock system and transactional overlay.

## Overview

When a model transaction is executed via `transaction(editor, ops).commit()`, it orchestrates DataStore's lock and overlay systems to ensure atomic, concurrent-safe operations.

## Complete Flow

```mermaid
sequenceDiagram
    participant User
    participant Model as Model Transaction<br/>TransactionManager
    participant Lock as DataStore<br/>Lock System
    participant Overlay as DataStore<br/>Transactional Overlay
    participant Base as DataStore<br/>Base Nodes
    participant Ops as Operations<br/>Registry & Execution
    
    User->>Model: transaction(editor, ops).commit()
    
    Note over Model,Lock: Phase 1: Lock Acquisition
    Model->>Lock: acquireLock('transaction-execution')
    alt Lock Available
        Lock-->>Model: lockId (immediate)
    else Lock Busy
        Lock->>Lock: Add to queue
        Lock-->>Model: lockId (after wait)
    end
    
    Note over Model,Overlay: Phase 2: Transaction Start
    Model->>Model: _beginTransaction()<br/>Create transaction metadata
    Model->>Overlay: begin()<br/>Initialize empty overlay
    
    Note over Model,Ops: Phase 3: Operation Execution
    loop For each operation
        Model->>Ops: Execute operation
        Ops->>Overlay: Read/Write via DataStore
        alt Read Operation
            Overlay->>Base: Check baseNodes (if not in overlay)
            Base-->>Overlay: Return node
        else Write Operation
            Overlay->>Overlay: COW: Clone from base if needed
            Overlay->>Overlay: Apply changes to overlay
            Overlay->>Overlay: Record in opBuffer
        end
        Ops-->>Model: Operation result
    end
    
    Note over Model,Overlay: Phase 4: Transaction End
    Model->>Overlay: end()<br/>Get collected operations
    Overlay-->>Model: AtomicOperation[]
    
    Note over Model,Base: Phase 5: Commit
    Model->>Overlay: commit()<br/>Apply overlay to base
    Overlay->>Base: Apply operations in order<br/>(create → update → move → delete)
    Base->>Base: Update baseNodes
    Overlay->>Overlay: Clear overlay state
    
    Note over Model: Phase 6: Post-Commit
    Model->>Model: Add to history (if needed)
    Model->>Model: Emit editor:content.change
    Model->>Model: Update selection
    
    Note over Model,Lock: Phase 7: Lock Release
    Model->>Lock: releaseLock(lockId)
    Lock->>Lock: Grant to next in queue
    Lock-->>Model: Lock released
    
    Model-->>User: TransactionResult
```

## Architecture Diagram

```mermaid
graph TB
    subgraph "Model Layer"
        A["Transaction DSL<br/>transaction(editor, ops)"]
        B["TransactionManager<br/>execute()"]
    end
    
    subgraph "DataStore Lock System"
        C["acquireLock()<br/>Global Write Lock"]
        D["Lock Queue<br/>FIFO Waiting"]
        E["releaseLock()<br/>Grant to Next"]
    end
    
    subgraph "DataStore Overlay System"
        F["begin()<br/>Initialize Overlay"]
        G["Transactional Overlay<br/>COW Operations"]
        H["end()<br/>Collect Operations"]
        I["commit()<br/>Apply to Base"]
        J["rollback()<br/>Discard Overlay"]
    end
    
    subgraph "DataStore Base"
        K["baseNodes<br/>Map&lt;sid, INode&gt;"]
    end
    
    A --> B
    B --> C
    C --> D
    D --> E
    C --> F
    F --> G
    G --> H
    H --> I
    I --> K
    B --> J
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#f3e5f5
    style D fill:#fce4ec
    style E fill:#fce4ec
    style F fill:#e8f5e9
    style G fill:#fff9c4
    style H fill:#e0f2f1
    style I fill:#e0f2f1
    style J fill:#ffebee
    style K fill:#f1f8e9
```

## Detailed Phase Breakdown

### Phase 1: Lock Acquisition

```mermaid
flowchart LR
    A["TransactionManager.execute()"] --> B["acquireLock('transaction-execution')"]
    B --> C{"Lock Available?"}
    C -->|Yes| D["Immediate Grant<br/>lockId returned"]
    C -->|No| E["Add to Queue<br/>Wait for Release"]
    E --> F["Timeout Check<br/>5 seconds"]
    F -->|Timeout| G["Reject Promise"]
    F -->|Granted| D
    D --> H["Proceed to Phase 2"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style D fill:#e8f5e9
    style E fill:#fce4ec
    style G fill:#ffebee
```

**Purpose**: Ensure exclusive write access to prevent concurrent modification conflicts.

**Key Points**:
- Lock is acquired before any DataStore operations
- If lock is busy, transaction waits in FIFO queue
- Timeout prevents indefinite waiting (5 seconds default)
- Lock ID is stored for later release

### Phase 2: Transaction Start

```mermaid
flowchart LR
    A["Lock Acquired"] --> B["_beginTransaction()<br/>Create Transaction Metadata"]
    B --> C["dataStore.begin()<br/>Initialize Overlay"]
    C --> D["Overlay State:<br/>- overlayNodes: Map<br/>- deletedNodeIds: Set<br/>- opBuffer: Array<br/>- active: true"]
    D --> E["Proceed to Phase 3"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#fff9c4
```

**Purpose**: Initialize transaction metadata and overlay for COW operations.

**Key Points**:
- Transaction metadata created (sid, timestamp, description)
- Overlay initialized as empty (O(1) operation)
- Base nodes remain untouched
- All subsequent operations write to overlay

### Phase 3: Operation Execution

```mermaid
flowchart TB
    A["For each operation"] --> B{"Operation Type?"}
    B -->|Read| C["getNode(id)"]
    B -->|Write| D["updateNode/createNode/etc"]
    
    C --> E{"Check Overlay"}
    E -->|In overlay| F["Return overlay node"]
    E -->|Deleted| G["Return undefined"]
    E -->|Not in overlay| H["Return base node"]
    
    D --> I{"Node in overlay?"}
    I -->|Yes| J["Use overlay node"]
    I -->|No| K["Clone from base<br/>structuredClone()"]
    K --> L["Apply changes"]
    J --> L
    L --> M["Store in overlayNodes"]
    M --> N["Record in opBuffer"]
    
    style A fill:#e1f5ff
    style C fill:#fff4e1
    style D fill:#fff4e1
    style F fill:#e8f5e9
    style H fill:#e8f5e9
    style M fill:#fff9c4
    style N fill:#f3e5f5
```

**Purpose**: Execute all operations within the overlay, collecting changes.

**Key Points**:
- Read operations check overlay first, then base
- Write operations use COW: clone from base if needed
- All changes stored in overlay, not base
- Operations recorded in opBuffer for commit
- Base nodes remain unchanged during execution

### Phase 4: Transaction End

```mermaid
flowchart LR
    A["All Operations Executed"] --> B["dataStore.end()"]
    B --> C["Get Collected Operations<br/>opBuffer.slice()"]
    C --> D["Return AtomicOperation[]<br/>(overlay still active)"]
    D --> E["Proceed to Phase 5"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#fff9c4
```

**Purpose**: Collect all operations for commit or rollback.

**Key Points**:
- Returns copy of operations (prevents mutation)
- Overlay remains active until commit/rollback
- Operations can be used for collaboration sync
- No changes applied to base yet

### Phase 5: Commit

```mermaid
flowchart TB
    A["dataStore.commit()"] --> B["Get Operations from Overlay"]
    B --> C["Sort by Priority<br/>create → update → move → delete"]
    C --> D["For each operation"]
    
    D --> E{"Operation Type?"}
    E -->|create| F["setNodeInternal()<br/>Add to baseNodes"]
    E -->|update| G["Merge with base node<br/>Apply to baseNodes"]
    E -->|move| H["Update parent.content<br/>Update baseNodes"]
    E -->|delete| I["Remove from baseNodes<br/>Update parent.content"]
    
    F --> J["All Applied"]
    G --> J
    H --> J
    I --> J
    
    J --> K["Clear Overlay<br/>rollback()"]
    K --> L["Base Updated"]
    
    style A fill:#e1f5ff
    style C fill:#fff4e1
    style F fill:#e8f5e9
    style G fill:#e8f5e9
    style H fill:#e8f5e9
    style I fill:#fce4ec
    style L fill:#fff9c4
```

**Purpose**: Atomically apply all overlay changes to base.

**Key Points**:
- Operations applied in deterministic order
- All changes applied together (atomic)
- Overlay cleared after commit
- Base nodes now reflect all changes

### Phase 6: Post-Commit

```mermaid
flowchart LR
    A["Commit Complete"] --> B["Add to History<br/>(if not undo/redo)"]
    B --> C["Emit editor:content.change"]
    C --> D["Update Selection"]
    D --> E["Proceed to Phase 7"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style C fill:#e8f5e9
    style D fill:#f3e5f5
```

**Purpose**: Notify other systems and update editor state.

**Key Points**:
- History updated for undo/redo
- View layer notified of changes
- Selection updated to reflect new state

### Phase 7: Lock Release

```mermaid
flowchart LR
    A["Post-Commit Complete"] --> B["releaseLock(lockId)"]
    B --> C{"Queue Empty?"}
    C -->|Yes| D["Lock Released<br/>No Current Lock"]
    C -->|No| E["Grant to Next<br/>in Queue"]
    E --> F["Next Transaction<br/>Can Proceed"]
    
    style A fill:#e1f5ff
    style B fill:#fff4e1
    style D fill:#e8f5e9
    style E fill:#f3e5f5
    style F fill:#fff9c4
```

**Purpose**: Release exclusive access, allowing next transaction to proceed.

**Key Points**:
- Lock always released in finally block
- Next transaction in queue automatically granted
- Statistics updated (releases, wait times)

## Error Handling

```mermaid
flowchart TB
    A["Transaction Execution"] --> B{"Error Occurred?"}
    B -->|No| C["Normal Flow"]
    B -->|Yes| D["Catch Block"]
    
    D --> E["dataStore.rollback()"]
    E --> F["Clear Overlay<br/>Discard All Changes"]
    F --> G["Return Error Result"]
    G --> H["finally: releaseLock()"]
    
    C --> I["finally: releaseLock()"]
    
    style A fill:#e1f5ff
    style D fill:#ffebee
    style E fill:#fce4ec
    style F fill:#fff4e1
    style H fill:#e8f5e9
    style I fill:#e8f5e9
```

**Error Handling Flow**:
1. Any error during operation execution triggers rollback
2. `rollback()` discards overlay without affecting base
3. Lock is always released in `finally` block
4. Error result returned to caller

## Concurrent Transaction Example

```mermaid
sequenceDiagram
    participant T1 as Transaction 1
    participant T2 as Transaction 2
    participant Lock
    participant Overlay1 as Overlay 1
    participant Overlay2 as Overlay 2
    participant Base
    
    T1->>Lock: acquireLock()
    Lock-->>T1: lockId-1 (granted)
    T1->>Overlay1: begin()
    
    T2->>Lock: acquireLock()
    Lock->>Lock: Add to queue
    Note over T2: Waiting...
    
    T1->>Overlay1: Operations...
    T1->>Overlay1: end()
    T1->>Base: commit()
    T1->>Lock: releaseLock()
    
    Lock->>T2: lockId-2 (granted)
    T2->>Overlay2: begin()
    T2->>Overlay2: Operations...
    T2->>Overlay2: end()
    T2->>Base: commit()
    T2->>Lock: releaseLock()
```

## Key Integration Points

### 1. Lock Before Overlay

Lock is acquired **before** overlay begins:
- Ensures exclusive access during entire transaction
- Prevents concurrent modifications
- Queue ensures fair FIFO ordering

### 2. Overlay During Operations

All operations execute within overlay:
- Reads check overlay → base (in that order)
- Writes go to overlay (COW from base if needed)
- Base remains unchanged until commit

### 3. Commit Applies Atomically

Commit applies all overlay changes at once:
- Operations sorted by priority
- All changes applied together
- Base updated atomically

### 4. Lock Released After Commit

Lock released in `finally` block:
- Always released, even on error
- Next transaction can proceed
- Statistics tracked

## Benefits of This Integration

1. **Atomicity**: All operations in transaction succeed or fail together
2. **Isolation**: Lock prevents concurrent modifications
3. **Efficiency**: COW only duplicates modified nodes
4. **Rollback**: Overlay can be discarded without affecting base
5. **Concurrency**: Queue system ensures fair access

## Code Example

```typescript
// Model transaction
const result = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Hello')
  ])),
  update('text-1', { text: 'Updated' })
]).commit();

// Internal flow:
// 1. TransactionManager.execute() called
// 2. acquireLock() → wait if needed
// 3. begin() → initialize overlay
// 4. Execute operations → write to overlay
// 5. end() → collect operations
// 6. commit() → apply to base
// 7. releaseLock() → grant to next
```

## Summary

The integration between Model transactions and DataStore lock/overlay systems provides:

- **Exclusive Access**: Lock ensures no concurrent writes
- **Efficient Isolation**: Overlay provides transaction isolation without full copy
- **Atomic Operations**: All changes applied together or not at all
- **Error Recovery**: Rollback discards changes without affecting base
- **Fair Concurrency**: Queue system ensures transactions execute in order

This design enables safe, efficient, concurrent document editing with full transaction support.

