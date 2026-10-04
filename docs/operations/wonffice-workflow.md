# Wonffice 작업 운영 계약

적용일: 2026-10-04. 이 문서는 작업 선택과 인계의 고정 규칙이다. 각 이슈의 **현재** 우선순위, 준비 상태, 배정, 완료 판정은 GitHub 이슈 맨 위의 `wonffice-work:v1` 기록에서 확인한다. 마일스톤은 출시 목표와 연구 주제를 묶는다. Git 커밋과 검사 기록은 실행 증거이며, 상태 기록을 대신하지 않는다. 오래된 댓글과 자동화 프롬프트는 역사 자료다.

## 세 역할과 결정권

| 역할 | 결정·산출물 | 하지 않는 일 |
| --- | --- | --- |
| Research | 등록된 카테고리의 질문·근거·반례를 조사해 기존 연구 이슈에 남긴다. 새 제안은 Planner에 `채택 / 추가 검증 / 보류` 판단을 요청한다. 전문 Work는 정해진 질문에만 일시적으로 실행한다. | 구현을 배정하거나 연구 완료를 출시 약속으로 바꾸지 않는다. |
| Planner | 사용자 요청의 원문·시각을 보존하고 단일 우선순위 순서, 이슈 상태, 준비 조건, 배정, 인수, 출시 후보를 결정한다. | 제품 코드를 직접 통합하거나 검증 전 결과를 완료 처리하지 않는다. |
| Execute | 승인된 한 제품 이슈의 한 슬라이스를 소유하고 구현·관련 검사·로컬 커밋·직렬 통합을 수행한다. 실제 결과를 조건별로 보고한다. | 다른 이슈를 자기 판단으로 새로 착수하거나 연구 제안을 자동 구현하지 않는다. |

별도 상시 Review 승인 단계는 두지 않는다. 유의미한 관련 검사와 실제 사용자 흐름을 정확한 source SHA에서 확인한다. 기존 보안·원격 보호·최종 출시 gate는 유지한다. 현재 개발은 로컬 `develop` 직렬 통합이며, 푸시·PR·배포는 별도의 최종 출시 절차에 따른다.

## 이슈의 공통 현재 기록

새 이슈는 GitHub 양식을 사용한다. 단, 새 양식이 원격 기본 브랜치에 반영되기 전에는 Planner가 같은 필수 필드와 아래 블록으로 수동 작성한다. 양식을 활성화하기 위해 일상 개발의 원격 게시 금지를 우회하지 않는다. 기존 이슈는 원문과 댓글을 그대로 보존하고 맨 위에 이 블록 하나만 둔다. Planner만 현재 기록을 갱신하며, 바뀐 결정과 근거를 짧게 남긴다. 동적 상태를 운영 문서나 여러 댓글에 복제하지 않는다.

```markdown
<!-- wonffice-work:v1 -->
## 현재 작업 기록
- 유형: implementation | research | coordination | defect
- 카테고리: docs/operations/research-categories.md의 ID 또는 product/operations
- 우선순위: P0 | P1 | P2 | unranked
- 준비 상태: needs-triage | backlog | ready | running | verifying | waiting | paused | human-hold | accepted | superseded | cancelled
- 출시 약속: none | candidate | committed (목표 마일스톤과 결정 근거)
- 담당: 역할/기존 Work, 배정 ID·버전 또는 미배정
- 마지막 확인: UTC 시각, 관찰 근거
- 다음 안전한 행동: 한 문장
- 차단·재개 조건: 없으면 none
- 원래 요청·범위·완료 조건: 아래 본문 참조; 새 조건은 명시적으로 기록
<!-- /wonffice-work:v1 -->
```

`open/closed`는 GitHub 생명주기이고 위의 준비 상태와 다르다. 확인하지 못한 이슈는 `unranked / needs-triage / 출시 약속 none`으로 둔다. 마일스톤이 있다고 출시 약속 `committed`가 되지 않는다. 현재 실행의 `running`은 실제 턴·작업 공간 관찰과 UTC 시각이 있을 때만 쓴다. 시간이 지난 표시를 영구 생존 증거로 사용하지 않는다. 사람의 보류는 `human-hold`로 유지하며, 다른 업무를 위해 잠시 멈춘 일은 `paused`다. `superseded`는 대체 이슈와 보존한 산출물의 행선지, `cancelled`는 사용자 중지 결정과 보존·정리 범위를 기록한다.

## 작업 선택과 메시지 분류

Planner가 `P0 → P1 → P2` 순으로 **ready인 한 제품 슬라이스**를 선택한다. 의존성·소유권·검증 가능성을 먼저 확인한다. 연구 이슈와 구현 이슈는 중복 없이 연결하되 연구 마일스톤을 자동 출시 gate로 만들지 않는다. 사용자 직접 지시가 순서를 바꾸면 원문·시각·이전 배정·새 순서·적용 시점을 현재 이슈 기록에 남긴다.

| 들어온 요청 | 적용 |
| --- | --- |
| 긴급중단 | 권한·자료 손실 등 즉시 위험. 진행 중 쓰기와 검사 상태를 보존하고 안전 checkpoint 후 멈춘다. |
| 다음 안전지점 전환 | 우선순위·범위 변경. 현재 원자적 저장·검사·통합 경계를 마치고 checkpoint를 만든 다음 전환한다. |
| 참고정보 | 비교 연구, 새 가설, 일반 피드백. 현재 Execute 배정은 유지하고 Planner가 다음 계획에서 판단한다. |

분류가 모호하면 Planner가 사용자 원문과 실제 실행 상태를 대조해 분류한다. courier의 전달 성공은 배정이나 채택의 증거가 아니다. 중간 메시지는 기존 작업을 조용히 대체하지 않는다.

## 배정, ACK, checkpoint, 결과

Planner의 배정은 다음 필드를 포함한다. `assignment_id`는 이슈 번호와 버전으로 만든다(예: `wonffice-468/v2`). 내용이 달라지면 버전을 올리고 이전 배정을 `superseded`로 연결한다.

```text
ASSIGNMENT id/version | issue | 사용자 목표·승인 원문 | priority | release commitment
scope | non-goals | dependency | base SHA/branch | 소유 파일·helper 경계
AC별 확인 방법 | 필수 검사 | 예상 안전 checkpoint | preemption class | 보고 위치
```

Execute는 착수 전에 `ACK id/version | 실제 worktree/branch/HEAD | dirty/untracked 범위 | 현재 실행/중복 소유 여부 | 충돌·차단 | 첫 안전 행동`을 답한다. 예상 base와 실제 base가 다르면 새 구현 전에 Planner와 정합화한다. Helper는 같은 배정 ID 아래에서만 작업하며 Execute만 직렬 통합한다.

중단 checkpoint: `issue/assignment`, base·candidate·integration SHA, worktree와 dirty/untracked 파일, 진행 중 명령/프로세스, AC별 PASS·FAIL·NOT RUN, 보존된 실패 로그, 권한·자료 위험, 다음 한 행동, 재개 조건. 다른 소유자에게 넘기거나 lease를 만료 처리하기 전에 **실제** 턴·프로세스·브랜치 상태를 확인한다. lease의 시간 만료만으로 다른 Execute를 시작하지 않는다.

재개 순서: 최신 사용자 지시와 이슈/PR 조회 → 실제 Work 생존 확인 → worktree diff와 기준 SHA 확인 → 보존된 AC·실패 로그 확인 → 배정 버전과 scope 재확인 → 착수. GitHub 조회 실패 때는 로컬 변경을 보존하고 중복 이슈·PR·통합을 하지 않는다.

결과 묶음: `RESULT id/version | 변경 내용 | AC별 PASS/FAIL/NOT RUN·명령·환경·로그 | candidate/integration SHA·tree | 남은 문제·다음 행동 | 인수 요청`. `implemented`는 코드 완료, `verified`는 고정 소스의 해당 AC 검사 완료, `accepted`는 Planner가 이슈 범위를 인수, `released`는 실제 배포·운영 gate 완료다. 서로 자동 승격하지 않는다. 검증 완료 조건을 충족하지 않은 이슈는 열어 둔다.

## 주간 작은 결과

Planner는 주마다 하나의 좁고 인수 가능한 결과와 그 검사 범위를 먼저 확정한다. 전체 Goal이나 모든 Research 이슈를 매주의 gate로 올리지 않는다. 이미 고정 source에서 통과한 검사는 새 변경의 영향을 받지 않으면 재사용한다. 매주 결과는 `이번에 인수한 범위 / 정확한 SHA·검사 / 남은 범위 / 다음 한 일`로 보고한다.

## 개편 당시 보호할 작업

2026-10-04 기준 #468이 현재 제품 실행, #479가 같은 Execute의 연결된 대기 범위다. #407은 Site 원래 인수와 WIP를 보존한 재개 대기, #434는 사용자 명시 보류다. #450은 로컬 구현·검증과 GitHub 상태의 불일치를 인수 판단해야 하며, #470은 기반 구현과 잔여 제품 i18n을 분리해야 한다. 이 문장은 당시의 **이전 지침**이다. 최신 상태는 각 이슈 현재 기록과 실제 Git 상태를 다시 읽는다.
