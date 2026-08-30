import { Editor, Extension } from '@barocss/editor-core';

/**
 * SelectAllExtension
 *
 * 책임:
 * - 'selectAll' 커맨드 정의
 * - SelectionManager 를 통해 모델 전체 텍스트 범위를 선택
 */
export class SelectAllExtension implements Extension {
  name = 'selectAll';
  priority = 100;

  onCreate(editor: Editor): void {
    editor.registerCommand({
      name: 'selectAll',
      execute: (editor: Editor) => {
        const selectionManager = editor.selectionManager;
        if (!selectionManager || typeof selectionManager.selectAll !== 'function') {
          console.warn('[SelectAllExtension] selectionManager or selectAll() is not available');
          return false;
        }

        // 1) Delegate to SelectionManager to calculate ModelSelection
        selectionManager.selectAll();

        // 2) Pass ModelSelection stored in SelectionManager to Editor
        const selection = selectionManager.getCurrentSelection();

        // 3) Update selection, context, and events in batch via Editor.updateSelection() path
        editor.updateSelection(selection);

        return true;
      },
      /**
       * A document with something in it.
       *
       * `() => true` was the last one of these in the package, and it is honest for almost every
       * state — selecting everything works from a caret, from a held box and from nothing held. It
       * is not honest over an **empty** document, where the run selects nothing and reports success.
       *
       * A narrow case, and the reason to close it anyway is that `() => true` is not a guard: it is
       * the absence of one, and the day the run grows a requirement nothing will say so.
       */
      canExecute: (ed: Editor) => {
        const rootId = ed.getRootId?.();
        const root = rootId ? ed.dataStore?.getNode(rootId) : undefined;
        return ((root?.content ?? []) as unknown[]).length > 0;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // No cleanup needed
  }
}


