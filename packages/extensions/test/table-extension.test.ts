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
    insertTable: (rows?: number, cols?: number) => ({
      type: 'insertTable',
      payload: { rows: rows ?? 3, cols: cols ?? 3 }
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

describe('TableExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('registers insertTable command', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = createFakeEditor();
    const ext = new TableExtension();
    ext.onCreate(editor);

    expect(editor.__getCommand('insertTable')).toBeDefined();
  });

  it('creates 3x3 table by default', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = createFakeEditor();
    const ext = new TableExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertTable');
    await cmd.execute(editor);

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(recordedTransactions[0][0].payload).toEqual({ rows: 3, cols: 3 });
  });

  it('passes custom rows and cols', async () => {
    const { TableExtension } = await import('../src/table');
    const editor = createFakeEditor();
    const ext = new TableExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('insertTable');
    await cmd.execute(editor, { rows: 5, cols: 4 });

    expect(recordedTransactions[0][0].payload).toEqual({ rows: 5, cols: 4 });
  });
});
