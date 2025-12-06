# 실행 플로우 모니터링 패턴

## 핵심 원칙

**이미 있는 이벤트를 최대한 활용하고, Devtool이 자동으로 플로우를 재구성**

- ✅ 최소한의 추가 이벤트만 추가
- ✅ Devtool이 timestamp와 패턴 매칭으로 이벤트 연결
- ✅ 코드 변경 최소화

---

## 현재 이벤트 구조

### 이미 존재하는 이벤트

1. **Command 이벤트**
   - `editor:command.before` - Command 실행 전
   - `editor:command.execute` - Command 실행
   - `editor:command.after` - Command 실행 후

2. **Content 이벤트**
   - `editor:content.change` - Content 변경 (transaction 정보 포함)

3. **History 이벤트**
   - `editor:history.change` - History 변경
   - `editor:history.undo` - Undo
   - `editor:history.redo` - Redo

4. **Selection 이벤트**
   - `editor:selection.change` - Selection 변경

---

## 추가 필요한 이벤트

### 1. 브라우저 이벤트 레벨

**목적**: 브라우저 이벤트 발생 추적

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// beforeinput 이벤트
editor.emit('editor:input.beforeinput', {
  inputType: event.inputType,
  data: event.data,
  dataTransfer: event.dataTransfer,
  isComposing: event.isComposing,
  target: event.target,
  timestamp: Date.now()
});

// keydown 이벤트
editor.emit('editor:input.keydown', {
  key: event.key,
  code: event.code,
  ctrlKey: event.ctrlKey,
  shiftKey: event.shiftKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
  timestamp: Date.now()
});

// MutationObserver 감지
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

### 2. 함수 실행 레벨

**목적**: 주요 함수 실행 추적

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// 함수 시작
editor.emit('editor:function.start', {
  functionName: 'handleDelete',
  className: 'InputHandlerImpl',
  input: { event, modelSelection },
  correlationId: this._generateCorrelationId(),
  timestamp: Date.now()
});

// 함수 종료
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

### 3. Transaction 레벨

**목적**: Transaction 실행 추적

```typescript
// packages/model/src/transaction.ts

// Transaction 시작
editor.emit('editor:transaction.start', {
  transactionId: transaction.sid,
  operations: operations.map(op => ({
    type: op.type,
    payload: op.payload
  })),
  correlationId: this._generateCorrelationId(),
  timestamp: Date.now()
});

// Transaction 종료
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

### 4. Operation 레벨

**목적**: 개별 Operation 실행 추적

```typescript
// packages/model/src/transaction.ts

// Operation 시작
editor.emit('editor:operation.start', {
  operationId: this._generateOperationId(),
  transactionId: transaction.sid,
  operationType: operation.type,
  payload: operation.payload,
  correlationId: correlationId,
  timestamp: Date.now()
});

// Operation 종료
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

## 이벤트 연결 전략

### CorrelationId 기반 연결

각 실행 단위에 `correlationId`를 부여하여 이벤트를 연결:

```typescript
// 예시: handleDelete 실행 플로우

// 1. 브라우저 이벤트
editor:input.keydown { correlationId: 'evt-1' }

// 2. 함수 시작
editor:function.start { 
  functionName: 'handleDelete',
  correlationId: 'evt-1',  // 부모 이벤트 ID
  childCorrelationId: 'func-1'  // 자식 이벤트 ID
}

// 3. Command 실행
editor:command.execute {
  command: 'deleteText',
  correlationId: 'func-1',  // 부모 함수 ID
  childCorrelationId: 'cmd-1'  // 자식 이벤트 ID
}

// 4. Transaction 시작
editor:transaction.start {
  transactionId: 'txn-123',
  correlationId: 'cmd-1',  // 부모 Command ID
  childCorrelationId: 'txn-1'  // 자식 이벤트 ID
}

// 5. Operation 실행
editor:operation.start {
  operationType: 'deleteTextRange',
  correlationId: 'txn-1',  // 부모 Transaction ID
  childCorrelationId: 'op-1'  // 자식 이벤트 ID
}

// 6. Operation 종료
editor:operation.end {
  operationId: 'op-1',
  correlationId: 'op-1'  // 같은 Operation ID
}

// 7. Transaction 종료
editor:transaction.end {
  transactionId: 'txn-123',
  correlationId: 'txn-1'  // 같은 Transaction ID
}

// 8. Command 종료
editor:command.after {
  command: 'deleteText',
  correlationId: 'cmd-1'  // 같은 Command ID
}

// 9. 함수 종료
editor:function.end {
  functionName: 'handleDelete',
  correlationId: 'func-1'  // 같은 함수 ID
}
```

---

## Devtool에서 플로우 재구성

### 이벤트 수집 및 그룹화

```typescript
// packages/devtool/src/flow-monitor.ts

export class FlowMonitor {
  private events: Map<string, FlowEvent> = new Map();
  private flows: Map<string, ExecutionFlow> = new Map();

  constructor(private editor: Editor) {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 모든 관련 이벤트 수신
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
    // correlationId를 따라가며 플로우 재구성
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
    
    // 이벤트 타입에 따라 분류
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

## 이벤트 데이터 구조

### FlowEvent

```typescript
interface FlowEvent {
  id: string;                    // 고유 ID
  type: string;                  // 이벤트 타입
  data: any;                      // 이벤트 데이터
  timestamp: number;             // 발생 시간
  correlationId?: string;        // 현재 실행 단위 ID
  parentCorrelationId?: string;  // 부모 실행 단위 ID
}
```

### ExecutionFlow

```typescript
interface ExecutionFlow {
  id: string;                    // 플로우 ID (root correlationId)
  events: FlowEvent[];           // 브라우저 이벤트들
  functions: FlowEvent[];        // 함수 실행 이벤트들
  commands: FlowEvent[];         // Command 실행 이벤트들
  transactions: FlowEvent[];      // Transaction 이벤트들
  operations: FlowEvent[];       // Operation 이벤트들
  nodeRanges?: NodeRangeInfo[];  // 관련 노드 범위 정보
}
```

---

## 이벤트 emit 전략

### 1. 브라우저 이벤트 레벨

**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

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
  
  // ... 처리 로직 ...
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
  
  // ... 처리 로직 ...
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
  
  // ... 처리 로직 ...
}
```

---

### 2. 함수 실행 레벨

**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
private async handleDelete(event: InputEvent, correlationId: string): Promise<void> {
  const functionCorrelationId = this._generateCorrelationId();
  const startTime = Date.now();
  
  this.editor.emit('editor:function.start', {
    functionName: 'handleDelete',
    className: 'InputHandlerImpl',
    input: { event, modelSelection: this._getCurrentSelection() },
    correlationId: correlationId,  // 부모 이벤트 ID
    childCorrelationId: functionCorrelationId,
    timestamp: startTime
  });
  
  try {
    // ... 처리 로직 ...
    
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

### 3. Command 레벨

**위치**: `packages/editor-core/src/editor.ts`

```typescript
async executeCommand(command: string, payload?: any): Promise<boolean> {
  const commandCorrelationId = this._generateCorrelationId();
  const startTime = Date.now();
  
  // Command 실행 전
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

    // Command 실행
    this.emit('editor:command.execute', {
      command,
      payload,
      success: result,
      correlationId: commandCorrelationId,
      childCorrelationId: this._generateCorrelationId(),  // Transaction용
      duration: Date.now() - startTime,
      timestamp: Date.now()
    });

    // Command 실행 후
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

### 4. Transaction 레벨

**위치**: `packages/model/src/transaction.ts`

```typescript
async execute(operations: (TransactionOperation | OpFunction)[], correlationId?: string): Promise<TransactionResult> {
  const transactionId = this._beginTransaction('DSL Transaction').sid;
  const transactionCorrelationId = correlationId || this._generateCorrelationId();
  const startTime = Date.now();
  
  // Transaction 시작
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
    // ... Transaction 실행 로직 ...
    
    // 각 Operation 실행 시
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
      
      // ... Operation 실행 ...
      
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
    
    // Transaction 종료
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

## Devtool UI 통합

### 1. "Execution Flow" 탭 추가

```typescript
// packages/devtool/src/ui.ts

// 탭 추가
<div class="devtool-tabs">
  <button class="devtool-tab" data-tab="tree">Model Tree</button>
  <button class="devtool-tab" data-tab="events">Events</button>
  <button class="devtool-tab" data-tab="flow">Execution Flow</button>  // 새 탭
</div>

// 패널 추가
<div class="devtool-panel" id="panel-flow">
  <div class="flow-list" id="flow-list"></div>
  <div class="flow-detail" id="flow-detail"></div>
</div>
```

### 2. 플로우 목록 표시

```typescript
// 최근 실행 플로우 목록
interface FlowListItem {
  id: string;
  eventType: string;        // 'beforeinput', 'keydown', 'mutation' 등
  command?: string;          // 실행된 Command
  success: boolean;          // 성공 여부
  duration: number;          // 전체 실행 시간
  timestamp: number;         // 발생 시간
}
```

### 3. 플로우 상세 정보

```typescript
// 플로우 트리 시각화
interface FlowDetail {
  event: FlowEvent;          // 브라우저 이벤트
  functions: FlowEvent[];    // 함수 실행들
  commands: FlowEvent[];      // Command 실행들
  transactions: FlowEvent[];  // Transaction 실행들
  operations: FlowEvent[];    // Operation 실행들
  nodeRanges?: NodeRangeInfo[];  // 관련 노드 범위
}
```

---

## 구현 단계

### Phase 1: 이벤트 추가 (최소한)

1. **브라우저 이벤트 이벤트 추가**
   - `editor:input.beforeinput`
   - `editor:input.keydown`
   - `editor:input.mutation`

2. **함수 실행 이벤트 추가**
   - `editor:function.start`
   - `editor:function.end`

3. **Transaction/Operation 이벤트 추가**
   - `editor:transaction.start`
   - `editor:transaction.end`
   - `editor:operation.start`
   - `editor:operation.end`

### Phase 2: Devtool 모니터링

1. **FlowMonitor 클래스 구현**
   - 이벤트 수집
   - correlationId 기반 플로우 재구성
   - 플로우 저장 및 조회

2. **Devtool UI 통합**
   - "Execution Flow" 탭 추가
   - 플로우 목록 표시
   - 플로우 상세 정보 표시

### Phase 3: 고급 기능

1. **노드 범위 하이라이트**
2. **플로우 필터링**
3. **플로우 검색**

---

## 장점

1. ✅ **구현 단순**: 각 레이어는 이벤트만 emit
2. ✅ **유연성**: Devtool이 이벤트를 자유롭게 재구성
3. ✅ **확장성**: 새로운 이벤트 추가가 쉬움
4. ✅ **성능**: 이벤트 기반이므로 오버헤드 최소화

---

## 정리

**핵심**: 각 레이어에서 이벤트를 emit하고, Devtool이 이벤트를 모니터링하여 플로우를 재구성

**이벤트 연결**: `correlationId`와 `parentCorrelationId`로 이벤트 간 관계 추적

**구현 순서**: 
1. 이벤트 추가 (각 레이어)
2. Devtool 모니터링 (이벤트 수집 및 재구성)
3. UI 통합 (플로우 시각화)

