import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { documentChildSpot } from '@barocss/schema';
import { childrenOf, editableSurface, type DeckAccess, type DeckNode } from './deck';
import { accessOfTree } from './tree-access';
import { boxOf } from './geometry';
/*
 * The model and the resolution are the canvas's, not the deck's (`docs/SHARED-LAYER.md`): the
 * office schema declares `component` and `instance`, so what a card *is* can be said without
 * naming a product. What is in this file cannot — making one out of a selection needs the surface
 * the reader is on, and that is a deck's question.
 */
import {
  componentOf,
  definitionAt,
  importComponentPlan,
  componentsOf,
  instanceParts
} from '@barocss/office-canvas';

/**
 * Making a component, placing one, and telling a placement what it is.
 *
 * ## What is **not** here any more, and why that is the whole design
 *
 * `applyComponent` was here, and it was the biggest thing in the file: a plan comparing every
 * part of every placement with the definition, a recorded signature per placement, and a badge
 * offering the work. All of it is gone, because a placement no longer holds copies — it draws the
 * definition (`canvas-instance.ts`), so a change to a card is on the screen in every placement of
 * it before the transaction has finished committing.
 *
 * The reason it existed is worth keeping, because it is what makes the new answer *cheap*: with
 * copies, a definition that pushed every edit into its placements as the reader typed would be a
 * document write per keystroke per placement — forty placements of a five-part card is two hundred
 * writes for one character, the ruler's fault (a write per pointer move) in a new place. Resolving
 * at draw time costs **zero** writes, so the thing apply was avoiding is no longer a cost at all.
 *
 * ## Where the arithmetic is
 *
 * In `office-word`, which owns the canvas: `canvas-component.ts` (what a card declares, what a
 * placement was asked for) and `canvas-instance.ts` (what it draws). This file turns those answers
 * into transactions and knows
 * nothing about bindings or arrangement — the same split every other model here has, and the reason
 * the design was testable in milliseconds before any of it could be pressed.
 */

/**
 * Where the library goes among the document's containers.
 *
 * From the schema's own list (`documentChildSpot`), so this cannot drift from the content model —
 * they were the same thing said twice, and the day a second container was declared *after*
 * `components` the appended one was refused.
 */
function spotForLibrary(doc: DeckAccess): number {
  return documentChildSpot(
    childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype),
    'components'
  );
}

/** Where the deck's definitions live, or nothing when it has no library yet. */
function libraryOf(doc: DeckAccess): string | undefined {
  for (const sid of childrenOf(doc.getNode(doc.rootId))) {
    if (doc.getNode(sid)?.stype === 'components') return sid;
  }
  return undefined;
}

/**
 * A name for a part that nothing else in the definition is using.
 *
 * A durable name, because a placement points at it and saving strips sids. Derived from what
 * the part *is* — `title`, `title-2` — so a person reading the file can tell what they are
 * looking at; a counter would be honest and unreadable.
 */
function partNames(doc: DeckAccess, parts: string[]): Map<string, string> {
  const taken = new Set<string>();
  const names = new Map<string, string>();
  for (const sid of parts) {
    const node = doc.getNode(sid);
    const role = node?.attributes?.role;
    const base =
      typeof role === 'string' && role.length > 0 ? role : (node?.stype ?? 'part').toLowerCase();
    let name = base;
    let next = 2;
    while (taken.has(name)) name = `${base}-${next++}`;
    taken.add(name);
    names.set(sid, name);
  }
  return names;
}

/** An id for a definition that nothing else in the document is using. */
function freeComponentId(doc: DeckAccess, wanted: string): string {
  const taken = new Set(componentsOf(doc).map((one) => one.id));
  if (!taken.has(wanted)) return wanted;
  let next = 2;
  while (taken.has(`${wanted}-${next}`)) next += 1;
  return `${wanted}-${next}`;
}

/** Every placement of a definition in the document, wherever it is. */
function placementsOf(doc: DeckAccess, id: string): string[] {
  const found: string[] = [];
  const walk = (sid: string, depth: number) => {
    if (depth > 12) return;
    const node = doc.getNode(sid);
    if (!node) return;
    if (node.stype === 'instance' && node.attributes?.componentId === id) found.push(sid);
    for (const child of childrenOf(node)) walk(child, depth + 1);
  };
  for (const child of childrenOf(doc.getNode(doc.rootId))) walk(child, 0);
  return found;
}

export class SlidesComponentExtension implements Extension {
  name = 'slides-components';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload: any) => Promise<boolean>,
      canExecute: (payload: any) => boolean
    ) => {
      (editor as any).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: any) => await execute(payload ?? {}),
        canExecute: (_ed: Editor, payload?: any) => canExecute(payload ?? {})
      });
    };

    /**
     * Make a definition out of what is selected, and leave a placement of it behind.
     *
     * The reader's boxes do not stay where they were: they *become* the definition, and what
     * is on the slide afterwards is a placement. Anything else would leave two things that
     * look identical and behave differently — the fault every tool that "creates a component
     * from a copy" has, where the original quietly stops following.
     *
     * The parts are rebased to the selection's own corner, so the definition is a card at
     * `0,0` rather than a card that remembers it was once three inches down slide four.
     */
    register(
      'createComponent',
      async (payload) => await this._create(editor, payload),
      () => this._selection(editor).length > 0
    );

    /** Put a placement of a definition on a slide, with a copy of every part. */
    register(
      'placeComponent',
      async (payload) => await this._place(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        return !!doc && !!componentsOf(doc).find((one) => one.id === payload?.componentId);
      }
    );

    /**
     * Bring a definition in **from another deck**.
     *
     * ## Why the source arrives in the payload
     *
     * This file cannot fetch and must not: whether `brand-kit` is a name in the reader's own
     * library or an address to get is a fact about the *host* (§11i), and a model that reached for
     * the network would be a model that cannot be tested in milliseconds. So the app resolves the
     * deck, parses it, and hands over the tree; `accessOfTree` reads it without loading it, which
     * is what keeps the deck on screen where it is.
     *
     * ## Bringing the same one in twice is not two cards
     *
     * The second import **replaces** the first — same deck, same id there — and every placement goes
     * on pointing at the same `componentId`. Which is now the whole of it: a placement draws the
     * definition, so the new parts are on the screen the moment the copy is replaced. Nothing has to
     * be carried into forty slides, because nothing was ever copied into them.
     */
    register(
      'importComponent',
      async (payload) => await this._import(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.componentId !== 'string') return false;
        if (typeof payload?.deck !== 'string' || payload.deck.length === 0) return false;
        const source = payload?.source ? accessOfTree(payload.source as never) : undefined;
        return !!source && componentsOf(source).some((one) => one.id === payload.componentId);
      }
    );

    /**
     * How big the card is.
     *
     * The definition's own size, and therefore every placement's default: a placement gets no
     * resize handles unless a part was told to **fill** the card, because otherwise the drag writes
     * a box nothing reads (`instanceResizable`, §10b-12). So this is the way a reader changes a
     * card's size, and every placement of it is drawn at the new one immediately.
     */
    register(
      'setComponentSize',
      async (payload) => await this._setSize(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc) return false;
        const found = componentsOf(doc).find((one) => one.id === payload?.componentId);
        return !!found && (numberOr(payload?.width, 0) > 0 || numberOr(payload?.height, 0) > 0);
      }
    );

    /**
     * Say what one of a placement's variables is.
     *
     * And **rewrite the parts that bind it**, in the same transaction: a field a reader types
     * into that changes nothing on the slide is worse than any override it could cost them,
     * and the only override it can cost them is one they made to that same text — where the
     * value they have just typed is plainly the newer answer.
     */
    register(
      'setComponentValue',
      async (payload) => await this._setValue(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.name !== 'string') return false;
        const definition = componentOf(doc, doc.getNode(payload?.nodeId));
        return !!definition?.vars.some((one) => one.name === payload.name);
      }
    );

    /**
     * Declare what a placement of this definition can be asked for — or change it, or take it
     * away.
     *
     * ## Why a name cannot be changed
     *
     * A variable's `name` is what a part binds to and what a placement answers, and both are
     * written in the document: renaming one means rewriting every part of the definition and
     * every placement's answers, in every deck that ever copied this card. That is a migration,
     * not an edit. So a name is fixed when it is declared and the **label** is what a reader
     * changes — the same rule this document already follows for a definition's `id`, a part's
     * `partId` and a shape's motion `name`, and for the same reason: a durable reference is
     * only durable if nothing renames it.
     *
     * ## What removing one takes with it
     *
     * The declaration, the bindings that name it, and the placements' answers to it — all in
     * one transaction. A binding pointing at a variable that is gone is a part that silently
     * draws whatever it last had, and an answer to a question nobody asks is junk in the file
     * that would come back to life if the name were ever declared again.
     */
    register(
      'setComponentVar',
      async (payload) => await this._setVar(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.name !== 'string' || payload.name.length === 0) return false;
        return !!payload?.componentId && !!componentsOf(doc).find((one) => one.id === payload.componentId);
      }
    );

    /**
     * What one **piece** of a definition takes, and in what.
     *
     * `setComponentBind({ componentId, part, attr, var })`, and `var: null` takes the binding off.
     * A declaration on the definition rather than three attributes on the part (§10g-2): a variable
     * can drive anything a part declares, a nested piece can be bound, and a placement's copies
     * carry nothing.
     *
     * `attr` is checked against **what the part declares**, which is the check the schema could not
     * make: a content model cannot see across to another node's attributes. So a binding cannot
     * name something nothing would read — except `text`, which is the words and is not an attribute
     * at all.
     */
    register(
      'setComponentBind',
      async (payload) => await this._setBind(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.part !== 'string' || typeof payload?.attr !== 'string') {
          return false;
        }
        const definition = componentsOf(doc).find((one) => one.id === payload?.componentId);
        if (!definition) return false;
        if (payload?.var === null) return true;
        if (typeof payload?.var !== 'string' || !definition.vars.some((one) => one.name === payload.var)) {
          return false;
        }
        return bindable(editor, doc, definition, payload.part, payload.attr);
      }
    );

    /**
     * And whether a frame part is the **slot** — which is not a binding, and never was.
     *
     * It says where a reader's own things go, not what a part takes from a variable, and it was
     * only ever in the same command because they were both attributes on a part.
     */
    register(
      'setComponentSlot',
      async (payload) => await this._setSlot(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.nodeId !== 'string') return false;
        return !!definitionAt(doc, payload.nodeId);
      }
    );

    /**
     * Stop following: a placement becomes an ordinary group.
     *
     * Kept as one node rather than dissolved into loose boxes, because the reader arranged
     * those parts against each other and a detach that scatters them across the slide has
     * destroyed the thing they were detaching. A `group` is what a placement already draws as
     * (`renderers.ts`), so nothing moves.
     */
    register(
      'detachComponent',
      async (payload) => await this._detach(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        return !!doc && doc.getNode(payload?.nodeId)?.stype === 'instance';
      }
    );
  }

  private _access(editor: Editor): DeckAccess | undefined {
    const store = (editor as any).dataStore;
    const rootId = (editor as any).getRootId?.();
    if (!store || !rootId) return undefined;
    return { rootId, getNode: (sid: string) => store.getNode(sid) };
  }

  /** The selected boxes, in document order — which is the order they are stacked in. */
  private _selection(editor: Editor): string[] {
    const doc = this._access(editor);
    // The **selection**, not the editor: `selectedNodeIds` takes a selection, and handing it an
    // editor returns nothing at all — so every command here refused, on a real selection.
    const chosen = new Set(selectedNodeIds((editor as any).selection) ?? []);
    if (!doc || chosen.size === 0) return [];

    // `parentId` is the store's own bookkeeping rather than part of a document — read the way
    // `selection.ts` reads it, which is the same reason: a `DeckNode` is a written node.
    const parent = (doc.getNode([...chosen][0]) as { parentId?: unknown } | undefined)?.parentId;
    if (typeof parent !== 'string') return [];
    // Siblings only: a definition made out of two boxes on different slides is not a card,
    // and the arithmetic that rebases them would be inventing a shared origin.
    return childrenOf(doc.getNode(parent)).filter((sid) => chosen.has(sid));
  }

  private async _create(
    editor: Editor,
    payload: { name?: string; id?: string }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const chosen = this._selection(editor);
    if (!doc || chosen.length === 0) return false;

    const parent = (doc.getNode(chosen[0]) as { parentId?: unknown }).parentId as string;
    const boxes = chosen.map((sid) => boxOf(doc.getNode(sid)?.attributes as never));
    const left = Math.min(...boxes.map((box) => box.x));
    const top = Math.min(...boxes.map((box) => box.y));
    const width = Math.max(...boxes.map((box) => box.x + box.width)) - left;
    const height = Math.max(...boxes.map((box) => box.y + box.height)) - top;

    const names = partNames(doc, chosen);
    const id = freeComponentId(doc, payload?.id ?? 'component');
    const name = payload?.name ?? '컴포넌트';

    /**
     * The definition's parts: the reader's own boxes, moved to the card's corner and given a durable
     * name each. That name is what a binding points at (§10g-2).
     */
    const parts = chosen.map((sid) => {
      const copy = copyRebased(doc, sid, left, top);
      return {
        ...copy,
        attributes: { ...(copy?.attributes ?? {}), partId: names.get(sid) }
      } as DeckNode;
    });

    const definition: DeckNode = {
      stype: 'component',
      attributes: { id, name, width, height },
      content: parts as never
    };

    /**
     * What the slide gets instead: a placement that **holds nothing**.
     *
     * It names the definition and sits where the reader's boxes were. What is drawn is the
     * definition itself, resolved where children are read (§10b-2a) — so there is nothing to copy
     * into it, nothing to record about what it was given, and nothing to carry into it later.
     */
    const placement: DeckNode = {
      stype: 'instance',
      attributes: { componentId: id, x: left, y: top, width, height },
      content: [] as never
    };

    const library = libraryOf(doc);
    const steps: unknown[] = [];
    /*
     * A library, if the deck has none yet. Made in the same transaction as the definition, so
     * one press of undo takes back "made a component" rather than leaving an empty container
     * behind — the deck was a deck without one a moment ago.
     *
     * **At the place the schema says**, not appended. Measured: a deck that had gained a document
     * variable first could not then have a card at all — the library landed after `variables` and
     * the validator refused the whole transaction, which is it doing its job.
     */
    if (!library) {
      steps.push({
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: { stype: 'components', content: [definition] },
          position: spotForLibrary(doc)
        }
      });
    } else {
      steps.push({ type: 'addChild', payload: { parentId: library, child: definition } });
    }

    steps.push({ type: 'addChild', payload: { parentId: parent, child: placement } });
    for (const sid of chosen) {
      steps.push({ type: 'removeChild', payload: { parentId: parent, childId: sid } });
    }

    const result = await transaction(editor, steps as never).commit();
    if (!result.success) return false;

    // Standing in front of what was made: the placement, which is what the reader now edits.
    const after = childrenOf(doc.getNode(parent)).filter(
      (sid) => doc.getNode(sid)?.stype === 'instance'
    );
    const made = after[after.length - 1];
    if (made) (editor as any).setNode?.({ nodeIds: [made] });
    return true;
  }

  private async _place(
    editor: Editor,
    payload: { componentId?: string; slideId?: string; x?: number; y?: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;
    const where = editableSurface(doc, payload?.slideId);
    const definition = componentsOf(doc).find((one) => one.id === payload?.componentId);
    if (!where || !definition) return false;

    const size = {
      width: numberOr(doc.getNode(definition.sid)?.attributes?.width, 4000),
      height: numberOr(doc.getNode(definition.sid)?.attributes?.height, 3000)
    };
    const placement: DeckNode = {
      stype: 'instance',
      attributes: {
        componentId: definition.id,
        x: numberOr(payload?.x, 1440),
        y: numberOr(payload?.y, 1440),
        ...size
      },
      /**
       * With the definition's **defaults** substituted, not with nothing.
       *
       * Measured: an empty map meant the bindings were skipped, so a fresh placement drew whatever
       * the definition's parts happened to contain rather than what the card says it is — which
       * only looked right while the bindings lived *on* the parts and the author had written the
       * same words twice. A placement starts as the card describes itself.
       */
      /*
       * Nothing. A placement draws the definition, and its variables answer with the card's own
       * defaults until a reader says otherwise — so an empty placement is a complete one.
       */
      content: [] as never
    };

    const result = await transaction(editor, [
      { type: 'addChild', payload: { parentId: where, child: placement } }
    ] as never).commit();
    if (!result.success) return false;

    const made = childrenOf(doc.getNode(where));
    const last = made[made.length - 1];
    if (last) (editor as any).setNode?.({ nodeIds: [last] });
    return true;
  }

  private async _setValue(
    editor: Editor,
    payload: { nodeId?: string; name?: string; value?: string }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const instance = doc?.getNode(payload?.nodeId as string);
    const definition = doc && componentOf(doc, instance);
    if (!doc || !instance || !definition || typeof payload?.name !== 'string') return false;

    const said = childrenOf(instance).find((sid) => {
      const node = doc.getNode(sid);
      return node?.stype === 'componentValue' && node.attributes?.name === payload.name;
    });

    const steps: unknown[] = [];
    if (said) {
      steps.push({
        type: 'setAttrs',
        payload: { nodeId: said, attrs: { name: payload.name, value: payload.value ?? '' } }
      });
    } else {
      /*
       * At the front, so a placement reads as "what it is asked for, then what it is made of"
       * — the same order the definition declares in, and the order the schema's content
       * expression states (`componentValue* (scene | frame)*`).
       */
      steps.push({
        type: 'addChild',
        payload: {
          parentId: payload!.nodeId,
          child: {
            stype: 'componentValue',
            attributes: { name: payload.name, value: payload.value ?? '' }
          },
          position: 0
        }
      });
    }

    /*
     * And that is the whole of it.
     *
     * With copied parts, writing a value also meant rewriting every part that bound it — the value
     * had to be pushed into the copies. A placement draws the definition now, and the value is
     * substituted while the parts are resolved, so saying it *is* changing what is on the screen.
     */
    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /** Copy a definition in from another deck, replacing the copy this deck already had of it. */
  private async _import(
    editor: Editor,
    payload: { deck?: string; componentId?: string; source?: unknown }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.deck !== 'string' || typeof payload?.componentId !== 'string') {
      return false;
    }
    const source = accessOfTree(payload.source as never);
    const plan = importComponentPlan(doc, source, payload.componentId, payload.deck);
    if (!plan) return false;

    const steps: unknown[] = [];
    const library = libraryOf(doc);

    if (plan.replaces) {
      /*
       * Replaced in place: the definition keeps its id here, so every placement of it is still a
       * placement of it. Its **parts** are what changed, and that is what the badge then offers to
       * carry into the placements.
       */
      const parent = (doc.getNode(plan.replaces) as { parentId?: unknown } | undefined)?.parentId;
      if (typeof parent !== 'string') return false;
      steps.push({ type: 'removeChild', payload: { parentId: parent, childId: plan.replaces } });
      steps.push({ type: 'addChild', payload: { parentId: parent, child: plan.node } });
    } else if (library) {
      steps.push({ type: 'addChild', payload: { parentId: library, child: plan.node } });
    } else {
      // A deck with no library yet: made in the same transaction, so one press of undo takes back
      // "I brought a card in" rather than leaving an empty container behind — and in the schema's
      // own place among the containers, for the reason `spotForLibrary` gives.
      steps.push({
        type: 'addChild',
        payload: {
          parentId: doc.rootId,
          child: { stype: 'components', content: [plan.node] },
          position: spotForLibrary(doc)
        }
      });
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private async _setSize(
    editor: Editor,
    payload: { componentId?: string; width?: number; height?: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const definition = doc && componentsOf(doc).find((one) => one.id === payload?.componentId);
    if (!doc || !definition) return false;

    const attrs: Record<string, unknown> = {};
    if (numberOr(payload?.width, 0) > 0) attrs.width = payload!.width;
    if (numberOr(payload?.height, 0) > 0) attrs.height = payload!.height;
    if (Object.keys(attrs).length === 0) return false;

    /*
     * The card, and every placement's box with it — in **one** transaction, so one press of
     * undo takes back "the card is bigger" rather than leaving twenty placements at the new
     * size and the card at the old one. The parts are not touched: a card's size is not an edit
     * to what is in it.
     */
    const steps: unknown[] = [
      { type: 'setAttrs', payload: { nodeId: definition.sid, attrs } }
    ];
    for (const sid of placementsOf(doc, definition.id)) {
      steps.push({ type: 'setAttrs', payload: { nodeId: sid, attrs } });
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private async _setVar(
    editor: Editor,
    payload: {
      componentId?: string;
      name?: string;
      label?: string;
      kind?: string;
      choices?: string[];
      value?: string;
      remove?: boolean;
    }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const definition = doc && componentsOf(doc).find((one) => one.id === payload?.componentId);
    if (!doc || !definition || typeof payload?.name !== 'string') return false;

    const declared = childrenOf(doc.getNode(definition.sid)).find((sid) => {
      const node = doc.getNode(sid);
      return node?.stype === 'componentVar' && node.attributes?.name === payload.name;
    });

    const steps: unknown[] = [];

    if (payload.remove) {
      if (!declared) return false;
      steps.push({ type: 'removeChild', payload: { parentId: definition.sid, childId: declared } });

      // The bindings that name it, so no part is left pointing at nothing.
      for (const part of definition.parts) {
        const attrs = doc.getNode(part)?.attributes ?? {};
        const off: Record<string, unknown> = {};
        for (const key of ['bindText', 'bindFill', 'bindVisible']) {
          if (attrs[key] === payload.name) off[key] = null;
        }
        if (Object.keys(off).length > 0) {
          steps.push({ type: 'setAttrs', payload: { nodeId: part, attrs: off } });
        }
      }

      // And the answers, wherever a placement gave one.
      for (const sid of placementsOf(doc, definition.id)) {
        for (const child of childrenOf(doc.getNode(sid))) {
          const node = doc.getNode(child);
          if (node?.stype !== 'componentValue' || node.attributes?.name !== payload.name) continue;
          steps.push({ type: 'removeChild', payload: { parentId: sid, childId: child } });
        }
      }

      return (await transaction(editor, steps as never).commit()).success === true;
    }

    /** Only what the caller said, so changing a label does not reset a default. */
    const attrs: Record<string, unknown> = { name: payload.name };
    if (payload.label !== undefined) attrs.label = payload.label;
    if (payload.kind !== undefined) attrs.kind = payload.kind;
    if (payload.choices !== undefined) attrs.choices = payload.choices;
    if (payload.value !== undefined) attrs.value = payload.value;

    if (declared) {
      steps.push({ type: 'setAttrs', payload: { nodeId: declared, attrs } });
    } else {
      /*
       * Declared **before the parts**, which is where the schema says they go
       * (`componentVar* (scene | frame)*`): a definition's variables are its interface, and a
       * reader opening the file sees what a card can be asked for before how it is drawn.
       */
      const before = childrenOf(doc.getNode(definition.sid)).filter(
        (sid) => doc.getNode(sid)?.stype === 'componentVar'
      ).length;
      steps.push({
        type: 'addChild',
        payload: {
          parentId: definition.sid,
          child: { stype: 'componentVar', attributes: attrs },
          position: before
        }
      });
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /**
   * Declare — or take away — one binding on a definition.
   *
   * Replaced rather than added when the same piece and attribute are named again: a piece that took
   * `accent` in its fill and now takes `warn` is one decision, and two declarations about one
   * attribute would be a card whose colour depends on which one apply read last.
   */
  private async _setBind(
    editor: Editor,
    payload: { componentId?: string; part?: string; attr?: string; var?: string | null }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const definition = doc && componentsOf(doc).find((one) => one.id === payload?.componentId);
    if (!doc || !definition || typeof payload?.part !== 'string' || typeof payload?.attr !== 'string') {
      return false;
    }

    /** The declaration already there about this piece and this attribute, if any. */
    const existing = childrenOf(doc.getNode(definition.sid)).find((sid) => {
      const node = doc.getNode(sid);
      return (
        node?.stype === 'componentBind' &&
        node.attributes?.part === payload.part &&
        node.attributes?.attr === payload.attr
      );
    });

    const steps: unknown[] = [];
    if (payload.var === null || payload.var === '') {
      if (!existing) return false;
      steps.push({
        type: 'removeChild',
        payload: { parentId: definition.sid, childId: existing }
      });
    } else if (existing) {
      steps.push({ type: 'setAttrs', payload: { nodeId: existing, attrs: { var: payload.var } } });
    } else {
      /*
       * After the variables and before the parts, which is where the schema says a declaration goes
       * — a definition reads as *what it can be asked for*, then *what takes it*, then *what it is
       * made of*.
       */
      const declarations = childrenOf(doc.getNode(definition.sid)).filter((sid) => {
        const stype = doc.getNode(sid)?.stype;
        return stype === 'componentVar' || stype === 'componentBind';
      }).length;
      steps.push({
        type: 'addChild',
        payload: {
          parentId: definition.sid,
          child: {
            stype: 'componentBind',
            attributes: { part: payload.part, attr: payload.attr, var: payload.var }
          },
          position: declarations
        }
      });
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /** Whether a frame part is the slot: where a placement's own things go. */
  private async _setSlot(
    editor: Editor,
    payload: { nodeId?: string; slot?: string | null }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.nodeId !== 'string') return false;
    const slot = payload.slot === null || payload.slot === '' ? null : payload.slot;
    return (
      (await transaction(editor, [
        { type: 'setAttrs', payload: { nodeId: payload.nodeId, attrs: { slot } } }
      ] as never).commit()).success === true
    );
  }

  /**
   * Stop following: the placement becomes a group holding **real copies** of what it was drawing.
   *
   * This is the one place a copy is still made, and it is the whole meaning of the gesture. A
   * placement holds nothing of its own now — it draws the definition — so "stop following" cannot
   * be "take an attribute off": there would be an empty group where a card was. The parts are
   * resolved (values and all, exactly as they were on the screen) and written into the document,
   * which is what makes them the reader's.
   *
   * A **template**, in other words. Which is the distinction this whole change turns on: a template
   * is a document you copy and then own, and a component follows its definition. Detaching converts
   * one into the other, and that is a thing a reader asks for by name.
   */
  private async _detach(editor: Editor, payload: { nodeId?: string }): Promise<boolean> {
    const doc = this._access(editor);
    const instance = doc?.getNode(payload?.nodeId as string);
    if (!doc || !instance || instance.stype !== 'instance') return false;

    /** What it was drawing, one press ago. */
    const drawn = instanceParts(doc, { ...instance, sid: payload!.nodeId } as never);
    const steps: unknown[] = [];

    // What the placement itself held — its values, and whatever went in the slot — is replaced by
    // the resolved parts, which already contain the slot's contents in their place.
    for (const sid of childrenOf(instance)) {
      steps.push({ type: 'removeChild', payload: { parentId: payload!.nodeId, childId: sid } });
    }
    for (const part of drawn) {
      steps.push({
        type: 'addChild',
        payload: { parentId: payload!.nodeId, child: ownCopyOf(part) }
      });
    }

    /*
     * Then the claim comes off and the node becomes a group. `transformNode`'s `newAttrs` merges, so
     * `componentId` had to be removed by `setAttrs` with `null` — measured, and a detached card that
     * still named a definition would go on drawing it.
     */
    steps.push({
      type: 'setAttrs',
      payload: { nodeId: payload!.nodeId, attrs: { componentId: null } }
    });
    steps.push({
      type: 'transformNode',
      payload: { nodeId: payload!.nodeId, newType: 'group' }
    });

    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/**
 * Whether that piece of the definition can take that attribute at all.
 *
 * The check the schema could not make: a content model cannot see across to another node's declared
 * attributes, so a binding naming `cornerRadius` on a line would be a value nothing reads — the
 * exact fault the conformance harness exists to catch, arriving through a control instead.
 *
 * `text` is always allowed and is not an attribute: the words in a part are its content, and a
 * `text` attribute on every shape would be a schema lying about what a text frame is.
 */
function bindable(
  editor: Editor,
  doc: DeckAccess,
  definition: { sid: string },
  part: string,
  attr: string
): boolean {
  const found = pieceNamed(doc, definition.sid, part);
  if (!found) return false;
  if (attr === 'text') return true;
  const schema = (editor as any)?.dataStore?.getActiveSchema?.();
  const attrs = schema?.getNodeType?.(doc.getNode(found)?.stype ?? '')?.attrs;
  return !!attrs && attr in attrs;
}

/** The piece of a definition with this durable name, however deep. */
function pieceNamed(
  doc: DeckAccess,
  sid: string,
  part: string,
  depth = 0
): string | undefined {
  if (depth > 24) return undefined;
  const node = doc.getNode(sid);
  if (!node) return undefined;
  if (node.attributes?.partId === part) return sid;
  for (const child of childrenOf(node)) {
    const found = pieceNamed(doc, child, part, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * A resolved part, turned into a node the document can hold.
 *
 * Two things come off. The **synthetic id**, because it says "a piece of a placement" and this is
 * about to be a box a reader owns. And the definition's own names (`partId`, `slot`), because a
 * detached box that still carried them would be claiming to be a piece of a card it no longer
 * follows.
 */
function ownCopyOf(part: DeckNode, depth = 0): DeckNode {
  const attrs = { ...((part.attributes ?? {}) as Record<string, unknown>) };
  delete attrs.partId;
  delete attrs.slot;
  const kids = Array.isArray((part as { content?: unknown }).content)
    ? ((part as { content: DeckNode[] }).content as DeckNode[])
    : [];
  const copy: DeckNode & { content?: unknown; sid?: string } = {
    ...part,
    attributes: attrs,
    ...(depth > 24 || kids.length === 0 ? {} : { content: kids.map((one) => ownCopyOf(one, depth + 1)) })
  } as never;
  delete copy.sid;
  return copy as DeckNode;
}

/** A deep copy of a box, moved so that the group's corner is the origin. */
function copyRebased(doc: DeckAccess, sid: string, left: number, top: number): DeckNode {
  const copy = deepCopy(doc, sid, 0) as DeckNode;
  const box = boxOf(doc.getNode(sid)?.attributes as never);
  return {
    ...copy,
    attributes: { ...(copy.attributes ?? {}), x: box.x - left, y: box.y - top }
  };
}

/** The subtree as literal nodes, which is what a transaction takes. */
function deepCopy(doc: DeckAccess, sid: string, depth: number): DeckNode | undefined {
  if (depth > 24) return undefined;
  const node = doc.getNode(sid);
  if (!node) return undefined;
  const copy: DeckNode & { text?: string; content?: unknown } = {
    stype: node.stype,
    attributes: { ...(node.attributes ?? {}) }
  };
  const text = (node as { text?: unknown }).text;
  if (typeof text === 'string') copy.text = text;
  const children = childrenOf(node)
    .map((child) => deepCopy(doc, child, depth + 1))
    .filter((child): child is DeckNode => !!child);
  if (children.length > 0) copy.content = children;
  return copy;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function createComponentCommands(): SlidesComponentExtension {
  return new SlidesComponentExtension();
}

/** What a placement's slot is, re-exported so a caller need not reach into the model. */
