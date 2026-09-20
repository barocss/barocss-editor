# Schema 편집 정책과 문서 조각

먼저 [편집 흐름과 커스텀 스키마 사용법](../schema-editing-guide.md)을 읽는다. 흐름도, 실행 예제, 정책 제어 항목과 현재 미연결 범위를 설명한다. 이 문서는 세부 계약을 기록한다.

관련 이슈: [#262](https://github.com/barocss/barocss-editor/issues/262), [#263](https://github.com/barocss/barocss-editor/issues/263).
선행 transaction 복구는 [#266](https://github.com/barocss/barocss-editor/pull/266)으로 main에 반영됐다.

## 이번 구현과 남은 연결

`@barocss/model`의 `FragmentEditor`는 editor 하나에 속한다. 조각을 생산하고, 읽기 전용 계획을 만들고, 실제 transaction으로 적용한다. JEV나 LLM을 호출하지 않는다.

직접 호출과 schema-backed clipboard command가 이 경로를 사용한다. 구형 `paste(INode[], range)` operation을 직접 호출하는 경로는 별도다. 실제 clipboard 형식과 여러 노드 선택은 #284에서 연결했다. DOM/React drop 위치와 move/copy 의도는 [#265 DND 계약](fragment-drag-and-drop.md)을 따른다. #263이 병합돼도 #262 전체를 완료 처리하지 않는다.

현재 생산자는 연속한 형제 노드 선택과 여러 텍스트 노드에 걸친 부분 선택을 지원한다. 소비자는 다음 경로를 지원한다.

- 부모의 지정 위치에서 자식 조각을 삽입하거나 연속한 자식을 교체한다.
- 같은 컨테이너의 여러 런 또는 형제 컨테이너 사이의 텍스트 범위를 열린 조각으로 교체한다. 앞뒤 텍스트와 marks를 보존한다.
- 여러 텍스트 런을 가진 flow 블록에 닫힌 블록을 삽입한다. 기존 블록을 앞뒤로 나누고 복사한 블록을 그 사이에 둔다.

서로 다른 열린 깊이, 명시적으로 허용하지 않은 부모 경로, 양 끝의 혼합 전략, 지원 범위 밖 move, 비어 있는 조각, 부속 자료가 있는 조각은 거절한다. 파일 업로드·표 셀 범위·캔버스는 이 API의 일반 본문 경로로 바꾸지 않는다.

## 기존 선언과 소비 범위

같은 이름의 다른 엔진 플래그와 의미가 같다고 가정하지 않는다.

| 선언 | 기존 의미와 소비 | 새 경로의 의미 |
| --- | --- | --- |
| content / group | ContentMatch, schema 검증, fitContent가 구조와 그룹을 사용 | 최종 형제 전체를 검사. 알 수 없는 타입과 잘못된 선언을 거절 |
| attrs | Validator가 required/type/options/range/custom validator를 검사 | 조각과 최종 구조의 속성을 검사. 생성하는 기본 블록에는 선언된 default만 적용 |
| marks | schema에 mark 정의가 있고 text에 범위가 있음. 기존 전체 트리 검사만으로 모든 mark 제약을 보장하지 않음 | 알려진 mark, 필수 속성, 범위, 노드와 부모의 허용 목록, 겹친 제외 관계를 검사 |
| atom | 표준 schema의 원자 노드 선언. 공통 paste가 모두 같은 의미로 사용하지 않음 | 열린 조각에서 경계를 제거하거나 대상 블록을 나누지 않음. 닫힌 노드 복사는 가능 |
| isolating | 기존 공통 paste의 경계 규칙으로 일관되게 소비되지 않음 | 다른 문서/다른 경계로 열린 내용을 결합하거나 대상 경계를 나누지 않음. 같은 경계 내부 텍스트 편집은 가능 |
| defining | 기존 공통 편집 의미가 확인되지 않음 | 새 자동 변환 의미를 부여하지 않음. 닫힌 조각은 항상 구조 보존 |
| code | DOM 입력에서 사용. 기존 paste의 literal 분기는 codeBlock 이름을 사용 | clipboard command에서 조상의 code 선언으로 literal 입력을 선택. 내부 rich 조각의 텍스트 변환 손실도 보고 |
| whitespace | pre/normal 타입은 존재. 표준 codeBlock은 미사용 pre 선언을 의도적으로 생략 | 공백을 정규화하지 않고 그대로 보존. 외부 parser 규칙은 #264 |
| draggable / droppable | datastore utility가 false와 content 유무를 사용 | #265 입력 연결에서 원본 draggable과 목적지 컨테이너 droppable을 검사. content/정책 검사는 별도 |

추가 정책은 `rules`, `defaultBlock`, 출처별 adapter, 참조 규칙이다. 기본 블록 후보가 선언만으로 유일하면 등록 없이 처리한다. 후보가 여러 개면 명시적 정책을 요구한다. 정책으로 content/attrs/marks 제약을 해제할 수 없다.

## 편집 규칙과 planner의 책임

`defineEditingRule`은 불변 규칙 값을 반환한다. `defineEditingPolicy`는 규칙 중복 ID를 검사하고 전체 정책을 복사·동결한다. 전역 등록을 하지 않는다. `FragmentEditor.configure`도 같은 검사를 수행하며, 잘못된 등록은 기존 정책과 세대를 변경하지 않는다.

규칙은 원본/대상 타입(정확한 이름 또는 `*`), open/closed 경계, 전체 속성의 equal/any, 선택적인 text/children 대상 방식을 조건으로 가진다. effect는 join-inline/preserve/reject다. 설명은 필수 reason에 둔다. join-inline은 open에서만 등록할 수 있다. 닫힌 노드의 임의 병합, 트리 변환 callback, 문서 쓰기 callback은 없다.

일치한 규칙 중 최대 priority를 사용한다. 기본 priority는 0이며, 같은 우선순위의 서로 다른 effect는 거절한다. 같은 effect의 규칙은 ID 순서로 함께 기록한다. 등록 순서나 타입 조건의 구체성으로 암묵적 우선순위를 만들지 않는다. 규칙이 없으면 열린 동일 타입/유효 속성 경계를 연결하고, 다른 경계와 닫힌 노드는 보존을 시도한다. 최종 구조가 유효하지 않으면 거절한다. 경계가 없는 inline 텍스트는 직접 삽입 후 검사한다.

유효 속성 비교에는 schema default를 포함한다. equal은 객체 키 순서를 무시하며 배열 순서를 구분한다. any는 비교를 생략할 뿐 속성 병합을 승인하지 않는다. 연결은 대상 속성을 유지하고 원본 속성이 사라지면 손실로 보고한다. 명시한 서로 다른 타입 간 연결은 structure 손실도 보고한다. marks는 보존하며 최종 허용 여부를 검사한다.

규칙의 source는 가장 안쪽 열린 컨테이너 또는 각 닫힌 최상위 노드다. target은 text 대상의 부모 또는 children 대상의 실제 inline 수용 컨테이너다. 감싸기가 필요하면 먼저 defaultBlock/유일 후보를 결정한다. 바깥 열린 조상에 대한 별도 사용자 규칙은 없다. 바깥 조상은 기존 격리·속성 손실·참조 검사의 대상이다.

preserve는 원래 조각 트리를 그대로 넣는다. 부분 section에 caption이 없으면 이를 합성하지 않는다. text 대상에서 보존할 때 기존 단일 런 블록 분할 제한을 적용한다. 규칙으로 구조 검사, 참조 검사, isolating/atom 경계를 우회할 수 없다.

`plan.trace`와 거절 결과의 `trace`는 ruleIds/sourceType/targetType/boundary/targetKind/effect/reason을 기록한다. 기본 규칙은 예약한 `builtin:` ID를 사용한다. 선택 전 검사에서 거절한 결과는 빈 trace일 수 있다. trace가 연결을 선택했더라도 최종 구조 검사가 실패할 수 있다. plan은 정책 선언이 아니라 판단 결과이며, transaction은 유효한 계획을 실행한다.

기존 DropBehavior 전역 registry·조회 API·스키마 힌트는 #274에서 제거했다. 호환 API는 없다. #265에서 입력 의도를 해석한 뒤 공통 planner를 호출해야 한다. 제품별 연결 사례와 실행 예제는 [사용 가이드](../schema-editing-guide.md#31-누가-판단-기준을-정의하나)를 참고한다.

## 서로 다른 컨테이너의 선택 교체

`rangeReplacement: 'preserve-boundaries'`는 다른 부모 경로 사이의 inline 교체를 허용한다. 기본 clipboard 정책은 이 값을 선언한다. 커스텀 정책은 직접 선택한다. 삽입은 시작 컨테이너에서 수행한다. 끝의 남은 내용은 원래 컨테이너에 둔다. 선택된 중간 내용을 지우되 schema의 content 식이 요구하는 기존 컨테이너는 비운 상태로 유지한다. 새 타입을 추측하거나 서로 다른 역할을 합치지 않는다. 격리·원자 경계, 최종 구조 위반, 여러 문단이나 닫힌 구조 입력은 이 경로에서 거절한다. 교체 범위 밖의 형제는 쓰지 않는다. 유지한 대상 ID의 metadata·version·생성/수정 시간도 보존한다.

## 조각과 호환성

`DocumentFragment`는 version, origin, selection, content, openStart/openEnd, references, resources를 가진다. `sourceId`는 출처 추적값이다. 적용할 `sid`로 사용하지 않는다.

열린 깊이는 첫/마지막 자식 경로에서 잘린 컨테이너 수다. 텍스트 잎은 세지 않는다. `section(caption, body(text))`의 text 일부를 복사하면 `section(body(partialText))`와 깊이 2를 보관한다. 부분 조각에는 빠진 caption을 강제하지 않는다. 하지만 실제 문서에서 caption을 제거하거나 순서를 바꾸는 계획은 거절한다. 열린 조상은 선택의 문맥이다. 대상에 같은 속성 문맥이 없어 그 속성을 전달하지 않으면 attribute 손실을 보고한다.

`validateEditingFragment`는 열린 끝에서 생략된 자식을 허용한다. `validateEditingContent`와 깊이 0 검사는 최종 구조에 필수 자식을 요구한다. 기존 `fitContent`의 자동 unwrap/drop을 호출하지 않는다.

직접 수용은 형식, schema 식별, 현재 schema 상태가 모두 같을 때만 허용한다. 기본 식별값은 실행 중 Schema 객체의 식별값이다. 같은 이름과 같은 stype만 가진 별개 Schema는 직접 호환되지 않는다. `schemaId`는 출처별 adapter를 찾는 이름이며, 이것만 같다고 직접 수용하지 않는다. 제품이 `schemaId`와 `schemaRevision`을 함께 선언하면 그 버전이 같은 조각을 직접 검사한다. 이 호환 계약의 버전 관리는 제품 책임이다. 그렇지 않은 다른 세션은 명시적 adapter가 필요하다. 로컬 basis는 별도로 실제 schema 객체·함수·선언을 계속 검사한다.

adapter는 변환한 조각, `converted` 또는 `preserved`, 알려진 손실 목록을 반환한다. `preserved`는 등록한 opaque 타입의 속성 등에 원본을 실제 보관하는 변환에 사용한다. 임의의 원본을 자동으로 보관한다는 뜻은 아니다. 변환 후에도 target schema 검사를 수행한다. 손실 종류는 structure/attribute/mark/reference다. 등록한 callback은 신뢰한 로컬 코드이며 순수 함수여야 한다.

참조 규칙은 노드 타입과 속성 이름으로 선언한다. 첫 버전은 최상위 문자열 속성의 node/external 참조를 지원한다. 필드 이름에서 의미를 추측하지 않는다. 조각 안의 node 참조는 새 ID로 바꾼다. 조각 밖 참조는 reject/preserve/same-document 규칙을 따른다. node 참조는 실제 대상도 있어야 한다. 제거될 노드를 참조하는 나머지 문서가 있으면 교체를 거절한다. 열린 경계 제거로 참조 끝점이 사라지는 경우도 거절한다.

## 계획과 적용

`EditingRequest.intent`의 copy/move와 target의 삽입/교체 범위는 별개다. 계획의 actions는 move/insert/replace/split/join/wrap/transform이다. 지원되는 로컬 move와 copy를 실행한다. 기존 DropBehavior 타입과 전역 registry는 제거했다. 실제 DND 입력과 move 제한은 별도 DND 계약을 따른다.

계획은 변경 순서의 근거인 부모·위치·제거 ID·중첩 내용·유지 ID·참조·caret 경로와 판정/손실을 보관한다. 계획 작성은 문서, 선택, history, 이벤트, datastore ID 할당기를 변경하지 않는다. 결과는 동결하며 적용 전에 직렬화 가능한 operation으로 복사한다.

적용은 TransactionManager가 lock을 얻은 뒤 상태를 확인한다. 확인과 실제 쓰기 사이에는 await가 없다. 새 ID는 이 보호 구간에서만 할당한다. `fragmentEdit`은 삽입 노드와 그 역연산을 기록한다. 제거한 하위 노드는 저장소에서도 제거하므로 undo 뒤 고아 노드가 남지 않는다. 실패는 선행 transaction 복구 계약으로 되돌린다. 실패한 적용이 소비한 ID 번호는 재사용하지 않는다.

성공한 history에는 확정한 노드·ID·선택 결과를 기록한다. undo/redo는 새 입력처럼 정책을 재실행하거나 ID를 다시 만들지 않는다. 정책 교체만으로 기존 history를 새 schema로 이주하지 않는다. 기존 editor의 undo/redo 구조와 복구 규칙을 따른다.

## 변경 감지와 제한

DataStore의 기존 version은 저장 버전 호환용으로 유지한다. 새 `getEditRevision()`은 저장·삭제·operation 기록·root 설정·map 교체를 단조 증가하는 쓰기 세대로 기록한다. `getDocumentEpoch()`는 root 설정/map 교체로 문서 교체를 구분한다. clear/restore에서도 과거 세대로 돌아가지 않는다. 정확한 변경 횟수를 뜻하지 않으며, 실패 후에도 세대가 증가할 수 있다.

계획은 editor 정책 소유자, 문서 identity/쓰기 세대/내용 스냅샷, schema 상태, 정책 등록 세대, 선택을 기록한다. 적용 시 모두 다시 확인한다. 대기 중 변경, 문서 교체, API로 변경 후 원상 복구, schema 선언 변경, 정책 교체, 선택 변경을 거절한다. schema 객체·함수 식별도 포함한다.

현재 검사는 문서 전체 스냅샷을 비교하므로 문서 크기에 비례한다. 첫 구현의 정확성 기준이며 향후 부분 범위 최적화가 가능하다. 공개 getNode/getNodes 객체를 직접 변경한 현재 차이도 검출한다. 그러나 외부 코드가 직접 변경한 뒤 원상 복구하는 과정이나 callback의 숨은 closure 상태는 관찰할 수 없다. 문서 변경은 DataStore API를 사용하고, 정책/callback 의미를 바꾸면 configure를 다시 호출한다. lock 규칙을 무시하는 직접 쓰기를 다른 transaction으로부터 격리하는 API는 아니다.

## 사용 예

```ts
import { FragmentEditor } from '@barocss/model';

const editing = new FragmentEditor(editor, {
  defaultBlock: 'body', // 후보가 여러 개일 때만 필요
  references: {
    pointer: { target: { kind: 'node', outside: 'same-document' } },
  },
});
const fragment = editing.captureText(sourceTextId, 1, 4);
const decision = editing.plan({
  intent: 'copy',
  fragment,
  target: { kind: 'text', nodeId: targetTextId, from: 2, to: 2 },
});
if (decision.ok) {
  const result = await editing.apply(decision.plan);
  // result.committed와 postCommitErrors는 transaction 복구 계약을 따른다.
}
```

실행 가능한 비표준 schema/필수 순서/isolating/참조 fixture는 model의 `test/transaction/fragment-editing.test.ts`에 있다. 실제 Editor.loadDocument와 undo/redo 연결은 editor-core의 `test/fragment-editing.test.ts`에 있다. schema의 열린 경계 검사는 `test/editing-validation.test.ts`에 있다.

## 삭제·분할·결합

`FragmentEditor.planStructure()`는 삭제·결합·분할과 선택 교체를 같은 editor 정책으로 계획한다. 커스텀 타입의 `splits`, 기존 open-boundary 규칙, 참조·복구 계약은 [구조 편집 정책](structural-editing-policy.md)을 따른다. 표·캔버스 전용 삭제는 별도 경로다.
