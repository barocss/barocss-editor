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
import { addChild, moveNode, node, removeChild, setAttrs, transaction, transformNode } from '@barocss/model';
import { detachedCopyOf, instanceParts } from '@barocss/office-canvas';
import { definitionsOf } from './components';
import { SELECTABLE, TEXTUAL } from './selection';

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
     * Stop following the component: an instance becomes ordinary blocks.
     *
     * ## Why a product needs the way back
     *
     * `createComponentFrom` is a one-way door without this. A reader who makes a component out of a
     * card and then finds one page wants it different has no move left — and readers who cannot get
     * back out stop going in, which is how a component library ends up with two entries and a
     * repository full of copied cards.
     *
     * ## What it becomes, and what it keeps
     *
     * A **frame**, not loose blocks: the reader arranged those pieces against each other, and a
     * detach that scattered them across the page would have destroyed the thing they were detaching.
     * A page has no `group` — that is a z-order over placed shapes and a page places nothing — so
     * the frame is the shape a stack of blocks already has here.
     *
     * It keeps what it was **drawing one press ago**, values and all: the resolved parts, not the
     * component's own placeholder text. Detaching the third product card leaves the third product
     * on the page.
     *
     * ## The one it refuses
     *
     * A data list's card. That instance is not on the page — it is the thing the list draws once per
     * row — and detaching it would leave a list with nothing to draw and a stray card beside it.
     * Which is a reader asking for something else: to stop the list being a list.
     */
    register(
      'detachComponent',
      async (payload) => await this._detach(editor, payload),
      (payload) => !!this._detachable(editor, payload)
    );

    /**
     * Where a part's **words** come from — the wall a template hit.
     *
     * ## What could not be done
     *
     * A card asks questions and a list answers them with columns, and both halves were reachable:
     * a reader could rewire which column feeds which slot. What they could not do was make a **new**
     * slot. `componentVar` and `componentBind` could be written by hand and by nothing else, so a
     * card was stuck with whatever questions its author had thought of — add a 할인 column to the
     * data and there is nowhere on the card for it to go.
     *
     * That is the point at which a component system stops being a system. A template that cannot
     * grow is a drawing somebody made once.
     *
     * ## One command, because it is one sentence
     *
     * *This text comes from the card's data, and the question is called 할인.* Naming a question that
     * does not exist declares it; naming one that does binds to it; naming nothing unbinds. Three
     * outcomes, one gesture — which is the rule `setBlockFormat` already follows about widths and
     * states, for the same reason: a reader who has to choose between two commands has been handed
     * the editor's bookkeeping.
     *
     * ## The two things it does that a reader never sees
     *
     * A binding names a part by its **`partId`**, which is durable where a sid is not — and a block a
     * reader added inside a definition has none, because nothing has ever needed to name it. So one
     * is minted, from the words the part holds, deduped inside that definition.
     *
     * And a new question is declared holding **the part's current words** as its default. A placement
     * that answers nothing then draws what the card already drew, so declaring a question cannot
     * empty a page — which is the property that makes it safe to try.
     */
    register(
      'bindPartText',
      async (payload) => await this._bindPart(editor, payload),
      (payload) => !!this._partAt(editor, payload?.nodeId)
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
     * Turn what a reader has already built into a **definition**, and leave a placement in its place.
     *
     * ## Why this is the command that makes components usable
     *
     * A definition written by hand is a definition nobody makes. Every tool of this kind has this
     * one gesture — *make this reusable* — and it is the only way a component library ever gets a
     * second entry: a reader builds a card, likes it, and says so.
     *
     * ## What it does, and the one thing it refuses
     *
     * The block moves into the library and a placement of it takes its old place, so the page is
     * unchanged at the instant it runs — which is the property that makes it safe to try. From then
     * on the two are the same thing: editing the definition changes the page, because the placement
     * draws the definition rather than a copy of it.
     *
     * It refuses a block that is **already inside a definition**. A definition that holds a
     * placement of itself is an infinite descent, and `instanceParts` refuses to draw one — but by
     * then a reader has a document that cannot be drawn. Refusing here is refusing while it is still
     * a gesture.
     */
    register(
      'createComponentFrom',
      async (payload) => await this._makeComponent(editor, payload),
      (payload) => this._canMakeComponent(editor, payload)
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

  /** The library, made if the document has not got one yet. */
  private _library(editor: Editor): { sid?: string; rootId: string } | null {
    const store = this._store(editor);
    const rootId = (editor as never as { getRootId?: () => string })?.getRootId?.();
    if (!store || !rootId) return null;

    const root = store.getNode(rootId);
    const box = ((root?.content ?? []) as string[])
      .map((sid) => store.getNode(sid))
      .find((child) => child?.stype === 'components');
    return { sid: box?.sid as string | undefined, rootId };
  }

  private _canMakeComponent(editor: Editor, payload?: Record<string, unknown>): boolean {
    const store = this._store(editor);
    const chosen = this._chosen(editor, payload);
    if (!store || chosen.length !== 1 || !this._library(editor)) return false;

    /*
     * Not something already inside a definition. A definition that holds a placement of itself
     * cannot be drawn, and refusing here is refusing while it is still a gesture.
     */
    let at: string | undefined = chosen[0];
    let depth = 0;
    while (at && depth++ < 64) {
      if (store.getNode(at)?.stype === 'component') return false;
      at = store.getNode(at)?.parentId as string | undefined;
    }
    // A frame or a collection: something with a shape worth reusing, rather than one paragraph.
    return ['frame', 'collection'].includes(String(store.getNode(chosen[0])?.stype));
  }

  private async _makeComponent(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    if (!this._canMakeComponent(editor, payload)) return false;

    const store = this._store(editor)!;
    const sid = this._chosen(editor, payload)[0];
    const block = store.getNode(sid)!;
    const parentId = String(block.parentId);
    const at = this._indexOf(store, sid);

    const tree = (editor as never as { exportDocument?: (sid: string) => unknown }).exportDocument?.(sid);
    if (!tree) return false;

    const taken = new Set(definitionsOf({ rootId: (editor as never as { getRootId: () => string }).getRootId(), getNode: (one: string) => store.getNode(one) } as never).map((one) => one.id));
    const name = typeof payload?.name === 'string' && payload.name ? payload.name : '새 블록';
    const id = unique(name, taken);

    const library = this._library(editor)!;
    const steps: unknown[] = [];

    /*
     * The library, made if the document has not got one.
     *
     * A site that has never had a definition has no `components` container, and the document's
     * content model says where one goes: `docMeta? surface+ resources? components? variables?`. So
     * it lands **before the variables** if there are any, and at the end otherwise — appending
     * blindly would put it after them and the document would stop matching its own schema.
     *
     * `$alias` is how one transaction names a node it is about to create: the store registers it
     * while the overlay is open, so the step after this one can say where the definition goes
     * without knowing an id that does not exist yet.
     */
    const into = library.sid ?? '$library';
    if (!library.sid) {
      const siblings = ((store.getNode(library.rootId)?.content ?? []) as string[]);
      const variables = siblings.findIndex((one) => store.getNode(one)?.stype === 'variables');
      steps.push(
        addChild(
          library.rootId,
          node('components', { $alias: '$library' }, []) as never,
          variables >= 0 ? variables : siblings.length
        )
      );
    }

    steps.push(
      addChild(into, node('component', { id, name }, [freshCopy(tree) as never]) as never),
      // The page is unchanged at the instant this runs, which is what makes it safe to try.
      removeChild(parentId, sid),
      addChild(parentId, node('instance', { componentId: id, sizing: block.attributes?.sizing ?? 'fill' }, []) as never, at)
    );

    const done = await transaction(editor, steps as never).commit();
    if (done.success !== true) return false;

    const placed = ((store.getNode(parentId)?.content ?? []) as string[])[at];
    if (placed) {
      (editor as never as { executeCommand?: (n: string, p?: unknown) => void }).executeCommand?.('setNode', {
        nodeIds: [placed]
      });
    }
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

  /**
   * The part a binding would be about, and the definition it is inside.
   *
   * Both or neither: a heading on a page is nobody's part, and a command that bound one would write
   * a `componentBind` into a document that has nothing to resolve it.
   */
  private _partAt(
    editor: Editor,
    nodeId: unknown
  ): { part: Record<string, any>; definition: Record<string, any> } | undefined {
    const store = this._store(editor);
    const part = store?.getNode(String(nodeId ?? ''));
    if (!part || !TEXTUAL.has(String(part.stype))) return undefined;

    let at: string | undefined = String(part.parentId ?? '');
    for (let hop = 0; at && hop < 64; hop += 1) {
      const one = store!.getNode(at);
      if (!one) return undefined;
      if (one.stype === 'component') return { part, definition: one };
      at = one.parentId as string | undefined;
    }
    return undefined;
  }

  /** The words a part holds, for naming a question after them and for its default. */
  private _wordsIn(editor: Editor, sid: string, depth = 0): string {
    const store = this._store(editor);
    const one = store?.getNode(sid);
    if (!one || depth > 8) return '';
    if (typeof one.text === 'string') return one.text;
    let said = '';
    for (const child of (one.content ?? []) as unknown[]) {
      if (typeof child === 'string') said += this._wordsIn(editor, child, depth + 1);
    }
    return said;
  }

  private async _bindPart(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const found = this._partAt(editor, payload?.nodeId);
    if (!found) return false;
    const { part, definition } = found;

    const store = this._store(editor)!;
    const children = ((definition.content ?? []) as unknown[])
      .filter((sid): sid is string => typeof sid === 'string')
      .map((sid) => store.getNode(sid))
      .filter(Boolean) as Record<string, any>[];

    const asked = children.filter((one) => one.stype === 'componentVar');
    const binds = children.filter((one) => one.stype === 'componentBind');

    const name = typeof payload?.var === 'string' && payload.var.trim() ? payload.var.trim() : undefined;

    /*
     * A durable name for the part, minted from its own words when it has none.
     *
     * A block a reader added inside a definition has no `partId`, because until a binding names it
     * nothing needed one. Deduped inside this definition rather than globally: a `partId` means
     * something only in the card it is in.
     */
    const held = typeof part.attributes?.partId === 'string' ? part.attributes.partId : '';
    const taken = new Set(
      binds.map((one) => String(one.attributes?.part ?? '')).filter(Boolean)
    );
    const partId =
      held ||
      (() => {
        /*
         * Named after the **question**, not after the words.
         *
         * The words are a placeholder at the moment a reader binds — `본문을 입력하세요` — and a
         * `partId` outlives them: it is the durable name a binding uses, and a saved document would
         * carry a sentence nobody wrote as the name of a slot. The question is what the reader just
         * decided to call this, which is the one name that will still make sense next year.
         */
        const base = name ?? (this._wordsIn(editor, String(part.sid)).trim().slice(0, 12) || '부품');
        let candidate = base;
        for (let n = 2; taken.has(candidate); n += 1) candidate = `${base} ${n}`;
        return candidate;
      })();

    const already = binds.find(
      (one) => one.attributes?.part === partId && one.attributes?.attr === 'text'
    );

    const steps: unknown[] = [];
    if (!held) steps.push(setAttrs(String(part.sid), { partId }));

    if (!name) {
      /*
       * Unbound, and the **question stays**. Removing it would change every placement of this card
       * at once, which is not what a reader taking one slot off the data means — and another part
       * may be answering the same question.
       */
      if (!already) return false;
      steps.push(removeChild(String(definition.sid), String(already.sid)));
      return (await transaction(editor, steps as never).commit()).success === true;
    }

    if (!asked.some((one) => one.attributes?.name === name)) {
      /*
       * Declared holding the part's **current words**, so a placement that answers nothing draws
       * what the card already drew. Declaring a question cannot empty a page, which is the property
       * that makes it safe to try.
       */
      steps.push(
        addChild(
          String(definition.sid),
          node('componentVar', {
            name,
            kind: 'text',
            value: this._wordsIn(editor, String(part.sid))
          }) as never,
          0
        )
      );
    }

    steps.push(
      already
        ? setAttrs(String(already.sid), { var: name })
        : addChild(
            String(definition.sid),
            node('componentBind', { part: partId, attr: 'text', var: name }) as never,
            0
          )
    );

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /** The instance a detach would be about, or nothing when there is not exactly one that may be. */
  private _detachable(editor: Editor, payload?: Record<string, unknown>): Record<string, any> | undefined {
    const store = this._store(editor);
    const chosen = this._chosen(editor, payload);
    if (!store || chosen.length !== 1) return undefined;

    const instance = store.getNode(chosen[0]);
    if (instance?.stype !== 'instance') return undefined;

    /*
     * Not a list's card. That instance is the thing the list draws once per row rather than
     * something on the page, and detaching it would leave the list with nothing to draw.
     */
    const parent = typeof instance.parentId === 'string' ? store.getNode(instance.parentId) : undefined;
    if (parent?.stype === 'collection') return undefined;

    return instance;
  }

  private async _detach(editor: Editor, payload?: Record<string, unknown>): Promise<boolean> {
    const instance = this._detachable(editor, payload);
    if (!instance) return false;

    const store = this._store(editor)!;
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.() ?? '';
    const doc = { rootId, getNode: (sid: string) => store.getNode(sid) };

    /** What it was drawing one press ago — this instance's values already in it. */
    const drawn = instanceParts(doc as never, instance as never);
    if (drawn.length === 0) return false;

    const sid = String(instance.sid);
    const steps: unknown[] = [];

    // Its own children are the values it was answering with, and they mean nothing now.
    for (const child of (instance.content ?? []) as unknown[]) {
      if (typeof child === 'string') steps.push(removeChild(sid, child));
    }
    for (const part of drawn) {
      steps.push(addChild(sid, detachedCopyOf(part as never, doc as never) as never));
    }

    /*
     * Then the claim comes off, **where it stands**: the block keeps its sid, its place, its width
     * and every override written on it. A detach that moved the thing would be a detach nobody
     * trusts, and a reader's selection would be pointing at a node that is gone.
     *
     * This was a replace-and-reinsert for one round, because a node that changed type disappeared
     * off the page while the document held it perfectly. That was two faults in the reconciler and
     * they are fixed (`renderer-dom/test/replaced-root.test.ts`): the reuse decision compared tags
     * where a placement and a frame both draw a `div`, and a replaced node handed its history down
     * to its children, who then reused elements that had just been removed.
     */
    steps.push(
      setAttrs(sid, {
        componentId: undefined,
        // A stack of blocks, which is what it has just become — its own arrangement if it had one.
        layoutMode:
          typeof instance.attributes?.layoutMode === 'string' ? instance.attributes.layoutMode : 'column'
      })
    );
    steps.push(transformNode(sid, 'frame'));

    return (await transaction(editor, steps as never).commit()).success === true;
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

/**
 * A durable id nothing else in this document is using.
 *
 * Durable because `forFile` strips sids: a placement that named one would name nothing the first
 * time the site was reopened. Derived from what the reader called it, so a file is readable — and
 * numbered when that name is taken, rather than refusing a second card called 카드.
 */
function unique(name: string, taken: Set<string>): string {
  const base = name.trim().replace(/\s+/g, '-') || 'block';
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const tried = `${base}-${n}`;
    if (!taken.has(tried)) return tried;
  }
  return `${base}-${taken.size + 1}`;
}
