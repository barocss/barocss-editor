import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import {
  RESIZE_HANDLES,
  fromSurface,
  angleOf,
  boxAt,
  boxOf,
  contains,
  guidesFor,
  intersects,
  isSceneType,
  moveBox,
  pxToTwip,
  resizeBox,
  slideSize,
  snapAngle,
  snapBox,
  snapResize,
  twipToPx,
  unionOf,
  unrotate,
  type Box,
  type Guide,
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
  /** The lines the drag was pulled onto, drawn so the jump explains itself. */
  guides?: Guide[];
}

interface Marquee {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export function SelectionOverlay({
  editor,
  /**
   * The view, for the one thing the editor alone cannot be told.
   *
   * A node selection holds until a gesture in the text, and this overlay makes
   * that gesture on the reader's behalf — the double-click lands here, so the
   * contenteditable never sees a pointer.
   */
  view,
  slideSid,
  /** Bumped by the app when the deck changes, so the overlay re-measures. */
  revision
}: {
  editor: Editor | null;
  view: { enteredText?: () => void } | null;
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
  /**
   * The container the reader has gone inside, if any.
   *
   * A frame and a group hold other boxes, and their children were unreachable:
   * the overlay's candidates were the slide's *direct* children, so a rectangle
   * in a frame could not be clicked, moved, formatted or even seen by the
   * properties panel — clicking it selected the frame. A deck could make groups
   * and could not edit anything in one.
   *
   * Double-click goes in, Escape comes back out, one level at a time, which is
   * what every tool that has containers does. The app's, not the document's:
   * where one reader has gone is not a fact about the deck.
   */
  const [inside, setInside] = useState<string | undefined>();
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
      /**
       * Inside the stage, and said so.
       *
       * A slide's element is found by its sid, and the sid is the document's —
       * so anything else drawing the same slide answers to the same selector.
       * The filmstrip does: a thumbnail is that slide, drawn again, small. An
       * unscoped query would hand the overlay a 160-pixel rectangle to place its
       * handles in.
       */
      const element = document.querySelector<HTMLElement>(
        `.sl-stage .sl-slide[data-bc-sid="${CSS.escape(slideSid)}"]`
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

  // Leaving the slide leaves whatever container was entered on it.
  useEffect(() => {
    setInside(undefined);
  }, [slideSid]);

  const store = (editor as any)?.dataStore;
  const doc = useMemo(
    () =>
      store && (editor as any)?.getRootId?.()
        ? { rootId: (editor as any).getRootId(), getNode: (sid: string) => store.getNode(sid) }
        : null,
    [store, editor, tick, revision]
  );

  /**
   * Where the entered container sits on the slide.
   *
   * A child's `x` and `y` are its container's, not the slide's — the renderer
   * places a frame `relative` and its children `absolute` inside it — so every
   * coordinate here is shifted by the chain of containers between the slide and
   * whatever the reader has gone into. Read with it added, written with it taken
   * off, in one place each, because that is a conversion two places will
   * eventually disagree about.
   *
   * Zero when nothing has been entered, which is the common case and costs
   * nothing.
   */
  const origin = useMemo(() => {
    if (!doc || !inside) return { x: 0, y: 0 };
    // `fromSurface` of the origin *is* the origin, negated — asking the shared
    // conversion rather than walking the chain again here, which is what this
    // used to do and what grouping still did separately.
    const zero = fromSurface(doc as never, inside, { x: 0, y: 0 });
    return { x: -zero.x, y: -zero.y };
  }, [doc, inside, tick, revision]);

  /**
   * The boxes a click can land on: the children of whatever is being looked
   * inside, which is the slide until the reader enters a frame or a group.
   *
   * Outermost only, and deliberately: a frame's children move with it, so
   * dragging one from outside would mean dragging the frame. Going in is how a
   * reader says otherwise.
   */
  const boxes = useMemo(() => {
    if (!doc || !slideSid) {
      return [] as { sid: string; box: Box; rotation: number; fill?: string }[];
    }
    const container: any = doc.getNode(inside ?? slideSid);
    const children: string[] = Array.isArray(container?.content) ? container.content : [];

    return children
      .map((sid) => doc.getNode(sid) as any)
      .filter((node) => node && isSceneType(node.stype))
      .map((node) => {
        const box = boxOf(node.attributes);
        return {
          sid: node.sid as string,
          // Into the slide's coordinates, so hit-testing, handles, guides and
          // the marquee all speak one language.
          box: { ...box, x: box.x + origin.x, y: box.y + origin.y },
          rotation: typeof node.attributes?.rotation === 'number' ? node.attributes.rotation : 0,
          // For the ghost drawn while dragging; see below.
          fill: typeof node.attributes?.fill === 'string' ? (node.attributes.fill as string) : undefined
        };
      });
  }, [doc, slideSid, inside, origin, tick, revision]);

  /**
   * The entered container's own box, in the slide's coordinates.
   *
   * Its children are drawn relative to it, so its origin *is* `origin` and its
   * size is its own. Used for two things a reader needs: an outline saying where
   * they are, and the test for a click that means "and now I am done in here".
   */
  const insideBox = useMemo(() => {
    if (!inside) return undefined;
    const node: any = doc?.getNode(inside);
    if (!node) return undefined;
    const box = boxOf(node.attributes);
    return { ...box, x: origin.x, y: origin.y };
  }, [doc, inside, origin]);

  /** Whether a node is one a reader can go inside. */
  const isContainer = useCallback(
    (sid?: string) => {
      const stype = sid ? (doc?.getNode(sid) as any)?.stype : undefined;
      return stype === 'frame' || stype === 'group';
    },
    [doc]
  );

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
      /**
       * Outside the container the reader went into is the way out.
       *
       * Escape does it too, but a click on the slide beyond a group is what
       * every tool with containers treats as leaving, and without it a reader
       * who has gone in can only get out by knowing about a key.
       */
      if (insideBox && !contains(insideBox, point)) {
        event.preventDefault();
        const parent = (doc?.getNode(inside!) as any)?.parentId as string | undefined;
        setInside(parent && parent !== slideSid && isContainer(parent) ? parent : undefined);
        select([inside!]);
        return;
      }

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

    /**
     * Snapping, unless the reader is holding a key that says not to.
     *
     * The threshold is in *model* units and computed from the scale, because
     * what counts as "close enough" is a distance on the reader's screen: eight
     * screen pixels at half size is sixteen slide pixels, and a fixed model
     * threshold feels sticky zoomed out and dead zoomed in.
     *
     * ## A move and a resize snap differently
     *
     * A move shifts the whole selection as one box, so a set of shapes lands
     * together rather than each finding its own line, and any of the box's six
     * lines is a candidate. A resize holds the opposite edge still, so only the
     * lines the handle moves are candidates and pulling one changes the size —
     * `snapResize`, which is a separate function for exactly that reason.
     *
     * ## A modifier turns snapping off
     *
     * Shift asks for proportions and Alt for resize-from-centre, and both are
     * requests for an *exact* relationship that a snap would break: a snap that
     * respected the aspect would have to move the other axis, which moves it off
     * the guide it just snapped to. So the modifier wins and nothing snaps,
     * which is the honest resolution rather than a rule about degrees.
     *
     * A resize of more than one box does not snap either. Each box would need
     * its own edge pulled to its own guide, and they would arrive at different
     * sizes — which is not what dragging one handle looks like it should do.
     */
    const suppressed = event.metaKey || event.ctrlKey;
    const modified = event.shiftKey || event.altKey;

    let guides: Guide[] = [];
    const others = () =>
      guidesFor(
        boxes
          .filter((entry) => !new Set(preview.keys()).has(entry.sid))
          .map((entry) => entry.box),
        { x: 0, y: 0, width: size.width, height: size.height }
      );
    const within = pxToTwip(8 / scale);

    if (drag.handle === 'move' && !suppressed) {
      const frame = unionOf([...preview.values()]);

      if (frame) {
        const { box: snapped, hit } = snapBox(frame, others(), within);

        const shift = { dx: snapped.x - frame.x, dy: snapped.y - frame.y };
        if (shift.dx !== 0 || shift.dy !== 0) {
          for (const [sid, box] of preview) preview.set(sid, moveBox(box, shift));
        }
        guides = hit;
      }
    } else if (drag.handle !== 'move' && !suppressed && !modified && preview.size === 1) {
      const [sid] = [...preview.keys()];
      const { box: snapped, hit } = snapResize(preview.get(sid)!, drag.handle, others(), within);
      preview.set(sid, snapped);
      guides = hit;
    }

    setDrag({ ...drag, preview, moved, guides });
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
          // Back into the container's coordinates. `boxes` added the origin so
          // the drag could work in the slide's; this is the one place that takes
          // it off again.
          void (editor as any).executeCommand?.('setBoxGeometry', {
            nodeId: sid,
            ...box,
            x: box.x - origin.x,
            y: box.y - origin.y
          });
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

    /**
     * A container is gone *into* rather than typed in.
     *
     * The same gesture as entering text, and for the same reason: the first
     * click says which thing, the second says "and now work on what is in it".
     * The child under the pointer is selected on the way in, so a reader who
     * double-clicks a rectangle inside a frame gets the rectangle rather than an
     * empty selection and a container they now have to click again.
     */
    if (isContainer(hit.sid)) {
      event.preventDefault();
      setInside(hit.sid);
      setEditing(undefined);

      const point = toModel(event);
      const child = ((doc?.getNode(hit.sid) as any)?.content ?? [])
        .map((sid: string) => doc?.getNode(sid) as any)
        .filter((n: any) => n && isSceneType(n.stype))
        .map((n: any) => {
          const box = boxOf(n.attributes);
          return {
            sid: n.sid as string,
            // `hit.box` is already in the slide's coordinates, and the child's
            // are its container's, so the two add.
            box: { ...box, x: box.x + hit.box.x, y: box.y + hit.box.y },
            rotation: typeof n.attributes?.rotation === 'number' ? n.attributes.rotation : 0
          };
        })
        .reverse()
        .find((entry: any) => contains(entry.box, unrotate(entry.box, entry.rotation, point)));

      select(child ? [child.sid] : []);
      return;
    }

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

      /**
       * And tell the view, which is the half that was missing.
       *
       * Placing the caret is not enough: a node selection holds until a gesture
       * *in the text*, and this one happened on the overlay, so the editor's
       * model went on saying a box was selected while the reader typed into a
       * paragraph. Every command that reads the model selection was answering
       * about the wrong thing — inserting a table did nothing at all, from a
       * button that looked perfectly enabled.
       */
      view?.enteredText?.();
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
      const chosen = selectedNodeIds((editor as any).selection);

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

      /**
       * Paste, which is the one that works with nothing selected.
       *
       * Every other key here needs boxes to act on. A paste needs somewhere to
       * put them, and an empty slide is somewhere — so it is handled before the
       * guard below rather than after it. `parentId` is the container the reader
       * has gone into, which only this overlay knows.
       *
       * Still not while typing: `editing` is checked at the top, so Ctrl+V with
       * a caret in a text box is the text paste, which is what a reader means.
       */
      const clipboard = (event.metaKey || event.ctrlKey) && !event.altKey;
      if (clipboard && event.key.toLowerCase() === 'v') {
        return run('pasteBoxes', { parentId: inside ?? slideSid });
      }

      if (chosen.length === 0) return;

      if (clipboard && event.key.toLowerCase() === 'c') return run('copyBoxes');
      if (clipboard && event.key.toLowerCase() === 'x') return run('cutBoxes');

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
        /**
         * Out of the container first, and only then out of the selection.
         *
         * Going in was one gesture, so coming out is one too, and a reader
         * inside a frame pressing Escape means "back out here" rather than
         * "drop everything". The container is selected on the way out, which is
         * where the reader was before they went in.
         */
        if (inside) {
          const parent = (doc?.getNode(inside) as any)?.parentId as string | undefined;
          setInside(parent && parent !== slideSid && isContainer(parent) ? parent : undefined);
          return select([inside]);
        }
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
  }, [editor, editing, select, tick, inside, doc, slideSid, isContainer]);

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
      {/*
        * Where the reader is, when they are inside something.
        *
        * A dashed outline round the container, drawn behind everything else. A
        * reader who has gone into a group and sees no sign of it has no way to
        * know why clicking the slide does nothing.
        */}
      {insideBox && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: toScreen(insideBox.x),
            top: toScreen(insideBox.y),
            width: toScreen(insideBox.width),
            height: toScreen(insideBox.height),
            border: '1px dashed rgba(37, 99, 235, 0.5)',
            borderRadius: 2,
            pointerEvents: 'none'
          }}
        />
      )}

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
              pointerEvents: 'none',
              /**
               * A ghost of the shape while it is being dragged.
               *
               * The document is not written until the drag ends, so the shape
               * itself stays where it was and only this outline follows the
               * pointer — which reads as dragging a frame around rather than
               * dragging the thing. The overlay draws its own translucent copy
               * instead of moving an element the view owns and rewrites.
               */
              background: drag?.moved && entry.fill ? entry.fill : undefined,
              opacity: drag?.moved && entry.fill ? 0.45 : undefined
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

      {/*
       * The lines the drag was pulled onto. Drawn from the same candidates that
       * moved the box, rather than a second guess at what happened — a shape
       * that jumps without saying why reads as the tool fighting the reader.
       */}
      {(drag?.guides ?? []).map((guide, index) => (
        <div
          key={`${guide.axis}-${guide.at}-${index}`}
          className="sl-guide"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            ...(guide.axis === 'x'
              ? { left: toScreen(guide.at), top: 0, width: 1, height: '100%' }
              : { top: toScreen(guide.at), left: 0, height: 1, width: '100%' })
          }}
        />
      ))}

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
