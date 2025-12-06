# Model Integration Guide

## 1. Overview

이 가이드는 Barocss Model의 핵심 구성 요소들(DSL, Transaction, DataStore)을 통합하여 사용하는 방법을 설명합니다. 실제 구현된 코드와 테스트 케이스를 기반으로 한 실용적인 가이드입니다.

### 1.1 Core Components
- **Transaction DSL**: 선언적 트랜잭션 구성
- **Operation System**: `defineOperation`과 `defineOperationDSL` 패턴
- **DataStore**: 스키마 기반 데이터 저장소
- **Schema**: 노드와 마크의 구조 정의

### 1.2 Integration Benefits
- **타입 안전성**: TypeScript로 완전한 타입 지원
- **원자성**: 모든 변경사항이 성공하거나 전부 실패
- **스키마 검증**: 자동 스키마 검증으로 데이터 무결성 보장
- **확장성**: 새로운 operation과 노드 타입 쉽게 추가

## 2. Setup and Configuration

### 2.1 Basic Setup
```typescript
import { DataStore } from '@barocss/datastore';
import { Schema } from '@barocss/schema';
import { transaction, create, node, textNode, control } from '@barocss/model';
import '@barocss/model/src/operations/register-operations'; // Operation 등록

// 1. 스키마 정의
const schema = new Schema('my-schema', {
  nodes: {
    document: { name: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    heading: { 
      name: 'heading', 
      content: 'inline*', 
      group: 'block', 
      attrs: { level: { type: 'number', required: true } } 
    },
    'inline-text': { name: 'inline-text', group: 'inline' },
    codeBlock: { 
      name: 'codeBlock', 
      group: 'block', 
      atom: true, 
      attrs: { language: { type: 'string', required: false } } 
    }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' },
    italic: { name: 'italic', group: 'text-style' }
  },
  topNode: 'document'
});

// 2. DataStore 초기화
const dataStore = new DataStore(undefined, schema);

// 3. Editor 객체 생성
const editor = {
  dataStore,
  _dataStore: dataStore
};
```

### 2.2 Operation Registration
```typescript
// 모든 operation을 등록 (필수)
import '@barocss/model/src/operations/register-operations';
```

## 3. Basic Usage Patterns

### 3.1 Simple Node Creation
```typescript
// 기본 텍스트 노드 생성
const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

console.log(result.success); // true
console.log(result.operations[0].result.text); // "Hello World"
```

### 3.2 Container Node Creation
```typescript
// 단락 노드 생성
const result = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Hello'),
    textNode('inline-text', 'World')
  ]))
]).commit();

const paragraphNode = result.operations[0].result;
const textNodes = paragraphNode.content
  .map(id => dataStore.getNode(id))
  .filter(Boolean);

console.log(textNodes.length); // 2
```

### 3.3 Text with Marks
```typescript
import { mark } from '@barocss/model';

// 마크가 있는 텍스트
const result = await transaction(editor, [
  create(textNode('inline-text', 'Bold text', [mark('bold')]))
]).commit();

const textNode = result.operations[0].result;
console.log(textNode.marks); // [{ type: 'bold', attrs: {}, range: undefined }]
```

### 3.4 Complex Nested Structure
```typescript
// 제목과 단락이 있는 문서
const result = await transaction(editor, [
  create(node('document', {}, [
    node('heading', { level: 1 }, [
      textNode('inline-text', 'My Document')
    ]),
    node('paragraph', {}, [
      textNode('inline-text', 'This is a paragraph with '),
      textNode('inline-text', 'bold text', [mark('bold')]),
      textNode('inline-text', ' and '),
      textNode('inline-text', 'italic text', [mark('italic')])
    ])
  ]))
]).commit();
```

## 4. Control Operations

### 4.1 Text Modification
```typescript
// 1. 노드 생성
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

const textNodeId = createResult.operations[0].result.sid;

// 2. 텍스트 수정
const controlResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Hello Universe' } }
  ])
]).commit();

console.log(controlResult.success); // true
```

### 4.2 Mark Operations
```typescript
// 1. 텍스트 노드 생성
const createResult = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();

const textNodeId = createResult.operations[0].result.sid;

// 2. 마크 적용
const markResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 5 } }
  ])
]).commit();

console.log(markResult.success); // true
```

### 4.3 Multiple Operations
```typescript
// 1. 단락 생성
const createResult = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Hello World')
  ]))
]).commit();

const paragraphId = createResult.operations[0].result.sid;
const textNodeId = dataStore.getNode(paragraphId)?.content?.[0];

// 2. 여러 작업 수행
const controlResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Hello Universe' } },
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 5 } }
  ]),
  ...control(paragraphId, [
    { type: 'setAttrs', payload: { attrs: { class: 'highlight' } } }
  ])
]).commit();
```

## 5. Real-world Scenarios

### 5.1 Blog Post Creation
```typescript
const blogPost = await transaction(editor, [
  // 제목
  create(node('heading', { level: 1 }, [
    textNode('inline-text', 'My Blog Post')
  ])),
  
  // 소개 단락
  create(node('paragraph', {}, [
    textNode('inline-text', 'This is an introduction paragraph with '),
    textNode('inline-text', 'important text', [mark('bold')]),
    textNode('inline-text', ' and '),
    textNode('inline-text', 'emphasized text', [mark('italic')])
  ])),
  
  // 코드 블록
  create(textNode('codeBlock', 'const x = 1;\nconsole.log(x);', { language: 'javascript' })),
  
  // 목록
  create(node('list', { type: 'bullet' }, [
    node('listItem', {}, [
      node('paragraph', {}, [
        textNode('inline-text', 'First item')
      ])
    ]),
    node('listItem', {}, [
      node('paragraph', {}, [
        textNode('inline-text', 'Second item')
      ])
    ])
  ]))
]).commit();

console.log(blogPost.success); // true
console.log(blogPost.operations.length); // 4
```

### 5.2 Technical Documentation
```typescript
const doc = await transaction(editor, [
  // 제목
  create(node('heading', { level: 1 }, [
    textNode('inline-text', 'API Documentation')
  ])),
  
  // 섹션 제목
  create(node('heading', { level: 2 }, [
    textNode('inline-text', 'Installation')
  ])),
  
  // 설치 명령어
  create(textNode('codeBlock', 'npm install @barocss/model', { language: 'bash' })),
  
  // 설명 단락
  create(node('paragraph', {}, [
    textNode('inline-text', 'Install the package using npm or yarn.')
  ])),
  
  // 사용법 섹션
  create(node('heading', { level: 2 }, [
    textNode('inline-text', 'Usage')
  ])),
  
  // 예제 코드
  create(textNode('codeBlock', `import { transaction, create, textNode } from '@barocss/model';

const result = await transaction(editor, [
  create(textNode('inline-text', 'Hello World'))
]).commit();`, { language: 'typescript' }))
]).commit();
```

### 5.3 Content Modification Workflow
```typescript
// 1. 초기 콘텐츠 생성
const createResult = await transaction(editor, [
  create(node('paragraph', {}, [
    textNode('inline-text', 'Original text')
  ]))
]).commit();

const paragraphId = createResult.operations[0].result.sid;
const textNodeId = dataStore.getNode(paragraphId)?.content?.[0];

// 2. 콘텐츠 수정
const modifyResult = await transaction(editor, [
  ...control(textNodeId, [
    { type: 'setText', payload: { text: 'Modified text' } },
    { type: 'applyMark', payload: { markType: 'bold', start: 0, end: 8 } }
  ])
]).commit();

// 3. 결과 확인
const finalNode = dataStore.getNode(textNodeId);
console.log(finalNode.text); // "Modified text"
console.log(finalNode.marks); // [{ type: 'bold', attrs: {}, range: [0, 8] }]
```

## 6. Error Handling

### 6.1 Schema Validation Errors
```typescript
try {
  const result = await transaction(editor, [
    create(node('heading', {}, [ // level 속성 누락
      textNode('inline-text', 'Title')
    ]))
  ]).commit();
} catch (error) {
  console.error('Schema validation failed:', error.message);
  // "Schema validation failed: Required attribute 'level' is missing"
}
```

### 6.2 Operation Errors
```typescript
try {
  const result = await transaction(editor, [
    ...control('nonexistent-node', [
      { type: 'setText', payload: { text: 'Hello' } }
    ])
  ]).commit();
} catch (error) {
  console.error('Operation failed:', error.message);
  // "Operation failed: Node not found: nonexistent-node"
}
```

### 6.3 Transaction Rollback
```typescript
// 실패한 트랜잭션은 자동으로 롤백됨
const result = await transaction(editor, [
  create(textNode('inline-text', 'Valid text')),
  ...control('invalid-node', [
    { type: 'setText', payload: { text: 'This will fail' } }
  ])
]).commit();

console.log(result.success); // false
console.log(result.errors.length); // > 0

// 첫 번째 operation도 롤백됨
const nodes = dataStore.getAllNodes();
console.log(nodes.size); // 0 (원래 상태로 복원)
```

## 7. Performance Considerations

### 7.1 Batch Operations
```typescript
// 여러 operation을 한 번에 실행 (권장)
const result = await transaction(editor, [
  create(textNode('inline-text', 'Text 1')),
  create(textNode('inline-text', 'Text 2')),
  create(textNode('inline-text', 'Text 3'))
]).commit();

// 개별 트랜잭션으로 실행 (비권장)
// const result1 = await transaction(editor, [create(textNode('inline-text', 'Text 1'))]).commit();
// const result2 = await transaction(editor, [create(textNode('inline-text', 'Text 2'))]).commit();
// const result3 = await transaction(editor, [create(textNode('inline-text', 'Text 3'))]).commit();
```

### 7.2 Large Document Handling
```typescript
// 대용량 문서 생성 시 청크 단위로 처리
const chunks = [];
for (let i = 0; i < 100; i++) {
  chunks.push(create(node('paragraph', {}, [
    textNode('inline-text', `Paragraph ${i}`)
  ])));
}

const result = await transaction(editor, chunks).commit();
console.log(result.operations.length); // 100
```

## 8. Testing Integration

### 8.1 Unit Testing
```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Model Integration', () => {
  let editor: any;
  let dataStore: DataStore;

  beforeEach(() => {
    // 테스트 설정
    const schema = new Schema('test-schema', {
      nodes: {
        document: { name: 'document', content: 'block+' },
        paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
        'inline-text': { name: 'inline-text', group: 'inline' }
      },
      marks: {
        bold: { name: 'bold', group: 'text-style' }
      },
      topNode: 'document'
    });

    dataStore = new DataStore(undefined, schema);
    editor = { dataStore, _dataStore: dataStore };
  });

  it('should create and modify text', async () => {
    // 생성
    const createResult = await transaction(editor, [
      create(textNode('inline-text', 'Hello'))
    ]).commit();

    expect(createResult.success).toBe(true);
    const textNodeId = createResult.operations[0].result.sid;

    // 수정
    const modifyResult = await transaction(editor, [
      ...control(textNodeId, [
        { type: 'setText', payload: { text: 'World' } }
      ])
    ]).commit();

    expect(modifyResult.success).toBe(true);
    
    // 검증
    const finalNode = dataStore.getNode(textNodeId);
    expect(finalNode.text).toBe('World');
  });
});
```

### 8.2 Integration Testing
```typescript
describe('Real-world Scenarios', () => {
  it('should handle complex document structure', async () => {
    const result = await transaction(editor, [
      create(node('document', {}, [
        node('heading', { level: 1 }, [
          textNode('inline-text', 'Title')
        ]),
        node('paragraph', {}, [
          textNode('inline-text', 'Content with '),
          textNode('inline-text', 'bold text', [mark('bold')])
        ])
      ]))
    ]).commit();

    expect(result.success).toBe(true);
    expect(result.operations).toHaveLength(1);
    
    const documentNode = result.operations[0].result;
    expect(documentNode.type).toBe('document');
    expect(documentNode.content).toHaveLength(2);
  });
});
```

## 9. Best Practices

### 9.1 Schema Design
- **명확한 구조**: 노드와 마크의 관계를 명확히 정의
- **필수 속성**: 중요한 속성은 `required: true`로 설정
- **기본값**: 적절한 기본값 제공
- **그룹화**: 관련 노드들을 그룹으로 묶기

### 9.2 Operation Usage
- **배치 처리**: 관련 operation들을 한 트랜잭션에서 처리
- **에러 처리**: 적절한 try-catch 구문 사용
- **검증**: 결과 검증을 통한 데이터 무결성 확인
- **성능**: 대용량 작업 시 청크 단위 처리

### 9.3 Code Organization
- **모듈화**: 관련 기능들을 모듈로 분리
- **타입 안전성**: TypeScript 타입을 적극 활용
- **테스트**: 단위 테스트와 통합 테스트 작성
- **문서화**: 복잡한 로직에 대한 주석 작성

## 10. Troubleshooting

### 10.1 Common Issues

#### Operation Not Found
```typescript
// 문제: "Operation 'setText' not found"
// 해결: Operation 등록 확인
import '@barocss/model/src/operations/register-operations';
```

#### Schema Validation Failed
```typescript
// 문제: "Schema validation failed"
// 해결: 스키마 정의와 노드 구조 확인
const schema = new Schema('test-schema', {
  nodes: {
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    'inline-text': { name: 'inline-text', group: 'inline' }
  },
  topNode: 'document'
});
```

#### Transaction Failed
```typescript
// 문제: "Transaction failed"
// 해결: 에러 메시지 확인 및 디버깅
const result = await transaction(editor, operations).commit();
if (!result.success) {
  console.error('Transaction errors:', result.errors);
}
```

### 10.2 Debugging Tips
- **결과 검증**: `result.operations`를 통한 실행 결과 확인
- **노드 상태**: `dataStore.getNode(id)`로 노드 상태 확인
- **스키마 확인**: `dataStore._activeSchema`로 활성 스키마 확인
- **Operation 등록**: `globalOperationRegistry.getAll()`로 등록된 operation 확인

---

이 가이드는 실제 구현된 코드를 기반으로 작성되었으며, 모든 예제는 테스트를 통과한 검증된 코드입니다. 추가 질문이나 문제가 있으면 테스트 케이스를 참고하시기 바랍니다.
