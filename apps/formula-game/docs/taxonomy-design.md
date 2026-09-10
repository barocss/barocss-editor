# 분류와 문제 연결

## 분류의 기준

과목, 학습 수준, 분야를 독립된 목록으로 관리한다. 학교에서 배우는 과목과 단원은 교육과정 목록으로 따로 관리한다.

| 축             | 의미                      | 예                           | 원본 파일                               |
| -------------- | ------------------------- | ---------------------------- | --------------------------------------- |
| 과목           | 배울 내용의 큰 묶음       | 수학, 물리, 통계, 금융       | src/content/taxonomy/subjects.ts        |
| 학습 수준      | 문제의 학습 대상 범위     | 중등, 중등 2학년, 대학 전공  | src/content/taxonomy/learning-levels.ts |
| 분야           | 내용의 전문 영역          | 선형대수, 회귀분석, 유체역학 | src/content/taxonomy/domains.ts         |
| 학교 과목·단원 | 판본이 있는 교육과정 범위 | 공통수학1 → 다항식           | src/curriculum.ts                       |

[전체 목록과 현재 문제 연결표](taxonomy-catalog.md)는 데이터에서 생성한다. 현재 과목 19개, 수준 22개, 분야 75개다. 전체 학문 분야를 모두 열거한 목록은 아니다. 새로운 분류는 데이터를 추가해 등록한다. 빈 분류는 유지한다. 분류 수와 실제 콘텐츠 수를 구분한다.

범위 확장에는 [OECD 연구개발 분야 분류](https://www.oecd.org/en/data/datasets/research-and-development-statistics.html)와 [교육 분야·수준 안내](https://www.oecd.org/en/publications/education-at-a-glance-2023_e13bef63-en/full-report/reader-s-guide_32df226d.html)를 참고했다. 앱의 한국어 이름, 상세 목록, 상하 관계는 제품 편집 기준이다. OECD 분류를 그대로 구현하거나 인증받은 목록이 아니다. 학교 단원은 별도의 교육과정 출처를 사용한다.

## 추가 규칙

- ID는 이름과 분리한다. 표시 이름을 바꿔도 ID를 유지한다. 기존 ID를 다른 의미로 재사용하지 않는다.
- aliases에 검색 별칭을 넣는다. ‘선형대수’, ‘linear algebra’, ‘행렬’로 같은 항목을 찾을 수 있다.
- parentId는 같은 축의 상위 항목이다. 단계 수는 고정하지 않는다. 부모를 고르면 등록된 하위 분류도 포함한다.
- 세부 수준을 고른 경우, 넓은 수준만 연결된 문제까지 추측해서 포함하지 않는다. 예: ‘중등’ 문제를 자동으로 ‘중등 1학년’에 배치하지 않는다.
- 분야의 subjectIds는 여러 과목을 참조할 수 있다. 같은 회로 분야를 물리와 전기·전자에서 찾을 수 있다.
- 학교 과목은 subjectId와 learningLevelId로 공통 분류를 참조한다. 학교 과목 이름을 학문 분야 이름으로 바꾸지 않는다.
- 분류 ID 중복, 이름 누락, 잘못된 부모, 순환 참조, 잘못된 과목 연결은 빌드를 중단한다.
- 새 분류 파일을 추가할 때 taxonomy pack 또는 새 content pack에 등록한다. 필터나 화면의 enum을 수정할 필요는 없다.

## 문제 연결

기본 연결은 `문제.formulaId → 공식.topicIds → 주제.domainIds → 분야.subjectIds`다. 학습 수준은 `공식.schoolLevels`에서 상속한다. 여러 과목·분야를 연결하려면 해당 주제와 분야의 참조를 추가한다. 같은 공식을 과목마다 복제하지 않는다.

문제별 학습 대상을 좁히려면 classification을 지정한다.

```ts
{
  id: 'math.geometry.pythagorean.missing-square',
  formulaId: 'math.geometry.pythagorean',
  classification: {
    topicIds: ['math.geometry.right-triangle'],
    schoolLevels: ['middle-2', 'high'],
  },
  // 문제 본문, 입력 프로필, 채점 설정
}
```

classification의 주제는 원본 공식의 주제에 속해야 한다. 수준은 원본 공식의 수준 또는 그 하위 수준이어야 한다. 이 예에서는 중등·중등 2학년·고등으로 찾을 수 있다. 중등 1학년으로 찾으면 포함하지 않는다. 분류나 출제 대상이 바뀌면 문제 개정 번호를 올린다. 이전 기록은 기존 버전으로 유지한다.

한 필터의 여러 값은 OR로 묶는다. 과목·분야·수준 등 서로 다른 필터는 AND로 묶는다. 과목과 분야는 같은 연결 경로에서 일치해야 한다. 저장된 알 수 없는 ID를 지워서 전체 문제로 넓히지 않는다.

```sh
npm run catalog:report
npm test
npm run build
```

별도의 운영자 편집 화면은 아직 없다. 현재는 버전 관리하는 분류 파일과 문제 파일에서 연결한다. 향후 운영 도구나 서버로 옮겨도 같은 ID와 참조 규칙을 유지한다.
