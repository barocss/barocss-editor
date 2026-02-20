# editor-view-react IME/입력 안정성 체크리스트

목표: `editor-view-dom`과 동일한 방향으로, React 기반 contenteditable 경로에서도 입력/IME/렌더 타이밍을 안정화한다.

## A. 즉시 적용 체크리스트 (현재 구현 완료)

- [x] `compositionstart`에서 입력 가능 영역 검사 + 필요 시 block
- [x] `compositionupdate`에서 composing flag 유지
- [x] `compositionend` 직후 DOM 동기화 타이밍을 `rAF × 2`로 지연
- [x] `compositionstart/end` 이벤트 기반의 IME 플래그에 더해 `keyCode === 229`/조합 직후 윈도우(`compositionWindowUntil`) 보조 플래그 추가
- [x] `keydown`, `beforeinput`, `paste`, `drop`, `handleDomMutations`가 보조 IME 윈도우 상태에서 model 렌더/변환을 보수적으로 처리
- [x] `editor:content.change`에서 `skipRender` 및 `skipNextRenderFromMO` 경로 유지

## B. 추가 점검 항목 (추천)

- [ ] `beforeinput.getTargetRanges()` 사용률:
  - `insertText`/`insertReplacementText`/`insertFromPaste`에서 대상 범위를 model range로 변환해 `preventDefault + replaceText`로 처리 가능한지 검증
  - 범위가 `inline-text`를 벗어날 때 입력을 차단했을 때의 UX 확인
- [ ] Safari/macOS + Chrome/Android IME(한글/일본어/중국어)에서 다음 순서 시나리오 검증:
  - `compositionstart` 바로 뒤 첫 글자 입력
  - `compositionupdate` 연속, `compositionend` 뒤 `beforeinput/input` 순서 역전
  - `keydown`이 `keyCode 229`를 내뿜는 경우
- [ ] Composition 중 구조 변경(엔터/붙여넣기/드래그) 경로:
  - 즉시 렌더를 건너뛸지/완전 동기화할지 정책 일관성 확인
  - IME 중 selection 유지 안정성(커서 점프/리셋)
- [ ] React reconciliation side-effect 점검:
  - 동일 sid 재사용이 유지되는지
  - composition window 종료 직후 `skipApplyModelSelectionToDOM` 동작이 불필요한 selection 재적용을 막는지

## C. 실패/회귀 대응 체크

- [ ] IME 입력 중 `skipNextRenderFromMO`가 과도하게 남아 다음 편집까지 남는지
- [ ] `compositionWindowUntil` 타임아웃이 너무 길거나 짧을 때 발생하는 오탐/미탐 비율 확인
- [ ] `paste/drop`이 IME 직후에 오독되어 무시되는 케이스 분리(텍스트 입력 vs 비 IME 입력)

## D. 모니터링 이벤트(로그 또는 테스트 hook)

- `editor:input.*`/`editor:content.change` payload에 `from`이 `getTargetRanges|compositionend-sync|MutationObserver-C1` 등으로 충분히 구분되는지
- `selectionchange` 경로에서 `convertDOMSelectionToModel` 실패 빈도 추적
- composition window 내/직후 입력을 `skip`/`guard`한 횟수 집계 (안정화 정도 판단 지표)
