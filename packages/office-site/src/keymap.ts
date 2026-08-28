/**
 * The keys a site builder binds, as data — not as a handler.
 *
 * ## Why this is not in the app
 *
 * It was, and the conformance harness is what found it: `removeBlocks` and `duplicateBlocks` came
 * back from `every-command-can-be-reached` as commands nothing surfaces, while a reader could press
 * `Delete` and `⌘D` and watch them work. The check was not wrong — it can see a product's toolbar
 * and its key map, and this product's key map was a `keydown` listener in `apps/site`. A binding
 * kept where the check cannot look is a binding nothing can hold to anything.
 *
 * The deck learned the same thing the same way and its comment says it best: what a product binds is
 * a fact about the product; *how* the press is caught is the host's. Here the host is the overlay,
 * because only it knows whether the reader is in the text or holding a block.
 */

export interface SiteKey {
  /** The chord, with `Mod` for "Cmd on a Mac and Ctrl everywhere else". */
  key: string;
  /** What it runs. A binding names a command **or** a view, exactly as a menu entry does. */
  command?: string;
  /**
   * …or how the reader is looking, which is not a command and never will be.
   *
   * The zoom is the app's, not the document's — `menu-model.ts` made the same split for the same
   * reason, and a key map that could only name commands would have left every chord in 보기 unbound
   * while the menu went on teaching them.
   */
  view?: string;
  /** What the command is given. Fixed, because the chord says which case it is. */
  payload?: Record<string, unknown>;
  /**
   * Which mode the press belongs to.
   *
   * `select` is the builder's own: the reader is holding blocks, so `Delete` means *take this away*.
   * In `text` the very same key is a letter, and a builder that took it would be a builder nobody
   * could write a sentence in.
   */
  mode: 'select' | 'text' | 'any';
  /** Whether something has to be selected for this to mean anything. */
  needsSelection?: boolean;
  /**
   * What the act needs told, in the menu's own word.
   *
   * `'page'` means *the page on screen*, which the model has no notion of and should not grow one —
   * so the app says it. Named the same way `MenuEntryModel` names it because it is the same fact: a
   * chord and a menu entry are two ways to reach one act, and the act needs the same thing either
   * way. Without it ⌘A reached `selectAllBlocks` with no page and the command refused, correctly.
   */
  needs?: 'page';
  /** What a reader would be told this does, in a tooltip or a menu. */
  label: string;
}

export const SITE_KEYS: SiteKey[] = [
  {
    key: 'Delete',
    command: 'removeBlocks',
    mode: 'select',
    needsSelection: true,
    label: '선택한 블록 삭제'
  },
  {
    // Both, because a reader reaches for whichever their keyboard has and means the same thing.
    key: 'Backspace',
    command: 'removeBlocks',
    mode: 'select',
    needsSelection: true,
    label: '선택한 블록 삭제'
  },
  {
    key: 'Mod+d',
    command: 'duplicateBlocks',
    mode: 'select',
    needsSelection: true,
    label: '선택한 블록 복제'
  },

  /*
   * ## The eleven the menubar was teaching and nothing answered
   *
   * Measured in a browser, chord by chord, with a block selected: ⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A, ⌘F and
   * the four zoom keys — **every one of them did nothing**, while the menu printed the chord beside
   * the entry. A menubar's hint is not decoration; it is the product promising that the reader can
   * stop opening the menu.
   *
   * They were unbound because this list was **read by nobody**: the app had its own `keydown` with
   * `Delete` and `⌘D` written into it, and this file existed so `every-command-can-be-reached` could
   * see two commands. A declaration that only a check reads is a declaration that only a check is
   * true of — which is the fault its own header warns about, one level further in than it looked.
   *
   * So the hints are **derived from here** now (`hintFor`), and the list is what the app dispatches
   * on. A chord that is not in this array cannot be printed in a menu.
   */
  {
    key: 'Mod+z',
    command: 'undo',
    // `any`: undo is the one act that has to work wherever the reader is, including mid-sentence.
    mode: 'any',
    label: '실행 취소'
  },
  {
    key: 'Mod+Shift+z',
    command: 'redo',
    mode: 'any',
    label: '다시 실행'
  },
  /*
   * ⌘X, ⌘C and ⌘V are **not here**, and their absence is the same finding as the presence of the
   * rest. Bound in select mode they never fired: the kit's clipboard commands take a caret's range
   * and a reader holding a card has no caret, so all three refused, correctly, every time. In text
   * they are the platform's and a builder that intercepted them would break copying. Either way this
   * app answers none of them, so it says so — the menu prints those three chords itself, marked.
   */
  {
    key: 'Mod+a',
    // The **site's**, not the kit's: `selectAll` clears the selection when a block is held.
    command: 'selectAllBlocks',
    mode: 'select',
    needs: 'page',
    label: '모두 선택'
  },

  /*
   * The zoom. Four views rather than four commands — and `=` rather than `+`, because they are one
   * key: a reader pressing what is printed as `+` is holding shift over `=` on most layouts, and a
   * chord that insisted on the shift would miss half the presses. `hintFor` prints it as `⌘+`, which
   * is what every application shows and what is on the keycap.
   */
  { key: 'Mod+=', view: 'zoom.in', mode: 'any', label: '확대' },
  { key: 'Mod+Shift+=', view: 'zoom.in', mode: 'any', label: '확대' },
  { key: 'Mod+-', view: 'zoom.out', mode: 'any', label: '축소' },
  { key: 'Mod+0', view: 'zoom.reset', mode: 'any', label: '실제 크기' },
  // Figma's, and a design tool's reader arrives already knowing it.
  { key: 'Shift+1', view: 'zoom.fit', mode: 'any', label: '화면에 맞춤' }
];

/** Every command the keys reach, for the check that asks what a reader can run. */
export function siteKeyCommands(): string[] {
  return [...new Set(SITE_KEYS.map((entry) => entry.command).filter((one): one is string => !!one))];
}

/**
 * The chord for a command or a view, written the way a menu prints it — or nothing.
 *
 * **The menu asks this rather than restating it**, which is the whole repair. The hints were typed
 * into `menu-model.ts` beside the labels, and typed hints are a second statement about a binding: a
 * reader was being taught ⌘Z, ⌘X, ⌘C, ⌘V, ⌘A and four zoom keys that this product did not answer.
 * Derived, a hint cannot outlive its binding — and a chord nobody bound simply prints nothing, which
 * is the honest thing for a menu to say about a key that does not work.
 */
export function hintFor(what: { command?: string; view?: string }): string | undefined {
  const found = SITE_KEYS.find(
    (entry) =>
      (what.command !== undefined && entry.command === what.command) ||
      (what.view !== undefined && entry.view === what.view)
  );
  return found ? hintOf(found.key) : undefined;
}

/** A chord in the symbols a menu prints. */
export function hintOf(chord: string): string {
  const parts = chord.split('+');
  // A trailing `+` splits into an empty last part; the key is then `+` itself.
  const key = parts[parts.length - 1] || '+';
  const wants = new Set(parts.slice(0, -1).map((one) => one.toLowerCase()));
  const said = [
    wants.has('ctrl') ? '⌃' : '',
    wants.has('alt') ? '⌥' : '',
    wants.has('shift') ? '⇧' : '',
    wants.has('mod') ? '⌘' : ''
  ].join('');
  /*
   * `=` prints as `+`. They are one key, and every application shows the one on the keycap — a menu
   * that read `⌘=` would be describing the chord correctly and naming a key nobody looks for.
   */
  const shown = key === '=' ? '+' : key.length === 1 ? key.toUpperCase() : key;
  return `${said}${shown}`;
}

/**
 * Whether a press matches a chord.
 *
 * Here rather than in the host so the list and the matching cannot drift: a chord written `Mod+d`
 * and matched by a handler that forgot the modifier is two statements about one binding.
 */
export function matchesSiteKey(
  entry: SiteKey,
  event: {
    key: string;
    /** Where the key **is**, which is the only reliable way to match a digit — see below. */
    code?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  }
): boolean {
  const parts = entry.key.split('+');
  const key = parts[parts.length - 1];
  const wants = new Set(parts.slice(0, -1).map((one) => one.toLowerCase()));

  /*
   * A **digit** is matched by its place on the keyboard rather than by what it types. `Shift+1` types
   * `!` on a US layout and something else on half a dozen others, so a chord compared against
   * `event.key` would be a chord that works on one keyboard. Everything else is compared as typed,
   * which is what a letter chord means.
   */
  if (/^[0-9]$/.test(key)) {
    if (event.code !== `Digit${key}`) return false;
  } else if (key.toLowerCase() !== event.key.toLowerCase()) return false;
  // `Mod` is one key on a Mac and another everywhere else, and a reader means the same thing by it.
  const mod = !!event.metaKey || !!event.ctrlKey;
  if (wants.has('mod') !== mod) return false;
  if (wants.has('shift') !== !!event.shiftKey) return false;
  if (wants.has('alt') !== !!event.altKey) return false;
  return true;
}

/** The binding a press means, given where the reader is. */
export function siteKeyFor(
  event: {
    key: string;
    code?: string;
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
  },
  mode: 'select' | 'text'
): SiteKey | undefined {
  return SITE_KEYS.find(
    (entry) => (entry.mode === 'any' || entry.mode === mode) && matchesSiteKey(entry, event)
  );
}
