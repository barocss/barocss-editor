import type { Editor, ModelSelection } from '@barocss/editor-core';

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
 */
export function hasRange(
  editor: Editor,
  payload?: { selection?: ModelSelection },
  wants: 'caret' | 'something' = 'caret'
): boolean {
  const selection = payload?.selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!selection || selection.type !== 'range') return false;
  if (wants === 'caret') return true;

  // Two points, and they are not the same point. `collapsed` is honoured where a caller has bothered
  // to set it, because a caller that says so is making a claim about a selection this cannot see.
  if (selection.collapsed === true) return false;
  return (
    selection.startNodeId !== selection.endNodeId || selection.startOffset !== selection.endOffset
  );
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
