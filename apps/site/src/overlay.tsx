import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { Icon, Menu } from '@barocss/office-ui';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';
import {
  childOfScope,
  enclosing,
  firstRunIn,
  landingFor,
  innermostOf,
  isInside,
  SITE_CONTEXT,
  isTextual,
  boundVarOf,
  drawnSidAtElement,
  isCode,
  labelOfBlock,
  sidAtElement,
  templateOf,
  type BreakpointId,
  type Landing
} from '@barocss/office-site';


/**
 * The layer between a reader's pointer and the page.
 *
 * ## Two modes, and why a builder needs them
 *
 * A board is a real editor view: `contenteditable`, with a caret, an input path and a mutation
 * observer. That is what makes the text editable, and it is also what makes a *builder* impossible
 * on its own — every click would put a caret, and nothing would ever select a section.
 *
 * So the pointer has an owner, and the owner is stated:
 *
 * - **Select** (the default): this layer takes every pointer event, so the board never sees one. A
 *   click selects, a double-click drills in or enters the text, and the caret is never disturbed
 *   because it is never asked for.
 * - **Text**: this layer stops taking events (`pointer-events: none`) and the board is an ordinary
 *   editor again. `Escape` comes back out to the block that was being edited.
 *
 * One gesture each way, which is what every tool of this kind converged on. What each gesture
 * *means* is not decided here — it is `office-site/selection.ts`, in words, with tests, because it
 * is a fact about the product rather than about the DOM.
 *
 * ## Why the outline is drawn and not styled
 *
 * A CSS rule on the selected node would be the obvious way and is the wrong one: three boards draw
 * the same node, the selection is the *document's*, and a rule would have to be written into the
 * document to be seen. Drawing the box over each board keeps the selection where it belongs — one
 * selection, one document, and the same card outlined at every width at once, which is the thing a
 * reader most needs to see when they are looking at three widths.
 */
export type PointerMode = 'select' | 'text';

/**
 * How far away the reader is standing, **asked of the DOM**.
 *
 * The plane carries `translate(x, y) scale(z)` and everything inside it — the boards, this overlay —
 * is drawn at `z`. Which means the number is already in the layout: a board's `getBoundingClientRect`
 * is its scaled width and its `offsetWidth` is the width it was laid out at, and the ratio is `z`.
 *
 * Asked rather than handed in, because a prop makes a scale change a **React** change: it re-renders
 * every board and every overlay for a number the browser has already applied, and every box those
 * overlays then recompute comes out the same. A reader reported this as *the rendering breaks when I
 * only change the scale*, and they were right about the cause — a viewport's scale should move a
 * transform and nothing else.
 *
 * `1` for a board with no width yet, which is the only honest answer before layout.
 */
function scaleOf(board: HTMLElement | null): number {
  if (!board) return 1;
  const laid = board.offsetWidth;
  if (!laid) return 1;
  const shown = board.getBoundingClientRect().width;
  return shown > 0 ? shown / laid : 1;
}

export function Overlay({
  editor,
  host,
  page,
  breakpoint,
  mode,
  onEnterText,
  onEditComponent,
  onEditCode,
  scope,
  onScope
}: {
  editor: Editor;
  /** The board this draws over. */
  host: React.RefObject<HTMLDivElement | null>;
  page: string;
  /** Which width this board is, so a drag reads the arrangement **this** board is drawing. */
  breakpoint: BreakpointId;
  mode: PointerMode;
  /**
   * The reader has opened what a placement draws.
   *
   * A placement has no children anybody can select — its parts are resolved at draw time — so the
   * drill has nowhere else to go, and *into it* is the only thing a second double-click can honestly
   * mean. Which is the gesture every tool of this kind uses for the same reason.
   */
  /** Open a definition — and, when the reader came in through a list, against which of its rows. */
  onEditComponent?: (componentId: string, from?: { collection: string; index: number }) => void;
  /**
   * Open the code editor over this block, at the rectangle it has **on screen**.
   *
   * On screen rather than on the plane: the boards zoom and pan, and a layer drawn inside the plane
   * would be drawn at the reader's zoom — code at 70% is code nobody can read.
   */
  onEditCode?: (sid: string, box: { left: number; top: number; width: number; height: number }) => void;
  /**
   * The reader has entered this block's text.
   *
   * Reported rather than decided, because leaving again is `Escape` — one key, listened for **once**,
   * in the app. Three boards each listening on the document meant one press stepped out three
   * levels, which is a bug only a second board could have.
   */
  onEnterText: (sid: string) => void;
  /**
   * The container the reader has entered — the page until they double-click into something.
   *
   * Held by the app rather than per board, because there is one reader and one selection: entering a
   * card on the desktop board and then clicking its neighbour on the mobile board is one gesture in
   * one place.
   */
  scope: string;
  onScope: (scope: string) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | undefined>(undefined);
  /**
   * A part whose words came from somewhere else, and which variable that is.
   *
   * Held until the next click, because it is an **answer to a gesture** rather than a state a reader
   * is in: they asked for the caret and are being told why they cannot have it there.
   */
  const [bound, setBound] = useState<{ sid: string; said: string } | undefined>(undefined);

  /*
   * The document's own answers, re-read rather than held: a panel that keeps a copy of the
   * selection is a panel that lies the moment something is undone (`useRevision`).
   */
  const revision = useRevision((reread) => watchAnswers(editor, reread), [editor]);
  const selected = selectedNodeIds((editor as never as { selection?: never }).selection) ?? [];

  const doc = useCallback(
    () => ({
      getNode: (sid: string) =>
        (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore?.getNode(sid)
    }),
    [editor]
  );

  const select = useCallback(
    (ids: string[]) => {
      (editor as never as { executeCommand?: (name: string, payload?: unknown) => void }).executeCommand?.(
        'setNode',
        { nodeIds: ids }
      );
    },
    [editor]
  );

  /** What the pointer is over, as a document node on this page. */
  const under = useCallback(
    (event: { clientX: number; clientY: number }): string | undefined => {
      const board = host.current;
      const skin = layer.current;
      if (!board || !skin) return undefined;

      /*
       * Looked up through the stack rather than from `event.target`, because the target is always
       * this layer — that is the whole point of it. `elementsFromPoint` gives everything under the
       * pointer in paint order, and the first one inside the board is what a reader sees there.
       */
      for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
        if (el === skin || skin.contains(el)) continue;
        if (!board.contains(el)) continue;
        return sidAtElement(el, board);
      }
      return undefined;
    },
    [host]
  );

  /** Where a node is drawn **in this board**, in the board's own pixels. */
  const boxOf = useCallback(
    (sid: string): { left: number; top: number; width: number; height: number } | undefined => {
      const board = host.current;
      if (!board) return undefined;
      /*
       * The first element claiming the sid, and resolved parts are the reason `^=` is not used: a
       * card's parts carry `${placement}~${part}`, and matching by prefix would find a part before
       * the placement itself.
       */
      const el = board.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`);
      if (!el) return undefined;

      const rect = el.getBoundingClientRect();
      const frame = board.getBoundingClientRect();
      /*
       * Divided by the scale because this layer lives *inside* the scaled plane: its own pixels are
       * the board's, and `getBoundingClientRect` answers in the screen's.
       *
       * **Read from the board, not handed in.** It used to be a `zoom` prop, and that one prop was
       * the whole of a fault a reader reported as *the rendering breaks when I only change the
       * scale*: every wheel tick changed it, which re-rendered this overlay and every box in it —
       * three boards' worth of `getBoundingClientRect` per frame — for an answer that **cannot
       * change**. A box measured in board pixels is scale-invariant by construction: the numerator
       * and the denominator scale together, which is exactly why the division is here.
       *
       * So a zoom now changes one transform and one custom property, and nothing else re-renders at
       * all. `scaleOf` is the same number the plane is drawn at, asked of the DOM at the moment it is
       * needed, which is also the only place it cannot be stale.
       */
      const scale = scaleOf(board);
      return {
        left: (rect.left - frame.left) / scale,
        top: (rect.top - frame.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale
      };
    },
    [host]
  );

  /* Redrawn when the document, the selection, the width or the hover changes. */
  const [, redraw] = useState(0);
  useEffect(() => {
    const board = host.current;
    if (!board) return;
    const watch = new ResizeObserver(() => redraw((count) => count + 1));
    watch.observe(board);
    return () => watch.disconnect();
  }, [host]);

  /**
   * Carrying a block.
   *
   * `held` is what the pointer went down on and how far it has moved; `landing` is where letting go
   * would put it. A drag begins at four pixels rather than at the press, because a click is a press
   * that did not move and a builder where clicking selects *and* nudges is a builder that moves
   * things by accident.
   */
  const held = useRef<
    {
      sid: string;
      x: number;
      y: number;
      carrying: boolean;
      /**
       * **Where the drag would put it, when the block places itself.**
       *
       * A block that states `position: absolute` is not in the stack any more — it is at coordinates
       * inside whatever box positions it — so dragging it is a *move*, not a reorder. Which sides to
       * write is the block's own decision, not this drag's: one that says `insetRight` is pinned to
       * the right edge and stays pinned, because that is what a reader chose when they wrote it.
       *
       * `moved` is filled in as the pointer travels and read once, on release. The drawing follows
       * the pointer through an inline style in the meantime — the pattern every drag here uses, and
       * for its reason: a transaction per pointer event is a history a reader cannot undo through.
       */
      free?: {
        el: HTMLElement;
        sides: ('top' | 'right' | 'bottom' | 'left')[];
        was: Record<string, number>;
        moved?: Record<string, number>;
        /** Puts the renderer's own inline values back — see `holdStyle`. */
        restore: () => void;
        /** Whether this drag is taking the block **out of the flow**, and so writes `position` too. */
        lift: boolean;
        /** Where the block was when the press happened, in board pixels — what the snap compares. */
        from: { left: number; top: number; width: number; height: number };
        lines: { x: number[]; y: number[] };
      };
    } | null
  >(null);
  const [landing, setLanding] = useState<Landing | null>(null);
  /**
   * The lines a free drag is **snapping to**, in the board's own pixels.
   *
   * Drawn rather than only felt, which is the whole difference between a snap that helps and one
   * that fights: a block that stops moving for four pixels with nothing on screen to explain it reads
   * as a bug. Every tool of this kind draws the line it caught, and this draws the same line.
   */
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  /**
   * Which kind of space is being pulled, or none.
   *
   * A gap is the **stack's** number rather than the pair's, so pulling one moves them all — and a
   * reader who expected the space between two cards to change alone reads that as a bug. So every
   * gap lights up while one is held, which says *this is one number* before the release proves it.
   */
  const [pulling, setPulling] = useState<'gap' | undefined>(undefined);
  /**
   * **The rectangle a reader is sweeping**, in board pixels, or nothing.
   *
   * The gesture a canvas with free placement is unusable without: three badges laid out by hand are
   * chosen by drawing a box around them, and this had only Shift-click — one press per block, in a
   * tool where the whole point of placing things freely is that there are several of them.
   */
  /**
   * **Where a press of the right button opened a menu**, or nothing.
   *
   * On screen coordinates rather than board ones: the menu is drawn outside the zoomed plane, like
   * every other piece of chrome, so a menu at 40% zoom is the same size as one at 200%.
   */
  const [context, setContext] = useState<{ x: number; y: number } | null>(null);
  const [sweep, setSweep] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    add: boolean;
    /** The block a Shift **click** would toggle, when the rectangle turns out to be nothing. */
    toggle?: string;
  } | null>(null);
  /** What a resize is writing, while it is writing it — see the corner handle. */
  const [sizing, setSizing] = useState<string | undefined>(undefined);

  /**
   * What a **free** drag would need, or nothing at all — which is the ordinary answer.
   *
   * A block places itself only when it says so, and a page is a stack of bands: almost nothing on it
   * is absolute, and everything that is not keeps the reorder drag it has always had. So this is the
   * one question asked at the start of every press, and it is cheap: read one attribute.
   *
   * The sides come from the document rather than from a rule of this drag's, because they are a
   * decision a reader already made — a badge pinned to a card's right edge stays pinned to it when
   * the card is dragged. A block that has said nothing gets top and left, which is the corner
   * `positionCss` already puts it in.
   */
  const freeAt = (sid: string, lift = false) => {
    const attrs = (doc().getNode(sid)?.attributes ?? {}) as Record<string, unknown>;
    if (attrs.position !== 'absolute' && !lift) return undefined;
    const board = host.current;
    const el = board?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`);
    if (!el) return undefined;

    const held = (['top', 'right', 'bottom', 'left'] as const).filter(
      (side) => typeof attrs[`inset${side[0].toUpperCase()}${side.slice(1)}`] === 'number'
    );
    const sides = held.length > 0 ? held : (['top', 'left'] as const).slice();
    const said = getComputedStyle(el);
    const was: Record<string, number> = {};
    /*
     * **Where it already is**, for a block being lifted out of the flow.
     *
     * A stacked block's `top` and `left` are `auto` — it has no coordinates, the stack decided where
     * it goes — so the numbers to start from are the ones the browser has just laid it out at,
     * measured against whatever box will position it. Anything else and the block jumps the moment
     * it leaves the flow, which is the one thing a lift must not do.
     */
    if (lift && attrs.position !== 'absolute') {
      const holder = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
      const mine = el.getBoundingClientRect();
      const theirs = holder?.getBoundingClientRect();
      const zoom = scaleOf(board!);
      was.left = Math.round(((mine.left - (theirs?.left ?? 0)) / zoom));
      was.top = Math.round(((mine.top - (theirs?.top ?? 0)) / zoom));
    } else {
      for (const side of sides) was[side] = Math.round(Number.parseFloat(said[side]) || 0);
    }

    const scale = scaleOf(board!);
    const frame = board!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    const from = {
      left: (rect.left - frame.left) / scale,
      top: (rect.top - frame.top) / scale,
      width: rect.width / scale,
      height: rect.height / scale
    };
    return {
      el,
      sides: [...sides],
      was,
      from,
      lines: linesFor(el),
      restore: holdStyle(el, [...sides, 'position']),
      lift: lift && attrs.position !== 'absolute'
    };
  };

  /**
   * **What a free drag lines up with**, gathered once when the drag starts.
   *
   * The box that positions the block — its edges and its two centre lines — and every sibling drawn
   * beside it. Those are the lines a person actually aims at: flush with the card above, centred in
   * the section, hard against the left edge. Anything further away is noise, so the list stops at
   * the positioning parent rather than walking the whole page.
   *
   * In **board pixels**, like every other box here, so the comparison never has to think about zoom.
   */
  const linesFor = (el: HTMLElement) => {
    const board = host.current;
    const parent = (el.offsetParent as HTMLElement | null) ?? el.parentElement;
    if (!board || !parent) return { x: [] as number[], y: [] as number[] };
    const scale = scaleOf(board);
    const frame = board.getBoundingClientRect();
    const inBoard = (rect: DOMRect) => ({
      left: (rect.left - frame.left) / scale,
      right: (rect.right - frame.left) / scale,
      top: (rect.top - frame.top) / scale,
      bottom: (rect.bottom - frame.top) / scale
    });

    const x: number[] = [];
    const y: number[] = [];
    const box = inBoard(parent.getBoundingClientRect());
    x.push(box.left, box.right, (box.left + box.right) / 2);
    y.push(box.top, box.bottom, (box.top + box.bottom) / 2);

    for (const other of [...parent.children]) {
      if (other === el || !(other instanceof HTMLElement)) continue;
      if (!other.getAttribute('data-bc-sid')) continue;
      const each = inBoard(other.getBoundingClientRect());
      x.push(each.left, each.right, (each.left + each.right) / 2);
      y.push(each.top, each.bottom, (each.top + each.bottom) / 2);
    }
    return { x, y };
  };

  /**
   * How close counts, in board pixels — constant on screen rather than in the document, because it is
   * about a hand holding a pointer and not about the page.
   */
  const SNAP = 6;

  /**
   * **What a swept rectangle catches.**
   *
   * The blocks at the level a **click** would select, which is the rule worth stating: a box drawn
   * over a section would otherwise catch the section, its column, its row and every card and word in
   * it — forty things for one gesture. `childOfScope` is the same walk a press already does, so a
   * sweep chooses the things a reader could have chosen one at a time.
   *
   * **Touching, not containing.** Every tool of this kind counts a block the rectangle overlaps,
   * because a reader sweeping across a row of cards does not draw around them, they draw *through*
   * them — and demanding containment makes the gesture fail on the first card that sticks out.
   */
  const sweptIn = (box: { left: number; top: number; right: number; bottom: number }): string[] => {
    const board = host.current;
    if (!board) return [];
    const found = new Set<string>();
    for (const el of board.querySelectorAll<HTMLElement>('[data-bc-sid]')) {
      const sid = el.getAttribute('data-bc-sid');
      if (!sid) continue;
      const at = boxOf(sid);
      if (!at) continue;
      if (at.left > box.right || at.left + at.width < box.left) continue;
      if (at.top > box.bottom || at.top + at.height < box.top) continue;
      const outer = childOfScope(doc(), sid, page, scope);
      if (outer) found.add(outer);
    }
    return [...found];
  };

  /** The pointer, in the board's own pixels — the space every box here is measured in. */
  const pointIn = (event: { clientX: number; clientY: number }) => {
    const frame = host.current?.getBoundingClientRect();
    if (!frame) return undefined;
    const scale = scaleOf(host.current!);
    return { x: (event.clientX - frame.left) / scale, y: (event.clientY - frame.top) / scale };
  };

  /**
   * Where letting go would put it.
   *
   * Every part of the decision is `landing.ts`'s — which stack, which place, which index that is in
   * the parent's content, and where the line goes. What is left here is the only half that is
   * genuinely the DOM's: where each block is drawn, and whether the pointer is over this board at
   * all.
   *
   * **Outside the board is nothing**, not the page. A pointer past the edge of what a reader can see
   * used to resolve to "no element, so the page" and quietly moved the block to the top of the page —
   * a drag that goes somewhere the reader never pointed at is worse than a drag that does nothing.
   */
  const landingAt = (event: { clientX: number; clientY: number }, moving: string) => {
    const board = host.current?.getBoundingClientRect();
    const at = pointIn(event);
    if (!board || !at) return null;
    if (
      event.clientX < board.left ||
      event.clientX > board.right ||
      event.clientY < board.top ||
      event.clientY > board.bottom
    ) {
      return null;
    }

    return landingFor(doc(), {
      hit: under(event),
      at,
      page,
      moving,
      breakpoint,
      boxOf
    });
  };

  const hit = (event: React.PointerEvent | React.MouseEvent) =>
    under({ clientX: event.clientX, clientY: event.clientY });

  /**
   * The same point, answered with the sid **as it was drawn**.
   *
   * Everything else here wants the document node — that is what a reader can change — and exactly
   * one question wants the drawing: which row of a list the pointer is on. The row number is the
   * part of a drawn sid that `sidAtElement` collapses away.
   */
  const drawnHit = (event: React.MouseEvent): string | undefined => {
    const board = host.current;
    const skin = layer.current;
    if (!board || !skin) return undefined;
    for (const el of document.elementsFromPoint(event.clientX, event.clientY)) {
      if (el === skin || skin.contains(el)) continue;
      if (!board.contains(el)) continue;
      return drawnSidAtElement(el, board);
    }
    return undefined;
  };

  /**
   * Hand the board back to the reader, with a caret in it.
   *
   * Entering the text is a **decision** rather than a click — this layer swallowed the double-click
   * that would have placed the caret — so the caret has to be asked for, and the board has to be
   * given the focus that a click would have given it. Measured without both: the mode changed, the
   * outline went dashed, and typing did nothing at all.
   */
  const enterText = (sid: string) => {
    setEditing(sid);
    onEnterText(sid);
    const board = host.current;
    const run = firstRunIn(doc(), sid);
    if (!board || !run) return;

    board.closest('[contenteditable]')?.querySelector;
    const editable = board.querySelector<HTMLElement>('[contenteditable="true"]') ??
      (board.closest('[contenteditable="true"]') as HTMLElement | null);
    editable?.focus();

    (editor as never as { updateSelection?: (selection: unknown) => void }).updateSelection?.({
      type: 'range',
      startNodeId: run,
      startOffset: 0,
      endNodeId: run,
      endOffset: 0,
      collapsed: true
    });
  };

  /**
   * Which block's words are being typed in — the one thing the overlay had no way to show.
   *
   * Entering the text **clears the node selection**, and rightly: the reader is in the words now,
   * and a builder that kept the block selected as well is one where Delete means two things at once.
   * The consequence was that the marks had nothing to draw, so a reader in text mode saw *nothing at
   * all* on the board — no outline, no name, no way to tell an editable page from a preview.
   *
   * So the block is remembered here rather than read from the selection, and let go the moment the
   * mode does.
   */
  const [editing, setEditing] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (mode !== 'text') setEditing(undefined);
  }, [mode]);
  const editingBox = mode === 'text' && editing ? boxOf(editing) : undefined;
  const boundBox = bound ? boxOf(bound.sid) : undefined;

  const boxes = selected
    .map((sid) => ({ sid, box: boxOf(sid) }))
    .filter((one): one is { sid: string; box: NonNullable<ReturnType<typeof boxOf>> } => !!one.box);
  const hovered = hover && !selected.includes(hover) ? boxOf(hover) : undefined;

  /**
   * **The space inside the block**, drawn — its padding and the gaps between what it holds.
   *
   * ## Why this rather than a ruler
   *
   * A reader asked for one, and a ruler is the wrong instrument for a page. Word's measures margins
   * and indents and a slide's measures x and y, and in both the number under the ruler is a number
   * the reader **sets**. A page is a flow: nothing here has a coordinate, and a block's position is
   * what its parent's stacking, gap, padding and order come out as. A ruler along the top would be
   * measuring numbers a reader cannot type anywhere.
   *
   * The two numbers they *can* type are these, and neither is visible: a section is 112 above and 48
   * below and there is nothing on the page that says so, and the 64 between two cards looks exactly
   * like the 40 between two others. So the padding and the gaps are drawn on the block that is
   * selected, which is what Figma and Webflow both do and for the same reason.
   *
   * ## Read from the drawing, not from the document
   *
   * `getComputedStyle`, because that is what the reader is looking at: an override at this width, a
   * fallback the renderer chose, a `gap` the grid resolved — all of them are already in the number
   * the browser used, and none of them is in the attribute. It also means the bands are right for a
   * block whose padding is not set at all, which is the case a reader most wants to see.
   *
   * One block only, and only in select mode. Four bands and six gaps on each of three selected
   * sections is not a measurement, it is a pattern.
   */
  const inside = useMemo(() => {
    if (mode !== 'select' || boxes.length !== 1) return undefined;
    const board = host.current;
    if (!board) return undefined;
    const el = board.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(boxes[0].sid)}"]`);
    if (!el) return undefined;

    const scale = scaleOf(board);
    const frame = el.getBoundingClientRect();
    const said = getComputedStyle(el);
    const at = (value: string) => Math.round(Number.parseFloat(value) || 0);

    const pad = {
      top: at(said.paddingTop),
      right: at(said.paddingRight),
      bottom: at(said.paddingBottom),
      left: at(said.paddingLeft)
    };

    /*
     * The gap **between drawn children**, measured rather than taken from `gap`: a grid's rows and a
     * flex line's wrap both produce spaces the one declared number does not describe, and a child
     * that is `position: absolute` produces none at all.
     */
    const gaps: {
      left: number;
      top: number;
      width: number;
      height: number;
      said: number;
      /** Which way pulling it grows the gap — a column's gaps are pulled down, a row's across. */
      way: 'down' | 'across';
    }[] = [];
    const kids = [...el.children]
      .filter((kid): kid is HTMLElement => kid instanceof HTMLElement && kid.offsetParent !== null)
      .map((kid) => kid.getBoundingClientRect());
    for (let i = 1; i < kids.length; i++) {
      const a = kids[i - 1];
      const b = kids[i];
      const down = Math.round((b.top - a.bottom) / scale);
      const across = Math.round((b.left - a.right) / scale);
      if (down > 0 && b.top >= a.bottom) {
        gaps.push({
          left: Math.round((Math.max(a.left, b.left) - frame.left) / scale),
          top: Math.round((a.bottom - frame.top) / scale),
          width: Math.round((Math.min(a.right, b.right) - Math.max(a.left, b.left)) / scale),
          height: down,
          said: down,
          way: 'down'
        });
      } else if (across > 0 && b.left >= a.right) {
        gaps.push({
          left: Math.round((a.right - frame.left) / scale),
          top: Math.round((Math.max(a.top, b.top) - frame.top) / scale),
          width: across,
          height: Math.round((Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / scale),
          said: across,
          way: 'across'
        });
      }
    }

    const width = Math.round(frame.width / scale);
    const height = Math.round(frame.height / scale);
    return { pad, gaps, width, height };
    // `revision` and the boxes: the drawing moved, so the spaces inside it may have.
  }, [mode, boxes.length, boxes[0]?.sid, host, revision, boxes[0]?.box?.width, boxes[0]?.box?.height]);

  return (
    <div
      ref={layer}
      className="st-overlay"
      data-mode={mode}
      // Where letting go would put it, on the drawing — so a test can ask what a reader can see.
      data-landing={landing ? String(landing.index) : undefined}
      /*
       * `--st-zoom` is **the plane's**, not this layer's — see `canvas.tsx`.
       *
       * Everything drawn here is inside the scaled plane and so is scaled with the page: at 40% a
       * selection outline is 0.4 of a pixel and the name chip is unreadable, which is the opposite of
       * what a marker is for. `calc(1px / var(--st-zoom))` is how a constant on-screen size is said in
       * CSS, and the number is set once where the scale actually lives and inherited by all three
       * boards. Set here it was a React prop, and a custom property that arrives through React is a
       * re-render of every overlay for something the browser could have inherited.
       */
      style={
        {
          // In text mode the board is an ordinary editor again, and this draws without taking anything.
          pointerEvents: mode === 'select' ? 'auto' : 'none'
        } as React.CSSProperties
      }
      /*
       * The hover shows **what a click would select**, which is the outermost block — not the run of
       * text the pointer happens to be over. A badge that named the run said `inline-text`, which is
       * the engine talking to a reader.
       */
      onPointerMove={(event) => {
        if (sweep) {
          const at = pointIn(event);
          if (at) setSweep({ ...sweep, to: at });
          return;
        }
        const carry = held.current;
        if (carry) {
          const far = Math.abs(event.clientX - carry.x) + Math.abs(event.clientY - carry.y) > 4;
          if (far) carry.carrying = true;
          if (carry.carrying) {
            setHover(undefined);
            /*
             * A block that places itself is **moved**, not landed: there is no stack to put it into
             * and no line to draw between two of its siblings. The drawing follows the pointer and
             * the document hears about it once, on release.
             */
            /**
             * **⌘ lifts a block out of the flow**, mid-drag.
             *
             * Placing a block freely was three steps down a panel — select, find 위치, set 방식 — and
             * placement is the thing a page most needs to be interesting. Every tool of this kind has
             * a gesture for it: Figma has *drag out of auto layout*, and this is the same idea said
             * with a modifier, because a page's stacks fill the board and there is nowhere to drag
             * *out* to.
             *
             * Decided during the drag rather than at the press, so the reader can change their mind
             * with the block already moving: let go without it and the block lands between two
             * siblings as it always has.
             *
             * Alt is taken — it turns the snap off — so ⌘, which on this canvas already means *past
             * the ordinary rule*.
             */
            if (!carry.free && (event.metaKey || event.ctrlKey)) {
              const lifted = freeAt(carry.sid, true);
              if (lifted) {
                carry.free = lifted;
                setLanding(null);
              }
            }
            if (carry.free) {
              const scale = scaleOf(host.current!);
              // A block still in the flow has to be told it is out of it, or the inline coordinates
              // it is being dragged by mean nothing.
              if (carry.free.lift) carry.free.el.style.setProperty('position', 'absolute');
              let acrossX = (event.clientX - carry.x) / scale;
              let acrossY = (event.clientY - carry.y) / scale;

              /**
               * **Lined up, unless the reader says otherwise.**
               *
               * Three lines are offered per axis — the block's two edges and its middle — against the
               * parent's edges and centre and every sibling's. The *smallest* correction inside the
               * threshold wins, so a block near two lines catches the nearer one rather than
               * whichever was checked first.
               *
               * Alt turns it off, which is the shortcut every tool of this kind uses and the one a
               * reader reaches for when they mean a number that is not round.
               */
              const caught: { x: number[]; y: number[] } = { x: [], y: [] };
              if (!event.altKey) {
                const { from, lines } = carry.free;
                const pull = (
                  at: number,
                  size: number,
                  across: number,
                  candidates: number[]
                ): { across: number; lines: number[] } => {
                  let best: { by: number; line: number } | undefined;
                  for (const edge of [at + across, at + across + size / 2, at + across + size]) {
                    for (const line of candidates) {
                      const by = line - edge;
                      if (Math.abs(by) > SNAP) continue;
                      if (!best || Math.abs(by) < Math.abs(best.by)) best = { by, line };
                    }
                  }
                  return best ? { across: across + best.by, lines: [best.line] } : { across, lines: [] };
                };
                const alongX = pull(from.left, from.width, acrossX, lines.x);
                const alongY = pull(from.top, from.height, acrossY, lines.y);
                acrossX = alongX.across;
                acrossY = alongY.across;
                caught.x = alongX.lines;
                caught.y = alongY.lines;
              }
              setGuides(caught);

              const moved: Record<string, number> = {};
              for (const side of carry.free.sides) {
                // Right and bottom are measured **inward**, so the pointer moves them the other way.
                const travelled =
                  side === 'left' ? acrossX : side === 'right' ? -acrossX : side === 'top' ? acrossY : -acrossY;
                moved[side] = Math.round(carry.free.was[side] + travelled);
                carry.free.el.style.setProperty(side, `${moved[side]}px`);
              }
              carry.free.moved = moved;
              return;
            }
            setLanding(landingAt(event, carry.sid));
            return;
          }
        }
        setHover(childOfScope(doc(), hit(event), page, scope));
      }}
      onPointerUp={(event) => {
        if (sweep) {
          setSweep(null);
          (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
          const box = {
            left: Math.min(sweep.from.x, sweep.to.x),
            top: Math.min(sweep.from.y, sweep.to.y),
            right: Math.max(sweep.from.x, sweep.to.x),
            bottom: Math.max(sweep.from.y, sweep.to.y)
          };
          // A press that did not move is a press, not a sweep: a Shift-click toggles, and a press on
          // the page's own margin has already cleared.
          if (box.right - box.left < 4 && box.bottom - box.top < 4) {
            if (sweep.toggle) {
              select(
                selected.includes(sweep.toggle)
                  ? selected.filter((one) => one !== sweep.toggle)
                  : [...selected, sweep.toggle]
              );
            }
            return;
          }
          const caught = sweptIn(box);
          select(sweep.add ? [...new Set([...selected, ...caught])] : caught);
          return;
        }
        const carry = held.current;
        held.current = null;
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
        setGuides({ x: [], y: [] });
        if (carry?.carrying && carry.free) {
          const { sides, moved, was, restore } = carry.free;
          // Back to what the renderer had, so the document's own value is what draws — see
          // `holdStyle` for why this is a restore rather than a remove.
          restore();
          setLanding(null);
          if (!moved || (!carry.free.lift && sides.every((side) => moved[side] === was[side]))) return;
          void (editor as never as { executeCommand?: (n: string, p?: unknown) => Promise<unknown> }).executeCommand?.(
            'setBlockFormat',
            {
              nodeIds: [carry.sid],
              /**
               * **A lift writes the base; a move writes the width being looked at.**
               *
               * A block that is absolute at one width and in the flow at another is a document two
               * people would read two ways, and it is never what a lift means. So the placement goes
               * to the base — and so do the coordinates it arrives with, because an override with no
               * base underneath it is a block with nowhere to be at every other width.
               *
               * Every drag *after* that is a move, and a move is per width like every other length
               * here: a badge sits somewhere else on a phone.
               */
              at: carry.free.lift ? undefined : breakpoint,
              /**
               * And a lift **freezes the size**, which is what taking a block out of a stack means.
               *
               * A stacked block's width is the stack's decision — `fill` takes whatever it is given.
               * Left on, a block at coordinates goes on stretching to its parent, so its width handle
               * writes a `maxWidth` it never reaches and the handle is a control that draws nothing.
               * Measured: pulling the left edge of a lifted band 78px moved it and did not widen it.
               *
               * So it keeps the size it had at the moment it left, which is also the only size that
               * does not make it jump. Every tool of this kind does the same on the same gesture.
               */
              ...(carry.free.lift
                ? {
                    position: 'absolute',
                    sizing: 'fixed',
                    maxWidth: Math.round(carry.free.from.width * 15),
                    minWidth: Math.round(carry.free.from.width * 15),
                    minHeight: Math.round(carry.free.from.height * 15)
                  }
                : {}),
              // **Twips**, which is what the document keeps; the board is in CSS pixels.
              ...Object.fromEntries(
                sides.map((side) => [
                  `inset${side[0].toUpperCase()}${side.slice(1)}`,
                  Math.round(moved[side] * 15)
                ])
              )
            }
          );
          return;
        }
        if (!carry?.carrying || !landing) {
          setLanding(null);
          return;
        }
        (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
          'moveBlockInto',
          { nodeId: carry.sid, parentId: landing.parentId, index: landing.index }
        );
        setLanding(null);
      }}
      onPointerLeave={() => setHover(undefined)}
      /**
       * **The gesture every builder has**, and this had none of.
       *
       * A press of the right button on a block selects it — unless it is already in the selection,
       * which is the rule every tool follows and the one that makes *right-click three things and
       * delete them* work at all. Then the menu opens where the pointer is.
       *
       * The list is the product's (`SITE_CONTEXT`), not this file's: a menu written into a component
       * is a menu no check can read, and `every-command-can-be-reached` asks the product.
       */
      onContextMenu={(event) => {
        if (mode !== 'select') return;
        event.preventDefault();
        const outer = childOfScope(doc(), hit(event), page, scope);
        if (outer && !selected.includes(outer)) select([outer]);
        setContext({ x: event.clientX, y: event.clientY });
      }}
      onPointerDown={(event) => {
        if (mode !== 'select') return;
        /**
         * **Only the primary button selects.**
         *
         * Reported as *멀티 선택 한 다음에는 context menu 를 띄우지 못해, 선택이 풀려버림*, and this
         * one line is the whole of it: a press of the right button is a `pointerdown` like any other,
         * so this ran first and did what a press does — resolved the block under the pointer and made
         * it the selection — and `onContextMenu`, which is careful to *keep* a selection the pointer
         * is already inside, arrived to find a selection of one.
         *
         * The middle button is the plane's, and it belongs to the canvas rather than to this layer.
         */
        if (event.button !== 0) return;
        // Any new press answers the last one, so the note about bound words goes with it.
        setBound(undefined);
        /*
         * The second press of a double-click is not a click.
         *
         * A double-click is `pointerdown, click, pointerdown, click, dblclick` — so this handler ran
         * again *before* the drill, put the selection back to the outermost block, and the drill
         * started over from the top. Measured as a double-click that could never reach a heading's
         * text however many times it was tried. `detail` is the browser's own count of the run.
         */
        if (event.detail > 1) return;
        const sid = hit(event);
        const outer = childOfScope(doc(), sid, page, scope);
        // What a drag would carry, remembered before anything is selected: a reader who presses on a
        // block and moves is moving *that* block, whatever the press did to the selection.
        /**
         * **What a drag carries is what is selected**, when the press is inside it.
         *
         * A press resolves to the outermost block, which is right for *selecting* — a reader
         * clicking a card means the card, not the word in it. It is wrong for *dragging*: a reader
         * who has drilled down to a badge, seen it selected, and put the pointer on it is moving the
         * badge. This carried the outermost block instead, so the first free drag ever tried picked
         * up the whole section and dropped it somewhere else.
         *
         * Every design tool works this way and this is that rule: the selection wins inside itself.
         */
        const inSelection = selected.find((one) => one === sid || isInside(doc(), sid, one));
        const carried = inSelection ?? outer;
        held.current = carried
          ? { sid: carried, x: event.clientX, y: event.clientY, carrying: false, free: freeAt(carried) }
          : null;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

        /*
         * Nothing under the pointer: the reader pressed the page's own margin, which means *none* —
         * and leaves whatever they had entered, because that is where they just pressed.
         *
         * And it is where a **sweep** begins. A press that does not move is still a press on nothing,
         * so the selection is cleared here and the sweep only replaces it once it has a rectangle:
         * clearing on release instead would make a click on the margin flicker.
         */
        if (!outer) {
          onScope(page);
          if (!event.shiftKey) select([]);
          const at = pointIn(event);
          if (at) setSweep({ from: at, to: at, add: event.shiftKey });
          return;
        }
        /**
         * **⌘ (or Ctrl) reaches all the way in**, in one press.
         *
         * A click selects the outermost block and a double-click goes one level further, which is
         * the rule every tool of this kind follows and is right — a reader dragging a section must
         * not get a word inside it. The cost is depth: a real section is a band that carries the
         * colour with a column inside it that carries the words, so a card is four levels down and
         * reaching it is four gestures.
         *
         * Every design tool answers this the same way and this is that answer. The scope moves to
         * the block's parent as well, so the next double-click on words is the caret rather than
         * another step down — a reader who asked for the deepest thing has said where they are.
         */
        if ((event.metaKey || event.ctrlKey) && !event.shiftKey) {
          const deepest = innermostOf(doc(), sid, page) ?? outer;
          onScope(enclosing(doc(), deepest, page) ?? page);
          select([deepest]);
          held.current = { sid: deepest, x: event.clientX, y: event.clientY, carrying: false, free: freeAt(deepest) };
          return;
        }

        /**
         * **Shift adds and removes** — a selection is a set, and three cards told to fill is one
         * gesture where doing it a card at a time is the reader keeping the editor's books.
         *
         * And **Shift held while dragging sweeps**, which is the same sentence at a different scale:
         * *add what I am pointing at*, said about a rectangle rather than about a block. It has to
         * live here rather than on the page's own margin, because on a real page there is no margin —
         * the boards are exactly the page, and every point in one resolves to some block. Measured:
         * the sweep as first built could not be started anywhere on the sample.
         *
         * The toggle is what happens when the rectangle turns out to be nothing, so a Shift-click is
         * still a Shift-click: one press, two readings, settled on release by whether the hand moved.
         */
        if (event.shiftKey) {
          const at = pointIn(event);
          if (at) setSweep({ from: at, to: at, add: true, toggle: outer });
          return;
        }
        select([outer]);
      }}
      onDoubleClick={(event) => {
        if (mode !== 'select') return;
        const sid = hit(event);
        const here = childOfScope(doc(), sid, page, scope);
        if (!here) return;

        // Step into it, and select what is inside it under the pointer.
        const deeper = childOfScope(doc(), sid, page, here) ?? here;
        onScope(deeper === here ? scope : here);
        select([deeper]);
        /*
         * A double-click on words means the caret — the thing a document would have given
         * immediately — and on anything else it means one level further in. So the same gesture
         * reaches a heading's text and a card's inside, and a reader never has to know which.
         *
         * Compared against the **innermost block**, not the raw hit: the pointer is over a run of
         * text, and a run is never a thing that gets selected, so `deeper === sid` was never true
         * over a heading and the caret could not be reached at all.
         */
        const deepest = innermostOf(doc(), sid, page);
        if (deeper === deepest && isTextual(doc(), deepest)) {
          /*
           * Unless the words are not the block's to give.
           *
           * A part of a card whose text is bound draws what its placement says — the row's title, the
           * row's price — and the definition's own words are the fallback nobody sees. So a reader
           * who typed here would watch the data overwrite them a frame later: not an error, not a
           * refusal, just a change that does not survive. Every tool that binds text refuses the
           * caret and says where the words come from, and this is that.
           */
          const bound = boundVarOf(doc() as never, deepest);
          if (bound) {
            setBound({ sid: deepest, said: bound });
            return;
          }
          enterText(deepest);
          return;
        }

        /*
         * A **code block** answers the same gesture with an editor of its own.
         *
         * The caret never enters one — it is drawn `contenteditable="false"` with Prism's token
         * spans in it — so the double-click that means *the caret* everywhere else has to mean
         * something here, and the honest something is: open the thing that can edit code.
         */
        if (isCode(doc() as never, deeper)) {
          const drawn = host.current?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(deeper)}"]`);
          const box = drawn?.getBoundingClientRect();
          if (box) {
            onEditCode?.(deeper, {
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height
            });
          }
          return;
        }

        // A placement: open what it draws, which is the only place left to go.
        const node = doc().getNode(deeper);
        if (node?.stype === 'instance' && typeof node.attributes?.componentId === 'string') {
          onEditComponent?.(node.attributes.componentId);
          return;
        }

        /*
         * And a **list**: open the card it draws, against the row that was pointed at.
         *
         * A list's rows are resolved at draw time, so the chain of document nodes stops at the list
         * itself — `documentSidOf` collapses everything after the first `~` — and a double-click on
         * a product had nowhere further to go and did nothing at all. Which is exactly what it looked
         * like from outside: *더블클릭 해도 편집모드가 되지 않아*.
         *
         * The row is in the sid the pointer landed on. It is carried because a card designed against
         * `상품` and `0원` is a card designed against nothing: every real title is longer and the
         * description that breaks the layout is in the data.
         */
        if (node?.stype === 'collection') {
          const template = templateOf(doc() as never, node as never);
          const componentId = (template?.attributes as Record<string, unknown> | undefined)?.componentId;
          if (typeof componentId === 'string' && componentId) {
            /*
             * The row, asked of the **drawing** rather than of the document.
             *
             * `sidAtElement` collapses `${owner}~${part}` to the owner, which is right for every
             * other question here — a part of a placement is not something anybody edits — and it is
             * exactly what throws the row number away. Measured: a double-click on the second
             * product opened the card showing the first.
             */
            const index = rowIndexOf(drawnHit(event)) ?? 0;
            onEditComponent?.(componentId, { collection: deeper, index });
          }
        }
      }}
    >
      {/**
       * The lines a free drag caught, drawn the full height and width of the board.
       *
       * A hairline rather than a box, and in the tool's accent rather than the selection's colour,
       * because it is the tool saying *this is what you are lined up with* — the same distinction the
       * caret makes. They come and go with the drag and are never in the way of a press: the whole
       * layer is `pointer-events: none` while one is in flight.
       */}
      {guides.x.map((at) => (
        <div key={`x${at}`} className="st-mark st-mark-guide" style={{ left: `${at}px`, top: 0, width: 0, height: '100%' }} aria-hidden />
      ))}
      {guides.y.map((at) => (
        <div key={`y${at}`} className="st-mark st-mark-guide" style={{ left: 0, top: `${at}px`, width: '100%', height: 0 }} aria-hidden />
      ))}

      {context ? (
        /**
         * **The menu is `office-ui`'s**, which is where a menu at a point already lived.
         *
         * This file had its own, and the comment above it claimed it was *"drawn outside the zoomed
         * plane"*. It was not: it is written inside the overlay, the overlay is inside the plane, and
         * the plane carries a `transform` — which makes it the containing block for a `position:
         * fixed` descendant **and** scales it. So both halves of what was reported are the one fault:
         * *항상 데스크탑에서만 뜨고 있어* (the plane's origin is the leftmost board's corner) and
         * *마우스 커서 위치에 애초에 안 뜨는구만* (client coordinates read against the plane's box, at
         * the plane's zoom).
         *
         * `Menu` portals into the body, so no ancestor's transform, clip or scroll can reach it — the
         * reason its own header gives for the portal, measured on a deck where a menu near the bottom
         * corner was cut away. It also flips at the window's edge and walks with the arrow keys,
         * neither of which this had.
         *
         * Two answers to one question, again, and this one had drifted into being the wrong answer.
         */
        <Menu
          at={context}
          label="블록"
          blocks={SITE_CONTEXT.map((block) => ({
            id: block.id,
            items: block.items.map((one) => ({
              id: one.command!,
              label: one.label,
              hint: one.hint,
              disabled: !(
                (editor as never as {
                  canExecuteCommand?: (n: string, p?: unknown) => boolean;
                }).canExecuteCommand?.(one.command!, {
                  nodeIds: selected,
                  ...(one.needs === 'page' ? { nodeId: page, pageId: page } : {})
                }) ?? false
              )
            }))
          }))}
          onClose={() => setContext(null)}
          onPick={(command) => {
            const one = SITE_CONTEXT.flatMap((block) => block.items).find(
              (each) => each.command === command
            );
            /*
             * **Closed first, then run.** A command re-renders the boards, and a `setContext` queued
             * behind one was measured landing on a component the render had already replaced — the
             * menu stayed open over the thing it had just changed. Closing is this layer's own state
             * and owes the command nothing.
             */
            setContext(null);
            void (editor as never as {
              executeCommand?: (n: string, p?: unknown) => void;
            }).executeCommand?.(command, {
              nodeIds: selected,
              ...(one?.needs === 'page' ? { nodeId: page, pageId: page } : {})
            });
          }}
        />
      ) : null}

      {sweep ? (
        /*
         * The rectangle itself, drawn while it is being swept. A gesture with no rectangle on screen
         * is a gesture a reader cannot aim: they would be sweeping and finding out afterwards.
         */
        <div
          className="st-mark st-mark-sweep"
          data-sweep
          style={boxStyle({
            left: Math.min(sweep.from.x, sweep.to.x),
            top: Math.min(sweep.from.y, sweep.to.y),
            width: Math.abs(sweep.to.x - sweep.from.x),
            height: Math.abs(sweep.to.y - sweep.from.y)
          })}
          aria-hidden
        />
      ) : null}

      {landing ? (
        /*
         * Where it would land, drawn rather than guessed at. Every tool of this kind draws this line
         * and the reason is the same one that made `reorderIndexAt` a function in the model: an
         * off-by-one is a drag that reorders backwards, and a reader can only see that it did.
         */
        <div className="st-mark st-mark-landing" style={boxStyle(landing.line)} aria-hidden />
      ) : null}

      {hovered ? (
        <div
          className="st-mark st-mark-hover"
          data-component={doc().getNode(hover!)?.stype === 'instance' ? 'true' : undefined}
          style={boxStyle(hovered)}
          aria-hidden
        >
          <span className="st-mark-name">{labelOfBlock(doc(), hover!)}</span>
        </div>
      ) : null}

      {boundBox ? (
        /*
         * Words that came from the data, said where the reader asked for a caret.
         *
         * The variable's name rather than a refusal, because the reader's next question is *then
         * where do I change it* — and the answer is the data panel, which is the one place those
         * words exist.
         */
        <div className="st-mark st-mark-bound" style={boxStyle(boundBox)} aria-hidden>
          <span className="st-mark-name">데이터에서 옴 · {bound!.said} · 데이터에서 고치세요</span>
        </div>
      ) : null}

      {editingBox ? (
        /*
         * The words being typed in, and the way out.
         *
         * A dashed edge rather than a solid one, because it is not a selection — nothing is
         * selected — and the chip says the gesture rather than the name: a reader who got in here by
         * double-clicking twice needs to be told there is one key that leaves.
         */
        <div className="st-mark st-mark-editing" style={boxStyle(editingBox)} aria-hidden>
          <span className="st-mark-name">텍스트 편집 · Esc</span>
        </div>
      ) : null}

      {boxes.map(({ sid, box }) => {
        /*
         * Whether this block owns all four of its edges. Read from the document rather than from the
         * drawing: `position` is what the reader said, and a block inside a positioned ancestor is
         * not itself positioned.
         */
        const freeSides = doc().getNode(sid)?.attributes?.position === 'absolute';
        return (
        <div
          key={sid}
          className="st-mark st-mark-selected"
          data-selected={sid}
          /*
           * **That this is a placement of a component**, said in the drawing so the stylesheet can
           * colour it. Asked for as *컴포넌트를 좀 더 강조하면 좋을 듯* — and it is worth more than
           * emphasis: a reader editing a placement is editing one of many, and the moment they cannot
           * tell is the moment they change every page at once by accident.
           */
          data-component={doc().getNode(sid)?.stype === 'instance' ? 'true' : undefined}
          data-editing={mode === 'text' ? 'true' : undefined}
          style={boxStyle(box)}
          aria-hidden
        >
          <span className="st-mark-name">
            {/**
             * **Which way it stacks, beside its name.**
             *
             * `labelOfBlock` already says 가로 스택 / 세로 스택 / 그리드 — but only for a block with no
             * name of its own, and every band on a real page has one. So the moment a reader names
             * something the one fact they most need while looking at it disappears, which is what
             * *어떤 방향인지 아니깐* is asking for.
             *
             * A drawn icon rather than a word: the chip is already carrying a name and a mode, and
             * three more characters on it is a chip nobody reads.
             */}
            {(() => {
              /*
               * A **placement** says so first: it is the one thing on the chip a reader has to know
               * before they touch anything, because editing a placement edits every page it is on.
               * The arrangement icon is the other case, and a placement has no arrangement of its
               * own — it draws whatever its definition arranges.
               */
              const node = doc().getNode(sid);
              if (node?.stype === 'instance') return <Icon name="component" size={11} />;
              const how = String(node?.attributes?.layoutMode ?? '');
              const which =
                how === 'row' ? 'frame-row' : how === 'grid' ? 'frame-grid' : how === 'column' ? 'frame-column' : undefined;
              return which ? <Icon name={which as never} size={11} /> : null;
            })()}
            {labelOfBlock(doc(), sid)}
            {mode === 'text' ? ' · 편집 중' : ''}
          </span>

          {/*
            The space inside, and the number on it where there is room for one.
            
            A band rather than a line, because what a reader is looking for is *how much* and not
            *where the edge is* — the edge is the outline they are already looking at. The number is
            counter-scaled like the name chip so it stays readable at 40%, and it is left out of a
            band under about 24 pixels, where a number is a smudge rather than a fact.
          */}
          {inside
            ? (['top', 'right', 'bottom', 'left'] as const)
                /*
                 * **Every side, drawn or not** — because a band with nothing in it is the one a
                 * reader most wants to pull. It was `> 0`, so a section with no padding had no band,
                 * and the gesture that gives it one had nowhere to start.
                 *
                 * A zero band is drawn as a hairline rather than as nothing: `st-inset` paints its
                 * area, and an area of no height is invisible however it is painted.
                 */
                .map((side) => (
                  <span
                    key={side}
                    className="st-inset"
                    data-inset={side}
                    data-empty={inside.pad[side] === 0 ? 'true' : undefined}
                    /**
                     * **A strip along the edge**, not the whole band.
                     *
                     * The band is drawn at its full depth — that is the measurement, and the number
                     * sits in it — but only the outer ~10 pixels take the pointer. A section's top
                     * padding is often 96, and a band that deep swallows every press in the top
                     * quarter of the block: dragging a card out of a row started `+8, +8` into the
                     * row and got the row's own padding instead, which is the drag this broke the
                     * first time it took the pointer at all.
                     *
                     * Ten pixels is what a window's resize edge is, and the same reason: wide enough
                     * to hit without aiming, narrow enough that everything else still gets its press.
                     */
                    data-grip={inside.pad[side] >= 4 ? 'true' : undefined}
                    style={
                      {
                        ...(side === 'top'
                          ? { left: 0, top: 0, width: inside.width, height: Math.max(inside.pad.top, 3) }
                          : side === 'bottom'
                            ? { left: 0, top: inside.height - Math.max(inside.pad.bottom, 3), width: inside.width, height: Math.max(inside.pad.bottom, 3) }
                            : side === 'left'
                              ? { left: 0, top: inside.pad.top, width: Math.max(inside.pad.left, 3), height: inside.height - inside.pad.top - inside.pad.bottom }
                              : { left: inside.width - Math.max(inside.pad.right, 3), top: inside.pad.top, width: Math.max(inside.pad.right, 3), height: inside.height - inside.pad.top - inside.pad.bottom }),
                        // The strip that takes the pointer, as a fraction of the band — read by the
                        // stylesheet's `::after`, which is the part that is actually pressable.
                        ['--st-grip' as string]: `${Math.min(10, Math.max(inside.pad[side], 3))}px`
                      } as React.CSSProperties
                    }
                    /**
                     * **And it can be pulled**, which is the gesture Figma has here and this had a
                     * readout of.
                     *
                     * The number in the panel is where a padding was changed, and a reader looking at
                     * the band had to look away to change the thing they were looking at. The whole
                     * argument for drawing the band is that *how much* is the question; answering it
                     * and then sending them elsewhere to act is half a tool.
                     *
                     * Written **once, on release**. Word learned this on its ruler: writing on every
                     * pointer move made one drag into ten entries of the document's history, and a
                     * reader's undo then walked back through positions the box was never meant to be
                     * in. So the drag moves the *drawing* — a CSS variable the band and the block
                     * both read — and the document hears about it when the pointer comes up.
                     */
                    onPointerDown={(event) => {
                      if (mode !== 'select') return;
                      event.preventDefault();
                      event.stopPropagation();

                      const board = host.current;
                      const el = board?.querySelector<HTMLElement>(
                        `[data-bc-sid="${CSS.escape(sid)}"]`
                      );
                      if (!board || !el) return;

                      const scale = scaleOf(board);
                      const from = side === 'top' || side === 'bottom' ? event.clientY : event.clientX;
                      const was = inside.pad[side];
                      /**
                       * Which way makes it **bigger**, and it is the same way on all four.
                       *
                       * A padding band is drawn *inside* the block, so its far edge is the one that
                       * moves: pulling the bottom band **up** grows the bottom padding, and pulling
                       * the top band **down** grows the top. Measured with the opposite sign first
                       * and the drag wrote a 0 — a bottom band pulled down came out as *less*, and
                       * less than none is none.
                       *
                       * So `top` and `left` follow the pointer and `bottom` and `right` oppose it,
                       * which is what every inspector's inside-the-box handle does.
                       */
                      const way = side === 'bottom' || side === 'right' ? -1 : 1;
                      const attr = `padding${side[0].toUpperCase()}${side.slice(1)}`;
                      let now = was;
                      const restore = holdStyle(el, [`padding-${side}`]);

                      const onMove = (move: PointerEvent) => {
                        const travelled = ((side === 'top' || side === 'bottom' ? move.clientY : move.clientX) - from) / scale;
                        now = Math.max(0, Math.round(was + travelled * way));
                        el.style.setProperty(`padding-${side}`, `${now}px`);
                      };

                      const onUp = () => {
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
        /*
                         * Back to what the renderer had before the command runs, so the document's own
                         * value is what draws: leaving the dragged number on would paint the block at
                         * it for ever, and *removing* the property would delete the rendered value —
                         * see `holdStyle` for the drag that found that.
                         */
                        restore();
                        if (now === was) return;
                        /*
                         * **Twips**, which is what the document keeps and the band is not: the band
                         * is read out of `getComputedStyle`, so it is CSS pixels, and the panel's
                         * own field multiplies by 15 on its way in for the same reason. Written in
                         * pixels the first time, and the document took a padding of 0 — a number so
                         * small in twips that it rounds to nothing on the way back out.
                         */
                        /*
                         * **And at the width being looked at**, which this did not say — so a pull
                         * on the tablet or the phone board wrote the *base* padding, the width's own
                         * override immediately drew over it, and the band snapped back to where it
                         * started. A drag that appears to do nothing, on two of the three boards.
                         *
                         * The resize handles a hundred lines down already said it. This is the same
                         * fact: a number pulled on a board is a number for **that** board.
                         */
                        void editor.executeCommand('setBlockFormat', {
                          nodeIds: [sid],
                          at: breakpoint,
                          [attr]: Math.round(now * 15)
                        });
                      };

                      window.addEventListener('pointermove', onMove);
                      window.addEventListener('pointerup', onUp);
                    }}
                  >
                    {inside.pad[side] >= 24 ? <em>{inside.pad[side]}</em> : null}
                  </span>
                ))
            : null}

          {/**
            * **The handles**, which is the gesture a builder is expected to have and this had a
            * number field for.
            *
            * ## Why two, and not eight
            *
            * A page is a **flow**. A block has no x and no y — where it sits is a parent and a place
            * in that parent's content — so seven of the eight handles a canvas has would be lying
            * about what they do: dragging a top edge cannot move a block up, because nothing is
            * holding it at a height. What is genuinely resizable is how wide it may be and how tall
            * it must be, and those are the right edge and the bottom one.
            *
            * ## What each writes, which is not the same attribute
            *
            * The **right** edge writes `maxWidth` — how wide this block may become — and `minWidth`
            * as well when the block is `fixed`, because a fixed block takes its width from the pair
            * and writing one of them leaves the drag half-applied.
            *
            * The **bottom** writes `minHeight` and deliberately not `maxHeight`: a maximum height
            * clips what is inside, and a reader pulling a box taller means *at least this tall*, not
            * *never more than this*. `sizing.ts` argues why the height is a pair in the first place.
            *
            * ## And the drag is the padding band's drag
            *
            * Written once, on release, with the drawing moved in between — Word learned that on its
            * ruler and this file learned it again on the bands: writing on every pointer move makes
            * one drag into ten entries of the document's history, and a reader's undo then walks back
            * through sizes the box was never meant to be.
            */}
          {/**
           * **And the size, whenever something is held** — not only while it is being pulled.
           *
           * Reported as *여전히 객체 resize 가 어떻게 동작하는지 모르겠어*, and the readout is half the
           * answer: a reader could not see what a block measured until they had already started
           * changing it, so there was nothing to compare a pull against and no way to tell a block
           * that fills its stack from one that was set to exactly that width. Every design tool
           * draws this under the selection the whole time it is selected.
           *
           * The drag's own number wins while there is one — it is the *live* size and this is the
           * settled one — and only one block's is drawn, because six chips over six selected cards
           * is six numbers a reader has to match up to boxes by eye. Left out under about 32 pixels,
           * where the chip is wider than the thing it measures.
           */}
          {sizing ? (
            <span className="st-mark-size">{sizing}</span>
          ) : mode === 'select' && boxes.length === 1 && box.width >= 32 && box.height >= 32 ? (
            <span className="st-mark-size" data-settled="true">
              {Math.round(box.width)} × {Math.round(box.height)}
            </span>
          ) : null}
          {/**
           * **A plus at each end of the flow**, which is the gesture a page has and a canvas does not.
           *
           * Asked as *선택상자에서 객체 추가 버튼은 왜 없어? (위,아래,왼쪽,오른쪽)* — and the answer is
           * **two**, not four, because only two of the four are true at a time. A block in a column
           * has a place above it and a place below it; left and right of it there is no place at all
           * until something is wrapped in a new row, which is a change to the tree that a plus button
           * has no business making without being asked. So the two that exist are drawn, on the edges
           * where they act, and they turn with the stack: a card in a row gets them left and right.
           *
           * Where it lands is the **parent's** business and the model's — `insert*` takes a place now,
           * checked against the document rather than trusted. Before this a caller could only say
           * *after what is selected*, so the plus above a block was unsayable.
           *
           * What it puts there is a paragraph, which is what a page is mostly made of and the one
           * thing a reader can immediately type into. Everything else is one press away in 넣는 것,
           * and a plus that opened a list would be a menu where a reader asked for a block.
           */}
          {mode === 'select' && boxes.length === 1 && !freeSides
            ? (['before', 'after'] as const).map((end) => (
                <button
                  key={`add-${end}`}
                  type="button"
                  className="st-add"
                  data-add={end}
                  data-add-way={alongOf(doc(), sid)}
                  title={
                    alongOf(doc(), sid) === 'across'
                      ? end === 'before'
                        ? '왼쪽에 본문 넣기'
                        : '오른쪽에 본문 넣기'
                      : end === 'before'
                        ? '위에 본문 넣기'
                        : '아래에 본문 넣기'
                  }
                  aria-label={
                    alongOf(doc(), sid) === 'across'
                      ? end === 'before'
                        ? '왼쪽에 본문 넣기'
                        : '오른쪽에 본문 넣기'
                      : end === 'before'
                        ? '위에 본문 넣기'
                        : '아래에 본문 넣기'
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    const node = doc().getNode(sid);
                    const parentId = String(node?.parentId ?? '');
                    const kids = ((doc().getNode(parentId)?.content ?? []) as string[]) ?? [];
                    const at = kids.indexOf(sid);
                    if (!parentId || at < 0) return;
                    void (editor as never as {
                      executeCommand?: (n: string, p?: unknown) => void;
                    }).executeCommand?.('insertBodyText', {
                      parentId,
                      at: end === 'before' ? at : at + 1
                    });
                  }}
                >
                  <Icon name="add" size={11} />
                </button>
              ))
            : null}

          {/**
           * **Eight handles for a block that places itself, three for one that does not** — and the
           * difference is what each block can actually say.
           *
           * A stacked block's left edge is not its to decide: the stack put it there, and a handle
           * offering to move it would be a control that writes nothing. A block at coordinates owns
           * all four, so pulling its left edge moves the block *and* narrows it, which is what the
           * same handle does in every design tool.
           */}
          {mode === 'select'
            ? ((freeSides ? (['right', 'bottom', 'corner', 'left', 'top', 'corner-tl', 'corner-tr', 'corner-bl'] as const) : (['right', 'bottom', 'corner'] as const)) as readonly string[]).map((edge) => (
                <span
                  key={`grip-${edge}`}
                  className="st-grip"
                  data-grip-edge={edge}
                  role="presentation"
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const board = host.current;
                    const el = board?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid)}"]`);
                    if (!board || !el) return;

                    const scale = scaleOf(board);
                    const rect = el.getBoundingClientRect();
                    /*
                     * **A corner does both**, which is the handle a reader looks for first: every
                     * tool of this kind puts one there, and this had only the two edges — measured as
                     * *여전히 객체 resize 가 어떻게 동작하는지 모르겠어*.
                     */
                    /*
                     * Which axes this handle touches, and which **way** each one grows the box. A
                     * left or top handle grows the block by moving its own anchor the other way,
                     * which is why the two are read separately.
                     */
                    const across = edge !== 'bottom' && edge !== 'top';
                    const down = edge !== 'right' && edge !== 'left';
                    const fromLeft = edge === 'left' || edge === 'corner-tl' || edge === 'corner-bl';
                    const fromTop = edge === 'top' || edge === 'corner-tl' || edge === 'corner-tr';
                    const fromX = event.clientX;
                    const fromY = event.clientY;
                    const wasW = Math.round(rect.width / scale);
                    const wasH = Math.round(rect.height / scale);
                    /*
                     * Whether this block takes its width from the pair. Read from the document rather
                     * than from the drawing, because `sizing` is what the reader said and the drawing
                     * is what the browser made of it.
                     */
                    /*
                     * Whether this block takes its width from the pair. Read from the document rather
                     * than from the drawing, because `sizing` is what the reader said and the drawing
                     * is what the browser made of it.
                     *
                     * A block at **coordinates** is treated as fixed whatever it says, and the drag
                     * writes that too: `fill` on a placed block makes every width handle a max it
                     * never reaches, so the handle would move and the block would not.
                     */
                    const placed = doc().getNode(sid)?.attributes?.position === 'absolute';
                    const fixed = placed || String(doc().getNode(sid)?.attributes?.sizing) === 'fixed';
                    const restore = holdStyle(el, ['max-width', 'min-width', 'min-height']);

                    let wide = wasW;
                    let tall = wasH;
                    let movedX = 0;
                    let movedY = 0;
                    const held = getComputedStyle(el);
                    const wasLeft = Math.round(Number.parseFloat(held.left) || 0);
                    const wasTop = Math.round(Number.parseFloat(held.top) || 0);

                    const onMove = (move: PointerEvent) => {
                      if (across) {
                        const travelled = (move.clientX - fromX) / scale;
                        wide = Math.max(8, Math.round(wasW + (fromLeft ? -travelled : travelled)));
                        el.style.setProperty('max-width', `${wide}px`);
                        if (fixed) el.style.setProperty('min-width', `${wide}px`);
                        if (fromLeft) {
                          movedX = wasW - wide;
                          el.style.setProperty('left', `${wasLeft + movedX}px`);
                        }
                      }
                      if (down) {
                        const travelled = (move.clientY - fromY) / scale;
                        tall = Math.max(8, Math.round(wasH + (fromTop ? -travelled : travelled)));
                        el.style.setProperty('min-height', `${tall}px`);
                        if (fromTop) {
                          movedY = wasH - tall;
                          el.style.setProperty('top', `${wasTop + movedY}px`);
                        }
                      }
                      /*
                       * **What it is writing, while it is writing it.** A handle that moves a box and
                       * says nothing leaves a reader to let go and go and read the panel — which is
                       * the other half of *모르겠어*. The padding bands have said their number since
                       * they were built.
                       */
                      setSizing(across && down ? `${wide} × ${tall}` : across ? `${wide}` : `${tall}`);
                    };

                    const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                      // Back to what the renderer had — see `holdStyle`.
                      restore();
                      setSizing(undefined);
                      if (wide === wasW && tall === wasH) return;

                      /*
                       * **At the width being looked at**, which is what the panel's own field does:
                       * a reader dragging on the 390 board means *this is how wide it is on a phone*,
                       * and writing the page's number instead would change every width from a
                       * gesture made on one.
                       */
                      void editor.executeCommand('setBlockFormat', {
                        nodeIds: [sid],
                        at: breakpoint,
                        // A corner writes both, which is what the reader dragged.
                        // A placed block that has not said so yet is saying so now, by being dragged.
                        ...(placed ? { sizing: 'fixed' } : {}),
                        ...(across && wide !== wasW
                          ? { maxWidth: Math.round(wide * 15), ...(fixed ? { minWidth: Math.round(wide * 15) } : {}) }
                          : {}),
                        ...(down && tall !== wasH ? { minHeight: Math.round(tall * 15) } : {}),
                        /*
                         * And **the anchor**, for the two edges that grow a block by moving it. A left
                         * handle pulled outward makes the block wider *and* starts it further left;
                         * writing only the width would grow it to the right, away from the hand.
                         */
                        ...(fromLeft && movedX ? { insetLeft: Math.round((wasLeft + movedX) * 15) } : {}),
                        ...(fromTop && movedY ? { insetTop: Math.round((wasTop + movedY) * 15) } : {})
                      });
                    };

                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  }}
                />
              ))
            : null}

          {/**
           * **The space between two children, and it can be pulled.**
           *
           * It was drawn and not touchable, which is the half-answer a reader notices immediately:
           * every band inside the block could be pulled except the ones actually between things.
           *
           * One number for all of them, because that is what a stack has — `gap` is the stack's, not
           * each pair's — so pulling any gap sets the gap. Which is worth saying on screen rather
           * than discovering: the others move with it, and a reader who expected one to move alone
           * would read that as a bug. They all light up together while one is held.
           */}
          {inside?.gaps.map((gap, at) => (
            <span
              key={`gap-${at}`}
              className="st-inset"
              data-inset="gap"
              data-gap-way={gap.way}
              data-grip={pulling === 'gap' ? 'held' : 'true'}
              style={{ left: gap.left, top: gap.top, width: gap.width, height: gap.height }}
              onPointerDown={(event) => {
                if (mode !== 'select') return;
                event.preventDefault();
                event.stopPropagation();
                const sid = boxes[0]?.sid;
                const board = host.current;
                const el = board?.querySelector<HTMLElement>(`[data-bc-sid="${CSS.escape(sid ?? '')}"]`);
                if (!sid || !board || !el) return;

                const scale = scaleOf(board);
                const from = gap.way === 'down' ? event.clientY : event.clientX;
                const was = gap.said;
                let now = was;
                setPulling('gap');

                /**
                 * **Which of the two gaps this strip is**, which it had been getting wrong.
                 *
                 * Every strip already knew its own axis — it is measured between drawn children — and
                 * all of them wrote the same attribute, so dragging the space between a grid's *rows*
                 * moved the space between its columns with it. Reported as the question underneath:
                 * *column gap 이랑 row gap 을 분리해야하지 않아?*
                 *
                 * The model names the two along the flow and across it, so the answer is the parent's
                 * direction and not the strip's: down a column is along, down a grid is across.
                 */
                const how = String(doc().getNode(sid)?.attributes?.layoutMode ?? 'column');
                const alongTheFlow = gap.way === (how === 'column' ? 'down' : 'across');
                const writes = alongTheFlow ? 'gap' : 'gapCross';
                const paints = gap.way === 'down' ? 'row-gap' : 'column-gap';
                const restore = holdStyle(el, [paints]);

                const onMove = (move: PointerEvent) => {
                  const travelled =
                    ((gap.way === 'down' ? move.clientY : move.clientX) - from) / scale;
                  now = Math.max(0, Math.round(was + travelled));
                  el.style.setProperty(paints, `${now}px`);
                };
                const onUp = () => {
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  setPulling(undefined);
                  // Back to what the renderer had, so the document's own value is what draws.
                  restore();
                  if (now === was) return;
                  // Twips, and at the width being looked at — the rule every drag here follows.
                  void editor.executeCommand('setBlockFormat', {
                    nodeIds: [sid],
                    at: breakpoint,
                    [writes]: Math.round(now * 15)
                  });
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
              }}
            >
              {gap.said >= 24 ? <em>{gap.said}</em> : null}
            </span>
          ))}
        </div>
        );
      })}
      {/* Read so the boxes are recomputed when the document or the selection moves. */}
      <span hidden data-revision={revision} />
    </div>
  );
}

/**
 * **Which way the stack holding this block runs**, which is what says where a plus can go.
 *
 * Asked of the **parent**, because a block has no direction of its own — the stack it is in decided,
 * and that is the same reading `_group` takes when it wraps blocks and `frameCss` takes when it lays
 * them out. A grid counts as `across`, because its children sit beside each other; the plus still
 * lands at an index, and where that index draws is the grid's business.
 */
function alongOf(doc: { getNode: (sid: string) => any }, sid: string): 'down' | 'across' {
  const parentId = String(doc.getNode(sid)?.parentId ?? '');
  const how = String((doc.getNode(parentId)?.attributes as any)?.layoutMode ?? 'column');
  return how === 'row' || how === 'grid' ? 'across' : 'down';
}

/**
 * Which row of a list a drawn sid names.
 *
 * A row is `${collection}~${index}` and its parts are `${collection}~${index}~${part}`, so the index
 * is the second segment — written down rather than counted in the DOM, because a reader pointing at
 * the third product means the third *product*, and counting siblings gives the same answer only
 * until a list is sorted or filtered, which is most of them.
 */
function rowIndexOf(sid: string | undefined): number | undefined {
  const index = Number(String(sid ?? '').split('~')[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

/**
 * Move a drawing while a drag is in flight, and **put back exactly what was there**.
 *
 * Every drag here works the same way: the block follows the pointer through an inline style, and the
 * document hears about it once, on release. Undoing that used to be `style.removeProperty` — which is
 * wrong on this canvas, and was wrong quietly.
 *
 * The boards are drawn by the renderer **inline**: a stack's `display`, its `gap`, its padding are
 * all on the element's own `style`. So removing the property does not go back to the rendered value,
 * it *deletes* it — and the only thing that hid this is that a drag which changed something wrote to
 * the document and got a re-render that put it back. A drag that ended where it started wrote
 * nothing, so the value stayed gone: a gap dragged and released unchanged came back `normal`, and the
 * three cards closed up.
 *
 * So the previous inline value is kept and restored, which is true whether or not anything is written
 * afterwards.
 */
const holdStyle = (el: HTMLElement, names: string[]) => {
  const was = names.map((name) => [name, el.style.getPropertyValue(name)] as const);
  return () => {
    for (const [name, value] of was) {
      if (value) el.style.setProperty(name, value);
      else el.style.removeProperty(name);
    }
  };
};

const boxStyle = (box: { left: number; top: number; width: number; height: number }) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`
});
