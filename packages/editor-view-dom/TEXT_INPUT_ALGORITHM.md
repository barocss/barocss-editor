# 텍스트 입력 알고리즘 정리

## 핵심 원칙

### 문제 상황
- MutationObserver는 **개별 text node**의 변경을 감지 (`oldValue`, `newValue`)
- 하지만 실제로는 **sid 기준**으로 비교해야 함
- 왜냐하면 mark/decorator로 인해 하나의 `inline-text` 노드가 **여러 text node로 분리**되기 때문

### 해결 방법

1. **sid 기준 텍스트 비교**
   - 모델: `modelNode.text` (sid 기준 전체 텍스트)
   - DOM: sid 기반 하위의 **모든 text node를 합친 값**

2. **Selection offset 정규화**
   - DOM selection offset → Model offset으로 변환
   - `convertDOMToModelPosition()` 사용

3. **변경점 감지**
   - Model offset 기준으로 변경 위치 파악
   - 공통 prefix/suffix 비교 또는 selection 기반

## 알고리즘 흐름

```
MutationObserver 감지 (개별 text node 변경)
    ↓
handleTextContentChange(oldValue, newValue, target)
    ↓
1. sid 추출 (resolveModelTextNodeId)
    ↓
2. 모델 텍스트 가져오기 (oldModelText = modelNode.text)
    ↓
3. DOM에서 sid 기준 전체 텍스트 재구성
   - buildTextRunIndex()로 모든 text node 수집
   - reconstructModelTextFromRuns()로 합치기
   - newText = 모든 text node의 textContent 합계
    ↓
4. oldModelText vs newText 비교
   - 같으면 변경 없음 → return
   - 다르면 편집 발생
    ↓
5. Selection offset을 Model offset으로 정규화
   - convertDOMToModelPosition() 사용
   - DOM textNode + DOM offset → Model offset
    ↓
6. 편집 위치 파악
   - Selection 기반 (우선)
   - 공통 prefix 비교 (fallback)
    ↓
7. Marks/Decorators 범위 조정
   - editPosition 기준으로 자동 조정
    ↓
8. 트랜잭션 실행
```

## 현재 코드의 문제점

### 문제 1: 개별 text node 비교

**현재 코드** (`handleTextContentChange`):
```typescript
if (oldText === newText) {
  console.log('[Input] SKIP: no text change');
  return;
}
```

**문제**: 
- `oldText`/`newText`는 개별 text node의 값
- mark/decorator로 분리된 경우 의미 없음

**해결**: 
- 이 체크를 제거하거나
- sid 기준 전체 텍스트 비교로 변경

### 문제 2: MutationObserver의 oldValue/newValue 사용

**현재 코드** (`handleEfficientEdit`):
```typescript
export function handleEfficientEdit(
  textNode: Text,
  oldValue: string | null,  // ❌ 개별 text node의 값
  newValue: string | null,  // ❌ 개별 text node의 값
  oldModelText: string,      // ✅ sid 기준 전체 텍스트
  ...
)
```

**문제**:
- `oldValue`/`newValue`는 사용하지 않음 (주석에도 명시됨)
- `reconstructModelTextFromRuns()`로 전체 텍스트를 재구성함

**해결**:
- `oldValue`/`newValue` 파라미터 제거 또는 무시
- 항상 sid 기준 전체 텍스트 재구성

## 올바른 알고리즘

### 1단계: sid 추출 및 모델 텍스트 가져오기

```typescript
// sid 추출
const textNodeId = this.resolveModelTextNodeId(target);
if (!textNodeId) return;

// 모델 텍스트 가져오기 (sid 기준)
const modelNode = this.editor.dataStore.getNode(textNodeId);
const oldModelText = modelNode.text || '';
```

### 2단계: DOM에서 sid 기준 전체 텍스트 재구성

```typescript
// inline-text 노드 찾기
const inlineTextNode = findInlineTextNode(textNode);
const nodeId = inlineTextNode.getAttribute('data-bc-sid');

// Text Run Index 구축 (모든 text node 수집)
const runs = buildTextRunIndex(inlineTextNode, nodeId, {
  buildReverseMap: true,
  normalizeWhitespace: false
});

// 모든 text node의 텍스트를 합쳐서 재구성
const newText = reconstructModelTextFromRuns(runs);
// 또는
const newText = runs.runs
  .map(run => run.domTextNode.textContent || '')
  .join('');
```

### 3단계: sid 기준 텍스트 비교

```typescript
// 개별 text node 비교가 아닌 sid 기준 전체 텍스트 비교
if (newText === oldModelText) {
  return; // 변경 없음
}
```

### 4단계: Selection offset을 Model offset으로 정규화

```typescript
const selection = window.getSelection();
let editPosition: number | undefined;

if (selection && selection.rangeCount > 0) {
  const range = selection.getRangeAt(0);
  if (range.startContainer.nodeType === Node.TEXT_NODE) {
    const domPosition: DOMEditPosition = {
      textNode: range.startContainer as Text,
      offset: range.startOffset  // DOM offset
    };
    
    // DOM offset → Model offset 변환
    const modelPos = convertDOMToModelPosition(domPosition, inlineTextNode);
    if (modelPos) {
      editPosition = modelPos.offset;  // Model offset
    }
  }
}
```

**변환 과정**:
1. `findInlineTextNode()`로 inline-text 노드 찾기
2. `buildTextRunIndex()`로 Text Run Index 구축
3. `convertDOMOffsetToModelOffset()`로 변환
   - textNode가 속한 run 찾기
   - run.start + domOffset = modelOffset

### 5단계: 편집 위치 파악

```typescript
// Selection 기반 (우선)
if (editPosition === undefined) {
  // 공통 prefix 비교 (fallback)
  editPosition = findCommonPrefix(oldModelText, newText);
}
```

### 6단계: Marks/Decorators 범위 조정

```typescript
const editInfo: TextEdit = {
  nodeId,
  oldText: oldModelText,  // sid 기준 전체 텍스트
  newText: newText,       // sid 기준 전체 텍스트
  editPosition,           // Model offset
  ...
};

// Model offset 기준으로 범위 조정
const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
```

## 핵심 포인트

1. **항상 sid 기준으로 비교**
   - 개별 text node의 `oldValue`/`newValue`는 무시
   - 항상 전체 텍스트 재구성

2. **Selection offset 정규화**
   - DOM offset → Model offset 변환 필수
   - `convertDOMToModelPosition()` 사용

3. **Text Run Index 활용**
   - 모든 text node를 수집하고 순서대로 합치기
   - DOM offset을 Model offset으로 변환

4. **변경점 감지**
   - Model offset 기준으로 변경 위치 파악
   - 공통 prefix/suffix 비교 또는 selection 기반

## 예시

### 시나리오: mark가 적용된 텍스트에 입력

**초기 상태**:
```
Model: "Hello World" (marks: [{type: 'bold', range: [6, 11]}])
DOM: 
  <span data-bc-sid="text-1">
    "Hello " (text node 1)
    <strong>"World"</strong> (text node 2)
  </span>
```

**사용자가 "Hello " 뒤에 "Beautiful " 입력**:
```
MutationObserver 감지:
  - text node 1 변경: "Hello " → "Hello Beautiful "
  - oldValue: "Hello "
  - newValue: "Hello Beautiful "
```

**알고리즘 실행**:
1. sid 추출: `text-1`
2. 모델 텍스트: `oldModelText = "Hello World"`
3. DOM 텍스트 재구성:
   - text node 1: "Hello Beautiful "
   - text node 2: "World"
   - `newText = "Hello Beautiful World"`
4. 비교: `"Hello World" !== "Hello Beautiful World"` → 변경 있음
5. Selection offset 정규화:
   - DOM: text node 1, offset 16 ("Hello Beautiful "의 끝)
   - Model: offset 6 (원래 "Hello "의 끝)
6. 편집 위치: Model offset 6
7. Marks 조정:
   - 원래: `[{type: 'bold', range: [6, 11]}]`
   - 조정: `[{type: 'bold', range: [16, 21]}]` (+10 offset)

## 개선 방향

1. `handleTextContentChange`에서 개별 text node 비교 제거
2. `handleEfficientEdit`에서 `oldValue`/`newValue` 파라미터 제거 또는 무시
3. 항상 sid 기준 전체 텍스트 재구성 및 비교
4. Selection offset 정규화 강화

