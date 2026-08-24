/**
 * Where a reader is in a slide's builds, and what that means for the stage.
 *
 * ## Why this is a model and not four lines in a component
 *
 * A slide's animation is watched in four different ways, and the app held one
 * variable per way:
 *
 * | | which press | how it moves |
 * |---|---|---|
 * | **presenting** | `played` — how far the presenter has clicked | runs |
 * | **going back** | `played`, with `settled` | held at the end |
 * | **previewing** | `previewAt` — where the timer has got to | runs |
 * | **scrubbing** | `pressShown` — the axis the pane is drawing | held at `playhead` |
 *
 * Then one line chose between them:
 *
 * ```ts
 * const at = presenting ? played : scrubbing ? pressShown : previewAt;
 * ```
 *
 * Three variables, one meaning — *which press* — and a mode test to say which of
 * the three is the real one at this instant. Everything downstream then had to
 * repeat the mode test to know what to do with it: `scrubbing ? at - 1 : at` for
 * what is still hidden, `presenting && settled ? step.endAt : undefined` for
 * where to hold, `presenting && settled ? [] : started` for whether sound plays.
 * Four mode tests, in a 1,100-line component, none of them checkable without a
 * browser.
 *
 * They are one question — *what should the stage be showing* — and the answer is
 * arithmetic. So it is here, and the tests for it run in milliseconds.
 *
 * ## The two rules that are easy to get wrong
 *
 * **Scrubbing counts one press fewer as played.** A reader dragging the playhead
 * through press 3 is looking at press 3 *happening*, so what press 3 brings on
 * must not already be on screen — whereas a presenter who has clicked three times
 * has finished press 3. Off by one in either direction and a shape is either
 * missing or already there before the animation that brings it in.
 *
 * **Going back holds, it does not replay.** A shape flying in again on the way
 * back is not what Back means anywhere. So the press is handed the same
 * animations seeked to their end — and its sounds and films are not started,
 * because a film that has been watched does not play again when the presenter
 * steps back past it.
 */

/** Which press is showing, and what the stage does with its animations. */
export interface Showing {
  /** The press whose animations to build. */
  press: number;
  /**
   * How many presses count as already finished, for deciding what is still
   * hidden. Equal to `press` except while scrubbing — see the note above.
   */
  playedThrough: number;
  /** Whether to run the animations, or hold them somewhere. */
  hold: Hold;
  /** Whether the media on this press should start. */
  plays: boolean;
}

export type Hold =
  /** Start them: this press is happening now. */
  | { kind: 'run' }
  /** Hold every animation at this moment, in milliseconds from the press. */
  | { kind: 'moment'; at: number }
  /** Hold each at its own end — the press has already happened. */
  | { kind: 'end' };

/** What the app knows about where the reader is. */
export interface Where {
  /** In the show, rather than in the editor. */
  presenting: boolean;
  /** How far through this slide's presses the presenter has clicked. */
  played: number;
  /** Whether that press was arrived at *backwards*. */
  settled: boolean;
  /**
   * Which preview run is going, or 0 for none.
   *
   * A count rather than a flag because pressing 미리 보기 while it runs has to
   * restart it, and a boolean that is already true says nothing.
   */
  run: number;
  /** Which press that run has got to. */
  playing: number;
  /** Which press the timeline pane is drawing. */
  shown: number;
  /** Where the playhead sits within it, in milliseconds. */
  moment: number;
  /**
   * The **fifth way**: a deck being scrolled through rather than clicked through.
   *
   * A scroll is a *position* and a build is an animation with a duration, and the only way
   * to join them that a reader can trust is to make the scroll the clock — so this is
   * scrubbing with a different input device, and it says so by answering the same `Showing`
   * the playhead does. See `scroll-show.ts` for the two answers this rules out (playing a
   * build when its slide arrives, and ignoring the builds).
   *
   * Asked **before** `presenting`, because a scrolling show is presenting: the difference
   * is where its position comes from.
   */
  scroll?: { press: number; moment: number };
}

/**
 * What the stage should be showing, or nothing when the slide is simply being
 * edited.
 *
 * Nothing is a real answer and the common one: a reader arranging shapes wants the
 * slide as it is, with everything on it, and no animation running. Every build
 * held at some point in its own timeline is a *different* picture of the same
 * slide, and drawing one of those by default is how an editor comes to disagree
 * with its own preview.
 */
export function showing(where: Where): Showing | undefined {
  const { presenting, played, settled, run, playing, shown, moment } = where;

  /**
   * Scrolled to here — the same answer a dragged playhead gets, for the same reason.
   *
   * One press fewer counts as finished, because the press at this offset is *happening*;
   * and nothing plays, because a reader moving through a deck is not watching a film. A
   * press of 0 is a slide with no build yet started, which is the slide as it was drawn.
   */
  if (where.scroll) {
    const { press, moment: at } = where.scroll;
    if (press <= 0) return undefined;
    return {
      press,
      playedThrough: press - 1,
      hold: { kind: 'moment', at },
      plays: false
    };
  }

  if (presenting) {
    return {
      press: played,
      playedThrough: played,
      // Arrived at backwards: hand it the animations and hold them at the end,
      // rather than replaying a build the presenter has already seen.
      hold: settled ? { kind: 'end' } : { kind: 'run' },
      // And do not start what cannot be un-watched.
      plays: !settled
    };
  }

  if (run > 0) {
    return { press: playing, playedThrough: playing, hold: { kind: 'run' }, plays: true };
  }

  /**
   * Scrubbing: the playhead has been moved off zero in the editor.
   *
   * `moment > 0` rather than a flag, because that *is* the state — the transport's
   * whole model is that pausing becomes a scrub, so a paused deck and a dragged
   * playhead are the same thing and there is nothing extra to remember. A
   * playhead at zero is a slide sitting at the start of a press, which is the
   * slide as edited.
   */
  if (moment > 0) {
    return {
      press: shown,
      // One fewer: this press is *happening*, so what it brings on must not
      // already be there.
      playedThrough: shown - 1,
      hold: { kind: 'moment', at: moment },
      // A reader dragging a playhead is not watching a film.
      plays: false
    };
  }

  return undefined;
}

/**
 * What a press of *forward* or *back* means during a show.
 *
 * ## Why this left the component
 *
 * It was inside the audience screen, which was the only place a press could arrive from —
 * and then the presenter's screen got a window of its own. A key pressed in *that* window
 * has to move the show too, and the rule was one `useCallback` deep inside a component the
 * other window cannot reach. Written twice it would be two rules, and this is the one with
 * three cases nobody would write the same way twice.
 *
 * ## The three cases, and the one that was measured
 *
 * - **Forward inside a slide's builds** plays the next one. A slide with builds holds the
 *   presenter where they are until every one has played, which is what a build is for.
 * - **Back inside them** un-plays one at a time.
 * - **Off either end** moves a slide — and a slide entered **backwards arrives finished**.
 *   Measured in the show: stepping back used to land on the previous slide with *nothing on
 *   it*, because `played` went to 0, so a presenter who had lost their place lost the slide
 *   as well and had to click through the whole build again.
 *
 * Answers `null` when there is nowhere to go, which is what the ends of a deck are: the
 * caller does nothing rather than wrapping around.
 */
export function advanceShow(
  step: number,
  where: {
    /** The slides a presenter moves through: the deck, less what it skips. */
    shown: { sid: string }[];
    /** Which of them is on screen, as an index; `-1` before the show has settled. */
    at: number;
    /** How many presses have played on this slide, and how many it has. */
    played: number;
    builds: number;
    /** How many presses another slide holds, for stepping *back* into it. */
    pressesOf?: (sid: string) => number;
    /**
     * That this deck moves by its **links only**, so a press never leaves the page.
     *
     * Keynote's *links only*, and the behaviour is the whole of it: a press plays the next build
     * and then stops. What a quiz, a menu or a kiosk needs is precisely that landing on the next
     * page by accident is impossible — the deck moves when a reader presses a **button**, and
     * that goes through `jumpTarget` rather than through here.
     *
     * The builds still run, because a build is a press about *this* page and has nothing to do
     * with the order of the deck.
     */
    linksOnly?: boolean;
  }
): { played: number; back?: boolean; slide?: string } | null {
  const { shown, at, played, builds } = where;

  if (step > 0 && played < builds) return { played: played + 1 };
  if (step < 0 && played > 0) return { played: played - 1, back: true };

  // Nothing left to play, and nowhere a press may take the reader.
  if (where.linksOnly) return null;

  const next = at < 0 ? 0 : at + step;
  if (next < 0 || next >= shown.length) return null;

  const sid = shown[next].sid;
  return {
    // Backwards into a slide: finished. Forwards into one: not seen yet.
    played: step < 0 ? (where.pressesOf?.(sid) ?? 0) : 0,
    back: step < 0,
    slide: sid
  };
}
