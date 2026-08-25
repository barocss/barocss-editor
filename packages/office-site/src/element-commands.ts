/**
 * Putting something **on** a page — a heading, some words, a picture, a list.
 *
 * ## The hole this fills
 *
 * The product could make three kinds of stack and nothing to put in them. A reader could arrange an
 * empty page beautifully. Measured against the sample the panel was built from: of the eight kinds of
 * block on the site, a reader could create three, and all three were containers.
 *
 * ## Where a new block goes
 *
 * One rule, and every builder of this kind uses it because it is the only one a reader can predict:
 *
 * - **Into the container that is selected**, at the end of it. Selecting a section and adding a
 *   heading means the heading goes in the section — which is what a reader means and what a stack is
 *   *for*.
 * - **After the block that is selected**, otherwise. A heading selected and another added makes two
 *   headings, in the order they were made.
 * - **After whatever the caret is in**, when nothing is selected — the walk both other products do,
 *   and the reason "insert" means *next to what I am looking at* everywhere in this repository.
 * - **At the end of the page**, when there is no caret either. Which is the state a reader is
 *   actually in when they open a site and reach for the rail, and without it every row in 추가 was
 *   greyed out on a freshly opened page — a panel of things a reader may not have.
 *
 * ## One command per kind
 *
 * Rather than `insertBlock({ kind })`, which is the rule the conformance harness enforces and is
 * right here for the reason it is right everywhere: a control that could only answer "it depends"
 * about what it makes is a control nobody can put on a toolbar or bind to a key.
 */
import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { CONTAINERS, SELECTABLE } from './selection';

type Node = Record<string, any>;

/** What a new block is put next to, and where. */
interface Where {
  parentId: string;
  at: number;
}

/**
 * A picture with nothing in it yet.
 *
 * An SVG data URI rather than a blank `src`, for the reason the sample avoids assets and for one
 * more: a `picture` with no source draws a broken image, and a reader who has just added one should
 * see a *place for a picture* rather than a fault. The panel is where they put theirs.
 */
const PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">' +
      '<rect width="320" height="200" fill="#e2e8f0"/>' +
      '<text x="160" y="108" font-family="sans-serif" font-size="16" fill="#64748b" text-anchor="middle">이미지</text>' +
      '</svg>'
  );

const run = (text = ''): Node => ({ stype: 'inline-text', text });

export class SiteElementExtension implements Extension {
  name = 'siteElements';
  priority = 48;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      make: () => Node,
      can: (payload?: Record<string, unknown>) => boolean = (payload) =>
        !!this._where(editor, payload?.selection, payload?.pageId)
    ) =>
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
          await this._put(editor, make(), payload),
        canExecute: (_ed: Editor, payload?: Record<string, unknown>) => can(payload)
      });

    /** A heading. Level 2, because a page has one level 1 and it is the page's own title. */
    register('insertHeading', () => ({
      stype: 'heading',
      attributes: { level: 2 },
      content: [run('제목')]
    }));

    /**
     * Words.
     *
     * `insertBodyText` rather than `insertText`, which is the shared kit's name for **typing** — two
     * commands with one name is one of them being unreachable, and the check that counts what a
     * reader can run would not have seen which.
     */
    register('insertBodyText', () => ({
      stype: 'paragraph',
      attributes: {},
      content: [run('본문을 입력하세요')]
    }));

    /** A picture, with a place for a picture in it. */
    register('insertPicture', () => ({
      stype: 'picture',
      attributes: { src: PLACEHOLDER, alt: '', fit: 'cover', sizing: 'fill' },
      content: []
    }));

    /** A list of things, with one thing in it a reader can type over. */
    register('insertBulletList', () => ({
      stype: 'list',
      attributes: { kind: 'bullet' },
      content: [
        {
          stype: 'listItem',
          attributes: {},
          content: [{ stype: 'paragraph', attributes: {}, content: [run('항목')] }]
        }
      ]
    }));

    /**
     * A **placement** of a definition — the header, the button, the card.
     *
     * The one insert that takes an argument, because a placement without a definition is a placement
     * of nothing. The panel offers the definitions the document holds; this refuses a name it does
     * not have, rather than putting an empty box on the page.
     */
    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'insertPlacement',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
        await this._put(
          editor,
          {
            stype: 'instance',
            attributes: { componentId: String(payload?.componentId ?? ''), sizing: 'fill' },
            content: []
          },
          payload
        ),
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        !!this._where(editor, payload?.selection, payload?.pageId) &&
        this._hasComponent(editor, payload?.componentId)
    });

    /**
     * A **list that comes from data**: one design, drawn once per row.
     *
     * Two arguments, and both are required for the same reason `insertPlacement` needs one — a list
     * with no data draws nothing, and a list with nothing to draw for each row draws nothing either.
     * The panel offers a dataset and a definition; the command refuses anything else.
     */
    (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
      name: 'insertDataList',
      execute: async (_ed: Editor, payload?: Record<string, unknown>) =>
        await this._put(
          editor,
          {
            stype: 'collection',
            attributes: {
              source: String(payload?.source ?? ''),
              layoutMode: 'row',
              gap: 240,
              padding: 0,
              sizing: 'fill'
            },
            content: [
              {
                stype: 'instance',
                attributes: { componentId: String(payload?.componentId ?? ''), sizing: 'fill' },
                content: []
              }
            ]
          },
          payload
        ),
      canExecute: (_ed: Editor, payload?: Record<string, unknown>) =>
        !!this._where(editor, payload?.selection, payload?.pageId) &&
        this._hasComponent(editor, payload?.componentId) &&
        this._hasDataset(editor, payload?.source)
    });
  }

  private _store(editor: Editor): { getNode: (sid: string) => Node | undefined } | undefined {
    return (editor as never as { dataStore?: { getNode: (sid: string) => Node } }).dataStore;
  }

  private _resource(editor: Editor, holder: string, stype: string, name: unknown, key: string): boolean {
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId || typeof name !== 'string' || !name) return false;

    const root = store.getNode(rootId);
    const box = ((root?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .find((child) => child?.stype === holder);

    return ((box?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .some((one) => one?.stype === stype && one?.attributes?.[key] === name);
  }

  private _hasComponent(editor: Editor, id: unknown): boolean {
    return this._resource(editor, 'components', 'component', id, 'id');
  }

  private _hasDataset(editor: Editor, name: unknown): boolean {
    return this._resource(editor, 'resources', 'dataset', name, 'name');
  }

  /** Where a new block goes — see the header for the rule. */
  private _where(editor: Editor, given?: unknown, page?: unknown): Where | null {
    const store = this._store(editor);
    if (!store) return null;

    const chosen = selectedNodeIds((editor as never as { selection?: never }).selection).filter((sid) =>
      store.getNode(sid)
    );

    if (chosen.length === 1) {
      const node = store.getNode(chosen[0])!;
      // Into the container that is selected: what a reader means, and what a stack is for.
      if (CONTAINERS.has(String(node.stype))) {
        return { parentId: chosen[0], at: ((node.content ?? []) as unknown[]).length };
      }
      // After the block that is selected.
      const parent = node.parentId ? store.getNode(String(node.parentId)) : undefined;
      const at = ((parent?.content ?? []) as unknown[]).indexOf(chosen[0]);
      if (parent && at >= 0) return { parentId: String(parent.sid), at: at + 1 };
    }

    const caret = this._atCaret(editor, given);
    if (caret) return caret;

    /*
     * Nothing selected and no caret: the end of the page the reader is looking at.
     *
     * The page is the app's to say — the model has no notion of "on screen" and should not grow one
     * — so the rail passes it. Without this, opening a site and reaching for 추가 offered a list of
     * things every one of which was greyed out.
     */
    const pageId = typeof page === 'string' ? page : undefined;
    const node = pageId ? store.getNode(pageId) : undefined;
    return node ? { parentId: pageId!, at: ((node.content ?? []) as unknown[]).length } : null;
  }

  /**
   * After whatever the caret is in — the same walk both other products do.
   *
   * Up from what the selection names until it reaches something whose parent lists it and is not a
   * paragraph, which is a *block*.
   */
  private _atCaret(editor: Editor, given?: unknown): Where | null {
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
        SELECTABLE.has(String(node.stype))
      ) {
        return { parentId: String(parent.sid), at: at + 1 };
      }
      node = parent;
    }
    return null;
  }

  /**
   * Put it there, and **select it**.
   *
   * Selected because a reader who has just added a block is about to say something about it — where
   * it sits, what it is called, what colour it is — and a panel showing the thing they added is the
   * difference between a tool and a list of buttons. It is also the rule `duplicateBlocks` learned
   * the hard way: a command that acted on a set has to say what the set is afterwards.
   */
  private async _put(editor: Editor, child: Node, payload?: Record<string, unknown>): Promise<boolean> {
    const where = this._where(editor, payload?.selection, payload?.pageId);
    if (!where) return false;

    const store = this._store(editor)!;
    const done = await transaction(editor, [
      { type: 'addChild', payload: { parentId: where.parentId, child, position: where.at } }
    ] as never).commit();
    if (done.success !== true) return false;

    const made = ((store.getNode(where.parentId)?.content ?? []) as string[])[where.at];
    if (made) {
      (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.(
        'setNode',
        { nodeIds: [made] }
      );
    }
    return true;
  }
}

export function createElementCommands(): Extension {
  return new SiteElementExtension();
}
