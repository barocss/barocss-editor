import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control } from '@barocss/model';

export interface TextExtensionOptions {
  enabled?: boolean;
}

/**
 * Text Extension - 텍스트 입력 기능을 제공하는 Extension
 * 
 * 주요 기능:
 * - 텍스트 교체 (삽입/삭제/교체)
 * - History 자동 관리 (TransactionManager가 처리)
 */
export class TextExtension implements Extension {
  name = 'text';
  priority = 200; // 높은 우선순위 (기본 텍스트 기능)
  
  private _options: TextExtensionOptions;

  constructor(options: TextExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // replaceText 명령어 등록
    editor.registerCommand({
      name: 'replaceText',
      execute: async (editor: Editor, payload: { 
        range: ModelSelection,
        text: string 
      }) => {
        return await this._executeReplaceText(editor, payload.range, payload.text);
      },
      canExecute: (editor: Editor, payload?: any) => {
        return payload?.range != null && payload?.text != null;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업
  }

  /**
   * 텍스트 교체 실행
   * 
   * Command의 책임:
   * 1. Operations 조합 (삽입만 있는지, 교체가 있는지 판단)
   * 2. Transaction 실행
   */
  private async _executeReplaceText(
    editor: Editor,
    range: ModelSelection,
    text: string
  ): Promise<boolean> {
    // 삽입만 있는 경우 (start === end)
    if (range.startOffset === range.endOffset) {
      const operations = this._buildInsertTextOperations(range, text);
      const result = await transaction(editor, operations).commit();
      return result.success;
    }

    // 교체 또는 삭제가 있는 경우
    // 여러 operations를 조합하여 하나의 transaction으로 실행
    const operations = [
      ...this._buildDeleteTextOperations(range),
      ...this._buildInsertTextOperations(
        { ...range, endOffset: range.startOffset },
        text
      )
    ];
    
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * 삽입 operations 생성
   */
  private _buildInsertTextOperations(
    range: ModelSelection,
    text: string
  ): any[] {
    return [
      ...control(range.startNodeId, [
        {
          type: 'insertText',
          payload: {
            pos: range.startOffset,
            text: text
          }
        }
      ])
    ];
  }

  /**
   * 삭제 operations 생성
   */
  private _buildDeleteTextOperations(range: ModelSelection): any[] {
    return [
      ...control(range.startNodeId, [
        {
          type: 'deleteTextRange',
          payload: {
            start: range.startOffset,
            end: range.endOffset
          }
        }
      ])
    ];
  }
}

// 편의 함수
export function createTextExtension(options?: TextExtensionOptions): TextExtension {
  return new TextExtension(options);
}

