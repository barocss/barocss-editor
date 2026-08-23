import { useCallback, useEffect } from 'react';
import type { Slide } from '@barocss/office-slides';

/**
 * Presenting.
 *
 * A deck that cannot be presented is not a presentation tool, and this is the
 * one mode where the product is not an editor at all: nothing can be selected,
 * nothing dragged, and the only interactions are forward and back.
 *
 * ## It shows the document, not a copy of it
 *
 * This component draws almost nothing. The slide on screen is the same element
 * the editor was already drawing — the shell takes a class, the chrome goes
 * away in CSS, and the stage fills the window. Presenting from a *second*
 * render would mean two drawings of one deck that could disagree, and the one
 * nobody is looking at is the one that stays right.
 *
 * So what is left here is the part that genuinely is presenting: which slide is
 * next, and the keys a presenter uses.
 *
 * ## Hidden slides are skipped, not hidden twice
 *
 * `hidden` means "keep it, skip it while presenting", which is the whole
 * difference between hiding a slide and deleting one. It is the *order* that
 * skips them — the deck still holds them and the rail still lists them.
 */
export function Present({
  slides,
  current,
  onCurrent,
  onExit,
  /**
   * How many presses this slide holds before the next one — its build groups —
   * and how many have been played.
   *
   * Held by the app rather than here, because the stage needs the same number to
   * know what is not on the slide yet. Two copies of "where are we in this
   * slide" would be two answers to the same question, and the one nobody is
   * looking at is the one that stays right.
   */
  builds = 0,
  played = 0,
  onGo,
  onWindow,
  windowOpen,
  scrolling = false,
  onScrollBy,
  onScrollStep,
  presenterView = false,
  onPresenterView,
  /**
   * The shapes whose click runs something, by sid, and what to call when one is
   * clicked.
   *
   * A trigger is the one thing on a slide a presenter *points at* rather than
   * advancing past, so this is where it has to be known: the click that fires it
   * is the click that must not also move the deck on.
   */
  triggers,
  onTrigger
}: {
  slides: Slide[];
  current?: string;
  onCurrent: (sid: string) => void;
  onExit: () => void;
  builds?: number;
  played?: number;
  /**
   * Move the show by a press: the app's, because both windows need the same one.
   *
   * It used to be `onPlayed` plus `pressesOf` and a rule in here. The rule is the model's
   * now (`advanceShow`) and the wiring is the app's, because the presenter's screen has a
   * window of its own and a key pressed *there* has to move the show too.
   */
  onGo?: (step: number) => void;
  /**
   * Scrolling instead of pressing, and how far one key's worth of scrolling is.
   *
   * A presenter clicks; a reader on their own scrolls. Then every gesture that was a press
   * becomes an amount of scroll, because the show's position *is* the offset — see
   * `scroll-show.ts` for why a scroll is the build's clock rather than its trigger.
   */
  scrolling?: boolean;
  /** The wheel, the trackpad, a thumb: an amount. */
  onScrollBy?: (delta: number) => void;
  /**
   * A key: a **direction**, not an amount.
   *
   * Because a press has to change the picture, and an amount does not always: measured, one
   * build's worth of scrolling is less than a slide's reading room, so → on a slide with no
   * builds moved the offset and changed nothing on screen. The app knows where the next
   * picture is (`scrollStops`).
   */
  onScrollStep?: (step: number) => void;
  /** Open the presenter's screen in a window of its own, and whether it is open. */
  onWindow?: () => void;
  windowOpen?: boolean;

  presenterView?: boolean;
  onPresenterView?: (showing: boolean) => void;
  triggers?: Record<string, string>;
  onTrigger?: (name: string) => void;
}) {
  /** The order a presenter moves through: the deck, less what it skips. */
  const shown = slides.filter((slide) => !slide.hidden);
  const at = shown.findIndex((slide) => slide.sid === current);

  /**
   * Forward is the *next thing*, and backwards is the *previous thing* — neither
   * of which is always a slide.
   *
   * A slide with builds holds the presenter where they are until every one has
   * played, which is what a build is for. Backwards un-plays them one at a time,
   * and this used to leave the slide as a whole: measured in the show, stepping
   * back landed on the previous slide with **nothing on it** — `played` went to 0
   * — so a presenter who had lost their place lost the slide as well and had to
   * click through the whole build again.
   *
   * Which is why a slide entered backwards arrives **finished**: `pressesOf` for
   * the slide being entered, not 0. Forwards is the other way round for the same
   * reason — a slide you arrive at from before you have not seen yet.
   */
  /**
   * Moving the show is the **app's**, not this screen's.
   *
   * It was a `useCallback` in here, which was right while this was the only place a press
   * could arrive from. Then the presenter's screen got a window of its own: a key pressed
   * there has to move the show too, and this component is not in that window. So the rule
   * went to the model (`advanceShow`) and the wiring to the app, and both windows call the
   * one function rather than each keeping four lines that would drift.
   */
  const go = useCallback((step: number) => onGo?.(step), [onGo]);

  useEffect(() => {
    /**
     * The keys a presenter uses, which are not the keys an editor uses.
     *
     * Capture, and every one of them prevented and stopped: the editor is still
     * mounted underneath with a caret somewhere in it, so an unprevented space
     * bar types a space into the slide being presented, and an unprevented
     * arrow key moves that caret. The presenter's keys have to arrive first and
     * go no further.
     */
    const onKey = (event: KeyboardEvent) => {
      const forward = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];

      const take = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      if (event.key === 'Escape') {
        take();
        return onExit();
      }
      /**
       * The same keys, and in a scrolling show they scroll.
       *
       * A reader half way into a build who presses → means "keep going", so the key moves
       * the *offset* and one press is worth one build's worth of it. Two vocabularies for
       * one intention would be two places to ask where the show is.
       */
      if (forward.includes(event.key)) {
        take();
        return scrolling ? onScrollStep?.(1) : go(1);
      }
      if (back.includes(event.key)) {
        take();
        return scrolling ? onScrollStep?.(-1) : go(-1);
      }
      /**
       * `S`, for the presenter's own screen.
       *
       * A letter rather than a modifier: the presenter's hands are on a clicker
       * or on one key, and every modifier combination is one a remote cannot
       * send. `S` is what PowerPoint uses for the same thing.
       */
      if (event.key === 's' || event.key === 'S') {
        take();
        return onPresenterView?.(!presenterView);
      }
      if (event.key === 'Home' && shown[0]) {
        take();
        return onCurrent(shown[0].sid);
      }
      if (event.key === 'End' && shown.length > 0) {
        take();
        return onCurrent(shown[shown.length - 1].sid);
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    go,
    onExit,
    onCurrent,
    shown,
    presenterView,
    onPresenterView,
    scrolling,
    onScrollStep
  ]);

  /**
   * The wheel, the trackpad and a thumb, when the show is scrolled.
   *
   * A **virtual** offset rather than a real scrollbar: a full-screen show with a scrollbar
   * down the side of it is not a show, and the offset is app state exactly like `played` is
   * — one number saying where the reader has got to. Which also keeps a click on a slide a
   * click on a slide: a transparent scroller over the show would have to take the pointer to
   * scroll at all, and the shapes a reader can press are underneath it.
   *
   * Not passive: this replaces the page's own scrolling rather than adding to it, and a
   * browser that scrolled the editor underneath would move the deck out from under the show.
   */
  useEffect(() => {
    if (!scrolling || !onScrollBy) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      onScrollBy(event.deltaY);
    };
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => window.removeEventListener('wheel', onWheel, true);
  }, [scrolling, onScrollBy]);

  /**
   * The browser's own full screen, asked for once.
   *
   * A nicety, not the mechanism: the mode is the class on the shell, so a
   * presenter whose browser refuses full screen still gets the presentation.
   */
  useEffect(() => {
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    return () => {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  /**
   * Clicking forwards, which is what a presenter with a clicker sends — unless
   * the click landed on a shape that *is* a button.
   *
   * A trigger fires and the deck stays put. Which is the whole behavioural
   * question a trigger asks: a click on a slide has meant "next" since the first
   * slide projector, and now one shape on the slide means something else. If the
   * click did both, a quiz answer would advance past its own tick.
   */
  useEffect(() => {
    const stage = document.querySelector('.sl-stage');
    if (!stage) return;

    const onClick = (event: Event) => {
      const shape = (event.target as HTMLElement | null)?.closest?.('[data-bc-sid]');
      // The innermost named shape a trigger watches: a click on a title inside a
      // group is a click on whichever of them is the button.
      for (let node = shape; node; node = node.parentElement?.closest('[data-bc-sid]') ?? null) {
        const name = triggers?.[node.getAttribute('data-bc-sid') ?? ''];
        if (name) {
          event.stopPropagation();
          return onTrigger?.(name);
        }
      }
      go(1);
    };

    stage.addEventListener('click', onClick);
    return () => stage.removeEventListener('click', onClick);
  }, [go, triggers, onTrigger]);

  return (
    <div className="sl-present-hint" aria-live="polite">
      <span>{at >= 0 ? `${at + 1} / ${shown.length}` : '—'}</span>
      {/*
        * Where the slide itself is, when it has anywhere to be.
        *
        * A presenter needs to know a press will not leave the slide — otherwise
        * every build is a gamble on whether the next click is the last one.
        */}
      {builds > 0 && (
        <span data-builds aria-live="polite">
          {played} / {builds}
        </span>
      )}
      <button
        type="button"
        data-presenter-toggle
        aria-pressed={presenterView}
        onClick={() => onPresenterView?.(!presenterView)}
      >
        발표자 보기 (S)
      </button>
      {/*
        * The presenter's screen in a window of its own.
        *
        * Here rather than in the top bar because this is where a presenter is looking, and
        * beside 발표자 보기 because it is the same idea with a second display: one screen
        * splits, two screens get a window each.
        */}
      {onWindow && (
        <button
          type="button"
          data-presenter-window
          aria-pressed={windowOpen === true}
          onClick={onWindow}
        >
          발표자 창
        </button>
      )}
      <button type="button" data-present-exit onClick={onExit}>
        끝내기 (Esc)
      </button>
    </div>
  );
}
