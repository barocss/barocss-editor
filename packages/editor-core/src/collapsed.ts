import type { MaybeSelection, ModelSelection } from './types';

/**
 * **캐럿인가** — 그리고 그 답을 누가 갖고 있나.
 *
 * ## 무엇이 있었나
 *
 * `ModelSelection.collapsed` 는 **선택적 필드**다. 그래서 *캐럿* 이라는 하나의 사실이 저장소 안에서
 * 두 벌로 다녔다:
 *
 * | 묻는 쪽 | 어떻게 | 깃발 없는 캐럿에 |
 * |---|---|---|
 * | `editor-core` — `_updateBuiltinContext`, `deleteSelection` | **필드**를 읽는다 | 범위라고 답한다 |
 * | `office-editor-ui/slash-menu.tsx` | 필드가 없으면 **두 끝을 비교** | 캐럿이라고 답한다 |
 *
 * 둘 다 같은 선택을 보고 다르게 답했고, 그래서 사이트에서 `/` 를 치면 **슬래시 메뉴와 버블 툴바가
 * 같이 떴다.** `site.spec.ts:8298` 이 27회 중 4회 실패한 것이 그 모양이다 — 필드를 안 적는 쓰기
 * 경로가 남아 있는 한 15% 는 부하에 따라 오간다.
 *
 * ## 그래서 규칙은 하나다: **`collapsed` 는 기억하는 것이 아니라 계산하는 것이다**
 *
 * 두 끝이 같은 노드에 있으면 접혔는지 아닌지는 **오프셋이 이미 말한다.** 그 자리에서 필드는
 * 되풀이이거나 거짓말이지 정보가 아니다. 그러므로 같은 노드일 때는 필드를 믿지 않고 세고, 필드를
 * 그 답으로 **덮어쓴다** — `{startOffset: 2, endOffset: 2, collapsed: false}` 는 모순이고, 모순을
 * 그대로 두는 것이 이 저장소가 세 번 겪은 모양이다.
 *
 * ## 노드가 다르면 여기서 답하지 않는다
 *
 * `t1:2 → t2:0` 은 sid 가 둘이지만 **화면의 같은 점**일 수 있다 — 두 런이 인접하면 그 사이에 글자가
 * 없다. 그것을 알려면 문서를 읽어야 하고, 이 함수는 문서를 모른다. 그래서 준 값을 그대로 둔다.
 *
 * **그 마지막 한 칸은 이제 닫혔고, 여기가 아니다.** `extensions/src/guards.ts` 의 `hasRange` 가
 * 편집기를 손에 쥐고 있으므로 문서를 읽을 수 있고, `@barocss/shared` 의 `selectsCharacters` 로
 * *두 자리 사이에 글자가 있는가* 를 묻는다. 이 함수는 그 앞까지만 답하고 — 그것이 선택 하나만
 * 보는 함수가 답할 수 있는 전부다 — 술어의 나머지는 그 층에 있다.
 * 검사: `extensions/test/guards.test.ts`, `shared/src/selection-text.test.ts`.
 *
 * ## `range` 에만 뜻이 있다
 *
 * `node`·`cell`·`table` 은 *것들의 목록* 이고 두 끝은 첫/마지막 노드를 넣어 둔 자리일 뿐이다
 * (`docs/specs/selection.md`). 거기서 `startOffset === endOffset` 은 늘 참이므로, 종류를 안 가리고
 * 세면 **도형 셋을 고른 선택이 캐럿이 된다.**
 */
export function isCollapsedSelection(selection: MaybeSelection | ModelSelection | null | undefined): boolean {
  if (!selection || selection.type !== 'range') return false;
  const range = selection as ModelSelection;
  if (range.startNodeId === range.endNodeId) return range.startOffset === range.endOffset;
  return range.collapsed === true;
}

/**
 * **같은 선택에 계산된 깃발을 붙여 돌려준다.** 문에서 한 번 부르면 그 뒤로는 아무도 안 물어도 된다.
 *
 * 리터럴마다 `collapsed: true` 를 적는 것으로는 부족하다 — 접힘은 **인자에서도** 나온다:
 * `selectRange(nodeId, 3, 3)` 의 리터럴은 `startOffset: start, endOffset: end` 라 글자로는 캐럿이
 * 아니고 실행하면 캐럿이다. 리터럴을 세는 검사(`every-caret-says-it-is-collapsed`)는 그 모양을 볼
 * 수 없고, 이 함수는 볼 수 있다.
 *
 * 바뀔 것이 없으면 **같은 객체**를 돌려준다. 선택은 이벤트로 실려 다니고, 뜻 없이 새 객체를 만들면
 * 동일성으로 비교하는 쪽이 매번 다르다고 답한다.
 */
export function withDerivedCollapsed<T extends ModelSelection>(selection: T): T;
export function withDerivedCollapsed(selection: null | undefined): null;
export function withDerivedCollapsed<T extends ModelSelection>(selection: T | null | undefined): T | null {
  if (!selection) return null;
  if (selection.type !== 'range') return selection;
  if (selection.startNodeId !== selection.endNodeId) return selection;

  const collapsed = selection.startOffset === selection.endOffset;
  if (selection.collapsed === collapsed) return selection;
  return { ...selection, collapsed };
}
