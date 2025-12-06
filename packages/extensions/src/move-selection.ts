import { Editor, Extension } from '@barocss/editor-core';
import type { ModelSelection } from '@barocss/editor-core';

export interface MoveSelectionOptions {
  enabled?: boolean;
}

/**
 * MoveSelectionExtension
 *
 * - When moving Selection (cursor/range) with arrow keys, etc.,
 *   uses DataStore's getPreviousEditableNode / getNextEditableNode,
 *   isSelectableNode, etc. to determine the next position.
 *
 * - This Extension itself does not directly handle key events,
 *   and only operates based on ModelSelection passed from editor-view-dom.
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

    // Horizontal movement: left (one character at a time, caret movement)
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

    // Horizontal movement: right (one character at a time, caret movement)
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

    // Range extension: left (Shift+ArrowLeft)
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

    // Range extension: right (Shift+ArrowRight)
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

    // (Future extension) Word-level horizontal movement: left
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

    // (Future extension) Word-level horizontal movement: right
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

    // (Future extension) Word-level range extension: left (Ctrl/Alt+Shift+ArrowLeft)
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

    // (Future extension) Word-level range extension: right (Ctrl/Alt+Shift+ArrowRight)
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
    // Add cleanup here if needed
  }

  /**
   * Horizontal movement - caret movement (Left / Right, one character at a time)
   *
   * 1. Only handles RangeSelection + collapsed
   * 2. Within the same text node: offset ±1
   * 3. At text start/end:
   *    - If previous/next editable node exists, move to end/start of that text node
   *    - If not editable but selectable, select entire node (expressed as 0,0 range)
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

    // 1-1. Simple movement within text node
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

    // 1-2. Move to adjacent editable/selectable from text start/end or non-text node
    const neighborId =
      direction === 'left'
        ? dataStore.getPreviousEditableNode(selection.startNodeId)
        : dataStore.getNextEditableNode(selection.startNodeId);

    if (!neighborId) {
      // Cannot move further
      return false;
    }

    const neighborNode = dataStore.getNode(neighborId);
    if (!neighborNode) {
      console.warn('[MoveSelectionExtension] neighbor node not found', { neighborId });
      return false;
    }

    // If text node: move to end/start of that text
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

    // If not text, check if selectable and move to full node selection
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

    // If not selectable either, do not move
    return false;
  }

  /**
   * Extend RangeSelection horizontally (Shift + Left / Shift + Right)
   *
   * 1. Only extend from collapsed RangeSelection
   * 2. Extend one character at a time within the same text node
   * 3. Cross-node extension from text start/end to adjacent text node
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
      // Currently only support extension from collapsed state
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const isTextNode = typeof currentNode?.text === 'string';
    const textLength = isTextNode ? currentNode.text.length : 0;

    // 2-1. Extension within the same text node
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

    // 2-2. Cross-node extension from text start/end to adjacent text node
    const neighborId =
      direction === 'left'
        ? dataStore.getPreviousEditableNode(selection.startNodeId)
        : dataStore.getNextEditableNode(selection.startNodeId);

    if (!neighborId) {
      // Cannot move further
      return false;
    }

    const neighborNode = dataStore.getNode(neighborId);
    if (!neighborNode) {
      console.warn('[MoveSelectionExtension] neighbor node not found', { neighborId });
      return false;
    }

    if (typeof neighborNode.text === 'string') {
      if (direction === 'right' && isTextNode && selection.startOffset === textLength) {
        // [currentNodeId, currentOffset] → [neighborId, 1] (to first character)
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

    // Shift + Arrow does not yet support selectable/non-text
    return false;
  }

  /**
   * Word-level horizontal movement (Left / Right)
   *
   * - Currently only works "within the same text node"
   * - Word boundary definition:
   *   - Boundary is where whitespace (space, tab, newline, etc.) and non-whitespace change
   * - Word-level movement for cross-node, non-text nodes will be handled in future extensions
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
      // Currently only support word-level movement for collapsed range
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const text: string | undefined =
      currentNode && typeof currentNode.text === 'string' ? currentNode.text : undefined;

    if (typeof text !== 'string') {
      // Word-level movement is not yet supported for non-text nodes
      return false;
    }

    const len = text.length;
    const offset = selection.startOffset;

    if (direction === 'left') {
      if (offset === 0) {
        // If at node start, do not move word-level left anymore (future cross-node extension target)
        return false;
      }

      // Move left to find first "non-whitespace → whitespace" or "whitespace → non-whitespace" boundary
      let i = offset - 1;
      // State at current position
      const isSpace = (ch: string) => /\s/.test(ch);
      let prevIsSpace = isSpace(text[i]);

      for (; i > 0; i--) {
        const curIsSpace = isSpace(text[i - 1]);
        if (curIsSpace !== prevIsSpace) {
          // Boundary found, so the position right after it becomes the new caret position
          // Example: "foo bar", offset=7(end), i moves to whitespace-non-whitespace boundary, i becomes new offset
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
        // If at node end, do not move word-level right anymore (future cross-node extension target)
        return false;
      }

      const isSpace = (ch: string) => /\s/.test(ch);
      let i = offset;

      // 1) If current position is whitespace, find next non-whitespace character
      if (isSpace(text[i])) {
        while (i < len && isSpace(text[i])) {
          i++;
        }
      } else {
        // 2) If current position is non-whitespace, move to end of current word (next whitespace),
        //    then find first non-whitespace character after that
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
      // Currently only support word-level extension from collapsed state
      return false;
    }

    const currentNode = dataStore.getNode(selection.startNodeId);
    const text: string | undefined =
      currentNode && typeof currentNode.text === 'string' ? currentNode.text : undefined;

    if (typeof text !== 'string') {
      // Word-level extension is not yet supported for non-text nodes
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


