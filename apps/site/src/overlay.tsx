import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';
import {
  childOfScope,
  enclosing,
  firstRunIn,
  landingFor,
  innermostOf,
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
  const held = useRef<{ sid: string; x: number; y: number; carrying: boolean } | null>(null);
  const [landing, setLanding] = useState<Landing | null>(null);

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
    const gaps: { left: number; top: number; width: number; height: number; said: number }[] = [];
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
          said: down
        });
      } else if (across > 0 && b.left >= a.right) {
        gaps.push({
          left: Math.round((a.right - frame.left) / scale),
          top: Math.round((Math.max(a.top, b.top) - frame.top) / scale),
          width: across,
          height: Math.round((Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / scale),
          said: across
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
        const carry = held.current;
        if (carry) {
          const far = Math.abs(event.clientX - carry.x) + Math.abs(event.clientY - carry.y) > 4;
          if (far) carry.carrying = true;
          if (carry.carrying) {
            setHover(undefined);
            setLanding(landingAt(event, carry.sid));
            return;
          }
        }
        setHover(childOfScope(doc(), hit(event), page, scope));
      }}
      onPointerUp={(event) => {
        const carry = held.current;
        held.current = null;
        (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
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
      onPointerDown={(event) => {
        if (mode !== 'select') return;
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
        held.current = outer ? { sid: outer, x: event.clientX, y: event.clientY, carrying: false } : null;
        (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);

        // Nothing under the pointer: the reader clicked the page's own margin, which means "none" —
        // and leaves whatever they had entered, because that is where they just clicked.
        if (!outer) {
          onScope(page);
          select([]);
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
          held.current = { sid: deepest, x: event.clientX, y: event.clientY, carrying: false };
          return;
        }

        // Shift adds and removes, because a selection is a set — three cards told to fill is one
        // gesture, and doing it a card at a time is the reader keeping the editor's books.
        if (event.shiftKey) {
          select(selected.includes(outer) ? selected.filter((one) => one !== outer) : [...selected, outer]);
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
      {landing ? (
        /*
         * Where it would land, drawn rather than guessed at. Every tool of this kind draws this line
         * and the reason is the same one that made `reorderIndexAt` a function in the model: an
         * off-by-one is a drag that reorders backwards, and a reader can only see that it did.
         */
        <div className="st-mark st-mark-landing" style={boxStyle(landing.line)} aria-hidden />
      ) : null}

      {hovered ? (
        <div className="st-mark st-mark-hover" style={boxStyle(hovered)} aria-hidden>
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

      {boxes.map(({ sid, box }) => (
        <div
          key={sid}
          className="st-mark st-mark-selected"
          data-selected={sid}
          data-editing={mode === 'text' ? 'true' : undefined}
          style={boxStyle(box)}
          aria-hidden
        >
          <span className="st-mark-name">
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

                      const onMove = (move: PointerEvent) => {
                        const travelled = ((side === 'top' || side === 'bottom' ? move.clientY : move.clientX) - from) / scale;
                        now = Math.max(0, Math.round(was + travelled * way));
                        el.style.setProperty(`padding-${side}`, `${now}px`);
                      };

                      const onUp = () => {
                        window.removeEventListener('pointermove', onMove);
                        window.removeEventListener('pointerup', onUp);
                        /*
                         * The inline style comes off before the command runs, so the document's own
                         * value is what draws: leaving it on would paint the block at the dragged
                         * number for ever, whatever the document said afterwards.
                         */
                        el.style.removeProperty(`padding-${side}`);
                        if (now === was) return;
                        /*
                         * **Twips**, which is what the document keeps and the band is not: the band
                         * is read out of `getComputedStyle`, so it is CSS pixels, and the panel's
                         * own field multiplies by 15 on its way in for the same reason. Written in
                         * pixels the first time, and the document took a padding of 0 — a number so
                         * small in twips that it rounds to nothing on the way back out.
                         */
                        void editor.executeCommand('setBlockFormat', {
                          nodeIds: [sid],
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

          {inside?.gaps.map((gap, at) => (
            <span
              key={`gap-${at}`}
              className="st-inset"
              data-inset="gap"
              style={{ left: gap.left, top: gap.top, width: gap.width, height: gap.height }}
            >
              {gap.said >= 24 ? <em>{gap.said}</em> : null}
            </span>
          ))}
        </div>
      ))}
      {/* Read so the boxes are recomputed when the document or the selection moves. */}
      <span hidden data-revision={revision} />
    </div>
  );
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

const boxStyle = (box: { left: number; top: number; width: number; height: number }) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`
});
