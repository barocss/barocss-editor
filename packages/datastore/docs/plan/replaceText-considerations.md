# replaceText 고려사항 및 개선점

## 현재 구현 상태

`replaceText`는 텍스트 교체 시 marks를 자동으로 조정하지만, 몇 가지 고려할 점들이 있습니다.

## 발견된 고려사항

### 1. 정규화(Normalization) ✅ 해결됨

**현재 상태** (업데이트됨):
- `replaceText`는 marks 조정 후 `setMarks`를 통해 자동 정규화를 수행합니다.
- 다른 메서드들(`applyMark`, `removeMark` 등)과 동일한 방식으로 정규화를 수행합니다.

**구현**:
```typescript
// Update text first
this.dataStore.updateNode(nodeId, { text: updatedText }, false);

// Normalize marks via setMarks for consistency with other mark operations
if (updatedMarks.length > 0) {
  this.dataStore.marks.setMarks(nodeId, updatedMarks, { normalize: true });
} else {
  // Explicitly set empty marks if needed
  this.dataStore.marks.setMarks(nodeId, [], { normalize: true });
}
```

**효과**:
- 조정 과정에서 생성된 빈 범위나 중복 marks가 자동으로 정규화됩니다.
- 인접한 동일 타입 marks가 자동으로 병합됩니다.
- 다른 mark 관련 메서드들과 일관성 있는 동작을 보장합니다.

---

### 2. Mark 범위 유효성 검사

**현재 상태**:
- `[ms0, me0]`의 유효성을 명시적으로 검사하지 않습니다.
- `range`가 없는 경우 `[0, text.length]`로 기본값 사용.

**잠재적 문제**:
- `ms0 > me0` (역순 범위)
- `ms0 < 0` 또는 `me0 > text.length` (범위 초과)
- `ms0 === me0` (빈 범위)

**현재 처리**:
- 일부 케이스에서 빈 범위를 필터링 (`newEnd > newStart` 체크)
- 하지만 모든 케이스에서 일관되게 처리되지 않음

**권장사항**:
```typescript
// 각 케이스에서 빈 범위 체크 추가
if (newEnd > newStart) {
  resultMarks.push({ ...m, range: [newStart, newEnd] });
}
```

---

### 3. Delta 임계값 (`delta >= -1`)

**현재 로직**:
- `delta >= -1`: 확장 (분리하지 않음)
- `delta < -1`: 분리

**고려사항**:
- `delta = -1`은 1글자 삭제를 의미합니다.
- 실제로는 "작은 삭제"로 간주되어 확장됩니다.
- 이는 의도된 동작일 수 있지만, 사용자 의도와 다를 수 있습니다.

**예제**:
```
텍스트: "Hello world"
Mark:   [0, 11] (bold)
교체:   [5, 6] " " → "" (공백 삭제)
Delta:  0 - 1 = -1
결과:   [0, 10] (확장됨) ✅

텍스트: "Hello beautiful world"
Mark:   [0, 22] (bold)
교체:   [5, 15] " beautiful" → ""
Delta:  0 - 10 = -10
결과:   [0, 5], [5, 12] (분리됨) ✅
```

**권장사항**:
- 현재 로직이 합리적입니다.
- 다만 문서화를 통해 의도를 명확히 하는 것이 좋습니다.

---

### 4. 다중 노드 경로 (Multi-node Path)

**현재 구현**:
```typescript
// Fallback: multi-node path via delete + insert
// Note: deleteText does not change node IDs, only updates text content.
// After deletion, startNodeId still exists and startOffset is valid
// (it becomes the end of the remaining text in start node).
const deletedText = this.deleteText(contentRange);
const insertRange = {
  startNodeId: contentRange.startNodeId,
  startOffset: contentRange.startOffset,
  endNodeId: contentRange.startNodeId,
  endOffset: contentRange.startOffset
};
this.insertText(insertRange, newText);
return deletedText;
```

**고려사항**:
- `deleteText`는 노드 ID를 변경하지 않고 텍스트만 업데이트합니다.
- `deleteText` 후 `startNodeId`는 여전히 유효하며, `startOffset`은 삭제 후 텍스트의 끝 위치가 됩니다.
- 따라서 `insertRange`를 다시 생성할 필요가 없습니다.
- `deleteText`와 `insertText`가 각각 marks를 조정합니다.
- 두 작업 사이에 marks 상태가 일시적으로 불일치할 수 있습니다.
- 하지만 최종 결과는 일관성 있게 유지됩니다.

**권장사항**:
- 현재 구현이 적절합니다.
- 다만 트랜잭션 내에서 실행되어야 합니다.

---

### 5. Edge Cases

#### 5.1. 빈 텍스트 노드

**시나리오**: 텍스트가 모두 삭제되어 빈 문자열이 되는 경우

**현재 처리**:
- Marks는 조정되지만, 빈 텍스트에 대한 marks는 의미가 없습니다.
- `normalizeMarks`에서 빈 텍스트의 marks는 제거됩니다.

**권장사항**:
- 현재 처리 방식이 적절합니다.

#### 5.2. 범위가 텍스트 길이를 초과하는 경우

**현재 처리**:
```typescript
if (start > end || start < 0 || end > text.length) {
  console.warn('[RangeOperations.replaceText] Invalid range', ...);
  return '';
}
```

**권장사항**:
- 현재 검증이 적절합니다.

#### 5.3. 여러 Marks가 같은 범위를 공유하는 경우

**시나리오**: 같은 범위에 여러 타입의 marks가 있는 경우

**현재 처리**:
- 각 mark가 독립적으로 조정됩니다.
- 정규화 과정에서 중복이 제거됩니다.

**권장사항**:
- 현재 처리 방식이 적절합니다.

---

### 6. 성능 고려사항

**현재 구현**:
- 각 mark에 대해 순차적으로 조건을 확인합니다.
- 시간 복잡도: O(n) where n = marks 수

**최적화 가능성**:
- 많은 marks가 있는 경우 (수백 개 이상)
- 이진 검색을 사용하여 관련 marks만 처리
- 하지만 일반적인 사용 사례에서는 현재 구현이 충분합니다.

**권장사항**:
- 현재 구현 유지
- 필요시 성능 프로파일링 후 최적화

---

### 7. 일관성 및 테스트

**현재 상태**:
- 단일 노드 경로는 상세히 구현됨
- 다중 노드 경로는 `deleteText` + `insertText`로 처리

**권장사항**:
- 단일 노드 경로에 대한 테스트 케이스 추가
- Edge cases에 대한 테스트 케이스 추가
- 다중 노드 경로에 대한 통합 테스트 추가

---

## 개선 제안 요약

### 우선순위 높음

1. **빈 범위 필터링 강화**
   - 모든 케이스에서 빈 범위 체크 추가
   - `ms0 >= me0`인 경우 제거
   - 참고: 정규화 과정에서 빈 범위는 자동으로 제거되지만, 조정 단계에서도 필터링하는 것이 더 명확합니다.

### 우선순위 중간

3. **Delta 임계값 문서화**
   - `delta >= -1` 조건의 의도 명확화
   - 사용 예제 추가

4. **Edge cases 테스트**
   - 빈 텍스트 노드
   - 범위 초과
   - 여러 marks 공유

### 우선순위 낮음

5. **성능 최적화**
   - 많은 marks가 있는 경우 최적화
   - 필요시에만 구현

---

## 결론

현재 `replaceText` 구현은 대부분의 사용 사례에서 잘 동작합니다. 

**해결된 사항**:
- ✅ **정규화**: `setMarks`를 통해 자동 정규화 수행 (다른 mark 관련 메서드들과 일관성 유지)

**남은 개선사항**:
1. **빈 범위 필터링 강화**: 모든 케이스에서 일관되게 처리 (선택적, 정규화에서 처리되지만 더 명확성을 위해)
2. **테스트 보강**: Edge cases에 대한 테스트 추가

현재 구현은 안정적이며, 다른 mark 관련 메서드들과 일관성 있는 동작을 보장합니다.

