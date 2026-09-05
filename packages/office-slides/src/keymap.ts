/**
 * The keys a deck binds, as data — not as a handler.
 *
 * The same division the toolbar model makes and for the same reason: what a
 * product binds is a fact about the product, and *how* the press is caught is
 * the host's. The overlay is what catches them, because only it knows whether
 * the reader is typing in a box or holding one.
 *
 * It exists because of a hole a list in the host cannot fill. `copyBoxes`,
 * `cutBoxes` and `pasteBoxes` were registered, working, tested and unreachable
 * — no key, no button — for a day, which is exactly the shape of failure this
 * repository builds checks for, committed the day after adding one. Nothing
 * could have caught it: the conformance harness can see what a product's
 * *toolbar* offers and had no way to see what its keys do.
 *
 * Now it can. `every-command-can-be-reached` reads this and the toolbar
 * together, and a command the product registers and neither surfaces is a
 * finding.
 */

import {
  chordFor,
  keyCommands,
  keyLabel as labelOfChord,
  matchesKey as matchesChord,
  type KeyModel
,
  taughtKeys} from '@barocss/office-controls';

/**
 * A deck's binding is `office-controls`' shape.
 *
 * The fields were declared here first and the site copied them under other names; the shape, the
 * matching and the way a chord is written for a reader are shared now. `needsSelection` reads the
 * same as it always did — almost every binding here needs boxes, and paste is the exception because
 * it needs somewhere to put something rather than something to act on, and an empty slide is
 * somewhere.
 */
export type SlidesKey = KeyModel;

/**
 * A nudge is one pixel, or a tenth of an inch with Shift held.
 *
 * Both are written out below as their own bindings rather than one binding that
 * reads the Shift key, so the list says exactly what a reader would be told and
 * the matcher can stay strict about modifiers. The first version had `ArrowRight`
 * matching whether or not Shift was down, which meant `Shift+ArrowRight` matched
 * *nothing* and a coarse nudge silently did not happen.
 */
const FINE = 15;
const COARSE = 144;

const nudge = (dx: number, dy: number, step: number) => ({ dx: dx * step, dy: dy * step });

export const SLIDES_KEYS: SlidesKey[] = [
  { key: 'Delete', command: 'deleteBoxes', needsSelection: true },
  { key: 'Backspace', command: 'deleteBoxes', needsSelection: true },
  { key: 'Mod+d', command: 'duplicateBoxes', needsSelection: true },
  // What every drawing tool binds.
  { key: 'Mod+g', command: 'groupBoxes', needsSelection: true },
  { key: 'Mod+Shift+g', command: 'ungroupBoxes', needsSelection: true },

  { key: 'Mod+c', command: 'copyBoxes', needsSelection: true },
  { key: 'Mod+x', command: 'cutBoxes', needsSelection: true },
  // The one that works with nothing selected; see `needsSelection`.
  { key: 'Mod+v', command: 'pasteBoxes' },

  { key: 'ArrowLeft', command: 'nudgeBoxes', payload: nudge(-1, 0, FINE), needsSelection: true },
  { key: 'ArrowRight', command: 'nudgeBoxes', payload: nudge(1, 0, FINE), needsSelection: true },
  { key: 'ArrowUp', command: 'nudgeBoxes', payload: nudge(0, -1, FINE), needsSelection: true },
  { key: 'ArrowDown', command: 'nudgeBoxes', payload: nudge(0, 1, FINE), needsSelection: true },

  { key: 'Shift+ArrowLeft', command: 'nudgeBoxes', payload: nudge(-1, 0, COARSE), needsSelection: true },
  { key: 'Shift+ArrowRight', command: 'nudgeBoxes', payload: nudge(1, 0, COARSE), needsSelection: true },
  { key: 'Shift+ArrowUp', command: 'nudgeBoxes', payload: nudge(0, -1, COARSE), needsSelection: true },
  { key: 'Shift+ArrowDown', command: 'nudgeBoxes', payload: nudge(0, 1, COARSE), needsSelection: true },

  /**
   * A guide, from the keyboard.
   *
   * The rulers are controls — `role="separator"` with a label — and nothing placed a guide
   * without a drag, so the reader who most needs to be told the ruler is there could not
   * use it. `Alt+.` and `Alt+,` for the two axes, and `Alt+<` to clear them: away from every
   * text chord, and next to each other on the keyboard for two halves of one idea.
   *
   * The clear chord is written `<` and not `,` **because that is the key that arrives**.
   * Measured: Shift composes the character before the event is dispatched, so a binding
   * matched on `,` with Shift required matches nothing at all — the same trap the nudge
   * bindings hit from the other side, where `ArrowRight` matched with or without Shift and
   * the coarse nudge silently did not happen.
   *
   * Not `needsSelection`: with nothing picked the guide goes down the middle of the slide,
   * which is where the first guide on an empty slide belongs anyway.
   */
  { key: 'Alt+.', command: 'addSlideGuide', payload: { axis: 'x' } },
  { key: 'Alt+,', command: 'addSlideGuide', payload: { axis: 'y' } },
  { key: 'Alt+Shift+<', command: 'clearSlideGuides' },

  /*
   * ## The three the menubar was teaching and nothing answered
   *
   * Measured in a browser, one chord at a time: ⌘S, ⌘M and F5 were printed beside their labels in
   * 파일, 편집 and 보기, and pressing them changed nothing. The menu entries themselves all worked —
   * so the fault was never the act, it was that the chord was **typed** beside the label instead of
   * being read from here.
   *
   * Two of the three are **views**, which is why they could not have been added before: this list
   * could only name commands, and saving a file and starting a show are the app's rather than the
   * deck's. The site builder found the same limit on the same day, from the other end.
   */
  { key: 'Mod+m', command: 'insertSlide' },
  { key: 'Mod+s', view: 'file.save' },
  // What every presentation tool has bound since before any of this.
  { key: 'F5', view: 'present' },

  /*
   * And undo, which the *engine* also binds — `Mod+z` → `historyUndo`, gated on `editorFocus`. So
   * this fires only where that does not: a reader holding a box is not in any text, and the deck's
   * whole select mode was outside the engine's reach. The host checks `defaultPrevented` so the two
   * cannot both run, which is the one-line lesson the site builder paid for with a double undo.
   */
  { key: 'Mod+z', command: 'historyUndo' },
  { key: 'Mod+Shift+z', command: 'historyRedo' }
];

/** Every command a key can run, for the check that asks what is reachable. */
export function slidesKeyCommands(): string[] {
  return keyCommands(SLIDES_KEYS);
}

/**
 * Whether a press matches a chord — `office-controls`', so every product matches alike.
 *
 * Kept under this name because the overlay calls it and the name reads correctly there. What moved
 * is the body: the old one compared `event.key` for every chord, which cannot match a digit — `⇧1`
 * types `!` on a US layout and something else on several others.
 */
export function matchesKey(
  entry: SlidesKey,
  event: Parameters<typeof matchesChord>[1]
): boolean {
  return matchesChord(entry, event);
}

/**
 * The chord a command **or a view** is bound to, if it is bound to one.
 *
 * The *first* binding, because several keys can run one command — every nudge is `nudgeBoxes` — and
 * what a button wants to say is one chord rather than eight.
 */
export function shortcutOf(what: string | { command?: string; view?: string }): string | undefined {
  return chordFor(taughtKeys(SLIDES_KEYS), typeof what === 'string' ? { command: what } : what);
}

/** A chord as a reader reads it — see `office-controls`, where the two conventions are written out. */
export function keyLabel(chord: string | undefined, apple: boolean): string | undefined {
  return labelOfChord(chord, apple);
}
