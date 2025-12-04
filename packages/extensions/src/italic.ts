import { Extension } from '@barocss/editor-core';

export interface ItalicExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

export class ItalicExtension implements Extension {
  name = 'italic';
  priority = 100;
  
  private _options: ItalicExtensionOptions;

  constructor(options: ItalicExtensionOptions = {}) {
    this._options = {
      enabled: true,
      keyboardShortcut: 'Mod+i',
      ...options
    };
  }

  onCreate(_editor: any): void {
    if (!this._options.enabled) return;

    // Italic 명령어 등록
    _editor.registerCommand({
      name: 'toggleItalic',
      execute: (editor: any) => {
        return this._toggleItalic(editor);
      },
      canExecute: (editor: any) => {
        return this._canToggleItalic(editor);
      }
    });

    // 키보드 단축키 등록
    if (this._options.keyboardShortcut) {
      this._registerKeyboardShortcut(_editor);
    }
  }

  onDestroy(_editor: any): void {
    // 정리 작업
  }

  private _toggleItalic(editor: any): boolean {
    try {
      const selection = editor.selection;
      
      if (selection.empty) {
        // 빈 선택: 현재 위치에 italic 마크 토글
        return this._toggleItalicAtPosition(editor, selection.anchor);
      } else {
        // 텍스트 선택: 선택된 텍스트에 italic 마크 토글
        return this._toggleItalicInRange(editor, selection.from, selection.to);
      }
    } catch (error) {
      console.error('Italic toggle failed:', error);
      return false;
    }
  }

  private _canToggleItalic(_editor: any): boolean {
    // TODO: 실제 구현 - 현재 선택이 italic을 적용할 수 있는지 확인
    return true;
  }

  private _toggleItalicAtPosition(_editor: any, position: number): boolean {
    // TODO: 실제 구현 - 특정 위치에서 italic 마크 토글
    console.log('Toggle italic at position:', position);
    return true;
  }

  private _toggleItalicInRange(_editor: any, from: number, to: number): boolean {
    // TODO: 실제 구현 - 범위에서 italic 마크 토글
    console.log('Toggle italic in range:', from, to);
    return true;
  }

  private _registerKeyboardShortcut(_editor: any): void {
    // TODO: 키보드 단축키 등록 로직
    console.log('Register italic keyboard shortcut:', this._options.keyboardShortcut);
  }
}

// 편의 함수
export function createItalicExtension(options?: ItalicExtensionOptions): ItalicExtension {
  return new ItalicExtension(options);
}

