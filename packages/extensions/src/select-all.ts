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

        // 1) SelectionManager 가 ModelSelection 을 계산하도록 위임
        selectionManager.selectAll();

        // 2) SelectionManager 에 저장된 ModelSelection 을 Editor 로 전달
        const selection = selectionManager.getCurrentSelection();

        // 3) Editor.updateSelection() 경로를 통해 selection 및 context, 이벤트를 일괄 갱신
        editor.updateSelection(selection);

        return true;
      },
      canExecute: () => true
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 없음
  }
}


