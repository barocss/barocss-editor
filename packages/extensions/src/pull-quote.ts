import { registerPullQuoteRenderers } from './default-renderers';
import { hasRange } from './guards';
import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, addChild } from '@barocss/model';

export class PullQuoteExtension implements Extension {
  name = 'pullQuote';
  priority = 100;

  /** What this extension's nodes look like when the product has not said. */

  defaultRenderers(): void {

    registerPullQuoteRenderers();

  }


  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertPullQuote',
      execute: async (ed: Editor, payload?: { text?: string; selection?: ModelSelection }) => {
        const insertInfo = this._getInsertInfo(ed, payload?.selection);
        if (!insertInfo) return false;

        const children: any[] = payload?.text
          ? [{ stype: 'inline-text', text: payload.text }]
          : [{ stype: 'inline-text', text: '' }];

        const ops = [
          addChild(insertInfo.parentId, { stype: 'pullQuote', content: children } as any, insertInfo.position)
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
  }

  onDestroy(_editor: Editor): void {}

  private _getInsertInfo(editor: Editor, selection?: ModelSelection): { parentId: string; position: number } | null {
    const sel = selection || (editor as any).selection;
    if (!sel || sel.type !== 'range') return null;

    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;

    const node = dataStore.getNode(sel.startNodeId);
    if (!node) return null;

    const blockId = this._findBlockParent(dataStore, node);
    if (!blockId) return null;

    const block = dataStore.getNode(blockId);
    if (!block?.parentId) return null;

    const parent = dataStore.getNode(block.parentId);
    if (!parent || !Array.isArray(parent.content)) return null;

    const idx = parent.content.indexOf(blockId);
    return { parentId: block.parentId, position: idx === -1 ? parent.content.length : idx + 1 };
  }

  private _findBlockParent(dataStore: any, node: any): string | null {
    const schema = dataStore.getActiveSchema?.();
    let current = node;
    while (current) {
      const nodeType = schema?.getNodeType?.(current.stype);
      if (nodeType?.group === 'block') return current.sid ?? null;
      if (!current.parentId) break;
      current = dataStore.getNode(current.parentId);
    }
    return null;
  }
}

export function createPullQuoteExtension(): PullQuoteExtension {
  return new PullQuoteExtension();
}
