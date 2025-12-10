# Auto-Tracing Architecture

## Overview

Designing a standardized system for automatically monitoring editor execution flows by referencing the auto-tracing pattern of RUM (Real User Monitoring) solutions.

---

## RUM Solution Pattern Analysis

### Common Patterns in Major RUM Solutions

1. **Auto Instrumentation**
   - Automatically intercept function calls to trace
   - Minimize code changes
   - Minimize performance overhead

2. **Context Propagation**
   - Automatically inject trace ID into execution context
   - Maintain context in async call chains

3. **Event-Based Collection**
   - Collect all trace information as events
   - Centralized analysis and visualization

4. **Selective Activation**
   - Activate only in development mode
   - Can be disabled in production

---

## Architecture Design

### 1. Layer Structure

```
┌─────────────────────────────────────────┐
│         Devtool (Collection & Visualization) │
└─────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────┐
│    AutoTracer (Auto Tracing Engine)     │
│  - Function wrapping                     │
│  - Context management                    │
│  - Event emission                        │
└─────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────┐
│    Editor Core (Business Logic)         │
│  - Command execution                     │
│  - Transaction execution                 │
│  - Operation execution                   │
└─────────────────────────────────────────┘
```

### 2. Core Components

#### 2.1 AutoTracer

**Role**: Automatically intercept function calls to trace

```typescript
// packages/devtool/src/auto-tracer.ts

export interface TraceContext {
  traceId: string;              // Overall flow ID
  spanId: string;                // Current execution unit ID
  parentSpanId?: string;         // Parent execution unit ID
  operationName: string;         // Function/command name
  startTime: number;             // Start time
  tags?: Record<string, any>;    // Additional metadata
}

export class AutoTracer {
  private editor: Editor;
  private enabled: boolean = false;
  private activeTraces: Map<string, TraceContext> = new Map();
  
  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * Enable auto tracing
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    
    // Instrument Editor Core
    this._instrumentEditor();
    this._instrumentInputHandler();
    this._instrumentCommands();
    
    // Instrument multiple packages
    this._instrumentDataStore();
    this._instrumentModel();
    this._instrumentRendererDOM();
  }

  /**
   * Disable auto tracing
   */
  disable(): void {
    this.enabled = false;
    this._uninstrumentAll();
  }

  /**
   * Instrument Editor methods
   */
  private _instrumentEditor(): void {
    const editor = this.editor as any;
    
    // Wrap executeCommand
    const originalExecuteCommand = editor.executeCommand.bind(editor);
    editor.executeCommand = this._wrapCommandExecution(originalExecuteCommand);
  }

  /**
   * Instrument InputHandler methods
   */
  private _instrumentInputHandler(): void {
    const viewDOM = (this.editor as any)._viewDOM;
    if (!viewDOM?._inputHandler) return;

    const inputHandler = viewDOM._inputHandler;
    const methods = [
      'handleDelete',
      'handleC1',
      'handleC2',
      'handleC3',
      'handleTextContentChange',
      'handleDomMutations'
    ];

    methods.forEach(methodName => {
      const original = inputHandler[methodName];
      if (original && typeof original === 'function') {
        inputHandler[methodName] = this._wrapFunction(
          original,
          methodName,
          'InputHandlerImpl'
        );
      }
    });
  }

  /**
   * Instrument Command methods
   */
  private _instrumentCommands(): void {
    // Automatically wrap Extension Command execute methods
    // (implement if needed)
  }

  /**
   * Instrument DataStore package
   */
  private _instrumentDataStore(): void {
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) return;

    // Instrument CoreOperations methods
    if (dataStore.coreOperations) {
      const methods = [
        'setNode',
        'updateNode',
        'deleteNode',
        'createNodeWithChildren'
      ];
      
      methods.forEach(methodName => {
        const original = dataStore.coreOperations[methodName];
        if (original && typeof original === 'function') {
          dataStore.coreOperations[methodName] = this._wrapFunction(
            original,
            methodName,
            'CoreOperations'
          );
        }
      });
    }

    // Instrument RangeOperations methods
    if (dataStore.range) {
      const methods = [
        'replaceText',
        'deleteText',
        'insertText'
      ];
      
      methods.forEach(methodName => {
        const original = dataStore.range[methodName];
        if (original && typeof original === 'function') {
          dataStore.range[methodName] = this._wrapFunction(
            original,
            methodName,
            'RangeOperations'
          );
        }
      });
    }

    // Instrument MarkOperations methods
    if (dataStore.marks) {
      const methods = [
        'setMarks',
        'removeMark',
        'updateMark',
        'toggleMark'
      ];
      
      methods.forEach(methodName => {
        const original = dataStore.marks[methodName];
        if (original && typeof original === 'function') {
          dataStore.marks[methodName] = this._wrapFunction(
            original,
            methodName,
            'MarkOperations'
          );
        }
      });
    }
  }

  /**
   * Instrument Model package
   */
  private _instrumentModel(): void {
    const transactionManager = (this.editor as any).transactionManager;
    if (!transactionManager) return;

    // Instrument TransactionManager.execute
    const originalExecute = transactionManager.execute.bind(transactionManager);
    transactionManager.execute = this._wrapAsyncFunction(
      originalExecute,
      'TransactionManager.execute',
      'TransactionManager'
    );

    // Instrument Operation execution (operations registered with defineOperation)
    // (dynamically wrap at runtime)
  }

  /**
   * Instrument RendererDOM package
   */
  private _instrumentRendererDOM(): void {
    const viewDOM = (this.editor as any)._viewDOM;
    if (!viewDOM) return;

    // Instrument DOMRenderer
    const domRenderer = viewDOM._domRenderer;
    if (domRenderer) {
      const originalRender = domRenderer.render.bind(domRenderer);
      domRenderer.render = this._wrapAsyncFunction(
        originalRender,
        'DOMRenderer.render',
        'DOMRenderer'
      );

      // Instrument Reconciler
      if (domRenderer._reconciler) {
        const originalReconcile = domRenderer._reconciler.reconcile.bind(domRenderer._reconciler);
        domRenderer._reconciler.reconcile = this._wrapAsyncFunction(
          originalReconcile,
          'Reconciler.reconcile',
          'Reconciler'
        );
      }

      // Instrument VNodeBuilder
      if (domRenderer._vnodeBuilder) {
        const originalBuild = domRenderer._vnodeBuilder.build.bind(domRenderer._vnodeBuilder);
        domRenderer._vnodeBuilder.build = this._wrapFunction(
          originalBuild,
          'VNodeBuilder.build',
          'VNodeBuilder'
        );
      }
    }
  }
}
```

---

### 3. Function Wrapping Strategy

#### 3.1 Synchronous Function Wrapping

```typescript
/**
 * Wrap synchronous function
 */
  private _wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    name: string,
    className?: string,
    originalFn?: Function
  ): T {
  return ((...args: any[]) => {
    if (!this.enabled) {
      return fn(...args);
    }

    const traceContext = this._createTraceContext(name, className);
    const startTime = performance.now();

    try {
      // Function start event
      this._emitTraceStart(traceContext, args);

      // Execute original function
      const result = fn(...args);

      // Function end event
      this._emitTraceEnd(traceContext, result, performance.now() - startTime);

      return result;
    } catch (error) {
      // Error event
      this._emitTraceError(traceContext, error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  }) as T;
}
```

#### 3.2 Async Function Wrapping

```typescript
/**
 * Wrap async function (Promise support)
 */
  private _wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    name: string,
    className?: string,
    originalFn?: Function
  ): T {
  return (async (...args: any[]) => {
    if (!this.enabled) {
      return fn(...args);
    }

    const traceContext = this._createTraceContext(name, className);
    const startTime = performance.now();

    try {
      // Function start event
      this._emitTraceStart(traceContext, args);

      // Execute original function
      const result = await fn(...args);

      // Function end event
      this._emitTraceEnd(traceContext, result, performance.now() - startTime);

      return result;
    } catch (error) {
      // Error event
      this._emitTraceError(traceContext, error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  }) as T;
}
```

---

### 4. Context Management and Automatic ID Assignment

#### 4.1 RUM-Style Call Relationship Tracking

**Core**: Automatically assign `traceId` and `spanId` to all function calls to automatically track call relationships

```typescript
/**
 * Create Trace Context (automatic ID assignment)
 */
private _createTraceContext(
  operationName: string,
  className?: string,
  parentSpanId?: string,
  fn?: Function
): TraceContext {
  // 1. Check parent context
  const parentContext = parentSpanId 
    ? this.activeTraces.get(parentSpanId)
    : this._getCurrentContext(); // Automatically find parent from stack
  
  // 2. Determine traceId: use same traceId if parent exists, create new if not
  const traceId = parentContext?.traceId || this._generateTraceId();
  
  // 3. Generate spanId: unique execution unit ID
  const spanId = this._generateSpanId();

  // 4. Create context
  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId: parentContext?.spanId, // Automatically connect parent spanId
    operationName,
    startTime: performance.now(),
    tags: {
      className,
      package: this._detectPackage(className, fn), // Auto-detect package (using stack trace)
      timestamp: Date.now()
    }
  };

  // 5. Add to active context stack
  this._pushContext(context);
  this.activeTraces.set(spanId, context);
  
  return context;
}

  /**
   * Auto-detect package (try various methods)
   */
  private _detectPackage(className?: string, fn?: Function): string {
    const detectionMethod = this.options.packageDetection || 'auto';

    // Method 1: Check runtime metadata (most accurate, explicit)
    if (fn && (fn as any).__package) {
      return (fn as any).__package;
    }

    // Method 2: Extract file path from stack trace (accurate but limited)
    if (detectionMethod === 'stack' || detectionMethod === 'auto') {
      if (fn) {
        const packageFromStack = this._detectPackageFromStack(fn);
        if (packageFromStack) {
          return packageFromStack;
        }
      }
    }

    // Method 3: Infer package from class name (fallback)
    if (detectionMethod === 'name' || detectionMethod === 'auto') {
      if (className) {
        const packageFromName = this._detectPackageFromClassName(className);
        if (packageFromName && packageFromName !== 'unknown') {
          return packageFromName;
        }
      }
    }

    // Method 4: Check explicit package list
    if (this.options.instrumentPackages && this.options.instrumentPackages.length > 0) {
      // Return one of packages specified in instrumentPackages
      // (more sophisticated matching needed in practice)
      return this.options.instrumentPackages[0];
    }

    return 'unknown';
  }

  /**
   * Detect package from stack trace
   */
  private _detectPackageFromStack(fn: Function): string | null {
    try {
      // Extract call stack using Error.stack
      const originalError = Error;
      Error = class extends originalError {
        constructor() {
          super();
          Error.captureStackTrace?.(this, fn);
        }
      } as any;

      const error = new Error();
      const stack = error.stack;
      
      if (!stack) return null;

      // Extract file path from stack
      // Example: "at InputHandler.handleDelete (packages/editor-view-dom/src/input-handler.ts:123:45)"
      const stackLines = stack.split('\n');
      
      for (const line of stackLines) {
        // Find packages/ pattern
        const packageMatch = line.match(/packages\/([^/]+)\//);
        if (packageMatch) {
          const packageName = packageMatch[1];
          // Convert package name to @barocss/ format
          return `@barocss/${packageName}`;
        }

        // Find node_modules/@barocss/ pattern
        const nodeModulesMatch = line.match(/node_modules\/@barocss\/([^/]+)\//);
        if (nodeModulesMatch) {
          return `@barocss/${nodeModulesMatch[1]}`;
        }
      }

      return null;
    } catch (error) {
      // Return null if stack extraction fails
      return null;
    }
  }

  /**
   * Infer package from class name (fallback)
   */
  private _detectPackageFromClassName(className: string): string {
    // Class name pattern matching (existing logic)
    if (className.includes('InputHandler') || className.includes('EditorViewDOM')) {
      return '@barocss/editor-view-dom';
    }
    if (className.includes('TransactionManager') || className.includes('Operation')) {
      return '@barocss/model';
    }
    if (className.includes('DataStore') || className.includes('CoreOperations')) {
      return '@barocss/datastore';
    }
    if (className.includes('DOMRenderer') || className.includes('Reconciler') || className.includes('VNode')) {
      return '@barocss/renderer-dom';
    }
    if (className.includes('Extension') || className.includes('Command')) {
      return '@barocss/extensions';
    }
  
    return '@barocss/editor-core';
  }
```

#### 4.2 Stack-Based Context Management

```typescript
/**
 * Context stack management (call chain tracking)
 */
private contextStack: TraceContext[] = [];

/**
 * Add to context stack
 */
private _pushContext(context: TraceContext): void {
  this.contextStack.push(context);
}

/**
 * Get current active context (stack top)
 */
private _getCurrentContext(): TraceContext | null {
  return this.contextStack.length > 0 
    ? this.contextStack[this.contextStack.length - 1]
    : null;
}

/**
 * Remove from context stack
 */
private _popContext(spanId: string): void {
  const index = this.contextStack.findIndex(ctx => ctx.spanId === spanId);
  if (index !== -1) {
    this.contextStack.splice(index, 1);
  }
}

/**
 * Cleanup trace context
 */
private _cleanupTraceContext(spanId: string): void {
  this._popContext(spanId);
  this.activeTraces.delete(spanId);
}
```

#### 4.3 Automatic ID Assignment Mechanism

**Same approach as RUM solutions**:

1. **Top-level call**: Create new `traceId`
2. **Child call**: Inherit parent's `traceId`
3. **Each function call**: Generate unique `spanId`
4. **Parent-child relationship**: Automatically connect via `parentSpanId`

```typescript
// Example: handleDelete → executeCommand → Transaction → Operation

// 1. handleDelete start
traceId: 'trace-1', spanId: 'span-1', parentSpanId: undefined

// 2. executeCommand start (inside handleDelete)
traceId: 'trace-1', spanId: 'span-2', parentSpanId: 'span-1'  // Same traceId, parent is span-1

// 3. Transaction start (inside executeCommand)
traceId: 'trace-1', spanId: 'span-3', parentSpanId: 'span-2'  // Same traceId, parent is span-2

// 4. Operation start (inside Transaction)
traceId: 'trace-1', spanId: 'span-4', parentSpanId: 'span-3'  // Same traceId, parent is span-3
```

This way, **all calls are automatically tracked with relationships**.

---

### 5. Event Emission

#### 5.1 Trace Event Types

```typescript
// packages/devtool/src/types.ts

export interface TraceStartEvent {
  type: 'trace:start';
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  className?: string;
  input?: any;
  timestamp: number;
}

export interface TraceEndEvent {
  type: 'trace:end';
  traceId: string;
  spanId: string;
  operationName: string;
  output?: any;
  duration: number;
  timestamp: number;
}

export interface TraceErrorEvent {
  type: 'trace:error';
  traceId: string;
  spanId: string;
  operationName: string;
  error: Error;
  duration: number;
  timestamp: number;
}
```

#### 5.2 Event Emission Methods

```typescript
/**
 * Emit trace start event
 */
private _emitTraceStart(context: TraceContext, input?: any): void {
  this.editor.emit('editor:trace.start', {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    operationName: context.operationName,
    className: context.tags?.className,
    input,
    timestamp: context.startTime
  });
}

/**
 * Emit trace end event
 */
private _emitTraceEnd(
  context: TraceContext,
  output?: any,
  duration?: number
): void {
  this.editor.emit('editor:trace.end', {
    traceId: context.traceId,
    spanId: context.spanId,
    operationName: context.operationName,
    output,
    duration: duration || (performance.now() - context.startTime),
    timestamp: Date.now()
  });
}

/**
 * Emit trace error event
 */
private _emitTraceError(
  context: TraceContext,
  error: Error,
  duration?: number
): void {
  this.editor.emit('editor:trace.error', {
    traceId: context.traceId,
    spanId: context.spanId,
    operationName: context.operationName,
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    duration: duration || (performance.now() - context.startTime),
    timestamp: Date.now()
  });
}
```

---

### 6. Integration with Existing Events

#### 6.1 Connection with Command Events

```typescript
/**
 * Wrap command execution
 */
private _wrapCommandExecution(
  originalExecuteCommand: (command: string, payload?: any) => Promise<boolean>
) {
  return async (command: string, payload?: any): Promise<boolean> => {
    if (!this.enabled) {
      return originalExecuteCommand(command, payload);
    }

    const parentContext = this._getCurrentContext();
    const traceContext = this._createTraceContext(
      `command:${command}`,
      'Editor',
      parentContext?.spanId
    );

    const startTime = performance.now();

    try {
      this._emitTraceStart(traceContext, { command, payload });

      const result = await originalExecuteCommand(command, payload);

      this._emitTraceEnd(traceContext, { success: result }, performance.now() - startTime);

      return result;
    } catch (error) {
      this._emitTraceError(traceContext, error as Error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  };
}
```

#### 6.2 Connection with Transaction Events

```typescript
/**
 * Wrap transaction execution
 */
private _wrapTransactionExecution(
  originalExecute: (operations: any[]) => Promise<any>
) {
  return async (operations: any[]): Promise<any> => {
    if (!this.enabled) {
      return originalExecute(operations);
    }

    const parentContext = this._getCurrentContext();
    const traceContext = this._createTraceContext(
      'transaction',
      'TransactionManager',
      parentContext?.spanId
    );

    const startTime = performance.now();

    try {
      this._emitTraceStart(traceContext, { operations });

      const result = await originalExecute(operations);

      this._emitTraceEnd(
        traceContext,
        {
          transactionId: result.transactionId,
          operations: result.operations,
          selectionBefore: result.selectionBefore,
          selectionAfter: result.selectionAfter
        },
        performance.now() - startTime
      );

      return result;
    } catch (error) {
      this._emitTraceError(traceContext, error as Error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  };
}
```

---

### 7. Devtool Integration

#### 7.1 FlowReconstructor Update

```typescript
// packages/devtool/src/flow-reconstructor.ts

export class FlowReconstructor {
  private traces: Map<string, ExecutionFlow> = new Map();

  /**
   * Handle trace event
   */
  handleTraceEvent(type: string, data: any): void {
    if (type === 'editor:trace.start') {
      this._handleTraceStart(data);
    } else if (type === 'editor:trace.end') {
      this._handleTraceEnd(data);
    } else if (type === 'editor:trace.error') {
      this._handleTraceError(data);
    }
  }

  /**
   * Handle trace start
   */
  private _handleTraceStart(data: TraceStartEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    
    flow.spans.push({
      spanId: data.spanId,
      parentSpanId: data.parentSpanId,
      operationName: data.operationName,
      className: data.className,
      startTime: data.timestamp,
      input: data.input
    });
  }

  /**
   * Handle trace end
   */
  private _handleTraceEnd(data: TraceEndEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    const span = flow.spans.find(s => s.spanId === data.spanId);
    
    if (span) {
      span.endTime = data.timestamp;
      span.duration = data.duration;
      span.output = data.output;
    }
  }

  /**
   * Get or create flow
   */
  private _getOrCreateFlow(traceId: string): ExecutionFlow {
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, {
        traceId,
        spans: [],
        startTime: Date.now()
      });
    }
    return this.traces.get(traceId)!;
  }

  /**
   * Get completed flow
   */
  getCompletedFlow(traceId: string): ExecutionFlow | undefined {
    const flow = this.traces.get(traceId);
    if (!flow) return undefined;

    // Check if all spans are completed
    const allCompleted = flow.spans.every(s => s.endTime !== undefined);
    return allCompleted ? flow : undefined;
  }
}
```

---

### 8. Usage Examples

#### 8.1 Devtool Initialization

```typescript
// packages/devtool/src/devtool.ts

export class Devtool {
  private autoTracer: AutoTracer;
  private flowReconstructor: FlowReconstructor;

  constructor(options: DevtoolOptions) {
    this.editor = options.editor;
    
    // Initialize AutoTracer
    this.autoTracer = new AutoTracer(this.editor);
    
    // Initialize FlowReconstructor
    this.flowReconstructor = new FlowReconstructor();
    
    // Enable auto tracing
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }
    
    // Setup trace event listeners
    this.setupTraceListeners();
  }

  private setupTraceListeners(): void {
    this.editor.on('editor:trace.start', (data) => {
      this.flowReconstructor.handleTraceEvent('editor:trace.start', data);
    });

    this.editor.on('editor:trace.end', (data) => {
      this.flowReconstructor.handleTraceEvent('editor:trace.end', data);
    });

    this.editor.on('editor:trace.error', (data) => {
      this.flowReconstructor.handleTraceEvent('editor:trace.error', data);
    });
  }
}
```

#### 8.2 Auto Tracing Without Code Changes

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// Existing code (no changes)
private async handleDelete(event: InputEvent): Promise<void> {
  // ... existing logic ...
  await this.editor.executeCommand('deleteText', { range });
  // ... existing logic ...
}

// AutoTracer automatically wraps to trace:
// 1. handleDelete start → editor:trace.start
// 2. executeCommand start → editor:trace.start (parent: handleDelete)
// 3. executeCommand end → editor:trace.end
// 4. handleDelete end → editor:trace.end
```

---

### 9. Performance Considerations

#### 9.1 Selective Activation

```typescript
// Activate only in development mode
if (process.env.NODE_ENV === 'development') {
  devtool.enableAutoTracing();
}
```

#### 9.2 Sampling

```typescript
// Collect only some traces (performance optimization)
class AutoTracer {
  private samplingRate: number = 1.0; // 100% (dev mode), 0.1 (production)

  shouldTrace(): boolean {
    return Math.random() < this.samplingRate;
  }

  private _wrapFunction(...) {
    return (...args) => {
      if (!this.shouldTrace()) {
        return fn(...args);
      }
      // ... tracing logic ...
    };
  }
}
```

#### 9.3 Async Event Emission

```typescript
// Process event emission asynchronously (prevent main thread blocking)
private _emitTraceStart(context: TraceContext, input?: any): void {
  // Use requestIdleCallback or setTimeout
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      this.editor.emit('editor:trace.start', { ... });
    });
  } else {
    setTimeout(() => {
      this.editor.emit('editor:trace.start', { ... });
    }, 0);
  }
}
```

---

### 10. Standardized Interface

#### 10.1 Trace Interface

```typescript
// packages/devtool/src/types.ts

export interface Trace {
  traceId: string;
  spans: Span[];
  startTime: number;
  endTime?: number;
  duration?: number;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  className?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  input?: any;
  output?: any;
  error?: Error;
  tags?: Record<string, any>;
}

export interface ExecutionFlow extends Trace {
  command?: CommandInfo;
  transaction?: TransactionInfo;
  operations?: OperationInfo[];
}
```

#### 10.2 AutoTracer Interface

```typescript
// packages/devtool/src/auto-tracer.ts

export interface AutoTracerOptions {
  enabled?: boolean;
  samplingRate?: number;
  maxTraces?: number;
  excludePatterns?: string[]; // Function name patterns to exclude from tracing
}

export interface AutoTracer {
  enable(): void;
  disable(): void;
  isEnabled(): boolean;
  getActiveTraces(): Trace[];
  clearTraces(): void;
}
```

---

### 11. Implementation Phases

#### Phase 1: Basic AutoTracer Implementation
- [ ] Implement AutoTracer class
- [ ] Implement function wrapping logic
- [ ] Implement Trace Context management
- [ ] Implement basic event emission

#### Phase 2: Editor Integration
- [ ] Instrument Editor methods
- [ ] Instrument InputHandler methods
- [ ] Instrument Command execution

#### Phase 3: Devtool Integration
- [ ] Implement FlowReconstructor
- [ ] Setup trace event listeners
- [ ] Implement flow visualization UI

#### Phase 4: Advanced Features
- [ ] Support sampling
- [ ] Performance optimization
- [ ] Filtering and search features

---

## Summary

### Core Principles

1. ✅ **Minimize code changes**: Auto instrumentation, no need for developers to modify code
2. ✅ **Standardized interface**: Follow RUM pattern (traceId, spanId, parentSpanId)
3. ✅ **Automatic ID assignment**: Automatically assign traceId/spanId to all function calls to track call relationships
4. ✅ **Context propagation**: Maintain context in async call chains using stack-based approach
5. ✅ **Multi-package support**: Auto instrument all packages like datastore, model, renderer-dom
6. ✅ **Selective activation**: Activate only in development mode, minimize performance overhead

### RUM-Style Call Relationship Tracking

**Automatic ID assignment mechanism**:
- Top-level call: Create new `traceId`
- Child call: Inherit parent's `traceId`
- Each function call: Generate unique `spanId`
- Parent-child relationship: Automatically connect via `parentSpanId`

**Stack-based context management**:
- Add to stack on function call
- Remove from stack on function end
- Current active context is stack top

### Multi-Package Monitoring

**Supported packages**:
- `@barocss/editor-core`: Command execution
- `@barocss/editor-view-dom`: Input processing
- `@barocss/datastore`: Data changes
- `@barocss/model`: Transaction and Operation
- `@barocss/renderer-dom`: Rendering and Reconciliation
- `@barocss/extensions`: Extension execution

**Package auto-detection**:
- Auto-infer package from class name
- Automatically add `package` tag to events
- Color-code by package in Devtool UI

### Advantages

- ✅ **No need for developers to modify code**: Auto instrumentation
- ✅ **Maintain consistency with standardized approach**: Follow RUM pattern
- ✅ **Track entire flow**: All package calls connected with one traceId
- ✅ **Minimize performance overhead**: Selective activation, sampling support
- ✅ **Extensible structure**: Auto-detect when new packages are added

### Next Steps

1. **Basic AutoTracer implementation**: Stack-based context management, automatic ID assignment
2. **Multi-package instrumentation**: Auto instrument DataStore, Model, RendererDOM
3. **Devtool UI integration**: Color-code by package, visualize call chain
