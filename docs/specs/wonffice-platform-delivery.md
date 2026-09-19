---
work_id: wonffice-platform
artifact_type: delivery_plan
status: ready_for_build
owner_role: architect
source_request: "Wonffice 서비스와 자동 개발 구조의 구현 순서 및 종료 기준"
last_updated: 2026-09-19
---

# Wonffice 플랫폼 구현 순서

WP 번호는 로컬 설계 식별자이며 GitHub issue 번호가 아니다. 아래 구현 작업은 모두 **미착수**다. 설계 문서 작성과 코드 완료를 구분한다. GitHub 게시 시 같은 WP ID를 본문에 넣고 기존 이슈를 조회하여 중복 생성을 막는다.

GitHub 연결: 누적 기준점은 [#248](https://github.com/barocss/barocss-editor/issues/248), 첫 구현 WP-01은 [#249](https://github.com/barocss/barocss-editor/issues/249)다. WP-01은 기준점 PR의 main 반영 후 착수한다. 다른 WP 항목은 아직 GitHub 이슈로 게시하지 않았다.

실행 방식 추가 결정: 현재 자동 진행의 시작점은 **Codex의 저장소 작업 시작·재개**다. [AGENTS.md](../../AGENTS.md)에 GitHub 우선 조회와 main 기준 PR 규칙을 추가했다. WP-03/04의 독립 실행기·daemon은 후속 선택이며, 서비스 첫 출시의 필수 선행 작업에서 제외한다. WP-10은 먼저 Codex 세션에서 검사 증거와 PR 정책을 검증한다. 앱 실행만으로 자동 시작하는 기능은 구성하지 않았다.

사용자 결정: **클라우드 SaaS와 고객사 내부 설치 동시 출시**. 모바일 설계·화면 검사는 제외한다. 기존 Note·Word·Slides·Site 기능 범위는 [제품 범위](wonffice-delivery-scope.md)를 유지한다.

## 1. 의존 관계와 인수 기준

| ID | 구현 단위·소유 영역 | 선행 | 반드시 통과할 검사 |
| --- | --- | --- | --- |
| WP-01 | model/datastore transaction 실패 처리와 commit 결과 | 없음 | N번째 연산 실패·schema 거부·예외 후 문서/선택/history 불변. 다음 transaction 정상. commit 후 hook 실패는 반영 여부를 잃지 않음 |
| WP-02 | office-contracts·headless capability 첫 adapter | WP-01 | schema 거부, 명시 대상, preview/apply revision 불일치, 동일 요청 재전송. DOM 없이 Note 문단 변경 실행 |
| WP-03 | agent-runner 감독·GitHub broker·격리 executor, PR까지 | 없음 | 승인된 작은 이슈 1건→격리 구현→필수 검사→PR. 중복 실행·권한 없는 요청·비밀정보 접근 차단 |
| WP-04 | Agent 복구·중간 지시·예산·운영 상태 | WP-03 | 강제 종료·절전/재개·응답 유실·rate limit 후 복구. 수정된 요구와 오래된 head로 게시/병합 차단 |
| WP-05 | office-api/worker, PostgreSQL·파일·OIDC, 두 배포 skeleton | 없음 | SaaS 설정과 내부 설치 설정에서 같은 이미지 기동. 계정·두 tenant·health·migration·기본 backup 확인 |
| WP-06 | 서버 문서/revision·로컬 이전·Note 저장 연결 | WP-01,02,05 | 두 계정 저장·재열기·409 초안 보존·중복 저장·최종 입력 flush. 원본을 보존한 로컬 이전 |
| WP-07 | 나머지 제품 저장·공통 viewer·공유·자산·게시 | WP-06 | 네 제품 작성→서버 저장→재열기→공유. 권한 회수·파일 직접 접근·실패한 게시에서 이전 버전 보존 |
| WP-08 | tenant 기능 registry·설정·설치·해제·버전 | WP-02,05,06 | A사 전용 기능, B사 우회 실행 거부. 호환 불가 설치 거부. 해제 후 데이터 보존 |
| WP-09 | 공동 편집 저장 권한·session epoch·재접속 | WP-06 | 한 제품에서 두 브라우저 동시 수정·오프라인 복귀·권한 회수·undo 검증 후 나머지 제품으로 확대 |
| WP-10 | Codex 기반 CI·증거 묶음·정책별 병합·비공개 미리보기 | WP-05 | red CI·변경된 head·완화된 검사·취소 요청이면 병합 차단. 허용된 실제 수정 1건은 활성 Codex 세션에서 미리보기까지 완료. 독립 실행 시에는 WP-04도 필요 |
| WP-11 | 두 환경 배포·복원·관측·업데이트·출시 인수 | WP-07,08,09,10 | 동일 digest의 두 환경 전체 인수, 이전 버전 업데이트·실패 복구·백업 복원·PC 종료 중 서비스 유지 |
| WP-12 | 고객 업무 Agent와 첫 업무 시나리오 | WP-02,07,08,11 | 고객 요청→견적 문서 생성→검토→권한 있는 공유. 기존 조합으로 불가능한 경우에만 개발 이슈 제안 |

WP-03과 WP-05는 WP-01의 수정과 기술적으로 독립이다. 다만 처음부터 여러 무인 작업자를 돌리지 않는다. 감독·검증 체계가 확인된 후에만 독립 작업을 병렬 실행한다. WP-10이 끝나기 전의 runner는 PR까지만 자동 처리한다.

## 2. 첫 작업 WP-01

**문제:** 실패한 operation 뒤의 overlay와 transaction 상태가 정리되지 않는 경로가 있다. commit 뒤 오류를 일반 실패로 반환하는 경로도 있다. 재시도 가능한 서비스의 전제부터 보강한다.

**변경 대상:** `packages/model/src/transaction.ts`, `packages/datastore/src/data-store.ts`, 해당 transaction·overlay 검사와 공개 결과 타입. 필요 시 기존 호출부의 결과 해석을 조정한다. 새 백엔드나 대규모 operation 재작성은 포함하지 않는다.

**검사 순서:** 첫 연산 성공→두 번째 연산 `ok:false`; schema validation 실패; operation throw; commit 후 hook throw; 각 경우 뒤 동일 manager와 새 DSL manager 재실행. 문서·선택·history·overlay·lock 상태를 비교한다. 외부 이벤트가 실패한 변경을 확정 변경으로 관측하지 않는지도 확인한다.

**완료 증거:** 재현 검사 실패→수정 후 통과, 관련 model/datastore/history 검사, 네 제품의 영향받은 데스크톱 입력·undo 흐름. 실패 종류를 구분하는 결과 계약과 기존 호출부 호환성 기록. 원인 분석만으로 완료 처리하지 않는다.

## 3. 첫 백엔드 WP-05/06의 좁은 범위

첫 구현 예제는 두 회사·두 계정, Note 문서 하나씩으로 한다. 회원가입의 모든 변형, 결제, 고급 관리자 화면을 동시에 만들지 않는다. 내부 설치는 기준 IdP를 포함한 테스트 구성을 사용하고, SaaS도 동일 인증 adapter를 검증한다.

계획 API: session 조회, tenant/workspace 목록, 문서 생성/조회, `expectedRevision`을 받는 문서 변경, 요청 상태 조회. 이후 WP-07에서 asset 업로드 완료, share 생성/회수, publication job을 추가한다. HTTP 명세·runtime schema·오류 계약은 WP-02/05에서 같은 패키지로 관리한다.

브라우저 테스트는 실제 서비스 API를 사용한다. tenant ID를 바꾼 요청, 다른 회사 document/asset ID, worker payload, cache·공유 token 경계를 검사한다. 로그인 버튼이 보인다는 사실만으로 권한 검증 완료를 선언하지 않는다.

## 4. 두 출시 형태의 공통 gate

| 검사 | 클라우드 | 내부 설치 | 실패 시 처리 |
| --- | --- | --- | --- |
| 새 환경 설치·초기 관리자·로그인 | 필수 | 외부 SaaS 계정 없이 필수 | 출시 보류 |
| 네 제품 작성·최종 입력 저장·재열기·공유 | 필수 | 필수 | 출시 보류 |
| 회사·사용자·파일·공유 권한 격리 | 필수 | 단일 tenant 환경에서도 필수 | 출시 보류 |
| 공동 편집 지원 범위와 충돌 복구 | 필수 | 필수 | 미검증 기능 비활성화, 범위 축소는 명시적 결정 |
| PC 꺼짐·개발 Agent 중단 | 서비스 유지 | 서비스 유지 | 출시 보류 |
| DB·파일·설정·키 복원 | 측정 기록 | 설치 도구로 재현 | 목표 미달 원인 해결 |
| 이전 버전→새 버전·migration 실패 | staging 실험 | 이전 설치 이미지에서 실험 | 호환·복구 해결 |
| 외부 인터넷 차단 | 정의한 오류·재시도 | 기본 편집·저장·공유 정상 | 출시 보류 |
| CI 산출물의 digest·버전 확인 | 동일 release | 동일 release | 다시 빌드한 임의 산출물 배포 금지 |

새 제품 서버를 localhost에서 띄운 것, 정적 ZIP 출력, 문서에 적힌 CLI 예시는 출시 증거가 아니다. 실제 운영/내부 설치 환경의 결과를 남긴다. 서비스 공급자·인증·도메인·저장소 계약이 필요한 단계에서는 정확한 외부 의존 조건을 기록한다.

## 5. 자율 실행 활성화 조건

runner를 켜기 전에 대상 저장소·승인한 업무 범위·금액/시간 한도·기본 branch·GitHub App·격리 환경·필수 검사 이름·알림 경로를 설정한다. 이 값이 없으면 설정 오류 상태로 두고 원격 변경을 하지 않는다. 운영 배포 권한은 개발 PR 권한과 별도로 설정한다.

저장소의 현재 `.github/workflows/ci.yml`만으로 네 제품 인수 완료를 판단하지 않는다. non-watch 테스트 실행, 현재 기준 commit의 기존 실패, 영향 패키지와 필수 제품 smoke를 먼저 확인한다. 기존 실패를 제외하는 예외는 근거·책임자·만료가 있는 별도 정책이며 Agent가 스스로 추가하지 못한다.

첫 무인 인수는 사전에 정의한 작은 수정 하나다. 작업 중 요구 변경, 실패한 CI, 재시도, 정상 PR, 정책상 병합을 각각 확인한다. 이 기록이 없으면 “완전 자동 운영” 완료로 표시하지 않는다.

## 6. 상태 기록

현재: 설계 기준 작성, 사용자 요구 R1–R6 연결, 기존 개발 규칙의 무한 작업 생성 조항 정리. 백엔드·runner 구현 및 실행 테스트는 미착수다.

다음: **WP-01 transaction 실패 처리 재현과 보강**. 이후 WP-02로 실행 계약을 좁힌다. UI 공통화의 남은 범위는 [기존 계획](office-editor-ui-consolidation.md)에 유지한다. 이번 설계 전환 때문에 완료 처리하지 않는다.
