# FlowReconstructor 역할 분석

## 질문: FlowReconstructor가 필요한가?

`AutoTracer`가 이미 `traceId`, `spanId`, `parentSpanId`를 포함한 완전한 이벤트를 발생시키는데, `FlowReconstructor`가 필요한가?

---

## AutoTracer가 제공하는 것

```typescript
// AutoTracer가 발생시키는 이벤트
editor:trace.start {
  traceId: 'trace-1',
  spanId: 'span-1',
  parentSpanId: undefined,
  operationName: 'handleDelete',
  className: 'InputHandlerImpl',
  package: '@barocss/editor-view-dom',
  timestamp: 1234567890
}

editor:trace.end {
  traceId: 'trace-1',
  spanId: 'span-1',
  operationName: 'handleDelete',
  duration: 10,
  timestamp: 1234567900
}
```

**이미 포함된 정보**:
- ✅ traceId (플로우 ID)
- ✅ spanId (실행 단위 ID)
- ✅ parentSpanId (부모 관계)
- ✅ operationName, className, package
- ✅ timestamp, duration

---

## FlowReconstructor의 역할

### 옵션 1: FlowReconstructor 제거 (단순화)

**접근**: `AutoTracer` 이벤트를 직접 UI에 표시

```typescript
// Devtool에서 직접 이벤트 수집
class Devtool {
  private traces: Map<string, Trace> = new Map();
  
  constructor() {
    this.editor.on('editor:trace.start', (data) => {
      this._handleTraceStart(data);
    });
    
    this.editor.on('editor:trace.end', (data) => {
      this._handleTraceEnd(data);
    });
  }
  
  private _handleTraceStart(data: TraceStartEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    flow.spans.push({
      spanId: data.spanId,
      parentSpanId: data.parentSpanId,
      operationName: data.operationName,
      // ...
    });
  }
  
  private _handleTraceEnd(data: TraceEndEvent): void {
    const flow = this._getOrCreateFlow(data.traceId);
    const span = flow.spans.find(s => s.spanId === data.spanId);
    if (span) {
      span.endTime = data.timestamp;
      span.duration = data.duration;
    }
  }
}
```

**장점**:
- ✅ 구조 단순화
- ✅ 중간 레이어 제거
- ✅ 직접적인 이벤트 처리

**단점**:
- ⚠️ Devtool 클래스가 비대해질 수 있음
- ⚠️ 플로우 재구성 로직이 Devtool에 섞임

---

### 옵션 2: FlowReconstructor 유지 (관심사 분리)

**접근**: `FlowReconstructor`는 플로우 재구성 전용

```typescript
// FlowReconstructor의 역할
class FlowReconstructor {
  // 1. 이벤트 수집 및 버퍼링
  handleTraceEvent(type: string, data: any): void { }
  
  // 2. 완료 상태 확인
  isCompleted(traceId: string): boolean { }
  
  // 3. 완료된 플로우만 반환
  getCompletedFlows(limit: number): ExecutionFlow[] { }
  
  // 4. 플로우 검색 및 필터링
  searchFlows(query: string): ExecutionFlow[] { }
  filterFlows(package?: string, operation?: string): ExecutionFlow[] { }
  
  // 5. 플로우 통계
  getFlowStatistics(): { total: number; completed: number; avgDuration: number } { }
}
```

**장점**:
- ✅ 관심사 분리 (플로우 재구성 로직 분리)
- ✅ 재사용 가능 (다른 곳에서도 사용 가능)
- ✅ 테스트 용이
- ✅ 확장성 (검색, 필터링, 통계 등)

**단점**:
- ⚠️ 추가 레이어 (약간의 복잡도)

---

## 결론: FlowReconstructor는 선택적

### 시나리오 1: 단순한 경우 (FlowReconstructor 제거)

**조건**:
- 플로우 목록만 표시
- 완료 상태 확인만 필요
- 검색/필터링 불필요

**구조**:
```
Devtool
├── AutoTracer (이벤트 발생)
└── Devtool (이벤트 수집 및 UI 표시)
```

### 시나리오 2: 복잡한 경우 (FlowReconstructor 유지)

**조건**:
- 플로우 검색/필터링 필요
- 플로우 통계 필요
- 플로우 분석 기능 필요
- 다른 곳에서도 플로우 재구성 로직 재사용

**구조**:
```
Devtool
├── AutoTracer (이벤트 발생)
├── FlowReconstructor (플로우 재구성 및 분석)
└── DevtoolUI (UI 표시)
```

---

## 권장안: 단계적 접근

### Phase 1: FlowReconstructor 없이 시작

```typescript
// Devtool에서 직접 이벤트 수집
class Devtool {
  private traces: Map<string, Trace> = new Map();
  
  private setupTraceListeners(): void {
    this.editor.on('editor:trace.start', (data) => {
      this._handleTraceStart(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
    
    this.editor.on('editor:trace.end', (data) => {
      this._handleTraceEnd(data);
      this.ui.updateExecutionFlow(this._getCompletedFlows(10));
    });
  }
  
  private _getCompletedFlows(limit: number): ExecutionFlow[] {
    return Array.from(this.traces.values())
      .filter(flow => this._isCompleted(flow))
      .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
      .slice(0, limit);
  }
}
```

### Phase 2: 필요시 FlowReconstructor 추가

검색, 필터링, 통계 등이 필요해지면 그때 `FlowReconstructor`를 추가:

```typescript
// 복잡한 기능이 필요할 때만 추가
class FlowReconstructor {
  searchFlows(query: string): ExecutionFlow[] { }
  filterFlows(package?: string): ExecutionFlow[] { }
  getFlowStatistics(): FlowStatistics { }
  exportFlows(format: 'json' | 'csv'): string { }
}
```

---

## 최종 권장안

**초기 구현**: FlowReconstructor 없이 시작

**이유**:
1. `AutoTracer`가 이미 완전한 정보 제공
2. 단순한 수집 로직은 Devtool에 포함 가능
3. 필요시 리팩토링으로 분리 가능

**구조**:
```
Devtool
├── AutoTracer (이벤트 발생)
└── Devtool
    ├── traces: Map<string, Trace> (이벤트 수집)
    ├── _handleTraceStart/End (플로우 재구성)
    └── DevtoolUI (UI 표시)
```

**나중에 필요하면**:
- 검색/필터링 기능 추가 시 `FlowReconstructor`로 리팩토링
- 통계/분석 기능 추가 시 `FlowReconstructor`로 리팩토링

---

## 정리

**FlowReconstructor는 선택적**:
- ✅ 단순한 경우: Devtool에서 직접 처리
- ✅ 복잡한 경우: FlowReconstructor로 분리

**초기 구현**: FlowReconstructor 없이 시작하고, 필요시 추가

