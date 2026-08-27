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
import { addChild, node, textNode, transaction } from '@barocss/model';
import type { INode } from '@barocss/datastore';
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

/**
 * The words in a block.
 *
 * `textNode` rather than the object it becomes — the same reason the operations are builders now: a
 * misspelt `stype` is a compile error rather than a node the schema refuses at runtime. `node` and
 * `textNode` have been in `@barocss/model` since it was written, beside the operation builders that
 * nobody could import.
 */
const run = (text = ''): INode => textNode('inline-text', text);

/** 15 twips to the CSS pixel — the document's unit, written as the number a reader is shown. */
const px = (value: number): number => value * 15;

/**
 * The colour a new button arrives in.
 *
 * A literal rather than `var:강조`, and it is worth the sentence: a token is resolved against the
 * *document*, and a document that has not declared one would draw a button with no colour at all —
 * a reader's first button, on their first page, invisible. A reader who has tokens changes it in one
 * gesture; a reader who has none gets a button.
 */
const ACCENT = '#0F7A5A';
const ACCENT_DARK = '#0B5C44';

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
    register('insertHeading', () => node('heading', { level: 2 }, [run('제목')]) as Node);

    /**
     * Words.
     *
     * `insertBodyText` rather than `insertText`, which is the shared kit's name for **typing** — two
     * commands with one name is one of them being unreachable, and the check that counts what a
     * reader can run would not have seen which.
     */
    register('insertBodyText', () => node('paragraph', {}, [run('본문을 입력하세요')]) as Node);

    /** A picture, with a place for a picture in it. */
    register(
      'insertPicture',
      () => node('picture', { src: PLACEHOLDER, alt: '', fit: 'cover', sizing: 'fill' }, []) as Node
    );

    /**
     * A list of things, with one thing in it a reader can type over.
     *
     * `type`, which is what the schema declares. It said `kind: 'bullet'` from the day it was
     * written — an attribute nothing reads, on the one node whose whole question is *which kind* —
     * and nothing noticed because the marker came from Word's numbering and a site has none, so
     * every list drew as a stack of paragraphs whichever word was used.
     */
    register(
      'insertBulletList',
      () =>
        node('list', { type: 'bullet' }, [
          node('listItem', {}, [node('paragraph', {}, [run('항목')])])
        ]) as Node
    );

    /** And the other kind, which is `<ol>` and is the browser's to number. */
    register(
      'insertNumberList',
      () =>
        node('list', { type: 'ordered' }, [
          node('listItem', {}, [node('paragraph', {}, [run('항목')])])
        ]) as Node
    );

    /**
     * A **quotation**.
     *
     * `blockQuote` holds blocks rather than words — `content: 'block+'` — which is the standard
     * schema's answer and the right one: a pulled-out quotation on a page is usually two sentences
     * and an attribution, and a node that held only inline content could not carry the second.
     */
    register(
      'insertQuote',
      () =>
        node('blockQuote', {}, [
          node('paragraph', {}, [run('인용할 문장을 여기에 씁니다.')]),
          node('paragraph', {}, [run('— 말한 사람')])
        ]) as Node
    );

    /**
     * A **rule** between two things.
     *
     * An atom — it holds nothing and is the one block on a page that is purely a division. A frame
     * with a top border would have drawn the same line and would have been a box a reader could put
     * things in by accident, which is the difference between a separator and a container.
     */
    register('insertRule', () => node('horizontalRule', {}, []) as Node);

    /*
     * There is no `insertCode`, and its absence is on the record — see `toolbar-model.ts`.
     *
     * The node is fixed and draws; what it needs is a mode, because inside code Enter is a newline
     * and every formatting command is meaningless. A command nothing can reach would fail
     * `every-command-can-be-seen`, and a button that makes a block a reader cannot type into is
     * worse than no button.
     */

    /**
     * A **button**: the one thing on a page that is a composition rather than a node.
     *
     * ## Why it is not a node
     *
     * There is no `button` in this schema and there should not be. A button is a box with a word in
     * it, a colour, a radius, a hit area and — since states — an answer to the pointer; every one of
     * those is a thing a frame already says, and a node would be a second way to say them that the
     * panel would then have to offer twice. The deck reached the same conclusion about its own
     * shapes, one product earlier.
     *
     * ## Then why is it a command
     *
     * Because *the composition* is the knowledge. A reader who wants a button and is handed a frame
     * has to know that a hit area is 44 high, that a border must exist before it can change colour,
     * that the radius is the pill and not the box, and that a hover which changes the padding
     * flickers. That is four decisions and a paragraph of arithmetic, and putting them in a command
     * is how a product has taste rather than opinions.
     *
     * The link is left empty on purpose: a reader chooses the page, and the mark is `linkToPage`'s
     * to write. A button with a made-up destination is worse than one with none.
     */
    register(
      'insertButton',
      () =>
        node(
          'frame',
          {
            name: '버튼',
            layoutMode: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            sizing: 'hug',
            // A target a thumb can hit: 44 is what every guideline asks for, and this is 20 + 12 + 12.
            paddingTop: px(12),
            paddingBottom: px(12),
            paddingLeft: px(20),
            paddingRight: px(20),
            fill: ACCENT,
            cornerRadius: px(40),
            /*
             * A border that is already the width it will be, so only its colour changes later — a
             * border that grows on hover reflows the words inside it and the box leaves the pointer.
             */
            stroke: ACCENT,
            strokeWidth: px(1),
            states: { hover: { fill: ACCENT_DARK, stroke: ACCENT_DARK } }
          },
          [node('paragraph', {}, [run('버튼')]) as never]
        ) as Node
    );

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
          node('instance', { componentId: String(payload?.componentId ?? ''), sizing: 'fill' }, []) as Node,
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
          node(
            'collection',
            {
              source: String(payload?.source ?? ''),
              layoutMode: 'row',
              gap: 240,
              padding: 0,
              sizing: 'fill'
            },
            [node('instance', { componentId: String(payload?.componentId ?? ''), sizing: 'fill' }, [])]
          ) as Node,
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
      addChild(where.parentId, child as never, where.at)
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
