# 하이브리드 접근 방식 분석: DOM-First vs Model-First

## 제안: 하이브리드 접근 방식

**핵심 아이디어**:
- **글자 입력**: DOM-First (MutationObserver 기반) 유지
- **삭제/구조 변경**: Model-First로 전환

---

## 현재 상태 분석

### 현재 구현

| 작업 | 현재 방식 | preventDefault | 처리 레이어 |
|------|----------|----------------|-------------|
| 텍스트 입력 | DOM-First | ❌ | MutationObserver → handleC1 |
| 삭제 (Backspace/Delete) | DOM-First | ❌ | MutationObserver → handleC1 |
| 구조 변경 (Enter) | Model-First | ✅ | beforeinput → insertParagraph |
| 히스토리 (Undo/Redo) | Model-First | ✅ | beforeinput → historyUndo/Redo |

---

## 제안: 하이브리드 접근

### 1. 텍스트 입력: DOM-First 유지 ✅

**이유**:
- IME 입력 (한글, 일본어, 중국어)의 복잡성
- 브라우저가 조합 중간 상태를 자동으로 처리
- MutationObserver가 최종 결과를 정확히 감지
- 다른 에디터들도 IME 입력은 브라우저에 맡기는 경우가 많음

**현재 흐름** (유지):
```
사용자 입력
  ↓
브라우저가 DOM 변경
  ↓
MutationObserver 감지
  ↓
handleC1 → replaceText
```

**장점**:
- IME 입력 안정성
- 브라우저 기본 동작 활용
- 복잡한 입력 시나리오 자동 처리

---

### 2. 삭제: Model-First로 전환 🔄

**이유**:
- Selection 동기화가 명확함
- 모델 기준으로 삭제 범위 계산 가능
- 다른 에디터들의 표준 접근 방식
- DOM-First는 타이밍 이슈 발생 가능

**제안 흐름**:
```
beforeinput (deleteContentBackward/Forward)
  ↓
preventDefault()
  ↓
모델 selection 읽기
  ↓
모델에서 삭제 범위 계산
  ↓
dataStore.range.deleteText(contentRange)
  ↓
모델 기준으로 새 selection 계산
  ↓
render() → DOM 업데이트
  ↓
convertModelSelectionToDOM() → DOM selection 적용
```

**장점**:
- 모델이 "source of truth"
- Selection 동기화가 명확
- 타이밍 이슈 없음
- 다른 에디터들과 일관성

**단점**:
- IME 조합 중 삭제 처리 복잡도 증가
- 하지만 IME 조합 중에는 삭제를 막거나 특별 처리 가능

---

### 3. 구조 변경: Model-First 유지 ✅

**현재 상태**: 이미 Model-First
- `insertParagraph`, `insertLineBreak`는 이미 `preventDefault()` 처리
- 모델 먼저 변경 → render → selection 업데이트

---

## 비교: DOM-First vs Model-First

### DOM-First (현재 삭제 방식)

**장점**:
- 브라우저 기본 동작 활용
- IME 입력과 일관성
- 복잡한 삭제 시나리오 자동 처리

**단점**:
- Selection 동기화 복잡
- 타이밍 이슈 (DOM 변경 후 모델 업데이트 전)
- 모델과 DOM 불일치 가능

### Model-First (제안 삭제 방식)

**장점**:
- 모델이 "source of truth"
- Selection 동기화 명확
- 다른 에디터들과 일관성
- 타이밍 이슈 없음

**단점**:
- IME 조합 중 삭제 처리 복잡도 증가
- 모든 삭제 시나리오를 직접 처리해야 함

---

## 구체적인 구현 제안

### 삭제를 Model-First로 전환

#### 1. beforeinput에서 삭제 감지 및 preventDefault

```typescript
handleBeforeInput(event: InputEvent): void {
  const inputType = event.inputType;
  
  // 구조 변경 (이미 처리 중)
  if (this.shouldPreventDefault(inputType)) {
    event.preventDefault();
    this.executeStructuralCommand(inputType);
    return;
  }

  // 삭제 처리 추가
  if (this.shouldHandleDelete(inputType)) {
    event.preventDefault();
    this.handleDelete(event);
    return;
  }

  // 나머지 (텍스트 입력 등)는 브라우저가 자동 처리
  this.updateInsertHintFromBeforeInput(event);
}

private shouldHandleDelete(inputType: string): boolean {
  const deleteTypes = [
    'deleteContentBackward',  // Backspace
    'deleteContentForward',   // Delete
    'deleteWordBackward',     // Option+Backspace
    'deleteWordForward',      // Option+Delete
    'deleteByCut',           // Ctrl+X
    'deleteByDrag'            // 드래그 삭제
  ];
  return deleteTypes.includes(inputType);
}
```

#### 2. 모델 기준으로 삭제 처리

```typescript
private handleDelete(event: InputEvent): void {
  // 1. 현재 모델 selection 읽기
  const modelSelection = this.editor.selectionManager?.getCurrentSelection();
  if (!modelSelection || modelSelection.type !== 'range') {
    return;
  }

  // 2. 삭제 범위 계산
  const contentRange = this.calculateDeleteRange(
    modelSelection,
    event.inputType
  );

  // 3. 모델에서 삭제
  const dataStore = (this.editor as any).dataStore;
  dataStore.range.deleteText(contentRange);

  // 4. 모델 기준으로 새 selection 계산
  const newModelSelection = {
    type: 'range' as const,
    startNodeId: contentRange.startNodeId,
    startOffset: contentRange.startOffset,
    endNodeId: contentRange.startNodeId,
    endOffset: contentRange.startOffset,
    collapsed: true
  };

  // 5. 모델 selection 업데이트
  this.editor.emit('editor:selection.change', {
    selection: newModelSelection,
    oldSelection: modelSelection
  });

  // 6. render() → DOM 업데이트
  this.editor.render();

  // 7. 모델 selection을 DOM selection으로 변환하여 적용
  this.editorViewDOM.convertModelSelectionToDOM(newModelSelection);
}
```

#### 3. IME 조합 중 삭제 처리

```typescript
private handleDelete(event: InputEvent): void {
  // IME 조합 중에는 브라우저 기본 동작 허용
  if (event.isComposing) {
    // 브라우저가 자동 처리하도록 둠
    // MutationObserver가 최종 결과를 감지
    return;
  }

  // 나머지 처리...
}
```

---

## 하이브리드 접근의 장단점

### 장점

1. **최적의 조합**:
   - 텍스트 입력: IME 안정성을 위해 DOM-First
   - 삭제/구조 변경: 명확성을 위해 Model-First

2. **Selection 동기화 명확**:
   - 삭제 후 모델 기준으로 selection 계산
   - 모델과 DOM의 일관성 유지

3. **다른 에디터들과 유사**:
   - ProseMirror, Slate, Lexical도 삭제는 Model-First
   - 하지만 IME 입력은 브라우저에 맡김

4. **점진적 전환 가능**:
   - 텍스트 입력은 그대로 유지
   - 삭제만 Model-First로 전환

### 단점

1. **복잡도 증가**:
   - 두 가지 접근 방식 혼재
   - 코드 이해도 필요

2. **IME 조합 중 삭제**:
   - 특별 처리 필요
   - 하지만 브라우저 기본 동작 허용으로 해결 가능

3. **일관성**:
   - 입력과 삭제가 다른 방식
   - 하지만 각각의 특성에 맞는 선택

---

## 권장 사항

### ✅ 하이브리드 접근 방식 채택 권장

**이유**:
1. **텍스트 입력**: IME 안정성을 위해 DOM-First 유지
2. **삭제**: Selection 동기화 명확성을 위해 Model-First 전환
3. **구조 변경**: 이미 Model-First (유지)

**구현 순서**:
1. `beforeinput`에서 삭제 감지 및 `preventDefault()` 추가
2. 모델 기준으로 삭제 범위 계산
3. `deleteText` 호출
4. 모델 기준으로 selection 계산
5. `render()` → DOM 업데이트
6. `convertModelSelectionToDOM()` → DOM selection 적용

**주의사항**:
- IME 조합 중에는 브라우저 기본 동작 허용
- `deleteWordBackward/Forward` 등 복잡한 삭제도 처리 필요
- MutationObserver는 텍스트 입력에만 사용

---

## 결론

**하이브리드 접근 방식이 최적**입니다:
- 텍스트 입력: DOM-First (IME 안정성)
- 삭제/구조 변경: Model-First (명확성)

이렇게 하면 각 작업의 특성에 맞는 최적의 방식을 사용할 수 있습니다.

---

## 구현 상태

### ✅ 완료된 작업

1. **beforeinput에서 삭제 감지 및 preventDefault() 추가**
   - `shouldHandleDelete()` 메서드 구현
   - `handleBeforeInput()`에서 삭제 처리 추가
   - IME 조합 중(`isComposing`)에는 브라우저 기본 동작 허용

2. **handleDelete 메서드 구현**
   - DOM selection → 모델 selection 변환
   - `calculateDeleteRange()`로 삭제 범위 계산
   - `dataStore.range.deleteText()` 호출
   - 모델 기준으로 새 selection 계산
   - `editor:content.change` emit (skipRender: false)
   - `convertModelSelectionToDOM()`로 DOM selection 적용

3. **calculateDeleteRange 메서드 구현**
   - `deleteContentBackward` (Backspace)
   - `deleteContentForward` (Delete)
   - `deleteWordBackward/Forward` (단어 단위 삭제, 현재는 1글자로 fallback)
   - `deleteByCut`, `deleteByDrag` (선택 범위 삭제)

4. **handleC1에서 삭제 처리 fallback 유지**
   - IME 조합 중이나 beforeinput이 트리거되지 않은 경우를 위한 fallback
   - 경고 로그 포함

### ✅ 완료된 개선 사항

1. **이전/다음 노드 처리** ✅
   - 노드 시작 위치에서 Backspace: 이전 노드의 마지막 문자 삭제
   - 노드 끝 위치에서 Delete: 다음 노드의 첫 문자 삭제
   - 형제 노드 확인 로직 (같은 부모, inline-text 타입)
   - 조건 불만족 시 fallback (아무 동작도 하지 않음)
   - 문서: `cross-node-deletion-handling.md`

### 🔄 향후 개선 사항

1. **노드 병합 (Phase 2)**
   - 이전/다음 노드가 비어있을 때 노드 병합
   - 병합 시 marks, decorators 처리
   - 병합 후 selection 위치 조정

2. **단어 단위 삭제 개선**
   - `deleteWordBackward/Forward`에서 단어 경계 감지 구현
   - 현재는 1글자만 삭제하도록 fallback

3. **테스트 및 검증**
   - 기본 삭제 (Backspace, Delete)
   - 단어 단위 삭제 (Option+Backspace, Option+Delete)
   - 선택 범위 삭제
   - IME 조합 중 삭제
   - 노드 경계에서 삭제 (이전/다음 노드 처리)

