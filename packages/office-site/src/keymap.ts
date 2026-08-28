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
 * a fact about the product; *how* the press is caught is the host's. Here the host is the app,
 * because only it knows whether the reader is in the text or holding a block.
 *
 * ## …and what a binding *is* is `office-controls`'
 *
 * The shape, the matching and the way a chord is written for a reader all moved there once this was
 * the second product to need them and Word was found to have neither. Three answers to one question
 * is the fault this repository keeps finding one layer up from where it looks; see `keys.ts` for the
 * measurement that forced it — seventeen chords taught across the suite, six answered.
 */

import { keyFor, keyLabel, chordFor, keyCommands, type KeyModel } from '@barocss/office-controls';

export interface SiteKey extends KeyModel {
  /**
   * **Required here**, unlike in the shared shape.
   *
   * A builder has two modes and every binding belongs to one of them: `select` is its own — the
   * reader is holding blocks, so `Delete` means *take this away* — and in `text` the very same key
   * is a letter. A product with one mode leaves this out; one with two cannot.
   */
  mode: 'select' | 'text' | 'any';
  /** And a name, because every binding here is offered somewhere a reader can read it. */
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
  return keyCommands(SITE_KEYS);
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
  return keyLabel(chordFor(SITE_KEYS, what));
}

/** A chord in the symbols a menu prints — `office-controls`', so all three products write one alike. */
export function hintOf(chord: string): string {
  return keyLabel(chord) ?? chord;
}

/** Whether a press matches a chord. */
export function matchesSiteKey(
  entry: SiteKey,
  event: Parameters<typeof keyFor>[1]
): boolean {
  return !!keyFor([entry], event);
}

/** The binding a press means, given where the reader is. */
export function siteKeyFor(
  event: Parameters<typeof keyFor>[1],
  mode: 'select' | 'text'
): SiteKey | undefined {
  return keyFor(SITE_KEYS, event, mode);
}
