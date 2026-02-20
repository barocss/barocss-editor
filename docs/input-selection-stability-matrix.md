# IME / Selection 안정성 시나리오 매트릭스 (Desktop + Mobile + Browser)

이 문서는 에디터의 **selection + IME + 입력 안정성**을 기준으로, 플랫폼별 테스트 범위를 정렬하기 위한 기준 문서이다.
목표는 동일 동작에 대해 운영 환경별(Chrome/Safari, 데스크탑/모바일, 키보드 타입)에서
`model selection`, `DOM selection`, `mutation sync`가 일관되게 동작하도록 보증하는 것이다.

## 0) 전제

- 입력 모델은 `@barocss/model`의 결과를 source-of-truth로 사용.
- 로컬/원격 선택 정책:
  - local: 필요 시 `applySelectionToView(true)` 로 selection을 DOM에 적용
  - remote: `applySelectionToView(false)` 기본 적용
- 이벤트/동기화는 한편 입력 경로(키/IME/붙여넣기)와 한편 mutation 재동기화 경로를 분리해 관측.
- 현재 우선순위는 기능 안정성 강화(성능은 2차)이며, 테스트는 실패 시 즉시 롤백 기준으로 사용.

## 1) 공통 게이트 시나리오 (모든 플랫폼에서 1순위)

아래 항목은 플랫폼 별 차이가 있지만, 모든 환경에서 동일하게 통과되어야 한다.

### 1-1) 기본 일관성
- `insertText` 후 최종 `selectionAfter`가 model에서 유효한 text node로 수렴.
- 같은 `model selection`을 두 번 연속 `undo/redo`하여도 동일한 selection projection 유지.
- remote 업데이트 후 DOM selection 갱신이 발생하지 않음(로컬 정책 준수).
- composition 직후에도 caret position이 이전 모델 위치 기준으로 정확히 복귀.
- mutation observer가 처리한 뒤, 다음 rAF에서 model selection 적용이 실패하지 않음.

### 1-2) 입력-모델 정합성
- composition 중(IME on): partial composition 텍스트가 중간 상태로 모델에 반영되어도 최종 확정 텍스트와 selection이 일치해야 함.
- `beforeinput`의 기본 케이스에서 `getTargetRanges` 사용 가능 시:
  - StaticRange → model range 매핑 성공률이 최소치 이상.
  - 실패 시 fallback 경로에서 기존 동기화가 깨지지 않아야 함.
- `keyCode 229` 구간에서 "IME 관련 입력" 플래그가 과도하게 초기화되지 않아야 함.

### 1-3) 안전 실패 규칙 (Fail-safe)
- `inline-text` 바깥 텍스트 삽입 감지 시 model 갱신 없이 동작 정합성 유지.
- `resolveModelTextNodeId` 실패/매핑 누락 시 selection을 강제로 재설정하지 말고, 이벤트 추적만 수행.
- DOM 구조 불일치 감지 시 즉시 전체 re-render를 하지 않고, 필요한 경우만 보수적으로 복구.

## 2) 플랫폼별 시나리오 매트릭스

### Legend
- **Input flow**: `inputType` 또는 키 조합 기반 동작군
- **Expectation**: 최종 기대사항
- **Assert**: 자동검증 포인트
- **Priority**: P0(필수), P1(권장), P2(기록)

## 2-1) Desktop macOS

#### A. Safari macOS
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| mac-safari-01 | Korean IME, 일반 입력 (`insertText`) | 조합 중간 상태에서 selection이 임의로 이동하지 않음 | compositionstart~end 구간, 최종 `selectionAfter` 유효성 | P0 |
| mac-safari-02 | Safari 조합 종료 직후 이벤트 순서 변화 (`compositionend` 이후 `beforeinput/input`) | composition 종료 이벤트 플래그가 1회 안정적으로 해석됨 | `isComposing` 단독 판단을 보조 플래그로 보완 | P0 |
| mac-safari-03 | Enter, cmd+z/cmd+shift+z | 새 문단/undo/redo 시 selection이 텍스트 노드로 복원 | `selectionAfter` 유효 노드/offset 통과 | P0 |
| mac-safari-04 | Bold/italic toggle during composition + continue typing | command 적용이 조합 범위로 비의도 확산되지 않음 | 스타일 토글 전후 selection 위치 동일 | P1 |
| mac-safari-05 | 복붙 + 자동완성 제안 수락 | model 문자열/selection 일치 | content string equal, selection within editable text node | P1 |

#### B. Chrome macOS
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| mac-chrome-01 | 일반 영문 입력 + 한글 입력 혼합 | composition 상태 전환 시 selection offset이 점프하지 않음 | selection offset 안정성 | P0 |
| mac-chrome-02 | `home/end`, `option+arrow` 이동 + 편집 | 이동/삭제가 모델 노드 경계 인지 | 이동 후 caret이 유효한 range/offset | P1 |
| mac-chrome-03 | paste HTML/plain 텍스트 | 허용 범위에서만 반영, 미허용 영역에서는 no-op | 변경 범위 node 타입 가드 | P1 |

## 2-2) Desktop Windows/Linux

#### A. Chrome Windows
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| win-chrome-01 | 영어/한글 혼합 입력 + backspace 연속 | composition 경계에서 삭제가 1칸/1글자 오동작 안 함 | 삭제 후 expected text hash 비교 | P0 |
| win-chrome-02 | `ctrl+z / ctrl+y`, `ctrl+shift+arrow` | undo/redo 후 selection 일관성 | undo-redo 2회 반복 시 동일 selection 반복 | P0 |
| win-chrome-03 | table/list/block 변환 직후 Enter | 분기 node 생성 후 caret이 텍스트 노드로 이동 | insertParagraph/splitList 시 selection 텍스트 노드 검증 | P1 |

#### B. Chromium Linux
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| linux-chrome-01 | composition 없는 빠른 타이핑 + 스크롤/리렌더 | 렌더 완료 후 selection 복구 일관성 | rAF×2 전후 selection 동일 | P1 |

## 2-3) Mobile iOS

#### A. Safari iOS
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| ios-safari-01 | 소프트키보드 일반 입력 | 자동완성/교정 포함해 selection 유효성 유지 | final nodeId 존재 + 유효 offset | P0 |
| ios-safari-02 | emoji/문장부호 + Enter | line break/문장부호 입력 후 caret 유지 | 렌더 후 1회 model 비교 + selection 비교 | P1 |
| ios-safari-03 | paste + long-press 선택 삭제 | 범위 삭제 후 선택 구간 축소 동작 안정 | deleted range 없음 + selection collapse 여부 | P1 |
| ios-safari-04 | iOS 특화 제스처(더블탭 선택 + replace) | remote/local 정책 오염 없이 동작 | local only applySelection 경계 유지 | P1 |

#### B. Chrome iOS (내장 웹뷰 포함)
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| ios-chrome-01 | Gboard/기본 키보드 전환 반복 | 키보드 교체 시 composition 플래그 안정 | keyCode 229 + composition 플래그 히스테리시스 동작 | P1 |

## 2-4) Mobile Android

#### A. Chrome Android
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| and-chrome-01 | Gboard prediction + space 입력 | 예측 텍스트 확정 시 selection이 예측 후보 바깥으로 이동하지 않음 | 확정 텍스트 + selection consistency | P0 |
| and-chrome-02 | 한글 조합 + backspace | 조합 종료 직후 offset 보존 | pre/post model 텍스트 비교, offset 범위 보존 | P0 |
| and-chrome-03 | 음성입력 후 연속 타이핑 | 음성입력 끝난 직후 input 이벤트 정합 | model/text/selection 3항목 동기화 | P1 |

#### B. Samsung Keyboard/Samsung Internet
| ID | Input flow | Expectation | Assert | Priority |
|---|---|---|---|---|
| and-samsung-01 | 키보드 레이어 전환 + 특수문자 입력 | 문장 중간에서 selection 위치 안정 | selection anchor와 focus 일관 | P2 |

## 3) 우선순위 실행 플랜 (2단계)

### Stage 1 (즉시)
- 공통 게이트 + mac-safari, win-chrome, ios-safari 5~6개 P0 시나리오
- 결과를 `editor-view-dom`/`editor-view-react` 핵심 테스트로 우선 등록

### Stage 2 (확인 완료 후 확장)
- remaining P1/P2 시나리오 추가
- 커스텀 키맵(한글/중국어/일본어) 확장
- 브라우저/OS 조합별 수동 검증 체크리스트 정착

## 4) 테스트 코드와 연결 포인트

- 공통: `packages/editor-view-dom/test/...` + `packages/editor-view-react/test/...`에서 이벤트 순서/selection flow 단위 테스트 우선
- 통합: `apps/editor-test/tests/*`, `apps/editor-react/tests/*`에서 platform-neutral 동작 우선
- e2e: Playwright `projects` 분기 시나리오(Chrome Desktop/Firefox optional / Mobile emulator 1~2개)로 추적 이벤트 + selection state snapshot
- 선택 정책 보장: `editor:selection.model` 구독점에서 `source` 판별 + `applySelectionToView` 경로 검증

## 5) 수용 기준 (Definition of Done)

- Stage 1 P0 항목이 CI에서 자동/반자동으로 추적 가능
- 각 항목에 최소 1개 모델 상태 assertion (`editor.getSelection`, model node id 존재) + 1개 DOM assertion (selection range fallback 포함)
- 원격 업데이트 + composition 연동 시 DOM selection write가 강제되지 않음
- 실패 조건 발생 시, 변경은 다음 3가지 중 하나로만 귀속:
  - composition 플래그 미보완
  - 모델-선택 매핑 실패
  - 렌더 동기화 타이밍 역전
