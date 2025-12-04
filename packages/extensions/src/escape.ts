import { Editor, Extension } from '@barocss/editor-core';

export interface EscapeExtensionOptions {
  enabled?: boolean;
}

/**
 * EscapeExtension
 *
 * - `escape` 커맨드를 제공한다.
 * - 선택이 있으면 선택 취소, 없으면 포커스 해제
 */
export class EscapeExtension implements Extension {
  name = 'escape';
  priority = 100;

  private _options: EscapeExtensionOptions;

  constructor(options: EscapeExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Escape 명령어 등록
    (editor as any).registerCommand({
      name: 'escape',
      execute: (ed: Editor) => {
        return this._executeEscape(ed);
      },
      canExecute: () => {
        return true;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 필요 시 여기에 추가
  }

  private _executeEscape(editor: Editor): boolean {
    const selection = editor.selection;
    
    // 선택이 있으면 선택 취소
    if (selection && !this._isSelectionEmpty(selection)) {
      editor.clearSelection();
      return true;
    }
    
    // 선택이 없으면 포커스 해제 이벤트 emit (EditorViewDOM에서 처리)
    editor.emit('editor:blur.request', {});
    return true;
  }

  private _isSelectionEmpty(selection: any): boolean {
    if (!selection) return true;
    
    if (selection.type === 'range') {
      return selection.collapsed || 
             (selection.startNodeId === selection.endNodeId && 
              selection.startOffset === selection.endOffset);
    }
    
    return false;
  }
}

// 편의 함수
export function createEscapeExtension(options?: EscapeExtensionOptions): EscapeExtension {
  return new EscapeExtension(options);
}

