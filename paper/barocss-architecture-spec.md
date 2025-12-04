# Barocss Editor 아키텍처 스펙

## 1. 개요

Barocss Editor는 **통합 스키마 중심**의 문서 편집 시스템으로, ProseMirror의 장점을 참고하되 우리만의 방식으로 설계되었습니다.

### 핵심 설계 원칙
- **통합 스키마**: 하나의 Schema 인스턴스로 모든 노드 타입과 마크 관리
- **스키마 중심**: 모든 문서 구조는 통합 스키마로 정의
- **계층적 구조**: Schema → Document → Nodes → Operations → Transactions
- **타입 안전성**: TypeScript 기반 강타입 시스템
- **검증 우선**: 모든 작업에 스키마 검증 적용
- **확장 가능**: 기존 스키마를 쉽게 확장할 수 있는 구조

## 2. 아키텍처 개요

```
통합 Schema (모든 노드 타입과 마크 정의)
  ↓
Document (스키마 기반 문서 인스턴스)
  ↓
Nodes (스키마 규칙을 따르는 노드들)
  ↓
Operations (노드 조작 작업들)
  ↓
Transactions (원자적 작업 단위)
  ↓
DataStore (영속성 저장소)
```

## 3. 통합 스키마 시스템

### 3.1 Schema 클래스

```typescript
interface Schema {
  name: string;
  topNode: string; // 최상위 노드 타입 (기본값: 'doc')
  nodes: Map<string, NodeTypeDefinition>;
  marks: Map<string, MarkDefinition>;
  
  // 간결한 노드 생성 API
  doc(content?: Node[]): Document;
  node(type: string, attrs?: any, content?: Node[]): Node;
  text(content: string, attrs?: any, marks?: Mark[]): Node;
  
  // 노드 타입 관리
  getNodeType(type: string): NodeTypeDefinition | undefined;
  hasNodeType(type: string): boolean;
  getNodeTypesByGroup(group: string): NodeTypeDefinition[];
  
  // Marks 관리
  getMarkType(type: string): MarkDefinition | undefined;
  hasMarkType(type: string): boolean;
  getMarkTypesByGroup(group: string): MarkDefinition[];
  
  // 검증
  validateNode(node: Node): ValidationResult;
  validateDocument(document: Document): ValidationResult;
  validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult;
  validateContent(nodeType: string, content: any[]): ValidationResult;
  validateMarks(marks: Mark[]): ValidationResult;
  
  // 변환
  transform(nodeType: string, data: any): any;
}
```

### 3.2 통합 스키마 정의

Barocss Editor는 **통합 스키마 방식**으로 모든 노드 타입을 하나의 Schema 인스턴스에서 관리합니다. 이를 통해 스키마 간 관계를 명확히 하고 일관성을 보장합니다.

```typescript
// 통합 스키마 정의
const schema = createSchema('article', {
  topNode: 'doc', // 최상위 노드 타입
  nodes: {
    // 문서 노드
    doc: {
      name: 'doc',
      content: 'block+',
      group: 'document',
      attrs: {
        title: { type: 'string', required: true },
        version: { type: 'string', default: '1.0.0' },
        createdAt: { type: 'string', required: true }
      }
    },
    
    // 단락 노드
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' }
      }
    },
    
    // 제목 노드
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', required: true, validator: (value: number) => value >= 1 && value <= 6 }
      }
    },
    
    // 텍스트 노드
    text: {
      name: 'text',
      group: 'inline'
    },
    
    // 이미지 노드
    image: {
      name: 'image',
      group: 'inline',
      atom: true,
      attrs: {
        src: { type: 'string', required: true },
        alt: { type: 'string', required: false },
        width: { type: 'number', required: false },
        height: { type: 'number', required: false }
      }
    }
  },
  
  marks: {
    // 굵게 마크
    bold: {
      name: 'bold',
      attrs: {
        weight: { type: 'string', default: 'bold' }
      },
      group: 'text-style'
    },
    
    // 기울임 마크
    italic: {
      name: 'italic',
      attrs: {
        style: { type: 'string', default: 'italic' }
      },
      group: 'text-style',
      excludes: ['bold'] // 굵게와 함께 사용 불가
    },
    
    // 링크 마크
    link: {
      name: 'link',
      attrs: {
        href: { type: 'string', required: true },
        title: { type: 'string', required: false }
      },
      group: 'link'
    },
    
    // 색상 마크
    color: {
      name: 'color',
      attrs: {
        color: { type: 'string', required: true },
        backgroundColor: { type: 'string', required: false }
      },
      group: 'color'
    }
  }
});
```

### 3.3 스키마 확장

기존 스키마를 쉽게 확장할 수 있습니다:

```typescript
// 기본 스키마
const baseSchema = createSchema('blog', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});

// 소셜 미디어 기능 추가
const socialSchema = createSchema(baseSchema, {
  nodes: {
    tweet: {
      name: 'tweet',
      content: 'inline*',
      group: 'block',
      attrs: {
        characterCount: { type: 'number', required: true }
      }
    },
    hashtag: {
      name: 'hashtag',
      group: 'inline',
      attrs: {
        tag: { type: 'string', required: true }
      }
    }
  },
  marks: {
    mention: {
      name: 'mention',
      group: 'social',
      attrs: {
        username: { type: 'string', required: true }
      }
    }
  }
});
```

## 4. 문서 시스템

### 4.1 Document 인터페이스

```typescript
interface Document {
  id: string;
  type: string; // 스키마의 topNode와 일치
  attrs: Record<string, any>;
  content: Node[];
  schema: Schema; // 스키마 참조
  
  // 스키마 기반 검증
  validate(): ValidationResult;
  
  // 노드 조회
  getNode(id: string): Node | undefined;
  getNodesByType(type: string): Node[];
  
  // 노드 생성 (스키마 기반)
  createNode(type: string, attrs?: any, content?: Node[]): Node;
  
  // 마크 적용
  applyMark(nodeId: string, mark: Mark): ValidationResult;
  removeMark(nodeId: string, markType: string): ValidationResult;
}
```

### 4.2 Node 인터페이스

```typescript
interface Node {
  id: string;
  type: string;
  attrs: Record<string, any>;
  content?: Node[]; // 컨테이너 노드의 경우
  text?: string; // 텍스트 노드의 경우
  marks?: Mark[]; // 텍스트 노드의 마크
  schema: Schema; // 스키마 참조
  
  // 스키마 기반 검증
  validate(): ValidationResult;
  
  // 속성 관리
  getAttribute(name: string): any;
  setAttribute(name: string, value: any): ValidationResult;
  
  // 마크 관리
  addMark(mark: Mark): ValidationResult;
  removeMark(markType: string): ValidationResult;
  hasMark(markType: string): boolean;
}
```

### 4.3 Mark 인터페이스

```typescript
interface Mark {
  type: string;
  attrs: Record<string, any>;
  
  // 마크 검증
  validate(schema: Schema): ValidationResult;
}
```

## 5. Operation 시스템

### 5.1 Operation 기본 구조

```typescript
interface Operation {
  type: string;
  nodeId?: string;
  documentId?: string;
  data?: any;
  schema: Schema; // 스키마 참조
  
  // 실행
  execute(context: OperationContext): Promise<OperationResult>;
  
  // 검증
  validate(schema: Schema): ValidationResult;
  
  // 롤백
  rollback(context: OperationContext): Promise<OperationResult>;
}
```

### 5.2 ModelContext (DSL 컨텍스트)

Model 레벨 DSL 오퍼레이션은 스키마·노드 생성·ID 생성에 접근 가능한 `ModelContext`를 사용한다.

```typescript
interface ModelContext {
  getNode(nodeId: string): INode | undefined;
  schema?: Schema;
  // 스키마 기반 INode 생성 (attrs/content 정규화 포함)
  createNode(
    type: string,
    attrs: Record<string, any> | undefined,
    content: any[] | undefined,
    base: { id: string; parentId?: string; text?: string }
  ): INode;
  // 새 노드 ID 생성 (기본 구현 제공, DataStore 연동 가능)
  newId(prefix?: string): string;
}
```

참고: 실제 컨텍스트 인스턴스는 `makeModelContext(store)`로 생성하며, 루트 문서의 `attributes.schema`를 사용해 `schema`를 주입하고 `createNode`/`newId` 기본 구현을 제공한다.

### 5.3 텍스트 Operations

```typescript
// 텍스트 삽입
interface TextInsertOperation extends Operation {
  type: 'text.insert';
  nodeId: string;
  data: {
    offset: number;
    text: string;
    marks?: Mark[];
  };
}

// 텍스트 선택 영역 교체
interface TextReplaceSelectionOperation extends Operation {
  type: 'text.replaceSelection';
  data: {
    startNodeId: string;
    startOffset: number;
    endNodeId: string;
    endOffset: number;
    text: string;
    marks?: Mark[];
  };
}

// 텍스트 분할
interface TextSplitAtSelectionOperation extends Operation {
  type: 'text.splitAtSelection';
  data: {
    nodeId: string;
    offset: number;
  };
}

// 텍스트 병합
interface TextMergeForwardOperation extends Operation {
  type: 'text.mergeForward';
  data: {
    nodeId: string;
  };
}
```

### 5.4 블록 Operations

```typescript
// 블록 분할
interface BlockSplitAtSelectionOperation extends Operation {
  type: 'block.splitAtSelection';
  data: {
    nodeId: string;
    offset: number;
  };
}

// 블록 병합
interface BlockMergeWithNextOperation extends Operation {
  type: 'block.mergeWithNext';
  data: {
    nodeId: string;
  };
}

// 블록 래핑
interface BlockWrapSelectionOperation extends Operation {
  type: 'block.wrapSelection';
  data: {
    wrapperType: string;
    wrapperAttrs?: Record<string, any>;
    startNodeId: string;
    endNodeId: string;
  };
}

// 블록 언래핑
interface BlockUnwrapSelectionOperation extends Operation {
  type: 'block.unwrapSelection';
  data: {
    nodeId: string;
  };
}
```

### 5.5 마크 Operations

```typescript
// 마크 적용
interface TextApplyMarkOperation extends Operation {
  type: 'text.applyMark';
  data: {
    nodeId: string;
    mark: Mark;
  };
}

// 마크 제거
interface TextRemoveMarkOperation extends Operation {
  type: 'text.removeMark';
  data: {
    nodeId: string;
    markType: string;
  };
}
```

## 6. Transaction 시스템

### 6.x Selection & Absolute Position (Architecture View)

Rationale
- External simplicity: Editor and tests express intent using absolute positions and high-level selection ops.
- Internal robustness: Mapping and validation happen inside the model; no DOM dependency.

Position Space Definition
- Offsets are defined over TEXT CONTENT ONLY; structural nodes do not occupy positions.
- Origin (0) is the start of the first text node. There is no position at the document node itself.
- Boundary resolution (backward-prefer): If an offset lies exactly between text nodes, resolve to the end of the previous text node; if none, resolve to the start of the first text node.

Key Components
- ModelContext (Facade):
  - selectAbsoluteRange(anchor: number, head: number)
  - replaceSelection(text: string)
  - deleteAbsoluteRange(anchor: number, head: number)
  - resolveAbsolute(abs: number)
- Internals:
  - PositionCalculator: absolute <-> (nodeId, offset)
  - PositionTracker: position lifecycle & invalidation bookkeeping
  - PositionMapper (planned): build per-transaction mapping tables to remap positions across edits

Flow (replaceSelection)
1) Caller: selectAbsoluteRange(anchor, head)
2) Resolve: calculator → (startNodeId, startOffset, endNodeId, endOffset)
3) Translate: DSL operation 'text.replaceSelection' → primitive operations
4) Commit: transaction builds mapping, remaps selection positions
5) Result: updated doc + valid post-commit selection

Constraints
- Unified Schema validates node/mark attributes after translation
- Cross-node range operations must maintain parent content integrity

### 6.1 Transaction 정의

```typescript
interface Transaction {
  id: string;
  operations: Operation[]; // 기본 ops로 번역된 단계들의 모음
  schema: Schema;
  timestamp: Date;
  description?: string;
  metadata?: Record<string, any>;
  
  // 실행
  commit(): Promise<TransactionResult>;
  
  // 롤백
  rollback(): Promise<void>;
  
  // 검증
  validate(): ValidationResult;
}
```

### 6.2 TransactionBuilder

```typescript
interface TransactionBuilder {
  constructor(schema: Schema);
  
  // 스키마 기반 노드 생성
  createNode(type: string, attrs?: any, content?: Node[]): TransactionBuilder;
  
  // Operation 추가
  addOperation(operation: Operation): TransactionBuilder;
  addOperations(operations: Operation[]): TransactionBuilder;
  
  // DSL Operation 추가
  addOperation(type: string, payload: any): TransactionBuilder;
  
  // 메타데이터 관리
  setMeta(key: string, value: any): TransactionBuilder;
  getMeta(key: string): any;
  
  // 조건부 작업
  if(condition: boolean, callback: (builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  unless(condition: boolean, callback: (builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  
  // 반복 작업
  forEach<T>(items: T[], callback: (item: T, builder: TransactionBuilder) => TransactionBuilder): TransactionBuilder;
  
  // 실행
  commit(): Promise<TransactionResult>;
}
```

### 6.3 TransactionResult

```typescript
interface TransactionResult {
  success: boolean;
  errors: string[];
  data?: any;
  transactionId?: string;
  operations?: Operation[];
  document?: Document;
}
```

## 7. DataStore 시스템

### 7.1 DataStore 역할

```typescript
interface DataStore {
  // 스키마 기반 저장
  saveDocument(document: Document): Promise<void>;
  saveNode(node: Node): Promise<void>;
  
  // 스키마 기반 조회
  getDocument(id: string): Promise<Document | undefined>;
  getNode(id: string): Promise<Node | undefined>;
  getAllNodes(): Promise<Node[]>;
  getAllDocuments(): Promise<Document[]>;
  
  // 스키마 검증
  validateDocument(document: Document): ValidationResult;
  validateNode(node: Node): ValidationResult;
  
  // 히스토리 관리
  getHistory(): Transaction[];
  rollbackToTransaction(transactionId: string): Promise<void>;
}
```

## 8. Model과 Schema 연동

### 8.1 스키마 기반 노드 생성

```typescript
// Model에서 Schema를 사용한 노드 생성
class NodeFactory {
  constructor(private schema: Schema) {}
  
  createNode(type: string, options: NodeCreationOptions): Node {
    // 스키마 검증
    const validation = this.schema.validateAttributes(type, options.attributes || {});
    if (!validation.valid) {
      throw new Error(`Invalid attributes: ${validation.errors.join(', ')}`);
    }
    
    // 스키마 기반 노드 생성
    return this.schema.node(type, options.attributes, options.content);
  }
  
  createTextNode(content: string, marks?: Mark[]): Node {
    return this.schema.text(content, {}, marks);
  }
  
  createDocument(content: Node[]): Document {
    return this.schema.doc(content);
  }
}
```

### 8.2 스키마 기반 Operation 실행 (DSL)

```typescript
// Operation에서 Schema 검증
class TextInsertOperation implements Operation {
  constructor(
    private nodeId: string,
    private offset: number,
    private text: string,
    private marks: Mark[],
    private schema: Schema
  ) {}
  
  async execute(context: OperationContext): Promise<OperationResult> {
    // 스키마 검증
    const node = context.getNode(this.nodeId);
    if (!node) {
      return { success: false, errors: ['Node not found'] };
    }
    
    // 마크 검증
    if (this.marks.length > 0) {
      const marksValidation = this.schema.validateMarks(this.marks);
      if (!marksValidation.valid) {
        return { success: false, errors: marksValidation.errors };
      }
    }
    
    // 텍스트 삽입 로직 실행
    // ...
  }
  
  validate(schema: Schema): ValidationResult {
    // 스키마 기반 검증
    const nodeType = schema.getNodeType('text');
    if (!nodeType) {
      return { valid: false, errors: ['Text node type not defined in schema'] };
    }
    
    return { valid: true, errors: [] };
  }
}
```

### 8.3 Transaction에서 Schema 활용

```typescript
class TransactionBuilder {
  constructor(private schema: Schema, private dataStore: DataStore) {}
  
  addOperation(type: string, payload: any): TransactionBuilder {
    // DSL 등록된 오퍼레이션을 ModelContext 기반으로 실행하고
    // 기본 create/update/delete 오퍼레이션들로 번역하여 추가한다.
    const ctx = makeModelContext(this.dataStore);
    const { ops } = applyOperation(type, payload, ctx);
    this.operations.push(...ops);
    return this;
  }
  
  private createOperation(type: string, payload: any): Operation {
    switch (type) {
      case 'text.insert':
        return new TextInsertOperation(
          payload.nodeId,
          payload.offset,
          payload.text,
          payload.marks || [],
          this.schema
        );
      // 다른 operation들...
    }
  }
}
```

## 9. 사용 예제

### 9.1 기본 문서 생성

```typescript
// 1. 통합 스키마 정의
const schema = createSchema('article', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  },
  marks: {
    bold: { name: 'bold', group: 'text-style' }
  }
});

// 2. 문서 생성 (Marks 포함)
const document = schema.doc([
  schema.node('paragraph', {}, [
    schema.text('Hello '),
    schema.text('World', {}, [
      { type: 'bold', attrs: { weight: 'bold' } }
    ])
  ])
]);

// 3. 편집 작업 (Marks 포함)
const transaction = new TransactionBuilder(schema)
  .addOperation('text.insert', { 
    nodeId: 'text-1', 
    offset: 5, 
    text: ' Beautiful' 
  })
  .addOperation('text.applyMark', {
    nodeId: 'text-1',
    mark: { type: 'bold', attrs: { weight: 'bold' } }
  })
  .setMeta('description', '텍스트 편집 및 스타일링')
  .commit();
```

### 9.2 스키마 확장 활용

```typescript
// 기본 블로그 스키마
const blogSchema = createSchema('blog', {
  topNode: 'doc',
  nodes: {
    doc: { name: 'doc', content: 'block+', group: 'document' },
    paragraph: { name: 'paragraph', content: 'inline*', group: 'block' },
    text: { name: 'text', group: 'inline' }
  }
});

// 협업 기능 추가
const collaborativeSchema = createSchema(blogSchema, {
  nodes: {
    comment: {
      name: 'comment',
      group: 'block',
      attrs: {
        author: { type: 'string', required: true },
        timestamp: { type: 'string', required: true }
      }
    }
  },
  marks: {
    highlight: {
      name: 'highlight',
      group: 'collaborative',
      attrs: {
        author: { type: 'string', required: true },
        color: { type: 'string', default: 'yellow' }
      }
    }
  }
});
```

## 10. 패키지 구조

```
packages/
├── schema/           # 통합 스키마 시스템
│   ├── src/
│   │   ├── schema.ts      # Schema 클래스
│   │   ├── types.ts       # 타입 정의
│   │   ├── validators.ts  # 검증 로직
│   │   ├── registry.ts    # 레지스트리 관리
│   │   └── index.ts
│   └── test/
│
├── model/            # 데이터 모델 및 Operations
│   ├── src/
│   │   ├── operation.ts   # Operation 기본 클래스
│   │   ├── operations/    # 구체적 Operations
│   │   ├── transaction.ts # Transaction 시스템
│   │   ├── node-factory.ts # 스키마 기반 노드 생성
│   │   └── index.ts
│   └── test/
│
├── datastore/        # 영속성 저장소
│   ├── src/
│   │   ├── data-store.ts
│   │   └── index.ts
│   └── test/
│
└── renderer-dom/     # DOM 렌더링
    ├── src/
    │   ├── renderer.ts
    │   └── index.ts
    └── test/
```

## 11. 결론

Barocss Editor의 통합 스키마 아키텍처는 다음과 같은 장점을 제공합니다:

1. **일관성**: 하나의 스키마로 모든 노드 타입과 마크 관리
2. **확장성**: 기존 스키마를 쉽게 확장할 수 있는 구조
3. **타입 안전성**: TypeScript 기반 완전한 타입 지원
4. **검증 우선**: 모든 작업에 스키마 검증 적용
5. **성능**: 효율적인 스키마 기반 검증과 변환
6. **유지보수성**: 명확한 계층 구조와 책임 분리

이 아키텍처를 통해 복잡한 문서 편집 기능을 안전하고 효율적으로 구현할 수 있습니다.