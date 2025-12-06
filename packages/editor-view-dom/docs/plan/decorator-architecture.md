# Decorator 시스템 아키텍처

## 개요

Decorator는 `editor-view-dom` 패키지에서만 관리되며, 스키마와 완전히 독립적입니다. Decorator는 EditorModel 레벨의 임시 UI 상태로, DocumentModel과는 별도 채널로 관리됩니다.

## 핵심 개념

### 1. Decorator 타입 vs Decorator 인스턴스

**Decorator 타입 (Type Schema)**
- Decorator의 구조와 데이터 스키마를 정의
- 예: `highlight` 타입은 `color`, `opacity` 등의 데이터 필드를 가짐
- 타입 등록: `DecoratorRegistry.registerInlineType()`, `registerLayerType()`, `registerBlockType()`

**Decorator 인스턴스 (Instance)**
- 실제로 문서에 적용되는 decorator 객체
- 특정 노드나 텍스트 범위를 타겟으로 함
- 인스턴스 추가: `EditorViewDOM.addDecorator()`

### 2. 현재 구조

```
EditorViewDOM
├── defineDecoratorType(type, category, schema)  // ✅ Public API: 타입 정의 (선택적)
│   └── decoratorRegistry.register*Type()        // 내부 구현
│
├── decoratorRegistry: DecoratorRegistry (public readonly)
│   ├── registerInlineType(type, schema)        // 내부: 타입 등록
│   ├── registerLayerType(type, schema)        // 내부: 타입 등록
│   ├── registerBlockType(type, schema)         // 내부: 타입 등록
│   ├── validateDecorator(decorator)            // 선택적 검증 (타입 있으면 검증)
│   └── applyDefaults(decorator)                // 기본값 적용 (타입 있으면 적용)
│
├── decoratorManager: DecoratorManager (public readonly)
│   ├── add(decorator)                          // 인스턴스 추가
│   ├── update(id, updates)                     // 인스턴스 업데이트
│   ├── remove(id)                              // 인스턴스 제거
│   └── getAll()                                // 모든 인스턴스 조회
│
├── remoteDecoratorManager: RemoteDecoratorManager (public readonly)
│   └── setRemoteDecorator(decorator, owner)    // 원격 decorator 관리
│
└── addDecorator(decorator)                     // ✅ Public API: 인스턴스 추가
    ├── custom decorator → decoratorGeneratorManager
    ├── pattern decorator → patternDecoratorConfigManager
    └── target decorator → decoratorManager.add()
```

## ✅ 구현 완료: 선택적 타입 시스템

### 현재 구현 상태

1. **✅ Public API 제공**
   - `view.defineDecoratorType()` 메서드로 타입 정의
   - `IEditorViewDOM` 인터페이스에 포함됨
   - 내부 구현(`decoratorRegistry`)에 직접 접근 불필요

2. **✅ 선택적 타입 검증**
   - 타입 정의 없이도 `addDecorator()` 사용 가능
   - 타입이 정의되어 있으면 검증 + 기본값 적용
   - 타입이 없으면 기본 필드 검증만 수행

3. **✅ 명확한 API 분리**
   - `defineDecoratorType()`: 타입 정의 (선택적)
   - `addDecorator()`: 인스턴스 추가 (항상 사용 가능)

## ✅ 구현된 해결 방안

### 구현: EditorViewDOM에 타입 정의 API 추가

```typescript
interface IEditorViewDOM {
  // ... 기존 메서드들 ...
  
  // ✅ Decorator 타입 정의 (선택적)
  defineDecoratorType(
    type: string,
    category: 'layer' | 'inline' | 'block',
    schema: {
      description?: string;
      dataSchema?: Record<string, {
        type: 'string' | 'number' | 'boolean' | 'array' | 'object';
        required?: boolean;
        default?: any;
      }>;
    }
  ): void;
  
  // ✅ Decorator 인스턴스 관리
  addDecorator(decorator: Decorator): void;      // 자동 렌더링
  updateDecorator(id: string, updates: Partial<Decorator>): void;
  removeDecorator(id: string): boolean;
}
```

**구현된 기능:**
- ✅ 명확한 Public API (`defineDecoratorType`)
- ✅ 내부 구현 숨김 (`decoratorRegistry` 직접 접근 불필요)
- ✅ 타입 정의와 인스턴스 추가가 명확히 구분됨
- ✅ 선택적 타입 시스템 (타입 정의 없이도 사용 가능)

### 옵션 2: 타입 자동 등록 (타입 검증 완화)

```typescript
// 타입이 없으면 자동으로 기본 스키마로 등록
addDecorator(decorator: Decorator): void {
  // 타입이 없으면 자동 등록
  if (!this.decoratorRegistry.hasType(decorator.category, decorator.stype)) {
    this.decoratorRegistry.registerType(
      decorator.stype,
      decorator.category,
      { description: `Auto-registered ${decorator.stype}` }
    );
  }
  // ...
}
```

**장점:**
- 사용자가 타입을 미리 등록할 필요 없음
- 간단한 사용법

**단점:**
- 타입 검증이 약해짐
- 데이터 스키마 검증 불가

### 옵션 3: 통합 API (타입과 인스턴스를 함께 등록)

```typescript
// 타입 정의와 인스턴스를 함께 등록
view.defineDecorator({
  type: 'highlight',
  category: 'inline',
  schema: { /* ... */ },
  instance: {
    sid: 'd1',
    target: { /* ... */ },
    data: { /* ... */ }
  }
});
```

**장점:**
- 한 번에 타입과 인스턴스 등록
- 사용이 간편함

**단점:**
- 타입과 인스턴스의 생명주기가 다름 (타입은 한 번만, 인스턴스는 여러 개)
- API가 복잡해짐

## 권장 사항

**옵션 1을 권장합니다.**

이유:
1. 타입 등록과 인스턴스 추가는 명확히 다른 개념
2. 타입은 앱 초기화 시 한 번만 등록
3. 인스턴스는 런타임에 여러 번 추가/제거
4. Public API로 제공하면 내부 구현 변경에 안전

## ✅ 구현 예시

### 시나리오 1: 타입 정의 없이 사용 (빠른 프로토타이핑)

```typescript
// 타입 정의 없이 바로 사용 가능
view.addDecorator({
  sid: 'd1',
  stype: 'quick-highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    color: 'yellow',
    customField: 'any value'  // 검증 없이 통과
  }
});
```

### 시나리오 2: 타입 정의와 함께 사용 (프로덕션)

```typescript
// 앱 초기화 시 타입 정의 (선택적)
view.defineDecoratorType('highlight', 'inline', {
  description: 'Highlight decorator',
  dataSchema: {
    color: { type: 'string', default: 'yellow' },
    opacity: { type: 'number', default: 0.3 }
  }
});

// 런타임에 decorator 인스턴스 추가 (검증 + 기본값 적용)
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: {
    sid: 'text-1',
    startOffset: 0,
    endOffset: 5
  },
  data: {
    color: 'red'  // opacity는 기본값 0.3 자동 적용
  }
});
```

### 시나리오 3: 혼합 사용

```typescript
// 일부 타입만 정의
view.defineDecoratorType('highlight', 'inline', {
  dataSchema: {
    color: { type: 'string', default: 'yellow' }
  }
});

// 정의된 타입: 검증 + 기본값 적용
view.addDecorator({
  sid: 'd1',
  stype: 'highlight',
  category: 'inline',
  target: { sid: 't1', startOffset: 0, endOffset: 5 },
  data: { color: 'red' }  // color 기본값 적용
});

// 정의되지 않은 타입: 검증 없이 통과
view.addDecorator({
  sid: 'd2',
  stype: 'custom-widget',  // 정의되지 않음
  category: 'inline',
  target: { sid: 't2', startOffset: 0, endOffset: 5 },
  data: { anyField: 'anyValue' }  // 검증 없이 통과
});
```

## 검증 동작

### 타입이 정의되어 있을 때
- ✅ 데이터 스키마 검증 (필수 필드, 타입 체크)
- ✅ 기본값 자동 적용
- ✅ 잘못된 데이터 시 에러 발생

### 타입이 정의되어 있지 않을 때
- ✅ 기본 필드 검증만 (sid, category, stype 필수)
- ✅ 데이터 스키마 검증 없음
- ✅ 기본값 적용 없음
- ✅ 모든 데이터 필드 허용

## 타입 등록의 필요성

### 왜 타입 등록이 필요한가?

Decorator는 EditorModel 레벨의 임시 UI 상태로, Schema처럼 엄격한 타입 시스템이 필수는 아닙니다. 하지만 다음과 같은 이유로 선택적 타입 시스템을 제공합니다:

1. **데이터 검증**: 협업 환경에서 다른 사용자의 decorator 검증
2. **플러그인 시스템**: decorator 타입 안정성 보장
3. **데이터 일관성**: 기본값 자동 적용으로 일관된 UI

### Schema vs Decorator 비교

| 항목 | Schema | Decorator |
|------|--------|-----------|
| **목적** | DocumentModel 구조 정의 | EditorModel 임시 UI 상태 |
| **생명주기** | 앱 전체에 걸쳐 영구적 | 세션별, 임시적 |
| **검증 필요성** | 높음 (문서 무결성) | 낮음 (UI 상태) |
| **타입 시스템** | 필수 (문서 구조) | 선택적 |
| **동적 생성** | 불가능 (정의 필요) | 가능 |

### 선택적 타입 시스템 (Opt-in)

현재 구현은 **선택적 타입 시스템**을 채택했습니다:

- **기본**: 타입 정의 없이도 `addDecorator()` 사용 가능
- **선택**: `defineDecoratorType()`으로 타입 정의 시 검증 강화
- **점진적**: 개발 초기에는 빠른 프로토타이핑, 프로덕션에서는 타입 안정성

## 데이터 모델

### Decorator 인터페이스

```typescript
interface Decorator {
  sid: string;                    // 고유 식별자
  stype: string;                  // 타입 이름 (예: 'highlight', 'comment')
  category: 'layer' | 'inline' | 'block';  // 카테고리
  target: DecoratorTarget;        // 타겟 노드/범위
  data?: Record<string, any>;     // 타입별 데이터
  position?: DecoratorPosition;  // 위치 (block decorator용)
  enabled?: boolean;              // 활성화 여부
  decoratorType?: 'target' | 'pattern' | 'custom';  // 생성 방식
}
```

### DecoratorTarget

```typescript
interface DecoratorTarget {
  sid: string;                    // 타겟 노드의 SID
  startOffset?: number;           // 텍스트 범위 시작 (inline/layer용)
  endOffset?: number;              // 텍스트 범위 끝 (inline/layer용)
}
```

### DecoratorPosition (Block Decorator)

```typescript
type DecoratorPosition = 
  | 'before'          // target의 형제로 앞에 삽입
  | 'after'           // target의 형제로 뒤에 삽입
  | 'inside-start'    // target의 첫 번째 자식으로 삽입
  | 'inside-end';     // target의 마지막 자식으로 삽입
```

## 렌더링 시스템

### 렌더링 흐름

```
EditorViewDOM.render()
  ↓
1. Decorator 수집
   - decoratorManager.getAll() → 일반 decorator
   - remoteDecoratorManager.getAll() → 원격 decorator
   - patternDecoratorGenerator.generateDecoratorsFromText() → 패턴 decorator
  ↓
2. DOMRenderer.render(model, decorators)
   ↓
3. VNodeBuilder.build()
   - inline decorator: _buildMarkedRunsWithDecorators에서 처리
   - block/layer decorator: DecoratorProcessor에서 처리
   ↓
4. VNode → DOM 변환
   - reconcile() → DOM 업데이트
```

### 카테고리별 렌더링

#### Layer Decorator
- **위치**: 문서 위에 오버레이로 표시
- **렌더링**: 절대 위치, `contenteditable="false"`
- **특징**: Z-index로 레이어 관리

#### Inline Decorator
- **위치**: 텍스트 내부에 삽입
- **렌더링**: 텍스트와 함께 흐름, `<span>` 태그 사용
- **특징**: 텍스트 범위에 적용

#### Block Decorator
- **위치**: 블록 레벨 요소로 삽입
- **렌더링**: `before` 또는 `after` 위치
- **특징**: 블록 레벨, `<div>` 태그 사용

## 패턴 기반 Decorator

### 개념

텍스트에 특정 패턴(예: `#FFFFFF`, `rgba(20, 20, 15, 0.5)`)이 나타나면 자동으로 decorator를 생성합니다.

### 제한사항

- **텍스트 필드만**: `model.text`가 있는 노드에서만 작동
- **자동 스캔**: `VNodeBuilder._buildMarkedRunsWithDecorators`에서 자동 스캔
- **기존 decorator 우선**: 같은 범위의 기존 decorator가 있으면 스킵

### PatternDecoratorConfig

```typescript
interface PatternDecoratorConfig {
  id: string;                    // 패턴 식별자
  type: string;                  // 생성될 decorator의 stype
  category: 'inline' | 'block' | 'layer';
  pattern: RegExp;               // 정규식 패턴
  extractData: (match: RegExpMatchArray) => Record<string, any>;
  createDecorator: (
    nodeId: string,
    startOffset: number,
    endOffset: number,
    extractedData: Record<string, any>
  ) => {
    sid: string;
    target: {
      sid: string;
      startOffset: number;
      endOffset: number;
    };
    data?: Record<string, any>;
  };
  priority?: number;              // 우선순위 (낮을수록 먼저 적용)
  enabled?: boolean;              // 활성화 여부
}
```

## 관련 문서

- [Decorator 사용 가이드](./decorator-guide.md) - 기본 사용법 및 예제
- [Decorator 통합 가이드](./decorator-integration.md) - AI 통합 및 협업 환경
- [Pattern & Custom Decorator 예제](./decorator-pattern-and-custom-examples.md) - Pattern과 Custom Decorator 상세 예제

