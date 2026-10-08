# Office 로컬 진입 모드

기본 `pnpm dev:office`는 기존 5186 로컬 미리보기다. 문서는 브라우저의 IndexedDB에 저장된다. 이 모드에는 Wonffice 서비스 로그인이나 서버 문서 저장이 없다.

내부 합성 인증 후보는 같은 5186 포트를 별도 실행 모드로 사용한다. 먼저 기존 미리보기 서버를 정상 종료한다. 로컬 Keycloak의 public client에는 정확한 callback `http://127.0.0.1:5186/auth/callback`, web origin `http://127.0.0.1:5186`, 로그아웃 후 주소 `http://127.0.0.1:5186/`를 등록한다. 기존 18200 QA callback은 보존한다. 실제 API는 PostgreSQL app-role 설정과 OIDC issuer/JWKS/audience 설정으로 시작해야 한다. 값과 계정 암호는 저장소에 넣지 않는다.

```sh
VITE_OFFICE_AUTH_MODE=oidc \
VITE_OFFICE_OIDC_ISSUER=http://127.0.0.1:18180/realms/wonffice-local \
VITE_OFFICE_OIDC_CLIENT_ID=wonffice-browser \
OFFICE_API_PROXY_TARGET=http://127.0.0.1:14100 \
pnpm --filter @barocss/office-app exec vite --host 127.0.0.1 --port 5186 --strictPort
```

개발 서버는 같은 origin의 `/api/v1/me`를 API의 `/v1/me`로, `/api/v1/tenants/.../access`를 `/v1/tenants/.../access`로 전달한다. `/api`만 한 번 제거한다. 서비스 배포 시에도 **같은 경로 매핑**을 신뢰한 reverse proxy에 구성해야 한다. Vite 개발 proxy는 배포용 설정이 아니다. `/api/v1/me`에 토큰 없이 요청하면 `401` JSON이 와야 한다. `200` HTML이면 proxy가 적용되지 않은 미리보기다.

인증 모드의 홈은 OIDC auth-code/PKCE를 통해 로그인하고 API가 반환한 활성 회사·역할을 표시한다. 사용자/관리자 선택은 목적지 의도다. 선택한 회사의 현재 접근을 확인한 뒤, 사용자 화면에서 서버 문서 목록의 유무를 구분한다. 관리 업무 화면과 서버 문서 자료함은 아직 없다. 네 제품의 직접 문서 URL은 #367 문서별 접근 확인 API가 연결되기 전까지 본문을 열지 않는다. 이 모드는 제품 저장·Yorkie·외부 alpha의 완료 근거가 아니다.

브라우저 회귀 검사는 다음 명령으로 실행한다. 이 검사는 IdP와 API 응답을 모의한다. 실제 두 계정·권한 회수 검증은 별도로 필요하다.

```sh
pnpm --filter @barocss/office-app exec playwright test -c playwright.auth.config.ts
```

로컬 Keycloak이 준비되면 보호된 합성 계정 파일로 실제 로그인을 검사한다. 이 파일은 저장소 밖에 두고 권한을 `0600`으로 제한한다. 검사 실행기는 임시 PostgreSQL과 API를 별도로 시작하고 종료한다. 기존 합성 Keycloak 계정은 읽기만 한다. 회사 membership과 합성 운영 grant는 임시 데이터베이스에만 만든다. 기본 검사는 5191을 쓴다. 5191 callback, web origin, 로그아웃 반환 주소를 Keycloak client에 정확히 등록해야 한다. 5191 결과는 5186 후보 인수를 대신하지 않는다.

```sh
OFFICE_AUTH_REAL_FILE=/private/tmp/your-protected-synthetic-accounts.json \
pnpm --filter @barocss/office-app exec playwright test -c playwright.auth.real.config.ts
```

5186이 비어 있고 같은 Keycloak client에 5186 callback이 등록되어 있으면 정확한 포트에서 다시 실행한다.

```sh
OFFICE_AUTH_ORIGIN=http://127.0.0.1:5186 \
OFFICE_AUTH_REAL_FILE=/private/tmp/your-protected-synthetic-accounts.json \
pnpm --filter @barocss/office-app exec playwright test -c playwright.auth.real.config.ts
```

## Note native2 읽기 실험

이 실험은 OIDC Office 화면의 현재 메모리 로그인으로 Note native2 문서와 완전한 schema bundle을 읽는다. 일반 문서 열기, 편집, 저장, schema 등록·채택, MCP를 켜지 않는다. 기본값은 꺼짐이다. 로컬 개발 proxy를 켜려면 위 OIDC 명령에 다음 환경 변수를 추가한다.

```sh
VITE_OFFICE_NATIVE2_READ_BRIDGE=enabled \
SCHEMA_SERVER_PROXY_TARGET=http://127.0.0.1:14102
```

`SCHEMA_SERVER_PROXY_TARGET`은 별도로 시작한 schema server의 loopback HTTP origin이다. 해당 서버의 실행·인증·데이터베이스 설정은 서버 문서를 따른다. proxy는 정확한 `/api/v1/tenants/{tenantId}/note-native2/documents/{documentId}`와 `/schema-bundle`의 본문 없는 GET만 서버의 `/v1/...`로 전달한다. 다른 native2 경로·메서드·쿼리는 거부한다. 배포 reverse proxy에도 같은 거부 규칙이 필요하다. Vite 규칙만으로 배포 접근을 보호하지 않는다.

`createAuthenticatedNative2Reader()`는 Office 내부의 명시적 읽기 진입점이다. 활성 로그인과 현재 회사·작업 공간을 확인하고, 원본 전체와 고정된 bundle을 검증한 뒤 읽기 전용 provenance를 준다. 계정 전환, 만료, 새 읽기 요청 또는 `retire()` 뒤에는 기존 결과를 사용하지 않는다. 서버에서 관찰하지 못한 권한 회수와 권한 ABA는 이 로컬 lease만으로 증명할 수 없다. 실제 OIDC 두 계정, 현재 권한 회수, PostgreSQL 원본과 5186 callback 검사는 별도 운영 준비가 필요하다.

`apps/office/src/native2-authenticated-reader.test.ts`는 모의 응답을 쓴 단위 검사다. `apps/office/tests/native2-authenticated-read.spec.ts`는 브라우저의 실제 Office 모듈을 쓰지만 OIDC/API 응답을 모의한다. 이 검사는 실제 provider나 PostgreSQL 인수 근거가 아니다.
