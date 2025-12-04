# Selection 동기화 검증 문서

이 문서는 DOM Selection ↔ 모델 Selection 변환 및 동기화가 올바르게 구현되었는지 검증합니다.

## SEL1: DOM Selection → 모델 Selection

### 구현 상태

✅ **완료**: `handleDomMutations`에서 DOM selection을 모델 selection으로 변환하여 `ClassifyOptions`에 포함

### 구현 위치

1. **`packages/editor-view-dom/src/event-handlers/input-handler.ts`** (line 128-150)
   - `handleDomMutations`에서 `window.getSelection()` 호출
   - `editorViewDOM.convertDOMSelectionToModel(selection)` 호출하여 모델 selection 변환
   - 변환된 모델 selection을 `ClassifyOptions.modelSelection`에 포함

2. **`packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts`** (line 53-57, 345-380)
   - `ClassifyOptions` 인터페이스에 `modelSelection?: ModelSelectionInfo` 추가
   - `classifyC2`에서 `options.modelSelection`을 사용하여 정확한 `contentRange` 계산

### 처리 흐름

```
1. MutationObserver가 DOM 변경 감지
2. handleDomMutations 호출
3. window.getSelection()으로 DOM selection 가져오기
4. convertDOMSelectionToModel(selection)으로 모델 selection 변환
5. ClassifyOptions에 modelSelection 포함
6. classifyDomChange 호출
7. classifyC2에서 modelSelection 사용하여 contentRange 계산
```

### 모델 Selection 정보 구조

```typescript
interface ModelSelectionInfo {
  startNodeId: string;
  startOffset: number;
  endNodeId: string;
  endOffset: number;
  collapsed: boolean;
}
```

### 사용 케이스

- **C2 (여러 inline-text에 걸친 텍스트 변경)**
  - `options.modelSelection`이 있으면 정확한 `startOffset`/`endOffset` 계산
  - 없으면 DOM selection 기반으로 계산 (부정확할 수 있음)

- **C3 (블록 구조 변경)**
  - 향후 구현 예정

- **C4 (마크/스타일/데코레이터 변경)**
  - 향후 구현 예정

### 개선 사항

1. **C3/C4에서도 modelSelection 사용**
   - 현재는 C2에서만 사용
   - C3/C4 분류 로직에도 `modelSelection` 활용 필요

2. **여러 노드에 걸친 범위의 모델 텍스트 추출**
   - 현재는 첫 번째 노드의 텍스트만 사용 (`prevText`)
   - `modelSelection`을 사용하여 정확한 범위의 모델 텍스트 추출 필요

3. **DOM offset → 모델 offset 변환 정확도 향상**
   - 현재는 `modelSelection`이 있으면 그대로 사용
   - DOM selection만 있는 경우 정확한 변환 로직 필요

## SEL2: 모델 Selection → DOM Selection

### 구현 상태

✅ **기본 구현 완료**: `SelectionHandler.convertModelSelectionToDOM` 사용

### 구현 위치

1. **`packages/editor-view-dom/src/event-handlers/selection-handler.ts`** (line 273-373)
   - `convertModelSelectionToDOM` 메서드로 모델 selection을 DOM selection으로 변환
   - Text Run Index 기반으로 정확한 DOM 위치 계산

2. **`packages/editor-view-dom/src/editor-view-dom.ts`** (line 811)
   - `convertModelSelectionToDOM` 메서드로 외부에 노출

### 처리 흐름

```
1. 모델 selection 변경 (editor:selection.change 이벤트)
2. convertModelSelectionToDOM(modelSelection) 호출
3. Text Run Index를 사용하여 DOM 위치 계산
4. window.getSelection()에 DOM range 설정
```

### 사용 시점

- **렌더 후 selection 복원**
  - `editor.render()` 후 모델 selection을 DOM selection으로 복원
  - `editor-view-dom.ts`의 `render()` 메서드에서 처리

- **입력 중 selection 유지**
  - 입력 중에는 브라우저 selection을 최대한 존중
  - race condition 문서와 일치

### 개선 사항

1. **입력 중 selection 복원 정책 명확화**
   - 현재는 브라우저 selection을 존중
   - 특정 케이스에서 모델 selection으로 복원이 필요한지 검토 필요

2. **Selection 복원 실패 시 처리**
   - DOM 노드가 아직 렌더되지 않은 경우
   - Text Run Index가 구축되지 않은 경우

## 요약

| 항목 | 상태 | 위치 | 비고 |
|------|------|------|------|
| DOM → 모델 변환 (SEL1) | ✅ 완료 | `input-handler.ts`, `dom-change-classifier.ts` | C2에서 사용 |
| 모델 → DOM 변환 (SEL2) | ✅ 완료 | `selection-handler.ts`, `editor-view-dom.ts` | 기본 구현 완료 |
| C3/C4에서 modelSelection 사용 | ⚠️ 미완료 | `dom-change-classifier.ts` | 향후 구현 |
| 여러 노드 범위 모델 텍스트 추출 | ⚠️ 미완료 | `dom-change-classifier.ts` | 향후 구현 |

**결론**: SEL1과 SEL2의 기본 구현은 완료되었습니다. C3/C4에서의 활용과 여러 노드 범위 처리 개선이 필요합니다.


