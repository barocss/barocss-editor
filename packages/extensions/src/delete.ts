import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';
import { transaction, control, deleteRange, deleteOp, deleteTextRange } from '@barocss/model';

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

    // 1. Delete entire node
    editor.registerCommand({
      name: 'deleteNode',
      execute: async (editor: any, payload: { nodeId: string }) => {
        return await this._executeDeleteNode(editor, payload.nodeId);
      },
      canExecute: (_editor: any, payload?: any) => {
        return payload?.nodeId != null;
      }
    });

    // 2. Cross-node text deletion
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

    // 3. Single node text deletion
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

    // 4. Backspace key handling (includes business logic)
    // Use selection from payload if available, otherwise use editor.selection
    editor.registerCommand({
      name: 'backspace',
      execute: async (editor: any, payload?: { selection?: ModelSelection }) => {
        // Use selection from payload if available (explicitly passed)
        // Otherwise use editor.selection (default)
        const selection = payload?.selection || editor.selection;
        if (!selection) {
          console.warn('[DeleteExtension] backspace: No selection available');
          return false;
        }
        return await this._executeBackspace(editor, selection);
      },
      canExecute: (editor: any, payload?: any) => {
        // Executable if selection exists
        const selection = payload?.selection || editor.selection;
        return selection != null;
      }
    });

    // 5. Delete key handling (Forward Delete, symmetric with Backspace)
    // Use selection from payload if available, otherwise use editor.selection
    editor.registerCommand({
      name: 'deleteForward',
      execute: async (editor: any, payload?: { selection?: ModelSelection }) => {
        // Use selection from payload if available (explicitly passed)
        // Otherwise use editor.selection (default)
        const selection = payload?.selection || editor.selection;
        if (!selection) {
          console.warn('[DeleteExtension] deleteForward: No selection available');
          return false;
        }
        return await this._executeDeleteForward(editor, selection);
      },
      canExecute: (editor: any, payload?: any) => {
        // Executable if selection exists
        const selection = payload?.selection || editor.selection;
        return selection != null;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // Cleanup
  }

  /**
   * Delete entire node
   * 
   * @param editor Editor instance
   * @param nodeId Node ID to delete
   * @returns Success status
   */
  private async _executeDeleteNode(editor: Editor, nodeId: string): Promise<boolean> {
    const operations = this._buildDeleteNodeOperations(nodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * Cross-node text deletion
   *
   * @param editor Editor instance
   * @param range Range to delete (spans multiple nodes)
   * @returns Success status
   */
  private async _executeDeleteCrossNode(editor: Editor, range: ModelSelection): Promise<boolean> {
    const op = deleteRange({
      startNodeId: range.startNodeId,
      startOffset: range.startOffset,
      endNodeId: range.endNodeId,
      endOffset: range.endOffset
    });
    const result = await transaction(editor, [op]).commit();
    return result.success;
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
   * 노드 전체 삭제 operations 생성 (DSL: deleteOp(nodeId))
   */
  private _buildDeleteNodeOperations(nodeId: string): ReturnType<typeof deleteOp>[] {
    return [deleteOp(nodeId)];
  }

  /**
   * 텍스트 삭제 operations 생성 (DSL: deleteTextRange(start, end) inside control)
   */
  private _buildDeleteTextOperations(range: ModelSelection): ReturnType<typeof control> {
    return control(range.startNodeId, [
      deleteTextRange(range.startOffset, range.endOffset)
    ]);
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
    // 1. Handle Range Selection
    if (!selection.collapsed) {
      return await this._executeDeleteText(editor, selection);
    }

    // 2. Handle Offset 0
    if (selection.startOffset === 0) {
      return await this._handleBackspaceAtOffsetZero(editor, selection);
    }

    // 3. Normal Backspace handling (offset > 0)
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
   * Delete key handling (Forward Delete)
   * 
   * Case branching:
   * 1. Range Selection: delete selected range
   * 2. Offset < text.length: delete one character to the right in current node
   * 3. Offset == text.length: handle A′/B′/C′/D′/E′ based on next editable node
   * 
   * @param editor Editor instance
   * @param selection Current Model Selection
   * @returns Success status
   */
  private async _executeDeleteForward(editor: Editor, selection: ModelSelection): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[DeleteExtension] dataStore not found');
      return false;
    }

    // 1. Handle Range Selection (same as Backspace)
    if (!selection.collapsed) {
      return await this._executeDeleteText(editor, selection);
    }

    const currentNode = dataStore.getNode(selection.startNodeId);

    // If not a text node, do not handle here and delegate to upper level (other command)
    if (typeof currentNode?.text !== 'string') {
      return false;
    }

    const textLength = currentNode.text.length;

    // 2. Offset < text.length → Normal Delete (delete one character to the right in current node)
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

    // 3. Delete at text end (Offset == text.length)
    const nextEditableNodeId = dataStore.getNextEditableNode(selection.startNodeId);

    // Case E′: No next editable node
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

    // Case D′: Different parent (block boundary) - merge blocks
    if (currentParent?.sid !== nextParent?.sid) {
      if (!currentParent || !nextParent) {
        console.warn('[DeleteExtension] _executeDeleteForward: Cannot merge blocks - missing parent', {
          currentParent: currentParent?.sid,
          nextParent: nextParent?.sid
        });
        return false;
      }

      // Check if blocks are of the same type
      if (currentParent.stype !== nextParent.stype) {
        console.warn('[DeleteExtension] _executeDeleteForward: Cannot merge different block types', {
          currentParentType: currentParent.stype,
          nextParentType: nextParent.stype
        });
        return false;
      }

      // Perform block merge (current block + next block)
      return await this._executeMergeBlockNodes(editor, currentParent.sid!, nextParent.sid!);
    }

    // Case A′/B′/C′: Handle within the same parent
    if (typeof nextNode.text === 'string') {
      const nextTextLength = nextNode.text.length;

      if (nextTextLength > 0) {
        // Case A′: Delete first character of next node
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
        // Case B′: Merge empty text nodes
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
      // Case C′: Delete entire next node (no .text field)
      return await this._executeDeleteNode(editor, nextEditableNodeId);
    }
  }

  /**
   * Handle Backspace at Offset 0
   * 
   * Cases:
   * A. Delete last character of previous node (text length > 0)
   * B. Merge empty nodes (text length === 0)
   * C. Delete entire previous node (no .text field)
   * D. Different parent (block boundary) - merge blocks
   * E. No previous node - no action
   * 
   * @param editor Editor instance
   * @param selection Current Model Selection
   * @returns Success status
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

    // Use getPreviousEditableNode to find previous editable node (skip block nodes)
    const prevEditableNodeId = dataStore.getPreviousEditableNode(selection.startNodeId);
    
    // Case E: No previous editable node
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

    // Case D: Different parent (block boundary) - merge blocks
    if (prevParent?.sid !== currentParent?.sid) {
      // Previous node's parent and current node's parent are different → merge blocks
      if (!prevParent || !currentParent) {
        console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge blocks - missing parent', {
          prevParent: prevParent?.sid,
          currentParent: currentParent?.sid
        });
        return false;
      }

      // Check if blocks are of the same type
      if (prevParent.stype !== currentParent.stype) {
        console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge different block types', {
          prevParentType: prevParent.stype,
          currentParentType: currentParent.stype
        });
        return false;
      }

      // Perform block merge
      return await this._executeMergeBlockNodes(editor, prevParent.sid!, currentParent.sid!);
    }

    // Handle cases A, B, C (within the same parent)
    // Check if .text field exists and is string type (verify if it's actually a text node)
    if (prevNode.text !== undefined && typeof prevNode.text === 'string') {
      const prevTextLength = prevNode.text.length;

      if (prevTextLength > 0) {
        // Case A: Delete last character of previous node
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
        // Case B: Merge empty nodes
        // Check if both are text nodes (.text field exists means text node)
        if (currentNode.text !== undefined && typeof currentNode.text === 'string') {
          return await this._executeMergeTextNodes(editor, prevEditableNodeId, selection.startNodeId);
        } else {
          // Do not merge if not text nodes
          console.warn('[DeleteExtension] _handleBackspaceAtOffsetZero: Cannot merge non-text nodes', {
            prevNodeId: prevEditableNodeId,
            currentNodeId: selection.startNodeId
          });
          return false;
        }
      }
    } else {
      // Case C: Delete entire previous node (no .text field)
      return await this._executeDeleteNode(editor, prevEditableNodeId);
    }
  }

  /**
   * Merge text nodes
   * 
   * @param editor Editor instance
   * @param leftNodeId Left node ID (node to keep after merge)
   * @param rightNodeId Right node ID (node to delete after merge)
   * @returns Success status
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
   * Merge block nodes (Case D: block boundary)
   * 
   * @param editor Editor instance
   * @param leftBlockId Left block node ID (node to keep after merge)
   * @param rightBlockId Right block node ID (node to delete after merge)
   * @returns Success status
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

// Convenience function
export function createDeleteExtension(options?: DeleteExtensionOptions): DeleteExtension {
  return new DeleteExtension(options);
}

