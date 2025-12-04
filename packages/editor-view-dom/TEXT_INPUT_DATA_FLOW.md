# 텍스트 입력 시 데이터 변경 흐름

## 전체 흐름도

```
사용자 입력 (키보드)
    ↓
DOM 변경 (ContentEditable)
    ↓
MutationObserver 감지
    ↓
InputHandler.handleTextContentChange()
    ↓
handleEfficientEdit() - 텍스트 분석 & mark/decorator 조정
    ↓
Editor.executeTransaction() - 트랜잭션 실행
    ↓
_applyBasicTransaction() - 실제 모델 업데이트
    ↓
editor:content.change 이벤트 발생
    ↓
EditorViewDOM.render() - 재렌더링
```

## 단계별 상세 설명

### 1단계: MutationObserver가 DOM 변경 감지

**파일**: `packages/editor-view-dom/src/mutation-observer/mutation-observer-manager.ts`

```typescript
onTextChange: (event: any) => {
  // DOM에서 텍스트 변경 감지
  const info = {
    oldText: event.oldText,      // 변경 전 텍스트 (개별 text node)
    newText: event.newText,      // 변경 후 텍스트 (개별 text node)
    nodeId: (t && t.getAttribute && t.getAttribute('data-bc-sid')) || ...,
    nodeType: (t && t.getAttribute && t.getAttribute('data-bc-stype')) || ...
  };
  console.log('[MO] onTextChange', info);
  
  // InputHandler로 전달
  this.inputHandler.handleTextContentChange(event.oldText, event.newText, event.target);
}
```

**중요**: `oldText`/`newText`는 **개별 text node**의 값입니다. 하지만 실제 비교는 `sid` 기준 **전체 텍스트**로 해야 합니다.

---

### 2단계: InputHandler가 변경 처리

**파일**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

#### 2-1. 기본 검증 및 필터링

```typescript
handleTextContentChange(oldValue: string | null, newValue: string | null, target: Node): void {
  // 1. filler <br> 체크 (커서 안정화)
  if (target.nodeType === Node.ELEMENT_NODE) {
    const el = target as Element;
    const hasFiller = el.querySelector('br[data-bc-filler="true"]');
    if (hasFiller) return; // 건너뜀
  }

  // 2. textNodeId 추출 (data-bc-sid)
  const textNodeId = this.resolveModelTextNodeId(target);
  if (!textNodeId) return; // 추적 불가능한 텍스트

  // 3. IME 조합 중인지 체크
  if (this.isComposing) {
    // 조합 중에는 pending에 저장하고 나중에 처리
    this.pendingTextNodeId = textNodeId;
    this.pendingOldText = oldValue || '';
    this.pendingNewText = newValue || '';
    return;
  }

  // 4. Range 선택 체크 (collapsed만 처리)
  if (selection.length !== 0) return;

  // 5. 활성 노드 체크 (커서 튀는 현상 방지)
  if (this.activeTextNodeId && textNodeId !== this.activeTextNodeId) return;
}
```

#### 2-2. 모델 데이터 가져오기

```typescript
  // 모델에서 현재 노드 정보 가져오기
  const modelNode = (this.editor as any).dataStore?.getNode?.(textNodeId);
  if (!modelNode) return;

  const oldModelText = modelNode.text || '';  // 모델의 전체 텍스트
  
  // Marks 정규화 (IMark → MarkRange 변환)
  const rawMarks = modelNode.marks || [];
  const modelMarks: MarkRange[] = rawMarks
    .filter((mark: any) => mark && (mark.type || mark.stype))
    .map((mark: any) => {
      const markType = mark.type || mark.stype; // IMark는 stype, MarkRange는 type
      // range가 없으면 전체 텍스트 범위로 설정
      if (!mark.range || !Array.isArray(mark.range) || mark.range.length !== 2) {
        return {
          type: markType,
          range: [0, oldModelText.length] as [number, number],
          attrs: mark.attrs || mark.attributes || {}
        };
      }
      return {
        type: markType,
        range: mark.range as [number, number],
        attrs: mark.attrs || mark.attributes || {}
      };
    });
  
  const decorators = (this.editor as any).getDecorators?.() || [];
```

**중요**: 
- `oldModelText`는 **모델의 전체 텍스트**입니다 (sid 기준).
- `oldValue`/`newValue`는 **개별 text node**의 값이므로 비교에 사용하지 않습니다.

---

### 3단계: handleEfficientEdit로 텍스트 분석

**파일**: `packages/editor-view-dom/src/utils/efficient-edit-handler.ts`

#### 3-1. DOM에서 전체 텍스트 재구성

```typescript
export function handleEfficientEdit(
  textNode: Text,
  oldModelText: string,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[]
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} | null {
  // 1. inline-text 노드 찾기 (sid 추출)
  const inlineTextNode = findInlineTextNode(textNode);
  const nodeId = inlineTextNode.getAttribute('data-bc-sid');
  
  // 2. Text Run Index 구축
  // sid 기반 하위의 모든 text node를 수집
  const runs = buildTextRunIndex(inlineTextNode, nodeId, {
    buildReverseMap: true,
    normalizeWhitespace: false
  });
  
  // 3. DOM에서 sid 기준 전체 텍스트 재구성
  // 모든 text node를 합쳐서 재구성
  const newText = reconstructModelTextFromRuns(runs);
  
  // 4. sid 기준 텍스트 비교
  if (newText === oldModelText) {
    return null; // 변경 없음
  }
```

**핵심**: 
- `oldModelText`: 모델의 전체 텍스트 (비교 대상)
- `newText`: DOM에서 재구성한 전체 텍스트 (변경 후)
- **개별 text node가 아닌 전체 텍스트로 비교**합니다.

#### 3-2. Selection Offset 정규화

```typescript
  // 5. Selection offset을 Model offset으로 정규화
  const selection = window.getSelection();
  let selectionOffset: number = 0;
  let selectionLength: number = 0;
  
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
        selectionOffset = modelPos.offset;  // Model offset (normalized)
      }
    }
  }
```

**핵심**: DOM의 `offset`은 mark/decorator로 인해 모델 `offset`과 다를 수 있으므로, **Text Run Index를 사용하여 정규화**합니다.

#### 3-3. 텍스트 변경 분석 (LCP/LCS 알고리즘)

```typescript
  // 6. text-analyzer의 analyzeTextChanges 사용
  const textChanges = analyzeTextChanges({
    oldText: oldModelText,
    newText: newText,
    selectionOffset: selectionOffset,
    selectionLength: selectionLength
  });
  
  if (textChanges.length === 0) {
    return null; // 변경사항 없음
  }
  
  // 첫 번째 TextChange를 TextEdit로 변환
  const firstChange = textChanges[0];
  return createEditInfoFromTextChange(
    nodeId,
    oldModelText,
    newText,
    inlineTextNode,
    modelMarks,
    decorators,
    firstChange
  );
}
```

**핵심**: `@barocss/text-analyzer` 패키지의 `analyzeTextChanges` 함수를 사용하여:
- LCP/LCS 알고리즘으로 정확한 변경 범위 계산
- Selection 바이어싱으로 사용자 의도 반영
- 유니코드 정규화 (NFC)
- 안전한 문자 분할

#### 3-4. Mark/Decorator 범위 조정

```typescript
function createEditInfoFromTextChange(
  nodeId: string,
  oldText: string,
  newText: string,
  inlineTextNode: Element,
  modelMarks: MarkRange[],
  decorators: DecoratorRange[],
  textChange: TextChange
): {
  newText: string;
  adjustedMarks: MarkRange[];
  adjustedDecorators: DecoratorRange[];
  editInfo: TextEdit;
} {
  // TextChange를 TextEdit로 변환
  const editInfo: TextEdit = {
    nodeId,
    oldText,
    newText,
    editPosition: textChange.start,  // 정확한 시작 위치
    editType: textChange.type,       // 'insert' | 'delete' | 'replace'
    insertedLength: textChange.text.length,
    deletedLength: textChange.end - textChange.start
  };
  
  // Mark 범위 조정 (편집 위치에 따라 자동 조정)
  const adjustedMarks = adjustMarkRanges(modelMarks, editInfo);
  
  // Decorator 범위 조정
  const adjustedDecorators = adjustDecoratorRanges(decorators, nodeId, editInfo);
  
  return {
    newText,
    adjustedMarks,
    adjustedDecorators,
    editInfo
  };
}
```

**핵심**: 
- 텍스트 편집에 따라 **marks와 decorators의 범위를 자동으로 조정**합니다.
- 예: "Hello **World**"에서 "World" 앞에 "New "를 입력하면, bold mark의 범위가 `[6, 11]` → `[10, 15]`로 이동합니다.

---

### 4단계: Editor 트랜잭션 실행

**파일**: `packages/editor-view-dom/src/event-handlers/input-handler.ts`

```typescript
  // 텍스트 및 Marks 업데이트 트랜잭션 (한 번에 처리)
  const marksChanged = marksChangedEfficient(modelMarks, editResult.adjustedMarks);
  
  // 전체 텍스트 교체 방식 (start=0, end=전체길이, text=새텍스트)
  this.editor.executeTransaction({
    type: 'text_replace',
    nodeId: textNodeId,
    start: 0,
    end: oldModelText.length,  // 전체 텍스트 길이
    text: editResult.newText,  // 새로운 전체 텍스트
    // marks가 변경된 경우에만 포함
    ...(marksChanged ? { marks: editResult.adjustedMarks } : {})
  } as any);

  // Decorators 업데이트 (변경된 경우만)
  const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
  if (decoratorsChanged && (this.editor as any).updateDecorators) {
    (this.editor as any).updateDecorators(editResult.adjustedDecorators);
  }
```

**핵심**: 
- `text_replace` 트랜잭션으로 텍스트와 marks를 한 번에 업데이트합니다.
- Decorators는 별도로 업데이트합니다.

---

### 5단계: 실제 모델 업데이트

**파일**: `packages/editor-core/src/editor.ts`

#### 5-1. executeTransaction

```typescript
executeTransaction(transaction: Transaction): void {
  console.log('[Editor] executeTransaction', { type: (transaction as any)?.type });
  try {
    // Lightweight model mutation bridge for demo
    this._applyBasicTransaction(transaction as any);
    
    // 문서 변경 시 히스토리에 추가
    this._addToHistory(this._document);
    
    this.emit('transactionExecuted', { transaction });
    // 콘텐츠 변경 이벤트 발생
    this.emit('editor:content.change', { content: this.document, transaction });
    
    // 모델 selection이 트랜잭션에 포함된 경우
    const selAfter = (transaction as any)?.selectionAfter;
    if (selAfter) {
      this.emit('editor:selection.model', selAfter as any);
    }
  } catch (error) {
    console.error('Transaction execution failed:', error);
    this.emit('transactionError', { transaction, error });
  }
}
```

#### 5-2. _applyBasicTransaction (실제 데이터 변경)

```typescript
private _applyBasicTransaction(tx: any): void {
  if (!tx || !tx.type) return;
  
  if (tx.type === 'text_replace') {
    const nodeId = tx.nodeId;
    const node = this._dataStore?.getNode?.(nodeId);
    if (!node) return;
    
    const oldText: string = (node as any).text || '';
    const start: number = tx.start ?? 0;
    const end: number = tx.end ?? start;
    const insertText: string = tx.text ?? '';
    
    // 텍스트 교체 계산
    // input-handler에서는 start=0, end=전체길이, text=새텍스트로 보내므로
    // 실제로는 전체 교체가 됨: oldText.slice(0, 0) + newText + oldText.slice(전체길이) = newText
    const newText = oldText.slice(0, start) + insertText + oldText.slice(end);
    
    // 노드 업데이트 (텍스트 + marks)
    const updatedNode: any = {
      ...node,
      text: newText,
      metadata: { ...(node as any).metadata, updatedAt: new Date() }
    };
    
    // Marks 업데이트 (제공된 경우)
    if (tx.marks !== undefined) {
      // MarkRange 형식 그대로 저장 (DataStore가 정규화 처리)
      updatedNode.marks = tx.marks;
    }
    
    // DataStore에 저장
    this._dataStore?.setNode?.(updatedNode);
  }
}
```

**핵심**: 
- `dataStore.setNode()`로 노드 전체 업데이트 (텍스트 + marks)
- `tx.marks`는 `MarkRange[]` 형식 그대로 저장 (DataStore가 필요시 정규화)
- 실제로는 `MarkRange` (type 사용)가 그대로 저장되지만, DataStore에서 읽을 때 `IMark` (stype 사용)로 변환될 수 있음

---

### 6단계: 재렌더링

**파일**: `packages/editor-view-dom/src/editor-view-dom.ts`

```typescript
// editor:content.change 이벤트 핸들러
this.editor.on('editor:content.change' as any, (e: any) => {
  if (this._isComposing) {
    console.log('[EditorViewDOM] content.change (composing=true) skip render');
    return;
  }
  console.log('[EditorViewDOM] content.change -> render with diff');
  this.render();
  // 렌더 후 selection 재적용 시도
  this.applyModelSelectionWithRetry();
});
```

**핵심**: 
- `editor:content.change` 이벤트가 발생하면 `render()` 호출
- IME 조합 중에는 재렌더링 건너뜀 (브라우저에 맡김)

---

## 데이터 구조 변환 요약

### 1. IMark (DataStore) ↔ MarkRange (EditorViewDOM)

```typescript
// IMark (DataStore)
interface IMark {
  stype: string;              // ← type이 아니라 stype
  attrs?: Record<string, any>;
  range?: [number, number];   // ← optional
}

// MarkRange (EditorViewDOM)
interface MarkRange {
  type: string;                // ← stype이 아니라 type
  range: [number, number];    // ← 필수
  attrs?: Record<string, any>;
}

// 변환 로직 (input-handler.ts)
const modelMarks: MarkRange[] = rawMarks
  .filter((mark: any) => mark && (mark.type || mark.stype))
  .map((mark: any) => {
    const markType = mark.type || mark.stype; // IMark는 stype, MarkRange는 type
    return {
      type: markType,
      range: mark.range || [0, oldModelText.length],
      attrs: mark.attrs || mark.attributes || {}
    };
  });
```

### 2. 트랜잭션 실행 시 역변환

```typescript
// _applyBasicTransaction에서
if (tx.marks !== undefined) {
  const marks = tx.marks.map((m: any) => ({
    stype: m.type,  // MarkRange.type → IMark.stype
    range: m.range,
    attrs: m.attrs
  }));
  this._dataStore?.marks?.setMarks?.(nodeId, marks, { normalize: true });
}
```

---

## 예시 시나리오

### 시나리오: "Hello **World**"에서 "World" 앞에 "New " 입력

1. **MutationObserver 감지**
   - `oldText`: "World"
   - `newText`: "New World"
   - `target`: `<span class="mark-bold">World</span>` 내부의 Text Node

2. **InputHandler 처리**
   - `textNodeId`: "text-bold" (inline-text의 sid)
   - `oldModelText`: "Hello World" (모델의 전체 텍스트)
   - `modelMarks`: `[{ type: 'bold', range: [6, 11] }]`

3. **handleEfficientEdit 분석**
   - `newText`: "Hello New World" (DOM에서 재구성)
   - `textChanges`: `[{ type: 'insert', start: 6, end: 6, text: 'New ' }]`
   - `adjustedMarks`: `[{ type: 'bold', range: [10, 15] }]` (범위 자동 조정)

4. **트랜잭션 실행**
   ```typescript
   editor.executeTransaction({
     type: 'text_replace',
     nodeId: 'text-bold',
     start: 0,
     end: 11,
     text: 'Hello New World',
     marks: [{ type: 'bold', range: [10, 15] }]
   });
   ```

5. **모델 업데이트**
   - `dataStore.updateNode('text-bold', { text: 'Hello New World' })`
   - `dataStore.marks.setMarks('text-bold', [{ stype: 'bold', range: [10, 15] }])`

6. **재렌더링**
   - `editor:content.change` 이벤트 발생
   - `EditorViewDOM.render()` 호출
   - DOM이 새로운 모델 상태로 업데이트됨

---

## 핵심 원칙

1. **sid 기준 전체 텍스트 비교**: 개별 text node가 아닌 `sid` 기준 전체 텍스트로 비교
2. **Selection Offset 정규화**: DOM offset을 Model offset으로 변환
3. **자동 범위 조정**: 텍스트 편집에 따라 marks/decorators 범위 자동 조정
4. **LCP/LCS 알고리즘**: 정확한 변경 범위 계산
5. **IME 처리**: 조합 중에는 pending에 저장하고 나중에 처리

