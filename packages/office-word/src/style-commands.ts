import type { Editor, Extension, ModelSelection } from '@barocss/editor-core';
import { transaction, transformNode, setAttrs } from '@barocss/model';
import { selectedBlocks } from './selected-blocks';

type StylePayload = { level?: number; selection?: ModelSelection };

/** A Word heading is both a semantic block and a reference to a paragraph style. */
export function createWordStyleCommands(): Extension {
  return {
    name: 'wordStyles',
    priority: 45,
    onCreate(editor: Editor) {
      const blocks = (ed: Editor, payload?: StylePayload) => {
        const selection = payload?.selection ?? ed.selection;
        if (selection?.type !== 'range') return [];
        return selectedBlocks(ed, selection).filter((node) => node.stype === 'paragraph' || node.stype === 'heading');
      };
      const register = (name: string, levelOf: (payload?: StylePayload) => number | undefined) => {
        editor.registerCommand({
          name,
          canExecute: (ed: Editor, payload?: StylePayload) => {
            const level = levelOf(payload);
            return level !== undefined && Number.isInteger(level) && level >= 0 && level <= 6 && blocks(ed, payload).some((node) =>
              node.stype !== (level ? 'heading' : 'paragraph') || node.attributes?.styleId !== (level ? `Heading${level}` : 'Body')
            );
          },
          execute: async (ed: Editor, payload?: StylePayload) => {
            const level = levelOf(payload);
            const targets = blocks(ed, payload);
            if (level === undefined || !Number.isInteger(level) || level < 0 || level > 6 || !targets.length) return false;
            const result = await transaction(ed, targets.flatMap((node) => [
              transformNode(node.sid!, level ? 'heading' : 'paragraph', level ? { level } : {}),
              setAttrs(node.sid!, { styleId: level ? `Heading${level}` : 'Body' })
            ]), { applySelectionToView: true }).commit();
            return result.success;
          }
        });
      };
      for (let level = 1; level <= 6; level++) register(`setHeading${level}`, () => level);
      register('setHeading', (payload) => payload?.level);
      register('setParagraph', () => 0);
      register('removeHeading', () => 0);
    }
  };
}
