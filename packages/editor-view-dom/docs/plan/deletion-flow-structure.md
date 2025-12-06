# 삭제 처리 구조

## 전체 흐름

```
사용자 Backspace/Delete 키 입력
    ↓
1. keydown 이벤트 (EditorViewDOM.handleKeydown)
   - 브라우저 기본 동작 허용 (preventDefault 안 함)
   - MutationObserver가 DOM 변경 감지하도록 둠
    ↓
2. 브라우저가 자동으로 DOM에서 텍스트 삭제
   - DOM의 text node에서 문자 제거
   - Selection 자동 업데이트
    ↓
3. MutationObserver가 DOM 변경 감지
   - characterData 또는 childList 변경 감지
    ↓
4. InputHandler.handleDomMutations() 호출
   - mutations 배열을 받아서 처리
    ↓
5. dom-change-classifier.classifyDomChange()
   - C1 (단일 inline-text) 또는 C2 (여러 inline-text)로 분류
    ↓
6. InputHandler.handleC1() 또는 handleC2()
   - analyzeTextChanges로 삭제 범위 계산
   - change.type === 'delete' 감지
    ↓
7. dataStore.range.deleteText(contentRange)
   - 모델에서 텍스트 삭제
   - marks/decorators 자동 조정
    ↓
8. editor:content.change 이벤트 발생
   - skipRender: true (무한루프 방지)
    ↓
9. DOM selection 읽어서 모델 selection 업데이트
   - convertDOMSelectionToModel로 변환
   - editor:selection.change 이벤트 발생
```

## 핵심 원칙

### 1. 브라우저 기본 동작 활용
- **Backspace/Delete는 `preventDefault()` 하지 않음**
- 브라우저가 자동으로 DOM 변경
- MutationObserver가 변경 감지

### 2. MutationObserver가 주요 처리 레이어
- 텍스트 입력/삭제의 대부분을 MutationObserver에서 처리
- `handleDomMutations`가 최신 경로
- `handleTextContentChange`는 fallback (현재는 비활성화)

### 3. 두 가지 경로

#### 경로 A: handleDomMutations (현재 사용 중)
```
MutationObserver → handleDomMutations → classifyDomChange → handleC1/C2 → deleteText
```
- **장점**: 모든 mutation을 한 번에 처리, 더 정확한 분류
- **사용**: 현재 활성화됨

#### 경로 B: handleTextContentChange (fallback, 현재 비활성화)
```
MutationObserver → onTextChange → handleTextContentChange → handleEfficientEdit → replaceText
```
- **장점**: 개별 text node 변경에 특화
- **상태**: 현재는 비활성화 (handleDomMutations가 우선)

## 코드 위치

### 1. keydown 이벤트 처리
**파일**: `packages/editor-view-dom/src/editor-view-dom.ts:372-399`
```typescript
handleKeydown(event: KeyboardEvent): void {
  const key = this.getKeyString(event);
  
  // Backspace와 Delete는 브라우저 기본 동작을 허용 (MutationObserver가 감지)
  if (key === 'Backspace' || key === 'Delete') {
    return; // 브라우저 기본 동작 허용, MutationObserver가 DOM 변경 감지
  }
  // ...
}
```

### 2. MutationObserver 설정
**파일**: `packages/editor-view-dom/src/mutation-observer/mutation-observer-manager.ts:74-100`
```typescript
this.observer = new MutationObserver((mutations) => {
  // handleDomMutations 호출
  if (this.inputHandler.handleDomMutations) {
    this.inputHandler.handleDomMutations([...this.pendingMutations]);
  }
});
```

### 3. DOM 변경 분류
**파일**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:146-238`
```typescript
handleDomMutations(mutations: MutationRecord[]): void {
  // DOM 변경 분류
  const classified = classifyDomChange(mutations, {
    editor: this.editor,
    selection: selection || undefined,
    modelSelection: modelSelectionInfo,
    inputHint: inputHint || undefined,
    isComposing
  });

  // 케이스별 처리
  switch (classified.case) {
    case 'C1':
      this.handleC1(classified);
      break;
    case 'C2':
      this.handleC2(classified);
      break;
    // ...
  }
}
```

### 4. 삭제 처리
**파일**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:243-373`
```typescript
private handleC1(classified: ClassifiedChange): void {
  // 텍스트 diff 분석
  const textChanges = analyzeTextChanges({
    oldText: classified.prevText,
    newText: classified.newText,
    selectionOffset,
    selectionLength: 0
  });

  const change = textChanges[0];
  
  // 삭제 케이스는 deleteText 사용
  if (change.type === 'delete') {
    dataStore.range.deleteText(contentRange);
  } else {
    dataStore.range.replaceText(contentRange, change.text);
  }
  
  // DOM selection 읽어서 모델 selection 업데이트
  const domSelection = window.getSelection();
  if (domSelection && domSelection.rangeCount > 0) {
    const modelSelection = convertDOMSelectionToModel(domSelection);
    this.editor.emit('editor:selection.change', {
      selection: modelSelection,
      oldSelection: this.editor.selection || null
    });
  }
}
```

## beforeinput 이벤트는?

**beforeinput 이벤트는 삭제에 사용하지 않음**

**파일**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:970-991`
```typescript
handleBeforeInput(event: InputEvent): void {
  const inputType = event.inputType;
  
  // 구조 변경/히스토리만 preventDefault()
  if (this.shouldPreventDefault(inputType)) {
    event.preventDefault();
    this.executeStructuralCommand(inputType);
    return;
  }

  // 나머지는 브라우저가 자동 처리하도록 두고,
  // MutationObserver가 DOM 변경을 감지하여 모델을 업데이트한다.
}
```

**이유**:
- 삭제는 브라우저가 자동으로 처리하도록 두는 것이 안정적
- IME 입력 중에도 자연스럽게 동작
- MutationObserver가 DOM 변경을 정확히 감지

## 왜 MutationObserver를 사용하는가?

### 장점
1. **브라우저 기본 동작 활용**: IME 입력, 복잡한 삭제 시나리오를 브라우저가 처리
2. **일관성**: 입력과 삭제를 동일한 방식으로 처리
3. **안정성**: 브라우저가 처리한 최종 DOM 상태를 반영

### 단점
1. **지연**: DOM 변경 후 감지되므로 약간의 지연 가능
2. **복잡성**: DOM 변경을 분석하여 모델 변경으로 변환해야 함

## 요약

**삭제 처리 구조**:
1. ✅ **keydown**: 브라우저 기본 동작 허용
2. ✅ **브라우저**: DOM에서 텍스트 삭제
3. ✅ **MutationObserver**: DOM 변경 감지
4. ✅ **handleDomMutations**: 변경 분류 (C1/C2)
5. ✅ **handleC1/C2**: deleteText 호출
6. ✅ **모델 업데이트**: selection 동기화

**핵심**: 삭제는 **MutationObserver 기반**으로 처리되며, `beforeinput`은 사용하지 않음.

