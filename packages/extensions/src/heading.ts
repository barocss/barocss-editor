import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, transformNode } from '@barocss/model';

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

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // 각 헤딩 레벨별 명령어 등록
    this._options.levels?.forEach(level => {
      (editor as any).registerCommand({
        name: `setHeading${level}`,
        execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
          return await this._executeSetHeading(ed, level, payload?.selection);
        },
        canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
          return !!payload?.selection && this._canSetHeading(_ed, level);
        }
      });
    });

    // 일반 헤딩 설정 명령어
    (editor as any).registerCommand({
      name: 'setHeading',
      execute: async (ed: Editor, payload?: { level?: number; selection?: ModelSelection }) => {
        const level = payload?.level;
        if (typeof level !== 'number') {
          return false;
        }
        return await this._executeSetHeading(ed, level, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { level?: number; selection?: ModelSelection }) => {
        const level = payload?.level;
        return typeof level === 'number' && !!payload?.selection && this._canSetHeading(_ed, level);
      }
    });

    // 헤딩 제거 명령어
    (editor as any).registerCommand({
      name: 'removeHeading',
      execute: (ed: Editor) => {
        return this._removeHeading(ed);
      },
      canExecute: (_ed: Editor) => {
        return this._canRemoveHeading(_ed);
      }
    });

    // 키보드 단축키 등록
    if (this._options.keyboardShortcuts) {
      this._registerKeyboardShortcuts(editor);
    }
  }

  onDestroy(_editor: any): void {
    // 정리 작업
  }

  private async _executeSetHeading(
    editor: Editor,
    level: number,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[HeadingExtension] dataStore not found');
      return false;
    }

    // 현재 블록 노드 찾기 (startNodeId의 부모 블록 노드)
    const targetNodeId = this._getTargetBlockNodeId(dataStore, selection);
    if (!targetNodeId) {
      console.warn('[HeadingExtension] No target block node found');
      return false;
    }

    const targetNode = dataStore.getNode(targetNodeId);
    if (!targetNode) {
      return false;
    }

    // 이미 같은 타입이면 no-op
    if (targetNode.stype === 'heading' && targetNode.attributes?.level === level) {
      return true;
    }

    // transformNode operation 사용
    const ops = [
      ...control(targetNodeId, [
        transformNode('heading', { level })
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  private _canSetHeading(_editor: Editor, level: number): boolean {
    return this._options.levels?.includes(level) || false;
  }

  private _canRemoveHeading(_editor: any): boolean {
    // TODO: 실제 구현 - 현재 선택에서 헤딩을 제거할 수 있는지 확인
    return true;
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

  private _registerKeyboardShortcuts(editor: Editor): void {
    // 키보드 단축키는 기본 키바인딩에서 처리하므로 여기서는 아무것도 하지 않음
    // 기본 키바인딩에 Mod+Alt+1/2/3이 이미 등록되어 있음
  }
}

// 편의 함수
export function createHeadingExtension(options?: HeadingExtensionOptions): HeadingExtension {
  return new HeadingExtension(options);
}

