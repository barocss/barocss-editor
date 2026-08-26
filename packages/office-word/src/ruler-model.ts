/**
 * What Word's **ruler** writes, as data.
 *
 * ## Why a ruler needs a declaration at all
 *
 * Word has no property panel. Its chrome is a ribbon, a ruler, an overlay for shapes, and three
 * read-only panes — so when the harness asks *"which attributes can a reader set"*, the ribbon can
 * now answer (`Control.writes`) and the ruler could not answer anything, while being the **only**
 * place in the product a paragraph's indents and its tab stops can be changed.
 *
 * That is a surface with no declaration, which is the fault `toolbar-model.ts` and `keymap.ts` were
 * written to fix and which the deck and the site have now fixed for their panels. This is the same
 * move for the one surface Word has that they do not.
 *
 * ## Why it is a list and not a component model
 *
 * A ruler is not rows. It is a strip with markers dragged along it, and there is nothing for a host
 * to draw from a declaration — `ruler.tsx` is 561 lines of geometry and hit-testing and will stay
 * that way. What is declarable is the only thing the harness needs: **which attributes a drag
 * writes, and through which command.** So this says that and no more, and the guard against it going
 * stale is `ruler-model.test.ts`, which asserts every command named here is one the product
 * registers.
 */

export interface RulerControl {
  /** What is dragged. */
  id: string;
  /** What a reader would call it. */
  label: string;
  /** The command the drag runs. */
  command: string;
  /** Which attributes it writes — the question `every-property-can-be-edited` asks. */
  writes: string[];
}

export const WORD_RULER: RulerControl[] = [
  /*
   * The three indent markers, which are one command because they are one act: a reader drags a
   * triangle and the paragraph's indents are rewritten together — dragging the left marker moves the
   * hanging indent with it, which is what every word processor does and why `setParagraphIndents`
   * takes a map rather than a field.
   */
  {
    id: 'indent-left',
    label: '왼쪽 들여쓰기',
    command: 'setParagraphIndents',
    writes: ['indentLeft', 'indentHanging']
  },
  {
    id: 'indent-first-line',
    label: '첫 줄 들여쓰기',
    command: 'setParagraphIndents',
    writes: ['indentFirstLine']
  },
  {
    id: 'indent-right',
    label: '오른쪽 들여쓰기',
    command: 'setParagraphIndents',
    writes: ['indentRight']
  },
  /*
   * And the tab stops, which are the ruler's own: a click on the strip puts one where the click was,
   * a drag moves it, and dragging it off takes it away. There is nowhere else in Word to set one —
   * which is why `tabs` is exempt from `every-attribute-is-read` (a layout pass reads it) and must
   * *not* be exempt from this one.
   */
  {
    id: 'tab-stops',
    label: '탭 위치',
    command: 'setTabStops',
    writes: ['tabs']
  }
];

/** Every command the ruler runs, for the harness's "what can a reader reach". */
export function wordRulerCommands(): string[] {
  return [...new Set(WORD_RULER.map((one) => one.command))];
}

/** Every attribute it writes, for "what can a reader change". */
export function wordRulerAttrs(): string[] {
  return [...new Set(WORD_RULER.flatMap((one) => one.writes))];
}
