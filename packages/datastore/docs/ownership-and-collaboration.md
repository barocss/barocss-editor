# 소유권, 부분 소유권, AI와 동시편집의 관계

## 1. 서론

### 문제 정의

동시 편집 환경에서 여러 사용자와 AI 에이전트가 동시에 문서를 편집할 때, 다음 질문들이 발생합니다:

1. **소유권**: 노드를 "누가 만들었는지"를 추적해야 하는가?
2. **부분 소유권**: 텍스트 노드의 일부만 수정된 경우 소유권은 어떻게 되는가?
3. **AI의 역할**: AI가 생성한 노드와 사용자가 생성한 노드를 구분해야 하는가?
4. **동시편집 충돌**: 여러 agent/사용자가 같은 노드를 수정할 때 어떻게 처리하는가?

### 핵심 원칙

**"소유권"은 노드의 속성이 아니라 Operation의 속성이다.**

노드는 여러 번 수정될 수 있고, 각 수정마다 다른 agent/사용자가 작업할 수 있습니다. 따라서 "노드의 소유자"라는 개념 자체가 의미가 없습니다.

---

## 2. 소유권 개념의 한계

### 2.1 노드는 여러 번 수정될 수 있음

**시나리오:**

```
1. 사용자 A가 노드 생성
   - node.sid = '0:1'
   - node.text = 'Hello'

2. 사용자 B가 노드 수정
   - node.sid = '0:1' (같은 노드)
   - node.text = 'Hello World'

3. AI 에이전트가 노드 수정
   - node.sid = '0:1' (같은 노드)
   - node.text = 'Hello AI World'

4. 사용자 A가 다시 수정
   - node.sid = '0:1' (같은 노드)
   - node.text = 'Hello AI World!'
```

**문제:**
- 같은 노드가 여러 번 수정됨
- 각 수정마다 다른 agent/사용자
- "노드의 소유자"를 정의할 수 없음

### 2.2 텍스트 노드의 부분 수정

**시나리오:**

```
초기 상태:
- node.sid = '0:1'
- node.text = 'Hello World'

사용자 A가 일부만 수정:
- node.text = 'Hello AI World'  (중간에 'AI' 삽입)

AI가 일부만 수정:
- node.text = 'Hello AI Beautiful World'  ('AI' 뒤에 'Beautiful' 삽입)

사용자 B가 일부만 수정:
- node.text = 'Hello AI Beautiful World!'  (끝에 '!' 추가)
```

**문제:**
- 텍스트의 일부만 수정됨
- 어떤 부분이 누구의 것인지 추적 불가
- "노드의 소유자" 개념으로는 해결 불가

### 2.3 결론: 노드 레벨 소유권은 불가능

**이유:**
1. 노드는 여러 번 수정될 수 있음
2. 각 수정마다 다른 agent/사용자
3. 텍스트 노드의 일부만 수정될 수도 있음
4. "노드의 소유자"라는 개념 자체가 의미 없음

**해결:**
- 노드 자체에는 소유자 정보 없음
- 소유자 정보는 Operation 레벨에서만 관리

---

## 3. Operation 레벨 소유권

### 3.1 핵심 개념

**"누가 무엇을 했는지"는 Operation 이벤트에서만 추적합니다.**

```typescript
interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: any;
  timestamp: number;
  parentId?: string;
  position?: number;
  
  // 소유자 정보 (Operation 레벨)
  owner?: {
    type: 'user' | 'agent';
    id: string;
    sessionId: string;
  };
}
```

### 3.2 DataStore에서 Operation 생성

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
   * Operation 생성 시 소유자 정보 자동 포함
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
    
    // overlay에 기록
    if (this._overlay && this._overlay.isActive()) {
      (this._overlay as any).recordOperation(operationWithOwner);
    }
    
    // 이벤트 발생
    this._eventEmitter.emit('operation', operationWithOwner);
  }
}
```

### 3.3 이력 추적

```typescript
/**
 * Operation 이벤트 리스너로 이력 추적
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
   * Operation 이벤트 수신
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
   * 특정 노드의 변경 이력 조회
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
   * 노드의 생성자 조회
   */
  getCreator(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    const createOp = history.find(h => h.operation === 'create');
    return createOp?.owner;
  }
  
  /**
   * 노드의 마지막 수정자 조회
   */
  getLastEditor(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    if (history.length === 0) return undefined;
    return history[history.length - 1].owner;
  }
}
```

---

## 4. 부분 소유권 (Partial Ownership)

### 4.1 문제 정의

텍스트 노드의 일부만 수정되는 경우, "어떤 부분이 누구의 것인지"를 추적해야 할까요?

**예시:**
```
초기: 'Hello World'
사용자 A: 'Hello AI World' (중간에 'AI' 삽입)
AI: 'Hello AI Beautiful World' ('AI' 뒤에 'Beautiful' 삽입)
사용자 B: 'Hello AI Beautiful World!' (끝에 '!' 추가)
```

### 4.2 해결 방안: 부분 소유권은 추적하지 않음

**이유:**
1. **복잡도**: 텍스트의 각 문자마다 소유자를 추적하는 것은 비현실적
2. **의미 없음**: 최종 결과물만 중요하며, 중간 과정의 소유권은 중요하지 않음
3. **성능**: 부분 소유권 추적은 성능 오버헤드가 큼

**대안:**
- Operation 레벨에서만 추적
- "누가 무엇을 했는지"만 기록
- 텍스트의 특정 부분의 소유권은 추적하지 않음

### 4.3 Operation 레벨 추적으로 충분

```typescript
// Operation 이력으로 추적
const history = operationHistory.getByNodeId('0:1');
// [
//   { operation: 'create', owner: { type: 'user', id: 'alice' }, timestamp: 1000 },
//   { operation: 'update', owner: { type: 'user', id: 'alice' }, timestamp: 2000, data: { text: 'Hello AI World' } },
//   { operation: 'update', owner: { type: 'agent', id: 'ai-writer' }, timestamp: 3000, data: { text: 'Hello AI Beautiful World' } },
//   { operation: 'update', owner: { type: 'user', id: 'bob' }, timestamp: 4000, data: { text: 'Hello AI Beautiful World!' } }
// ]

// "누가 무엇을 했는지"는 추적 가능
// 하지만 "어떤 부분이 누구의 것인지"는 추적하지 않음
```

---

## 5. AI와 동시편집의 관계

### 5.1 AI는 편집 주체

**핵심 원칙:**
- AI는 편집의 주체일 뿐
- AI가 만든 노드와 사용자가 만든 노드를 구분할 필요 없음
- 노드 자체에는 AI/사용자 구분 없음

### 5.2 AI 작업 흐름

```typescript
// AI가 노드를 생성하는 과정

// 1. AI DataStore 생성
const aiStore = new DataStore(
  undefined, schema, 1,
  { type: 'agent', id: 'ai-writer' }
);

// 2. 노드 생성
const node = aiStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'AI generated text' }]
});

// node.sid = '1:1' (일반 노드와 동일, AI 표시 없음)

// 3. Operation 이벤트
// {
//   type: 'create',
//   nodeId: '1:1',
//   owner: { type: 'agent', id: 'ai-writer', sessionId: '1' }
// }
```

### 5.3 AI와 사용자의 동시 작업

**시나리오:**

```typescript
// 사용자 A가 노드 생성
const userStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node = userStore.createNodeWithChildren({ stype: 'paragraph', content: [...] });
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// 동시에 AI가 다른 노드 생성
const aiStore = new DataStore(undefined, schema, 1, { type: 'agent', id: 'ai-writer' });
const aiNode = aiStore.createNodeWithChildren({ stype: 'paragraph', content: [...] });
// aiNode.sid = '1:2'
// Operation: { type: 'create', nodeId: '1:2', owner: { type: 'agent', id: 'ai-writer' } }

// 노드 자체는 구분 불가 (둘 다 일반 노드)
// 하지만 Operation 이력으로는 구분 가능
```

### 5.4 AI 작업의 우선순위

**원칙:**
- AI 결과물은 낮은 우선순위
- 사용자 작업이 항상 우선
- 충돌 시 사용자 작업이 AI 작업을 덮어씀

**구현:**

```typescript
/**
 * 충돌 해결 (Operation 이력 기반)
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
  
  // 사용자 > AI 우선순위
  if (lastEditor1?.type === 'user' && lastEditor2?.type === 'agent') {
    return node1;
  }
  if (lastEditor1?.type === 'agent' && lastEditor2?.type === 'user') {
    return node2;
  }
  
  // 같은 타입이면 최신 것 우선
  const timestamp1 = history1[history1.length - 1]?.timestamp || 0;
  const timestamp2 = history2[history2.length - 1]?.timestamp || 0;
  return timestamp1 > timestamp2 ? node1 : node2;
}
```

---

## 6. Decorator와의 관계

### 6.1 Decorator는 별도 채널

**핵심 원칙:**
- Decorator는 Selection과 동일한 패턴으로 별도 채널로 관리
- DocumentModel (OT/CRDT)과 EditorModel (Presence/Session) 분리

### 6.2 채널 구조

```
DocumentModel (OT/CRDT 채널)
  ↓
  텍스트, 구조, Marks 변경
  (무거운 데이터, 충돌 해결 필요)
  Operation 레벨에서 소유자 정보 포함

EditorModel (Presence/Session 채널)
  ├─ Selection 변경
  │   (경량 데이터, 실시간 동기화)
  └─ Decorator 변경
      (경량 데이터, 실시간 동기화)
      소유자 정보 포함 (owner 필드)
```

### 6.3 Decorator의 소유자 정보

**Decorator는 EditorModel 레벨이므로 소유자 정보를 포함합니다:**

```typescript
interface Decorator {
  sid: string;
  stype: string;
  category: 'layer' | 'inline' | 'block';
  target: DecoratorTarget;
  data?: Record<string, any>;
  
  // 소유자 정보 (EditorModel 레벨이므로 포함)
  owner?: {
    userId: string;
    agentId?: string;
    sessionId: string;
  };
  source?: 'local' | 'remote';
}
```

**이유:**
- Decorator는 임시 UI 상태 (EditorModel)
- 노드와 달리 여러 번 수정되지 않음
- 생성 → 업데이트 → 제거의 단순한 생명주기
- 소유자 정보가 의미 있음

### 6.4 Decorator와 노드의 차이

| 항목 | 노드 (DocumentModel) | Decorator (EditorModel) |
|------|---------------------|------------------------|
| 소유자 정보 | 없음 (Operation 레벨) | 있음 (owner 필드) |
| 수정 빈도 | 여러 번 수정 가능 | 단순 생명주기 |
| 저장 | 영구 저장 | 임시 상태 |
| 채널 | OT/CRDT | Presence/Session |

---

## 7. 실무 시나리오

### 7.1 시나리오 1: 사용자와 AI가 동시에 작업

```typescript
// 사용자 A가 노드 생성
const userStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node1 = userStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'User created' }]
});
// node1.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// AI가 다른 노드 생성
const aiStore = new DataStore(undefined, schema, 1, { type: 'agent', id: 'ai-writer' });
const node2 = aiStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'AI created' }]
});
// node2.sid = '1:2'
// Operation: { type: 'create', nodeId: '1:2', owner: { type: 'agent', id: 'ai-writer' } }

// 노드 자체는 구분 불가 (둘 다 일반 노드)
// 하지만 Operation 이력으로는 구분 가능
const creator1 = operationHistory.getCreator('0:1');  // { type: 'user', id: 'alice' }
const creator2 = operationHistory.getCreator('1:2');  // { type: 'agent', id: 'ai-writer' }
```

### 7.2 시나리오 2: 여러 사용자가 같은 노드 수정

```typescript
// 사용자 A가 노드 생성
const userAStore = new DataStore(undefined, schema, 0, { type: 'user', id: 'alice' });
const node = userAStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'Hello' }]
});
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// 사용자 B가 노드 수정
const userBStore = new DataStore(undefined, schema, 1, { type: 'user', id: 'bob' });
userBStore.updateNode('0:1', { text: 'Hello World' });
// node.sid = '0:1' (여전히 같음)
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'bob' } }

// AI가 노드 수정
const aiStore = new DataStore(undefined, schema, 2, { type: 'agent', id: 'ai-writer' });
aiStore.updateNode('0:1', { text: 'Hello AI World' });
// node.sid = '0:1' (여전히 같음)
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'agent', id: 'ai-writer' } }

// 이력 조회
const history = operationHistory.getByNodeId('0:1');
// [
//   { operation: 'create', owner: { type: 'user', id: 'alice' }, timestamp: 1000 },
//   { operation: 'update', owner: { type: 'user', id: 'bob' }, timestamp: 2000 },
//   { operation: 'update', owner: { type: 'agent', id: 'ai-writer' }, timestamp: 3000 }
// ]

// 노드 자체에는 소유자 정보 없음
// 하지만 Operation 이력으로는 모든 변경 추적 가능
```

### 7.3 시나리오 3: 텍스트 일부만 수정

```typescript
// 초기 상태
const node = userStore.createNodeWithChildren({
  stype: 'paragraph',
  content: [{ stype: 'inline-text', text: 'Hello World' }]
});
// node.sid = '0:1'
// Operation: { type: 'create', nodeId: '0:1', owner: { type: 'user', id: 'alice' } }

// 사용자 A가 중간에 삽입
userStore.updateNode('0:1', { text: 'Hello AI World' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'alice' }, data: { text: 'Hello AI World' } }

// AI가 중간에 삽입
aiStore.updateNode('0:1', { text: 'Hello AI Beautiful World' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'agent', id: 'ai-writer' }, data: { text: 'Hello AI Beautiful World' } }

// 사용자 B가 끝에 추가
userBStore.updateNode('0:1', { text: 'Hello AI Beautiful World!' });
// Operation: { type: 'update', nodeId: '0:1', owner: { type: 'user', id: 'bob' }, data: { text: 'Hello AI Beautiful World!' } }

// 부분 소유권은 추적하지 않음
// "누가 무엇을 했는지"만 Operation 이력으로 추적
```

### 7.4 시나리오 4: AI가 Decorator 사용

```typescript
// AI가 작업 시작 - Decorator 추가
const decoratorId = editorView.addDecorator({
  sid: 'ai-work-1',
  stype: 'comment',
  category: 'block',
  target: { sid: 'paragraph-1' },
  position: 'after',
  data: { text: 'AI가 작업 중...' }
});

// Decorator는 EditorModel 레벨이므로 소유자 정보 포함 가능
// (하지만 현재는 별도 RemoteDecoratorManager에서 관리)

// AI 작업 완료 - 모델 업데이트
aiStore.updateNode('paragraph-1', { 
  content: [...existingContent, newParagraph] 
});
// Operation: { type: 'update', nodeId: 'paragraph-1', owner: { type: 'agent', id: 'ai-writer' } }

// Decorator 제거
editorView.removeDecorator(decoratorId);
```

---

## 8. 동시편집 환경에서의 통합

### 8.1 Operation 브로드캐스트

```typescript
/**
 * 동시 편집 브로드캐스트 메시지
 */
type CollaborationMessage = 
  // DocumentModel 변경 (OT/CRDT)
  | {
      type: 'operation';
      operation: AtomicOperation;  // owner 정보 포함
      version: number;
    }
  // EditorModel 변경 (Presence/Session)
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

### 8.2 충돌 해결 전략

```typescript
/**
 * Operation 기반 충돌 해결
 */
class ConflictResolver {
  /**
   * 두 Operation의 충돌 해결
   */
  resolveOperations(
    op1: AtomicOperation,
    op2: AtomicOperation,
    operationHistory: OperationHistory
  ): AtomicOperation {
    // 사용자 > AI 우선순위
    if (op1.owner?.type === 'user' && op2.owner?.type === 'agent') {
      return op1;
    }
    if (op1.owner?.type === 'agent' && op2.owner?.type === 'user') {
      return op2;
    }
    
    // 같은 타입이면 최신 것 우선
    return op1.timestamp > op2.timestamp ? op1 : op2;
  }
  
  /**
   * 노드 충돌 해결 (Operation 이력 기반)
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
    
    // 사용자 > AI 우선순위
    if (lastEditor1?.type === 'user' && lastEditor2?.type === 'agent') {
      return node1;
    }
    if (lastEditor1?.type === 'agent' && lastEditor2?.type === 'user') {
      return node2;
    }
    
    // 같은 타입이면 최신 것 우선
    const timestamp1 = history1[history1.length - 1]?.timestamp || 0;
    const timestamp2 = history2[history2.length - 1]?.timestamp || 0;
    return timestamp1 > timestamp2 ? node1 : node2;
  }
}
```

---

## 9. 구현 가이드

### 9.1 DataStore 수정

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
   * 노드 ID 생성 (기존 형식 유지)
   */
  generateId(): string {
    DataStore._globalCounter++;
    return `${this._sessionId}:${DataStore._globalCounter}`;
  }
  
  /**
   * Operation 생성 시 소유자 정보 자동 포함
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

### 9.2 AtomicOperation 타입 확장

```typescript
export interface AtomicOperation {
  type: 'create' | 'update' | 'delete' | 'move';
  nodeId: string;
  data?: any;
  timestamp: number;
  parentId?: string;
  position?: number;
  
  // 소유자 정보 (선택적)
  owner?: {
    type: 'user' | 'agent';
    id: string;
    sessionId: string;
  };
}
```

### 9.3 OperationHistory 구현

```typescript
/**
 * Operation 이력 관리
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
   * Operation 이벤트 수신
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
   * 특정 노드의 변경 이력 조회
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
   * 노드의 생성자 조회
   */
  getCreator(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    const createOp = history.find(h => h.operation === 'create');
    return createOp?.owner;
  }
  
  /**
   * 노드의 마지막 수정자 조회
   */
  getLastEditor(nodeId: string): { type: 'user' | 'agent'; id: string } | undefined {
    const history = this.getByNodeId(nodeId);
    if (history.length === 0) return undefined;
    return history[history.length - 1].owner;
  }
  
  /**
   * 특정 사용자가 생성한 노드 조회
   */
  getNodesByCreator(ownerId: string): string[] {
    return this.history
      .filter(h => h.operation === 'create' && h.owner?.id === ownerId)
      .map(h => h.nodeId);
  }
  
  /**
   * 특정 사용자가 수정한 노드 조회
   */
  getNodesByEditor(ownerId: string): string[] {
    return this.history
      .filter(h => h.owner?.id === ownerId)
      .map(h => h.nodeId);
  }
}
```

---

## 10. 요약 및 결론

### 10.1 핵심 원칙

1. **노드 레벨 소유권은 사용하지 않음**
   - 노드는 여러 번 수정될 수 있음
   - 각 수정마다 다른 agent/사용자
   - "노드의 소유자" 개념 자체가 의미 없음

2. **소유자 정보는 Operation 레벨에서만 관리**
   - Operation 이벤트에 소유자 정보 포함
   - Operation 이력으로 모든 변경 추적

3. **부분 소유권은 추적하지 않음**
   - 텍스트의 일부만 수정되는 경우도 Operation 레벨에서만 추적
   - 텍스트의 특정 부분의 소유권은 추적하지 않음

4. **AI는 편집 주체일 뿐**
   - AI가 만든 노드와 사용자가 만든 노드를 구분할 필요 없음
   - 노드 자체에는 AI/사용자 구분 없음
   - Operation 이력으로만 구분 가능

5. **Decorator는 별도 채널**
   - EditorModel 레벨이므로 소유자 정보 포함 가능
   - Selection과 동일한 패턴으로 별도 채널 관리

### 10.2 구조

```
DocumentModel (OT/CRDT 채널)
  ├─ 노드 (INode)
  │   └─ sid: '0:1' (소유자 정보 없음)
  │
  └─ Operation 이벤트
      └─ owner: { type: 'user' | 'agent', id: string }
          (소유자 정보는 여기에만)

EditorModel (Presence/Session 채널)
  ├─ Selection
  │   └─ 별도 채널로 관리
  │
  └─ Decorator
      └─ owner: { userId, agentId?, sessionId }
          (소유자 정보 포함)
```

### 10.3 구현 체크리스트

- [ ] DataStore 생성자에 `owner` 옵션 추가
- [ ] `emitOperation()`에서 소유자 정보 자동 포함
- [ ] `AtomicOperation` 타입에 `owner` 필드 추가
- [ ] OperationHistory 클래스 구현
- [ ] Operation 이벤트 리스너로 이력 추적
- [ ] 충돌 해결 로직 구현 (사용자 > AI 우선순위)

### 10.4 최종 결론

**"소유권"은 노드의 속성이 아니라 Operation의 속성입니다.**

- 노드는 순수하게 "무엇"만 담음
- "누가 무엇을 했는지"는 Operation 이력에서만 추적
- 부분 소유권은 추적하지 않음
- AI와 사용자의 구분은 Operation 레벨에서만
- Decorator는 별도 채널로 관리하며 소유자 정보 포함

이렇게 하면:
- ✅ 모델 순수성 유지
- ✅ 완전한 이력 추적 가능
- ✅ 동시편집 환경에서 충돌 해결 가능
- ✅ AI와 사용자의 자연스러운 협업
- ✅ 개념적 정확성

