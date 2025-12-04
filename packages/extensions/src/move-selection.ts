import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';

export interface MoveSelectionOptions {
  enabled?: boolean;
}

/**
 * MoveSelectionExtension
 *
 * - 화살표 키 등으로 Selection(커서/범위)을 이동할 때,
 *   DataStore의 getPreviousEditableNode / getNextEditableNode,
 *   isSelectableNode 등을 사용해 다음 위치를 결정한다.
 *
 * - 이 Extension 자체는 키 이벤트를 직접 다루지 않고,
 *   editor-view-dom 이 전달하는 ModelSelection을 기준으로만 동작한다.
 */
export class MoveSelectionExtension implements Extension {
  name = 'move-selection';
  priority = 90;

  private _options: MoveSelectionOptions;

  constructor(options: MoveSelectionOptions = {}) {
    this._options = {
      enabled: true,
      ...options
    };
  }

  onCreate(editor: Editor): void {
    if (!this._options.enabled) return;

    // 수평 이동: 왼쪽 (한 글자 단위, caret 이동)
    editor.registerCommand({
      name: 'moveCursorLeft',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._moveCaretHorizontal(editor, selection, 'left');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // 수평 이동: 오른쪽 (한 글자 단위, caret 이동)
    editor.registerCommand({
      name: 'moveCursorRight',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._moveCaretHorizontal(editor, selection, 'right');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // 범위 확장: 왼쪽 (Shift+ArrowLeft)
    editor.registerCommand({
      name: 'extendSelectionLeft',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._extendSelectionHorizontal(editor, selection, 'left');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // 범위 확장: 오른쪽 (Shift+ArrowRight)
    editor.registerCommand({
      name: 'extendSelectionRight',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._extendSelectionHorizontal(editor, selection, 'right');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // (향후 확장) 단어 단위 수평 이동: 왼쪽
    editor.registerCommand({
      name: 'moveCursorWordLeft',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._moveWordHorizontal(editor, selection, 'left');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // (향후 확장) 단어 단위 수평 이동: 오른쪽
    editor.registerCommand({
      name: 'moveCursorWordRight',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._moveWordHorizontal(editor, selection, 'right');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // (향후 확장) 단어 단위 범위 확장: 왼쪽 (Ctrl/Alt+Shift+ArrowLeft)
    editor.registerCommand({
      name: 'extendSelectionWordLeft',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._extendSelectionWordHorizontal(editor, selection, 'left');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });

    // (향후 확장) 단어 단위 범위 확장: 오른쪽 (Ctrl/Alt+Shift+ArrowRight)
    editor.registerCommand({
      name: 'extendSelectionWordRight',
      execute: async (editor: Editor, payload?: { selection?: ModelSelection }) => {
        const selection =
          (payload?.selection as ModelSelection | undefined) || ((editor as any).selection as ModelSelection | null);
        if (!selection) return false;
        return await this._extendSelectionWordHorizontal(editor, selection, 'right');
      },
      canExecute: (_editor: Editor, payload?: any) => {
        return !!(payload?.selection ?? (editor as any).selection);
      }
    });
  }

  onDestroy(_editor: Editor): void {
    // 정리 작업 필요 시 여기에 추가
  }

  /**
   * 수평 이동 - caret 이동 (Left / Right, 한 글자 단위)
   *
   * 1. RangeSelection + collapsed 인 경우만 처리
   * 2. 같은 텍스트 노드 안에서는 offset ±1
   * 3. 텍스트 처음/끝에서:
   *    - 이전/다음 editable 노드가 있으면 그 텍스트 노드의 끝/처음으로 이동
   *    - editable 이 아니고 selectable 이면 해당 노드 전체를 선택 (0,0 range 로 표현)
   */
  private async _moveCaretHorizontal(
    editor: Editor,
    selection: ModelSelection,
    direction: 'left' | 'right'
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveSelectionExtension] dataStore not found');
      return false;
    }

    if (!selection || selection.type !== 'range' || !selection.collapsed) {
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const isTextNode = typeof currentNode?.text === 'string';
    const textLength = isTextNode ? currentNode.text.length : 0;

    // 1-1. 텍스트 노드 안에서의 단순 이동
    if (isTextNode) {
      if (direction === 'left' && selection.startOffset > 0) {
        const newOffset = selection.startOffset - 1;
        const newSelection: ModelSelection = {
          type: 'range',
          startNodeId: selection.startNodeId,
          startOffset: newOffset,
          endNodeId: selection.startNodeId,
          endOffset: newOffset,
          collapsed: true,
          direction: 'backward'
        };
        (editor as any).updateSelection(newSelection);
        return true;
      }

      if (direction === 'right' && selection.startOffset < textLength) {
        const newOffset = selection.startOffset + 1;
        const newSelection: ModelSelection = {
          type: 'range',
          startNodeId: selection.startNodeId,
          startOffset: newOffset,
          endNodeId: selection.startNodeId,
          endOffset: newOffset,
          collapsed: true,
          direction: 'forward'
        };
        (editor as any).updateSelection(newSelection);
        return true;
      }
    }

    // 1-2. 텍스트 처음/끝 또는 비텍스트 노드에서 인접 editable/selectable 로 이동
    const neighborId =
      direction === 'left'
        ? dataStore.getPreviousEditableNode(selection.startNodeId)
        : dataStore.getNextEditableNode(selection.startNodeId);

    if (!neighborId) {
      // 더 이상 이동할 수 없음
      return false;
    }

    const neighborNode = dataStore.getNode(neighborId);
    if (!neighborNode) {
      console.warn('[MoveSelectionExtension] neighbor node not found', { neighborId });
      return false;
    }

    // 텍스트 노드인 경우: 해당 텍스트의 끝/처음으로 이동
    if (typeof neighborNode.text === 'string') {
      const offset = direction === 'left' ? neighborNode.text.length : 0;
      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: neighborId,
        startOffset: offset,
        endNodeId: neighborId,
        endOffset: offset,
        collapsed: true,
        direction: direction === 'left' ? 'backward' : 'forward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    }

    // 텍스트가 아니라면, selectable 인지 확인하고 노드 전체 선택으로 이동
    const isSelectableSimple =
      typeof dataStore.isSelectableNode === 'function'
        ? dataStore.isSelectableNode(neighborId)
        : false;

    if (isSelectableSimple) {
      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: neighborId,
        startOffset: 0,
        endNodeId: neighborId,
        endOffset: 0,
        collapsed: true,
        direction: direction === 'left' ? 'backward' : 'forward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    }

    // selectable 도 아니면 이동하지 않는다.
    return false;
  }

  /**
   * 수평 방향 RangeSelection 확장 (Shift + Left / Shift + Right)
   *
   * 1. collapsed RangeSelection 기준으로만 확장
   * 2. 같은 텍스트 노드 안에서는 한 글자 단위 확장
   * 3. 텍스트 처음/끝에서 인접 텍스트 노드까지 cross-node 확장
   */
  private async _extendSelectionHorizontal(
    editor: Editor,
    selection: ModelSelection,
    direction: 'left' | 'right'
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveSelectionExtension] dataStore not found');
      return false;
    }

    if (!selection || selection.type !== 'range' || !selection.collapsed) {
      // 현재 단계에서는 collapsed 상태에서의 확장만 지원한다.
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const isTextNode = typeof currentNode?.text === 'string';
    const textLength = isTextNode ? currentNode.text.length : 0;

    // 2-1. 같은 텍스트 노드 안에서의 확장
    if (isTextNode) {
      if (direction === 'right' && selection.startOffset < textLength) {
        // [offset, offset+1]
        const newSelection: ModelSelection = {
          type: 'range',
          startNodeId: selection.startNodeId,
          startOffset: selection.startOffset,
          endNodeId: selection.startNodeId,
          endOffset: selection.startOffset + 1,
          collapsed: false,
          direction: 'forward'
        };
        (editor as any).updateSelection(newSelection);
        return true;
      }

      if (direction === 'left' && selection.startOffset > 0) {
        // [offset-1, offset]
        const newSelection: ModelSelection = {
          type: 'range',
          startNodeId: selection.startNodeId,
          startOffset: selection.startOffset - 1,
          endNodeId: selection.startNodeId,
          endOffset: selection.startOffset,
          collapsed: false,
          direction: 'backward'
        };
        (editor as any).updateSelection(newSelection);
        return true;
      }
    }

    // 2-2. 텍스트 처음/끝에서 인접 텍스트 노드로 cross-node 확장
    const neighborId =
      direction === 'left'
        ? dataStore.getPreviousEditableNode(selection.startNodeId)
        : dataStore.getNextEditableNode(selection.startNodeId);

    if (!neighborId) {
      // 더 이상 이동할 수 없음
      return false;
    }

    const neighborNode = dataStore.getNode(neighborId);
    if (!neighborNode) {
      console.warn('[MoveSelectionExtension] neighbor node not found', { neighborId });
      return false;
    }

    if (typeof neighborNode.text === 'string') {
      if (direction === 'right' && isTextNode && selection.startOffset === textLength) {
        // [currentNodeId, currentOffset] → [neighborId, 1] (첫 글자까지)
        const newSelection: ModelSelection = {
          type: 'range',
          startNodeId: selection.startNodeId,
          startOffset: selection.startOffset,
          endNodeId: neighborId,
          endOffset: 1,
          collapsed: false,
          direction: 'forward'
        };
        (editor as any).updateSelection(newSelection);
        return true;
      }

      if (direction === 'left' && isTextNode && selection.startOffset === 0) {
        // [neighborId, len-1] → [currentNodeId, 0]
        const len = neighborNode.text.length;
        if (len > 0) {
          const newSelection: ModelSelection = {
            type: 'range',
            startNodeId: neighborId,
            startOffset: len - 1,
            endNodeId: selection.startNodeId,
            endOffset: 0,
            collapsed: false,
            direction: 'backward'
          };
          (editor as any).updateSelection(newSelection);
          return true;
        }
      }
    }

    // Shift + Arrow 에서 selectable/non-text는 아직 지원하지 않는다.
    return false;
  }

  /**
   * 단어 단위 수평 이동 (Left / Right)
   *
   * - 현재 단계에서는 "같은 텍스트 노드 내부"에서만 동작한다.
   * - 단어 경계 정의:
   *   - 공백(스페이스, 탭, 줄바꿈 등)과 비공백이 바뀌는 지점을 경계로 본다.
   * - cross-node, non-text 노드에 대한 단어 단위 이동은 향후 확장 시에 다룬다.
   */
  private async _moveWordHorizontal(
    editor: Editor,
    selection: ModelSelection,
    direction: 'left' | 'right'
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveSelectionExtension] dataStore not found');
      return false;
    }

    if (!selection || selection.type !== 'range' || !selection.collapsed) {
      // 현재 단계에서는 collapsed range 에 대해서만 단어 단위 이동을 지원한다.
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const text: string | undefined =
      currentNode && typeof currentNode.text === 'string' ? currentNode.text : undefined;

    if (typeof text !== 'string') {
      // 텍스트 노드가 아니면 단어 단위 이동은 아직 지원하지 않는다.
      return false;
    }

    const len = text.length;
    const offset = selection.startOffset;

    if (direction === 'left') {
      if (offset === 0) {
        // 노드의 처음이면 더 이상 왼쪽으로 단어 단위 이동하지 않는다 (향후 cross-node 확장 대상)
        return false;
      }

      // 왼쪽으로 가면서 첫 번째 "비공백 → 공백" 또는 "공백 → 비공백" 경계를 찾는다.
      let i = offset - 1;
      // 현재 위치 기준 상태
      const isSpace = (ch: string) => /\s/.test(ch);
      let prevIsSpace = isSpace(text[i]);

      for (; i > 0; i--) {
        const curIsSpace = isSpace(text[i - 1]);
        if (curIsSpace !== prevIsSpace) {
          // 경계를 찾았으므로 그 직후 위치가 새로운 caret 위치가 된다.
          // 예: "foo bar", offset=7(끝)이면 i가 공백-비공백 경계까지 움직이고, i 가 새 offset.
          break;
        }
        prevIsSpace = curIsSpace;
      }

      const newOffset = i;
      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: selection.startNodeId,
        startOffset: newOffset,
        endNodeId: selection.startNodeId,
        endOffset: newOffset,
        collapsed: true,
        direction: 'backward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    } else {
      // direction === 'right'
      if (offset >= len) {
        // 노드의 끝이면 더 이상 오른쪽으로 단어 단위 이동하지 않는다 (향후 cross-node 확장 대상)
        return false;
      }

      const isSpace = (ch: string) => /\s/.test(ch);
      let i = offset;

      // 1) 현재 위치가 공백이면, 다음 비공백 문자를 찾는다.
      if (isSpace(text[i])) {
        while (i < len && isSpace(text[i])) {
          i++;
        }
      } else {
        // 2) 현재 위치가 비공백이면, 이번 단어의 끝(다음 공백)까지 이동한 뒤,
        //    그 이후 첫 번째 비공백 문자를 찾는다.
        while (i < len && !isSpace(text[i])) {
          i++;
        }
        while (i < len && isSpace(text[i])) {
          i++;
        }
      }

      const newOffset = i > len ? len : i;
      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: selection.startNodeId,
        startOffset: newOffset,
        endNodeId: selection.startNodeId,
        endOffset: newOffset,
        collapsed: true,
        direction: 'forward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    }
  }

  /**
   * 단어 단위 RangeSelection 확장 (Ctrl/Alt + Shift + Left/Right)
   *
   * - 현재 단계에서는 "같은 텍스트 노드 내부"에서만 동작한다.
   * - collapsed RangeSelection 기준으로, 단어 경계까지 확장한다.
   *   - Right: [anchorOffset, nextWordStart]
   *   - Left:  [prevWordStart, anchorOffset]
   */
  private async _extendSelectionWordHorizontal(
    editor: Editor,
    selection: ModelSelection,
    direction: 'left' | 'right'
  ): Promise<boolean> {
    const dataStore = (editor as any).dataStore;
    if (!dataStore) {
      console.error('[MoveSelectionExtension] dataStore not found');
      return false;
    }

    if (!selection || selection.type !== 'range' || !selection.collapsed) {
      // 현재 단계에서는 collapsed 상태에서의 단어 단위 확장만 지원한다.
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const text: string | undefined =
      currentNode && typeof currentNode.text === 'string' ? currentNode.text : undefined;

    if (typeof text !== 'string') {
      // 텍스트 노드가 아니면 단어 단위 확장은 아직 지원하지 않는다.
      return false;
    }

    const len = text.length;
    const anchorOffset = selection.startOffset;

    if (direction === 'left') {
      if (anchorOffset === 0) {
        return false;
      }

      const isSpace = (ch: string) => /\s/.test(ch);
      let i = anchorOffset - 1;
      let prevIsSpace = isSpace(text[i]);

      for (; i > 0; i--) {
        const curIsSpace = isSpace(text[i - 1]);
        if (curIsSpace !== prevIsSpace) {
          break;
        }
        prevIsSpace = curIsSpace;
      }

      const targetOffset = i;
      if (targetOffset === anchorOffset) {
        return false;
      }

      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: selection.startNodeId,
        startOffset: targetOffset,
        endNodeId: selection.startNodeId,
        endOffset: anchorOffset,
        collapsed: false,
        direction: 'backward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    } else {
      // direction === 'right'
      if (anchorOffset >= len) {
        return false;
      }

      const isSpace = (ch: string) => /\s/.test(ch);
      let i = anchorOffset;

      if (isSpace(text[i])) {
        while (i < len && isSpace(text[i])) {
          i++;
        }
      } else {
        while (i < len && !isSpace(text[i])) {
          i++;
        }
        while (i < len && isSpace(text[i])) {
          i++;
        }
      }

      const targetOffset = i > len ? len : i;
      if (targetOffset === anchorOffset) {
        return false;
      }

      const newSelection: ModelSelection = {
        type: 'range',
        startNodeId: selection.startNodeId,
        startOffset: anchorOffset,
        endNodeId: selection.startNodeId,
        endOffset: targetOffset,
        collapsed: false,
        direction: 'forward'
      };
      (editor as any).updateSelection(newSelection);
      return true;
    }
  }
}


