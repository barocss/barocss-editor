# 글자 입력 문제 디버깅 가이드

## 브라우저 콘솔에서 확인할 로그

### 1. MutationObserver 텍스트 변경 감지

**로그**: `[MO] onTextChange`

**확인 사항**:
- 텍스트 입력 시 이 로그가 나타나는지
- `oldText`와 `newText`가 올바른지
- `nodeId`가 올바르게 추출되는지 (null이면 문제)

**예상 로그**:
```
[MO] onTextChange {
  oldText: "Hello",
  newText: "HelloW",
  nodeId: "text-1",
  nodeType: "inline-text"
}
```

**문제 상황**:
- 로그가 전혀 나타나지 않음 → MutationObserver가 설정되지 않았거나 작동하지 않음
- `nodeId: null` → `data-bc-sid` 속성이 없거나 잘못된 위치에 있음
- `oldText === newText` → 실제로 변경이 없음

### 2. InputHandler 처리 상태

**로그들**:
- `[Input] activeTextNodeId` - 활성 텍스트 노드 ID
- `[Input] composition: storing pending change` - IME 조합 중
- `[Input] composition end` - IME 조합 완료

**확인 사항**:
- `activeTextNodeId`가 올바르게 설정되는지
- IME 입력 시 pending이 제대로 저장되는지
- `composition end` 후 커밋이 되는지

**문제 상황**:
- `activeTextNodeId`가 null → selection이 제대로 적용되지 않음
- IME 입력이 모델에 반영되지 않음 → `commitPendingImmediate()`가 호출되지 않음

### 3. Editor 이벤트

**로그들**:
- `[Editor] executeTransaction` - 트랜잭션 실행
- `[EditorViewDOM] content.change -> render with diff` - 재렌더링 트리거
- `[EditorViewDOM.render] START rendering content` - 렌더링 시작

**확인 사항**:
- 트랜잭션이 실행되는지
- 재렌더링이 너무 자주 발생하는지 (입력마다 여러 번 렌더링)
- IME 조합 중에도 재렌더링이 발생하는지

**문제 상황**:
- 트랜잭션이 실행되지 않음 → `handleTextContentChange`에서 early return
- 재렌더링이 너무 자주 발생 → 성능 문제 및 입력 지연
- IME 조합 중 재렌더링 → `_isComposing` 체크 실패

### 4. Selection 관련

**로그들**:
- `[EditorViewDOM] bridge:model->dom selection` - 모델 selection → DOM
- `[SelectionHandler] Text runs:` - 텍스트 런 정보
- `[Selection] change` - Selection 변경

**확인 사항**:
- Selection이 제대로 복원되는지
- 입력 후 커서 위치가 올바른지

## 주요 체크포인트

### 체크포인트 1: MutationObserver가 작동하는가?

**확인 방법**:
```javascript
// 브라우저 콘솔에서
console.log('[MO] onTextChange') // 이 로그가 나타나는지 확인
```

**문제가 있다면**:
- `mutationObserverManager.setup()`이 호출되었는지 확인
- `contentEditableElement`가 올바른지 확인

### 체크포인트 2: activeTextNodeId가 설정되는가?

**확인 방법**:
```javascript
// 브라우저 콘솔에서
console.log('[Input] activeTextNodeId') // 이 로그가 나타나는지 확인
```

**문제가 있다면**:
- `editor:selection.dom.applied` 이벤트가 발생하는지 확인
- Selection이 제대로 적용되는지 확인

### 체크포인트 3: 텍스트 변경이 모델에 반영되는가?

**확인 방법**:
```javascript
// 브라우저 콘솔에서
console.log('[Editor] executeTransaction') // 이 로그가 나타나는지 확인
```

**문제가 있다면**:
- `handleTextContentChange`에서 early return되는지 확인
- 다음 조건들을 체크:
  1. `oldText === newText` → 변경 없음
  2. `textNodeId === null` → 추적 불가능한 텍스트
  3. `isComposing === true` → IME 조합 중 (pending에 저장됨)
  4. `selection.length !== 0` → Range 선택 중
  5. `textNodeId !== activeTextNodeId` → 다른 노드에서 변경

### 체크포인트 4: 재렌더링이 너무 자주 발생하는가?

**확인 방법**:
```javascript
// 브라우저 콘솔에서
console.log('[EditorViewDOM] content.change -> render with diff') // 이 로그 빈도 확인
```

**문제가 있다면**:
- 입력마다 여러 번 재렌더링되는지 확인
- IME 조합 중에도 재렌더링되는지 확인 (`_isComposing` 체크)

## 상세 디버깅 로그 추가

다음 로그들을 추가하여 더 자세한 정보를 확인할 수 있습니다:

### InputHandler에 추가할 로그

```typescript
// handleTextContentChange 시작 부분
console.log('[Input] handleTextContentChange', {
  oldText,
  newText,
  textNodeId,
  isComposing: this.isComposing,
  activeTextNodeId: this.activeTextNodeId,
  selectionLength: selection.length
});

// 각 early return 지점
if (oldText === newText) {
  console.log('[Input] skip: no change');
  return;
}

if (!textNodeId) {
  console.log('[Input] skip: untracked text', { target });
  return;
}

if (this.isComposing) {
  console.log('[Input] skip: composing', { textNodeId, oldText, newText });
  return;
}

if (selection.length !== 0) {
  console.log('[Input] skip: range selection', { selection });
  return;
}

if (this.activeTextNodeId && textNodeId !== this.activeTextNodeId) {
  console.log('[Input] skip: inactive node', { 
    textNodeId, 
    activeTextNodeId: this.activeTextNodeId 
  });
  return;
}
```

### EditorViewDOM에 추가할 로그

```typescript
// render() 시작 부분
console.log('[EditorViewDOM] render called', {
  hasModelData: !!modelData,
  isComposing: this._isComposing,
  decoratorsCount: allDecorators.length
});

// 재렌더링 트리거
this.editor.on('editor:content.change', (e: any) => {
  console.log('[EditorViewDOM] content.change event', {
    isComposing: this._isComposing,
    willRender: !this._isComposing
  });
  // ...
});
```

## 일반적인 문제와 해결 방법

### 문제 1: 입력이 전혀 반영되지 않음

**증상**: 글자를 입력해도 모델에 반영되지 않음

**확인 사항**:
1. `[MO] onTextChange` 로그가 나타나는지
2. `nodeId`가 null인지
3. `[Editor] executeTransaction` 로그가 나타나는지

**가능한 원인**:
- MutationObserver가 설정되지 않음
- `data-bc-sid` 속성이 없음
- `activeTextNodeId`가 설정되지 않아서 다른 노드 변경으로 인식됨

### 문제 2: 입력이 지연되거나 끊김

**증상**: 글자를 입력하면 지연되거나 일부만 반영됨

**확인 사항**:
1. 재렌더링이 너무 자주 발생하는지
2. IME 조합 중에도 재렌더링되는지
3. `handleEfficientEdit`가 오래 걸리는지

**가능한 원인**:
- 재렌더링이 너무 자주 발생
- `handleEfficientEdit` 성능 문제
- Selection 복원이 느림

### 문제 3: IME 입력이 제대로 작동하지 않음

**증상**: 한글 입력 시 글자가 깨지거나 제대로 입력되지 않음

**확인 사항**:
1. `[Input] composition: storing pending change` 로그가 나타나는지
2. `[Input] composition end` 로그가 나타나는지
3. `commitPendingImmediate()`가 호출되는지

**가능한 원인**:
- `compositionend` 이벤트가 발생하지 않음
- `commitPendingImmediate()`가 호출되지 않음
- IME 조합 중 재렌더링 발생

### 문제 4: 커서 위치가 잘못됨

**증상**: 입력 후 커서가 다른 위치로 이동함

**확인 사항**:
1. `[EditorViewDOM] bridge:model->dom selection` 로그가 나타나는지
2. `applyModelSelectionWithRetry()`가 호출되는지
3. Selection 복원이 실패하는지

**가능한 원인**:
- Selection 복원 실패
- 재렌더링 후 Selection이 복원되지 않음
- `activeTextNodeId`가 잘못 설정됨

## 빠른 디버깅 체크리스트

입력 문제 발생 시 다음 순서로 확인:

1. ✅ `[MO] onTextChange` 로그가 나타나는가?
2. ✅ `nodeId`가 null이 아닌가?
3. ✅ `[Input] activeTextNodeId` 로그가 나타나는가?
4. ✅ `[Editor] executeTransaction` 로그가 나타나는가?
5. ✅ `[EditorViewDOM] content.change` 로그가 나타나는가?
6. ✅ 재렌더링이 너무 자주 발생하지 않는가?
7. ✅ IME 입력 시 `composition end` 로그가 나타나는가?

## 로그 필터링 팁

브라우저 콘솔에서 특정 로그만 필터링:

```javascript
// MutationObserver 로그만 보기
console.log('[MO]')

// InputHandler 로그만 보기
console.log('[Input]')

// EditorViewDOM 로그만 보기
console.log('[EditorViewDOM]')

// 에러만 보기
console.error
```

