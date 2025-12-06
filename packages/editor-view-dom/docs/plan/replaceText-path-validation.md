# RangeOperations.replaceText 경로 검증

이 문서는 모든 텍스트 변경 케이스가 `RangeOperations.replaceText`로 수렴하는지 검증합니다.

## 검증 결과

### ✅ C1: 단일 inline-text 텍스트 변경
- **경로**: `handleDomMutations` → `classifyC1` → `handleC1` → `dataStore.range.replaceText`
- **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:229`
- **상태**: ✅ 구현 완료

### ✅ C2: 여러 inline-text에 걸친 텍스트 변경
- **경로**: `handleDomMutations` → `classifyC2` → `handleC2` → `dataStore.range.replaceText`
- **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:311`
- **상태**: ✅ 구현 완료

### ⚠️ IME 최종 결과
- **경로**: `handleDomMutations` → `classifyDomChange` (IME_INTERMEDIATE 체크) → C1/C2로 분류
- **위치**: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts:84-91`
- **상태**: ⚠️ IME 조합 중간 상태는 무시하고, 최종 결과만 C1/C2로 처리
- **TODO**: IME 조합 상태 추적 로직 개선 필요 (`isComposing` 플래그)

### ⚠️ 붙여넣기
- **경로**: `handleDomMutations` → `classifyC2` (또는 C1) → `handleC2`/`handleC1` → `dataStore.range.replaceText`
- **위치**: 붙여넣기는 여러 노드에 걸칠 수 있으므로 C2로 분류될 가능성이 높음
- **상태**: ⚠️ 기본적으로 C2로 처리되지만, 붙여넣기 특화 로직 없음
- **TODO**: 붙여넣기 케이스 특화 처리 (텍스트 + 최소한의 mark 정보만 추출)

### ⚠️ 자동 교정
- **경로**: `handleDomMutations` → `classifyC4` → `detectSpecialCase` → C4_AUTO_CORRECT
- **위치**: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts:detectSpecialCase`
- **상태**: ⚠️ 분류는 되지만 실제 처리는 C4로 mark 변경으로 처리됨
- **TODO**: 자동 교정은 텍스트 변경이므로 C1/C2로 처리하거나, 별도 로직 필요

### ✅ 기존 handleTextContentChange (호환성 유지)
- **경로**: `onTextChange` 이벤트 → `handleTextContentChange` → `dataStore.range.replaceText`
- **위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:627`
- **상태**: ✅ 구현 완료 (하지만 현재는 비활성화됨 - handleDomMutations가 우선)

## 중복 처리 방지

### 현재 상태
- `handleDomMutations`: 새로운 파이프라인, 모든 mutations를 배치로 처리
- `handleTextContentChange`: 기존 파이프라인, `onTextChange` 이벤트에서 호출

### 조치
- `onTextChange` 이벤트 핸들러를 비활성화하여 중복 처리 방지
- 모든 텍스트 변경은 `handleDomMutations` → `classifyDomChange` 경로로 처리

## mark/decorator 정규화

### replaceText 내부 정규화
- `RangeOperations.replaceText`는 내부에서 `setMarks(nodeId, updatedMarks, { normalize: true })` 호출
- **위치**: `packages/datastore/src/operations/range-operations.ts`
- **기능**:
  - 인접한 동일 타입 mark 병합
  - 중복 mark 제거
  - 빈 범위 mark 제거

### decorator 정규화
- `DecoratorOperations.adjustRanges`를 통해 범위 자동 조정
- **위치**: `packages/datastore/src/operations/decorator-operations.ts`

## 개선 사항

1. **IME 조합 상태 추적**
   - `isComposing` 플래그를 정확히 추적하여 중간 상태 무시
   - 조합 완료 시점에만 C1/C2로 처리

2. **붙여넣기 특화 처리**
   - 붙여넣기 감지 (paste 이벤트 또는 특정 패턴)
   - 텍스트 + 최소한의 mark 정보만 추출
   - 허용되지 않은 스타일은 제거

3. **자동 교정 처리**
   - 자동 교정은 텍스트 변경이므로 C1/C2로 분류
   - 또는 별도의 C4_AUTO_CORRECT 케이스로 처리하되, `replaceText` 사용

## 요약

| 케이스 | replaceText 사용 | 상태 | 비고 |
|--------|------------------|------|------|
| C1 | ✅ | 완료 | 단일 inline-text 텍스트 변경 |
| C2 | ✅ | 완료 | 여러 inline-text 텍스트 변경 |
| IME 최종 | ✅ | 기본 완료 | IME 상태 추적 개선 필요 |
| 붙여넣기 | ✅ | 기본 완료 | 특화 로직 추가 필요 |
| 자동 교정 | ⚠️ | 부분 완료 | C4로 분류되지만 텍스트 변경으로 처리 필요 |

**결론**: 대부분의 케이스가 `replaceText`로 수렴하지만, IME 상태 추적과 붙여넣기/자동 교정 특화 로직이 추가로 필요합니다.

