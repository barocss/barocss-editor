/**
 * Moving a block, copying it, and taking it away.
 *
 * ## The three a builder cannot be without
 *
 * A reader who can select a section and change its padding but cannot **move** it has a panel, not a
 * builder. These are the commands the pointer and the keyboard both reach, and they are here rather
 * than in the app for the reason every other rule in this package is: an app can only be tested with
 * a browser, and an off-by-one in a reorder is a drag that goes backwards — the one fault a reader
 * cannot explain and the one a unit test settles in a millisecond.
 *
 * ## Where a drag means something
 *
 * A page's stacks arrange their children, so a dragged block has no coordinate to land on: what a
 * drag can mean is **the order**. That answer is `office-canvas`'s `reorderIndexAt`, written for the
 * deck's arranged frames, and this is the third product agreeing with the first about something
 * neither knew the other needed. The site adds only the transaction.
 */
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { addChild, moveNode, node, removeChild, setAttrs, transaction } from '@barocss/model';
import { SELECTABLE } from './selection';

type Node = Record<string, any>;

export class SiteBlockExtension implements Extension {
  name = 'siteBlocks';
  priority = 47;

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

    /** Take the selected blocks off the page. */
    register(
      'removeBlocks',
      async (payload) => await this._remove(editor, payload),
      (payload) => this._chosen(editor, payload).length > 0
    );

    /**
     * A copy, **next to the original** rather than at the end of the stack.
     *
     * Which is why this is one `addChild` of an exported subtree rather than the store's own clone:
     * the clone appends, and a duplicate that jumps to the bottom of the page is a duplicate the
     * reader has to go and find. One step also means one entry in the history, which is what a
     * reader means by one gesture.
     */
    register(
      'duplicateBlocks',
      async (payload) => await this._duplicate(editor, payload),
      (payload) => this._chosen(editor, payload).length > 0
    );

    /**
     * What a **placement** answers.
     *
     * A card asks questions (`componentVar`) and a placement answers them (`componentValue`), and
     * until now the only way to answer one was to write the document by hand. This is the panel's
     * half of the deck's own mechanism: the header's wordmark, the button's label, the row's title.
     *
     * Add or replace, never both: a placement holds *its own* answers as children, so setting one
     * that is already there is an edit to that node and setting a new one is a child. Two shapes for
     * one gesture is how a panel comes to write two of the same answer.
     */
    register(
      'setComponentValue',
      async (payload) => await this._setValue(editor, payload),
      (payload) => this._canSetValue(editor, payload)
    );

    /**
     * What a **page** is called and where it answers.
     *
     * Its own command because a page is not a block: it is the board, `SELECTABLE` leaves it out on
     * purpose, and every other command here acts on a selection. A reader edits a page's address
     * from the panel with nothing selected, which is where every builder of this kind puts it.
     */
    register(
      'setPageInfo',
      async (payload) => await this._setPage(editor, payload),
      (payload) => {
        const node = this._store(editor)?.getNode(String(payload?.nodeId ?? ''));
        return node?.stype === 'surface' && (typeof payload?.name === 'string' || typeof payload?.path === 'string');
      }
    );

    /**
     * Put a block **into a stack, at a place** — the transaction half of a drag.
     *
     * Which place is `reorderIndexAt`'s answer, computed where the pointer is. This refuses only the
     * two things that are not moves: into itself, and into something it contains.
     */
    register(
      'moveBlockInto',
      async (payload) => await this._move(editor, payload),
      (payload) => this._canMove(editor, payload)
    );
  }

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    return (editor as never as { dataStore?: { getNode: (sid: string) => Node } }).dataStore;
  }

  /** The blocks a command is about: the ones named, or the ones selected. */
  private _chosen(editor: Editor, payload?: Record<string, unknown>): string[] {
    const store = this._store(editor);
    if (!store) return [];
    const named = Array.isArray(payload?.nodeIds)
      ? (payload!.nodeIds as unknown[]).filter((one): one is string => typeof one === 'string')
      : selectedNodeIds((editor as never as { selection?: never }).selection);
    return named.filter((sid) => {
      const node = store.getNode(sid);
      // A block, and one that something holds: the page itself is not a thing a reader can remove,
      // and neither is a node whose parent has gone.
      return !!node && SELECTABLE.has(String(node.stype)) && !!node.parentId;
    });
  }

  private async _remove(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const chosen = this._chosen(editor, payload);
    if (chosen.length === 0) return false;

    const steps = chosen.map((sid) => removeChild(String(store!.getNode(sid)!.parentId), sid));
    // The selection goes with them: a selection naming nodes that are gone is a panel describing
    // something nobody can see. `withLiveNodes` prunes it, and this says so out loud anyway.
    const done = (await transaction(editor, steps as never).commit()).success === true;
    if (done) {
      (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
        'setNode',
        { nodeIds: [] }
      );
    }
    return done;
  }

  private async _duplicate(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const chosen = this._chosen(editor, payload);
    if (chosen.length === 0) return false;

    const steps: unknown[] = [];
    const places: { parentId: string; at: number }[] = [];
    /*
     * Deepest-last, and each copy placed from the end backwards, so that copying two siblings does
     * not shift the second one's index out from under it — the same reason a multi-row delete works
     * from the bottom of a table.
     */
    const ordered = [...chosen].sort((a, b) => this._indexOf(store!, b) - this._indexOf(store!, a));
    for (const sid of ordered) {
      const node = store!.getNode(sid);
      const parentId = node?.parentId as string | undefined;
      if (!parentId) continue;

      const tree = (editor as never as { exportDocument?: (sid: string) => unknown }).exportDocument?.(sid);
      if (!tree) continue;

      const at = this._indexOf(store!, sid) + 1;
      steps.push(addChild(parentId, freshCopy(tree) as never, at));
      places.push({ parentId, at });
    }
    if (steps.length === 0) return false;
    if ((await transaction(editor, steps as never).commit()).success !== true) return false;

    /**
     * The copies are what is selected now.
     *
     * Which is what every tool of this kind does — a duplicate a reader can immediately move is the
     * point of duplicating it — and it is also the only way this command is *safe* to follow with
     * another one. Measured: after the copy, the selection came back as a **range** with its ends
     * rewritten into the new nodes, so `selectedNodeIds` answered nothing and the very next command
     * a reader pressed (`Delete`) refused. An edit rewrites the selection; a command that acted on a
     * set has to say what the set is afterwards rather than hope.
     */
    const copies = places
      .map(({ parentId, at }) => ((store!.getNode(parentId)?.content ?? []) as string[])[at])
      .filter((sid): sid is string => typeof sid === 'string');

    (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.('setNode', {
      nodeIds: copies
    });
    return true;
  }

  private _canSetValue(editor: Editor, payload?: Record<string, unknown>): boolean {
    const node = this._store(editor)?.getNode(String(payload?.nodeId ?? ''));
    return node?.stype === 'instance' && typeof payload?.name === 'string' && !!payload.name;
  }

  private async _setValue(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canSetValue(editor, payload)) return false;
    const store = this._store(editor)!;
    const placement = store.getNode(String(payload!.nodeId))!;
    const name = String(payload!.name);
    const value = payload!.value === undefined ? '' : String(payload!.value);

    const already = ((placement.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .map((sid) => store.getNode(sid))
      .find((child) => child?.stype === 'componentValue' && child?.attributes?.name === name);

    const step = already
      ? setAttrs(String(already.sid), { value })
      : /*
         * At the front, because the content model is `componentValue* (scene | frame)*` — the answers
         * come before the parts, which is also the order a reader wants to see them in a file.
         */
        addChild(String(placement.sid), node('componentValue', { name, value }, []) as never, 0);

    return (await transaction(editor, [step] as never).commit()).success === true;
  }

  private async _setPage(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const store = this._store(editor);
    const node = store?.getNode(String(payload?.nodeId ?? ''));
    if (node?.stype !== 'surface') return false;

    const attrs: Record<string, unknown> = {};
    if (typeof payload?.name === 'string') attrs.name = payload.name;
    if (typeof payload?.path === 'string') attrs.path = payload.path;
    if (Object.keys(attrs).length === 0) return false;

    return (
      (await transaction(editor, [setAttrs(String(node.sid), attrs)] as never).commit()).success === true
    );
  }

  private _indexOf(store: { getNode: (sid: string) => Node | undefined }, sid: string): number {
    const parent = store.getNode(String(store.getNode(sid)?.parentId ?? ''));
    return ((parent?.content ?? []) as unknown[]).indexOf(sid);
  }

  private _canMove(editor: Editor, payload?: Record<string, unknown>): boolean {
    const store = this._store(editor);
    const nodeId = payload?.nodeId;
    const parentId = payload?.parentId;
    if (!store || typeof nodeId !== 'string' || typeof parentId !== 'string') return false;
    if (!store.getNode(nodeId) || !store.getNode(parentId)) return false;

    // Into itself, or into something it holds: a move that would make the document its own child.
    let at: string | undefined = parentId;
    let depth = 0;
    while (at && depth++ < 64) {
      if (at === nodeId) return false;
      at = store.getNode(at)?.parentId as string | undefined;
    }
    return true;
  }

  private async _move(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canMove(editor, payload)) return false;
    const position = typeof payload!.index === 'number' ? Math.max(0, Math.round(payload!.index as number)) : undefined;

    const done = await transaction(editor, [
      moveNode(String(payload!.nodeId), String(payload!.parentId), position)
    ] as never).commit();
    return done.success === true;
  }
}

export function createBlockCommands(): Extension {
  return new SiteBlockExtension();
}

/**
 * A copy with **no identities in it**.
 *
 * A subtree exported from the store still carries every sid it had, and adding it back would be two
 * nodes claiming one id — the store hands them out and nothing else may. `forFile` in the deck does
 * exactly this for a different reason (a saved file's references must survive being reopened, and a
 * sid does not), and a third caller is the point at which it should move into the shared layer;
 * recorded rather than moved, because moving it is a change to a product whose suite is not what
 * this slice is about.
 */
function freshCopy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(freshCopy);
  if (!node || typeof node !== 'object') return node;

  const { sid, parentId, ...rest } = node as Record<string, unknown>;
  void sid;
  void parentId;

  const out: Record<string, unknown> = { ...rest };
  if (Array.isArray((node as { content?: unknown }).content)) {
    out.content = ((node as { content: unknown[] }).content).map(freshCopy);
  }
  return out;
}
