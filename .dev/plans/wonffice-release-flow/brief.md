---
work_id: wonffice-release-flow
artifact_type: brief
status: ready_for_build
owner_role: release-manager
source_request: "개발 흐름, 이슈 병렬 처리, CI 실패와 출시·버전 관리 정리"
last_updated: 2026-09-19
---

# 릴리즈 흐름 정리

정책의 단일 기준은 [개발·릴리즈 문서](../../../docs/release-flow.md)다. 이슈 #251을 main 기준 독립 worktree에서 진행한다. #248의 React·Site CI 수정과 파일 소유권을 분리한다.

## 완료 기준

- 이슈→PR→검사→병합과 두 이슈 병렬 실행 규칙을 기록한다.
- CI 실패 처리와 출시 검사의 차이를 기록한다. 필수 검사를 제거하지 않는다.
- 제품·패키지 버전, 단계별 출시 조건, 복구·관측 조건을 기록한다.
- 실제 구현 상태와 후속 자동화 작업을 구분한다. 출시 날짜와 배포 완료를 선언하지 않는다.

## 검증과 제한

문서 내용·링크·Git diff를 확인한다. 실행 코드 변경이 없으므로 새 단위 테스트는 만들지 않는다. 원격 CI는 PR에서 실행하며 기존 main의 실패도 우회하지 않는다. 첫 출시 날짜는 미정이다. 현재 서비스 릴리즈 manifest·두 환경 배포 자동화·전체 출시 검사는 구현 전이다. 문서 준비는 제품 release_ready가 아니다.
