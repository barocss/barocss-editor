# Execution Flow Monitoring Pattern (Improved)

## Core Principles

**Maximize use of existing events, and let Devtool automatically reconstruct flows**

- ✅ Add only minimal additional events
- ✅ Devtool connects events using timestamp and pattern matching
- ✅ Minimize code changes

---

## Problem: Adding correlationId Everywhere

### Issues with Current Proposed Approach

```typescript
// Need to add correlationId to all functions
private async handleDelete(event: InputEvent, correlationId: string): Promise<void> {
  const functionCorrelationId = this._generateCorrelationId();
  // ...
  await this.editor.executeCommand('deleteText', { range }, functionCorrelationId);
  // ...
}
```

**Problems**:
- ❌ Need to change all function signatures
- ❌ Code becomes complex
- ❌ Hard to maintain

---

## Improved Approach

### Option 1: Event Pattern Matching (Recommended)

**Core**: Automatically connect existing events using timestamp and patterns

#### Existing Events

1. **Command Events**
   - `editor:command.execute` - Command execution (already exists)
   - `editor:command.before` - Before command execution (already exists)
   - `editor:command.after` - After command execution (already exists)

2. **Content Events**
   - `editor:content.change` - Content change (includes transaction info, already exists)

3. **History Events**
   - `editor:history.change` - History change (already exists)

4. **Selection Events**
   - `editor:selection.change` - Selection change (already exists)

#### Devtool Automatically Reconstructs Flow

```typescript
// packages/devtool/src/flow-reconstructor.ts

class FlowReconstructor {
  private events: FlowEvent[] = [];
  private timeWindow: number = 1000; // Consider events within 1 second as one flow

  handleEvent(type: string, data: any, timestamp: number): void {
    const event: FlowEvent = {
      id: this._generateId(),
      type,
      data,
      timestamp
    };
    
    this.events.push(event);
    this._reconstructFlow(event);
  }

  private _reconstructFlow(newEvent: FlowEvent): void {
    // 1. Find events within time window
    const recentEvents = this.events.filter(e => 
      Math.abs(e.timestamp - newEvent.timestamp) < this.timeWindow
    );

    // 2. Reconstruct flow using pattern matching
    const flow = this._matchPattern(recentEvents);
    
    // 3. Save flow
    if (flow) {
      this._saveFlow(flow);
    }
  }

  private _matchPattern(events: FlowEvent[]): ExecutionFlow | null {
    // Pattern 1: Command → Transaction → Operation
    // editor:command.execute → editor:content.change (includes transaction info)
    const commandEvent = events.find(e => e.type === 'editor:command.execute');
    const contentEvent = events.find(e => 
      e.type === 'editor:content.change' && 
      e.data?.transaction
    );
    
    if (commandEvent && contentEvent) {
      // Check time order
      if (contentEvent.timestamp > commandEvent.timestamp && 
          contentEvent.timestamp - commandEvent.timestamp < 500) {
        return {
          id: commandEvent.id,
          command: {
            name: commandEvent.data.command,
            payload: commandEvent.data.payload,
            success: commandEvent.data.success,
            timestamp: commandEvent.timestamp
          },
          transaction: contentEvent.data.transaction,
          operations: contentEvent.data.transaction?.operations || [],
          timestamp: commandEvent.timestamp
        };
      }
    }

    // Pattern 2: Selection change → Content change
    const selectionEvent = events.find(e => e.type === 'editor:selection.change');
    if (selectionEvent && contentEvent) {
      if (contentEvent.timestamp > selectionEvent.timestamp &&
          contentEvent.timestamp - selectionEvent.timestamp < 500) {
        return {
          id: selectionEvent.id,
          selection: selectionEvent.data,
          content: contentEvent.data,
          timestamp: selectionEvent.timestamp
        };
      }
    }

    return null;
  }
}
```

**Advantages**:
- ✅ Minimize code changes (use existing events)
- ✅ Automatically reconstruct flows
- ✅ No correlationId needed

**Disadvantages**:
- ⚠️ May be less accurate due to time window-based approach
- ⚠️ Need complex pattern matching logic

---

### Option 2: Selective Function Tracing (Hybrid)

**Core**: Add events only to key functions selectively

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// Add events only to key functions simply
private async handleDelete(event: InputEvent): Promise<void> {
  // Optional: add events only to key functions
  if (this.editor._devtoolEnabled) {
    this.editor.emit('editor:function.start', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
  
  // ... existing logic ...
  
  // Command execution already has editor:command.execute event
  await this.editor.executeCommand('deleteText', { range });
  // → editor:command.execute event automatically emitted
  
  // Transaction execution includes transaction info in editor:content.change
  // → editor:content.change event automatically emitted
  
  if (this.editor._devtoolEnabled) {
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
}
```

**Advantages**:
- ✅ Selectively trace only key functions
- ✅ Events emitted only when Devtool is enabled (minimize performance impact)
- ✅ No correlationId needed (connect using timestamp)

---

### Option 3: Auto Tracing with Proxy Pattern

**Core**: Automatically intercept function calls to trace

```typescript
// packages/devtool/src/auto-tracer.ts

class AutoTracer {
  private editor: Editor;
  private enabled: boolean = false;

  enable(): void {
    this.enabled = true;
    this._wrapEditorMethods();
    this._wrapInputHandlerMethods();
  }

  private _wrapInputHandlerMethods(): void {
    const inputHandler = (this.editor as any)._viewDOM?._inputHandler;
    if (!inputHandler) return;

    // Wrap only key methods
    const methods = ['handleDelete', 'handleC1', 'handleC2', 'handleC3'];
    
    methods.forEach(methodName => {
      const original = inputHandler[methodName];
      if (original) {
        inputHandler[methodName] = this._wrapFunction(
          original,
          methodName,
          'InputHandlerImpl'
        );
      }
    });
  }

  private _wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    name: string,
    className?: string
  ): T {
    return ((...args: any[]) => {
      if (!this.enabled) {
        return fn(...args);
      }

      const startTime = Date.now();
      this.editor.emit('editor:function.start', {
        functionName: name,
        className,
        timestamp: startTime
      });
      
      try {
        const result = fn(...args);
        
        // If Promise
        if (result instanceof Promise) {
          return result.then(
            (value) => {
              this.editor.emit('editor:function.end', {
                functionName: name,
                className,
                duration: Date.now() - startTime,
                timestamp: Date.now()
              });
              return value;
            },
            (error) => {
              this.editor.emit('editor:function.end', {
                functionName: name,
                className,
                error: error.message,
                duration: Date.now() - startTime,
                timestamp: Date.now()
              });
              throw error;
            }
          );
        }
        
        // Synchronous function
        this.editor.emit('editor:function.end', {
          functionName: name,
          className,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        });
        
        return result;
      } catch (error) {
        this.editor.emit('editor:function.end', {
          functionName: name,
          className,
          error: error.message,
          duration: Date.now() - startTime,
          timestamp: Date.now()
        });
        throw error;
      }
    }) as T;
  }
}
```

**Usage**:
```typescript
// When initializing Devtool
const devtool = new Devtool({ editor });
devtool.enableAutoTracing(); // Enable auto tracing
```

**Advantages**:
- ✅ No code changes
- ✅ Automatically trace function execution
- ✅ Works only when Devtool is enabled

**Disadvantages**:
- ⚠️ Function wrapping overhead
- ⚠️ Complex initial setup

---

## Final Recommendation: Hybrid Approach

### Phase 1: Reconstruct Basic Flow with Existing Events

**No code changes**

```typescript
// Devtool reconstructs flow with existing events
// - editor:command.execute
// - editor:content.change (includes transaction info)
// - editor:history.change
// - editor:selection.change
```

**Implementation**:
```typescript
// packages/devtool/src/flow-reconstructor.ts

class FlowReconstructor {
  reconstructFlow(events: FlowEvent[]): ExecutionFlow[] {
    // 1. Group events by time window
    const groups = this._groupByTimeWindow(events, 1000);
    
    // 2. Pattern matching for each group
    return groups.map(group => {
      // Pattern: Command → Transaction
      const command = group.find(e => e.type === 'editor:command.execute');
      const content = group.find(e => 
        e.type === 'editor:content.change' && 
        e.data?.transaction
      );
      
      if (command && content && 
          content.timestamp > command.timestamp &&
          content.timestamp - command.timestamp < 500) {
        return {
          id: command.id,
          command: command.data,
          transaction: content.data.transaction,
          operations: content.data.transaction?.operations || [],
          timestamp: command.timestamp
        };
      }
      
      return null;
    }).filter(Boolean);
  }
}
```

---

### Phase 2: Selective Function Tracing (Only When Needed)

**Add events only to key functions selectively**

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// Check if Devtool is enabled
private _shouldTrace(): boolean {
  return (this.editor as any)._devtoolEnabled === true;
}

private async handleDelete(event: InputEvent): Promise<void> {
  // Optional: add events only to key functions
  if (this._shouldTrace()) {
    this.editor.emit('editor:function.start', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
  
  // ... existing logic (no changes) ...
  
  if (this._shouldTrace()) {
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
}
```

**Advantages**:
- ✅ Minimal code changes
- ✅ Events emitted only when Devtool is enabled
- ✅ No correlationId needed (connect using timestamp)

---

### Phase 3: Advanced Features

1. **Node Range Highlighting**
   - Highlight in editor when clicking node range in flow

2. **Flow Filtering**
   - Filter by event type, Command type, etc.

3. **Flow Search**
   - Search by specific node ID, Command name, etc.

---

## Comparison: correlationId vs Pattern Matching

### correlationId Approach

**Advantages**:
- ✅ Accurate event connection
- ✅ Can trace complex flows

**Disadvantages**:
- ❌ Need to add correlationId to all functions
- ❌ Code becomes complex
- ❌ Hard to maintain

### Pattern Matching Approach (Recommended)

**Advantages**:
- ✅ Minimize code changes
- ✅ Use existing events
- ✅ Automatically reconstruct flows

**Disadvantages**:
- ⚠️ May be less accurate due to time window-based approach
- ⚠️ Need complex pattern matching logic

**However**:
- Timestamp-based pattern matching is sufficient in most cases
- Add correlationId selectively only when accuracy is needed

---

## Summary

**Final Recommendation**:

1. **Phase 1**: Reconstruct basic flow with existing events (no code changes)
2. **Phase 2**: Add events selectively only to key functions (minimal changes)
3. **Phase 3**: Add advanced features

**correlationId is optional**:
- Timestamp and pattern matching are sufficient by default
- Add correlationId only in special cases where accuracy is needed

**Implementation Order**:
1. Devtool reconstructs flow with existing events
2. Add simple events to key functions only when needed
3. Add advanced features
