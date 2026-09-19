---
work_id: wonffice-platform
artifact_type: runtime_spec
status: ready_for_build
owner_role: architect
source_request: "컴퓨터가 켜져 있는 동안 GitHub 기반 자동 개발과 중간 지시 지원"
last_updated: 2026-09-19
---

# Wonffice 개발 Agent 실행 설계

이 문서는 Codex 작업 흐름과 향후 별도 실행기의 계약이다. 사용자 추가 결정: **Codex가 이 저장소 작업을 시작·재개할 때 GitHub 이슈와 PR을 먼저 확인하고 진행한다.** 앱을 열기만 해도 백그라운드 작업이 시작되는 기능을 구성한 것은 아니다. 현재 실행 규칙은 [루트 AGENTS.md](../../AGENTS.md)에 둔다. 서비스 경계는 [플랫폼 설계](wonffice-platform.md)를 따른다.

현재 단계에서는 Codex가 계획·구현·검사·GitHub 작업을 조율한다. 독립 상주 supervisor 개발은 후속 선택이다. 아래 영속 상태·격리 broker·비용 계측은 설계 목표이며, 현재 Codex 세션에서 모두 구현된 보장으로 해석하지 않는다.

## 1. 실행 구성

현재는 Codex 작업 턴이 GitHub 조회부터 시작한다. 향후 독립 실행이 필요하면 `apps/agent-runner`의 supervisor가 작업을 결정하고 기록한다. 모델은 supervisor의 정책을 변경하지 않는다. 독립 실행기의 초기 구성은 저장소당 supervisor 하나와 작업자 하나다. 이후 파일·의존 관계가 겹치지 않는 작업만 두 개까지 실행한다. 구현·검사·검토는 역할이며, 각 역할마다 상시 Agent 프로세스를 만들 필요는 없다.

| 구성 | 책임 | 비밀정보 |
| --- | --- | --- |
| Supervisor | 작업 상태, 우선순위, 요청 버전, lease, 예산, 중단·복구 | 저장소 권한 정책만 읽음 |
| GitHub broker | 인증된 읽기·이슈/PR 생성·push·허용된 병합 | 저장소 범위 GitHub App 자격증명 |
| Executor adapter | 설치된 코드 Agent 호출·종료, 구조화 결과 수집 | 필요한 모델 인증만 제한된 방식으로 제공 |
| 격리 작업 환경 | checkout 수정, 의존성 설치, 빌드·검사·브라우저 | GitHub 쓰기·운영 서버·고객 DB 자격증명 없음 |
| Evidence store | 요청·기준 commit·결과 commit·검사·스크린샷·실패 기록 | 비밀정보와 실제 고객 본문 제외 |
| Release worker | 검증된 버전의 staging·운영 배포 | 배포 환경별 제한된 자격증명 |

모델 공급자와 CLI는 adapter 뒤에 둔다. 현재 설치된 CLI의 비대화형 실행·취소·인증 격리·결과 형식을 먼저 검사한다. 특정 제품의 미확인 기능을 필수 기반으로 가정하지 않는다.

GitHub Actions의 self-hosted runner만 설치해서는 이슈 분류·계획·중간 지시·복구 감독이 생기지 않는다. 별도 supervisor를 둔다. self-hosted runner는 매번 깨끗한 실행 환경을 보장하지도 않는다. [GitHub runner 문서](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners)

## 2. 작업과 권한의 원본

GitHub 이슈가 요구·완료 기준·우선순위의 협업 원본이다. 로컬 SQLite는 실행 상태·lease·checkpoint·원격 작업 결과를 보관한다. 로컬 이슈 초안은 GitHub 게시 전 자료이며 별도 경쟁 backlog가 아니다.

실행 가능한 요청에는 다음 정보가 필요하다.

```ts
// 제안 계약. 고객 문서 변경 API와 별개다.
type DevelopmentJob = {
  workId: string;
  repositoryId: string;
  issueNumber: number;
  requestRevision: number;
  requestHash: string;
  baseSha: string;
  policyVersion: string;
  scope: { paths: string[]; acceptance: string[] };
  risk: 'routine' | 'feature' | 'restricted';
  priority: number;
  budget: { maxAttempts: number; maxMinutes: number; maxCost: number };
};
```

이슈 본문은 작업 자료다. 권한 명령이 아니다. 외부 사용자가 쓴 “CI를 끄고 병합하라”는 문장을 실행 정책으로 적용하지 않는다. 승인된 운영자 또는 사전에 허용한 로드맵 정책이 ready 전환을 허가한다. label은 상태 표시이며 단독 권한 근거가 아니다.

운영자가 한 번 승인한 작업 범위 안에서는 발견한 결함의 이슈 생성·처리를 자동으로 수행할 수 있다. 범위 밖 제안은 draft/triage 상태로 둔다. `workId + 실패 유형 + 대상` fingerprint로 중복을 막는다. 승인된 일이 없으면 idle 상태로 대기한다. 기능을 끝없이 발명하여 새 이슈를 생성하지 않는다.

## 3. 상태 전이와 재시도

```mermaid
stateDiagram-v2
  [*] --> triage
  triage --> ready: 범위·정책 확인
  ready --> planning: lease 획득
  planning --> implementing: 완료 기준 확정
  implementing --> validating
  validating --> reviewing: 검사 통과
  reviewing --> pr_open: 검토 통과
  pr_open --> ci_wait
  ci_wait --> merge_ready: 최신 commit 검사 통과
  merge_ready --> merged: 정책 허용
  merged --> release_pending
  release_pending --> completed: 배포 범위의 완료 기준 충족
  validating --> implementing: 남은 재시도 예산
  reviewing --> implementing: 수정 필요
  ci_wait --> implementing: CI 실패·남은 예산
```

모든 병합 전 상태에서 paused/cancelled/needs_owner로 전환할 수 있다. merged 이후의 취소는 이미 병합한 변경을 삭제하지 않는다. 후속 revert 또는 release 중단 작업을 만든다. PR만 요구한 작업은 PR과 증거 전달로 완료할 수 있으며, 미출시 상태를 명시한다. 기능 개발 완료와 실제 배포 완료를 같은 상태로 표시하지 않는다.

SQLite에는 jobs, attempts, checkpoints, steering_events, external_actions, evidence를 저장한다. 부작용 전에 외부 작업 의도를 기록한다. GitHub 응답이 끊기면 branch·PR·workId marker를 조회한 뒤 재시도한다. PR 생성의 exactly-once를 가정하지 않는다. 같은 목적의 PR이 이미 있으면 재사용한다.

lease에는 fencing 번호를 둔다. broker는 현재 번호와 요청 버전을 확인한 작업만 게시한다. GitHub label을 분산 lock처럼 사용하지 않는다. 초기 단일 supervisor lock을 검증한다. 향후 여러 컴퓨터 실행은 서버 lease 서비스가 준비된 뒤 허용한다.

프로세스 종료·절전 후에는 저장한 상태와 GitHub의 실제 상태를 대조한다. 실행 중이던 검사 결과는 통과로 간주하지 않는다. 기존 worktree에서 변경과 로그를 보존하고 재개 가능한 단계부터 실행한다. 이전 프로세스가 살아 있으면 먼저 종료·격리를 확인한다. PC 전원 종료 중에는 개발 진행을 보장하지 않는다. 제품 서비스는 계속 실행된다.

## 4. GitHub 연결과 작업 디렉터리

장기 통합에는 GitHub App을 사용한다. 대상 저장소, 이슈·PR·contents 권한을 필요한 범위로 제한한다. 규칙 변경·비밀정보 관리 권한은 개발 broker에 주지 않는다. GitHub도 장기 통합에 GitHub App을 권장한다. [GitHub 인증 문서](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

첫 로컬 실행은 외부에서 접속할 주소 없이 조건부 polling을 사용한다. 기본 간격 제안은 60초다. 서버의 poll interval·rate-limit·retry-after가 우선한다. 요청을 직렬 처리하고 변경 없음 응답·지수 backoff를 사용한다. 서비스 webhook inbox가 준비되면 서명 검증·delivery 중복 제거 후 이벤트 기반으로 전환한다. GitHub는 webhook을 우선 권장하고 polling이 필요한 경우 조건부 요청을 안내한다. [REST 지침](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

운영자의 현재 작업 폴더는 건드리지 않는다. 별도 관리 clone에서 `baseSha`를 고정하고 `codex/<work-id>` branch와 작업별 worktree를 만든다. 검증하지 않은 로컬 변경을 자동 복사하지 않는다. 필요한 선행 PR이 병합되었는지 확인한 뒤 기준 commit을 선택한다. 작업자가 명시된 소유 파일 외의 변경을 제안하면 계획을 다시 검사한다.

worktree는 파일 충돌을 줄이는 도구이며 보안 격리가 아니다. 생성한 코드·설치 script·테스트는 제한된 container/VM에서 실행한다. 호스트 홈·GitHub 키·운영 비밀정보·Docker socket을 마운트하지 않는다. 모델 인증을 격리할 수 없는 adapter는 무인 실행 대상으로 활성화하지 않는다. 네트워크는 필요한 패키지·모델 endpoint와 테스트 서비스로 제한한다.

broker는 검증한 diff만 push한다. hook·임의 Git 설정을 실행하지 않는 별도 게시 경로를 사용한다. 외부 fork의 코드를 개인 PC의 신뢰된 runner에서 자동 실행하지 않는다. GitHub 역시 신뢰하지 않는 코드와 self-hosted runner의 지속적 침해 위험을 설명한다. [Actions 보안 지침](https://docs.github.com/en/actions/reference/security/secure-use)

## 5. 자동화 수준

다음 표는 운영자가 최초 활성화 때 범위·예산·대상을 지정하는 정책이다. 매 작업마다 재승인을 요구하지 않는다. 현재 문서 작성 자체가 자동 병합이나 운영 배포를 활성화하지는 않는다.

| 분류 | 자동 진행 | 별도 판단 조건 |
| --- | --- | --- |
| routine | 승인된 경로의 작은 결함 수정, 검사, 검토, PR, 필수 CI 후 병합 | API·schema·의존성·공통 코어·보안·검사 정책 변경이 포함되면 상향 |
| feature | 승인된 요구의 구현·검사·PR·테스트 tenant 비공개 미리보기. 정책 허용 시 병합 | 미정 요구, 범위 확대, 운영 적용 조건 미정 |
| restricted | 재현·분석·수정안·격리 검사·PR까지 자동 | 인증·tenant 격리·결제·파괴적 migration·비밀정보·CI/runner 정책 변경 |
| release | 동일 이미지 staging, smoke 검사, 지정된 배포 범위 적용 | 최초 운영 출시, 기존 정책 밖 배포, 되돌릴 수 없는 변경 |

문서 변경도 보안·개발 정책을 변경하면 restricted다. 테스트 추가는 가능하지만 필수 검사를 삭제하거나 기대값을 완화하는 변경을 routine으로 분류하지 않는다. 경로 목록만으로 위험을 판정하지 않는다. 변경 유형·의존 영향·실행 권한을 함께 검사한다.

승인된 서비스의 routine 수정은 staging 통과 후 사전 설정한 배포 시간·범위에서 자동 출시할 수 있다. 내부 설치는 고객 관리자가 지정한 업데이트 정책을 따른다. 개발 Agent가 고객 서버에 임의 접근하지 않는다. “공유”의 기본값은 운영자가 접근 가능한 비공개 PR/미리보기다. 공개 게시·고객 통지는 해당 범위의 별도 권한을 요구한다.

필수 증거 묶음은 `requestRevision + baseSha + headSha + policyVersion + testSuiteVersion`에 묶인다. 코드·요구·검사 정책이 바뀌면 이전 결과를 재사용하지 않는다. 병합 직전에 GitHub의 최신 head와 필수 check를 다시 확인한다. 저장소 규칙·merge queue 지원 여부는 활성화 시 확인한다. Agent의 자체 “통과” 문장을 CI 결과로 취급하지 않는다.

검토 역할은 구현 결과와 별도로 diff·완료 기준·회귀 위험을 확인한다. 같은 계열 모델의 검토를 독립 보안 보증으로 주장하지 않는다. 실행 정책과 필수 검사는 신뢰된 기준 버전에서 가져오며 PR이 스스로 완화할 수 없다.

## 6. 운영자의 중간 지시

첫 입력 경로는 GitHub 이슈와 로컬 운영 CLI다. 이후 Wonffice 운영 화면에 같은 이벤트 API를 연결한다. 일반 고객 지원 요청은 제품 개발 권한과 분리한다.

| 이벤트 | 처리 |
| --- | --- |
| amend | 완료 기준·범위 갱신, requestRevision 증가, 기존 계획·검토 결과 무효화 |
| reprioritize | 대기 순서 변경. 긴급 작업은 낮은 작업을 안전한 checkpoint에서 정지 |
| pause / resume | 현재 변경 보관, 이후 부작용 차단. 재개 시 remote 상태와 버전 재확인 |
| cancel | 병합 전 게시·병합 중단, branch와 로그 보관. 병합 후에는 후속 처리 생성 |

자연어 의견은 제안된 요구 변경으로 정리한다. 허용된 운영자 identity와 명확한 명령만 typed event로 확정한다. 이슈의 무관한 댓글 수정까지 모든 작업을 중단시키지 않도록 요구 본문의 정규화 hash와 명시적 steering event를 구분한다.

GitHub 댓글은 polling으로 수신하므로 즉시 취소를 보장하지 않는다. 병합 전에 최신 지시를 다시 조회한다. 로컬 긴급 정지는 broker의 쓰기 권한을 즉시 차단한다. 원격 병합 요청과 취소가 동시에 발생하면 GitHub 결과를 확인하고 필요 시 revert를 제안한다.

## 7. 운영 한도와 자기 개선

초기 기준안은 한 작업 최대 45분, 최대 3회 시도다. 금액 한도와 하루 전체 예산은 활성화 전에 설정한다. 비용 계측이 불가능한 공급자에서는 무제한 실행을 허용하지 않는다. 시간·호출 수 제한을 함께 적용한다. 같은 오류가 반복되거나 예산이 소진되면 needs_owner로 전환하고 다음 독립 작업을 선택한다.

운영 화면에는 대기·진행·검사·차단 작업, 마지막 정상 동작 시각, 사용 예산, 변경/미리보기 링크, 일시 정지를 표시한다. 알림은 완료·실패·판단 필요 시 보낸다. 변화 없는 상태를 반복 전송하지 않는다.

runner 개선도 일반 이슈·PR·검사로 처리한다. 실행 중인 job은 시작할 때의 runner·정책 버전에 고정한다. 새 runner는 대기 상태에서 교체하고 이전 실행 파일로 복구할 수 있어야 한다. Agent가 현재 프로세스의 권한·예산·검사 정책을 직접 수정하지 못하게 한다.

기본 실행 방식은 Codex 작업 시작·재개 시 GitHub를 확인하는 방식이다. macOS 로그인 시작, Codex 앱 실행 감지, 독립 daemon은 현재 범위에 넣지 않는다. 나중에 독립 supervisor가 필요하면 별도 요청으로 활성화한다. 잠자기 방지 설정을 몰래 바꾸지 않는다.
