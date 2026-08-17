import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import {
  RESIZE_HANDLES,
  angleOf,
  boxAt,
  boxOf,
  contains,
  intersects,
  isSceneType,
  moveBox,
  pxToTwip,
  resizeBox,
  slideSize,
  snapAngle,
  twipToPx,
  unionOf,
  unrotate,
  type Box,
  type Handle
} from '@barocss/office-slides';

/**
 * Selecting and dragging what is on a slide.
 *
 * This is the part that makes a deck editor rather than a deck viewer, and it
 * is almost entirely *not* here: every calculation — where a handle takes a
 * box, what a rotate handle is pointing at, whether a marquee caught something,
 * where a click landed on a turned shape — is a pure function in
 * `office-slides/manipulate`, tested in milliseconds. What is left in this file
 * is pointers, and the two decisions that have to be made where the pointers
 * are.
 *
 * ## One measurement, then arithmetic
 *
 * The overlay finds the slide element once per render and reads its rectangle.
 * Everything else is computed: the scale is the drawn width over the natural
 * width, model twips convert to screen pixels through it, and a pointer
 * converts back the same way. Measuring each box would mean the overlay and the
 * document could disagree about where something is; measuring the slide means
 * they cannot.
 *
 * ## Dragging does not touch the document
 *
 * A drag draws a *preview* and commits one command on release. Writing on every
 * pointer move would make one drag a hundred entries in the history — which
 * Word's ruler did, and which is the reason this is written down here as well:
 * it is the same mistake in a place that looks different.
 *
 * ## Clicking selects; double-clicking types
 *
 * What every presentation tool does, and the only arrangement that lets a shape
 * with no text in it be selected at all. While a box is being typed in, the
 * overlay stops taking pointer events entirely, so the caret, the selection and
 * IME are the editor's exactly as they are in Word.
 */

/** A drag in progress, before it becomes a command. */
interface Drag {
  handle: Handle | 'rotate';
  /** Where the pointer went down, in model units. */
  from: { x: number; y: number };
  /** The boxes as they were, by sid, so every move recomputes from the start. */
  original: Map<string, Box>;
  /** What the reader is holding now, drawn but not committed. */
  preview: Map<string, Box>;
  rotation?: number;
  moved: boolean;
}

interface Marquee {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function SelectionOverlay({
  editor,
  slideSid,
  /** Bumped by the app when the deck changes, so the overlay re-measures. */
  revision
}: {
  editor: Editor | null;
  slideSid?: string;
  revision: number;
}) {
  const [tick, bump] = useReducer((n: number) => n + 1, 0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /**
   * The box the reader is typing in.
   *
   * The app's, not the document's: two people editing one deck are not typing
   * in the same box. While it is set the overlay is inert, so every pointer and
   * every key belongs to the editor.
   */
  const [editing, setEditing] = useState<string | undefined>();
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;
    editor.on('editor:selection.model', bump);
    editor.on('editor:content.change', bump);
    return () => {
      (editor as any).off?.('editor:selection.model', bump);
      (editor as any).off?.('editor:content.change', bump);
    };
  }, [editor]);

  /**
   * Where the slide is on screen.
   *
   * The one thing that is measured rather than computed, because it is the one
   * thing that depends on layout: the stage scales, scrolls and reflows.
   */
  useLayoutEffect(() => {
    const find = () => {
      if (!slideSid) return setRect(null);
      const element = document.querySelector<HTMLElement>(
        `.sl-slide[data-bc-sid="${CSS.escape(slideSid)}"]`
      );
      setRect(element ? element.getBoundingClientRect() : null);
    };
    find();

    const observer = new ResizeObserver(find);
    const stage = document.querySelector('.sl-stage');
    if (stage) observer.observe(stage);
    window.addEventListener('scroll', find, true);
    window.addEventListener('resize', find);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', find, true);
      window.removeEventListener('resize', find);
    };
  }, [slideSid, revision, tick]);

  const store = (editor as any)?.dataStore;
  const doc = useMemo(
    () =>
      store && (editor as any)?.getRootId?.()
        ? { rootId: (editor as any).getRootId(), getNode: (sid: string) => store.getNode(sid) }
        : null,
    [store, editor, tick, revision]
  );

  /** Every box on this slide, outermost only — a frame's children move with it. */
  const boxes = useMemo(() => {
    if (!doc || !slideSid) return [] as { sid: string; box: Box; rotation: number }[];
    const surface: any = doc.getNode(slideSid);
    const children: string[] = Array.isArray(surface?.content) ? surface.content : [];

    return children
      .map((sid) => doc.getNode(sid) as any)
      .filter((node) => node && isSceneType(node.stype))
      .map((node) => ({
        sid: node.sid as string,
        box: boxOf(node.attributes),
        rotation: typeof node.attributes?.rotation === 'number' ? node.attributes.rotation : 0
      }));
  }, [doc, slideSid, tick, revision]);

  const selected = useMemo(() => {
    const ids = new Set(selectedNodeIds((editor as any)?.selection));
    return boxes.filter((entry) => ids.has(entry.sid));
  }, [editor, boxes, tick]);

  const size = useMemo(
    () => slideSize((doc && slideSid ? (doc.getNode(slideSid) as any)?.attributes : undefined)),
    [doc, slideSid, tick, revision]
  );

  /**
   * The scale, derived rather than passed.
   *
   * The slide is drawn at its natural size and transformed, so the ratio of the
   * drawn width to the natural one *is* the scale — and a scale read from the
   * thing itself cannot drift from the thing.
   */
  const scale = rect && rect.width > 0 ? rect.width / twipToPx(size.width) : 1;

  const toScreen = useCallback(
    (value: number) => twipToPx(value) * scale,
    [scale]
  );
  const toModel = useCallback(
    (event: { clientX: number; clientY: number }) => ({
      x: pxToTwip((event.clientX - (rect?.left ?? 0)) / scale),
      y: pxToTwip((event.clientY - (rect?.top ?? 0)) / scale)
    }),
    [rect, scale]
  );

  /**
   * Which box is under a point.
   *
   * Backwards, because document order is paint order: the last child is drawn
   * on top, so it is the one a reader means when two overlap.
   */
  const hitTest = useCallback(
    (point: { x: number; y: number }) => {
      for (let index = boxes.length - 1; index >= 0; index -= 1) {
        const entry = boxes[index];
        if (contains(entry.box, unrotate(entry.box, entry.rotation, point))) return entry;
      }
      return undefined;
    },
    [boxes]
  );

  const select = useCallback(
    (ids: string[]) => {
      (editor as any)?.executeCommand?.('setNode', { nodeIds: ids });
    },
    [editor]
  );

  // ── Dragging ───────────────────────────────────────────────────────────────

  const onPointerDown = (event: React.PointerEvent) => {
    if (!editor || !rect) return;
    const handle = (event.target as HTMLElement).dataset.handle as Handle | 'rotate' | undefined;
    const point = toModel(event);

    if (handle) {
      // A handle belongs to the current selection; nothing is re-selected.
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDrag({
        handle,
        from: point,
        original: new Map(selected.map((entry) => [entry.sid, entry.box])),
        preview: new Map(selected.map((entry) => [entry.sid, entry.box])),
        rotation: selected[0]?.rotation ?? 0,
        moved: false
      });
      return;
    }

    const hit = hitTest(point);

    if (!hit) {
      // Empty slide: start a marquee, and drop the selection unless the reader
      // is adding to it.
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      if (!event.shiftKey) select([]);
      setEditing(undefined);
      setMarquee({ from: point, to: point });
      return;
    }

    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const current = selectedNodeIds((editor as any).selection);
    const next = event.shiftKey
      ? current.includes(hit.sid)
        ? current.filter((sid) => sid !== hit.sid)
        : [...current, hit.sid]
      : current.includes(hit.sid)
        ? current
        : [hit.sid];

    select(next);
    setEditing(undefined);

    // A press on a selected box starts a move; the drag only becomes an edit if
    // the pointer actually travels.
    const dragging = boxes.filter((entry) => next.includes(entry.sid));
    setDrag({
      handle: 'move',
      from: point,
      original: new Map(dragging.map((entry) => [entry.sid, entry.box])),
      preview: new Map(dragging.map((entry) => [entry.sid, entry.box])),
      moved: false
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (marquee) {
      setMarquee({ ...marquee, to: toModel(event) });
      return;
    }
    if (!drag) return;

    const point = toModel(event);
    const delta = { dx: point.x - drag.from.x, dy: point.y - drag.from.y };
    const moved = drag.moved || Math.abs(delta.dx) > 30 || Math.abs(delta.dy) > 30;

    if (drag.handle === 'rotate') {
      const first = drag.original.values().next().value as Box | undefined;
      if (!first) return;
      const angle = angleOf(first, point);
      setDrag({
        ...drag,
        moved,
        rotation: event.shiftKey ? snapAngle(angle) : Math.round(angle)
      });
      return;
    }

    const preview = new Map<string, Box>();
    for (const [sid, box] of drag.original) {
      preview.set(
        sid,
        drag.handle === 'move'
          ? moveBox(box, delta)
          : resizeBox(box, drag.handle, delta, {
              keepAspect: event.shiftKey,
              fromCentre: event.altKey
            })
      );
    }
    setDrag({ ...drag, preview, moved });
  };

  const onPointerUp = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);

    if (marquee) {
      const box = marqueeBox(marquee);
      const caught = boxes.filter((entry) => intersects(box, entry.box)).map((entry) => entry.sid);
      if (caught.length > 0) {
        const current = event.shiftKey ? selectedNodeIds((editor as any).selection) : [];
        select([...new Set([...current, ...caught])]);
      }
      setMarquee(null);
      return;
    }

    if (!drag) return;

    /**
     * One command for the whole drag, and none at all if nothing moved.
     *
     * A click that selects is not an edit: committing an unchanged geometry
     * would put an entry in the history that undoes to the same document, and a
     * reader pressing undo would watch nothing happen.
     */
    if (drag.moved) {
      if (drag.handle === 'rotate') {
        const [sid] = [...drag.original.keys()];
        if (sid) {
          void (editor as any).executeCommand?.('setBoxGeometry', {
            nodeId: sid,
            rotation: drag.rotation ?? 0
          });
        }
      } else {
        for (const [sid, box] of drag.preview) {
          void (editor as any).executeCommand?.('setBoxGeometry', { nodeId: sid, ...box });
        }
      }
    }

    setDrag(null);
  };

  /**
   * Double-click puts the caret in.
   *
   * The overlay goes inert and the editor takes over completely: the click that
   * follows lands on the text, and so does every key after it. A shape with no
   * text simply has nothing to enter.
   */
  const onDoubleClick = (event: React.PointerEvent) => {
    const hit = hitTest(toModel(event));
    if (!hit) return;
    const node: any = doc?.getNode(hit.sid);
    if (node?.stype !== 'textFrame' && node?.stype !== 'sticky') return;

    setEditing(hit.sid);

    /**
     * Entering the text means putting the caret in it.
     *
     * The double-click landed on the overlay, so the editor never saw it and
     * there is no caret — the box went into editing mode and every keystroke
     * after it went nowhere. Measured: typing after a double-click changed
     * nothing at all, and nothing anywhere said so.
     *
     * Placed where they clicked, from the same coordinates, because that is
     * where a reader expects to carry on typing. On the next frame, because the
     * overlay has to stop taking pointer events first — and that is a React
     * render away.
     */
    const { clientX, clientY } = event;
    requestAnimationFrame(() => {
      const at =
        (document as any).caretPositionFromPoint?.(clientX, clientY) ??
        (document as any).caretRangeFromPoint?.(clientX, clientY);
      if (!at) return;

      const range = document.createRange();
      if ('offsetNode' in at) range.setStart(at.offsetNode, at.offset);
      else range.setStart(at.startContainer, at.startOffset);
      range.collapse(true);

      const dom = window.getSelection();
      dom?.removeAllRanges();
      dom?.addRange(range);
      (range.startContainer.parentElement as HTMLElement | null)?.closest<HTMLElement>(
        '[contenteditable="true"]'
      )?.focus();
    });
  };

  // Escape leaves the text and gives the box back to the overlay.
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setEditing(undefined);
      select([editing]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, select]);

  /**
   * The keys that belong to a selection of boxes.
   *
   * Only while boxes are selected and the reader is not in the text — which is
   * the whole reason these can be bound at all: Delete means "remove this
   * character" with a caret and "throw this shape away" with a shape, and the
   * two readings cannot both be in the editor's key map. The selection is what
   * says which one is meant.
   *
   * Each press is its own command, so each is its own undo. Holding an arrow
   * key and nudging thirty times is thirty entries in the history, which is
   * exactly what a reader pressing undo thirty times expects to get back.
   */
  useEffect(() => {
    if (!editor || editing) return;

    const onKey = (event: KeyboardEvent) => {
      /**
       * The *model* decides whose keys these are, not the DOM.
       *
       * Asking where the event landed was tried and is wrong: a node selection
       * is still written into the browser, so the editor keeps a caret in the
       * text and Delete arrived at the contenteditable. Measured — the command
       * that ran was `deleteForward`, and the shape the reader had selected was
       * untouched while a character somewhere else went missing.
       *
       * A node selection says whole boxes are selected. Delete then means
       * "throw these away" wherever the browser happens to have parked its
       * caret, and `editing` is the one state where the reader really is typing.
       */
      if (selectedNodeIds((editor as any).selection).length === 0) return;

      const target = event.target as HTMLElement | null;
      // A field in the chrome does own its own keys — it is not the document.
      if (target?.closest?.('input, textarea')) return;

      const run = (command: string, payload?: Record<string, unknown>) => {
        event.preventDefault();
        // Capture phase, so this stops before the editor's own key map — which
        // binds Delete on the contenteditable and would delete a character.
        event.stopPropagation();
        void (editor as any).executeCommand?.(command, payload);
      };

      if (event.key === 'Delete' || event.key === 'Backspace') return run('deleteBoxes');
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
        return run('duplicateBoxes');
      }
      // Cmd+G and Cmd+Shift+G, which is what every drawing tool binds.
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'g') {
        return run(event.shiftKey ? 'ungroupBoxes' : 'groupBoxes');
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        return select([]);
      }

      const step = event.shiftKey ? 144 : 15; // a tenth of an inch, or one pixel
      if (event.key === 'ArrowLeft') return run('nudgeBoxes', { dx: -step, dy: 0 });
      if (event.key === 'ArrowRight') return run('nudgeBoxes', { dx: step, dy: 0 });
      if (event.key === 'ArrowUp') return run('nudgeBoxes', { dx: 0, dy: -step });
      if (event.key === 'ArrowDown') return run('nudgeBoxes', { dx: 0, dy: step });
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [editor, editing, select, tick]);

  /**
   * Leaving the text when the caret leaves the box.
   *
   * Clicking another box would otherwise be a click on inert space, because the
   * overlay is not listening while a box is being typed in.
   */
  useEffect(() => {
    if (!editing || !doc || !editor) return;
    const at = (editor as any).selection?.startNodeId as string | undefined;
    const box = boxAt(doc as never, at);
    if (box && box.sid !== editing) setEditing(undefined);
  }, [editing, doc, editor, tick]);

  if (!rect || !slideSid) return null;

  const shown = (entry: { sid: string; box: Box; rotation: number }): { box: Box; rotation: number } => ({
    box: drag?.preview.get(entry.sid) ?? entry.box,
    rotation:
      drag?.handle === 'rotate' && drag.original.has(entry.sid)
        ? (drag.rotation ?? entry.rotation)
        : entry.rotation
  });

  const outline = selected.length > 0 ? unionOf(selected.map((entry) => shown(entry).box)) : undefined;

  /**
   * The handles turn with the shape, when there is one shape.
   *
   * They did not at first, and it was obvious the moment anything was rotated:
   * the box lay at an angle inside an upright frame of handles, and grabbing the
   * "south-east" one pulled a corner that was no longer in the south-east. A set
   * of shapes has no single angle to turn by, so its frame stays upright — which
   * is also what every drawing tool does.
   */
  const outlineRotation = selected.length === 1 ? shown(selected[0]).rotation : 0;
  // Handles keep their size on screen whatever the slide is scaled to; a handle
  // that shrank with the slide would be unusable at the sizes a deck is edited.
  const handleSize = 9;

  return (
    <div
      ref={layer}
      className="sl-overlay"
      data-editing={editing ? 'true' : undefined}
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        // Inert while the reader is typing: the caret, the selection and IME are
        // the editor's, exactly as they are in Word.
        pointerEvents: editing ? 'none' : 'auto',
        cursor: drag?.handle === 'move' ? 'move' : 'default'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick as never}
    >
      {/* Every selected box, outlined where it is being drawn right now. */}
      {selected.map((entry) => {
        const { box, rotation } = shown(entry);
        return (
          <div
            key={entry.sid}
            className="sl-selected"
            data-sid={entry.sid}
            style={{
              position: 'absolute',
              left: toScreen(box.x),
              top: toScreen(box.y),
              width: toScreen(box.width),
              height: toScreen(box.height),
              transform: rotation ? `rotate(${rotation}deg)` : undefined,
              pointerEvents: 'none'
            }}
          />
        );
      })}

      {/* One set of handles for the selection, around all of it. */}
      {outline && !marquee && (
        <div
          className="sl-handles"
          style={{
            position: 'absolute',
            left: toScreen(outline.x),
            top: toScreen(outline.y),
            width: toScreen(outline.width),
            height: toScreen(outline.height),
            transform: outlineRotation ? `rotate(${outlineRotation}deg)` : undefined,
            pointerEvents: 'none'
          }}
        >
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              data-handle={handle}
              className="sl-handle"
              style={{
                position: 'absolute',
                width: handleSize,
                height: handleSize,
                marginLeft: -handleSize / 2,
                marginTop: -handleSize / 2,
                left: handle.includes('w') ? 0 : handle.includes('e') ? '100%' : '50%',
                top: handle.startsWith('n') ? 0 : handle.startsWith('s') ? '100%' : '50%',
                cursor: `${handle}-resize`,
                pointerEvents: 'auto'
              }}
            />
          ))}

          {/* One box turns; a set of them has no single centre to turn about. */}
          {selected.length === 1 && (
            <span
              data-handle="rotate"
              className="sl-handle sl-handle-rotate"
              style={{
                position: 'absolute',
                left: '50%',
                top: -22,
                width: handleSize,
                height: handleSize,
                marginLeft: -handleSize / 2,
                cursor: 'grab',
                pointerEvents: 'auto'
              }}
            />
          )}
        </div>
      )}

      {marquee && (
        <div
          className="sl-marquee"
          style={{
            position: 'absolute',
            left: toScreen(marqueeBox(marquee).x),
            top: toScreen(marqueeBox(marquee).y),
            width: toScreen(marqueeBox(marquee).width),
            height: toScreen(marqueeBox(marquee).height),
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  );
}

/** A marquee is two corners; a box is a corner and a size. */
function marqueeBox(marquee: Marquee): Box {
  return {
    x: Math.min(marquee.from.x, marquee.to.x),
    y: Math.min(marquee.from.y, marquee.to.y),
    width: Math.abs(marquee.to.x - marquee.from.x),
    height: Math.abs(marquee.to.y - marquee.from.y)
  };
}
