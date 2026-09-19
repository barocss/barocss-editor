---
work_id: wonffice-release-foundation
artifact_type: brief
status: qa_ready
owner_role: executor
source_request: "제품과 npm 패키지 버전을 Changesets로 관리하는 흐름을 계속 구현"
last_updated: 2026-09-19
---

# 제품 버전과 릴리즈 기록 — #252

## 범위

제품 전체의 버전을 private workspace 패키지로 관리한다. Changesets는 제품과 공개 라이브러리를 독립적으로 version한다. 개발 manifest 생성과 배포 후보의 무결성 검증을 제공한다. npm 게시, 운영 배포, 실제 제품 tag 생성은 수행하지 않는다.

## 완료 기준

- 제품 버전은 packages/wonffice-release/package.json 하나에서 읽는다.
- 실제 Changesets CLI를 임시 fixture에 실행해 제품 버전·changelog 변경과 공개 패키지 버전 보존을 검증한다.
- 개발 manifest는 개발 검사만 통과한다. 배포 후보에는 코드·실파일·검사 증거가 필요하다.
- 잘못된 버전·태그·digest·경로·검사 결과는 실패한다. CLI 종료 값으로 실패를 CI에 전달한다.
- 실제 서비스의 품질 검증이나 출시 승인이 완료되었다고 주장하지 않는다.

## 선행 작업

#248 기준점 필수 CI 확인 중에는 임시 공간에서 초안을 준비했다. 의존성 재검토 결과 편집기 코드와 독립적이므로 코드 PR은 현재 최신 main에서 별도로 만든다. 기준점 병합 후 새 main을 반영하고 전체 필수 검사를 다시 확인한다. #251 정책은 사용자가 확인한 Changesets 제품 버전 합의를 따른다. 이 작업은 #249 model/datastore 파일을 변경하지 않는다.

## 구현과 검증

- `@barocss/wonffice-release` 비공개 제품 패키지와 Changesets private version 설정을 추가했다.
- 실제 JSON Schema를 AJV로 검사하고, Git SHA·파일 해시·OCI manifest·두 배포 환경·검사 증거·문서/DB 계약을 검증한다.
- 개발 manifest 생성과 validate CLI를 제공한다. 공개 workspace 버전 목록은 npm 게시 증거가 아님을 명시한다.
- CI의 필수 검사 job에 `pnpm test:release`를 연결했다.
- Node 22.22.0에서 릴리즈 검사 30개 통과. 실제 Changesets stable/alpha 버전 계산과 공개 패키지 버전 보존을 포함한다.
- Node 20.18.0에서도 같은 30개 검사를 통과했다. 현재 main CI는 기준점 병합 전 Node 20이므로 과도기 호환성을 확인한다.
- 배포 후보 검사 통과는 무결성 확인이다. 신뢰된 CI 증명, 이미지 layer 존재, 설치·복구·QA, 태그 불변성은 실제 출시 절차에서 추가 확인해야 한다.

운영 배포, npm 게시, 실제 제품 tag 생성은 실행하지 않았다. 첫 제품 버전은 0.0.0 개발 기준으로 시작하며 정식 출시를 선언하지 않는다.
