import { Editor, Extension, selectedNodeIds } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction } from '@barocss/model';

/**
 * Which way the text in a block is set.
 *
 * The key map has bound `Mod+l`, `Mod+e`, `Mod+r` and `Mod+j` to these commands
 * since Word's map was written, and nothing implemented them — the shortcuts
 * resolved and then quietly did nothing. A toolbar is what made it visible: its
 * buttons ask whether a command can run, and these four answered no.
 *
 * Alignment is a block property, so a selection spanning three paragraphs
 * aligns all three. That is what a user selecting three paragraphs and pressing
 * centre expects, and it is why this works from the blocks the selection
 * touches rather than from the node the caret happens to be in.
 */
export type Alignment = 'left' | 'center' | 'right' | 'justify';

const ALIGNMENTS: { command: string; value: Alignment }[] = [
  { command: 'alignLeft', value: 'left' },
  { command: 'alignCenter', value: 'center' },
  { command: 'alignRight', value: 'right' },
  { command: 'alignJustify', value: 'justify' }
];

export class AlignExtension implements Extension {
  name = 'align';
  priority = 50;

  onCreate(editor: Editor): void {
    for (const { command, value } of ALIGNMENTS) {
      (editor as any).registerCommand({
        name: command,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) =>
          await this._align(ed, value, payload?.selection ?? (ed as any).selection),
        canExecute: (ed: Editor, payload?: { selection?: ModelSelection }) =>
          this._blocksOf(ed, payload?.selection ?? (ed as any).selection).length > 0
      });
    }

    // One command that takes the value, for a control that has it in hand
    (editor as any).registerCommand({
      name: 'setAlignment',
      execute: async (ed: Editor, payload?: { alignment?: Alignment; selection?: ModelSelection }) =>
        payload?.alignment
          ? await this._align(ed, payload.alignment, payload.selection ?? (ed as any).selection)
          : false,
      canExecute: (ed: Editor, payload?: { alignment?: Alignment; selection?: ModelSelection }) =>
        !!payload?.alignment &&
        this._blocksOf(ed, payload.selection ?? (ed as any).selection).length > 0
    });
  }

  /**
   * The blocks a selection would align.
   *
   * A text selection aligns the blocks its text sits in; a selection of whole
   * nodes aligns those. Either way the answer is blocks, because that is what
   * carries the property.
   */
  private _blocksOf(editor: Editor, selection: ModelSelection | null | undefined): string[] {
    const dataStore = (editor as any).dataStore;
    if (!dataStore || !selection) return [];

    const blockOf = (sid: string): string | null => {
      let current: any = dataStore.getNode(sid);
      let depth = 0;
      while (current && depth++ < 64) {
        /* 이름 조건은 중복이었다 — `typeof text !== 'string'` 이 이미 글자 노드를 뺀다. */
        if (current.stype && typeof current.text !== 'string') {
          return current.sid ?? null;
        }
        current = current.parentId ? dataStore.getNode(current.parentId) : null;
      }
      return null;
    };

    // A range is only answerable while both of its ends exist. Undo removes the
    // nodes it reverts and leaves the selection pointing at them, so asking the
    // store to walk from a removed node to a live one is asking it to order two
    // nodes in different trees — which it rightly refuses to do.
    const live = (sid: string | undefined): boolean => !!sid && !!dataStore.getNode?.(sid);
    if (!live(selection.startNodeId)) return [];

    const starting = selectedNodeIds(selection);
    const sids =
      starting.length > 0
        ? starting
        : this._range(dataStore, selection);

    const blocks: string[] = [];
    for (const sid of sids as string[]) {
      const block = blockOf(sid);
      if (block && !blocks.includes(block)) blocks.push(block);
    }
    return blocks;
  }

  /**
   * The nodes a text range covers, or just its start if the range is not one
   * the store can walk.
   *
   * Two ends can both exist and still not be orderable — one in the body and
   * one in back matter are in different trees. Falling back to the start node
   * aligns the block the caret is in, which is the smallest correct answer;
   * throwing would take down whoever asked.
   */
  private _range(dataStore: any, selection: ModelSelection): string[] {
    try {
      return dataStore.getNodesInRange?.(selection.startNodeId, selection.endNodeId) ?? [
        selection.startNodeId
      ];
    } catch {
      return [selection.startNodeId];
    }
  }

  /**
   * Apply the alignment in one transaction.
   *
   * One because it is one edit: undo puts every block back, and a document
   * briefly showing two of three paragraphs centred is a state no reader should
   * be able to observe.
   */
  private async _align(
    editor: Editor,
    alignment: Alignment,
    selection: ModelSelection | null | undefined
  ): Promise<boolean> {
    const blocks = this._blocksOf(editor, selection);
    if (blocks.length === 0) return false;

    const operations = blocks.map((nodeId) => ({
      type: 'setAttrs',
      payload: { nodeId, attrs: { alignment } }
    }));

    const result = await transaction(editor, operations as never).commit();
    return result.success;
  }
}

export function createAlignExtension(): AlignExtension {
  return new AlignExtension();
}
