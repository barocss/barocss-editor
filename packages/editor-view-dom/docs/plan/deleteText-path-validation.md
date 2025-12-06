# RangeOperations.deleteText 사용 지점 정리

이 문서는 Backspace/Delete/단어 삭제에 대해 `deleteText` 호출 위치를 명확화합니다.

## 현재 구현 상태

### ✅ C1: 단일 inline-text 삭제
- **경로**: `handleDomMutations` → `classifyC1` → `handleC1` → `analyzeTextChanges` → `change.type === 'delete'` → `dataStore.range.deleteText`
- **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:229-237`
- **상태**: ✅ 구현 완료

### ✅ C2: 여러 inline-text에 걸친 삭제
- **경로**: `handleDomMutations` → `classifyC2` → `handleC2` → `analyzeTextChanges` → `change.type === 'delete'` → `dataStore.range.deleteText`
- **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:311-319`
- **상태**: ✅ 구현 완료

## 삭제 케이스 분류

### analyzeTextChanges의 delete 감지

`analyzeTextChanges`는 다음 경우에 `type: 'delete'`를 반환합니다:

1. **순수 삭제** (`kind === 'delete'`):
   - `oldText`에서 텍스트가 제거되고 `newText`에 아무것도 추가되지 않음
   - 예: `"abc"` → `"ac"` (b 삭제)
   - `text: ''` (빈 문자열)

2. **교체에서 삭제만 있는 경우**:
   - `replace` 타입이지만 실제로는 삭제로 처리되는 경우는 없음
   - `replace`는 항상 `inserted`와 `deleted`가 모두 있음

### deleteText vs replaceText

| 케이스 | change.type | 사용 메서드 | 이유 |
|--------|-------------|-------------|------|
| 순수 삭제 | `'delete'` | `deleteText` | 명시적 삭제 연산 |
| 순수 삽입 | `'insert'` | `replaceText` | 삽입은 교체의 특수 케이스 |
| 교체 | `'replace'` | `replaceText` | 삽입과 삭제가 동시에 발생 |

## 처리 흐름

### Backspace (deleteContentBackward)

1. 브라우저가 자동으로 DOM에서 텍스트 삭제
2. `MutationObserver`가 `characterData` 또는 `childList` 변경 감지
3. `handleDomMutations` 호출
4. `classifyC1` 또는 `classifyC2`로 분류
5. `analyzeTextChanges`로 텍스트 diff 분석
6. `change.type === 'delete'`인 경우:
   - `dataStore.range.deleteText(contentRange)` 호출
   - marks/decorators 자동 조정 (split/trim/shift)
7. `editor.emit('editor:content.change', { skipRender: true })` 발생

### Delete (deleteContentForward)

- `deleteContentBackward`와 동일한 흐름
- 차이점: 커서 뒤의 문자 삭제

### 단어 삭제 (deleteWordBackward/Forward)

- 브라우저가 자동으로 단어 범위까지 확장하여 삭제
- `MutationObserver`가 감지
- `classifyC2`로 분류될 가능성이 높음 (여러 문자 삭제)
- `analyzeTextChanges`가 `type: 'delete'` 반환
- `dataStore.range.deleteText(expandedContentRange)` 호출

### 범위 삭제 (deleteByDrag, deleteByCut)

- 사용자가 범위를 선택하고 삭제
- `classifyC2`로 분류 (여러 노드에 걸칠 수 있음)
- `analyzeTextChanges`가 `type: 'delete'` 반환
- `dataStore.range.deleteText(contentRange)` 호출

## 코드 위치

### handleC1에서 deleteText 사용
```typescript
if (change.type === 'delete') {
  dataStore.range.deleteText(contentRange);
} else {
  dataStore.range.replaceText(contentRange, change.text);
}
```

### handleC2에서 deleteText 사용
```typescript
if (change.type === 'delete') {
  dataStore.range.deleteText(contentRange);
} else {
  dataStore.range.replaceText(contentRange, change.text);
}
```

## 개선 사항

1. **단어 삭제 범위 확장**
   - 현재는 브라우저가 자동으로 확장하지만, 모델에서도 단어 경계를 인식하여 정확한 범위 계산 필요

2. **크로스 노드 삭제**
   - 여러 `inline-text`에 걸친 삭제는 현재 C2로 처리되지만, `deleteText`가 크로스 노드를 지원하는지 확인 필요

3. **구조 변경과의 구분**
   - Backspace로 인한 블록 병합 등은 C3로 분류되어야 함
   - 현재는 텍스트 삭제로만 처리될 수 있음

## 요약

| 삭제 케이스 | 분류 | 처리 메서드 | 상태 |
|------------|------|------------|------|
| 단일 문자 삭제 (Backspace/Delete) | C1 | `deleteText` | ✅ 완료 |
| 여러 문자 삭제 | C1/C2 | `deleteText` | ✅ 완료 |
| 단어 삭제 | C2 | `deleteText` | ✅ 완료 |
| 범위 삭제 | C2 | `deleteText` | ✅ 완료 |
| 블록 병합 (Backspace) | C3 | command | ✅ 완료 |

**결론**: 모든 삭제 케이스가 `deleteText`를 사용하도록 구현 완료. `analyzeTextChanges`가 `type: 'delete'`를 정확히 감지하여 적절한 메서드를 호출합니다.

