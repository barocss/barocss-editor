import { Editor, Extension } from '@barocss/editor-core';
import { transaction, insertImage as insertImageOp } from '@barocss/model';

export class ImageExtension implements Extension {
  name = 'image';
  priority = 100;

  onCreate(editor: Editor): void {
    (editor as any).registerCommand({
      name: 'insertImage',
      execute: async (ed: Editor, payload?: { src?: string; alt?: string }) => {
        if (!payload?.src) return false;
        const ops = [insertImageOp(payload.src, payload.alt)];
        const result = await transaction(ed, ops).commit();
        return result.success;
      },
      canExecute: (_ed: Editor, payload?: { src?: string }) => !!payload?.src
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createImageExtension(): ImageExtension {
  return new ImageExtension();
}
