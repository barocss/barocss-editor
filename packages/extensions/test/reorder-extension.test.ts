import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReorderExtension } from '../src/reorder';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: any, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    reorderChildren: (parentId: string, childIds: string[]) => ({
      type: 'reorderChildren',
      payload: { parentId, childIds }
    })
  };
});

function createFakeEditor(nodes: Record<string, any>) {
  const commands = new Map<string, any>();
  return {
    dataStore: {
      getNode: (id: string) => nodes[id] || null,
    },
    registerCommand(cmd: any) {
      commands.set(cmd.name, cmd);
    },
    __getCommand(name: string) {
      return commands.get(name);
    }
  };
}

describe('ReorderExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('moveBlockToPosition: reorderChildren 에 올바른 childIds 배열을 전달한다', async () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', parentId: null, content: ['a', 'b', 'c', 'd'] },
      a: { sid: 'a', parentId: 'root' },
      b: { sid: 'b', parentId: 'root' },
      c: { sid: 'c', parentId: 'root' },
      d: { sid: 'd', parentId: 'root' },
    };

    const editor = createFakeEditor(nodes);
    const ext = new ReorderExtension();
    (ext as any)._getContentContainer = () => null;
    ext.onCreate(editor as any);

    const cmd = editor.__getCommand('moveBlockToPosition');
    expect(cmd).toBeDefined();

    // Move 'c' (index 2) to index 0 → expected order: [c, a, b, d]
    const result = await cmd!.execute(editor, { blockId: 'c', targetIndex: 0 });
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);

    const op = recordedTransactions[0][0];
    expect(op.type).toBe('reorderChildren');
    expect(op.payload.parentId).toBe('root');
    expect(op.payload.childIds).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moveBlockToPosition: 같은 위치 이동은 no-op', async () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', parentId: null, content: ['a', 'b', 'c'] },
      a: { sid: 'a', parentId: 'root' },
      b: { sid: 'b', parentId: 'root' },
      c: { sid: 'c', parentId: 'root' },
    };

    const editor = createFakeEditor(nodes);
    const ext = new ReorderExtension();
    (ext as any)._getContentContainer = () => null;
    ext.onCreate(editor as any);

    const cmd = editor.__getCommand('moveBlockToPosition');
    const result = await cmd!.execute(editor, { blockId: 'b', targetIndex: 1 });
    expect(result).toBe(false);
    expect(recordedTransactions).toHaveLength(0);
  });

  it('moveBlockToPosition: 존재하지 않는 블록은 false 반환', async () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', parentId: null, content: ['a'] },
      a: { sid: 'a', parentId: 'root' },
    };

    const editor = createFakeEditor(nodes);
    const ext = new ReorderExtension();
    (ext as any)._getContentContainer = () => null;
    ext.onCreate(editor as any);

    const cmd = editor.__getCommand('moveBlockToPosition');
    const result = await cmd!.execute(editor, { blockId: 'nonexistent', targetIndex: 0 });
    expect(result).toBe(false);
  });

  it('moveBlockToPosition: 마지막 위치로 이동', async () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', parentId: null, content: ['a', 'b', 'c'] },
      a: { sid: 'a', parentId: 'root' },
      b: { sid: 'b', parentId: 'root' },
      c: { sid: 'c', parentId: 'root' },
    };

    const editor = createFakeEditor(nodes);
    const ext = new ReorderExtension();
    (ext as any)._getContentContainer = () => null;
    ext.onCreate(editor as any);

    const cmd = editor.__getCommand('moveBlockToPosition');
    // Move 'a' (index 0) to index 2 → expected: [b, c, a]
    const result = await cmd!.execute(editor, { blockId: 'a', targetIndex: 2 });
    expect(result).toBe(true);

    const op = recordedTransactions[0][0];
    expect(op.payload.childIds).toEqual(['b', 'c', 'a']);
  });

  it('moveBlockToPosition: targetIndex 가 범위를 초과하면 끝에 배치', async () => {
    const nodes: Record<string, any> = {
      root: { sid: 'root', parentId: null, content: ['a', 'b', 'c'] },
      a: { sid: 'a', parentId: 'root' },
      b: { sid: 'b', parentId: 'root' },
      c: { sid: 'c', parentId: 'root' },
    };

    const editor = createFakeEditor(nodes);
    const ext = new ReorderExtension();
    (ext as any)._getContentContainer = () => null;
    ext.onCreate(editor as any);

    const cmd = editor.__getCommand('moveBlockToPosition');
    // Move 'a' (index 0) to index 99 → clamped to end: [b, c, a]
    const result = await cmd!.execute(editor, { blockId: 'a', targetIndex: 99 });
    expect(result).toBe(true);

    const op = recordedTransactions[0][0];
    expect(op.payload.childIds).toEqual(['b', 'c', 'a']);
  });
});
