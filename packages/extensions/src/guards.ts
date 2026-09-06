import { isCollapsedSelection, type Editor, type ModelSelection } from '@barocss/editor-core';
import { selectsCharacters, type ModelTextReader } from '@barocss/shared';

/**
 * What a command's `canExecute` should say when its `execute` needs a **range**.
 *
 * ## The fault this is one line against
 *
 * Written after `every-command-does-something` was pointed at a deck and reported five commands that
 * said yes and did nothing: `setFontColor`, `removeFontColor`, `toggleBulletList`,
 * `toggleOrderedList` and `insertTable`. Every one of them is the same two lines —
 *
 * ```ts
 * execute: (ed, payload) => {
 *   const selection = payload?.selection ?? ed.selection;
 *   if (!selection || selection.type !== 'range') return false;   // ← asks for a range
 *   …
 * },
 * canExecute: () => true                                          // ← and does not
 * ```
 *
 * — and it is the class this repository has now found **nine** of. It is worse than a `canExecute`
 * that is wrong, because the product looks like it works: the control lights up, the reader presses
 * it, and the reason it declined goes to a console nobody is watching.
 *
 * ## Why it was invisible for so long
 *
 * In a word processor the selection is a range essentially always, so the guard and the command
 * agree in every state anybody looked at. It takes a product where a **node** can be selected — a
 * deck, a page builder — for the two to come apart, and then it comes apart everywhere at once.
 *
 * ## Collapsed or not
 *
 * `wants: 'something'` for a command that acts on the *text between two points* — a colour, a link,
 * a copy — because applying one to a caret is a transaction that commits and changes nothing.
 * `wants: 'caret'` (the default) for one that acts on the **block the caret is in**: a list toggle
 * and a table insert both work perfectly from a collapsed selection, and demanding a selection would
 * make a reader select a paragraph to make it a list.
 *
 * ### And it is measured from the offsets, which is where the truth is
 *
 * This read `selection.collapsed` — **a field nothing sets.** `SelectionManager` stores what it is
 * handed and the view builds a range from two points; neither computes it, so the field is `undefined`
 * essentially always and `!undefined` is `true`. So `'something'` said *yes, there is a selection* for
 * a bare caret, in all seventeen places it is asked, and the whole point of that argument is to stop
 * a mark being applied over zero characters — the exact fault this file was written for, present in
 * the line meant to prevent it.
 *
 * Found while writing a test for 미주's guard: it lit up over a caret, and it was one of the last
 * commands to be given the argument rather than the first to be wrong.
 *
 * ## 두 끝이 다른 노드일 때 — 여기가 마지막 한 칸이고, 여기서만 답할 수 있다
 *
 * `t1:2 → t2:0` 은 sid 가 둘이다. 그런데 두 런이 **인접하면 화면의 같은 점**이고 고른 글자는 0개다.
 * `Shift+→` 로 런 경계를 넘거나, 런 경계를 가로질러 드래그를 시작했다 그 자리에서 놓으면 나온다.
 *
 * 그 답을 낼 수 있는 자리가 여기 하나뿐인 이유:
 *
 * | 누가 | 무엇을 아나 | 그래서 |
 * |---|---|---|
 * | `shared/fromDOMSelection` | DOM 의 두 끝 | sid 가 다르면 `collapsed: false` — **두 끝만 보면 옳다** |
 * | `editor-core/isCollapsedSelection` | 선택 하나 | 같은 노드까지만. 주석에 그렇게 적혀 있다 |
 * | `hasRange` | 선택 **과 편집기** | 문서를 읽을 수 있다 |
 *
 * 증상은 밖에서 이렇게 보였다: 인접한 두 런 사이에 캐럿을 놓으면 **버블 툴바가 떴다** — 고른 글자가
 * 하나도 없는데. 그 자리에서 굵게를 누르면 커밋되고 아무것도 안 바뀐다. 이 파일이 아홉 번 세어 둔
 * *guard says yes, then does nothing* 이 열 번째로 온 것이고, 이번에는 명령이 아니라 **가드 자신이**
 * 그 모양이었다.
 *
 * `wants: 'caret'` 은 이 걸음을 걷지 않는다. 캐럿에서 도는 명령들(목록 토글, 표 삽입)은 *글자가
 * 있는가* 를 안 묻고, 그 자리에 문서 훑기를 넣으면 아무것도 사지 않고 값만 치른다.
 */
export function hasRange(
  editor: Editor,
  payload?: { selection?: ModelSelection },
  wants: 'caret' | 'something' = 'caret'
): boolean {
  const selection = payload?.selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!selection || selection.type !== 'range') return false;
  if (wants === 'caret') return true;

  /*
   * 두 끝이 같은 노드이면 오프셋이 이미 답을 말했다. 그리고 `collapsed: true` 라고 **적어 준**
   * 호출자는 이것이 볼 수 없는 선택에 대해 주장을 하는 것이므로 그대로 믿는다. `false` 는 믿지
   * 않는다 — `fromDOMSelection` 이 sid 가 다를 때 적는 것이 그 `false` 이고, 그건 지식이 아니라
   * *두 끝만으로는 모른다* 의 다른 표기다.
   */
  if (isCollapsedSelection(selection)) return false;
  if (selection.startNodeId === selection.endNodeId) return true;

  /*
   * sid 가 둘. 그 사이에 글자가 있는지는 문서만 안다. 문서를 못 읽으면 **예** 라고 답한다 —
   * 모르는 채로 명령을 끄면 되는 것이 안 되고, 그건 이 가드가 막으려는 것보다 나쁘다.
   */
  const store = editor.dataStore as ModelTextReader | undefined;
  if (!store || typeof store.getNode !== 'function') return true;
  return selectsCharacters(store, selection);
}

/**
 * Whether the selected text carries a mark — of one kind, or of any kind.
 *
 * The tighter half of `hasRange(…, 'something')`, for the commands that *take something off*: over
 * unlinked words 링크 제거 committed and did nothing, and 서식 지우기 did the same over plain text.
 * A range is the right question for applying a mark and the wrong one for removing it.
 *
 * `link.ts` had this written as the thing it was deliberately not doing — *"worth having the day a
 * reader complains that it is offered on unlinked words"* — and the day arrived as a measurement
 * rather than a complaint, which is the point of the harness.
 *
 * Asked by a guard, so it walks and stops at the first run wearing something rather than collecting.
 */
export function wears(
  editor: Editor,
  selection: ModelSelection | undefined,
  kind?: string
): boolean {
  const at = selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!at || at.type !== 'range') return false;

  const store = editor.dataStore as
    | {
        createRangeIterator?: (
          from: string,
          to: string,
          options: { includeStart: boolean; includeEnd: boolean }
        ) => Iterable<string>;
        getNode: (
          id: string
        ) => { text?: string; marks?: Array<{ stype?: string; range?: [number, number] }> } | undefined;
      }
    | undefined;
  if (!store?.createRangeIterator) return false;

  for (const sid of store.createRangeIterator(at.startNodeId, at.endNodeId, {
    includeStart: true,
    includeEnd: true
  })) {
    const node = store.getNode(sid);
    if (typeof node?.text !== 'string' || !node.marks?.length) continue;

    const from = sid === at.startNodeId ? at.startOffset : 0;
    const to = sid === at.endNodeId ? at.endOffset : node.text.length;
    if (from >= to) continue;

    for (const mark of node.marks) {
      if (kind && mark.stype !== kind) continue;
      // A mark counts only where it actually reaches the selected part of the run.
      const [ms, me] = mark.range ?? [0, node.text.length];
      if (me > from && ms < to) return true;
    }
  }
  return false;
}
