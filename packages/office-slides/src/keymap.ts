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

export interface SlidesKey {
  /**
   * The chord, with `Mod` for "Cmd on a Mac and Ctrl everywhere else".
   *
   * Written the way a reader would say it rather than as a browser event, so
   * the list reads as a list of shortcuts: `Mod+Shift+g`, `Delete`, `ArrowUp`.
   */
  key: string;
  command: string;
  /** What the command is given. Fixed, because the chord says which case it is. */
  payload?: Record<string, unknown>;
  /**
   * Whether boxes have to be selected for this to mean anything.
   *
   * Almost all of them: what Delete means depends entirely on what is selected.
   * Paste is the exception — it needs somewhere to put something rather than
   * something to act on, and an empty slide is somewhere.
   */
  needsSelection?: boolean;
}

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
  { key: 'Alt+Shift+<', command: 'clearSlideGuides' }
];

/** Every command a key can run, for the check that asks what is reachable. */
export function slidesKeyCommands(): string[] {
  return [...new Set(SLIDES_KEYS.map((entry) => entry.command))];
}

/**
 * Whether a press matches a chord.
 *
 * Here rather than in the host so that the list and the matching cannot drift:
 * a chord written `Mod+Shift+g` and matched by a handler that forgot Shift is
 * two statements about one binding.
 */
export function matchesKey(entry: SlidesKey, event: {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  const parts = entry.key.split('+');
  const wanted = parts[parts.length - 1].toLowerCase();
  if (event.key.toLowerCase() !== wanted) return false;

  const mod = parts.includes('Mod');
  const shift = parts.includes('Shift');
  const alt = parts.includes('Alt');

  if (mod !== (event.metaKey || event.ctrlKey)) return false;
  if (shift !== event.shiftKey) return false;
  if (alt !== event.altKey) return false;
  return true;
}

/**
 * The chord a command is bound to, if it is bound to one.
 *
 * The *first* binding, because several keys can run one command — every nudge is
 * `nudgeBoxes` — and what a button wants to say is one chord rather than eight.
 * A control asks by command, which is the only name it has for the thing it does.
 */
export function shortcutOf(command: string): string | undefined {
  return SLIDES_KEYS.find((entry) => entry.command === command)?.key;
}

/** The symbols a chord is drawn with, which is not what it is written as. */
const SIGNS: Record<string, string> = {
  Shift: '⇧',
  Alt: '⌥',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Delete: 'Del',
  Backspace: '⌫',
  Escape: 'Esc'
};

/**
 * A chord as a reader reads it — `Mod+d` → `⌘D` on a Mac, `Ctrl+D` elsewhere.
 *
 * Two conventions, and they are not a preference: Apple writes chords as symbols
 * with nothing between them and everyone else writes them as words joined by
 * plus signs. A tool that shows `Ctrl+D` on a Mac looks like it was ported, which
 * is the whole thing this is for.
 *
 * `apple` comes in rather than being sniffed here, because a pure function of the
 * platform is testable and `navigator` is not — and the caller knows anyway.
 */
export function keyLabel(chord: string | undefined, apple: boolean): string | undefined {
  if (!chord) return undefined;

  const parts = chord.split('+').map((part) => {
    if (part === 'Mod') return apple ? '⌘' : 'Ctrl';
    if (SIGNS[part]) return apple ? SIGNS[part] : part;
    // A single letter is shown as a capital: `⌘D`, not `⌘d`.
    return part.length === 1 ? part.toUpperCase() : part;
  });

  return apple ? parts.join('') : parts.join('+');
}
