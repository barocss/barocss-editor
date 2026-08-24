import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childrenToLayOut, fillChildren, fillsChildren, laysOut, layoutChildren } from './canvas-layout';

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

    (editor as any).registerCommand({
      name: 'setBoxLayout',
      execute: async (_ed: Editor, payload?: any) => await this._setBox(editor, payload),
      canExecute: (_ed: Editor, payload?: any) => {
        const doc = this._access(editor);
        const ids: string[] = Array.isArray(payload?.nodeIds)
          ? payload.nodeIds
          : typeof payload?.nodeId === 'string'
            ? [payload.nodeId]
            : [];
        if (!doc || ids.length === 0) return false;
        if (typeof payload?.stretch !== 'boolean' && typeof payload?.grow !== 'number') return false;
        /*
         * Only inside a container that would read it: filling a frame that puts nothing anywhere
         * is a setting nothing would read, and the panel does not offer it there either.
         *
         * A **card's own part** is the second case, and it was missing: a part told to fill the
         * card is the whole of §5b, and its parent is a `component` rather than a frame — so the
         * one gesture the feature is about was refused. Measured while the placements became
         * references, where a card's part is the only place the filling can be set at all.
         */
        return ids.some((sid) => {
          const parent = (doc.getNode(sid) as { parentId?: unknown } | undefined)?.parentId;
          const container = typeof parent === 'string' ? doc.getNode(parent) : undefined;
          if (fillsChildren(container)) return true;
          return container?.stype === 'frame' && laysOut(container.attributes);
        });
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

  /**
   * What one **child** of an arranging frame asks of it: fill it, or share what is left.
   *
   * A separate command from `setFrameLayout` because it is a separate decision, made about a
   * different node — the frame says *how* its children are arranged, and each child says how it
   * wants to be treated by that arrangement. Two rows in one frame, one filling its width and
   * one keeping its own, is an ordinary card.
   *
   * The arrangement runs in the same transaction for the same reason turning a layout on does:
   * a reader who presses 채우기 and watches nothing move has been told the button does nothing.
   */
  private async _setBox(editor: Editor, payload: any): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const ids: string[] = Array.isArray(payload?.nodeIds)
      ? payload.nodeIds.filter((sid: unknown): sid is string => typeof sid === 'string')
      : typeof payload?.nodeId === 'string'
        ? [payload.nodeId]
        : [];
    const attrs: Record<string, unknown> = {};
    if (typeof payload?.stretch === 'boolean') {
      // `false` is written as *absent*: a child that does not fill its frame is the ordinary
      // case, and an attribute saying so on every shape is noise in the file.
      attrs.layoutStretch = payload.stretch ? true : null;
    }
    if (typeof payload?.grow === 'number' && Number.isFinite(payload.grow)) {
      attrs.layoutGrow = payload.grow > 0 ? Math.max(0, payload.grow) : null;
    }
    if (ids.length === 0 || Object.keys(attrs).length === 0) return false;

    const steps: { type: string; payload: Record<string, unknown> }[] = ids.map((sid) => ({
      type: 'setAttrs',
      payload: { nodeId: sid, attrs }
    }));

    /** And the frames those children are in, arranged with the new answer in hand. */
    const frames = new Set<string>();
    for (const sid of ids) {
      const parent = (doc.getNode(sid) as { parentId?: unknown } | undefined)?.parentId;
      if (typeof parent === 'string') frames.add(parent);
    }
    for (const sid of frames) {
      const frame: any = doc.getNode(sid);
      if (frame?.stype !== 'frame' || !laysOut(frame.attributes)) continue;
      const children = childrenToLayOut(doc.getNode as never, frame.content).map((child) =>
        ids.includes(child.sid)
          ? {
              ...child,
              stretch: 'layoutStretch' in attrs ? attrs.layoutStretch === true : child.stretch,
              grow: 'layoutGrow' in attrs ? Math.max(0, Number(attrs.layoutGrow) || 0) : child.grow
            }
          : child
      );
      for (const [child, at] of layoutChildren(frame, children)) {
        steps.push({ type: 'setAttrs', payload: { nodeId: child, attrs: { ...at } } });
      }
    }

    return (await transaction(editor, steps as never).commit()).success;
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
        // The size as well, for a child that fills the frame or shares what is left of it —
        // the arrangement decides those the same way it decides a position.
        payload: { nodeId: sid, attrs: { ...at } }
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

    /**
     * What this pass has already decided, so a deeper container is arranged against its **new**
     * size rather than the one still in the document.
     *
     * Measured, and it is the fault that arrived with sizes. A placement gives the part that
     * fills it a new box; that part is usually a frame, and its own children have to be
     * arranged against the box it is *about to have*. Reading the document gave the old one, so
     * the rows came out 2800 wide inside a frame that was becoming 7800 — and the second pass
     * that would have fixed it never ran, because this reaction guards against re-entering while
     * its own write is in flight and nothing was pending once the guard cleared.
     *
     * A loop of passes would also have worked and would have cost a commit each. One walk,
     * parent before child, with what has been decided kept to hand, converges in a single
     * transaction for any depth.
     */
    const pending = new Map<string, Record<string, unknown>>();
    const attrsOf = (sid: string) => ({
      ...(doc.getNode(sid)?.attributes ?? {}),
      ...(pending.get(sid) ?? {})
    });
    /** The document as this pass now believes it to be. */
    const asDecided = ((sid: string) => {
      const node = doc.getNode(sid);
      return node ? { ...node, attributes: attrsOf(sid) } : undefined;
    }) as never;

    const decide = (results: Map<string, { x: number; y: number; width?: number; height?: number }>) => {
      for (const [child, at] of results) {
        steps.push({ type: 'setAttrs', payload: { nodeId: child, attrs: { ...at } } });
        pending.set(child, { ...(pending.get(child) ?? {}), ...at });
      }
    };

    const walk = (sid: string, depth: number) => {
      if (depth > 32 || seen.has(sid)) return;
      seen.add(sid);

      const node: any = doc.getNode(sid);
      if (!node) return;
      const settled = { attributes: attrsOf(sid) };

      if (node.stype === 'frame' && laysOut(settled.attributes)) {
        decide(layoutChildren(settled, childrenToLayOut(asDecided, node.content)));
      }

      /**
       * And a container that **sizes** what fills it — a card, and a card being edited.
       *
       * A placement's parts are no longer in the document, so this is now about the **definition**:
       * its own parts fill its box on its editing surface, or a reader designs one card and places
       * another. What a *placement* draws is answered by `instanceParts`, in the resolution, where
       * nothing has to be written at all.
       */
      if (fillsChildren(node)) {
        decide(fillChildren(settled, childrenToLayOut(asDecided, node.content)));
      }

      for (const child of Array.isArray(node.content) ? node.content : []) {
        if (typeof child === 'string') walk(child, depth + 1);
      }
    };

    walk(doc.rootId, 0);
    if (steps.length === 0) return;

    this._applying = true;
    try {
      /**
       * Not recorded, for the same reason a connector's remembered ends are not: an
       * arrangement is derived from the frame's settings and its children, and nobody
       * asked for it. Recorded, it made undo undo the *arrangement* — which this then
       * put straight back, because an undo is a document change and this runs on those.
       */
      await transaction(editor, steps as never, { recordInHistory: false }).commit();
    } finally {
      this._applying = false;
    }
  }
}

/** The layout commands, as an extension a kit can install. */
export function createLayoutCommands(): CanvasLayoutExtension {
  return new CanvasLayoutExtension();
}
