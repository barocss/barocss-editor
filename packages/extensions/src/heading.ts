import { Extension } from '@barocss/editor-core';

export interface HeadingExtensionOptions {
  enabled?: boolean;
  levels?: number[];
  keyboardShortcuts?: Record<number, string>;
}

export class HeadingExtension implements Extension {
  name = 'heading';
  priority = 100;
  
  private _options: HeadingExtensionOptions;

  constructor(options: HeadingExtensionOptions = {}) {
    this._options = {
      enabled: true,
      levels: [1, 2, 3, 4, 5, 6],
      keyboardShortcuts: {
        1: 'Mod+Alt+1',
        2: 'Mod+Alt+2',
        3: 'Mod+Alt+3'
      },
      ...options
    };
  }

  onCreate(_editor: any): void {
    if (!this._options.enabled) return;

    // 각 헤딩 레벨별 명령어 등록
    this._options.levels?.forEach(level => {
      _editor.registerCommand({
        name: `setHeading${level}`,
        execute: (editor: any) => {
          return this._setHeading(editor, level);
        },
        canExecute: (editor: any) => {
          return this._canSetHeading(editor, level);
        }
      });
    });

    // 일반 헤딩 설정 명령어
    _editor.registerCommand({
      name: 'setHeading',
      execute: (editor: any, payload: number) => {
        return this._setHeading(editor, payload);
      },
      canExecute: (editor: any, payload: number) => {
        return this._canSetHeading(editor, payload);
      }
    });

    // 헤딩 제거 명령어
    _editor.registerCommand({
      name: 'removeHeading',
      execute: (editor: any) => {
        return this._removeHeading(editor);
      },
      canExecute: (editor: any) => {
        return this._canRemoveHeading(editor);
      }
    });

    // 키보드 단축키 등록
    if (this._options.keyboardShortcuts) {
      this._registerKeyboardShortcuts(_editor);
    }
  }

  onDestroy(_editor: any): void {
    // 정리 작업
  }

  private _setHeading(editor: any, level: number): boolean {
    try {
      const selection = editor.selection;
      
      if (selection.empty) {
        // 빈 선택: 현재 위치에 헤딩 설정
        return this._setHeadingAtPosition(editor, level, selection.anchor);
      } else {
        // 텍스트 선택: 선택된 텍스트를 헤딩으로 변환
        return this._setHeadingInRange(editor, level, selection.from, selection.to);
      }
    } catch (error) {
      console.error('Set heading failed:', error);
      return false;
    }
  }

  private _canSetHeading(_editor: any, level: number): boolean {
    // TODO: 실제 구현 - 현재 선택에 헤딩을 설정할 수 있는지 확인
    return this._options.levels?.includes(level) || false;
  }

  private _canRemoveHeading(_editor: any): boolean {
    // TODO: 실제 구현 - 현재 선택에서 헤딩을 제거할 수 있는지 확인
    return true;
  }

  private _setHeadingAtPosition(_editor: any, level: number, position: number): boolean {
    // TODO: 실제 구현 - 특정 위치에 헤딩 설정
    console.log(`Set heading ${level} at position:`, position);
    return true;
  }

  private _setHeadingInRange(_editor: any, level: number, from: number, to: number): boolean {
    // TODO: 실제 구현 - 범위에 헤딩 설정
    console.log(`Set heading ${level} in range:`, from, to);
    return true;
  }

  private _removeHeading(editor: any): boolean {
    try {
      const selection = editor.selection;
      
      if (selection.empty) {
        return this._removeHeadingAtPosition(editor, selection.anchor);
      } else {
        return this._removeHeadingInRange(editor, selection.from, selection.to);
      }
    } catch (error) {
      console.error('Remove heading failed:', error);
      return false;
    }
  }

  private _removeHeadingAtPosition(_editor: any, position: number): boolean {
    // TODO: 실제 구현 - 특정 위치에서 헤딩 제거
    console.log('Remove heading at position:', position);
    return true;
  }

  private _removeHeadingInRange(_editor: any, from: number, to: number): boolean {
    // TODO: 실제 구현 - 범위에서 헤딩 제거
    console.log('Remove heading in range:', from, to);
    return true;
  }

  private _registerKeyboardShortcuts(_editor: any): void {
    // TODO: 키보드 단축키 등록 로직
    Object.entries(this._options.keyboardShortcuts || {}).forEach(([level, shortcut]) => {
      console.log(`Register heading ${level} keyboard shortcut:`, shortcut);
    });
  }
}

// 편의 함수
export function createHeadingExtension(options?: HeadingExtensionOptions): HeadingExtension {
  return new HeadingExtension(options);
}

