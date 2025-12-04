# 에디터 프레임워크별 Mark/Decorator 범위 조정 방식 비교

## 개요

텍스트 편집 시 mark/decorator 범위를 자동으로 조정하는 방식은 여러 에디터 프레임워크에서 사용되고 있습니다. 각 프레임워크의 접근 방식을 비교합니다.

## 주요 에디터 프레임워크

### 1. ProseMirror

**접근 방식:**
- **Schema 기반 Mark 정의**: Mark를 schema에 미리 정의
- **Transaction 기반 조정**: 텍스트 편집 시 Transaction을 통해 mark 범위 자동 조정
- **Step 기반**: 각 편집 작업을 Step으로 표현하고, Step이 mark 범위를 자동으로 조정

**특징:**
```typescript
// ProseMirror는 Transaction을 통해 mark 범위를 자동 조정
const tr = state.tr;
tr.insertText("new text", pos);
// ProseMirror가 자동으로 mark 범위를 조정
```

**장점:**
- Schema 기반으로 타입 안전성 보장
- Transaction 시스템이 자동으로 범위 조정 처리
- Undo/Redo 지원이 내장

**단점:**
- Schema 정의가 복잡할 수 있음
- 커스터마이징이 제한적일 수 있음

### 2. Slate.js

**접근 방식:**
- **Node 기반 모델**: 텍스트를 Node로 표현하고, 각 Node에 mark 정보 포함
- **Operation 기반**: 텍스트 편집을 Operation으로 표현하고, Operation이 mark 범위 조정
- **Normalize 함수**: 편집 후 normalize 함수로 일관성 유지

**특징:**
```typescript
// Slate는 Operation을 통해 mark 범위를 자동 조정
const operation = {
  type: 'insert_text',
  path: [0, 0],
  offset: 5,
  text: 'new'
};
// Slate가 자동으로 mark 범위를 조정
```

**장점:**
- 완전히 커스터마이징 가능
- React와 잘 통합
- 플러그인 시스템이 강력

**단점:**
- 학습 곡선이 가파름
- 직접 구현해야 할 부분이 많음

### 3. Draft.js

**접근 방식:**
- **ContentState 기반**: 텍스트와 스타일을 ContentState로 관리
- **Entity와 Decorator**: Entity는 메타데이터, Decorator는 스타일링
- **SelectionState 기반**: Selection을 기준으로 mark/decorator 적용

**특징:**
```typescript
// Draft.js는 Modifier를 통해 mark 범위를 자동 조정
const newContentState = Modifier.insertText(
  contentState,
  selectionState,
  'new text'
);
// Draft.js가 자동으로 Entity/Decorator 범위를 조정
```

**장점:**
- Facebook에서 개발하여 안정적
- React와 완벽 통합
- Immutable.js 기반으로 예측 가능

**단점:**
- Immutable.js 의존성
- 커스터마이징이 제한적
- 최근 업데이트가 적음

### 4. Quill

**접근 방식:**
- **Delta 기반**: 모든 변경을 Delta로 표현
- **Format 기반**: Mark를 Format으로 표현
- **Parchment**: 저수준 문서 모델

**특징:**
```typescript
// Quill은 Delta를 통해 format 범위를 자동 조정
const delta = new Delta()
  .retain(5)
  .insert('new text', { bold: true });
// Quill이 자동으로 format 범위를 조정
```

**장점:**
- Delta 형식이 직관적
- 성능이 우수
- 다양한 포맷 지원

**단점:**
- 커스터마이징이 어려울 수 있음
- 복잡한 구조 이해 필요

## 우리 구현 방식과의 비교

### 우리의 접근 방식

**핵심 특징:**
1. **MutationObserver 기반**: DOM 변경을 직접 감지
2. **Text Run Index**: DOM text node를 모델 offset으로 변환
3. **역변환 기반**: DOM에서 모델로 역변환하여 mark/decorator 범위 조정
4. **자동 범위 조정**: `adjustMarkRanges`, `adjustDecoratorRanges` 함수로 자동 조정

**구현:**
```typescript
// 1. DOM에서 텍스트 재구성
const newText = reconstructModelTextFromDOM(inlineTextNode);

// 2. 편집 위치 파악
const editPosition = convertDOMToModelPosition(domPosition, inlineTextNode);

// 3. Mark 범위 자동 조정
const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);

// 4. Decorator 범위 자동 조정
const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
```

### 차이점 비교

| 특징 | ProseMirror | Slate | Draft.js | Quill | **우리 구현** |
|------|-------------|-------|----------|-------|---------------|
| **변환 방식** | Transaction → Step | Operation → Transform | Modifier → ContentState | Delta → Parchment | **DOM → Model (역변환)** |
| **범위 조정** | 자동 (Step 내장) | 자동 (Operation 내장) | 자동 (Modifier 내장) | 자동 (Delta 내장) | **명시적 함수 호출** |
| **DOM 감지** | Transaction 기반 | Operation 기반 | onChange 이벤트 | Delta 기반 | **MutationObserver** |
| **역변환** | 없음 (단방향) | 없음 (단방향) | 없음 (단방향) | 없음 (단방향) | **있음 (양방향)** |

### 우리 방식의 장점

1. **역변환 지원**: DOM에서 모델로 역변환하여 항상 최신 상태 보장
2. **명시적 제어**: `adjustMarkRanges`, `adjustDecoratorRanges` 함수로 명시적 제어
3. **유연성**: 커스터마이징이 자유로움
4. **직접 DOM 감지**: MutationObserver로 DOM 변경을 직접 감지

### 우리 방식의 단점

1. **수동 구현**: 범위 조정 로직을 직접 구현해야 함
2. **복잡성**: Text Run Index 구축 등 추가 로직 필요
3. **테스트 부담**: 다양한 엣지 케이스 처리 필요

## "역변환해서 정의"의 의미

우리 구현에서 "역변환해서 정의"는 다음을 의미합니다:

### 1. DOM → Model 역변환

```typescript
// DOM에서 텍스트 재구성
const newText = reconstructModelTextFromDOM(inlineTextNode);

// DOM 위치 → 모델 위치 변환
const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
```

### 2. 편집 후 범위 역계산

```typescript
// 편집 정보로부터 mark 범위를 역으로 계산
const adjustedMarks = adjustMarkRanges(modelMarks, {
  editPosition: 6,
  insertedLength: 10,
  deletedLength: 0,
  delta: 10
});
```

### 3. 다른 에디터와의 차이

**다른 에디터들:**
- Model → DOM (단방향)
- 편집은 Model에서 시작
- DOM은 Model의 렌더링 결과

**우리 구현:**
- DOM → Model (역변환)
- 편집은 DOM에서 시작 (contenteditable)
- Model은 DOM의 역변환 결과

## 실제 사용 사례

### ProseMirror의 경우

```typescript
// ProseMirror는 Model 중심
const tr = state.tr;
tr.insertText("text", pos);
// Mark는 자동으로 조정되지만, DOM은 Model의 렌더링 결과
```

### 우리 구현의 경우

```typescript
// 우리는 DOM 중심 (contenteditable)
// 1. DOM에서 편집 발생 (MutationObserver 감지)
// 2. DOM → Model 역변환
const newText = reconstructModelTextFromDOM(inlineTextNode);
// 3. Model에서 mark 범위 조정
const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
// 4. Model 업데이트
editor.executeTransaction({ type: 'text_replace', ... });
// 5. Model → DOM 재렌더링
```

## 결론

우리가 구현한 방식은:

1. **역변환 기반**: DOM에서 모델로 역변환하여 항상 최신 상태 보장
2. **명시적 범위 조정**: `adjustMarkRanges`, `adjustDecoratorRanges` 함수로 명시적 제어
3. **contenteditable 친화적**: 브라우저의 contenteditable을 직접 활용

이는 다른 에디터 프레임워크들과는 다른 접근 방식이며, contenteditable 기반 에디터에 적합한 방식입니다.

