# 동시 편집 공급자와 데이터 소유

2026-09-20 사용자 결정: **Wonffice는 동시 편집 서버를 직접 구현하지 않는다.** 외부 alpha의 공급자는 **Yorkie Cloud**다. 내부 통합 검증에서도 실제 Yorkie를 사용하며 외부 Yorkie 연결을 허용한다. 자체/로컬 Yorkie 설치는 필수가 아니다. 최종 테스트 배치는 미정이다. Yjs·Automerge는 미래 선택지이며 alpha에서 병행 구현하지 않는다. 기존 플랫폼 문서의 자체 세션·epoch·변경 로그 서버 계획은 이 결정으로 대체한다.

현재 구현과 목표를 구분한다. 저장소에는 `collaboration`과 `collaboration-yjs` 클라이언트 코드가 있다. Yorkie 제품 adapter, 권한 격리, 영속 저장 또는 네 제품 연결의 완료 근거는 없다. 기존 Yjs 코드를 삭제하거나 Yorkie 지원 구현으로 취급하지 않는다.

## 책임 경계

| Wonffice가 구현할 부분 | 기존 공급자에 맡길 부분 |
| --- | --- |
| 로그인 사용자·tenant·문서 접근 권한 | CRDT 엔진과 변경 병합 |
| 배포에 등록된 공급자 연결 설정과 문서 ID 매핑 | 기존 동기화 서버·네트워크 프로토콜 |
| 공급자가 제공하는 인증 hook·token 계약 연결 | 공급자 형식의 업데이트 저장·압축·동기화 복구 |
| 제품 문서 모델과 공급자 SDK 사이의 adapter | 공급자의 presence·지원되는 undo 기능 |
| 연결 상태·실패 표시·권한 회수 통합 검사 | 공급자의 서버 운영 기능·관리 API |
| 내보내기·게시 사본·백업의 제품 계약 | 해당 서버·저장소의 공급자별 설치·백업 도구 |

공급자를 쓴다고 Wonffice 권한 검사가 없어지지 않는다. 선택한 서버에서도 동일한 문서 접근 제한을 집행할 수 있어야 한다. 브라우저 UI에서만 접근을 막는 연결은 승인하지 않는다. 공급자 인증을 새 동기화 서버 구현으로 대체하지 않는다. 필요한 인증·회수 기능이 없으면 해당 조합은 지원하지 않는다.

## alpha 선택과 미래 선택지

| 선택값 | 연결 대상 | 현재 범위 |
| --- | --- | --- |
| `yorkie` | Yorkie SDK와 등록된 Yorkie 서비스. 내부 검증은 외부 Yorkie 또는 분리된 자체 서버를 선택할 수 있음 | alpha 대상. 프로젝트·문서 key·인증 hook·저장·복원을 실제로 확인한다. |
| `yjs` | Yjs SDK와 검증할 기존 provider/server | 미래 선택지. 서버 제품·영속 저장·인증 연결은 미검증이다. |
| `automerge` | Automerge SDK와 검증할 기존 repo/network/storage 또는 동기화 서비스 | 미래 선택지. 문서 URL·저장 adapter·접근 제한은 미검증이다. |

선택값은 동일한 프로토콜이나 내부 데이터 형식을 뜻하지 않는다. 현재 alpha 제품 연결은 Yorkie에 한정한다. 각 adapter가 제공하는 제품 기능과 제한을 명시한다. 공급자별 연결 패키지·서버 버전은 실제 연결 예제로 고정하며 지원표에 기록한다.

근거: [Yjs provider](https://docs.yjs.dev/ecosystem/connection-provider/y-websocket), [Automerge](https://automerge.org/docs/hello/), [Yorkie SDK](https://yorkie.dev/docs/sdks/js-sdk). Yorkie 공식 문서 재확인일: 2026-09-23. 미래 공급자의 제품 모델 연결까지 검증됐다는 뜻은 아니다.

## 선택과 데이터 소유

alpha 배포 관리자는 Yorkie 연결을 등록한다. tenant·문서의 연결은 서버가 허용한 범위에서 결정한다. 문서는 생성 또는 명시적 이전 시 하나의 연결에 고정한다. 요청자가 임의 endpoint나 다른 tenant의 공급자 문서 ID를 지정할 수 없게 한다. 다른 공급자의 tenant별 선택은 후속 설계다.

계획 메타데이터:

- `collaboration_connection`: tenant 범위, 공급자 종류, 연결 ID, 서버 주소, 허용 기능, 고정 버전, 비밀정보 참조.
- `document_collaboration`: `(tenant_id, document_id)`, 연결 ID, 공급자 문서 ID, 제품 schema version, 연결 상태, 내보낸 버전 참조.
- DB 외래 키와 유일 제약은 tenant를 포함한다. 클라이언트에 관리자 credential을 전달하지 않는다.

alpha 실시간 변경의 원본은 Yorkie 문서다. PostgreSQL은 사용자·회사·권한·문서 메타데이터와 연결 ID를 보관한다. 이미지·첨부는 별도 파일 저장소를 쓴다. Wonffice는 Yorkie 내부의 CRDT 변경 로그를 별도 DB에 중복 구현하지 않는다. 일반 snapshot 저장과 공동 문서의 확정 저장자를 구분한다. 활성 공동 문서를 일반 저장 API가 독립 snapshot으로 덮어쓰지 못하게 한다. Yorkie에서 확인된 상태를 읽어 만든 제품 snapshot은 게시·내보내기·명시적 버전 보존용이며 원본 동기화 로그를 대체하지 않는다.

Yorkie `doc.update()`는 로컬 변경을 먼저 반영한 뒤 서버로 비동기 전송한다. 따라서 로컬 반영이나 연결 성공만으로 영속 저장 완료를 표시하지 않는다. Auth Webhook은 문서별 읽기·쓰기와 현재 tenant membership을 검사해야 한다. Yorkie의 schema 검사는 원격 변경을 검증 없이 적용할 수 있고, 기본 Tree undo/redo는 개발 중이다. 제품 구조·참조와 사용자별 undo/redo는 실제 지원 연산을 정해 별도로 검증한다. 근거: [동기화](https://yorkie.dev/docs/internals/synchronization), [보안](https://yorkie.dev/docs/advanced/security), [schema](https://yorkie.dev/docs/advanced/schema-validation), [undo](https://yorkie.dev/docs/sdks/js-sdk).

설정에서 공급자 이름을 바꾸는 것만으로 기존 문서를 이전하지 않는다. 이전은 편집 중지·권한 확인, 지원되는 제품 형식으로 내보내기, 새 공급자 가져오기, 본문·자산·권한 대조, 연결 전환 순서로 수행한다. 원래 문서와 복귀 경로를 보존한다. undo·presence·변경 이력의 이전 가능 여부는 따로 표시한다. 미지원 문서 구조나 버전이면 전환을 거부한다.

## 클라우드와 온프레미스

Fastify 기반 office-api와 Yorkie 제품 adapter의 책임은 두 배포에서 같다. 외부 alpha는 Yorkie Cloud를 사용한다. 내부 통합 검증은 로컬 PostgreSQL·API·제품 UI에서 외부 Yorkie에 연결해도 된다. 분리된 자체 호스팅 Yorkie는 선택 가능한 검증 환경이며 필수가 아니다. 최종 테스트 배치와 키·웹훅 설정은 미확인이다. Cloud를 쓰면 전용 테스트 프로젝트의 브라우저용 public key와 서버 전용 secret key를 구분한다. secret key는 브라우저에 전달하지 않는다. 권한 회수 검증에는 Auth Webhook과 Cloud가 로컬 API에 도달할 안전한 경로가 필요하다. #355 인증·API가 준비되기 전에는 키 제공을 요청하지 않고 키를 이슈·PR에 기록하지 않는다. 외부 서비스 사용 허용은 고객 데이터 사용이나 운영 배포 승인이 아니다. 자체 호스팅 서버의 기본 메모리 저장은 재시작 영속성이 없으며 공식 영속 저장 경로는 MongoDB다. 온프레미스가 Yorkie Cloud에 의존하는지, 자체 서버를 포함하는지와 복원 절차는 검증 전이다. Cloud 연결 검사를 완전 오프라인 내부 설치 지원으로 표시하지 않는다. Wonffice 제품 서버와 Yorkie 서버의 버전·백업·복구 지점을 함께 기록한다. 근거: [Yorkie 프로젝트와 키](https://yorkie.dev/docs/advanced/projects), [Auth Webhook](https://yorkie.dev/docs/advanced/security), [Yorkie 자체 호스팅](https://yorkie.dev/docs/self-hosted-server).

## alpha 공동편집 인수 기준

1. 공통 연결 계약과 Yorkie의 지원 기능을 먼저 정의한다. 미구현 adapter는 선택 가능한 기능으로 노출하지 않는다.
2. 실제 Yorkie 서비스·SDK·인증·영속 저장 구성을 고정한다. 외부 또는 자체 호스팅 중 선택한 테스트 배치, 프로젝트 키 경계와 웹훅 도달성을 기록한다. Cloud 연결과 완전 오프라인 검사를 구분한다.
3. Note → Word → Slides → Site 순서로 네 제품 모두 PostgreSQL 메타데이터·API·UI·Yorkie 원문 재열기를 확인한다. 제품 모델 adapter에서 동시 입력, 노드 이동·삭제, 표와 제품 고유 구조를 검사한다. 수렴과 제품 schema·참조 유효성을 함께 확인한다.
4. 각 제품에서 서로 다른 로그인 계정과 두 브라우저, 재접속, 연결 단절, 서버 재시작, 사용자별 undo/redo, 권한 회수, 다른 tenant 접근 차단을 실제 Yorkie로 검사한다.
5. Yorkie에서 확인된 상태의 내보내기·게시·백업 복원을 확인한다. 공급자 장애 중 미확정 초안을 보존하고 일반 snapshot 요청이 활성 공동 문서를 덮어쓰지 못하게 한다.
6. 같은 통합 후보와 제품·DB·Yorkie 버전, 환경, 합성 자료, 로그, 독립 QA 결과를 [#322](https://github.com/barocss/barocss-editor/issues/322)에 연결한다. 제품별 미지원 연산을 명시한다.

미래 공급자로 라이브 문서를 바꾸는 작업은 위 alpha 인수에 포함되지 않는다. 새 공급자를 지원할 때는 내보내기·가져오기·권한·자료·복귀 경로와 undo·presence·이력 손실을 별도로 검증한다.
