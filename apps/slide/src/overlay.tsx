import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds } from '@barocss/editor-core';
import {
  RESIZE_HANDLES,
  SLIDES_KEYS,
  fromSurface,
  matchesKey,
  angleOf,
  angleTowards,
  boxAt,
  boxOf,
  contains,
  cropByHandle,
  addStop,
  gradientAxis,
  gradientPoint,
  gradientPoints,
  radialShape,
  addPoint,
  movePoint,
  namedBoxes,
  offsetAlong,
  removeStop,
  paintsOf,
  type PaintStop,
  pathData,
  pathPointsOf,
  removePoint,
  connectorBounds,
  bendFromDrag,
  connectorRouteOf,
  connectorTrackOf,
  labelAt,
  readWaypoints,
  midHandleOf,
  canBendByDrag,
  connectorSpecOf,
  guideIsDropped,
  guidesFor,
  movedGuide,
  readGuides,
  withReaderGuides,
  withoutGuide,
  intersects,
  isSceneType,
  isContainerType,
  instanceResizable,
  placeIsBound,
  sizeIsBound,
  turnIsBound,
  laysOut,
  layoutModeOf,
  reorderIndexAt,
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
  type Crop,
  type Guide,
  type Handle,
  type PathPoint,
  magnetPoints,
  nearestMagnet,
  nearestOnPath,
  pointOnPath,
  pathLength,
  normalOf,
  MAGNET_SNAP,
  type ConnectorSide,
  slideMenu,
  keyLabel
} from '@barocss/office-slides';
import {
  Menu,
  TextField,
  toDisplay,
  unitSuffix,
  type LengthUnit
} from '@barocss/office-ui';
import { useEditorRevision } from './revision';

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
  /**
   * The crop the drag would write, when it is a crop rather than a resize.
   *
   * Kept beside the preview box because the two are one gesture: the box shrinks
   * with the handle and the same amount of source comes off that side, and
   * committing one without the other is a squashed picture.
   */
  crop?: Crop;
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
  revision,
  /**
   * The scale the stage drew at, reported by the stage.
   *
   * Not decoration and not a duplicate of the measurement below — it is what
   * makes the measurement happen *again*. A slide is scaled with a `transform`,
   * and a transform is not a resize: the `ResizeObserver` fires when the timeline
   * pane takes room from the stage, reads the slide **before** its new scale is
   * applied, and is never told again. Measured: the overlay stayed 88 pixels
   * taller than the slide, its handles offset from the shape, and its own box
   * reaching down over the pane — where it swallowed clicks aimed at the
   * transport.
   *
   * Named for what it is — the moment the scale changed — rather than for a value
   * to compute with: the overlay derives its own scale from the rect it measures,
   * because a scale read from the thing itself cannot drift from the thing.
   */
  drawnAt,
  draftGuide,
  /**
   * Which of the selected shape's paints has its editor open, if any.
   *
   * The app's, because two components need it: the panel knows a reader opened a
   * fill, and this is what draws that fill's axis on the shape. See `app.tsx`.
   */
  paintEdit,
  /**
   * Which colour stop of that fill is selected, and how to change it.
   *
   * The app's, so the dot on the shape and the picker in the panel are one
   * selection — see the note where it is read.
   */
  stopEdit = 0,
  onStopEdit,
  /**
   * The unit the reader is looking at, for the readout a drag draws.
   *
   * The app's, and the same one the properties panel shows — a badge that said
   * millimetres while the panel said centimetres would be two answers to "how big
   * is this".
   */
  unit = 'cm',
  /**
   * Which motion step the timeline has selected, if any.
   *
   * Here for the same reason `paintEdit` is: a *path* is edited on the shape —
   * its points are dragged where they are drawn — and the timeline is where it is
   * selected. One piece of state in the app, two halves that cannot disagree
   * about which path is being edited.
   */
  stepEdit,
  /**
   * Whether the reader is placing a path's points by clicking the slide.
   *
   * The mode is the app's because the control that turns it on is in the timeline
   * — where the path's step is — and the gesture is here, where a route across a
   * slide can actually be drawn.
   */
  pathDrawing,
  onPathDrawing
}: {
  editor: Editor | null;
  view: { enteredText?: () => void } | null;
  slideSid?: string;
  revision: number;
  /** What the stage drew at — a notification, not a number to use. */
  drawnAt?: number;
  /**
   * A guide being pulled out of a ruler, drawn where it would land.
   *
   * Comes from the app because the gesture starts in the *stage* — the rulers are
   * there — and the layer that can draw a line across the slide is this one. It
   * is not in the document yet and must not be: nothing is written until the
   * pointer is let go.
   */
  draftGuide?: { axis: 'x' | 'y'; at: number };
  unit?: LengthUnit;
  paintEdit?: number | null;
  stopEdit?: number;
  onStopEdit?: (index: number) => void;
  stepEdit?: string;
  pathDrawing?: boolean;
  onPathDrawing?: (drawing: boolean) => void;
}) {
  /**
   * Which events those are is the suite's answer, not this file's — see
   * `useEditorRevision`, where the three of them and the reason for each are
   * written down once. It was hand-rolled here, and the copy in Word's ribbon
   * was missing one of the three for months.
   */
  const tick = useEditorRevision(editor);
  const [rect, setRect] = useState<DOMRect | null>(null);
  /** The stage's own box, which is what this layer may not draw outside of. */
  const [viewport, setViewport] = useState<DOMRect | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  /**
   * A line being pulled out of a shape, or an end being moved to another one.
   *
   * One gesture for both, because it is one gesture to a reader: something is held at
   * the pointer and it is going to be attached to whatever is under it when they let
   * go. `connector` is set when an *existing* end is being moved, and absent when a
   * new line is being pulled out of a magnet.
   */
  /**
   * The line whose label is being typed, if any.
   *
   * The app's rather than the document's, like `editing`: two people naming two lines
   * are not typing in the same field.
   */
  const [labelling, setLabelling] = useState<string | undefined>();

  /**
   * A point on a line being placed or moved.
   *
   * `index` is where it belongs among the line's waypoints; `adding` says it is not one
   * yet — the reader pressed the middle of a segment, which is how draw.io and every tool
   * after it lets somebody bend a line without a menu.
   */
  const [routing, setRouting] = useState<{
    connector: string;
    index: number;
    adding: boolean;
    at: { x: number; y: number };
  } | null>(null);

  const [connecting, setConnecting] = useState<{
    from: string;
    side: ConnectorSide;
    at: { x: number; y: number };
    connector?: string;
    end?: 'start' | 'end';
  } | null>(null);
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
  /**
   * The picture being cropped, if any.
   *
   * A mode, and the app's rather than the document's — like `inside` and
   * `editing`, which of a reader's several windows is cropping is not a fact
   * about the deck. Entered by double-clicking a picture, which is the same
   * gesture as going into a container or into text: the first click says which
   * thing, the second says "and now work on what is in it". For a picture, what
   * is in it is the part of the source that shows.
   */
  const [cropping, setCropping] = useState<string | undefined>();
  /**
   * Which of a gradient's stops is selected — the *app's*, shared with the panel.
   *
   * It was this component's own state for a day, and the panel's bar had another:
   * a reader clicked a dot on the shape and the picker went on editing a different
   * stop. One question with two answers, which is the shape of mistake this
   * repository keeps finding. Now the dot and the picker are one selection, which
   * is also what makes Delete mean the stop a reader can see is chosen.
   */
  const stopPicked = stopEdit;
  const setStopPicked = (at: number) => onStopEdit?.(at);
  /**
   * Where the axis's two end handles are drawn, in the overlay's own pixels.
   *
   * A ref rather than state because it is derived from the axis every render and
   * read in the same one — it is a scratch value shared between two siblings of
   * one block, not a fact anything else depends on.
   */
  const gradientEnds = useRef({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
  const layer = useRef<HTMLDivElement>(null);
  /**
   * Elements this overlay has nudged, so they can be put back.
   *
   * A drag does not write to the document until it ends — one command, one undo
   * — which used to mean the shape stayed put and a translucent copy followed
   * the pointer instead. That reads as dragging a frame *around* the thing
   * rather than dragging the thing.
   *
   * So the real element is moved, for the length of the drag, with the `translate`
   * property rather than `transform`. The two compose independently and the
   * renderers only ever write `transform` — a shape's rotation — so neither
   * overwrites the other, and clearing this leaves whatever the renderer put
   * there untouched. Anything that guessed at composing the two strings would
   * be a second place that has to know how a shape is turned.
   */
  const nudged = useRef<Set<HTMLElement>>(new Set());
  /**
   * Held in a ref so the effects above can settle without depending on a
   * function declared below them, and without re-running when it changes.
   */
  const settleRef = useRef<() => void>(() => {});



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
      /**
       * And the pane the slide is *inside*, which is not the same box.
       *
       * A slide larger than the room it has overflows and the stage scrolls — so
       * this layer, which is sized to the slide, reaches past the stage and over
       * whatever is below it. Measured at 1280×720 with the zoom pinned and the
       * timeline open: the overlay ended 36 pixels below the pane's top edge and
       * swallowed every click aimed at the transport, which reads as a button
       * that does not work.
       */
      const stageBox = document.querySelector<HTMLElement>('.sl-stage');
      setViewport(stageBox ? stageBox.getBoundingClientRect() : null);
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
    // `drawnAt` is in here for the reason its comment gives: it is the
    // notification a transform does not send.
  }, [slideSid, revision, tick, drawnAt]);

  /**
   * Leaving the slide ends whatever was happening on it.
   *
   * The container the reader had gone into, and any drag in progress. The
   * overlay does not unmount when the slide changes — it is the same component
   * with a different slide — so nothing else would put back an element this
   * overlay had nudged, and the pointer capture is gone with the elements, so
   * the release that would have settled it never arrives. Measured: a shape
   * dragged while the rail was clicked stayed translated by a drag nobody
   * finished, eight hundred pixels from where the document said it was.
   */
  useEffect(() => {
    setInside(undefined);
    setDrag(null);
    settleRef.current();
  }, [slideSid]);

  const store = editor?.dataStore;
  const doc = useMemo(
    () =>
      store && editor?.getRootId?.()
        ? { rootId: editor.getRootId(), getNode: (sid: string) => store.getNode(sid) }
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
        /**
         * A connector's box is not in the document — it is whatever the two shapes it
         * joins happen to make (`docs/specs/canvas-model.md` §8.1) — so it is derived
         * here the same way the renderer derives it. Without this a connector is a
         * 0×0 box: impossible to click, and its selection outline drawn in the corner
         * of the slide.
         */
        const box =
          node.stype === 'connector'
            ? // The deck's own answer, which is what keeps this layer's handles on the
              // line the renderer drew — see `connectorRouteOf`.
              connectorBounds(connectorRouteOf(doc as never, node.sid as string), 60)
            : boxOf(node.attributes);
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
   * Whether the container the reader has gone inside **arranges** what is in it.
   *
   * Which is what a drag in there means. A frame that arranges owns its children's
   * coordinates (canvas-model §5), so a move has nowhere to go: measured — the command
   * reported success, the layout put the shape straight back, and undo did nothing
   * because the reader's own entry restored the number the layout had already restored.
   * A gesture that reports success and changes nothing is the worst of the answers, so
   * the drag means the one thing about an arranged child that is still the reader's: its
   * **place in the order**.
   */
  const arranging = useMemo(
    () => (inside ? laysOut((doc?.getNode(inside) as any)?.attributes) : false),
    [doc, inside, tick, revision]
  );

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

  /**
   * The element a box is drawn as, on the stage.
   *
   * Scoped, like the slide's own lookup: a thumbnail is that box with that sid,
   * and an unscoped query would nudge a picture in the rail while the reader
   * dragged the slide.
   */
  const elementFor = useCallback(
    (sid: string) =>
      document.querySelector<HTMLElement>(`.sl-stage [data-bc-sid="${CSS.escape(sid)}"]`),
    []
  );

  /**
   * Whether a node is one a reader can go inside.
   *
   * A placement of a component is one, and that is how an **override** is made: go in, edit
   * the part, and the part now differs from the one it was copied from. Which means a reader
   * never learns the word "override" — they type, and what they typed is theirs (§10d).
   */
  const isContainer = useCallback(
    // The suite's list, not this file's: four places decided what a container is — this one,
    // the layer list, the deck's own check (which got it wrong and never looked inside a group)
    // and the slide's name. `isContainerType` is the one answer now.
    (sid?: string) => isContainerType((sid ? (doc?.getNode(sid) as any)?.stype : undefined)),
    [doc]
  );

  const selected = useMemo(() => {
    const ids = new Set(selectedNodeIds(editor?.selection));
    return boxes.filter((entry) => ids.has(entry.sid));
  }, [editor, boxes, tick]);

  /**
   * Whether the whole selection is one connector.
   *
   * Which changes what handles it gets: a connector has **no box to resize** (§8.1) —
   * its extent is whatever the two shapes make — so the eight resize handles would
   * write geometry the schema does not even declare on it. What it has instead is two
   * ends, and they sit exactly where the corner handles would be: the handles took
   * every press aimed at an end, which is how this was found.
   */
  const onlyConnector = useMemo(() => {
    const ids = selectedNodeIds(editor?.selection);
    return ids.length === 1 && doc?.getNode(ids[0])?.stype === 'connector';
  }, [editor, doc, tick]);

  /**
   * Whether the selection is a **placement** of a component, which gets no resize handles.
   *
   * Measured, and it is the fault the frame's refused drag taught us to look for: dragging a
   * placement's corner wrote a box of 8280×6440 onto a card whose parts stayed exactly
   * 5040×3960 — the selection outline grew, the card did not change at all, and nothing said
   * so. A placement's extent **is** its definition's (canvas-model §10b-4), so the handles were
   * offering an edit the model has no answer for.
   *
   * The way to change a card's size is to change the card: the definition's own size row, and
   * every placement's box follows on apply. Scaling one placement on its own needs a constraint
   * model — which is the thing Figma has and this schema does not — and half-guessing it is how
   * a reader ends up with a badge floating outside a card.
   *
   * Rotation stays: turning a card is a transform of the whole thing and needs no answer about
   * what is inside it.
   */
  const onlyPlacement = useMemo(() => {
    const ids = selectedNodeIds(editor?.selection);
    if (ids.length !== 1 || !doc) return false;
    const node = doc.getNode(ids[0]);
    if (node?.stype !== 'instance') return false;
    /*
     * Unless something in the card was told to **fill** it, which is what makes the drag reach the
     * card: the part takes the new box and, when it is a frame, arranges its own children in the
     * same breath. So the handles are refused exactly where the model has no answer, and offered
     * where it does — asked of the definition now, because that is where the parts are.
     */
    return !instanceResizable(doc as never, node);
  }, [editor, doc, tick]);

  /**
   * And a box whose **size a variable owns**, which gets no resize handles either.
   *
   * The same rule from the other direction: a bound size is written into the document by the pass
   * that settles derived geometry, so a drag would be put back on the next change — a gesture that
   * changes nothing, which is exactly what the placement's refused handles were measured to avoid
   * (§10h-2). The panel says so in words beside its greyed fields.
   *
   * Every selected box, because a drag resizes all of them: one that cannot is enough to refuse.
   */
  const sizedByVar = useMemo(() => {
    const ids = selectedNodeIds(editor?.selection);
    if (ids.length === 0 || !doc) return false;
    return ids.some((sid) => sizeIsBound(doc.getNode(sid) as never));
  }, [editor, doc, tick]);

  /** And the turn, which takes the rotate grip away for the same reason. */
  const turnedByVar = useMemo(() => {
    const ids = selectedNodeIds(editor?.selection);
    if (ids.length === 0 || !doc) return false;
    return ids.some((sid) => turnIsBound(doc.getNode(sid) as never));
  }, [editor, doc, tick]);

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
   * The guides this reader has placed on this slide.
   *
   * Read from the document beside its size, and for the same reason: both are
   * facts about the slide, and holding either in this component would be a second
   * copy that can fall behind. `readGuides` is what drops anything that is not a
   * guide — see the file for why a guide at `NaN` is worse than none.
   */
  const placed = useMemo(
    () => readGuides(doc && slideSid ? (doc.getNode(slideSid) as any)?.attributes : undefined),
    [doc, slideSid, tick, revision]
  );

  /** A guide being dragged: which one, and where it is now. */
  const [heldGuide, setHeldGuide] = useState<{ index: number; guide: Guide } | null>(null);

  const writeGuides = useCallback(
    (next: Guide[]) => {
      void editor?.executeCommand?.('setSlideGuides', { guides: next, slideId: slideSid });
    },
    [editor, slideSid]
  );

  /**
   * Taking hold of a guide already on the slide.
   *
   * The whole gesture is one command at the end, not one per pointer event: a
   * drag that wrote on every move would make one gesture forty entries of the
   * document's history, and a reader pressing undo would walk back through the
   * drag. The same rule the ruler's own drag follows, and the same rule the box
   * drag next to it already followed.
   */
  const takeGuide = useCallback(
    (index: number) => (event: React.PointerEvent) => {
      const guide = placed[index];
      if (!guide) return;
      event.preventDefault();
      event.stopPropagation();

      const move = (pointer: PointerEvent) => {
        const at = toModel(pointer);
        setHeldGuide({
          index,
          guide: { axis: guide.axis, at: Math.round(guide.axis === 'x' ? at.x : at.y) }
        });
      };

      const up = (pointer: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);

        const at = toModel(pointer);
        const dropped: Guide = {
          axis: guide.axis,
          at: Math.round(guide.axis === 'x' ? at.x : at.y)
        };
        setHeldGuide(null);
        // Off the slide is how every tool with guides throws one away, because
        // there is nowhere else for the gesture to mean anything.
        writeGuides(
          guideIsDropped(dropped, size)
            ? withoutGuide(placed, index)
            : movedGuide(placed, index, dropped.at)
        );
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [placed, toModel, size, writeGuides]
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

  /**
   * Whether a point is near enough to a line's route to mean that line.
   *
   * One rule, because two gestures ask it: an end being dropped onto a line (§8.6) and a
   * shape being dropped **into** one. A connector's box is the rectangle around its
   * route, so "inside the box" is not "on the line" — most of that rectangle is empty.
   *
   * The **track**, not the route: a drop lands on the curve a reader can see, not on the
   * straight lines between its control points. And the tolerance is a *screen* distance
   * divided by the scale, or a magnet would take a tenth of a shape's width at one zoom
   * and a fiftieth at another.
   *
   * Which lines are candidates is each gesture's own business — see the two callers.
   */
  const nearLine = useCallback(
    (sid: string, at: { x: number; y: number }) => {
      const track = connectorTrackOf(doc as never, sid).map((point) => ({
        x: point.x + origin.x,
        y: point.y + origin.y
      }));
      if (track.length < 2) return undefined;
      const near = nearestOnPath(track, at);
      return near.distance <= MAGNET_SNAP / Math.max(scale, 0.05)
        ? { sid, t: near.t, track }
        : undefined;
    },
    [doc, origin, scale]
  );

  const select = useCallback(
    (ids: string[]) => {
      editor?.executeCommand?.('setNode', { nodeIds: ids });
    },
    [editor]
  );

  /**
   * What a right-click opened, if anything.
   *
   * Held here rather than in the app because this layer is the one that knows
   * *what was clicked*: the target of a right-click on a canvas is hit-tested
   * against the model, not read off the element under the pointer. Which is also
   * why the shared control takes a point and a list instead of wrapping a
   * trigger — see `Menu`.
   */
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  /**
   * What the drag would say, if it says anything.
   *
   * One box — the *first* of the selection — because a readout per shape while six
   * are dragged is six labels overlapping each other; what a reader is asking is
   * about the gesture, and the gesture is one. Rounded to the unit's own
   * precision by `toDisplay`, which is what the panel's fields use.
   */
  const readout = useMemo(() => {
    if (!drag) return undefined;
    const sid = selected[0]?.sid;
    const box = sid ? drag.preview.get(sid) : undefined;
    if (!box) return undefined;

    const say = (value: number) => `${toDisplay(value, unit)}${unitSuffix(unit)}`;

    if (drag.handle === 'rotate') {
      return { box, says: `${Math.round(drag.rotation ?? 0)}°` };
    }
    if (drag.handle === 'move') {
      return { box, says: `${say(box.x)}, ${say(box.y)}` };
    }
    return { box, says: `${say(box.width)} × ${say(box.height)}` };
  }, [drag, selected, unit]);

  /**
   * What the menu offers, from the model — and which way to draw a chord.
   *
   * `inside` is the reader having gone into a container: a paste there means
   * something, and "새 슬라이드" does not.
   */
  const menu = useMemo(
    () =>
      slideMenu({
        boxes: selected.length,
        // A group, asked of the document: the selection carries geometry, and what
        // kind of node each one is belongs to the node.
        group: selected.some(
          (entry) => (doc?.getNode(entry.sid) as { stype?: string } | undefined)?.stype === 'group'
        ),
        inside: !!inside
      }),
    [selected, inside, doc]
  );

  const apple = useMemo(() => {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '');
  }, []);

  const onContextMenu = (event: React.MouseEvent) => {
    if (!editor || !rect) return;
    // The browser's own menu is never what a reader wants on a canvas.
    event.preventDefault();

    /**
     * A right-click *selects* what it found, unless that is already in the
     * selection.
     *
     * Every tool does this and the reason is the sentence a menu has to be able
     * to finish: "delete **what**". Right-clicking an unselected shape and being
     * offered actions on a different one is the kind of thing that deletes the
     * wrong box. A right-click inside an existing selection leaves it alone, so
     * a menu can act on six shapes at once.
     */
    const hit = hitTest(toModel(event as never));
    if (hit && !selected.some((entry) => entry.sid === hit.sid)) select([hit.sid]);
    if (!hit) select([]);

    setMenuAt({ x: event.clientX, y: event.clientY });
  };

  /**
   * The grey **around** the slide, which was the last place the browser's own menu got out.
   *
   * This layer is the slide's box — it has to be, because every coordinate in it is the
   * slide's — so a right-click on the scratch space around it reached nothing and the
   * browser answered. Measured: 48px of grey either side at the default zoom, and a menu
   * count of zero there.
   *
   * The reason it stayed that way was honest: *suppressing* the browser's menu needs
   * something to offer instead, and until the slide's own menu grew items that are not
   * about a shape (the guides) there was nothing. Now there is, and it is the same menu the
   * slide itself opens — with nothing selected, which is what a click on the scratch space
   * means.
   *
   * A listener on the window rather than a bigger element: growing this layer to cover the
   * stage would put its coordinate space and the slide's out of step, which is the fault
   * §2 is about.
   */
  useEffect(() => {
    const onGrey = (event: MouseEvent) => {
      if (!editor || !viewport || !rect) return;
      const inStage =
        event.clientX >= viewport.left &&
        event.clientX <= viewport.right &&
        event.clientY >= viewport.top &&
        event.clientY <= viewport.bottom;
      const onSlide =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inStage || onSlide) return;

      event.preventDefault();
      // Nothing is under the pointer, so nothing is selected — the same answer a click on
      // the slide's own empty space gives.
      select([]);
      setMenuAt({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('contextmenu', onGrey);
    return () => window.removeEventListener('contextmenu', onGrey);
  }, [editor, viewport, rect, select]);

  /**
   * Aiming the gradient, or moving one of its stops.
   *
   * Both write the *paint* rather than an attribute, because that is what the
   * shape holds now — and both commit on release for the same reason a shape's
   * drag does: one command, one undo, and no history entry per frame.
   */
  /**
   * Dragging a point of a path, and adding or removing one.
   *
   * The arithmetic — clamping, inserting between two points, refusing to remove
   * the last two — is in `motion-path.ts`, for the same reason the gradient
   * axis's is in its own module: it is the part that cannot be checked by looking
   * at the screen.
   *
   * Written on release rather than on every pointer move, which is the rule every
   * gesture in this overlay follows: a drag that wrote each frame would put fifty
   * entries in the history for one movement.
   */
  const dragPathPoint = (event: React.PointerEvent, index: number) => {
    if (!pathEdit) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    const { stepSid, points, origin } = pathEdit;
    const move = (pointer: PointerEvent) => {
      const at = toModel(pointer);
      const next = movePoint(points, index, { x: at.x - origin.x, y: at.y - origin.y });
      void editor?.executeCommand('setMotionStep', { stepId: stepSid, path: next });
    };

    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /**
   * A point placed where the reader clicked, at the end of the path.
   *
   * Appended rather than inserted, because clicking one after another is drawing
   * a route: a click in the middle of an existing path meaning "insert here"
   * would make the order of a reader's clicks stop being the order of travel.
   */
  const placePoint = (at: { x: number; y: number }): boolean => {
    if (!pathDrawing || !pathEdit) return false;
    const { stepSid, points, origin } = pathEdit;
    if (points.length >= 64) return false;

    void editor?.executeCommand('setMotionStep', {
      stepId: stepSid,
      path: [...points, { x: Math.round(at.x - origin.x), y: Math.round(at.y - origin.y) }]
    });
    return true;
  };

  const editPath = (next: PathPoint[]) => {
    if (!pathEdit) return;
    void editor?.executeCommand('setMotionStep', {
      stepId: pathEdit.stepSid,
      path: next
    });
  };

  /**
   * A gradient's stops, edited on the shape.
   *
   * `addStop` and `removeStop` are the model's and shared with the panel's bar,
   * because a double-click on a gradient is one gesture wherever the gradient is
   * drawn — and the two-stop floor has to be the same rule in both places or the
   * canvas would leave a document the panel refuses to draw.
   */
  const editStops = (next: PaintStop[]) => {
    if (paintEdit === null || paintEdit === undefined || selected.length !== 1) return;
    const entry = selected[0];
    const paints = paintsOf(doc?.getNode(entry.sid)?.attributes as never);
    const paint = paints[paintEdit];
    if (!paint) return;
    void editor?.executeCommand('setBoxStyle', {
      nodeId: entry.sid,
      fills: paints.map((one, index) => (index === paintEdit ? { ...paint, stops: next } : one)),
      // The flat attributes this list supersedes, cleared with it.
      fill: null,
      gradientFrom: null,
      gradientTo: null,
      gradientAngle: null,
      gradientKind: null
    });
  };

  const stopsNow = (): PaintStop[] => {
    if (paintEdit === null || paintEdit === undefined || selected.length !== 1) return [];
    const paint = paintsOf(doc?.getNode(selected[0].sid)?.attributes as never)[paintEdit];
    return paint?.stops ?? [];
  };

  const dragGradient = (
    event: React.PointerEvent,
    what:
      | { kind: 'angle' }
      | { kind: 'from' }
      | { kind: 'to' }
      | { kind: 'axis' }
      | { kind: 'rx' }
      | { kind: 'ry' }
      | { kind: 'stop'; at: number }
  ) => {
    if (paintEdit === null || paintEdit === undefined || selected.length !== 1) return;
    const entry = selected[0];
    const node = doc?.getNode(entry.sid);
    const paints = paintsOf(node?.attributes as never);
    const paint = paints[paintEdit];
    if (!paint) return;

    /**
     * The line is the one that must *not* take the press.
     *
     * A handle can: the press is a drag and nothing else, so preventing the
     * default and capturing the pointer is right. The line has to serve a drag
     * *and* a double-click, and `preventDefault()` on `pointerdown` suppresses
     * the compatibility mouse events that follow — measured, the double-click
     * stopped adding a stop the moment the drag was added, and the pointer
     * capture took the editor's own dismiss check with it.
     *
     * So the line only stops the press from reaching the overlay (which would
     * read it as "select nothing" and unmount these handles) and waits to see
     * whether the pointer moves.
     */
    event.stopPropagation();
    if (what.kind !== 'axis') {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    }

    const write = (next: typeof paint) => {
      const list = paints.map((one, index) => (index === paintEdit ? next : one));
      void editor?.executeCommand('setBoxStyle', {
        nodeId: entry.sid,
        fills: list,
        // The flat attributes this list supersedes, cleared with it — the same
        // rule the panel follows, for the same reason.
        fill: null,
        gradientFrom: null,
        gradientTo: null,
        gradientAngle: null,
        gradientKind: null
      });
    };

    /**
     * A point in the box's own proportions, which is what a paint holds.
     *
     * Fractions rather than twips so the gradient survives a resize the way
     * Figma's does — see `gradient-axis.ts`. Allowed a little outside the shape,
     * because a gradient that begins off the edge is the reason to hold points at
     * all.
     */
    const fraction = (point: { x: number; y: number }) =>
      // Clamped by the model, because the *document* holds this: a drag to the far
      // side of the slide otherwise wrote `x: 2.48` — two and a half box-widths
      // out — which draws fine today and is a gradient aimed at nothing the next
      // time the shape is resized.
      gradientPoint({
        x: (point.x - entry.box.x) / Math.max(1, entry.box.width),
        y: (point.y - entry.box.y) / Math.max(1, entry.box.height)
      });

    /**
     * The pair a drag is *about*, which is not always the pair the paint holds.
     *
     * A gradient written before points existed has only an angle, and dragging
     * either end has to start from the axis it is drawing — otherwise the first
     * touch of the handle would jump the gradient to a default. So the current
     * axis is read back into fractions and one end of it is replaced.
     */
    const pairNow = () => {
      const held = gradientPoints(paint);
      if (held) return held;
      const drawn = gradientAxis(paint, entry.box);
      if (!drawn) return undefined;
      return { from: fraction(drawn.from), to: fraction(drawn.to) };
    };

    /** Where the drag began, for the one gesture that is about a *delta*. */
    const grabbedAt = toModel(event as never);
    const grabbedPair = (() => {
      const held = gradientPoints(paint);
      if (held) return held;
      const drawn = gradientAxis(paint, entry.box);
      return drawn ? { from: fraction(drawn.from), to: fraction(drawn.to) } : undefined;
    })();

    const move = (pointer: PointerEvent) => {
      const point = toModel(pointer as never);

      /**
       * The whole gradient, slid along under the pointer.
       *
       * Both ends by the same amount, which is only expressible now that the
       * model holds ends at all — with an angle there was nothing to move. A
       * *delta* rather than "put the middle here", because the reader grabbed a
       * particular spot on the line and it should stay under their pointer.
       */
      if (what.kind === 'axis') {
        if (!grabbedPair) return;
        /**
         * Three pixels before it is a drag at all.
         *
         * Which is what lets one element be both: two quick clicks travel a pixel
         * or none, so they write nothing and the `dblclick` adds a stop; anything
         * further is plainly a reader sliding the gradient.
         */
        const moved = Math.hypot(point.x - grabbedAt.x, point.y - grabbedAt.y);
        if (moved < pxToTwip(3)) return;
        const by = {
          x: (point.x - grabbedAt.x) / Math.max(1, entry.box.width),
          y: (point.y - grabbedAt.y) / Math.max(1, entry.box.height)
        };
        write({
          ...paint,
          from: gradientPoint({
            x: grabbedPair.from.x + by.x,
            y: grabbedPair.from.y + by.y
          }),
          to: gradientPoint({ x: grabbedPair.to.x + by.x, y: grabbedPair.to.y + by.y }),
          angle: undefined
        });
        return;
      }

      /**
       * A radial's radii, one axis each.
       *
       * `to` is the *corner* of the two radii — see `radialShape` — so one handle
       * would drag both at once, which is worse than the two Figma gives. These
       * move one coordinate of it and leave the other alone.
       */
      if (what.kind === 'rx' || what.kind === 'ry') {
        const pair = pairNow();
        if (!pair) return;
        const moved = fraction(point);
        write({
          ...paint,
          from: pair.from,
          to: gradientPoint(
            what.kind === 'rx'
              ? { x: moved.x, y: pair.to.y }
              : { x: pair.to.x, y: moved.y }
          ),
          angle: undefined
        });
        return;
      }

      if (what.kind === 'from' || what.kind === 'to') {
        const pair = pairNow();
        if (!pair) return;
        const moved = fraction(point);
        write({
          ...paint,
          ...(what.kind === 'from' ? { from: moved, to: pair.to } : { from: pair.from, to: moved }),
          /**
           * The angle goes, because the points say it now.
           *
           * Leaving both would be two answers to one question — the fault this
           * repository keeps finding — and the reader who dragged the handle has
           * just said which one they mean.
           */
          angle: undefined
        });
        return;
      }
      if (what.kind === 'angle') {
        write({ ...paint, angle: angleTowards(entry.box, point) });
        return;
      }
      const current = gradientAxis(paint, entry.box);
      if (!current) return;
      const offset = offsetAlong(current, point);
      write({
        ...paint,
        stops: (paint.stops ?? []).map((stop, index) =>
          index === what.at ? { ...stop, offset } : stop
        )
      });
    };

    const up = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      move(pointer);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ── Dragging ───────────────────────────────────────────────────────────────

  const onPointerDown = (event: React.PointerEvent) => {
    if (!editor || !rect) return;
    const handle = (event.target as HTMLElement).dataset.handle as Handle | 'rotate' | undefined;
    const point = toModel(event);

    /**
     * A magnet, or the end of a line: the connect gesture, before anything else.
     *
     * Before the selection branches for the same reason placing a path's points is:
     * these dots sit *on* the selected shape, so a press on one would otherwise start
     * a move of the very shape the reader is pulling a line out of.
     */
    const grabbed = (event.target as HTMLElement).dataset;
    if (grabbed.connSeg !== undefined || grabbed.connWp !== undefined) {
      /**
       * A point on the route: a new one from a segment's middle, or an existing one.
       *
       * Where a *new* one belongs is worked out on release rather than now, from how far
       * along the line it was dropped — an elbow turns one waypoint into two route
       * points, so counting segments would put the second bend before the first.
       *
       * An **existing** point takes neither the default nor the capture, for the reason
       * the gradient's axis does not (above): it has to serve a drag *and* a
       * double-click. `preventDefault()` on `pointerdown` suppresses the compatibility
       * mouse events that follow, and the capture retargets the click at the capturing
       * element — measured, both, and together they sent the double-click to the
       * overlay, which opened the label editor instead of taking the bend away. A
       * segment's middle is drag-only, so it keeps both.
       */
      if (grabbed.connWp === undefined) {
        event.preventDefault();
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      }
      const selection = selectedNodeIds(editor.selection);
      setRouting({
        connector: selection[0],
        index: Number(grabbed.connWp ?? -1),
        adding: grabbed.connWp === undefined,
        at: point
      });
      return;
    }
    if (grabbed.connBend !== undefined) {
      /**
       * Bending, which is a drag of the *route* rather than of anything attached.
       *
       * Held in `connecting` as well — one gesture state for "something on this line is
       * being dragged" — with no end named, which is what tells the release it is a
       * bow and not an attachment.
       */
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      const selection = selectedNodeIds(editor.selection);
      setConnecting({ from: '', side: 'auto', at: point, connector: selection[0] });
      return;
    }
    if (grabbed.magnet || grabbed.connEnd) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      const selection = selectedNodeIds(editor.selection);
      if (grabbed.magnet) {
        setConnecting({
          from: selection[0],
          side: grabbed.magnet as ConnectorSide,
          at: point
        });
      } else {
        const which = grabbed.connEnd as 'start' | 'end';
        const spec = connectorSpecOf(doc?.getNode(selection[0]) as never);
        setConnecting({
          // The end being moved is *the other one's* anchor for the rubber line: what
          // a reader sees held is this end, and what it is drawn from is the far one.
          from: (which === 'start' ? spec.end.nodeId : spec.start.nodeId) ?? '',
          side: 'auto',
          at: point,
          connector: selection[0],
          end: which
        });
      }
      return;
    }

    /**
     * Placing a path's points comes before everything else this handler does.
     *
     * While the mode is on, a click on the slide is a *point* rather than a
     * selection — otherwise the first click would select the shape under it and
     * the reader would be dragging a box while trying to draw a route.
     *
     * Including a click on a resize handle, which is the part that had to be
     * measured: the handles sit over the middle of the selected shape, so one
     * click in three landed on one and was swallowed. A mode is a mode — while a
     * route is being drawn there is nothing to resize.
     */
    if (pathDrawing) {
      event.preventDefault();
      event.stopPropagation();
      placePoint(point);
      return;
    }

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

    const current = selectedNodeIds(editor.selection);
    const next = event.shiftKey
      ? current.includes(hit.sid)
        ? current.filter((sid) => sid !== hit.sid)
        : [...current, hit.sid]
      : current.includes(hit.sid)
        ? current
        : [hit.sid];

    select(next);
    setEditing(undefined);

    /**
     * A press on a selected box starts a move; the drag only becomes an edit if the pointer actually
     * travels.
     *
     * **Unless a variable owns where it is** (§10h-2). Left out of the drag rather than refused at
     * the end of it, and that is the whole difference between this and a fault: a box that follows
     * the pointer and jumps back has told the reader it moved and then lied. It stays *selectable* —
     * which it must be, or there would be no way to take the binding off — and the panel says why
     * its two fields are greyed.
     *
     * A **locked** box is refused harder, one step earlier: the hit test goes straight through it.
     * That is right for "I have decided where this goes" and wrong here, where the reader has to be
     * able to reach the shape to change their mind.
     */
    const dragging = boxes.filter(
      (entry) => next.includes(entry.sid) && !placeIsBound(doc?.getNode(entry.sid) as never)
    );
    setDrag({
      handle: 'move',
      from: point,
      original: new Map(dragging.map((entry) => [entry.sid, entry.box])),
      preview: new Map(dragging.map((entry) => [entry.sid, entry.box])),
      moved: false
    });
  };

  const onPointerMove = (event: React.PointerEvent) => {
    if (routing) {
      setRouting({ ...routing, at: toModel(event) });
      return;
    }
    if (connecting) {
      setConnecting({ ...connecting, at: toModel(event) });
      return;
    }
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

    /**
     * A handle in crop mode takes source away instead of resizing the picture.
     *
     * The box still shrinks with the handle — that is what stops the rest of the
     * picture from moving — so this looks like a resize and writes a crop. Only
     * the picture being cropped is affected; a crop of several boxes at once has
     * no meaning, and the mode only ever holds one.
     */
    if (cropping && drag.handle !== 'move' && drag.original.has(cropping)) {
      const dragged = cropByHandle(
        drag.original.get(cropping),
        doc?.getNode(cropping)?.attributes as never,
        drag.handle,
        delta
      );
      setDrag({
        ...drag,
        moved,
        crop: dragged.crop,
        preview: new Map([[cropping, dragged.box]]),
        guides: undefined
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
    /**
     * What this drag may snap to: what it finds, and what the reader placed.
     *
     * One list, because `snapBox` takes one and picks the closest per axis — so
     * the two kinds compete on equal terms, which is right. The placed ones go
     * first, and that decides a tie in the reader's favour; see
     * `withReaderGuides`.
     */
    const others = () =>
      withReaderGuides(
        guidesFor(
          boxes
            .filter((entry) => !new Set(preview.keys()).has(entry.sid))
            .map((entry) => entry.box),
          { x: 0, y: 0, width: size.width, height: size.height }
        ),
        placed
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

    /**
     * And move the actual shapes, which is what a reader is looking at.
     *
     * Only for a move: a resize changes the *size*, which `translate` cannot
     * say, and a shape that scaled its text while being resized would be
     * describing something the model will never hold. The outline follows for
     * those, as it always did.
     */
    if (drag.handle === 'move') {
      for (const [sid, box] of preview) {
        const from = drag.original.get(sid);
        const element = elementFor(sid);
        if (!from || !element) continue;
        /**
         * Model pixels, not screen pixels.
         *
         * The element lives inside the stage, which is already scaled, so the
         * browser applies the zoom to this translation for us. Using
         * `toScreen` — which multiplies by that same scale — applied it twice,
         * and the shape trailed the pointer by exactly the zoom: 101 pixels for
         * a drag of 120 at 84%.
         */
        element.style.translate = `${twipToPx(box.x - from.x)}px ${twipToPx(box.y - from.y)}px`;
        nudged.current.add(element);
      }
    }
  };

  /** Put back every element this overlay moved, whatever ended the drag. */
  /**
   * Where the rubber line is drawn **from**.
   *
   * A new line starts at the magnet the reader took hold of; a moved end is drawn from
   * the *far* end, because that is the one staying still. Falls back to the pointer,
   * which draws nothing — the case where the far end holds no shape and has no place
   * yet, which cannot happen from either gesture but is one line to be safe about.
   */
  const anchorOfConnecting = useMemo(() => {
    if (!connecting) return { x: 0, y: 0 };
    const box = boxes.find((entry) => entry.sid === connecting.from);
    if (connecting.connector && connecting.end) {
      const spec = connectorSpecOf(doc?.getNode(connecting.connector) as never);
      const far = connecting.end === 'start' ? spec.end : spec.start;
      const farBox = far.nodeId ? boxes.find((entry) => entry.sid === far.nodeId) : undefined;
      if (farBox) {
        const points = connectorRouteOf(doc as never, connecting.connector);
        const at = connecting.end === 'start' ? points[points.length - 1] : points[0];
        return { x: at.x + origin.x, y: at.y + origin.y };
      }
      return { x: far.x + origin.x, y: far.y + origin.y };
    }
    if (!box) return connecting.at;
    const magnet = magnetPoints({ ...box.box, rotation: box.rotation }).find(
      (entry) => entry.side === connecting.side
    );
    return magnet ? magnet.point : connecting.at;
  }, [connecting, boxes, doc, origin]);

  /**
   * Where a point dropped on a line ends up.
   *
   * Placed **in order along the line**, by how far along it was dropped rather than by
   * which segment was grabbed: an elbow turns one waypoint into two route points, so a
   * count of segments puts the second bend before the first. `nearestOnPath` gives the
   * fraction, and the existing points are measured the same way, so the new one lands
   * where the reader put it however bent the line already is.
   */
  const finishRouting = (at: { x: number; y: number }) => {
    const held = routing;
    setRouting(null);
    if (!held || !editor || !doc) return;

    const node = doc.getNode(held.connector);
    const placed = readWaypoints(node as never);
    const local = { x: at.x - origin.x, y: at.y - origin.y };

    if (!held.adding) {
      /**
       * A press that did not travel is not a move.
       *
       * Nothing to write — and writing it anyway broke the way *back*: the commit replaced
       * the handle's element, so the second click of a double-click landed on a new one
       * and never became a double-click at all. A click on a handle also has no business
       * in the history.
       */
      const was = placed[held.index];
      if (was && Math.hypot(local.x - was.x, local.y - was.y) < 30) return;

      const moved = placed.map((point, index) => (index === held.index ? local : point));
      void editor?.executeCommand('setConnector', {
        nodeIds: [held.connector],
        waypoints: moved
      });
      return;
    }

    const track = connectorTrackOf(doc as never, held.connector);
    const along = (point: { x: number; y: number }) => nearestOnPath(track, point).t;
    const dropped = along(local);
    const before = placed.filter((point) => along(point) <= dropped).length;
    const next = [...placed.slice(0, before), local, ...placed.slice(before)];

    void editor?.executeCommand('setConnector', {
      nodeIds: [held.connector],
      waypoints: next
    });
  };

  /**
   * Where a connect gesture ends: on a shape, or on the slide.
   *
   * The two answers are both real and that is the point. Dropped on a shape, the end
   * **holds** it — and on a magnet if the pointer is near one, which is how a reader
   * says "leave from this side" rather than "wherever looks best". Dropped anywhere
   * else it is a free end at that place, because a line pulled into empty space is one
   * a reader will attach later and refusing it would make the gesture only ever able
   * to end on a shape.
   */
  const finishConnecting = (at: { x: number; y: number }) => {
    const held = connecting;
    setConnecting(null);
    if (!held || !editor) return;

    const target = hitTest(at);
    const isLine = (sid: string | undefined) =>
      !!sid && doc?.getNode(sid)?.stype === 'connector';

    /**
     * Dropped on another **line**, near enough to it to mean it.
     *
     * A connector's box is the rectangle around its route, so "inside the box" is not
     * "on the line" — most of that rectangle is empty. The drop has to land within a
     * handle's width of the route itself, and where along it decides the `t`.
     *
     * Not the line being dragged, and not the line an end is already on: attaching a
     * line to itself is a route that cannot be resolved.
     */
    const ontoLine =
      target &&
      isLine(target.sid) &&
      target.sid !== held.connector &&
      target.sid !== held.from
        ? // The candidate is *the box under the pointer*, so a line hidden behind a shape
          // does not win over the shape. `nearLine` decides whether the drop is on it.
          nearLine(target.sid, at)
        : undefined;

    const onto =
      target && target.sid !== held.from && !isLine(target.sid) ? target : undefined;
    /**
     * The snap is a **screen** distance, so it is divided by the scale.
     *
     * Eight pixels at 100% and eight pixels at 400%: a magnet that took a tenth of a
     * shape's width at one zoom and a fiftieth at another would be a control that works
     * differently depending on how far the reader has zoomed in.
     */
    const magnet = onto
      ? nearestMagnet(
          { ...onto.box, rotation: onto.rotation },
          at,
          MAGNET_SNAP / Math.max(scale, 0.05)
        )
      : null;

    /**
     * A line held by its middle: the drag is a bow.
     *
     * `connector` with no `end` is what says so — the same state as an attachment
     * because it is the same gesture to a reader, and the difference is what was
     * grabbed.
     */
    if (held.connector && !held.end) {
      const spec = connectorSpecOf(doc?.getNode(held.connector) as never);
      const route = connectorRouteOf(doc as never, held.connector);
      void editor?.executeCommand('setConnector', {
        nodeIds: [held.connector],
        bend: bendFromDrag(
          route,
          spec.kind,
          { x: at.x - origin.x, y: at.y - origin.y },
          // The drawn route already includes whatever bow it has — the reader's, or the
          // fan's when two lines join the same pair — so the drag is added to that
          // rather than replacing it. Without this, grabbing the second of two fanned
          // lines snapped it onto the first before it moved anywhere.
          spec.bend ?? 0
        )
      });
      return;
    }

    if (held.connector && held.end) {
      // Moving an end of a line that already exists. `null` releases the hold, which
      // has to be possible or a line is stuck to a shape until it is deleted — and
      // `null` for the fraction is what takes an end *off* another line.
      void editor?.executeCommand('setConnector', {
        nodeIds: [held.connector],
        [`${held.end}NodeId`]: ontoLine ? ontoLine.sid : onto ? onto.sid : null,
        [`${held.end}Side`]: magnet ?? 'auto',
        // The fraction along a line, or `null` to take the end off one — which removes
        // the attribute rather than leaving a stale number under a shape attachment.
        [`${held.end}T`]: ontoLine ? ontoLine.t : null,
        [`${held.end}X`]: at.x,
        [`${held.end}Y`]: at.y
      });
      return;
    }

    /**
     * Let go on nothing: **make the next shape there and join it**.
     *
     * The gesture a flow chart is made of — drag out, let go, type — and the reason it is
     * worth a command of its own is the work a reader does not do: no placing, no sizing,
     * no matching the fill, and no hunting for the tool that joins. Miro, FigJam and
     * draw.io all answer a drop on empty canvas this way.
     *
     * A line with a *free* end is still reachable, and by the gesture that means it:
     * dragging an existing end **off** the shape it holds.
     */
    if (!onto && !ontoLine) {
      void editor?.executeCommand('insertConnectedShape', {
        fromNodeId: held.from,
        fromSide: held.side,
        x: at.x - origin.x,
        y: at.y - origin.y
      });
      return;
    }

    void editor?.executeCommand('insertConnector', {
      startNodeId: held.from,
      startSide: held.side,
      ...(ontoLine
        ? { endNodeId: ontoLine.sid, endT: ontoLine.t }
        : { endNodeId: onto!.sid, endSide: magnet ?? 'auto' })
    });
  };

  /**
   * The slot a drag inside an arranging frame is currently over.
   *
   * One answer for two readers — the line drawn while dragging and the command on release
   * — because a drop indicator that disagrees with what happens is worse than none.
   * `null` when this drag is not a reorder at all.
   */
  const reorderTo = useMemo(() => {
    if (!arranging || !drag || !drag.moved || drag.handle !== 'move') return null;
    const held = [...drag.preview.keys()];
    if (held.length === 0) return null;

    const mode = layoutModeOf({ mode: (doc?.getNode(inside!) as any)?.attributes?.layoutMode });
    const others = boxes.filter((entry) => !held.includes(entry.sid));
    // The shape's own centre, not the pointer: a reader aims with the shape, and the
    // pointer may be holding it by a corner.
    const first = drag.preview.get(held[0])!;
    const index = reorderIndexAt(others, { x: first.x + first.width / 2, y: first.y + first.height / 2 }, mode);
    return index < 0 ? null : { index, mode, others, held };
  }, [arranging, drag, boxes, doc, inside]);

  /**
   * The line a dropped shape would be spliced **into**.
   *
   * The gesture a flow chart is edited with: a reader who has `수집 → 저장` and needs a
   * check in between drops the shape on the line. One answer for the highlight drawn while
   * dragging and the command on release, so the feedback cannot promise what the command
   * refuses.
   *
   * **One** shape: two dropped on a line has no single meaning a reader could predict —
   * which order are they in, and which of them holds the label — and guessing is worse
   * than leaving the plain move.
   */
  const spliceTo = useMemo(() => {
    if (!drag || !drag.moved || drag.handle !== 'move' || arranging) return null;
    const held = [...drag.preview.keys()];
    if (held.length !== 1) return null;

    const box = drag.preview.get(held[0])!;
    // Aimed with the shape rather than the pointer, the same as the reorder slot: a
    // reader holding a box by its corner is pointing with the box.
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    // Topmost first, so a line drawn over another takes the drop — the same order a
    // click resolves in.
    for (let index = boxes.length - 1; index >= 0; index -= 1) {
      const entry = boxes[index];
      if (entry.sid === held[0]) continue;
      const node = doc?.getNode(entry.sid) as any;
      if (node?.stype !== 'connector') continue;
      /*
       * Not a line this shape is already an end of: `a → b` with `b` dropped on it would
       * become `a → b` and `b → b`, and a line from a shape to itself has no route. The
       * command refuses it, and a highlight that promised otherwise would be a control
       * that does nothing.
       */
      if (node.attributes?.startNodeId === held[0] || node.attributes?.endNodeId === held[0]) {
        continue;
      }
      if (typeof node.attributes?.startNodeId !== 'string') continue;
      if (typeof node.attributes?.endNodeId !== 'string') continue;

      const near = nearLine(entry.sid, centre);
      if (near) return { line: entry.sid, shape: held[0], track: near.track };
    }
    return null;
  }, [drag, arranging, boxes, doc, nearLine]);

  const settle = useCallback(() => {
    for (const element of nudged.current) element.style.translate = '';
    nudged.current.clear();
  }, []);
  settleRef.current = settle;

  const onPointerUp = (event: React.PointerEvent) => {
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);

    /**
     * First, and whatever else this release turns out to be.
     *
     * Every path out of here has to put back the elements the drag nudged, and
     * one of them did not: a pointer-down that missed every box starts a marquee
     * and leaves the drag alone, so the release took the marquee branch and
     * returned before settling. Measured — a shape left translated eight hundred
     * pixels from where the document said it was, and staying there.
     *
     * Before the command as well as before the early returns: the command
     * changes the model, the view redraws from it, and a `translate` still on
     * the element would be added to a position that already includes the move.
     */
    settle();

    if (routing) {
      finishRouting(toModel(event));
      return;
    }

    if (connecting) {
      finishConnecting(toModel(event));
      return;
    }

    if (marquee) {
      const box = marqueeBox(marquee);
      const caught = boxes.filter((entry) => intersects(box, entry.box)).map((entry) => entry.sid);
      if (caught.length > 0) {
        const current = event.shiftKey ? selectedNodeIds(editor?.selection) : [];
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
          void editor?.executeCommand('setBoxGeometry', {
            nodeId: sid,
            rotation: drag.rotation ?? 0
          });
        }
      } else if (drag.crop && cropping) {
        /**
         * One command for the box and the crop, because they are one gesture.
         * See `cropPicture`: a box that shrank without its crop changing is a
         * squashed picture, and that is what a reader would be looking at after
         * pressing undo once if these were two commands.
         */
        const box = drag.preview.get(cropping);
        if (box) {
          void editor?.executeCommand('cropPicture', {
            nodeId: cropping,
            ...box,
            x: box.x - origin.x,
            y: box.y - origin.y,
            ...drag.crop
          });
        }
      } else if (spliceTo) {
        /**
         * Dropped on a line: the shape goes **into** the chain.
         *
         * The move goes in the same command, because it is one gesture — the drop put the
         * shape there *and* split the line, and two entries would have a reader undoing a
         * drop twice and watching the diagram rebuild itself in stages.
         */
        const box = drag.preview.get(spliceTo.shape)!;
        void editor?.executeCommand('spliceIntoConnector', {
          nodeId: spliceTo.shape,
          connectorId: spliceTo.line,
          x: box.x - origin.x,
          y: box.y - origin.y
        });
      } else if (reorderTo) {
        /**
         * Inside a frame that arranges, the drag is a **place in the order**.
         *
         * Not a move: the frame owns the coordinates, so writing them would report
         * success and change nothing (measured). The shapes go in at the slot the line
         * was drawn at, keeping the order they already had between them, and one entry
         * covers all of them.
         */
        void editor?.executeCommand('moveBoxTo', {
          nodeIds: reorderTo.held,
          position: reorderTo.index
        });
      } else {
        for (const [sid, box] of drag.preview) {
          // Back into the container's coordinates. `boxes` added the origin so
          // the drag could work in the slide's; this is the one place that takes
          // it off again.
          void editor?.executeCommand('setBoxGeometry', {
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

    /**
     * A picture is *cropped* rather than typed in.
     *
     * The same gesture again — the second click means "work on what is inside
     * this" — and for a picture what is inside it is the part of the source that
     * shows. Every tool this deck is measured against enters crop this way.
     */
    if (node?.stype === 'picture') {
      event.preventDefault();
      setCropping(hit.sid);
      setEditing(undefined);
      select([hit.sid]);
      return;
    }

    /**
     * A line's second click puts the caret in its **label**.
     *
     * The same gesture as everything else here — the first click says which thing, the
     * second says "work on what is in it" — and for a connector what is in it is the
     * word it carries. Typing it only in the panel is a diagram tool making a reader
     * look away from the diagram to name a relationship they are looking at.
     *
     * A plain field rather than the caret: a label is a string on the node and not a
     * document of its own, so there is nothing for the editor's caret to be in. It is
     * the same control the panel uses.
     */
    if (node?.stype === 'connector') {
      event.preventDefault();
      setLabelling(hit.sid);
      setEditing(undefined);
      select([hit.sid]);
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

  /**
   * A shape put back if this overlay goes away mid-drag.
   *
   * Switching slides, presenting, or a re-mount while the pointer is down would
   * otherwise leave an element translated by a drag nobody finished — and the
   * document, which does not know about the drag, would keep drawing it in the
   * right place under the wrong offset.
   */
  useEffect(() => settle, [settle]);

  /**
   * Leaving crop mode.
   *
   * Escape, and anything that selects something else — including a click on an
   * empty part of the slide. A mode the reader cannot see the edge of is a mode
   * they get stuck in, and the only sign of this one is the handles behaving
   * differently.
   */
  useEffect(() => {
    if (!cropping) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCropping(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cropping]);

  useEffect(() => {
    if (!cropping) return;
    const chosen = selectedNodeIds(editor?.selection);
    /**
     * Another box, not *no* box.
     *
     * Selecting the picture is what enters this mode, and the command that does
     * it is asynchronous — so an effect that left the mode whenever the
     * selection was not yet the picture left it immediately, every time, and the
     * mode could not be entered at all. Measured: `data-cropping` never appeared.
     *
     * An empty selection is left alone for the same reason, and it costs
     * nothing: Escape leaves the mode, and so does selecting anything else.
     */
    if (chosen.length > 0 && !(chosen.length === 1 && chosen[0] === cropping)) {
      setCropping(undefined);
    }
  }, [cropping, editor, tick]);

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
      /**
       * Escape ends a drawing first.
       *
       * Because it is the innermost thing the reader is doing: the same reason
       * Escape comes out of a container before it clears the selection, one level
       * further in.
       */
      if (event.key === 'Escape' && pathDrawing) {
        event.preventDefault();
        event.stopPropagation();
        onPathDrawing?.(false);
        return;
      }

      const chosen = selectedNodeIds(editor.selection);

      /**
       * The chrome owns its keys exactly where it *has* keys.
       *
       * Which is a field — a name being typed is not a shape being deleted — and
       * the timeline pane, whose bars are focusable and take the arrow keys to
       * nudge a motion by ten milliseconds. This listener runs in the **capture**
       * phase and stops propagation so it beats the editor's own key map, so it
       * swallowed every arrow before React's handler on a bar ever ran: measured,
       * the bar had focus, the keystroke fired, and the delay never changed.
       *
       * Stating it the other way round — "only when the focus is on the slide" —
       * was tried and is wrong, because **focus stays on whatever chrome button
       * was clicked last** while the reader is plainly working on the slide. Three
       * tests caught it: click a thumbnail, double-click into a group, press
       * Escape, and the Escape went nowhere.
       */
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [data-timeline]')) return;

      /**
       * Delete, when what the reader is holding is a colour stop.
       *
       * Before the shape, because a reader who has just dragged a dot on a
       * gradient and presses Delete means the dot — and deleting the shape
       * instead is the worst possible reading of it. Only while the fill's editor
       * is open, which is the only time the dots exist.
       *
       * `removeStop` refuses below two, and refusing here means falling through to
       * *nothing* rather than to the shape: a keystroke that cannot do what it
       * plainly means must not quietly do something else.
       */
      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        paintEdit !== null &&
        paintEdit !== undefined
      ) {
        event.preventDefault();
        event.stopPropagation();
        const stops = stopsNow();
        const next = removeStop(stops, stopPicked);
        if (next !== stops) {
          editStops(next);
          // Back to the first, because the one that was picked is gone and a
          // gradient always has at least two.
          setStopPicked(0);
        }
        return;
      }

      const run = (command: string, payload?: Record<string, unknown>) => {
        event.preventDefault();
        // Capture phase, so this stops before the editor's own key map — which
        // binds Delete on the contenteditable and would delete a character.
        event.stopPropagation();
        void editor?.executeCommand(command, payload);
      };

      /**
       * The bindings are the product's, and are read rather than written here.
       *
       * `SLIDES_KEYS` is data in `office-slides`, the same division the toolbar
       * model makes: what a deck binds is a fact about the deck, and catching
       * the press is this overlay's job because only it knows whether the reader
       * is typing in a box or holding one.
       *
       * Not tidiness. The clipboard commands were registered, working and
       * reachable by nothing for a day, and no check could see it — the harness
       * could read a toolbar and not a handler. It reads this now.
       */
      for (const binding of SLIDES_KEYS) {
        /*
         * The **commands**. A binding that names a view — ⌘S, F5 — is the app's: it has nothing to do
         * with what is selected, and this overlay has never heard of a file or a projector. One key
         * map, two hosts, and `keyFaults` is what guarantees a binding is exactly one of the two.
         */
        if (!binding.command) continue;
        if (!matchesKey(binding, event)) continue;
        if (binding.needsSelection && chosen.length === 0) continue;
        /*
         * …and not one the engine has already answered. `Mod+z` is bound here *and* by the engine
         * against a caret, so a reader undoing while typing in a box would undo twice. The site
         * builder paid for this one with a code edit and its block going together.
         */
        if (event.defaultPrevented) continue;
        return run(binding.command, {
          ...binding.payload,
          // The container the reader has gone into, which only the overlay
          // knows. Harmless to the commands that do not read it.
          parentId: inside ?? slideSid
        });
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
        /**
         * And this already let the selection go, which is worth knowing.
         *
         * "Nothing deselects a box" was written down as a missing gesture and
         * was not one: Escape cleared the model's selection here, and a click on
         * empty slide cleared it in `onPointerDown`. What was missing is that
         * nobody heard — a cleared selection is announced on
         * `editor:selection.change`, this overlay and the panel listened only to
         * `editor:selection.model`, and both went on drawing a box the model had
         * already let go of.
         *
         * A second Escape handler was written before that was measured. It made
         * one press do two things — come out of a container *and* drop the
         * selection — which is exactly what this branch is ordered to prevent.
         */
        return select([]);
      }

    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    /**
     * `stopPicked`, `paintEdit` and `selected` are in here because the Delete
     * rule above reads them.
     *
     * A listener registered once closes over the first render's values, which is
     * the oldest bug in this file's family: the dot would be picked on screen and
     * the key would delete the shape, because the handler still held `undefined`.
     */
  }, [
    editor,
    editing,
    select,
    tick,
    inside,
    doc,
    slideSid,
    isContainer,
    stopEdit,
    onStopEdit,
    paintEdit,
    selected
  ]);

  /**
   * Leaving the text when the caret leaves the box.
   *
   * Clicking another box would otherwise be a click on inert space, because the
   * overlay is not listening while a box is being typed in.
   */
  useEffect(() => {
    if (!editing || !doc || !editor) return;
    const at = editor.selection?.startNodeId as string | undefined;
    const box = boxAt(doc as never, at);
    if (box && box.sid !== editing) setEditing(undefined);
  }, [editing, doc, editor, tick]);

  /**
   * The box the caret is in, if any — the one thing this overlay still draws
   * while it is otherwise inert.
   *
   * Above the early return, like every other hook here. It was written just
   * below it, next to the outline it is drawn beside, and React refused to
   * render at all: a `useMemo` after a conditional return is a component whose
   * hook count changes with its props. The app went blank, which is the loudest
   * this mistake ever is — and the reason it is worth writing down is that it
   * looked like the tidy place to put it.
   */
  const editingBox = useMemo(() => {
    if (!editing) return undefined;
    return boxes.find((candidate) => candidate.sid === editing)?.box;
  }, [editing, boxes]);

  /**
   * The gradient being aimed: its axis on the shape, in the overlay's own
   * coordinates.
   *
   * Only for one selected box — a gradient belongs to a shape, and two shapes
   * have two axes that would be two answers to "which one am I dragging".
   */


  const axis = useMemo(() => {
    if (paintEdit === null || paintEdit === undefined || selected.length !== 1) return undefined;
    const entry = selected[0];
    const node = doc?.getNode(entry.sid);
    const paint = paintsOf(node?.attributes as never)[paintEdit];
    if (!paint) return undefined;
    return gradientAxis(paint, entry.box);
  }, [paintEdit, selected, doc, tick]);

  /**
   * A radial's own shape, when the fill being edited is one.
   *
   * Drawn as well as dragged: an ellipse a reader can *see* is the difference
   * between two handles that mean something and two dots on a line. The rotation
   * Figma also gives is not here and is not an omission — `radial-gradient` has no
   * syntax for one (measured), so there would be nothing to write.
   */
  const radial = useMemo(() => {
    if (paintEdit === null || paintEdit === undefined || selected.length !== 1) return undefined;
    const entry = selected[0];
    const paint = paintsOf(doc?.getNode(entry.sid)?.attributes as never)[paintEdit];
    if (paint?.kind !== 'radial') return undefined;
    const shape = radialShape(paint);
    if (!shape) return undefined;
    return {
      cx: entry.box.x + shape.cx * entry.box.width,
      cy: entry.box.y + shape.cy * entry.box.height,
      rx: shape.rx * entry.box.width,
      ry: shape.ry * entry.box.height
    };
  }, [paintEdit, selected, doc, tick]);


  /**
   * The path being edited: its points, in the overlay's own coordinates.
   *
   * A path is stored relative to where the shape *rests* — `(0, 0)` is "where it
   * already is" — so the points are drawn from the shape's own rest position,
   * plus half the shape, because that is the point CSS puts on the path (the
   * element's centre lands on it; measured).
   *
   * Above the early return, like every other hook here, and this comment is the
   * third one to say so.
   */
  const pathEdit = useMemo(() => {
    if (!stepEdit || !doc) return undefined;
    const node = doc.getNode(stepEdit);
    if (node?.stype !== 'motionStep' || node.attributes?.kind !== 'path') return undefined;

    const points = pathPointsOf(node.attributes?.path);
    const target = typeof node.attributes?.target === 'string' ? node.attributes.target : '';
    if (!points || !target || !slideSid) return undefined;

    const sid = namedBoxes(doc as never, slideSid).get(target);
    const box = boxes.find((candidate) => candidate.sid === sid)?.box;
    if (!box) return undefined;

    const origin = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    return { stepSid: stepEdit, points, origin, smooth: node.attributes?.smooth !== false };
  }, [stepEdit, doc, boxes, slideSid, tick]);

  /**
   * ── No hooks below this line ──────────────────────────────────────────────
   *
   * Everything after this is computed for a render that is definitely happening.
   * A `useMemo` added below it is a component whose hook count changes with its
   * props, and React's answer to that is to render *nothing at all* — a blank
   * app, twice now, both times because the tidy place to put a calculation is
   * next to the thing it is drawn beside.
   */
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
      data-cropping={cropping ?? undefined}
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        // Inert while the reader is typing: the caret, the selection and IME are
        // the editor's, exactly as they are in Word.
        pointerEvents: editing ? 'none' : 'auto',
        /**
         * Cut to the stage, so a slide bigger than its room does not put this
         * layer over the rest of the chrome. `clip-path` takes the pointer with
         * it, which is the half that matters: the drawing being wrong is visible,
         * and the swallowed click is not.
         */
        clipPath: viewport
          ? `inset(${Math.max(0, viewport.top - rect.top)}px ${Math.max(
              0,
              rect.right - viewport.right
            )}px ${Math.max(0, rect.bottom - viewport.bottom)}px ${Math.max(
              0,
              viewport.left - rect.left
            )}px)`
          : undefined,
        cursor: pathDrawing ? 'crosshair' : drag?.handle === 'move' ? 'move' : 'default'
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick as never}
      onContextMenu={onContextMenu}
    >
      {/*
        * The path the selected step travels, drawn on the shape.
        *
        * Where else could it be? A path is a shape's route across the slide, and
        * a panel can only show it as numbers — which is the same argument the
        * gradient axis makes, one feature along. So: the curve the shape will
        * actually follow (the *same* `pathData` the stylesheet gets, so the
        * drawing cannot promise a route the slide will not travel), a dot per
        * point to drag, and a double-click on a segment to add a bend.
        *
        * `data-paint-canvas` because the panel's dismiss handler runs in the
        * capture phase and would unmount these before React's pointerdown
        * reached them — the fault that cost an afternoon on the gradient axis,
        * and the marker that fixed it. These handles and the timeline's step row
        * are one editor in two places.
        */}
      {pathEdit && (
        <span data-paint-canvas data-motion-path={pathEdit.stepSid}>
          <svg
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none'
            }}
          >
            {(() => {
              // Drawn in the overlay's pixels: the path's own points, from the
              // shape's rest centre, scaled by the zoom.
              const data = pathData(
                pathEdit.points.map((point) => ({
                  x: toScreen(pathEdit.origin.x + point.x),
                  y: toScreen(pathEdit.origin.y + point.y)
                })),
                { x: 0, y: 0 },
                pathEdit.smooth
              );
              return (
                <>
                  {/* Two strokes: a white one under a blue one, so the route is
                      visible over a dark photograph as well as over white. The
                      same trick the gradient axis uses. */}
                  <path d={data} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={4} />
                  <path
                    d={data}
                    fill="none"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                </>
              );
            })()}
          </svg>

          {pathEdit.points.map((point, index) => (
            <span
              key={index}
              data-path-point={index}
              role="button"
              aria-label={`경로 지점 ${index + 1}`}
              onPointerDown={(event) => dragPathPoint(event, index)}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                // Double-click removes, which is what the gradient's stops do —
                // and it refuses to take a path below two points, because a path
                // of one is a step that travels nowhere.
                editPath(removePoint(pathEdit.points, index));
              }}
              style={{
                position: 'absolute',
                left: toScreen(pathEdit.origin.x + point.x) - 6,
                top: toScreen(pathEdit.origin.y + point.y) - 6,
                width: 12,
                height: 12,
                borderRadius: '50%',
                // The first point is where the shape starts, which is a different
                // fact from the rest and worth looking different.
                background: index === 0 ? '#7c3aed' : '#ffffff',
                border: '2px solid #7c3aed',
                cursor: 'grab',
                pointerEvents: 'auto'
              }}
            />
          ))}

          {/* A dot between each pair, which adds a bend where a reader points.
              Half-transparent until hovered, because six of them on a short path
              would otherwise read as the path itself. */}
          {pathEdit.points.slice(0, -1).map((point, index) => {
            const next = pathEdit.points[index + 1];
            return (
              <span
                key={`add-${index}`}
                data-path-add={index}
                role="button"
                aria-label={`경로 지점 ${index + 1} 다음에 추가`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  editPath(addPoint(pathEdit.points, index));
                }}
                style={{
                  position: 'absolute',
                  left: toScreen(pathEdit.origin.x + (point.x + next.x) / 2) - 4,
                  top: toScreen(pathEdit.origin.y + (point.y + next.y) / 2) - 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'rgba(124, 58, 237, 0.45)',
                  cursor: 'copy',
                  pointerEvents: 'auto'
                }}
              />
            );
          })}
        </span>
      )}

      {/*
        * The box being typed in, outlined.
        *
        * While a reader is in the text this overlay goes inert — the caret, the
        * selection and IME are the editor's — and until now that meant *nothing
        * was drawn at all*: the handles went, the outline went, and a slide with
        * two text boxes gave no sign of which one the keystrokes were going to.
        * On a slide, where a box may be transparent and its text one word, that
        * is a reader typing into a shape they cannot identify.
        *
        * Drawn as a solid accent line rather than the dashed one a *container*
        * gets: going into a group and typing in a box are different states and
        * would otherwise look identical.
        */}
      {editingBox && (
        <div
          aria-hidden
          data-editing-box
          style={{
            position: 'absolute',
            left: toScreen(editingBox.x),
            top: toScreen(editingBox.y),
            width: toScreen(editingBox.width),
            height: toScreen(editingBox.height),
            border: '1.5px solid rgba(37, 99, 235, 0.9)',
            borderRadius: 2,
            // Room for the line to sit outside the text rather than over the
            // first character of it.
            outline: '3px solid rgba(37, 99, 235, 0.12)',
            pointerEvents: 'none'
          }}
        />
      )}

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

      {/*
        * The line a dropped shape would go into, drawn thick.
        *
        * The gesture is only discoverable if the line answers: without this, a reader
        * drops a shape near a line and either something surprising happens or nothing
        * does, and either way they do not learn the gesture. Drawn from the **track**, so
        * the highlight lies on the curve rather than on the triangle it sits inside.
        */}
      {spliceTo && spliceTo.track.length >= 2 && (
        <svg
          aria-hidden
          data-splice-line={spliceTo.line}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none'
          }}
        >
          <polyline
            points={spliceTo.track
              .map((point) => `${toScreen(point.x)},${toScreen(point.y)}`)
              .join(' ')}
            fill="none"
            stroke="#2563eb"
            strokeOpacity={0.35}
            strokeWidth={10}
            strokeLinecap="round"
          />
        </svg>
      )}

      {/*
        * Where the drag would put it in the order.
        *
        * A reorder with no indicator reads as a drag that did something odd: the shape
        * follows the pointer and then jumps to a slot the reader could not see. So the
        * slot is drawn — the same answer the release uses, so the line cannot promise one
        * thing and the command do another.
        */}
      {reorderTo &&
        insideBox &&
        (() => {
          const along = reorderTo.mode === 'column' ? 'y' : 'x';
          const before = reorderTo.others[reorderTo.index - 1];
          const after = reorderTo.others[reorderTo.index];
          // Between the two it lands between; against the frame's own edge at either end.
          const at =
            before && after
              ? (along === 'x'
                  ? before.box.x + before.box.width + after.box.x
                  : before.box.y + before.box.height + after.box.y) / 2
              : before
                ? (along === 'x' ? before.box.x + before.box.width : before.box.y + before.box.height) + 60
                : after
                  ? (along === 'x' ? after.box.x : after.box.y) - 60
                  : (along === 'x' ? insideBox.x : insideBox.y) + 60;

          return (
            <div
              aria-hidden
              data-reorder-line={reorderTo.index}
              style={{
                position: 'absolute',
                left: toScreen(along === 'x' ? at : insideBox.x),
                top: toScreen(along === 'x' ? insideBox.y : at),
                width: along === 'x' ? 2 : toScreen(insideBox.width),
                height: along === 'x' ? toScreen(insideBox.height) : 2,
                background: '#2563eb',
                pointerEvents: 'none'
              }}
            />
          );
        })()}

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
               * A translucent stand-in, for a resize and nothing else.
               *
               * A *move* moves the real shape now — the overlay nudges the
               * element with `translate` for the length of the drag — so a copy
               * drawn here would be a second one in the same place. A resize
               * cannot be done that way: it changes the size, which `translate`
               * cannot say, and scaling the element would scale the text inside
               * it into something the model will never hold.
               */
              background: drag?.moved && drag.handle !== 'move' && entry.fill ? entry.fill : undefined,
              opacity: drag?.moved && drag.handle !== 'move' && entry.fill ? 0.45 : undefined
            }}
          />
        );
      })}

      {/*
        * The magnets a line can be pulled out of.
        *
        * On one selected shape and only one: pulling a line out of two shapes at once
        * is not a thing, and the dots would sit inside the group outline saying
        * otherwise. Not on a connector either — a line joined to a line is real and is
        * not this gesture (§8.5).
        *
        * Small, and only while the shape is selected, because these sit *on* the shape:
        * dots on every shape all the time is a canvas a reader cannot see their own
        * work through. Figma and Canva both show them on hover or selection.
        */}
      {!marquee &&
        !drag &&
        selected.length === 1 &&
        doc?.getNode(selected[0].sid)?.stype !== 'connector' &&
        magnetPoints({ ...selected[0].box, rotation: selected[0].rotation })
          .filter((magnet) => magnet.side !== 'c')
          .map((magnet) => {
            /**
             * Just outside the shape, and that is not decoration.
             *
             * A side's magnet is the middle of that side — which is exactly where the
             * side's **resize handle** is. Drawn there, the handle took every press and
             * the gesture could not be started at all; drawn *over* the handle, a
             * reader could no longer resize. Two gestures must not share a pixel, so
             * these sit a handle's width outside the edge, which is also where Canva
             * puts them.
             *
             * A constant number of *screen* pixels along the side's own normal, so the
             * dots stay clear of the handles at every zoom and turn with the shape.
             */
            const out = normalOf(magnet.side, selected[0].rotation);
            return (
            <span
              key={magnet.side}
              data-magnet={magnet.side}
              data-magnet-of={selected[0].sid}
              title="끌어서 연결"
              className="sl-magnet"
              style={{
                position: 'absolute',
                left: toScreen(magnet.point.x) + out.x * 13,
                top: toScreen(magnet.point.y) + out.y * 13,
                width: 9,
                height: 9,
                marginLeft: -4.5,
                marginTop: -4.5,
                borderRadius: '50%',
                background: '#ffffff',
                border: '1.5px solid #2563eb',
                cursor: 'crosshair',
                pointerEvents: 'auto'
              }}
            />
            );
          })}

      {/*
        * The two ends of a selected line, so either can be moved to another shape.
        *
        * The same gesture as pulling one out of a magnet, which is why it is the same
        * state: something is held at the pointer and it attaches to whatever is under
        * it when the reader lets go.
        */}
      {!marquee &&
        !drag &&
        selected.length === 1 &&
        doc?.getNode(selected[0].sid)?.stype === 'connector' &&
        (() => {
          const points = connectorRouteOf(doc as never, selected[0].sid);
          const ends: Array<{ end: 'start' | 'end'; point: { x: number; y: number } }> = [
            { end: 'start', point: points[0] },
            { end: 'end', point: points[points.length - 1] }
          ];
          return ends.map((entry) => (
            <span
              key={entry.end}
              data-conn-end={entry.end}
              title={entry.end === 'start' ? '시작 끝점' : '끝 끝점'}
              className="sl-conn-end"
              style={{
                position: 'absolute',
                left: toScreen(entry.point.x + origin.x),
                top: toScreen(entry.point.y + origin.y),
                width: 11,
                height: 11,
                marginLeft: -5.5,
                marginTop: -5.5,
                borderRadius: '50%',
                background: '#2563eb',
                border: '2px solid #ffffff',
                cursor: 'crosshair',
                pointerEvents: 'auto'
              }}
            />
          ));
        })()}

      {/*
        * The points on a line: one at each bend a reader has placed, and one in the middle
        * of every segment for placing the next.
        *
        * The gesture draw.io taught everybody: a small mark in the middle of a run, and
        * dragging it bends the line there. No menu, no mode, and it generalises — a line
        * with four bends is four drags.
        *
        * On every route, now that a curve goes **through** a placed point rather than
        * leaning towards it (`splineThrough`). It could not before: a curve's points are
        * control points, so the reader's point became one — the line bent towards it and
        * never reached it, which is the one thing a placed bend means.
        */}
      {!marquee &&
        !drag &&
        !labelling &&
        onlyConnector &&
        (() => {
          const spec = connectorSpecOf(doc?.getNode(selected[0].sid) as never);
          const route = connectorRouteOf(doc as never, selected[0].sid);
          // Where the bow grip stands, so no segment dot is put on top of it: the two do
          // the same thing to an elbow's middle run, and two gestures on one pixel means
          // whichever is drawn last wins. Measured — the segment dot took the press and
          // the bow grip stopped being draggable at all.
          const placed = readWaypoints(doc?.getNode(selected[0].sid) as never);
          const bow =
            route.length >= 2 && canBendByDrag(route, spec.kind, placed.length > 0)
              ? midHandleOf(route, spec.kind)
              : null;
          if (route.length < 2) return null;


          const dot = (
            key: string,
            point: { x: number; y: number },
            data: Record<string, string>,
            own: boolean
          ) => (
            <span
              key={key}
              {...Object.fromEntries(Object.entries(data).map(([k, v]) => [`data-${k}`, v]))}
              title={own ? '끌어 옮기기 · 두 번 눌러 지우기' : '끌어서 꺾기'}
              className={own ? 'sl-conn-wp' : 'sl-conn-seg'}
              style={{
                position: 'absolute',
                left: toScreen(point.x + origin.x),
                top: toScreen(point.y + origin.y),
                width: own ? 9 : 7,
                height: own ? 9 : 7,
                marginLeft: own ? -4.5 : -3.5,
                marginTop: own ? -4.5 : -3.5,
                borderRadius: '50%',
                background: own ? '#2563eb' : '#ffffff',
                border: `1.5px solid ${own ? '#ffffff' : '#2563eb'}`,
                opacity: own ? 1 : 0.75,
                cursor: 'move',
                pointerEvents: 'auto'
              }}
              onDoubleClick={
                own
                  ? (event) => {
                      // Two presses take it away, which is the only way back from a bend a
                      // reader no longer wants — dragging it onto the straight line would
                      // be a guess about what "straight enough" means.
                      event.preventDefault();
                      event.stopPropagation();
                      const index = Number(data['conn-wp']);
                      void editor?.executeCommand?.('setConnector', {
                        nodeIds: [selected[0].sid],
                        waypoints: placed.filter((_point, at) => at !== index)
                      });
                    }
                  : undefined
              }
            />
          );

          /**
           * Where a *new* point can be added: the middle of each run.
           *
           * For a straight route that is the route's own segments. A **curve's** points
           * are control points, so the middle of two of them is not on the line at all —
           * measured by eye and obvious once said. There the runs are the spans between
           * the reader's own stops, and the middle of each is taken along the **track**,
           * which is the curve as drawn.
           */
          const bendable = (() => {
            if (spec.kind !== 'curve' && spec.kind !== 'arc') {
              return route.slice(0, -1).map((point, index) => ({
                key: index,
                middle: { x: (point.x + route[index + 1].x) / 2, y: (point.y + route[index + 1].y) / 2 },
                length: Math.hypot(route[index + 1].x - point.x, route[index + 1].y - point.y)
              }));
            }
            const track = connectorTrackOf(doc as never, selected[0].sid);
            if (track.length < 2) return [];
            /**
             * A curve with no points yet gets **two** dots, at a quarter and three
             * quarters along.
             *
             * Its one span's middle is exactly where the bow grip stands, so the skip
             * below removed it — and a reader had no way to place a first point on a curve
             * at all. Either side of the bow, both on the line, and neither fighting it for
             * the same pixel.
             */
            if (placed.length === 0) {
              return [0.25, 0.75].map((where, index) => ({
                key: index,
                middle: pointOnPath(track, where),
                length: pathLength(track) / 2
              }));
            }
            const stops = [track[0], ...placed, track[track.length - 1]];
            return stops.slice(0, -1).map((point, index) => {
              const next = stops[index + 1];
              const from = nearestOnPath(track, point).t;
              const to = nearestOnPath(track, next).t;
              return {
                key: index,
                // On the drawn curve halfway along the span, not halfway between its ends:
                // a dot on the chord of a bowed span floats off the line.
                middle: pointOnPath(track, (from + to) / 2),
                length: Math.hypot(next.x - point.x, next.y - point.y)
              };
            });
          })();

          return [
            ...placed.map((point, index) =>
              dot(`wp-${index}`, point, { 'conn-wp': String(index) }, true)
            ),
            ...bendable.map((run) => {
              // A run too short to aim at is one whose grip would sit on top of its
              // neighbours' — 24px, about three grips' width.
              if (run.length < 360) return null;
              if (bow && Math.hypot(run.middle.x - bow.x, run.middle.y - bow.y) < 200) return null;
              return dot(`seg-${run.key}`, run.middle, { 'conn-seg': String(run.key) }, false);
            })
          ];
        })()}

      {/*
        * The grip that bends a line.
        *
        * On the part of the route a bow actually moves — an elbow's middle segment, a
        * curve's own midpoint — because a grip anywhere else moves under the pointer as
        * soon as it is dragged. A **square**, so it is not one of the round end handles:
        * they attach the line to things and this changes its shape.
        */}
      {!marquee &&
        !drag &&
        !labelling &&
        onlyConnector &&
        (() => {
          const spec = connectorSpecOf(doc?.getNode(selected[0].sid) as never);
          /**
           * On every route, and the reason is the *fan*.
           *
           * Two lines joining the same pair are separated by a bow nobody typed, and
           * a reader who wants them back on top of each other — or spread further —
           * has only this grip to say so with. Taking it off elbows to make room for
           * the waypoint dots left that unsayable by hand.
           *
           * They stay out of each other's way instead: the segment dot that would
           * land on this grip is skipped (above), so the middle run bows and every
           * other run takes points.
           *
           * Whether *this* route's bow can move at all is the model's answer
           * (`canBendByDrag`), not a condition repeated here: an elbow with one corner
           * has nothing between its sides to slide, and a straight line has no bow.
           */
          const route = connectorRouteOf(doc as never, selected[0].sid);
          if (
            !canBendByDrag(
              route,
              spec.kind,
              readWaypoints(doc?.getNode(selected[0].sid) as never).length > 0
            )
          ) {
            return null;
          }
          const grip = midHandleOf(route, spec.kind);
          return (
            <span
              data-conn-bend
              title="끌어서 구부리기"
              className="sl-conn-bend"
              style={{
                position: 'absolute',
                left: toScreen(grip.x + origin.x),
                top: toScreen(grip.y + origin.y),
                width: 9,
                height: 9,
                marginLeft: -4.5,
                marginTop: -4.5,
                background: '#ffffff',
                border: '1.5px solid #2563eb',
                cursor: 'move',
                pointerEvents: 'auto'
              }}
            />
          );
        })()}

      {/*
        * The word on the line, being typed.
        *
        * Over the label's own place, so the reader is typing where the word will be.
        * Committed on blur and on Enter — `TextField`'s rule, and the reason it is that
        * control: a keystroke per history entry is not an edit log anybody wants.
        */}
      {labelling &&
        doc?.getNode(labelling) &&
        (() => {
          const track = connectorTrackOf(doc as never, labelling);
          const at = track.length >= 2 ? labelAt(track) : { x: 0, y: 0 };
          const current = doc.getNode(labelling)?.attributes?.label;
          return (
            <div
              className="sl-label-edit"
              style={{
                position: 'absolute',
                left: toScreen(at.x + origin.x),
                top: toScreen(at.y + origin.y),
                transform: 'translate(-50%, -50%)',
                width: 130,
                pointerEvents: 'auto',
                zIndex: 3
              }}
            >
              <TextField
                ariaLabel="선 위에 쓸 말"
                data={{ 'label-edit': labelling }}
                value={typeof current === 'string' ? current : ''}
                maxLength={24}
                onCommit={(value) => {
                  void editor?.executeCommand?.('setConnector', {
                    nodeIds: [labelling],
                    label: value
                  });
                  setLabelling(undefined);
                }}
                onKeys={(event) => {
                  // Escape leaves it as it was, which `TextField` does by putting the
                  // value back — this only has to close the field.
                  if (event.key === 'Escape') setLabelling(undefined);
                }}
              />
            </div>
          );
        })()}

      {/*
        * The line being pulled, drawn while the pointer holds it.
        *
        * A rubber line and nothing else: no arrowhead, no route. What the reader is
        * choosing is *what to attach to*, and drawing the finished shape before it is
        * attached would show them a route that changes the moment they let go.
        */}
      {connecting && (
        <svg
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            overflow: 'visible'
          }}
        >
          <line
            x1={toScreen(anchorOfConnecting.x)}
            y1={toScreen(anchorOfConnecting.y)}
            x2={toScreen(connecting.at.x)}
            y2={toScreen(connecting.at.y)}
            stroke="#2563eb"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </svg>
      )}

      {/* One set of handles for the selection, around all of it. */}
      {outline && !marquee && !onlyConnector && (
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
          {!onlyPlacement &&
            !sizedByVar &&
            RESIZE_HANDLES.map((handle) => (
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

          {/*
            * One box turns; a set of them has no single centre to turn about — and none turns while a
            * **variable** owns the angle, for the reason the resize handles go (§10h-2).
            */}
          {selected.length === 1 && !turnedByVar && (
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
       * The guides the reader placed, which are the ones that can be taken hold
       * of. Drawn under the drag's own lines on purpose: while a shape is being
       * pulled onto one, the line that says *why it jumped* is the one to see.
       *
       * `pointerEvents: 'auto'` on a one-pixel line is a target nobody can hit,
       * so the hit area is a band around it and the line is drawn inside.
       */}
      {placed.map((guide, index) => {
        const held = heldGuide?.index === index ? heldGuide.guide : guide;
        const across = held.axis === 'x';
        return (
          <div
            key={`placed-${index}`}
            className="sl-placed-guide"
            data-guide={index}
            data-guide-axis={held.axis}
            data-guide-at={held.at}
            data-guide-held={heldGuide?.index === index ? 'true' : undefined}
            onPointerDown={takeGuide(index)}
            style={{
              position: 'absolute',
              pointerEvents: 'auto',
              cursor: across ? 'col-resize' : 'row-resize',
              ...(across
                ? { left: toScreen(held.at) - 4, top: 0, width: 9, height: '100%' }
                : { top: toScreen(held.at) - 4, left: 0, height: 9, width: '100%' })
            }}
          />
        );
      })}

      {/*
       * And the one being pulled out of a ruler right now, which is not in the
       * document yet. Drawn like a placed guide because that is what it is about
       * to be, and without a hit area because the pointer is already holding it.
       */}
      {draftGuide && (
        <div
          className="sl-placed-guide"
          data-guide-draft
          data-guide-axis={draftGuide.axis}
          data-guide-at={draftGuide.at}
          data-guide-held="true"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            ...(draftGuide.axis === 'x'
              ? { left: toScreen(draftGuide.at) - 4, top: 0, width: 9, height: '100%' }
              : { top: toScreen(draftGuide.at) - 4, left: 0, height: 9, width: '100%' })
          }}
        />
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

      {/*
        * What the drag is doing, in numbers.
        *
        * Every drawing tool says this while a shape is held — Figma draws
        * `W × H`, Keynote the position — and this said nothing, so a reader
        * resizing to a size had to let go and read the panel, twice. The
        * arithmetic is already here: the drag's preview *is* the box it would
        * write.
        *
        * Which number depends on the gesture, because that is what the reader is
        * asking: a move is about *where*, a resize about *how big*, a turn about
        * *how far round*. Drawn below the box rather than at the pointer, so it
        * does not sit under the cursor doing the dragging.
        */}
      {drag?.moved && readout && (
        <div
          className="sl-readout"
          data-drag-readout
          style={{
            position: 'absolute',
            left: toScreen(readout.box.x + readout.box.width / 2),
            top: toScreen(readout.box.y + readout.box.height) + 10,
            transform: 'translateX(-50%)',
            pointerEvents: 'none'
          }}
        >
          {readout.says}
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
      {/*
        * The gradient's axis, drawn on the shape while its editor is open.
        *
        * **After the resize handles**, because later in the tree is on top and
        * the far end of a gradient at 180° sits exactly where the south handle
        * is. Drawn before them, the drag resized the shape instead of aiming the
        * gradient — the handles were the same size, in the same place, and one of
        * them was simply in front.
        *
        * The line CSS actually paints along — see `gradient-axis.ts` — so a stop
        * dragged to the end of it is a colour that stops there. Above the
        * selection outline and below nothing: these handles are the thing a
        * reader is pointing at while they are visible.
        */}
      {axis && (
        /**
         * Marked as part of the fill's editor, which is what keeps it alive
         * while it is used.
         *
         * The panel's editor dismisses itself on a pointer outside it — in the
         * *capture* phase, so it ran before React's own pointerdown reached
         * these handles, closed the editor, and unmounted them mid-gesture. The
         * handles were the topmost element under the pointer and the drag still
         * did nothing, which is as confusing as this gets.
         *
         * These handles and that panel row are one editor in two places; this is
         * how the two halves know it.
         */
        <span data-paint-canvas>
          <svg
            aria-hidden
            data-gradient-axis
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              pointerEvents: 'none'
            }}
          >
            <line
              x1={toScreen(axis.from.x)}
              y1={toScreen(axis.from.y)}
              x2={toScreen(axis.to.x)}
              y2={toScreen(axis.to.y)}
              stroke="rgba(255, 255, 255, 0.9)"
              strokeWidth={3}
            />
            <line
              x1={toScreen(axis.from.x)}
              y1={toScreen(axis.from.y)}
              x2={toScreen(axis.to.x)}
              y2={toScreen(axis.to.y)}
              stroke="#2563eb"
              strokeWidth={1.5}
            />
            {/*
              * A wide invisible line over the thin visible one, which is what
              * takes the double-click.
              *
              * The drawn axis is 1.5 pixels and `pointer-events: none` on its
              * SVG; a reader aiming at a 1.5-pixel target is a reader who misses.
              * Twelve is about a fingertip and is the same trick the timeline's
              * ruler uses for its playhead.
              */}
            <line
              data-gradient-line
              x1={toScreen(axis.from.x)}
              y1={toScreen(axis.from.y)}
              x2={toScreen(axis.to.x)}
              y2={toScreen(axis.to.y)}
              stroke="transparent"
              strokeWidth={12}
              style={{ pointerEvents: 'stroke', cursor: 'grab' }}
              /**
               * The press starts a *drag of the whole gradient*, and stopping it
               * here is also what makes the double-click possible at all.
               *
               * Measured: without stopping it, the first press of the two bubbled
               * to the overlay, which read a pointer on the slide as "select
               * nothing", cleared the selection and unmounted the axis — so the
               * second click landed on an element that no longer existed and the
               * gradient never gained a stop. The handles are *inside* the paint
               * editor (`data-paint-canvas`); this is the other half of saying so.
               *
               * A drag and a double-click on one element get along because the
               * drag is a *delta*: two quick clicks move the pointer by nothing,
               * so they write nothing and the `dblclick` that follows adds a stop.
               */
              onPointerDown={(event) => dragGradient(event, { kind: 'axis' })}
              onDoubleClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const stops = stopsNow();
                // Clamped the same way `addStop` clamps, so the offset below is
                // the one that ended up in the list and the index is exact — a
                // search by identity would fail, because every read of the
                // document builds new objects.
                const at = Math.min(1, Math.max(0, offsetAlong(axis, toModel(event as never))));
                const added = addStop(stops, at);
                setStopPicked(added.findIndex((stop) => stop.offset === at));
                editStops(added);
              }}
            />
          </svg>

          {/*
            * The ellipse, and a handle for each of its radii.
            *
            * Drawn dashed and unfilled so the shape reads as a *guide* rather than
            * as something on the slide — the same reason the motion path is dashed.
            * The rotation Figma also offers is missing because CSS has no syntax
            * for it (measured), not because nobody got to it.
            */}
          {radial && (
              <svg
                aria-hidden
                data-radial-guide
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'visible',
                  pointerEvents: 'none'
                }}
              >
                <ellipse
                  cx={toScreen(radial.cx)}
                  cy={toScreen(radial.cy)}
                  rx={toScreen(radial.rx)}
                  ry={toScreen(radial.ry)}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.9)"
                  strokeWidth={3}
                />
                <ellipse
                  cx={toScreen(radial.cx)}
                  cy={toScreen(radial.cy)}
                  rx={toScreen(radial.rx)}
                  ry={toScreen(radial.ry)}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                />
              </svg>
          )}

          {axis.stops.map((stop, index) => (
            <span
              key={index}
              data-gradient-stop={index}
              role="button"
              aria-label={`색 지점 ${index + 1}`}
              data-picked={stopPicked === index ? 'true' : undefined}
              onPointerDown={(event) => {
                setStopPicked(index);
                dragGradient(event, { kind: 'stop', at: index });
              }}
              style={{
                position: 'absolute',
                left: toScreen(stop.x),
                top: toScreen(stop.y),
                width: stopPicked === index ? 14 : 12,
                height: stopPicked === index ? 14 : 12,
                marginLeft: stopPicked === index ? -7 : -6,
                marginTop: stopPicked === index ? -7 : -6,
                borderRadius: '50%',
                // The picked one wears the accent, because Delete is about to be
                // about it and a reader has to know which.
                border: stopPicked === index ? '2px solid #2563eb' : '2px solid #fff',
                background: (() => {
                  const node = doc?.getNode(selected[0]?.sid);
                  const paint = paintsOf(node?.attributes as never)[paintEdit as number];
                  return paint?.stops?.[index]?.color ?? '#fff';
                })(),
                boxShadow: '0 0 0 1px rgba(37, 99, 235, 0.9)',
                cursor: 'grab',
                pointerEvents: 'auto'
              }}
            />
          ))}

          {(() => {
            /**
             * The two end handles sit *just outside* the segment.
             *
             * Because a gradient's first stop is at its start: the square and the
             * dot land on the same pixel, and whichever is drawn last takes the
             * pointer — measured, the start handle swallowed the first stop and it
             * could not be dragged at all. (The far end had always had this and
             * nobody had tried it.)
             *
             * Twelve screen pixels along the axis, which is Figma's arrangement
             * too: the ends read as the *line's* ends rather than as two more
             * stops, and every dot stays reachable.
             */
            const dx = toScreen(axis.to.x) - toScreen(axis.from.x);
            const dy = toScreen(axis.to.y) - toScreen(axis.from.y);
            const length = Math.hypot(dx, dy) || 1;
            const out = { x: (dx / length) * 12, y: (dy / length) * 12 };
            gradientEnds.current = {
              from: { x: toScreen(axis.from.x) - out.x, y: toScreen(axis.from.y) - out.y },
              to: { x: toScreen(axis.to.x) + out.x, y: toScreen(axis.to.y) + out.y }
            };
            return null;
          })()}

          {/*
            * Where the gradient *starts*, which is the handle the model could not
            * hold until it held two points.
            *
            * A square, because it is the one handle that is not a colour and not a
            * direction — a reader has to be able to tell it from the round stop
            * that sits at the same place when the first stop is at 0.
            */}
          <span
            data-gradient-origin
            role="button"
            aria-label="그라디언트 시작"
            onPointerDown={(event) => dragGradient(event, { kind: 'from' })}
            style={{
              position: 'absolute',
              left: gradientEnds.current.from.x,
              top: gradientEnds.current.from.y,
              width: 14,
              height: 14,
              marginLeft: -7,
              marginTop: -7,
              borderRadius: 3,
              border: '2px solid #2563eb',
              background: 'rgba(255, 255, 255, 0.85)',
              cursor: 'grab',
              pointerEvents: 'auto'
            }}
          />

          {/*
            * The far end, which is what a reader points the gradient with — and
            * only for a gradient that *has* one direction. A radial's far end is
            * its horizontal radius, and that handle is below.
            */}
          {!radial && (
          <span
            data-gradient-aim
            role="button"
            aria-label="그라디언트 방향"
            onPointerDown={(event) => dragGradient(event, { kind: 'to' })}
            style={{
              position: 'absolute',
              left: gradientEnds.current.to.x,
              top: gradientEnds.current.to.y,
              width: 16,
              height: 16,
              marginLeft: -8,
              marginTop: -8,
              borderRadius: '50%',
              border: '2px solid #2563eb',
              background: 'rgba(255, 255, 255, 0.85)',
              cursor: 'grab',
              pointerEvents: 'auto'
            }}
          />
          )}

          {/*
            * The radii's own handles, drawn **after** the stop dots.
            *
            * Because for a radial the axis's far end *is* the horizontal radius:
            * the last stop, the linear's aim handle and this one all wanted the
            * same pixel. Measured — `elementFromPoint` there answered "stop 1", so
            * dragging the radius moved a colour instead. Later in the DOM wins the
            * hit test, and the handle is pushed out past the dot the way the
            * linear's ends are.
            */}
          {radial && (
            <>
              {(
                [
                  {
                    kind: 'rx' as const,
                    label: '가로 반지름',
                    x: radial.cx + radial.rx,
                    y: radial.cy,
                    out: { x: 12, y: 0 }
                  },
                  {
                    kind: 'ry' as const,
                    label: '세로 반지름',
                    x: radial.cx,
                    y: radial.cy + radial.ry,
                    out: { x: 0, y: 12 }
                  }
                ]
              ).map((handle) => (
                <span
                  key={handle.kind}
                  data-radial-handle={handle.kind}
                  role="button"
                  aria-label={handle.label}
                  onPointerDown={(event) => dragGradient(event, { kind: handle.kind })}
                  style={{
                    position: 'absolute',
                    left: toScreen(handle.x) + handle.out.x,
                    top: toScreen(handle.y) + handle.out.y,
                    width: 12,
                    height: 12,
                    marginLeft: -6,
                    marginTop: -6,
                    border: '2px solid #2563eb',
                    background: 'rgba(255, 255, 255, 0.9)',
                    cursor: handle.kind === 'rx' ? 'ew-resize' : 'ns-resize',
                    pointerEvents: 'auto'
                  }}
                />
              ))}
            </>
          )}
        </span>
      )}

      {/*
        * The menu a right-click opened.
        *
        * Inside this layer because this is what knew *what* was clicked — and
        * drawn from `slideMenu`, which is the model's answer to "what can be done
        * to this selection". Whether each of those can run right now is the
        * command's own guard, asked once here: an item that is offered and does
        * nothing is worse than one that is offered greyed out.
        */}
      {menuAt && (
        <Menu
          at={menuAt}
          label="상자 메뉴"
          blocks={menu.map((section) => ({
            id: section.id,
            items: section.items.map((entry) => ({
              id: entry.id,
              label: entry.label,
              hint: keyLabel(entry.key, apple),
              disabled: !editor?.canExecuteCommand?.(entry.command, entry.payload)
            }))
          }))}
          onPick={(id) => {
            const entry = menu.flatMap((section) => section.items).find((one) => one.id === id);
            setMenuAt(null);
            if (entry) void editor?.executeCommand?.(entry.command, entry.payload);
          }}
          onClose={() => setMenuAt(null)}
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
