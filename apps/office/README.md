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

개발 서버는 같은 origin의 `/api/me`를 API의 `/v1/me`로, `/api/tenants/.../access`를 `/v1/tenants/.../access`로 전달한다. 서비스 배포 시에도 **같은 경로 매핑**을 신뢰한 reverse proxy에 구성해야 한다. Vite 개발 proxy는 배포용 설정이 아니다. `/api/me`에 토큰 없이 요청하면 `401` JSON이 와야 한다. `200` HTML이면 proxy가 적용되지 않은 미리보기다.

인증 모드의 홈은 OIDC auth-code/PKCE를 통해 로그인하고 API가 반환한 활성 회사·역할을 표시한다. 사용자/관리자 선택은 목적지 의도다. 관리 업무 화면과 서버 문서 자료함은 아직 없다. 네 제품의 직접 문서 URL은 #367 문서별 접근 확인 API가 연결되기 전까지 본문을 열지 않는다. 이 모드는 제품 저장·Yorkie·외부 alpha의 완료 근거가 아니다.

브라우저 회귀 검사는 다음 명령으로 실행한다. 이 검사는 IdP와 API 응답을 모의한다. 실제 두 계정·권한 회수 검증은 별도로 필요하다.

```sh
pnpm --filter @barocss/office-app exec playwright test -c playwright.auth.config.ts
```

로컬 Keycloak과 PostgreSQL-backed API가 준비된 뒤에는 보호된 합성 계정 파일을 환경 변수로 지정해 독립 브라우저 두 개의 실제 로그인을 검사한다. 이 파일은 저장소 밖에 두고 권한을 `0600`으로 제한한다. 5191 callback, web origin, 로그아웃 반환 주소를 Keycloak client에 정확히 임시 등록한다. 이는 5186 최종 인수를 대신하지 않는다.

```sh
OFFICE_AUTH_REAL_FILE=/private/tmp/your-protected-synthetic-accounts.json \
pnpm --filter @barocss/office-app exec playwright test -c playwright.auth.real.config.ts
```
