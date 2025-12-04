## 입력 처리 구현 TODO 체크리스트

이 문서는 실제 구현 진행 상황을 추적하기 위한 TODO 리스트이다.  
설계 문서:
- `input-event-editing-plan.md`
- `dom-to-model-sync-cases.md`
- `input-handling-implementation-guide.md`

---

## 1. EditorViewDOM 레벨

- [ ] **E1: 이벤트 배선 정리**
  - [ ] `contentEditableElement`에 `beforeinput` → `InputHandlerImpl.handleBeforeInput` 연결
  - [ ] `contentEditableElement`에 `keydown` → `InputHandlerImpl.handleKeyDown` 연결
  - [ ] `document`의 `selectionchange` → SelectionManager + `editor:selection.change` 경로 확인

- [ ] **E2: SelectionManager 연동 재확인**
  - [ ] DOM Selection → 모델 Selection 변환 유틸 정리 (`_convertDOMSelectionToModel` 등)
  - [ ] render 후 모델 Selection → DOM Selection 복원 경로 정리

- [ ] **E3: MutationObserverManager 연결**
  - [ ] `MutationObserverManagerImpl`가 content root에 `MutationObserver`를 붙이는지 확인
  - [ ] DOM-origin 변경을 `InputHandlerImpl` 쪽으로 전달하는 인터페이스 정리

---

## 2. InputHandlerImpl (이벤트 허브)

- [ ] **I1: 인터페이스/스켈레톤 정리**
  - [ ] `InputHandlerImpl`에 다음 메서드 정리
    - [ ] `handleBeforeInput(event: InputEvent): void`
    - [ ] `handleKeyDown(event: KeyboardEvent): void`
    - [ ] `handleDomMutations(mutations: MutationRecord[]): void` (또는 동등한 진입점)

- [ ] **I2: `handleBeforeInput` 구현**
  - [ ] `insertParagraph`, `insertLineBreak`, `historyUndo`, `historyRedo`만 `preventDefault()` 처리
  - [ ] SelectionManager에서 최신 모델 selection 확보
  - [ ] Paragraph/Block/History 관련 command 또는 DataStore 연산 호출
  - [ ] `editor.render()` + selection 복원

- [ ] **I3: `handleKeyDown` 구현**
  - [ ] `getKeyString(event)` 또는 동등한 유틸로 키 문자열 생성
  - [ ] (현재) `KeymapManager` 를 통해 단축키 처리
  - [ ] 추후 `KeyBindingManager`로 교체할 수 있도록 추상화

- [ ] **I4: `handleDomMutations` 구현**
  - [ ] `MutationRecord[]` 를 받아 케이스 분류 모듈(`dom-change-classifier`) 호출
  - [ ] C1/C2/C3/C4/8.x 케이스별로 DataStore 연산 호출
  - [ ] 모델 patch 후 `editor.render()` + selection 동기화 (필요한 경우에만)

---

## 3. DOM → 모델 케이스 분류기 (`dom-change-classifier`)

- [ ] **D1: 헬퍼 모듈 추가**
  - [ ] 파일: `src/dom-sync/dom-change-classifier.ts`
  - [ ] `classifyDomChange(mutations, selection, modelSnapshot)` 시그니처 정의

- [ ] **D2: C1 (단일 inline-text 텍스트 변경) 분류**
  - [ ] `characterData` + `data-bc-sid` 기반으로 단일 텍스트 변경 감지
  - [ ] 모델에서 `prevText` 가져와 diff 계산을 위한 payload 구성

- [ ] **D3: C2 (여러 인라인에 걸친 텍스트 변경) 분류**
  - [ ] 연속 인라인 영역의 `childList`+`characterData` 패턴 감지
  - [ ] selection 기반 `contentRange` + 평탄화된 `newText` 생성

- [ ] **D4: C3 (블록 구조 변경) 분류**
  - [ ] block-level `childList` 변화 패턴 정의 (split/merge/붙여넣기 등)
  - [ ] `insertParagraph`/mergeBlock 등 command로 매핑 가능한지 여부 포함

- [ ] **D5: C4 + 추가 케이스(8.x) 분류**
  - [ ] 인라인 스타일/태그 변경 → marks/decorators 후보로 분류
  - [ ] 자동 교정/스마트 인용/자동 링크/DnD/IME 특수 케이스용 태그 추가

---

## 4. DataStore 연산 경로 확인

- [ ] **S1: `RangeOperations.replaceText` 경로 검증**
  - [ ] C1/C2/IME 최종 결과/붙여넣기/자동 교정이 모두 `replaceText`로 수렴하는지 확인
  - [ ] mark/decorator 정규화 동작을 테스트 케이스로 검증

- [ ] **S2: `RangeOperations.deleteText` 사용 지점 정리**
  - [ ] Backspace/Delete/단어 삭제에 대해 `deleteText` 호출 위치 명확화

---

## 5. Selection 동기화

- [ ] **SEL1: DOM Selection → 모델 Selection**
  - [ ] selectionchange + 입력 처리 시작 시점에 항상 최신 모델 selection 확보
  - [ ] C2/C3/C4 케이스의 `contentRange` 계산에서 이 selection을 사용

- [ ] **SEL2: 모델 Selection → DOM Selection**
  - [ ] render 후 모델 selection을 DOM selection으로 복원하는 헬퍼 정리
  - [ ] 입력 중에는 브라우저 selection을 최대한 존중 (race condition 문서와 일치)

---

## 6. IME/한글 및 특수 케이스

- [ ] **IME1: 조합 중간 상태 무시/보류**
  - [ ] 조합 중간 Mutation은 무시 또는 버퍼링
  - [ ] 조합 완료 시점의 최종 DOM 텍스트만 C1/C2 경로로 `replaceText`

- [ ] **IME2: 구조 변경과의 충돌 방지**
  - [ ] IME 조합 중 Enter/Backspace/붙여넣기 등 구조 변경 command를 어떻게 막을지 결정

---

## 7. `beforeinput` 기반 Insert Range 힌트

- [ ] **B1: InputHint 타입 정의**
  - [ ] `InputHint` 구조 정의: `inputType`, `contentRange`, `text?`, `timestamp`
  - [ ] `ClassifyOptions`에 `inputHint?` 필드 추가

- [ ] **B2: `handleBeforeInput`에서 Insert Range 계산**
  - [ ] `insertText` / `insertFromPaste` / `insertReplacementText` / (필요 시) `insertCompositionText`에 대해만 처리
  - [ ] 우선 `event.getTargetRanges?.()[0]` 사용, 없으면 DOM selection Range 사용
  - [ ] DOM Range → 모델 `ContentRange` 변환 유틸 정리
  - [ ] IME(Firefox 등)에서 selection이 collapsed인 조합 중에는  
        `compositionStartOffset` + `compositionLength`로 보정된 Range 계산

- [ ] **B3: InputHint 전달 경로**
  - [ ] `InputHandlerImpl` 내부에 `_pendingInsertHint` 저장
  - [ ] `handleDomMutations` 호출 시 `ClassifyOptions.inputHint`로 전달
  - [ ] `timestamp` 등으로 최소한의 유효성 검사 (너무 오래된 힌트 무시)

- [ ] **B4: C1에서 InputHint 활용**
  - [ ] `classifyC1`의 `contentRange` 계산 시 `analyzeTextChanges` 결과 + `modelSelection` + `inputHint`를 조합
  - [ ] diff 결과와 InputHint 범위가 크게 다를 때의 우선순위/로그 정책 정의

- [ ] **B5: C2에서 InputHint 활용**
  - [ ] multi-inline 영역(C2)에서 selection 기반 `contentRange`와 `inputHint.contentRange`를 비교
  - [ ] 단어 삭제/넓은 selection 덮어쓰기/붙여넣기 등에서 더 정확한 start/end 계산에 사용

- [ ] **B6: InputHint 생명주기 관리**
  - [ ] C1/C2/C3 중 하나로 실제 `replaceText`/`deleteText` 또는 command가 실행되면 `_pendingInsertHint` 초기화
  - [ ] `IME_INTERMEDIATE` 등 조합 중간 상태에서는 사용하지 않고 그대로 유지 (`isComposing === true`일 때 무시)
  - [ ] selection 이동/입력 타입 불일치/시간 초과 시 힌트가 자동으로 무시되도록 규칙 정의 (`getValidInsertHint`에서 처리)

- [ ] **B7: Insert Range 힌트 관련 테스트**
  - [ ] 기본 `insertText`에서 devtool 상 `contentRange`와 selection이 기대와 일치하는지 검증
  - [ ] 넓은 selection + 덮어쓰기(C2)에서 InputHint를 사용했을 때/사용하지 않았을 때 차이 비교
  - [ ] 한글 조합(Chrome/Firefox)에서 IME + InputHint 조합이 모델/DOM 동기성을 유지하는지 테스트

---

## 8. 테스트 시나리오

- [ ] **T1: 기본 텍스트 입력 (C1)**
- [ ] **T2: 광범위 selection + 덮어쓰기 (C2)**
- [ ] **T3: Enter/Shift+Enter/Backspace 구조 변경 (`beforeinput` + C3 fallback)**
- [ ] **T4: Bold/Italic/Undo/Redo 단축키 (keydown + command)**
- [ ] **T5: 붙여넣기/삭제/드롭 (C2/C3 + 붙여넣기 정책)**
- [ ] **T6: IME/한글 입력 (조합 중/조합 완료)**  
- [ ] **T7: 자동 교정/스마트 인용/자동 링크 등장 시 정책대로 동작하는지 검증**

---

이 TODO 문서를 기준으로, 각 항목을 하나씩 구현/검증하면서 체크해 나가면 된다.


