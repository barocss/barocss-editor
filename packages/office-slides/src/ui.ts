/**
 * **이 제품의 React 부품** — `@barocss/office-slides/ui`.
 *
 * 루트(`.`)는 **모델**이고 Node 에서도 읽혀야 한다 — 검사와 하네스가 브라우저 없이 묻는다.
 * 루트에 React 뷰를 두면 모델만 원하는 쪽이 DOM 까지 끌고 오고, 그러면 Node 가
 * *Named export 'EditorViewDOM' not found* 로 죽는다. `office-site` 에서 실제로 그랬고
 * **283개짜리 브라우저 회차가 통째로 안 돌았다.**
 *
 * 문을 조각마다가 아니라 **경계마다** 두는 이유는 `docs/specs/architecture.md` 에 있다:
 * 경계는 *React 가 필요한가* 이지 *어느 조각인가* 가 아니다.
 *
 * React 는 **peerDependency** 다 — 어느 React 를 쓸지는 호스트가 정한다.
 *
 * 아직 비어 있다. 셸 이주가 여기를 채운다.
 */
export {};
