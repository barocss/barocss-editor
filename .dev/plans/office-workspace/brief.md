# Wonffice 통합 작업 공간 — 실행 기록

기준일: 2026-09-13. 사용자 요청: `wonffice-delivery-scope.md`의 1–3단계가 완료될 때까지 진행한다.

## 구현

- `apps/office` + `packages/office-workspace`: 같은 origin에서 네 제품 생성·열기·검색·최근 자료·폴더·즐겨찾기·휴지통·복원.
- 제품 ID + 파일 ID + workspace ID로 문서 정체성을 유지. 제품별 순수 파일 어댑터 진입점을 추가.
- Word의 자동 저장 수명 주기를 공통 `DocumentSession`으로 이주. Slides/Site도 사용. Note는 기존 중첩 flush를 공통 이동 계약에 연결.
- 저장 실패 시 이동 중단, host/ID 변경 검출, 저장 중 새 입력 차단. 원본 revision 충돌은 복구 초안으로 분리.
- 제품 간 원본 참조/독립 사본 구분. Note 본문을 검증한 뒤 Site로 복사. 지원하지 않는 내용은 쓰기 전에 거부.
- 기존 JSON/Note 백업/제품 보관함 백업 이전. 복원은 새 사본. 원본과 초안 보존.
- 공통 컬럼 렌더러의 DSL `className` 타입 오류 수정. Site rail 탭 이름이 두 줄로 꺾이지 않도록 수정.
- Slides 편집 시 자료함 이름이 첫 슬라이드 내용으로 바뀌지 않도록 `docTitle` 우선 저장.

## 검사 증거

| 범위 | 결과 | 로그 |
| --- | --- | --- |
| 통합 생성·재열기·검색·관리·저장 실패·복원·참조·Note→Site·마지막 입력·이전 | 9 통과 | `/tmp/office-workspace-e2e-final.log` |
| 실제 제품 백업 다운로드 → 자료함 UI 복원 | 1 통과 | `/tmp/office-backup-ui-final.log` |
| Slides 수정 후 지정한 자료 이름/ID 보존 | 1 통과 | `/tmp/office-deck-name-final.log` |
| 공통 저장 큐·세션·호스트 소유권 | 12 통과 | `/tmp/shared-host-final.log` |
| Word 자동 저장·복구·보관함 | 3 통과 | `/tmp/word-save-final.log` |
| Slides 최종 이름 저장 및 자동 저장·복구 | 4 통과 | `/tmp/slides-name-save-final.log` |
| Site 자동 저장·충돌·중첩 본문 최종 입력 | 5 통과 | `/tmp/site-save-final.log` |
| Note 컬럼 및 백업 중 이동/충돌 초안 보호 | 3 통과 | `/tmp/note-workspace-host-regression.log` |
| Site 전체 단위 | 646 통과 | `/tmp/site-units-final.log` |
| Slides 전체 단위 | 1,054 통과 | `/tmp/slides-units-final.log` |
| 통합 host/API 타입 검사 | 통과 | `/tmp/office-types-release-scope.log` |
| 통합 다중 진입점 생산 빌드 | 통과. 큰 청크 경고 유지 | `/tmp/office-build-release-scope.log` |

명령은 앱 디렉터리에서 `pnpm exec playwright test`와 기록된 파일/grep을 사용했다. 통합 검사 파일은 `apps/office/tests/workspace.spec.ts`다. 단위는 해당 제품 패키지에서 `vitest run`, 공통 저장은 `src/document-save` 범위다. 전체 저장소 타입 검사나 모든 브라우저 조합을 통과했다고 표시하지 않는다.

## 실제 브라우저 확인

`http://localhost:5186/`을 열고 아래 자료를 실제 UI로 만들었다.

- Word: `Wonffice 통합 작업 보고서`. 편집기 → 자료함 이동 확인.
- Note: `Wonffice 제품 회의록`. 실제 키로 `Wonffice` 입력 후 바로 자료함 이동.
- Site: Note 관리 메뉴에서 `Wonffice 제품 회의록 · Site 사본` 생성. 편집 캔버스의 본문에 `Wonffice`가 유지되는 것을 확인.
- Slides: `Wonffice 실행 로드맵`. 같은 자료함에서 기존 Slides 편집기로 진입. 원본 참조 메뉴에서 `Wonffice 통합 작업 보고서`를 연결하고 실제 Word 화면으로 이동했다.
- 마지막 화면은 네 자료가 표시된 통합 자료함으로 두었다.

기존 Slides/Site 개발 자료는 해당 포트의 저장소에 유지한다. 새 샘플은 통합 주소의 저장소에만 만들었다.

## 범위 한계

1–3단계는 로컬 기본 제품의 종료 기준이다. 4–5단계의 계정·팀·서버 저장·권한·공동 편집·실제 Site 게시·폼·도메인은 구현 완료로 표시하지 않는다. PPTX 고급 호환과 추가 모션/차트, 후속 Word/Note 기능은 기존 후속 목록을 유지한다.

통합 호스트는 기존 제품 진입점을 재사용한다. 제품 전환은 전체 페이지 이동이며 세션 undo 이력은 영속 저장하지 않는다. 복원은 제품 저장소별 트랜잭션으로 처리한다. 실패 시 일부 사본이 남을 수 있으나 원본은 바꾸지 않는다. 외부 자산 URL은 파일 안에 남는다.

최종 확인: 통합 타입 검사/빌드 재실행 통과. Slides 패키지 전체 타입 검사는 기존 `editor-view-dom` 등의 미사용 선언 오류로 실패했다(`/tmp/slides-types-scope-final.log`). 새 저장 세션·제품 호스트·파일 어댑터 경로에는 오류가 보고되지 않았다. 이 전체 타입 정리는 5단계 출시 검증의 미완료 항목이다.
