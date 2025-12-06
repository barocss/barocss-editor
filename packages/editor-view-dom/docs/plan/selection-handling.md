# Selection 처리 가이드

## 개요

이 문서는 Editor의 Model Selection과 DOM Selection 간의 변환 및 동기화 처리에 대한 가이드입니다. 특히 mark/decorator로 인해 분할된 text node를 올바르게 처리하는 방법을 설명합니다.

## 핵심 개념

### Model Selection vs DOM Selection

- **Model Selection**: Editor의 내부 표현 (`startNodeId`, `startOffset`, `endNodeId`, `endOffset`)
- **DOM Selection**: 브라우저의 Selection API (`anchorNode`, `anchorOffset`, `focusNode`, `focusOffset`)

### 텍스트 노드 분할 문제

모델에서는 하나의 연속된 텍스트 문자열을 가지고 있지만, DOM에서는 mark/decorator로 인해 여러 개의 text node로 분할될 수 있습니다:

```
Model: "bold and italic" (하나의 문자열, offset 0-15)

DOM:
<span data-bc-sid="text-bold-italic">
  <b>bold</b>           ← text node 1: "bold" (offset 0-4)
  <span> and </span>    ← text node 2: " and " (offset 4-9)
  <i>italic</i>         ← text node 3: "italic" (offset 9-15)
</span>
```

이런 분할 때문에 Model offset을 DOM offset으로 변환할 때 정확한 매칭이 필요합니다.

## 문제 상황

### 증상

1. 글자를 삭제한 후 커서가 잘못된 위치로 이동
2. `updateSelection`이 호출되어도 DOM selection이 적용되지 않음
3. `Elements are not text containers` 에러 발생

### Execution Flow 분석

```
1. executeCommand('deleteText') → selectionAfter: { startOffset: 14, endOffset: 14 }
2. updateSelection() 호출
3. editor:selection.model 이벤트 발생
4. convertRangeSelectionToDOM() 호출
5. ❌ Elements are not text containers 에러
6. ❌ DOM selection 적용 실패
```

## 문제 원인

### 1. `convertModelSelectionToDOM`이 `type: 'range'`를 처리하지 못함

**문제 코드:**
```typescript
convertModelSelectionToDOM(modelSelection: any): void {
  if (modelSelection.type === 'text') {
    this.convertTextSelectionToDOM(modelSelection);
  } else if (modelSelection.type === 'node') {
    this.convertNodeSelectionToDOM(modelSelection);
  }
  // ❌ type: 'range' 처리 없음
}
```

**결과**: 통일된 `ModelSelection` 형식(`type: 'range'`)을 처리하지 못하여 DOM selection이 적용되지 않음

### 2. `buildTextRunIndex`가 Element의 `textContent`를 사용하여 텍스트를 합침

**문제 코드:**
```typescript
// Element인 경우: textContent 사용 (내부의 모든 text node를 자동으로 합침)
const textContent = el.textContent ?? '';
const textForLength = options?.normalizeWhitespace !== false ? textContent.trim() : textContent;

if (textForLength.length > 0) {
  const firstTextNode = getFirstTextNode(el);
  // ❌ 첫 번째 text node만 사용, 나머지 text node는 무시
  const run: TextRun = { domTextNode: firstTextNode, start, end };
  runs.push(run);
}
```

**예시:**
```html
<span data-bc-sid="text-1">
  <b>bold</b>      ← text node 1
  <i>italic</i>    ← text node 2
</span>
```

- **수정 전**: `el.textContent = "bolditalic"` → 하나의 run으로 처리
- **수정 후**: 각 text node를 개별적으로 수집 → `"bold"`와 `"italic"`를 별도 run으로 처리

**결과**: mark/decorator로 분할된 text node를 개별적으로 수집하지 못하여 offset 매칭이 어긋남

### 3. `normalizeWhitespace`가 기본적으로 `true`여서 `trim()` 사용

**문제 코드:**
```typescript
const textForLength = options?.normalizeWhitespace !== false ? textContent.trim() : textContent;
```

**결과**: `trim()`으로 앞뒤 공백이 제거되어 실제 DOM offset과 모델 offset이 불일치

### 4. `isTextContainer` 체크가 실패

**문제 코드:**
```typescript
if (!this.isTextContainer(startElement) || !this.isTextContainer(endElement)) {
  console.warn('[SelectionHandler] Elements are not text containers');
  return; // ❌ selection 적용 실패
}
```

**결과**: `data-text-container="true"` 속성이 설정되지 않아 `findBestContainer`가 올바른 요소를 찾아도 체크에서 실패

## 해결 방법

### 1. `convertModelSelectionToDOM`에 `type: 'range'` 처리 추가

```typescript
convertModelSelectionToDOM(modelSelection: any): void {
  if (modelSelection.type === 'range') {
    this.convertRangeSelectionToDOM(modelSelection);
  } else if (modelSelection.type === 'node') {
    this.convertNodeSelectionToDOM(modelSelection);
  }
}
```

### 2. `buildTextRunIndex`에서 TreeWalker로 각 text node를 개별적으로 수집

```typescript
// TreeWalker를 사용하여 내부의 모든 text node를 개별적으로 수집
const walker = document.createTreeWalker(
  el,
  NodeFilter.SHOW_TEXT,
  {
    acceptNode: (node: Node) => {
      // decorator 하위인지 확인
      let parent: Node | null = node.parentNode;
      while (parent && parent !== el) {
        if (parent.nodeType === Node.ELEMENT_NODE) {
          const parentEl = parent as Element;
          if (isDecoratorElement(parentEl)) {
            return NodeFilter.FILTER_REJECT; // decorator 하위는 제외
          }
        }
        parent = parent.parentNode;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  }
);

let textNode: Text | null;
while ((textNode = walker.nextNode() as Text | null)) {
  const textContent = textNode.textContent ?? '';
  const textForLength = options?.normalizeWhitespace !== false ? textContent.trim() : textContent;
  
  if (textForLength.length > 0) {
    const length = textForLength.length;
    const start = total;
    const end = start + length;
    const run: TextRun = { domTextNode: textNode, start, end };
    runs.push(run);
    if (byNode) byNode.set(textNode, { start, end });
    total = end;
  }
}
```

**핵심**: `data-bc-sid` 하위의 모든 text node를 순서대로 수집하되, decorator 하위는 제외

### 3. `normalizeWhitespace: false` 전달

```typescript
private getTextRunsForContainer(container: Element): ContainerRuns | null {
  return buildTextRunIndex(container, undefined, {
    buildReverseMap: true,
    excludePredicate: (el) => this.isDecoratorElement(el),
    normalizeWhitespace: false // trim() 사용하지 않음
  });
}
```

**핵심**: 실제 DOM offset과 모델 offset을 정확히 매칭하기 위해 `trim()` 사용하지 않음

### 4. `isTextContainer` 체크 제거

```typescript
// findBestContainer를 사용하여 텍스트 컨테이너 찾기
const startElement = this.findBestContainer(startElementRaw);
const endElement = this.findBestContainer(endElementRaw);

if (!startElement || !endElement) {
  console.warn('[SelectionHandler] Could not find containers for model selection');
  return;
}

// ✅ isTextContainer 체크 제거 - findBestContainer가 이미 적절한 요소를 반환
```

**핵심**: `findBestContainer`가 이미 텍스트 컨테이너를 우선 찾고, 없으면 최초 `data-bc-sid` 요소를 반환하므로 추가 체크 불필요

## Text Run Index

### 개념

Text Run Index는 `data-bc-sid` 하위의 모든 text node를 순서대로 수집하여 Model offset과 DOM offset을 매핑하는 인덱스입니다.

### 구조

```typescript
interface TextRun {
  domTextNode: Text;  // 실제 DOM text node
  start: number;      // Model offset 시작 (inclusive)
  end: number;        // Model offset 끝 (exclusive)
}

interface ContainerRuns {
  runs: TextRun[];    // 모든 text run 배열
  total: number;      // 전체 텍스트 길이
  byNode?: Map<Text, { start: number; end: number }>; // 역방향 맵
}
```

### 예시

```html
<span data-bc-sid="text-bold-italic">
  <b>bold</b>
  <span> and </span>
  <i>italic</i>
</span>
```

**Text Run Index:**
```typescript
{
  runs: [
    { domTextNode: Text("bold"), start: 0, end: 4 },
    { domTextNode: Text(" and "), start: 4, end: 9 },
    { domTextNode: Text("italic"), start: 9, end: 15 }
  ],
  total: 15,
  byNode: Map([
    [Text("bold"), { start: 0, end: 4 }],
    [Text(" and "), { start: 4, end: 9 }],
    [Text("italic"), { start: 9, end: 15 }]
  ])
}
```

### Model offset → DOM offset 변환

```typescript
// Model offset 10을 DOM offset으로 변환
const runIndex = binarySearchRun(runs.runs, 10); // runIndex = 2 (italic run)
const run = runs.runs[runIndex];
const localOffset = 10 - run.start; // 10 - 9 = 1
// → Text("italic") 노드의 offset 1
```

## Selection 흐름

### Model → DOM (Model Selection을 DOM Selection으로 변환)

```
1. updateSelection(modelSelection)
   ↓
2. SelectionManager에 저장
   ↓
3. editor:selection.model 이벤트 발생
   ↓
4. EditorViewDOM이 이벤트 수신
   ↓
5. _pendingModelSelection에 저장
   ↓
6. render() 완료 후 reconcile 콜백에서 적용
   ↓
7. convertRangeSelectionToDOM(modelSelection)
   ↓
8. buildTextRunIndex()로 Text Run Index 생성
   ↓
9. findDOMRangeFromModelOffset()로 DOM offset 찾기
   ↓
10. window.getSelection().setRange()로 DOM selection 설정
```

### DOM → Model (DOM Selection을 Model Selection으로 변환)

```
1. selectionchange 이벤트 발생
   ↓
2. handleSelectionChange()
   ↓
3. convertDOMSelectionToModel(selection)
   ↓
4. findBestContainer()로 텍스트 컨테이너 찾기
   ↓
5. buildTextRunIndex()로 Text Run Index 생성
   ↓
6. convertOffsetWithRuns()로 Model offset 계산
   ↓
7. fromDOMSelection()로 통일된 ModelSelection 생성
   ↓
8. editor.updateSelection(modelSelection)
```

## 주의사항

### 1. Decorator 하위는 제외

Decorator는 시각적 표현만 담당하므로 selection 계산에서 제외해야 합니다:

```typescript
acceptNode: (node: Node) => {
  let parent: Node | null = node.parentNode;
  while (parent && parent !== el) {
    if (parent.nodeType === Node.ELEMENT_NODE) {
      const parentEl = parent as Element;
      if (isDecoratorElement(parentEl)) {
        return NodeFilter.FILTER_REJECT; // decorator 하위는 제외
      }
    }
    parent = parent.parentNode;
  }
  return NodeFilter.FILTER_ACCEPT;
}
```

### 2. `normalizeWhitespace: false` 사용

실제 DOM offset과 모델 offset을 정확히 매칭하기 위해 `trim()`을 사용하지 않아야 합니다:

```typescript
buildTextRunIndex(container, undefined, {
  normalizeWhitespace: false // ✅ trim() 사용하지 않음
});
```

### 3. 렌더링 완료 후 Selection 적용

렌더링이 완료되기 전에 selection을 적용하면 DOM이 아직 업데이트되지 않아 실패할 수 있습니다:

```typescript
this._domRenderer?.render(
  this.layers.content, 
  modelData, 
  allDecorators, 
  undefined, 
  selectionContext,
  {
    onComplete: () => {
      // ✅ Reconcile 완료 후 pending selection 적용
      if (this._pendingModelSelection) {
        requestAnimationFrame(() => {
          this.applyModelSelectionWithRetry();
        });
      }
    }
  }
);
```

## 관련 파일

- `packages/editor-view-dom/src/event-handlers/selection-handler.ts`: Selection 변환 로직
- `packages/renderer-dom/src/utils/text-run-index.ts`: Text Run Index 생성
- `packages/editor-view-dom/src/editor-view-dom.ts`: Selection 이벤트 처리
- `packages/editor-core/src/types.ts`: ModelSelection 타입 정의

## 참고

- Model Selection은 항상 `startNodeId`/`startOffset`/`endNodeId`/`endOffset` 형식을 사용합니다
- `anchor`/`focus` 형식은 레거시이며 더 이상 사용하지 않습니다
- 모든 converter 함수는 통일된 `ModelSelection` 형식을 사용합니다

