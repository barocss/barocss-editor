# Execution Flow Monitoring Pattern

## Core Principles

**Maximize use of existing events, and let Devtool automatically reconstruct flows**

- ✅ Add only minimal additional events
- ✅ Devtool connects events using timestamp and pattern matching
- ✅ Minimize code changes

---

## Current Event Structure

### Existing Events

1. **Command Events**
   - `editor:command.before` - Before command execution
   - `editor:command.execute` - Command execution
   - `editor:command.after` - After command execution

2. **Content Events**
   - `editor:content.change` - Content change (includes transaction info)

3. **History Events**
   - `editor:history.change` - History change
   - `editor:history.undo` - Undo
   - `editor:history.redo` - Redo

4. **Selection Events**
   - `editor:selection.change` - Selection change

---

## Additional Events Needed

### 1. Browser Event Level

**Purpose**: Track browser event occurrence

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// beforeinput event
editor.emit('editor:input.beforeinput', {
  inputType: event.inputType,
  data: event.data,
  dataTransfer: event.dataTransfer,
  isComposing: event.isComposing,
  target: event.target,
  timestamp: Date.now()
});

// keydown event
editor.emit('editor:input.keydown', {
  key: event.key,
  code: event.code,
  ctrlKey: event.ctrlKey,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
  timestamp: Date.now()
});

// MutationObserver detection
editor.emit('editor:input.mutation', {
  mutations: mutations.map(m => ({
    type: m.type,
    target: m.target,
    addedNodes: Array.from(m.addedNodes),
    removedNodes: Array.from(m.removedNodes),
    oldValue: m.oldValue
  })),
  timestamp: Date.now()
});
```

---

### 2. Function Execution Level

**Purpose**: Track key function execution

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// Function start
editor.emit('editor:function.start', {
  functionName: 'handleDelete',
  className: 'InputHandlerImpl',
  input: { event, modelSelection },
  correlationId: this._generateCorrelationId(),
  timestamp: Date.now()
});

// Function end
editor.emit('editor:function.end', {
  functionName: 'handleDelete',
  className: 'InputHandlerImpl',
  output: { success, contentRange },
  correlationId: correlationId,
  duration: Date.now() - startTime,
  timestamp: Date.now()
});
```

---

### 3. Transaction Level

**Purpose**: Track transaction execution

```typescript
// packages/model/src/transaction.ts

// Transaction start
editor.emit('editor:transaction.start', {
  transactionId: transaction.sid,
  operations: operations.map(op => ({
    type: op.type,
    payload: op.payload
  })),
  correlationId: this._generateCorrelationId(),
  timestamp: Date.now()
});

// Transaction end
editor.emit('editor:transaction.end', {
  transactionId: transaction.sid,
  success: result.success,
  operations: executedOperations,
  selectionBefore: result.selectionBefore,
  selectionAfter: result.selectionAfter,
  duration: Date.now() - startTime,
  correlationId: correlationId,
  timestamp: Date.now()
});
```

---

### 4. Operation Level

**Purpose**: Track individual operation execution

```typescript
// packages/model/src/transaction.ts

// Operation start
editor.emit('editor:operation.start', {
  operationId: this._generateOperationId(),
  transactionId: transaction.sid,
  operationType: operation.type,
  payload: operation.payload,
  correlationId: correlationId,
  timestamp: Date.now()
});

// Operation end
editor.emit('editor:operation.end', {
  operationId: operationId,
  transactionId: transaction.sid,
  operationType: operation.type,
  success: result.ok,
  result: result.data,
  inverse: result.inverse,
  duration: Date.now() - startTime,
  correlationId: correlationId,
  timestamp: Date.now()
});
```

---

## Event Connection Strategy

### CorrelationId-Based Connection

Assign `correlationId` to each execution unit to connect events:

```typescript
// Example: handleDelete execution flow

// 1. Browser event
editor:input.keydown { correlationId: 'evt-1' }

// 2. Function start
editor:function.start { 
  functionName: 'handleDelete',
  correlationId: 'evt-1',  // Parent event ID
  childCorrelationId: 'func-1'  // Child event ID
}

// 3. Command execution
editor:command.execute {
  command: 'deleteText',
  correlationId: 'func-1',  // Parent function ID
  childCorrelationId: 'cmd-1'  // Child event ID
}

// 4. Transaction start
editor:transaction.start {
  transactionId: 'txn-123',
  correlationId: 'cmd-1',  // Parent Command ID
  childCorrelationId: 'txn-1'  // Child event ID
}

// 5. Operation execution
editor:operation.start {
  operationType: 'deleteTextRange',
  correlationId: 'txn-1',  // Parent Transaction ID
  childCorrelationId: 'op-1'  // Child event ID
}

// 6. Operation end
editor:operation.end {
  operationId: 'op-1',
  correlationId: 'op-1'  // Same Operation ID
}

// 7. Transaction end
editor:transaction.end {
  transactionId: 'txn-123',
  correlationId: 'txn-1'  // Same Transaction ID
}

// 8. Command end
editor:command.after {
  command: 'deleteText',
  correlationId: 'cmd-1'  // Same Command ID
}

// 9. Function end
editor:function.end {
  functionName: 'handleDelete',
  correlationId: 'func-1'  // Same function ID
}
```

---

## Flow Reconstruction in Devtool

### Event Collection and Grouping

```typescript
// packages/devtool/src/flow-monitor.ts

export class FlowMonitor {
  private events: Map<string, FlowEvent> = new Map();
  private flows: Map<string, ExecutionFlow> = new Map();

  constructor(private editor: Editor) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Receive all related events
    const eventTypes = [
      'editor:input.beforeinput',
      'editor:input.keydown',
      'editor:input.mutation',
      'editor:function.start',
      'editor:function.end',
      'editor:command.before',
      'editor:command.execute',
      'editor:command.after',
      'editor:transaction.start',
      'editor:transaction.end',
      'editor:operation.start',
      'editor:operation.end',
      'editor:content.change',
      'editor:history.change'
    ];

    eventTypes.forEach(eventType => {
      this.editor.on(eventType, (data: any) => {
        this.handleEvent(eventType, data);
      });
    });
  }

  private handleEvent(type: string, data: any): void {
    const event: FlowEvent = {
      id: this._generateId(),
      type,
      data,
      timestamp: Date.now(),
      correlationId: data.correlationId,
      parentCorrelationId: data.parentCorrelationId
    };

    this.events.set(event.id, event);
    this._reconstructFlow(event);
  }

  private _reconstructFlow(event: FlowEvent): void {
    // Reconstruct flow by following correlationId
    const flowId = this._findRootCorrelationId(event.correlationId);
    
    if (!this.flows.has(flowId)) {
      this.flows.set(flowId, {
        id: flowId,
        events: [],
        functions: [],
        commands: [],
        transactions: [],
        operations: []
      });
    }

    const flow = this.flows.get(flowId)!;
    
    // Classify by event type
    if (event.type.startsWith('editor:input.')) {
      flow.events.push(event);
    } else if (event.type.startsWith('editor:function.')) {
      flow.functions.push(event);
    } else if (event.type.startsWith('editor:command.')) {
      flow.commands.push(event);
    } else if (event.type.startsWith('editor:transaction.')) {
      flow.transactions.push(event);
    } else if (event.type.startsWith('editor:operation.')) {
      flow.operations.push(event);
    }
  }

  getFlow(flowId: string): ExecutionFlow | undefined {
    return this.flows.get(flowId);
  }

  getRecentFlows(limit: number = 10): ExecutionFlow[] {
    return Array.from(this.flows.values())
      .sort((a, b) => {
        const aTime = a.events[0]?.timestamp || 0;
        const bTime = b.events[0]?.timestamp || 0;
        return bTime - aTime;
      })
      .slice(0, limit);
  }
}
```

---

## Event Data Structure

### FlowEvent

```typescript
interface FlowEvent {
  id: string;                    // Unique ID
  type: string;                  // Event type
  data: any;                      // Event data
  timestamp: number;             // Occurrence time
  correlationId?: string;        // Current execution unit ID
  parentCorrelationId?: string;  // Parent execution unit ID
}
```

### ExecutionFlow

```typescript
interface ExecutionFlow {
  id: string;                    // Flow ID (root correlationId)
  events: FlowEvent[];           // Browser events
  functions: FlowEvent[];        // Function execution events
  commands: FlowEvent[];         // Command execution events
  transactions: FlowEvent[];      // Transaction events
  operations: FlowEvent[];       // Operation events
  nodeRanges?: NodeRangeInfo[];  // Related node range information
}
```

---

## Event Emit Strategy

### 1. Browser Event Level

**Location**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
private async handleBeforeInput(event: InputEvent): Promise<void> {
  const correlationId = this._generateCorrelationId();
  
  this.editor.emit('editor:input.beforeinput', {
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing,
    target: event.target,
    correlationId,
    timestamp: Date.now()
  });
  
  // ... processing logic ...
}

private async handleKeydown(event: KeyboardEvent): Promise<void> {
  const correlationId = this._generateCorrelationId();
  
  this.editor.emit('editor:input.keydown', {
    key: event.key,
    code: event.code,
    ctrlKey: event.ctrlKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    correlationId,
    timestamp: Date.now()
  });
  
  // ... processing logic ...
}

async handleDomMutations(mutations: MutationRecord[]): Promise<void> {
  const correlationId = this._generateCorrelationId();
  
  this.editor.emit('editor:input.mutation', {
    mutations: mutations.map(m => ({
      type: m.type,
      target: m.target,
      addedNodes: Array.from(m.addedNodes),
      removedNodes: Array.from(m.removedNodes),
      oldValue: m.oldValue
    })),
    correlationId,
    timestamp: Date.now()
  });
  
  // ... processing logic ...
}
```

---

### 2. Function Execution Level

**Location**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
private async handleDelete(event: InputEvent, correlationId: string): Promise<void> {
  const functionCorrelationId = this._generateCorrelationId();
  const startTime = Date.now();
  
  this.editor.emit('editor:function.start', {
    functionName: 'handleDelete',
    className: 'InputHandlerImpl',
    input: { event, modelSelection: this._getCurrentSelection() },
    correlationId: correlationId,  // Parent event ID
    childCorrelationId: functionCorrelationId,
    timestamp: startTime
  });
  
  try {
    // ... processing logic ...
    
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      output: { success, contentRange },
      correlationId: functionCorrelationId,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });
  } catch (error) {
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      error: error.message,
      correlationId: functionCorrelationId,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });
    throw error;
  }
}
```

---

### 3. Command Level

**Location**: `packages/editor-core/src/editor.ts`

```typescript
async executeCommand(command: string, payload?: any): Promise<boolean> {
  const commandCorrelationId = this._generateCorrelationId();
  const startTime = Date.now();
  
  // Before command execution
  this.emit('editor:command.before', {
    command,
    payload,
    correlationId: commandCorrelationId,
    timestamp: startTime
  });
  
  try {
    const commandDef = this._commands.get(command);
    if (!commandDef) {
      throw new Error(`Command ${command} not found`);
    }

    if (commandDef.canExecute && !commandDef.canExecute(this, payload)) {
      return false;
    }

    commandDef.before?.(this, payload);
    const result = await commandDef.execute(this, payload);
    commandDef.after?.(this, payload);

    // Command execution
    this.emit('editor:command.execute', {
      command,
      payload,
      success: result,
      correlationId: commandCorrelationId,
      childCorrelationId: this._generateCorrelationId(),  // For Transaction
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });

    // After command execution
    this.emit('editor:command.after', {
      command,
      payload,
      success: result,
      correlationId: commandCorrelationId,
      timestamp: Date.now()
    });

    return result;
  } catch (error) {
    this.emit('error:command', {
      command,
      payload,
      error,
      correlationId: commandCorrelationId,
      timestamp: Date.now()
    });
    throw error;
  }
}
```

---

### 4. Transaction Level

**Location**: `packages/model/src/transaction.ts`

```typescript
async execute(operations: (TransactionOperation | OpFunction)[], correlationId?: string): Promise<TransactionResult> {
  const transactionId = this._beginTransaction('DSL Transaction').sid;
  const transactionCorrelationId = correlationId || this._generateCorrelationId();
  const startTime = Date.now();
  
  // Transaction start
  this._editor.emit('editor:transaction.start', {
    transactionId,
    operations: operations.map(op => ({
      type: op.type,
      payload: op.payload
    })),
    correlationId: transactionCorrelationId,
    timestamp: startTime
  });
  
  try {
    // ... Transaction execution logic ...
    
    // When executing each operation
    for (const operation of operations) {
      const operationCorrelationId = this._generateCorrelationId();
      
      this._editor.emit('editor:operation.start', {
        operationId: this._generateOperationId(),
        transactionId,
        operationType: operation.type,
        payload: operation.payload,
        correlationId: transactionCorrelationId,
        childCorrelationId: operationCorrelationId,
        timestamp: Date.now()
      });
      
      // ... Operation execution ...
      
      this._editor.emit('editor:operation.end', {
        operationId: operationId,
        transactionId,
        operationType: operation.type,
        success: result.ok,
        result: result.data,
        inverse: result.inverse,
        correlationId: operationCorrelationId,
        duration: Date.now() - operationStartTime,
        timestamp: Date.now()
      });
    }
    
    // Transaction end
    this._editor.emit('editor:transaction.end', {
      transactionId,
      success: true,
      operations: executedOperations,
      selectionBefore: result.selectionBefore,
      selectionAfter: result.selectionAfter,
      correlationId: transactionCorrelationId,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });
    
    return result;
  } catch (error) {
    this._editor.emit('editor:transaction.end', {
      transactionId,
      success: false,
      error: error.message,
      correlationId: transactionCorrelationId,
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });
    throw error;
  }
}
```

---

## Devtool UI Integration

### 1. Add "Execution Flow" Tab

```typescript
// packages/devtool/src/ui.ts

// Add tab
<div class="devtool-tabs">
  <button class="devtool-tab" data-tab="tree">Model Tree</button>
  <button class="devtool-tab" data-tab="events">Events</button>
  <button class="devtool-tab" data-tab="flow">Execution Flow</button>  // New tab
</div>

// Add panel
<div class="devtool-panel" id="panel-flow">
  <div class="flow-list" id="flow-list"></div>
  <div class="flow-detail" id="flow-detail"></div>
</div>
```

### 2. Display Flow List

```typescript
// Recent execution flow list
interface FlowListItem {
  id: string;
  eventType: string;        // 'beforeinput', 'keydown', 'mutation', etc.
  command?: string;          // Executed Command
  success: boolean;          // Success status
  duration: number;          // Total execution time
  timestamp: number;         // Occurrence time
}
```

### 3. Flow Detail Information

```typescript
// Flow tree visualization
interface FlowDetail {
  event: FlowEvent;          // Browser event
  functions: FlowEvent[];    // Function executions
  commands: FlowEvent[];      // Command executions
  transactions: FlowEvent[];  // Transaction executions
  operations: FlowEvent[];    // Operation executions
  nodeRanges?: NodeRangeInfo[];  // Related node ranges
}
```

---

## Implementation Phases

### Phase 1: Add Events (Minimal)

1. **Add browser event events**
   - `editor:input.beforeinput`
   - `editor:input.keydown`
   - `editor:input.mutation`

2. **Add function execution events**
   - `editor:function.start`
   - `editor:function.end`

3. **Add Transaction/Operation events**
   - `editor:transaction.start`
   - `editor:transaction.end`
   - `editor:operation.start`
   - `editor:operation.end`

### Phase 2: Devtool Monitoring

1. **Implement FlowMonitor class**
   - Event collection
   - Flow reconstruction based on correlationId
   - Flow storage and retrieval

2. **Devtool UI integration**
   - Add "Execution Flow" tab
   - Display flow list
   - Display flow detail information

### Phase 3: Advanced Features

1. **Node range highlighting**
2. **Flow filtering**
3. **Flow search**

---

## Advantages

1. ✅ **Simple implementation**: Each layer only emits events
2. ✅ **Flexibility**: Devtool freely reconstructs events
3. ✅ **Extensibility**: Easy to add new events
4. ✅ **Performance**: Event-based, so overhead minimized

---

## Summary

**Core**: Each layer emits events, and Devtool monitors events to reconstruct flows

**Event connection**: Track relationships between events using `correlationId` and `parentCorrelationId`

**Implementation order**: 
1. Add events (each layer)
2. Devtool monitoring (event collection and reconstruction)
3. UI integration (flow visualization)
