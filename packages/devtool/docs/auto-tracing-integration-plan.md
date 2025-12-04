# Auto Tracing 통합 계획

## 구조 결정: 분리 vs 통합

### 옵션 1: 단순 구조 (권장, 초기)

```
Devtool
├── AutoTracer (독립 모듈)
│   ├── 계측 로직
│   └── 이벤트 발생 (traceId, spanId, parentSpanId 포함)
└── Devtool
    ├── traces: Map<string, Trace> (이벤트 수집)
    ├── _handleTraceStart/End (플로우 재구성)
    └── DevtoolUI
        ├── Model Tree 탭
        ├── Events 탭
        └── Execution Flow 탭 (새로 추가)
```

**장점**:
- ✅ 구조 단순
- ✅ AutoTracer는 독립적으로 사용 가능
- ✅ 중간 레이어 없음 (직접적)
- ✅ 필요시 나중에 FlowReconstructor로 리팩토링 가능

**단점**:
- ⚠️ Devtool 클래스가 약간 비대해질 수 있음 (하지만 초기에는 충분)

### 옵션 2: 분리 구조 (복잡한 기능 필요시)

```
Devtool
├── AutoTracer (독립 모듈)
├── FlowReconstructor (독립 모듈)
│   ├── Trace 이벤트 수집
│   ├── 플로우 재구성
│   ├── 검색/필터링
│   └── 통계/분석
└── DevtoolUI
```

**사용 시기**:
- 검색/필터링 기능 필요
- 플로우 통계/분석 필요
- 다른 곳에서도 플로우 재구성 로직 재사용

### 옵션 2: 통합 구조

```
Devtool
├── AutoTracer (내부 클래스)
├── FlowReconstructor (내부 클래스)
└── DevtoolUI
    └── Execution Flow 탭 (새로 추가)
```

**장점**:
- ✅ 간단한 구조
- ✅ 하나의 인스턴스로 관리

**단점**:
- ❌ AutoTracer를 독립적으로 사용 불가
- ❌ 테스트 어려움

**결론**: **옵션 1 (분리 구조) 권장**

---

## 구현 계획

### Phase 1: 모니터링 대상 고정

#### 1.1 고정된 모니터링 대상 정의

```typescript
// packages/devtool/src/auto-tracer/instrumentation-targets.ts

export interface InstrumentationTarget {
  package: string;
  className: string;
  methods: string[];
}

/**
 * 고정된 모니터링 대상 목록
 * 새로운 패키지/클래스를 추가하려면 여기에 명시적으로 추가
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

#### 1.2 동적 계측 로직

```typescript
// packages/devtool/src/auto-tracer/auto-tracer.ts

import { INSTRUMENTATION_TARGETS } from './instrumentation-targets';

export class AutoTracer {
  // ...
  
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    
    // 고정된 대상만 계측
    this._instrumentTargets(INSTRUMENTATION_TARGETS);
  }
  
  private _instrumentTargets(targets: InstrumentationTarget[]): void {
    targets.forEach(target => {
      this._instrumentTarget(target);
    });
  }
  
  private _instrumentTarget(target: InstrumentationTarget): void {
    // Editor 인스턴스에서 대상 찾기
    const instance = this._findInstance(target.className);
    if (!instance) {
      console.warn(`[AutoTracer] Instance not found: ${target.className}`);
      return;
    }
    
    // 각 메서드 계측
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
    
    // 클래스 이름으로 인스턴스 찾기
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

### Phase 2: AutoTracer 구현

#### 2.1 파일 구조

```
packages/devtool/src/
├── auto-tracer/
│   ├── auto-tracer.ts          # AutoTracer 메인 클래스
│   ├── instrumentation-targets.ts  # 고정된 계측 대상
│   ├── trace-context.ts        # TraceContext 관리
│   └── index.ts
├── flow-reconstructor/
│   ├── flow-reconstructor.ts   # FlowReconstructor 클래스
│   └── index.ts
├── devtool.ts                  # Devtool 메인 클래스
├── ui.ts                       # DevtoolUI 클래스
└── types.ts                    # 타입 정의
```

#### 2.2 AutoTracer 기본 구현

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
    // 계측 해제 로직
  }
  
  // ... 나머지 구현
}
```

---

### Phase 3: Devtool에서 직접 플로우 재구성 (FlowReconstructor 없이)

**이유**: `AutoTracer`가 이미 완전한 정보를 제공하므로, 단순한 수집 로직은 Devtool에 포함

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
    
    // 플로우 완료 확인
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
      
      // 최대 개수 제한
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

**나중에 필요하면**: 검색/필터링 기능 추가 시 `FlowReconstructor`로 리팩토링

---

### Phase 4: Devtool 통합

#### 4.1 Devtool 클래스 업데이트

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
  // ... 기존 필드들
  
  constructor(options: DevtoolOptions) {
    // ... 기존 초기화
    
    // AutoTracer 초기화
    this.autoTracer = new AutoTracer(this.editor, {
      enabled: options.enableAutoTracing !== false
    });
    
    // AutoTracer 활성화
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }
    
    // Trace 이벤트 리스너 설정
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
  
  // 플로우 재구성 메서드들 (위 Phase 3 참고)
  private _handleTraceStart(data: any): void { }
  private _handleTraceEnd(data: any): void { }
  private _handleTraceError(data: any): void { }
  private _getCompletedFlows(limit: number): ExecutionFlow[] { }
}
```

#### 4.2 DevtoolUI에 Execution Flow 탭 추가

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
        <!-- 기존 Model Tree -->
      </div>
      <div class="devtool-panel" id="panel-events">
        <!-- 기존 Events -->
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
  
  // 플로우 목록 렌더링
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

### Phase 5: 데이터 수집 및 업데이트

#### 5.1 주기적 업데이트

```typescript
// packages/devtool/src/devtool.ts

private updateInterval: number | null = null;

constructor(options: DevtoolOptions) {
  // ...
  
  // 주기적 업데이트 (선택적)
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

#### 5.2 이벤트 기반 업데이트

```typescript
// Trace 이벤트 발생 시 자동 업데이트
this.editor.on('editor:trace.end', (data) => {
  this.flowReconstructor.handleTraceEvent('editor:trace.end', data);
  // 완료된 플로우만 UI 업데이트
  const completedFlows = this.flowReconstructor.getCompletedFlows(10);
  this.ui.updateExecutionFlow(completedFlows);
});
```

---

## 구현 순서

1. **모니터링 대상 고정** (`instrumentation-targets.ts`)
2. **AutoTracer 기본 구조** (`auto-tracer/`)
3. **Devtool 통합** (Devtool 클래스에 플로우 재구성 로직 추가)
4. **UI 추가** (Execution Flow 탭)
5. **데이터 수집 및 업데이트** (이벤트 기반 + 주기적)

**참고**: FlowReconstructor는 나중에 검색/필터링 기능이 필요할 때 추가

---

## 정리

**구조**: 단순 구조 (AutoTracer 독립, 플로우 재구성은 Devtool 내부)

**모니터링 대상**: 고정된 목록 (`INSTRUMENTATION_TARGETS`)

**플로우 재구성**: Devtool 클래스 내부에서 직접 처리 (FlowReconstructor 없이)

**데이터 수집**: 이벤트 기반 + 주기적 업데이트

**UI**: DevtoolUI에 Execution Flow 탭 추가

**향후 확장**: 검색/필터링 기능 필요 시 FlowReconstructor로 리팩토링

