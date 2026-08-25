/**
 * Putting a **stack** on a page, and saying how wide what is in it means to be.
 *
 * ## Why a page's insert is not a slide's
 *
 * A deck's `insertRectangle` puts a box at a coordinate in the middle of the surface the reader is
 * looking at. A page has no coordinates: a stack goes **after the block the caret is in**, which is
 * the same walk Word's `insertFrame` and `insertDrawing` do and for the same reason — "insert" means
 * *next to what I am looking at* everywhere in a document.
 *
 * That is the whole of the difference at this layer, and it is why the commands are the product's
 * while the arrangement is the canvas layer's.
 *
 * ## Why a stack arrives with something in it
 *
 * The frame insert in Word learned this twice and it is written down there: an empty layout box is a
 * rectangle a reader cannot get a caret into, and a paragraph with no *run* draws no caret filler
 * and is zero pixels high. A section arrives as a stack holding one paragraph, which is a thing a
 * reader can immediately type in.
 */
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { SIZING, type Sizing } from './site-schema';

/** What a caller may say about a new stack. */
export interface InsertStackOptions {
  layoutMode?: unknown;
  gap?: unknown;
  padding?: unknown;
  columns?: unknown;
  selection?: unknown;
}

/** The gap a stack starts with: 12pt, which is a section's breathing room. */
const DEFAULT_GAP = 240;

const LAYOUTS = new Set(['row', 'column', 'grid']);

export class SiteStackExtension implements Extension {
  name = 'siteStacks';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /**
     * A **section**: a column that fills the page's width, with a paragraph in it.
     *
     * One command per shape rather than `insertStack({ layoutMode })`, which is the rule the
     * conformance harness enforces about inserts and is right here for the same reason: a toolbar
     * draws one button per shape, and a command that says what it does can be read in a key map.
     */
    register(
      'insertSection',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'column' }),
      (payload) => !!this._blockAt(editor, payload?.selection)
    );

    register(
      'insertRow',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'row' }),
      (payload) => !!this._blockAt(editor, payload?.selection)
    );

    register(
      'insertGrid',
      async (payload) => await this._insert(editor, { ...payload, layoutMode: 'grid', columns: 3 }),
      (payload) => !!this._blockAt(editor, payload?.selection)
    );

    /**
     * How wide the selected blocks mean to be: fill the stack, hug their content, or keep the
     * width they state.
     *
     * A set, because that is what a selection is here as everywhere — three cards told to fill is
     * one gesture, and doing it one card at a time is the reader keeping the editor's books.
     */
    register(
      'setSizing',
      async (payload) => await this._setSizing(editor, payload),
      (payload) => SIZING.includes(payload?.sizing as Sizing) && this._chosen(editor, payload).length > 0
    );
  }

  private _store(editor: Editor): { getNode: (sid: string) => any } | undefined {
    return (editor as never as { dataStore?: { getNode: (sid: string) => any } }).dataStore;
  }

  /**
   * The block a new sibling goes next to — the same walk both other products do.
   *
   * Up from whatever the selection names until it reaches something whose parent lists it and is
   * not a paragraph, which is a *block*.
   */
  private _blockAt(
    editor: Editor,
    given?: unknown
  ): { sid: string; parentId: string; at: number } | null {
    const store = this._store(editor);
    const selection: any = given ?? (editor as never as { selection?: unknown }).selection;
    if (!store || !selection?.startNodeId) return null;

    let node: any = store.getNode(selection.startNodeId);
    let depth = 0;
    while (node && depth++ < 64) {
      const parent: any = node.parentId ? store.getNode(node.parentId) : undefined;
      const at = parent?.content?.indexOf?.(node.sid) ?? -1;
      if (
        parent &&
        at >= 0 &&
        typeof node.text !== 'string' &&
        node.stype !== 'inline-text' &&
        parent.stype !== 'paragraph' &&
        parent.stype !== 'heading'
      ) {
        return { sid: node.sid, parentId: parent.sid, at };
      }
      node = parent;
    }
    return null;
  }

  private async _insert(editor: Editor, payload: InsertStackOptions): Promise<boolean> {
    const here = this._blockAt(editor, payload?.selection);
    if (!here) return false;

    const mode = LAYOUTS.has(payload?.layoutMode as string) ? (payload!.layoutMode as string) : 'column';
    const attributes: Record<string, unknown> = {
      layoutMode: mode,
      gap: typeof payload?.gap === 'number' ? Math.max(0, payload.gap) : DEFAULT_GAP,
      padding: typeof payload?.padding === 'number' ? Math.max(0, payload.padding) : 0,
      /*
       * A section is as wide as the page. Said on the node rather than left to CSS, because the
       * reader can change it in one place afterwards and because a stack that hugged by default
       * would collapse to the width of its first word — which is what a `<div>` does and what
       * nobody means by "section".
       */
      sizing: 'fill'
    };
    if (mode === 'grid') {
      attributes.columns = typeof payload?.columns === 'number' ? Math.max(1, Math.round(payload.columns)) : 3;
    }

    const result = await transaction(editor, [
      {
        type: 'addChild',
        payload: {
          parentId: here.parentId,
          child: {
            stype: 'frame',
            attributes,
            /*
             * Something to type in. An empty stack is a box a reader cannot get a caret into, and a
             * paragraph with no run draws no caret filler and is zero pixels high — both learned in
             * the word processor, both written down there.
             */
            content: [
              { stype: 'paragraph', attributes: {}, content: [{ stype: 'inline-text', text: '' }] }
            ]
          },
          position: here.at + 1
        }
      }
    ] as never).commit();

    return result.success === true;
  }

  /** The blocks a sizing change is about: the ones named, or the ones selected. */
  private _chosen(editor: Editor, payload?: Record<string, unknown>): string[] {
    const store = this._store(editor);
    if (!store) return [];
    const named = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : selectedNodeIds((editor as never as { selection?: never }).selection);
    return named.filter((sid) => !!store.getNode(sid));
  }

  private async _setSizing(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const chosen = this._chosen(editor, payload);
    const sizing = payload?.sizing as Sizing;
    if (chosen.length === 0 || !SIZING.includes(sizing)) return false;

    const steps = chosen.map((sid) => ({
      type: 'setAttrs',
      payload: { nodeId: sid, attrs: { sizing } }
    }));
    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/** The stack commands, as an extension a kit can install. */
export function createStackCommands(): SiteStackExtension {
  return new SiteStackExtension();
}
