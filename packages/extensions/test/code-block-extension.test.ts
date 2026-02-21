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
    insertCodeBlock: (language?: string) => ({
      type: 'insertCodeBlock',
      payload: { ...(language != null && { language }) }
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

describe('CodeBlockExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertCodeBlock command', async () => {
    const { CodeBlockExtension } = await import('../src/code-block');
    const editor = createFakeEditor();
    const ext = new CodeBlockExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertCodeBlock')).toBeDefined();
  });

  it('creates code block with default empty language', async () => {
    const { CodeBlockExtension } = await import('../src/code-block');
    const editor = createFakeEditor();
    const ext = new CodeBlockExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCodeBlock');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload).toEqual({ language: '' });
  });

  it('passes language from payload', async () => {
    const { CodeBlockExtension } = await import('../src/code-block');
    const editor = createFakeEditor();
    const ext = new CodeBlockExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCodeBlock');
    await cmd.execute(editor, { language: 'python' });

    expect(recordedTransactions[0][0].payload.language).toBe('python');
  });

  it('uses defaultLanguage from options', async () => {
    const { CodeBlockExtension } = await import('../src/code-block');
    const editor = createFakeEditor();
    const ext = new CodeBlockExtension({ defaultLanguage: 'typescript' });
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertCodeBlock');
    await cmd.execute(editor);

    expect(recordedTransactions[0][0].payload.language).toBe('typescript');
  });
});
