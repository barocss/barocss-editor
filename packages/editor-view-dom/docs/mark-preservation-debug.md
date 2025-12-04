# Mark 보존 디버깅 가이드

## 사용자 가설
**"글자를 치면 editor-view-dom에서 데이터가 잘못 정리되어 mark가 빠지는 것일 수 있다"**

이 가설은 매우 합리적입니다. 테스트에서는 직접 모델을 만들어서 테스트하지만, 실제 브라우저에서는 `editor-view-dom`이 모델을 업데이트하는 과정에서 mark 정보가 손실될 수 있습니다.

## 확인해야 할 지점

### 1. modelMarks 로드 확인
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:95-173`

```typescript
// 모델에서 현재 노드 정보 가져오기
const modelNode = this.editor.dataStore?.getNode?.(textNodeId);
if (!modelNode) {
  console.error('[Input] model node not found', { textNodeId });
  return;
}

const oldModelText = modelNode.text || '';
// modelNode.marks를 MarkRange[] 형식으로 정규화
const rawMarks = modelNode.marks || [];
const modelMarks: MarkRange[] = rawMarks.map((m: any) => ({
  type: m.stype || m.type,  // IMark.stype → MarkRange.type
  range: m.range || [0, oldModelText.length],  // range가 없으면 전체 텍스트
  attrs: m.attrs
}));
```

**확인 사항:**
- `modelNode.marks`가 제대로 로드되는지
- `modelMarks` 배열이 제대로 생성되는지
- `range`가 올바른지

**디버깅 로그 추가 필요:**
```typescript
console.log('[Input] modelMarks loaded', {
  textNodeId,
  rawMarks,
  modelMarks,
  oldModelTextLength: oldModelText.length
});
```

### 2. handleEfficientEdit 결과 확인
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:204-220`

```typescript
const editResult = handleEfficientEdit(
  textNode,
  oldModelText,
  modelMarks,
  decorators
);

console.log('[Input] handleEfficientEdit: RESULT', {
  newText: editResult.newText.slice(0, 50),
  newTextLength: editResult.newText.length,
  oldTextLength: oldModelText.length
});
```

**확인 사항:**
- `editResult.adjustedMarks`가 제대로 조정되는지
- `adjustMarkRanges`가 올바르게 작동하는지

**디버깅 로그 추가 필요:**
```typescript
console.log('[Input] handleEfficientEdit: RESULT', {
  newText: editResult.newText.slice(0, 50),
  newTextLength: editResult.newText.length,
  oldTextLength: oldModelText.length,
  modelMarks,  // 입력된 marks
  adjustedMarks: editResult.adjustedMarks,  // 조정된 marks
  editInfo: editResult.editInfo
});
```

### 3. marksChangedEfficient 확인
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:223`

```typescript
const marksChanged = marksChangedEfficient(modelMarks, editResult.adjustedMarks);
```

**확인 사항:**
- `marksChanged`가 올바르게 계산되는지
- 변경이 감지되지 않아서 업데이트가 안 되는 경우가 있는지

**디버깅 로그 추가 필요:**
```typescript
console.log('[Input] marksChangedEfficient', {
  marksChanged,
  modelMarks,
  adjustedMarks: editResult.adjustedMarks,
  comparison: {
    length: modelMarks.length === editResult.adjustedMarks.length,
    marks: modelMarks.map((m, i) => ({
      model: m,
      adjusted: editResult.adjustedMarks[i],
      equal: JSON.stringify(m) === JSON.stringify(editResult.adjustedMarks[i])
    }))
  }
});
```

### 4. dataStore.marks.setMarks 호출 확인
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:240-253`

```typescript
if (marksChanged && dataStore.marks) {
  const imarks = editResult.adjustedMarks.map((m: any) => ({
    stype: m.type,
    range: m.range,
    attrs: m.attrs
  }));
  
  const marksResult = dataStore.marks.setMarks?.(textNodeId, imarks, { normalize: true });
  if (!marksResult || !marksResult.valid) {
    console.error('[Input] failed to update marks', { nodeId: textNodeId, errors: marksResult?.errors });
  }
}
```

**확인 사항:**
- `marksChanged`가 `true`인데도 `setMarks`가 호출되지 않는 경우
- `setMarks`가 실패하는 경우
- `normalize: true` 옵션이 mark를 제거하는 경우

**디버깅 로그 추가 필요:**
```typescript
if (marksChanged && dataStore.marks) {
  console.log('[Input] setMarks: BEFORE', {
    textNodeId,
    imarks,
    modelMarksBefore: modelNode.marks
  });
  
  const marksResult = dataStore.marks.setMarks?.(textNodeId, imarks, { normalize: true });
  
  console.log('[Input] setMarks: AFTER', {
    textNodeId,
    marksResult,
    modelMarksAfter: dataStore.getNode?.(textNodeId)?.marks
  });
}
```

### 5. adjustMarkRanges 로직 확인
**위치**: `packages/editor-view-dom/src/utils/edit-position-converter.ts:140-206`

**확인 사항:**
- `editPosition`이 올바른지
- `delta` 계산이 올바른지
- mark 범위 조정이 올바른지

**디버깅 로그 추가 필요:**
```typescript
export function adjustMarkRanges(
  marks: MarkRange[],
  edit: TextEdit
): MarkRange[] {
  console.log('[adjustMarkRanges] START', {
    marks,
    edit,
    delta: edit.insertedLength - edit.deletedLength
  });
  
  // ... 기존 로직 ...
  
  const result = marks
    .filter(...)
    .map(...);
  
  console.log('[adjustMarkRanges] RESULT', {
    input: marks,
    output: result
  });
  
  return result;
}
```

## 예상되는 문제 시나리오

### 시나리오 1: modelMarks가 비어있음
- **원인**: `modelNode.marks`가 `undefined`이거나 빈 배열
- **증상**: `modelMarks`가 빈 배열이어서 `adjustMarkRanges`가 아무것도 반환하지 않음
- **해결**: `modelNode.marks` 로드 확인

### 시나리오 2: adjustMarkRanges가 mark를 제거함
- **원인**: `editPosition`이 잘못 계산되어 mark 범위가 무효화됨
- **증상**: `adjustedMarks`가 빈 배열이 됨
- **해결**: `editPosition` 계산 로직 확인

### 시나리오 3: marksChangedEfficient가 false 반환
- **원인**: `modelMarks`와 `adjustedMarks`가 동일하다고 판단됨
- **증상**: `setMarks`가 호출되지 않음
- **해결**: `marksChangedEfficient` 로직 확인

### 시나리오 4: setMarks의 normalize 옵션이 mark를 제거함
- **원인**: `normalize: true` 옵션이 유효하지 않은 범위를 제거함
- **증상**: `setMarks`는 성공하지만 실제 mark가 제거됨
- **해결**: `normalize` 로직 확인

## 다음 단계

1. 브라우저 콘솔에서 위의 로그들을 확인
2. 각 단계에서 mark 정보가 어떻게 변하는지 추적
3. 문제가 발생하는 지점을 특정
4. 해당 지점의 로직 수정

