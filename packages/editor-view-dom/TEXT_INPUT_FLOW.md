# EditorViewDOM 글자 입력 반응 흐름

## 전체 흐름 개요

```
사용자 키보드 입력
    ↓
브라우저 이벤트 발생 (input, beforeinput, compositionstart/update/end)
    ↓
EditorViewDOM 이벤트 핸들러 (handleInput, handleCompositionStart 등)
    ↓
브라우저가 DOM에 텍스트 변경 적용
    ↓
MutationObserver가 DOM 변경 감지
    ↓
InputHandler.handleTextContentChange() 호출
    ↓
handleEfficientEdit()로 텍스트 변경 분석 및 marks/decorators 조정
    ↓
Editor.executeTransaction()으로 모델 업데이트
    ↓
Editor가 'editor:content.change' 이벤트 발생
    ↓
EditorViewDOM이 render() 호출하여 재렌더링
```

## 단계별 상세 설명

### 1. 이벤트 리스너 등록 (초기화)

**위치**: `setupEventListeners()` (line 244-290)

```typescript
// 입력 이벤트
this.contentEditableElement.addEventListener('input', this.handleInput.bind(this));
this.contentEditableElement.addEventListener('beforeinput', this.handleBeforeInput.bind(this));
this.contentEditableElement.addEventListener('keydown', this.handleKeydown.bind(this));

// 조합 이벤트 (IME - 한국어, 일본어, 중국어 입력)
this.contentEditableElement.addEventListener('compositionstart', this.handleCompositionStart.bind(this));
this.contentEditableElement.addEventListener('compositionupdate', this.handleCompositionUpdate.bind(this));
this.contentEditableElement.addEventListener('compositionend', this.handleCompositionEnd.bind(this));

// 콘텐츠 변경 시 재렌더링
this.editor.on('editor:content.change', (e: any) => {
  if (this._isComposing) return; // IME 조합 중에는 재렌더링 건너뜀
  this.render();
  this.applyModelSelectionWithRetry();
});
```

**MutationObserver 설정** (line 95):
```typescript
this.mutationObserverManager.setup(this.contentEditableElement);
```

### 2. 사용자 입력 감지

#### 2-1. 일반 텍스트 입력 (영문, 숫자 등)

**흐름**:
1. 사용자가 키보드 입력
2. 브라우저가 `input` 이벤트 발생
3. `handleInput()` 호출 (line 344-346)
   ```typescript
   handleInput(event: InputEvent): void {
     this.inputHandler.handleInput(event); // 단순 로깅용
   }
   ```
4. 브라우저가 DOM에 텍스트 변경 적용

#### 2-2. IME 입력 (한국어, 일본어, 중국어)

**흐름**:
1. `compositionstart` → `handleCompositionStart()` (line 352-356)
   - `_isComposing = true` 설정
   - 모델 업데이트 차단 시작

2. `compositionupdate` → `handleCompositionUpdate()` (line 358-361)
   - 조합 중간 상태 (예: "ㅎㅏㄴ" → "한")
   - 모델 업데이트 하지 않음

3. `compositionend` → `handleCompositionEnd()` (line 363-370)
   - `_isComposing = false` 설정
   - 보류된 변경사항 커밋
   - 재렌더링 및 selection 복원

### 3. DOM 변경 감지 (MutationObserver)

**위치**: `mutation-observer-manager.ts`

```typescript
// MutationObserver가 DOM 변경 감지
onTextChange: (event: any) => {
  // InputHandler로 전달
  this.inputHandler.handleTextContentChange(
    event.oldText, 
    event.newText, 
    event.target
  );
}
```

**특징**:
- 브라우저가 DOM에 변경을 적용한 **후**에 감지
- `oldText`와 `newText`를 비교하여 변경사항 파악
- `target` 노드에서 `data-bc-sid` 속성으로 모델 노드 식별 (로깅용, 실제 추출은 InputHandler에서)

**로그**:
```
[MO] onTextChange {
  oldText: "Hello",
  newText: "HelloW",
  nodeId: "text-7",        // 로깅용 (실제 추출은 InputHandler에서)
  nodeType: "inline-text" // 로깅용
}
```

### 4. 텍스트 변경 처리 (InputHandler)

**위치**: `event-handlers/input-handler.ts` → `handleTextContentChange()` (line 74-239)

#### 4-1. 사전 검증 (순차적 체크)

```typescript
// 1. filler <br> 체크 (커서 안정화)
if (target.nodeType === Node.ELEMENT_NODE) {
  const el = target as Element;
  const hasFiller = el.querySelector('br[data-bc-filler="true"]');
  if (hasFiller) {
    console.log('[Input] SKIP: filler <br> detected');
    return;
  }
}

// 2. 텍스트 변경 없음
if (oldText === newText) {
  console.log('[Input] SKIP: no text change');
  return;
}

// 3. 모델 노드 ID 확인 (closest('[data-bc-sid]') 사용)
const textNodeId = this.resolveModelTextNodeId(target);
if (!textNodeId) {
  console.log('[Input] SKIP: untracked text (no nodeId)');
  return; // 추적 불가능한 텍스트
}

// 4. IME 조합 중인지 확인
if (this.isComposing) {
  console.log('[Input] SKIP: composition in progress, storing pending');
  // pending에 저장하고 나중에 처리
  this.pendingTextNodeId = textNodeId;
  this.pendingOldText = oldText;
  this.pendingNewText = newText;
  // 조합 종료 누락 대비: 400ms 무입력 시 커밋
  this.pendingTimer = setTimeout(() => this.commitPendingImmediate(), 400);
  return;
}

// 5. Range 선택이 아닌지 확인 (collapsed만 처리)
if (selection.length !== 0) {
  console.log('[Input] SKIP: range selection (not collapsed)');
  return;
}

// 6. 활성 텍스트 노드 확인 (커서 튀는 현상 방지)
// activeTextNodeId가 null이면 체크하지 않음 (초기 입력 시)
if (this.activeTextNodeId && textNodeId && textNodeId !== this.activeTextNodeId) {
  console.log('[Input] SKIP: inactive node');
  return;
}
```

#### 4-1-1. resolveModelTextNodeId() - nodeId 추출

**위치**: `event-handlers/input-handler.ts` → `resolveModelTextNodeId()` (line 349-371)

```typescript
private resolveModelTextNodeId(target: Node): string | null {
  // Text 노드면 parentElement, Element면 그대로 사용
  let el: Element | null = null;
  if (target.nodeType === Node.TEXT_NODE) {
    el = (target.parentElement as Element | null);
  } else if (target.nodeType === Node.ELEMENT_NODE) {
    el = target as Element;
  }
  
  if (!el) return null;
  
  // closest()를 사용하여 가장 가까운 data-bc-sid 속성을 가진 요소 찾기
  const foundEl = el.closest('[data-bc-sid]');
  if (foundEl) {
    return foundEl.getAttribute('data-bc-sid');
  }
  
  return null;
}
```

**핵심**:
- `closest('[data-bc-sid]')`를 사용하여 부모 요소를 따라 올라가며 `data-bc-sid` 속성을 가진 첫 번째 요소를 찾음
- `data-bc-stype` 체크 없이 단순히 `data-bc-sid`만 확인
- 네이티브 DOM API를 사용하여 효율적이고 간단함

#### 4-2. 모델 데이터 가져오기

```typescript
// 모델에서 현재 노드 정보 가져오기
const modelNode = (this.editor as any).dataStore?.getNode?.(textNodeId);
if (!modelNode) {
  console.log('[Input] SKIP: model node not found');
  return;
}

const oldModelText = modelNode.text || '';
const modelMarks = modelNode.marks || [];
const decorators = (this.editor as any).getDecorators?.() || [];

console.log('[Input] model data retrieved', {
  oldModelText: oldModelText.slice(0, 20),
  modelMarksCount: modelMarks.length,
  decoratorsCount: decorators.length
});
```

**핵심**:
- `dataStore.getNode(textNodeId)`로 모델 노드 조회
- 노드가 없으면 early return
- 텍스트, marks, decorators 정보 수집

#### 4-3. 효율적인 편집 처리

**위치**: `utils/efficient-edit-handler.ts` → `handleEfficientEdit()`

```typescript
const editResult = handleEfficientEdit(
  textNode,        // DOM 텍스트 노드
  oldText,         // DOM 변경 전 텍스트
  newText,         // DOM 변경 후 텍스트
  oldModelText,    // 모델의 원본 텍스트
  modelMarks,      // 모델의 marks
  decorators       // 모델의 decorators
);
```

**동작**:
1. DOM 텍스트 노드에서 전체 텍스트 재구성
2. 변경 위치 감지 (공통 prefix/suffix 비교)
3. Marks 범위 자동 조정 (텍스트 삽입/삭제에 따라)
4. Decorators 범위 자동 조정 (텍스트 삽입/삭제에 따라)
5. 새로운 텍스트, 조정된 marks, 조정된 decorators 반환

**반환값**:
```typescript
{
  newText: string;              // 최종 텍스트
  adjustedMarks: MarkRange[];   // 조정된 marks
  adjustedDecorators: DecoratorRange[]; // 조정된 decorators
  editInfo: TextEdit;           // 편집 정보
}
```

#### 4-4. 모델 업데이트 (트랜잭션 실행)

```typescript
// 효율적인 변경 감지 (JSON.stringify 대신 최적화된 함수 사용)
const marksChanged = marksChangedEfficient(modelMarks, editResult.adjustedMarks);

console.log('[Input] executing transaction', {
  nodeId: textNodeId,
  textLength: editResult.newText.length,
  marksChanged
});

// 텍스트 및 Marks 업데이트 (한 번에 처리)
this.editor.executeTransaction({
  type: 'text_replace',
  nodeId: textNodeId,
  start: 0,
  end: oldModelText.length,
  text: editResult.newText,
  // marks가 변경된 경우에만 포함
  ...(marksChanged ? { marks: editResult.adjustedMarks } : {})
});

// Decorators 업데이트 (변경된 경우만)
const decoratorsChanged = JSON.stringify(editResult.adjustedDecorators) !== JSON.stringify(decorators);
if (decoratorsChanged && (this.editor as any).updateDecorators) {
  console.log('[Input] updating decorators', { count: editResult.adjustedDecorators.length });
  (this.editor as any).updateDecorators(editResult.adjustedDecorators);
}

console.log('[Input] handleTextContentChange END - transaction executed');
```

**핵심**:
- `marksChangedEfficient()` 함수로 marks 변경 여부를 효율적으로 감지
- marks가 변경된 경우에만 트랜잭션에 포함 (성능 최적화)
- Decorators는 별도로 업데이트 (변경된 경우만)

### 5. Editor 트랜잭션 처리

**위치**: `packages/editor-core/src/editor.ts` → `executeTransaction()`

```typescript
executeTransaction(transaction: Transaction): void {
  // 1. 모델에 변경사항 적용
  this._applyBasicTransaction(transaction);
  
  // 2. 히스토리에 추가
  this._addToHistory(this._document);
  
  // 3. 이벤트 발생
  this.emit('transactionExecuted', { transaction });
  this.emit('editor:content.change', { content: this.document, transaction });
  
  // 4. Selection 변경 시 이벤트 발생
  if (transaction.selectionAfter) {
    this.emit('editor:selection.model', transaction.selectionAfter);
  }
}
```

### 6. 재렌더링 (EditorViewDOM)

**위치**: `editor-view-dom.ts` → `render()` (line 803-1022)

**트리거**: `editor:content.change` 이벤트 (line 274-283)

```typescript
this.editor.on('editor:content.change', (e: any) => {
  if (this._isComposing) {
    // IME 조합 중에는 재렌더링 건너뜀
    return;
  }
  
  // 전체 재렌더링 (diff 기반)
  this.render();
  
  // Selection 복원
  this.applyModelSelectionWithRetry();
});
```

**render() 동작**:
1. 모델 데이터 가져오기 (`editor.getDocumentProxy()`)
2. Decorators 수집 (로컬 + 원격 + generator)
3. Selection 정보 수집 (보존용)
4. Content 레이어 렌더링 (동기)
5. 다른 레이어들 렌더링 (비동기, requestAnimationFrame)

## 특수 케이스

### IME 조합 중 처리

**문제**: IME 입력 중에는 브라우저가 여러 번 DOM을 변경하지만, 최종 완성된 텍스트만 모델에 반영해야 함

**해결**:
1. `compositionstart`에서 `_isComposing = true` 설정
2. `handleTextContentChange`에서 조합 중이면 pending에 저장
3. `compositionend`에서 `commitPendingImmediate()` 호출하여 최종 텍스트만 모델에 반영
4. `editor:content.change` 이벤트 핸들러에서도 `_isComposing` 체크하여 재렌더링 차단

### Range 선택 시 처리

**문제**: 텍스트가 선택된 상태에서 입력하면 선택된 텍스트가 삭제되고 새 텍스트가 삽입됨

**해결**:
```typescript
// collapsed selection만 처리 (선택된 텍스트가 없는 경우)
if (selection.length !== 0) {
  this.editor.emit('editor:input.skip_range_selection', selection);
  return;
}
```

**참고**: Range 선택 시 삭제/삽입은 `NativeCommands`에서 처리됨

### Marks/Decorators 자동 조정

**문제**: 텍스트 중간에 삽입/삭제하면 marks와 decorators의 범위가 어긋남

**해결**: `handleEfficientEdit()`에서:
1. 변경 위치 감지 (공통 prefix/suffix 비교)
2. Marks 범위 조정 (삽입된 텍스트 길이만큼 offset 증가)
3. Decorators 범위 조정 (삽입된 텍스트 길이만큼 offset 증가)

**예시**:
```
원본: "Hello [bold]World[/bold]"
      (marks: [{type: 'bold', start: 6, end: 11}])

"Hello " 뒤에 "Beautiful " 삽입
→ "Hello Beautiful [bold]World[/bold]"
→ marks: [{type: 'bold', start: 16, end: 21}]  // +10 offset
```

## 핵심 포인트

1. **이중 감지 방지**: `input` 이벤트는 로깅용, 실제 처리는 MutationObserver
2. **nodeId 추출**: `closest('[data-bc-sid]')`를 사용하여 간단하고 효율적으로 추출
3. **IME 지원**: 조합 중에는 모델 업데이트 차단, 완료 후에만 반영
4. **효율적인 편집**: LCP/LCS 알고리즘으로 변경 위치 정확히 감지
5. **자동 조정**: Marks와 Decorators 범위 자동 조정으로 수동 관리 불필요
6. **재렌더링 최적화**: IME 조합 중 재렌더링 차단으로 성능 향상
7. **상세한 로깅**: 각 단계마다 디버깅 로그를 출력하여 문제 추적 용이

## 로그 흐름 (정상적인 경우)

```
1. [MO] onTextChange {oldText, newText, nodeId, nodeType}
   ↓
2. [Input] handleTextContentChange START {oldText, newText, ...}
   ↓
3. [Input] resolved textNodeId {textNodeId, selectionLength, ...}
   ↓
4. [Input] model data retrieved {oldModelText, modelMarksCount, ...}
   ↓
5. [Input] edit result {newText, marksChanged, marksCount, ...}
   ↓
6. [Input] executing transaction {nodeId, textLength, marksChanged}
   ↓
7. [Editor] executeTransaction {type: 'text_replace'}
   ↓
8. [EditorViewDOM] content.change event received {isComposing, willRender, ...}
   ↓
9. [EditorViewDOM] content.change -> render with diff
   ↓
10. [EditorViewDOM.render] START rendering content
   ↓
11. [Input] handleTextContentChange END - transaction executed
```

## 문제 진단 체크리스트

각 단계에서 로그가 나타나지 않으면 해당 단계에서 문제 발생:

- ❌ `[MO] onTextChange` 없음 → MutationObserver 미설정 또는 작동 안 함
- ❌ `[Input] resolved textNodeId`에서 `textNodeId: null` → `data-bc-sid` 속성 없음
- ❌ `[Input] SKIP: composition in progress` → IME 조합 중 (정상, pending에 저장됨)
- ❌ `[Input] SKIP: range selection` → Range 선택 중 (정상, NativeCommands에서 처리)
- ❌ `[Input] SKIP: inactive node` → `activeTextNodeId`가 설정되지 않음
- ❌ `[Input] executing transaction` 없음 → 위의 SKIP 중 하나에 걸림
- ❌ `[EditorViewDOM] content.change` 없음 → 트랜잭션이 실행되지 않음

