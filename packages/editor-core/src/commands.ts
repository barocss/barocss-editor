import type { INode } from '@barocss/datastore';
import { DocumentState } from './types';

export class CommandManager {
  private _history: DocumentState[] = [];
  private _currentIndex = -1;
  private _maxHistorySize = 100;

  execute(command: Command, state: DocumentState): { newState: DocumentState; canUndo: boolean; canRedo: boolean } {
    const newState = command.execute(state);
    this._addToHistory(newState);
    
    return {
      newState,
      canUndo: this._currentIndex > 0,
      canRedo: this._currentIndex < this._history.length - 1
    };
  }

  undo(): DocumentState | null {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      return this._history[this._currentIndex];
    }
    return null;
  }

  redo(): DocumentState | null {
    if (this._currentIndex < this._history.length - 1) {
      this._currentIndex++;
      return this._history[this._currentIndex];
    }
    return null;
  }

  private _addToHistory(state: DocumentState): void {
    // Remove history after current index
    this._history = this._history.slice(0, this._currentIndex + 1);
    
    this._history.push({ ...state });
    this._currentIndex++;
    
    // Limit max size
    if (this._history.length > this._maxHistorySize) {
      this._history.shift();
      this._currentIndex--;
    }
  }
}

export interface Command {
  execute(state: DocumentState): DocumentState;
  canExecute?(state: DocumentState): boolean;
}

export class InsertTextCommand implements Command {
  constructor(private _text: string, private _position: number) {}

  execute(state: DocumentState): DocumentState {
    return {
      ...state,
      content: this._insertTextIntoDocument(state.content, this._text, this._position)
    };
  }

  private _insertTextIntoDocument(content: any[], _text: string, _position: number): any[] {
    const nextContent = [...content];
    if (nextContent.length === 0) {
      nextContent.push({
        id: `inline-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'inline-text',
        text: _text
      });
      return nextContent;
    }

    const targetNode = nextContent.find((node: any) => typeof node?.text === 'string');
    const targetIndex = nextContent.findIndex((node: any) => typeof node?.text === 'string');
    if (targetIndex === -1 || !targetNode) {
      nextContent.push({
        id: `inline-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'inline-text',
        text: _text
      });
      return nextContent;
    }

    const text = targetNode.text || '';
    const position = Math.max(0, Math.min(_position, text.length));
    const nextText = `${text.slice(0, position)}${_text}${text.slice(position)}`;
    const updatedNode = { ...targetNode, text: nextText };
    nextContent[targetIndex] = updatedNode;

    return nextContent;
  }
}

export class InsertNodeCommand implements Command {
  constructor(private _node: INode, private _position: number) {}

  execute(state: DocumentState): DocumentState {
    return {
      ...state,
      content: this._insertNodeIntoDocument(state.content, this._node, this._position)
    };
  }

  private _insertNodeIntoDocument(content: any[], _node: INode, _position: number): any[] {
    const nextContent = [...content];
    const position = Math.max(0, Math.min(_position, nextContent.length));
    nextContent.splice(position, 0, _node);
    return nextContent;
  }
}

export class DeleteNodeCommand implements Command {
  constructor(private _nodeId: string) {}

  execute(state: DocumentState): DocumentState {
    return {
      ...state,
      content: this._deleteNodeFromDocument(state.content, this._nodeId)
    };
  }

  private _deleteNodeFromDocument(content: any[], _nodeId: string): any[] {
    return content.filter((node: any) => node?.id !== _nodeId);
  }
}

/*
 * **여기 있던 `SetSelectionCommand` 를 지웠다.**
 *
 * `SelectionState` 하나를 받아서 `void this._selection; return { ...state }` 를 했다 — 아무 일도
 * 하지 않고, **아무도 부르지 않았다.** 공개 export 였으므로 지우는 것은 API 변경이지만, 이
 * 저장소에도 밖에도 호출자가 없다.
 *
 * 선택은 `Editor.updateSelection` 이 다룬다. 그것을 명령으로 감쌀 값이 생기면 그때 `ModelSelection`
 * 을 받는 것을 쓴다 — 지금 남겨 두면 다음 사람이 이 모양을 향해 읽는다. `types.ts` 의 두 프로세가
 * 그 일이 두 번 일어난 것을 적어 뒀다.
 */

