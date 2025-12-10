# Ownership, Partial Ownership, and the Relationship with AI and Collaborative Editing

## 1. Introduction

### Problem Definition

In collaborative editing environments where multiple users and AI agents edit documents simultaneously, the following questions arise:

1. **Ownership**: Should we track "who created" a node?
2. **Partial Ownership**: What happens to ownership when only part of a text node is modified?
3. **AI's Role**: Should we distinguish between nodes created by AI and nodes created by users?
4. **Collaborative Editing Conflicts**: How do we handle cases where multiple agents/users modify the same node?

### Core Principle

**"Ownership" is a property of Operations, not a property of nodes.**

Nodes can be modified multiple times, and each modification can be done by different agents/users. Therefore, the concept of "owner of a node" itself is meaningless.

---

## 2. Limitations of the Ownership Concept

### 2.1 Nodes Can Be Modified Multiple Times

**Scenario:**

```
1. User A creates node
   - node.sid = '0:1'
   - node.text = 'Hello'

2. User B modifies node
   - node.sid = '0:1' (same node)
   - node.text = 'Hello World'

3. AI agent modifies node
   - node.sid = '0:1' (same node)
   - node.text = 'Hello AI World'

4. User A modifies again
   - node.sid = '0:1' (same node)
   - node.text = 'Hello AI World!'
```

**Problem:**
- Same node is modified multiple times
- Different agent/user for each modification
- Cannot define "owner of node"

### 2.2 Partial Modification of Text Nodes

**Scenario:**

```
Initial state:
- node.sid = '0:1'
- node.text = 'Hello World'

User A modifies part:
- node.text = 'Hello AI World'  (inserts 'AI' in the middle)

AI modifies part:
- node.text = 'Hello AI Beautiful World'  (inserts 'Beautiful' after 'AI')

User B modifies part:
- node.text = 'Hello AI Beautiful World!'  (adds '!' at the end)
```

**Problem:**
- Only part of text is modified
- Cannot track which part belongs to whom
- Cannot solve with "owner of node" concept

### 2.3 Conclusion: Node-Level Ownership is Impossible

**Reasons:**
1. Nodes can be modified multiple times
2. Different agent/user for each modification
3. Only part of text node may be modified
4. The concept of "owner of node" itself is meaningless

**Solution:**
- No owner information in node itself
- Owner information is managed only at Operation level

---

## 3. Operation-Level Ownership

### 3.1 Core Concept

**"Who did what" is tracked only in Operation events.**

```typescript
interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: any;
  timestamp: number;
  parentId?: string;
  position?: number;
  
  // Owner information (Operation level)
  owner?: {
    type: 'user' | 'agent';
    id: string;
    sessionId: string;
  };
}
```

### 3.2 Operation Creation in DataStore

```typescript
export class DataStore {
  private _sessionId: number = 0;
  private _owner?: {
    type: 'user' | 'agent';
    id: string;
  };
  
  constructor(
    rootNodeId?: string, 
    schema?: Schema, 
    sessionId?: number,
    owner?: { type: 'user' | 'agent'; id: string }
  ) {
    this._sessionId = sessionId ?? 0;
    this._owner = owner;
  }
  
  /**
   * Automatically include owner information when creating Operation
   */
  emitOperation(operation: AtomicOperation): void {
    const operationWithOwner: AtomicOperation = {
      ...operation,
      owner: this._owner ? {
        type: this._owner.type,
        id: this._owner.id,
        sessionId: this._sessionId.toString()
      } : undefined
    };
    
    // Record in overlay
    if (this._overlay && this._overlay.isActive()) {
      (this._overlay as any).recordOperation(operationWithOwner);
    }
    
    // Emit event
    this._eventEmitter.emit('operation', operationWithOwner);
  }
}
```

### 3.3 History Tracking

```typescript
/**
 * Track history with Operation event listener
 */
class OperationHistory {
  private history: Array<{
    nodeId: string;
    operation: string;
    owner?: {
      type: 'user' | 'agent';
      id: string;
      sessionId: string;
    };
    timestamp: number;
    data?: any;
  }> = [];
  
  /**
   * Receive Operation event
   */
  onOperation(operation: AtomicOperation): void {
    this.history.push({
      nodeId: operation.nodeId,
      operation: operation.type,
      owner: operation.owner,
      timestamp: operation.timestamp,
      data: operation.data
    });
  }
  
  /**
   * Get change history for specific node
   */
  getByNodeId(nodeId: string): Array<{
    operation: string;
    owner?: { type: 'user' | 'agent'; id: string };
    timestamp: number;
  }> {
    return this.history
      .filter(h => h.nodeId === nodeId)
      .map(h => ({
        operation: h.operation,
        owner: h.owner,
        timestamp: h.timestamp
      }));
  }
  
  /**
   * Get creator of node
   */
  getCreator(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    const createOp = history.find(h => h.operation === 'create');
    return createOp?.owner;
  }
  
  /**
   * Get last editor of node
   */
  getLastEditor(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    if (history.length === 0) return undefined;
    return history[history.length - 1].owner;
  }
}
```

---

## 4. Partial Ownership

### 4.1 Problem Definition

When only part of a text node is modified, should we track "which part belongs to whom"?

**Example:**
```
Initial: 'Hello World'
User A: 'Hello AI World' (inserts 'AI' in the middle)
AI: 'Hello AI Beautiful World' (inserts 'Beautiful' after 'AI')
User B: 'Hello AI Beautiful World!' (adds '!' at the end)
```

### 4.2 Solution: Do Not Track Partial Ownership

**Reasons:**
1. **Complexity**: Tracking owner for each character of text is unrealistic
2. **No meaning**: Only the final result matters, ownership of intermediate steps is not important
3. **Performance**: Tracking partial ownership has significant performance overhead

**Alternative:**
- Track only at Operation level
- Record only "who did what"
- Do not track ownership of specific parts of text

### 4.3 Operation-Level Tracking is Sufficient

```typescript
// Track with Operation history
const history = operationHistory.getByNodeId('0:1');
// [
//   { operation: 'create', owner: { type: 'user', id: 'alice' }, timestamp: 1000 },
//   { operation: 'update', owner: { type: 'user', id: 'alice' }, timestamp: 2000, data: { text: 'Hello AI World' } },
//   { operation: 'update', owner: { type: 'agent', id: 'ai-writer' }, timestamp: 3000, data: { text: 'Hello AI Beautiful World' } },
//   { operation: 'update', owner: { type: 'user', id: 'bob' }, timestamp: 4000, data: { text: 'Hello AI Beautiful World!' } }
// ]

// "Who did what" can be tracked
// But "which part belongs to whom" is not tracked
```

---

## 5. Relationship Between AI and Collaborative Editing

### 5.1 AI is an Editing Agent

**Core Principle:**
- AI is just an editing agent
- No need to distinguish between nodes created by AI and nodes created by users
- No AI/user distinction in node itself

### 5.2 AI Workflow

```typescript
// Process of AI creating node

// 1. Create AI DataStore
const aiStore = new DataStore(
  undefined, schema, 1,
  { type: 'agent', id: 'ai-writer' }
);

// 2. Create node
const node = aiStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'AI generated text' }]
});

// node.sid = '1:1' (same as regular node, no AI indicator)

// 3. Operation event
// {
//   type: 'create',
//   nodeId: '1:1',
//   owner: { type: 'agent', id: 'ai-writer', sessionId: '1' }
// }
```

### 5.3 Simultaneous Work by AI and Users

**Scenario:**

```typescript
// User A creates node
const userStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node = userStore.createNodeWithChildren({ stype: 'paragraph', content: [...] });
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// AI creates different node simultaneously
const aiStore = new DataStore(undefined, schema, 1, { type: 'agent', id: 'ai-writer' });
const aiNode = aiStore.createNodeWithChildren({ stype: 'paragraph', content: [...] });
// aiNode.sid = '1:2'
// Operation: { type: 'create', nodeId: '1:2', owner: { type: 'agent', id: 'ai-writer' } }

// Nodes themselves cannot be distinguished (both are regular nodes)
// But can be distinguished with Operation history
```

### 5.4 Priority of AI Work

**Principle:**
- AI results have low priority
- User work always takes priority
- User work overwrites AI work on conflict

**Implementation:**

```typescript
/**
 * Conflict resolution (based on Operation history)
 */
function resolveConflict(
  node1: INode,
  node2: INode,
  operationHistory: OperationHistory
): INode {
  const history1 = operationHistory.getByNodeId(node1.sid);
  const history2 = operationHistory.getByNodeId(node2.sid);
  
  const lastEditor1 = history1[history1.length - 1]?.owner;
  const lastEditor2 = history2[history2.length - 1]?.owner;
  
  // User > AI priority
  if (lastEditor1?.type === 'user' && lastEditor2?.type === 'agent') {
    return node1;
  }
  if (lastEditor1?.type === 'agent' && lastEditor2?.type === 'user') {
    return node2;
  }
  
  // If same type, latest takes priority
  const timestamp1 = history1[history1.length - 1]?.timestamp || 0;
  const timestamp2 = history2[history2.length - 1]?.timestamp || 0;
  return timestamp1 > timestamp2 ? node1 : node2;
}
```

---

## 6. Relationship with Decorators

### 6.1 Decorators are a Separate Channel

**Core Principle:**
- Decorators are managed as a separate channel with the same pattern as Selection
- Separate DocumentModel (OT/CRDT) and EditorModel (Presence/Session)

### 6.2 Channel Structure

```
DocumentModel (OT/CRDT channel)
  ↓
  Text, structure, Marks changes
  (Heavy data, needs conflict resolution)
  Owner information included at Operation level

EditorModel (Presence/Session channel)
  ├─ Selection changes
  │   (Lightweight data, real-time sync)
  └─ Decorator changes
      (Lightweight data, real-time sync)
      Owner information included (owner field)
```

### 6.3 Owner Information in Decorators

**Since Decorators are at EditorModel level, they include owner information:**

```typescript
interface Decorator {
  sid: string;
  stype: string;
  category: 'layer' | 'inline' | 'block';
  target: DecoratorTarget;
  data?: Record<string, any>;
  
  // Owner information (included because EditorModel level)
  owner?: {
    userId: string;
    agentId?: string;
    sessionId: string;
  };
  source?: 'local' | 'remote';
}
```

**Reasons:**
- Decorators are temporary UI state (EditorModel)
- Unlike nodes, they are not modified multiple times
- Simple lifecycle: create → update → remove
- Owner information is meaningful

### 6.4 Difference Between Decorators and Nodes

| Item | Node (DocumentModel) | Decorator (EditorModel) |
|------|---------------------|------------------------|
| Owner information | None (Operation level) | Yes (owner field) |
| Modification frequency | Can be modified multiple times | Simple lifecycle |
| Storage | Permanent storage | Temporary state |
| Channel | OT/CRDT | Presence/Session |

---

## 7. Practical Scenarios

### 7.1 Scenario 1: User and AI Work Simultaneously

```typescript
// User A creates node
const userStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node1 = userStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'User created' }]
});
// node1.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// AI creates different node
const aiStore = new DataStore(undefined, schema, 1, { type: 'agent', id: 'ai-writer' });
const node2 = aiStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'AI created' }]
});
// node2.sid = '1:2'
// Operation: { type: 'create', nodeId: '1:2', owner: { type: 'agent', id: 'ai-writer' } }

// Nodes themselves cannot be distinguished (both are regular nodes)
// But can be distinguished with Operation history
const creator1 = operationHistory.getCreator('0:1');  // { type: 'user', id: 'alice' }
const creator2 = operationHistory.getCreator('1:2');  // { type: 'agent', id: 'ai-writer' }
```

### 7.2 Scenario 2: Multiple Users Modify Same Node

```typescript
// User A creates node
const userAStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node = userAStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'Hello' }]
});
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// User B modifies node
const userBStore = new DataStore(undefined, schema, 1, { type: 'user', id: 'bob' });
userBStore.updateNode('0:1', { text: 'Hello World' });
// node.sid = '0:1' (still same)
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'bob' } }

// AI modifies node
const aiStore = new DataStore(undefined, schema, 2, { type: 'agent', id: 'ai-writer' });
aiStore.updateNode('0:1', { text: 'Hello AI World' });
// node.sid = '0:1' (still same)
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'agent', id: 'ai-writer' } }

// Query history
const history = operationHistory.getByNodeId('0:1');
// [
//   { operation: 'create', owner: { type: 'user', id: 'alice' }, timestamp: 1000 },
//   { operation: 'update', owner: { type: 'user', id: 'bob' }, timestamp: 2000 },
//   { operation: 'update', owner: { type: 'agent', id: 'ai-writer' }, timestamp: 3000 }
// ]

// Node itself has no owner information
// But all changes can be tracked with Operation history
```

### 7.3 Scenario 3: Only Part of Text Modified

```typescript
// Initial state
const node = userStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'Hello World' }]
});
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// User A inserts in middle
userStore.updateNode('0:1', { text: 'Hello AI World' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'alice' }, data: { text: 'Hello AI World' } }

// AI inserts in middle
aiStore.updateNode('0:1', { text: 'Hello AI Beautiful World' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'agent', id: 'ai-writer' }, data: { text: 'Hello AI Beautiful World' } }

// User B adds at end
userBStore.updateNode('0:1', { text: 'Hello AI Beautiful World!' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'bob' }, data: { text: 'Hello AI Beautiful World!' } }

// Partial ownership is not tracked
// Only "who did what" is tracked with Operation history
```

### 7.4 Scenario 4: AI Uses Decorator

```typescript
// AI starts work - add Decorator
const decoratorId = editorView.addDecorator({
  sid: 'ai-work-1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'after',
  data: { text: 'AI is working...' }
});

// Decorators are EditorModel level, so can include owner information
// (But currently managed in separate RemoteDecoratorManager)

// AI completes work - update model
aiStore.updateNode('paragraph-1', { 
  content: [...existingContent, newParagraph] 
});
// Operation: { type: 'update', nodeId: 'paragraph-1', owner: { type: 'agent', id: 'ai-writer' } }

// Remove Decorator
editorView.removeDecorator(decoratorId);
```

---

## 8. Integration in Collaborative Editing Environment

### 8.1 Operation Broadcasting

```typescript
/**
 * Collaborative editing broadcast message
 */
type CollaborationMessage = 
  // DocumentModel changes (OT/CRDT)
  | {
      type: 'operation';
      operation: AtomicOperation;  // includes owner information
      version: number;
    }
  // EditorModel changes (Presence/Session)
  | {
      type: 'selection-update';
      userId: string;
      selection: ModelSelection;
      timestamp: number;
    }
  | {
      type: 'decorator-add' | 'decorator-update' | 'decorator-remove';
      decorator?: Decorator;
      sid?: string;
      updates?: Partial<Decorator>;
      owner: DecoratorOwner;
      timestamp: number;
    };
```

### 8.2 Conflict Resolution Strategy

```typescript
/**
 * Operation-based conflict resolution
 */
class ConflictResolver {
  /**
   * Resolve conflict between two Operations
   */
  resolveOperations(
    op1: AtomicOperation,
    op2: AtomicOperation,
    operationHistory: OperationHistory
  ): AtomicOperation {
    // User > AI priority
    if (op1.owner?.type === 'user' && op2.owner?.type === 'agent') {
      return op1;
    }
    if (op1.owner?.type === 'agent' && op2.owner?.type === 'user') {
      return op2;
    }
    
    // If same type, latest takes priority
    return op1.timestamp > op2.timestamp ? op1 : op2;
  }
  
  /**
   * Resolve node conflict (based on Operation history)
   */
  resolveNodeConflict(
    node1: INode,
    node2: INode,
    operationHistory: OperationHistory
  ): INode {
    const history1 = operationHistory.getByNodeId(node1.sid);
    const history2 = operationHistory.getByNodeId(node2.sid);
    
    const lastEditor1 = history1[history1.length - 1]?.owner;
    const lastEditor2 = history2[history2.length - 1]?.owner;
    
    // User > AI priority
    if (lastEditor1?.type === 'user' && lastEditor2?.type === 'agent') {
      return node1;
    }
    if (lastEditor1?.type === 'agent' && lastEditor2?.type === 'user') {
      return node2;
    }
    
    // If same type, latest takes priority
    const timestamp1 = history1[history1.length - 1]?.timestamp || 0;
    const timestamp2 = history2[history2.length - 1]?.timestamp || 0;
    return timestamp1 > timestamp2 ? node1 : node2;
  }
}
```

---

## 9. Implementation Guide

### 9.1 DataStore Modification

```typescript
export class DataStore {
  private _sessionId: number = 0;
  private _owner?: {
    type: 'user' | 'agent';
    id: string;
  };
  
  constructor(
    rootNodeId?: string, 
    schema?: Schema, 
    sessionId?: number,
    owner?: { type: 'user' | 'agent'; id: string }
  ) {
    this._sessionId = sessionId ?? 0;
    this._owner = owner;
  }
  
  /**
   * Generate node ID (maintain existing format)
   */
  generateId(): string {
    DataStore._globalCounter++;
    return `${this._sessionId}:${DataStore._globalCounter}`;
  }
  
  /**
   * Automatically include owner information when creating Operation
   */
  emitOperation(operation: AtomicOperation): void {
    const operationWithOwner: AtomicOperation = {
      ...operation,
      owner: this._owner ? {
        type: this._owner.type,
        id: this._owner.id,
        sessionId: this._sessionId.toString()
      } : undefined
    };
    
    if (this._overlay && this._overlay.isActive()) {
      (this._overlay as any).recordOperation(operationWithOwner);
    }
    
    this._eventEmitter.emit('operation', operationWithOwner);
  }
}
```

### 9.2 AtomicOperation Type Extension

```typescript
export interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: any;
  timestamp: number;
  parentId?: string;
  position?: number;
  
  // Owner information (optional)
  owner?: {
    type: 'user' | 'agent';
    id: string;
    sessionId: string;
  };
}
```

### 9.3 OperationHistory Implementation

```typescript
/**
 * Operation history management
 */
export class OperationHistory {
  private history: Array<{
    nodeId: string;
    operation: string;
    owner?: {
      type: 'user' | 'agent';
      id: string;
      sessionId: string;
    };
    timestamp: number;
    data?: any;
  }> = [];
  
  /**
   * Receive Operation event
   */
  onOperation(operation: AtomicOperation): void {
    this.history.push({
      nodeId: operation.nodeId,
      operation: operation.type,
      owner: operation.owner,
      timestamp: operation.timestamp,
      data: operation.data
    });
  }
  
  /**
   * Get change history for specific node
   */
  getByNodeId(nodeId: string): Array<{
    operation: string;
    owner?: { type: 'user' | 'agent'; id: string };
    timestamp: number;
  }> {
    return this.history
      .filter(h => h.nodeId === nodeId)
      .map(h => ({
        operation: h.operation,
        owner: h.owner,
        timestamp: h.timestamp
      }));
  }
  
  /**
   * Get creator of node
   */
  getCreator(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    const createOp = history.find(h => h.operation === 'create');
    return createOp?.owner;
  }
  
  /**
   * Get last editor of node
   */
  getLastEditor(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    if (history.length === 0) return undefined;
    return history[history.length - 1].owner;
  }
  
  /**
   * Get nodes created by specific user
   */
  getNodesByCreator(ownerId: string): string[] {
    return this.history
      .filter(h => h.operation === 'create' && h.owner?.id === ownerId)
      .map(h => h.nodeId);
  }
  
  /**
   * Get nodes edited by specific user
   */
  getNodesByEditor(ownerId: string): string[] {
    return this.history
      .filter(h => h.owner?.id === ownerId)
      .map(h => h.nodeId);
  }
}
```

---

## 10. Summary and Conclusion

### 10.1 Core Principles

1. **Do not use node-level ownership**
   - Nodes can be modified multiple times
   - Different agent/user for each modification
   - The concept of "owner of node" itself is meaningless

2. **Owner information is managed only at Operation level**
   - Include owner information in Operation events
   - Track all changes with Operation history

3. **Do not track partial ownership**
   - Track only at Operation level even when only part of text is modified
   - Do not track ownership of specific parts of text

4. **AI is just an editing agent**
   - No need to distinguish between nodes created by AI and nodes created by users
   - No AI/user distinction in node itself
   - Can only be distinguished with Operation history

5. **Decorators are a separate channel**
   - Can include owner information because EditorModel level
   - Managed as separate channel with same pattern as Selection

### 10.2 Structure

```
DocumentModel (OT/CRDT channel)
  ├─ Node (INode)
  │   └─ sid: '0:1' (no owner information)
  │
  └─ Operation events
      └─ owner: { type: 'user' | 'agent', id: string }
          (owner information only here)

EditorModel (Presence/Session channel)
  ├─ Selection
  │   └─ Managed as separate channel
  │
  └─ Decorator
      └─ owner: { userId, agentId?, sessionId }
          (includes owner information)
```

### 10.3 Implementation Checklist

- [ ] Add `owner` option to DataStore constructor
- [ ] Automatically include owner information in `emitOperation()`
- [ ] Add `owner` field to `AtomicOperation` type
- [ ] Implement OperationHistory class
- [ ] Track history with Operation event listener
- [ ] Implement conflict resolution logic (User > AI priority)

### 10.4 Final Conclusion

**"Ownership" is a property of Operations, not a property of nodes.**

- Nodes purely contain only "what"
- "Who did what" is tracked only in Operation history
- Do not track partial ownership
- Distinction between AI and users only at Operation level
- Decorators managed as separate channel and include owner information

This way:
- ✅ Maintain model purity
- ✅ Enable complete history tracking
- ✅ Resolve conflicts in collaborative editing environments
- ✅ Natural collaboration between AI and users
- ✅ Conceptual accuracy
