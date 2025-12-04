import { INode } from '@barocss/model';
import { DocumentState, SelectionState } from './types';

export class CommandManager {
  private _history: DocumentState[] = [];
  private _currentIndex = -1;
  private _maxHistorySize = 100;

  // 명령 실행
  execute(command: Command, state: DocumentState): { newState: DocumentState; canUndo: boolean; canRedo: boolean } {
    const newState = command.execute(state);
    this._addToHistory(newState);
    
    return {
      newState,
      canUndo: this._currentIndex > 0,
      canRedo: this._currentIndex < this._history.length - 1
    };
  }

  // 실행 취소
  undo(): DocumentState | null {
    if (this._currentIndex > 0) {
      this._currentIndex--;
      return this._history[this._currentIndex];
    }
    return null;
  }

  // 다시 실행
  redo(): DocumentState | null {
    if (this._currentIndex < this._history.length - 1) {
      this._currentIndex++;
      return this._history[this._currentIndex];
    }
    return null;
  }

  // 히스토리에 추가
  private _addToHistory(state: DocumentState): void {
    // 현재 인덱스 이후의 히스토리 제거
    this._history = this._history.slice(0, this._currentIndex + 1);
    
    // 새 상태 추가
    this._history.push({ ...state });
    this._currentIndex++;
    
    // 최대 크기 제한
    if (this._history.length > this._maxHistorySize) {
      this._history.shift();
      this._currentIndex--;
    }
  }
}

// 명령 인터페이스
export interface Command {
  execute(state: DocumentState): DocumentState;
  canExecute?(state: DocumentState): boolean;
}

// 텍스트 삽입 명령
export class InsertTextCommand implements Command {
  constructor(private _text: string, private _position: number) {}

  execute(state: DocumentState): DocumentState {
    // 텍스트 삽입 로직
    return {
      ...state,
      content: this._insertTextIntoDocument(state.content, this._text, this._position)
    };
  }

  private _insertTextIntoDocument(content: any[], _text: string, _position: number): any[] {
    // 실제 텍스트 삽입 구현
    return content;
  }
}

// 노드 삽입 명령
export class InsertNodeCommand implements Command {
  constructor(private _node: INode, private _position: number) {}

  execute(state: DocumentState): DocumentState {
    return {
      ...state,
      content: this._insertNodeIntoDocument(state.content, this._node, this._position)
    };
  }

  private _insertNodeIntoDocument(content: any[], _node: INode, _position: number): any[] {
    // 실제 노드 삽입 구현
    return content;
  }
}

// 노드 삭제 명령
export class DeleteNodeCommand implements Command {
  constructor(private _nodeId: string) {}

  execute(state: DocumentState): DocumentState {
    return {
      ...state,
      content: this._deleteNodeFromDocument(state.content, this._nodeId)
    };
  }

  private _deleteNodeFromDocument(content: any[], _nodeId: string): any[] {
    // 실제 노드 삭제 구현
    return content;
  }
}

// 선택 변경 명령
export class SetSelectionCommand implements Command {
  constructor(private _selection: SelectionState) {}

  execute(state: DocumentState): DocumentState {
    // selection은 별도로 관리됨
    // TODO: 실제로는 selection 상태를 업데이트해야 함
    console.log('Setting selection:', this._selection);
    return {
      ...state
    };
  }
}
