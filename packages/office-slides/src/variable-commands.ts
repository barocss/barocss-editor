import { Editor, Extension } from '@barocss/editor-core';
import { transaction } from '@barocss/model';
import { documentChildSpot } from '@barocss/schema';
import {
  documentVars,
  importVariablePlan,
  surfaceVars,
  varInScope,
  varBindsOf,
  varUses,
  UNBINDABLE,
  type VarBind
} from '@barocss/office-word';
import { childrenOf, type DeckAccess } from './deck';
import { accessOfTree } from './tree-access';

/**
 * Declaring **named values** — the document's, and one page's — and taking one away.
 *
 * Two scopes, two commands (`setDocumentVar`, `setSlideVar`), one writer: what a declaration looks
 * like is one thing to get right, and where it hangs is the difference. The document's are children
 * of a `variables` container; a page's are children of the page itself, first among them, where its
 * content model says a declaration goes.
 *
 * ## What removing one takes with it, and the asymmetry that is on purpose
 *
 * A **card's** bindings that name it go with it. A card is a definition the whole deck follows, so a
 * binding left pointing at nothing is a fault in a shared thing, repaired at the source — the same
 * reason a card's variable removal takes them.
 *
 * A **shape's** binding is left exactly where it is. That is the reader's own declaration on their
 * own box, they may re-declare the name in a minute, and the shape goes on drawing what it holds; the
 * deck's own check reports it as 볼 것 rather than this command editing their slide behind them.
 *
 * ## Why a command and not a dialog's own writing
 *
 * The same reason every other model change here is a command: the panel is one caller. A variable
 * is set from the deck's own list today, and a colour field will offer "make this a variable"
 * tomorrow — two gestures, one answer about what the document then holds, and `canExecute` is what
 * lets both grey out for the same reason.
 *
 * ## What removing one does, and the refusal it needs
 *
 * A reference to a name that is gone resolves to **nothing** — the shape draws no fill, which is
 * the theme's rule and the honest one, because inventing a colour would hide that the document has
 * lost something. That makes deleting a variable a thing a reader can do by accident and not
 * notice, so the command answers *how many places use it* (`varUses`) and the panel says the
 * number before it asks. Refusing outright was considered and rejected: a variable used in one
 * place a reader has already deleted the shape of is a variable they must be able to remove.
 *
 * The **bindings** that name it go with it, in the same transaction, for the reason a card's
 * variable removal takes them: a binding pointing at nothing is a part that silently draws whatever
 * it last had. References inside attributes are *not* rewritten, and that is deliberate — there is
 * no honest value to put in their place, and a shape whose fill quietly became `#000000` is worse
 * than one that plainly lost its colour. The deck's own check is what reports them.
 */
export class SlidesVariableExtension implements Extension {
  name = 'slides-variables';
  priority = 46;

  onCreate(editor: Editor): void {
    const register = (
      name: string,
      execute: (payload?: never) => Promise<boolean>,
      canExecute: (payload?: never) => boolean
    ) => {
      (editor as never as { registerCommand: (spec: unknown) => void }).registerCommand({
        name,
        execute: async (_ed: Editor, payload?: never) => await execute(payload),
        canExecute: (_ed: Editor, payload?: never) => canExecute(payload)
      });
    };

    /**
     * Declare one, change it, or take it away (`remove: true`).
     *
     * ## Why a name cannot be changed
     *
     * A variable's `name` is what every reference in the deck is written in, and `forFile` strips
     * sids so it has to be. Renaming would mean rewriting every attribute, in every slide and every
     * card, that names it — a migration rather than an edit — so the name is fixed when it is
     * declared and the **label** is what a reader changes. The rule a definition's `id`, a part's
     * `partId` and a shape's motion name already follow.
     */
    register(
      'setDocumentVar',
      async (payload) => await this._set(editor, payload as never),
      (payload) => {
        const said = payload as { name?: unknown; remove?: unknown } | undefined;
        if (!this._access(editor)) return false;
        if (typeof said?.name !== 'string' || said.name.length === 0) return false;
        const declared = documentVars(this._access(editor) as never).some(
          (one) => one.name === said.name
        );
        // Removing one that is not there is a gesture with no answer; declaring one twice is not.
        return said.remove === true ? declared : true;
      }
    );

    /**
     * The same, for **one page**: `setSlideVar({ slideId, name, … })`.
     *
     * A separate command rather than `setDocumentVar({ scope })`, because a command should say what
     * it does — the rule the harness gave when media tried to be one command with a `what`. And it
     * is the same three fields, because a reader setting a value should meet the same control
     * wherever the value lives.
     *
     * What a page's variable *is* for is written in the schema and §10h-3: "every card is our
     * accent, except on the summary page" is one declaration here instead of an override on each of
     * nine shapes.
     */
    register(
      'setSlideVar',
      async (payload) => await this._set(editor, payload as never),
      (payload) => {
        const said = payload as { slideId?: unknown; name?: unknown; remove?: unknown } | undefined;
        const doc = this._access(editor);
        if (!doc || typeof said?.name !== 'string' || said.name.length === 0) return false;
        if (typeof said.slideId !== 'string' || doc.getNode(said.slideId)?.stype !== 'surface') {
          return false;
        }
        const declared = surfaceVars(doc as never, said.slideId).some(
          (one) => one.name === said.name
        );
        return said.remove === true ? declared : true;
      }
    );

    /**
     * Bring one in from **another deck**: `importVariable({ deck, name, source })`.
     *
     * The brand kit's gesture (§10f) for a value instead of a card, and the command takes the parsed
     * source deck rather than fetching it — whether `brand-kit` is a name in a library or an address
     * is the host's question (§11i), and a model that reached for storage is a model nobody can test
     * in milliseconds.
     *
     * A name this deck already has is **overwritten**, which is what the gesture plainly asks for:
     * a variable's name is the reference every attribute in the deck is written in, so importing
     * under another name would change nothing that already names it. That is also what makes this
     * different from a paste, which keeps the destination's value because nobody asked (§10j).
     */
    register(
      'importVariable',
      async (payload) => await this._import(editor, payload as never),
      (payload) => {
        const said = payload as { deck?: unknown; name?: unknown; source?: unknown } | undefined;
        const doc = this._access(editor);
        if (!doc || typeof said?.deck !== 'string' || !said.deck) return false;
        if (typeof said?.name !== 'string' || !said.name) return false;
        if (!said.source || typeof said.source !== 'object') return false;
        // The source has to actually declare it: a button that reports success and brings nothing
        // is worse than one that is greyed.
        return documentVars(accessOfTree(said.source as never) as never).some(
          (one) => one.name === said.name
        );
      }
    );

    /**
     * What a **shape** takes from a variable: `setVarBind({ nodeIds, attr, var })`, and `var: null`
     * takes it off.
     *
     * A declaration on the shape (`varBinds`), not a reference in the attribute, because a reference
     * only fits where the schema says a string goes — measured, §10h. This is what lets a bare
     * rectangle's corner radius, a shape's opacity, a state and a text box's words follow the
     * document, which until now only worked inside a card.
     *
     * ## The two refusals
     *
     * **Geometry.** `x`, `y`, `width`, `height`, `rotation` are refused by name: a bound value is
     * resolved where the view reads children, so what is drawn would move while `getNode` answered
     * the stored number — and the overlay, the guides, the snapping and every command read
     * `getNode`. The handles would sit where the shape is not.
     *
     * **An attribute the shape does not declare.** The schema cannot check the target of a binding
     * (a content model cannot see across to another node's attributes), so the check is here, which
     * is the same division `setComponentBind` makes. `text` is always allowed and is not an
     * attribute: the words are content.
     */
    register(
      'setVarBind',
      async (payload) => await this._setBind(editor, payload as never),
      (payload) => {
        const said = payload as
          | { nodeIds?: unknown; nodeId?: unknown; attr?: unknown; var?: unknown }
          | undefined;
        const doc = this._access(editor);
        if (!doc || typeof said?.attr !== 'string' || !said.attr) return false;
        if (UNBINDABLE.has(said.attr)) return false;

        const ids = idsOf(said);
        if (ids.length === 0) return false;
        // Every one of them, because a gesture that half applies is worse than one that refuses:
        // the panel greys out and the reader is told rather than left guessing which box took it.
        if (!ids.every((sid) => bindableOn(editor, doc, sid, said.attr as string))) return false;

        if (said.var === null) return true;
        // In the shape's own scope, so a **page's** variable can be bound as well as the document's
        // (§10h-3). Asked of the first target, which is the one the panel's list was drawn from.
        return typeof said.var === 'string' && !!varInScope(doc as never, ids[0], said.var);
      }
    );
  }

  /**
   * Write — or take away — one binding on each of the given shapes.
   *
   * Replaced rather than added when the same attribute is named again: a shape that took 주의 in its
   * fill and now takes 강조 is one decision, and two entries about one attribute would be a shape
   * whose colour depended on which the resolution read last.
   */
  private async _setBind(
    editor: Editor,
    payload: { nodeIds?: string[]; nodeId?: string; attr?: string; var?: string | null }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.attr !== 'string' || !payload.attr) return false;

    const steps: unknown[] = [];
    for (const sid of idsOf(payload)) {
      const node = doc.getNode(sid);
      if (!node) continue;

      const kept = varBindsOf(node as never).filter((one) => one.attr !== payload.attr);
      const next: VarBind[] =
        typeof payload.var === 'string' && payload.var
          ? [...kept, { attr: payload.attr, var: payload.var }]
          : kept;

      steps.push({
        type: 'setAttrs',
        payload: {
          nodeId: sid,
          // An empty list is written as **absent**: a shape that takes nothing from a variable is
          // the ordinary case, and an empty array on every shape is noise in the file.
          attrs: { varBinds: next.length > 0 ? next : null }
        }
      });
    }

    if (steps.length === 0) return false;
    return (await transaction(editor, steps as never).commit()).success === true;
  }

  private _access(editor: Editor): DeckAccess | null {
    const store = (editor as never as { dataStore?: { getNode: (sid: string) => unknown } }).dataStore;
    const rootId = (editor as never as { getRootId?: () => string }).getRootId?.();
    if (!store || !rootId) return null;
    return { rootId, getNode: (sid: string) => store.getNode(sid) } as never as DeckAccess;
  }

  /** The document's `variables` container, or nothing when it has none yet. */
  private _container(doc: DeckAccess): string | undefined {
    return childrenOf(doc.getNode(doc.rootId)).find(
      (sid) => doc.getNode(sid)?.stype === 'variables'
    );
  }

  private async _set(
    editor: Editor,
    payload: {
      /** A page, when the variable is that page's own rather than the document's. */
      slideId?: string;
      name?: string;
      label?: string;
      kind?: string;
      choices?: string[];
      value?: string;
      remove?: boolean;
    }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.name !== 'string' || payload.name.length === 0) return false;

    /**
     * Which scope this is about — and therefore which node the declaration hangs from.
     *
     * A page's variables are children of the **surface** (`variable*` in its content model), where
     * the document's are children of a `variables` container. Two places because they are two
     * scopes; one function because writing a declaration is one thing to get right (only what the
     * caller said, one entry per name, and the list written away when the last one goes).
     */
    const onPage = typeof payload.slideId === 'string' && payload.slideId.length > 0;
    if (onPage && doc.getNode(payload.slideId as string)?.stype !== 'surface') return false;

    const declared = onPage
      ? surfaceVars(doc as never, payload.slideId).find((one) => one.name === payload.name)
      : documentVars(doc as never).find((one) => one.name === payload.name);
    const steps: unknown[] = [];

    if (payload.remove) {
      if (!declared) return false;
      const container = onPage ? payload.slideId : this._container(doc);
      if (!container) return false;
      steps.push({ type: 'removeChild', payload: { parentId: container, childId: declared.sid } });

      /*
       * And every card binding that named it — one walk, because a binding may be in any
       * definition and there is no index of them. A part left pointing at a name nothing declares
       * draws whatever it last had, which is the one outcome worse than losing the colour.
       */
      for (const bind of this._bindsNaming(doc, payload.name)) {
        steps.push({ type: 'removeChild', payload: { parentId: bind.parent, childId: bind.sid } });
      }

      return (await transaction(editor, steps as never).commit()).success === true;
    }

    /** Only what the caller said, so changing a label does not reset the value. */
    const attrs: Record<string, unknown> = { name: payload.name };
    if (payload.label !== undefined) attrs.label = payload.label;
    if (payload.kind !== undefined) attrs.kind = payload.kind;
    if (payload.choices !== undefined) attrs.choices = payload.choices;
    if (payload.value !== undefined) attrs.value = payload.value;

    if (declared) {
      steps.push({ type: 'setAttrs', payload: { nodeId: declared.sid, attrs } });
    } else if (onPage) {
      /*
       * **First** among the page's children, because that is where the content model says a
       * declaration goes (`variable* (block+ | (scene | frame)*)`) — appended, it would land after
       * the shapes and be refused, which is the same lesson `documentChildSpot` came from.
       */
      steps.push({
        type: 'addChild',
        payload: {
          parentId: payload.slideId,
          child: { stype: 'variable', attributes: attrs },
          position: surfaceVars(doc as never, payload.slideId).length
        }
      });
    } else {
      const container = this._container(doc);
      /*
       * A container, if the document has none yet — in the same transaction as the declaration, so
       * one press of undo takes back "I made a variable" rather than leaving an empty container
       * behind. The library does the same thing for the same reason.
       */
      if (container) {
        steps.push({
          type: 'addChild',
          payload: { parentId: container, child: { stype: 'variable', attributes: attrs } }
        });
      } else {
        /*
         * At the place the schema says, not at the end. `variables` happens to be last today, so
         * appending would work — and would break silently the day something is declared after it,
         * which is exactly how the mirror of this was found: a deck that gained a variable before
         * its first card could not then have a card, because the library was appended.
         */
        steps.push({
          type: 'addChild',
          payload: {
            parentId: doc.rootId,
            child: { stype: 'variables', content: [{ stype: 'variable', attributes: attrs }] },
            position: documentChildSpot(
              childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype),
              'variables'
            )
          }
        });
      }
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /**
   * Bring one value in from another document, in one entry.
   *
   * The container comes with it when the deck has none, for the reason every other maker of one does:
   * one press of undo takes back "I brought a value in" rather than leaving an empty container behind.
   */
  private async _import(
    editor: Editor,
    payload: { deck?: string; name?: string; source?: unknown }
  ): Promise<boolean> {
    const doc = this._access(editor);
    if (!doc || typeof payload?.deck !== 'string' || typeof payload?.name !== 'string') return false;

    const source = accessOfTree(payload.source as never);
    const plan = importVariablePlan(doc as never, source as never, payload.name, payload.deck);
    if (!plan) return false;

    const steps: unknown[] = [];
    if (plan.replaces) {
      /*
       * Replaced in place rather than added beside: the name is the reference, so what has to change
       * is the value under it — and everything in the deck that names it is drawn again with no
       * further writing.
       */
      const parent = (doc.getNode(plan.replaces) as { parentId?: unknown } | undefined)?.parentId;
      if (typeof parent !== 'string') return false;
      steps.push({ type: 'removeChild', payload: { parentId: parent, childId: plan.replaces } });
      steps.push({ type: 'addChild', payload: { parentId: parent, child: plan.node } });
    } else {
      const container = this._container(doc);
      if (container) {
        steps.push({ type: 'addChild', payload: { parentId: container, child: plan.node } });
      } else {
        steps.push({
          type: 'addChild',
          payload: {
            parentId: doc.rootId,
            child: { stype: 'variables', content: [plan.node] },
            position: documentChildSpot(
              childrenOf(doc.getNode(doc.rootId)).map((sid) => doc.getNode(sid)?.stype),
              'variables'
            )
          }
        });
      }
    }

    return (await transaction(editor, steps as never).commit()).success === true;
  }

  /**
   * Every `componentBind` in the document that names this variable, with the card it is in.
   *
   * A card that declares the same name is skipped: its bindings point at its own declaration, so
   * removing the document's would not touch them — the "card first" rule (§10h), read the same way
   * `varUses` reads it.
   */
  private _bindsNaming(doc: DeckAccess, name: string): { sid: string; parent: string }[] {
    const found: { sid: string; parent: string }[] = [];

    const walk = (sid: string, depth: number) => {
      if (depth > 32) return;
      const node = doc.getNode(sid);
      if (!node) return;

      if (node.stype === 'component') {
        const kids = childrenOf(node);
        const own = kids.some((child) => {
          const declaration = doc.getNode(child);
          return declaration?.stype === 'componentVar' && declaration.attributes?.name === name;
        });
        if (!own) {
          for (const child of kids) {
            const bind = doc.getNode(child);
            if (bind?.stype === 'componentBind' && bind.attributes?.var === name) {
              found.push({ sid: child, parent: sid });
            }
          }
        }
        return;
      }

      for (const child of childrenOf(node)) walk(child, depth + 1);
    };

    walk(doc.rootId, 0);
    return found;
  }
}

/** How many places name it — the number a panel says before it offers to delete one. */
export function documentVarUses(doc: DeckAccess, name: string): number {
  return varUses(doc as never, name);
}

export function createVariableCommands(): Extension {
  return new SlidesVariableExtension();
}

/** The shapes a payload names, one or many. */
function idsOf(payload: { nodeIds?: unknown; nodeId?: unknown } | undefined): string[] {
  if (Array.isArray(payload?.nodeIds)) {
    return payload!.nodeIds.filter((sid): sid is string => typeof sid === 'string');
  }
  return typeof payload?.nodeId === 'string' ? [payload.nodeId] : [];
}

/**
 * Whether this shape declares that attribute — the check the schema cannot make.
 *
 * Asked of the **schema**, through the store, so it is the same answer the validator would give
 * rather than a list kept here that would go out of date the day an attribute was added.
 */
function bindableOn(editor: Editor, doc: DeckAccess, sid: string, attr: string): boolean {
  const node = doc.getNode(sid);
  if (!node) return false;
  // The words are content, not an attribute, and every node that holds text can take them.
  if (attr === 'text') return true;

  const schema = (editor as never as { dataStore?: { getActiveSchema?: () => unknown } }).dataStore?.getActiveSchema?.();
  const attrs = (schema as { getNodeType?: (t: string) => { attrs?: Record<string, unknown> } })
    ?.getNodeType?.(node.stype ?? '')?.attrs;
  return !!attrs && attr in attrs;
}
