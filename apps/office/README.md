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


### Mixed Note catalog metadata (#495/#497)

Authorized metadata discovery retains native2 Note originals with exact IDs, format/version, page ID, mode, revision and snapshot hash. The catalog decoder uses the existing native page-ID guard for file version 2 and keeps the version-1 UUID requirement. No raw snapshot or caller writable/capability flag is accepted in a catalog head.

Project, Sources and My keep these rows visible with `nativeOpenSupported: false` and ordinary navigation disabled. Snapshot mode alone does not authorize a native2 renderer or writer. Metadata does not enable ordinary open/edit/save, or replace the explicit experimental readonly stage with its current private reader, registered bundle admission and retirement checks. Current denied/replaced/expired session handling and bounded paging remain in force. Controlled catalog tests are separate from genuine API/privatePG/native DOM/history/focus checks.


The ordinary `openVerifiedSnapshot` verifier accepts Note format `barocss-note` at file version 1 only. Catalog metadata version 2 never becomes an ordinary verified Note context. History traversal uses file format/version from the actual freshly verified ordinary context; it does not infer either field from a route or a placeholder catalog row.


### Private native2 validation, update and receipt transport (#503)

`src/native2-authenticated-mutation.ts` is a private transport. It does not mount,
edit, apply or save a native model. The server is the current authority for every
operation. A local read lifetime is not a writer grant or evidence of unseen
membership ABA. Validation returns `structurally_valid`, never a saved result.

- Create `createAuthenticatedNative2Mutation()` in the current Office login. No
  caller token, fetcher, origin, role, actor or approval grant is accepted.
- `open({tenantId, workspaceId, documentId})` reads and verifies the exact native2
  head, raw file and registered bundle through the existing authenticated reader.
  It returns `source`, `prepare`, `validateSource`, `validate`, `update`, `recover`,
  `isCurrent`, `retire` and terminal `subscribeRetirement`. A new open retires the
  old context. Host/source retirement must call `retire`; private logout, login
  replacement and token deadline retire without a render or polling.
- `prepare({snapshotText, schemaAction: 'preserve' | 'adopt', idempotencyKey})`
  copies exact raw bytes before hashing. It freezes source revision/hash/prior-pin
  digest, candidate hash, key/action and service request hash. Inputs are bounded
  to 512 KiB of valid UTF-8 native2 JSON for the same page and definition scope.
  JSON request and streamed response limits are 1 MiB; transport lifetime is 10
  seconds. An oversized escaped JSON body is refused even if raw input fits.
- `validateSource()` and `validate(attempt)` POST to the existing validation route.
  `update(attempt)` PUTs the fixed snapshot body. The existing service performs
  current actor checks, registered-policy admission, CAS and durable receipts.
  Same-key changed bytes refuse locally. Attempts copied through JSON or from a
  different private context cannot authorize these methods.
- `recover(attempt)` GETs only `/receipts/update/:key`. Recovery checks the original
  operation/key/request hash, exact scope, next revision, raw hash/text and native2
  page/head. It does not read a latest head, replace the attempt with a later draft
  or retry a write. An explicit `update(attempt)` retry keeps identical bytes.
  Retain the original private context/attempt for this response-loss recovery;
  browser-restart persistence and reacquiring a retired attempt are not provided.
- `selectedPinsChanged` reports a checked selected-reference delta. A noop
  `schemaAction: 'adopt'` result has `selectedPinsChanged: false`. Neither value
  proves model adoption, business correctness or whole #495 completion. Editor
  must independently recheck current host/source/input/history before any native
  effect. This transport performs no such effect.

Integration owns the explicit Vite opt-in and shared runtime. The explicit
`VITE_OFFICE_NATIVE2_MUTATION_BRIDGE=enabled` switch selects
`createNative2MutationProxyPolicy` in OIDC mode with the same validated root-only
loopback `SCHEMA_SERVER_PROXY_TARGET`. Use its single native2 prefix entry before
ordinary `/api`; do not stack competing read and mutation entries. Without this
explicit opt-in, the existing default/read bridge stays GET-only.
The enabled policy permits only existing document/bundle GET, validation POST,
snapshot PUT and update receipt GET. POST/PUT require a positive canonical
Content-Length at most 1 MiB and JSON Content-Type. Chunked bodies, upgrades,
method overrides, cookies, forwarded hosts, query/encoded/foreign paths, create
and registry writes refuse. It is routing, not an authority grant; the existing
service still validates body shape, content, current identity and permissions.

Author tests use controlled network replies with the real Office memory-session
code. Integration must separately bind exact source/compiled bytes and run the
same HTTP/current signed-JWT/private PostgreSQL A/B, CAS, denial, committed-ACK
loss and recovery checks before #503 closure. Genuine provider/product UI and all
original parent criteria remain separate. Product code is local; this section
is not a deployment or release instruction.


### Historical receipt after a fresh login (#506)

`createAuthenticatedNative2ReceiptRecovery()` in
`src/native2-authenticated-receipt-recovery.ts` captures the current private Office
login. Its only service operation is GET of the original update receipt. It does
not restore a persisted writer attempt. Current service identity, membership and
document policy still decide whether the receipt can be read.

Retain these nine original operation fields separately from a later draft:
`tenantId`, `workspaceId`, `documentId`, `expectedRevision`,
`expectedSnapshotHash`, `expectedPriorPinDigest`, `snapshotText`, `schemaAction`
and `idempotencyKey`. `recover(record)` treats restored data as untrusted. It
rejects extra fields, malformed keys, invalid UTF-8, foreign bundle scope and
unsupported native files. It copies the record before any await and recomputes
the candidate hash and service request hash. Caller hashes, tokens, fetchers,
origins, roles and approvals are not inputs. Raw input is limited to 512 KiB;
the strict streamed JSON response is limited to 1 MiB and the lookup to 10 seconds.

The shared pure `verifyNative2UpdateReceipt` checks operation, original key and
request hash, complete scope, next revision, raw text/hash and native2 page/head.
It returns data only. Existing #503 mutation methods still require their private
live attempt brand. `recover` returns `kind: 'historical_acknowledgment'`, the
fixed original record, the checked receipt and terminal lifetime methods. It
does not return a write method, approval, model-adoption proof or selected-pin
change claim. No latest-head read, validation POST, PUT, native effect, automatic
retry or draft replacement occurs. A missing receipt returns `not_found` and
leaves the outcome unresolved. Denial and service failure do not start a write.

Logout, login replacement, token deadline, host retirement and a newer lookup
retire pending or returned results. Held headers/body and late replies refuse;
late bodies are cancelled. Retirement callbacks are terminal and synchronous.
Retiring a result leaves the factory available for a new lookup while its login
is current. A historical acknowledgment is not a new writer or native grant.
Editor #504 owns persistence, host/source/history checks and user feedback. A
later explicit write retry requires fresh #503 qualification and exact equality
of every original field; a newer head must not replace the original operation.

The author tests reload modules and obtain a fresh controlled login. They are
source evidence. Integration separately owns compiled/current signed-JWT/private
PostgreSQL/browser reload checks after committed reply loss, current identity and
revocation denials, one durable effect and unchanged later drafts. Those original
#506 criteria must pass before whole-Issue closure.


### Current Note host factories (#507)

The OIDC Note host supplies optional async zero-argument callbacks
`createNative2MutationLease` and `createNative2ReceiptRecoveryLease`. Other
products and local entries do not receive these callbacks. Their types are the
actual private #503 and #506 factory return types; the existing read callback is
preserved. Callback availability is not current writer permission or user
confirmation. Creation sends no service operation. Editor #504 owns the native
preview, explicit confirmation, persistence, input/source/history and late-draft
checks before and after a deliberate operation.

`src/native2-authenticated-host.ts` binds each factory to the captured Office
tenant/workspace and trusted `NativeEntryBinding` authority subscription. It
checks the host before and after producer loading and every asynchronous
operation. Foreign mutation scope or restored receipt scope refuses before a
service call. Restored original data is copied once before scope admission; the
producer still rejects extra fields and recomputes its exact hashes. Caller
tokens, roles, approvals, fetchers or native grants are not accepted.

Host retirement and private producer retirement are terminal. Factories,
contexts and historical results forward synchronous retirement subscriptions;
old values cannot revive when a role label returns. Result-only retirement keeps
its valid factory usable, while a new producer read/lookup retires its predecessor.
Subscriptions detach on retirement. Held imports and responses cannot deliver a
current value. The existing mutation request now cancels an ignored-abort late
response body before it can escape the request abort race. A request already
entered at the service can have committed; local retirement does not roll it back.
Recovery still uses the original fixed request and never a later draft.

Source tests use actual Office private producers with controlled HTTP replies and
a controlled trusted host subscription. Static main assembly is labelled static.
Integration must separately join the exact Editor consumer, build the graph and
run the actual browser/current signed-JWT/private PostgreSQL flow and original
#507 acceptance checks. This source connection does not claim actual UI adoption,
whole #504/#495 completion or release.

### Integration configuration checkpoint (#503)

The actual Office Vite configuration chooses exactly one native2 prefix policy.
Explicit mutation mode retains the existing early HTTP rejection and upgrade
refusal before ordinary API fallback. It does not enable registry or create
writes. Invalid mutation settings refuse during configuration loading.
`node --test apps/office/tests/native2-proxy-config.test.mjs` exercises the actual
Vite loader and route decisions without opening a listener. This configuration
checkpoint and imported author tests are source evidence; current OIDC, separate
SchemaServer/private PostgreSQL and full product browser acceptance are pending.
