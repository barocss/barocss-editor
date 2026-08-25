import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@barocss/editor-core';
import { selectedNodeIds, watchAnswers } from '@barocss/editor-core';
import { useRevision } from '@barocss/office-ui';
import {
  childOfScope,
  firstRunIn,
  innermostOf,
  isTextual,
  labelOfBlock,
  sidAtElement
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

export function Overlay({
  editor,
  host,
  page,
  zoom,
  mode,
  onEnterText,
  scope,
  onScope
}: {
  editor: Editor;
  /** The board this draws over. */
  host: React.RefObject<HTMLDivElement | null>;
  page: string;
  zoom: number;
  mode: PointerMode;
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
      // Divided by the zoom because this layer lives *inside* the scaled plane: its own pixels are
      // the board's, and `getBoundingClientRect` answers in the screen's.
      return {
        left: (rect.left - frame.left) / zoom,
        top: (rect.top - frame.top) / zoom,
        width: rect.width / zoom,
        height: rect.height / zoom
      };
    },
    [host, zoom]
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

  const hit = (event: React.PointerEvent | React.MouseEvent) =>
    under({ clientX: event.clientX, clientY: event.clientY });

  /**
   * Hand the board back to the reader, with a caret in it.
   *
   * Entering the text is a **decision** rather than a click — this layer swallowed the double-click
   * that would have placed the caret — so the caret has to be asked for, and the board has to be
   * given the focus that a click would have given it. Measured without both: the mode changed, the
   * outline went dashed, and typing did nothing at all.
   */
  const enterText = (sid: string) => {
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

  const boxes = selected
    .map((sid) => ({ sid, box: boxOf(sid) }))
    .filter((one): one is { sid: string; box: NonNullable<ReturnType<typeof boxOf>> } => !!one.box);
  const hovered = hover && !selected.includes(hover) ? boxOf(hover) : undefined;

  return (
    <div
      ref={layer}
      className="st-overlay"
      data-mode={mode}
      // In text mode the board is an ordinary editor again, and this draws without taking anything.
      style={{ pointerEvents: mode === 'select' ? 'auto' : 'none' }}
      /*
       * The hover shows **what a click would select**, which is the outermost block — not the run of
       * text the pointer happens to be over. A badge that named the run said `inline-text`, which is
       * the engine talking to a reader.
       */
      onPointerMove={(event) => setHover(childOfScope(doc(), hit(event), page, scope))}
      onPointerLeave={() => setHover(undefined)}
      onPointerDown={(event) => {
        if (mode !== 'select') return;
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

        // Nothing under the pointer: the reader clicked the page's own margin, which means "none" —
        // and leaves whatever they had entered, because that is where they just clicked.
        if (!outer) {
          onScope(page);
          select([]);
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
        if (deeper === deepest && isTextual(doc(), deepest)) enterText(deepest);
      }}
    >
      {hovered ? (
        <div className="st-mark st-mark-hover" style={boxStyle(hovered)} aria-hidden>
          <span className="st-mark-name">{labelOfBlock(doc(), hover!)}</span>
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
        </div>
      ))}
      {/* Read so the boxes are recomputed when the document or the selection moves. */}
      <span hidden data-revision={revision} />
    </div>
  );
}

const boxStyle = (box: { left: number; top: number; width: number; height: number }) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.width}px`,
  height: `${box.height}px`
});
