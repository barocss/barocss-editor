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
    control: (_nodeId: string, ops: any[]) => ops
  };
});

function createFakeEditor(dataStore: any): Editor {
  const commands: Record<string, any> = {};

  return {
    // @ts-expect-error - 최소 구현만 제공
    registerCommand: (cmd: any) => {
      commands[cmd.name] = cmd;
    },
    // 테스트 편의를 위해 명령을 찾기 위한 헬퍼
    __getCommand(name: string) {
      return commands[name];
    },
    // DataStore 를 주입하기 위해 any 캐스팅을 허용
    // @ts-expect-error - 실제 Editor 인터페이스와 다를 수 있음
    dataStore
  } as Editor & { __getCommand: (name: string) => any; dataStore: any };
}

describe('ParagraphExtension - insertParagraph (operations builder)', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('텍스트 중간에서 Enter 를 누르면 splitTextNode + splitBlockNode operation 을 생성한다', async () => {
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          return { sid: 'text-1', stype: 'text', text: 'HelloWorld', parentId: 'para-1' };
        }
        if (id === 'para-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: {},
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        if (id === 'doc-1') {
          return {
            sid: 'doc-1',
            stype: 'doc',
            content: ['para-1']
          };
        }
        return null;
      },
      getParent: (id: string) => {
        if (id === 'text-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: {},
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        return null;
      }
    };

    const editor = createFakeEditor(dataStore);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);

    const ops = recordedTransactions[0];
    expect(ops).toEqual([
      {
        type: 'splitTextNode',
        payload: { splitPosition: 5 }
      },
      {
        type: 'splitBlockNode',
        payload: { splitPosition: 1 }
      }
    ]);
  });

  it('paragraph 끝에서 Enter 를 누르면 같은 타입의 빈 paragraph 를 뒤에 추가하는 addChild operation 을 생성한다', async () => {
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          return { sid: 'text-1', stype: 'text', text: 'Hello', parentId: 'para-1' };
        }
        if (id === 'para-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: { level: 1 },
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        if (id === 'doc-1') {
          return {
            sid: 'doc-1',
            stype: 'doc',
            content: ['para-1']
          };
        }
        return null;
      },
      getParent: (id: string) => {
        if (id === 'text-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: { level: 1 },
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        return null;
      }
    };

    const editor = createFakeEditor(dataStore);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 5,
      endNodeId: 'text-1',
      endOffset: 5,
      collapsed: true,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('addChild');
    expect(ops[0].payload.parentId).toBe('doc-1');
    expect(ops[0].payload.position).toBe(1);
    expect(ops[0].payload.child).toMatchObject({
      stype: 'paragraph',
      attributes: { level: 1 },
      content: []
    });
  });

  it('paragraph 시작에서 Enter 를 누르면 같은 타입의 빈 paragraph 를 앞에 추가하는 addChild operation 을 생성한다', async () => {
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          return { sid: 'text-1', stype: 'text', text: 'Hello', parentId: 'para-1' };
        }
        if (id === 'para-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: { level: 1 },
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        if (id === 'doc-1') {
          return {
            sid: 'doc-1',
            stype: 'doc',
            content: ['para-1']
          };
        }
        return null;
      },
      getParent: (id: string) => {
        if (id === 'text-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: { level: 1 },
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        return null;
      }
    };

    const editor = createFakeEditor(dataStore);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 0,
      endNodeId: 'text-1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(true);
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions).toHaveLength(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0].type).toBe('addChild');
    expect(ops[0].payload.parentId).toBe('doc-1');
    expect(ops[0].payload.position).toBe(0);
    expect(ops[0].payload.child).toMatchObject({
      stype: 'paragraph',
      attributes: { level: 1 },
      content: []
    });
  });

  it('같은 텍스트 노드 내 RangeSelection 에서 Enter 를 누르면 deleteTextRange + 이후 split/추가 operation 을 생성한다', async () => {
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') {
          // "HelloWorld" 에서 "lo" 범위를 삭제한다고 가정
          return { sid: 'text-1', stype: 'text', text: 'HelloWorld', parentId: 'para-1' };
        }
        if (id === 'para-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: {},
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        if (id === 'doc-1') {
          return {
            sid: 'doc-1',
            stype: 'doc',
            content: ['para-1']
          };
        }
        return null;
      },
      getParent: (id: string) => {
        if (id === 'text-1') {
          return {
            sid: 'para-1',
            stype: 'paragraph',
            attributes: {},
            content: ['text-1'],
            parentId: 'doc-1'
          };
        }
        return null;
      }
    };

    const editor = createFakeEditor(dataStore);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 3,
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
    // deleteTextRange + 이후 collapsed 기준 로직 (여기서는 중간 offset 이므로 splitTextNode + splitBlockNode)
    expect(ops[0]).toEqual({
      type: 'deleteTextRange',
      payload: { start: 3, end: 7 }
    });
    expect(ops[1]).toEqual({
      type: 'splitTextNode',
      payload: { splitPosition: 3 }
    });
    expect(ops[2]).toEqual({
      type: 'splitBlockNode',
      payload: { splitPosition: 1 }
    });
  });

  it('여러 노드에 걸친 RangeSelection 은 아직 operation 을 생성하지 않는다', async () => {
    const dataStore = {
      getNode: (_id: string) => null,
      getParent: (_id: string) => null
    };

    const editor = createFakeEditor(dataStore);
    const ext = new ParagraphExtension();
    ext.onCreate(editor);

    const cmd = (editor as any).__getCommand('insertParagraph');
    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'text-1',
      startOffset: 1,
      endNodeId: 'text-2',
      endOffset: 2,
      collapsed: false,
      direction: 'forward'
    };

    const result = await cmd.execute(editor, { selection });
    expect(result).toBe(false);
    expect(commitMock).not.toHaveBeenCalled();
    expect(recordedTransactions).toHaveLength(0);
  });
});

