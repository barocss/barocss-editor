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
    }),
    insertParagraph: (blockType?: 'paragraph' | 'same', selectionAlias?: string) => ({
      type: 'insertParagraph',
      payload: {
        ...(blockType != null && { blockType }),
        ...(selectionAlias != null && { selectionAlias })
      }
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

describe('ParagraphExtension - insertParagraph', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('collapsed selection: transaction에 insertParagraph(same) 한 개만 넣는다', async () => {
    const schema = {
      getNodeType: (stype: string) => {
        if (stype === 'paragraph') return { group: 'block' };
        if (stype === 'inline-text') return { group: 'inline' };
        return null;
      }
    };
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          return { sid: 'text-1', stype: 'inline-text', text: 'Hi', parentId: 'para-1' };
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

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 2,
      endNodeId: 'text-1',
      endOffset: 2,
      collapsed: true,
      direction: 'none'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({ type: 'insertParagraph', payload: { blockType: 'same' } });
  });

  it('range (same node): deleteTextRange 후 insertParagraph(same) 두 개 넣는다', async () => {
    const schema = {
      getNodeType: (stype: string) => {
        if (stype === 'paragraph') return { group: 'block' };
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

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 1,
      endNodeId: 'text-1',
      endOffset: 4,
      collapsed: false,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({ type: 'deleteTextRange', payload: { start: 1, end: 4 } });
    expect(ops[1]).toEqual({ type: 'insertParagraph', payload: { blockType: 'same' } });
  });

  it('selection 없으면 실행하지 않고 false 반환', async () => {
    const editor = createFakeEditor({ getNode: () => null, getActiveSchema: () => null });
    const ext = new ParagraphExtension();
    ext.onCreate(editor);
    const cmd = (editor as any).__getCommand('insertParagraph');

    const result = await cmd.execute(editor, {});
    expect(result).toBe(false);
    expect(commitMock).not.toHaveBeenCalled();
  });
});
