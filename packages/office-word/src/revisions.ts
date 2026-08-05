/**
 * Tracked changes: how a revision is drawn.
 *
 * An insertion and a deletion are marks rather than nodes because they cover a
 * range of text, and the same range can carry both an insertion and a comment.
 * What they need that a plain mark does not is the author: a document revised by
 * three people is only readable if each one's changes look different, and that
 * is a value, not a class name.
 */

/**
 * Colours a reviewer can be told apart by.
 *
 * A palette rather than the whole hue wheel. Hashing a name straight to a hue
 * puts two authors wherever the hash lands, and "Jinho" and "Sujin" came out six
 * degrees apart — the same colour, to a reader. Fixed stops are far enough
 * apart to survive that, and being few means two authors can collide; Word has
 * the same limit, and a document with more reviewers than colours needs the
 * names anyway, which is what the tooltip is for.
 *
 * Saturation and lightness are fixed so every author is legible on white.
 */
const AUTHOR_COLORS = [
  'hsl(210, 70%, 42%)', // blue
  'hsl(345, 70%, 45%)', // crimson
  'hsl(140, 55%, 32%)', // green
  'hsl(280, 55%, 48%)', // violet
  'hsl(25, 80%, 42%)',  // orange
  'hsl(190, 70%, 34%)', // teal
  'hsl(60, 60%, 30%)',  // olive
  'hsl(320, 45%, 42%)'  // mauve
];

/**
 * A colour for an author, stable across sessions and machines.
 *
 * Derived from the name rather than assigned in order, because assigning by
 * order means a reviewer's colour changes when someone else's edit is accepted —
 * and a reader who has learned that green is Kim should not have to relearn it.
 */
export function authorColor(author: string | undefined): string {
  if (!author) return 'hsl(0, 0%, 35%)';

  // FNV-1a: small, stable, and does not clump short names the way a sum would
  let hash = 0x811c9dc5;
  for (let index = 0; index < author.length; index++) {
    hash ^= author.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return AUTHOR_COLORS[Math.abs(hash) % AUTHOR_COLORS.length];
}

/** The tooltip a reader gets on a revision. */
export function revisionTitle(kind: string, attrs: Record<string, unknown> | undefined): string {
  const author = typeof attrs?.author === 'string' ? attrs.author : 'Unknown';
  const date = typeof attrs?.date === 'string' ? attrs.date : undefined;
  return date ? `${kind} by ${author}, ${date}` : `${kind} by ${author}`;
}
