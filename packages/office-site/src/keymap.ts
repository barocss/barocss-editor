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
  command: string;
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
  }
];

/** Every command the keys reach, for the check that asks what a reader can run. */
export function siteKeyCommands(): string[] {
  return [...new Set(SITE_KEYS.map((entry) => entry.command))];
}

/**
 * Whether a press matches a chord.
 *
 * Here rather than in the host so the list and the matching cannot drift: a chord written `Mod+d`
 * and matched by a handler that forgot the modifier is two statements about one binding.
 */
export function matchesSiteKey(
  entry: SiteKey,
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean }
): boolean {
  const parts = entry.key.split('+');
  const key = parts[parts.length - 1];
  const wants = new Set(parts.slice(0, -1).map((one) => one.toLowerCase()));

  if (key.toLowerCase() !== event.key.toLowerCase()) return false;
  // `Mod` is one key on a Mac and another everywhere else, and a reader means the same thing by it.
  const mod = !!event.metaKey || !!event.ctrlKey;
  if (wants.has('mod') !== mod) return false;
  if (wants.has('shift') !== !!event.shiftKey) return false;
  if (wants.has('alt') !== !!event.altKey) return false;
  return true;
}

/** The binding a press means, given where the reader is. */
export function siteKeyFor(
  event: { key: string; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean },
  mode: 'select' | 'text'
): SiteKey | undefined {
  return SITE_KEYS.find(
    (entry) => (entry.mode === 'any' || entry.mode === mode) && matchesSiteKey(entry, event)
  );
}
