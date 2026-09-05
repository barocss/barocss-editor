/**
 * **사이트 빌더의 React 부품** — `@barocss/office-site/ui`.
 *
 * ## 왜 루트가 아닌가
 *
 * 루트(`.`)는 **모델**이다: 무엇이 어느 폭에서 보이나, 어떤 명령이 있나, 무엇이 무엇을 참조하나.
 * 그건 Node 에서도 읽혀야 한다 — 검사와 하네스가 브라우저 없이 묻는다.
 *
 * 루트에 React 뷰를 두면 모델만 원하는 쪽이 DOM 까지 끌고 온다. 재본 것:
 * `apps/site/tests/site.spec.ts` 가 Node 에서 `siteControlsIn` 하나를 가져오는데, 루트가
 * `page-frame` 을 지나자 `editor-view-dom` 이 딸려 왔고 Node 가 *Named export 'EditorViewDOM' not
 * found* 로 죽었다. **283개짜리 브라우저 회차가 통째로 안 돌았다.**
 *
 * ## 왜 조각마다가 아니라 하나인가
 *
 * 첫 두 조각은 `./view`(판)와 `./rail`(레일)로 하나씩 뒀다. 그건 조각이 둘일 때의 답이고, 셸
 * 이주가 끝나면 열 개쯤 된다 — **진입점 열 개는 경계가 아니라 목록이다.**
 *
 * 경계는 *React 가 필요한가* 이지 *어느 조각인가* 가 아니다. 그래서 문은 둘이다:
 * `.` 은 모델, `./ui` 는 화면. 조각이 늘어도 문은 안 는다.
 *
 * React 는 **peerDependency** 다 — 어느 React 를 쓸지는 호스트가 정한다.
 */
export { Admin, adminTab, type AdminTab } from './admin';
export { Inspector, addPicture } from './inspector';
export { Overlay, type PointerMode } from './overlay';
export { PageFrame, type PageFrameProps } from './page-frame';
export { Rail, type Panel } from './rail';
