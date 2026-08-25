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
  renameVarPlan,
  UNBINDABLE,
  type VarBind
} from '@barocss/office-canvas';
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
     * ## The name is not one of the things this changes
     *
     * A variable's `name` is what every reference in the deck is written in, and `forFile` strips
     * sids so it has to be. So renaming is not an edit to the declaration — it is a **migration**
     * over the whole deck, and it is `renameDocumentVar` below rather than a field here: this
     * command writes one node, and a rename that wrote one node would leave every reference to the
     * old name resolving to nothing.
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
     * Rename one: `renameDocumentVar({ name, to })`, and the page's own beside it.
     *
     * ## Why this is a command and not a field on the one above
     *
     * A variable's name *is* the reference — `fill: 'var:강조'` — so changing it means rewriting
     * every attribute, every shape binding and every card binding in the deck that names it. That
     * was refused for as long as there was no walk that could find them all; `varSites` is that
     * walk, and it is the same one the panel's "3곳에서 씁니다" counts with, so the number a reader
     * is shown before renaming is exactly the set that gets rewritten.
     *
     * **One transaction**, so one press of undo takes the rename back whole. A half-renamed deck is
     * a deck where some shapes draw nothing, and it would be undone one shape at a time.
     *
     * ## What it refuses
     *
     * A name the same scope already declares. That would merge two variables into one and quietly
     * change what half the deck draws — and unlike a clash on import (§10f), nobody asked for it:
     * the reader is editing a name, not choosing between two values.
     */
    register(
      'renameDocumentVar',
      async (payload) => await this._rename(editor, payload as never),
      (payload) => this._canRename(editor, payload as never)
    );

    register(
      'renameSlideVar',
      async (payload) => await this._rename(editor, payload as never),
      (payload) => this._canRename(editor, payload as never)
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
   * Whether this rename can happen: the name is declared here, the new one is free here.
   *
   * "Here" is the scope, and it is the whole of the difference between the two commands: a page's
   * 강조 may be renamed to a name the *document* also declares, because a page's declaration was
   * already shadowing whatever the document said. Refusing that would refuse a legitimate edit for
   * the sake of a clash that does not exist.
   */
  private _canRename(
    editor: Editor,
    payload: { slideId?: unknown; name?: unknown; to?: unknown } | undefined
  ): boolean {
    const doc = this._access(editor);
    if (!doc) return false;
    if (typeof payload?.name !== 'string' || payload.name.length === 0) return false;
    if (typeof payload.to !== 'string' || payload.to.length === 0) return false;
    if (payload.to === payload.name) return false;

    const onPage = typeof payload.slideId === 'string' && payload.slideId.length > 0;
    if (onPage && doc.getNode(payload.slideId as string)?.stype !== 'surface') return false;

    const scope = onPage
      ? surfaceVars(doc as never, payload.slideId as string)
      : documentVars(doc as never);
    return (
      scope.some((one) => one.name === payload.name) && !scope.some((one) => one.name === payload.to)
    );
  }

  private async _rename(
    editor: Editor,
    payload: { slideId?: string; name?: string; to?: string }
  ): Promise<boolean> {
    if (!this._canRename(editor, payload as never)) return false;
    const doc = this._access(editor)!;

    const onPage = typeof payload.slideId === 'string' && payload.slideId.length > 0;
    const declared = onPage
      ? surfaceVars(doc as never, payload.slideId).find((one) => one.name === payload.name)
      : documentVars(doc as never).find((one) => one.name === payload.name);
    if (!declared) return false;

    const plan = renameVarPlan(doc as never, payload.name!, payload.to!, declared.sid);
    if (!plan) return false;

    /*
     * The declaration last is not a taste: `varSites` asks `varInScope` what each reference means,
     * and it is read against the document as it is now. A plan built first and written in one
     * transaction is one answer about one document — which is also why this is a plan rather than a
     * walk that writes as it goes.
     */
    const steps = [
      ...plan.writes.map((write) => ({
        type: 'setAttrs',
        payload: { nodeId: write.sid, attrs: write.attributes }
      })),
      { type: 'setAttrs', payload: { nodeId: plan.declaration, attrs: { name: payload.to } } }
    ];

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

/**
 * How many places name it — the number a panel says before it offers to delete one.
 *
 * `declaredAt` is which declaration is meant, and it matters the moment a page declares a name the
 * document also declares: without it the count is the document's *and* the page's added together,
 * and the panel tells a reader that deleting their page's 강조 would break four shapes on a slide
 * they have never opened.
 */
export function documentVarUses(doc: DeckAccess, name: string, declaredAt?: string): number {
  return varUses(doc as never, name, declaredAt);
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
