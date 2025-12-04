import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ModelSelection, Editor } from '@barocss/editor-core';
import { CopyPasteExtension } from '../src/copy-paste';

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
    copy: (range: any) => ({ type: 'copy', payload: { range } }),
    paste: (nodes: any[], range: any) => ({ type: 'paste', payload: { data: { nodes }, range } }),
    cut: (range: any) => ({ type: 'cut', payload: { range } })
  };
});

interface RegisteredCommand {
  name: string;
  execute: (editor: any, payload?: any) => any;
  canExecute: (editor: any, payload?: any) => boolean;
}

class FakeEditor {
  public commands = new Map<string, RegisteredCommand>();
  public selection: ModelSelection | null = null;

  registerCommand(cmd: RegisteredCommand) {
    this.commands.set(cmd.name, cmd);
  }

  __getCommand(name: string): RegisteredCommand | undefined {
    return this.commands.get(name);
  }
}

describe('CopyPasteExtension', () => {
  beforeEach(() => {
    recordedTransactions.length = 0;
    commitMock.mockReset();
    commitMock.mockResolvedValue({ success: true });
  });

  it('copy: selection(range) 이 있으면 copy operation 으로 transaction 을 실행한다', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('copy');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 't1',
      startOffset: 0,
      endNodeId: 't1',
      endOffset: 5,
      collapsed: false,
      direction: 'forward'
    };

    editor.selection = selection;

    const result = await cmd!.execute(editor, {});
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      type: 'copy',
      payload: { range: selection }
    });
  });

  it('paste: nodes 와 selection 이 있으면 paste operation 으로 transaction 을 실행한다', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('paste');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 'p1',
      startOffset: 0,
      endNodeId: 'p1',
      endOffset: 0,
      collapsed: true,
      direction: 'forward'
    };

    const nodes = [
      { stype: 'inline-text', text: 'AAA' },
      { stype: 'inline-text', text: 'BBB' }
    ];

    editor.selection = selection;

    const result = await cmd!.execute(editor, { selection, nodes });
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      type: 'paste',
      payload: {
        data: { nodes },
        range: selection
      }
    });
  });

  it('cut: non-collapsed range selection 이 있으면 cut operation 으로 transaction 을 실행한다', async () => {
    const editor = new FakeEditor() as any;
    const ext = new CopyPasteExtension();
    ext.onCreate(editor);

    const cmd = editor.__getCommand('cut');
    expect(cmd).toBeDefined();

    const selection: ModelSelection = {
      type: 'range',
      startNodeId: 't1',
      startOffset: 1,
      endNodeId: 't1',
      endOffset: 4,
      collapsed: false,
      direction: 'forward'
    };

    editor.selection = selection;

    const result = await cmd!.execute(editor, {});
    expect(result).toBe(true);
    expect(recordedTransactions).toHaveLength(1);
    expect(commitMock).toHaveBeenCalledTimes(1);

    const ops = recordedTransactions[0];
    expect(ops).toHaveLength(1);
    expect(ops[0]).toEqual({
      type: 'cut',
      payload: { range: selection }
    });
  });

});

