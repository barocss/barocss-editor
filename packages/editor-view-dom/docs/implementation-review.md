# 입력 처리 구현 종합 점검 결과

## 1. 구현 상태 요약

### ✅ 완전히 구현된 항목

#### 1.1 이벤트 핸들러 (InputHandlerImpl)
- ✅ `handleBeforeInput`: 구조 변경(`insertParagraph`, `insertLineBreak`) 및 히스토리(`historyUndo`, `historyRedo`) 처리
- ✅ `handleKeyDown`: 키 이벤트 로깅 및 향후 KeyBindingManager 통합 지점 준비
- ✅ `handleDomMutations`: MutationObserver 변경사항 처리 및 케이스 분류

#### 1.2 DOM 변경 분류기 (dom-change-classifier)
- ✅ `classifyDomChange`: C1/C2/C3/C4 케이스 분류
- ✅ `classifyC1`: 단일 inline-text 텍스트 변경 분류
- ✅ `classifyC2`: 여러 inline-text에 걸친 텍스트 변경 분류
- ✅ `classifyC3`: 블록 구조 변경 분류
- ✅ `classifyC4`: 마크/스타일/데코레이터 변경 분류

#### 1.3 InputHint 시스템
- ✅ `updateInsertHintFromBeforeInput`: beforeinput에서 Insert Range 힌트 계산
- ✅ `getValidInsertHint`: InputHint 유효성 검사 (IME 조합 중 무시, 시간 초과 무시)
- ✅ `classifyC1`에서 InputHint 활용하여 contentRange 보정
- ✅ `classifyC2`에서 InputHint 활용하여 contentRange 보정

#### 1.4 케이스별 처리 (handleC1/C2/C3)
- ✅ `handleC1`: 단일 inline-text 텍스트 변경 처리 (`replaceText`/`deleteText`)
- ✅ `handleC2`: 여러 inline-text에 걸친 텍스트 변경 처리 (기본 구현)
- ✅ `handleC3`: 블록 구조 변경 처리 (command 실행, fallback 준비)

#### 1.5 디버깅 정보 (LastInputDebug)
- ✅ `handleC1`에서 LastInputDebug 생성 및 `editor:content.change` 이벤트에 포함
- ✅ `handleC2`에서 LastInputDebug 생성 및 `editor:content.change` 이벤트에 포함
- ✅ `handleC3`에서 LastInputDebug 생성 및 `editor:content.change` 이벤트에 포함
- ✅ 규칙 검증: `classifiedContentRange`와 `appliedContentRange` 비교

#### 1.6 Devtool 연동
- ✅ `Devtool.patchEditorEmit`에서 `inputDebug` 감지
- ✅ `DevtoolUI.updateLastInputDebug`로 UI 업데이트
- ✅ "Last Input" 패널에 상태 표시 (✓/⚠/○, case, inputType, Hint 사용 여부, ranges, notes)

#### 1.7 이벤트 연결 (EditorViewDOM)
- ✅ `beforeinput` → `InputHandlerImpl.handleBeforeInput`
- ✅ `keydown` → `InputHandlerImpl.handleKeyDown` (로깅) + `EditorViewDOM.handleKeydown` (실제 처리)
- ✅ `MutationObserver` → `InputHandlerImpl.handleDomMutations`

---

## 2. 부분적으로 구현된 항목 (TODO)

### 2.1 handleC2: 여러 노드에 걸친 정확한 처리
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:380`
```typescript
// 여러 노드에 걸친 경우, 간단히 첫 번째 노드만 처리
// TODO: 여러 노드에 걸친 정확한 처리 구현 필요
const nodeId = classified.contentRange.startNodeId;
```

**문제점**:
- 현재는 첫 번째 노드만 처리하고 있음
- 여러 노드에 걸친 텍스트 변경 시 정확한 범위 계산이 필요

**권장 해결책**:
- `dataStore.range.replaceText`가 여러 노드에 걸친 범위를 지원하는지 확인
- 지원하지 않으면 `deleteText` + `insertText` 조합으로 처리

### 2.2 classifyC2: 여러 노드에 걸친 모델 텍스트 추출
**위치**: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts:367`
```typescript
// 모델에서 이전 텍스트 추출 (selection 범위)
// TODO: 여러 노드에 걸친 범위의 모델 텍스트를 추출하는 로직 필요
// 현재는 간단히 첫 번째 노드의 텍스트만 사용
const prevText = startModelNode.text || '';
```

**문제점**:
- 여러 노드에 걸친 범위의 모델 텍스트를 추출하는 로직이 없음
- `prevText`가 첫 번째 노드의 텍스트만 포함

**권장 해결책**:
- `dataStore`에서 여러 노드에 걸친 범위의 텍스트를 추출하는 유틸 함수 추가
- 또는 `reconstructModelTextFromDOM`을 여러 노드에 걸쳐 확장

### 2.3 classifyC2: DOM offset을 모델 offset으로 변환
**위치**: `packages/editor-view-dom/src/dom-sync/dom-change-classifier.ts:419`
```typescript
// DOM selection 기반으로 offset 계산 (부정확할 수 있음)
// TODO: DOM offset을 모델 offset으로 정확히 변환하는 로직 필요
```

**문제점**:
- DOM selection의 offset을 모델 offset으로 정확히 변환하는 로직이 없음
- mark/decorator로 인해 DOM 구조와 모델 구조가 다를 수 있음

**권장 해결책**:
- `edit-position-converter.ts`에 DOM offset → 모델 offset 변환 함수 추가
- mark/decorator를 고려한 정확한 변환 로직 구현

### 2.4 handleC3: Fallback 정책
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:546`
```typescript
// TODO: fallback 구현
// 1. block 구조는 버리고 텍스트와 허용 인라인 요소만 평탄화
// 2. block 경계를 모델 규칙에 맞게 재구성
// 3. dataStore.range.replaceText + block 삽입 command 조합으로 모델 patch
```

**문제점**:
- command로 표현 불가능한 C3 케이스에 대한 fallback이 구현되지 않음
- 브라우저가 만든 DOM 구조를 모델로 안전하게 변환하는 로직 필요

**권장 해결책**:
- `dom-to-model-sync-cases.md`의 C3 fallback 정책 참고
- 텍스트와 허용 인라인 요소만 추출하여 평탄화
- block 경계를 모델 규칙에 맞게 재구성

### 2.5 KeyBindingManager 통합
**위치**: `packages/editor-view-dom/src/event-handlers/input-handler.ts:107`
```typescript
// TODO: KeyBindingManager 도입 시, keydown 처리 로직을 이 메서드로 옮긴다.
// 현재는 EditorViewDOM.handleKeydown에서 keymapManager를 통해 처리
```

**문제점**:
- 문서에서는 KeyBindingManager를 언급하지만, 실제로는 KeymapManager 사용 중
- `handleKeyDown`이 로깅만 하고 실제 처리는 `EditorViewDOM.handleKeydown`에서 수행

**권장 해결책**:
- `input-event-editing-plan.md`의 KeyBindingManager 설계에 따라 구현
- 또는 현재 KeymapManager를 KeyBindingManager로 확장

---

## 3. 논리적 오류 및 개선점

### 3.1 InputHint 생명주기 관리
**현재 구현**: ✅ 올바르게 구현됨
- C1/C2/C3 성공 시 `_pendingInsertHint = null`로 초기화
- `getValidInsertHint`에서 IME 조합 중/시간 초과 시 무시

**개선점**: 없음

### 3.2 handleC1의 contentRange 계산
**현재 구현**: 
- `analyzeTextChanges`로 diff 계산
- `change.start`/`change.end`를 사용하여 `contentRange` 생성

**잠재적 문제**:
- `analyzeTextChanges`의 `selectionOffset`이 정확하지 않을 수 있음
- InputHint가 있으면 `classified.contentRange`를 사용해야 하는데, `analyzeTextChanges` 결과를 사용하고 있음

**권장 개선**:
```typescript
// InputHint가 있고 정확하면 우선 사용
if (classified.contentRange && classified.metadata?.usedInputHint) {
  contentRange = classified.contentRange;
} else {
  // analyzeTextChanges 결과 사용
  contentRange = {
    startNodeId: classified.nodeId,
    startOffset: change.start,
    endNodeId: classified.nodeId,
    endOffset: change.end
  };
}
```

### 3.3 handleC2의 contentRange 계산
**현재 구현**:
- `classified.contentRange`를 그대로 사용

**잠재적 문제**:
- `analyzeTextChanges`를 사용하지 않아서 정확한 diff를 계산하지 않음
- 여러 노드에 걸친 경우 `startOffset`/`endOffset`이 부정확할 수 있음

**권장 개선**:
- `analyzeTextChanges`를 여러 노드에 걸쳐 확장
- 또는 `classified.contentRange`를 신뢰하되, 검증 로직 추가

### 3.4 C3의 command 실행 후 render
**현재 구현**: ✅ 올바르게 구현됨
```typescript
this.editor.emit('editor:content.change', {
  skipRender: false, // render 필요
  from: 'MutationObserver-C3-command',
  // ...
});
```

**설명**:
- C3는 구조 변경이므로 `skipRender: false`로 설정하여 render 필요
- 브라우저가 만든 DOM은 무시하고, command 결과로 다시 render

### 3.5 composition 이벤트 리스너
**현재 구현**:
- `EditorViewDOM`에서 `compositionstart`/`compositionupdate`/`compositionend` 리스너 등록
- 하지만 `InputHandlerImpl`에서는 실제로 사용하지 않음 (빈 메서드)

**문서와의 불일치**:
- `input-event-editing-plan.md`에서는 "composition 이벤트는 사용하지 않음"이라고 명시
- 하지만 리스너는 여전히 등록되어 있음

**권장 개선**:
- 리스너 제거 또는 명확한 주석 추가
- 또는 `_isComposing` 상태만 업데이트하고 실제 처리는 MutationObserver에 맡김

---

## 4. Devtool 연동 상태

### ✅ 완전히 구현됨

#### 4.1 데이터 흐름
1. `handleC1`/`handleC2`/`handleC3`에서 `LastInputDebug` 생성
2. `editor:content.change` 이벤트에 `inputDebug` 포함
3. `Devtool.patchEditorEmit`에서 `inputDebug` 감지
4. `DevtoolUI.updateLastInputDebug`로 UI 업데이트

#### 4.2 표시 정보
- ✅ 상태 아이콘 (✓/⚠/○)
- ✅ 케이스 (C1/C2/C3)
- ✅ inputType
- ✅ InputHint 사용 여부
- ✅ classifiedContentRange
- ✅ appliedContentRange
- ✅ 규칙 위반 시 notes

#### 4.3 검증 로직
- ✅ `classifiedContentRange`와 `appliedContentRange` 비교
- ✅ 불일치 시 `status: 'mismatch'` 및 `notes`에 상세 메시지

---

## 5. 문서와 실제 구현의 불일치

### 5.1 KeyBindingManager vs KeymapManager
**문서**: `input-event-editing-plan.md`에서 KeyBindingManager 설계
**실제**: KeymapManager 사용 중

**권장 조치**:
- KeyBindingManager 구현 또는
- 문서 업데이트하여 현재 KeymapManager 사용 명시

### 5.2 composition 이벤트
**문서**: "composition 이벤트는 사용하지 않음"
**실제**: 리스너는 등록되어 있지만 실제로는 사용하지 않음

**권장 조치**:
- 리스너 제거 또는
- 주석 추가하여 "상태 추적용으로만 사용, 실제 처리는 MutationObserver에 맡김" 명시

### 5.3 handleKeyDown의 역할
**문서**: KeyBindingManager를 통한 단축키 처리
**실제**: 로깅만 하고 실제 처리는 `EditorViewDOM.handleKeydown`에서 수행

**권장 조치**:
- 문서 업데이트하여 현재 구조 명시 또는
- KeyBindingManager 구현 후 `handleKeyDown`으로 이동

---

## 6. 우선순위별 개선 사항

### 🔴 높은 우선순위
1. **handleC2: 여러 노드에 걸친 정확한 처리**
   - 여러 노드에 걸친 텍스트 변경 시 정확한 범위 계산 필요
   - 현재는 첫 번째 노드만 처리하여 데이터 손실 가능

2. **classifyC2: 여러 노드에 걸친 모델 텍스트 추출**
   - `prevText`가 첫 번째 노드만 포함하여 diff 계산이 부정확할 수 있음

### 🟡 중간 우선순위
3. **classifyC2: DOM offset을 모델 offset으로 변환**
   - mark/decorator로 인한 DOM/모델 구조 차이 고려 필요

4. **handleC3: Fallback 정책**
   - command로 표현 불가능한 C3 케이스 처리 필요

### 🟢 낮은 우선순위
5. **KeyBindingManager 통합**
   - 현재 KeymapManager로도 동작하므로 급하지 않음

6. **composition 이벤트 리스너 정리**
   - 실제로는 사용하지 않으므로 정리 필요

---

## 7. 테스트 시나리오 검증 필요 항목

### 7.1 기본 시나리오
- ✅ C1: 단일 inline-text 텍스트 입력/삭제
- ⚠️ C2: 여러 inline-text에 걸친 텍스트 변경 (부분 구현)
- ⚠️ C3: 블록 구조 변경 (command 실행은 되지만 fallback 미구현)

### 7.2 InputHint 시나리오
- ✅ 기본 `insertText`에서 InputHint 사용
- ⚠️ 넓은 selection + 덮어쓰기에서 InputHint 사용 (C2 부분 구현으로 인해 제한적)
- ✅ IME 조합 중 InputHint 무시

### 7.3 Devtool 검증
- ✅ LastInputDebug 표시
- ✅ 상태 아이콘 표시
- ✅ ranges 비교 및 불일치 감지

---

## 8. 결론

### ✅ 잘 구현된 부분
1. 핵심 이벤트 처리 흐름 (beforeinput → MutationObserver → 모델 업데이트)
2. InputHint 시스템 (beforeinput에서 계산, C1/C2에서 활용)
3. Devtool 연동 (LastInputDebug 생성 및 표시)
4. C1 케이스 처리 (단일 inline-text 텍스트 변경)

### ⚠️ 개선이 필요한 부분
1. C2 케이스: 여러 노드에 걸친 정확한 처리
2. C3 케이스: Fallback 정책 구현
3. DOM offset → 모델 offset 변환 로직

### 📝 문서 업데이트 필요
1. KeyBindingManager vs KeymapManager 명확화
2. composition 이벤트 리스너 사용 목적 명시
3. handleKeyDown의 현재 역할 명시

---

**최종 평가**: 핵심 기능은 잘 구현되어 있으며, C2/C3의 일부 엣지 케이스 처리가 남아있습니다. Devtool 연동은 완벽하게 구현되어 있어 디버깅에 유용합니다.

