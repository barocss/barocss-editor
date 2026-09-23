# Barocss Suite — Roadmap

2026-09-20 공통 UI 문서화: [#336](https://github.com/barocss/barocss-editor/issues/336)에서 office-ui·office-controls·office-editor-ui의 역할, 필드 확정, 명령 상태, 선택·포커스 책임을 정리했다. 기본 툴바 예제의 mark 연결을 보완하고 공개 API 예제를 추가했다. [소스·검증 기록](specs/shared-ui-documentation-audit.md)을 참고한다. 런타임 개선과 제품 인수는 별도다.

2026-09-20 문서화 1차: [#285](https://github.com/barocss/barocss-editor/issues/285)에서 코어·확장·model·제품 4개 README와 공개 확장 가이드를 정리한다. 기본 kit 교체와 확장 추가, Note 세션 옵션, schema·렌더러·명령·호스트의 경계를 설명한다. [문서 관리 계약과 후속 범위](specs/documentation-contract.md)를 기준으로 진행하며, 전체 제품 기능 문서가 완료되었다는 뜻은 아니다.

2026-09-20 SE-01 구현: [#263](https://github.com/barocss/barocss-editor/issues/263)의 열린 문서 조각, editor별 정책, 읽기 전용 계획과 transaction 적용 경로를 추가했다. [지원 범위와 계약](specs/schema-editing-policy.md)을 참고한다. 실제 clipboard 연결 #264와 DND 연결 #265는 남아 있다. 전체 완료는 추적 이슈 #262의 완료 기준으로 판단한다.

2026-09-20 WP-01 구현: [#249](https://github.com/barocss/barocss-editor/issues/249)의 transaction 실패 정리, commit 중 쓰기 복구, commit 후 오류 분리, 협업 이벤트 발행 시점을 보강했다. [결과·호환성 계약](specs/transaction-recovery.md)에 범위와 검증 항목을 기록했다. 검사 증거와 병합 상태는 구현 PR에서 확인한다. schema/fragment 후속 이슈 #263–#265는 이번 구현에 포함하지 않는다.

## 현재 제품 진행표 — 2026-09-19

2026-09-20 Note 시나리오 자동화 및 재현 오류 수정: [#282 / PR #283](https://github.com/barocss/barocss-editor/pull/283)에서 독립 화면·iframe 임베드 화면의 검사를 구성했다. 슬래시 메뉴 스크롤·Enter 전파와 빈 문단의 제목 변환·Backspace 경계를 수정했고, Undo/Redo를 포함한 데스크톱 시나리오 16개가 로컬에서 통과했다. Note 단위 341개, 공통 extensions 276개, editor-ui 48개도 통과했다. 메뉴·구분선의 추가 재현 조건(#279, #281)은 유지한다. [시나리오 정의와 범위](specs/note-editing-scenarios.md).

2026-09-19 Node 실행 기준: 로컬 검증과 CI의 버전 차이를 없애기 위해 프로젝트 기준을 22.22.0으로 고정했다. `.nvmrc`를 로컬 `nvm use`, CI 두 작업, 문서 빌드의 단일 기준으로 사용한다. 최초 CI의 fs.globSync 호환성 실패도 수정했다.

2026-09-19 기준점 CI 복구: [#248](https://github.com/barocss/barocss-editor/issues/248) / [PR #250](https://github.com/barocss/barocss-editor/pull/250)에서 제품 소스 타입 오류, React 조합 종료·빈 문단 입력, 제품 workspace 배포 진입점과 누적 검사 불일치를 수정했다. 전체 단위 검사 8,540개 통과(기존 17개 건너뛰기), React 14개·Site 3개·테마 1개 데스크톱 브라우저 검사, Office 통합·제품 4개 패키지 빌드와 lint 통과. 소스 타입 40개 프로젝트 검사에는 기존 예외 3개가 남아 있고, 테스트 타입 검사는 기존 오류 허용 한도를 올리지 않고 복구했다. main에 최신 기준 CI 두 개와 PR을 필수로 설정하고 관리자 우회·강제 push·삭제를 막았다. 최종 원격 CI와 병합 상태는 PR에서 확인한다. [검증 기록](../.dev/plans/wonffice-baseline/brief.md). WP-01 [#249](https://github.com/barocss/barocss-editor/issues/249)는 기준점 병합 후 진행한다.

2026-09-19 Codex·GitHub 작업 기준: 사용자의 추가 요청에 따라 독립 상주 실행기보다 Codex 작업 시작·재개 시 GitHub 이슈·PR을 먼저 확인하는 흐름을 기본으로 정했다. 루트 AGENTS.md에 최신 main 기준 브랜치, 이슈별 구현·검증·PR, 중간 지시 재확인을 기록했다. 독립 실행기는 후속 선택이다. 누적 변경을 기준점 커밋과 draft PR로 보존하고 WP-01은 선행 기준점 병합 후 진행한다. 통합 Office 빌드 통과, 전체 타입 검사 3개 프로젝트 실패를 확인했다. 전체 기능 인수나 자동 시작 기능 완료를 뜻하지 않는다.

2026-09-19 Wonffice 서비스·Agent 설계: 사용자 결정에 따라 클라우드 SaaS와 고객사 내부 설치를 동시 출시 대상으로 정했다. [플랫폼 구조](specs/wonffice-platform.md), [로컬 Agent 실행 계약](specs/wonffice-agent-runtime.md), [WP-01–WP-12 구현 순서](specs/wonffice-platform-delivery.md)를 작성했다. 서비스 실행과 개발 Agent를 분리하고 회사별 기능·권한·문서 revision·공유·두 환경 배포 계약을 정의했다. 기존 operation의 실패 정리와 commit 후 오류 구분을 첫 구현 WP-01로 지정했다. 승인된 일이 없으면 대기하도록 기존 무한 이슈 생성 규칙을 수정했다. 이번 기록은 코드 점검과 설계 문서 작성이다. 백엔드·무인 실행기·자동 병합은 미구현·미활성 상태다. 공통 UI의 남은 검증은 기존 계획에 유지하며 모바일 화면 검사는 진행하지 않는다.

2026-09-14 DOM 선택 도구 위치·잘림 경계: office-ui의 visibleElementRect·observeElementAnchor와 office-editor-ui useNodeAnchor로 현재 문서 노드의 위치 감지를 연결했다. Note 표·블록·코드 도구와 Word 수식 도구가 부모 배율 변경·내부 스크롤·DOM 교체를 감지한다. overflow 조상이나 화면에 완전히 가려진 대상의 도구는 숨긴다. 일부만 보일 때도 표 계산에 쓰는 원래 좌표는 유지한다. Note 표 버튼의 아이콘·글자 겹침을 공통 Button·Tip으로 수정했다. 단위 검사 4개, Word 8개·Note 11개 데스크톱 브라우저 검사, 공통 UI·편집 UI·Word·Note 타입 검사(기존 미사용 항목 제외), Office 빌드 통과. 통합 Note에 ‘선택 도구 경계 확인’ 문서를 만들고 표 도구를 확인했다. 다음은 [2단계](specs/office-editor-ui-consolidation.md)의 텍스트 범위와 Slides·Site 객체 도구 적용 점검이다.

2026-09-14 문맥 도구 표시·포커스 공통화: office-editor-ui useEditorContextVisibility를 Note 글자 도구와 Word 수식 도구에 적용했다. 외부 필드·내부 수식 입력·창 포커스 상실·읽기 전용에서는 숨기고, Escape 닫힘을 같은 대상의 포커스 복귀 후에도 유지한다. Word의 KaTeX 표시를 다시 클릭하면 도구를 열 수 있다. Note는 창 포커스 복귀 때 위치를 다시 측정한다. 단위 검사 11개, Note 12개·Word 12개 데스크톱 브라우저 검사가 범위별 통과했다. 공통 편집 UI·Word 타입 검사(기존 미사용 항목 제외), Office 빌드 통과. 실제 통합 Word에 `x+2`를 넣고 도구 열기·내부 편집 중 숨김을 확인했다. 다음은 [편집 UI 공통화 2단계](specs/office-editor-ui-consolidation.md)의 위치 측정·화면 경계와 다른 객체 도구 적용 점검이다.

2026-09-14 Slides 설정 창 확대 적용: 레이아웃·테마에 공통 useEditorSettings를 연결했다. 실패 후 초안·재시도, 적용 중 중복 실행·닫기 차단, 변경 없는 적용 생략을 공유한다. 같은 레이아웃을 다시 배치하는 명령은 유지한다. 템플릿은 제품의 문서 교체 흐름에서 저장 대기·오류·재시도·이전 요청 차단을 보강했다. 테마 창의 긴 색상 이름 잘림을 수정했다. 단위 검사 13개, 데스크톱 브라우저 검사 23개가 범위별 통과했다. 기존 테마 검사의 중복 이름 선택자를 수정했다. 편집 UI·Slides 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 실제 통합 Slides에 테마 설정 창을 열었다. 다음은 [편집 UI 공통화 2단계](specs/office-editor-ui-consolidation.md)의 선택 도구 표시·포커스 점검이다. Site 설정 창별 적용 판단은 후속 범위로 유지한다.

2026-09-14 office-editor-ui 설정 창 공통화: useEditorSettings로 초안·적용·취소·실패·재시도를 공유한다. Word 문단 간격·테두리·페이지 설정과 Slides 크기 설정에 적용했다. Slides는 명령 성공 후 닫고, 실패하면 입력값을 유지한다. 적용 중 중복 실행·닫기와 새 세션에 대한 이전 응답을 막는다. 변경 없는 적용은 명령을 실행하지 않는다. 단위 검사 7개, Word 18개·Slides 2개 데스크톱 브라우저 검사, 편집 UI·Word·Slides 타입 검사(기존 미사용 항목 제외), Office 빌드 통과. 열린 통합 Slides에서 설정 창을 확인했다. 다음은 Slides의 남은 레이아웃·테마·템플릿 설정을 점검한 뒤 [선택·포커스 공통화](specs/office-editor-ui-consolidation.md)로 이어간다.

2026-09-14 office-editor-ui 속성 실행 세션: 공통 usePropertyCommand에 편집기·문서·선택 문맥 경계를 추가했다. 선택 변경 뒤의 이전 대기 명령을 건너뛰고, 늦게 도착한 오류·재시도·처리 중 상태를 새 선택과 분리한다. 같은 대상에서 연속 명령과 실패 payload 재시도는 유지한다. Slides·Site의 기존 공통 훅 사용처에 적용됐다. 단위 검사 8개, Slides 3개·Site 2개 데스크톱 브라우저 검사, 편집 UI 타입 검사(기존 미사용 항목 제외), Office 빌드 통과. 통합 Slides에서 실제 너비 변경·실행 취소를 확인했다. 다음은 [편집 UI 공통화 1단계](specs/office-editor-ui-consolidation.md)의 남은 설정 창 초안·적용·취소 계약 비교다.

2026-09-14 공통 색상 입력 형식: office-ui ColorPicker에 HEX·RGB(A)·HSL·HSB·OKHSL 선택과 채널 입력을 추가했다. 형식 변경은 문서를 수정하지 않는다. Color.js 0.7.1로 변환하며 sRGB HEX/RGBA 저장 계약을 유지한다. 색상 알파와 채우기 불투명도를 분리하고, 중립색에서 먼저 지정한 색조·채도를 유지한다. CSS HSL·RGB 퍼센트·색 이름·알파 HEX 읽기도 지원한다. 변환 단위 검사 7개, 데스크톱 브라우저 검사 6개가 통과했다. 채널 간격과 불투명도 변경을 추가 확인했다. 공통 UI 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 갤러리 예시를 갱신하고 실제 통합 Slides에서 표시를 확인했다. 다음 office-editor-ui 공통화 범위는 유지한다.

2026-09-14 채우기 혼합 설정 분리: Slides 혼합 모드를 색상 팝업에서 각 채우기 행의 속성 설정으로 옮겼다. office-ui StackRow에 상시 세부 설정용 details 영역을 추가했으며, ColorPicker는 혼합 모드를 알지 않는다. 채우기별 혼합·색상·불투명도 보존, 실행 취소, 그라디언트 전환, 팝업 배치·스크롤·목록 순서의 데스크톱 브라우저 검사 5개가 범위별 통과했다. office-ui·Slides 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 열린 통합 Slides에서도 확인했다. 다음 편집 UI 공통화 범위는 유지한다.

2026-09-14 office-ui 데스크톱 기본 정비 1차 마감: 컬러 피커의 비대칭 여백과 손잡이 잘림을 수정했다. 공통 StackRow에 순서 버튼을 추가하고 서로 다른 높이의 행 드래그를 실제 경계로 계산한다. Slides 효과 값에 이름·pt 단위를 표시했다. 데스크톱 브라우저 검사 6개와 office-ui·Slides 타입 검사(기존 미사용 항목 제외), Office 빌드가 통과했다. 열린 통합 Slides에서도 색상 창과 효과 입력을 확인했다. 다음은 [office-editor-ui 공통화](specs/office-editor-ui-consolidation.md): 속성 명령·설정 초안 → 선택·포커스·문맥 도구 → 메뉴·툴바 실행 계약 순서다. 이 다음 단계는 범위 확정 상태이며 추가 구현 완료로 기록하지 않는다. 모바일 및 서버 권한 UI는 후속 범위로 유지한다.

2026-09-14 이동 가능한 속성 색상 창: 사용자의 요청에 따라 Slides 채우기·효과 편집을 속성 행 아래에서 패널 옆의 창으로 바꿨다. office-ui useMovablePanel을 StackRow와 ColorField가 공유한다. 제목 드래그, 화면 경계 제한, 이동 후 위치 유지, Escape 이동 취소, 닫은 뒤 다시 열 때 기준 위치 복원을 제공한다. 최상위 표시 영역으로 조상 스크롤·잘림을 피하며, 긴 내용은 본문만 스크롤하고 제목·닫기를 유지한다. Site의 공통 색상 창에도 적용된다. 데스크톱 브라우저 검사 11개와 office-ui·Slides 타입 검사(미사용 항목 제외), Office 빌드가 통과했다. 실제 통합 Slides에서 패널 옆 배치와 색상 입력 포커스를 확인했다. 다음은 효과 수치의 이름·단위와 목록 순서 조정 UI다.

2026-09-14 그라디언트·효과 편집 UI: office-ui StackRow에 선택적 편집 제목·닫기·키보드 진입·포커스 복귀를 추가하고 Slides 채우기·효과 색 편집에 적용했다. 색 지점은 Enter·Space로 선택하며 선택 테두리는 공통 색상 토큰을 사용한다. 패널의 그라디언트 드래그는 막대 안에서 미리보기하고 놓을 때 한 번 적용한다. Escape 취소는 문서를 바꾸지 않는다. 지점 정렬 뒤에도 이동한 색을 선택하며, 편집 도구의 키가 캔버스 선택을 바꾸던 충돌을 수정했다. Site의 모양 이름은 선형·원형으로 맞췄다. 데스크톱 브라우저 검사 22개(Slides 신규 2·기존 19, Site 1), office-ui·Slides 타입 검사(미사용 항목 제외), Office 빌드가 통과했다. 실제 통합 Slides에서 새 편집 제목·닫기 버튼·색상 코드 포커스를 확인했다. 다음은 효과 수치 입력의 항목 이름·단위 표시와 목록 순서 조정 UI다. 캔버스 위의 그라디언트 축 드래그는 기존 동작을 유지한다.

2026-09-14 공통 색상·숫자 키보드 입력: ColorField를 Enter·Space로 열면 색상 코드를 선택한다. Escape는 원래 버튼으로 돌아가고, Tab으로 팝업 밖에 이동하면 새 포커스를 유지하며 닫는다. 긴 색상 이름은 속성 행 안에서 줄여 표시하고 전체 이름을 title로 제공한다. NumberField는 ↑·↓, Shift 10배, Alt 1/10 단위 조정을 처리한다. 조정 중에는 초안만 바꾸며 Enter·Tab으로 한 번 적용하고 Escape로 취소한다. 기존 범위·표시 정밀도를 따른다. 데스크톱 브라우저 검사 10개, 숫자 단위 검사 12개, office-ui·갤러리 타입 검사(미사용 항목 제외), Office 빌드가 통과했다. 실제 통합 Slides에서 색상 코드 포커스와 팝업 경계를 확인했다. 다음은 Site·Slides의 그라디언트·효과 편집에서 공통 UI와 입력 흐름의 차이를 점검하는 작업이다.

2026-09-14 Slides 속성 명령 상태: Site의 usePropertyCommand를 office-editor-ui로 옮겨 두 제품이 순차 실행·처리 상태·실패 재시도를 공유한다. Slides의 크기·배치·스타일·모션·컴포넌트 속성 명령을 연결했다. 처리 중 속성과 단위 입력을 막고, 실패한 명령의 대상과 변환된 값을 보관한다. 선택·슬라이드·문서·단위 변경 시 이전 오류와 입력 초안을 지운다. 다중 선택의 cm 변환, 잠금·해제, 모서리·컴포넌트·모션, Site 회귀를 포함한 데스크톱 브라우저 검사 12개가 통과했다. Slides·office-editor-ui 타입 검사(미사용 항목 제외)와 Office 빌드가 통과했다. 실제 통합 Slides의 ‘Slides 속성 UI 확인’ 문서에서 도형 너비 10cm 적용을 확인했다. 다음은 제품 속성 패널의 색상·숫자 입력에서 긴 값, 팝업 경계, 키보드 이동을 점검하는 작업이다.

2026-09-14 Site 그림 교체 이력 통합: insertAsset에 선택적 applyTo 계약을 추가했다. 새 자산 추가와 그림 src·영상 poster·사이트 icon 참조 적용을 하나의 트랜잭션으로 처리한다. 기존 자산만 추가하는 호출은 유지한다. 대상 종류·존재·현재 문서 소속·명령 실행 가능 여부를 확인하며, 여러 대상 중 하나라도 잘못되면 변경하지 않는다. 그림 교체는 한 번의 실행 취소로 자산과 참조를 함께 되돌리고 다시 실행으로 함께 복원한다. 파일을 읽은 뒤 자산 목록 차이로 새 파일을 찾던 코드는 제거했다. 단위 검사 27개, 데스크톱 브라우저 검사 3개, Site 타입 검사(미사용 항목 제외)와 Office 빌드가 통과했다. 다음은 Slides 속성 명령의 처리·실패·재시도 UI 적용이다. 빈 캔버스 드롭에서 새 그림 블록 생성까지 하나로 묶는 작업은 별도 범위다.

2026-09-14 Site 속성 실패·그림 선택 유지: 속성 패널의 공통 run 경로에 순차 실행·처리 표시·실패 재시도를 연결했다. 명령 거부와 예외를 StatusNotice로 표시하고, 실패한 명령과 값을 같은 대상에 다시 적용한다. 대상·페이지·편집 폭·상태가 바뀌면 이전 실패 안내와 입력 초안을 넘기지 않는다. 자산 추가 트랜잭션이 새 자산을 커서 위치로 선택하던 동작을 막아 그림 교체 후 그림 속성 패널을 유지한다. 자산 추가는 선택을 뷰와 실행 취소 기록에 덮어쓰지 않는다. 데스크톱 브라우저 검사 5개가 범위별 통과했고 Site 타입 검사(미사용 항목 제외)와 통합 Office 빌드가 통과했다. 실제 Site에서 기울기 적용을 확인했다. 다음은 그림 추가·대상 적용을 한 번의 실행 취소로 묶는 작업과 Slides 속성 명령 상태 적용이다.

2026-09-14 Site 그림 속성 UI: 그림·탭 그림 등 picture 속성 행의 별도 파일 버튼과 선택 목록을 공통 SearchSelect·FilePick·FileItem·StatusIndicator·StatusNotice로 교체했다. 문서 자산 검색과 키보드 선택을 제공한다. 파일 처리 중 중복 입력을 막고, 실패 시 파일과 재시도 작업을 유지한다. 빈 파일·문서 변경·명령 거부를 오류로 표시한다. Site 데스크톱 브라우저 검사 3개(속성 재시도·검색, 기존 파일 삽입·발행, 그림 드롭), Site 타입 검사(미사용 항목 제외), 통합 Office 빌드가 통과했다. 실제 Site 편집기의 그림 속성 목록을 열어 확인했다. 기존 그림 적용 후 선택이 해제될 수 있는 동작과 자산 추가·대상 적용의 단일 실행 취소 처리는 후속 점검 대상이다. 다음은 Site 일반 속성 입력의 명령 실패 표시다.

UI 검증 기준: 사용자의 요청에 따라 앞으로는 데스크톱 화면을 기준으로 구현·검증한다. 모바일 화면 설계와 화면 크기별 검사는 후속 단계로 미룬다.

자료 연결·백업 입력 검증: 관련 브라우저 검사 4개가 통과했다. 최종 수정 후 신규 검사 2개를 데스크톱에서 다시 확인했다. office-workspace 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 실제 통합 자료함에서 연결 목록과 백업 창을 열어 확인했다.

2026-09-14 통합 자료 연결·백업 입력: 자료 관리의 연결 선택을 office-ui SearchSelect로 교체했다. 이름·제품·폴더 검색과 키보드 선택을 제공하며 자기 자신·휴지통·이미 연결한 자료는 제외한다. 백업 입력은 FilePick·FileItem으로 파일 이름·크기·바꾸기·제거를 표시한다. 복원 중 파일 변경·제거·닫기를 막고, 실패 시 파일을 유지하며 성공 후 선택을 비운다. JSON 구문 오류는 파일 재선택 안내로 표시한다. 다음은 기존 제품 속성 패널의 공통 입력·오류·빈 상태 적용 점검이다.

2026-09-14 Word 문단 설정·통합 자료함 상태: Word 문단 간격·테두리·페이지 설정의 초안·선택·비동기 적용 처리를 useFormattingDialog로 묶었다. 실패 시 값을 유지하고 처리 중 중복 실행·닫기를 막는다. 변경 없이 확인하면 명령을 실행하지 않는다. 문단 간격 체크박스와 테두리 사전 설정 버튼은 공통 컴포넌트를 사용하고, 테두리 창은 390px에서 세로로 배치한다. 통합 자료함의 읽기 실패·재시도·완료·빈 상태를 StatusNotice·StatusIndicator·EmptyState로 교체했다. 검색·필터 초기화와 즐겨찾기·최근 자료·휴지통의 빈 상태를 구분한다. Word 15개·통합 자료함 3개로 브라우저 검사 18개가 범위별 통과했다. Word·office-workspace 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 기존 통합 Word의 테두리 창과 실제 자료함 검색에서 확인했다. 다음은 통합 자료 관리의 연결할 자료 선택과 백업 파일 입력을 공통 UI에 연결하는 작업이다.

2026-09-14 Word 페이지 설정·보관함: 페이지 설정의 체크박스와 유효성·실패 안내를 공통 UI로 교체했다. 설정 적용을 기다리며, 실패 시 초안을 유지하고 재시도할 수 있다. 대화상자를 열 때 선택한 구역을 보존하고 처리 중 중복 적용·닫기를 막는다. 390px에서는 여백 입력을 한 열로 배치한다. Word 보관함은 공통 NavigationItem·TextField·EmptyState·StatusIndicator를 사용한다. 제목 검색·검색 지우기·읽기 실패 재시도를 추가했다. 기존 6개·추가 3개로 브라우저 검사 9개가 범위별 통과했다. Word 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 기존 통합 Word 탭에서 페이지 설정과 보관함 검색을 확인했다. 다음은 Word 문단 간격·테두리 대화상자의 적용·취소·오류 처리와 통합 자료함의 빈 상태 점검이다.

2026-09-14 Word 찾기 공통화: 입력·체크박스·패널 제목·작업 버튼·상태 안내를 office-ui로 교체했다. SearchResultNavigation을 추가해 Note와 Word의 결과 개수·이전/다음·빈 상태를 통일했다. Word 찾기 패널은 문서 스크롤 중에도 유지되며 작은 화면에서 현재 결과를 가리지 않도록 이동한다. 한글 조합 중 Enter·Escape, 결과 없음, 바꾸기 실패·재시도, 전체 바꾸기 실행 취소, 메뉴 연결을 확인했다. Word 11개·Note 4개 브라우저 검사가 범위별 통과했다. Word·office-ui 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 다음은 Word 페이지 설정과 자료함의 자체 입력·오류·빈 상태 점검이다.

2026-09-14 공통 다중행 입력: TextAreaField에 확정형 입력(onCommit), Escape 취소, Ctrl/⌘+Enter·blur 적용, 적용 중 읽기 전용, 실패 시 초안 보존과 재시도를 추가했다. 기존 onChange 실시간 입력은 유지한다. 공통 팝업·Dialog·Drawer는 다중행 입력의 취소를 먼저 처리한다. Site 표와 행 Drawer에 연결하고 긴 텍스트의 공백·줄바꿈을 보존하도록 cellFor를 수정했다. 긴 텍스트 붙여넣기는 여러 셀 붙여넣기로 처리하지 않는다. 갤러리 `#multiline`에 확정·실시간·읽기 전용·실패·대기 예시를 추가했다. 브라우저 검사 12개(다중행 2, 기존 필드 4, 모달 5, Site 셀·Drawer 1), 데이터 단위 검사 20개, 공통 UI·갤러리 타입 검사와 Office 빌드가 통과했다. Site 타입 검사는 기존 오류 3건만 보고했다. 실제 Site 샘플에서 여러 줄 설명을 입력하고 적용했다. 다음은 Word 찾기 UI의 공통 입력·결과·빈 상태 점검이다.

2026-09-14 Note 보기 UI 공통화: 필터·정렬·저장된 보기·속성 표시의 버튼, 체크박스, 이름 입력, 팝업 헤더를 office-ui에 맞췄다. `FloatingPanelFooter`를 추가해 초기화·취소·적용을 배치하고, Button은 팝업 앵커용 ref를 공개한다. 기존 초안 적용 방식과 보기별 필터·정렬·숨긴 속성을 유지한다. 빈 조건 안내, 숫자 검증, 적용 중 표시, 공통 오류 안내를 연결했다. 갤러리 `#panel-actions`에 취소·실패·재적용 예시를 추가했다. Note 브라우저 검사 5개와 갤러리·버튼 검사 4개, Note·office-ui·갤러리 타입 검사 및 Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했다. 실제 Note에 ‘데이터베이스 UI 확인’ 문서를 만들고 필터 팝업을 열었다. 다음은 공통 TextAreaField 확정·취소 계약 보강과 Site 긴 텍스트 셀 적용이다.

2026-09-14 Site 명령 검색: 공통 `CommandSearch`·`CommandSearchTrigger`를 Site 헤더에 연결했다. 관리·페이지 편집 화면의 기존 메뉴를 검색하며 글 고치기 모드의 실행 제한을 따른다. 문서·편집 대상·페이지·선택을 보관하고, 화면이 바뀌면 이전 대상의 명령을 실행하지 않는다. 검색창 키 입력은 캔버스 명령에서 제외했다. 최근 명령 5개와 실행 실패 안내를 제공하며 HTML 출력은 기존 출력 상태 UI를 사용한다. 검색 3개·기존 출력 2개·제품 메뉴 1개의 브라우저 검사와 Office 빌드가 통과했다. Site 타입 검사는 기존 오류 3건만 보고했다(문자열 선택값 2건, markdown-it 선언 1건). 실제 통합 Site 화면에서 검색창을 열었다. 속성 패널의 값 입력은 검색 범위에 포함하지 않았다. 다음은 Note 필터·보기 설정의 공통 UI 적용 점검이다.

2026-09-14 Slides 명령 검색: 공통 `CommandSearch`를 Slides 헤더에 연결했다. 기존 메뉴와 직접 실행하는 툴바 명령을 검색한다. 검색 전 문서·현재 슬라이드·선택을 보관하고 실행 전에 복원한다. 실행 불가 이유, 조합 입력 보호, 최근 명령 5개, 후속 설정 Dialog를 제공한다. Word와 Slides는 공통 `CommandSearchTrigger`를 사용하며 작은 화면에서는 아이콘으로 표시한다. 파일 선택과 색·글꼴 등 값 입력 도구는 검색 범위에서 제외했다. Slides 검색 2개·기존 툴바 4개·Word 검색 1개의 브라우저 검사, 명령 모델 단위 검사 3개, 공통 UI·Slides·Word 타입 검사와 Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했다. 다음은 Site 명령 검색 연결이다.

2026-09-14 DOCX·HTML 출력 상태: Word DOCX 변환 중·변환 실패·다운로드 실패·요청 완료를 공통 `TaskStatus`로 표시한다. 변환 안내를 유지하고, 다운로드 재시도는 준비한 파일을 사용한다. Site HTML·ZIP 출력에도 상태와 재시도를 연결했다. 출력 중 중복 요청을 막고, 문서 교체 후 이전 요청이 새 문서를 출력하지 않게 했다. `TaskStatusRegion`으로 JSON 파일 안내와 출력 안내를 같은 영역에 쌓아 겹침을 없앴다. 브라우저 검사 7개(DOCX 2, Site 출력 2, Word·Site·Slides 파일 회귀 각 1), 공통 파일 단위 검사 10개, Word·공통 UI·편집 UI 타입 검사와 Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했으며 Site 기존 타입 오류 3건은 유지된다. 실제 브라우저에서 Word DOCX 변환 안내를 열었다. 변환을 별도 작업 스레드로 옮기거나 다운로드 완료를 추적한 것은 아니다. 다음은 Slides 명령 검색 연결이다.

2026-09-14 Slides 파일 UI 공통화: office-slides의 별도 파일 실행·오류 UI를 office-editor-ui `FileActions`로 교체했다. 덱 JSON 형식·파일 이름·새 덱 생성·교체 후 슬라이드/타임라인 초기화는 기존 제품 로직을 사용한다. 공통 `confirmReplace`로 Slides의 “변경 확인 → 현재 자료 저장 → 문서 교체” 순서를 유지하고, 확인 거부를 오류와 구분한다. Word·Site의 기존 교체 정책은 유지한다. 중복 오류 스타일을 제거했다. Slides 브라우저 검사 8개, Word·Site 회귀 검사 2개, 공통 파일 단위 검사 10개와 Slides·편집 UI·Slide 앱 타입 검사, Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했다. 통합 브라우저에서 검증용 Slides 자료를 만들고 다운로드 요청 안내를 확인했다. 다음은 Word DOCX·Site HTML 출력의 작업 상태 연결이다.

2026-09-14 파일 작업 상태: office-ui에 `TaskStatus`를 추가했다. 처리 중·완료·실패·취소 상태, 실제 진행률이 있을 때만 표시하는 진행 막대, 제품이 제공하는 복구 작업을 지원한다. office-editor-ui의 `FileActions`에 연결하여 Word·Site JSON 파일 출력·읽기·새 문서 준비 상태를 공통 카드로 표시한다. 오류를 자동으로 지우지 않으며, 출력 안내는 브라우저의 실제 저장 완료와 구분해 “다운로드 요청됨”으로 표시한다. 중복 실행, 비동기 읽기 도중 다른 문서로 이동한 경우의 덮어쓰기, 읽기·변환 실패 처리를 보강했다. 갤러리 `#tasks`를 브라우저에 열었다. 공통 파일 단위 검사 7개, 갤러리·Word·Site 브라우저 검사 3개, 공통 UI·편집 UI·Word·갤러리 타입 검사와 Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했다. Site 타입 오류 3건은 기존과 같다. 실제 파일 작업의 수치 진행률·중간 취소, DOCX/HTML 출력, Slides의 별도 파일 모듈은 이번 범위에 포함하지 않았다. 다음은 Slides 파일 UI를 공통 모듈로 연결하는 작업이다.

2026-09-14 명령 검색: office-ui에 `CommandSearch`를 추가하고 Word 헤더에 연결했다. 기존 메뉴 정의와 기본 글자·문단 서식 18개를 검색한다. 방향키·Enter·Escape, 한글 조합 입력 보호, 실행 불가 안내, 세션 내 최근 명령 5개를 제공한다. 검색 전 문서 선택을 복원한 뒤 실행하며, 다음 편집 Dialog는 검색창의 닫기·포커스 복원 후 연다. 갤러리 `#commands`와 실제 Word 화면을 브라우저에 열었다. 검색 UI 2개·Word 선택/서식/링크 1개·기존 모달 5개의 브라우저 검사, 공통 UI·갤러리·Word·Office 타입 검사와 Office 빌드가 통과했다. 타입 검사는 기존 미사용 항목을 제외했다. 전체 리본 명령과 다른 제품 연결은 후속 범위다. 다음 공통 UI는 가져오기·출력 등 장시간 작업 상태다.

2026-09-14 파일·미디어 선택: office-ui에 `FileDropZone`·`FileItem`·`MediaSelect`를 추가했다. 파일 선택과 드롭에 동일한 형식·크기·빈 파일·단일 파일 검사를 적용한다. 처리 중 중복 입력을 막고 실패 후 재선택을 제공한다. Word 그림 삽입에 파일 놓기 영역·파일 이름/크기·제거를 연결했다. 이미지 해석과 커서 위치·문서 저장은 기존 제품 로직을 유지한다. Site 이미지 데이터 필드는 이름 목록에서 미리보기·검색 목록으로 바꿨으며 기존 asset 참조를 저장한다. 갤러리 `#files`에 모바일·실패·비활성 예시를 추가하고 브라우저에 열었다. 갤러리 3개, Word 그림 1개, Site 이미지 필드 1개의 브라우저 검사와 공통 UI·갤러리·Office 타입 검사, Office 빌드가 통과했다. Site 전체 타입 검사의 기존 오류 3건은 유지된다. 다음은 Word 명령 검색 UI다. 다중 업로드나 서버 자산 관리를 구현한 것은 아니다.

2026-09-14 검색형 선택·태그: office-ui에 `SearchSelect`와 `SelectionTag`를 추가했다. 단일 선택은 확정 후 닫고, 다중 선택은 선택 개수·개별 제거·전체 해제를 제공한다. 검색·방향키·Enter·조합 입력·중첩 Dialog 포커스·읽기 전용을 연결했다. Note 관계 선택의 저장 큐·실패 복구는 유지했다. Office 편집기 메뉴의 원본 자료 선택과 Site choices에도 적용했다. Site 다중 선택 필드 옵션 보존, label 내부 태그 제거가 다른 컨트롤을 활성화하는 문제를 수정했다. 갤러리 `#search-select`에 긴 이름·결과 없음·저장 거부·좁은 화면 예시를 추가했다. 브라우저 6개(갤러리 3, Office 참조 연결 1, Note 관계·계산·저장 1, Site 태그 1), Note UI 단위 검사 10개, 공통 UI·갤러리·Office 타입 검사와 Office 빌드가 통과했다. Site 전체 타입 검사는 기존 undefined 인수 2건·markdown-it 선언 누락 1건이 남아 있다. 다음은 파일·미디어 선택 UI다. 원격 검색과 가상 목록은 이번 범위 밖이다.

2026-09-14 공통 모션: 선택 목록·Menu·FloatingSurface는 140ms 열기 모션, 색상 팝오버는 위치를 유지하는 페이드, Tooltip은 100ms 페이드를 적용했다. Dialog는 180ms 페이드, Drawer·SidePeek는 200ms의 짧은 측면 이동으로 구분했다. 툴팁 간 이동과 메뉴 닫기는 즉시 처리한다. 시스템 동작 줄이기를 지원한다. 갤러리 `#motion`에 실제 컴포넌트와 시간 기준을 추가했다. 모션 중 키보드 입력·팝오버 재배치·포커스 복귀·화면 경계·네 제품 공통 UI를 포함한 브라우저 검사 18개와 갤러리 타입 검사가 통과했다. 기존 Dialog 종료·포커스 수명 주기는 유지한다. 다음은 검색형 선택 목록·태그의 제품 적용이며, 그다음 파일·미디어 선택과 작업 상태 UI를 진행한다.

2026-09-14 작은 객체·고정 크기 표시: office-ui의 `selectionResizeHandles`로 화면상 16px 입력 영역이 겹치는 Word·Slides 핸들을 줄였다. 오른쪽 아래 모서리를 우선 유지하며, 드래그 중인 핸들은 유지한다. 객체 크기와 제품의 조작 명령은 바꾸지 않는다. Site 고정 크기 표시를 `SelectionReadout` 포털로 옮겼다. 확대·축소와 캔버스 이동을 추적하고 객체가 캔버스 밖에 있으면 숨긴다. 갤러리에 12px 객체 예시를 추가하고 브라우저에 열었다. 단위 검사 5개, 브라우저 검사 14개가 통과했다. Site 화면 밖 이동·복귀 검사도 통과했다. 공통 UI·갤러리·Slides 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 다음은 검색형 선택 목록과 태그의 실제 제품 적용이다. 모든 객체 종류와 회전·연결점의 충돌 검증이 완료된 것은 아니다.

2026-09-14 표 경계·가이드·크기 표시: office-ui에 포커스와 키보드를 소유하지 않는 SelectionReadout을 추가했다. Note 표 드래그, Slides 이동·크기·회전, Site 실시간 크기 표시에 연결했다. body 포털에서 뷰포트 좌표로 배치하고 화면 가장자리 8px 안으로 제한한다. Word의 DOM 표 경계 도구는 React 의존성을 추가하지 않고 같은 표시 토큰과 별도 뷰포트 배치를 사용한다. 정렬 가이드는 공통 분홍색 토큰, 표 경계는 선택 강조색으로 구분했다. Note 표의 8px 입력 영역과 2px 경계선을 토큰으로 정의했다. Site 고정 크기 표시의 색·글자 크기도 맞췄다. 갤러리 `#selection-tools`에 경계 표시와 가이드 비교를 추가했다. 갤러리·네 제품 3개, Word 표 5개, Note 표 1개, Slides 1개, Site 1개로 브라우저 검사 11개가 통과했다. 공통 UI·갤러리 타입 검사와 Office 빌드가 통과했다. Site 전체 타입 검사는 기존 undefined 인수 2건과 markdown-it 선언 누락 1건이 남아 있다. 다음은 작은 객체의 핸들 겹침과 Site 고정 크기 표시의 경계 처리다. 모든 오버레이의 잘림 해결이나 표 입력 로직 전체 공통화를 의미하지 않는다.

2026-09-14 선택 도구 기본 표시 적용: office-ui에 선택선·핸들·포인터 영역·회전 간격 토큰과 공통 표시 클래스를 추가했다. Word 이미지·Slides 도형·Site 선택 블록의 프레임에 적용했다. Word·Slides 핸들은 8px 표시와 16px 포인터 영역을 분리했다. Site 모서리도 같은 표시를 사용하며, 바깥 크기 조절과 안쪽 여백 조절의 입력 영역을 유지한다. 확대된 부모 안에서는 표시 레이어를 역배율로 그려 소수 선 두께의 반올림을 피한다. Slides의 회전 핸들을 연결 시작점과 분리했다. 갤러리 `#selection-tools`에 상태·50/100/200% 배율 예시를 추가하고 실제 브라우저에 열었다. 갤러리·네 제품 비교 2개, Word 이미지 4개, Slides 크기 조절·회전 1개, Site 모서리 1개로 브라우저 검사 8개가 범위별 통과했다. office-ui·갤러리 타입 검사, Slides 타입 검사(기존 미사용 항목 제외)와 Office 빌드가 통과했다. 다음은 표 전용 핸들·정렬 가이드·크기 표시와 화면 경계의 잘림 검증이다. 전체 선택 도구의 동작 공통화가 완료된 것은 아니다.

2026-09-14 선택 도구 UI 점검 보완: 선택 프레임·크기 조절·회전 핸들·가이드가 제품별 구현에 분산되어 있고 공통 시각 규격이 빠져 있음을 확인했다. [UI 추가 범위](specs/office-ui-gap-audit.md)의 우선순위 0에 추가했다. 다음은 office-ui의 표시 규칙과 office-editor-ui의 상태 연결을 정의하고, Word·Slides·Site의 기존 좌표·조작 로직을 유지하며 실제 화면을 비교하는 단계다. 검색형 선택 목록보다 먼저 진행한다. 이번 기록은 규격 방향 정리이며 공통 선택 도구 구현 완료를 뜻하지 않는다.

2026-09-14 공통 UI 추가 범위 점검: 기본 컴포넌트의 존재와 제품별 사용처를 대조했다. [UI 추가 범위와 우선순위](specs/office-ui-gap-audit.md)에 신규 후보·기존 UI 적용 누락·팀 서비스 이후 범위를 구분했다. 다음 구현은 검색형 선택 목록과 태그를 Note 관계 선택·통합 원본 자료 선택·Site 다중 선택에 연결하는 묶음이다. 이후 파일·미디어 선택, 명령 검색, 장시간 작업 상태를 진행한다. 날짜·공유 UI는 요구와 서비스 계약을 확인한 뒤 확장한다. 이번 항목은 코드·기존 비교 이미지 점검과 계획 정리이며 기능 구현 완료 기록이 아니다.

2026-09-14 네 제품 메뉴·보기 도구: office-ui의 ProductMenu로 단독 앱과 통합 호스트의 제품 이름·화살표·메뉴 동작을 통일했다. Note·Word·Slides·Site의 단독 화면에도 기존 문서 작업을 연결했다. 통합 호스트는 자료함·연결한 자료를 유지한다. Site의 작성 모드·와이어프레임·미리보기·배율을 공통 헤더의 보기 영역으로 옮겼다. 미리보기 버튼도 공통 Button을 사용한다. 관리 화면에서는 보기 도구를 숨긴다. 갤러리 작업 공간에 네 제품 메뉴 비교 예시를 추가했다. 공통 패널·네 제품 화면 비교 5개, 메뉴·Site 보기 도구 2개, 단독 제품 메뉴 4개로 브라우저 검사 11개가 통과했다. office-ui·갤러리 타입 검사와 Office 빌드가 통과했다. 390px·560px·1440px에서 Site 헤더 배치와 배율 입력을 확인했다. 다음은 실제 제품의 속성 패널에 남은 자체 입력·선택 컨트롤과 팝업 간격을 공통 기준에 맞추는 작업이다.

2026-09-14 Word 제품 메뉴·패널: 단독 Word 헤더의 정적 로고를 공통 MenuBar로 교체하고 문서 보관함·문서 작업을 연결했다. 보관함은 기존 자동 저장 완료 후 열린다. EditorHeader의 fallbackNavigation은 단독 호스트가 사용하며, 통합 Office의 ProductNavigation을 대체하지 않는다. Word 개요·댓글을 AdaptiveWorkspace·WorkspaceSidePanel에 연결했다. 960px 미만에서는 개요·댓글을 하나씩 문서 위에 열고, 넓은 화면에서는 기존 열림 상태를 복원한다. 공통 패널에 호스트 제어 상태와 표시 이름을 추가해 메뉴·리본·패널 버튼이 같은 열림 상태를 사용한다. 댓글 초안과 본문 선택은 패널 닫기·교체·화면 크기 변경 후에도 유지된다. 즉시 반영되는 TextField의 Escape는 상위 패널로 전달하며, 확정형 입력 취소와 조합 입력 처리는 유지한다. 공통 패널·필드·모달·Word 초안·네 제품 비교 15개, 단독 로고 메뉴 1개, Word 작은 화면·배율 1개 검사가 범위별 통과했다. Word 타입 검사(기존 미사용 항목 제외)와 Office 빌드 통과. 실제 Word 브라우저에 로고 메뉴를 열어 확인했다. 다음은 네 제품의 단독/통합 호스트 메뉴 연결과 실제 화면의 남은 패널·팝업 차이를 점검하는 작업이다. 댓글 초안의 새로고침 복구와 서버 협업은 이번 범위가 아니다.

2026-09-14 Word 배율·작은 화면: 공통 EditorHeader의 보기 영역에 ZoomControl을 상시 배치했다. 상세 리본에서는 중복 배율 도구를 표시하지 않는다. 문서 작업 버튼의 줄바꿈을 제거했다. ZoomFrame은 문서의 고유 크기를 측정하고 좌측 상단을 기준으로 그려, 축소 시 종이가 오른쪽으로 밀리던 문제를 수정했다. 100%에서도 프레임이 실제 문서 크기를 사용한다. 눈금자는 전달받은 문서 영역을 기준으로 측정하며 영역 크기 변경과 가로 스크롤을 따른다. 390px·560px·1440px에서 용지 양쪽 경계, 가로 스크롤 끝, 줄바꿈과 모델 선택 보존을 확인했다. 새 작은 화면·네 제품 비교 2개, 기존 배율 6개·수식/객체 5개·인쇄 6개 브라우저 검사가 범위별 통과했다. Word 타입 검사는 기존 미사용 항목 검사를 제외한 범위에서 통과했고 Office 빌드가 통과했다. 실제 브라우저의 Word에서도 너비 맞춤을 확인했다. 다음은 Word 개요·댓글 패널의 작은 화면 전환과 초안·선택 보존이다. 화면 크기에 따른 배율 자동 변경과 Word 패널 공통화는 이번 범위에 포함하지 않았다.

2026-09-14 Note 작업 공간: 보관함을 문서 위에 쌓던 작은 화면 배치를 공통 AdaptiveWorkspace·WorkspaceSidePanel로 교체했다. panelSides로 탐색 버튼만 표시하고, locationKey가 바뀌면 패널을 닫는다. 960px 미만에서는 보관함을 문서 위에 열고 문서 폭은 유지한다. 검색어는 패널 전환·너비 변경·검색 목록 내 페이지 이동에서 유지한다. 참조 링크 등 외부 이동은 기존 검색 초기화를 유지한다. 페이지를 바꾸면 숨길 패널에서 문서 영역으로 포커스를 옮긴다. 닫히는 공통 툴팁이 Escape를 소비하지 않도록 종료 애니메이션을 제거했다. 열기 애니메이션과 모달·Drawer 모션은 유지한다. 패널 4개·모달 5개·문맥 도구 3개 브라우저 검사가 범위별 통과했다. 기존 탐색·네 제품 비교 5개도 통과했다. office-ui 타입 검사와 Office 빌드 통과. Note 앱 전체 타입 검사는 기존 markdown-it 선언 누락 1건이 남아 있다. 390px에서 문서 입력·이동·본문 보존·검색 복원, 1440px에서 패널 복원을 확인했다. 기존 브라우저의 Note에도 적용했다. 다음은 Word의 작은 화면 문서 배율·스크롤·도구 배치 점검이다.

2026-09-14 작은 화면 도구 밀도: 공통 EditorHeader에서 메뉴와 문서 작업을 묶었다. 700px 이하에서는 문서 정보·명령·보기 도구를 정해진 줄에 배치하며 컨트롤 내부 줄바꿈을 막는다. 넘치는 메뉴와 작업은 가로 이동으로 접근한다. Slides의 눈금 간격은 공통 scaledAxisStep으로 확대율에 맞춰 1·2·5 계열로 조정한다. 단위와 원점은 유지한다. 접힌 타임라인은 재생 도구를 유지하고 시간축 확대·클릭 순서·성능 안내를 접는다. 펼치면 해당 도구를 다시 사용할 수 있다. 단위 검사 13개와 관련 브라우저 검사 5개가 범위별 통과했다. office-ui 타입 검사와 Office 빌드 통과. 390px·560px에서 헤더 124px 이하, 발표 버튼 전체 표시, 25% 눈금 간격, 타임라인 확대 실행을 확인했다. 1440px에서는 한 줄 헤더를 유지한다. 기존 Slides 문서에도 적용해 확인했다. 다음은 Note의 작은 화면 탐색 패널과 문서 영역 배치다.

2026-09-14 Slides 작업 공간: 공통 AdaptiveWorkspace·WorkspaceSidePanel을 적용했다. 960px 미만에서 탐색·속성을 하나씩 열며 캔버스 폭을 유지한다. 슬라이드·레이어와 컴포넌트 목록을 탐색 영역에 묶었다. 패널을 전환하거나 넓은 화면으로 돌아가도 객체 선택, 너비 값, 레이어 탭을 유지한다. 발표 중에는 패널 래퍼도 숨겨 빈 여백을 없앴다. 캔버스의 캡처 단계 Escape가 열린 패널의 키를 가로채지 않도록 수정했다. 공통·Site·Slides 작업 공간 검사 3개와 기존 도구 모음·네 제품 비교 3개가 통과했다. Slides 타입 검사(기존 미사용 항목 제외)와 Office 빌드 통과. 390px·560px·1440px 화면을 확인했다. 다음은 작은 화면에서 여러 줄로 늘어나는 앱 헤더, 확대율에 따라 겹치는 눈금자 숫자, 타임라인 도구 밀도를 정리하는 단계다. Note 패널 적용도 후속 범위다.

2026-09-14 전체 화면 비교·Site 작업 공간: 네 제품의 1440px 밝은·어두운 화면과 1024px 도구 배치를 다시 확인했다. Site의 560px 화면에서 좌우 패널이 캔버스를 밀어내는 문제를 공통 AdaptiveWorkspace·WorkspaceSidePanel로 수정했다. 960px 미만에서는 패널을 기본 접고 탐색·속성 중 하나만 덧씌워 연다. 캔버스 클릭 또는 입력칸 밖 Escape로 닫고, 넓은 화면에서는 두 패널을 다시 나란히 표시한다. 패널은 제거하지 않아 입력값과 탐색 탭을 유지한다. 좁은 화면에서는 패널 폭 조절 손잡이를 숨긴다. 갤러리 `/design-system/index.html#workspace`에서 확인한다. 새 브라우저 2개, 기존 네 제품 비교 1개와 도구 찾기 2개가 통과했다. office-ui·갤러리 타입 검사 및 Office 빌드 통과. Site 앱 전체 타입 검사는 작업 범위 밖 undefined 인수 2건과 markdown-it 선언 누락 1건으로 통과하지 못했다. 다음은 Slides의 좁은 작업 공간에도 같은 패널 규칙을 연결하는 단계다. 모든 제품의 모바일 작성 완료를 뜻하지 않는다.

2026-09-14 좁은 도구 모음: 공통 Toolbar의 overflow 옵션과 RibbonToolbar compact에 고정된 도구 찾기 버튼을 연결했다. 실제 도구 폭이 가용 너비를 넘을 때만 표시한다. 메뉴는 기존 그룹·컨트롤로 스크롤하고 포커스를 이동하며 명령이나 입력을 복제하지 않는다. 키보드 포커스가 이동하면 해당 도구를 화면 안으로 가져온다. Word·Slides·Site에 적용했다. FloatingSurface는 배치가 완료된 뒤 메뉴 포커스를 설정하도록 수정했다. 갤러리 `/design-system/index.html#overflow`에서 확인한다. 새 브라우저 2개, 네 제품 비교 1개, 기존 모달·문맥 도구 8개가 범위별 통과했다. Word의 선택 글자에 굵게 적용, Slides 740px·Site 560px 도구 이동, 390px 갤러리와 두 테마를 확인했다. office-ui·갤러리 타입 검사와 Office 빌드 통과. 메뉴에서 명령을 직접 실행하는 복제 메뉴가 아니라 원래 도구의 위치로 이동하는 방식이다. 전체 제품의 모바일 편집 레이아웃 완료는 아니다. 다음은 네 제품 전체 화면을 같은 크기·테마로 비교하고 남은 간격·구분선·표면 차이를 정리하는 단계다.

2026-09-14 데이터 표 UI: office-ui에 DataTable·DataTableRow·DataTableCell 표시 컴포넌트를 추가하고 Note 데이터베이스 테이블에 적용했다. 행 선택 배경, 사방 셀 포커스, 입력 표면, 숫자 정렬, 계산·오류 상태와 구분선을 통일했다. 행 선택에 공통 체크박스를 사용하고 전체 선택의 혼합 상태를 표시한다. 계산 셀 방향키 이동과 값 변경 없이 Enter로 편집을 끝내는 경로를 수정했다. 일괄 도구의 선택 상자 폭도 제한했다. 갤러리 `/design-system/index.html#data-table`에서 확인한다. 새 브라우저 2개, 네 제품 비교 1개, 기존 Note 일괄·고급 일괄·범위 붙여넣기 3개가 통과했다. office-ui·갤러리 타입 검사와 Office 빌드 통과. Note 타입 검사는 기존 미사용 항목 검사를 제외했다. 공통 계층은 표시만 담당하며 데이터·실행 취소·저장은 제품이 담당한다. 범위 드래그 선택·가상 스크롤·전체 키보드 grid 패턴은 이번 범위가 아니다. 다음은 좁은 화면에서 도구 모음의 넘침과 메뉴 접근이다.

2026-09-14 복합 속성 패널: 공통 PropertyGroup의 제목 줄바꿈, 접기와 독립된 초기화 버튼, 고유 본문 ID를 추가했다. PropertyRow의 중첩 label을 제거하고 PropertyToggle·PropertySheet에 혼합 체크 상태를 연결했다. Slides의 서로 다른 회전·불투명도·표시·잠금 값을 기본값으로 잘못 표시하던 경로를 수정했다. 선택 그룹의 초기화는 회전과 불투명도만 변경하며, 잠긴 객체가 있으면 비활성화한다. 실행 취소 한 번으로 복원한다. 갤러리 `/design-system/index.html#properties`에서 확인한다. 새 브라우저 2개, 네 제품 비교 1개, 입력·모달 회귀 9개 통과. office-ui·갤러리 타입 검사와 Office 빌드 통과. Slides 타입 검사는 기존 미사용 항목 검사를 제외했다. 전체 제품의 모든 속성에 초기화를 적용한 것은 아니다. 다음은 데이터 그리드의 셀 상태·선택·편집 UI다.

2026-09-14 툴팁·문맥 도구: 공통 Tip에 280px 최대 너비, 화면 여백 8px, 긴 설명 줄바꿈과 단축키 구분을 적용했다. FloatingSurface 안에서는 Escape가 열린 툴팁을 먼저 닫는다. ContextToolbar는 DOM 선택 범위를 기준으로 닫힘 상태를 유지해, 같은 선택에서 스크롤·resize·selectionchange가 발생해도 다시 열리지 않는다. 중첩 수식 입력 소유자와 일반 입력칸의 선택을 제외하고, 드래그·조합 입력 중에는 도구를 숨긴다. 실제 Note의 드래그 완료·서식 적용을 확인했다. 갤러리 `/design-system/index.html#context`에서 확인한다. 단위 7개, 새 브라우저 3개와 기존 모달·네 제품 비교 6개가 범위별 통과했다. office-ui·갤러리 타입 검사와 Office 빌드 통과. office-editor-ui 타입 검사는 기존 미사용 항목 검사를 제외했다. OS 한글 후보 창과 터치 선택 핸들은 이번 검증 범위가 아니다. 다음은 복합 속성 패널의 그룹 구조·혼합 값·초기화 동작이다.

2026-09-14 트리·레이어: office-ui의 LayerActions와 공통 행 스타일을 Slides·Site에 적용했다. 행 높이 34px, 긴 이름 말줄임, 사방 선택 테두리와 행 도구 표시를 통일했다. 숨김·잠금은 현재 선택을 바꾸지 않는다. Site의 중첩 버튼을 선택·펼치기·행 도구로 분리했다. Slides 키보드 행 선택을 추가하고, 이동 명령을 React 상태 갱신 함수 밖으로 옮겨 드래그당 한 번만 실행한다. Site의 Escape·pointercancel과 목록 밖 드롭 취소를 추가했다. 갤러리 `/design-system/index.html#layers`에서 확인한다. 새 검사 3개, 기존 탐색·네 제품 비교 5개, Site 레이어 14개가 범위별 통과했다. office-ui·갤러리 타입 검사와 Office 빌드 통과. Slides·Site 타입 검사는 기존 미사용 항목 검사를 제외한 범위에서 통과했다. 다음은 공통 툴팁·문맥 도구의 표시 조건과 화면 경계 배치다. 전체 방향키 탐색, 터치 드래그, Slides 그룹 사이 재배치는 이번 마감 범위가 아니다.

2026-09-14 탭·목록·빈 상태: PropertyTabs와 RibbonTabs의 키보드 경로를 통합했다. 방향키·Home·End 이동, 비활성 건너뛰기, 하나의 Tab 진입점, 넘치는 선택 탭의 가로 스크롤을 제공한다. Slides·Site 속성 탭과 본문 패널의 연결도 추가했다. 공통 NavigationItem을 Note 페이지 목록에 적용하고, EmptyState를 Note 검색·보관함, Site 블록 검색, Slides 빈 레이어에 적용했다. Note·Site의 검색 지우기는 목록을 복원하며 현재 문서를 바꾸지 않는다. 갤러리 `/design-system/index.html#navigation`에서 확인한다. 새 브라우저 4개와 기존 네 제품 비교 1개, office-ui·갤러리 타입 검사 및 Office 빌드 통과. 다음은 트리·레이어 목록의 행 도구, 드래그·잠금·숨김 상태와 좁은 패널에서의 동작이다.

2026-09-14 로딩·저장·복구 UI: office-ui에 StatusIndicator와 StatusNotice를 추가했다. office-editor-ui는 문서 저장 결과를 공통 표시 상태로 연결한다. 네 제품의 저장 표시를 맞추고 Word의 복원 재시도, Word·Slides·Site의 복구 초안 바로 열기를 추가했다. 처리 중 재시도 버튼을 비활성화한다. 갤러리 `/design-system/index.html#feedback`에서 반복 실패·성공·충돌 복구를 조작할 수 있다. 실제 Word 저장 실패→재시도→재열기와 Slides 두 창 충돌→별도 자료 복구→최신 원본 보존을 검증했다. 새 상태 검사 4개, 네 제품 비교 1개와 기존 모달 5개가 범위별로 통과했다. office-ui·갤러리 타입 검사 및 Office 빌드 통과. office-editor-ui·Word 기본 타입 검사는 범위 밖 미사용 변수 오류로 실패했으며, office-editor-ui는 미사용 항목 검사만 제외하면 통과한다. 다음은 탭·목록·빈 상태의 공통 표시와 실제 탐색 패널 적용이다. 서버 동기화·오프라인 재연결은 이번 UI 범위가 아니다.

2026-09-14 다이얼로그·Drawer 점검: 공통 제목·본문·하단 버튼의 간격을 맞추고, 긴 본문만 스크롤하도록 수정했다. 작은 화면의 Drawer는 화면 너비를 채운다. 중첩 색상·선택 팝업에서 Escape를 누르면 해당 팝업만 닫히며, 부모 창을 닫으면 처음 실행한 버튼으로 포커스가 돌아간다. 변형된 다이얼로그 좌표가 색상 팝업 위치에 영향을 주던 구조도 제거했다. `/design-system/index.html#modals`에서 확인한다. 새 브라우저 검사 5개와 관련 회귀 6개가 최종 통과했다. 기존 버튼·갤러리 8개도 통과했다. 실제 Slides 테마 색 변경 후 취소, 두 테마, 작은 화면을 검증했다. office-ui·갤러리 타입 검사와 Office 빌드 통과. 조합 검사는 합성 이벤트 범위다. 다음은 로딩·저장 실패·복구 상태다.

제품 목표: **Wonffice(wonffice.com) 하나로 회사 업무를 수행하도록 제품군을 확장한다.** 한 제품의 모든 고급 기능을 마칠 때까지 다음 제품을 기다리지 않는다. 기본 작성·수정·저장·출력 흐름을 검증한 뒤 주력을 옮긴다. 공통 문서 정체성·명령·UI·저장 계약을 유지하며, 제품군 확장 후 통합 업무 흐름을 연결한다. 이는 출시 완료 선언이 아니다.

2026-09-14 색상·메뉴 개별 점검: ColorPicker의 RGBA 렌더러에 HEX를 전달하던 문제와 색상표 선택 후 HEX 표시가 남던 문제를 수정했다. 테마·변수 참조와 표시 색을 분리하고, 불투명도에 공통 NumberField를 적용했다. ColorField의 제목·닫기·투명 배경·화면 경계·내부 스크롤을 정리했다. 실제 Slides에서 label의 클릭 재전달로 팝업이 다시 열리던 문제도 수정했다. Menu의 실제 포커스 이동, Home/End, 비활성 건너뛰기, 긴 항목 줄바꿈과 스크롤을 추가했다. `/design-system/index.html#colors`에서 확인한다. 브라우저 18개 범위, 갤러리·office-ui 타입 검사와 Office 빌드 검증. 다음은 다이얼로그·Drawer 구조와 중첩 팝업의 닫기 동작이며, 그다음은 로딩·저장 실패·복구 상태다.

2026-09-14 입력·선택 개별 점검: TextField의 확정값 표시, NumberField의 표시 정밀도 보존·직접 입력 범위 제한·빈 값 복원·드래그 취소를 정리했다. ChoiceSelect는 긴 이름 줄바꿈, 제한된 목록 높이, 오류 설명 연결을 제공한다. `/design-system/index.html#fields`에 조작 가능한 예시를 추가했다. 브라우저 13개, 숫자 입력 단위 12개, 갤러리·office-ui 타입 검사, 통합 Office 빌드 통과. 390px 화면과 두 테마를 검증했다. 조합 검사는 이벤트 경계 검증이며 실제 OS 입력기 검증은 남아 있다. 작업 중 잘못 덮어쓴 공통 CSS는 변경 기록에서 복원하고 이전 정상 패키지 빌드와 기준 CSS의 일치를 확인했다. 다음은 색상 선택기와 메뉴·팝오버이다.

2026-09-14 버튼 개별 점검: Button·IconButton·ToolbarToggle·다이얼로그 닫기의 상태 규칙을 통합했다. 이전 단계에서 CONTROL에 포함된 입력칸 표식이 버튼에 적용되던 문제를 FIELD_CONTROL 분리로 수정했다. 강조색 글자 대비, 선택·혼합·hover·active·focus·비활성, 아이콘 정렬과 작은 24px 영역을 정리했다. DialogButton이 기본 type/form/name/value 및 이벤트를 전달하도록 수정했다. `/design-system/index.html#buttons`에 표면별 버튼 비교를 추가했다. 브라우저 9개, 갤러리·office-ui 타입 검사, Office 앱 빌드 통과. 다음 개별 점검은 선택 상자와 숫자·텍스트 입력칸이다.

2026-09-14 공통 컨트롤 적용: 속성 패널의 포괄적인 input 배경 규칙이 체크박스 선택 배경을 덮던 문제를 수정했다. PropertyToggle은 16px 표시/24px 입력 영역과 office-icons 체크를 사용한다. 선택·hover·focus·비활성 상태를 갤러리에 추가했다. 공통 속성 입력칸의 표면·포커스·오류 규칙, ChoiceSelect/Menu의 체크 열·항목 간격을 맞췄다. 갤러리 5개와 실제 네 제품 비교 1개 브라우저 검사 통과. Slides 객체 잠금 전환을 실제 속성 패널에서 검증했다. 갤러리·office-ui 타입 검사와 통합 Office 빌드 통과. 다음은 선택 도구가 많은 좁은 화면의 스크롤·메뉴 접근, 복잡한 색상 속성과 저장 실패·복구 상태 검토이다.

2026-09-14 디자인 시스템 기준안 01: 기존 UI 갤러리를 확장해 `/design-system/index.html`에 통합했다. CSS 토큰 실측표, 컴포넌트 상태, Word·Slides 작업 예시, 밝은·어두운 테마를 제공한다. 헤더·도구 모음·속성 입력 높이와 간격을 공통 토큰으로 정의하고 TextField의 오류 표시·설명 연결을 추가했다. [패키지 디자인 기준](../packages/office-ui/DESIGN_SYSTEM.md). 갤러리 3개와 실제 4개 제품 비교 1개 브라우저 검사, 갤러리 타입 검사, Office 앱 빌드 통과. 다음은 로딩·저장 실패·복구 상태와 복잡한 속성 편집의 실제 제품 검토이다. 디자인 시스템 전체 완료를 의미하지 않는다.

2026-09-14 기본 도구 간소화: Word·Slides·Site를 44px 한 줄 도구로 전환했다. Word는 상세 도구를 열 때만 기존 탭 리본을 표시한다. Slides의 슬라이드·상황별 명령, Site의 배치 명령은 메뉴로 묶었다. Note의 문맥 도구는 유지한다. 범위별 브라우저 검증 15개, office-ui 타입 검사와 통합 Office 앱 빌드 통과. 전체 패키지 빌드는 별도 math-editor-prosemirror 선언 파일 의존 문제로 통과하지 못했다. [최신 UI 규격](specs/office-command-chrome.md).

2026-09-13 리본 공통화: Word·Slides·Site를 `office-ui`의 RibbonToolbar/RibbonGroup으로 통일했다. 그룹 본문 64px, 이름표 24px, 좌우 간격 8px과 구분선·줄바꿈 규칙을 공유한다. Word 탭과 Note 문맥 도구는 유지한다. 브라우저 검증 12개, office-ui 타입 검사, 통합 빌드 통과. 저장소 전체 타입 검사는 범위 밖 오류가 남아 있다. [공통 UI 규격](specs/office-command-chrome.md).

2026-09-13 공통 제품 UI 구조: Wonffice 탐색·제품 제목·문서 메뉴를 52px 공통 헤더 한 줄로 통합했다. 왼쪽 메뉴는 현재 앱 이름(Note/Word/Slides/Site)만 표시하고 자료함과 연결한 자료를 포함한다. Wonffice 이름과 앱 이름의 중복 표시는 제거했다. 별도 탐색 React root와 40px 높이 차감을 제거했다. 제품별 리본·상황별 도구는 헤더 아래에 유지한다. 통합 문서 흐름 11개, 화면·키보드·820px 도구 경계 1개, 호스트 등록 단위 1개와 타입 검사·빌드가 통과했다. [공통 UI 규격과 검증](specs/office-command-chrome.md), [실제 구조 변경 전후 비교](../.dev/artifacts/office-ui/index.html). 고급 속성 행·다이얼로그 정리와 기존 단위 감사 7개는 후속 목록에 유지한다.

2026-09-13 화면 밀도 후속 정리: Note의 페이지 관리·내보내기·템플릿 설정을 필요할 때 여는 공통 창으로 옮겼다. Slides 도구는 작업명이 있는 두 줄 그룹으로 구성했다. 공통 속성 패널은 12px 글씨와 긴 항목명 줄바꿈을 적용했다. Note 관련 35개, Slides 3개, Site 2개, 통합 화면 1개 검증 및 통합 빌드가 통과했다. 기존 비교 탭을 직접 갱신하고 제품별 확대 보기를 추가했다.

1–3단계 마감 증거: [통합 작업 기록](../.dev/plans/office-workspace/brief.md), [통합 구조](specs/office-workspace.md). 로컬 개발 주소는 `http://localhost:5186/`이다.

현재 기준은 이 표와 [제품 단계 전환 기준](specs/product-phase-handoff.md)이다. 아래의 날짜별 기록에서 “next”, “remaining”으로 적힌 내용은 당시 상태이며 최신 작업 순서를 덮어쓰지 않는다.

**남은 구현 범위와 종료 기준:** [Wonffice 실행 범위](specs/wonffice-delivery-scope.md). Slides·Site 기본 제품 마감 → 공통 통합 → 팀 서비스 → 첫 출시 검증을 실행 순서로 둔다. 고급 기능·기술 과제·새 제품은 후속 목록에 유지한다. 과거 미완료 항목은 현재 코드와 대조한 뒤 작업으로 확정한다.

| 순서 | 제품/단계 | 현재 판단 | 다음 완료 기준 |
| --- | --- | --- | --- |
| 1 | Note | 데스크톱 로컬 편집 1차 기능 범위 마감. 회귀·데이터 보호 수정은 지속 | 후속 확장 및 출시 조건은 별도 추적 |
| 2 | 공통 모듈 점검 | 기존 UI·입력·저장 경계를 유지하며 Word 적용에서 재검증 | 중첩 입력 소유권, 선택 보존, 한 번의 undo, 문서 전환 전 저장 |
| 3 | Word — 기본 편집 기준으로 단계 전환 | W6c-8까지 구현·범위별 검증. 회귀·데이터 보호 수정은 지속 | 고급 DOCX, 페이지·검토 확장, 출시 검증은 후속 목록 유지 |
| 4 | Wonffice Slides | S3 작성·다중 선택, S4 디자인·발표 범위별 검증. S5 인쇄/PDF 연결 | [출력 명세](specs/slides-exchange.md)의 제한 유지. 회귀 수정 지속 |
| 5 | Site | T1–T3 작성·CMS·자동 저장·복구·출력 범위 검증. 단위 646 통과 | 서버 게시·폼·도메인은 4–5단계 |
| 6 | **공통 작업 공간 — 1–3단계 마감** | 네 제품 생성·검색·전환·참조·사본·백업/복원. 통합 흐름 11개 및 공통 저장 12개 통과 | 다음은 4단계 계정·팀·서버 저장·권한 계약 |
| 공통 | 통합 서비스 | 별도 미완료 단계 | 전역 문서 ID, 계정·팀·권한, 서버 저장/동기화, 공유·협업 |

### 계획이 정해진 범위와 아직 정해야 할 범위

- **실행 순서와 기본 완료 기준:** Note → Word → Slides → Site. 작성·수정·저장/재열기·출력을 제품별로 검증한 뒤 다음 제품으로 이동한다. Note와 Word의 현재 마감은 로컬 편집 기준이며 출시 완료가 아니다.
- **현재 세부 실행 계획:** Slides S3 작성·객체 편집 → S4 테마·발표 → S5 출력·교환. [Slides 실행 계획](../.dev/plans/slides-product-foundation/brief.md)에 단계별 완료 기준과 검증 결과를 기록한다.
- **후속 설계:** Site 제품 마감 점검, 제품 간 공통 문서 계약, 통합 작업 공간. 기존 구현을 점검한 뒤 작업을 세분화한다.
- **서비스 출시 설계 미완료:** 계정·팀·권한, 서버 저장·복구, 공유·협업, 운영·배포의 세부 요구사항과 출시 검증 기준을 확정해야 한다.
- **최종 제품군 미확정:** “회사 모든 업무”는 제품 비전이다. 네 편집기 이후 어떤 업무와 제품을 지원할지는 아직 전체 명세로 정의하지 않았다. 현재 로드맵을 전체 Office 기능 호환이나 모든 회사 업무의 완료 약속으로 해석하지 않는다.

Slides S3 자유 캔버스: 다른 장의 본문을 클릭하거나 커서를 옮기면 활성 장·레이어·속성·노트·삽입 대상을 동기화한다. 캔버스 보기는 2차원 자유 배치, 제목 드래그, 양방향 이동·확대를 제공한다. 배치 좌표는 발표 순서와 문서 내부 좌표에서 분리해 저장한다. 장 사이 최상위 객체 드래그 이동, 대상 위치 미리보기, 취소, undo/redo와 저장·재열기를 연결했다. 관련 단위 58개·Chromium 16개·빌드 통과. 다음은 장 사이 복사와 여러 장의 객체 동시 선택이다. [점검 및 완료 기준](../.dev/plans/slides-product-foundation/brief.md).

Slides 탐색 패널: 슬라이드/레이어 탭을 하나의 240px 사이드바에 통합했다. 탭 전환 시 캔버스·선택·스크롤 유지, 레이어 탭에서 슬라이드 이동, 공통 객체 아이콘을 적용했다. Chromium 37개·단위 28개·빌드 통과. [실행 기록](../.dev/plans/slides-product-foundation/brief.md).

Slides S3 UI 정리: 선택 항목의 왼쪽 강조선을 네 면 테두리로 교체했다. 눈금자를 편집 뷰포트 위쪽·왼쪽에 고정하고, 스크롤·확대 시 눈금 원점만 슬라이드 좌표를 따르도록 수정했다. 후속 Chromium 39개 통과. 공통 `PropertyPanel`의 comfortable 옵션으로 오른쪽 속성 패널을 개선했다. 관련 Chromium 42개와 확대율/화면 크기 조합 검사, 빌드 통과. 공통 UI의 기존 수식 스타일 감사 2건은 남아 있다. [실행 기록](../.dev/plans/slides-product-foundation/brief.md).

Slides S2: 자동 저장·URL 복원, 최근 자료, 충돌 초안과 새 자료 복구, 실패 재시도, 전환 전 저장 확인을 연결했다. 단위 1,046개·공통 저장 23개·Chromium 51개·빌드 통과. 실제 앱에서 기존 라이브러리 자료에 노트를 입력하고 새로고침 복원을 확인했다. 다음은 S3 작성·객체 편집이다. [실행 기록](../.dev/plans/slides-product-foundation/brief.md).

Slides S1 인수 점검: 단위 1,046개, 핵심 Chromium 42개와 빌드 통과. 라이브러리 읽기 실패 시 원본 유지·오류 표시·재시도를 수정했다. 실제 앱에서 보고 템플릿 제목 입력, 수동 저장, 발표 이동·종료를 확인했다. 다음은 S2 자동 저장·복구다. 전체 TypeScript 기존 오류와 출시 조건은 남아 있다. [Slides 진행 문서](../.dev/plans/slides-product-foundation/brief.md).

Note 마감 점검: 단위332/332, 핵심 브라우저 초기19/20. 블록 변환 시나리오1건은 화면 재로드 중 클릭 시간 초과였으며 별도2회 모두 통과했다. Note 생산 빌드 성공. 전체 브라우저/실기기 인증을 의미하지 않는다. 첨부파일 수명 관리, 모바일/접근성/실제 OS IME, 문서 간·양방향 관계, 더 넓은 DB 수식·교환 충실도, 공유 타입 오류는 남아 있다.

다음 실행 단위는 **Word W5g-4b: 행·열 치수와 그림 자르기**다. W5g-4a의 표·그림 기본 크기·배치 도구는 연결했다. 다음 페이지 구역 나누기와 목차 작성·설정도 연결했다. 연속 구역·구역 병합 등 확장 범위는 남아 있다. 1차 목표는 보고서·제안서를 작성→검토→저장/재열기→출력하는 전체 흐름이다. 기본 DOCX 변환은 고급 요소 보존이 미완료이므로 업무 교환 준비 완료와 구분한다. 세부 마감 기준: [도구 기능표](specs/word-toolbar-capabilities.md), 작업 기록: [Word 진행 문서](../.dev/plans/word-product-foundation/brief.md).

2026-09-09 W5g-4a: 표·그림 전용 리본 탭, 표 너비·정렬·자동 맞춤, 그림 크기·비율 유지·본문 배치 연결. 그림 직접 선택과 공통 키보드 선택 전달/삭제 후 커서도 수정했다. Word595/595, 공통 삭제20/20, 뷰 키보드4/4, 새 작성 브라우저3/3 및 기존 상황별 도구·표 선택·작성16/16, Note 삭제6/6 통과. 생산 빌드 성공. 공유 타입 오류는 남아 있다.

2026-09-09 목차 입력 회귀: 자동 생성 목차를 입력 영역에서 제외했다. 한글 조합 중 기존 목차 제목만 미리 갱신하고, 조합 완료 후 목록과 페이지 번호를 계산한다. 빈 제목에서 목차 안내 영역을 유지한다. 공통 실행 취소에서는 명시적 글자 삭제를 입력 및 다른 삭제와 분리했다. 목차 브라우저5/5, 기존 구역·목차·조합 종료7/7, Note 삭제6/6, Word 단위589/589 및 생산 빌드 통과. Chromium IME 프로토콜 시험이며 실제 OS 입력기 전체 인증은 아니다. 공유 TypeScript 오류는 별도 미완료다.

2026-09-09 Word 구역·목차: 본문 커서에서 다음 페이지 구역을 만들고, 문서 전체/현재 구역 목차를 삽입·설정·제거한다. 제목·쪽 번호는 자동 갱신한다. 구역 undo에서 드러난 저장소 삭제 및 루트 화면 갱신 결함도 수정했다. Word589/589, 저장소830/830, 모델46/46, DOM 보기27/27, 작성 브라우저3/3, Note 작성·붙여넣기8/8 통과. 개요·목차 회귀는 현재 UI에 맞춘 테스트 갱신 후11개 통과·1개 건너뜀. 생산 빌드 성공.

2026-09-09 Word 머리글·바닥글: 삽입 탭/메뉴에서 생성·직접 편집·구역 연결 제거, 첫 페이지/짝수 페이지 구분과 번호 형식/시작 번호/정렬을 제공한다. 기존 내용은 보존하고 번호 중복을 방지한다. 본문 복귀 버튼은 원래 커서 위치를 복원한다. Word 단위583/583 이후 추가 단위5/5, 작성 UI5/5, 기존 페이지/인쇄 포함 브라우저45/46 후 화면 밖 클릭을 수정한 재검사1/1이 통과했다. 생산 빌드 성공. 전체 제품·실기기·DOCX 교환 완료는 아니다.

2026-09-09 Word 클립보드: 홈 리본과 편집 메뉴에 복사·잘라내기·붙여넣기를 연결했다. 복사 실패 시 삭제하지 않는다. 붙여넣기 실패 시 저장한 위치에 일반 텍스트를 넣는 대체 입력 창을 제공한다. 여러 문단 잘라내기는 공통 범위 삭제와 실행 취소를 사용한다. 클립보드 브라우저11/11, Word 단위574/574, Note 회귀8/8과 Word 빌드가 통과했다. 실제 OS 클립보드 권한 조합과 전체 변경 추적 교환은 별도 검증 대상이다.

2026-09-09 Word 글자 서식 복사: 홈 리본과 서식 메뉴에서 원본을 저장하고 대상 드래그 또는 버튼 재실행으로 한 번 적용한다. Esc/취소/문서 재로드 시 모드를 해제한다. 제목에서 상속된 글꼴·크기·강조와 직접 서식을 복사하며, 대상 링크와 검토 기록은 보존한다. 서식 변경과 변경 추적 기록은 한 트랜잭션에 포함한다. Word 단위578/578, 작성 브라우저18/18과 빌드가 통과했다. 문단 정렬·간격, 반복 적용, 스타일 관리와 전체 DOCX 교환은 후속 범위다.

## 이전 변경 기록


2026-09-08 Note math rendering: aligned reading with in-place editing by using full-size top-level fractions while retaining inline document placement. Removed KaTeX's extra base-font scaling on this path. Verified actual fraction/ordinary glyph sizes, edit size, surrounding line placement and absence of the outer editing ring in one focused browser regression.

2026-09-08 Note in-place math: formulas now edit in the document using the rich React editor. Embedded input/composition/selection and DOM mutations are isolated from Note through the shared DOM-view ownership boundary. Note context tools are hidden during math focus; fraction/root/power buttons are removed from host controls. Preview/input/script sizing uses one shared font-size variable. Enter/outside delivery, Escape cancellation, one-step document undo, large-editor handoff and persistence are connected. Focused Note browser14/14 across scoped runs, DOM input regression78/78, standalone math-demo2/2 and math-editor/Note builds passed. Shared TypeScript baseline diagnostics remain. OS IME input was not exercised; composition event boundaries were tested. See [integration contract](specs/note-math-editor.md).

2026-09-08 Note math popup follow-up: replaced the native surface with the same React MathEditor used by the math demo. Rich tools/symbols/templates/suggestion design, keyboard selection wrapping, corrected transformed-dialog portal coordinates and stable dropdown direction are connected. Source/visual tabs preserve history; removed modal size control and use18px preview. Note browser7/7 across scoped runs, math-demo React2/2 and package/Note builds passed. See [integration contract](specs/note-math-editor.md).

2026-09-08 Note math-editor integration: existing LaTeX opens in a popup through the package parser; changed source loads through `MathSession.importLatex`. Draft history survives visual/source switches and unsupported syntax stays intact. Blank formulas open visual editing directly; existing formulas support double-click/Enter plus contextual size/alignment controls. Inline and block editors share basic/expanded structure tools and a persistent Apply/Cancel footer. Note browser lifecycle/caret/layout checks6/6 across focused runs, Note math/exchange/input units36/36, shared preview units3/3 and package/Note builds passed. Shared TypeScript baseline diagnostics remain; no diagnostics in the changed math UI files. See [integration contract](specs/note-math-editor.md).



2026-09-08 Word W5c: product chrome now separates title/file actions, menus and Home/Insert/Review/View tool groups. New documents start blank; `?sample` and `?lab` retain the development fixture, and browser fixture checks now request it explicitly. Existing saved documents retain their headers, footers and notes. Shared office-ui controls/dialogs remain the UI foundation. Production build and 16 focused browser checks passed (editing/save, math dialog, library, DOCX, metadata, contextual tools); full 410-test browser suite not rerun.
2026-09-08 Word W5d: repaired the blank-document formatting path. Word now persists missing built-in styles/settings on load without overriding imported definitions; legacy unstyled headings recover their named style. Heading 1–6 and Body commands apply semantic type plus style to every selected paragraph. Enter after a heading uses its next style. Fixed temporary-alias attribute undo, new-paragraph ID stability on redo, and stale comment-pane document identity. Chromium functional audit57/57 passed (plus final heading-level checks3/3); Word unit suite571/571 passed, model48/48 and shared paragraph/heading10/10 passed; production build passed. Full browser suite and existing shared TypeScript diagnostics remain outside this completion claim. See W5d in the delivery brief.

2026-09-08 shared command UI: Word/Slides/Site/Note now use one office-ui menu/toolbar geometry, palette and pressed-hover treatment. Removed Slides/Note root overrides, added an explicit inline Toolbar variant for Site, and moved Note page navigation/file actions into File/Edit/View menus. Note retains contextual formatting. Four-product light/dark/820px browser comparison2/2, Word command UI28/28, Slides menu/context11/11 and theme/control12/12, Site chrome2/2, Note navigation/editing21/21 and four production builds passed. office-ui unit115/117: the two remaining failures concern the independent math-editor style-door inventory/import audit. [Design ownership and verification](specs/office-command-chrome.md).

2026-09-08 Word icon alignment: collapsed outline/comments controls now share top-aligned 30px IconButtons with 16px icons and shared tooltips. Word ribbon dividers wrap with their control group through the reusable `ToolbarGroup separated` API; font choices remain together. Four-tab 1280px/820px geometry and light/dark pane interaction checks2/2, existing menu/toolbar/context/heading checks32/32 and Word production build passed. This completes the scoped chrome alignment check, not the remaining Word product roadmap.

2026-09-08 Word W5e ribbon: Home/Insert/Layout/Review/View now use shared named ribbon groups, labeled actions, style previews and keyboard tab navigation. Menus expose insertion/review, settings launch from the ribbon, table dimensions are configurable, and tracking/pane states remain visible. Word browser43/43 across the scoped runs, four-product chrome2/2, command/menu units46/46 and Word build passed. Existing whole-app TypeScript diagnostics remain; modified source files have no diagnostics in that check. Full Word capability and W6 release gates remain open.

2026-09-08 Word W5f authoring coverage: connected clear formatting, Replace entry/focus, selected-text link edit/remove, local picture upload/alt text, footnote/endnote content forms and anchored comment creation. Menu/ribbon availability share explicit payload contracts; related shortcuts open forms. Find/replace now reads the current root after document replacement. Browser authoring6 plus regression30 passed across scoped runs; command/menu contract tests44 passed and Word build passed. Full toolbar coverage remains open; [capability inventory and remaining work](specs/word-toolbar-capabilities.md) includes clipboard, page furniture, TOC and contextual tabs, plus the observed rapid keyboard-selection synchronization gap.

## Active product delivery

2026-09-08 Word W5b: basic DOCX import opens a new document after saving the current one. Word now uses math-editor for popup structural editing while retaining inline equation rendering. Apply/cancel/undo and persistence are connected; unsupported conversions preserve the original. Word567/567 and math-editor91/91 unit tests pass; DOCX and math browser lifecycles4/4 passed. Advanced DOCX math/image/style fidelity and broader math structure support remain open. Details: [Word delivery brief](../.dev/plans/word-product-foundation/brief.md).

2026-09-08 Word W5a: basic DOCX export is available with a pre-download fidelity report. Text, basic formatting, horizontal table merges and section page settings are covered; DOCX import and advanced fidelity remain open. Converter tests4/4, Chromium download1/1, full Word suite561/561 and build passed; macOS textutil reads the exported sample. W4 page/print audit47/47 passed. See the Word delivery brief for scope limits.

2026-09-08 Word W3 audit:557 unit tests pass; corrected14 coordinate-driven Korean/Enter scenarios pass, plus15 existing writing/mark/table scenarios and a new end-to-end composition/paste/table/save/reload check. Page setup and print verification follows under W4. Automated IME events are not a real-device IME certification.

Word W2: stable document IDs, automatic local saving, revision-checked writes and separate conflict drafts are implemented. Browser verification covers reload, two-tab conflict, restore-as-new and failed-save retry. Real-time collaboration and cloud sync remain outside this local persistence milestone.

2026-09-07 Word phase started: [Word product foundation](../.dev/plans/word-product-foundation/brief.md). First delivery connects the existing local document library to visible save-copy and safe-open actions. Next gates cover stable identity/autosave/recovery, writing correctness, pagination/print and DOCX fidelity. Existing Word feature breadth is not a completion claim.

2026-09-07 N34: Note now supports independent 2–4-column prose layouts, shared width and block-move controls, content-preserving reduction/flattening, undo and responsive stacking. Column layout exchange currently requires Note JSON. Shared implementation lives in office-text and office-editor-ui.

2026-09-07 completion audit (N33): Note unit tests330/330, Note test type debt reduced to0, production build passed. Desktop editing/recovery and 500-paragraph persistence were audited in Chromium/WebKit. This is a local-editing baseline; attachment/mobile workflows, advanced relation/formula gaps and service infrastructure remain open. Detailed initial failures and targeted verification are recorded in the delivery brief.

2026-09-07 interaction update: the first screen of the left block menu now exposes paragraph/heading alignment. Inline equations keep editable positions on both sides, including imported notes. Shared equation rendering paints a dragged selection as one atom instead of highlighting individual KaTeX layout spans. See N32 in the delivery brief for verification.

The current product order is **Note → shared-module review → Word → Slides → Site**, followed by additional products within one
office service. Note targets Notion-level writing, organization and data workflows. Package agents
work against product acceptance criteria and integrate continuously into a running preview; a
finished package alone is not a finished product. Historical rules that only kept Note small may
be revised when the new product direction requires it.

Current work and ownership: [Slides product foundation](../.dev/plans/slides-product-foundation/brief.md). Note의 마감 범위와 후속 항목은 [단계 전환 기준](specs/product-phase-handoff.md)을 따른다.

Product architecture recommendation: [one workspace with specialized editors](specs/office-workspace.md).
The suite should share account/team, document discovery, identity, access, sharing and recovery while
Note, Site, Word and Slides retain their own editing models. Current apps share packages but still
use separate product libraries; the integrated service is not implemented. Before combining their
navigation, validate a global document identity and an open/flush/save/close adapter contract in Note
and a second product. Product-local page IDs and workspace document IDs are different namespaces.

**2026-09-07 active scope:** Note now includes contextual prose/table editing, page organization
and typed database workflows with table, board, gallery and calendar layouts. Database items open as nonmodal shared `SidePeek`
pages with no scrim: large title, click-to-edit properties and an actual Note block body. Contextual
field settings, previous/next, duplicate/delete, width resizing and expand are integrated. The current
browser scenario passes item/property/body editing and reload persistence. The linked work record
holds verification details. Older counts and tiny-demo constraints below are historical measurements,
not limits on the product's scope. Same-document relations, rollups, safe formulas and named views
are now integrated into the table and item-page flows. Shared dataset calculation and saved-view
normalization also feed Site HTML output. Page references (`[[`) and backlinks now connect workspace
pages and reopen referenced database item bodies; stable page IDs survive file transfer and copying.
The current batch adds saved gallery/card settings, calendar dates and rescheduling, nested AND/OR
filters and ordered multi-property sorts. Browser editing, date drag, independent view settings and
reload persistence are verified. Local revision checks prevent stale tabs from overwriting newer
documents; conflicting work is retained as a recoverable draft. Shared paste supports single-paragraph
replacement across prose containers and applies an explicit caret even before model selection is ready.
Final Note browser integration passes 34/34 and Note unit tests pass 257/257. Site disclosure focus and
Slides destination identity were also repaired; the active work record contains the evidence and limits.

The next delivery adds whole-library backup/restore with preview, collision-safe copies, remapped
internal references and atomic insertion. Hierarchy, favorites, trash, unreadable original bytes and
recovery drafts travel together. Shared UI now supplies quieter controls, consistent icons and reduced-motion
aware surface transitions. Site JSON/HTML/ZIP exports flush nested Note bodies and await host writes.
Current Note integration passes 46 runner scenarios (39 browser + 7 pure archive checks), Note package
258/258 and office-ui 117/117. Additional transaction/race checks are recorded in the active work record.

The latest delivery completes current-body find and a live heading outline. An urgent input review
also fixed Note's missing whitespace-preservation root style and stale typing carets after page-reference
picker commands. `office-text` now supplies the text-flow setting for Note, Word's document renderer
and Site page CSS. Standalone Note and embedded Site use the same literal-space browser contract.
The execution brief records browser engines, regression evidence and remaining type debt.
The selection toolbar now also offers inline code, superscript/subscript, text/background color palettes
and clear formatting. Shared slash rows put secondary descriptions beneath their labels to prevent clipping.
N24 also fixes bare-fence Enter conversion in visually formatted/split-run paragraphs.
N24 adds a separate named-color popover with independent text/background reset, Markdown typing
shortcuts, @ page mentions, and paragraph/heading 1–6 conversion. Superscript, subscript and
format clearing live in the additional-formatting menu. Note unit suite: 292 passing; input/color
browser regression: 10 passing; heading/mention and existing page-reference coverage: 9 passing.

Next Note delivery priorities, in order:

1. Multi-block selection and operations — native range selection now exposes ordered batch
   move/duplicate/delete with atomic undo. Shift-click grip ranges and ordered group dragging are
   now implemented, with rich HTML/text block copy. Database clipboard transfer and noncontiguous
   block selection remain outside this delivery.
2. Markdown, HTML and CSV exchange — basic file import/export now available with explicit
   refusal of unsupported exports. Document CSV targets a single unmerged table; broader
   block/format fidelity remains. Database CSV now appends validated rows by exact field names
   with atomic undo and exports all current values; relation/computed-field import and item bodies
   require the full Note format.
3. Database keyboard navigation and bulk operations — table display cells support arrow navigation;
   visible-row selection, stable-ID bulk property updates and deletion are implemented with atomic
   undo. Relation and multi-select batch replace/add/remove are now supported, with formula/rollup
   configuration entry points and recalculation checks. Advanced editing and persistence pass
   Chromium/WebKit regression coverage. TSV cell-range paste now targets visible rows/columns
   with atomic validation and undo; overflow requires adding rows/columns first.
4. Body math: inline/block LaTeX insertion, preview, editing and persistence are implemented
   through office-text commands and office-editor-ui. Dollar input and Markdown math exchange
   now work; direct context controls adjust math size/alignment. Cross-run inline replacement
   and HTML math exchange remain. Paragraph alignment settings and input-only slash activation
   are implemented.
5. Cross-document and reciprocal database relations.
6. Attachment management.
7. Mobile workspace interaction and layout.

Parallel platform work: define global document identities and lifecycle adapters, continue migration
of remaining product-owned basic controls into office-ui, and connect Word's existing library API
to autosave, reload restoration and unsaved-work protection. Site's final-input export issue is fixed.

Broader formula coverage remains a database capability gap. Accounts, server sync, permissions,
collaboration and service launch are a separate, unimplemented common-service milestone; local
storage, conflict recovery and file transfer do not establish that service.

One document engine, several products. Three questions decide whether that is a
plan or a wish, and each is answered from what the repository actually contains
rather than from what it could contain. Every claim below has a measurement behind it; where
something is a guess it says so.

Kept beside [BACKLOG.md](./BACKLOG.md), which holds the next thing to do, and
[RETROSPECTIVE.md](./RETROSPECTIVE.md), which holds what building the first
product taught. This holds the reason there is a next thing.
[TECHNICAL-ROADMAP.md](./TECHNICAL-ROADMAP.md) holds the layer-by-layer version of the same thing.

---

## 한 눈에 — 어디로 가고, 무엇이 남았나 (2026-09-04)

**하나의 문서 엔진 위에 여러 제품.** 그게 계획인지 소원인지를 판단하는 근거는 지금 **다섯이 서 있다**는
것이다. 처음 이 문서가 적힐 때는 하나였다.

```
                     [ 어휘·부품 ]  office-text · office-canvas · office-controls · office-ui · office-icons
                            ↑
[ 바탕 ]  shared · dsl · schema  →  [ 문서 ]  datastore · model  →  [ 편집 ]  editor-core · editor-view-* · extensions
                            ↓
                     [ 제품 ]  word · slides · site · note        →  [ 앱 ]  각자의 셸
                            ↓
                     [ 서비스 ]  문서를 지키는 층은 섰다 — 계정·권한·협업은 아직 0
```

### 공통 스키마 — 사슬을 재봤다 (2026-09-05)

*"우리는 공통 스키마를 기반으로 word, slide, note, site 를 만들고 있는 중"* — 그게 실제로 하나인지
읽어서 확인했다. **넷 다 `getOfficeSchemaDefinition()` 위에 선다:**

```
standard-schema                      ← document · paragraph · inline-text · marks. group 을 선언하는 곳
      ↓  getStandardSchemaDefinition()
office-schema                        ← surface 로 뿌리를 바꾸고, 표준 노드를 하나하나 taken/leaves-behind 로 정산
      ↓  getOfficeSchemaDefinition()
   ┌──┴───────────┬──────────────┬───────────────┐
word-schema   slides-schema   site-schema   note-schema
  +문서          +캔버스         +페이지·데이터    +NOTE_CONTENT (노드 3개)
```

그리고 `office-schema` 가 표준 노드를 **하나도 빠뜨리지 않게 강제한다**: 어느 목록에도 없는 이름이
있으면 `getOfficeSchemaDefinition()` 이 던진다 — *"office schema neither takes nor explains a
standard node"*. 표준 스키마에 노드를 더하면 **office 가 그것을 취하는지 아닌지 말할 때까지 실패**
한다. 조용히 사라지던 것을 그 검사가 막았다.

**그래서 §2 의 답이 근거를 갖는다.** 스키마가 담는다는 것은 추론이 아니라, 넷이 같은 함수 위에 서
있고 그 함수가 정산을 강제한다는 사실이다.

| 질문 | 답 | 근거 |
|---|---|---|
| 코어를 라이브러리로 열 수 있나 | **예** | 순환 0, DAG, 층 0~8. 그리고 **넷이 같은 코어 위에 섰다** |
| 스키마 하나가 여러 제품을 담나 | **예, 스키마는** | 노트가 **노드 3개**로 선다. 렌더러와 입력은 담지 않는다 |
| 각자 프로그램으로 낼 수 있나 | **예, 아직 셸이 앱에 있다** | 노트만 통과(앱 257줄). 나머지 셋은 35,927줄 |

**남은 큰 것 넷, 값이 다르다:**

1. **셸을 제품으로** — 35,927줄이 앱에 있다. 노트가 이미 통과했으니 방법은 증명됐고 크기가 남았다.
2. **서비스 층** — **문서를 지키는 절반은 2026-09-06 에 섰다.** 그날 아침에는 덱만 저장할 수
   있었고(818줄, 혼자 다 만들었다) Word 와 사이트는 **0줄**이어서 새로고침에 독자의 작업이
   사라졌다. 덱의 219줄짜리 파일 코드를 읽으니 덱의 것은 **넷뿐**이었다 — 자기 이름, 독자가
   부르는 낱말, 판 번호, 제목이 어디 있는가. 나머지는 `@barocss/shared`(파일 192 · 보관 158)와
   `@barocss/office-editor-ui`(세 몸짓 179)로 내려갔고, 둘째와 셋째 제품이 각각 **넉 줄**로
   그것을 얻었다. `every-product-can-keep-a-document` 가 이 상태를 붙잡는다 — 노트는 호스트
   문서 안에 살므로 이유와 함께 거절로 적혀 있다.

   남은 절반이 큰 쪽이다: **계정·권한·공유·협업**. **B2B 는 대부분 그 층이다.**
3. **Excel** — 다음 진짜 시험. 선택 종류 `cell` 이 표에서만이 아니라 그리드에서도 성립하는지, 그리고
   연산 하네스가 그리드를 가진 스키마에서 버티는지.
4. **캔버스(Figma)** — 벽은 렌더러가 아니라 **글자 셰이핑**이다. 글자를 DOM 오버레이로 올리는 시제품이
   며칠, 셰이핑 엔진은 달. **시제품으로 먼저 결정한다.**

**그리고 매 회차 반복해서 찾는 결함의 모양이 하나다 — *있는데 못 닿는다.*** 이번 회차만 해도:
`installCellSelection` 379줄이 Word 안에 갇혀 넷 중 둘만 닿았고, `editor-core` 의 `NoSelection` 이
선언된 채 두 파일이 그것을 다시 발명했고, 죽은 `ModelNodeSelection` 을 향해 두 뷰 층이 읽고 있었다.
**그래서 새 기능보다 먼저 묻는 질문이 늘 같다: 이미 있는데 닿지 못하는 것은 무엇인가.**

---

### React 갈래는 얼려 둔다 — 재고 정한 것 (2026-09-05)

*"editor-react 를 계속 개선하는 게 맞나, 아니면 제품 넷을 먼저 맞추는 게 맞나"* 를 재서 답했다.

**React 갈래는 끝에 제품이 없는 닫힌 고리다:**

```
renderer-react → editor-view-react → apps/editor-react
```

이 셋이 서로만 쓴다(그리고 `apps/docs-site` 하나). **제품 넷은 전부 `editor-view-dom`** 이다.

| | src | test() | 상태 |
|---|---|---|---|
| slide | 18,971줄 | 397 | 초록 |
| site | 11,409줄 | 283 | 초록 |
| word | 5,547줄 | 354 | 초록 |
| note | 257줄 | 22 | 초록 |
| **editor-react** | 666줄 | 14 | **3 실패 / 11** |

그 3 실패는 한 회차에만 그런 것이 아니라 **다섯 회차 전부 같은 셋**이었다 — IME 조합 둘과
`insertParagraph` 하나. **가장 기본적인 글자 동작 둘이 계속 빨갛고 아무 제품도 거기 안 걸려 있다.**
그리고 React 입력 층은 얇다: 931줄 대 DOM 2,015줄이고, 특히 **`insideLockedRegion` 이 없다** —
그 파일 자신이 *"키보드에만 버티는 잠금은 잠금이 아니다"* 라고 적어 둔 바로 그것이다.

**그래도 공짜였던 것은 아니다.** 이번 회차에 두 판을 대본 것이 결함 **다섯**을 찾았고 그 중 **넷이
제품 경로에 있었다.** 즉 React 의 값은 *제품* 이 아니라 **거울** 이었다. 그런데 자리 층을 `shared`
로 합쳤으므로 **그 거울은 이제 쓴 것**이다 — 그 층에서는 갈라질 수가 없다.

**정한 것 (사용자 결정):** *"일단 react 쪽은 보지 말고, 제품을 먼저 계속 진행하자. 제품을 더
만들어야 할 수도 있으니 제품이 안정화 되어야 해."*

그래서 이 절의 기준은 *React 를 어떻게 할까* 가 아니라 **제품 다섯째가 수술 없이 설 수 있나** 다.

1. `editor-view-react` 는 **컴파일과 단위 검사만 유지**하고 기능 동등성은 쫓지 않는다. 남은 값은
   *엔진이 DOM 에 묶이지 않았다* 는 컴파일 타임 증거뿐이고, 그건 싸게 유지되지만 키우면 비싸다.
2. **제품 넷이 먼저다.** 셸이 아직 앱에 있고(그날 35,927줄, 그 뒤로 네 앱 모두 이주가 끝나
   **8,591줄**), 서비스 층은 문서를 지키는 절반만 섰다.
3. `apps/editor-react` 의 3 실패는 **고치지 말고 기록한다** — 초록/빨강을 읽을 때의 잡음이다.

**접지 않고 얼려 두는 이유:** 접으면 `renderer-react` 도 같이 죽고, §1 의 *host 가 여럿* 이라는
주장이 근거를 잃는다. 캔버스(Figma) 시제품이 세 번째 host 후보이고, 그때 두 번째 host 가 있었던
자리가 값을 낸다.

---

## Where this actually stands

*Re-measured 2026-09-04. The table below was written when there was one product; there are four.*

**29개 패키지, 소스 175,315줄, 앱 9개** (2026-09-04 재측정). 크기가 아니라 모양이 중요하다:

| 층 | 패키지 | 무엇을 아나 |
|---|---|---|
| **바탕** | `shared`, `dsl`, `schema` | 위의 아무것도 |
| **문서** | `datastore`, `model` | 스키마 |
| **그리기** | `renderer-dom`, `renderer-react` | DSL |
| **편집** | `editor-core`, `editor-view-dom`, `editor-view-react`, `extensions`, `dom-observer`, `text-analyzer` | 문서와 렌더러 |
| **어휘·부품** | `office-canvas`, `office-text`, `office-icons`, `office-controls`, `office-ui` | 제품을 모른다 |
| **에디터를 아는 UI** | `office-editor-ui` | 에디터를 알고, 제품을 모른다 |
| **제품** | `office-word`, `office-slides`, `office-site`, `office-note` | 전부 |
| **서비스** | `collaboration` (+`-yjs`, `-liveblocks`), `converter`, `devtool`, `conformance` | 문서 |

두 층이 이 표에 없었다. `office-ui`(원시 부품, 에디터를 모름)와 `office-editor-ui`(선언을 읽어 표면으로,
에디터를 알고 제품을 모름) 사이의 구분이 이 저장소에서 가장 늦게 생긴 것이고, 그것이 없는 동안 세 개의
리본이 같은 다섯 단계를 각자 썼다. `docs/SHARED-LAYER.md` 가 그 층에 대한 문서다.

**아직 표대로가 아닌 것 (2026-09-04 재측정):**

- ~~**편집 층에 순환이 셋.**~~ **끝. 순환 0개, DAG, 층 0~8.** 검사가 지킨다
  (`conformance/test/dependency-graph.test.ts`). Phase 1 의 그 절을 보라 — 셋 중 둘이 유령이었다.
- **제품이 제품을 의존하는 변이 셋.** 아홉이었다가 여섯을 옮겼다. 남은 셋:

  | 변 | 무엇 | 판단 |
  |---|---|---|
  | `office-slides → office-word` | `createWordTables`(508줄) | 옮겨야 한다 |
  | `office-site → office-word` | `frameCss` | 옮겨야 한다 |
  | `office-site → office-note` | `NOTE_CONTENT` | **의도한 것** — *무엇을 담을 수 있나* 를 두 번 적지 않으려고 |

- **그리고 앱 층에도 교차가 있다** — 표에 없던 것이다. `apps/slide` 가 `@barocss/office-word` 에서
  `WORD_FONTS`·`WORD_FONT_SIZES`·`step`·`installCellSelection` 을 가져가고, `apps/site` 가
  `@barocss/office-note` 를 가져간다. `installCellSelection` 은 이번에 `office-text` 로 갔고 나머지는
  글꼴 목록과 찾기 도우미 — **Word 것이 아닌 것에 Word 이름이 붙어 있는 쪽**이다.
- **`ModelSelection` 이 셋 선언되어 있고 둘이 서로 다르다.** Phase 1 의 첫 단계가 *"`ModelSelection`
  을 아래로 내린다"* 였고 **하지 않았다** — 순환은 다른 방법으로 풀렸다. 그 미룬 값이 지금 보인다:
  `editor-view-react` 가 자기 것을 **두 번** 선언하고(`types.ts:19`, `selection-handler.ts:9`) 그 둘은
  `cell` 도 `table` 도 표현할 수 없으며 `node` 의 필드 이름도 다르다(`nodeId` 단수 vs `nodeIds`).
  게다가 `editor-core` 에는 `NoSelection` 과 `Selection = ModelSelection | NoSelection` 이 **이미
  있고 아무도 쓰지 않는다** — 두 파일이 그것을 각자 다시 발명했다.

Every package already declares `exports` and types, carries a version, and none
is `private`. Nothing structural stops them being published today.

---

## 1. Can the core be opened as a library?

**Structurally, yes — and closer than the manifests suggest.**

The dependency graph looks cyclic and mostly is not. Measured:

- `editor-core` declares `extensions` and `renderer-dom` as dependencies and
  **imports neither** — zero references in `src`. Two cycles that exist only in
  `package.json`.
- `model` imports from `editor-core` in eleven places. Eight are already
  `import type`. The other three — `SelectionManager` twice, `Editor` once —
  are **used only in type positions** and are missing the `type` keyword.

So the real cycle count is **zero**. What is left is a naming problem:
`ModelSelection` is a document concept that lives in the editing layer, and
`model` reaching up for it is what makes the graph read wrong.

### What "React-like" would mean here

React ships one idea — a component tree reconciled into a host — and lets a host
be a DOM, a canvas, a terminal. This repository already has that shape:

- `dsl` is the template language. Pure functions, no host.
- `renderer-dom` is one host. `renderer-react` is another.
- `schema` says what a document may contain; `datastore` holds it; `model` is
  the operations over it, each with an inverse.

The part that is *not* React-like is that `editor-core` assumes a text editor:
a caret, a selection, contenteditable. A page builder or a spreadsheet wants the
document layer and the renderer and none of that.

### Steps — 2026-09-04 대조

1. **`ModelSelection` 을 아래로.** ⬜ **안 했다, 그리고 그 값이 이제 보인다.** 순환은 다른 방법으로
   풀렸으므로(`import type` 과 devDependency) *그래프를 위해서는* 필요 없었다. 필요한 이유는 다른
   것이었다: 그 타입이 편집 층에 살아서 **다른 층이 자기 것을 다시 선언한다.** 지금 셋이고 둘이 서로
   다르다 — `editor-view-react` 의 두 판은 `cell` 도 `table` 도 표현할 수 없다. 게다가
   `editor-core` 에 `NoSelection` 과 `Selection` 이 이미 있고 **아무도 쓰지 않는다.**
   *끝났음의 기준:* 선언이 하나이고, 검사가 그것을 지킨다.
2. **`editor-core` 를 둘로** — *어떤 제품이든*(명령·트랜잭션·역사·맥락·키바인딩)과 *글자 제품*(캐럿인
   선택, contenteditable 조율). ⬜ **안 했고, 막고 있던 것도 아니었다.** 사이트가 이 분리 없이
   만들어졌다. 그러면 지금의 근거는 무엇인가: **Excel 과 Figma 는 캐럿이 없고 문서 층은 필요하다.**
   사이트는 캐럿을 *안 쓰는* 것으로 됐지만, 그리드와 캔버스는 캐럿의 가정이 틀린 자리다.
   *끝났음의 기준:* 캐럿에 대해 아무것도 import 하지 않고 명령과 역사를 쓰는 패키지가 하나 있다.
3. ~~**Word 가 아닌 예제 하나.**~~ ✅ **넷이다.** 이 단계가 적힐 때 제품이 하나였다. 지금
   `office-slides`·`office-site`·`office-note` 가 같은 코어 위에 서 있고, 노트는 **노드 3개**로 선다.
   *그리고 그것이 이 로드맵의 가장 큰 검증이다* — 한 사용자의 가정이 박혀 있었다면 셋이 못 섰다.
4. **패키지별 안정성 약속.** ⬜ `dsl` 과 `schema` 가 남이 기대는 것이고, 무엇이 바뀌지 않는지를
   말해야 한다. Phase 4.

**그래서 §1 의 답은 여전히 예이고, 근거가 추론에서 증거로 바뀌었다.** 처음 이 절이 적힐 때 근거는
*"그래프가 순환처럼 보이지만 대부분 아니다"* 였다. 지금 근거는 **넷이 서 있다**는 것이다.

---

## 2. Can one schema carry Word, Notion, ProseMirror, Summernote, builder.io, Figma, FigJam, Excel?

**The schema, yes. The renderer and the input, no — and that is the real
division, not DOM versus canvas.**

`packages/schema` already holds three schemas: `standard-schema` (a general
document), `office-schema` (Word's), and `figma-like-schema` — a flat
`DOCUMENT → PAGE → FRAME | RECTANGLE | TEXT | COMPONENT` node set, written and
marked *reference only*. So the question has already been partly answered in the
affirmative by whoever wrote that file: the node-and-attribute model is not the
thing that resists.

What resists is different per product, and it is worth being exact:

**2026-09-04 재측정 — 이 표는 제품이 하나일 때 적혔고, 그 뒤로 넷이 됐다.** 여덟 목표 중 **넷이
이미 서 있고**, 표에 없던 다섯째(Slides)가 생겼다. 무엇이 남았는지가 이 표의 값이다.

| 목표 | 지금 | schema | renderer | input | layout |
|---|---|---|---|---|---|
| **Word** | ✅ `office-word` (12,823줄) | done | done | done | done |
| **ProseMirror-like** (스키마 WYSIWYG) | ✅ **이 저장소가 그것이다** | done | done | done | 필요 없음 |
| **Notion-like** (블록·페이지) | ✅ `office-note` (2,027줄, **노드 3개**) | done | done | done | 필요 없음 |
| **builder.io-like** (페이지 빌더) | ✅ `office-site` (28,293줄) | done | done | done — 캐럿이 아닌 배치 | 필요 없음 |
| **PowerPoint/Canva-like** | ✅ `office-slides` (27,097줄) — *표에 없던 것* | done | done | done | done |
| **Summernote-like** (HTML WYSIWYG) | ⬜ 미착수 | `standard-schema` 있음 | done | done | 필요 없음 |
| **Excel-like** | ⬜ 미착수 | 그리드 노드 | 가상 스크롤 행 | **새로**: 2D 범위 선택, 수식 바 | 열·행 크기 |
| **Figma-like** | ⬜ 참고 스키마만 | `figma-like-schema` (reference only) | **새로: 캔버스** | **새로**: 직접 조작 | **새로: 글자 셰이핑** |
| **FigJam-like** | ⬜ 미착수 | Figma 와 같음 | Figma 와 같음 | Figma + 프레즌스 | Figma 와 같음 |

**노트가 노드 3개로 서는 것이 이 구조의 증거다.** 본문의 어휘는 `office-text` 가 이미 그리고 있고,
노트가 선언한 것은 *무엇을 담을 수 있나* 와 `note` 노드 하나다. 반대쪽 끝에 사이트가 28,293줄로 있다 —
같은 엔진 위에서 제품의 크기가 그만큼 벌어진다는 뜻이다.

### 그래서 확장은 세 갈래이고, 값이 다르다

1. **새 층이 필요 없는 것** — Summernote-like. 스키마 하나와 확장 몇 개. 새 층이 아니라 **어휘**의
   문제이고, 지금 구조가 그걸 위해 만들어졌다. *이미 넷이 그 길로 만들어졌다는 것이 근거다.*
2. **입력과 뷰포트가 새로운 것** — Excel-like. 문서 층은 그대로 쓴다. 선택이 문자 범위가 아니라 셀의
   사각형이어야 하고(그 종류는 `SelectionType` 에 **이미 있다** — `cell`), 백만 행 중 백 행을 그리는
   뷰포트가 필요하다. 둘 다 이상하지 않고 둘 다 새로 만든다.
3. **벽이 하나 있는 것** — Figma/FigJam. 렌더러는 하루짜리다(`dsl` 이 템플릿과 호스트를 이미 가른다).
   벽은 **글자 셰이핑**이다 — 아래의 절을 보라.

남은 셋 중 하나(Summernote-like)는 값이 낮다: 그 제품이 증명할 것을 이미 넷이 증명했다. **Excel 이
다음 진짜 시험이다** — 선택 종류 `cell` 이 표에서만이 아니라 그리드에서도 성립하는지, 그리고 연산
하네스가 그리드를 가진 스키마에서도 버티는지.

### 예측 둘이 맞았고 하나가 틀렸다 — 적어 두는 값이 여기 있다

전에 이 자리에 *"셋은 가깝고 넷은 아니다"* 가 적혀 있었다. 그 뒤로 셋이 만들어졌으니 대조할 수 있다.

**맞은 것:** *"Summernote-, ProseMirror-, Notion-like 는 새 층이 필요 없다 — 거리는 스키마와 명령으로
재고 아키텍처로 재지 않는다."* 노트가 그것을 증명했다. **노드 3개, 2,027줄.**

**맞은 것:** *"페이지 빌더는 캐럿을 직접 조작으로 바꾼다. 문서 층은 그대로 쓰이고 `editor-core` 의
선택은 아니다. 넷 중 가장 싸고 자연스러운 두 번째 제품이며, 새 렌더러 없이 2단계의 분리를 증명한다."*
사이트가 그것이다. 다만 **싸지 않았다** — 28,293줄이다. 새 *층* 이 필요 없다는 것과 새 *제품* 이
작다는 것은 다른 말이었다.

**틀린 것:** *"`editor-core` 의 선택은 페이지 빌더를 서지 못한다"* 는 이유로 2단계(편집 층 분리)가
먼저라고 봤다. **사이트는 그 분리 없이 만들어졌다.** `editor-core` 를 그대로 쓰면서 캐럿을 안 쓰는
것이 가능했고, 그래서 2단계는 *막고 있던 것* 이 아니라 *정돈* 이다. 순서가 그만큼 자유로워졌다는
뜻이고, 동시에 2단계의 근거를 다시 세워야 한다는 뜻이다 — 지금의 근거는 아래에 다시 적었다.

### 남은 셋

**스프레드시트**는 문자 범위가 아니라 셀의 사각형인 선택과, 백만 행 중 백 행을 그리는 뷰포트가
필요하다. 둘 다 이상하지 않고 둘 다 새로 만든다. **그리고 선택 쪽 절반은 이미 있다** —
`SelectionType` 의 `cell` 이 그것이고, 표에서 이미 쓰인다(`installCellSelection`). 그리드에서도
성립하는지가 그 타입의 진짜 시험이다.

**Canvas is the hard one, and not for the reason it looks.** The renderer is a
day's work — `dsl` already separates template from host. The problem is
underneath:

> `measurement.ts`, the file this repository's pagination is built on, opens by
> saying the browser has *already done* the hard part: "Character widths,
> kerning, script shaping and line breaking are all already done —
> `Range.getClientRects()` hands back one rectangle per line box, which *is* the
> line breaking result. Computing glyph metrics ourselves would be re-deriving
> an answer the layout engine has already given."

On a canvas there is no layout engine to ask. Text shaping — glyph metrics,
kerning pairs, bidi, Hangul and CJK line-breaking rules, ligatures — has to be
done, and it is the single largest piece of work in this document. Everything
else on the canvas side (hit testing, transforms, z-order, snapping) is
ordinary.

So: **the schema unifies; the renderer and the input do not, and text shaping is
the wall.** A design tool whose text is a DOM overlay would dodge it, and is
worth prototyping before committing to the wall.

---

## 3. Can each of these ship as its own program?

**Yes, and the repository is already arranged for it.** `apps/word` is a Vite
app that composes packages and adds a shell — a ribbon, panes, a ruler. Nothing
in it is privileged.

What is missing is not packaging but **the seam a product plugs into**. Today a
product is: a schema, a renderer registration, an extension set, a keymap, a
toolbar model, and a React shell.

**2026-09-04 — 넷을 대조했다.** 여섯 조각 중 넷은 네 제품이 다 같은 모양으로 갖고 있고, 하나는 하나만
갖고 있고, 하나는 앱마다 손으로 쓴다:

| 조각 | word | slides | site | note |
|---|---|---|---|---|
| 스키마 | `createSchema` | `createSchema` | `createSchema` | 상속 |
| 렌더러 등록 | `register*Renderers` | ✓ | ✓ | ✓ |
| 확장 집합 | `create*Extensions` | ✓ | ✓ | ✓ |
| 툴바 모델 | `WORD_TOOLBAR` | `SLIDES_TOOLBAR` | `SITE_TOOLBAR` | `NOTE_TOOLBAR` |
| **키맵** | `word-keymap.ts` **71개** | **없음** | **없음** | **없음** |
| React 셸 | 앱(5,507줄) | 앱(18,854줄) | 앱(11,366줄) | **패키지** |

**그리고 네 kit 이 같은 모양인데 그 모양을 선언한 타입이 없다.** 넷 다
`create<X>Extensions()` + `create<X>Editor(options)` 다 — 넷이 합의했고 아무것도 그걸 적어 두지
않았다. 이 저장소가 이미 검사를 가진 모양이다(`three-agree.test.ts`): **셋이 합의하고 하나가
어긋나는 것.** 다음 제품이 어긋날 자리다.

**키맵 쪽은 재보니 처음 본 것보다 작다.** 앱의 손으로 쓴 키 처리를 셌더니 slide 17 · site 10 ·
word 5 인데, **대부분은 정당하게 UI-지역이다** — 팝오버의 Escape, 목록의 화살표, 찾기 바의 Enter.
*제품의 키보드* 인 것은 여섯쯤이고 그게 진짜 어긋남이다: 예를 들어 **고른 도형을 `Delete` 로 지우는
것이 앱에 손으로 적혀 있고**, Word 는 같은 것을 `when:` 가드를 가진 데이터로 선언한다.

### Steps

1. **제품 계약을 이름 붙인다.** 넷이 이미 같은 모양이므로 **추론이 아니라 기록**이다.
   *끝났음의 기준:* `ProductKit` 같은 타입이 하나 있고, 네 kit 이 그것을 만족하는지 검사가 세고,
   다섯째 제품이 조각을 빠뜨리면 검사가 신고한다.
2. **셸이 제품의 것이 아니게 된다.** 노트가 이미 통과했다 — 뷰와 툴바를 패키지에 갖고 있어서
   `apps/note` 가 257줄이다. 나머지 셋은 35,927줄이 앱에 있다.
   *끝났음의 기준:* 남의 앱에 제품을 넣는 데 앱 코드를 베끼지 않아도 된다.
3. **Desktop and server.** The layout pass needs a browser for measurement and
   nothing else does; a server-side renderer is possible for every product whose
   pagination is not needed, and for Word only if text shaping arrives (which is
   the same wall as canvas, from the other side).

---

## The order these should happen in

Each step is chosen so the *next* one is cheaper, and each has a way to know it
worked.

**Phase 1 — make the graph honest.** Move `ModelSelection` down, add the missing
`type` keywords, drop the two phantom dependencies. *Done when* every package
builds against only the packages below it and the dependency graph is a DAG.

> **2026-09-04 — 끝났습니다. 순환 0개, DAG 입니다.** 그리고 이 단계가 *"작다"* 고 적혀 있었던 것이
> 맞았다 — 재보니 순환 셋 중 **둘이 유령**이었다. `datastore → model` 과 `editor-core → extensions` 가
> `package.json` 에 적혀 있고 import 는 **하나도 없었다.** 세 번째(`editor-core ↔ model`)는 한쪽만 진짜였다:
> `editor-core` 는 `new TransactionManager` 를 쓰지만 `model` 은 `Editor` 와 `SelectionManager` 를 타입
> 자리에서만 쓴다 — `import type` 으로 바꾸고 devDependency 로 내려서 풀렸다.
>
> **검사를 붙이자 유령이 열넷 나왔다.** 처음 여섯을 걷으면 셋이 더 나오고, 그것을 걷으면 넷이 더 나온다 —
> 유령은 빌드가 되기 때문에 보이지 않고, 무언가를 쓰려다 만 커밋 하나로 다시 생긴다.
> `conformance/test/dependency-graph.test.ts` 가 두 가지를 묻는다: 순환이 있나, 그리고 **선언했는데
> import 하지 않는 것이 있나.**
>
> 층이 0~8 로 정렬된다: `dsl schema shared` → `datastore` → `model` → `editor-core` → `office-text`
> `office-controls` → `extensions` → `office-editor-ui` `office-word` → `office-note` `office-slides`
> → `office-site`.
>
> **제품끼리의 변은 아홉에서 셋으로** 줄었고 남은 셋 중 하나는 의도한 것.

**Phase 2 — split the editing layer.** Separate "any product" from "a text
product" inside `editor-core`. *Done when* a package can use commands, history
and transactions without importing anything about a caret.

**Phase 3 — a second product.** A page builder, on the DOM renderer, sharing the
shell. *Done when* the shell in `apps/` belongs to no product, and when a
feature added to the kit appears in both.

> **2026-09-04 — 제품은 넷이고, 셸은 아직 앱에 있습니다.** `office-word`·`office-slides`·`office-site`·
> `office-note`. 마지막 하나가 이 조건을 통과한 유일한 제품이다: 자기 뷰와 툴바를 패키지에 갖고 있어서
> `apps/note` 는 **257줄**이다. 나머지 셋은 **35,927줄**이 앱에 있다(2026-09-04 재측정: slide 18,854 ·
> site 11,366 · word 5,507). 가장 큰 조각들: `slide/overlay` 3,765 · `slide/properties` 2,586 ·
> `slide/timeline` 2,443 · `slide/app` 2,350 · `site/inspector` 2,342 · `site/overlay` 1,997.
>
> **그리고 이 단계의 두 번째 조건 — *"kit 에 더한 기능이 둘 다에 나타난다"* — 은 아직 검증되지
> 않았다.** 넷이 서 있는 것은 첫 조건의 증거이고, 두 번째는 *같은 것을 한 번 적어 둘이 얻는가* 를
> 묻는다. 이번 회차에 그 예가 하나 나왔다: 셀 선택을 `office-text` 로 옮기자 노트가 두 명령을 얻었다.
> 반대 예도 하나 나왔다: 네 kit 이 같은 모양인데 **그 모양을 선언한 타입이 없어서**, 다섯째 제품이
> 조각을 빠뜨려도 아무것도 신고하지 않는다.
>
> **재보고 방향을 정한 것:** 옮길 것을 *중복이라서* 고르면 안 된다. 이름으로도 내용으로도 훑었고, 리본
> 셋과 `/` 메뉴와 팝오버 자리잡기 말고는 앱을 가로지르는 중복이 **없다**. 기준은 하나여야 한다 — *남의
> 앱에 이 편집기를 넣으려면 무엇이 같이 가야 하나.* 그 기준으로는 하나도 안 겹쳐도 다 가야 하고, 그건
> 크기의 문제지 중복의 문제가 아니다.
>
> **렌더러 레지스트리가 짝이다.** 크롬을 옮겨도 렌더러가 전역이면 두 제품이 한 화면에 못 선다 — Word 가
> 사이트의 렌더러 **125개 중 117개**를 덮는 것을 쟀다. `intoRegistry` 가 쓰는 쪽에 범위를 주는 한 줄이고,
> 나머지(`EditorViewDOM → DOMRenderer → VNodeBuilder`, `{global:false}` 의 전역 대체)는 이미 다 엮여
> 있었다.

**Phase 4 — publish.** Versioning, a stability promise for `dsl` and `schema`,
and documentation aimed at somebody who has not read this repository. *Done
when* a person outside it builds a third product without asking a question this
document should have answered.

**Phase 5 — decide about canvas.** Prototype text-as-DOM-overlay first, since it
is days rather than months, and let that decide whether the shaping engine is
worth building. *Done when* the decision is made on evidence rather than on
appetite.

### 지금 손에 잡히는 순서 — 2026-09-04

로드맵의 단계는 몇 달짜리다. 이건 그 안에서 **다음에 손댈 것**이고, 하나씩 지워 가며 쓴다. 각 줄은
`BACKLOG.md` 의 항목 하나를 가리키고, *왜* 는 거기 있다.

- [x] ~~**`Shift+→` 가 블록을 넘으면 모델 범위가 뒤집힌다.**~~ **끝 — 그리고 적어 둔 원인이 틀렸다.** — 근거: `packages/editor-core/test/from-dom-selection.test.ts:19` · `packages/shared/src/text-position/collapse-boundaries.test.ts:25`
      *"`isTextContainer` 가 아무도 안 쓰는 속성을 물어서"* 라고 적혀 있었고, 그것도 사실이었지만 이
      결함의 원인은 아니었다. 그 수정 뒤에도 **다섯 번째 누름에서 그대로 뒤집혔다** — 검사를 쓰고 나서
      알았다. 원인은 둘이었고 둘 다 *"어느 쪽인가"* 를 잘못된 것에게 물은 것이다:

      1. `convertOffsetWithRuns` 가 요소 경계의 오프셋을 `isEnd ? 런의 끝 : 런의 시작` 으로 정했다.
         **`isEnd` 는 범위의 어느 쪽인가이고 요소 안의 어디인가가 아니다** — 그건 `offset` 이 말한다.
         그래서 다음 문단의 맨 앞(`offset: 0`)이 그 문단의 **끝**(28)이 됐다. 비교도 틀렸다:
         `t.compareDocumentPosition(child)` 로 물어서 `child` 가 `t` 를 포함하는 흔한 경우에
         `FOLLOWING` 이 서지 않았고, 그래서 `firstAtOrAfter` 가 한 번도 정해지지 않았다.
      2. `fromDOMSelection` 이 문서 순서를 **sid 문자열 비교**로 정했다
         (`compareNodeOrder ?? ((a, b) => a.localeCompare(b))`, 실제 호출자 셋 다 비교자를 안 준다).
         `"9"` 가 `"11"` 보다 커서 자리수가 넘어가는 순간 `startNodeId` 와 `endNodeId` 가 **맞바뀐다.**
         짧은 문서에서는 우연히 맞으므로 재현되지 않는다.

      고친 뒤 예순 번을 눌러 여러 블록을 넘어도 뒤집히지 않고 DOM 표시가 남는다 —
      `apps/note/tests/selection.spec.ts`. **배운 것:** 원인을 찾았다고 적은 것과 고쳐졌다고 적은 것은
      다른 문장이고, 그 사이를 잇는 것은 단정하는 검사뿐이다. 앞 회차의 프로브 둘(`zz-sh`, `zz-tc`)은
      콘솔에 찍기만 해서 `every-test-asserts` 가 잡았고, 그 잡힘이 이걸 다시 열게 했다.
- [x] ~~**`ModelSelection` 이 셋 선언되어 있고 둘이 서로 다르다.**~~ **끝 — 다섯이었다.** — 근거: `packages/conformance/test/one-selection-type.test.ts:83`
      **그 중 하나가 오래된 결함의 출처였다.** `editor-core` 의 죽은 `ModelNodeSelection = { nodeId, selectAll }` 이
      아무도 안 쓰인 채 남아 있었고, **두 뷰 층이 그 모양을 향해 `nodeSelection.nodeId` 를 읽고
      있었다** — 생산자는 `nodeIds` 복수를 세우므로 그 분기는 한 번도 아무 일을 한 적이 없다. 그리고
      `cell`·`table` 은 `console.warn('Unsupported selection type')` 으로 갔다(셀 드래그 한 번에 한
      번, 브라우저에서 셌다).

      **사본을 걷자 타입 검사가 그 둘을 바로 찾았다** — `'none'` 은 `SelectionType` 이 아니고,
      `ModelSelection` 에 `nodeId` 가 없다. 그리고 사본이 검사를 실제로부터 **밀어낸** 자리도 나왔다:
      React 검사에 *"컴파일러가 그렇게 말했다"* 며 범위 필드 넷을 지운 주석이 있었고, 그 컴파일러가
      읽던 것이 좁은 사본이었다. `docs/specs/selection.md` 에 다 적었다.
- [x] ~~**엔진이 *글자인가* 를 이름으로 묻는다.**~~ **끝 — 그리고 스키마를 바꿀 필요가 없었다.** — 근거: `packages/conformance/test/text-is-asked-by-text.test.ts:58`
      `stype === 'inline-text'` 가 엔진 층 **열여섯 자리**에 있었다(`editor-view-dom` 열,
      `editor-core` 하나, `model` 하나, `renderer-dom` 하나, `extensions` 셋). 원칙은
      `extensions/range-delete.ts` 의 `isInline` 에 이미 적혀 있었고 **한 파일이 그렇게 하고 열여섯이
      안 했다.**

      **먼저 재본 것이 답을 바꿨다.** *"스키마에 `text: true` 를 더해야 한다"* 고 볼 뻔했는데,
      런타임으로 세니 **스키마는 이미 답할 수 있었다**: office 의 `inline` 그룹 여덟 중 일곱이
      `atom: true` 라서 `group === 'inline' && !atom` 이 정확히 `inline-text` 하나다. 그리고 그
      열여섯은 **전부 인스턴스를 손에 쥐고 있었다**(`dataStore.getNode(id)` 를 부른 뒤였다) — 그러면
      `typeof node.text === 'string'` 이 더 짧고 더 옳다.

      `@barocss/shared` 의 `holdsText` 로 갔다(타입 술어라 `!modelNode ||` 가드도 같이 걷혔다).
      두 자리(`selection-summary` · `align`)는 *글자가 **아닌** 것* 을 찾는 걷기였고, 거기서는
      이름 조건이 **중복**이었다 — `typeof text !== 'string'` 이 이미 그것을 뺀다.

      **그리고 규칙은 세어야 규칙이다:** `conformance/text-is-asked-by-text.test.ts` 가 엔진 층의
      이름 결정을 센다(0이어야 한다). 처음 돌리자 내가 못 찾은 **여섯**을 바로 찾았다 — React 뷰
      다섯과 렌더러의 로그 하나. `model` 과 `extensions` 는 `shared` 의존이 없어서 새로 더했다
      (`shared` 는 의존이 0이므로 순환이 안 생긴다).

- [ ] **뷰 층이 두 벌.** ~~끝 — 그리고 합칠 것은 열셋이 아니라 둘이었다.~~ **재보니 두 벌이 그대로다** — `editor-view-dom/.../selection-handler.ts` 505줄과 `editor-view-react/src/selection-handler.ts` 424줄에 같은 이름의 private 메서드 **14개**(문서는 751/485줄에 11개라고 적었다). 끝난 것은 그 안의 결함 둘뿐이고 `packages/shared/src/text-position/collapse-boundaries.test.ts:25` 가 그것을 붙잡는다.
      1단계(선택 어휘를 `shared` 로)를 하고 2단계로 열셋을 대봤더니: **표기만 다른 것 여덟**(변수명,
      `??` vs `||`, 로그), 같은 것 둘, React 에 없는 것 둘, **논리가 다른 것 둘.** 326줄을 옮기는 것이
      답이 아니었고 — 여덟을 옮겼으면 순수한 churn 이다 — **그 둘이 다 살아 있는 결함이었다.**

      `isDecoratorElement` 는 `shared` 가 이미 가진 판단의 **네 번째 사본**이었다(`skipsInIndex` 로
      내보내고 지웠다, **탈출구 없이**). `findBestContainer` 는 DOM 판에만 **아래로 걷기**가 있었고,
      그것을 React 에 주자 더 깊은 결함이 드러났다: 시작은 첫 런, 끝은 마지막 런으로 내려가므로
      **캐럿이 갈라진다** — `t1:0 → t2:0`, `collapsed=false`. `range.collapsed` 를 아무도 안 묻고
      있었다. 사이트에서 `/` 를 칠 때 슬래시 메뉴와 버블 툴바가 같이 뜬 것이 그 증상이다.

      **배운 것:** 두 벌을 합치는 값은 코드를 옮기는 것이 아니라 **대보는 것**이었다. 대보기가 결함
      둘을 찾았고, 옮기기는 여덟 자리에서 아무것도 주지 않았을 것이다.

      **2026-09-05 정정 — 위의 `[x]` 를 너무 일찍 그었다.** `range.collapsed` 를 묻는 것만으로는
      안 끝났고, 남은 것이 둘이었다:

      1. **접을 때 어느 쪽으로 접는가.** 처음 쓴 가드는 늘 *시작* 으로 접었다. 그런데 경계가
         블록이면 두 해석은 서로 다른 그릇 안을 걷는다 — 시작은 첫 런 안을, 끝은 마지막 런 안을 —
         그래서 각자 자기 편에서만 맞다. 늘 시작으로 접으면 **문단 끝의 캐럿이 첫 런 끝** 으로
         간다. 런 둘인 문단에서는 글자 한복판이다.
      2. **타이핑 경로에는 그 질문이 아예 없었다.** `convertStaticRangeToModel` 은 `collapsed` 를
         묻지 않는다. `getTargetRanges()` 가 캐럿에 주는 것은 접힌 범위이고, 그러므로 같은 자리에서
         *둘째 런 전체* 를 고른 것으로 읽혔다. 그 값은 모델에 직접 쓰인다.

      규칙은 `shared` 의 `collapseBoundaries` 한 벌로 뒀다.

      **그리고 검사가 왜 못 잡았는지가 이 회차의 세 번째 같은 모양이다:** 내가 쓴 검사는 캐럿을
      `(p, 0)` 에만 두었는데, 거기는 **접는 방향이 결과를 안 바꾸는 유일한 자리** 다. 내가 고른
      자리가 내 결정을 시험하지 않았다. **끝났다고 적은 문장과 끝난 것 사이를 잇는 것은 여전히
      단정하는 검사뿐이고, 그 검사가 결정을 실제로 시험하는지까지 봐야 한다.**
- [x] ~~**편집기의 문에서도 선택의 답이 둘이다.**~~ **끝 — 답은 둘이 아니라 하나였다.** — 근거: `packages/conformance/test/one-selection-type.test.ts:83`
      재보니 `SelectionState` 를 **만드는 곳이 하나도 없었다**: 넘기는 호출자 0, 구현하는 확장 0, 그것을
      싣는 이벤트 0. 문을 좁히는 대신 그 타입을 지웠다. `updateSelection` 은
      `EditorSelectionModelPayload | null`, 확장 훅 둘은 `ModelSelection`/`MaybeSelection`,
      `editor:selection.change` 는 `MaybeSelection` 이고 `.focus`·`.blur` 는 payload 가 없다.
      읽고 있던 쪽(`devtool.getSelectionInfo` 의 죽은 분기 둘)도 같이 걷었다 — `BACKLOG.md`.
- [x] ~~**제품 계약에 이름이 없다.**~~ **끝 — 그리고 넷째가 이미 벗어나 있었다.** — 근거: `packages/conformance/test/every-product-is-built-the-same-way.test.ts:70`. 다만 아래 본문의 *"Word 의 71개"* 는 재보니 **52개**다(`WORD_KEYBINDINGS`).
      `word`·`slides`·`site` 의 옵션 타입이 **글자까지 같았다**(`extends EditorOptions` +
      `kit?` + `keybindings?`; word 만 `author` 를 더 받는다). 그런데 **가장 최근 제품인 `note` 가
      그것을 안 따랐다** — `EditorOptions` 를 안 물려받고, `keybindings` 를 아예 못 받고,
      `dataStore`·`schema` 를 `unknown` 으로 받았다. 아무도 막지 않았다: 선언이 없었기 때문이다.
      **다섯째가 걸릴 자리가 정확히 거기다.**

      `editor-core` 에 `ProductEditorOptions` 를 두고 넷이 그 위에 섰다. 그리고 재다가 하나가 더
      나왔다: **`keybindings` 를 넘기는 호출자가 0** 이고, 그래서 그 의미가 한 번도 시험된 적이
      없었다. 셋의 구현은 **대체** 였다 — `keybindings ?? WORD_KEYBINDINGS` 는 하나라도 주면 Word 의
      71개가 통째로 사라진다는 뜻이다. `word-kit.ts` 자신이 바로 윗 문단에 *레지스트리를 비우면
      Enter·Backspace·화살표까지 사라진다* 고 적어 두고, **한 줄 아래에서 부르는 쪽에게 그 문을 열어
      두고 있었다.** 이제 제품의 키가 먼저 실리고 이것이 그 위에 얹힌다. 넘기는 호출자가 0이므로
      오늘은 아무것도 안 바뀐다 — 바뀌는 것은 다음에 넘기는 사람이 얻는 답이다.

      `conformance/every-product-is-built-the-same-way.test.ts` 가 넷을 센다: 계약을 받는가, `kit` 이
      기본을 갈아끼우는가, `keybindings` 가 **층**인가.
- [ ] **키를 어느 층이 갖는가 — 기준을 적었다**(`docs/specs/keybindings.md`), **이주가 남았다.** — 재보니 아래 본문의 *"`WORD_KEYBINDINGS` 70개"* 도 틀렸다: 오늘 세면 **52개**(+`WORD_VIEW_KEYS` 1)이고, 엔진 기본 **40개**는 맞다. 아무 검사도 이 둘을 세지 않는다.

      *"키맵이 Word 에만 있다"* 고 적혀 있었고 **틀렸다.** 재보니 `editor-core` 의
      `DEFAULT_KEYBINDINGS` 가 **마흔**을 묶고 **모든 제품이 그것을 받는다** — Enter·Backspace·
      화살표·⌘B/I/U·목록·들여쓰기·제목·인용·undo/redo·복사/붙여넣기·전체선택. **note 에서 ⌘B 는
      된다.** 기본은 이미 공유되고 있었다.

      **문제는 반대쪽이었다:** `WORD_KEYBINDINGS` 70개 중 **18개가 엔진 것을 다시 적고 있었고**
      다시 적힌 것이 더 약했다(`editorFocus && editorEditable` → `editorFocus`). 레지스트리가
      출처로 충돌을 풀고 제품이 이기므로, 다시 적는 순간 편집 가드가 사라진다. 열여섯을 걷었다.
      못 본 이유는 **`DEFAULT_KEYBINDINGS` 가 안 나가고 있었기** 때문이다 — 볼 수 없는 것과 다시
      적는 것은 같은 결함의 앞뒤다.

      **기준(`specs/keybindings.md`):** *이 키가 하는 일이 문서에 남는가* 로 층이 갈린다. 남으면
      레지스트리(엔진/제품), 화면에만 남으면 앱. 그리고 **레지스트리가 유일한 디스패처다** —
      `slides`/`site` 가 호스트 디스패처를 쓰는 근거(*"호스트만 상자 안 타이핑을 안다"*)는 엔진의
      `keydown` 이 `window` 가 아니라 **`contentEditableElement` 에 붙기 때문에 성립하지 않는다.

      *남은 일:*
      - [x] note 에 `MoveBlockExtension` — 셋은 싣고 노트만 안 실어서 `Alt+↑` 가 죽어 있었다. — 근거: `packages/office-controls/test/every-engine-key-reaches-a-command.test.ts:42`
            기능은 손잡이로 있었다. `office-controls/every-engine-key-reaches-a-command.test.ts`
      - [ ] **slides 의 문서 키 20개를 레지스트리로** — 23이 아니다: 재보니 `SLIDES_KEYS` 는 **24개**(명령 22 · `view` 2)이고 문서 키는 엔진 재진술 2·크롬 2 를 뺀 **20**이다. `SLIDES_KEYS` 는 이미 `office-controls` 의
            `KeyModel` 이므로 모양은 같다. 실제 일은 **맥락을 세우는 것** 이다 — slides/site 는
            `setContext` 를 하나도 안 부른다(`when` 을 쓰는 것은 word 뿐이다)
      - [ ] site 도 같게 — **재보니 "문서 키 0" 이 틀렸다:** `SITE_KEYS` 가 **18개**이고 그 중 **14개가 명령**(`removeBlocks`·`groupBlocks`·`selectParent` …)이다. 크롬은 `view` 5뿐이다
      - [ ] 읽기 전용을 낼 때 `editorEditable` 을 걸 명령 목록 — **재보니 Word 는 54 중 0이 아니라 52 중 2다**(`packages/office-word/src/word-keymap.ts:106`·`:107`, `no-product-restates-an-engine-key.test.ts:89` 가 찾아서 더한 것이다). note 2 중 0은 맞다.
            일괄로 걸면 안 된다: `copy`·`selectAll` 은 읽기 전용에서 되어야 한다
- [ ] **두 끝이 형제가 아닌 범위** — 재보니 남은 일이 그대로다: `fromDOMSelection` 호출자 넷 중 `compareNodeOrder` 를 주는 곳이 **0**이고 기본이 `() => -1` 이다(`packages/shared/src/selection.ts:207`). 인용문 안에서 바깥으로. **결정은 끝났다**(`specs/selection.md`):
      시작을 담은 블록이 살아남는다 — 추측이 아니라 *삭제 뒤 캐럿이 시작 자리에 있다* 에서 도출된다.
      남은 일은 **문서 순서 훑기** 하나이고, 이번 회차에 같은 것이 한 번 더 필요했다
      (`fromDOMSelection` 이 문서 순서를 sid 문자열로 정하고 있었다). 두 자리가 같은 것을 필요로 하면
      그 자리는 모델 쪽이다.
- [ ] **관리 화면 둘:** 재보니 컴포넌트 탭은 여전히 표다(`packages/office-site/src/admin.tsx:646` — 이름·쓰임·변수·틀 열의 `<table>`), 썸네일 카드가 아니다. Drawer 겹침은 **못 쟀다**(브라우저가 필요하다). 컴포넌트 탭이 이름 목록이라 썸네일 카드여야 하고, 데이터 탭의 행 편집 Drawer 가
      다른 도구와 겹친다.
- [x] ~~**크롬 이주의 다음 조각.** 되돌리기 쉬운 것부터: `page-frame`(307) → `rail`(1,483) → `inspector`(2,343) → `overlay`(1,997).~~ **넷 다 옮겼다** — 근거: `packages/conformance/test/every-app-scans-the-chrome-it-draws.test.ts:59`
      재보니 넷이 다 `packages/office-site/src/` 에 있고 크기는 314 · 1,467 · 2,310 · 2,028 이다 — `apps/site/src` 에 남은 것은 app·canvas·ribbon·data-editor·code-editor·grip·text-surface 다.
      `office-site` 가 React 를 갖게 되는 첫 걸음이다.
- [x] ~~**드래그 열셋을 `dragGesture` 로.**~~ **끝.** — 근거: `packages/shared/src/gesture.test.ts:98`(pointercancel 로 끝나도 리스너가 남지 않는다); 재보니 저장소에 남은 `window` `pointermove` 는 **하나**다(`packages/office-slides/src/stage.tsx:766`). 그 수를 두 번 잘못 셌다(20 → 5 → **13**) —
      **세는 방법이 답을 바꾼다.** 남은 `window` `pointermove` 하나는 상시 리스너다. `abort` 가
      자리마다 다른 것이 이 이주의 값이고, `TECHNICAL-ROADMAP.md` §2.0 에 그 갈래를 적었다.
- [ ] **전역 키 리스너의 가드가 규칙이 아니라 관습이다.** — 재보니 그 검사는 아직 없다: `packages/conformance/test/` 22개 중 리스너를 세는 것이 **0**이다. *"스물둘, 인스턴스가 둘이면 둘 다 듣는다"*
      고 적었다가 다시 셌고 틀렸다 — 열다섯은 `apps/*` 이고 그 제품들은 창마다 편집기가 하나다.
      패키지 안에는 여섯이고 **여섯 다 인스턴스별 상태로 가드한다.** 살아 있는 결함이 아니다. 남은
      것은 그 규칙을 적고 새 리스너가 가드 없이 들어오는 것을 세는 검사 하나.
- [ ] **`toModel` 이 셋이고 같은 이름으로 서로 다른 질문 둘에 답한다** — 재보니 셋 그대로이고 자리만 바뀌었다: `packages/office-word/src/drawing-overlay.tsx:293`(거리) · `:389`(점) · `packages/office-slides/src/overlay.tsx:688`(점). 한 파일 안에 80줄이 아니라 **96줄** 떨어져
      하나는 점, 하나는 거리다. 셋 다 세 줄이라 중복은 값이 아니고, 값은 두 질문에 다른 이름을 주는
      것이다: `pointIn` 과 `deltaIn`. 제스처가 `moved.x/y` 와 `moved.dx/dy` 를 주므로 자리는 그 옆.
- [x] ~~**`createWordTables`(508줄)와 `frameCss`** 를 제자리로. 제품끼리의 마지막 두 변.~~ **끝** — 근거: `packages/conformance/test/no-product-depends-on-a-product.test.ts:86`; 재보니 `createWordTables` 는 `packages/office-text/src/table-commands.ts:506`, `frameCss` 는 `packages/office-site/src/wireframe.ts:593`(`wireframeCss`) 에 있다.
- [x] ~~**엔진의 순환 셋** — Phase 1.~~ **끝.** — 근거: `packages/conformance/test/dependency-graph.test.ts:44`. 둘이 유령이었고 하나는 타입만이었다. 유령 열넷을 걷고
      `dependency-graph.test.ts` 로 못 박았다. 큰 일이라고 본 것이 틀렸다 — 로드맵이 맞았다.
- [x] ~~**셀 병합·분할.**~~ **끝 — 그리고 적어 둔 이유가 틀렸다.** — 근거: `packages/office-note/test/spec-numbers.test.ts:87`(노트의 표 명령 여덟) · `packages/office-text/src/table-selection-view.ts:76`(제스처가 부품에 있다). *"제스처가 없다"* 고 적었는데
      `installCellSelection` 이 379줄로 있었고 `apps/word`·`apps/slide` 가 부르고 있었다. 진짜 결함은
      둘이었다: (1) 그 제스처가 **`office-word` 안**에 있어서 표를 가진 넷 중 둘만 닿았고, (2)
      `extensions/table.ts` 의 `_selectedCellRange` 가 **`cell` 선택을 못 알아봤다** — `cell` 은 이
      명령 하나를 위해 있는 선택 종류인데. Word 에서 되던 것은 `office-word/table-commands.ts` 가
      양 끝 셀 id 를 따로 넘겨 줬기 때문이다. 셀 선택은 `office-text` 로 갔고(`.w-cell` 과
      `[data-cell-selected]` 가 이미 거기 있었다), 노트가 자기 뷰에서 설치하고, 노트의 표 도구가
      여섯에서 여덟이 됐다. **남은 것:** 사이트가 캔버스에서 이 제스처를 설치할지 — 그 캔버스는
      포인터를 자기 오버레이가 먼저 받는다.

**끝난 것을 지우지 말고 `BACKLOG.md` 의 Done 으로 옮긴다** — 놀란 것과 함께. 그게 다음 사람이 다시
발견하지 않을 유일한 방법이다.

### 그리고 검사 결과를 읽는 법

이번 회차에 **같은 종류로 두 번** 속았다. 둘 다 요약의 마지막 줄을 읽은 결과다.

| 도구 | 마지막 줄 | 그 위에 있는 것 |
|---|---|---|
| `playwright --reporter=line` | `364 passed` | `10 failed` |
| `vitest run` | `Tests 458 passed` | `Test Files 4 failed` — 파일이 **열리지 않은** 것 |

두 번째가 더 나쁘다: 실패 개수가 **0** 이고 검사 개수만 조용히 줄어든다. `conformance` 의
`dependency-graph.test.ts` 가 이제 그것을 묻지만, 사람이 읽을 때도 규칙은 하나다 — **실패 줄을 먼저 세고,
통과 줄은 그다음에 읽는다.**

---

Phases 1 and 2 are small and unblock everything after them. Phase 5 should not
start before phase 3 finishes: a second product is what proves the core is a
core, and building a canvas first would prove only that a canvas can be drawn on.

---

## Word, to the level of Word — 2026-09-06 에 잰 것

덱에는 *"PowerPoint·Keynote·Canva·CapCut 과 무엇이 다른가"* 가 적혀 있고 여섯 단계로 쪼개져
있다. **Word 와 사이트에는 그 문단이 없었다.** 그래서 다음에 무엇을 할지가 제품의 순서가 아니라
**백로그에서 고른 결함의 순서**로 정해졌다. 이 절은 그 빈 칸이다.

스키마에 실행 시점에 물어서 잰 것 — grep 이 아니라 `createSchema` 가 답한 것이다.

**노드 타입 108, 마크 40.** 그 안에 이미 있는 것:

- **수식 29종** — `mathFraction`·`mathRadical`·`mathNary`·`mathMatrix`·`mathPreSubSup` …
  `oMath`·`oMathPara` 까지. 그림이 아니라 **구조**로 그린다.
- **검토 전부** — `insertion`·`deletion`·`formatChange`·`moveFrom`/`moveTo` 가 마크로,
  `commentThread` 가 리소스로. 변경 추적과 주석이 둘 다 산다.
- **필드 여덟** — `fieldPageNumber`·`fieldPageCount`·`fieldDateTime`·`fieldRef`·`fieldSeq`·
  `fieldStyleRef`·`fieldDocTitle`·`fieldAuthor`.
- **각주·미주** — `footnoteDef`/`endnoteDef` 가 리소스에, `footnoteRef`/`endnoteRef` 가 마크로.
- **목차·색인·참고문헌** — `tableOfContents`·`indexBlock`·`bibliography`.
- **콘텐츠 컨트롤**(잠금·자리표시자 포함), **텍스트 상자**, **캔버스와 도형**,
  **스타일 정의와 조건부 스타일**, **번호 매기기 정의**.

### 그래서 Word 에 없는 것은 무엇인가

> **2026-09-06, 이 표가 하루에 두 번 낡아 있었다.** 아래 두 줄(상호 참조·캡션)은 내가 이날 아침에
> ⬜ 로 적은 것이고, 오후에 재보니 둘 다 만들어져 있었다. 이름으로 찾은 것이 원인이다 — 기능의
> 이름은 `crossRef` 가 아니라 `fieldRef` 다. **로드맵의 칸을 채우기 전에 코드에 물을 것.**

| | 있나 | 무엇이 없나 |
|---|---|---|
| **상호 참조** | ✅ | **재보니 다 있었다.** `field-resolver.ts:112` 의 `reference()` 가 `targetId` 로 북마크를 찾고 `aboveBelow` 까지 답한다(*위/아래*는 필드가 **어디서 읽히는지**를 알아야 하는 유일한 형식이라 `fromSid` 를 받는다). `pageNumber` 만 `undefined` 인데 그것도 정직한 값이다 — 북마크가 몇 쪽에 있는지는 배치의 사실이고 이 해석기에는 배치가 없다. 렌더러는 `office-text/renderers.ts`, 검사는 `field-resolver.test.ts`. 내가 `crossRef` 라는 이름으로 찾다가 없다고 적었다. |
| **메일 병합** | ⬜ | 자료원이 없다. 사이트에는 `collection` 이 있고 그것이 같은 질문의 절반이다 — *한 문서를 여러 자료로 여러 번 찍는다*. |
| **캡션과 그림 번호** | ✅ | 같이 틀렸다. `fieldSeq` 가 `sequence: 'Figure'` 를 갖고, 해석기가 문서를 한 번 걸으며 `sequenceNumbers` 를 채운다(문서마다 한 번 — 필드마다 세면 제곱이 된다). 남은 것은 목록 쪽, 즉 **그림 목차** 뿐이다. |
| **매크로·확장** | ⬜ | 그리고 이것은 **의도된 거절일 수 있다** — 이 엔진의 확장은 코드이지 문서 안의 스크립트가 아니다. |
| **협업** | ⬜ | 주석과 변경 추적이 있으므로 *한 사람이 시간을 두고 하는 검토* 는 된다. 없는 것은 **동시에 둘**이고, 그것은 제품이 아니라 **서비스 층**의 일이다(아래 §서비스). |

### 그래서 Word 의 다음은 대화상자 넷이다 (2026-09-06)

위의 표가 ✅ 로 채워진 뒤에 남는 것은 **스키마가 아니라 컨트롤**이다. `word.md` 가 하네스에서
직접 뽑아 둔 목록이 그것을 말한다 — 그리는데 설정할 곳이 없는 속성들이고, 흩어져 있지 않고
**Word 가 가져 본 적 없는 대화상자 넷**으로 뭉친다.

| | 무엇 | 상태 |
|---|---|---|
| 1 | **테두리 및 음영** (16) | ✅ **2026-09-06** — ratchet 184 → 136 |
| 2 | **필드 설정** (12) — `tag`·`literal`·`sequence`·`limitLocation`·`showContents` | ⬜ |
| 3 | **페이지 설정** (8) — 크기·여백·제본용 여백·단과 그 간격·구분선 | ⬜ |
| 4 | **표 속성** (7) — `cellSpacing`·`hide*`·`noWrap`·`heightRule` | ⬜ |
| 5 | **문단 간격** (5) — `spacingBefore`·`spacingAfter`·`spacingLine`·`spacingLineRule` | ⬜ |

`word.md` 는 오랫동안 *"그중 첫째는 이 스위트에서 대화상자가 무엇인지를 정하는 일이기도 하고,
그 결정은 Word 의 것이 아니라 공용의 것"* 이라고 적어 두었다. **그 문장은 쓰일 때 이미 낡아
있었다** — `office-ui/dialog.tsx` 가 있었고 덱과 사이트가 그것을 그리고 있었다. Word 만 안 썼다.
첫 대화상자의 값은 모델 218줄·명령 76줄·대화상자 240줄이었다.

**한 대의 브라우저 안이라는 것도 사실이다** — 다른 기기에서 같은 문서를 열 수 없고, 링크로
건넬 수 없고, 둘이 함께 볼 수 없다. 그러나 그것은 **계정·공유·협업**이고 셋 다 서비스 층이다.

**순서는 정해져 있다 (2026-09-06):** 제품 에디터 기능을 다 한 다음에 서비스를 공통으로 본다.
계정과 공유와 협업은 서로 얽혀 있어서 **한 제품에서 풀면 나머지 셋에서 다시 풀게 된다** — 그것이
이 저장소가 매 회차 찾는 모양이고, 지금 그것을 시작하면 제품 넷이 각자 자기 계정 개념을 갖는다.
그래서 그 층은 뒤로 두고, 위 표의 문서 기능부터 닫는다.

## 사이트, 무엇과 겨루나 — 2026-09-06 에 잰 것

노드 71 · 속성 841 · 자기 것 14. 이미 있는 것: 페이지와 반응형 폭 셋, 컴포넌트와 인스턴스,
변수와 바인딩, 자료 모음(`collection`)과 카드, 폼과 연결, 발행과 SEO(`og:*`·canonical·sitemap),
그리고 오늘 붙은 **파일과 라이브러리**.

없는 것 중 큰 셋:

1. **자기 도메인으로 나가는 발행.** 지금은 아카이브를 만든다. *이것이 이제 그 사이트다* 를
   답하려면 어딘가에 올라가야 하고, 그것은 서비스 층이다.
2. **웹폰트.** 브랜드는 색과 글꼴인데 글꼴 쪽이 비어 있다.
3. **방문자가 남긴 것.** 폼은 보낼 곳(`연결`)을 알지만 받은 것을 볼 곳이 없다.

## Slides, to the level of PowerPoint, Keynote, Canva and CapCut

Named as the target on 2026-08-19. Those four are not one product, and the
distance to each is different in kind — so this is what the deck already has,
what separates it from each of them, and the order that makes the next step
cheaper. Measured rather than guessed: 139 commands, fifteen canvas node types
declared, ten toolbar groups.

**What is already there.** Shapes, pictures, text frames, frames with auto
layout, groups whose box follows their children, tables with cell selection,
layouts with formatting that cascades through them, snapping and guides, align
and distribute, grouping and going inside a container, a clipboard, speaker
notes over one document, real thumbnails, presenting, zoom, and a properties
panel. Every one of those is drawn, reachable and covered by the harness. What
follows is not a rewrite of any of it.

### What separates the deck from each of them

- **PowerPoint and Keynote** — *animation*. Transitions between slides, builds on
  the objects, a presenter view. This said *"without them this is a drawing tool that happens to
  be slide-shaped, and it is the largest single gap."* **재보니 셋 다 있다 (2026-09-06).**
  모션 코드 **7,369줄**(`motion-effects` 1,393 · `timeline` 1,184 · `motion-presets` 823 ·
  `motion-tracks` 420 · `motion-path` 347 · `motion` 312 · `motion-cost` 176 · `scroll-show` 192 ·
  `timeline-pane.tsx` 2,522), 스키마의 `motionTrack`·`motionStep`, `playback.ts` 의
  `advanceShow`, `present.tsx` 의 발표자 화면. 브라우저 검사도 있다 — 빌드 **35**, 발표자 **11**,
  전환 **4**. 이 문장은 그것들이 쓰이기 전에 적혔고 지워지지 않았다.
- **Canva** — *design depth*. This page used to list gradient, shadow, blur,
  dashes, per-corner radius and image crop as things a shape could not have. **Measured 2026-09-06, all six are in the panel** — `slidesPanelAttrs()`
  names `gradientKind/From/To/Angle`, `shadowColor/Blur/Angle/Distance`, `strokeDash`,
  `cornerRadius` and the four corners, `cropTop/Right/Bottom/Left`. The narrower
  question that replaced it — *which of the six can a document carry across a save*
  — was asked properly on 2026-09-06 and answered: all of them, on every box the
  deck draws. It took eleven declarations on `picture` to make that true; see Deck 1.
  So *design depth* is closed as a gap against Canva.
- **CapCut** — *time as a first-class dimension*. Video and audio on a slide, a
  timeline, keyframes, and an export that is a file rather than a screen.

### The order, and why

**Deck 1 — depth on the objects that already exist.** Gradients, shadows,
opacity, dashes, per-corner radii; crop and fit for a picture. Cheapest, most
visible, and the foundation for everything after it: a theme has nothing to
resolve until a shape has colour *slots*, and an animation has nothing worth
watching until the thing it moves looks designed. *Done when* every one of them is
declared where it is drawn, reachable from the panel on every box that draws it,
and still there after a save and a load — proved by
`packages/office-slides/test/what-a-save-carries.test.ts`. **Done, 2026-09-06.**

> **This page described all six as absent while all six were on the panel.**
> Written before they existed and never re-read, which is the failure
> `roadmap-claims-name-their-proof` was built for and cannot catch: that check
> holds `- [x]` lines to naming a proof, and this was **prose**. A lie has
> somewhere to hide as long as only the checkboxes are held. That is what
> `roadmap-prose-does-not-deny-what-exists` now closes.
>
> Correcting the sentence is what found the real fault, which was one layer down
> and on one node. `what-a-save-carries.test.ts` asks three questions of every pair
> of a box and a settable attribute — is it declared here, is it drawn here, does a
> value a reader sets survive a save — and opened at **11 undeclared, 12 with no
> control that reaches them, 11 that a save did not carry.** Every finding was
> `picture`: its renderer calls `paintCss` and `fillElements` like every other box,
> so a photograph drew a gradient, a shadow and a dashed border, and
> `slides-schema.ts` had widened it with the corners, the crop and the flip and
> stopped. The panel's rows ask the schema before they draw, so 채우기 and 효과 were
> missing from a picture; `setBoxStyle` filters its payload through
> `_declaredAttrs`, so a shadow asked for any other way was dropped in silence.
>
> Eleven declarations closed all three, and the count is now **0 / 0 / 0**. The
> lesson is about the harness rather than about paint: `every-attribute-is-read`
> and `every-property-can-be-edited` both walk the **schema** and ask the product,
> so an attribute the product *draws* and no schema declares is not a finding in
> either — it is not a subject. Both were green throughout.

**Deck 2 — transitions, then builds. Done (2026-09-06 에 확인).** 전환은 한 슬라이드가 다른
슬라이드를 대신하는 것이라 개체별 시간이 필요 없고 시간의 가장 작은 첫 쓰임이다. 빌드 — 등장·강조·
퇴장을, 순서대로, 지연과 함께 — 가 그 뒤에 같은 트랙을 쓴다.

*Done when* 이 이랬다: **덱이 모션과 함께 발표되고, 그것을 담은 문서의 어느 노드에도 시간 필드가
없을 때.** 둘 다 참이다. `duration` 과 `delay` 는 `motionStep` 에만 있고 `motionStep` 은 문서
**옆의** 트랙에 산다(`canvas-model.md` §4) — 모션을 모르는 노드도 움직일 수 있고, 타임라인이 없는
덱은 아무 대가도 치르지 않는다. 확인한 방법은 스키마에 직접 물은 것이다: 시간을 뜻하는 이름이
`motionStep` 밖의 어느 노드에도 없다.

**Deck 3 — masters and themes. 대부분 되어 있다 (2026-09-06 에 확인).** 스키마가 `slideMaster`·
`slideLayout`·`theme`·`themeId` 를 선언하고 `theme.ts` 가 그것을 푼다. 브라우저 검사도 있다 —
마스터 **3**, 디자인 **5**, 그리고 오늘 붙은 테마 값 검사 **9**.

*Done when* 은 *"테마를 바꾸면 모든 슬라이드가 바뀌고, 덮어쓴 슬라이드는 안 바뀔 때"* 이고, 그
둘째 절이 아직 검사로 없다. **덮어쓰기가 테마를 이기는지 묻는 검사 하나가 이 단계의 남은 전부다.**

**Deck 4 — media, and then the timeline. Done.** `mediaVideo` and `mediaAudio`
were taken out of the office schema the day it stopped declaring what nothing
drew; they came back *with* a renderer, a command and a control, and then the
timeline: tracks per shape, bars on an axis, a playhead that runs while the
preview does, curves, springs, presets, text animated by the letter, and the
trim — which was the last part open and is the first thing here that edits *time
inside a shape* rather than time on a slide. And a deck can be saved to a file and
opened again, which is what made the rest of it worth having.

The trim taught the thing worth keeping from this whole item: **a film is the one
step whose length is not in the document.** It is in the file, so the out-point
has no honest default and `0` means "to the end" — see `motion-model.md` §7g. It
is dragged now as well as typed, and its bar is the only one on the axis whose
edges are not "when" and "how long" (§7g-2).

Two things closed after this that belong to it: a shape's fills are drawn as
**elements**, which is what made the Ken Burns zoom, a real per-fill opacity and a
cross-fade between two photographs possible at all (§8d); and going **backwards**
through a show un-plays one press instead of leaving the slide, which turned up two
faults worse than the missing feature — an exit that came back on the next press,
and every exit but `fadeOut` hiding its shape from the moment the slide arrived
(§7h).

**Deck 5 — templates, and what a reader starts from. Done, and one claim in it was
wrong.** A new deck starts from something — one title slide with the definitions
under it, because an empty document is a white rectangle with nothing to click —
and a **gallery** now answers the question 새로 만들기 cannot: *what am I making?* A
talk has a contents slide and section dividers, a report puts its summary first,
and those are five slides in an order nobody types from memory. The design is one
sentence: **a template is a document**, the same shape as one opened from disk, so
everything that already reads a deck reads a template.

The claim this entry used to make — that `component` and `instance` "are what a
template is made of" — **conflated two features**, and it is worth correcting
rather than quietly dropping. A template is a whole document to *start from*, and
<!-- 없는 것이 설계다 -->
it needs no components at all. `component`/`instance` are about **reuse with
identity**: one definition, many placements, and the placements follow the
definition. Where the two meet is a template *library* — the card, the quote
block, the logo lockup a reader drops onto a page, and a brand template that stays
consistent because its slides are made *of* those pieces rather than of copies. So
components are what a **living** template is made of, and nothing a starting one
needs. They are still declared and still made by nothing; the design for them is
in `docs/specs/canvas-model.md` §10.

Two engine faults came out of the easy half, and both are the same shape: **a root
held across a load is the wrong root.** The view preferred the last tree it drew —
right for an edit, since that tree is a live proxy, wrong for `loadDocument`, which
makes a new root — and the environment the renderers resolve formatting against
had captured `rootId` at mount, so a new deck's theme was looked for under the old
document's. Both measured in the product, both fixed in the engine. See
`canvas-model.md` §7.

**Deck 6 — reuse, inheritance, and a deck that is not a line. Done.** Four things
that turned out to be one thing: *something defined once and used in many
places*, at four scales.

- **A component**, with variables a placement can be asked for, a slot for the
  reader's own things, and apply as a command. The measurement that shaped all of
  it: **a template cannot draw a foreign node**, so a placement holds real copies
  and following a definition is an edit rather than a lookup — which is the
  relationship Figma has across files, arrived at from the other direction.
- **A layout and a master**, editable at last: `applySlideLayout` had always said
  what a slide *follows* and nothing said what a layout **is**. The same
  editing-surface mechanism the first definition needed, which is what
  `canvas-model.md` §10c predicted when it was built.
- **A deck that is not a line**: a shape a reader presses, the deck's **map**
  drawn from those presses, and Keynote's *links only* as the first deck-level
  setting this schema has. The click was already there — `present.tsx` knew that
  a press which fires a trigger must not also advance the deck — so a jump was a
  new consequence rather than a new mechanism.
- **A library**: the reader's own decks by name (IndexedDB, chosen by measuring
  that a pictureless deck is 8–42KB and one photograph is a base64 megabyte), a
  button that opens another deck at a page, and a **brand kit** — a definition
  copied in from another deck that remembers where it came from and offers its
  newer self.

What this item kept teaching, in five different places: **the answer a reader
needs is usually one dialog away from where they are looking.** The way out of a
definition lived in a panel that might be closed; a stale brand kit said so only
in the dialog; a button pointing at another deck asked for a name nothing showed.
Each was a real fault and none of them was a missing feature.

**What is deliberately not on this list yet.** Charts, which need a data model
rather than a drawing; collaboration, which the whole product has no second
reader for; and an exporter to `.pptx`, which is worth doing when the model has
stopped moving.

---

## What would make this roadmap wrong

Worth writing down, so it is checked rather than assumed:

- **If the schema cannot express a spreadsheet's cell references.** A formula is
  a reference to another node, and this document model has no notion of one node
  pointing at another except by id in an attribute. That may be enough; nobody
  has tried.
- **If collaboration does not survive the split.** `collaboration` is 535 lines
  against `datastore`, and the id namespaces were only unified this month. A
  second product editing concurrently is the first real test.
- **If the operation harness does not generalise.** Every operation currently
  has an exact inverse and the four ratchets are at zero — for *this* schema.
  A schema with a grid, or with a canvas transform, is where that discipline
  either holds or is revealed as tuned to one document shape.
