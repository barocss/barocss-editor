# Wonffice 제품 버전과 릴리즈 기록

제품 버전은 `packages/wonffice-release/package.json`에서 읽는다. Changesets가 이 비공개 패키지와 공개 라이브러리를 독립적으로 관리한다. 제품 패키지는 npm에 게시하지 않는다.

현재 `0.0.0`은 개발 기준이다. 다음 명령은 버전을 올리거나 배포하지 않는다.

```sh
pnpm release:manifest create --repo-root . --out /tmp/wonffice-development.json
pnpm release:manifest validate --repo-root . --manifest /tmp/wonffice-development.json --mode development
pnpm test:release
```

manifest에는 제품 버전, Git HEAD, 공개 workspace 소스 패키지 버전이 들어간다. `workspaceSourcePackages`는 현재 소스의 package.json 목록이다. 해당 코드가 npm에 게시됐다는 증거는 아니다. 실제 코드 조합은 Git SHA로 식별한다. 소스를 커밋한 후 manifest를 생성한다. 다른 commit을 검증하려면 그 commit을 별도 작업 공간에 체크아웃한다.

## 제품 변경 기록

제품 동작이 바뀌는 PR에는 제품 changeset을 추가한다. 공개 라이브러리도 바뀌면 해당 패키지도 지정한다. 다음은 설명용 예시다. 실제 변경 범위에 맞게 minor 또는 patch를 선택한다.

```md
---
"@barocss/wonffice-release": minor
"@barocss/office-ui": patch
---

제품의 색상 편집 동작을 개선하고 공통 UI 결함을 수정한다.
```

전체 제품과 공개 라이브러리의 버전 번호가 같을 필요는 없다. 문서·개발 도구만 바뀌면 제품 버전을 올리지 않는다. `pnpm version-packages`는 실제 파일을 바꾸므로 전용 릴리즈 PR에서 실행한다. 첫 alpha의 준비 절차는 [제품 버전 안내](../packages/wonffice-release/README.md)를 따른다.

## 배포 후보의 무결성 검사

```sh
pnpm release:manifest validate --repo-root . --manifest path/to/release.json --mode release
```

개발 manifest를 이 명령에 넣으면 실패한다. JSON 구조는 [schema](../scripts/release/schema.json)를 참조한다. 배포 후보에는 다음 정보가 필요하다.

- 제품 버전과 `wonffice-v<version>` 태그 이름
- 현재 checkout과 일치하는 Git SHA
- 실제 산출물 파일과 SHA-256
- 같은 component에 대해 SaaS와 내부 설치가 사용하는 동일한 OCI manifest digest
- 실제 검사 로그, 실행 명령, 성공 종료 값과 대상 commit
- 문서 schema, DB migration 파일과 해시
- 업데이트 출발 버전 또는 첫 설치만 제공한다는 명시

OCI manifest digest는 OCI manifest JSON 바이트의 해시다. `docker save`로 만든 tar 파일의 해시와 다르다. 현재는 단일 플랫폼의 OCI/Docker image manifest를 검사한다. 여러 플랫폼을 묶는 image index는 아직 지원하지 않는다. 파일·로그·OCI manifest의 상대 경로는 repo-root 안에 있어야 한다. 확인할 산출물은 해당 작업 공간 안에 준비한다. 예시의 가짜 이미지나 로그를 실제 릴리즈 증거로 사용하지 않는다.

검증 실패는 종료 코드 1로 전달한다. CI는 이 값을 무시하지 않는다. 검증 통과는 기록과 파일이 일치한다는 뜻이다. 실제 테스트가 적절한지, 로그가 신뢰되는 CI에서 생성됐는지, 모든 이미지 layer가 존재하는지, 설치와 복원이 되는지는 별도 출시 검사다. 이 도구는 production release_ready, 운영 배포, npm 게시를 승인하지 않는다. 기존 릴리즈의 태그·산출물 불변성은 후속 게시 절차에서 확인해야 한다.

## 자동 검사 범위

`pnpm test:release`는 독립 임시 저장소와 파일을 사용한다. 실제 Changesets로 stable·alpha 버전을 계산하고, 제품 패키지의 changelog 생성 및 공개 패키지 버전 보존을 확인한다. 실제 workspace의 버전·태그나 npm registry를 변경하지 않는다.

manifest 검사는 올바른 개발 기록, 잘못된 버전·코드·해시·경로·검사 증거, 두 배포 방식의 불일치와 CLI 실패 종료를 확인한다. 예시는 테스트 안에서 생성하므로 저장소에 출시된 것처럼 보이는 가짜 이미지 digest를 넣지 않는다.
