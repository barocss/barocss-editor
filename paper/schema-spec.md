# Barocss Schema Specification

## 개요

Barocss Schema는 문서 구조를 정의하고 검증하는 통합 스키마 시스템입니다. ProseMirror의 스키마 개념을 기반으로 하되, Barocss의 요구사항에 맞게 설계되었습니다.

## 핵심 개념

### 통합 스키마 (Unified Schema)
- **하나의 Schema 인스턴스**가 모든 노드 타입과 마크를 관리
- **일관된 API**로 노드 생성, 검증, 변환 수행
- **계층적 구조**로 노드 간 관계와 제약 조건 명확화

### 노드 타입 (Node Types)
문서의 구조적 요소를 정의합니다.
- **문서 노드**: 최상위 컨테이너 (doc)
- **블록 노드**: 단락, 제목, 리스트 등
- **인라인 노드**: 텍스트, 이미지, 링크 등

### 마크 (Marks)
텍스트에 적용되는 스타일링 정보를 정의합니다.
- **텍스트 스타일**: 굵게, 기울임, 밑줄 등
- **링크**: URL, 제목 등
- **색상**: 텍스트 색상, 배경색 등

## 스키마 정의

### 기본 구조

```typescript
interface SchemaDefinition {
  topNode?: string; // 기본값: 'doc'
  nodes: Record<string, NodeTypeDefinition>;
  marks?: Record<string, MarkDefinition>;
}
```

### 노드 타입 정의

```typescript
interface NodeTypeDefinition {
  name: string;
  group?: 'block' | 'inline' | 'document';
  content?: string; // 콘텐츠 모델 (예: 'block+', 'inline*')
  attrs?: Record<string, AttributeDefinition>;
  inline?: boolean;
  selectable?: boolean;
  draggable?: boolean;
  atom?: boolean;
  code?: boolean;
  whitespace?: 'pre' | 'normal';
  defining?: boolean;
  isolating?: boolean;
}
```

### 마크 정의

```typescript
interface MarkDefinition {
  name: string;
  attrs?: Record<string, AttributeDefinition>;
  excludes?: string[]; // 함께 사용할 수 없는 다른 marks
  group?: string; // mark 그룹
  inclusive?: boolean; // 기본값: true
}
```

### 속성 정의

```typescript
interface AttributeDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'custom';
  required?: boolean | ((attrs: Record<string, any>) => boolean);
  default?: any;
  validator?: (value: any, attrs: Record<string, any>) => boolean;
  transform?: (value: any) => any;
  customType?: string;
  objectSchema?: Record<string, AttributeDefinition>;
}
```

## 콘텐츠 모델

콘텐츠 모델은 노드가 포함할 수 있는 자식 노드의 구조를 정의합니다.

### 기본 패턴

- `block+`: 하나 이상의 블록 노드
- `block*`: 0개 이상의 블록 노드
- `block?`: 0개 또는 1개의 블록 노드
- `inline*`: 0개 이상의 인라인 노드
- `text*`: 0개 이상의 텍스트 노드

### 복합 패턴

- `block+ | inline+`: 블록 또는 인라인 노드
- `(block | inline)*`: 블록과 인라인 노드의 혼합
- `heading | paragraph`: 특정 노드 타입들

### 그룹 기반

- `block+`: block 그룹에 속한 노드들
- `inline*`: inline 그룹에 속한 노드들

## 사용 예제

### 1. 기본 스키마 생성

```typescript
import { createSchema } from '@barocss/schema';

const schema = createSchema('article', {
  topNode: 'doc',
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
        level: { type: 'number', default: 1 }
      }
    },
    
    // 제목 노드
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { 
          type: 'number', 
          required: true,
          validator: (value: number) => value >= 1 && value <= 6
        }
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
    
    // 밑줄 마크
    underline: {
      name: 'underline',
      attrs: {
        style: { type: 'string', default: 'underline' }
      },
      group: 'text-style'
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
    },
    
    // 코드 마크
    code: {
      name: 'code',
      attrs: {
        language: { type: 'string', required: false }
      },
      group: 'code'
    }
  }
});
```

### 2. 노드 생성

```typescript
// 문서 생성
const document = schema.doc([
  schema.node('heading', { level: 1 }, [
    schema.text('Hello World')
  ]),
  schema.node('paragraph', { level: 1 }, [
    schema.text('This is a '),
    schema.text('bold text', {}, [
      { type: 'bold', attrs: { weight: 'bold' } }
    ]),
    schema.text(' and '),
    schema.text('italic text', {}, [
      { type: 'italic', attrs: { style: 'italic' } }
    ]),
    schema.text('.')
  ])
]);

// 이미지 노드 생성
const imageNode = schema.node('image', {
  src: 'https://example.com/image.jpg',
  alt: 'Example image',
  width: 300,
  height: 200
});
```

### 3. 스키마 확장

```typescript
// 기존 스키마를 확장하여 새로운 기능 추가
const extendedSchema = createSchema(baseSchema, {
  nodes: {
    // 새로운 노드 추가
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', required: true }
      }
    },
    image: {
      name: 'image',
      group: 'inline',
      atom: true,
      attrs: {
        src: { type: 'string', required: true },
        alt: { type: 'string', required: false }
      }
    }
  },
  marks: {
    // 새로운 마크 추가
    italic: {
      name: 'italic',
      group: 'text-style',
      attrs: {
        style: { type: 'string', default: 'italic' }
      }
    },
    link: {
      name: 'link',
      group: 'link',
      attrs: {
        href: { type: 'string', required: true }
      }
    }
  }
});

// 기존 노드 수정 (새로운 속성 추가)
const modifiedSchema = createSchema(baseSchema, {
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' } // 새로운 속성
      }
    }
  }
});
```

### 4. 검증

```typescript
// 노드 검증
const nodeValidation = schema.validateNode('heading', {
  type: 'heading',
  attrs: { level: 1 },
  content: []
});

// 문서 검증
const documentValidation = schema.validateDocument(document);

// 마크 검증
const marksValidation = schema.validateMarks([
  { type: 'bold', attrs: { weight: 'bold' } },
  { type: 'link', attrs: { href: 'https://example.com' } }
]);
```

## API 참조

### createSchema 함수

```typescript
// 새로운 스키마 생성
createSchema(name: string, definition: SchemaDefinition): Schema

// 기존 스키마 확장
createSchema(baseSchema: Schema, extensions: SchemaExtensions): Schema
```

#### 스키마 확장 사용법

```typescript
// 1. 기본 스키마 생성
const baseSchema = createSchema('article', {
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

// 2. 스키마 확장
const extendedSchema = createSchema(baseSchema, {
  nodes: {
    heading: {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: { level: { type: 'number', required: true } }
    }
  },
  marks: {
    italic: {
      name: 'italic',
      group: 'text-style'
    }
  }
});

// 3. 기존 노드 수정
const modifiedSchema = createSchema(baseSchema, {
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: {
        level: { type: 'number', default: 1 },
        align: { type: 'string', default: 'left' } // 새로운 속성 추가
      }
    }
  }
});
```

### Schema 클래스

#### 생성자
```typescript
constructor(name: string, definition: SchemaDefinition)
```

#### 노드 타입 관리
```typescript
getNodeType(type: string): NodeTypeDefinition | undefined
hasNodeType(type: string): boolean
getNodeTypesByGroup(group: string): NodeTypeDefinition[]
```

#### 마크 관리
```typescript
getMarkType(type: string): MarkDefinition | undefined
hasMarkType(type: string): boolean
getMarkTypesByGroup(group: string): MarkDefinition[]
```

#### 검증
```typescript
validateAttributes(nodeType: string, attributes: Record<string, any>): ValidationResult
validateContent(nodeType: string, content: any[]): ValidationResult
validateMarks(marks: Mark[]): ValidationResult
validateNode(node: any): ValidationResult
validateDocument(document: any): ValidationResult
```

#### 노드 생성
```typescript
doc(content?: any[]): any
node(type: string, attrs?: any, content?: any[]): any
text(content: string, attrs?: any, marks?: Mark[]): any
```

#### 데이터 변환
```typescript
transform(nodeType: string, data: any): any
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];
  errorCodes?: string[];
}
```

### Validator 클래스

`Validator` 클래스는 스키마 기반 검증과 기본 구조적 검증을 제공하는 통합 검증 유틸리티입니다.

#### 기본 구조적 검증

```typescript
import { Validator } from '@barocss/schema';

// 노드 구조 검증 (스키마와 무관)
const nodeValidation = Validator.validateNodeStructure(node);
if (!nodeValidation.valid) {
  console.log('구조적 오류:', nodeValidation.errors);
  console.log('오류 코드:', nodeValidation.errorCodes);
}

// 문서 구조 검증
const documentValidation = Validator.validateDocumentStructure(document);
```

#### 스키마 기반 검증

```typescript
// 스키마를 사용한 노드 검증
const schemaValidation = Validator.validateNode(schema, node);

// 스키마를 사용한 문서 검증
const documentSchemaValidation = Validator.validateDocument(schema, document);
```

#### 에러 코드 시스템

`Validator`는 구조화된 에러 코드를 제공하여 테스트와 오류 처리를 안정화합니다:

```typescript
import { Validator, VALIDATION_ERRORS } from '@barocss/schema';

const result = Validator.validateNodeStructure(invalidNode);

// 안전한 오류 코드 기반 검증
if (!result.valid) {
  if (result.errorCodes?.includes(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED)) {
    // 텍스트 내용이 필요한 경우 처리
  }
  if (result.errorCodes?.includes(VALIDATION_ERRORS.NODE_TYPE_UNKNOWN)) {
    // 알 수 없는 노드 타입 처리
  }
}
```

#### 사용 가능한 에러 코드

```typescript
const VALIDATION_ERRORS = {
  // 노드 구조 오류
  NODE_REQUIRED: 'NODE_REQUIRED',
  NODE_ID_REQUIRED: 'NODE_ID_REQUIRED',
  NODE_TYPE_REQUIRED: 'NODE_TYPE_REQUIRED',
  TEXT_CONTENT_REQUIRED: 'TEXT_CONTENT_REQUIRED',
  
  // 문서 구조 오류
  DOCUMENT_REQUIRED: 'DOCUMENT_REQUIRED',
  DOCUMENT_ID_REQUIRED: 'DOCUMENT_ID_REQUIRED',
  DOCUMENT_SCHEMA_REQUIRED: 'DOCUMENT_SCHEMA_REQUIRED',
  DOCUMENT_CONTENT_REQUIRED: 'DOCUMENT_CONTENT_REQUIRED',
  
  // 스키마 검증 오류
  NODE_TYPE_UNKNOWN: 'NODE_TYPE_UNKNOWN',
  CONTENT_REQUIRED_BUT_EMPTY: 'CONTENT_REQUIRED_BUT_EMPTY',
  ATTRIBUTE_INVALID: 'ATTRIBUTE_INVALID',
  ATTRIBUTE_REQUIRED: 'ATTRIBUTE_REQUIRED',
  ATTRIBUTE_TYPE_MISMATCH: 'ATTRIBUTE_TYPE_MISMATCH',
  
  // 스키마 인스턴스 오류
  INVALID_SCHEMA_INSTANCE: 'INVALID_SCHEMA_INSTANCE'
};
```

#### 실제 사용 예제

```typescript
import { Validator, VALIDATION_ERRORS, createSchema } from '@barocss/schema';

// 1. 기본 구조적 검증
const textNode = {
  id: 'text-1',
  type: 'text',
  // text와 attributes.content 모두 없음
  attributes: {}
};

const result = Validator.validateNodeStructure(textNode);
expect(result.valid).toBe(false);
expect(result.errorCodes).toContain(VALIDATION_ERRORS.TEXT_CONTENT_REQUIRED);

// 2. 스키마 기반 검증
const schema = createSchema('test', {
  topNode: 'document',
  nodes: {
    document: { name: 'document', group: 'document', content: 'block+' },
    paragraph: { name: 'paragraph', group: 'block', content: 'inline+' },
    text: { 
      name: 'text', 
      group: 'inline',
      attrs: { content: { type: 'string', required: true } }
    }
  }
});

const validTextNode = {
  id: 'text-1',
  type: 'text',
  text: 'Hello',
  attributes: { content: 'Hello' }
};

const invalidTextNode = {
  id: 'text-2',
  type: 'text',
  text: 'Hello',
  attributes: {} // content 속성 누락
};

const validResult = Validator.validateNode(schema, validTextNode);
const invalidResult = Validator.validateNode(schema, invalidTextNode);

expect(validResult.valid).toBe(true);
expect(invalidResult.valid).toBe(false);
expect(invalidResult.errorCodes).toContain(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);

// 3. 문서 검증
const document = {
  id: 'doc-1',
  type: 'document',
  content: [validTextNode],
  schema: schema,
  metadata: { title: 'Test Document' },
  version: 1
};

const documentResult = Validator.validateDocumentStructure(document);
expect(documentResult.valid).toBe(true);
```

#### 테스트에서의 활용

```typescript
// 이전 방식 (취약)
expect(result.errors.some(err => err.includes('Content is required but empty'))).toBe(true);

// 새로운 방식 (안전)
expect(result.errorCodes).toContain(VALIDATION_ERRORS.CONTENT_REQUIRED_BUT_EMPTY);
```

이 방식의 장점:
- **안정성**: 오류 메시지가 바뀌어도 테스트가 안전
- **명확성**: 어떤 종류의 오류인지 명확
- **유지보수성**: 오류 코드만 관리하면 됨
- **확장성**: 새로운 오류 타입 추가가 쉬움

### Mark

```typescript
interface Mark {
  type: string;
  attrs?: Record<string, any>;
}
```

### SchemaExtensions

```typescript
type SchemaExtensions = Partial<SchemaDefinition>;
```

스키마 확장을 위한 부분 정의 타입입니다. 기존 스키마를 확장할 때 사용됩니다.

## 레지스트리 관리

### 전역 레지스트리

```typescript
import { 
  registerSchema, 
  getSchema, 
  getAllSchemas,
  getNodeTypesByGroup,
  removeSchema,
  hasSchema,
  clearSchemas
} from '@barocss/schema';

// 스키마 등록
registerSchema(schema);

// 스키마 조회
const schema = getSchema('article');

// 모든 스키마 조회
const allSchemas = getAllSchemas();

// 그룹별 노드 타입 조회
const blockNodes = getNodeTypesByGroup('block');
```

### 에디터 매니저

```typescript
import { EditorSchemaManager, createNamespacedSchema } from '@barocss/schema';

const manager = new EditorSchemaManager();

// 에디터 생성
const editor1 = manager.createEditor('editor1');
const editor2 = manager.createEditor('editor2');

// 각 에디터에 스키마 등록
editor1.register(schema1);
editor2.register(schema2);

// 네임스페이스 스키마 생성
const namespacedSchema = createNamespacedSchema('blog', 'post', schemaDefinition);
```

## 고급 기능

### 커스텀 검증자

```typescript
const schema = createSchema('custom', {
  topNode: 'doc',
  nodes: {
    email: {
      name: 'email',
      group: 'inline',
      attrs: {
        address: {
          type: 'string',
          required: true,
          validator: (value: string) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
          }
        }
      }
    }
  }
});
```

### 함수 기반 필수 속성

```typescript
const schema = createSchema('conditional', {
  topNode: 'doc',
  nodes: {
    user: {
      name: 'user',
      group: 'inline',
      attrs: {
        type: { type: 'string', required: true },
        email: {
          type: 'string',
          required: (attrs: Record<string, any>) => attrs.type === 'registered'
        }
      }
    }
  }
});
```

### 객체 스키마

```typescript
const schema = createSchema('complex', {
  topNode: 'doc',
  nodes: {
    profile: {
      name: 'profile',
      group: 'block',
      attrs: {
        user: {
          type: 'object',
          required: true,
          objectSchema: {
            name: { type: 'string', required: true },
            age: { type: 'number', required: true },
            address: {
              type: 'object',
              required: false,
              objectSchema: {
                street: { type: 'string', required: true },
                city: { type: 'string', required: true }
              }
            }
          }
        }
      }
    }
  }
});
```

## 성능 고려사항

### 스키마 캐싱
- 스키마 인스턴스는 생성 후 재사용 권장
- 노드 타입과 마크 정의는 내부적으로 Map으로 캐싱

### 검증 최적화
- 필수 속성 검증을 먼저 수행
- 커스텀 검증자는 마지막에 실행
- 오류 발생 시 즉시 중단

### 메모리 관리
- 사용하지 않는 스키마는 레지스트리에서 제거
- 에디터 종료 시 관련 스키마 정리

## 마이그레이션 가이드

### 기존 단일 노드 스키마에서 통합 스키마로

```typescript
// 기존 방식
const paragraphSchema = new Schema('paragraph', {
  attributes: { level: { type: 'number', default: 1 } },
  content: 'inline*',
  group: 'block'
});

// 새로운 방식
const schema = createSchema('article', {
  topNode: 'doc',
  nodes: {
    paragraph: {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: { level: { type: 'number', default: 1 } }
    }
  }
});
```

## 결론

Barocss Schema는 문서 구조를 정의하고 검증하는 강력한 시스템입니다. 통합 스키마 방식으로 일관성 있는 API를 제공하며, 확장 가능하고 유지보수하기 쉬운 구조를 가지고 있습니다.

ProseMirror의 검증된 개념을 기반으로 하되, Barocss의 특수한 요구사항에 맞게 최적화되어 있습니다.
