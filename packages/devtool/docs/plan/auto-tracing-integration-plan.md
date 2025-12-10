# Auto Tracing Integration Plan

## Structure Decision: Separation vs Integration

### Option 1: Simple Structure (Recommended, Initial)

```
Devtool
├── AutoTracer (Independent module)
│   ├── Instrumentation logic
│   └── Event emission (includes traceId, spanId, parentSpanId)
└── Devtool
    ├── traces: Map<string, Trace> (event collection)
    ├── _handleTraceStart/End (flow reconstruction)
    └── DevtoolUI
        ├── Model Tree tab
        ├── Events tab
        └── Execution Flow tab (newly added)
```

**Advantages**:
- ✅ Simple structure
- ✅ AutoTracer can be used independently
- ✅ No intermediate layer (direct)
- ✅ Can refactor to FlowReconstructor later if needed

**Disadvantages**:
- ⚠️ Devtool class may become slightly large (but sufficient initially)

### Option 2: Separated Structure (When Complex Features Needed)

```
Devtool
├── AutoTracer (Independent module)
├── FlowReconstructor (Independent module)
│   ├── Trace event collection
│   ├── Flow reconstruction
│   ├── Search/filtering
│   └── Statistics/analysis
└── DevtoolUI
```

**When to use**:
- Search/filtering features needed
- Flow statistics/analysis needed
- Reuse flow reconstruction logic elsewhere

### Option 2: Integrated Structure

```
Devtool
├── AutoTracer (Internal class)
├── FlowReconstructor (Internal class)
└── DevtoolUI
    └── Execution Flow tab (newly added)
```

**Advantages**:
- ✅ Simple structure
- ✅ Manage with single instance

**Disadvantages**:
- ❌ Cannot use AutoTracer independently
- ❌ Hard to test

**Conclusion**: **Option 1 (Separated Structure) Recommended**

---

## Implementation Plan

### Phase 1: Fixed Monitoring Targets

#### 1.1 Define Fixed Monitoring Targets

```typescript
// packages/devtool/src/auto-tracer/instrumentation-targets.ts

export interface InstrumentationTarget {
  package: string;
  className: string;
  methods: string[];
}

/**
 * Fixed monitoring target list
 * Explicitly add here to add new packages/classes
 */
export const INSTRUMENTATION_TARGETS: InstrumentationTarget[] = [
  // Editor Core
  {
    package: '@barocss/editor-core',
    className: 'Editor',
    methods: ['executeCommand']
  },
  
  // Editor View DOM
  {
    package: '@barocss/editor-view-dom',
    className: 'InputHandlerImpl',
    methods: [
      'handleDelete',
      'handleC1',
      'handleC2',
      'handleC3',
      'handleTextContentChange',
      'handleDomMutations'
    ]
  },
  
  // DataStore
  {
    package: '@barocss/datastore',
    className: 'CoreOperations',
    methods: ['setNode', 'updateNode', 'deleteNode', 'createNodeWithChildren']
  },
  {
    package: '@barocss/datastore',
    className: 'RangeOperations',
    methods: ['replaceText', 'deleteText', 'insertText']
  },
  {
    package: '@barocss/datastore',
    className: 'MarkOperations',
    methods: ['setMarks', 'removeMark', 'updateMark', 'toggleMark']
  },
  
  // Model
  {
    package: '@barocss/model',
    className: 'TransactionManager',
    methods: ['execute']
  },
  
  // Renderer DOM
  {
    package: '@barocss/renderer-dom',
    className: 'DOMRenderer',
    methods: ['render']
  },
  {
    package: '@barocss/renderer-dom',
    className: 'Reconciler',
    methods: ['reconcile']
  },
  {
    package: '@barocss/renderer-dom',
    className: 'VNodeBuilder',
    methods: ['build']
  }
];
```

#### 1.2 Dynamic Instrumentation Logic

```typescript
// packages/devtool/src/auto-tracer/auto-tracer.ts

import { INSTRUMENTATION_TARGETS } from './instrumentation-targets';

export class AutoTracer {
  // ...
  
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    
    // Instrument only fixed targets
    this._instrumentTargets(INSTRUMENTATION_TARGETS);
  }
  
  private _instrumentTargets(targets: InstrumentationTarget[]): void {
    targets.forEach(target => {
      this._instrumentTarget(target);
    });
  }
  
  private _instrumentTarget(target: InstrumentationTarget): void {
    // Find target from Editor instance
    const instance = this._findInstance(target.className);
    if (!instance) {
      console.warn(`[AutoTracer] Instance not found: ${target.className}`);
      return;
    }
    
    // Instrument each method
    target.methods.forEach(methodName => {
      const original = instance[methodName];
      if (original && typeof original === 'function') {
        instance[methodName] = this._wrapFunction(
          original,
          methodName,
          target.className,
          target.package
        );
      }
    });
  }
  
  private _findInstance(className: string): any {
    const editor = this.editor as any;
    
    // Find instance by class name
    if (className === 'Editor') {
      return editor;
    }
    if (className === 'InputHandlerImpl') {
      return editor._viewDOM?._inputHandler;
    }
    if (className === 'CoreOperations') {
      return editor.dataStore?.coreOperations;
    }
    if (className === 'RangeOperations') {
      return editor.dataStore?.range;
    }
    if (className === 'MarkOperations') {
      return editor.dataStore?.marks;
    }
    if (className === 'TransactionManager') {
      return editor.transactionManager;
    }
    if (className === 'DOMRenderer') {
      return editor._viewDOM?._domRenderer;
    }
    if (className === 'Reconciler') {
      return editor._viewDOM?._domRenderer?._reconciler;
    }
    if (className === 'VNodeBuilder') {
      return editor._viewDOM?._domRenderer?._vnodeBuilder;
    }
    
    return null;
  }
}
```

---

### Phase 2: AutoTracer Implementation

#### 2.1 File Structure

```
packages/devtool/src/
├── auto-tracer/
│   ├── auto-tracer.ts          # AutoTracer main class
│   ├── instrumentation-targets.ts  # Fixed instrumentation targets
│   ├── trace-context.ts        # TraceContext management
│   └── index.ts
├── flow-reconstructor/
│   ├── flow-reconstructor.ts   # FlowReconstructor class
│   └── index.ts
├── devtool.ts                  # Devtool main class
├── ui.ts                       # DevtoolUI class
└── types.ts                    # Type definitions
```

#### 2.2 AutoTracer Basic Implementation

```typescript
// packages/devtool/src/auto-tracer/auto-tracer.ts

import { Editor } from '@barocss/editor-core';
import { INSTRUMENTATION_TARGETS } from './instrumentation-targets';
import { TraceContext } from './trace-context';

export interface AutoTracerOptions {
  enabled?: boolean;
  samplingRate?: number;
  maxTraces?: number;
  excludePatterns?: string[];
}

export class AutoTracer {
  private editor: Editor;
  private enabled: boolean = false;
  private options: AutoTracerOptions;
  private contextManager: TraceContextManager;
  
  constructor(editor: Editor, options: AutoTracerOptions = {}) {
    this.editor = editor;
    this.options = {
      enabled: options.enabled ?? false,
      samplingRate: options.samplingRate ?? 1.0,
      maxTraces: options.maxTraces ?? 1000,
      excludePatterns: options.excludePatterns ?? []
    };
    this.contextManager = new TraceContextManager();
  }
  
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    this._instrumentTargets(INSTRUMENTATION_TARGETS);
  }
  
  disable(): void {
    this.enabled = false;
    // Uninstrument logic
  }
  
  // ... rest of implementation
}
```

---

### Phase 3: Direct Flow Reconstruction in Devtool (Without FlowReconstructor)

**Reason**: Since `AutoTracer` already provides complete information, simple collection logic can be included in Devtool

```typescript
// packages/devtool/src/devtool.ts

export class Devtool {
  private traces: Map<string, ExecutionFlow> = new Map();
  private maxFlows: number = 100;
  
  private setupTraceListeners(): void {
    this.editor.on('editor:trace.start', (data) => {
      this._handleTraceStart(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
    
    this.editor.on('editor:trace.end', (data) => {
      this._handleTraceEnd(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
    
    this.editor.on('editor:trace.error', (data) => {
      this._handleTraceError(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
  }
  
  private _handleTraceStart(data: TraceStartEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    flow.spans.push({
      spanId: data.spanId,
      parentSpanId: data.parentSpanId,
      operationName: data.operationName,
      className: data.className,
      package: data.package,
      startTime: data.timestamp,
      input: data.input
    });
  }
  
  private _handleTraceEnd(data: TraceEndEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    const span = flow.spans.find(s => s.spanId === data.spanId);
    if (span) {
      span.endTime = data.timestamp;
      span.duration = data.duration;
      span.output = data.output;
    }
    
    // Check flow completion
    if (this._isCompleted(flow)) {
      flow.endTime = data.timestamp;
      flow.duration = data.timestamp - flow.startTime;
    }
  }
  
  private _getOrCreateFlow(traceId: string): ExecutionFlow {
    if (!this.traces.has(traceId)) {
      this.traces.set(traceId, {
        traceId,
        spans: [],
        startTime: Date.now()
      });
      
      // Limit maximum count
      if (this.traces.size > this.maxFlows) {
        const oldest = Array.from(this.traces.entries())
          .sort((a, b) => a[1].startTime - b[1].startTime)[0];
        this.traces.delete(oldest[0]);
      }
    }
    return this.traces.get(traceId)!;
  }
  
  private _isCompleted(flow: ExecutionFlow): boolean {
    return flow.spans.every(span => span.endTime !== undefined);
  }
  
  private _getCompletedFlows(limit: number = 10): ExecutionFlow[] {
    return Array.from(this.traces.values())
      .filter(flow => this._isCompleted(flow))
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      .slice(0, limit);
  }
}
```

**When needed later**: Refactor to `FlowReconstructor` when adding search/filtering features

---

### Phase 4: Devtool Integration

#### 4.1 Update Devtool Class

```typescript
// packages/devtool/src/devtool.ts

import { AutoTracer } from './auto-tracer';
import { ExecutionFlow } from './types';

export class Devtool {
  private editor: Editor;
  private ui: DevtoolUI;
  private autoTracer: AutoTracer;
  private traces: Map<string, ExecutionFlow> = new Map();
  private maxFlows: number = 100;
  // ... existing fields
  
  constructor(options: DevtoolOptions) {
    // ... existing initialization
    
    // Initialize AutoTracer
    this.autoTracer = new AutoTracer(this.editor, {
      enabled: options.enableAutoTracing !== false
    });
    
    // Enable AutoTracer
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }
    
    // Setup trace event listeners
    this.setupTraceListeners();
  }
  
  private setupTraceListeners(): void {
    this.editor.on('editor:trace.start', (data) => {
      this._handleTraceStart(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
    
    this.editor.on('editor:trace.end', (data) => {
      this._handleTraceEnd(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
    
    this.editor.on('editor:trace.error', (data) => {
      this._handleTraceError(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
  }
  
  // Flow reconstruction methods (see Phase 3 above)
  private _handleTraceStart(data: any): void { }
  private _handleTraceEnd(data: any): void { }
  private _handleTraceError(data: any): void { }
  private _getCompletedFlows(limit: number): ExecutionFlow[] { }
}
```

#### 4.2 Add Execution Flow Tab to DevtoolUI

```typescript
// packages/devtool/src/ui.ts

private createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'barocss-devtool';
  container.innerHTML = `
    <div class="devtool-tabs">
      <button class="devtool-tab active" data-tab="tree">Model Tree</button>
      <button class="devtool-tab" data-tab="events">Events</button>
      <button class="devtool-tab" data-tab="flow">Execution Flow</button>
    </div>
    <div class="devtool-content">
      <div class="devtool-panel active" id="panel-tree">
        <!-- Existing Model Tree -->
      </div>
      <div class="devtool-panel" id="panel-events">
        <!-- Existing Events -->
      </div>
      <div class="devtool-panel" id="panel-flow">
        <div class="devtool-flow-list" id="flow-list"></div>
        <div class="devtool-flow-detail" id="flow-detail"></div>
      </div>
    </div>
  `;
  // ...
}

updateExecutionFlow(flows: ExecutionFlow[]): void {
  const flowList = document.getElementById('flow-list');
  if (!flowList) return;
  
  // Render flow list
  flowList.innerHTML = flows.map(flow => `
    <div class="flow-item" data-trace-id="${flow.traceId}">
      <div class="flow-header">
        <span class="flow-trace-id">${flow.traceId}</span>
        <span class="flow-duration">${flow.duration}ms</span>
      </div>
      <div class="flow-spans">
        ${flow.spans.map(span => `
          <div class="flow-span" data-span-id="${span.spanId}">
            <span class="span-operation">${span.operationName}</span>
            <span class="span-package">${span.tags?.package || 'unknown'}</span>
            <span class="span-duration">${span.duration}ms</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}
```

---

### Phase 5: Data Collection and Updates

#### 5.1 Periodic Updates

```typescript
// packages/devtool/src/devtool.ts

private updateInterval: number | null = null;

constructor(options: DevtoolOptions) {
  // ...
  
  // Periodic update (optional)
  if (options.autoUpdateInterval) {
    this.updateInterval = window.setInterval(() => {
      this.updateExecutionFlow();
    }, options.autoUpdateInterval);
  }
}

private updateExecutionFlow(): void {
  const flows = this.flowReconstructor.getCompletedFlows(10);
  this.ui.updateExecutionFlow(flows);
}
```

#### 5.2 Event-Based Updates

```typescript
// Automatically update when trace event occurs
this.editor.on('editor:trace.end', (data) => {
  this.flowReconstructor.handleTraceEvent('editor:trace.end', data);
  // Update UI only for completed flows
  const completedFlows = this.flowReconstructor.getCompletedFlows(10);
  this.ui.updateExecutionFlow(completedFlows);
});
```

---

## Implementation Order

1. **Fix monitoring targets** (`instrumentation-targets.ts`)
2. **AutoTracer basic structure** (`auto-tracer/`)
3. **Devtool integration** (Add flow reconstruction logic to Devtool class)
4. **Add UI** (Execution Flow tab)
5. **Data collection and updates** (event-based + periodic)

**Note**: Add FlowReconstructor later when search/filtering features are needed

---

## Summary

**Structure**: Simple structure (AutoTracer independent, flow reconstruction inside Devtool)

**Monitoring targets**: Fixed list (`INSTRUMENTATION_TARGETS`)

**Flow reconstruction**: Handle directly inside Devtool class (without FlowReconstructor)

**Data collection**: Event-based + periodic updates

**UI**: Add Execution Flow tab to DevtoolUI

**Future expansion**: Refactor to FlowReconstructor when search/filtering features are needed
