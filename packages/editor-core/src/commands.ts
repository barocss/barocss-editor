import type { INode } from '@barocss/datastore';
import { DocumentState, SelectionState } from './types';

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

export class SetSelectionCommand implements Command {
  constructor(private _selection: SelectionState) {}

  execute(state: DocumentState): DocumentState {
    // Selection is managed separately in Editor and SelectionManager.
    // Keep DocumentState immutable by returning the same shape.
    return { ...state };
  }
}
