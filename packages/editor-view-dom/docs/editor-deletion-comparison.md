# 다른 에디터들의 삭제 처리 방식 비교

## 주요 에디터들의 접근 방식

### 1. ProseMirror
**접근 방식**: 모델 중심 (Model-First)
- `beforeinput` 또는 `keydown`에서 `preventDefault()`
- 모델을 먼저 변경 (`Transaction`)
- 변경된 모델을 기반으로 DOM 업데이트
- Selection은 모델 기준으로 계산하여 DOM에 적용

**삭제 처리**:
```typescript
// 1. beforeinput/keydown에서 preventDefault()
// 2. 모델에서 삭제 범위 계산
const tr = state.tr.delete(selection.from, selection.to);
// 3. Transaction 실행 → DOM 업데이트
dispatch(tr);
// 4. Selection은 Transaction의 selectionAfter로 자동 적용
```

**특징**:
- 모델이 항상 "source of truth"
- DOM은 모델의 표현일 뿐
- Selection도 모델 기준

---

### 2. Slate.js
**접근 방식**: 모델 중심 (Model-First)
- `beforeinput`에서 `preventDefault()`
- 모델을 먼저 변경 (`Editor.operations`)
- 변경된 모델을 기반으로 DOM 업데이트
- Selection은 모델 기준으로 계산

**삭제 처리**:
```typescript
// 1. beforeinput에서 preventDefault()
// 2. 모델에서 삭제
Transforms.delete(editor, { at: selection });
// 3. React 렌더링으로 DOM 업데이트
// 4. Selection은 모델 기준으로 자동 동기화
```

**특징**:
- React 기반이므로 모델 변경 → 리렌더링 → DOM 업데이트
- Selection은 모델 상태로 관리

---

### 3. Lexical
**접근 방식**: 모델 중심 (Model-First)
- `beforeinput`에서 `preventDefault()`
- Lexical 노드 모델을 먼저 변경
- 변경된 모델을 기반으로 DOM 업데이트
- Selection은 모델 기준으로 계산

**삭제 처리**:
```typescript
// 1. beforeinput에서 preventDefault()
// 2. 모델에서 삭제
editor.update(() => {
  const selection = $getSelection();
  selection.removeText();
});
// 3. DOM 업데이트 (내부적으로 처리)
// 4. Selection은 모델 기준으로 자동 동기화
```

**특징**:
- 모델이 항상 "source of truth"
- DOM은 모델의 표현

---

### 4. Quill
**접근 방식**: 하이브리드
- 일부는 `beforeinput` 사용
- 일부는 MutationObserver 사용
- Delta 모델 중심

---

## 우리 에디터의 현재 접근 방식

**접근 방식**: DOM 중심 (DOM-First, MutationObserver 기반)
- `beforeinput`에서 `preventDefault()` 하지 않음 (삭제의 경우)
- 브라우저가 자동으로 DOM 변경
- MutationObserver가 DOM 변경 감지
- DOM 변경을 분석하여 모델 업데이트

**삭제 처리**:
```typescript
// 1. keydown: 브라우저 기본 동작 허용
// 2. 브라우저가 DOM에서 텍스트 삭제
// 3. MutationObserver가 DOM 변경 감지
// 4. DOM 변경을 분석하여 모델 업데이트
dataStore.range.deleteText(contentRange);
// 5. DOM selection을 읽어서 모델 selection 업데이트
```

**특징**:
- 브라우저 기본 동작 활용
- IME 입력에 자연스러움
- 하지만 모델과 DOM의 동기화가 복잡함

---

## 문제점: Selection 동기화

### 현재 문제
1. **DOM → 모델 방향만 처리**: DOM selection을 읽어서 모델 selection 업데이트
2. **모델 → DOM 방향 미처리**: 모델이 삭제된 후, 모델 기준으로 DOM selection을 다시 설정하지 않음
3. **타이밍 이슈**: DOM 변경 후 모델 업데이트 전에 selection을 읽으면 잘못된 값

### 해결 방법
**모델이 삭제될 때**:
1. 삭제된 범위를 기준으로 **모델 selection 계산**
   - 삭제 시작 위치로 selection 이동
2. 계산된 **모델 selection을 DOM selection으로 변환**
3. **DOM selection 적용**

---

## 권장 접근 방식

### 옵션 1: 모델 기준 Selection 계산 (권장)
```typescript
// 삭제 후
const deletedRange = contentRange;
const modelSelection = {
  type: 'range',
  startNodeId: deletedRange.startNodeId,
  startOffset: deletedRange.startOffset,
  endNodeId: deletedRange.startNodeId,
  endOffset: deletedRange.startOffset,
  collapsed: true
};

// 모델 selection을 DOM selection으로 변환하여 적용
this.editorViewDOM.convertModelSelectionToDOM(modelSelection);
```

### 옵션 2: 브라우저 Selection 유지 (현재 방식)
```typescript
// 삭제 후 DOM selection을 읽어서 모델 selection 업데이트
const domSelection = window.getSelection();
const modelSelection = convertDOMSelectionToModel(domSelection);
this.editor.emit('editor:selection.change', { selection: modelSelection });
```

**문제점**:
- DOM selection이 모델 변경 전 상태를 반영할 수 있음
- 모델과 DOM의 불일치 가능

---

## 결론

**다른 에디터들**:
- 대부분 **모델 중심** 접근
- 모델을 먼저 변경하고, 그에 따라 DOM 업데이트
- Selection도 모델 기준으로 계산하여 DOM에 적용

**우리 에디터**:
- 현재는 **DOM 중심** 접근 (MutationObserver 기반)
- 하지만 **모델이 삭제될 때는 모델 기준으로 selection을 계산하여 DOM에 적용**해야 함

**권장 사항**:
- 삭제 후 모델 기준으로 selection 계산
- 계산된 모델 selection을 DOM selection으로 변환하여 적용
- 이렇게 하면 모델과 DOM의 일관성 유지

