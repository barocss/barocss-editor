import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, indentNode, outdentNode, indentText, outdentText } from '@barocss/model';

export interface IndentExtensionOptions {
  enabled?: boolean;
}

/**
 * Indent Extension - 구조적/텍스트 들여쓰기/내어쓰기 기능을 제공하는 Extension
 * 
 * 주요 기능:
 * - indentNode: 블록 노드를 한 단계 들여쓰기 (이전 형제의 마지막 자식으로 이동)
 * - outdentNode: 블록 노드를 한 단계 내어쓰기 (부모의 부모 아래로 이동)
 * - indentText: 텍스트 범위의 각 줄 앞에 들여쓰기 문자열 추가
 * - outdentText: 텍스트 범위의 각 줄 앞에서 들여쓰기 문자열 제거
 * - Tab/Shift+Tab 키바인딩 지원
 * - Range Selection 시 여러 노드 동시 처리
 * - Node Selection 시 선택된 노드 처리
 */
export class IndentExtension implements Extension {
  name = 'indent';
  priority = 100;
  
  private _options: IndentExtensionOptions;

  constructor(options: IndentExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // 1. indentNode command
    editor.registerCommand({
      name: 'indentNode',
      execute: async (editor: any, payload?: { nodeId?: string }) => {
        return await this._executeIndentNode(editor, payload?.nodeId);
      },
      canExecute: (editor: any, payload?: any) => {
        const nodeId = payload?.nodeId || this._getTargetNodeId(editor);
        if (!nodeId) return false;
        const dataStore = (editor as any).dataStore;
        if (!dataStore) return false;
        return dataStore.isIndentableNode(nodeId);
      }
    });

    // 2. outdentNode command
    editor.registerCommand({
      name: 'outdentNode',
      execute: async (editor: any, payload?: { nodeId?: string }) => {
        return await this._executeOutdentNode(editor, payload?.nodeId);
      },
      canExecute: (editor: any, payload?: any) => {
        const nodeId = payload?.nodeId || this._getTargetNodeId(editor);
        if (!nodeId) return false;
        const dataStore = (editor as any).dataStore;
        if (!dataStore) return false;
        // outdent 가능 여부는 indentable 체크 + 부모가 있는지 확인
        if (!dataStore.isIndentableNode(nodeId)) return false;
        const node = dataStore.getNode(nodeId);
        if (!node || !node.parentId) return false;
        return true;
      }
    });

    // 3. indentText command (텍스트 범위 들여쓰기)
    editor.registerCommand({
      name: 'indentText',
      execute: async (editor: any, payload?: { selection?: ModelSelection; indent?: string }) => {
        const selection = payload?.selection || (editor as any).selection;
        if (!selection || selection.type !== 'range') {
          console.warn('[IndentExtension] indentText: No valid range selection');
          return false;
        }
        return await this._executeIndentText(editor, selection, payload?.indent);
      },
      canExecute: (editor: any, payload?: any) => {
        const selection = payload?.selection || (editor as any).selection;
        return selection != null && selection.type === 'range';
      }
    });

    // 4. outdentText command (텍스트 범위 내어쓰기)
    editor.registerCommand({
      name: 'outdentText',
      execute: async (editor: any, payload?: { selection?: ModelSelection; indent?: string }) => {
        const selection = payload?.selection || (editor as any).selection;
        if (!selection || selection.type !== 'range') {
          console.warn('[IndentExtension] outdentText: No valid range selection');
          return false;
        }
        return await this._executeOutdentText(editor, selection, payload?.indent);
      },
      canExecute: (editor: any, payload?: any) => {
        const selection = payload?.selection || (editor as any).selection;
        return selection != null && selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업
  }

  /**
   * 현재 selection에서 indent/outdent 대상 노드 ID를 가져옴
   * - Node Selection: 선택된 노드
   * - Range Selection: startNodeId의 부모 블록 노드
   * - Multi Node Selection: 첫 번째 노드
   */
  private _getTargetNodeId(editor: Editor): string | null {
    const selection = (editor as any).selection;
    if (!selection) return null;

    const dataStore = (editor as any).dataStore;
    if (!dataStore) return null;

    // Node Selection
    if (selection.type === 'node') {
      return selection.nodeId;
    }

    // Multi Node Selection
    if (selection.type === 'multi-node' && selection.nodeIds && selection.nodeIds.length > 0) {
      return selection.nodeIds[0];
    }

    // Range Selection: startNodeId의 부모 블록 노드를 찾음
    if (selection.type === 'range') {
      const startNode = dataStore.getNode(selection.startNodeId);
      if (!startNode) return null;

      // startNode가 블록이면 그대로 사용
      const schema = dataStore.getActiveSchema();
      if (schema) {
        const nodeType = schema.getNodeType(startNode.stype);
        if (nodeType?.group === 'block' && dataStore.isIndentableNode(startNode.sid!)) {
          return startNode.sid!;
        }
      }

      // startNode의 부모 블록 노드를 찾음
      let current = startNode;
      while (current && current.parentId) {
        const parent = dataStore.getNode(current.parentId);
        if (!parent) break;

        const parentType = schema?.getNodeType(parent.stype);
        if (parentType?.group === 'block' && dataStore.isIndentableNode(parent.sid!)) {
          return parent.sid!;
        }

        current = parent;
      }
    }

    return null;
  }

  /**
   * indentNode 실행
   * 
   * @param editor Editor 인스턴스
   * @param nodeId 들여쓰기할 노드 ID (없으면 selection에서 추출)
   * @returns 성공 여부
   */
  private async _executeIndentNode(editor: Editor, nodeId?: string): Promise<boolean> {
    const targetNodeId = nodeId || this._getTargetNodeId(editor);
    if (!targetNodeId) {
      console.warn('[IndentExtension] indentNode: No target node found');
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[IndentExtension] dataStore not found');
      return false;
    }

    if (!dataStore.isIndentableNode(targetNodeId)) {
      console.warn('[IndentExtension] indentNode: Node is not indentable', targetNodeId);
      return false;
    }

    const operations = this._buildIndentNodeOperations(targetNodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * outdentNode 실행
   * 
   * @param editor Editor 인스턴스
   * @param nodeId 내어쓰기할 노드 ID (없으면 selection에서 추출)
   * @returns 성공 여부
   */
  private async _executeOutdentNode(editor: Editor, nodeId?: string): Promise<boolean> {
    const targetNodeId = nodeId || this._getTargetNodeId(editor);
    if (!targetNodeId) {
      console.warn('[IndentExtension] outdentNode: No target node found');
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[IndentExtension] dataStore not found');
      return false;
    }

    if (!dataStore.isIndentableNode(targetNodeId)) {
      console.warn('[IndentExtension] outdentNode: Node is not indentable', targetNodeId);
      return false;
    }

    const node = dataStore.getNode(targetNodeId);
    if (!node || !node.parentId) {
      console.warn('[IndentExtension] outdentNode: Node has no parent', targetNodeId);
      return false;
    }

    const operations = this._buildOutdentNodeOperations(targetNodeId);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * indentNode operations 생성
   */
  private _buildIndentNodeOperations(nodeId: string): any[] {
    return [
      ...control(nodeId, [
        indentNode()
      ])
    ];
  }

  /**
   * outdentNode operations 생성
   */
  private _buildOutdentNodeOperations(nodeId: string): any[] {
    return [
      ...control(nodeId, [
        outdentNode()
      ])
    ];
  }

  /**
   * indentText 실행 (텍스트 범위 들여쓰기)
   * 
   * @param editor Editor 인스턴스
   * @param selection 텍스트 범위 선택
   * @param indentStr 들여쓰기 문자열 (기본값: '  ')
   * @returns 성공 여부
   */
  private async _executeIndentText(editor: Editor, selection: ModelSelection, indentStr?: string): Promise<boolean> {
    if (selection.type !== 'range') {
      return false;
    }

    const operations = this._buildIndentTextOperations(selection, indentStr);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * outdentText 실행 (텍스트 범위 내어쓰기)
   * 
   * @param editor Editor 인스턴스
   * @param selection 텍스트 범위 선택
   * @param indentStr 제거할 들여쓰기 문자열 (기본값: '  ')
   * @returns 성공 여부
   */
  private async _executeOutdentText(editor: Editor, selection: ModelSelection, indentStr?: string): Promise<boolean> {
    if (selection.type !== 'range') {
      return false;
    }

    const operations = this._buildOutdentTextOperations(selection, indentStr);
    const result = await transaction(editor, operations).commit();
    return result.success;
  }

  /**
   * indentText operations 생성
   */
  private _buildIndentTextOperations(selection: ModelSelection, indentStr?: string): any[] {
    if (selection.startNodeId === selection.endNodeId) {
      // 단일 노드 범위
      return [
        ...control(selection.startNodeId, [
          indentText(selection.startOffset, selection.endOffset, indentStr)
        ])
      ];
    } else {
      // Cross-node 범위
      return [
        indentText(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          indentStr
        )
      ];
    }
  }

  /**
   * outdentText operations 생성
   */
  private _buildOutdentTextOperations(selection: ModelSelection, indentStr?: string): any[] {
    if (selection.startNodeId === selection.endNodeId) {
      // 단일 노드 범위
      return [
        ...control(selection.startNodeId, [
          outdentText(selection.startOffset, selection.endOffset, indentStr)
        ])
      ];
    } else {
      // Cross-node 범위
      return [
        outdentText(
          selection.startNodeId,
          selection.startOffset,
          selection.endNodeId,
          selection.endOffset,
          indentStr
        )
      ];
    }
  }
}

