import { findAncestorNode } from '@barocss/datastore';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode, insertParagraph as insertParagraphOp, splitListItem as splitListItemOp } from '@barocss/model';

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
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
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
      ops.push(insertParagraphOp(atEndOfHeading(dataStore, selection) ? 'paragraph' : 'same'));
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
