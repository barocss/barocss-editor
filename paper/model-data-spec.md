# Model Data 스펙 문서

## 📋 개요

Model Data는 Zero Editor에서 실제 문서 데이터를 저장하고 관리하는 데이터 모델입니다. Schema DSL로 정의된 구조를 기반으로 하며, 타입 안전성과 데이터 무결성을 보장합니다.

## 🎯 설계 목표

### 1. **데이터 무결성**
- 스키마 기반 데이터 검증
- 타입 안전성 보장
- 일관된 데이터 구조

### 2. **성능 최적화**
- 효율적인 메모리 사용
- 빠른 데이터 접근
- 지연 로딩 지원

### 3. **확장성**
- 동적 속성 추가
- 커스텀 데이터 타입
- 플러그인 시스템과 통합

## 🏗️ 핵심 개념

### 1. **노드 데이터 구조**

```typescript
interface INode {
  id: string;
  type: TNodeType;
  attributes: Record<string, any>;
  content?: INode[];
  text?: string;
  marks?: Mark[];
  parent?: INode;
  children?: INode[];
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### 2. **마크 데이터 구조**

```typescript
interface Mark {
  type: string;
  attributes: Record<string, any>;
  range: {
    start: number;
    end: number;
  };
}
```

### 3. **문서 데이터 구조**

```typescript
interface Document {
  id: string;
  type: 'document';
  content: INode[];
  metadata: {
    title?: string;
    author?: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  };
  schema: Schema;
  version: number;
}
```

## 📝 사용 예시

### 1. **기본 노드 생성**

```typescript
// 텍스트 노드 생성
const textNode: INode = {
  id: 'text-123',
  type: 'text',
  attributes: {
    bold: true,
    italic: false,
    color: '#000000'
  },
  text: 'Hello World',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 문단 노드 생성
const paragraphNode: INode = {
  id: 'para-456',
  type: 'paragraph',
  attributes: {
    align: 'left',
    indent: 0
  },
  content: [textNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 이미지 노드 생성
const imageNode: INode = {
  id: 'img-789',
  type: 'image',
  attributes: {
    src: 'https://example.com/image.jpg',
    alt: 'Example Image',
    width: 300,
    height: 200
  },
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### 2. **복합 노드 생성**

```typescript
// 리스트 아이템 노드
const listItemNode: INode = {
  id: 'li-001',
  type: 'listItem',
  attributes: {
    level: 0,
    type: 'bullet'
  },
  content: [paragraphNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 리스트 노드
const listNode: INode = {
  id: 'list-002',
  type: 'list',
  attributes: {
    type: 'bullet'
  },
  content: [listItemNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 테이블 셀 노드
const tableCellNode: INode = {
  id: 'cell-003',
  type: 'tableCell',
  attributes: {
    colspan: 1,
    rowspan: 1
  },
  content: [paragraphNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 테이블 행 노드
const tableRowNode: INode = {
  id: 'row-004',
  type: 'tableRow',
  content: [tableCellNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

// 테이블 노드
const tableNode: INode = {
  id: 'table-005',
  type: 'table',
  content: [tableRowNode],
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

### 3. **문서 생성**

```typescript
// 완전한 문서 생성
const document: Document = {
  id: 'doc-001',
  type: 'document',
  content: [
    paragraphNode,
    listNode,
    tableNode
  ],
  metadata: {
    title: 'Sample Document',
    author: 'John Doe',
    version: '1.0.0',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  schema: documentSchema,
  version: 1
};
```

## 🔧 고급 기능

### 1. **노드 팩토리**

```typescript
class NodeFactory {
  static createNode(
    type: TNodeType, 
    attributes: Record<string, any> = {},
    content: INode[] = [],
    text?: string
  ): INode {
    return {
      id: generateId(),
      type,
      attributes,
      content,
      text,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
  
  static createTextNode(text: string, attributes: Record<string, any> = {}): INode {
    return this.createNode('text', attributes, [], text);
  }
  
  static createParagraphNode(content: INode[], attributes: Record<string, any> = {}): INode {
    return this.createNode('paragraph', attributes, content);
  }
  
  static createImageNode(src: string, alt: string = '', attributes: Record<string, any> = {}): INode {
    return this.createNode('image', {
      src,
      alt,
      ...attributes
    });
  }
}
```

### 2. **데이터 변환**

```typescript
class DataTransformer {
  // 스키마 기반 데이터 변환
  static transform(data: any, schema: Schema): INode {
    const transformedData = { ...data };
    
    // 속성 변환
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      if (definition.transform && transformedData.attributes?.[key]) {
        transformedData.attributes[key] = definition.transform(transformedData.attributes[key]);
      }
    }
    
    return transformedData;
  }
  
  // 데이터 정규화
  static normalize(node: INode, schema: Schema): INode {
    const normalized = { ...node };
    
    // 기본값 적용
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      if (normalized.attributes[key] === undefined && definition.default !== undefined) {
        normalized.attributes[key] = definition.default;
      }
    }
    
    return normalized;
  }
  
  // 데이터 검증
  static validate(node: INode, schema: Schema): ValidationResult {
    const errors: string[] = [];
    
    // 속성 검증
    for (const [key, definition] of Object.entries(schema.definition.attributes || {})) {
      const value = node.attributes[key];
      
      if (definition.required && (value === undefined || value === null)) {
        errors.push(`Required attribute '${key}' is missing`);
        continue;
      }
      
      if (definition.validator && !definition.validator(value)) {
        errors.push(`Attribute '${key}' failed validation`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### 3. **데이터 저장소**

```typescript
class DataStore {
  private _nodes = new Map<string, INode>();
  private _documents = new Map<string, Document>();
  private _schemas = new Map<string, Schema>();
  
  // 노드 저장
  saveNode(node: INode): void {
    this._nodes.set(node.sid, node);
  }
  
  // 노드 가져오기
  getNode(id: string): INode | undefined {
    return this._nodes.get(id);
  }
  
  // 문서 저장
  saveDocument(document: Document): void {
    this._documents.set(document.sid, document);
    
    // 문서의 모든 노드 저장
    this._saveDocumentNodes(document);
  }
  
  // 문서 가져오기
  getDocument(id: string): Document | undefined {
    return this._documents.get(id);
  }
  
  // 스키마 등록
  registerSchema(schema: Schema): void {
    this._schemas.set(schema.name, schema);
  }
  
  // 스키마 가져오기
  getSchema(name: string): Schema | undefined {
    return this._schemas.get(name);
  }
  
  // 문서의 모든 노드 저장
  private _saveDocumentNodes(document: Document): void {
    const saveNodeRecursive = (node: INode) => {
      this._nodes.set(node.sid, node);
      if (node.content) {
        node.content.forEach(saveNodeRecursive);
      }
    };
    
    document.content.forEach(saveNodeRecursive);
  }
}
```

## 📊 데이터 검증

### 1. **Validator 클래스 통합**

Model Data는 `@barocss/schema`의 `Validator` 클래스를 사용하여 포괄적인 검증을 수행합니다.

#### 구조적 검증

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

// 노드 구조 검증 (스키마와 무관)
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.error('Node structure validation failed:', nodeValidation.errors);
  console.error('Error codes:', nodeValidation.errorCodes);
}

// 문서 구조 검증
const documentValidation = Validator.validateDocumentStructure(document);
if (!documentValidation.valid) {
  console.error('Document structure validation failed:', documentValidation.errorCodes);
}
```

#### 스키마 기반 검증

```typescript
// 스키마를 사용한 노드 검증
const schemaValidation = Validator.validateNode(schema, node);
if (!schemaValidation.valid) {
  console.error('Schema validation failed:', schemaValidation.errors);
}

// 스키마를 사용한 문서 검증
const documentSchemaValidation = Validator.validateDocument(schema, document);
if (!documentSchemaValidation.valid) {
  console.error('Document schema validation failed:', documentSchemaValidation.errors);
}
```

#### 에러 코드 활용

```typescript
// 안전한 오류 처리
const result = Validator.validateNodeStructure(node);
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // 텍스트 내용 누락 처리
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // 알 수 없는 노드 타입 처리
  }
}
```

### 2. **스키마 기반 검증**

```typescript
class DataValidator {
  // 노드 검증
  static validateNode(node: INode, schema: Schema): ValidationResult {
    const errors: string[] = [];
    
    // 타입 검증
    if (node.type !== schema.name) {
      errors.push(`Node type '${node.type}' does not match schema '${schema.name}'`);
    }
    
    // 속성 검증
    const attributeValidation = DataTransformer.validate(node, schema);
    if (!attributeValidation.valid) {
      errors.push(...attributeValidation.errors);
    }
    
    // 컨텐츠 검증
    if (schema.definition.content && node.content) {
      const contentValidation = this.validateContent(node.content, schema.definition.content);
      if (!contentValidation.valid) {
        errors.push(...contentValidation.errors);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  // 컨텐츠 검증
  static validateContent(content: INode[], contentModel: string): ValidationResult {
    // 컨텐츠 모델 파싱 및 검증 로직
    const errors: string[] = [];
    
    // 간단한 예시: 필수 컨텐츠 검증
    if (contentModel.endsWith('+') && content.length === 0) {
      errors.push('Content is required but empty');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

### 2. **데이터 무결성 검증**

```typescript
class IntegrityValidator {
  // 문서 무결성 검증
  static validateDocument(document: Document): ValidationResult {
    const errors: string[] = [];
    
    // 문서 ID 검증
    if (!document.sid) {
      errors.push('Document ID is required');
    }
    
    // 스키마 검증
    if (!document.schema) {
      errors.push('Document schema is required');
    }
    
    // 컨텐츠 검증
    if (!document.content || document.content.length === 0) {
      errors.push('Document content is required');
    }
    
    // 각 노드 검증
    document.content.forEach((node, index) => {
      const nodeValidation = DataValidator.validateNode(node, document.schema);
      if (!nodeValidation.valid) {
        errors.push(`Node ${index}: ${nodeValidation.errors.join(', ')}`);
      }
    });
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## 🚀 성능 최적화

### 1. **지연 로딩**

```typescript
class LazyDataStore extends DataStore {
  private _lazyNodes = new Map<string, () => Promise<INode>>();
  
  // 지연 로딩 노드 등록
  registerLazyNode(id: string, loader: () => Promise<INode>): void {
    this._lazyNodes.set(id, loader);
  }
  
  // 지연 로딩 노드 가져오기
  async getNodeAsync(id: string): Promise<INode | undefined> {
    if (this._nodes.has(id)) {
      return this._nodes.get(id);
    }
    
    const loader = this._lazyNodes.get(id);
    if (loader) {
      const node = await loader();
      this._nodes.set(id, node);
      return node;
    }
    
    return undefined;
  }
}
```

### 2. **데이터 캐싱**

```typescript
class CachedDataStore extends DataStore {
  private _cache = new Map<string, { data: any; timestamp: number }>();
  private _cacheTimeout = 5 * 60 * 1000; // 5분
  
  // 캐시된 노드 가져오기
  getNode(id: string): INode | undefined {
    const cached = this._cache.get(id);
    if (cached && Date.now() - cached.timestamp < this._cacheTimeout) {
      return cached.data;
    }
    
    const node = super.getNode(id);
    if (node) {
      this._cache.set(id, { data: node, timestamp: Date.now() });
    }
    
    return node;
  }
  
  // 캐시 무효화
  invalidateCache(id?: string): void {
    if (id) {
      this._cache.delete(id);
    } else {
      this._cache.clear();
    }
  }
}
```

## 📚 API 레퍼런스

### INode 인터페이스

```typescript
interface INode {
  id: string;
  type: TNodeType;
  attributes: Record<string, any>;
  content?: INode[];
  text?: string;
  marks?: Mark[];
  parent?: INode;
  children?: INode[];
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Document 인터페이스

```typescript
interface Document {
  id: string;
  type: 'document';
  content: INode[];
  metadata: {
    title?: string;
    author?: string;
    version: string;
    createdAt: Date;
    updatedAt: Date;
  };
  schema: Schema;
  version: number;
}
```

### 유틸리티 함수

```typescript
// 노드 생성
function createNode(type: TNodeType, attributes?: Record<string, any>, content?: INode[]): INode;

// 텍스트 노드 생성
function createTextNode(text: string, attributes?: Record<string, any>): INode;

// 문서 생성
function createDocument(content: INode[], schema: Schema, metadata?: any): Document;

// 데이터 검증
function validateNode(node: INode, schema: Schema): ValidationResult;

// 데이터 변환
function transformNode(node: INode, schema: Schema): INode;
```

## 🔍 예제

### 완전한 문서 생성 예제

```typescript
// 1. 스키마 등록
const paragraphSchema = schema('paragraph', {
  attributes: {
    align: { type: 'string', default: 'left' }
  },
  content: 'inline*'
});

const textSchema = schema('text', {
  attributes: {
    bold: { type: 'boolean', default: false },
    italic: { type: 'boolean', default: false }
  }
});

// 2. 노드 생성
const textNode1 = createTextNode('Hello ', { bold: true });
const textNode2 = createTextNode('World!', { italic: true });
const paragraphNode = createNode('paragraph', { align: 'center' }, [textNode1, textNode2]);

// 3. 문서 생성
const document = createDocument(
  [paragraphNode],
  documentSchema,
  {
    title: 'Sample Document',
    author: 'John Doe',
    version: '1.0.0'
  }
);

// 4. 데이터 검증
const validation = validateNode(paragraphNode, paragraphSchema);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// 5. 데이터 저장
const dataStore = new DataStore();
dataStore.registerSchema(paragraphSchema);
dataStore.registerSchema(textSchema);
dataStore.saveDocument(document);
```

이렇게 Model Data를 통해 스키마 기반의 안전하고 효율적인 데이터 관리를 할 수 있습니다.
