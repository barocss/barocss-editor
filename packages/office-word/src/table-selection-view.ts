/**
 * Dragging across cells, which is the thing that finally produces a `cell`
 * selection.
 *
 * The other half of `table-selection.ts`: that file works out *which* cells a
 * pair spans, this one watches the pointer and puts the answer in the model.
 * Split because the arithmetic is the part with merges in it and the part worth
 * testing in milliseconds, and this part is pointers and cannot be.
 *
 * ## Why the browser's own selection is not enough
 *
 * Drag across two cells and the browser makes a text selection that starts in
 * one paragraph and ends in another. That is a perfectly good description of
 * *text* and a useless one for cells: it says nothing about rows and columns, it
 * cannot express a block two cells wide and two deep without also taking in
 * everything between them in reading order, and there is no answer it can give
 * to "merge these". So while a drag is inside one table this takes over: the DOM
 * selection is cleared and the model gets a `cell` selection instead.
 *
 * Clearing it is also what keeps the two from fighting. The selection handler
 * returns early when there is no anchor node, so an empty DOM selection does not
 * come back around as a model selection a moment later and overwrite this one.
 *
 * ## Why the highlight is written here and not by a renderer
 *
 * A renderer draws a node from the model, and *being selected* is not in the
 * document — it is a fact about this reader. Word's own drawing of it is a wash
 * of colour over the cell, which is a class; this puts the class on and takes it
 * off as the selection changes, the same way a text selection is the browser's
 * to paint rather than the document's.
 */
import type { Editor } from '@barocss/editor-core';
import { createNodeSelection, selectedNodeIds } from '@barocss/editor-core';
import type { DocumentAccess } from '@barocss/office-text';
import { cellContaining, cellsBetween } from './table-selection';

/** The attribute the stylesheet paints. */
const MARK = 'data-cell-selected';

/** And the one for a whole table, which is a different selection and looks it. */
const TABLE_MARK = 'data-table-selected';

/** How far outside the table's corner the handle sits, in pixels. */
const HANDLE_OFFSET = 14;

const CELL_TYPES = new Set(['bTableCell', 'bTableHeaderCell']);

/**
 * The sid of the cell under a point, if the point is in one.
 *
 * By class rather than by walking to a node whose stype is a cell, because at
 * this moment there is a pixel and no model: `elementFromPoint` answers with
 * whatever is drawn there — a text node's span, a paragraph, the box that clips
 * a fixed-height row — and the cell is the nearest thing above it that the cell
 * renderer put a class on. The model walk happens afterwards, from the sid.
 */
function cellSidAt(container: HTMLElement, x: number, y: number): string | undefined {
  const found = document.elementFromPoint(x, y) as HTMLElement | null;
  if (!found || !container.contains(found)) return undefined;

  const cell = found.closest?.('.w-cell') as HTMLElement | null;
  return cell?.getAttribute('data-bc-sid') ?? undefined;
}

export interface CellSelectionHandle {
  destroy(): void;
}

/**
 * Watch for drags across cells in this container, and keep the highlight honest.
 *
 * `doc` rather than the editor's store directly, because everything the
 * arithmetic needs is `getNode`, and passing the narrow thing keeps this
 * testable against a table built by hand.
 */
export function installCellSelection(
  editor: Editor,
  container: HTMLElement,
  doc: DocumentAccess
): CellSelectionHandle {
  /** The cell a drag started in, held for as long as the button is down. */
  let anchor: string | undefined;
  /** The cell a drag last extended to, so a move inside one cell does no work. */
  let last: string | undefined;
  let dragging = false;

  const cellOf = (sid: string | undefined): string | undefined => {
    const cell = cellContaining(doc, sid);
    return typeof cell?.sid === 'string' ? cell.sid : undefined;
  };

  /** Paint what the model says is selected, and unpaint the rest. */
  const paint = (): void => {
    const selection: any = (editor as any).selection;
    const cells = new Set(selection?.type === 'cell' ? selectedNodeIds(selection) : []);
    const tables = new Set(selection?.type === 'table' ? selectedNodeIds(selection) : []);

    for (const attribute of [MARK, TABLE_MARK]) {
      const wanted = attribute === MARK ? cells : tables;
      for (const element of container.querySelectorAll(`[${attribute}]`)) {
        if (!wanted.has(element.getAttribute('data-bc-sid') ?? '')) element.removeAttribute(attribute);
      }
      for (const sid of wanted) {
        container
          .querySelector(`[data-bc-sid="${CSS.escape(sid)}"]`)
          ?.setAttribute(attribute, 'true');
      }
    }
  };

  /**
   * The handle at a table's top-left corner.
   *
   * The gesture that means "this table, as one thing" — the last of the four
   * selection types with no producer. A block of cells is a *set*, and a table is
   * not: deleting a set of cells clears what is in them and deleting a table
   * takes the table away, so the two cannot be the same selection however many
   * cells the set happens to contain.
   *
   * Built here rather than drawn by a renderer, and put **outside the
   * contenteditable** — in the container that holds it, which is already
   * positioned. A handle inside the editable region would be a node the model
   * does not have: the reconciler owns those children, a caret could be placed in
   * it, and a copy would take it along.
   */
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'w-table-handle';
  handle.setAttribute('aria-label', '표 선택');
  handle.hidden = true;
  container.appendChild(handle);

  /** Which table the handle is currently offering, if any. */
  let offered: string | undefined;

  const hideHandle = (): void => {
    handle.hidden = true;
    offered = undefined;
  };

  /**
   * Show the handle at the corner of the table under the pointer.
   *
   * Positioned against the container, which scrolls with the document — so the
   * handle stays on its table without anything having to follow a scroll.
   */
  const offerHandle = (element: HTMLElement | null): void => {
    const sid = element?.getAttribute('data-bc-sid') ?? undefined;
    if (!element || !sid) {
      hideHandle();
      return;
    }

    const table = element.getBoundingClientRect();
    const host = container.getBoundingClientRect();
    offered = sid;
    handle.hidden = false;
    handle.style.left = `${table.left - host.left - HANDLE_OFFSET}px`;
    handle.style.top = `${table.top - host.top - HANDLE_OFFSET}px`;
  };

  /** Select the whole table the handle is offering. */
  const selectTable = (): void => {
    if (!offered) return;
    const selection = createNodeSelection([offered], 'table');
    if (!selection) return;

    stopTextSelection();
    editor.updateSelection(selection as never);
    paint();
  };

  handle.addEventListener('pointerdown', (event) => {
    // Same rule as every control that acts on the selection: take the gesture
    // without letting the browser move focus to the button, or the selection
    // this is about to set is replaced by whatever a click does.
    event.preventDefault();
    event.stopPropagation();
    selectTable();

    /**
     * And put focus in the document, which is where the keys are read.
     *
     * Every key binding is guarded by `editorFocus`, so a table selected by a
     * reader who had not typed yet was a table that Delete would not remove —
     * measured, and it looks exactly like the command being broken. Preventing
     * the default stops focus *moving to the button*; it does not put it
     * anywhere, so this does.
     *
     * Safe with the selection already set: the DOM selection was cleared a line
     * ago, so focusing the region places no caret to argue with it.
     */
    const editable = container.querySelector('[contenteditable="true"]') as HTMLElement | null;
    editable?.focus({ preventScroll: true });
  });

  /**
   * Stop the browser selecting text for the rest of this drag.
   *
   * Clearing the DOM selection once is not enough, and this is the thing that
   * made the first attempt look completely broken while every part of it worked:
   * the pointer is still down and still moving over text, so the browser
   * re-extends its own selection on the very next move, `selectionchange` fires,
   * and the handler converts that range into a model selection *over the top of*
   * the cell selection just written. The block was computed correctly, the model
   * was set correctly, and a millisecond later the model said `range` again.
   *
   * `user-select: none` on the container ends the argument at the source rather
   * than racing it: with it on, no text selection is made, so there is no
   * `selectionchange` to lose to. Put back on pointerup, because a document you
   * cannot select text in is not a document.
   */
  const stopTextSelection = (): void => {
    if (container.style.userSelect === 'none') return;
    container.style.userSelect = 'none';
    window.getSelection()?.removeAllRanges();
  };

  /**
   * Let text be selectable again — but not until the browser has finished with
   * this gesture.
   *
   * Releasing it inside the pointerup handler put the cell selection back to a
   * range every time, and the reason is an ordering that is easy to get wrong
   * twice: the listener runs first, the browser's own click handling runs after
   * it, and by then selection is allowed again, so mouseup places a caret and
   * the `selectionchange` that follows overwrites the model. Measured — two
   * `cell` updates during the drag, then one `range` immediately after the
   * button came up.
   *
   * A frame later the gesture is over and nothing is left to place a caret. Not
   * a race with the other writer: the guard is simply held until the writer has
   * stopped writing, rather than re-asserting the selection afterwards, which is
   * how two writers start fighting over one caret.
   */
  const allowTextSelection = (): void => {
    if (container.style.userSelect !== 'none') return;
    requestAnimationFrame(() => {
      container.style.userSelect = '';
    });
  };

  /** Put a block of cells in the model, or nothing if the block is one cell. */
  const select = (from: string, to: string): void => {
    const cells = cellsBetween(doc, from, to);
    /**
     * One cell is a caret, not a selection.
     *
     * A reader who clicks in a cell and moves the mouse two pixels has not
     * selected the cell — they have put the caret in it, and taking their text
     * selection away to draw a wash of colour over one cell would make it
     * impossible to select a word.
     */
    if (cells.length < 2) return;

    const selection = createNodeSelection(cells, 'cell');
    if (!selection) return;

    stopTextSelection();
    editor.updateSelection(selection as never);
    paint();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;

    const cell = cellSidAt(container, event.clientX, event.clientY);
    const here = cellOf(cell);

    /**
     * Shift+click extends from wherever the caret is, which is what it means
     * everywhere else — so the anchor is the cell the caret is in rather than
     * the one a previous drag started in.
     */
    if (event.shiftKey && here) {
      const caret: any = (editor as any).selection;
      const from =
        caret?.type === 'cell'
          ? cellOf(selectedNodeIds(caret)[0])
          : cellOf(caret?.startNodeId);
      if (from && from !== here) {
        event.preventDefault();
        select(from, here);
        return;
      }
    }

    anchor = here;
    last = here;
    dragging = !!here;

    // A press anywhere ends the previous selection of cells or of a table: the
    // reader is putting the caret somewhere, and a highlight left behind would be
    // a selection the commands still act on while the caret is elsewhere.
    const kind = (editor as any).selection?.type;
    if (kind === 'cell' || kind === 'table') {
      editor.updateSelection(null as never);
      paint();
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    /**
     * The handle follows the pointer between drags.
     *
     * Offered while the pointer is over a table and taken away when it leaves,
     * which is how every word processor draws it: a handle permanently pinned to
     * every table would be furniture in the margin of a document that has six.
     */
    if (!dragging) {
      const under = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;

      /**
       * The pointer on the handle keeps the handle.
       *
       * It sits *outside* its table's corner, so moving towards it takes the
       * pointer off the table — and the first version hid the handle on the way
       * to it. Measured: the handle appeared on hover, and clicking it landed on
       * nothing because it had been taken away by the very move that reached it.
       */
      if (!(under === handle || handle.contains(under))) {
        offerHandle(
          under && container.contains(under)
            ? (under.closest('.w-table') as HTMLElement | null)
            : null
        );
      }
    }

    if (!dragging || !anchor || event.buttons === 0) return;

    const here = cellOf(cellSidAt(container, event.clientX, event.clientY));
    if (!here || here === last) return;

    last = here;
    select(anchor, here);
  };

  const onPointerUp = (): void => {
    dragging = false;
    anchor = undefined;
    last = undefined;
    allowTextSelection();
  };

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointermove', onPointerMove, true);
  container.addEventListener('pointerleave', hideHandle);
  window.addEventListener('pointerup', onPointerUp, true);

  /**
   * Repaint after a render, because a render replaces the cell elements and the
   * attribute goes with them. The selection itself survives — it is in the model
   * — so this is only the drawing catching up.
   */
  const onChange = () => paint();
  (editor as any).on?.('editor:content.change', onChange);
  (editor as any).on?.('editor:selection.model', onChange);

  return {
    destroy() {
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('pointermove', onPointerMove, true);
      container.removeEventListener('pointerleave', hideHandle);
      window.removeEventListener('pointerup', onPointerUp, true);
      (editor as any).off?.('editor:content.change', onChange);
      (editor as any).off?.('editor:selection.model', onChange);
      handle.remove();
    }
  };
}

/** What the stylesheet needs to know, so the two cannot drift apart. */
export const CELL_SELECTED_ATTRIBUTE = MARK;

/** Whether a node type is a cell, for callers that have a stype and no document. */
export function isCellType(stype: string | undefined): boolean {
  return !!stype && CELL_TYPES.has(stype);
}
