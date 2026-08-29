import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { hasRange } from './guards';
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
      /*
       * An address — **and somewhere to put the picture.** The run inserts at the selection and
       * refuses without one; the guard asked only about the address, so with a box held the control
       * lit up and the run declined. `toggleLink` had the identical pair and the identical fix.
       */
      canExecute: (ed: Editor, payload?: { src?: string; selection?: ModelSelection }) =>
        !!payload?.src && hasRange(ed, payload)
    });
  }

  onDestroy(_editor: Editor): void {}
}

export function createImageExtension(): ImageExtension {
  return new ImageExtension();
}
