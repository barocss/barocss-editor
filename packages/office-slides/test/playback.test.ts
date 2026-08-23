import { describe, it, expect } from 'vitest';
import { showing, type Where, advanceShow} from '../src/playback';

/**
 * What the stage should be showing.
 *
 * Four ways of watching one slide, and the app was choosing between them with a
 * mode test repeated in four places — `presenting ? played : scrubbing ?
 * pressShown : previewAt`, then `scrubbing ? at - 1 : at`, then `presenting &&
 * settled ? …`. Every one of those was only checkable by presenting a deck in a
 * browser, and the bug the arrangement produced was found that way: stepping back
 * through a show landed on an empty slide.
 *
 * Here it is one question with one answer, in milliseconds.
 */
const where = (over: Partial<Where> = {}): Where => ({
  presenting: false,
  played: 0,
  settled: false,
  run: 0,
  playing: 0,
  shown: 1,
  moment: 0,
  ...over
});

describe('editing a slide', () => {
  it('shows nothing at all', () => {
    // The common case, and a real answer: a reader arranging shapes wants the
    // slide as it is. Every build held somewhere in its own timeline is a
    // different picture of the same slide, and drawing one by default is how an
    // editor comes to disagree with its own preview.
    expect(showing(where())).toBeUndefined();
  });

  it('shows nothing with the playhead parked at the start', () => {
    // A playhead at zero is a slide sitting at the beginning of a press, which
    // is the slide as edited — not a scrub of it.
    expect(showing(where({ shown: 3, moment: 0 }))).toBeUndefined();
  });
});

describe('presenting', () => {
  it('runs the press the presenter has clicked to', () => {
    expect(showing(where({ presenting: true, played: 2 }))).toEqual({
      press: 2,
      playedThrough: 2,
      hold: { kind: 'run' },
      plays: true
    });
  });

  it('shows the first slide with nothing played yet', () => {
    // Press 0 is a slide before its first click: what a build brings on is not
    // there, and nothing is running.
    expect(showing(where({ presenting: true, played: 0 }))).toEqual({
      press: 0,
      playedThrough: 0,
      hold: { kind: 'run' },
      plays: true
    });
  });

  /**
   * Going back holds; it does not replay.
   *
   * A shape flying in again on the way back is not what Back means anywhere, so
   * the press gets the same animations seeked to their end.
   */
  it('holds a press arrived at backwards, and plays nothing', () => {
    expect(showing(where({ presenting: true, played: 2, settled: true }))).toEqual({
      press: 2,
      playedThrough: 2,
      hold: { kind: 'end' },
      // A film that has been watched does not start again when the presenter
      // steps back past it.
      plays: false
    });
  });

  it('ignores the pane’s playhead entirely', () => {
    // The pane is not on screen in a show. A playhead left somewhere from before
    // the show started must not decide what a presenter sees.
    const presenting = showing(where({ presenting: true, played: 1, shown: 4, moment: 900 }));
    expect(presenting).toEqual({
      press: 1,
      playedThrough: 1,
      hold: { kind: 'run' },
      plays: true
    });
  });
});

describe('previewing in the editor', () => {
  it('runs the press the timer has got to', () => {
    expect(showing(where({ run: 3, playing: 2 }))).toEqual({
      press: 2,
      playedThrough: 2,
      hold: { kind: 'run' },
      plays: true
    });
  });

  it('beats a playhead that was left somewhere', () => {
    // Starting a preview from a scrubbed position: what is playing wins, or the
    // first press of the run would be drawn as a held frame.
    expect(showing(where({ run: 1, playing: 1, shown: 2, moment: 640 }))?.hold).toEqual({
      kind: 'run'
    });
  });

  it('is over when the run count goes back to zero', () => {
    // Which is how a preview ends: the run is cleared and the pane goes back to
    // whatever the reader had been looking at.
    expect(showing(where({ run: 0, playing: 3 }))).toBeUndefined();
  });
});

describe('scrubbing', () => {
  it('holds the shown press at the playhead’s moment', () => {
    expect(showing(where({ shown: 3, moment: 480 }))).toEqual({
      press: 3,
      // One fewer, which is the rule that is easy to get wrong: a reader dragging
      // through press 3 is watching press 3 *happen*, so what it brings on must
      // not already be on screen.
      playedThrough: 2,
      hold: { kind: 'moment', at: 480 },
      plays: false
    });
  });

  it('counts nothing as played while scrubbing the first press', () => {
    // Which is the boundary of the rule above: press 1 minus one is zero, not
    // negative, and nothing is on screen ahead of the build that brings it.
    expect(showing(where({ shown: 1, moment: 120 }))?.playedThrough).toBe(0);
  });

  /**
   * The transport's whole model: **pausing becomes a scrub**.
   *
   * The stage reports the moment it stopped at, the playhead moves there and the
   * run ends — so a paused deck is a state that already had a meaning, and
   * frame-stepping is scrubbing by another name. Nothing here knows a pause
   * happened, which is the point.
   */
  it('is what a paused preview becomes', () => {
    const paused = showing(where({ run: 0, playing: 2, shown: 2, moment: 815 }));
    expect(paused).toEqual({
      press: 2,
      playedThrough: 1,
      hold: { kind: 'moment', at: 815 },
      plays: false
    });
  });
});

/**
 * What a press of forward or back means during a show.
 *
 * It was inside the audience screen, which was the only place a press could arrive from —
 * until the presenter's screen got a window of its own, and a key pressed *there* had to
 * move the show too. Three cases, and one of them was measured in a real showing.
 */
describe('advancing a show', () => {
  const shown = [{ sid: 'a' }, { sid: 'b' }, { sid: 'c' }];

  it('plays the next build before it leaves the slide', () => {
    // A slide with builds holds the presenter where they are until every one has played,
    // which is what a build is for.
    expect(advanceShow(1, { shown, at: 0, played: 0, builds: 2 })).toEqual({ played: 1 });
    expect(advanceShow(1, { shown, at: 0, played: 1, builds: 2 })).toEqual({ played: 2 });
  });

  it('moves on once they have all played', () => {
    expect(advanceShow(1, { shown, at: 0, played: 2, builds: 2 })).toEqual({
      played: 0,
      back: false,
      slide: 'b'
    });
  });

  it('un-plays them one at a time going back', () => {
    expect(advanceShow(-1, { shown, at: 1, played: 2, builds: 3 })).toEqual({
      played: 1,
      back: true
    });
  });

  it('enters the slide before it **finished**', () => {
    /*
     * Measured in the show: stepping back used to land on the previous slide with nothing
     * on it, because `played` went to 0 — so a presenter who had lost their place lost the
     * slide as well and had to click through the whole build again.
     */
    const pressesOf = (sid: string) => (sid === 'a' ? 4 : 0);
    expect(advanceShow(-1, { shown, at: 1, played: 0, builds: 2, pressesOf })).toEqual({
      played: 4,
      back: true,
      slide: 'a'
    });
  });

  it('answers nothing at either end, rather than wrapping', () => {
    // The ends of a deck are somewhere to stop, not somewhere to loop.
    expect(advanceShow(-1, { shown, at: 0, played: 0, builds: 0 })).toBeNull();
    expect(advanceShow(1, { shown, at: 2, played: 0, builds: 0 })).toBeNull();
  });

  it('starts at the first slide when nothing is on screen yet', () => {
    expect(advanceShow(1, { shown, at: -1, played: 0, builds: 0 })?.slide).toBe('a');
  });
});

/**
 * The fifth way: a deck being scrolled through.
 *
 * `showing` had four ways to watch one slide — presenting, going back, previewing,
 * scrubbing. A scroll is a fifth, and the whole design is that it is **scrubbing with a
 * different input device**: it answers the same `Showing`, so nothing downstream had to
 * learn a new mode.
 */
describe('showing a deck that is being scrolled', () => {
  const base = {
    presenting: true,
    played: 3,
    settled: false,
    run: 0,
    playing: 0,
    shown: 1,
    moment: 0
  };

  it('holds the press at the moment the scroll has reached', () => {
    const shows = showing({ ...base, scroll: { press: 2, moment: 400 } })!;
    expect(shows.press).toBe(2);
    expect(shows.hold).toEqual({ kind: 'moment', at: 400 });
  });

  it('counts one press fewer as finished, like a dragged playhead', () => {
    // The press at this offset is *happening*, so what it brings on must not already be on
    // screen — the same off-by-one that scrubbing gets right.
    expect(showing({ ...base, scroll: { press: 2, moment: 0 } })?.playedThrough).toBe(1);
  });

  it('starts no film', () => {
    // A reader moving through a deck is not watching a film, and a film that restarted on
    // every scroll tick would be unwatchable anyway.
    expect(showing({ ...base, scroll: { press: 1, moment: 10 } })?.plays).toBe(false);
  });

  it('wins over presenting, because a scrolling show is presenting', () => {
    // The difference is not whether it is a show; it is where the show's position comes
    // from. Asked first, or the press count would answer instead of the scroll.
    const shows = showing({ ...base, played: 3, scroll: { press: 1, moment: 0 } })!;
    expect(shows.press).toBe(1);
  });

  it('answers nothing before the first build, which is the slide as drawn', () => {
    // Press 0 is a slide nobody has started animating: the editor's own picture of it.
    expect(showing({ ...base, scroll: { press: 0, moment: 0 } })).toBeUndefined();
  });
});
