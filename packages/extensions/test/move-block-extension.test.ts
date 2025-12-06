import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { MoveBlockExtension } from '../src/move-block';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return {
        commit: commitMock
      };
    },
    control: (_nodeId: string, ops: any[]) => ops,
    moveBlockUp: () => ({
      type: 'moveBlockUp',
      payload: {}
    }),
    moveBlockDown: () => ({
      type: 'moveBlockDown',
      payload: {}
    })
  };
});

function createFakeEditor(dataStore: any, schema?: any): Editor & { __getCommand: (name: string) => any; dataStore: any } {
  const commands: Record<string, any> = {};

  return {
    // @ts-expect-error - Only minimal implementation provided
    registerCommand: (cmd: any) => {
      commands[cmd.name] = cmd;
    },
    __getCommand(name: string) {
      return commands[name];
    },
    // @ts-expect-error - May differ from actual Editor interface
    dataStore,
    getActiveSchema: () => schema
  } as Editor & { __getCommand: (name: string) => any; dataStore: any };
}

describe('MoveBlockExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  describe('moveBlockUp', () => {
    it('moveBlockUp은 블록을 위로 이동하는 operation을 생성한다', async () => {
      const schema = {
        getNodeType: (stype: string) => {
          if (stype === 'paragraph') return { group: 'block' };
          if (stype === 'heading') return { group: 'block' };
          if (stype === 'inline-text') return { group: 'inline' };
          return null;
        }
      };

      const dataStore = {
        getNode: (id: string) => {
          if (id === 'text-1') {
            return { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'para-2' };
          }
          if (id === 'para-2') {
            return { sid: 'para-2', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
          }
          return null;
        },
        getActiveSchema: () => schema
      };

      const editor = createFakeEditor(dataStore, schema);
      const ext = new MoveBlockExtension();
      ext.onCreate(editor);

      const cmd = (editor as any).__getCommand('moveBlockUp');
      const selection: ModelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5,
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
          type: 'moveBlockUp',
          payload: {}
        }
      ]);
    });
  });

  describe('moveBlockDown', () => {
    it('moveBlockDown은 블록을 아래로 이동하는 operation을 생성한다', async () => {
      const schema = {
        getNodeType: (stype: string) => {
          if (stype === 'paragraph') return { group: 'block' };
          if (stype === 'heading') return { group: 'block' };
          if (stype === 'inline-text') return { group: 'inline' };
          return null;
        }
      };

      const dataStore = {
        getNode: (id: string) => {
          if (id === 'text-1') {
            return { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'para-2' };
          }
          if (id === 'para-2') {
            return { sid: 'para-2', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
          }
          return null;
        },
        getActiveSchema: () => schema
      };

      const editor = createFakeEditor(dataStore, schema);
      const ext = new MoveBlockExtension();
      ext.onCreate(editor);

      const cmd = (editor as any).__getCommand('moveBlockDown');
      const selection: ModelSelection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 5,
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
          type: 'moveBlockDown',
          payload: {}
        }
      ]);
    });
  });
});

