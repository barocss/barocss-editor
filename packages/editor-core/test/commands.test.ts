import { describe, it, expect } from 'vitest';
import { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand, SetSelectionCommand } from '../src/commands';
import { DocumentState } from '../src/types';

describe('Command classes', () => {
  it('InsertTextCommand는 첫 번째 텍스트 노드에 텍스트를 삽입해야 한다', () => {
    const state: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: [
        {
          id: 't-1',
          type: 'inline-text',
          text: 'hello'
        },
        {
          id: 'p-1',
          type: 'paragraph',
          text: 'world'
        }
      ]
    };

    const command = new InsertTextCommand('X', 2);
    const next = command.execute(state);

    expect(next.content).toHaveLength(2);
    expect((next.content[0] as any).text).toBe('heXllo');
    expect(next.content[1]).toEqual(state.content[1]);
  });

  it('InsertNodeCommand는 지정 위치에 노드를 삽입해야 한다', () => {
    const state: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: [
        { id: 'p-1', type: 'paragraph', text: 'first' }
      ]
    };

    const command = new InsertNodeCommand({
      id: 'p-2',
      type: 'paragraph',
      text: 'second'
    }, 1);
    const next = command.execute(state);

    expect(next.content).toHaveLength(2);
    expect(next.content[1]).toEqual({ id: 'p-2', type: 'paragraph', text: 'second' });
  });

  it('DeleteNodeCommand는 id가 일치하는 노드를 제거해야 한다', () => {
    const state: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: [
        { id: 'p-1', type: 'paragraph', text: 'first' },
        { id: 'p-2', type: 'paragraph', text: 'second' }
      ]
    };

    const command = new DeleteNodeCommand('p-1');
    const next = command.execute(state);

    expect(next.content).toHaveLength(1);
    expect((next.content[0] as any).id).toBe('p-2');
  });

  it('SetSelectionCommand는 state를 보존해야 한다', () => {
    const state: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: []
    };

    const command = new SetSelectionCommand({
      type: 'range',
      startNodeId: 'a',
      startOffset: 0,
      endNodeId: 'a',
      endOffset: 1,
      collapsed: false
    });
    const next = command.execute(state);

    expect(next).toEqual(state);
  });

  it('CommandManager는 undo/redo를 지원해야 한다', () => {
    const manager = new CommandManager();
    const base: DocumentState = {
      type: 'document',
      version: 1,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      content: [{ id: 't-1', type: 'inline-text', text: 'a' }]
    };

    const first = manager.execute(new InsertTextCommand('b', 1), base);
    const second = manager.execute(new InsertTextCommand('c', 2), first.newState);

    expect(first.canUndo).toBe(false);
    expect(first.canRedo).toBe(false);
    expect(second.canUndo).toBe(true);

    const undoState = manager.undo();
    expect(undoState).toEqual(first.newState);

    const redoState = manager.redo();
    expect(redoState).toEqual(second.newState);
  });
});
