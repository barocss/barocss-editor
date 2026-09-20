# Wonffice 백엔드 구축 기준

2026-09-20 사용자 요청을 구체화한다. 클라우드·온프레미스, 외부 서비스 연동·자체 서빙, 고객 도메인, 데이터 보관과 동시 편집을 다룬다. 기존 [플랫폼 설계](wonffice-platform.md)와 [구현 순서](wonffice-platform-delivery.md)를 따른다. 이 문서의 표는 후속 구현 계약이며 데이터베이스 구현 완료를 뜻하지 않는다.

기준 소스: main `9111de74730f0ec3dc240dd807d81eda40ea55d0`. 기존 `office-workspace`는 브라우저 자료함이고 `collaboration-yjs`는 클라이언트 adapter다. 계정·tenant를 검사하고 변경을 영속 저장하는 서비스는 없었다. 첫 변경 [#330](https://github.com/barocss/barocss-editor/issues/330)은 `office-api` 실행 기반만 추가한다. 실제 저장·로그인·협업은 아직 미구현이다.

## 실행과 연결

TypeScript 모듈형 단일 API로 시작한다. 출력·게시·파일 정리는 별도 worker에서 수행하고 같은 도메인·권한 계약을 쓴다. PostgreSQL과 S3 호환 객체 저장소를 사용한다. 공급자 SDK는 adapter 내부에 둔다. 클라우드와 내부 설치는 같은 이미지와 migration을 쓰고 주소·인증·저장소 설정만 바꾼다. Redis나 다수의 마이크로서비스는 첫 설치의 필수 조건으로 두지 않는다.

| 도입 형태 | 인증과 데이터 소유 | 제공할 연결 |
| --- | --- | --- |
| Wonffice 자체 서비스 | 해당 배포의 OIDC와 tenant 권한이 기준이다. | 웹 앱 → 서비스 API → DB·객체 저장소 |
| 외부 콘텐츠 서비스에 내장 | 호스트 사용자는 검증된 issuer·subject와 명시한 membership으로 연결한다. 브라우저가 보낸 사용자·tenant ID를 인증으로 쓰지 않는다. | 공개 DTO·문서 API·짧은 수명의 범위 제한 세션. iframe origin 및 CORS는 명시한 허용 목록으로 제한한다. |
| 외부 서비스가 콘텐츠 원본 소유 | 연결별 원본 소유자를 하나 정한다. 외부 원본 ID와 버전을 보관한다. | 가져오기·명시적 내보내기부터 시작한다. 자동 양방향 동기화는 별도 충돌·재시도·회수 계약 뒤 추가한다. |
| 고객 자체 도메인 | 등록·소유 확인된 hostname을 publication 또는 설치 endpoint에 연결한다. 도메인은 로그인 권한을 부여하지 않는다. | DNS 확인·TLS 발급·활성화·갱신·삭제 상태를 관리한다. |

서비스 간 호출은 별도 service identity와 최소 권한을 사용한다. OIDC, API token, webhook 서명을 같은 것으로 취급하지 않는다. webhook은 서명·시각·중복 검사를 거치고, 외부 발송은 outbox에서 재시도한다. 외부 URL을 가져오는 worker에는 목적지 제한과 내부 주소 차단을 적용한다. 이 연결들은 첫 health API에는 없다.

인증 앱 origin과 사용자 게시물 origin을 분리한다. 고객이 작성한 HTML에 인증 쿠키를 보내지 않는다. 등록되지 않은 Host와 전달 헤더로 tenant를 선택하지 않는다. 공개 문서는 고정 revision의 게시 사본이며 초안을 직접 서빙하지 않는다. 업로드·접속 검사 후 새 publication을 활성화한다. 실패하면 이전 게시를 유지한다. 도메인을 제거하면 라우팅·인증서·검증 기록의 소유 관계를 정리하여 다른 tenant가 이전 게시물을 이어받지 못하게 한다.

## 저장할 데이터와 소유 관계

| 데이터 묶음 | 주요 키·내용 | 저장 및 보존 원칙 |
| --- | --- | --- |
| tenant·identity·membership | identity의 `(issuer, subject)`, `(tenant_id, identity_id)`, 역할·정지 상태 | PostgreSQL. 인증 뒤 현재 membership을 확인한다. |
| workspace·document | `(tenant_id, id)`, 제품 종류, schema version, 현재 revision, 삭제 시각, 저장 모드 | tenant를 포함한 외래 키. 제품 본문과 자료함 메타데이터 변경을 구분한다. |
| document_revision | `(tenant_id, document_id, revision)`, 제품 codec snapshot, actor, 생성 시각, hash | 초기에는 제한된 크기의 JSONB 본문. 유효 schema와 크기 검사 후 불변 버전으로 저장한다. 대용량 외부화는 측정 뒤 정한다. |
| mutation_request | tenant·actor·action·idempotency key, 요청 hash, 결과·만료 | 문서 revision·outbox와 같은 DB transaction. 다른 내용으로 같은 key 재사용은 거부한다. |
| asset·document_asset | tenant, 임의 storage key, 크기·MIME·hash·상태, 문서/게시 참조 | 파일 본체는 S3 호환 저장소. 사용자 경로를 key로 직접 쓰지 않는다. 유예·참조 검사를 통과한 것만 정리한다. |
| collab_session·collab_update·checkpoint | tenant·문서·epoch, 업데이트 ID·순서·bytes, checkpoint 경계 | 내구성 있는 DB 기록 뒤 확인 응답. 압축·정리 전에 해당 지점의 재생·복원을 검사한다. |
| share·publication·domain | token hash·만료·회수, 고정 revision, 검증 hostname·TLS 상태 | 공개 사본과 비공개 원본을 구분한다. 회수는 파일 접근에도 적용한다. |
| integration·external_reference | tenant·연결·외부 ID·원본 버전·동기화 정책 | credential은 별도 비밀 저장소 참조로 관리한다. 충돌 시 원본과 대기 변경을 보존한다. |
| job·outbox·audit_event | tenant·actor·request, 상태·재시도·다음 실행 시각 | worker가 tenant와 현재 권한을 다시 검사한다. 본문·token은 기본 로그에 넣지 않는다. |

본문을 모든 제품에 맞춘 하나의 관계형 테이블로 분해하지 않는다. 기존 제품 codec과 schema version을 보존한다. 검색용 텍스트·썸네일·내보내기는 재생성 가능한 파생 데이터다. 로컬 IndexedDB는 초안·캐시·이전 원본으로 유지한다. 서버 이전은 원본 hash와 서버 결과를 확인한 뒤 완료로 기록하며 로컬 원본을 자동 삭제하지 않는다.

tenant 격리는 API 검사, 복합 외래 키, 저장소·캐시·worker 경계에서 함께 적용한다. PostgreSQL RLS를 추가 방어로 사용한다. 앱 역할은 소유자나 BYPASSRLS가 아니어야 한다. 풀의 tenant context는 transaction 범위로 제한하고 실제 역할로 교차 tenant 접근을 검사한다. [PostgreSQL 공식 RLS 문서](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

백업은 DB뿐 아니라 객체 버전·설정·필요한 키를 같은 복원 지점에 연결한다. 백업 성공 로그만으로 완료 처리하지 않는다. 새 환경에서 문서와 파일 hash를 복원·대조한다. 보존 기간·삭제 유예·quota는 배포 정책으로 명시하고 tenant마다 무제한 버전을 쌓지 않는다. DB migration은 추가 변경부터 적용하며 이미지 rollback으로 파괴적 migration을 되돌리지 않는다.

## 동시 편집의 구현 기준

1. 먼저 snapshot 저장의 `expectedRevision` 비교와 중복 요청 처리를 완성한다. 충돌은 409로 반환하고 클라이언트 초안을 유지한다. 두 사람이 저장할 수 있다는 사실은 공동 편집 완료가 아니다.
2. 기존 Yjs adapter의 본문·노드 순서·삭제·이동 매핑을 실제 동시 입력으로 검증한다. 코드에는 개별 atomic operation마다 `ydoc.transact`하는 경로가 있다. 논리 편집 전체의 원자성과 텍스트 병합을 이미 보장한다고 가정하지 않는다.
3. 한 문서의 확정 저장자는 snapshot 경로 또는 공동 세션 중 하나다. 모드 전환은 마지막 revision을 잠그고 checkpoint와 epoch를 확정한다. 활성 세션에 독립 snapshot 덮어쓰기를 허용하지 않는다.
4. 채널 접속과 매 변경에서 tenant·문서 권한을 검사한다. 오래된 epoch와 회수된 세션은 거부한다. 하나의 문서 세션을 여러 서버가 동시에 소유하지 않도록 DB lease와 fencing을 검증한다.
5. 업데이트를 내구성 있게 저장한 뒤 확인 응답과 전파를 한다. 재전송 ID를 중복 제거한다. cursor/presence는 임시 상태이며 문서 버전이나 감사 본문으로 저장하지 않는다.
6. 재접속은 checkpoint와 남은 변경으로 복원한다. 오프라인 초안은 서버 확인 전 보존한다. 권한이 회수되면 전송과 구독을 중단한다. 사용자별 undo가 다른 사용자의 변경을 되돌리지 않는지 확인한다.
7. Note 두 브라우저에서 동시 입력·같은 문자 범위 변경·노드 삭제와 이동 충돌·응답 전후 서버 종료·중복/순서 변경·오프라인 복귀·권한 회수·undo를 검사한다. 이후 Word·Slides·Site로 확대한다.

Yjs provider는 연결과 동기화 수단이다. 서버 권한·내구 저장·문서 모델의 의미 보존을 대신하지 않는다. 참고: [Yjs WebSocket provider 공식 문서](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket).

## 작은 PR의 순서와 완료 기준

| 순서 | 작업 | 완료를 판단할 실제 증거 |
| --- | --- | --- |
| 1 — #330 / WP-05a | API 프로세스·설정·상태·종료·컨테이너 경로 | HTTP·빌드 산출물·종료 검사. 컨테이너 미검증이면 draft 유지 |
| 2 — WP-05b | PostgreSQL migration과 tenant 저장소 | 실제 DB에서 두 tenant 격리, 앱 역할 RLS, migration 재실행·실패 복구, 백업 복원 |
| 3 — WP-05c | OIDC·membership·S3·로컬 설치 묶음 | 실제 IdP 로그인, token 거부, 두 계정 격리, 파일 접근, 같은 이미지의 두 배포 설정 |
| 4 — WP-02/06 | 직렬화 계약·서버 revision·Note 저장 | 두 계정 저장·재열기, 409 초안 보존, 중복 저장·flush, 원본을 보존한 로컬 이전 |
| 5 — WP-09 | 공동 세션 저장·재접속 | 위의 장애·동시 수정·권한 회수·사용자별 undo 검사 |
| 6 — WP-07 | 나머지 제품·파일·공유·게시·도메인·외부 연결 | 고정 게시 revision, 회수된 파일 접근 차단, DNS 소유 검증, 실패 게시 복구, 중복 webhook·동기화 충돌 |
| 7 — WP-11 | 두 설치의 출시 인수 | 동일 digest, 업데이트·복원, 외부 인터넷 없는 내부 기본 사용, 개발자 PC 종료 중 서비스 유지 |

후속 이슈는 선행 PR 상태와 중복 여부를 확인한 뒤 생성한다. 한 번의 5분 확인으로 장기 검사가 끝난다고 가정하지 않는다. PR 생성은 작업 진행 증거이고 배포 또는 제품 완료가 아니다. 출시 증거는 [#322](https://github.com/barocss/barocss-editor/issues/322)에 연결한다.
