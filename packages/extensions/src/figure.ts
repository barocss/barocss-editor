import { registerFigureRenderers } from './default-renderers';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild, setText } from '@barocss/model';

export class FigureExtension implements Extension {
  name = 'figure';
  priority = 100;

  /** What this extension's nodes look like when the product has not said. */

  defaultRenderers(): void {

    registerFigureRenderers();

  }


  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertFigure',
      execute: async (ed: Editor, payload?: { src?: string; alt?: string; caption?: string; selection?: ModelSelection }) => {
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const imgAttrs: any = { src: payload?.src ?? '', alt: payload?.alt ?? '' };
        const children: any[] = [
          { stype: 'inline-image', attributes: imgAttrs }
        ];

        if (payload?.caption !== undefined) {
          children.push({ stype: 'bFigcaption', content: [{ stype: 'inline-text', text: payload.caption }] });
        }

        const figNode = { stype: 'bFigure', content: children };
        const ops = [
          addChild(insertInfo.parentId, figNode as any, insertInfo.position)
        ];
        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      /**
       * A **range**, which the run has always required and this did not say.
       *
       * `canExecute: () => true` over an insert that needs somewhere to go: with a node held or
       * nothing selected the control lights up, the reader presses it, and the refusal goes to a
       * console nobody is watching — the class `guards.ts` names, and the one a **builder** meets
       * most, because a deck and a page builder spend their time with a box selected rather than a
       * caret.
       *
       * Invisible until the probe was given the two states a builder has: it had only ever put a
       * caret in a run, where every one of these works.
       */
      canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) => hasRange(ed, payload)
    });

    (editor as any).registerCommand({
      name: 'setFigcaption',
      /**
       * **Set**, which is what it is called and was not what it did.
       *
       * It only ever *added* a `bFigcaption`. A `bFigure` holds
       * `(inline-image|…)+ bFigcaption?` — **at most one** — so on a figure that already had a
       * caption the schema refused the second one and the command reported success and changed
       * nothing. Which is every figure this extension itself makes: `insertFigure` builds one with
       * a caption in it, so setting the caption of a figure you had just inserted was the case that
       * did not work.
       *
       * Found by this package's own conformance run. The command was in the first nine and it is the
       * subtlest of them, because it works exactly once per figure and then silently stops.
       */
      execute: async (ed: Editor, payload?: { figureId?: string; caption?: string }) => {
        const held = figcaptionOf(ed, payload?.figureId);
        if (!held) return false;

        const said = payload?.caption ?? '';
        /*
         * The words of the caption it already has, or a caption where there was none. Two shapes for
         * one sentence, and the reader means the same thing by both.
         */
        const ops = held.caption
          ? [setText(held.words ?? held.caption, said)]
          : [addChild(held.figure, { stype: 'bFigcaption', content: [{ stype: 'inline-text', text: said }] } as any)];

        const result = await transaction(ed, ops, { applySelectionToView: true }).commit();
        return result.success;
      },
      /**
       * A figure has to be **named and be one** — `() => true` was the whole guard.
       *
       * The class `guards.ts` names, and the fourth batch of it this package's conformance run has
       * turned up. A control that lights up over a paragraph and does nothing is worse than one that
       * is missing.
       */
      canExecute: (ed: Editor, payload?: { figureId?: string }) => !!figcaptionOf(ed, payload?.figureId)
    });
  }

  onDestroy(_editor: Editor): void {}

  private _getInsertInfo(editor: Editor, selection?: ModelSelection): { parentId: string; position: number } | null {
    const sel = selection || (editor as any).selection;
    if (!sel || sel.type !== 'range') return null;
    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;
    const node = dataStore.getNode(sel.startNodeId);
    if (!node) return null;

    let blockId = sel.startNodeId;
    let current = node;
    const schema = dataStore.getActiveSchema?.();
    while (current?.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;
      if (schema?.getNodeType?.(parent.stype)?.group === 'block') { blockId = parent.sid ?? current.parentId; break; }
      current = parent;
    }
    const block = dataStore.getNode(blockId);
    if (!block?.parentId) return null;
    const docParent = dataStore.getNode(block.parentId);
    if (!docParent || !Array.isArray(docParent.content)) return null;
    const idx = docParent.content.indexOf(blockId);
    return { parentId: block.parentId, position: idx === -1 ? docParent.content.length : idx + 1 };
  }
}

export function createFigureExtension(): FigureExtension {
  return new FigureExtension();
}

/**
 * The figure, and the caption it already has — the one lookup the guard and the run share.
 *
 * `undefined` when the id names nothing or names something that is not a figure, which is the whole
 * of what `canExecute` needs to answer. Two copies of this walk is how a guard comes to be looser
 * than its command without anybody writing it that way.
 */
function figcaptionOf(
  editor: Editor,
  figureId: string | undefined
): { figure: string; caption?: string; words?: string } | undefined {
  if (!figureId) return undefined;
  const store = editor.dataStore;
  if (!store) return undefined;

  const figure = store.getNode(figureId);
  if (!figure || figure.stype !== 'bFigure') return undefined;

  const caption = ((figure.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .find((sid) => store.getNode(sid)?.stype === 'bFigcaption');
  if (!caption) return { figure: figureId };

  // The run inside it, which is what carries the words — a caption is a box around them.
  const words = ((store.getNode(caption)?.content ?? []) as unknown[])
    .filter((sid): sid is string => typeof sid === 'string')
    .find((sid) => typeof store.getNode(sid)?.text === 'string');

  return { figure: figureId, caption, words };
}
