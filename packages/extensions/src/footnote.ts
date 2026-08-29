import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
import { transaction, addChild, applyMark } from '@barocss/model';

export class FootnoteExtension implements Extension {
  name = 'footnote';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertFootnote',
      execute: async (ed: Editor, payload?: { id?: string; text?: string; selection?: ModelSelection }) => {
        if (!payload?.id) return false;
        const sel = payload?.selection || (ed as any).selection;
        if (!sel || sel.type !== 'range') return false;

        const dataStore = (ed as any).dataStore;
        if (!dataStore) return false;

        const docNode = dataStore.getNode(dataStore.getRootNodeId?.() ?? 'document');
        if (!docNode) return false;
        const docId = docNode.sid ?? 'document';

        const footnoteDefNode = {
          stype: 'footnoteDef',
          attributes: { id: payload.id },
          content: [{ stype: 'inline-text', text: payload?.text ?? '' }]
        };
        const ops: any[] = [addChild(docId, footnoteDefNode as any)];

        const refOp = applyMark(
          sel.startNodeId, sel.startOffset,
          sel.endNodeId, sel.endOffset,
          'footnoteRef', { id: payload.id }
        );
        ops.push(refOp);

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
      name: 'insertFootnoteRef',
      execute: async (ed: Editor, payload?: { id?: string; selection?: ModelSelection }) => {
        if (!payload?.id) return false;
        const sel = payload?.selection || (ed as any).selection;
        if (!sel || sel.type !== 'range') return false;

        const op = applyMark(
          sel.startNodeId, sel.startOffset,
          sel.endNodeId, sel.endOffset,
          'footnoteRef', { id: payload.id }
        );
        const result = await transaction(ed, [op]).commit();
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
  }

  onDestroy(_editor: Editor): void {}
}

export function createFootnoteExtension(): FootnoteExtension {
  return new FootnoteExtension();
}
