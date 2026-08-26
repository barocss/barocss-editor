/**
 * Putting a layout box into a document, and changing its mind afterwards.
 *
 * A word processor has one answer for "two things side by side", and it is a
 * table — a grid of cells with borders turned off, which every long report ends
 * up containing and which nobody wants. It is a table because a document is a
 * single column of blocks and there has never been a node that says "these go in
 * a row". `frame` is that node, and this is what makes one.
 *
 * ## Why this is not in `canvas-layout-commands.ts`
 *
 * That file owns `setFrameLayout` and the arithmetic behind it: on a canvas, a
 * frame's children carry `x` and `y`, and something has to compute them. In a
 * document nothing is computed — the frame is a `<div>` with `display: flex`
 * and the browser does the work — so the two halves of "frame" have almost
 * nothing in common but the node. The insert belongs with the flow.
 *
 * ## What it inserts
 *
 * A frame with paragraphs already in it, one per column, and *not* an empty
 * frame. An empty layout box is a rectangle a reader cannot get a caret into:
 * there is nothing to click, no text node to put a caret in, and the only way
 * out is undo. The paragraphs are what make it usable the moment it appears.
 */
import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import type { DocumentNode } from '@barocss/office-text';

/** The layouts a frame offers, and what a caller may ask for by name. */
export const FRAME_LAYOUTS = ['row', 'column', 'grid'] as const;
export type FrameLayout = (typeof FRAME_LAYOUTS)[number];

export interface InsertFrameOptions {
  layoutMode?: string;
  /** How many paragraphs to start with; a grid also arranges into this many. */
  columns?: number;
  gap?: number;
  padding?: number;
}

/** The gap a frame starts with: 8pt, which is a paragraph's spacing. */
const DEFAULT_GAP = 160;

const layoutOf = (mode: unknown): FrameLayout =>
  FRAME_LAYOUTS.includes(mode as FrameLayout) ? (mode as FrameLayout) : 'row';

/**
 * How many blocks a new frame starts with.
 *
 * A row and a grid are about things beside each other, so two is the smallest
 * number that shows what the frame is for. A column is a stack, and a stack of
 * two empty paragraphs looks like a mistake — but one is what the frame already
 * is, so a column starts with two as well and reads as a stack straight away.
 */
const startingBlocks = (options: InsertFrameOptions): number => {
  const asked = options.columns;
  if (typeof asked === 'number' && Number.isFinite(asked)) {
    return Math.min(8, Math.max(1, Math.round(asked)));
  }
  return 2;
};

/** The frame a reader gets, with somewhere to type in each part of it. */
export function frameNode(options: InsertFrameOptions = {}): DocumentNode {
  const mode = layoutOf(options.layoutMode);
  const count = startingBlocks(options);

  const attributes: Record<string, unknown> = {
    layoutMode: mode,
    gap: typeof options.gap === 'number' && Number.isFinite(options.gap) ? Math.max(0, options.gap) : DEFAULT_GAP,
    padding:
      typeof options.padding === 'number' && Number.isFinite(options.padding)
        ? Math.max(0, options.padding)
        : 0
  };
  // Only a grid needs to be told how many columns; a row is however many
  // children it has, and writing `columns` on one would be a number that means
  // nothing and disagrees with what is on screen.
  if (mode === 'grid') attributes.columns = count;

  return {
    stype: 'frame',
    attributes,
    content: Array.from({ length: count }, () => ({
      stype: 'paragraph',
      attributes: {},
      /**
       * An empty text node, not an empty paragraph.
       *
       * The same trap as the empty frame, one level down and easier to miss: a
       * paragraph with no children draws no line, so it is 307 pixels wide and
       * *zero high* — measured in the browser, where clicking either half of a
       * new frame hit nothing at all. An empty `inline-text` renders the caret
       * filler, which gives the paragraph a line's height and the reader
       * somewhere to aim.
       */
      content: [{ stype: 'inline-text', text: '' }]
    }))
  } as DocumentNode;
}

export class WordFrameExtension implements Extension {
  name = 'wordFrames';
  priority = 46;

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'insertFrame',
      execute: async (ed: Editor, payload: InsertFrameOptions & { selection?: unknown } = {}) =>
        await this._insert(ed, payload, (payload as any).selection),
      canExecute: (ed: Editor) => !!this._blockAt(ed)
    });
  }

  /**
   * The block the caret is in, and the parent it is a child of.
   *
   * Walks up from whatever the selection names — an inline node, a text node —
   * until it reaches something with a parent that lists it, which is the block
   * a new sibling goes next to. The same walk `_insertBreak` does, because
   * "here" means the same thing for both.
   */
  private _blockAt(
    editor: Editor,
    given?: unknown
  ): { sid: string; parentId: string; at: number } | null {
    const store = editor.dataStore;
    const selection: any = given ?? editor.selection;
    if (!store || !selection?.startNodeId) return null;

    let node: any = store.getNode(selection.startNodeId);
    let depth = 0;
    while (node && depth++ < 64) {
      const parent = node.parentId ? store.getNode(node.parentId) : null;
      const at = parent?.content?.indexOf?.(node.sid) ?? -1;
      // A block is a node the *flow* holds. Stopping at "has a parent" would
      // stop at an inline-text inside a paragraph and insert the frame among
      // the words, which is not a place a frame can be.
      if (
        parent &&
        at >= 0 &&
        typeof node.text !== 'string' &&
        node.stype !== 'inline-text' &&
        parent.stype !== 'paragraph' &&
        parent.stype !== 'heading'
      ) {
        return { sid: String(node.sid), parentId: String(parent.sid), at };
      }
      node = parent;
    }
    return null;
  }

  private async _insert(
    editor: Editor,
    options: InsertFrameOptions,
    selection?: unknown
  ): Promise<boolean> {
    const here = this._blockAt(editor, selection);
    if (!here) return false;

    const result = await transaction(editor, [
      {
        type: 'addChild',
        // After the block the reader is in, which is where "insert" means on
        // every other thing a document can be given.
        payload: { parentId: here.parentId, child: frameNode(options), position: here.at + 1 }
      }
    ] as never).commit();

    return result.success;
  }
}

/** The frame commands, as an extension a kit can install. */
export function createWordFrames(): WordFrameExtension {
  return new WordFrameExtension();
}
