import { Editor, Extension, type ModelSelection } from '@barocss/editor-core';
import { transaction, control } from '@barocss/model';

export interface ParagraphExtensionOptions {
  enabled?: boolean;
}

/**
 * ParagraphExtension
 *
 * - Enter 키(`insertParagraph` command)를 처리한다.
 * - 실제 모델 변경은 @barocss/model 의 transaction + operations 조합으로 수행한다.
 * - DataStore 에 직접 쓰기 대신, operation 객체(deleteTextRange, splitTextNode, splitBlockNode, addChild 등)를 생성하여
 *   하나의 트랜잭션으로 실행한다.
 */
export class ParagraphExtension implements Extension {
  name = 'paragraph';
  priority = 100;

  private _options: ParagraphExtensionOptions;

  constructor(options: ParagraphExtensionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // Paragraph 명령어 (아직 구체 구현 없음)
    (editor as any).registerCommand({
      name: 'setParagraph',
      execute: (_ed: Editor) => {
        return true;
      },
      canExecute: (_ed: Editor) => {
        return true;
      }
    });

    // Enter 키: insertParagraph (Model-first, transaction 기반)
    (editor as any).registerCommand({
      name: 'insertParagraph',
      execute: async (ed: Editor, payload?: { selection?: ModelSelection }) => {
        return await this._executeInsertParagraph(ed, payload?.selection);
      },
      canExecute: (_ed: Editor, payload?: { selection?: ModelSelection }) => {
        return !!payload?.selection;
      }
    });

    // 키보드 단축키 등록은 아직 ParagraphExtension에서 직접 담당하지 않는다.
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 필요 시 여기에 추가
  }

  /**
   * insertParagraph 실행부
   * - selection 을 해석하여 operation 배열을 구성한 뒤, transaction 으로 실행한다.
   */
  private async _executeInsertParagraph(
    editor: Editor,
    selection?: ModelSelection
  ): Promise<boolean> {
    if (!selection || selection.type !== 'range') {
      return false;
    }

    const ops = this._buildInsertParagraphOperations(editor, selection);
    if (!ops.length) {
      return false;
    }

    const result = await transaction(editor, ops).commit();
    return result.success;
  }

  /**
   * insertParagraph 에 필요한 operation 시퀀스를 구성한다.
   *
   * 현재 구현 범위:
   * - collapsed range:
   *   - 단일 텍스트 노드 + 단일 child paragraph 에서:
   *     - 텍스트 중간: splitTextNode + splitBlockNode
   *     - 텍스트 끝: 같은 타입의 빈 paragraph 를 뒤에 추가
   *     - 텍스트 시작: 같은 타입의 빈 paragraph 를 앞에 추가
   * - 같은 텍스트 노드 내 RangeSelection:
   *   - deleteTextRange 후, collapsed selection 기준으로 위 로직 재사용
   * - 여러 노드에 걸친 RangeSelection:
   *   - 현재 단계에서는 operation 을 생성하지 않음 (빈 배열 반환)
   */
  private _buildInsertParagraphOperations(
    editor: Editor,
    selection: ModelSelection
  ): any[] {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[ParagraphExtension] dataStore not found');
      return [];
    }

    if (selection.type !== 'range') {
      return [];
    }

    const ops: any[] = [];

    // 1) RangeSelection 처리
    if (!selection.collapsed) {
      // 같은 텍스트 노드 내 RangeSelection
      if (selection.startNodeId === selection.endNodeId) {
        const node = dataStore.getNode(selection.startNodeId);
        if (!node || typeof node.text !== 'string') {
          return [];
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
          return [];
        }

        // deleteTextRange operation
        ops.push(
          ...control(selection.startNodeId, [
            {
              type: 'deleteTextRange',
              payload: {
                start: startOffset,
                end: endOffset
              }
            }
          ])
        );

        // 삭제 후 caret 은 startOffset 에 위치한다고 가정하고 collapsed 로직 재사용
        const newTextLength = text.length - (endOffset - startOffset);
        const collapsedOffset = startOffset;

        const collapsedOps = this._buildCollapsedParagraphOps(
          dataStore,
          selection.startNodeId,
          collapsedOffset,
          newTextLength
        );
        return ops.concat(collapsedOps);
      }

      // 여러 노드에 걸친 RangeSelection 은 아직 transaction 기반 Enter 에서 다루지 않는다.
      // (Backspace/Delete 와 동일한 Range 삭제 로직 확보 후 확장 예정)
      return [];
    }

    // 2) collapsed 케이스
    const node = dataStore.getNode(selection.startNodeId);
    if (!node || typeof node.text !== 'string') {
      return [];
    }

    const text = node.text as string;
    return this._buildCollapsedParagraphOps(
      dataStore,
      selection.startNodeId,
      selection.startOffset,
      text.length
    );
  }

  /**
   * collapsed 상태에서의 Enter 동작에 대한 operation 시퀀스
   *
   * - 텍스트 중간: splitTextNode + splitBlockNode
   * - 텍스트 끝: 부모(doc) 아래 동일 타입의 빈 paragraph 를 뒤에 추가
   * - 텍스트 시작: 부모(doc) 아래 동일 타입의 빈 paragraph 를 앞에 추가
   */
  private _buildCollapsedParagraphOps(
    dataStore: any,
    textNodeId: string,
    offset: number,
    textLength: number
  ): any[] {
    const ops: any[] = [];

    const textNode = dataStore.getNode(textNodeId);
    if (!textNode || typeof textNode.text !== 'string') {
      return [];
    }

    const parentBlock = dataStore.getParent(textNodeId);
    if (!parentBlock || !Array.isArray(parentBlock.content)) {
      return [];
    }

    const isSingleTextChild =
      parentBlock.content.length === 1 && parentBlock.content[0] === textNodeId;

    // 1) 텍스트 중간에서 Enter: splitTextNode + splitBlockNode
    if (isSingleTextChild && offset > 0 && offset < textLength) {
      ops.push(
        ...control(textNodeId, [
          {
            type: 'splitTextNode',
            payload: { splitPosition: offset }
          }
        ]),
        ...control(parentBlock.sid, [
          {
            type: 'splitBlockNode',
            payload: { splitPosition: 1 }
          }
        ])
      );
      return ops;
    }

    // 2) 블록 끝에서 Enter: 현재 블록 뒤에 같은 타입의 빈 블록 추가
    if (offset === textLength) {
      const grandParent = parentBlock.parentId
        ? dataStore.getNode(parentBlock.parentId)
        : null;
      if (!grandParent || !Array.isArray(grandParent.content)) {
        return [];
      }

      const idx = grandParent.content.indexOf(parentBlock.sid);
      if (idx === -1) {
        return [];
      }

      const newBlock = {
        stype: parentBlock.stype,
        attributes: { ...(parentBlock.attributes || {}) },
        content: []
      } as any;

      ops.push({
        type: 'addChild',
        payload: {
          parentId: grandParent.sid,
          child: newBlock,
          position: idx + 1
        }
      });

      return ops;
    }

    // 3) 블록 시작에서 Enter: 현재 블록 앞에 같은 타입의 빈 블록 추가
    if (offset === 0) {
      const grandParent = parentBlock.parentId
        ? dataStore.getNode(parentBlock.parentId)
        : null;
      if (!grandParent || !Array.isArray(grandParent.content)) {
        return [];
      }

      const idx = grandParent.content.indexOf(parentBlock.sid);
      if (idx === -1) {
        return [];
      }

      const newBlock = {
        stype: parentBlock.stype,
        attributes: { ...(parentBlock.attributes || {}) },
        content: []
      } as any;

      ops.push({
        type: 'addChild',
        payload: {
          parentId: grandParent.sid,
          child: newBlock,
          position: idx
        }
      });

      return ops;
    }

    // 기타 케이스는 아직 미구현
    return ops;
  }
}

// 편의 함수
export function createParagraphExtension(options?: ParagraphExtensionOptions): ParagraphExtension {
  return new ParagraphExtension(options);
}


