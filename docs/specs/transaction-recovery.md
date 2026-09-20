# Transaction 실패 복구 계약

대상: [WP-01 #249](https://github.com/barocss/barocss-editor/issues/249). 이 계약은 로컬 편집 transaction의 반영 여부를 정의한다. JEV 없이 실행하고 검사한다.

## 결과

| 경로 | `success` | `committed` | 오류 | 문서 상태 |
| --- | --- | --- | --- | --- |
| operation 거부·예외, schema 거부, commit 쓰기 실패 | `false` | `false` | `errors` | 해당 transaction의 변경을 복구 |
| commit 완료 | `true` | `true` | 없음 | 변경 반영 |
| commit 후 history·이벤트·동기 hook·선택 적용·lock 해제 오류 | `true` | `true` | `postCommitErrors` | 변경 유지 |

`committed: true`는 로컬 DataStore 반영 완료다. 서버 저장 완료나 다른 클라이언트의 수신 완료를 뜻하지 않는다. `postCommitErrors`가 있으면 실패한 후처리를 확인한다. 원래 편집을 다시 실행하면 중복 변경이 생긴다. history 기록 자체가 실패하면 해당 편집의 undo 기록은 없을 수 있다.

`success`와 `errors`는 기존 필드를 유지한다. `committed`와 `postCommitErrors`는 추가 필드다. 외부 코드가 기존 형태의 `TransactionResult`를 만드는 경우를 위해 타입에서는 선택 필드로 둔다. 내장 manager의 정상 반환, DSL 취소 반환, Editor의 입력 형식 오류 반환에는 `committed`가 들어간다. 외부 결과에서 필드가 없으면 commit 여부를 새 계약으로 확정하지 않는다.

실패 결과의 `selectionAfter`는 실행 전 선택이다. 실패 결과의 `operations`는 진단용이며, 확정된 변경 목록이 아니다. 성공 결과의 `selectionAfter`는 연산이 계산한 선택이다. `applySelectionToView: false` 또는 선택 적용 오류가 있으면 실제 화면 선택과 다를 수 있다.

## 실행과 복구

1. lock을 얻은 실행만 자체 transaction 상태를 정리한다. lock 획득 실패로 다른 실행을 rollback하지 않는다. 이미 열린 DataStore overlay가 있으면 새 실행을 거부한다.
2. 연산은 overlay에 쓴다. `end()`는 수집한 연산을 반환하며 overlay를 닫지 않는다.
3. 연산·schema 검사 실패 시 overlay와 alias를 버리고 변경 전 노드를 복구한다. 선택과 history에는 실패한 편집을 기록하지 않는다.
4. commit 도중 쓰기가 실패해도 새로 만든 노드를 제거하고 변경·삭제한 노드를 복구한다. rollback은 inverse operation 유무에 의존하지 않는다.
5. commit 성공 후 history, 내용 이벤트, 각 동기 `onTransaction` hook, 선택 적용을 수행한다. 한 후처리의 오류가 뒤의 후처리를 막지 않는다.
6. 종료 시 manager 상태와 lock을 정리한다. commit 후 lock 해제 오류도 `postCommitErrors`에 기록한다. 다음 실행은 같은 manager 또는 새 DSL manager에서 시작할 수 있다.

복구 범위는 DataStore의 transaction 쓰기 경로다. 임의의 외부 파일·네트워크 변경이나 호출자가 노드 참조를 직접 변형한 부수 효과까지 되돌리지 않는다. 예약한 노드 ID는 rollback 후에도 재사용하지 않는다. `onBeforeTransaction`의 기존 예외 전달 방식과 비동기 hook 계약은 이번 변경 범위가 아니다.

## 이벤트와 협업

`DataStore.onOperation`은 overlay가 닫힌 뒤, commit한 연산을 원래 실행 순서로 전달한다. 거부되거나 rollback한 연산은 전달하지 않는다. transaction 밖의 쓰기는 기존처럼 즉시 전달한다. commit 전 실시간 관찰에 이 이벤트를 쓰던 외부 코드는 변경이 필요하다.

기본 협업 adapter는 이 이벤트를 구독하므로 실패한 로컬 편집을 전송하지 않는다. 이번 검사는 실제 DataStore와 BaseAdapter를 연결해 이 경계를 확인한다. 전송 실패 복구, 원격 transaction의 원자적 수신, 동시 편집 충돌 해결은 보장하지 않는다. DataStore 구독자 자체의 오류는 기존 이벤트 발행기의 오류 처리 대상이다.

## 검증

- 실패 주입 검사: 뒤 연산의 거부·예외, schema 거부 후 동일/신규 manager, inverse 없는 batch 실패, commit 후 hook·이벤트·history·lock 해제 오류, lock 획득 실패, commit 중 생성·삭제 쓰기 실패.
- 상태 비교: 문서, 선택, history, overlay, lock, 외부 연산 이벤트. 실패 뒤 정상 편집과 inverse 실행도 비교한다.
- 회귀 검사: model, datastore, editor-core의 history, collaboration.
- 데스크톱: Note 입력·서식·paste·undo·저장, Word 빠른 입력·선택·undo/redo, Slide 조합 입력·paste·undo·저장, Site 조합 입력·블록 paste·undo, React 입력·조합 흐름.

최종 검사 수와 실행 환경은 구현 PR에 기록한다. 이 변경은 schema/fragment 정책 후속 작업의 선행 조건이다. [#263](https://github.com/barocss/barocss-editor/issues/263), [#264](https://github.com/barocss/barocss-editor/issues/264), [#265](https://github.com/barocss/barocss-editor/issues/265)의 구현 완료를 뜻하지 않는다.
