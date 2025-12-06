import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor, ModelSelection } from '@barocss/editor-core';
import { ParagraphExtension } from '../src/paragraph';

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
    transformNode: (newType: string) => ({
      type: 'transformNode',
      payload: { newType }
    })
  };
});

function createFakeEditor(dataStore: any, schema?: any): Editor & { __getCommand: (name: string) => any; dataStore: any } {
  const commands: Record<string, any> = {};

  return {
    // @ts-expect-error - Only provides minimal implementation
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

describe('ParagraphExtension - setParagraph', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('setParagraph는 heading을 paragraph로 변환한다', async () => {
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
          return { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'heading-1' };
        }
        if (id === 'heading-1') {
          return { sid: 'heading-1', stype: 'heading', content: ['text-1'], attributes: { level: 1 }, parentId: 'doc-1' };
        }
        return null;
      },
      getActiveSchema: () => schema
    };

    const editor = createFakeEditor(dataStore, schema);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('setParagraph');
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
        type: 'transformNode',
        payload: { newType: 'paragraph' }
      }
    ]);
  });

  it('이미 paragraph면 no-op으로 true를 반환한다', async () => {
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
          return { sid: 'text-1', stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
        }
        if (id === 'para-1') {
          return { sid: 'para-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
        }
        return null;
      },
      getActiveSchema: () => schema
    };

    const editor = createFakeEditor(dataStore, schema);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('setParagraph');
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
    // Transaction is not called because it's a no-op
    expect(commitMock).not.toHaveBeenCalled();
  });
});
