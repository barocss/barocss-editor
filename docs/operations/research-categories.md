# Wonffice 연구 카테고리 등록부

이 등록부는 **빠뜨리지 않을 질문 영역**을 보존한다. 이슈의 현재 상태와 우선순위는 GitHub에서, 실제 결과는 각 연구 이슈의 고정 근거에서 읽는다. 연구 마일스톤은 질문의 소속이며 구현 배정이나 출시 약속이 아니다. Research가 조정 역할을 맡고, 전문 Work는 질문·범위·종료 조건이 정해졌을 때만 사용한다. 같은 근거의 작은 변형으로 이슈를 늘리지 않는다.

| ID | 질문 영역 | 기존 근거·마일스톤 | 다음 판단의 예 |
| --- | --- | --- | --- |
| `market` | 고객·시장·반복 업무, 현재 대안, 지불 의사 | [#289](https://github.com/barocss/barocss-editor/issues/289), [#296](https://github.com/barocss/barocss-editor/issues/296), [마일스톤 10](https://github.com/barocss/barocss-editor/milestone/10) | 경쟁 기능 존재와 고객 수요를 분리한다. |
| `feature` | 새 사용자 흐름, 요청 탐색·검토·연결 | [#441](https://github.com/barocss/barocss-editor/issues/441), [#451](https://github.com/barocss/barocss-editor/issues/451), [마일스톤 5](https://github.com/barocss/barocss-editor/milestone/5) | 작은 기능의 수요·재사용·보류 조건을 판단한다. |
| `ai-ux` | Agent 행위·원본 효과·사람의 판단 표시 | [#454](https://github.com/barocss/barocss-editor/issues/454), [마일스톤 11](https://github.com/barocss/barocss-editor/milestone/11) | 실제 화면에서 구별 가능한지 확인한다. |
| `technical` | 모델·operation·DSL·native 저장·렌더링 | [#455–462](https://github.com/barocss/barocss-editor/issues/455), [마일스톤 12](https://github.com/barocss/barocss-editor/milestone/12) | 소스 계약, 실패 재현, 제품 적용을 구분한다. |
| `agent-docs` | Agent가 발명한 schema·관계·view·계산의 인계·저장·경합 | [#469](https://github.com/barocss/barocss-editor/issues/469), [#471–478](https://github.com/barocss/barocss-editor/issues/478), [마일스톤 13](https://github.com/barocss/barocss-editor/milestone/13) | 격리 실험과 native 제품 증거를 분리한다. |
| `saas` | URL·인증·DB·배포·복구·운영 | [#485–487](https://github.com/barocss/barocss-editor/issues/485), [마일스톤 14](https://github.com/barocss/barocss-editor/milestone/14) | 정적 경로와 실제 설치·운영 검증을 구분한다. |

모든 카테고리에 적용하는 **교차 점검 영역**은 `i18n`, `authority`, `recovery`, `accessibility`다. 새 기능·문서·라우팅·저장 흐름에서 각각 상태 코드와 번역 리소스, 현재 신원/권한, 마지막 입력과 실패 복구, 키보드·초점·명도/크기를 확인한다. 관련 연구: [#464](https://github.com/barocss/barocss-editor/issues/464)와 [#470](https://github.com/barocss/barocss-editor/issues/470) (i18n), [#465](https://github.com/barocss/barocss-editor/issues/465)·[#466](https://github.com/barocss/barocss-editor/issues/466) (신뢰·근거), [#483](https://github.com/barocss/barocss-editor/issues/483) (복구). 교차 점검이 모든 이슈에 별도 구현 gate를 뜻하지는 않는다. 해당하지 않으면 이유를 적는다.

연구 인계는 `질문 → source/version → 관찰 → 가설·반례 → 검증하지 않은 범위 → 작은 다음 시험 → Planner의 채택/추가 검증/보류 요청` 순서다. 결과를 소비할 구현 이슈가 이미 있으면 링크로 연결하고 중복 생성하지 않는다. 자동화가 없는 카테고리도 등록부에 남아 있어야 한다.

## 자동화 정지 중 한정 연구 배정

정지된 heartbeat는 연구를 잊었다는 뜻이 아니다. Planner가 실제 다음 계획에 필요한 **한 질문**을 고를 때, 기존 연구 이슈에 질문·기존 근거·카테고리·결과의 사용처·중단 조건·완료 기준을 기록하고 Research 조정 Work에 한 번 전달한다. 이미 실행 중인 같은 질문과 전문 Work의 checkpoint를 확인해 중복 lease를 만들지 않는다. 조정 Work는 기존 카테고리 Work에 한정 범위를 전달하거나 직접 처리하고, 어느 쪽이 담당하는지 해당 이슈에 남긴다. 이 일회성 전달을 위해 heartbeat를 다시 켜지 않는다.

`agent-docs`에는 전담 전문 Work가 없다. 현재는 Research 조정 Work가 기존 #469/#471–478의 증거를 소유하며, 실제 한정 질문이 오면 직접 처리하거나 기존 전문 Work에 범위를 명시해 인계한다. 새 상시 Work를 만들 필요는 없다.

Research의 결과는 기존 이슈에 출처와 확인 시각, 사실·가설·반례, 미검증 범위, `채택 / 추가 검증 / 보류` 요청, 다음 재개 트리거를 남긴다. Planner가 사용 여부와 제품 우선순위를 결정한 뒤, Research와 전문 Work는 다시 대기한다. 결과가 없어도 중단 조건과 다음 재개 트리거를 남긴다. 새 질문이 없으면 정지 상태를 유지한다.
