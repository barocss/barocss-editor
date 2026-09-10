# 파일 기반 정적 DB

서버 없이 동작하는 TypeScript 데이터 DB다. 원본은 `src/database/data/`에 둔다. 앱은 이 원본을 빌드에 포함하며 네트워크 조회 없이 읽는다. JSON은 원본을 검증한 뒤 내보낸 검토·이전용 결과다.

## 현재 수록량

- 과목 19개 / 학습 수준 22개 / 분야 75개
- 공식 19개 / 일반 문제 37개
- 학교 과목 4개 / 단원 7개
- 유도 과정 1개 / 유도 단계 4개

분류가 있다는 것은 해당 분류의 문제가 모두 준비됐다는 뜻이 아니다.

## 파일 구조

```text
src/database/
  data/
    taxonomy/              과목·학습 수준·분야 원본
    packs/                 주제·공식·문제·입력 프로필 원본
    curriculum.ts          학교 과목·단원 연결
    derivations.ts         유도 과정과 단계 데이터
  manifest.ts              사용할 데이터 묶음 등록
  index.ts                 기본 파일 DB 생성
  repository.ts            조회·검증·스냅샷 내보내기
  curriculum-types.ts      학교 과정 데이터 타입
  derivation-types.ts      유도 과정 데이터 타입
  validate-curriculum.ts   학교 과정 참조 검사
src/content/types.ts       공식·문제·분류의 공통 타입
src/content/catalog.ts     공통 검증과 필터 규칙

data/formula-game.json     자동 생성한 DB 전체 스냅샷
```

기존 `src/content/packs/`, `src/content/taxonomy/`, `src/content/index.ts`는 이전 import를 유지하는 재노출 파일이다. 데이터를 복제해 관리하지 않는다. 수정은 `src/database/data/`에서 한다. `src/curriculum.ts`와 `src/derivations.ts`에는 조회·출제·진행 저장 동작을 둔다.

## 연결 구조

- 분야 → 과목 ID (복수 연결 가능)
- 주제 → 분야 ID
- 공식 → 주제 ID, 학습 수준 ID, 선수 공식 ID
- 문제 → 공식 ID, 입력 프로필 ID
- 학교 단원 → 학교 과목 ID, 공식 ID, 선택적으로 문제 ID
- 유도 과정 → 공식 ID, 순서가 있는 단계 목록
- 유도 단계 → 공식 ID, 입력 프로필 ID, 허용 답안

기존 공식·문제 ID와 개정 번호를 유지했다. 이번 이동으로 저장한 학습이나 풀이 기록을 초기화하지 않는다. 유도 단계의 입력 프로필도 원본에 있으며, 현재 피타고라스 단계는 같은 프로필을 공유한다.

## 앱의 조회 경로

```ts
import { database } from "./database";

const questions = database.listQuestions({ subjectId: "physics" });
const question = database.getQuestion("physics.circuits.ohm.current");
const formula = database.getFormula("physics.circuits.ohm");
const { courses, units } = database.getCurriculum();
const steps = database.getDerivationQuestions("pythagorean-area");
```

`listQuestions`와 `getQuestion`은 공개 문제만 반환한다. `getFormula`는 공개 공식만 반환한다. `getCatalog`는 편집·분류 검토용 전체 데이터를 반환하므로 초안·보관 상태도 포함한다. 반환된 원본 데이터는 동결돼 앱에서 실수로 내용을 바꿀 수 없다. `exportSnapshot`은 수정해도 원본에 영향이 없는 복사본이다.

유도 화면도 DB를 통해 단계와 입력 프로필을 읽는다. 현재 UI의 진입점과 그림은 피타고라스 전용이다. 다른 유도 데이터를 등록하는 것만으로 전용 그림이나 진입 화면이 자동 생성되지는 않는다.

## 데이터 추가 절차

1. 기존 분류와 입력 프로필을 재사용할 수 있는지 확인한다.
2. `data/packs/`에 공식과 문제를 작성한다. 새 묶음은 `manifest.ts`에 등록한다.
3. 학교 진도로 제공할 내용은 `data/curriculum.ts`에 연결한다.
4. 유도 연습은 `data/derivations.ts`의 목록에 등록한다.
5. `npm run db:validate`로 ID·참조·정답·분류·단계 연결을 검사한다.
6. 화면에서 입력과 채점을 검토한 뒤 `published` 상태로 공개한다.
7. `npm run db:export`로 JSON을 갱신한다.
8. `npm test`, `npm run lint`, `npm run build`를 실행한다.

ID는 이름을 바꿔도 유지한다. 학습 의미나 정답이 바뀌면 해당 공식·문제 또는 유도 과정의 revision을 올린다. 데이터 묶음 변경은 묶음 revision을 올린다. DB 스냅샷의 revision은 `database/index.ts`에서 관리한다. 스키마 구조 변경은 schemaVersion과 변환 정책을 함께 검토한다.

## JSON 내보내기

```sh
npm run db:validate
npm run db:export
```

`data/formula-game.json`은 schemaVersion, revision, catalog, schoolCourses, courseUnits, derivations를 포함한다. 이 JSON은 앱의 별도 원본이 아니다. 직접 편집하면 다음 내보내기에서 덮어쓴다. 테스트에서 JSON과 TS 원본의 일치 여부, JSON 재로딩 결과를 검사한다.

## 서버 연결 시

지금은 파일 데이터를 즉시 읽는 동기 조회 API다. 나중에 서버에서 같은 스냅샷을 내려받아 검증한 뒤 DB를 생성할 수 있다. 그때는 초기 비동기 로딩, 실패 처리, 캐시, 서버 응답의 런타임 형식 검사와 호환 버전 처리를 추가한다. 현재 네트워크 API나 서버 동기화가 구현됐다는 뜻은 아니다.

사용자 학습 설정과 기록은 콘텐츠 DB에 넣지 않는다. 토스·샌드박스에서는 SDK Storage, 일반 브라우저에서는 localStorage에 저장한다. JSON 스냅샷에는 사용자 데이터가 포함되지 않는다. 상세 동작은 [학습 저장소](./learning-storage.md)를 참고한다.

## 검증

- 기존 콘텐츠, 분류, 유도와 기록 테스트 유지.
- DB 조회, JSON 내보내기·재로딩, 외부 변경 차단 검사.
- 새 공개 문제 포함 및 초안 문제 제외 검사.
- 존재하지 않는 분류·입력 프로필·학교 연결·유도 공식, 중복 유도 단계 ID와 누락 정답 거부 검사.

최종 검증: 자동 테스트 39개, 린트, 웹 및 앱인토스 빌드 통과. 브라우저에서 기존 학습 4개·본 문제 16개·유도 4/4 완료 기록 유지, 물리 4문제 연결, 옴(Ω) 설명과 IR 정답 판정을 확인했다. 콘솔 오류는 없었다.
