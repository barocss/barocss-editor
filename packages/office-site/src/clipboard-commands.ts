import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { addChild, transaction } from '@barocss/model';
import { SELECTABLE } from './selection';

/**
 * Copying **blocks** — the gesture a builder had no answer for.
 *
 * ## What was there before this
 *
 * `cut`, `copy` and `paste` are registered by the shared kit and they are the **text** ones: they
 * take a range selection and refuse anything else, which is right. A reader holding a card has no
 * range, so all three refused, correctly, every time — and the menu greyed them, honestly. Measured
 * from the other end: ⌘D was the only way to get a second copy of anything, and there was **no way
 * at all** to move a block from one page to another.
 *
 * Which is the same finding `moveBlockUp` produced, in the same place, for the same reason: what a
 * reader means by ⌘C depends entirely on what kind of selection they have, and the shared kit's
 * answer is the one for a caret.
 *
 * ## Why this is not the deck's, either
 *
 * `SlidesClipboardExtension` is 400 lines because a slide has **coordinates**: a box copied out of a
 * frame and pasted onto a slide has to arrive with different numbers to stay in the same place, so
 * the payload converts on the way out and back on the way in. A page is a **flow**. A block has no
 * x, no y and no z-order; where it lands is a parent and a place in that parent's content, and both
 * of those are the paste's to decide. There is nothing to convert.
 *
 * ## Two clipboards, for the reason the deck gives
 *
 * The system clipboard is what carries a block to another tab, and JSON in text is the only format
 * two windows are certain to agree on. But reading it needs a permission the browser may refuse and
 * writing it needs a gesture a test does not have — so this keeps its own copy as well, and a paste
 * prefers the system's when it can read one. Without the fallback, copy and paste inside one site
 * would work only where the permission happened to be granted, which is a feature that works on the
 * developer's machine.
 */

type Node = Record<string, any>;

/** What a copied selection looks like on the clipboard. */
interface Payload {
  /** Recognises our own writing, so pasted prose is not mistaken for a block. */
  barocssSite: 1;
  /** The blocks, as trees with no sids — `addChild` gives them new ones. */
  blocks: Node[];
}

const MARKER = 'barocssSite';

export class SiteClipboardExtension implements Extension {
  name = 'site-clipboard';
  priority = 46;

  /**
   * The last thing copied here.
   *
   * Deliberately not the document's: a clipboard is a property of the person, not of the site, and
   * two people editing one site do not share one.
   */
  private _held: Payload | null = null;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: Record<string, unknown>) => Promise<boolean>,
      can: (payload?: Record<string, unknown>) => boolean
    ) =>
      editor.registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) => await execute(payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    register(
      'copyBlocks',
      (payload) => this._copy(editor, payload),
      (payload) => this._chosen(editor, payload).length > 0
    );

    /**
     * Cut is copy and then remove, in that order and in **one** command.
     *
     * Not two commands from the app, which would put two entries in the history — a reader pressing
     * undo after a cut expects the blocks back, once.
     */
    register(
      'cutBlocks',
      (payload) => this._cut(editor, payload),
      (payload) => this._chosen(editor, payload).length > 0
    );

    /**
     * Paste **after what is selected**, in its parent.
     *
     * Which is `duplicateBlocks`' answer to the same question and for the same reason: a copy that
     * jumps to the bottom of the page is a copy the reader has to go and find. With nothing
     * selected it lands at the end of the page the reader is looking at, which only the app knows —
     * so `pageId` is the app's to give, the way it is for every other insert here.
     *
     * `canExecute` cannot ask the **system** clipboard whether it holds a block: reading it is
     * asynchronous and may prompt. So it answers for what this extension is holding, and a paste
     * that finds nothing does nothing.
     */
    register(
      'pasteBlocks',
      (payload) => this._paste(editor, payload),
      (payload) => this._held !== null && !!this._into(editor, payload)
    );
  }

  // ── Reading ────────────────────────────────────────────────────────────────

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    return editor.dataStore as { getNode: (sid: string) => Node | undefined } | undefined;
  }

  /**
   * The blocks a command is about: the ones named, or the ones selected.
   *
   * `_chosen`'s shape, and filtered to what a reader can actually hold — a range selection whose
   * ends happen to name a run of text is not two blocks.
   */
  private _chosen(editor: Editor, payload?: Record<string, unknown>): string[] {
    const store = this._store(editor);
    if (!store) return [];
    const named = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : undefined;
    const ids = named ?? selectedNodeIds(editor.selection) ?? [];
    return ids.filter((sid) => SELECTABLE.has(String(store.getNode(sid)?.stype)));
  }

  // ── Copying ────────────────────────────────────────────────────────────────

  private async _copy(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const chosen = this._chosen(editor, payload);
    if (!store || chosen.length === 0) return false;

    /*
     * In the document's own order, whatever order the selection was made in. A reader who shift-picks
     * the third card and then the first and pastes expects them back the way round they are on the
     * page — the selection is a *set*, and a set has no order to preserve.
     */
    const blocks = [...chosen]
      .sort((a, b) => this._indexOf(store, a) - this._indexOf(store, b))
      .map((sid) => editor.exportDocument(sid))
      .filter((tree): tree is Node => !!tree)
      .map((tree) => stripped(tree) as Node);

    if (blocks.length === 0) return false;

    this._held = { barocssSite: 1, blocks };
    await this._write(this._held);
    return true;
  }

  private async _cut(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!(await this._copy(editor, payload))) return false;
    // Through the command rather than by hand, so cutting refuses exactly what removing refuses.
    return (await editor.executeCommand('removeBlocks', payload)) === true;
  }

  // ── Pasting ────────────────────────────────────────────────────────────────

  /** Where a paste would land: `{parentId, at}`, or nothing when there is nowhere. */
  private _into(
    editor: Editor,
    payload?: Record<string, unknown>
  ): { parentId: string; at: number } | undefined {
    const store = this._store(editor);
    if (!store) return undefined;

    // After the **last** of what is selected, so pasting three cards keeps them together.
    const chosen = this._chosen(editor, payload);
    if (chosen.length > 0) {
      const last = [...chosen].sort((a, b) => this._indexOf(store, a) - this._indexOf(store, b)).pop()!;
      const parentId = store.getNode(last)?.parentId as string | undefined;
      if (parentId) return { parentId, at: this._indexOf(store, last) + 1 };
    }

    // Otherwise the end of the page on screen, which is the app's to name.
    const where = payload?.pageId ?? payload?.parentId;
    if (typeof where !== 'string') return undefined;
    const page = store.getNode(where);
    if (!page) return undefined;
    return { parentId: where, at: ((page.content ?? []) as unknown[]).length };
  }

  private async _paste(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const held = (await this._read()) ?? this._held;
    const into = this._into(editor, payload);
    if (!store || !held || held.blocks.length === 0 || !into) return false;

    /*
     * Placed from the last backwards at one index, so the blocks arrive in the order they were
     * copied in — inserting at a fixed place pushes what is already there along, and inserting
     * forwards would reverse them.
     */
    const steps = [...held.blocks]
      .reverse()
      .map((block) => addChild(into.parentId, stripped(block) as never, into.at));

    if ((await transaction(editor, steps as never).commit()).success !== true) return false;

    /**
     * The pasted blocks are what is selected now — `duplicateBlocks`' rule and its reason.
     *
     * A paste a reader can immediately move is the point of pasting, and it is also the only way the
     * command is safe to follow with another one: an edit rewrites the selection, and a command that
     * acted on a set has to say what the set is afterwards rather than hope.
     */
    const content = (store.getNode(into.parentId)?.content ?? []) as string[];
    const landed = content
      .slice(into.at, into.at + held.blocks.length)
      .filter((sid): sid is string => typeof sid === 'string');

    void editor.executeCommand('setNode', { nodeIds: landed });
    return true;
  }

  // ── The system clipboard, which may refuse ─────────────────────────────────

  private async _write(payload: Payload): Promise<void> {
    try {
      await navigator?.clipboard?.writeText?.(JSON.stringify(payload));
    } catch {
      // Refused, or no permission, or no clipboard at all. `_held` is the answer either way.
    }
  }

  private async _read(): Promise<Payload | null> {
    try {
      const text = await navigator?.clipboard?.readText?.();
      if (!text) return null;
      const parsed = JSON.parse(text) as Payload;
      // Ours, and shaped the way this version writes it. Anything else is somebody's prose.
      return parsed && (parsed as never as Record<string, unknown>)[MARKER] === 1 && Array.isArray(parsed.blocks)
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  private _indexOf(store: { getNode: (sid: string) => Node | undefined }, sid: string): number {
    const parentId = store.getNode(sid)?.parentId as string | undefined;
    if (!parentId) return -1;
    return ((store.getNode(parentId)?.content ?? []) as unknown[]).indexOf(sid);
  }
}

/**
 * The same tree with every `sid` and `parentId` taken out.
 *
 * A copy that kept them would be a second node claiming the first one's identity, and `addChild`
 * honours a `sid` a caller provides — so the strip is what makes this a copy rather than a move.
 * Applied twice on purpose: on the way onto the clipboard, and again on the way off it, because a
 * payload may have come from another tab and a paste must not trust what it reads.
 */
function stripped(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripped);
  if (!node || typeof node !== 'object') return node;

  const { sid, parentId, ...rest } = node as Record<string, unknown>;
  void sid;
  void parentId;

  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray((node as { content?: unknown }).content)) {
    out.content = ((node as { content: unknown[] }).content).map(stripped);
  }
  return out;
}
