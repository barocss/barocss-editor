import { describe, it, expect } from 'vitest';
import type { INode } from '@barocss/datastore';
import { CommandManager, InsertTextCommand, InsertNodeCommand, DeleteNodeCommand } from '../src/commands';
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

    // `{ id, type }` is the shape these commands were written against, and the model's
    // node is `{ sid, stype }` — the command splices whatever it is given, so the test
    // still says something true about *where* the node lands. Cast at the boundary
    // rather than quietly: the mismatch is the interesting part.
    const command = new InsertNodeCommand(
      { id: 'p-2', type: 'paragraph', text: 'second' } as unknown as INode,
      1
    );
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

  /*
   * **여기 있던 `SetSelectionCommand` 검사를 지웠다 — 그 클래스와 함께.**
   *
   * 그 클래스는 `void this._selection; return { ...state }` 였고 아무도 부르지 않았다. 그리고 이
   * 검사가 그것이 죽었다는 가장 좋은 증거였다: `ModelSelection` 을 세워서 **`as unknown as
   * SelectionState`** 로 캐스팅해 넣었고, 주석에 *"a `SelectionState` is a DOM selection … and this
   * is the model-side shape the command was written against"* 라고 적어 뒀다. **타입을 속여야
   * 컴파일되는 검사** 는 그 타입이 아무것도 안 지키고 있다는 뜻이다.
   *
   * 선택은 `Editor.updateSelection` 이 다룬다.
   */

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
