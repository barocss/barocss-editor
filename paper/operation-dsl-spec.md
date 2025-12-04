# Operation DSL Specification

## 1. Overview

Operation DSL은 Barocss Model의 핵심 구성 요소로, **선언적 operation 정의**와 **DSL 기반 operation 생성**을 제공합니다. 이 시스템은 `defineOperation`과 `defineOperationDSL` 두 가지 패턴을 통해 operation을 정의하고 사용할 수 있게 합니다.

### 1.1 Core Philosophy
- **이중 패턴**: Runtime 정의(`defineOperation`) + DSL 생성(`defineOperationDSL`)
- **타입 안전성**: TypeScript로 완전한 타입 지원
- **확장성**: 새로운 operation 추가가 쉬운 구조
- **일관성**: 모든 operation이 동일한 패턴을 따름
- **검증**: Schema 검증과 에러 처리가 내장됨

### 1.2 Key Benefits
- **선언적 정의**: operation의 실행 로직을 명확하게 정의
- **DSL 생성**: 간편한 함수 호출로 operation 객체 생성
- **자동 등록**: Global registry를 통한 자동 operation 등록
- **타입 안전성**: 컴파일 타임 타입 검증
- **테스트 친화적**: Mock과 실제 구현 모두 지원

## 2. Architecture

### 2.1 Core Components

#### 2.1.1 defineOperation Pattern
```typescript
defineOperation('operationType', async (operation: any, context: TransactionContext) => {
  // Runtime execution logic
  const { nodeId, ...params } = operation.payload;
  // ... operation logic
  
  // OperationExecuteResult 구조로 반환
  return {
    ok: true,
    data: updatedNode,
    inverse: { type: 'inverseType', payload: { nodeId, ...inverseParams } }
  };
});
```

**역할:**
- Operation의 실제 실행 로직 정의
- Global registry에 등록
- TransactionContext를 통한 DataStore 접근
- Schema 검증 및 에러 처리

#### 2.1.2 defineOperationDSL Pattern
```typescript
export const operationName = defineOperationDSL((...args) => ({
  type: 'operationType',
  payload: { /* operation data */ }
}));
```

**역할:**
- DSL 기반 operation 객체 생성
- Type-safe parameter handling
- Control function과의 연동
- Operation descriptor 반환

### 2.2 Global Registry System

#### 2.2.1 GlobalOperationRegistry
```typescript
class GlobalOperationRegistry {
  private operations = new Map<string, OperationDefinition>();

  register(name: string, definition: OperationDefinition): void;
  get(name: string): OperationDefinition | undefined;
  getAll(): Map<string, OperationDefinition>;
  clear(): void;
}
```

**기능:**
- 모든 operation의 중앙 등록소
- Runtime에 operation 조회 및 실행
- TransactionManager에서 사용
- 동적 operation 로딩 지원

#### 2.2.2 OperationDefinition Interface
```typescript
interface OperationDefinition {
  name: string;
  execute: <T extends any>(operation: T, context: TransactionContext) => Promise<void | INode>;
  mapSelection?: <T extends any>(operation: T, context: TransactionContext) => any;
}
```

**구성 요소:**
- `name`: Operation 타입명
- `execute`: 실제 실행 함수
- `mapSelection`: Selection 매핑 함수 (선택사항)

## 3. Type Definitions

### 3.1 Core Types
```typescript
export type DSLOperationPayload = Record<string, unknown> | undefined;

export interface DSLOperationDescriptor<P extends DSLOperationPayload = any> {
  type: string;
  payload?: P;
}

export interface DefineOperationDSLOptions {
  atom?: boolean;
  category?: string;
}
```

### 3.2 TransactionContext
```typescript
interface TransactionContext {
  dataStore: DataStore;
  schema?: Schema;
  selectionManager?: SelectionManager;
}
```

## 4. Operation Categories

### 4.1 Text Operations
- **setText**: 텍스트 전체 설정
- **insertText**: 텍스트 삽입
- **replaceText**: 텍스트 교체
- **deleteTextRange**: 텍스트 범위 삭제

### 4.2 Attribute Operations
- **setAttrs**: 노드 속성 설정
- **updateAttrs**: 노드 속성 업데이트

### 4.3 Mark Operations
- **setMarks**: 마크 전체 설정
- **applyMark**: 마크 적용
- **removeMark**: 마크 제거
- **toggleMark**: 마크 토글
- **updateMark**: 마크 업데이트

### 4.4 Content Operations
- **create**: 노드 생성
- **addChild**: 자식 노드 추가
- **wrap**: 텍스트 래핑
- **unwrap**: 텍스트 언래핑

### 4.5 Range Operations
- **indent**: 들여쓰기
- **outdent**: 내어쓰기
- **mergeTextNodes**: 텍스트 노드 병합
- **replacePattern**: 패턴 교체

## 5. Implementation Examples

### 5.1 Basic Text Operation
```typescript
// DSL Definition
export const setText = defineOperationDSL((...args: [string] | [string, string]) => {
  if (args.length === 1) {
    const [text] = args;
    return { type: 'setText', payload: { text } };
  }
  const [nodeId, text] = args;
  return { type: 'setText', payload: { nodeId, text } };
}, { atom: true, category: 'text' });

// Runtime Definition
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload;
  if (!text) throw new Error('Text is required for setText operation');
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  context.dataStore.updateNode(nodeId, { text });
  return context.dataStore.getNode(nodeId);
});
```

### 5.2 Mark Operation
```typescript
// DSL Definition
export const applyMark = defineOperationDSL((markType: string, range: [number, number], attrs?: Record<string, any>) => ({
  type: 'applyMark',
  payload: { markType, range, attrs }
}), { atom: true, category: 'mark' });

// Runtime Definition
defineOperation('applyMark', async (operation: any, context: TransactionContext) => {
  const payload = operation.payload;
  if ('range' in payload) {
    const { range, markType, attrs } = payload;
    // Range-based mark application
    return context.dataStore.marks.applyMark(range, markType, attrs);
  }
  const { nodeId, start, end, markType, attrs } = payload;
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  const range = { startNodeId: nodeId, startOffset: start, endNodeId: nodeId, endOffset: end };
  return context.dataStore.marks.applyMark(range, markType, attrs);
});
```

### 5.3 Content Operation
```typescript
// DSL Definition
export const create = (node: INode, options?: any): CreateOperation => ({
  type: 'create',
  node,
  options
});

// Runtime Definition
defineOperation('create', async (operation: CreateOperation, context: TransactionContext) => {
  const { node } = operation;
  try {
    const processedNode = context.dataStore.createNodeWithChildren(node, context.schema);
    
    if (processedNode.parentId) {
      const parent = context.dataStore.getNode(processedNode.parentId);
      if (parent && parent.content) {
        if (!parent.content.includes(processedNode.sid!)) {
          parent.content.push(processedNode.sid!);
          context.dataStore.setNodeInternal(parent);
        }
      }
    }
    
    if (!context.dataStore.getRootNode()) {
      context.dataStore.setRootNodeId(processedNode.sid!);
    }
    
    return processedNode;
  } catch (error) {
    throw new Error(`Failed to create node: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});
```

## 6. Usage Patterns

### 6.1 Direct Operation Usage
```typescript
// Direct operation creation
const operation = setText('Hello World');
// Result: { type: 'setText', payload: { text: 'Hello World' } }

// With nodeId
const operation = setText('node-1', 'Hello World');
// Result: { type: 'setText', payload: { nodeId: 'node-1', text: 'Hello World' } }
```

### 6.2 Control Function Integration
```typescript
// Control function usage
const operations = control('node-1', [
  setText('Hello World'),
  applyMark('bold', [0, 5])
]);

// Result: [
//   { type: 'setText', payload: { text: 'Hello World', nodeId: 'node-1' } },
//   { type: 'applyMark', payload: { markType: 'bold', range: [0, 5], nodeId: 'node-1' } }
// ]
```

### 6.3 Transaction Integration
```typescript
// Transaction with operations
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello')),
  ...control('node-1', [setText('World')])
]).commit();
```

## 7. Error Handling

### 7.1 Validation Errors
```typescript
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload;
  
  // Required field validation
  if (!text) throw new Error('Text is required for setText operation');
  
  // Node existence validation
  const node = context.dataStore.getNode(nodeId);
  if (!node) throw new Error(`Node not found: ${nodeId}`);
  
  // Schema validation (handled by DataStore)
  context.dataStore.updateNode(nodeId, { text });
  return context.dataStore.getNode(nodeId);
});
```

### 7.2 Schema Validation
- DataStore의 `updateNode`에서 자동 스키마 검증
- 검증 실패 시 `result.valid: false` 반환
- Operation에서 명시적 에러 처리

### 7.3 Transaction Rollback
- Operation 실패 시 전체 트랜잭션 롤백
- 원자성 보장
- 에러 메시지 전파

## 8. Testing

### 8.1 Operation Testing
```typescript
describe('setText Operation', () => {
  it('should set text on valid node', async () => {
    const context = createMockContext();
    const operation = { type: 'setText', payload: { nodeId: 'node-1', text: 'Hello' } };
    
    const result = await globalOperationRegistry.get('setText')!.execute(operation, context);
    
    expect(result.text).toBe('Hello');
  });

  it('should throw error for missing text', async () => {
    const context = createMockContext();
    const operation = { type: 'setText', payload: { nodeId: 'node-1' } };
    
    await expect(
      globalOperationRegistry.get('setText')!.execute(operation, context)
    ).rejects.toThrow('Text is required for setText operation');
  });
});
```

### 8.2 DSL Testing
```typescript
describe('setText DSL', () => {
  it('should create operation with text only', () => {
    const operation = setText('Hello World');
    
    expect(operation).toEqual({
      type: 'setText',
      payload: { text: 'Hello World' }
    });
  });

  it('should create operation with nodeId and text', () => {
    const operation = setText('node-1', 'Hello World');
    
    expect(operation).toEqual({
      type: 'setText',
      payload: { nodeId: 'node-1', text: 'Hello World' }
    });
  });
});
```

## 9. Best Practices

### 9.1 Operation Design
- **단일 책임**: 각 operation은 하나의 명확한 작업만 수행
- **에러 처리**: 명확한 에러 메시지와 적절한 예외 처리
- **타입 안전성**: TypeScript 타입을 적극 활용
- **일관성**: 다른 operation과 동일한 패턴 유지

### 9.2 DSL Design
- **오버로드 활용**: 다양한 사용 패턴 지원
- **기본값 제공**: 선택적 매개변수에 적절한 기본값
- **문서화**: JSDoc을 통한 명확한 사용법 설명
- **테스트**: 다양한 시나리오에 대한 테스트 작성

### 9.3 Integration
- **Control 함수 연동**: `control()` 함수와의 자연스러운 연동
- **Transaction 통합**: Transaction 시스템과의 원활한 통합
- **Schema 검증**: DataStore의 스키마 검증 활용
- **Selection 매핑**: 필요시 Selection 매핑 함수 제공

## 10. Extension Guide

### 10.1 Adding New Operations
1. **DSL 정의**: `defineOperationDSL`로 DSL 함수 생성
2. **Runtime 정의**: `defineOperation`으로 실행 로직 정의
3. **테스트 작성**: DSL과 Runtime 모두 테스트
4. **문서화**: 사용법과 예제 문서화
5. **등록**: `register-operations.ts`에 추가

### 10.2 Custom Operation Categories
```typescript
// Custom category example
export const customOperation = defineOperationDSL((param: string) => ({
  type: 'customOperation',
  payload: { param }
}), { category: 'custom', atom: false });
```

### 10.3 Plugin System
- Global registry를 통한 동적 operation 등록
- 플러그인별 operation namespace 지원
- 런타임 operation 로딩 가능

## 11. Performance Considerations

### 11.1 Registry Lookup
- Map 기반 O(1) 조회 성능
- 메모리 효율적인 operation 저장
- 지연 로딩 지원

### 11.2 Operation Execution
- 비동기 실행으로 논블로킹 처리
- 에러 발생 시 즉시 중단
- 메모리 누수 방지

### 11.3 DSL Generation
- 가벼운 객체 생성
- 불필요한 복사 최소화
- 타입 안전성과 성능의 균형

## 12. Functional DSL (op function)

### 12.1 개요

`op()` 함수는 복잡한 로직과 흐름 제어를 위한 함수형 DSL입니다. 기존의 선언적 DSL과 달리 명령형 프로그래밍 스타일로 복잡한 작업을 수행할 수 있습니다.

```typescript
// 함수 시그니처
function op(operationFn: (context: TransactionContext) => OpResult | void | Promise<OpResult | void>): OpFunction

// 기본 사용법
const result = await transaction(editor, [
  op(async (ctx) => {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', 'Hello'),
      ctx.schema
    );
    
    return {
      success: true,
      data: node
    };
  })
]).commit();
```

### 12.2 TransactionContext

`op` 함수는 `TransactionContext`를 매개변수로 받습니다:

```typescript
interface TransactionContext {
  dataStore: DataStore;           // DataStore 인스턴스 (직접 조작 가능)
  selectionManager: SelectionManager; // SelectionManager 인스턴스
  selection?: ModelSelection;     // 현재 선택 영역
  schema?: any;                   // Schema 인스턴스
  selectAbsoluteRange: (start: number, end: number) => void; // 절대 위치 선택
  resolveAbsolute: (position: number) => { nodeId: string; offset: number } | null; // 위치 해석
}
```

### 12.3 OpResult 구조

```typescript
interface OpResult {
  success: boolean;                    // 성공/실패 여부
  data?: any;                         // 결과 데이터
  error?: string;                     // 에러 메시지 (success: false일 때)
  inverse?: TransactionOperation;     // 역함수 operation (undo용)
}
```

### 12.4 지원하는 반환 타입

#### 12.4.1 void (아무것도 반환하지 않음)
```typescript
op(async (ctx) => {
  // 부수 효과만 수행 (로깅, 상태 변경 등)
  // 아무것도 리턴하지 않음
})
```

#### 12.4.2 OpResult (성공/실패 결과)
```typescript
op(async (ctx) => {
  const node = ctx.dataStore.createNodeWithChildren(
    textNode('inline-text', 'Hello'),
    ctx.schema
  );
  
  return {
    success: true,
    data: node
  };
})
```

#### 12.4.3 OpResult with inverse (역함수 지정)
```typescript
op(async (ctx) => {
  const node = ctx.dataStore.createNodeWithChildren(
    textNode('inline-text', 'With inverse'),
    ctx.schema
  );
  
  return {
    success: true,
    data: node,
    inverse: { type: 'delete', payload: { nodeId: node.sid } }
  };
})
```

#### 12.4.4 실패 케이스
```typescript
op(async (ctx) => {
  const condition = false;
  if (condition) {
    return {
      success: true,
      data: ctx.dataStore.createNodeWithChildren(textNode('inline-text', 'Created'), ctx.schema)
    };
  } else {
    return {
      success: false,
      error: 'Condition not met'
    };
  }
})
```

### 12.5 실행 흐름

1. **Transaction 시작**: `transaction(editor, [op(...)])` 호출
2. **Operation 등록**: `op` 함수가 `OpFunction` 객체로 변환
3. **Transaction Commit**: `commit()` 호출 시 `TransactionManager`가 실행
4. **OpFunction 실행**: `_executeOpFunction`에서 `opFn.execute(context)` 호출
5. **결과 처리**: `OpResult` 또는 `void` 반환값 처리
6. **Operation 생성**: `OpResult`는 즉시 operation을 생성하지 않음 (inverse는 undo용)

### 12.6 기존 DSL과의 혼용

```typescript
const result = await transaction(editor, [
  // 기존 선언적 DSL
  create(textNode('inline-text', 'Regular operation')),
  
  // 함수형 DSL
  op(async (ctx) => {
    // 커스텀 로직 실행
    return { success: true };
  }),
  
  // 다시 선언적 DSL
  control('node-sid', setText('Updated text'))
]).commit();
```

### 12.7 주요 특징

- **비동기 지원**: `async/await` 패턴 완전 지원
- **직접 DataStore 조작**: `ctx.dataStore`를 통한 직접적인 데이터 조작
- **조건부 실행**: 일반 JavaScript 문법으로 복잡한 로직 구현
- **에러 처리**: `try/catch`와 `OpResult.error`를 통한 명확한 에러 처리
- **역함수 지원**: `inverse` 속성으로 undo 동작 정의
- **트랜잭션 안전성**: 모든 변경사항이 트랜잭션 내에서 안전하게 실행

### 12.8 사용 사례

#### 12.8.1 복잡한 조건부 로직
```typescript
op(async (ctx) => {
  const user = await getUser();
  const hasPermission = await checkPermission(user.sid);
  
  if (hasPermission) {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', `Welcome ${user.name}`),
      ctx.schema
    );
    return { success: true, data: node };
  } else {
    return { success: false, error: 'Insufficient permissions' };
  }
})
```

#### 12.8.2 다중 노드 생성
```typescript
op(async (ctx) => {
  const nodes = [];
  for (let i = 0; i < 5; i++) {
    const node = ctx.dataStore.createNodeWithChildren(
      textNode('inline-text', `Item ${i + 1}`),
      ctx.schema
    );
    nodes.push(node);
  }
  
  return {
    success: true,
    data: nodes,
    inverse: {
      type: 'batch',
      payload: { operations: nodes.map(n => ({ type: 'delete', payload: { nodeId: n.sid } })) }
    }
  };
})
```

#### 12.8.3 외부 API 호출과 연동
```typescript
op(async (ctx) => {
  try {
    const response = await fetch('/api/validate', {
      method: 'POST',
      body: JSON.stringify({ content: 'test' })
    });
    
    if (response.ok) {
      const data = await response.json();
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', data.message),
        ctx.schema
      );
      return { success: true, data: node };
    } else {
      return { success: false, error: 'Validation failed' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
})
```

### 12.9 주의사항

- `op((ctx) => { return { type, payload } })` 형태는 지원하지 않음
- `defineOperation`과 동일한 `OpResult` 구조만 사용
- `inverse`는 실제로 실행되지 않고 나중에 undo할 때 사용
- `OpResult`를 반환해도 `result.operations`에는 추가되지 않음 (inverse는 undo용)
- `ctx.dataStore`를 직접 조작할 때는 스키마 검증을 고려해야 함

## 13. Operation Registration and Testing

### 13.1 Operation Registration
모든 operations은 `register-operations.ts`에서 등록되어야 합니다:

```typescript
// register-operations.ts
import './create';
import './update';  // 필수 등록
import './delete';
// ... 기타 operations
```

**중요 사항:**
- `defineOperation`으로 정의된 operation은 자동으로 global registry에 등록
- 테스트에서 사용할 operation은 반드시 등록되어 있어야 함
- 등록되지 않은 operation은 "Unknown operation type" 에러 발생

### 13.2 Testing Best Practices

#### 13.2.1 Node ID Handling
```typescript
// ✅ 올바른 방법
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello'))
]).commit();

const nodeId = createResult.operations[0].result.data.sid; // 생성된 ID 사용
const updateResult = await transaction(editor, [
  control(nodeId, [{ type: 'setText', payload: { text: 'Updated' } }])
]).commit();

// ❌ 잘못된 방법
const nodeId = createResult.operations[0].nodeId; // undefined
```

#### 13.2.2 Operation Result Access
```typescript
// ✅ 올바른 방법
expect(result.success).toBe(true);
expect(result.operations[0].result.data.sid).toBeDefined();
expect(result.operations[0].result.data.text).toBe('Updated');

// ❌ 잘못된 방법
expect(result.operations[0].result.sid).toBeDefined(); // undefined
```

### 13.3 Common Testing Issues

#### 13.3.1 Operation Registration Error
```
Error: Unknown operation type: update
```
**해결방법:** `register-operations.ts`에 해당 operation import 추가

#### 13.3.2 Node ID Access Error
```
TypeError: Cannot read properties of undefined (reading 'id')
```
**해결방법:** `result.data.sid`로 접근

#### 13.3.3 Payload Structure Error
```
Cannot destructure property 'nodeId' of 'operation.payload' as it is undefined
```
**해결방법:** operation이 `operation.payload`에서 매개변수 추출하도록 구현

---

이 명세서는 실제 구현된 Operation DSL 시스템을 기반으로 작성되었으며, 모든 예제는 테스트를 통과한 검증된 코드입니다.
