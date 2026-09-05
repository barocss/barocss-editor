import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dragGesture } from '@barocss/shared';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import {
  RESIZE_HANDLES,
  boxOf,
  canvasAt,
  guidesFor,
  intersects,
  moveBox,
  snapBox,
  unionOf,
  type Box,
  type Guide,
  type Handle
} from '@barocss/office-canvas';
import { useEditorRevision } from '@barocss/office-editor-ui';

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
  /** Which handle is being pulled, and how far — the frame follows it while the shape does not. */
  const [pulled, setPulled] = useState<{ handle: Handle; dx: number; dy: number } | null>(null);
  /** The lines a drag has landed on, drawn while it holds them. */
  const [guides, setGuides] = useState<{ axis: 'x' | 'y'; at: number }[]>([]);
  /** Where the drawing is on screen, and how big it is in the model — a guide needs both. */
  const [canvasRect, setCanvasRect] = useState<
    { left: number; top: number; width: number; height: number; size: Box } | null
  >(null);

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

    /*
     * And where the drawing itself is, which is what a guide line is measured against: a guide is
     * a position in the model, and only the canvas's own rectangle turns that into a place on the
     * screen.
     */
    const chosen = selectedNodeIds((editor as any).selection)[0];
    const store = (editor as any).dataStore;
    const canvasSid = chosen
      ? canvasAt({ rootId: (editor as any).getRootId?.(), getNode: (sid: string) => store?.getNode(sid) } as never, chosen)
      : undefined;
    const canvasEl = canvasSid ? document.querySelector(`[data-bc-sid="${canvasSid}"]`) : null;
    if (!canvasEl) return setCanvasRect(null);
    const rect = canvasEl.getBoundingClientRect();
    setCanvasRect({
      left: rect.left - origin.left,
      top: rect.top - origin.top,
      width: rect.width,
      height: rect.height,
      size: boxOf(store?.getNode(canvasSid)?.attributes)
    });
  }, [editor]);

  /**
   * Where the handles sit: around **everything** that is selected.
   *
   * One frame for the set rather than eight handles per shape, which is what every drawing tool
   * does and what makes a multiple selection something a reader can act on rather than look at.
   * Upright, always: a set has no single angle to turn by — and Word's shapes have no rotate
   * gesture yet, so there is no second case to get wrong.
   */
  const frame = outlines.length > 0
    ? unionOf(
        outlines.map((one) => ({
          x: one.rect.left + (dragged?.dx ?? 0),
          y: one.rect.top + (dragged?.dy ?? 0),
          width: one.rect.width,
          height: one.rect.height
        }))
      )
    : undefined;

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
      /*
       * **Shift** adds to the set, and Cmd/Ctrl does not.
       *
       * It did at first, because ctrl-click is "add to selection" in a file manager — and it took
       * the modifier the deck already spends on something else: Cmd or Ctrl held during a drag means
       * *exactly here*, with no snapping. A modifier that both changed the set and turned snapping
       * off would make the second one unreachable, since a press that changes the set never becomes
       * a drag.
       */
      const many = event.shiftKey;
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

      /**
       * What this drag may snap to, measured once at the start.
       *
       * Every *other* shape on the drawing — its edges and its middle — plus the drawing's own
       * edges and centre. The centres matter as much as the edges: "centred on the page" is the
       * thing an author is most often aiming at and the one position they cannot hit by eye.
       *
       * Once, and not per pointer event: what is on the canvas does not change while a drag is
       * held, and re-deriving it thirty times a second would be thirty chances to disagree.
       */
      const held = new Set(moving);
      const others = ((doc.getNode(canvasSid) as any)?.content ?? [])
        .filter((sid: unknown): sid is string => typeof sid === 'string' && !held.has(sid))
        .map((sid: string) => boxOf((doc.getNode(sid) as any)?.attributes));
      const lines = guidesFor(others, { x: 0, y: 0, width: size.width, height: size.height });
      const start = unionOf(moving.map((sid) => boxOf((doc.getNode(sid) as any)?.attributes)));

      /*
       * "Close enough" is a distance on the reader's **screen**, so the threshold is eight screen
       * pixels converted into the model — the deck's number and the deck's reason: a fixed model
       * threshold feels sticky on a page zoomed out and dead on one zoomed in.
       */
      const within = (8 / drawn.width) * size.width;
      const toModel = (dx: number, dy: number) => ({
        dx: (dx / drawn.width) * size.width,
        dy: (dy / drawn.height) * size.height
      });

      let landed = { dx: 0, dy: 0 };

      /**
       * **미리 보기는 `transform` 으로, 쓰기는 놓을 때 한 번.**
       *
       * 문턱은 `dragGesture` 가 잡는다 — 전에는 `moved` 깃발과 2px 을 손으로 셌고, 그 주석의 이유가
       * 그대로 맞다: *누르는 동안 포인터가 조금 움직이고, 클릭마다 도형이 뛰면 못 쓴다.* 이제 그
       * 판단이 제스처의 것이고 `moved.dragged` 가 같은 답을 준다.
       *
       * 그리고 없던 것이 둘 생긴다. **`pointercancel`** 로 끝나도 `transform` 이 걷히고 창에
       * 리스너가 안 남는다 — 전에는 남아서, 그 뒤로 아무 포인터 움직임이나 스냅 계산을 계속 돌았다.
       * 그리고 **Escape 로 물러서면** 도형이 제자리로 돌아간다.
       */
      const move = (at: { clientX: number; clientY: number; metaKey?: boolean; ctrlKey?: boolean }) => {
        const dx = at.clientX - (event as PointerEvent).clientX;
        const dy = at.clientY - (event as PointerEvent).clientY;
        const asked = toModel(dx, dy);
        landed = asked;
        let hit: Guide[] = [];

        /*
         * The whole selection snaps as **one box**, so a set lands together rather than each shape
         * finding its own line — and Cmd or Ctrl turns it off, which is what a reader holds when
         * they mean *exactly here*.
         */
        if (start && !at.metaKey && !at.ctrlKey) {
          const frame = moveBox(start, asked);
          const snapped = snapBox(frame, lines, within);
          landed = {
            dx: asked.dx + (snapped.box.x - frame.x),
            dy: asked.dy + (snapped.box.y - frame.y)
          };
          hit = snapped.hit;
        }

        const screen = {
          dx: (landed.dx / size.width) * drawn.width,
          dy: (landed.dy / size.height) * drawn.height
        };
        for (const element of elements) {
          element.style.transform = `translate(${screen.dx}px, ${screen.dy}px)`;
        }
        setDragged(screen);
        setGuides(hit);
      };

      /** 그리던 것을 걷는다 — 놓든 물러서든 화면은 문서가 말하는 대로 돌아가야 한다. */
      const clear = () => {
        for (const element of elements) element.style.transform = '';
        setDragged(null);
        setGuides([]);
      };

      dragGesture(
        event,
        {
          start: () => ({}),
          move: (_held, at) => move({ clientX: at.x, clientY: at.y, metaKey: at.meta, ctrlKey: at.ctrl }),
          done: (_held, at) => {
            clear();
            if (!at.dragged) return;
            // What was drawn is what is written: the snapped delta, not the pointer's own.
            void (editor as any).executeCommand?.('moveShapes', {
              nodeIds: moving,
              dx: landed.dx,
              dy: landed.dy
            });
          },
          abort: () => clear()
        },
        /* 2px — 이 자리가 원래 세던 문턱 그대로다. */
        { threshold: 2 }
      );
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

      /**
       * **밴드는 화면의 것이고, 무엇을 잡았나는 모델의 것이다.**
       *
       * 문턱이 0인 이유: 밴드는 첫 픽셀부터 보여야 한다. *끌지 않은 누름은 배경 클릭* 이라는 판단은
       * 아래에서 모델 좌표로 2 미만인지 물어서 하고, 그건 화면 픽셀이 아니라 문서의 단위다 — 확대해
       * 놓고 조금 끈 것과 축소해 놓고 많이 끈 것을 같게 다루면 안 된다.
       */
      const move = (at: { x: number; y: number }) => {
        setBand({
          left: Math.min(event.clientX, at.x) - origin.left,
          top: Math.min(event.clientY, at.y) - origin.top,
          width: Math.abs(at.x - event.clientX),
          height: Math.abs(at.y - event.clientY)
        });
      };

      const land = (at: { x: number; y: number }) => {
        setBand(null);

        const a = toModel(event.clientX, event.clientY);
        const b = toModel(at.x, at.y);
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

      dragGesture(
        event,
        {
          start: () => ({}),
          move: (_held, at) => move(at),
          done: (_held, at) => land(at),
          /* 물러서면 밴드만 걷고 선택은 건드리지 않는다 — 고르던 것을 취소한 것이지 지운 것이 아니다. */
          abort: () => setBand(null)
        },
        { threshold: 0 }
      );
    };

    host.addEventListener('pointerdown', onDown);
    return () => host.removeEventListener('pointerdown', onDown);
  }, [host, editor, access]);

  /**
   * Pulling a **handle**, which is the one thing this layer does take the pointer for.
   *
   * The handles are the overlay's own elements, so they carry `pointer-events: auto` against the
   * layer's `none` — the shapes underneath stay clickable and the eight little squares do not.
   *
   * A resize is not previewed by transforming the element the way a move is: `translate` cannot say
   * *bigger*, and a shape that scaled its stroke and its text while being dragged would be showing
   * the reader something the model will never hold. The frame follows instead, which is what the
   * deck settled on for the same reason.
   */
  const onHandle = (handle: Handle) => (event: React.PointerEvent) => {
    const doc = access();
    const moving = selectedNodeIds((editor as any)?.selection);
    if (!doc || moving.length === 0) return;

    const canvasSid = canvasAt(doc as never, moving[0]);
    const canvasEl = canvasSid
      ? (document.querySelector(`[data-bc-sid="${canvasSid}"]`) as HTMLElement | null)
      : null;
    if (!canvasSid || !canvasEl) return;

    event.preventDefault();
    event.stopPropagation();

    const drawn = canvasEl.getBoundingClientRect();
    const size = boxOf((doc.getNode(canvasSid) as any)?.attributes);
    dragGesture(
      event,
      {
        start: () => ({}),
        /* 미리 보기는 화면 픽셀의 델타 — 그리는 것은 화면의 일이다. */
        move: (_held, at) => setPulled({ handle, dx: at.dx, dy: at.dy }),

        done: (_held, at) => {
          setPulled(null);

          const dx = (at.dx / drawn.width) * size.width;
          const dy = (at.dy / drawn.height) * size.height;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

          /**
           * **Shift 와 Alt 는 놓을 때의 것이다** — 그리고 그게 `moved` 가 주는 것이다.
           *
           * 전에는 `pointerup` 이벤트의 `shiftKey`/`altKey` 를 읽었고 답은 같다. 다른 것은 이제
           * *언제 읽는가* 가 한 곳에 적혀 있다는 것이다: 비율 고정과 가운데 기준은 **끄는 중에**
           * 누르고 뗄 때의 상태가 답이다.
           */
          void (editor as any).executeCommand?.('resizeShapes', {
            nodeIds: moving,
            handle,
            dx,
            dy,
            keepAspect: at.shift,
            fromCentre: at.alt
          });
        },

        /* 물러서면 미리 보기만 걷고 크기는 그대로다. */
        abort: () => setPulled(null)
      },
      { threshold: 0 }
    );
  };

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
      {frame && (
        <div
          className="w-drawing-frame"
          data-drawing-frame
          style={{
            left: `${frame.x + (pulled && pulled.handle.includes('w') ? pulled.dx : 0)}px`,
            top: `${frame.y + (pulled && pulled.handle.includes('n') ? pulled.dy : 0)}px`,
            width: `${Math.max(
              1,
              frame.width +
                (pulled ? (pulled.handle.includes('e') ? pulled.dx : pulled.handle.includes('w') ? -pulled.dx : 0) : 0)
            )}px`,
            height: `${Math.max(
              1,
              frame.height +
                (pulled ? (pulled.handle.includes('s') ? pulled.dy : pulled.handle.includes('n') ? -pulled.dy : 0) : 0)
            )}px`
          }}
        >
          {RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              className={`w-drawing-handle w-drawing-handle-${handle}`}
              data-drawing-handle={handle}
              onPointerDown={onHandle(handle)}
            />
          ))}
        </div>
      )}
      {/*
        * The lines a drag has landed on.
        *
        * Drawn across the **drawing** rather than the page: a guide says "this edge is level with
        * that one", and the two things it is about are both inside the canvas. In screen pixels
        * like everything else in this layer, converted through the canvas's own rectangle.
        */}
      {canvasRect &&
        guides.map((guide, at) => (
          <div
            key={`${guide.axis}-${guide.at}-${at}`}
            className="w-drawing-guide"
            data-drawing-guide={guide.axis}
            style={
              guide.axis === 'x'
                ? {
                    left: `${canvasRect.left + (guide.at / canvasRect.size.width) * canvasRect.width}px`,
                    top: `${canvasRect.top}px`,
                    width: '1px',
                    height: `${canvasRect.height}px`
                  }
                : {
                    left: `${canvasRect.left}px`,
                    top: `${canvasRect.top + (guide.at / canvasRect.size.height) * canvasRect.height}px`,
                    width: `${canvasRect.width}px`,
                    height: '1px'
                  }
            }
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
