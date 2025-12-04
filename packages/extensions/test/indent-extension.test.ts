import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelSelection } from '@barocss/editor-core';

// @barocss/model 모듈을 mock
const commitMock = vi.fn().mockResolvedValue({ success: true });
const recordedTransactions: any[][] = [];

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: any, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    control: (nodeId: string, ops: any[]) => {
      // control은 nodeId를 각 operation의 payload에 추가
      return ops.map(op => ({
        ...op,
        payload: {
          ...op.payload,
          nodeId
        }
      }));
    },
    indentNode: () => ({ type: 'indentNode', payload: {} }),
    outdentNode: () => ({ type: 'outdentNode', payload: {} })
  };
});


import { IndentExtension } from '../src/indent';

interface RegisteredCommand {
  name: string;
  execute: (editor: any, payload: any) => any;
  canExecute: (editor: any, payload: any) => boolean;
}

class FakeEditor {
  public commands = new Map<string, RegisteredCommand>();
  public dataStore: any;
  public selection: ModelSelection | null = null;

  constructor(dataStore: any) {
    this.dataStore = dataStore;
  }

  registerCommand(cmd: RegisteredCommand) {
    this.commands.set(cmd.name, cmd);
  }

  executeCommand(name: string, payload: any) {
    const cmd = this.commands.get(name);
    if (!cmd) {
      throw new Error(`Command not found: ${name}`);
    }
    return cmd.execute(this, payload);
  }
}

describe('IndentExtension', () => {
  beforeEach(() => {
    commitMock.mockClear();
    recordedTransactions.length = 0;
  });

  describe('indentNode command', () => {
    it('indentNode: indentable한 노드를 들여쓰기한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: (stype: string) => {
            if (stype === 'paragraph') {
              return { group: 'block', indentable: true };
            }
            return null;
          }
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 0,
        endNodeId: 'text-1',
        endOffset: 0,
        collapsed: true,
        direction: 'forward'
      };

      // text-1의 부모가 para-1이라고 가정
      fakeDataStore.getParent = (sid: string) => {
        if (sid === 'text-1') return { sid: 'para-1', stype: 'paragraph' };
        return null;
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const indentCmd = editor.commands.get('indentNode');
      expect(indentCmd).toBeDefined();

      // nodeId를 명시적으로 전달
      await indentCmd!.execute(editor, { nodeId: 'para-1' });

      expect(recordedTransactions).toHaveLength(1);
      expect(commitMock).toHaveBeenCalledTimes(1);

      const ops = recordedTransactions[0];
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('indentNode');
      expect(ops[0].payload.nodeId).toBe('para-1');
    });

    it('indentNode: selection에서 자동으로 대상 노드를 찾아 들여쓰기한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          if (sid === 'text-1') {
            return { sid, stype: 'inline-text', text: 'Hello', parentId: 'para-1' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getParent: (sid: string) => {
          if (sid === 'text-1') return { sid: 'para-1', stype: 'paragraph' };
          if (sid === 'para-1') return { sid: 'doc', stype: 'document' };
          return null;
        },
        getActiveSchema: () => ({
          getNodeType: (stype: string) => {
            if (stype === 'paragraph') {
              return { group: 'block', indentable: true };
            }
            return null;
          }
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'range',
        startNodeId: 'text-1',
        startOffset: 2,
        endNodeId: 'text-1',
        endOffset: 2,
        collapsed: true,
        direction: 'forward'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const indentCmd = editor.commands.get('indentNode');
      expect(indentCmd).toBeDefined();

      // nodeId 없이 실행 (selection에서 자동 추출)
      await indentCmd!.execute(editor);

      expect(recordedTransactions).toHaveLength(1);
      expect(commitMock).toHaveBeenCalledTimes(1);

      const ops = recordedTransactions[0];
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('indentNode');
      expect(ops[0].payload.nodeId).toBe('para-1');
    });

    it('indentNode: Node Selection에서 선택된 노드를 들여쓰기한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: (stype: string) => {
            if (stype === 'paragraph') {
              return { group: 'block', indentable: true };
            }
            return null;
          }
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const indentCmd = editor.commands.get('indentNode');
      expect(indentCmd).toBeDefined();

      await indentCmd!.execute(editor);

      expect(recordedTransactions).toHaveLength(1);
      expect(commitMock).toHaveBeenCalledTimes(1);

      const ops = recordedTransactions[0];
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('indentNode');
      expect(ops[0].payload.nodeId).toBe('para-1');
    });

    it('indentNode: indentable하지 않은 노드는 들여쓰기하지 않는다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: () => false, // indentable하지 않음
        getActiveSchema: () => ({
          getNodeType: () => null
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const indentCmd = editor.commands.get('indentNode');
      expect(indentCmd).toBeDefined();

      const result = await indentCmd!.execute(editor);

      // indentable하지 않으므로 false 반환
      expect(result).toBe(false);
      expect(recordedTransactions).toHaveLength(0);
      expect(commitMock).not.toHaveBeenCalled();
    });
  });

  describe('outdentNode command', () => {
    it('outdentNode: indentable한 노드를 내어쓰기한다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: (stype: string) => {
            if (stype === 'paragraph') {
              return { group: 'block', indentable: true };
            }
            return null;
          }
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const outdentCmd = editor.commands.get('outdentNode');
      expect(outdentCmd).toBeDefined();

      await outdentCmd!.execute(editor, { nodeId: 'para-1' });

      expect(recordedTransactions).toHaveLength(1);
      expect(commitMock).toHaveBeenCalledTimes(1);

      const ops = recordedTransactions[0];
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('outdentNode');
      expect(ops[0].payload.nodeId).toBe('para-1');
    });

    it('outdentNode: 부모가 없는 노드는 내어쓰기하지 않는다', async () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: null }; // 부모 없음
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: () => null
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const outdentCmd = editor.commands.get('outdentNode');
      expect(outdentCmd).toBeDefined();

      const result = await outdentCmd!.execute(editor);

      // 부모가 없으므로 false 반환
      expect(result).toBe(false);
      expect(recordedTransactions).toHaveLength(0);
      expect(commitMock).not.toHaveBeenCalled();
    });
  });

  describe('canExecute', () => {
    it('indentNode: indentable한 노드만 실행 가능', () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: () => null
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const indentCmd = editor.commands.get('indentNode');
      expect(indentCmd).toBeDefined();

      // indentable한 노드
      expect(indentCmd!.canExecute(editor, { nodeId: 'para-1' })).toBe(true);

      // indentable하지 않은 노드
      fakeDataStore.isIndentableNode = () => false;
      expect(indentCmd!.canExecute(editor, { nodeId: 'para-1' })).toBe(false);
    });

    it('outdentNode: indentable하고 부모가 있는 노드만 실행 가능', () => {
      const fakeDataStore = {
        getNode: (sid: string) => {
          if (sid === 'para-1') {
            return { sid, stype: 'paragraph', parentId: 'doc' };
          }
          return null;
        },
        isIndentableNode: (sid: string) => sid === 'para-1',
        getActiveSchema: () => ({
          getNodeType: () => null
        })
      };

      const editor = new FakeEditor(fakeDataStore) as any;
      editor.selection = {
        type: 'node',
        nodeId: 'para-1'
      };

      const ext = new IndentExtension();
      ext.onCreate(editor);

      const outdentCmd = editor.commands.get('outdentNode');
      expect(outdentCmd).toBeDefined();

      // indentable하고 부모가 있는 노드
      expect(outdentCmd!.canExecute(editor, { nodeId: 'para-1' })).toBe(true);

      // 부모가 없는 노드
      fakeDataStore.getNode = (sid: string) => {
        if (sid === 'para-1') {
          return { sid, stype: 'paragraph', parentId: null };
        }
        return null;
      };
      expect(outdentCmd!.canExecute(editor, { nodeId: 'para-1' })).toBe(false);
    });
  });
});

