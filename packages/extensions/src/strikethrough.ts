import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control, toggleMark } from '@barocss/model';

export interface StrikeThroughExtensionOptions {
  enabled?: boolean;
}

/**
 * StrikeThroughExtension
 *
 * - `toggleStrikeThrough` 커맨드를 제공한다.
 * - 현재 구현 범위:
 *   - 같은 텍스트 노드 내 range selection 에 대해서만 strikethrough 마크 토글 operation 을 생성한다.
 *   - 여러 노드에 걸친 selection 은 아직 처리하지 않는다.
 */
export class StrikeThroughExtension implements Extension {
  name = 'strikethrough';
  priority = 100;

  private _options: StrikeThroughExtensionOptions;

  constructor(options: StrikeThroughExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // StrikeThrough 토글 명령어 등록
    (editor as any).registerCommand({
      name: 'toggleStrikeThrough',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeToggleStrikeThrough(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection && payload.selection.type === 'range';
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 필요 시 여기에 추가
  }

  private async _executeToggleStrikeThrough(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[StrikeThroughExtension] dataStore not found');
      return false;
    }

    // 여러 노드에 걸친 RangeSelection 은 아직 처리하지 않는다.
    if (selection.startNodeId !== selection.endNodeId) {
      return false;
    }

    const node = dataStore.getNode(selection.startNodeId);
    if (!node || typeof node.text !== 'string') {
      return false;
    }

    const text = node.text as string;
    const { startOffset, endOffset } = selection;

    if (
      typeof startOffset !== 'number' ||
      typeof endOffset !== 'number' ||
      startOffset < 0 ||
      endOffset > text.length ||
      startOffset >= endOffset
    ) {
      return false;
    }

    const ops = [
      ...control(selection.startNodeId, [
        toggleMark('strikethrough', [startOffset, endOffset])
      ])
    ];

    const result = await transaction(editor, ops).commit();
    return result.success;
  }
}

// 편의 함수
export function createStrikeThroughExtension(options?: StrikeThroughExtensionOptions): StrikeThroughExtension {
  return new StrikeThroughExtension(options);
}

