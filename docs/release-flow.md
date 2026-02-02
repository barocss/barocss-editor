# Release Flow (Changesets)

릴리즈는 [Changesets](https://github.com/changesets/changesets)로 버전·CHANGELOG·npm 배포를 관리한다.

## 요약

1. **변경 시**: PR에 changeset 추가 (`pnpm changeset`)
2. **main 머지 후**: "Version Packages" PR이 자동 생성/갱신
3. **배포 시**: "Version Packages" PR 머지 → CI가 빌드 후 `changeset publish`로 npm 배포

## 1. Changeset 추가 (개발 시)

기능/버그 수정 PR에서 **버전에 반영할 변경**이 있으면 changeset을 추가한다.

```bash
pnpm changeset
```

- 변경 범위: `patch` / `minor` / `major` 선택
- 영향 패키지: 스페이스로 여러 개 선택 (해당 없으면 스킵)
- 요약: 한 줄 설명 입력 (CHANGELOG에 들어감)

생성된 `.changeset/*.md` 파일을 PR에 포함해 머지한다.  
문서만 바뀌었거나 테스트만 추가된 경우 changeset을 넣지 않아도 된다.

## 2. Version Packages PR (자동)

- **트리거**: `main`에 push (changeset 파일이 있으면)
- **동작**: [changesets/action](https://github.com/changesets/action)이 다음을 수행한다.
  - `pnpm changeset version` 실행
  - `package.json` 버전 bump, `CHANGELOG.md` 갱신, changeset 파일 삭제
  - "Version Packages" PR 생성 또는 기존 PR 업데이트
- **역할**: 릴리즈할 버전을 한 PR에 모아서 리뷰·머지할 수 있게 함

## 3. 배포 (Version Packages PR 머지 후)

- **트리거**: "Version Packages" PR이 `main`에 머지된 push
- **동작**:
  1. `pnpm install`
  2. `pnpm release` → `pnpm build` 후 `changeset publish`
  3. npm에 배포 (배포 가능한 패키지만 퍼블리시)
- **필수**: Repository Secret `NPM_TOKEN` (npm 배포 권한, 2FA publish 비활성화된 토큰)

## 로컬에서만 버전/배포하고 싶을 때

- **버전만 적용 (PR/CI 없이)**  
  `pnpm version-packages` → 변경사항 커밋 후 push
- **배포까지 (npm 퍼블리시)**  
  `pnpm release` (이미 빌드된 상태에서만 하려면 `pnpm changeset publish`만 실행)

## 패키지 버전 전략

Changesets는 세 가지 방식 중 하나로 버전을 맞출 수 있다.

| 방식 | 설정 | 동작 | 적합한 경우 |
|------|------|------|-------------|
| **Independent (변경된 것만)** | `fixed: []`, `linked: []` (현재) | changeset에 포함된 패키지만 버전 bump. 예: @barocss/model만 수정하면 model만 1.0.0 → 1.0.1 | 패키지를 따로 쓰는 사용자가 많을 때, 변경이 적은 패키지는 버전을 안 올리고 싶을 때 |
| **Fixed (전부 같은 버전)** | `fixed: [["@barocss/datastore", "@barocss/model", ...]]` (한 그룹에 전부) | 그룹 안 패키지 중 하나라도 changeset에 있으면 **그룹 전체**가 같은 버전으로 올라감 | “Barocss Editor 1.2.0”처럼 **한 제품**으로만 쓰고, 항상 같은 버전 조합을 쓰고 싶을 때 |
| **Linked (그룹별)** | `linked: [["@barocss/datastore", "@barocss/model", "@barocss/schema"], ["@barocss/editor-core", "..."]]` | 그룹 단위로 같은 버전. 그룹 A만 변경되면 A만 올라감 | “코어 그룹”과 “에디터 그룹”처럼 **몇 개 그룹**만 같이 올리고 싶을 때 |

### 추천 (Barocss Editor 기준)

- **지금처럼 Independent**  
  패키지가 많고(18개 이상), 변경이 자주 있는 패키지와 거의 안 바뀌는 패키지가 섞여 있으면 “변경된 것만 올리기”가 유리하다. 사용하는 쪽은 `@barocss/model`만 쓰면 model만 올리면 된다.
- **Fixed로 바꾸고 싶다면**  
  “우리는 항상 같은 버전 번호로만 쓴다”는 정책이면 `.changeset/config.json`에 `fixed`로 **배포하는 패키지 전부**를 한 배열에 넣으면 된다. (ignore된 앱은 제외)

설정은 `.changeset/config.json`의 `fixed` / `linked`만 바꾸면 되고, 이미 쌓인 changeset이 있으면 다음 `changeset version`부터 적용된다.

## 설정 요약

| 항목 | 위치 | 설명 |
|------|------|------|
| baseBranch | `.changeset/config.json` | `main` |
| commit | `.changeset/config.json` | `false` (action이 커밋) |
| access | `.changeset/config.json` | `public` |
| ignore | `.changeset/config.json` | 테스트 앱 등 배포 제외 패키지 |
| release 스크립트 | 루트 `package.json` | `pnpm build && changeset publish` |
| 워크플로 | `.github/workflows/release.yml` | Version Packages PR + publish |

## NPM_TOKEN 설정

1. [npm Access Tokens](https://www.npmjs.com/settings/~/tokens)에서 "Automation" 또는 "Publish" 토큰 생성
2. 2FA가 켜져 있으면 **publish 시 2FA 비활성**이어야 함 (npm 설정에서 조정)
3. GitHub Repo → Settings → Secrets and variables → Actions → `NPM_TOKEN` 추가

## 문제 해결

- **Version Packages PR이 안 생김**  
  `main`에 `.changeset/*.md`가 있고, release 워크플로가 해당 push에서 실행됐는지 확인. Actions 탭에서 "Release" 워크플로 로그 확인.
- **Publish 실패 (401/403)**  
  `NPM_TOKEN` 권한·만료·2FA 설정 확인. 로컬에서 `npm whoami` 후 해당 계정으로 `pnpm changeset publish` 한 번 실행해 보기.
- **특정 패키지만 배포 제외**  
  `.changeset/config.json`의 `ignore`에 패키지명 추가 (예: `@barocss/editor-test`).
