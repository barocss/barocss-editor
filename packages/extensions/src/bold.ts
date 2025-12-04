import { Editor, Extension } from '@barocss/editor-core';
import { TransactionBuilder, TransactionManager } from '@barocss/model';

export interface BoldExtensionOptions {
  enabled?: boolean;
  keyboardShortcut?: string;
}

export class BoldExtension implements Extension {
  name = 'bold';
  priority = 100;
  
  private _options: BoldExtensionOptions;

  constructor(options: BoldExtensionOptions = {}) {
    this._options = {
      enabled: true,
      keyboardShortcut: 'Mod+b',
      ...options
    };
  }

  onCreate(_editor: Editor): void {
    if (!this._options.enabled) return;

    // Bold 명령어 등록
    _editor.registerCommand({
      name: 'toggleBold',
      execute: async (editor: Editor) => {
        return await this._toggleBold(editor);
      },
      canExecute: (editor: Editor) => {
        return this._canToggleBold(editor);
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

  private async _toggleBold(editor: any): Promise<boolean> {
    try {
      const selection = editor.selection;
      console.log('[Bold] toggle:start', {
        selection,
        empty: selection?.empty,
        anchor: selection?.anchor,
        head: selection?.head,
      });
      
      // Transaction 생성 (모델 TransactionManager 사용)
      const tm = new TransactionManager(editor.dataStore);
      const transaction = tm.createBuilder('bold_toggle')
        .setMeta('type', 'bold_toggle')
        .setMeta('selection', selection);
      console.log('[Bold] tm:created', { hasTM: !!tm, builderOps: transaction.getOperations?.().length || 0 });
      console.log('[Bold] transaction:created', {
        meta: transaction.getMetadata?.() || {},
      });
      
      if (selection.empty) {
        // 빈 선택: 현재 위치에 bold 마크 토글
        console.log('[Bold] path:position');
        return await this._toggleBoldAtPosition(editor, selection.anchor, transaction);
      } else {
        // 텍스트 선택: 선택된 텍스트에 bold 마크 토글
        console.log('[Bold] path:range');
        return await this._toggleBoldInRange(editor, selection.from, selection.to, transaction);
      }
    } catch (error) {
      console.error('Bold toggle failed:', error);
      return false;
    }
  }

  private _canToggleBold(_editor: any): boolean {
    // TODO: 실제 구현 - 현재 선택이 bold를 적용할 수 있는지 확인
    return true;
  }

  private async _toggleBoldAtPosition(editor: any, position: number, transaction: TransactionBuilder): Promise<boolean> {
    try {
      // 현재 위치의 텍스트 노드 찾기
      const textNode = this._findTextNodeAtPosition(editor, position);
      console.log('[Bold] atPosition:foundTextNode', { position, nodeId: textNode?.sid, type: textNode?.type, textPreview: textNode?.text?.slice?.(0, 20) });
      
      if (!textNode) {
        console.warn('No text node found at position:', position);
        return false;
      }
      
      // 현재 bold 마크 상태 확인
      const hasBold = this._hasBoldMark(textNode);
      console.log('[Bold] atPosition:hasBold', { nodeId: textNode.sid, hasBold, marks: textNode.marks });
      
      if (hasBold) {
        // bold 마크 제거
        transaction.updateNode(textNode.sid, {
          marks: textNode.marks?.filter((mark: any) => mark.type !== 'bold') || []
        });
        console.log('[Bold] atPosition:enqueue remove bold', { nodeId: textNode.sid });
      } else {
        // bold 마크 추가
        const boldMark = {
          type: 'bold',
          range: [0, textNode.text?.length || 0],
          attributes: {}
        };
        
        transaction.updateNode(textNode.sid, {
          marks: [...(textNode.marks || []), boldMark]
        });
        console.log('[Bold] atPosition:enqueue add bold', { nodeId: textNode.sid, boldMark });
      }
      
      // Transaction 실행
      console.log('[Bold] atPosition:commit:start');
      return this._executeTransaction(editor, transaction);
    } catch (error) {
      console.error('Toggle bold at position failed:', error);
      return false;
    }
  }

  private async _toggleBoldInRange(editor: any, from: number, to: number, transaction: TransactionBuilder): Promise<boolean> {
    try {
      // 범위 내의 모든 텍스트 노드 찾기
      const textNodes = this._findTextNodesInRange(editor, from, to);
      console.log('[Bold] inRange:foundTextNodes', { from, to, count: textNodes.length, ids: textNodes.map((n: any) => n.sid) });
      
      if (textNodes.length === 0) {
        console.warn('No text nodes found in range:', from, to);
        return false;
      }
      
      // 모든 텍스트 노드에 bold 마크 토글
      for (const textNode of textNodes) {
        const hasBold = this._hasBoldMark(textNode);
        console.log('[Bold] inRange:node', { nodeId: textNode.sid, hasBold, marks: textNode.marks });
        
        if (hasBold) {
          // bold 마크 제거
          transaction.updateNode(textNode.sid, {
            marks: textNode.marks?.filter((mark: any) => mark.type !== 'bold') || []
          });
          console.log('[Bold] inRange:enqueue remove bold', { nodeId: textNode.sid });
        } else {
          // bold 마크 추가
          const boldMark = {
            type: 'bold',
            range: [0, textNode.text?.length || 0],
            attributes: {}
          };
          
          transaction.updateNode(textNode.sid, {
            marks: [...(textNode.marks || []), boldMark]
          });
          console.log('[Bold] inRange:enqueue add bold', { nodeId: textNode.sid, boldMark });
        }
      }
      
      // Transaction 실행
      console.log('[Bold] inRange:commit:start');
      return this._executeTransaction(editor, transaction);
    } catch (error) {
      console.error('Toggle bold in range failed:', error);
      return false;
    }
  }

  private _registerKeyboardShortcut(_editor: any): void {
    // TODO: 키보드 단축키 등록 로직
    console.log('[Bold] registerShortcut', this._options.keyboardShortcut);
  }

  // 헬퍼 메서드들
  private _findTextNodeAtPosition(editor: any, _position: number): any {
    // TODO: 실제 구현 - 위치에 해당하는 텍스트 노드 찾기
    // 현재는 더미 구현
    const document = editor.document;
    if (document.content && document.content.length > 0) {
      const found = document.content.find((node: any) => node.type === 'text');
      console.log('[Bold] findTextNodeAtPosition:dummy', { returnedId: found?.sid });
      return found;
    }
    return null;
  }

  private _findTextNodesInRange(editor: any, _from: number, _to: number): any[] {
    // TODO: 실제 구현 - 범위 내의 모든 텍스트 노드 찾기
    // 현재는 더미 구현
    const document = editor.document;
    if (document.content && document.content.length > 0) {
      return document.content.filter((node: any) => node.type === 'text');
    }
    return [];
  }

  private _hasBoldMark(node: any): boolean {
    return node.marks?.some((mark: any) => mark.type === 'bold') || false;
  }

  private async _executeTransaction(editor: any, transaction: TransactionBuilder): Promise<boolean> {
    try {
      const ops = transaction.getOperations?.() || [];
      const meta = transaction.getMetadata?.() || {};
      console.log('[Bold] commit:before', { opCount: ops.length, meta });
      const result = await transaction.commit();
      console.log('[Bold] commit:after', { success: result?.success, errors: result?.errors });
      if (result.success) {
        // 히스토리에 추가
        editor._addToHistory(editor._document);
        console.log('[Bold] history:added');
        return true;
      } else {
        console.error('Transaction failed:', result.errors);
        return false;
      }
    } catch (error) {
      console.error('Transaction execution failed:', error);
      return false;
    }
  }
}

// 편의 함수
export function createBoldExtension(options?: BoldExtensionOptions): BoldExtension {
  return new BoldExtension(options);
}

