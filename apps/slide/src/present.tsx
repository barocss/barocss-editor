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
  onExit
}: {
  slides: Slide[];
  current?: string;
  onCurrent: (sid: string) => void;
  onExit: () => void;
}) {
  /** The order a presenter moves through: the deck, less what it skips. */
  const shown = slides.filter((slide) => !slide.hidden);
  const at = shown.findIndex((slide) => slide.sid === current);

  const go = useCallback(
    (step: number) => {
      const next = at < 0 ? 0 : at + step;
      if (next < 0 || next >= shown.length) return;
      onCurrent(shown[next].sid);
    },
    [at, shown, onCurrent]
  );

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
      if (forward.includes(event.key)) {
        take();
        return go(1);
      }
      if (back.includes(event.key)) {
        take();
        return go(-1);
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
  }, [go, onExit, onCurrent, shown]);

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

  /** Clicking forwards, which is what a presenter with a clicker sends. */
  useEffect(() => {
    const onClick = () => go(1);
    const stage = document.querySelector('.sl-stage');
    stage?.addEventListener('click', onClick);
    return () => stage?.removeEventListener('click', onClick);
  }, [go]);

  return (
    <div className="sl-present-hint" aria-live="polite">
      <span>{at >= 0 ? `${at + 1} / ${shown.length}` : '—'}</span>
      <button type="button" data-present-exit onClick={onExit}>
        끝내기 (Esc)
      </button>
    </div>
  );
}
