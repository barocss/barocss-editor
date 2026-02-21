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
    insertMathBlock: (tex?: string, engine?: string) => ({
      type: 'insertMathBlock',
      payload: {
        tex: tex ?? '',
        ...(engine != null && { engine })
      }
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

describe('MathBlockExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertMathBlock command', async () => {
    const { MathBlockExtension } = await import('../src/math-block');
    const editor = createFakeEditor();
    const ext = new MathBlockExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertMathBlock')).toBeDefined();
  });

  it('creates math block with empty tex by default', async () => {
    const { MathBlockExtension } = await import('../src/math-block');
    const editor = createFakeEditor();
    const ext = new MathBlockExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertMathBlock');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0]).toEqual([
      { type: 'insertMathBlock', payload: { tex: '', engine: 'katex' } }
    ]);
  });

  it('passes tex and engine from payload', async () => {
    const { MathBlockExtension } = await import('../src/math-block');
    const editor = createFakeEditor();
    const ext = new MathBlockExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertMathBlock');
    await cmd.execute(editor, { tex: 'E=mc^2', engine: 'mathjax' });

    expect(recordedTransactions[0]).toEqual([
      { type: 'insertMathBlock', payload: { tex: 'E=mc^2', engine: 'mathjax' } }
    ]);
  });

  it('uses extension default engine option', async () => {
    const { MathBlockExtension } = await import('../src/math-block');
    const editor = createFakeEditor();
    const ext = new MathBlockExtension({ defaultEngine: 'mathjax' });
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertMathBlock');
    await cmd.execute(editor);

    expect(recordedTransactions[0][0].payload.engine).toBe('mathjax');
  });

  it('does not register commands when disabled', async () => {
    const { MathBlockExtension } = await import('../src/math-block');
    const editor = createFakeEditor();
    const ext = new MathBlockExtension({ enabled: false });
    ext.onCreate(editor);

    expect(editor.__getCommand('insertMathBlock')).toBeUndefined();
  });
});
