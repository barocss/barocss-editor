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
 */
export function hasRange(
  editor: Editor,
  payload?: { selection?: ModelSelection },
  wants: 'caret' | 'something' = 'caret'
): boolean {
  const selection = payload?.selection ?? (editor as { selection?: ModelSelection }).selection;
  if (!selection || selection.type !== 'range') return false;
  return wants === 'caret' || !selection.collapsed;
}
