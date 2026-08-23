import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { UnderlineExtension } from '../src/underline';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@barocss/model')>();
  return {
    ...actual,
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    }
  };
});

function createFakeEditor(dataStore: any): Editor & { __getCommand: (name: string) => any; dataStore: any } {
  const commands: Record<string, any> = {};

  return {
    registerCommand: (cmd: any) => {
      commands[cmd.name] = cmd;
    },
    __getCommand(name: string) {
      return commands[name];
    },
    dataStore
  } as unknown as Editor & { __getCommand: (name: string) => any; dataStore: any };
}

describe('UnderlineExtension - toggleUnderline', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('같은 텍스트 노드 내 range selection 에 대해 underline toggleMark operation 을 생성한다', async () => {
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          return { sid: 'text-1', stype: 'text', text: 'HelloWorld' };
        }
        return null;
      }
    };

    const editor = createFakeEditor(dataStore);
    const ext = new UnderlineExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('toggleUnderline');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 7,
      collapsed: false,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);

    const ops = recordedTransactions[0];
    expect(ops).toEqual([
      {
        type: 'toggleMark',
        payload: {
          range: { startNodeId: 'text-1', startOffset: 2, endNodeId: 'text-1', endOffset: 7 },
          markType: 'underline'
        }
      }
    ]);
  });

  it('여러 노드에 걸친 RangeSelection 도 cross-node toggleMark 로 처리한다', async () => {
    const dataStore = {
      getNode: (_id: string) => null
    };

    const editor = createFakeEditor(dataStore);
    const ext = new UnderlineExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('toggleUnderline');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 1,
      endNodeId: 'text-2',
      endOffset: 3,
      collapsed: false,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);

    const ops = recordedTransactions[0];
    expect(ops[0]).toEqual({
      type: 'toggleMark',
      payload: {
        range: { startNodeId: 'text-1', startOffset: 1, endNodeId: 'text-2', endOffset: 3 },
        markType: 'underline'
      }
    });
  });
});


