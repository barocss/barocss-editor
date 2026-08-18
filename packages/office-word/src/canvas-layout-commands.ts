import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childrenToLayOut, laysOut, layoutChildren } from './canvas-layout';

/** The little of a document this needs, so a caller can pass anything. */
interface CanvasAccess {
  getNode: (sid: string) => { sid?: string; stype?: string; attributes?: Record<string, unknown>; content?: unknown } | undefined;
  rootId: string;
}

/**
 * Turning a frame into one that arranges what is in it, and keeping it that way.
 *
 * `layoutMode` was declared with the canvas nodes and read by nothing; the
 * arithmetic is in `auto-layout.ts` and this is what runs it. Two halves:
 *
 * - **`setFrameLayout`**, which a reader runs, and which arranges the frame the
 *   moment it changes anything.
 * - **A reaction**, because an arrangement that only held until the next edit
 *   would be a one-off tidy-up rather than a layout. A child added, removed,
 *   resized or reordered has to be caught, and the only event that covers all
 *   four is the document changing.
 *
 * ## Why the reaction does not feed itself
 *
 * It writes, and writing is a document change. What stops the loop is the
 * arithmetic answering with *what differs*: run against a document that already
 * agrees with its frames, `layoutChildren` returns nothing and there is nothing
 * to commit. So the first pass settles it and the second finds nothing to do.
 *
 * The alternative — a flag saying "this change was mine" — was not written,
 * because a flag has to be cleared and a cleared flag is a race. Converging is
 * a property of the answer rather than of the bookkeeping.
 */
export class CanvasLayoutExtension implements Extension {
  name = 'canvas-layout';
  priority = 47;

  /** Guards against re-entering while a layout transaction is in flight. */
  private _applying = false;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'setFrameLayout',
      execute: async (_ed: Editor, payload?: any) => await this._set(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => {
        const node = payload?.nodeId ? this._access(editor)?.getNode(payload.nodeId) : undefined;
        if (node?.stype !== 'frame') return false;
        return Object.keys(this._settingsOf(payload)).length > 0;
      }
    });

    /**
     * Arranged again whenever the document changes.
     *
     * Every frame, not the one that changed: the event says the document
     * changed and not what in it, and asking every frame costs one comparison
     * each against sizes already in memory.
     */
    (editor as any).on?.('editor:content.change', () => {
      void this._applyAll(editor);
    });
  }

  private _access(editor: Editor): CanvasAccess | null {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /** Only what the caller actually gave, so nothing else is overwritten. */
  private _settingsOf(payload: any): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (typeof payload?.layoutMode === 'string') out.layoutMode = payload.layoutMode;
    for (const key of ['gap', 'padding', 'columns'] as const) {
      const value = payload?.[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.max(0, value);
    }
    if (typeof payload?.alignItems === 'string') out.alignItems = payload.alignItems;
    return out;
  }

  private async _set(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    const frame = payload?.nodeId ? doc?.getNode(payload.nodeId) : undefined;
    if (!doc || frame?.stype !== 'frame') return false;

    const settings = this._settingsOf(payload);
    if (Object.keys(settings).length === 0) return false;

    const attrs = { ...(frame.attributes ?? {}), ...settings };
    const children = childrenToLayOut(doc.getNode as never, (frame as any).content);
    const moved = layoutChildren({ attributes: attrs }, children);

    /**
     * The setting and the arrangement in one transaction.
     *
     * Turning a layout on *is* the arrangement — a reader who presses "row" and
     * watches nothing move has been told the button does nothing — and one undo
     * has to put both back.
     */
    const steps: { type: string; payload: Record<string, unknown> }[] = [
      { type: 'setAttrs', payload: { nodeId: payload.nodeId, attrs: settings } },
      ...[...moved].map(([sid, at]) => ({
        type: 'setAttrs',
        payload: { nodeId: sid, attrs: { x: at.x, y: at.y } }
      }))
    ];

    return (await transaction(editor, steps as never).commit()).success;
  }

  /** Every frame that arranges, brought back into agreement with its settings. */
  private async _applyAll(editor: Editor): Promise<void> {
    if (this._applying) return;

    const doc = this._access(editor);
    if (!doc) return;

    const steps: { type: string; payload: Record<string, unknown> }[] = [];
    const seen = new Set<string>();

    const walk = (sid: string, depth: number) => {
      if (depth > 32 || seen.has(sid)) return;
      seen.add(sid);

      const node: any = doc.getNode(sid);
      if (!node) return;

      if (node.stype === 'frame' && laysOut(node.attributes)) {
        const children = childrenToLayOut(doc.getNode as never, node.content);
        for (const [child, at] of layoutChildren(node, children)) {
          steps.push({ type: 'setAttrs', payload: { nodeId: child, attrs: { x: at.x, y: at.y } } });
        }
      }

      for (const child of Array.isArray(node.content) ? node.content : []) {
        if (typeof child === 'string') walk(child, depth + 1);
      }
    };

    walk(doc.rootId, 0);
    if (steps.length === 0) return;

    this._applying = true;
    try {
      await transaction(editor, steps as never).commit();
    } finally {
      this._applying = false;
    }
  }
}

/** The layout commands, as an extension a kit can install. */
export function createLayoutCommands(): CanvasLayoutExtension {
  return new CanvasLayoutExtension();
}
