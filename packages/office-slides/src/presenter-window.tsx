import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The presenter's screen, in a **second window**.
 *
 * ## Why a window and not a pane
 *
 * A real showing has two screens: the projector shows the slide and the laptop shows the
 * next slide, the notes and the clock. Until now this product had both on one screen, which
 * is what a presenter with a single display needs and exactly what a presenter with two
 * cannot use — the audience would be looking at the notes.
 *
 * The presenter view itself was already built and already reads everything it draws out of
 * the document. What was missing was somewhere to put it.
 *
 * ## One truth, drawn twice
 *
 * The showing's state — which slide, how many builds have played, when it started — is the
 * *app's*, not the document's, and there is one copy of it: the editor window's. This draws
 * that state into another document and sends nothing back except the callbacks a control
 * calls. So there is no channel, no serialisation and nothing to keep in step: a second
 * window here is a second **place to draw**, which is the same distinction §8.11 draws
 * between a decision and a derived drawing.
 *
 * That is also why it is a portal rather than a second React root. A root of its own would
 * be a second tree with its own hooks and its own copy of whatever it was given, and the
 * two would disagree the first time one of them was slow.
 *
 * ## What has to be carried across by hand
 *
 * **The styles.** A new window's document has none of the opener's — in dev they are
 * `<style>` elements vite injected, in a build they are a `<link>` — so both are cloned.
 * Cloned rather than moved: the opener still needs them.
 *
 * **The lifecycle.** A window the reader closes has to tell the app, or the app goes on
 * believing the presenter screen is showing and never re-opens it; and a window the app
 * opened has to close when the show ends or when the opener goes, or a deck's presenter
 * screen outlives the deck.
 */
/** What the second window is told. */
export interface PresenterWindowProps {
  open: boolean;
  /** The reader closed it, so the app has to stop believing it is there. */
  onClosed: () => void;
  /** Move the show, for the keys pressed in *this* window. */
  onGo?: (step: number) => void;
  onExit?: () => void;
  children: ReactNode;
}

export function PresenterWindow({
  open,
  onClosed,
  onGo,
  onExit,
  children
}: PresenterWindowProps) {
  const [body, setBody] = useState<HTMLElement | null>(null);

  /**
   * The callbacks, held in a ref rather than depended on.
   *
   * Measured, and it killed the feature outright: with `onGo` and the rest in the effect's
   * dependencies, every render of the app made new closures, the effect re-ran, and the
   * cleanup **closed the window** — so the presenter screen opened and vanished in the same
   * frame. A window is not a value to re-create when a callback's identity changes; it is
   * opened once, for as long as it is asked for.
   */
  const latest = useRef({ onClosed, onGo, onExit });
  latest.current = { onClosed, onGo, onExit };

  useEffect(() => {
    if (!open) {
      setBody(null);
      return;
    }

    const child = window.open('', 'sl-presenter', 'width=1100,height=760');
    // Blocked by the browser: a pop-up blocker answers `null`, and a presenter screen that
    // silently did not open is worse than one that is not offered.
    if (!child) {
      latest.current.onClosed();
      return;
    }

    child.document.title = '발표자 화면';
    /*
     * The opener's styles, cloned.
     *
     * Both kinds: a build links a stylesheet and dev injects `<style>` elements, and a
     * window with neither draws the presenter view as unstyled text — which looks like a
     * broken feature rather than a missing link.
     */
    for (const node of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
      child.document.head.appendChild(node.cloneNode(true));
    }
    child.document.body.className = 'sl-presenter-window';

    /**
     * The presenter's keys, in the window the presenter is looking at.
     *
     * The audience screen's handler is on the *opener's* window, so with a second window
     * open the arrow keys went wherever focus was — and that is here, where nothing was
     * listening. A presenter pressing → at their own screen and watching nothing happen is
     * the whole feature failing.
     *
     * The same keys and the same rule (`advanceShow`, through `onGo`), because two lists of
     * presenter keys would be two answers to one question.
     */
    const onKey = (event: KeyboardEvent) => {
      const forward = ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'];
      const back = ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'];
      if (event.key === 'Escape') {
        event.preventDefault();
        return latest.current.onExit?.();
      }
      if (forward.includes(event.key)) {
        event.preventDefault();
        return latest.current.onGo?.(1);
      }
      if (back.includes(event.key)) {
        event.preventDefault();
        return latest.current.onGo?.(-1);
      }
    };
    child.addEventListener('keydown', onKey, true);

    /*
     * The reader closing the window, and only the reader: the app closes it too (when the
     * show ends, when the opener goes) and hearing its own close as "the reader closed it"
     * would be the app arguing with itself.
     */
    let ours = false;
    const onGone = () => {
      if (!ours) latest.current.onClosed();
    };
    child.addEventListener('beforeunload', onGone);
    // The opener going takes the presenter screen with it: a window left behind draws a
    // deck that is no longer open.
    const onOpenerGone = () => {
      ours = true;
      child.close();
    };
    window.addEventListener('beforeunload', onOpenerGone);

    setBody(child.document.body);
    return () => {
      ours = true;
      child.removeEventListener('keydown', onKey, true);
      child.removeEventListener('beforeunload', onGone);
      window.removeEventListener('beforeunload', onOpenerGone);
      setBody(null);
      child.close();
    };
  }, [open]);

  return body ? createPortal(children, body) : null;
}
