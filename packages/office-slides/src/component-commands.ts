import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { childrenOf, editableSurface, type DeckAccess, type DeckNode } from './deck';
import { accessOfTree } from './tree-access';
import { boxOf } from './geometry';
import {
  componentApplyPlan,
  componentOf,
  definitionAt,
  importComponentPlan,
  componentSignature,
  definitionSignature,
  signatureOfLiteral,
  deckComponents,
  instanceSlot,
  instanceValues,
  partCopy,
  partIdOf,
  type ComponentDef
} from './components';

/**
 * Making a component, placing one, and taking a definition's changes.
 *
 * ## Why these are commands and not reactions
 *
 * Apply is the one worth stating. A definition that pushed every edit into its placements as
 * the reader typed would be a document write per keystroke per placement — forty placements of
 * a five-part card is two hundred writes for one character, which is the ruler's fault (a
 * write per pointer move) in a new place. Pushing them when the definition *closes* would be
 * cheap and would split the two halves on undo: the definition new, the placements old, one
 * press of undo taking back only one of them.
 *
 * So a definition's changes are **offered** — `componentStale` is the offer — and taken when
 * asked for. Which is not a compromise: it is the relationship Figma has across files, where
 * it also cannot be live, and it is the only one that leaves a reader in charge of when forty
 * slides change.
 *
 * ## Where the arithmetic is
 *
 * In `components.ts`, all of it: what a placement's variables are, which parts pair with
 * which, what apply must rewrite, remove and add, and what a bound part looks like once the
 * values are substituted. This file turns those answers into transactions and knows nothing
 * about pairing or staleness — the same split every other model here has, and the reason the
 * design was testable in milliseconds before any of it could be pressed.
 */

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
  const taken = new Set(deckComponents(doc).map((one) => one.id));
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

/** What a placement of this definition holds: a copy of every part, values substituted. */
function partsFor(doc: DeckAccess, definition: ComponentDef, values: Map<string, string>) {
  return definition.parts
    .map((part) => partCopy(doc, part, values))
    .filter((part): part is DeckNode => !!part);
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
        return !!doc && !!deckComponents(doc).find((one) => one.id === payload?.componentId);
      }
    );

    /**
     * Take what the definition now says — for one placement, or for all of them.
     *
     * All of them is the useful one: a definition is edited once and forty slides are behind
     * it, and asking a reader to visit forty is not an answer. One is what a badge on a
     * placement offers.
     */
    register(
      'applyComponent',
      async (payload) => await this._apply(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc) return false;
        if (typeof payload?.nodeId === 'string') return !!componentOf(doc, doc.getNode(payload.nodeId));
        return !!deckComponents(doc).find((one) => one.id === payload?.componentId);
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
     * The second import **replaces** the first — same deck, same id there — and every placement
     * goes on pointing at the same `componentId`, which is the whole point of remembering where a
     * definition came from. What it does *not* do is touch the placements: taking the new parts is
     * `applyComponent`, offered by the badge, because a reader who refreshes a brand kit and finds
     * forty slides rearranged has lost forty slides.
     */
    register(
      'importComponent',
      async (payload) => await this._import(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.componentId !== 'string') return false;
        if (typeof payload?.deck !== 'string' || payload.deck.length === 0) return false;
        const source = payload?.source ? accessOfTree(payload.source as never) : undefined;
        return !!source && deckComponents(source).some((one) => one.id === payload.componentId);
      }
    );

    /**
     * How big the card is.
     *
     * The definition's own size, and therefore every placement's: a placement gets no resize
     * handles, because its extent is the card's and scaling one on its own needs a constraint
     * model this schema does not have (canvas-model §10b-12). So this is the way a reader
     * changes a card's size, and `applyComponent` carries it to the placements.
     */
    register(
      'setComponentSize',
      async (payload) => await this._setSize(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc) return false;
        const found = deckComponents(doc).find((one) => one.id === payload?.componentId);
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
        return !!payload?.componentId && !!deckComponents(doc).find((one) => one.id === payload.componentId);
      }
    );

    /**
     * What one **part** of a definition takes: its words, its colour, whether it is there — and
     * whether it is the slot.
     *
     * One command for the four because they are one decision made in one panel row, and because
     * clearing is the same gesture as setting: a payload naming `bindText: null` takes the
     * binding off. A part is named by its sid because the reader has it selected; the definition
     * it belongs to is worked out rather than asked for (`definitionAt`), since a caller that
     * had to say would be a caller that can say the wrong thing.
     */
    register(
      'bindComponentPart',
      async (payload) => await this._bind(editor, payload),
      (payload) => {
        const doc = this._access(editor);
        if (!doc || typeof payload?.nodeId !== 'string') return false;
        // Only inside a definition: a binding on a box that is on a slide is a claim about a
        // card that does not exist, and nothing would ever read it.
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
     * The definition's parts: the reader's own boxes, moved to the card's corner and given a
     * durable name each.
     *
     * `copyOf` through `partCopy` is not used here — that is for making a *placement* from a
     * definition, and this is the other direction.
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
     * What the slide gets instead: a placement, holding a copy of each part.
     *
     * Each copy records **what it was given** — the same thing `partCopy` writes when a
     * definition is applied — and so does the placement. Measured without it: the placement
     * left behind by 만들기 had no record on any part, so the first 모두 적용 treated every one
     * of them as a part the reader had edited and changed nothing. A component made from a
     * selection has to be indistinguishable from one that was placed.
     */
    const placement: DeckNode = {
      stype: 'instance',
      attributes: {
        componentId: id,
        x: left,
        y: top,
        width,
        height,
        // The same shape `componentSignature` builds — from the literal parts, because the
        // transaction that puts the definition in the document has not run yet.
        appliedFrom: definitionSignature(
          [],
          parts.map((part) => signatureOfLiteral(part, 'all'))
        )
      },
      content: chosen.map((sid) => {
        const copy = copyRebased(doc, sid, left, top);
        const written = {
          ...copy,
          attributes: { ...(copy?.attributes ?? {}), partOf: names.get(sid) }
        } as DeckNode;
        return {
          ...written,
          attributes: {
            ...written.attributes,
            appliedFrom: signatureOfLiteral(written, 'all')
          }
        } as DeckNode;
      }) as never
    };

    const library = libraryOf(doc);
    const steps: unknown[] = [];
    /*
     * A library, if the deck has none yet. Made in the same transaction as the definition, so
     * one press of undo takes back "made a component" rather than leaving an empty container
     * behind — the deck was a deck without one a moment ago.
     */
    if (!library) {
      steps.push({
        type: 'addChild',
        payload: { parentId: doc.rootId, child: { stype: 'components', content: [definition] } }
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
    const definition = deckComponents(doc).find((one) => one.id === payload?.componentId);
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
        ...size,
        /*
         * What the definition said when the parts were taken, so `componentStale` can tell
         * "the definition has moved on" from "the reader edited this placement" later. Written
         * here rather than computed on demand for the reason a signature exists at all: a
         * version number would have to be maintained by a write on every edit.
         */
        appliedFrom: componentSignature(doc, definition)
      },
      content: partsFor(doc, definition, new Map()) as never
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

  private async _apply(
    editor: Editor,
    payload: { nodeId?: string; componentId?: string }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc) return false;

    const targets =
      typeof payload?.nodeId === 'string'
        ? [payload.nodeId]
        : placementsOf(doc, payload?.componentId ?? '');
    if (targets.length === 0) return false;

    const steps: unknown[] = [];
    for (const sid of targets) {
      const instance = doc.getNode(sid);
      const definition = componentOf(doc, instance);
      const plan = componentApplyPlan(doc, instance, definition);
      if (!definition || !plan) continue;
      const values = instanceValues(doc, instance, definition);

      for (const gone of plan.remove) {
        steps.push({ type: 'removeChild', payload: { parentId: sid, childId: gone } });
      }

      for (const part of plan.rewrite) {
        const fresh = partCopy(doc, part.from, values);
        if (!fresh) continue;
        /*
         * The part's own attributes, and its children only when it is not a slot.
         *
         * A slot's contents are the reader's — they are the one thing living *under* a part
         * that has an origin, so the "a part with no origin is untouched" rule does not reach
         * them, and a rewrite that replaced them would be apply deleting the reader's work.
         */
        steps.push({
          type: 'setAttrs',
          payload: { nodeId: part.sid, attrs: fresh.attributes ?? {} }
        });
        if (part.keepChildren) continue;
        for (const old of childrenOf(doc.getNode(part.sid))) {
          steps.push({ type: 'removeChild', payload: { parentId: part.sid, childId: old } });
        }
        for (const child of (fresh as { content?: unknown[] }).content ?? []) {
          steps.push({ type: 'addChild', payload: { parentId: part.sid, child } });
        }
      }

      for (const added of plan.add) {
        const fresh = partCopy(doc, added, values);
        if (fresh) steps.push({ type: 'addChild', payload: { parentId: sid, child: fresh } });
      }

      steps.push({
        type: 'setAttrs',
        payload: {
          nodeId: sid,
          attrs: {
            appliedFrom: plan.appliedFrom,
            // The box as well, when the card is a different size than this placement says: a
            // placement's extent *is* its definition's, and nothing else keeps them in step.
            ...(plan.box ?? {})
          }
        }
      });
    }

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success === true;
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

    /**
     * And the parts that bind it, rewritten from the definition with the new value.
     *
     * Only the parts that *bind this name*: a value is not an excuse to overwrite a placement
     * whole. A part the reader edited is rewritten when it binds the name they just changed —
     * see the command's note — and left alone otherwise.
     */
    const values = new Map(instanceValues(doc, instance, definition));
    values.set(payload.name, payload.value ?? '');
    for (const part of childrenOf(instance)) {
      const origin = doc.getNode(part)?.attributes?.partOf;
      if (typeof origin !== 'string') continue;
      const from = definition.parts.find((one) => partIdOf(doc, one) === origin);
      if (!from || !bindsName(doc.getNode(from), payload.name)) continue;
      const fresh = partCopy(doc, from, values);
      if (!fresh) continue;
      steps.push({ type: 'setAttrs', payload: { nodeId: part, attrs: fresh.attributes ?? {} } });
      for (const old of childrenOf(doc.getNode(part))) {
        steps.push({ type: 'removeChild', payload: { parentId: part, childId: old } });
      }
      for (const child of (fresh as { content?: unknown[] }).content ?? []) {
        steps.push({ type: 'addChild', payload: { parentId: part, child } });
      }
    }

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
      // "I brought a card in" rather than leaving an empty container behind.
      steps.push({
        type: 'addChild',
        payload: { parentId: doc.rootId, child: { stype: 'components', content: [plan.node] } }
      });
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private async _setSize(
    editor: Editor,
    payload: { componentId?: string; width?: number; height?: number }
  ): Promise<boolean> {
    const doc = this._access(editor);
    const definition = doc && deckComponents(doc).find((one) => one.id === payload?.componentId);
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
    const definition = doc && deckComponents(doc).find((one) => one.id === payload?.componentId);
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

  private async _bind(
    editor: Editor,
    payload: {
      nodeId?: string;
      bindText?: string | null;
      bindFill?: string | null;
      bindVisible?: string | null;
      slot?: string | null;
    }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.nodeId !== 'string') return false;

    const attrs: Record<string, unknown> = {};
    for (const key of ['bindText', 'bindFill', 'bindVisible', 'slot'] as const) {
      // `null` is how an attribute is removed, and an empty string arrives from a cleared
      // control meaning the same thing — so both become the removal rather than a binding to a
      // variable called "".
      if (payload[key] === undefined) continue;
      attrs[key] = payload[key] === null || payload[key] === '' ? null : payload[key];
    }
    if (Object.keys(attrs).length === 0) return false;

    return (
      (await transaction(editor, [
        { type: 'setAttrs', payload: { nodeId: payload.nodeId, attrs } }
      ] as never).commit()).success === true
    );
  }

  private async _detach(editor: Editor, payload: { nodeId?: string }): Promise<boolean> {
    const doc = this._access(editor);
    const instance = doc?.getNode(payload?.nodeId as string);
    if (!doc || !instance || instance.stype !== 'instance') return false;

    const steps: unknown[] = [];
    for (const sid of childrenOf(instance)) {
      const node = doc.getNode(sid);
      if (node?.stype === 'componentValue') {
        steps.push({ type: 'removeChild', payload: { parentId: payload!.nodeId, childId: sid } });
        continue;
      }
      // The pairing goes, or a re-attached copy would be picked up by the next apply — and
      // `partOf` on a box in a group is a claim about a definition that no longer holds.
      steps.push({
        type: 'setAttrs',
        payload: {
          nodeId: sid,
          attrs: {
            partOf: null,
            appliedFrom: null,
            bindText: null,
            bindFill: null,
            bindVisible: null,
            slot: null
          }
        }
      });
    }
    /*
     * Two steps, and the order matters: the claim comes off, then the node becomes a group.
     *
     * `transformNode`'s `newAttrs` merges, so the `componentId` survived it — measured, and a
     * detached card that still said which definition it was a placement of would be picked up
     * by the next 모두 적용. Removing an attribute is `setAttrs` with `null`, which is the one
     * way to say "not set" for every type (see the operation).
     */
    steps.push({
      type: 'setAttrs',
      payload: { nodeId: payload!.nodeId, attrs: { componentId: null, appliedFrom: null } }
    });
    steps.push({
      type: 'transformNode',
      payload: { nodeId: payload!.nodeId, newType: 'group' }
    });

    return (await transaction(editor, steps as never).commit()).success === true;
  }
}

/** Whether this part takes anything from the named variable. */
function bindsName(part: DeckNode | undefined, name: string): boolean {
  const attrs = part?.attributes ?? {};
  return attrs.bindText === name || attrs.bindFill === name || attrs.bindVisible === name;
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
export { instanceSlot };
