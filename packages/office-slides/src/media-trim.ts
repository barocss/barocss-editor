/**
 * Which part of a film plays: an in-point and an out-point.
 *
 * ## Why the timeline needed this
 *
 * The pane says *when* a film starts, which is what an animation list says. A
 * video editor's timeline says something else as well — which part of the film
 * plays — and without it a deck can only ever play a clip from its first frame
 * to its last. Every real use of video in a deck is a *piece* of a file: the
 * fifteen seconds of a recorded call that matter, the demo without its first
 * eight seconds of dead air.
 *
 * ## Why it is on the media node rather than on the step
 *
 * A trim is a fact about the film, not about one playing of it — PowerPoint's
 * Trim Video writes it on the video, and a deck that played the same file twice
 * would mean the same fifteen seconds both times. If a reader ever needs two
 * different pieces of one file, that is two media nodes, which is also how they
 * would think about it.
 *
 * ## Why the out-point may be zero
 *
 * Because the film's own length is **not in the document**. It is in the file,
 * and it is known only once a browser has loaded enough of it to say — so there
 * is no honest default for an out-point, and `0` means *to the end*, whatever
 * that turns out to be. Which is why `trimmedLength` returns `undefined` rather
 * than a number it would have had to invent: a bar drawn from a guessed length
 * is a timeline that lies about the film.
 */

/** The two points, in milliseconds, on every node that plays. */
export const MEDIA_TRIM_ATTRS = {
  /** Where playing starts. 0 is the first frame. */
  trimStart: { type: 'number' as const, default: 0 },
  /** Where it stops. **0 means to the end** — see above. */
  trimEnd: { type: 'number' as const, default: 0 }
};

export interface MediaTrim {
  start: number;
  /** 0 for "to the end", which is the document's word for an unknown length. */
  end: number;
}

interface HasAttributes {
  attributes?: Record<string, unknown>;
}

const ms = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;

/**
 * The trim a node holds, read the way every other attribute is read.
 *
 * An out-point that is not after the in-point is *no* out-point rather than a
 * negative length: a reader typing 2 into 시작 on a film trimmed to 1 second has
 * said something contradictory, and the reading that keeps the film playable is
 * the one that drops the contradiction.
 */
export function trimOf(node?: HasAttributes | null): MediaTrim {
  const start = ms(node?.attributes?.trimStart);
  const end = ms(node?.attributes?.trimEnd);
  return { start, end: end > start ? end : 0 };
}

/** Whether a node is trimmed at all, which is what the panel says out loud. */
export function isTrimmed(trim: MediaTrim): boolean {
  return trim.start > 0 || trim.end > 0;
}

/**
 * How long the trimmed film runs, when that is knowable.
 *
 * `undefined` when there is no out-point, because the answer is the file's own
 * length and the document does not have it. The caller decides what to draw
 * instead — the pane draws the step's own duration, which is a placeholder it
 * already had.
 */
export function trimmedLength(trim: MediaTrim): number | undefined {
  return trim.end > trim.start ? trim.end - trim.start : undefined;
}

/**
 * The trim to write, given what the reader typed.
 *
 * In one place because three things do it — the panel, the pane and a paste —
 * and because the clamping is the whole of the rule: neither point is negative,
 * and an out-point at or before the in-point is the reader saying "to the end".
 */
export function trimChanges(
  current: MediaTrim,
  next: { start?: number; end?: number }
): MediaTrim {
  const start = Math.max(0, Math.round(next.start ?? current.start));
  const asked = Math.max(0, Math.round(next.end ?? current.end));
  return { start, end: asked > start ? asked : 0 };
}

/**
 * The shortest a film can be trimmed to by dragging.
 *
 * Not a rule about the document — a reader can type any two numbers — but about
 * the *gesture*: a bar dragged to nothing is a film nobody can find again, and
 * the bar itself would be too thin to grab. A quarter of a second is also about
 * the resolution the out-point is enforced at (`timeupdate` fires roughly four
 * times a second), so a shorter trim is a length this product cannot honour
 * anyway.
 */
export const MIN_TRIM_MS = 250;

/**
 * A film's **head** trimmed on the axis: the trim and the step's delay, moved
 * together.
 *
 * Which is the one decision in dragging a film's bar. A bar's left edge is a
 * *moment* everywhere else in this timeline — the step's delay — and a film's
 * head is a place in the file, so dragging that edge could mean either. Every
 * video editor answers it the same way and answers both at once: the clip starts
 * later **and** begins further in, so the frame under the pointer stays where it
 * is and the tail does not move. A reader who has ever trimmed a clip knows this
 * gesture, and the alternative — the left edge moving while the right edge slides
 * left — is a bar that shrinks from the end you are not touching.
 *
 * `by` is milliseconds, negative to drag the head *back* out. Clamped three ways,
 * because all three are reachable with one flick of a pointer: never before the
 * film's first frame, never before the press it plays in, and never past its own
 * out-point.
 */
export function headTrim(
  trim: MediaTrim,
  delay: number,
  by: number
): { trim: MediaTrim; delay: number } {
  const room = trim.end > trim.start ? trim.end - trim.start - MIN_TRIM_MS : Infinity;
  const moved = Math.round(Math.min(Math.max(by, -trim.start, -delay), room));
  return {
    trim: { start: trim.start + moved, end: trim.end },
    delay: delay + moved
  };
}

/**
 * A film's **tail** dragged to a length — the out-point, from wherever the head
 * is.
 *
 * The one thing to notice: a film with *no* out-point gets one here. `0` means "to
 * the end" precisely because the file's length is not in the document, so the
 * first drag of the tail is also the moment the deck learns a length — the one the
 * reader dragged to. Which is why this takes a length rather than a point: the
 * bar's width is what the reader is holding.
 */
export function tailTrim(trim: MediaTrim, length: number): MediaTrim {
  return { start: trim.start, end: trim.start + Math.max(MIN_TRIM_MS, Math.round(length)) };
}
