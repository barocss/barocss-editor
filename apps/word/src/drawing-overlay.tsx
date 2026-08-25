import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import { boxOf, canvasAt, intersects, type Box } from '@barocss/office-word';
import { useEditorRevision } from './revision';

/**
 * Pointing at what is **on** a drawing.
 *
 * A page's canvas was declared, drawn and — since the insert commands — makeable, and a reader
 * still could not touch what was on it: a rectangle in a document was a picture of a rectangle.
 * This is the half that makes it an editor, and it is deliberately **thin**.
 *
 * ## Why it does not swallow the pointer
 *
 * The deck's overlay covers its slide and hit-tests arithmetically, because it has to: it draws
 * handles, guides, a marquee and a crop frame over everything, so the pointer never reaches the
 * shapes. This one is `pointer-events: none` and listens on the document instead, which means the
 * **browser** does the hit-testing — including for a rotated shape, where an SVG transform is
 * exactly the sum the deck's `unrotate` has to compute. A click lands on the element whose sid it
 * is, and the innermost one wins by the same rule the show's click walk already relies on.
 *
 * What that buys is that a first version is a few hundred lines rather than three thousand. What it
 * costs is that a *drag* has to be started from the shape itself, which is the next slice.
 *
 * ## What a set means here
 *
 * Everything is written as a set from the start: click replaces it, Shift or Ctrl adds and removes,
 * a marquee takes everything it touches. The engine has carried `nodeIds` all along and the same
 * commands read it in both products — a page and a deck differ in what they *place*, not in what
 * "these three" means.
 */
export function DrawingOverlay({ editor, host }: { editor: Editor | null; host: HTMLElement | null }) {
  const layer = useRef<HTMLDivElement>(null);
  const [outlines, setOutlines] = useState<{ sid: string; rect: DOMRect }[]>([]);
  const [band, setBand] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null
  );
  const [tick, setTick] = useState(0);
  /** How far the pointer has taken what is selected, while it is still holding it. */
  const [dragged, setDragged] = useState<{ dx: number; dy: number } | null>(null);

  /** The document, as the canvas readers want it. */
  const access = useCallback(() => {
    const store = (editor as any)?.dataStore;
    const rootId = (editor as any)?.getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }, [editor]);

  /**
   * Where each selected shape is **on screen**, measured rather than computed.
   *
   * The deck converts model twips to pixels itself, because it draws its own handles over a stage
   * it scales. Here the shapes are real elements inside a page that is already scrolled, paginated
   * and zoomed by a transform — so the rectangle the browser reports *is* the answer, and asking it
   * is one line where re-deriving it would be four chances to disagree with what is drawn.
   */
  const measure = useCallback(() => {
    const container = layer.current?.parentElement;
    if (!container || !editor) return setOutlines([]);

    const origin = container.getBoundingClientRect();
    const found: { sid: string; rect: DOMRect }[] = [];
    for (const sid of selectedNodeIds((editor as any).selection)) {
      const element = document.querySelector(`[data-bc-sid="${sid}"]`);
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      found.push({
        sid,
        rect: new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height)
      });
    }
    setOutlines(found);
  }, [editor]);

  /*
   * Redrawn when an **answer could be different**, which is what `watchAnswers` names: a selection
   * change moves the outline, a content change moves the thing it is around, and a cleared
   * selection is the one the ribbon once missed by listening to two events out of three.
   *
   * Scroll and resize are this overlay's own: the outline is measured on screen, so anything that
   * moves the page under it invalidates the measurement without touching the document.
   */
  const answers = useEditorRevision(editor);
  useEffect(() => {
    const redraw = () => setTick((count) => count + 1);
    window.addEventListener('scroll', redraw, true);
    window.addEventListener('resize', redraw);
    return () => {
      window.removeEventListener('scroll', redraw, true);
      window.removeEventListener('resize', redraw);
    };
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, tick, answers]);

  /**
   * A press: on a shape, or on the canvas behind it.
   *
   * `preventDefault` on a shape is what stops the caret going into the page underneath — a click
   * inside a `contenteditable` places one, and a reader who has just selected a rectangle would
   * find their next keystroke in the paragraph behind it.
   */
  useEffect(() => {
    if (!host || !editor) return;

    const doc = access();
    if (!doc) return;

    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const element = target?.closest?.('[data-bc-sid]') as HTMLElement | null;
      const sid = element?.getAttribute('data-bc-sid') ?? undefined;
      const canvas = canvasAt(doc as never, sid);
      if (!sid || !canvas) return;

      event.preventDefault();

      /*
       * The canvas itself is not a shape: pressing the empty part of a drawing means "start a
       * marquee", and pressing a shape means "this one".
       */
      if (sid === canvas) {
        startBand(event, canvas);
        return;
      }

      const current = selectedNodeIds((editor as any).selection);
      const many = event.shiftKey || event.metaKey || event.ctrlKey;
      const next = many
        ? current.includes(sid)
          ? current.filter((one) => one !== sid)
          : [...current, sid]
        : /*
           * A press on something **already selected** keeps the set.
           *
           * That is the whole of dragging three shapes together: replacing the selection here would
           * mean a reader who marqueed three boxes and then pressed one of them to move them had
           * just selected one, which is the difference between a set that works and a set that is
           * only a way of colouring things in.
           */
          current.includes(sid)
          ? current
          : [sid];
      (editor as any).setNode?.(next.length > 0 ? { nodeIds: next } : null);

      // A modifier-press is a change of mind about the set, never the start of a drag.
      if (!many) startDrag(event, next, canvas);
    };

    /**
     * Dragging what is selected — and **not touching the document** until it is dropped.
     *
     * The deck's rule, for the deck's reason: a drag is thirty pointer events a second, and writing
     * each one would put thirty entries in the history for one gesture and ask the whole document
     * to lay itself out thirty times. So the drawn elements are moved with a CSS transform while
     * the pointer is down — the model still says where they were — and one command writes the
     * finished move.
     *
     * The transform is cleared before the write rather than after: the render that follows the
     * command draws the shape at its new place, and a transform still sitting on the element would
     * move it a second time.
     */
    const startDrag = (event: PointerEvent, moving: string[], canvasSid: string) => {
      const canvasEl = document.querySelector(`[data-bc-sid="${canvasSid}"]`) as HTMLElement | null;
      if (!canvasEl || moving.length === 0) return;

      const drawn = canvasEl.getBoundingClientRect();
      const size = boxOf((doc.getNode(canvasSid) as any)?.attributes);
      const elements = moving
        .map((sid) => document.querySelector(`[data-bc-sid="${sid}"]`) as HTMLElement | null)
        .filter((one): one is HTMLElement => !!one);

      const from = { x: event.clientX, y: event.clientY };
      let moved = false;

      const move = (at: PointerEvent) => {
        const dx = at.clientX - from.x;
        const dy = at.clientY - from.y;
        // A press that has not travelled is a click. Two pixels of slack, because a pointer moves
        // a little while a finger presses and a shape that jumped on every click would be unusable.
        if (!moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        moved = true;
        for (const element of elements) element.style.transform = `translate(${dx}px, ${dy}px)`;
        setDragged({ dx, dy });
      };

      const up = (at: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        for (const element of elements) element.style.transform = '';
        setDragged(null);
        if (!moved) return;

        // Screen pixels to the model's own units, through the canvas's rectangle: the same one
        // measurement the band uses, so a drag and a marquee cannot disagree about where the
        // pointer is.
        const dx = ((at.clientX - from.x) / drawn.width) * size.width;
        const dy = ((at.clientY - from.y) / drawn.height) * size.height;
        void (editor as any).executeCommand?.('moveShapes', { nodeIds: moving, dx, dy });
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    /**
     * A marquee, in **model** units.
     *
     * The band is drawn in screen pixels because that is where the pointer is, and the catching is
     * done in twips because that is where the shapes are — one conversion at each end, through the
     * canvas's own rectangle, which is the "one measurement, then arithmetic" rule the deck's
     * overlay is built on.
     */
    const startBand = (event: PointerEvent, canvasSid: string) => {
      const canvasEl = document.querySelector(`[data-bc-sid="${canvasSid}"]`) as HTMLElement | null;
      const container = layer.current?.parentElement;
      if (!canvasEl || !container) return;

      const drawn = canvasEl.getBoundingClientRect();
      const origin = container.getBoundingClientRect();
      const size = boxOf((doc.getNode(canvasSid) as any)?.attributes);
      const toModel = (clientX: number, clientY: number) => ({
        x: ((clientX - drawn.left) / drawn.width) * size.width,
        y: ((clientY - drawn.top) / drawn.height) * size.height
      });

      const from = { x: event.clientX, y: event.clientY };
      const move = (moved: PointerEvent) => {
        setBand({
          left: Math.min(from.x, moved.clientX) - origin.left,
          top: Math.min(from.y, moved.clientY) - origin.top,
          width: Math.abs(moved.clientX - from.x),
          height: Math.abs(moved.clientY - from.y)
        });
      };
      const up = (ended: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        setBand(null);

        const a = toModel(from.x, from.y);
        const b = toModel(ended.clientX, ended.clientY);
        const band: Box = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(b.x - a.x),
          height: Math.abs(b.y - a.y)
        };

        // A press with no drag is a click on the background, and clears.
        if (band.width < 2 && band.height < 2) {
          (editor as any).setNode?.(null);
          return;
        }

        const kids = ((doc.getNode(canvasSid) as any)?.content ?? []).filter(
          (one: unknown) => typeof one === 'string'
        ) as string[];
        // *Intersects*, not contains: a reader dragging across three shapes means those three,
        // not "the ones I managed to enclose completely".
        const caught = kids.filter((child) =>
          intersects(band, boxOf((doc.getNode(child) as any)?.attributes))
        );
        (editor as any).setNode?.(caught.length > 0 ? { nodeIds: caught } : null);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };

    host.addEventListener('pointerdown', onDown);
    return () => host.removeEventListener('pointerdown', onDown);
  }, [host, editor, access]);

  return (
    <div ref={layer} className="w-drawing-overlay" data-drawing-overlay>
      {outlines.map((one) => (
        <div
          key={one.sid}
          className="w-drawing-selected"
          data-drawing-selected={one.sid}
          style={{
            left: `${one.rect.left + (dragged?.dx ?? 0)}px`,
            top: `${one.rect.top + (dragged?.dy ?? 0)}px`,
            width: `${one.rect.width}px`,
            height: `${one.rect.height}px`
          }}
        />
      ))}
      {band && (
        <div
          className="w-drawing-band"
          data-drawing-band
          style={{
            left: `${band.left}px`,
            top: `${band.top}px`,
            width: `${band.width}px`,
            height: `${band.height}px`
          }}
        />
      )}
    </div>
  );
}
