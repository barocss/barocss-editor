/**
 * Showing a deck by **scrolling** it.
 *
 * ## What it is, and what it is not
 *
 * A presenter clicks; a reader on their own scrolls. A deck sent as a link is read the way
 * every other page is read — with a wheel, a trackpad, a thumb — and a reader who has to
 * hunt for an arrow key to see the second half of a deck is a reader who stops at the first
 * half. Every web-first deck tool answers this the same way.
 *
 * It is not a second **layout**: the slide is still one slide filling the view. What changes
 * is where the show's position comes from — the scroll offset instead of a press — and that
 * is the whole of it.
 *
 * ## The part that matters: what a scroll does to the motion
 *
 * A build is an animation with a duration, and a scroll is a *position*. There are three
 * ways to join them and only one of them is right:
 *
 * - **Play a build when its slide arrives.** Then a reader who scrolls quickly sees every
 *   build at once and a reader who scrolls back sees them replay — the animation and the
 *   reader are two clocks that do not agree.
 * - **Ignore the builds.** Then a deck that was made to reveal a point one line at a time
 *   shows the whole point immediately, and the author's timing is thrown away.
 * - **Make the scroll the clock.** A build is *held at the moment* the scroll has reached,
 *   so scrolling forward plays it, scrolling back un-plays it, and stopping half way holds
 *   it half way.
 *
 * The third is what this does, and it needed nothing new in the motion model to say it:
 * `showing()` already has `hold: { kind: 'moment', at }` for a playhead being dragged in the
 * editor, and its own table of *four ways to watch one slide* — presenting, going back,
 * previewing, scrubbing. **A scroll is a fifth, and it is scrubbing with a different input
 * device.** The whole design of this file is that sentence.
 *
 * That also settles two questions that look separate. A slide **transition** is not played
 * (the scroll *is* the transition — a fade on top of it would be two answers to "how do we
 * get from this slide to the next"), and films and sounds do not start, for the reason a
 * dragged playhead does not start them: a reader moving through a deck is not watching a
 * film.
 */

/** Where one slide sits in the scroll, and how many presses it has to give away. */
export interface ScrollStretch {
  sid: string;
  /** The scroll offsets this slide owns: `from` up to but not including `to`. */
  from: number;
  to: number;
  presses: number;
}

/**
 * How much scrolling one build costs, as a fraction of the view.
 *
 * Three fifths of a screen: about one flick of a wheel, which is the smallest amount that
 * still reads as a deliberate move. A tenth and the builds fly past on the way to the next
 * slide; a whole screen and a slide with four builds needs five screens of scrolling, which
 * a reader abandons.
 */
export const PER_PRESS = 0.6;

/**
 * Where every slide sits in one long scroll.
 *
 * A slide's stretch is **its builds plus one view**: the builds get `PER_PRESS` of scrolling
 * each, and the view at the end is the room to *read* the finished slide before the next one
 * arrives. Without that room the last build finishes exactly as the slide leaves, which is
 * the one thing an author never means.
 *
 * A hidden slide is not in the list at all — the caller filters, the same as everywhere
 * else: what a deck skips is a fact about the deck and not about scrolling.
 */
export function scrollStretches(
  slides: { sid: string; presses: number }[],
  view: number,
  perPress = Math.round(view * PER_PRESS)
): ScrollStretch[] {
  const out: ScrollStretch[] = [];
  let at = 0;
  for (const slide of slides) {
    const presses = Math.max(0, Math.round(slide.presses));
    const span = Math.max(1, view + presses * Math.max(1, perPress));
    out.push({ sid: slide.sid, from: at, to: at + span, presses });
    at += span;
  }
  return out;
}

/** How tall the scroller has to be for a deck to have room for all of it. */
export function scrollHeight(stretches: ScrollStretch[]): number {
  return stretches.length === 0 ? 0 : stretches[stretches.length - 1].to;
}

/**
 * What the deck is showing at this scroll offset.
 *
 * `fraction` is how far *into* that press the scroll has come, 0 to 1 — which the caller
 * turns into a moment in milliseconds using the press's own length, because how long a press
 * takes is the document's answer and not this file's.
 *
 * Press **0** with a fraction of 1 is the honest way to say "the slide as it was drawn": no
 * build has started, so nothing is held anywhere. It is also what a slide with no builds
 * answers for the whole of its stretch.
 */
export function scrollAt(
  scrollTop: number,
  stretches: ScrollStretch[],
  view: number,
  perPress = Math.round(view * PER_PRESS)
): { sid: string; press: number; fraction: number } | undefined {
  if (stretches.length === 0) return undefined;

  const top = Math.max(0, scrollTop);
  const found =
    stretches.find((stretch) => top >= stretch.from && top < stretch.to) ??
    // Past the end: the last slide, finished. A deck does not wrap, and the reader who has
    // scrolled to the bottom is looking at the last slide rather than at the first.
    stretches[stretches.length - 1];

  const local = top - found.from;
  const step = Math.max(1, perPress);
  const playing = found.presses > 0 ? Math.min(found.presses, Math.floor(local / step) + 1) : 0;

  // Past every build: the slide, finished, for the view's worth of room at the end.
  if (found.presses === 0 || local >= found.presses * step) {
    return { sid: found.sid, press: found.presses, fraction: 1 };
  }

  return {
    sid: found.sid,
    press: playing,
    fraction: Math.min(1, Math.max(0, (local % step) / step))
  };
}

/**
 * Where to scroll to have a slide arrive.
 *
 * For opening the scrolling view where the reader already was — a deck that jumped to the
 * top when the view changed would be a deck that lost the reader's place.
 */
export function scrollTopOf(sid: string | undefined, stretches: ScrollStretch[]): number {
  return stretches.find((stretch) => stretch.sid === sid)?.from ?? 0;
}

/**
 * The offsets where a scrolling deck **shows something different**.
 *
 * A wheel is continuous and a key is not, and pressing → has to change the picture. Measured
 * before this existed: one press moved the offset by one build's worth, and on a slide with
 * *no* builds that is less than the reading room — so the first press changed nothing on
 * screen and the second one moved a slide. A key that appears to do nothing is the worst
 * control there is.
 *
 * So a key does not move the offset by an amount; it moves it to the next **stop**. There
 * are two kinds, and between them they are every picture the deck has:
 *
 * - the start of a slide, which is that slide as it was drawn;
 * - the end of each build, which is that build **finished** — the same picture a press gives
 *   in a clicked show, which is what makes the two ways of showing agree.
 */
export function scrollStops(
  stretches: ScrollStretch[],
  view: number,
  perPress = Math.round(view * PER_PRESS)
): number[] {
  const step = Math.max(1, perPress);
  const stops: number[] = [];
  for (const stretch of stretches) {
    stops.push(stretch.from);
    for (let press = 1; press <= stretch.presses; press += 1) {
      // One short of the boundary: *at* the boundary the next build is at its start, which
      // is a picture in which nothing has happened yet.
      stops.push(stretch.from + press * step - 1);
    }
  }
  return stops;
}

/**
 * Where one press of a key lands, or the offset unchanged at either end.
 *
 * Strictly past the offset, so a reader stopped half way through a build by the wheel gets
 * the *rest* of that build from a press forward rather than being sent back to its start.
 */
export function scrollToStop(offset: number, step: number, stops: number[]): number {
  if (stops.length === 0) return offset;
  if (step > 0) {
    return stops.find((stop) => stop > offset) ?? offset;
  }
  const back = [...stops].reverse().find((stop) => stop < offset);
  return back ?? 0;
}
