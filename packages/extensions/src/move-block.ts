import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, moveBlockUp, moveBlockDown } from '@barocss/model';

export interface MoveBlockExtensionOptions {
  enabled?: boolean;
}

/**
 * MoveBlockExtension
 *
 * - `moveBlockUp`, `moveBlockDown` 커맨드를 제공한다.
 * - 현재 선택된 블록 노드를 같은 부모 내에서 위/아래로 이동한다.
 */
export class MoveBlockExtension implements Extension {
  name = 'moveBlock';
  priority = 100;

  private _options: MoveBlockExtensionOptions;

  constructor(options: MoveBlockExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // moveBlockUp 명령어
    (editor as any).registerCommand({
      name: 'moveBlockUp',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockUp(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });

    // moveBlockDown 명령어
    (editor as any).registerCommand({
      name: 'moveBlockDown',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeMoveBlockDown(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 필요 시 여기에 추가
  }

  private async _executeMoveBlockUp(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveBlockExtension] dataStore not found');
      return false;
    }

    // 현재 블록 노드 찾기
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[MoveBlockExtension] No target block node found');
      return false;
    }

    // moveBlockUp operation 사용
    const ops = [
      ...control(targetNodeId, [
        moveBlockUp()
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private async _executeMoveBlockDown(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveBlockExtension] dataStore not found');
      return false;
    }

    // 현재 블록 노드 찾기
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[MoveBlockExtension] No target block node found');
      return false;
    }

    // moveBlockDown operation 사용
    const ops = [
      ...control(targetNodeId, [
        moveBlockDown()
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  /**
   * selection에서 대상 블록 노드 ID를 찾음
   * - Range Selection: startNodeId의 부모 블록 노드
   */
  private _getTargetBlockNodeId(dataStore: any, selection: ModelSelection): string | null {
    if (selection.type !== 'range') {
      return null;
    }

    const startNode = dataStore.getNode(selection.startNodeId);
    if (!startNode) return null;

    const schema = dataStore.getActiveSchema();
    if (schema) {
      const nodeType = schema.getNodeType(startNode.stype);
      // startNode가 블록이면 그대로 사용
      if (nodeType?.group === 'block') {
        return startNode.sid!;
      }
    }

    // startNode의 부모 블록 노드를 찾음
    let current = startNode;
    while (current && current.parentId) {
      const parent = dataStore.getNode(current.parentId);
      if (!parent) break;

      const parentType = schema?.getNodeType(parent.stype);
      if (parentType?.group === 'block') {
        return parent.sid!;
      }

      current = parent;
    }

    return null;
  }
}

// 편의 함수
export function createMoveBlockExtension(options?: MoveBlockExtensionOptions): MoveBlockExtension {
  return new MoveBlockExtension(options);
}

