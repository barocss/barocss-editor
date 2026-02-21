import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Editor } from '@barocss/editor-core';

const recordedTransactions: any[][] = [];
const commitMock = vi.fn();

vi.mock('@barocss/model', () => {
  return {
    transaction: (_editor: Editor, operations: any[]) => {
      recordedTransactions.push(operations);
      return { commit: commitMock };
    },
    insertComment: (threadId: string) => ({
      type: 'insertComment',
      payload: { threadId }
    })
  };
});

function createFakeEditor(): Editor & { __getCommand: (name: string) => any } {
  const commands: Record<string, any> = {};
  return {
    registerCommand: (cmd: any) => { commands[cmd.name] = cmd; },
    __getCommand(name: string) { return commands[name]; }
  } as any;
}

describe('CommentExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertComment command', async () => {
    const { CommentExtension } = await import('../src/comment');
    const editor = createFakeEditor();
    const ext = new CommentExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertComment')).toBeDefined();
  });

  it('creates comment with provided threadId', async () => {
    const { CommentExtension } = await import('../src/comment');
    const editor = createFakeEditor();
    const ext = new CommentExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertComment');
    await cmd.execute(editor, { threadId: 'thread-abc' });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toEqual([
      { type: 'insertComment', payload: { threadId: 'thread-abc' } }
    ]);
  });

  it('auto-generates threadId when not provided', async () => {
    const { CommentExtension } = await import('../src/comment');
    const editor = createFakeEditor();
    const ext = new CommentExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertComment');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    const payload = recordedTransactions[0][0].payload;
    expect(payload.threadId).toBeDefined();
    expect(typeof payload.threadId).toBe('string');
    expect(payload.threadId.startsWith('comment-')).toBe(true);
  });

  it('uses custom generateId function', async () => {
    const { CommentExtension } = await import('../src/comment');
    const editor = createFakeEditor();
    let counter = 0;
    const ext = new CommentExtension({ generateId: () => `custom-${++counter}` });
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertComment');
    await cmd.execute(editor);

    expect(recordedTransactions[0][0].payload.threadId).toBe('custom-1');
  });

  it('does not register commands when disabled', async () => {
    const { CommentExtension } = await import('../src/comment');
    const editor = createFakeEditor();
    const ext = new CommentExtension({ enabled: false });
    ext.onCreate(editor);

    expect(editor.__getCommand('insertComment')).toBeUndefined();
  });
});
