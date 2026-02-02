import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';
import { EmojiExtension } from '../src/emoji';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    control: (_nodeId: string, ops: any[]) => ops,
    splitTextNode: (pos: number) => ({ type: 'splitTextNode', payload: { splitPosition: pos } }),
    addChild: (parentId: string, child: any, position?: number) => ({
      type: 'addChild',
      payload: { parentId, child, position }
    })
  };
});

function createFakeEditor(dataStore: any, schema?: any): Editor & { __getCommand: (name: string) => any } {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => {
      commands[cmd.name] = cmd;
    },
    __getCommand(name: string) {
      return commands[name];
    },
    dataStore,
    getActiveSchema: () => schema
  } as Editor & { __getCommand: (name: string) => any; dataStore: any };
}

describe('EmojiExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('insertEmoji command is registered', () => {
    const editor = createFakeEditor({});
    const ext = new EmojiExtension();
    ext.onCreate(editor);
    const cmd = editor.__getCommand('insertEmoji');
    expect(cmd).toBeDefined();
    expect(cmd.canExecute(editor, { shortcode: ':smile:' })).toBe(true);
    expect(cmd.canExecute(editor, { unicode: '😀' })).toBe(true);
    expect(cmd.canExecute(editor, {})).toBe(false);
    expect(cmd.canExecute(editor)).toBe(false);
  });

  it('insertEmoji canExecute is false when schema has no emoji type', async () => {
    const schema = { getNodeType: () => null };
    const dataStore = {
      getNode: (id: string) => (id === 'text-1' ? { sid: 'text-1', stype: 'inline-text', text: 'Hi', parentId: 'p-1' } : id === 'p-1' ? { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' } : null),
      getActiveSchema: () => schema
    };
    const editor = createFakeEditor(dataStore, schema);
    const ext = new EmojiExtension();
    ext.onCreate(editor);
    const cmd = editor.__getCommand('insertEmoji');
    const result = await cmd.execute(editor, {
      shortcode: ':smile:',
      selection: { type: 'range', startNodeId: 'text-1', endNodeId: 'text-1', startOffset: 1, endOffset: 1 }
    });
    expect(result).toBe(false);
  });

  it('insertEmoji execute builds addChild when schema has emoji', async () => {
    const schema = {
      getNodeType: (stype: string) => (stype === 'emoji' ? { group: 'inline' } : stype === 'paragraph' ? { group: 'block' } : stype === 'inline-text' ? { group: 'inline' } : null)
    };
    const dataStore = {
      getNode: (id: string) => {
        if (id === 'text-1') return { sid: 'text-1', stype: 'inline-text', text: 'Hi', parentId: 'p-1' };
        if (id === 'p-1') return { sid: 'p-1', stype: 'paragraph', content: ['text-1'], parentId: 'doc-1' };
        return null;
      },
      getActiveSchema: () => schema
    };
    const editor = createFakeEditor(dataStore, schema);
    const ext = new EmojiExtension();
    ext.onCreate(editor);
    const cmd = editor.__getCommand('insertEmoji');
    await cmd.execute(editor, {
      unicode: '😀',
      selection: { type: 'range', startNodeId: 'text-1', endNodeId: 'text-1', startOffset: 2, endOffset: 2 }
    });
    expect(recordedTransactions.length).toBeGreaterThanOrEqual(1);
    const ops = recordedTransactions.flat();
    const addChildOp = ops.find((o: any) => o.type === 'addChild');
    expect(addChildOp).toBeDefined();
    expect(addChildOp.payload.child.stype).toBe('emoji');
    expect(addChildOp.payload.child.attributes?.unicode).toBe('😀');
  });
});
