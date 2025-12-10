# Transaction Lock System Specification

## Overview

This document defines the transaction ordering mechanism that uses DataStore-based global locks and a queue. The system guarantees execution order, prevents concurrency issues, and provides tracing/debugging for lock ownership.

## Goals

- **Order guarantee**: transactions finish in the order they start
- **Concurrency control**: only one transaction executes at a time to keep data consistent
- **FIFO processing**: First-In, First-Out queueing for transactions
- **Timeout management**: avoid infinite waits via timeouts
- **Lock tracing**: unique lock IDs for ownership tracking and debugging
- **Safe release**: lock ID validation before release

## Architecture

### 1. DataStore lock management

```typescript
class DataStore {
  // Lock state (ID-based)
  private _currentLock: {
    lockId: string;
    ownerId: string;
    acquiredAt: number;
    timeoutId: NodeJS.Timeout;
  } | null = null;
  
  private _transactionQueue: Array<{
    lockId: string;
    ownerId: string;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  
  private _lockTimeout: number = 5000; // 5-second timeout
  
  // Lock stats
  private _lockStats = {
    totalAcquisitions: number;
    totalReleases: number;
    totalTimeouts: number;
    averageWaitTime: number;
  };
}
```

### 2. Lock lifecycle (ID-based)

```
1. acquireLock(ownerId) is called
   ├─ If no lock → generate unique lock ID and acquire immediately
   └─ If locked → create lock ID, enqueue, and wait

2. Run transaction
   ├─ Success → commit()
   └─ Failure → rollback()

3. releaseLock(lockId) is called
   ├─ Validate lock ID
   ├─ If queue is empty → release lock
   └─ If queue has waiters → pass lock to next transaction
```

## API

### DataStore Lock API

#### `acquireLock(ownerId?: string): Promise<string>`
Acquire the global lock.

**Parameters:**
- `ownerId` (optional): lock owner ID (transaction ID or user ID). Default: `'unknown'`

**Behavior:**
- If unlocked: generate unique lock ID and acquire immediately
- If locked: generate lock ID, enqueue, and wait
- Apply timeout (default 5 seconds)

**Returns:**
- `Promise<string>`: the lock ID
- Rejects on timeout

**Errors:**
- `Lock acquisition timeout after 5000ms for owner {ownerId}`

#### `releaseLock(lockId?: string): void`
Release the global lock.

**Parameters:**
- `lockId` (optional): lock ID to validate before release

**Behavior:**
- Validate lock ID when provided
- Release current lock
- Hand lock to next queued transaction if any
- If queue is empty, set lock state to null

**Errors:**
- `Lock ID mismatch: expected {expectedId}, got {providedId}`

#### `isLocked(): boolean`
Check whether the lock is held.

**Returns:**
- `true`: locked
- `false`: unlocked

#### `getCurrentLock(): LockInfo | null`
Return current lock info.

**Returns:**
```typescript
interface LockInfo {
  lockId: string;
  ownerId: string;
  acquiredAt: number;
}
```
- `LockInfo` when locked
- `null` when unlocked

#### `getQueueLength(): number`
Return the number of waiting transactions.

#### `getQueueInfo(): QueueItem[]`
Return details of waiting transactions.

**Returns:**
```typescript
interface QueueItem {
  lockId: string;
  ownerId: string;
  waitTime: number;
}
```

#### `getLockStats(): LockStats`
Return lock statistics.

```typescript
interface LockStats {
  totalAcquisitions: number;    // total lock acquisitions
  totalReleases: number;        // total releases
  totalTimeouts: number;        // total timeouts
  averageWaitTime: number;      // average wait (ms)
  queueLength: number;          // current queue length
  isLocked: boolean;            // current lock state
  currentLock: LockInfo | null; // current lock info
  queue: QueueItem[];           // queued transactions
}
```

#### `setLockTimeout(timeout: number): void`
Set lock timeout in milliseconds.

#### `resetLockStats(): void`
Reset lock statistics.

### TransactionManager Integration

#### Transaction execution flow (lock ID-based)

```typescript
async execute(operations: any[]): Promise<TransactionResult> {
  let lockId: string | null = null;
  
  try {
    // 1. Acquire global lock
    lockId = await this._dataStore.acquireLock('transaction-execution');

    // 2. Begin transaction
    this._beginTransaction('DSL Transaction');

    // 3. Begin DataStore overlay transaction
    this._dataStore.begin();

    // 4. Execute all operations and collect results
    const executedOperations: any[] = [];
    for (const operation of operations) {
      const result = await this._executeOperation(operation);
      executedOperations.push(result || operation);
    }

    // 5. End overlay and commit
    this._dataStore.end();
    this._dataStore.commit();

    // 6. Return success result
    const result = {
      success: true,
      errors: [],
      transactionId: this._currentTransaction!.sid,
      operations: executedOperations
    };

    // 7. Cleanup
    this._currentTransaction = null;
    return result;

  } catch (error: any) {
    // Roll back overlay on error
    try { this._dataStore.rollback(); } catch (_) {}
    
    const transactionId = this._currentTransaction?.sid;
    this._currentTransaction = null;

    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
      transactionId,
      operations
    };
  } finally {
    // 8. Release global lock
    if (lockId) {
      this._dataStore.releaseLock(lockId);
    }
  }
}
```

## Usage Examples

### 1. Basic usage (lock ID-based)

```typescript
// Create DataStore instance
const dataStore = new DataStore();

// Create transaction manager
const transactionManager = new TransactionManager(dataStore);

// Run transaction via DSL (lock managed automatically)
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();
```

### 2. Monitoring lock state (detailed info)

```typescript
// Check lock state
console.log('Is locked:', dataStore.isLocked());

// Current lock info
const currentLock = dataStore.getCurrentLock();
if (currentLock) {
  console.log('Current lock owner:', currentLock.ownerId);
  console.log('Lock acquired at:', new Date(currentLock.acquiredAt));
  console.log('Lock ID:', currentLock.lockId);
}

// Queue info
console.log('Queue length:', dataStore.getQueueLength());
const queueInfo = dataStore.getQueueInfo();
queueInfo.forEach(item => {
  console.log(`Waiting: ${item.ownerId} (${item.waitTime}ms)`);
});

// Lock statistics
const stats = dataStore.getLockStats();
console.log('Lock statistics:', stats);
```

### 3. Timeout configuration

```typescript
// Set timeout to 10 seconds
dataStore.setLockTimeout(10000);

// Reset statistics
dataStore.resetLockStats();
```

### 4. Concurrent transactions (lock ID tracking)

```typescript
// Multiple transactions starting simultaneously
const promises = [
  transaction(editor, [create(textNode('inline-text', 'Text 1'))]).commit(),
  transaction(editor, [create(textNode('inline-text', 'Text 2'))]).commit(),
  transaction(editor, [create(textNode('inline-text', 'Text 3'))]).commit()
];

// Executed in order (FIFO)
const results = await Promise.all(promises);

// Check lock info per transaction
results.forEach((result, index) => {
  console.log(`Transaction ${index + 1} completed:`, result.success);
});
```

### 5. Manual lock management (advanced)

```typescript
// Manually acquire/release lock
const lockId = await dataStore.acquireLock('manual-operation');
try {
  // Perform protected work
  console.log('Performing protected operation...');
} finally {
  // Always release
  dataStore.releaseLock(lockId);
}
```

## Performance Considerations

### 1. Lock overhead
- **Acquire/release**: overhead per transaction
- **Queue management**: memory for waiting transactions
- **Timeout handling**: timer management for detection

### 2. Concurrency limits
- **Sequential execution**: only one transaction at a time
- **Wait time**: later transactions must wait
- **No parallelism**: CPU cores cannot be exploited for concurrency

### 3. Optimization tips
- **Minimize lock scope**: protect only what is necessary
- **Tune timeouts**: choose appropriate timeout values
- **Monitor stats**: track lock performance metrics

## Error Handling

### 1. Timeout errors

```typescript
try {
  const lockId = await dataStore.acquireLock('my-operation');
  // Work
  dataStore.releaseLock(lockId);
} catch (error) {
  if (error.message.includes('timeout')) {
    console.log('Lock acquisition timeout - too many concurrent transactions');
  } else if (error.message.includes('Lock ID mismatch')) {
    console.log('Lock ID mismatch - attempting to release wrong lock');
  }
}
```

### 2. Lock release failures

```typescript
try {
  dataStore.releaseLock(lockId);
} catch (error) {
  if (error.message.includes('Lock ID mismatch')) {
    console.error('Lock ID mismatch:', error.message);
  } else {
    console.error('Failed to release lock:', error);
  }
  // Recover lock state if needed
}
```

### 3. Always release lock on transaction failure

```typescript
let lockId: string | null = null;
try {
  lockId = await this._dataStore.acquireLock('transaction-sid');
  // Execute transaction
} catch (error) {
  // Handle error
} finally {
  // Always release in finally
  if (lockId) {
    this._dataStore.releaseLock(lockId);
  }
}
```

## Test Scenarios

### 1. Basic lock behavior (lock ID-based)

```typescript
describe('Lock System', () => {
  it('should acquire and release lock with ID', async () => {
    const dataStore = new DataStore();
    
    expect(dataStore.isLocked()).toBe(false);
    
    const lockId = await dataStore.acquireLock('test-owner');
    expect(dataStore.isLocked()).toBe(true);
    expect(lockId).toMatch(/^lock-\d+-[a-z0-9]+$/);
    
    const lockInfo = dataStore.getCurrentLock();
    expect(lockInfo?.ownerId).toBe('test-owner');
    
    dataStore.releaseLock(lockId);
    expect(dataStore.isLocked()).toBe(false);
  });

  it('should handle transaction with lock', async () => {
    const dataStore = new DataStore();
    const editor = { dataStore, _dataStore: dataStore };
    
    const result = await transaction(editor, [
      create(textNode('inline-text', 'Hello'))
    ]).commit();
    
    expect(result.success).toBe(true);
    expect(dataStore.isLocked()).toBe(false); // Lock automatically released
  });
});
```

### 2. Order guarantee (lock ID tracking)

```typescript
it('should process transactions in order', async () => {
  const dataStore = new DataStore();
  const results: number[] = [];
  
  const promises = [
    dataStore.acquireLock('owner-1').then(lockId => { 
      results.push(1); 
      dataStore.releaseLock(lockId); 
    }),
    dataStore.acquireLock('owner-2').then(lockId => { 
      results.push(2); 
      dataStore.releaseLock(lockId); 
    }),
    dataStore.acquireLock('owner-3').then(lockId => { 
      results.push(3); 
      dataStore.releaseLock(lockId); 
    })
  ];
  
  await Promise.all(promises);
  expect(results).toEqual([1, 2, 3]);
});
```

### 3. Timeout handling (lock ID-based)

```typescript
it('should timeout when lock is not released', async () => {
  const dataStore = new DataStore();
  dataStore.setLockTimeout(100); // 100ms timeout
  
  const lockId1 = await dataStore.acquireLock('owner-1');
  
  await expect(dataStore.acquireLock('owner-2')).rejects.toThrow('timeout');
  
  dataStore.releaseLock(lockId1);
});
```

## Extensibility

### 1. Fine-grained locks

```typescript
// Per-node lock management
class NodeLockManager {
  private _nodeLocks = new Map<string, boolean>();
  
  async acquireNodeLock(nodeId: string): Promise<void> {
    // Acquire lock for a specific node
  }
  
  releaseNodeLock(nodeId: string): void {
    // Release lock for a specific node
  }
}
```

### 2. Priority queue

```typescript
// Priority-based transaction handling
class PriorityLockManager {
  private _priorityQueue: Array<{ priority: number; callback: () => void }> = [];
  
  async acquireLock(priority: number = 0): Promise<void> {
    // Acquire lock based on priority
  }
}
```

### 3. Distributed lock

```typescript
// Lock synchronization across multiple DataStore instances
class DistributedLockManager {
  async acquireDistributedLock(lockId: string): Promise<void> {
    // Manage locks in a distributed environment
  }
}
```

## Integration with Actual Implementation

### Using locks in TransactionManager

```typescript
// Lock usage inside TransactionManager.execute()
async execute(operations: any[]): Promise<TransactionResult> {
  let lockId: string | null = null;
  
  try {
    // 1. Acquire global lock (fixed ownerId)
    lockId = await this._dataStore.acquireLock('transaction-execution');
    
    // ... execute transaction ...
    
  } finally {
    // 8. Always release global lock regardless of success/failure
    if (lockId) {
      this._dataStore.releaseLock(lockId);
    }
  }
}
```

### DSL integration

```typescript
// When running transactions via DSL, lock management is automatic
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

// Internally, TransactionManager.execute() handles lock acquisition/release
```

## Conclusion

The DataStore-based global lock system (ID-based) offers:

1. **Order guarantee**: transactions finish in start order
2. **Safety**: lock ID validation ensures safe release
3. **Traceability**: unique lock IDs for ownership tracking and debugging
4. **Consistency**: data remains consistent
5. **Monitoring**: detailed stats and queue info for performance insight
6. **Extensibility**: can extend to fine-grained locks when needed
7. **Debugging**: lock ownership info makes diagnosis easier
8. **Automatic management**: locks are automatically handled in DSL transactions

With this system, transactions run in order, data stays consistent, and lock-related issues are easy to diagnose. Thanks to DSL integration, developers can rely on automatic lock management while focusing on transaction logic.
