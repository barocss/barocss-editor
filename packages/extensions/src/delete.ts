import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control } from '@barocss/model';

/**
 * Delete Extension Options
 */
export interface DeleteExtensionOptions {
  enabled?: boolean;
}

/**
 * Delete Extension - 삭제 기능을 제공하는 Extension
 * 
 * 주요 기능:
 * - 단일 노드 내 텍스트 삭제
 * - Cross-node 텍스트 삭제
 * - Inline 노드 전체 삭제 (inline-image 등)
 * - History 자동 관리 (TransactionManager가 처리)
 */
export class DeleteExtension implements Extension {
  name = 'delete';
  priority = 100;
  
  private _options: DeleteExtensionOptions;

  constructor(options: DeleteExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // 1. 노드 전체 삭제
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: any, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      },
      canExecute: (_editor: any, payload?: any) => {
        return payload?.nodeId != null;
      }
    });

    // 2. Cross-node 텍스트 삭제
    editor.registerCommand({
      name: 'deleteCrossNode',
      execute: async (editor: any, payload: { range: ModelSelection }) => {
        return await this._executeDeleteCrossNode(editor, payload.range);
      },
      canExecute: (_editor: any, payload?: any) => {
        return payload?.range != null && 
               payload.range.startNodeId !== payload.range.endNodeId;
      }
    });

    // 3. 단일 노드 텍스트 삭제
    editor.registerCommand({
      name: 'deleteText',
      execute: async (editor: any, payload: { range: ModelSelection }) => {
        return await this._executeDeleteText(editor, payload.range);
      },
      canExecute: (_editor: any, payload?: any) => {
        return payload?.range != null && 
               payload.range.startNodeId === payload.range.endNodeId;
      }
    });

    // 4. Backspace 키 처리 (비즈니스 로직 포함)
    // selection은 payload에 있으면 사용, 없으면 editor.selection 사용
    editor.registerCommand({
      name: 'backspace',
      execute: async (editor: any, payload?: { selection?: ModelSelection }) => {
        // payload에 selection이 있으면 사용 (명시적 전달)
        // 없으면 editor.selection 사용 (기본값)
        const selection = payload?.selection || editor.selection;
        if (!selection) {
          console.warn('[DeleteExtension] backspace: No selection available');
          return false;
        }
        return await this._executeBackspace(editor, selection);
      },
      canExecute: (editor: any, payload?: any) => {
        // selection이 있으면 실행 가능
        const selection = payload?.selection || editor.selection;
        return selection != null;
      }
    });

    // 5. Delete 키 처리 (Forward Delete, Backspace와 대칭)
    // selection은 payload에 있으면 사용, 없으면 editor.selection 사용
    editor.registerCommand({
      name: 'deleteForward',
      execute: async (editor: any, payload?: { selection?: ModelSelection }) => {
        // payload에 selection이 있으면 사용 (명시적 전달)
        // 없으면 editor.selection 사용 (기본값)
        const selection = payload?.selection || editor.selection;
        if (!selection) {
          console.warn('[DeleteExtension] deleteForward: No selection available');
          return false;
        }
        return await this._executeDeleteForward(editor, selection);
      },
      canExecute: (editor: any, payload?: any) => {
        // selection이 있으면 실행 가능
        const selection = payload?.selection || editor.selection;
        return selection != null;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업
  }

  /**
   * 노드 전체 삭제
   * 
   * @param editor Editor 인스턴스
   * @param nodeId 삭제할 노드 ID
   * @returns 성공 여부
   */
  private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
    const operations = this._buildDeleteNodeOperations(nodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Cross-node 텍스트 삭제
   * 
   * 현재: dataStore.range.deleteText 직접 호출
   * 향후: transaction operation으로 전환
   * 
   * @param editor Editor 인스턴스
   * @param range 삭제할 범위 (여러 노드에 걸침)
   * @returns 성공 여부
   */
  private async _executeDeleteCrossNode(editor: Editor, range: ModelSelection): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[DeleteExtension] dataStore not found');
      return false;
    }

    // 현재: dataStore.range.deleteText 직접 호출
    // TODO: transaction operation으로 전환
    try {
      dataStore.range.deleteText(range);
      return true;
    } catch (error) {
      console.error('[DeleteExtension] deleteCrossNode failed', error);
      return false;
    }
  }

  /**
   * 단일 노드 텍스트 삭제
   * 
   * @param editor Editor 인스턴스
   * @param range 삭제할 범위 (단일 노드 내)
   * @returns 성공 여부
   */
  private async _executeDeleteText(editor: Editor, range: ModelSelection): Promise<boolean> {
    const operations = this._buildDeleteTextOperations(range);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * 노드 전체 삭제 operations 생성
   */
  private _buildDeleteNodeOperations(nodeId: string): any[] {
    return [
      {
        type: 'delete',
        payload: { nodeId }
      }
    ];
  }

  /**
   * 텍스트 삭제 operations 생성
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

  /**
   * Backspace 키 처리
   * 
   * 케이스 분기:
   * 1. Range Selection: 선택된 범위 삭제
   * 2. Offset 0: 이전 노드 처리 (문자 삭제, 노드 병합, 노드 삭제)
   * 3. 일반 Backspace (offset > 0): 왼쪽 한 글자 삭제
   * 
   * @param editor Editor 인스턴스
   * @param selection 현재 Model Selection
   * @returns 성공 여부
   */
  private async _executeBackspace(editor: Editor, selection: ModelSelection): Promise<boolean> {
    // 1. Range Selection 처리
    if (!selection.collapsed) {
      return await this._executeDeleteText(editor, selection);
    }

    // 2. Offset 0 처리
    if (selection.startOffset === 0) {
      return await this._handleBackspaceAtOffsetZero(editor, selection);
    }

    // 3. 일반 Backspace 처리 (offset > 0)
    const deleteRange: ModelSelection = {
      type: 'range',
      startNodeId: selection.startNodeId,
      startOffset: selection.startOffset - 1,
      endNodeId: selection.startNodeId,
      endOffset: selection.startOffset,
      collapsed: false,
      direction: 'forward'
    };

    return await this._executeDeleteText(editor, deleteRange);
  }

  /**
   * Delete 키 처리 (Forward Delete)
   * 
   * 케이스 분기:
   * 1. Range Selection: 선택된 범위 삭제
   * 2. Offset < text.length: 현재 노드에서 오른쪽 한 글자 삭제
   * 3. Offset == text.length: 다음 편집 가능한 노드 기준으로 A′/B′/C′/D′/E′ 처리
   * 
   * @param editor Editor 인스턴스
   * @param selection 현재 Model Selection
   * @returns 성공 여부
   */
  private async _executeDeleteForward(editor: Editor, selection: ModelSelection): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[DeleteExtension] dataStore not found');
      return false;
    }

    // 1. Range Selection 처리 (Backspace와 동일)
    if (!selection.collapsed) {
      return await this._executeDeleteText(editor, selection);
    }

    const currentNode = dataStore.getNode(selection.startNodeId);

    // 텍스트 노드가 아니면 여기서는 처리하지 않고 상위 레벨(다른 커맨드)에 위임
    if (typeof currentNode?.text !== 'string') {
      return false;
    }

    const textLength = currentNode.text.length;

    // 2. Offset < text.length → 일반 Delete (현재 노드에서 오른쪽 한 글자 삭제)
    if (selection.startOffset < textLength) {
      const deleteRange: ModelSelection = {
        type: 'range',
        startNodeId: selection.startNodeId,
        startOffset: selection.startOffset,
        endNodeId: selection.startNodeId,
        endOffset: selection.startOffset + 1,
        collapsed: false,
        direction: 'forward'
      };
      return await this._executeDeleteText(editor, deleteRange);
    }

    // 3. 텍스트 끝에서 Delete (Offset == text.length)
    const nextEditableNodeId = dataStore.getNextEditableNode(selection.startNodeId);

    // 케이스 E′: 다음 편집 가능한 노드 없음
    if (!nextEditableNodeId) {
      return false;
    }

    const nextNode = dataStore.getNode(nextEditableNodeId);
    if (!nextNode) {
      console.warn('[DeleteExtension] _executeDeleteForward: Next editable node not found', { nextEditableNodeId });
      return false;
    }

    const currentParent = dataStore.getParent(selection.startNodeId);
    const nextParent = dataStore.getParent(nextEditableNodeId);

    // 케이스 D′: 다른 부모 (블록 경계) - 블록 병합
    if (currentParent?.sid !== nextParent?.sid) {
      if (!currentParent || !nextParent) {
        console.warn('[DeleteExtension] _executeDeleteForward: Cannot merge blocks - missing parent', {
          currentParent: currentParent?.sid,
          nextParent: nextParent?.sid
        });
        return false;
      }

      // 같은 타입의 블록인지 확인
      if (currentParent.stype !== nextParent.stype) {
        console.warn('[DeleteExtension] _executeDeleteForward: Cannot merge different block types', {
          currentParentType: currentParent.stype,
          nextParentType: nextParent.stype
        });
        return false;
      }

      // 블록 병합 수행 (현재 블록 + 다음 블록)
      return await this._executeMergeBlockNodes(editor, currentParent.sid!, nextParent.sid!);
    }

    // 케이스 A′/B′/C′: 같은 부모 내에서 처리
    if (typeof nextNode.text === 'string') {
      const nextTextLength = nextNode.text.length;

      if (nextTextLength > 0) {
        // 케이스 A′: 다음 노드의 첫 문자 삭제
        const deleteRange: ModelSelection = {
          type: 'range',
          startNodeId: nextEditableNodeId,
          startOffset: 0,
          endNodeId: nextEditableNodeId,
          endOffset: 1,
          collapsed: false,
          direction: 'forward'
        };
        return await this._executeDeleteText(editor, deleteRange);
      } else {
        // 케이스 B′: 빈 텍스트 노드 병합
        if (typeof currentNode.text === 'string') {
          return await this._executeMergeTextNodes(editor, selection.startNodeId, nextEditableNodeId);
        }

        console.warn('[DeleteExtension] _executeDeleteForward: Cannot merge non-text nodes', {
          currentNodeId: selection.startNodeId,
          nextNodeId: nextEditableNodeId
        });
        return false;
      }
    } else {
      // 케이스 C′: 다음 노드 전체 삭제 (.text 필드 없음)
      return await this._executeDeleteNode(editor, nextEditableNodeId);
    }
  }

  /**
   * Offset 0에서 Backspace 처리
   * 
   * 케이스:
   * A. 이전 노드의 마지막 문자 삭제 (텍스트 길이 > 0)
   * B. 빈 노드 병합 (텍스트 길이 === 0)
   * C. 이전 노드 전체 삭제 (.text 필드 없음)
   * D. 다른 부모 (블록 경계) - 블록 병합
   * E. 이전 노드 없음 - 아무 동작 안 함
   * 
   * @param editor Editor 인스턴스
   * @param selection 현재 Model Selection
   * @returns 성공 여부
   */
  private async _handleBackspaceAtOffsetZero(
    editor: Editor,
    selection: ModelSelection
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[DeleteExtension] dataStore not found');
      return false;
    }

    // getPreviousEditableNode를 사용하여 이전 편집 가능한 노드 찾기 (블록 노드는 건너뜀)
    const prevEditableNodeId = dataStore.getPreviousEditableNode(selection.startNodeId);
    
    // 케이스 E: 이전 편집 가능한 노드 없음
    if (!prevEditableNodeId) {
      return false;
    }

    const prevNode = dataStore.getNode(prevEditableNodeId);
    if (!prevNode) {
      console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Previous editable node not found', { prevEditableNodeId });
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    if (!currentNode) {
      console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Current node not found', { currentNodeId: selection.startNodeId });
      return false;
    }

    const prevParent = dataStore.getParent(prevEditableNodeId);
    const currentParent = dataStore.getParent(selection.startNodeId);

    // 케이스 D: 다른 부모 (블록 경계) - 블록 병합
    if (prevParent?.sid !== currentParent?.sid) {
      // 이전 노드의 부모와 현재 노드의 부모가 다름 → 블록 병합
      if (!prevParent || !currentParent) {
        console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge blocks - missing parent', {
          prevParent: prevParent?.sid,
          currentParent: currentParent?.sid
        });
        return false;
      }

      // 같은 타입의 블록인지 확인
      if (prevParent.stype !== currentParent.stype) {
        console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge different block types', {
          prevParentType: prevParent.stype,
          currentParentType: currentParent.stype
        });
        return false;
      }

      // 블록 병합 수행
      return await this._executeMergeBlockNodes(editor, prevParent.sid!, currentParent.sid!);
    }

    // 케이스 A, B, C 처리 (같은 부모 내에서)
    // .text 필드가 있고 문자열 타입인지 확인 (실제 텍스트 노드인지 확인)
    if (prevNode.text !== undefined && typeof prevNode.text === 'string') {
      const prevTextLength = prevNode.text.length;

      if (prevTextLength > 0) {
        // 케이스 A: 이전 노드의 마지막 문자 삭제
        const deleteRange: ModelSelection = {
          type: 'range',
          startNodeId: prevEditableNodeId,
          startOffset: prevTextLength - 1,
          endNodeId: prevEditableNodeId,
          endOffset: prevTextLength,
          collapsed: false,
          direction: 'forward'
        };
        return await this._executeDeleteText(editor, deleteRange);
      } else {
        // 케이스 B: 빈 노드 병합
        // 둘 다 텍스트 노드인지 확인 (.text 필드가 있으면 텍스트 노드)
        if (currentNode.text !== undefined && typeof currentNode.text === 'string') {
          return await this._executeMergeTextNodes(editor, prevEditableNodeId, selection.startNodeId);
        } else {
          // 텍스트 노드가 아니면 병합하지 않음
          console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge non-text nodes', {
            prevNodeId: prevEditableNodeId,
            currentNodeId: selection.startNodeId
          });
          return false;
        }
      }
    } else {
      // 케이스 C: 이전 노드 전체 삭제 (.text 필드 없음)
      return await this._executeDeleteNode(editor, prevEditableNodeId);
    }
  }

  /**
   * 텍스트 노드 병합
   * 
   * @param editor Editor 인스턴스
   * @param leftNodeId 왼쪽 노드 ID (병합 후 유지될 노드)
   * @param rightNodeId 오른쪽 노드 ID (병합 후 삭제될 노드)
   * @returns 성공 여부
   */
  private async _executeMergeTextNodes(
    editor: Editor,
    leftNodeId: string,
    rightNodeId: string
  ): Promise<boolean> {
    const operations = [
      {
        type: 'mergeTextNodes',
        payload: { leftNodeId, rightNodeId }
      }
    ];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * 블록 노드 병합 (케이스 D: 블록 경계)
   * 
   * @param editor Editor 인스턴스
   * @param leftBlockId 왼쪽 블록 노드 ID (병합 후 유지될 노드)
   * @param rightBlockId 오른쪽 블록 노드 ID (병합 후 삭제될 노드)
   * @returns 성공 여부
   */
  private async _executeMergeBlockNodes(
    editor: Editor,
    leftBlockId: string,
    rightBlockId: string
  ): Promise<boolean> {
    const operations = [
      {
        type: 'mergeBlockNodes',
        payload: { leftNodeId: leftBlockId, rightNodeId: rightBlockId }
      }
    ];
    const result = await transaction(editor, operations).commit();
    return result.success;
  }
}

// 편의 함수
export function createDeleteExtension(options?: DeleteExtensionOptions): DeleteExtension {
  return new DeleteExtension(options);
}

