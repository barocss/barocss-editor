# Barocss Editor Testing Guide

## 1. Overview

이 문서는 Barocss Editor의 테스트 작성 및 디버깅을 위한 가이드입니다. 실제 테스트 수정 과정에서 발견된 문제들과 해결 방법을 정리했습니다.

## 2. Test Structure

### 2.1 Basic Test Setup

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, control, node, textNode, mark } from '../../src/transaction-dsl';
import { create } from '../../src/operations-dsl/create';
import { Editor } from '@barocss/editor-core';

describe('Test Suite', () => {
  let dataStore: DataStore;
  let mockEditor: any;
  let schema: any;

  beforeEach(() => {
    dataStore = new DataStore();
    schema = createSchema('basic', {
      topNode: 'document',
      nodes: {
        document: { name: 'document', group: 'document', content: 'paragraph+' },
        paragraph: { name: 'paragraph', group: 'block', content: 'inline*' },
        'inline-text': { name: 'inline-text', group: 'inline', marks: 'bold|italic' }
      }
    });

    dataStore = new DataStore(undefined, schema);

    mockEditor = new Editor({
      dataStore,
      schema
    });
  });
});
```

## 3. Common Testing Patterns

### 3.1 Function Children and Attributes Testing

Testing dynamic content generation with function children and attributes.

```typescript
// Function children testing
it('should handle function children correctly', () => {
  const template = element('li', { className: 'feature' }, [
    (d) => d.name + (d.enabled ? ' ✓' : '')
  ]);
  
  const data = { name: 'Feature 1', enabled: true };
  const vnode = builder.build(template, data);
  
  expect(vnode.text).toBe('Feature 1 ✓');
});

// Function attributes testing
it('should handle function attributes correctly', () => {
  const template = element('div', {
    className: (d) => d.active ? 'active' : 'inactive',
    style: (d) => ({ color: d.color || 'black' })
  }, [text('Dynamic content')]);
  
  const data = { active: true, color: 'blue' };
  const vnode = builder.build(template, data);
  
  expect(vnode.attrs.className).toBe('active');
  expect(vnode.attrs.style.color).toBe('blue');
});

// Mixed content testing
it('should handle mixed content with correct ordering', () => {
  const template = element('div', { className: 'header' }, [
    text('Title: '),
    (d) => d.title,
    text(' by '),
    (d) => d.author
  ]);
  
  const data = { title: 'My Document', author: 'John Doe' };
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(4);
  expect(vnode.children[0].text).toBe('Title: ');
  expect(vnode.children[1].text).toBe('My Document');
  expect(vnode.children[2].text).toBe(' by ');
  expect(vnode.children[3].text).toBe('John Doe');
});
```

### 3.2 Array Iteration Testing (Replacing each)

Testing array iteration using function children with JavaScript's `map()` method.

```typescript
// Array iteration testing
it('should handle array iteration with function children', () => {
  const template = element('ul', { className: 'list' }, [
    (d) => d.items.map(item => 
      element('li', { className: 'item' }, [text(item.name)])
    )
  ]);
  
  const data = { 
    items: [
      { name: 'Item 1' },
      { name: 'Item 2' },
      { name: 'Item 3' }
    ]
  };
  
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(3);
  expect(vnode.children[0].tag).toBe('li');
  expect(vnode.children[0].text).toBe('Item 1');
  expect(vnode.children[1].text).toBe('Item 2');
  expect(vnode.children[2].text).toBe('Item 3');
});

// Complex nested iteration testing
it('should handle complex nested iteration', () => {
  const template = element('div', { className: 'categories' }, [
    (d) => d.categories.map(category =>
      element('div', { className: 'category' }, [
        element('h3', [text(category.name)]),
        element('ul', { className: 'items' }, [
          ...category.items.map(item =>
            element('li', { className: 'item' }, [text(item.name)])
          )
        ])
      ])
    )
  ]);
  
  const data = {
    categories: [
      {
        name: 'Category 1',
        items: [{ name: 'Item 1.1' }, { name: 'Item 1.2' }]
      },
      {
        name: 'Category 2', 
        items: [{ name: 'Item 2.1' }]
      }
    ]
  };
  
  const vnode = builder.build(template, data);
  
  expect(vnode.children).toHaveLength(2);
  expect(vnode.children[0].children[1].children).toHaveLength(2);
  expect(vnode.children[1].children[1].children).toHaveLength(1);
});
```

### 3.3 isDSLTemplate Testing

Testing the DSL template identification helper function.

```typescript
// DSL template identification testing
it('should correctly identify DSL templates', () => {
  // DSL templates (should return true)
  expect(isDSLTemplate(text('Hello'))).toBe(true);
  expect(isDSLTemplate(data('name'))).toBe(true);
  expect(isDSLTemplate(element('div'))).toBe(true);
  expect(isDSLTemplate(component('button'))).toBe(true);
  expect(isDSLTemplate(when(true, text('ok')))).toBe(true);
  
  // HTML attribute objects (should return false)
  expect(isDSLTemplate({ type: 'text', placeholder: 'Enter text' })).toBe(false);
  expect(isDSLTemplate({ className: 'btn', disabled: true })).toBe(false);
  expect(isDSLTemplate({ href: '#home', target: '_blank' })).toBe(false);
});
```

### 3.4 HTML Boolean Attributes Testing

Testing HTML boolean attributes handling.

```typescript
// Boolean attributes testing
it('should handle HTML boolean attributes correctly', () => {
  const template = element('input', {
    type: 'checkbox',
    disabled: true,
    required: false,
    checked: (d) => d.checked
  });
  
  const data = { checked: true };
  const vnode = builder.build(template, data);
  
  expect(vnode.attrs.disabled).toBe(true);
  expect(vnode.attrs.required).toBe(false);
  expect(vnode.attrs.checked).toBe(true);
});

// href attribute testing
it('should handle href attribute correctly', () => {
  const template = element('a', {
    href: '#home',
    target: '_blank'
  }, [text('Home')]);
  
  const vnode = builder.build(template, {});
  
  expect(vnode.attrs.href).toBe('#home');
  expect(vnode.attrs.target).toBe('_blank');
});
```

### 3.5 Node Creation and Access

```typescript
// ✅ 올바른 방법
const createResult = await transaction(mockEditor, [
  create(textNode('inline-text', 'Hello'))
]).commit();

expect(createResult.success).toBe(true);
const nodeId = createResult.operations[0].result.data.sid; // 생성된 ID 사용

// ❌ 잘못된 방법
const nodeId = createResult.operations[0].nodeId; // undefined
```

### 3.2 Control DSL Usage

```typescript
// ✅ 올바른 방법
const result = await transaction(mockEditor, [
  control(nodeId, [
    { type: 'setText', payload: { text: 'Updated Text' } }
  ])
]).commit();

expect(result.success).toBe(true);
expect(result.operations[0].type).toBe('setText');
expect(result.operations[0].payload.text).toBe('Updated Text');
```

### 3.3 Multiple Operations

```typescript
// ✅ 올바른 방법
const result = await transaction(mockEditor, [
  create(textNode('inline-text', 'First')),
  create(textNode('inline-text', 'Second'))
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(2);
```

### 3.4 Functional DSL (op function)

`op()` 함수는 복잡한 로직과 흐름 제어를 위한 함수형 DSL입니다. 테스트에서 복잡한 시나리오를 구현할 때 유용합니다.

#### 3.4.1 기본 사용법

```typescript
// ✅ 기본 사용법 - OpResult 반환
const result = await transaction(mockEditor, [
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

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0); // OpResult는 operation을 생성하지 않음
```

#### 3.4.2 조건부 실행

```typescript
// ✅ 조건부 실행 (일반 JavaScript 문법)
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    const shouldCreate = true;
    if (shouldCreate) {
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Conditional text'),
        ctx.schema
      );
      return {
        success: true,
        data: node
      };
    } else {
      return {
        success: false,
        error: 'Should not create'
      };
    }
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.3 역함수 지정

```typescript
// ✅ inverse 지정 (undo용)
const result = await transaction(mockEditor, [
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
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0); // inverse는 undo용이므로 즉시 실행되지 않음
```

#### 3.4.4 void 반환

```typescript
// ✅ 아무것도 반환하지 않음 (부수 효과만)
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    // 부수 효과만 수행 (로깅, 상태 변경 등)
    // 아무것도 리턴하지 않음
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.5 에러 처리

```typescript
// ✅ 실패 케이스
const result = await transaction(mockEditor, [
  op(async (ctx) => {
    try {
      // 복잡한 로직 수행
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Success'),
        ctx.schema
      );
      
      return {
        success: true,
        data: node
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  })
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(0);
```

#### 3.4.6 기존 DSL과 혼용

```typescript
// ✅ 기존 operation과 혼용
const result = await transaction(mockEditor, [
  create(textNode('inline-text', 'Regular operation')),
  op(async (ctx) => {
    // 커스텀 로직 실행
    return { success: true };
  }),
  control('node-sid', setText('Updated text'))
]).commit();

expect(result.success).toBe(true);
expect(result.operations).toHaveLength(2); // create + control만 operation으로 생성됨
```

#### 3.4.7 복잡한 시나리오 테스트

```typescript
// ✅ 다중 노드 생성과 조건부 로직
it('should handle complex multi-node creation', async () => {
  const result = await transaction(mockEditor, [
    op(async (ctx) => {
      const nodes = [];
      const conditions = [true, false, true, true, false];
      
      for (let i = 0; i < conditions.length; i++) {
        if (conditions[i]) {
          const node = ctx.dataStore.createNodeWithChildren(
            textNode('inline-text', `Item ${i + 1}`),
            ctx.schema
          );
          nodes.push(node);
        }
      }
      
      return {
        success: true,
        data: nodes,
        inverse: {
          type: 'batch',
          payload: { 
            operations: nodes.map(n => ({ 
              type: 'delete', 
              payload: { nodeId: n.sid } 
            })) 
          }
        }
      };
    })
  ]).commit();

  expect(result.success).toBe(true);
  expect(result.operations).toHaveLength(0);
  expect(result.data).toHaveLength(3); // 3개 노드만 생성됨
});
```

#### 3.4.8 비동기 작업 테스트

```typescript
// ✅ 비동기 작업 시뮬레이션
it('should handle async operations', async () => {
  const result = await transaction(mockEditor, [
    op(async (ctx) => {
      // 비동기 작업 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const node = ctx.dataStore.createNodeWithChildren(
        textNode('inline-text', 'Async created'),
        ctx.schema
      );
      
      return {
        success: true,
        data: node
      };
    })
  ]).commit();

  expect(result.success).toBe(true);
  expect(result.operations).toHaveLength(0);
});
```

#### 3.4.9 OpResult 구조

```typescript
interface OpResult {
  success: boolean;                    // 성공/실패 여부
  data?: any;                         // 결과 데이터
  error?: string;                     // 에러 메시지 (success: false일 때)
  inverse?: TransactionOperation;     // 역함수 operation (undo용)
}
```

#### 3.4.10 TransactionContext

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

#### 3.4.11 테스트 주의사항

- `op((ctx) => { return { type, payload } })` 형태는 지원하지 않음
- `defineOperation`과 동일한 `OpResult` 구조만 사용
- `inverse`는 실제로 실행되지 않고 나중에 undo할 때 사용
- `OpResult`를 반환해도 `result.operations`에는 추가되지 않음 (inverse는 undo용)
- `ctx.dataStore`를 직접 조작할 때는 스키마 검증을 고려해야 함
- 비동기 작업은 `async/await` 패턴을 사용

## 4. Common Issues and Solutions

### 4.1 Operation Registration Error

**에러:**
```
Error: Unknown operation type: update
```

**원인:** Operation이 `register-operations.ts`에 등록되지 않음

**해결방법:**
```typescript
// register-operations.ts에 추가
import './update';
```

### 4.2 Node ID Access Error

**에러:**
```
TypeError: Cannot read properties of undefined (reading 'id')
```

**원인:** 잘못된 경로로 노드 ID 접근

**해결방법:**
```typescript
// ❌ 잘못된 방법
const nodeId = result.operations[0].result.sid;

// ✅ 올바른 방법
const nodeId = result.operations[0].result.data.sid;
```

### 4.3 Payload Structure Error

**에러:**
```
Cannot destructure property 'nodeId' of 'operation.payload' as it is undefined
```

**원인:** Operation이 `operation.payload`에서 매개변수를 추출하지 않음

**해결방법:**
```typescript
// Operation 구현에서
defineOperation('setText', async (operation: any, context: TransactionContext) => {
  const { nodeId, text } = operation.payload; // payload에서 추출
  // ...
});
```

### 4.4 Editor Constructor Issues

**에러:**
```
Cannot read properties of undefined (reading 'getActiveSchema')
```

**원인:** `TransactionManager`에 잘못된 객체 전달

**해결방법:**
```typescript
// Editor 생성자에서
this._transactionManager = new TransactionManager(this); // Editor 인스턴스 전달
```

### 4.5 Event System Issues

**에러:**
```
this._transactionManager.on is not a function
```

**원인:** `TransactionManager`나 `SelectionManager`에 이벤트 시스템이 없음

**해결방법:**
```typescript
// Editor에서 이벤트 구독 부분을 주석 처리
// this._transactionManager.on('transaction_commit', (event) => {
//   this.emit('contentChange', { content: this.document, transaction: event.transaction });
// });
```

## 5. Testing Best Practices

### 5.1 Mock vs Real Objects

```typescript
// ✅ 실제 객체 사용 권장
const dataStore = new DataStore();
const editor = new Editor({ dataStore, schema });

// ❌ 과도한 mock 사용 지양
const mockDataStore = { getNode: jest.fn() };
```

### 5.2 Error Handling

```typescript
// ✅ 명확한 에러 메시지
expect(result.success).toBe(true);
if (!result.success) {
  console.log('Transaction failed:', result.errors);
}

// ✅ 예외 상황 테스트
it('should handle invalid node type', async () => {
  const result = await transaction(editor, [
    { type: 'create', payload: { node: { type: 'invalid-type' } } }
  ]).commit();
  
  expect(result.success).toBe(false);
  expect(result.errors).toContain('Unknown node type');
});
```

### 5.3 Async Testing

```typescript
// ✅ async/await 사용
it('should create node', async () => {
  const result = await transaction(editor, [
    create(textNode('inline-text', 'Hello'))
  ]).commit();
  
  expect(result.success).toBe(true);
});

// ❌ Promise 체이닝 지양
it('should create node', () => {
  return transaction(editor, [
    create(textNode('inline-text', 'Hello'))
  ]).commit().then(result => {
    expect(result.success).toBe(true);
  });
});
```

## 6. Debugging Tips

### 6.1 Console Logging

```typescript
// 디버깅용 로그 추가
console.log('Created nodeId:', nodeId);
console.log('Node exists:', !!dataStore.getNode(nodeId));
console.log('Update result:', result);
```

### 6.2 Result Inspection

```typescript
// 결과 객체 구조 확인
console.log('Result structure:', JSON.stringify(result, null, 2));
console.log('Operations:', result.operations);
console.log('Errors:', result.errors);
```

### 6.3 DataStore State

```typescript
// DataStore 상태 확인
console.log('All nodes:', dataStore.getAllNodes());
console.log('Root node:', dataStore.getRootNode());
console.log('Is locked:', dataStore.isLocked());
```

## 7. Performance Considerations

### 7.1 Test Isolation

```typescript
// 각 테스트마다 새로운 인스턴스 사용
beforeEach(() => {
  dataStore = new DataStore();
  editor = new Editor({ dataStore, schema });
});
```

### 7.2 Memory Management

```typescript
// 테스트 후 정리
afterEach(() => {
  editor?.destroy();
  dataStore = null;
});
```

## 8. Integration Testing

### 8.1 Transaction Lock Testing

```typescript
it('should handle concurrent transactions', async () => {
  const promises = Array.from({ length: 5 }, (_, i) => 
    transactionManager.execute([
      { type: 'create', payload: { node: { type: 'paragraph', text: `Node ${i}` } } }
    ])
  );
  
  const results = await Promise.all(promises);
  results.forEach(result => {
    expect(result.success).toBe(true);
  });
});
```

### 8.2 Error Recovery Testing

```typescript
it('should handle partial transaction failure', async () => {
  const result = await transactionManager.execute([
    { type: 'create', payload: { node: { type: 'paragraph', text: 'Valid' } } },
    { type: 'create', payload: { node: { type: 'invalid-type', text: 'Invalid' } } }
  ]);
  
  expect(result.success).toBe(false);
  expect(dataStore.isLocked()).toBe(false); // Lock이 해제되었는지 확인
});
```

## 6. History System Testing

### 6.1 Basic History Testing

```typescript
describe('History System', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      history: {
        maxSize: 10,
        enableCheckpoints: true,
        maxCheckpoints: 5
      }
    });
  });

  it('should track operations in history', async () => {
    // 트랜잭션 실행
    await editor.transaction([
      create(textNode('paragraph', 'Hello World'))
    ]).commit();

    // 히스토리 상태 확인
    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
    
    const stats = editor.getHistoryStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.currentIndex).toBe(0);
  });

  it('should undo operations correctly', async () => {
    // 초기 상태
    const initialStats = editor.getHistoryStats();
    
    // 트랜잭션 실행
    await editor.transaction([
      create(textNode('paragraph', 'Hello'))
    ]).commit();

    expect(editor.canUndo()).toBe(true);
    
    // 실행 취소
    const undone = await editor.undo();
    expect(undone).toBe(true);
    expect(editor.canUndo()).toBe(false);
    expect(editor.canRedo()).toBe(true);
  });

  it('should redo operations correctly', async () => {
    // 트랜잭션 실행
    await editor.transaction([
      create(textNode('paragraph', 'Hello'))
    ]).commit();

    // 실행 취소
    await editor.undo();
    expect(editor.canRedo()).toBe(true);
    
    // 다시 실행
    const redone = await editor.redo();
    expect(redone).toBe(true);
    expect(editor.canUndo()).toBe(true);
    expect(editor.canRedo()).toBe(false);
  });
});
```


### 6.2 History Configuration Testing

```typescript
describe('History Configuration', () => {
  it('should respect maxSize limit', () => {
    const editor = new Editor({
      history: { maxSize: 3 }
    });

    // 5개의 트랜잭션 실행
    for (let i = 0; i < 5; i++) {
      editor.transaction([
        create(textNode('paragraph', `Item ${i}`))
      ]).commit();
    }

    const stats = editor.getHistoryStats();
    expect(stats.totalEntries).toBe(3); // maxSize 제한
  });

});
```

### 6.3 History Exclusion Testing

```typescript
describe('History Exclusion Rules', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  it('should exclude selection operations from history', async () => {
    const initialStats = editor.getHistoryStats();
    
    // 선택 영역 변경 (히스토리에 추가되지 않아야 함)
    await editor.transaction([
      { type: 'selectRange', payload: { nodeId: 'node-1', start: 0, end: 5 } }
    ]).commit();

    const finalStats = editor.getHistoryStats();
    expect(finalStats.totalEntries).toBe(initialStats.totalEntries);
  });

  it('should exclude log operations from history', async () => {
    const initialStats = editor.getHistoryStats();
    
    // 로그 operation (히스토리에 추가되지 않아야 함)
    await editor.transaction([
      { type: 'log', payload: { message: 'Debug info' } }
    ]).commit();

    const finalStats = editor.getHistoryStats();
    expect(finalStats.totalEntries).toBe(initialStats.totalEntries);
  });
});
```

### 6.4 Error Handling in History

```typescript
describe('History Error Handling', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor();
  });

  it('should handle undo when no history exists', async () => {
    const undone = await editor.undo();
    expect(undone).toBe(false);
  });

  it('should handle redo when no future history exists', async () => {
    const redone = await editor.redo();
    expect(redone).toBe(false);
  });

});
```

---

이 가이드는 실제 테스트 수정 과정에서 발견된 문제들과 해결 방법을 바탕으로 작성되었습니다. 지속적으로 업데이트되어야 합니다.
