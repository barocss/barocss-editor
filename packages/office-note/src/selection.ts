import { NOTE_BLOCKS, type NoteBlock } from './note-schema';

/**
 * **글 안에서 클릭이 뜻하는 것** — a caret, or a block.
 *
 * ## Why a body needs this at all
 *
 * In a document a click puts a caret somewhere and that is the whole answer. A body is not only
 * words: a picture, a video, a rule and a table are things a reader **points at**, and a caret has
 * nowhere to go in any of them. Without a second answer a note is a text editor with four blocks a
 * reader can put in and never touch again — which is what it was. Measured: clicking a picture did
 * nothing at all, and there was no way to give it a file, move it or take it out.
 *
 * The site builder has the same split (`SELECTABLE` / `TEXTUAL`) and reached it the same way, six
 * recorded times over. This is that lesson taken rather than repeated.
 *
 * ## The rule, and it is not a list of exceptions
 *
 * **A block whose words a reader edits takes the caret. Everything else is pointed at.** Which comes
 * out as: a heading, a paragraph, a list and a quotation hold writing — a click lands in the words,
 * inside whatever holds them. A picture, a video, an embed, a rule and a table are the body's
 * furniture.
 *
 * A `codeBlock` is furniture here and it is the one that needs saying: the caret does not enter one
 * — it is drawn as tokens nothing in the document owns, and the site's `TEXTUAL` leaves it out for
 * the same reason.
 */
export const NOTE_PICKED: readonly NoteBlock[] = [
  'picture',
  'mediaVideo',
  'mediaEmbed',
  'horizontalRule',
  'bTable',
  'codeBlock'
] as const;

/** And the rest, which is the same list from the other side — a check holds the two together. */
export const NOTE_WRITTEN: readonly NoteBlock[] = NOTE_BLOCKS.filter(
  (one) => !(NOTE_PICKED as readonly string[]).includes(one)
);

/**
 * **Held, and the words inside it are still words** — the table.
 *
 * A block being pointed at and a block having no text are two different facts, and treating them as
 * one deleted a reader's table. Measured, in the smallest possible test: insert a table, click a
 * cell, type 이름, press Backspace — **the whole table went**, because Backspace on a held block
 * removes it and the table was held the moment the cell was clicked.
 *
 * So `bTable` is pointed at *and* written in. It is held because it is a thing a reader moves, sizes
 * and removes as one; its cells take the caret because that is what a table is for. Backspace
 * belongs to whichever of the two the caret is currently in — see `NoteBody`.
 *
 * `codeBlock` is not on this list and that is the difference: no caret ever enters one, so there is
 * no text for a key to belong to.
 */
export const NOTE_PICKED_WRITTEN: readonly NoteBlock[] = ['bTable'] as const;

/** Whether a click on this kind of block selects it rather than putting a caret in it. */
export function isPicked(stype: unknown): boolean {
  return (NOTE_PICKED as readonly string[]).includes(String(stype));
}

/**
 * Whether a held block of this kind still has words in it — which is to say, whether a key press
 * inside it is the block's business or the writing's.
 */
export function holdsWriting(stype: unknown): boolean {
  return (NOTE_PICKED_WRITTEN as readonly string[]).includes(String(stype));
}

/**
 * The block a press is on — the nearest thing above the target that a reader can point at.
 *
 * Walks the **DOM** rather than the model, because what a reader pressed is a pixel and the element
 * under it is the honest answer to *which one*. `data-bc-sid` is on every drawn node, so the walk is
 * up the ancestors until one of them is a kind that is pointed at.
 *
 * Stops at the body: a press on the padding around the writing is not a press on the last block, and
 * returning one would make the empty space at the bottom of a note select whatever is above it.
 */
export function pickedAt(
  target: Element | null,
  stypeOf: (sid: string) => string | undefined
): string | undefined {
  let at: Element | null = target;
  for (let depth = 0; at && depth < 32; depth += 1) {
    if (at.hasAttribute?.('data-note-body')) return undefined;
    const sid = at.getAttribute?.('data-bc-sid');
    if (sid && isPicked(stypeOf(sid))) return sid;
    at = at.parentElement;
  }
  return undefined;
}

/**
 * The **cell** a press is in, or nothing — the other half of what a click in a body can mean.
 *
 * A table is held as one block and written in cell by cell, so a press on it has two answers: *this
 * table* and *that cell*. `pickedAt` gives the first; this gives the second, and the four row and
 * column acts need it because before and after are only meaningful next to a cell.
 *
 * Read from the DOM for the same reason `pickedAt` is: what a reader pressed is a pixel, and the
 * element under it is the honest answer. The caret would do — except right after an insert the
 * model's caret is on the table's header, above every cell, while the caret the reader sees is in
 * the first one. Two answers, and the buttons went dead on the one nobody could see.
 */
export function cellAt(
  target: Element | null,
  stypeOf: (sid: string) => string | undefined
): string | undefined {
  let at: Element | null = target;
  for (let depth = 0; at && depth < 32; depth += 1) {
    if (at.hasAttribute?.('data-note-body')) return undefined;
    const sid = at.getAttribute?.('data-bc-sid');
    if (sid) {
      const stype = stypeOf(sid);
      if (stype === 'bTableCell' || stype === 'bTableHeaderCell') return sid;
      if (stype === 'bTable') return undefined;
    }
    at = at.parentElement;
  }
  return undefined;
}
