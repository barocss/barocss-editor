import { findAncestorNode } from '@barocss/datastore';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode, insertParagraph as insertParagraphOp, splitListItem as splitListItemOp, moveChildren, removeChild } from '@barocss/model';

export interface ParagraphExtensionOptions {
  enabled?: boolean;
}

/**
 * ParagraphExtension
 *
 * - Handles Enter key (`insertParagraph` command).
 * - Actual model changes are performed using transaction + operations combination from @barocss/model.
 * - Instead of writing directly to DataStore, creates operation objects (deleteTextRange, splitTextNode, splitBlockNode, addChild, etc.)
 *   and executes them in a single transaction.
 */
export class ParagraphExtension implements Extension {
  name = 'paragraph';
  priority = 100;

  private _options: ParagraphExtensionOptions;

  constructor(options: ParagraphExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Paragraph command
    (editor as any).registerCommand({
      name: 'setParagraph',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        // The editor's selection when none is passed — see the guard beside this.
        return await this._executeSetParagraph(ed, payload?.selection ?? (ed as { selection?: ModelSelection }).selection);
      },
      /*
       * The **editor's** selection when the caller did not pass one — which the `execute` beside this
       * has always done. A guard that only reads `payload.selection` answers no to every caller that
       * asks *can this run right now* before deciding what to send, which is what a toolbar does on
       * every render. Ten commands were in this state and the conformance run counted them all as
       * unaskable; see `heading.ts` for the note.
       *
       * **And the block is not already a paragraph.** The run answers *"no-op if already paragraph"*
       * with `return true` — success, and the document untouched — so 본문으로 lit up on every
       * paragraph in the document and reported that it had done something. Which is worse than a
       * refusal: a caller that trusts the answer thinks the conversion happened.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
        hasRange(ed, payload) && !this._alreadyParagraph(ed, payload?.selection)
    });

    // Enter key: insertParagraph (Model-first, transaction-based)
    (editor as any).registerCommand({
      name: 'insertParagraph',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeInsertParagraph(ed, payload?.selection ?? (ed as { selection?: ModelSelection }).selection);
      },
      /*
       * The **editor's** selection when the caller did not pass one — which the `execute` beside this
       * has always done. A guard that only reads `payload.selection` answers no to every caller that
       * asks *can this run right now* before deciding what to send, which is what a toolbar does on
       * every render. Ten commands were in this state and the conformance run counted them all as
       * unaskable; see `heading.ts` for the note.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });

    // Keyboard shortcut registration is not yet directly handled by ParagraphExtension.
  }

  onDestroy(_editor: Editor): void {
    // Add cleanup work here if needed
  }

  /**
   * setParagraph execution
   * - Converts current block node to paragraph
   */
  private async _executeSetParagraph(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[ParagraphExtension] dataStore not found');
      return false;
    }

    // Find current block node (parent block node of startNodeId)
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[ParagraphExtension] No target block node found');
      return false;
    }

    const targetNode = dataStore.getNode(targetNodeId);
    if (!targetNode) {
      return false;
    }

    // No-op if already paragraph
    if (targetNode.stype === 'paragraph') {
      return true;
    }

    // Use transformNode operation
    const ops = [
      ...control(targetNodeId, [
        transformNode('paragraph')
      ])
    ];

    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }

  /**
   * Whether the block the caret is in is already a paragraph — the question the guard asks and the
   * run answers with `return true`, which is how it went unnoticed.
   */
  private _alreadyParagraph(editor: Editor, selection?: ModelSelection): boolean {
    const at = selection ?? (editor as { selection?: ModelSelection }).selection;
    if (!at || at.type !== 'range') return false;

    const store = (editor as { dataStore?: { getNode: (id: string) => { stype?: string } | undefined } })
      .dataStore;
    if (!store) return false;

    const blockId = this._getTargetBlockNodeId(store as never, at as never);
    return !!blockId && store.getNode(blockId)?.stype === 'paragraph';
  }

  /**
   * insertParagraph execution
   * - Interprets selection, builds operation array, then executes via transaction.
   */
  private async _executeInsertParagraph(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const ops = this._buildInsertParagraphOperations(editor, selection);
    if (!ops.length) {
      return false;
    }

    const result = await transaction(editor, ops, { applySelectionToView: true }).commit();
    return result.success;
  }

  /**
   * Finds target block node ID from selection
   * - Range Selection: parent block node of startNodeId
   */
  private _getTargetBlockNodeId(dataStore: any, selection: ModelSelection): string | null {
    if (selection.type !== 'range') {
      return null;
    }

    const startNode = dataStore.getNode(selection.startNodeId);
    if (!startNode) return null;

    const schema = dataStore.getActiveSchema();
    if (schema) {
      const nodeType = schema.getNodeType(startNode.stype);
      // Use startNode as is if it's a block
      if (nodeType?.group === 'block') {
        return startNode.sid!;
      }
    }

    // Find parent block node of startNode (cycle-safe walk)
    const block = findAncestorNode(
      (id: string) => dataStore.getNode(id),
      startNode.sid!,
      (n: any) => schema?.getNodeType(n.stype)?.group === 'block'
    );
    return block?.sid ?? null;
  }

  /**
   * Builds operation sequence for insertParagraph.
   * insertParagraph is selection-based (reads context.selection.current in the transaction).
   * Collapsed: insertParagraph(). Range (same node): deleteTextRange then insertParagraph().
   */
  private _buildInsertParagraphOperations(
    editor: Editor,
    selection: ModelSelection
  ): any[] {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return [];
    if (selection.type !== 'range') return [];

    const ops: any[] = [];
    if (!selection.collapsed && selection.startNodeId === selection.endNodeId) {
      const node = dataStore.getNode(selection.startNodeId);
      if (!node || typeof node.text !== 'string') return [];
      const text = node.text as string;
      const { startOffset, endOffset } = selection;
      if (
        typeof startOffset !== 'number' ||
        typeof endOffset !== 'number' ||
        startOffset < 0 ||
        endOffset > text.length ||
        startOffset >= endOffset
      ) {
        return [];
      }
      ops.push(
        ...control(selection.startNodeId, [
          { type: 'deleteTextRange', payload: { start: startOffset, end: endOffset } }
        ])
      );
    } else if (!selection.collapsed) {
      /**
       * A selection that ends in a different node than it started in.
       *
       * This used to return no operations at all, so Enter over such a
       * selection did nothing — and "a different node" is not an exotic case: a
       * paragraph holds one run per stretch of formatting, so selecting across
       * a bold word and pressing Enter is exactly this. It also covers a
       * selection spanning two paragraphs.
       *
       * `deleteRange` removes the text across nodes; the split then happens at
       * the selection's start, which is where the reader left the caret.
       */
      const { startNodeId, startOffset, endNodeId, endOffset } = selection;
      if (
        typeof startOffset !== 'number' ||
        typeof endOffset !== 'number' ||
        !startNodeId ||
        !endNodeId
      ) {
        return [];
      }
      ops.push({
        type: 'deleteRange',
        payload: { range: { startNodeId, startOffset, endNodeId, endOffset } }
      });
      // Deliberately falls through to the split below, which is the second half
      // of the keystroke.
    }
    if (this._isSelectionInsideListItem(dataStore, selection)) {
      ops.push(splitListItemOp());
    } else {
      /**
       * **A heading ends where the reader presses Enter at the end of it.**
       *
       * It was always `'same'`, so Enter at the end of a heading made **another heading** — measured:
       * `heading2("제목")` became `heading2("제목") + heading2("")`. Every editor of this kind gives a
       * paragraph here, and for a reason a reader could state: a heading is a title, and the thing
       * after a title is prose.
       *
       * **At the end**, and nowhere else. Enter in the middle of a heading splits a title into two
       * titles, which is what a reader means by putting a break in the middle of one; only the split
       * that leaves the second half **empty** is the reader saying *this heading is finished*.
       *
       * The operation has taken `'paragraph'` since it was written and nothing ever asked for it.
       * Found by counting what each `insert…` command actually puts in the document — the table
       * reported `insertParagraph → heading`, which is a command producing the one thing its name
       * says it does not.
       */
      /**
       * **Enter on an empty block at the end of a container leaves it.**
       *
       * The rule every editor of this kind has, and the one this had not: pressing Enter inside a
       * quotation added another paragraph *inside the quotation*, and then another, and there was no
       * way out with the keyboard at all. Measured in `apps/note` — one blockquote, three paragraphs,
       * and the caret still in it. Reported as *인용구에서 엔터로 벗어날 수 없음*, which is the whole
       * of it.
       *
       * The reader's meaning is unambiguous and is why the rule is safe: an **empty** paragraph is
       * not writing, it is a gesture. A reader who wanted a blank line inside a quote does not press
       * Enter twice at the end of it — they press it once, in the middle.
       *
       * A list item has had this since it was written (`splitListItem` empties out one level), which
       * is the same rule one container over.
       */
      const out = leavingAContainer(dataStore, selection);
      if (out) {
        ops.push(moveChildren(out.from, out.to, [out.block], out.at));
        if (out.emptyNow) ops.push(removeChild(out.grand, out.from));
      } else {
        ops.push(insertParagraphOp(atEndOfHeading(dataStore, selection) ? 'paragraph' : 'same'));
      }
    }
    return ops;
  }

  private _isSelectionInsideListItem(dataStore: any, selection: ModelSelection): boolean {
    if (selection.type !== 'range') return false;
    let node = dataStore.getNode(selection.startNodeId);
    if (!node) return false;
    if ((node as { stype?: string }).stype === 'inline-text') {
      const parentId = (node as { parentId?: string }).parentId;
      if (!parentId) return false;
      node = dataStore.getNode(dataStore.resolveAlias?.(parentId) ?? parentId);
    }
    if (!node) return false;
    const parentId = (node as { parentId?: string }).parentId;
    if (!parentId) return false;
    const parent = dataStore.getNode(dataStore.resolveAlias?.(parentId) ?? parentId);
    return (parent as { stype?: string })?.stype === 'listItem';
  }
}

// Convenience function
export function createParagraphExtension(options?: ParagraphExtensionOptions): ParagraphExtension {
  return new ParagraphExtension(options);
}

/**
 * Whether the caret sits at the very end of a heading.
 *
 * The two halves of the question a reader is answering with Enter: *is this a title*, and *am I done
 * with it*. A caret anywhere else in a heading is a break inside a title, which stays a title.
 */
function atEndOfHeading(dataStore: any, selection: ModelSelection): boolean {
  if (selection.type !== 'range' || !selection.collapsed) return false;

  const run = dataStore?.getNode?.(selection.startNodeId);
  if (!run || typeof run.text !== 'string') return false;
  if (selection.startOffset !== run.text.length) return false;

  const parentId = run.parentId ? (dataStore.resolveAlias?.(run.parentId) ?? run.parentId) : undefined;
  const block = parentId ? dataStore.getNode(parentId) : undefined;
  if (block?.stype !== 'heading') return false;

  // And the last run in it — a heading of several runs ends at the end of the last one.
  const held = (block.content ?? []) as string[];
  return held[held.length - 1] === selection.startNodeId;
}


/**
 * **The empty block at the end of a container that a reader is pressing Enter to leave.**
 *
 * Four things have to be true, and each one is a way a reader could mean something else:
 *
 * - the caret is **collapsed** — a selection is a replacement, not a gesture;
 * - the block it is in is **empty** — anything written in it is writing, and Enter after writing
 *   makes another block;
 * - that block is the **last** child of what holds it — Enter in the middle is a split;
 * - and what holds it is a **container inside a body**, not the body itself. A paragraph at the end
 *   of a note has nowhere to go, and this must not lift it into nothing.
 *
 * `listItem` is left alone: `splitListItem` has answered for it since it was written, and two rules
 * for one gesture is how they come to disagree.
 */
function leavingAContainer(
  dataStore: any,
  selection: ModelSelection
): { from: string; to: string; grand: string; block: string; at: number; emptyNow: boolean } | undefined {
  if (selection.type !== 'range' || !selection.collapsed) return undefined;

  const run = dataStore?.getNode?.(selection.startNodeId);
  if (!run) return undefined;

  const at = (sid: string | undefined) =>
    sid ? dataStore.getNode(dataStore.resolveAlias?.(sid) ?? sid) : undefined;

  /* The block the caret is in — a run's parent, or the node itself when a block holds the caret. */
  const block = typeof run.text === 'string' ? at(run.parentId) : run;
  if (!block || typeof block.sid !== 'string') return undefined;

  /* Empty: no children, or one run with nothing in it. */
  const kids = (block.content ?? []) as string[];
  const written = kids.some((one) => {
    const child = at(one);
    return typeof child?.text === 'string' ? child.text.length > 0 : !!child;
  });
  if (written) return undefined;

  const holder = at(block.parentId);
  if (!holder || typeof holder.sid !== 'string') return undefined;
  /*
   * A list item's own rule already answers Enter, and the containers a body has are the ones a
   * writer can be *inside*: a quotation today, and whatever else holds blocks tomorrow.
   */
  if (holder.stype === 'listItem' || holder.stype === 'note' || holder.stype === 'surface') return undefined;

  const siblings = (holder.content ?? []) as string[];
  if (siblings[siblings.length - 1] !== block.sid) return undefined;

  const grand = at(holder.parentId);
  if (!grand || typeof grand.sid !== 'string') return undefined;

  const where = ((grand.content ?? []) as string[]).indexOf(holder.sid);
  return {
    from: holder.sid,
    to: grand.sid,
    grand: grand.sid,
    block: block.sid,
    at: where >= 0 ? where + 1 : ((grand.content ?? []) as string[]).length,
    /* A container whose only child just left is a container with nothing in it. */
    emptyNow: siblings.length === 1
  };
}
