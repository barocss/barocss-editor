# 아키텍처: DocumentModel vs EditorModel

## 개요

현재 아키텍처는 **DocumentModel**과 **EditorModel**을 분리하여 **DOMRenderer**에 주입하는 구조입니다.

## 핵심 개념

### 1. DocumentModel (문서 모델)

**정의**: 문서의 실제 내용과 구조를 나타내는 모델

**포함 내용**:
- 노드 구조 (`stype`, `sid`, `content`)
- 텍스트 내용 (`text`)
- **Marks** (bold, italic, color 등 텍스트 스타일)
- 노드 속성 (`attributes`)

**특징**:
- 영구 저장 대상 (문서 자체)
- 트랜잭션으로 변경
- Schema로 검증

**예시**:
```typescript
{
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        {
          sid: 'text-1',
          stype: 'inline-text',
          text: 'Hello World',
          marks: [
            { type: 'bold', range: [0, 5] }
          ]
        }
      ]
    }
  ]
}
```

### 2. EditorModel (에디터 모델)

**정의**: 에디터의 UI 상태와 오버레이를 나타내는 모델

**포함 내용**:
- **Decorators** (주석, 하이라이트, 오버레이 위젯 등)
- Selection (선택 영역)
- 포커스 상태
- **패턴 기반 decorator 설정** (EditorViewDOM에서 `registerPatternDecorator`로 등록)

**특징**:
- **로컬 전용**: 에디터 내부에서만 사용되는 모델
- **네트워크 공유 안 함**: DocumentModel과 달리 네트워크를 통해 공유/동기화되지 않음
- **세션별 임시 데이터**: 문서에 저장되지 않음
- **사용자별 독립적**: 각 사용자의 에디터 인스턴스에서만 존재
- **동적 생성**: 사용자 인터랙션에 따라 동적 생성
- EditorViewDOM에서 관리

**예시**:
```typescript
// Decorators
[
  {
    sid: 'comment-1',
    stype: 'comment',
    category: 'inline',
    target: {
      sid: 'text-1',
      startOffset: 0,
      endOffset: 5
    },
    data: {
      author: 'user1',
      text: 'This is a comment'
    }
  }
]

// Selection
{
  type: 'text',
  anchor: { nodeId: 'text-1', offset: 0 },
  focus: { nodeId: 'text-1', offset: 5 }
}
```

## 아키텍처 구조

```
┌─────────────────────────────────────────────────────────┐
│                    EditorViewDOM                        │
│                                                          │
│  ┌──────────────────┐      ┌──────────────────┐       │
│  │  DocumentModel  │      │   EditorModel   │       │
│  │                │      │                   │       │
│  │  - stype       │      │  - Decorators     │       │
│  │  - sid         │      │  - Selection      │       │
│  │  - content     │      │  - Focus          │       │
│  │  - text        │      │  - Pattern Config │       │
│  │  - marks       │      │                   │       │
│  └──────────────────┘      └──────────────────┘       │
│         │                           │                   │
│         └───────────┬───────────────┘                   │
│                     ▼                                     │
│         ┌──────────────────────────┐                    │
│         │      DOMRenderer         │                    │
│         │                          │                    │
│         │  render(                 │                    │
│         │    container,            │                    │
│         │    model: DocumentModel, │                    │
│         │    decorators: EditorModel│                   │
│         │  )                       │                    │
│         └──────────────────────────┘                    │
│                     │                                     │
│                     ▼                                     │
│         ┌──────────────────────────┐                    │
│         │      DOM (렌더링 결과)    │                    │
│         └──────────────────────────┘                    │
└─────────────────────────────────────────────────────────┘
```

## 데이터 흐름

### 1. 렌더링 요청

```typescript
// EditorViewDOM.render()
view.render();
```

### 2. 데이터 수집

```typescript
// DocumentModel 수집
const modelData = editor.getDocumentProxy();
// → { stype, sid, content, text, marks, attributes }

// EditorModel 수집 (로컬 전용)
const decorators = decoratorManager.getAll();
// → [{ sid, stype, category, target, data }]
// 주의: dataStore가 아닌 decoratorManager에서 가져옴 (로컬 전용)
```

### 3. DOMRenderer에 주입

```typescript
// DOMRenderer.render()
domRenderer.render(
  container,        // layers.content
  modelData,        // DocumentModel (marks 포함)
  decorators        // EditorModel (decorators)
);
```

### 4. 렌더링 실행

```typescript
// DOMRenderer 내부
build(model, decorators) {
  // 1. 패턴 기반 decorator 생성 (EditorModel에서 설정 가져옴)
  const patternDecorators = generatePatternDecorators(model);
  
  // 2. 기존 decorator와 병합
  const mergedDecorators = [...decorators, ...patternDecorators];
  
  // 3. VNode 빌드
  const vnode = builder.build(model.stype, model, {
    decorators: mergedDecorators
  });
  
  // 4. DOM으로 렌더링
  reconciler.reconcile(container, vnode, model);
}
```

## 역할 분리

### DocumentModel (문서 모델)
- ✅ **영구 저장**: 문서의 실제 내용
- ✅ **Marks 포함**: 텍스트 스타일 정보
- ✅ **트랜잭션**: 변경 이력 관리
- ✅ **Schema 검증**: 구조 검증
- ✅ **네트워크 공유**: 네트워크를 통해 공유/동기화 가능
- ✅ **저장소 저장**: 데이터베이스나 파일에 저장

### EditorModel (에디터 모델)
- ✅ **로컬 전용**: 에디터 내부에서만 사용
- ✅ **네트워크 공유 안 함**: 다른 사용자와 공유되지 않음
- ✅ **세션별 데이터**: 사용자 세션에만 존재
- ✅ **Decorators**: UI 오버레이
- ✅ **Selection**: 선택 상태
- ✅ **Pattern Config**: 패턴 기반 decorator 설정

### DOMRenderer
- ✅ **통합 렌더링**: DocumentModel + EditorModel을 받아서 DOM으로 렌더링
- ✅ **VNode 생성**: ModelData → VNode 트리
- ✅ **DOM 동기화**: VNode → DOM diff & update

## 예시

### DocumentModel 예시

```typescript
{
  sid: 'doc-1',
  stype: 'document',
  content: [
    {
      sid: 'p-1',
      stype: 'paragraph',
      content: [
        {
          sid: 'text-1',
          stype: 'inline-text',
          text: 'Hello World',
          marks: [
            { type: 'bold', range: [0, 5] },
            { type: 'italic', range: [6, 11] }
          ]
        }
      ]
    }
  ]
}
```

### EditorModel 예시

```typescript
// Decorators
[
  {
    sid: 'comment-1',
    stype: 'comment',
    category: 'inline',
    target: {
      sid: 'text-1',
      startOffset: 0,
      endOffset: 5
    },
    data: {
      author: 'user1',
      text: 'This is bold'
    }
  },
  {
    sid: 'highlight-1',
    stype: 'highlight',
    category: 'inline',
    target: {
      sid: 'text-1',
      startOffset: 6,
      endOffset: 11
    },
    data: {
      color: '#ffff00'
    }
  }
]

// Selection
{
  type: 'text',
  anchor: { nodeId: 'text-1', offset: 0 },
  focus: { nodeId: 'text-1', offset: 11 }
}
```

### DOMRenderer 주입

```typescript
domRenderer.render(
  container,
  documentModel,  // 위의 DocumentModel
  editorModel     // 위의 EditorModel (decorators)
);
```

## 네트워크 공유 비교

### DocumentModel
- ✅ **네트워크 공유**: 다른 사용자와 공유/동기화 가능
- ✅ **저장소 저장**: 데이터베이스나 파일에 저장
- ✅ **협업 지원**: 여러 사용자가 동시에 편집 가능
- ✅ **버전 관리**: 변경 이력 추적

### EditorModel
- ❌ **네트워크 공유 안 함**: 로컬에서만 사용
- ❌ **저장소 저장 안 함**: 메모리에만 존재
- ❌ **협업 미지원**: 각 사용자의 로컬 상태만 관리
- ✅ **로컬 최적화**: 빠른 UI 반응성

## 결론

**맞습니다!** 현재 아키텍처는:

1. **DocumentModel**: 문서 내용 + Marks
   - 네트워크를 통해 공유/동기화 가능
   - 저장소에 저장
   
2. **EditorModel**: Decorators + Selection + 기타 UI 상태
   - **에디터 내부에서만 사용** (로컬 전용)
   - **네트워크 공유 안 함**
   - 메모리에만 존재
   
3. **DOMRenderer**: 둘을 주입받아 통합 렌더링

이 구조는 **관심사 분리**를 명확히 하여:
- DocumentModel은 문서의 영구 데이터 (공유 가능)
- EditorModel은 에디터의 임시 UI 상태 (로컬 전용)
- DOMRenderer는 순수 렌더링 로직

을 담당합니다.

