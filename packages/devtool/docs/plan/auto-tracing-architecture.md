# 자동 추적 아키텍처 (Auto-Tracing Architecture)

## 개요

RUM (Real User Monitoring) 솔루션의 자동 추적 패턴을 참고하여, 에디터의 실행 플로우를 자동으로 모니터링하는 표준화된 시스템을 설계합니다.

---

## RUM 솔루션 패턴 분석

### 주요 RUM 솔루션들의 공통 패턴

1. **자동 계측 (Auto Instrumentation)**
   - 함수 호출을 자동으로 가로채서 추적
   - 코드 변경 최소화
   - 성능 오버헤드 최소화

2. **컨텍스트 전파 (Context Propagation)**
   - 실행 컨텍스트에 trace ID 자동 주입
   - 비동기 호출 체인에서도 컨텍스트 유지

3. **이벤트 기반 수집**
   - 모든 추적 정보를 이벤트로 수집
   - 중앙 집중식 분석 및 시각화

4. **선택적 활성화**
   - 개발 모드에서만 활성화
   - 프로덕션에서는 비활성화 가능

---

## 아키텍처 설계

### 1. 계층 구조

```
┌─────────────────────────────────────────┐
│         Devtool (수집 및 시각화)          │
└─────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────┐
│    AutoTracer (자동 추적 엔진)           │
│  - 함수 래핑                              │
│  - 컨텍스트 관리                           │
│  - 이벤트 발생                             │
└─────────────────────────────────────────┘
                    ↑
┌─────────────────────────────────────────┐
│    Editor Core (비즈니스 로직)           │
│  - Command 실행                           │
│  - Transaction 실행                       │
│  - Operation 실행                         │
└─────────────────────────────────────────┘
```

### 2. 핵심 컴포넌트

#### 2.1 AutoTracer

**역할**: 자동으로 함수 호출을 가로채서 추적

```typescript
// packages/devtool/src/auto-tracer.ts

export interface TraceContext {
  traceId: string;              // 전체 플로우 ID
  spanId: string;                // 현재 실행 단위 ID
  parentSpanId?: string;         // 부모 실행 단위 ID
  operationName: string;         // 함수/명령 이름
  startTime: number;             // 시작 시간
  tags?: Record<string, any>;    // 추가 메타데이터
}

export class AutoTracer {
  private editor: Editor;
  private enabled: boolean = false;
  private activeTraces: Map<string, TraceContext> = new Map();
  
  constructor(editor: Editor) {
    this.editor = editor;
  }

  /**
   * 자동 추적 활성화
   */
  enable(): void {
    if (this.enabled) return;
    this.enabled = true;
    
    // Editor Core 계측
    this._instrumentEditor();
    this._instrumentInputHandler();
    this._instrumentCommands();
    
    // 다중 패키지 계측
    this._instrumentDataStore();
    this._instrumentModel();
    this._instrumentRendererDOM();
  }

  /**
   * 자동 추적 비활성화
   */
  disable(): void {
    this.enabled = false;
    this._uninstrumentAll();
  }

  /**
   * Editor 메서드 계측
   */
  private _instrumentEditor(): void {
    const editor = this.editor as any;
    
    // executeCommand 래핑
    const originalExecuteCommand = editor.executeCommand.bind(editor);
    editor.executeCommand = this._wrapCommandExecution(originalExecuteCommand);
  }

  /**
   * InputHandler 메서드 계측
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
   * Command 메서드 계측
   */
  private _instrumentCommands(): void {
    // Extension의 Command execute 메서드 자동 래핑
    // (필요시 구현)
  }

  /**
   * DataStore 패키지 계측
   */
  private _instrumentDataStore(): void {
    const dataStore = (this.editor as any).dataStore;
    if (!dataStore) return;

    // CoreOperations 메서드 계측
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

    // RangeOperations 메서드 계측
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

    // MarkOperations 메서드 계측
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
   * Model 패키지 계측
   */
  private _instrumentModel(): void {
    const transactionManager = (this.editor as any).transactionManager;
    if (!transactionManager) return;

    // TransactionManager.execute 계측
    const originalExecute = transactionManager.execute.bind(transactionManager);
    transactionManager.execute = this._wrapAsyncFunction(
      originalExecute,
      'TransactionManager.execute',
      'TransactionManager'
    );

    // Operation 실행 계측 (defineOperation으로 등록된 operations)
    // (런타임에 동적으로 래핑)
  }

  /**
   * RendererDOM 패키지 계측
   */
  private _instrumentRendererDOM(): void {
    const viewDOM = (this.editor as any)._viewDOM;
    if (!viewDOM) return;

    // DOMRenderer 계측
    const domRenderer = viewDOM._domRenderer;
    if (domRenderer) {
      const originalRender = domRenderer.render.bind(domRenderer);
      domRenderer.render = this._wrapAsyncFunction(
        originalRender,
        'DOMRenderer.render',
        'DOMRenderer'
      );

      // Reconciler 계측
      if (domRenderer._reconciler) {
        const originalReconcile = domRenderer._reconciler.reconcile.bind(domRenderer._reconciler);
        domRenderer._reconciler.reconcile = this._wrapAsyncFunction(
          originalReconcile,
          'Reconciler.reconcile',
          'Reconciler'
        );
      }

      // VNodeBuilder 계측
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

### 3. 함수 래핑 전략

#### 3.1 동기 함수 래핑

```typescript
/**
 * 동기 함수 래핑
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
      // 함수 시작 이벤트
      this._emitTraceStart(traceContext, args);

      // 원본 함수 실행
      const result = fn(...args);

      // 함수 종료 이벤트
      this._emitTraceEnd(traceContext, result, performance.now() - startTime);

      return result;
    } catch (error) {
      // 에러 이벤트
      this._emitTraceError(traceContext, error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  }) as T;
}
```

#### 3.2 비동기 함수 래핑

```typescript
/**
 * 비동기 함수 래핑 (Promise 지원)
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
      // 함수 시작 이벤트
      this._emitTraceStart(traceContext, args);

      // 원본 함수 실행
      const result = await fn(...args);

      // 함수 종료 이벤트
      this._emitTraceEnd(traceContext, result, performance.now() - startTime);

      return result;
    } catch (error) {
      // 에러 이벤트
      this._emitTraceError(traceContext, error, performance.now() - startTime);
      throw error;
    } finally {
      this._cleanupTraceContext(traceContext.spanId);
    }
  }) as T;
}
```

---

### 4. 컨텍스트 관리 및 자동 ID 부여

#### 4.1 RUM 스타일 호출 연관관계 추적

**핵심**: 모든 함수 호출에 자동으로 `traceId`와 `spanId`를 부여하여 호출 연관관계를 자동으로 추적

```typescript
/**
 * Trace Context 생성 (자동 ID 부여)
 */
private _createTraceContext(
  operationName: string,
  className?: string,
  parentSpanId?: string,
  fn?: Function
): TraceContext {
  // 1. 부모 컨텍스트 확인
  const parentContext = parentSpanId 
    ? this.activeTraces.get(parentSpanId)
    : this._getCurrentContext(); // 스택에서 자동으로 부모 찾기
  
  // 2. traceId 결정: 부모가 있으면 같은 traceId 사용, 없으면 새로 생성
  const traceId = parentContext?.traceId || this._generateTraceId();
  
  // 3. spanId 생성: 고유한 실행 단위 ID
  const spanId = this._generateSpanId();

  // 4. 컨텍스트 생성
  const context: TraceContext = {
    traceId,
    spanId,
    parentSpanId: parentContext?.spanId, // 부모 spanId 자동 연결
    operationName,
    startTime: performance.now(),
    tags: {
      className,
      package: this._detectPackage(className, fn), // 패키지 자동 감지 (스택 트레이스 활용)
      timestamp: Date.now()
    }
  };

  // 5. 활성 컨텍스트 스택에 추가
  this._pushContext(context);
  this.activeTraces.set(spanId, context);
  
  return context;
}

  /**
   * 패키지 자동 감지 (다양한 방법 시도)
   */
  private _detectPackage(className?: string, fn?: Function): string {
    const detectionMethod = this.options.packageDetection || 'auto';

    // 방법 1: 런타임 메타데이터 확인 (가장 정확, 명시적)
    if (fn && (fn as any).__package) {
      return (fn as any).__package;
    }

    // 방법 2: 스택 트레이스에서 파일 경로 추출 (정확하지만 제한적)
    if (detectionMethod === 'stack' || detectionMethod === 'auto') {
      if (fn) {
        const packageFromStack = this._detectPackageFromStack(fn);
        if (packageFromStack) {
          return packageFromStack;
        }
      }
    }

    // 방법 3: 클래스 이름으로 패키지 추론 (폴백)
    if (detectionMethod === 'name' || detectionMethod === 'auto') {
      if (className) {
        const packageFromName = this._detectPackageFromClassName(className);
        if (packageFromName && packageFromName !== 'unknown') {
          return packageFromName;
        }
      }
    }

    // 방법 4: 명시적 패키지 목록 확인
    if (this.options.instrumentPackages && this.options.instrumentPackages.length > 0) {
      // instrumentPackages에 지정된 패키지 중 하나를 반환
      // (실제로는 더 정교한 매칭 필요)
      return this.options.instrumentPackages[0];
    }

    return 'unknown';
  }

  /**
   * 스택 트레이스에서 패키지 감지
   */
  private _detectPackageFromStack(fn: Function): string | null {
    try {
      // Error.stack을 이용하여 호출 스택 추출
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

      // 스택에서 파일 경로 추출
      // 예: "at InputHandler.handleDelete (packages/editor-view-dom/src/input-handler.ts:123:45)"
      const stackLines = stack.split('\n');
      
      for (const line of stackLines) {
        // packages/ 패턴 찾기
        const packageMatch = line.match(/packages\/([^/]+)\//);
        if (packageMatch) {
          const packageName = packageMatch[1];
          // 패키지 이름을 @barocss/ 형식으로 변환
          return `@barocss/${packageName}`;
        }

        // node_modules/@barocss/ 패턴 찾기
        const nodeModulesMatch = line.match(/node_modules\/@barocss\/([^/]+)\//);
        if (nodeModulesMatch) {
          return `@barocss/${nodeModulesMatch[1]}`;
        }
      }

      return null;
    } catch (error) {
      // 스택 추출 실패 시 null 반환
      return null;
    }
  }

  /**
   * 클래스 이름으로 패키지 추론 (폴백)
   */
  private _detectPackageFromClassName(className: string): string {
    // 클래스 이름 패턴 매칭 (기존 로직)
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

#### 4.2 스택 기반 컨텍스트 관리

```typescript
/**
 * 컨텍스트 스택 관리 (호출 체인 추적)
 */
private contextStack: TraceContext[] = [];

/**
 * 컨텍스트 스택에 추가
 */
private _pushContext(context: TraceContext): void {
  this.contextStack.push(context);
}

/**
 * 현재 활성 컨텍스트 가져오기 (스택 최상단)
 */
private _getCurrentContext(): TraceContext | null {
  return this.contextStack.length > 0 
    ? this.contextStack[this.contextStack.length - 1]
    : null;
}

/**
 * 컨텍스트 스택에서 제거
 */
private _popContext(spanId: string): void {
  const index = this.contextStack.findIndex(ctx => ctx.spanId === spanId);
  if (index !== -1) {
    this.contextStack.splice(index, 1);
  }
}

/**
 * 컨텍스트 정리
 */
private _cleanupTraceContext(spanId: string): void {
  this._popContext(spanId);
  this.activeTraces.delete(spanId);
}
```

#### 4.3 자동 ID 부여 메커니즘

**RUM 솔루션과 동일한 방식**:

1. **최상위 호출**: 새로운 `traceId` 생성
2. **하위 호출**: 부모의 `traceId` 상속
3. **각 함수 호출**: 고유한 `spanId` 생성
4. **부모-자식 관계**: `parentSpanId`로 자동 연결

```typescript
// 예시: handleDelete → executeCommand → Transaction → Operation

// 1. handleDelete 시작
traceId: 'trace-1', spanId: 'span-1', parentSpanId: undefined

// 2. executeCommand 시작 (handleDelete 내부)
traceId: 'trace-1', spanId: 'span-2', parentSpanId: 'span-1'  // 같은 traceId, 부모는 span-1

// 3. Transaction 시작 (executeCommand 내부)
traceId: 'trace-1', spanId: 'span-3', parentSpanId: 'span-2'  // 같은 traceId, 부모는 span-2

// 4. Operation 시작 (Transaction 내부)
traceId: 'trace-1', spanId: 'span-4', parentSpanId: 'span-3'  // 같은 traceId, 부모는 span-3
```

이렇게 하면 **모든 호출이 자동으로 연관관계가 추적**됩니다.

---

### 5. 이벤트 발생

#### 5.1 Trace 이벤트 타입

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

#### 5.2 이벤트 발생 메서드

```typescript
/**
 * Trace 시작 이벤트 발생
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
 * Trace 종료 이벤트 발생
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
 * Trace 에러 이벤트 발생
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

### 6. 기존 이벤트와의 통합

#### 6.1 Command 이벤트와 연결

```typescript
/**
 * Command 실행 래핑
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

#### 6.2 Transaction 이벤트와 연결

```typescript
/**
 * Transaction 실행 래핑
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

### 7. Devtool 통합

#### 7.1 FlowReconstructor 업데이트

```typescript
// packages/devtool/src/flow-reconstructor.ts

export class FlowReconstructor {
  private traces: Map<string, ExecutionFlow> = new Map();

  /**
   * Trace 이벤트 처리
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
   * Trace 시작 처리
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
   * Trace 종료 처리
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
   * Flow 가져오기 또는 생성
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
   * 완료된 Flow 가져오기
   */
  getCompletedFlow(traceId: string): ExecutionFlow | undefined {
    const flow = this.traces.get(traceId);
    if (!flow) return undefined;

    // 모든 span이 종료되었는지 확인
    const allCompleted = flow.spans.every(s => s.endTime !== undefined);
    return allCompleted ? flow : undefined;
  }
}
```

---

### 8. 사용 예시

#### 8.1 Devtool 초기화

```typescript
// packages/devtool/src/devtool.ts

export class Devtool {
  private autoTracer: AutoTracer;
  private flowReconstructor: FlowReconstructor;

  constructor(options: DevtoolOptions) {
    this.editor = options.editor;
    
    // AutoTracer 초기화
    this.autoTracer = new AutoTracer(this.editor);
    
    // FlowReconstructor 초기화
    this.flowReconstructor = new FlowReconstructor();
    
    // 자동 추적 활성화
    if (options.enableAutoTracing !== false) {
      this.autoTracer.enable();
    }
    
    // Trace 이벤트 리스너 설정
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

#### 8.2 코드 변경 없이 자동 추적

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// 기존 코드 (변경 없음)
private async handleDelete(event: InputEvent): Promise<void> {
  // ... 기존 로직 ...
  await this.editor.executeCommand('deleteText', { range });
  // ... 기존 로직 ...
}

// AutoTracer가 자동으로 래핑하여 추적:
// 1. handleDelete 시작 → editor:trace.start
// 2. executeCommand 시작 → editor:trace.start (parent: handleDelete)
// 3. executeCommand 종료 → editor:trace.end
// 4. handleDelete 종료 → editor:trace.end
```

---

### 9. 성능 고려사항

#### 9.1 선택적 활성화

```typescript
// 개발 모드에서만 활성화
if (process.env.NODE_ENV === 'development') {
  devtool.enableAutoTracing();
}
```

#### 9.2 샘플링

```typescript
// 일부 Trace만 수집 (성능 최적화)
class AutoTracer {
  private samplingRate: number = 1.0; // 100% (개발 모드), 0.1 (프로덕션)

  shouldTrace(): boolean {
    return Math.random() < this.samplingRate;
  }

  private _wrapFunction(...) {
    return (...args) => {
      if (!this.shouldTrace()) {
        return fn(...args);
      }
      // ... 추적 로직 ...
    };
  }
}
```

#### 9.3 비동기 이벤트 발생

```typescript
// 이벤트 발생을 비동기로 처리 (메인 스레드 블로킹 방지)
private _emitTraceStart(context: TraceContext, input?: any): void {
  // requestIdleCallback 또는 setTimeout 사용
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

### 10. 표준화된 인터페이스

#### 10.1 Trace 인터페이스

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

#### 10.2 AutoTracer 인터페이스

```typescript
// packages/devtool/src/auto-tracer.ts

export interface AutoTracerOptions {
  enabled?: boolean;
  samplingRate?: number;
  maxTraces?: number;
  excludePatterns?: string[]; // 추적 제외할 함수 이름 패턴
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

### 11. 구현 단계

#### Phase 1: 기본 AutoTracer 구현
- [ ] AutoTracer 클래스 구현
- [ ] 함수 래핑 로직 구현
- [ ] Trace Context 관리 구현
- [ ] 기본 이벤트 발생 구현

#### Phase 2: Editor 통합
- [ ] Editor 메서드 계측
- [ ] InputHandler 메서드 계측
- [ ] Command 실행 계측

#### Phase 3: Devtool 통합
- [ ] FlowReconstructor 구현
- [ ] Trace 이벤트 리스너 설정
- [ ] 플로우 시각화 UI 구현

#### Phase 4: 고급 기능
- [ ] 샘플링 지원
- [ ] 성능 최적화
- [ ] 필터링 및 검색 기능

---

## 정리

### 핵심 원칙

1. ✅ **코드 변경 최소화**: 자동 계측으로 개발자가 코드를 수정할 필요 없음
2. ✅ **표준화된 인터페이스**: RUM 패턴 준수 (traceId, spanId, parentSpanId)
3. ✅ **자동 ID 부여**: 모든 함수 호출에 자동으로 traceId/spanId 부여하여 호출 연관관계 추적
4. ✅ **컨텍스트 전파**: 스택 기반으로 비동기 호출 체인에서도 컨텍스트 유지
5. ✅ **다중 패키지 지원**: datastore, model, renderer-dom 등 모든 패키지 자동 계측
6. ✅ **선택적 활성화**: 개발 모드에서만 활성화, 성능 오버헤드 최소화

### RUM 스타일 호출 연관관계 추적

**자동 ID 부여 메커니즘**:
- 최상위 호출: 새로운 `traceId` 생성
- 하위 호출: 부모의 `traceId` 상속
- 각 함수 호출: 고유한 `spanId` 생성
- 부모-자식 관계: `parentSpanId`로 자동 연결

**스택 기반 컨텍스트 관리**:
- 함수 호출 시 스택에 추가
- 함수 종료 시 스택에서 제거
- 현재 활성 컨텍스트는 스택 최상단

### 다중 패키지 모니터링

**지원 패키지**:
- `@barocss/editor-core`: Command 실행
- `@barocss/editor-view-dom`: 입력 처리
- `@barocss/datastore`: 데이터 변경
- `@barocss/model`: Transaction 및 Operation
- `@barocss/renderer-dom`: 렌더링 및 Reconciliation
- `@barocss/extensions`: Extension 실행

**패키지 자동 감지**:
- 클래스 이름으로 패키지 자동 추론
- 이벤트에 `package` 태그 자동 추가
- Devtool UI에서 패키지별 색상 구분

### 장점

- ✅ **개발자가 코드를 수정할 필요 없음**: 자동 계측
- ✅ **표준화된 방식으로 일관성 유지**: RUM 패턴 준수
- ✅ **전체 플로우 추적**: 모든 패키지의 호출이 하나의 traceId로 연결
- ✅ **성능 오버헤드 최소화**: 선택적 활성화, 샘플링 지원
- ✅ **확장 가능한 구조**: 새로운 패키지 추가 시 자동 감지

### 다음 단계

1. **AutoTracer 기본 구현**: 스택 기반 컨텍스트 관리, 자동 ID 부여
2. **다중 패키지 계측**: DataStore, Model, RendererDOM 자동 계측
3. **Devtool UI 통합**: 패키지별 색상 구분, 호출 체인 시각화

