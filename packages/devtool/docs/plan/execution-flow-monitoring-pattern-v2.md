# 실행 플로우 모니터링 패턴 (개선안)

## 핵심 원칙

**이미 있는 이벤트를 최대한 활용하고, Devtool이 자동으로 플로우를 재구성**

- ✅ 최소한의 추가 이벤트만 추가
- ✅ Devtool이 timestamp와 패턴 매칭으로 이벤트 연결
- ✅ 코드 변경 최소화

---

## 문제점: correlationId를 모든 곳에 넣는 것

### 현재 제안된 방식의 문제

```typescript
// 모든 함수에 correlationId 추가 필요
private async handleDelete(event: InputEvent, correlationId: string): Promise<void> {
  const functionCorrelationId = this._generateCorrelationId();
  // ...
  await this.editor.executeCommand('deleteText', { range }, functionCorrelationId);
  // ...
}
```

**문제점**:
- ❌ 모든 함수 시그니처 변경 필요
- ❌ 코드가 복잡해짐
- ❌ 유지보수 어려움

---

## 개선된 접근 방법

### 옵션 1: 이벤트 패턴 매칭 (권장)

**핵심**: 이미 있는 이벤트들을 timestamp와 패턴으로 자동 연결

#### 이미 있는 이벤트들

1. **Command 이벤트**
   - `editor:command.execute` - Command 실행 (이미 있음)
   - `editor:command.before` - Command 실행 전 (이미 있음)
   - `editor:command.after` - Command 실행 후 (이미 있음)

2. **Content 이벤트**
   - `editor:content.change` - Content 변경 (transaction 정보 포함, 이미 있음)

3. **History 이벤트**
   - `editor:history.change` - History 변경 (이미 있음)

4. **Selection 이벤트**
   - `editor:selection.change` - Selection 변경 (이미 있음)

#### Devtool이 자동으로 플로우 재구성

```typescript
// packages/devtool/src/flow-reconstructor.ts

class FlowReconstructor {
  private events: FlowEvent[] = [];
  private timeWindow: number = 1000; // 1초 내 이벤트들을 하나의 플로우로 간주

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
    // 1. 시간 윈도우 내의 이벤트들 찾기
    const recentEvents = this.events.filter(e => 
      Math.abs(e.timestamp - newEvent.timestamp) < this.timeWindow
    );

    // 2. 패턴 매칭으로 플로우 재구성
    const flow = this._matchPattern(recentEvents);
    
    // 3. 플로우 저장
    if (flow) {
      this._saveFlow(flow);
    }
  }

  private _matchPattern(events: FlowEvent[]): ExecutionFlow | null {
    // 패턴 1: Command → Transaction → Operation
    // editor:command.execute → editor:content.change (transaction 정보 포함)
    const commandEvent = events.find(e => e.type === 'editor:command.execute');
    const contentEvent = events.find(e => 
      e.type === 'editor:content.change' && 
      e.data?.transaction
    );
    
    if (commandEvent && contentEvent) {
      // 시간 순서 확인
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

    // 패턴 2: Selection 변경 → Content 변경
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

**장점**:
- ✅ 코드 변경 최소화 (이미 있는 이벤트 활용)
- ✅ 자동으로 플로우 재구성
- ✅ correlationId 불필요

**단점**:
- ⚠️ 시간 윈도우 기반이라 정확도가 떨어질 수 있음
- ⚠️ 복잡한 패턴 매칭 로직 필요

---

### 옵션 2: 선택적 함수 추적 (하이브리드)

**핵심**: 핵심 함수만 선택적으로 이벤트 추가

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// 핵심 함수만 간단하게 이벤트 추가
private async handleDelete(event: InputEvent): Promise<void> {
  // 선택적: 핵심 함수만 이벤트 추가
  if (this.editor._devtoolEnabled) {
    this.editor.emit('editor:function.start', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
  
  // ... 기존 로직 ...
  
  // Command 실행은 이미 editor:command.execute 이벤트가 있음
  await this.editor.executeCommand('deleteText', { range });
  // → editor:command.execute 이벤트 자동 발생
  
  // Transaction 실행은 editor:content.change에 transaction 정보 포함
  // → editor:content.change 이벤트 자동 발생
  
  if (this.editor._devtoolEnabled) {
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
}
```

**장점**:
- ✅ 핵심 함수만 선택적으로 추적
- ✅ Devtool 활성화 시에만 이벤트 발생 (성능 영향 최소화)
- ✅ correlationId 불필요 (timestamp로 연결)

---

### 옵션 3: Proxy 패턴으로 자동 추적

**핵심**: 함수 호출을 자동으로 가로채서 추적

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

    // 핵심 메서드만 래핑
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
        
        // Promise인 경우
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
        
        // 동기 함수인 경우
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

**사용**:
```typescript
// Devtool 초기화 시
const devtool = new Devtool({ editor });
devtool.enableAutoTracing(); // 자동 추적 활성화
```

**장점**:
- ✅ 코드 변경 없음
- ✅ 자동으로 함수 실행 추적
- ✅ Devtool 활성화 시에만 동작

**단점**:
- ⚠️ 함수 래핑 오버헤드
- ⚠️ 초기 설정 복잡

---

## 최종 권장안: 하이브리드 접근

### Phase 1: 이미 있는 이벤트로 기본 플로우 재구성

**코드 변경 없음**

```typescript
// Devtool이 이미 있는 이벤트로 플로우 재구성
// - editor:command.execute
// - editor:content.change (transaction 정보 포함)
// - editor:history.change
// - editor:selection.change
```

**구현**:
```typescript
// packages/devtool/src/flow-reconstructor.ts

class FlowReconstructor {
  reconstructFlow(events: FlowEvent[]): ExecutionFlow[] {
    // 1. 시간 윈도우로 이벤트 그룹화
    const groups = this._groupByTimeWindow(events, 1000);
    
    // 2. 각 그룹에서 패턴 매칭
    return groups.map(group => {
      // 패턴: Command → Transaction
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

### Phase 2: 선택적 함수 추적 (필요한 경우만)

**핵심 함수만 선택적으로 이벤트 추가**

```typescript
// packages/editor-view-dom/src/event-handlers/input-handler.ts

// Devtool 활성화 여부 확인
private _shouldTrace(): boolean {
  return (this.editor as any)._devtoolEnabled === true;
}

private async handleDelete(event: InputEvent): Promise<void> {
  // 선택적: 핵심 함수만 이벤트 추가
  if (this._shouldTrace()) {
    this.editor.emit('editor:function.start', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
  
  // ... 기존 로직 (변경 없음) ...
  
  if (this._shouldTrace()) {
    this.editor.emit('editor:function.end', {
      functionName: 'handleDelete',
      className: 'InputHandlerImpl',
      timestamp: Date.now()
    });
  }
}
```

**장점**:
- ✅ 최소한의 코드 변경
- ✅ Devtool 활성화 시에만 이벤트 발생
- ✅ correlationId 불필요 (timestamp로 연결)

---

### Phase 3: 고급 기능

1. **노드 범위 하이라이트**
   - 플로우에서 노드 범위 클릭 시 에디터에서 하이라이트

2. **플로우 필터링**
   - 이벤트 타입, Command 타입 등으로 필터링

3. **플로우 검색**
   - 특정 노드 ID, Command 이름 등으로 검색

---

## 비교: correlationId vs 패턴 매칭

### correlationId 방식

**장점**:
- ✅ 정확한 이벤트 연결
- ✅ 복잡한 플로우도 추적 가능

**단점**:
- ❌ 모든 함수에 correlationId 추가 필요
- ❌ 코드가 복잡해짐
- ❌ 유지보수 어려움

### 패턴 매칭 방식 (권장)

**장점**:
- ✅ 코드 변경 최소화
- ✅ 이미 있는 이벤트 활용
- ✅ 자동으로 플로우 재구성

**단점**:
- ⚠️ 시간 윈도우 기반이라 정확도가 떨어질 수 있음
- ⚠️ 복잡한 패턴 매칭 로직 필요

**하지만**:
- 대부분의 경우 timestamp 기반 패턴 매칭으로 충분
- 정확도가 필요한 경우에만 선택적으로 correlationId 추가

---

## 정리

**최종 권장안**:

1. **Phase 1**: 이미 있는 이벤트로 기본 플로우 재구성 (코드 변경 없음)
2. **Phase 2**: 핵심 함수만 선택적으로 이벤트 추가 (최소한의 변경)
3. **Phase 3**: 고급 기능 추가

**correlationId는 선택적**:
- 기본적으로는 timestamp와 패턴 매칭으로 충분
- 정확도가 필요한 특수한 경우에만 correlationId 추가

**구현 순서**:
1. Devtool이 이미 있는 이벤트로 플로우 재구성
2. 필요시 핵심 함수에만 간단한 이벤트 추가
3. 고급 기능 추가
