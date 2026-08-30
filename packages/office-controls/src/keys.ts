/**
 * What a product **binds**, as data — and the one place a chord is turned into what a reader reads.
 *
 * ## Why this is shared, measured rather than guessed
 *
 * Every chord each product's menubar prints was pressed in a browser, one at a time, and what
 * happened was compared against what the menu said would happen. **Seventeen chords taught across
 * the suite, six answered.**
 *
 * - the **site builder** printed fourteen and answered three: ⌘Z, ⇧⌘Z, ⌘X, ⌘C, ⌘V, ⌘A, ⌘F and the
 *   four zoom keys all did nothing at all.
 * - **Word** printed ⌘+, ⌘- and ⌘0 and answered none of them, while 보기 › 확대 worked.
 * - the **deck** printed ⌘S, ⌘M and F5 and answered none of them.
 *
 * Three products, one fault, and the same cause each time: the hint is typed beside the label in the
 * menu model, the binding lives in the key map, and nothing holds the two together. A hint is not
 * decoration — it is the product telling a reader they can stop opening the menu.
 *
 * ## What is shared and what is not
 *
 * The same split the menu model itself makes. *Which* chords a product binds is a fact about that
 * product — ⌘M is a slide in a deck and nothing on a page — and *what a binding is*, how a press is
 * matched against one, and how a chord is written for a reader are the same everywhere. The deck had
 * `keyLabel` and `shortcutOf`, the site grew a second pair under different names, and Word had
 * neither and typed its chords by hand. Three answers to one question, which is the fault this
 * repository keeps finding one layer up from where it looks.
 *
 * ## What this deliberately does not do
 *
 * Catch the press. *How* a key is caught is the host's: the deck's overlay knows whether the reader
 * is typing in a box, the site's app knows whether it is in select mode, and Word's engine resolves
 * its own bindings against a caret. A shared handler would have to know all three, and would be the
 * thing every product then worked around.
 */

import type { MenuModel } from './menu';

export interface KeyModel {
  /**
   * The chord, with `Mod` for "Cmd on a Mac and Ctrl everywhere else".
   *
   * Written the way a reader would say it rather than as a browser event, so a key map reads as a
   * list of shortcuts: `Mod+Shift+g`, `Delete`, `ArrowUp`.
   */
  key: string;
  /** The command a press runs — everything that changes the **document**. */
  command?: string;
  /**
   * …or the **view** it changes, which is not a command and never will be.
   *
   * The same word `MenuEntryModel` uses, because it is the same fact: zoom, presenting and which
   * panes are open are the app's rather than the document's. A key map that could only name commands
   * left every chord in 보기 unbound while the menu went on teaching them — which is exactly what was
   * measured in two products.
   */
  view?: string;
  /** What it is given. Fixed, because the chord says which case it is. */
  payload?: Record<string, unknown>;
  /** Whether something has to be selected for this to mean anything. */
  needsSelection?: boolean;
  /** That it acts on something only the app knows — the page open, the slide on screen. */
  needs?: string;
  /**
   * Which mode the press belongs to, for a product that has modes.
   *
   * A builder's `select` is its own: the reader is holding blocks, so `Delete` means *take this
   * away*. In `text` the very same key is a letter. A product with one mode leaves this out and
   * every binding is `any`.
   */
  mode?: 'select' | 'text' | 'any';
  /**
   * The **engine's** word for the same idea, so an engine `Keybinding` is one of these.
   *
   * `when: 'inTable'` and `mode: 'select'` are both *when this binding is the one that means
   * something*, expressed by the two layers that grew them. Named here rather than translated,
   * because a translation is a third statement — and Word's seventy-two bindings are already written
   * this way and resolved by the engine against a context, which a product's `mode` never is.
   */
  when?: string;
  /** What a reader would be told this does, in a tooltip or a menu. */
  label?: string;
}

/** The symbols a chord is drawn with, which is not what it is written as. */
const SIGNS: Record<string, string> = {
  Shift: '⇧',
  Alt: '⌥',
  Ctrl: '⌃',
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
 * Two conventions, and they are not a preference: Apple writes chords as symbols with nothing between
 * them and everyone else writes them as words joined by plus signs. A tool that shows `Ctrl+D` on a
 * Mac looks like it was ported, which is the whole thing this is for.
 *
 * `apple` comes in rather than being sniffed here, because a pure function of the platform is
 * testable and `navigator` is not — and the caller knows anyway.
 */
export function keyLabel(chord: string | undefined, apple = true): string | undefined {
  if (!chord) return undefined;

  const parts = chord.split('+');
  // A trailing `+` splits to an empty last part: the key is `+` itself.
  const key = parts[parts.length - 1] || '+';
  const wants = new Set(parts.slice(0, -1).map((one) => one.toLowerCase()));

  /*
   * **Modifiers come out in the platform's order, not the declaration's.**
   *
   * `Mod+Shift+z` printed as `⌘⇧Z` and macOS writes `⇧⌘Z` — Control, Option, Shift, Command, always,
   * whatever a menu's author typed. It is not a nicety: a reader finds a chord by its shape, and one
   * written back-to-front is one they read twice. Windows and Linux put Ctrl first for the same
   * reason, in their own order.
   *
   * Sorted here rather than asked of the declaration, because the declaration is a *set* of keys
   * held down and sets have no order. Two products had already written the same chord two ways.
   */
  const order: [string, string][] = apple
    ? [['ctrl', '⌃'], ['alt', '⌥'], ['shift', '⇧'], ['mod', '⌘']]
    : [['mod', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift']];
  const said = order.filter(([name]) => wants.has(name)).map(([, sign]) => sign);

  const shown = SIGNS[key]
    ? apple
      ? SIGNS[key]
      : key
    : /*
       * `=` is drawn as `+`. They are one key, and every application shows the one on the keycap — a
       * menu reading `⌘=` would be describing the chord correctly and naming a key nobody looks for.
       */
      key === '='
      ? '+'
      : // A single letter is shown as a capital: `⌘D`, not `⌘d`.
        key.length === 1
        ? key.toUpperCase()
        : key;

  return apple ? [...said, shown].join('') : [...said, shown].join('+');
}

/**
 * Whether a press matches a chord.
 *
 * Here rather than in each host so the list and the matching cannot drift: a chord written `Mod+d`
 * and matched by a handler that forgot the modifier is two statements about one binding.
 */
export function matchesKey(
  entry: Pick<KeyModel, 'key'>,
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
  const key = parts[parts.length - 1] || '+';
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

  // `Mod` is one key on a Mac and another everywhere else, and a reader means the same by it.
  const mod = !!event.metaKey || !!event.ctrlKey;
  if (wants.has('mod') !== mod) return false;
  if (wants.has('shift') !== !!event.shiftKey) return false;
  if (wants.has('alt') !== !!event.altKey) return false;
  return true;
}

/** The binding a press means, given where the reader is. */
export function keyFor<K extends KeyModel>(
  keys: K[],
  event: Parameters<typeof matchesKey>[1],
  mode?: 'select' | 'text'
): K | undefined {
  return keys.find(
    (entry) =>
      (!mode || !entry.mode || entry.mode === 'any' || entry.mode === mode) && matchesKey(entry, event)
  );
}

/**
 * The chord a command or a view is bound to, if it is bound to one.
 *
 * The **first** binding, because several keys can run one thing — every nudge in a deck is
 * `nudgeBoxes` — and what a menu wants to say is one chord rather than eight.
 */
export function chordFor(keys: KeyModel[], what: { command?: string; view?: string }): string | undefined {
  return keys.find(
    (entry) =>
      (what.command !== undefined && entry.command === what.command) ||
      (what.view !== undefined && entry.view === what.view)
  )?.key;
}

/** Every command a key map reaches, for the check that asks what a reader can run. */
export function keyCommands(keys: KeyModel[]): string[] {
  return [...new Set(keys.map((one) => one.command).filter((one): one is string => !!one))];
}

/**
 * The same menus with each entry's **chord filled in from the key map**.
 *
 * This is the repair, and it is one line at each product's declaration. A hint that is derived cannot
 * outlive its binding, and an entry with no binding gets **nothing** rather than a guess — which is
 * the honest thing for a menu to say about a key that does not work.
 *
 * A hint written on the entry still wins, and there are exactly two reasons to write one: the chord
 * belongs to the **platform** rather than to this product (⌘X, ⌘C, ⌘V inside text; ⌘P for print), or
 * the line is a note about a key rather than a chord to press (*Esc로 나가기*). Both are claims, and
 * a product's own test is where the list of them belongs.
 */
export function withHints<M extends MenuModel>(menus: M[], keys: KeyModel[], apple = true): M[] {
  return menus.map((menu) => ({
    ...menu,
    blocks: menu.blocks.map((block) => ({
      ...block,
      items: block.items.map((item) => ({
        ...item,
        hint: item.hint ?? keyLabel(chordFor(keys, item), apple)
      }))
    }))
  }));
}

/**
 * What is wrong with a key map, in the words its author would use.
 *
 * The sibling of `menuFaults`, and it asks the three questions that shape had no check for.
 *
 * 1. A binding runs a command **or** changes a view, and says exactly one.
 * 2. No two bindings in one mode claim the same chord — a fault a reader meets as *sometimes it
 *    duplicates and sometimes it does nothing*, depending on which the array happened to list first.
 * 3. **The command it names exists.** Pass `knows` and it is asked; leave it out and it is not, which
 *    is right for a caller that has a key map and no editor.
 *
 * The third one was added last and found four in Word, where 72 chords were printed and 68 answered:
 * ⌘Space named `clearFormatting`, ⌥⌘D named `insertEndnote`, ⌘H named `replace` and Shift+Enter named
 * `insertLineBreak`. Two were the wrong name for a command that exists (`replaceText`; the input
 * handler's own `beforeinput`). **⌘Space was a capability nobody had built** — eleven commands each
 * took off one mark and none took off all of them, over a walk `DataStore.range.clearFormatting` had
 * been able to do since the range API existed. **⌥⌘D was a capability nobody had finished**: the
 * command was in a shared extension no product installs, and it inserted an empty note body with no
 * reference pointing at it, because the mark that refers to one was never declared.
 *
 * Nothing could see any of it, because a command that does not exist and a key nobody presses look
 * identical from every other angle.
 */
export function keyFaults(keys: KeyModel[], knows?: (command: string) => boolean): string[] {
  const faults: string[] = [];
  const seen = new Set<string>();
  for (const entry of keys) {
    if (Boolean(entry.command) === Boolean(entry.view)) {
      faults.push(`${entry.key} — a binding runs a command or changes a view, and says exactly one`);
    }
    /*
     * Two bindings *may* share a chord when they answer in different places, which is the whole point
     * of having modes: `Delete` is a block in select and a letter in text, and Word's `Tab` is a cell
     * inside a table and an indent outside one. `mode` and `when` are the two layers' words for that
     * — see `KeyModel` — so the pair is what makes a chord a duplicate.
     */
    const at = `${entry.mode ?? entry.when ?? 'any'}:${entry.key.toLowerCase()}`;
    if (seen.has(at)) faults.push(`${entry.key} — bound twice in the same mode, and one of them wins`);
    seen.add(at);

    if (knows && entry.command && !knows(entry.command)) {
      faults.push(`${entry.key} — names '${entry.command}', which nothing registers`);
    }
  }
  return faults;
}
